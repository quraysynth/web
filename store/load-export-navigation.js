/**
 * Preset/gesture navigation, YAML load, ZIP export, transport hooks.
 */

function storeLoadExportNavigationMethods() {
    return {
        markDirty(fileType, presetName = null) {
            if (fileType === 'calib') {
                this.dirtyFlags.calib = true;
            } else if (fileType === 'config') {
                this.dirtyFlags.config = true;
            } else if (fileType === 'preset' && presetName) {
                this.dirtyFlags.presets[presetName] = true;
            }
        },

        showStatus(message, type = 'success') {
            if (this._statusHideTimer) {
                clearTimeout(this._statusHideTimer);
            }
            this.statusMessage = message;
            this.statusType = type;
            this.statusVisible = true;
            this._statusHideTimer = setTimeout(() => {
                this.statusVisible = false;
            }, 3000);
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
                this.showStatus('Serial error: ' + error.message, 'error');
            }
        },

        startDirtyCheckTimer() {
            qurayTransport.startDirtyCheckTimer(this);
        },

        startSensorDataPolling() {
            qurayTransport.startSensorDataPolling(this);
        },

        async loadAllFiles() {
            try {
                const calibResponse = await qurayTransport.apiFetch('/calib.yml');
                const calibText = await calibResponse.text();
                const loadedCalib = jsyaml.load(calibText) || {};
                const HW = this.HW_CH_COUNT;

                if (Array.isArray(loadedCalib)) {
                    this.calibData = {
                        min_signal: [...loadedCalib],
                        max_distance: Array(HW).fill(1000),
                        manual_max_distance: 1200,
                    };
                } else {
                    this.calibData = {
                        min_signal: loadedCalib.min_signal || Array(HW).fill(0),
                        max_distance: loadedCalib.max_distance || Array(HW).fill(1000),
                        manual_max_distance: loadedCalib.manual_max_distance || 1200,
                    };
                }
                while (this.calibData.min_signal.length < HW) this.calibData.min_signal.push(0);
                while (this.calibData.max_distance.length < HW) this.calibData.max_distance.push(1000);
                this.calibData.min_signal = this.calibData.min_signal.slice(0, HW);
                this.calibData.max_distance = this.calibData.max_distance.slice(0, HW);

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
                this.dirtyFlags.presets = {};

                for (const file of presetFiles) {
                    const response = await qurayTransport.apiFetch(`/presets/${file}`);
                    const text = await response.text();
                    const name = file.replace('.yml', '');
                    this.presetsData[name] = jsyaml.load(text) || { gestures: [] };
                    normalizePresetData(this.presetsData[name]);
                    this.presetNames.push(name);
                }
                this.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

                if (this.presetNames.includes('default')) {
                    this.currentPresetName = 'default';
                    this.selectedGestureIndices = [0];
                }

                this.showStatus('Files loaded successfully', 'success');
            } catch (error) {
                console.error('Error loading files:', error);
                this.showStatus('Error loading files: ' + error.message, 'error');
            }
        },

        saveAll() {
            this.showStatus('Changes saved in memory. Use "Download All Files" to export.', 'success');
        },

        async downloadAll() {
            try {
                const zip = new JSZip();
                const calibYaml = jsyaml.dump(this.calibData, { lineWidth: -1 });
                zip.file('calib.yml', calibYaml);
                const configYaml = jsyaml.dump(this.configData, { lineWidth: -1 });
                zip.file('config.yml', configYaml);
                const presetsFolder = zip.folder('presets');
                for (const [name, data] of Object.entries(this.presetsData)) {
                    const presetYaml = jsyaml.dump(data, { lineWidth: -1 });
                    presetsFolder.file(`${name}.yml`, presetYaml);
                }
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'data.zip';
                a.click();
                URL.revokeObjectURL(url);
                this.showStatus('data.zip downloaded successfully', 'success');
            } catch (error) {
                this.showStatus('Error creating archive: ' + error.message, 'error');
            }
        },
    };
}
