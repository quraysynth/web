/**
 * Transport layer: HTTP + WebSerial request/response + autosave + sensor polling.
 */
(function (global) {
    'use strict';

    let boundApp = null;

    let serialPort = null;
    let serialReader = null;
    let serialConnected = false;
    let serialRequestId = 0;
    let pendingSerialRequests = new Map();

    const SERIAL_CHUNK_SIZE = 100;
    let serialOutBuf = new Uint8Array(0);

    /** Ring-style log of serial lines (last 10 min by timestamp). */
    const COMM_LOG_WINDOW_MS = 10 * 60 * 1000;
    const COMM_LOG_COMPACT_THRESHOLD = 50000;
    let commLog = [];
    let commLogStart = 0;

    function pruneCommLogNow() {
        const cutoff = Date.now() - COMM_LOG_WINDOW_MS;
        while (commLogStart < commLog.length && commLog[commLogStart].t < cutoff) {
            commLogStart++;
        }
        if (commLogStart >= COMM_LOG_COMPACT_THRESHOLD) {
            commLog = commLog.slice(commLogStart);
            commLogStart = 0;
        }
    }

    function resetSerialCommLog() {
        commLog = [];
        commLogStart = 0;
    }

    function appendSerialCommLog(direction, text) {
        commLog.push({
            t: Date.now(),
            direction: direction === 'out' ? 'out' : 'in',
            text: String(text),
        });
        pruneCommLogNow();
    }

    function downloadDeviceCommLog() {
        pruneCommLogNow();
        const cutoff = Date.now() - COMM_LOG_WINDOW_MS;
        const rows = [];
        for (let i = commLogStart; i < commLog.length; i++) {
            const e = commLog[i];
            if (e.t < cutoff) continue;
            const iso = new Date(e.t).toISOString();
            const tag = e.direction === 'out' ? '[→ to device]' : '[← from device]';
            rows.push(`${iso} ${tag} ${e.text}`);
        }
        const header = [
            '# Quray editor — serial I/O log',
            '# Window: lines with timestamps within the last 10 minutes (at download time)',
            '#',
        ].join('\n');
        const body = rows.length > 0 ? rows.join('\n') : '(no lines in this window)';
        const out = `${header}\n${body}\n`;
        const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `quray-serial-io-${stamp}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        pruneCommLogNow();
    }

    function normalizeDevicePathForCompare(url) {
        const s = String(url || '').trim();
        if (!s) return '';
        const noHash = s.split('#')[0];
        const noQuery = noHash.split('?')[0];
        return noQuery.replace(/^\/+/, '').toLowerCase();
    }

    /** Exclude high-frequency polling endpoint from transfer status indicator. */
    function shouldTrackDeviceRequest(url) {
        return normalizeDevicePathForCompare(url) !== 'sensor_data';
    }

    function updateDeviceIoInFlight(delta) {
        if (!boundApp) return;
        const cur = Number(boundApp.deviceIoInFlight) || 0;
        const next = cur + delta;
        boundApp.deviceIoInFlight = next > 0 ? next : 0;
    }

    function bindApp(app) {
        boundApp = app;
        if (boundApp) {
            boundApp.serialConnected = serialConnected;
        }
    }

    function serialWrite(str) {
        const encoded = new TextEncoder().encode(str);
        const newBuf = new Uint8Array(serialOutBuf.length + encoded.length);
        newBuf.set(serialOutBuf);
        newBuf.set(encoded, serialOutBuf.length);
        serialOutBuf = newBuf;
        return Promise.resolve();
    }

    function sendNextChunk() {
        if (serialOutBuf.length === 0 || !serialPort?.writable) return;
        const chunk = serialOutBuf.slice(0, SERIAL_CHUNK_SIZE);
        serialOutBuf = serialOutBuf.slice(SERIAL_CHUNK_SIZE);
        const writer = serialPort.writable.getWriter();
        writer.write(chunk).then(() => writer.releaseLock()).catch(() => writer.releaseLock());
    }

    function setSerialConnected(connected) {
        serialConnected = !!connected;
        if (boundApp) {
            boundApp.serialConnected = serialConnected;
        }
    }

    /** Serial protocol matches firmware routes (leading /). Browser fetch uses url as-is (relative to the page). */
    function toDevicePath(url) {
        const s = String(url || '').trim();
        if (!s) return '/';
        if (/^https?:\/\//i.test(s)) return s;
        return s.startsWith('/') ? s : '/' + s;
    }

    function apiFetch(url, options = {}) {
        const devicePath = toDevicePath(url);
        const track = shouldTrackDeviceRequest(devicePath);

        if (serialConnected) {
            const method = String(options.method || 'GET').toUpperCase();
            return new Promise((resolve, reject) => {
                let done = false;
                const finalize = () => {
                    if (done) return;
                    done = true;
                    if (track) updateDeviceIoInFlight(-1);
                };
                const id = ++serialRequestId;
                const req = { m: method, id, u: devicePath };

                if (options.body && method === 'POST') {
                    if (devicePath.startsWith('/presets/')) {
                        req.b = options.body;
                    } else {
                        try {
                            req.b = jsyaml.load(options.body);
                        } catch (_e) {
                            try {
                                req.b = JSON.parse(options.body);
                            } catch (_e2) {
                                req.b = options.body;
                            }
                        }
                    }
                }

                const reqStr = JSON.stringify(req);
                if (track) updateDeviceIoInFlight(1);
                pendingSerialRequests.set(id, (response) => {
                    finalize();
                    resolve(response);
                });
                appendSerialCommLog('out', reqStr);
                serialWrite(reqStr + '\n');

                const txTimeMs = Math.ceil(reqStr.length / SERIAL_CHUNK_SIZE) * 60;
                const timeoutMs = txTimeMs + (method === 'POST' ? 3000 : 2000);
                setTimeout(() => {
                    if (pendingSerialRequests.has(id)) {
                        pendingSerialRequests.delete(id);
                        finalize();
                        reject(new Error('Serial request timeout for ' + devicePath));
                    }
                }, timeoutMs);
            });
        }

        /* Иначе браузер может отдать старый ответ из HTTP-кэша; curl кэш не использует. */
        if (track) updateDeviceIoInFlight(1);
        return fetch(url, {
            ...options,
            cache: options.cache !== undefined ? options.cache : 'no-store',
        }).finally(() => {
            if (track) updateDeviceIoInFlight(-1);
        });
    }

    /** @param {object} app Alpine store `app` (must have autosaveEnabled) */
    function disableAutosaveIf501(response, url, app) {
        if (response && response.status === 501) {
            app.autosaveEnabled = false;
            console.error(`Autosave disabled: server returned 501 for ${url}`);
            return true;
        }
        return false;
    }

    function parsePlainPresetsListText(text) {
        return text
            .split(/\r?\n/)
            .map((line) => line.replace(/#.*$/, '').trim())
            .filter(Boolean)
            .map((line) => {
                const base = line.split(/[\\/]/).pop() || line;
                return base;
            })
            .filter((name) => name.toLowerCase().endsWith('.yml'));
    }

    function parsePresetsListFromResponseText(presetsListText) {
        let presetFiles = [];
        const presetsListTrimmed = (presetsListText || '').trimStart();

        try {
            const parsed = JSON.parse(presetsListText);
            if (Array.isArray(parsed)) {
                presetFiles = parsed;
            } else {
                throw new Error('Expected JSON array from presets');
            }
        } catch (_jsonErr) {
            const lower = presetsListTrimmed.toLowerCase();
            if (lower.startsWith('<!doctype html') || lower.startsWith('<html')) {
                const doc = new DOMParser().parseFromString(presetsListText, 'text/html');
                presetFiles = Array.from(doc.querySelectorAll('a[href]'))
                    .map((a) => a.getAttribute('href') || '')
                    .filter((href) => href && href.toLowerCase().endsWith('.yml'))
                    .map((href) => {
                        const clean = href.split('#')[0].split('?')[0];
                        return clean.startsWith('/') ? clean.split('/').pop() : clean;
                    })
                    .filter(Boolean);
            } else {
                presetFiles = parsePlainPresetsListText(presetsListText || '');
            }
        }
        return presetFiles;
    }

    /**
     * Статика: нет листинга каталога → 404. Цепочка: presets (API устройства), presets/, presets.list.
     */
    async function fetchPresetsListText(apiFetch) {
        let r = await apiFetch('presets');
        if (r.ok) {
            return await r.text();
        }
        if (r.status === 404) {
            r = await apiFetch('presets/');
            if (r.ok) {
                return await r.text();
            }
            if (r.status === 404) {
                r = await apiFetch('presets.list');
                if (r.ok) {
                    return await r.text();
                }
            }
        }
        const st = r ? r.status : 'no response';
        throw new Error(`GET presets index failed: ${st}`);
    }

    function autosaveNow() {
        return {
            t: typeof performance !== 'undefined' ? performance.now() : 0,
            wall: new Date().toISOString(),
        };
    }

    function presetAutosavePending(app, name) {
        const rev = app.autosaveRev.presets[name] || 0;
        const ack = app.autosaveAck.presets[name] || 0;
        return rev > ack;
    }

    async function flushDirtyFilesToServer(app) {
        if (!app.autosaveEnabled) return;

        const rev = app.autosaveRev;
        const ack = app.autosaveAck;
        const presetDirtyNames = Object.keys(app.presetsData || {}).filter((n) =>
            presetAutosavePending(app, n)
        );
        const hasCalib = rev.calib > ack.calib;
        const hasConfig = rev.config > ack.config;
        if (hasCalib || hasConfig || presetDirtyNames.length > 0) {
            const { t, wall } = autosaveNow();
            console.log('[autosave] timer dequeue', {
                calib: hasCalib ? { rev: rev.calib, ack: ack.calib } : null,
                config: hasConfig ? { rev: rev.config, ack: ack.config } : null,
                presets: presetDirtyNames.map((n) => ({
                    name: n,
                    rev: rev.presets[n] || 0,
                    ack: ack.presets[n] || 0,
                })),
                t,
                wall,
            });
        }

        const filesToUpdate = [];
        if (rev.calib > ack.calib) {
            filesToUpdate.push({
                type: 'calib',
                sendRev: rev.calib,
                data: app.calibData,
            });
        }
        if (rev.config > ack.config) {
            filesToUpdate.push({
                type: 'config',
                sendRev: rev.config,
                data: app.configData,
            });
        }
        for (const presetName of Object.keys(app.presetsData || {})) {
            if (!presetAutosavePending(app, presetName)) continue;
            filesToUpdate.push({
                type: 'preset',
                name: presetName,
                sendRev: rev.presets[presetName],
                data: app.presetsData[presetName],
            });
        }

        const presetFiles = filesToUpdate.filter((f) => f.type === 'preset');
        const otherFiles = filesToUpdate.filter((f) => f.type !== 'preset');

        for (const file of presetFiles) {
            if (!app.autosaveEnabled) break;
            const url = `presets/${file.name}.yml`;
            const content = jsyaml.dump(file.data, { lineWidth: -1 });
            try {
                const response = await apiFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/yaml' },
                    body: content,
                });
                if (disableAutosaveIf501(response, url, app)) break;
                if (response && response.ok) {
                    const curRev = app.autosaveRev.presets[file.name] || 0;
                    if (curRev === file.sendRev) {
                        app.autosaveAck.presets[file.name] = file.sendRev;
                    }
                    const ok = autosaveNow();
                    console.log('[autosave] device ok', {
                        url,
                        status: response.status,
                        sendRev: file.sendRev,
                        currentRev: curRev,
                        acked: curRev === file.sendRev,
                        t: ok.t,
                        wall: ok.wall,
                    });
                } else {
                    console.error(`Failed ${url}:`, response ? response.status : 'no response');
                }
            } catch (e) {
                console.error(`Error ${url}:`, e);
            }
        }

        const otherPromises = otherFiles.map((file) => {
            if (!app.autosaveEnabled) return Promise.resolve();
            let url;
            let content;
            if (file.type === 'calib') {
                url = 'calib.yml';
                content = jsyaml.dump(file.data, { lineWidth: -1 });
            } else if (file.type === 'config') {
                url = 'config.yml';
                content = jsyaml.dump(file.data, { lineWidth: -1 });
            } else {
                return Promise.resolve();
            }
            return apiFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/yaml' },
                body: content,
            })
                .then((r) => {
                    if (disableAutosaveIf501(r, url, app)) return;
                    if (r && r.ok) {
                        const sendRev = file.sendRev;
                        if (file.type === 'calib') {
                            if (app.autosaveRev.calib === sendRev) {
                                app.autosaveAck.calib = sendRev;
                            }
                        } else if (file.type === 'config') {
                            if (app.autosaveRev.config === sendRev) {
                                app.autosaveAck.config = sendRev;
                            }
                        }
                        const ok = autosaveNow();
                        console.log('[autosave] device ok', {
                            url,
                            status: r.status,
                            type: file.type,
                            sendRev,
                            currentRev:
                                file.type === 'calib'
                                    ? app.autosaveRev.calib
                                    : file.type === 'config'
                                      ? app.autosaveRev.config
                                      : undefined,
                            acked:
                                file.type === 'calib'
                                    ? app.autosaveRev.calib === sendRev
                                    : file.type === 'config'
                                      ? app.autosaveRev.config === sendRev
                                      : undefined,
                            t: ok.t,
                            wall: ok.wall,
                        });
                    }
                })
                .catch((e) => console.error(`Error ${url}:`, e));
        });
        await Promise.all(otherPromises);
    }

    function startDirtyCheckTimer(app) {
        setTimeout(async () => {
            if (!app.autosaveEnabled) {
                startDirtyCheckTimer(app);
                return;
            }
            await flushDirtyFilesToServer(app);
            startDirtyCheckTimer(app);
        }, 1000);
    }

    function startSensorDataPolling(app) {
        const poll = async () => {
            if (!serialConnected) {
                try {
                    const response = await apiFetch('sensor_data');
                    if (response.ok) {
                        const data = await response.json();
                        if (data.signal_level && data.distance) {
                            app.sensorData.signal_level = data.signal_level;
                            app.sensorData.distance = data.distance;
                        }
                        if (data.p && Array.isArray(data.p)) {
                            app.devicePoints = data.p.map((p) => ({ x: p.x, y: p.y }));
                        } else if (!serialConnected) {
                            app.devicePoints = [];
                        }
                        if (data.cal !== undefined && typeof app.handleDeviceCalibStatus === 'function') {
                            app.handleDeviceCalibStatus(data.cal);
                        }
                    }
                } catch (e) {
                    console.error('Error fetching sensor data:', e);
                }
            }
            setTimeout(poll, 100);
        };
        poll();
    }

    /**
     * Строка с датчиками: либо чистый JSON, либо префикс `1,2,...,N,... {json}` (первый `{` — начало JSON).
     */
    function parseSerialJsonLine(trimmed) {
        const brace = trimmed.indexOf('{');
        const jsonStr = brace >= 0 ? trimmed.slice(brace) : trimmed;
        return JSON.parse(jsonStr);
    }

    async function readSerialLoop() {
        const decoder = new TextDecoderStream();
        serialPort.readable.pipeTo(decoder.writable).catch(() => {});
        const inputStream = decoder.readable;
        serialReader = inputStream.getReader();

        let lineBuf = '';
        try {
            while (serialConnected) {
                const { value, done } = await serialReader.read();
                if (done) break;
                if (!value) continue;

                lineBuf += value;
                const lines = lineBuf.split('\n');
                lineBuf = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    appendSerialCommLog('in', trimmed);
                    try {
                        const data = parseSerialJsonLine(trimmed);
                        if (data.d && data.s) {
                            if (boundApp) {
                                boundApp.sensorData.distance = data.d;
                                boundApp.sensorData.signal_level = data.s;
                                if (data.p && Array.isArray(data.p)) {
                                    boundApp.devicePoints = data.p.map((p) => ({ x: p.x, y: p.y }));
                                } else {
                                    boundApp.devicePoints = [];
                                }
                                if (data.cal !== undefined && typeof boundApp.handleDeviceCalibStatus === 'function') {
                                    boundApp.handleDeviceCalibStatus(data.cal);
                                }
                            }
                            sendNextChunk();
                        } else if (data.id !== undefined && data.c !== undefined) {
                            const cb = pendingSerialRequests.get(data.id);
                            if (cb) {
                                pendingSerialRequests.delete(data.id);
                                const bodyStr = data.b !== undefined ? JSON.stringify(data.b) : '';
                                cb({
                                    ok: data.c >= 200 && data.c < 300,
                                    status: data.c,
                                    text: () => Promise.resolve(bodyStr),
                                    json: () => Promise.resolve(data.b),
                                });
                            }
                        }
                    } catch (_e) {
                        // ignore parse errors
                    }
                }
            }
        } catch (err) {
            if (serialConnected) {
                console.error('Serial read error:', err);
            }
        } finally {
            if (serialReader) {
                serialReader.releaseLock();
                serialReader = null;
            }
        }
    }

    async function connectSerial() {
        if (!('serial' in navigator)) {
            throw new Error('WebSerial is not supported in this browser. Use Chrome or Edge.');
        }

        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 921600 });

        setSerialConnected(true);
        resetSerialCommLog();
        readSerialLoop();

        if (boundApp?.loadAllFiles) {
            await boundApp.loadAllFiles();
        }
    }

    async function disconnectSerial() {
        setSerialConnected(false);

        for (const [id, cb] of pendingSerialRequests.entries()) {
            pendingSerialRequests.delete(id);
            cb({ ok: false, status: 499, text: () => Promise.resolve('Disconnected'), json: () => Promise.resolve({}) });
        }

        try {
            if (serialReader) {
                await serialReader.cancel();
                serialReader = null;
            }
            if (serialPort) {
                await serialPort.close();
                serialPort = null;
            }
        } catch (err) {
            console.error('Serial disconnect error:', err);
        }
    }

    async function toggleSerial() {
        if (serialConnected) {
            await disconnectSerial();
        } else {
            await connectSerial();
        }
    }

    function isSerialConnected() {
        return serialConnected;
    }

    global.qurayTransport = {
        bindApp,
        apiFetch,
        disableAutosaveIf501,
        parsePresetsListFromResponseText,
        fetchPresetsListText,
        flushDirtyFilesToServer,
        startDirtyCheckTimer,
        startSensorDataPolling,
        toggleSerial,
        connectSerial,
        disconnectSerial,
        isSerialConnected,
        downloadDeviceCommLog,
    };
})(typeof window !== 'undefined' ? window : globalThis);
