/**
 * Preset/gesture navigation, YAML load, transport hooks.
 */

function buildCalibDataFromLoaded(loadedCalib, HW) {
    let calibData;
    if (Array.isArray(loadedCalib)) {
        calibData = {
            min_signal: [...loadedCalib],
            max_distance: Array(HW).fill(1000),
            manual_max_distance: 1200,
        };
    } else {
        calibData = {
            min_signal: loadedCalib.min_signal || Array(HW).fill(0),
            max_distance: loadedCalib.max_distance || Array(HW).fill(1000),
            manual_max_distance: loadedCalib.manual_max_distance || 1200,
        };
    }
    while (calibData.min_signal.length < HW) calibData.min_signal.push(0);
    while (calibData.max_distance.length < HW) calibData.max_distance.push(1000);
    calibData.min_signal = calibData.min_signal.slice(0, HW);
    calibData.max_distance = calibData.max_distance.slice(0, HW);
    return calibData;
}

function configWithUiDefaults(cfg) {
    const o = { ...(cfg || {}) };
    if (!o.point_type) o.point_type = 'cloud';
    if (!o.color1) o.color1 = '#FE3A86';
    if (!o.color2) o.color2 = '#7742ff';
    return o;
}

function presetCanonicalYaml(preset) {
    const p = JSON.parse(JSON.stringify(preset || { gestures: [] }));
    normalizePresetData(p);
    return jsyaml.dump(p, { lineWidth: -1 });
}

function storePresetNamesSorted(app) {
    const keys = Object.keys(app.presetsData || {});
    keys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return keys;
}

/** Human-readable multiline log for saveToDevice diff (avoids unreadable object dumps). */
function logSaveToDevicePlan(calibChanged, configChanged, presetAdd, presetUpdate, presetUnchanged, presetRemove) {
    const fmt = (xs) => (xs.length ? xs.join(', ') : '—');
    const block = [
        'calib.yml     ' + (calibChanged ? '→ upload (differs from device)' : 'unchanged'),
        'config.yml    ' + (configChanged ? '→ upload (differs from device)' : 'unchanged'),
        'presets',
        '  new (missing on device)   ' + fmt(presetAdd),
        '  update (content differs)  ' + fmt(presetUpdate),
        '  unchanged                 ' + fmt(presetUnchanged),
        '  delete (only on device)   ' + fmt(presetRemove),
    ].join('\n');
    console.log(`[saveToDevice] comparison (plan before sync)\n${block}`);
}

/**
 * After presetsData / presetNames / configData are set, pick current preset and gesture indices.
 * @param {object} [options]
 * @param {boolean} [options.fromDevice] — load from device: edit `default` if present, else first; sync config.preset
 */
function alignPresetSelectionAfterLoad(app, previousPresetName, previousGestureIndices, options) {
    const presetNames = app.presetNames || [];
    const fromDevice = options && options.fromDevice === true;

    if (fromDevice) {
        let nextName = '';
        if (presetNames.includes('default')) {
            nextName = 'default';
        } else if (presetNames.length > 0) {
            nextName = presetNames[0];
        }
        app.currentPresetName = nextName;
        app.configData.preset = nextName || '';
        const gestures = nextName ? app.presetsData[nextName]?.gestures : null;
        const gCount = Array.isArray(gestures) ? gestures.length : 0;
        app.selectedGestureIndices = gCount === 0 ? [] : [0];
        app.undoStack = [];
        app.redoStack = [];
        return;
    }

    const cfgPreset =
        app.configData &&
        app.configData.preset != null &&
        String(app.configData.preset).trim() !== ''
            ? String(app.configData.preset).trim()
            : '';

    let nextName = '';
    if (cfgPreset && presetNames.includes(cfgPreset)) {
        nextName = cfgPreset;
    } else if (previousPresetName && presetNames.includes(previousPresetName)) {
        nextName = previousPresetName;
    } else if (presetNames.includes('default')) {
        nextName = 'default';
    } else if (presetNames.length > 0) {
        nextName = presetNames[0];
    }

    app.currentPresetName = nextName;
    const gestures = nextName ? app.presetsData[nextName]?.gestures : null;
    const gCount = Array.isArray(gestures) ? gestures.length : 0;
    if (gCount === 0) {
        app.selectedGestureIndices = [];
    } else if (nextName === previousPresetName) {
        const valid = previousGestureIndices.filter(
            (i) => typeof i === 'number' && i >= 0 && i < gCount
        );
        app.selectedGestureIndices = valid.length > 0 ? valid : [0];
    } else {
        app.selectedGestureIndices = [0];
    }

    app.undoStack = [];
    app.redoStack = [];
}

