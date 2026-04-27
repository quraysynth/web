function presetView() {
    const PRESET_NAME_RE = /^[a-zA-Z0-9_-]+$/;

    return {
        get selectedPreset() {
            return Alpine.store('app').currentPresetName;
        },
        onSelectedPresetChange(event) {
            const s = Alpine.store('app');
            const v = event.target.value;
            s.selectPreset(v);
            const prevP = String(s.configData.preset ?? '');
            const nextP = String(v ?? '');
            if (prevP !== nextP) {
                s.setConfigField('preset', v);
            }
        },
        get presetOptions() {
            const names = Alpine.store('app').presetNames;
            return [{ value: '', label: 'Select preset...' }, ...names.map((n) => ({ value: n, label: n }))];
        },
        get undoEnabled() {
            return Alpine.store('app').undoStack.length > 0;
        },
        get redoEnabled() {
            return Alpine.store('app').redoStack.length > 0;
        },
        enterPlayMode() {
            const s = Alpine.store('app');
            if (!s.currentPresetName || !s.presetsData[s.currentPresetName]) {
                return;
            }
        },
        validatePresetName(rawName) {
            const name = String(rawName || '').trim();
            if (!name) return { ok: false, name: '', message: 'Preset name cannot be empty' };
            if (!PRESET_NAME_RE.test(name)) {
                return {
                    ok: false,
                    name,
                    message: 'Preset name can only contain letters, numbers, hyphens, and underscores',
                };
            }
            return { ok: true, name, message: '' };
        },
        renamePreset() {
            const s = Alpine.store('app');
            const oldName = s.currentPresetName;
            if (!oldName) {
                return;
            }

            const askedName = window.prompt(`Rename preset "${oldName}" to:`, oldName);
            if (askedName === null) return;
            const v = this.validatePresetName(askedName);
            if (!v.ok) {
                return;
            }
            const newName = v.name;
            if (newName === oldName) return;
            if (s.presetsData[newName]) {
                return;
            }

            s.presetsData[newName] = s.presetsData[oldName];
            delete s.presetsData[oldName];
            delete s.autosaveRev.presets[oldName];
            delete s.autosaveAck.presets[oldName];
            s.markDirty('preset', newName);

            const idx = s.presetNames.indexOf(oldName);
            if (idx !== -1) s.presetNames[idx] = newName;
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

            if (s.configData.preset === oldName) {
                s.configData.preset = newName;
                s.markDirty('config');
            }

            s.selectPreset(newName);
            qurayTransport.apiFetch(`presets/${oldName}.yml`, { method: 'DELETE' }).catch((e) => {
                console.error(`Error deleting old preset file "${oldName}.yml":`, e);
            });
        },
        copyPreset() {
            const s = Alpine.store('app');
            const sourceName = s.currentPresetName;
            if (!sourceName) {
                return;
            }

            const askedName = window.prompt(`Copy preset "${sourceName}" as:`, `${sourceName}_copy`);
            if (askedName === null) return;
            const v = this.validatePresetName(askedName);
            if (!v.ok) {
                return;
            }
            const newName = v.name;
            if (s.presetsData[newName]) {
                return;
            }

            s.presetsData[newName] = JSON.parse(JSON.stringify(s.presetsData[sourceName]));
            s.presetNames.push(newName);
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            s.markDirty('preset', newName);
            s.selectPreset(newName);
            if (String(s.configData.preset ?? '') !== newName) {
                s.setConfigField('preset', newName);
            }
        },
        deletePreset() {
            const s = Alpine.store('app');
            const deletedName = s.currentPresetName;
            if (!deletedName) {
                return;
            }

            const confirmed = window.confirm(
                `Are you sure you want to DELETE preset "${deletedName}"?\n\nThis will permanently remove the preset and cannot be undone.`
            );
            if (!confirmed) return;

            delete s.presetsData[deletedName];
            delete s.autosaveRev.presets[deletedName];
            delete s.autosaveAck.presets[deletedName];

            s.presetNames = s.presetNames.filter((name) => name !== deletedName);
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

            if (s.configData.preset === deletedName) {
                s.configData.preset = '';
                s.markDirty('config');
            }

            const nextPresetName = s.presetNames.length > 0 ? s.presetNames[0] : '';
            s.selectPreset(nextPresetName);

            qurayTransport.apiFetch(`presets/${deletedName}.yml`, { method: 'DELETE' }).catch((e) => {
                console.error(`Error deleting preset file "${deletedName}.yml":`, e);
            });
        },
        clearPreset() {
            const s = Alpine.store('app');
            const name = s.currentPresetName;
            if (!name) {
                return;
            }

            const confirmed = window.confirm(`Are you sure you want to clear all gestures from preset "${name}"?`);
            if (!confirmed) return;

            s.saveHistory();
            s.presetsData[name] = { gestures: [] };
            s.markDirty('preset', name);
            s.selectedGestureIndices = [0];
        },
        createNewPreset() {
            const s = Alpine.store('app');
            const askedName = window.prompt('Enter name for the new preset:', 'new_preset');
            if (askedName === null) return;
            const v = this.validatePresetName(askedName);
            if (!v.ok) {
                return;
            }
            const newName = v.name;
            if (s.presetsData[newName]) {
                return;
            }

            s.presetsData[newName] = newEmptyPreset();
            s.presetNames.push(newName);
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            s.markDirty('preset', newName);
            s.selectPreset(newName);
            if (String(s.configData.preset ?? '') !== newName) {
                s.setConfigField('preset', newName);
            }
        },
        undo() {
            Alpine.store('app').undo();
        },
        redo() {
            Alpine.store('app').redo();
        },
    };
}
