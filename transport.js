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

    function normalizeUrl(url) {
        let normalizedUrl = url;
        if (!normalizedUrl.startsWith('/')) {
            normalizedUrl = '/' + normalizedUrl;
        }
        return normalizedUrl;
    }

    function apiFetch(url, options = {}) {
        const normalizedUrl = normalizeUrl(url);

        if (serialConnected) {
            const method = String(options.method || 'GET').toUpperCase();
            return new Promise((resolve, reject) => {
                const id = ++serialRequestId;
                const req = { m: method, id, u: normalizedUrl };

                if (options.body && method === 'POST') {
                    if (normalizedUrl.startsWith('/presets/')) {
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
                pendingSerialRequests.set(id, resolve);
                serialWrite(reqStr + '\n');

                const txTimeMs = Math.ceil(reqStr.length / SERIAL_CHUNK_SIZE) * 60;
                const timeoutMs = txTimeMs + (method === 'POST' ? 3000 : 2000);
                setTimeout(() => {
                    if (pendingSerialRequests.has(id)) {
                        pendingSerialRequests.delete(id);
                        reject(new Error('Serial request timeout for ' + normalizedUrl));
                    }
                }, timeoutMs);
            });
        }

        /* Иначе браузер может отдать старый ответ из HTTP-кэша; curl кэш не использует. */
        return fetch(normalizedUrl, {
            ...options,
            cache: options.cache !== undefined ? options.cache : 'no-store',
        });
    }

    /** @param {object} app Alpine store `app` (must have autosaveEnabled) */
    function disableAutosaveIf501(response, url, app) {
        if (response && response.status === 501) {
            app.autosaveEnabled = false;
            console.error(`Autosave disabled: server returned 501 for ${url}`);
            if (app && typeof app.showStatus === 'function') {
                app.showStatus(
                    'Autosave disabled: server does not support POST (501). Use "Download ZIP" to export.',
                    'error'
                );
            } else {
                console.warn('Autosave disabled: server does not support POST (501). Use "Download ZIP" to export.');
            }
            return true;
        }
        return false;
    }

    function parsePresetsListFromResponseText(presetsListText) {
        let presetFiles = [];
        const presetsListTrimmed = (presetsListText || '').trimStart();

        try {
            const parsed = JSON.parse(presetsListText);
            if (Array.isArray(parsed)) {
                presetFiles = parsed;
            } else {
                throw new Error('Expected JSON array from /presets');
            }
        } catch (_jsonErr) {
            if (presetsListTrimmed.toLowerCase().startsWith('<!doctype html')) {
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
                throw new Error('Unsupported /presets response (expected JSON array or HTML directory listing)');
            }
        }
        return presetFiles;
    }

    async function flushDirtyFilesToServer(app) {
        if (!app.autosaveEnabled) return;

        const filesToUpdate = [];
        if (app.dirtyFlags.calib) {
            filesToUpdate.push({ type: 'calib', data: app.calibData });
            app.dirtyFlags.calib = false;
        }
        if (app.dirtyFlags.config) {
            filesToUpdate.push({ type: 'config', data: app.configData });
            app.dirtyFlags.config = false;
        }
        for (const [presetName, isDirty] of Object.entries(app.dirtyFlags.presets)) {
            if (isDirty && app.presetsData[presetName]) {
                filesToUpdate.push({ type: 'preset', name: presetName, data: app.presetsData[presetName] });
            }
        }

        const presetFiles = filesToUpdate.filter((f) => f.type === 'preset');
        const otherFiles = filesToUpdate.filter((f) => f.type !== 'preset');

        for (const file of presetFiles) {
            if (!app.autosaveEnabled) break;
            const url = `/presets/${file.name}.yml`;
            const content = jsyaml.dump(file.data, { lineWidth: -1 });
            try {
                const response = await apiFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/yaml' },
                    body: content,
                });
                if (disableAutosaveIf501(response, url, app)) break;
                if (response && response.ok) {
                    app.dirtyFlags.presets[file.name] = false;
                    console.log(`Updated ${url}`);
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
                url = '/calib.yml';
                content = jsyaml.dump(file.data, { lineWidth: -1 });
            } else if (file.type === 'config') {
                url = '/config.yml';
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
                    if (r && r.ok) console.log(`Updated ${url}`);
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
                    const response = await apiFetch('/sensor_data');
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
                    try {
                        const data = JSON.parse(trimmed);
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
        flushDirtyFilesToServer,
        startDirtyCheckTimer,
        startSensorDataPolling,
        toggleSerial,
        connectSerial,
        disconnectSerial,
        isSerialConnected,
    };
})(typeof window !== 'undefined' ? window : globalThis);