function pickYamlFileText() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.yml,.yaml,application/x-yaml,text/yaml,text/plain';
        input.style.cssText = 'position:fixed;left:-9999px;width:0;height:0;opacity:0';
        const done = () => {
            try {
                document.body.removeChild(input);
            } catch (_e) {
                /* ignore */
            }
        };
        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            done();
            if (!f) {
                resolve(null);
                return;
            }
            f.text()
                .then(resolve)
                .catch(reject);
        });
        document.body.appendChild(input);
        input.click();
    });
}

function parseDeviceExportBundle(text, HW) {
    const root = jsyaml.load(text);
    if (!root || typeof root !== 'object') {
        throw new Error('Invalid YAML: expected a mapping at root');
    }
    if (root.quray_export_version != null && root.quray_export_version !== 1) {
        console.warn('[import] unknown quray_export_version, trying anyway:', root.quray_export_version);
    }
    if (!root.presets || typeof root.presets !== 'object' || Array.isArray(root.presets)) {
        throw new Error('Invalid bundle: missing or invalid "presets" object');
    }
    const calibData = buildCalibDataFromLoaded(root.calib != null ? root.calib : {}, HW);
    const loadedConfig = root.config != null && typeof root.config === 'object' ? root.config : {};
    const configData = { ...loadedConfig };
    if (!configData.point_type) configData.point_type = 'cloud';
    if (!configData.color1) configData.color1 = '#FE3A86';
    if (!configData.color2) configData.color2 = '#7742ff';

    const presetsData = {};
    const presetNames = [];
    for (const name of Object.keys(root.presets)) {
        const raw = root.presets[name];
        const preset = raw != null && typeof raw === 'object' && !Array.isArray(raw) ? raw : { gestures: [] };
        if (!Array.isArray(preset.gestures)) preset.gestures = [];
        presetsData[name] = preset;
        normalizePresetData(presetsData[name], { fillMissingScale: true });
        presetNames.push(name);
    }
    presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return { calibData, configData, presetsData, presetNames };
}

/** After full load from device: store matches device, no pending autosave. */
function resetAutosaveAfterFullLoad(app) {
    const p = {};
    for (const n of Object.keys(app.presetsData || {})) {
        p[n] = 0;
    }
    app.autosaveRev = { calib: 0, config: 0, presets: { ...p } };
    app.autosaveAck = { calib: 0, config: 0, presets: { ...p } };
}

function syncAutosaveAckToRev(app) {
    app.autosaveAck.calib = app.autosaveRev.calib;
    app.autosaveAck.config = app.autosaveRev.config;
    app.autosaveAck.presets = { ...app.autosaveRev.presets };
}

function storeLoadExportNavigationMethods() {
    return {
        markDirty(fileType, presetName = null) {
            const wall = new Date().toISOString();
            const t = typeof performance !== 'undefined' ? performance.now() : 0;
            if (fileType === 'calib') {
                this.autosaveRev.calib += 1;
                console.log('[autosave] dirty set', {
                    scope: 'calib',
                    rev: this.autosaveRev.calib,
                    ack: this.autosaveAck.calib,
                    t,
                    wall,
                });
            } else if (fileType === 'config') {
                this.autosaveRev.config += 1;
                console.log('[autosave] dirty set', {
                    scope: 'config',
                    rev: this.autosaveRev.config,
                    ack: this.autosaveAck.config,
                    t,
                    wall,
                });
            } else if (fileType === 'preset' && presetName) {
                const prev = this.autosaveRev.presets[presetName] || 0;
                this.autosaveRev.presets[presetName] = prev + 1;
                console.log('[autosave] dirty set', {
                    scope: 'preset',
                    preset: presetName,
                    rev: this.autosaveRev.presets[presetName],
                    ack: this.autosaveAck.presets[presetName] || 0,
                    t,
                    wall,
                });
            }
        },

        currentPreset() {
            const name = this.currentPresetName;
            if (!name || !this.presetsData[name]) return null;
            return this.presetsData[name];
        },

        currentGesture() {
            const preset = this.currentPreset();
            if (!preset || !preset.gestures || preset.gestures.length === 0) return null;
            const sel = this.selectedGestureIndices;
            if (!sel || sel.length !== 1) return null;
            const g = preset.gestures[sel[0]];
            return g || null;
        },

        ensureGestureMidiCv(gesture) {
            if (!gesture.midi || !Array.isArray(gesture.midi)) gesture.midi = [];
            if (!gesture.cv || !Array.isArray(gesture.cv)) gesture.cv = [];
        },

        selectPreset(name) {
            this.currentPresetName = name || '';
            this.selectedGestureIndices = [0];
            this.undoStack = [];
            this.redoStack = [];
        },


        async toggleSerial() {
            try {
                await qurayTransport.toggleSerial();
            } catch (error) {
                console.error('Serial toggle error:', error);
            }
        },

        startDirtyCheckTimer() {
            qurayTransport.startDirtyCheckTimer(this);
        },

        startSensorDataPolling() {
            qurayTransport.startSensorDataPolling(this);
        },

        /**
         * Re-download calib, config, and all presets from the device (HTTP or serial tunnel).
         * Same as initial load: store is aligned with device (see loadAllFiles).
         */
        async reloadFromDevice() {
            await this.loadAllFiles();
        },

        /**
         * Fetch device files, diff against store, then upload changed/new, delete orphans.
         * Logs a comparison summary to the console.
         */
        async saveToDevice() {
            const HW = this.HW_CH_COUNT;
            const apiFetch = qurayTransport.apiFetch;
            const parseList = qurayTransport.parsePresetsListFromResponseText;

            try {
                const calibResp = await apiFetch('/calib.yml');
                if (!calibResp.ok) throw new Error(`GET /calib.yml failed: ${calibResp.status}`);
                const calibText = await calibResp.text();
                const deviceCalib = buildCalibDataFromLoaded(jsyaml.load(calibText) || {}, HW);
                const storeCalibYaml = jsyaml.dump(this.calibData, { lineWidth: -1 });
                const deviceCalibYaml = jsyaml.dump(deviceCalib, { lineWidth: -1 });
                const calibChanged = storeCalibYaml !== deviceCalibYaml;

                const configResp = await apiFetch('/config.yml');
                if (!configResp.ok) throw new Error(`GET /config.yml failed: ${configResp.status}`);
                const configText = await configResp.text();
                const deviceConfig = configWithUiDefaults(jsyaml.load(configText) || {});
                const storeConfigYaml = jsyaml.dump(this.configData, { lineWidth: -1 });
                const deviceConfigYaml = jsyaml.dump(deviceConfig, { lineWidth: -1 });
                const configChanged = storeConfigYaml !== deviceConfigYaml;

                const presetsListResp = await apiFetch('/presets');
                if (!presetsListResp.ok) throw new Error(`GET /presets failed: ${presetsListResp.status}`);
                const presetsListText = await presetsListResp.text();
                const presetFiles = parseList(presetsListText);

                const devicePresetNames = new Set(
                    presetFiles.map((f) => String(f).replace(/\.yml$/i, '').replace(/^.*\//, ''))
                );
                const storeNames = storePresetNamesSorted(this);
                const storeNameSet = new Set(storeNames);

                const devicePresetYaml = {};
                for (const file of presetFiles) {
                    const base = String(file).replace(/\.yml$/i, '').replace(/^.*\//, '');
                    const pr = await apiFetch(`/presets/${file}`);
                    if (!pr.ok) throw new Error(`GET /presets/${file} failed: ${pr.status}`);
                    const raw = await pr.text();
                    const parsed = jsyaml.load(raw) || { gestures: [] };
                    devicePresetYaml[base] = presetCanonicalYaml(parsed);
                }

                const presetAdd = [];
                const presetUpdate = [];
                const presetUnchanged = [];
                for (const name of storeNames) {
                    const storeYaml = presetCanonicalYaml(this.presetsData[name]);
                    if (!devicePresetNames.has(name)) {
                        presetAdd.push(name);
                    } else if (storeYaml !== devicePresetYaml[name]) {
                        presetUpdate.push(name);
                    } else {
                        presetUnchanged.push(name);
                    }
                }

                const presetRemove = [...devicePresetNames].filter((n) => !storeNameSet.has(n));
                presetRemove.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

                logSaveToDevicePlan(
                    calibChanged,
                    configChanged,
                    presetAdd,
                    presetUpdate,
                    presetUnchanged,
                    presetRemove
                );

                const postYaml = async (url, body) => {
                    const r = await apiFetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/yaml' },
                        body,
                    });
                    if (!r || !r.ok) {
                        throw new Error(`${url} POST failed: ${r ? r.status : 'no response'}`);
                    }
                };

                for (const name of [...presetAdd, ...presetUpdate]) {
                    const body = jsyaml.dump(this.presetsData[name], { lineWidth: -1 });
                    await postYaml(`/presets/${name}.yml`, body);
                }
                if (calibChanged) {
                    await postYaml('/calib.yml', storeCalibYaml);
                }
                if (configChanged) {
                    await postYaml('/config.yml', storeConfigYaml);
                }
                for (const name of presetRemove) {
                    const r = await apiFetch(`/presets/${name}.yml`, { method: 'DELETE' });
                    if (!r || !r.ok) {
                        throw new Error(`/presets/${name}.yml DELETE failed: ${r ? r.status : 'no response'}`);
                    }
                }

                syncAutosaveAckToRev(this);
                console.log('[saveToDevice] done · synced (store is now on device)');
            } catch (e) {
                console.error('[saveToDevice] failed:', e);
                throw e;
            }
        },

        /**
         * Pick a YAML bundle (quray_export_version + calib + config + presets), fill store, sync device.
         */
        async importFromFile() {
            let text;
            try {
                text = await pickYamlFileText();
            } catch (e) {
                console.error('[importFromFile] read failed:', e);
                throw e;
            }
            if (text == null || text === '') {
                return;
            }

            const HW = this.HW_CH_COUNT;
            const previousPresetName = this.currentPresetName;
            const previousGestureIndices = Array.isArray(this.selectedGestureIndices)
                ? [...this.selectedGestureIndices]
                : [0];

            let parsed;
            try {
                parsed = parseDeviceExportBundle(text, HW);
            } catch (e) {
                console.error('[importFromFile] parse failed:', e);
                throw e;
            }

            this.calibData = parsed.calibData;
            this.configData = parsed.configData;
            this.presetsData = parsed.presetsData;
            this.presetNames = parsed.presetNames;
            resetAutosaveAfterFullLoad(this);

            alignPresetSelectionAfterLoad(this, previousPresetName, previousGestureIndices);

            await this.saveToDevice();
            console.log('[importFromFile] done · bundle applied and device updated');
        },

        /**
         * Reload from device, then download one YAML with calib + config + all presets.
         */
        async exportToFile() {
            await this.reloadFromDevice();

            const presets = {};
            for (const name of storePresetNamesSorted(this)) {
                presets[name] = JSON.parse(JSON.stringify(this.presetsData[name] || { gestures: [] }));
            }

            const bundle = {
                quray_export_version: 1,
                calib: JSON.parse(JSON.stringify(this.calibData)),
                config: JSON.parse(JSON.stringify(this.configData)),
                presets,
            };

            const yaml = jsyaml.dump(bundle, { lineWidth: -1 });
            const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            a.download = `quray-export-${stamp}.yml`;
            a.click();
            URL.revokeObjectURL(url);
            console.log('[exportToFile] done · downloaded bundle after reload');
        },

        async loadAllFiles() {
            const previousPresetName = this.currentPresetName;
            const previousGestureIndices = Array.isArray(this.selectedGestureIndices)
                ? [...this.selectedGestureIndices]
                : [0];
            try {
                const calibResponse = await qurayTransport.apiFetch('/calib.yml');
                const calibText = await calibResponse.text();
                const loadedCalib = jsyaml.load(calibText) || {};
                const HW = this.HW_CH_COUNT;
                this.calibData = buildCalibDataFromLoaded(loadedCalib, HW);

                const configResponse = await qurayTransport.apiFetch('/config.yml');
                const configText = await configResponse.text();
                const loadedConfig = jsyaml.load(configText) || {};
                this.configData = loadedConfig;
                if (!this.configData.point_type) this.configData.point_type = 'cloud';
                if (!this.configData.color1) this.configData.color1 = '#FE3A86';
                if (!this.configData.color2) this.configData.color2 = '#7742ff';

                const presetsListResponse = await qurayTransport.apiFetch('/presets');
                const presetsListText = await presetsListResponse.text();
                const presetFiles = qurayTransport.parsePresetsListFromResponseText(presetsListText);

                this.presetsData = {};
                this.presetNames = [];

                for (const file of presetFiles) {
                    const response = await qurayTransport.apiFetch(`/presets/${file}`);
                    const text = await response.text();
                    const name = file.replace('.yml', '');
                    this.presetsData[name] = jsyaml.load(text) || { gestures: [] };
                    normalizePresetData(this.presetsData[name], { fillMissingScale: true });
                    this.presetNames.push(name);
                }
                this.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

                alignPresetSelectionAfterLoad(this, previousPresetName, previousGestureIndices, {
                    fromDevice: true,
                });

                resetAutosaveAfterFullLoad(this);
            } catch (error) {
                console.error('Error loading files:', error);
            }
        },
    };
}
