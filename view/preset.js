function presetView() {
    const PRESET_NAME_RE = /^[a-zA-Z0-9_-]+$/;

    return {
        get selectedPreset() {
            return Alpine.store('app').currentPresetName;
        },
        onSelectedPresetChange(event) {
            Alpine.store('app').selectPreset(event.target.value);
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
                s.showStatus('Please select a preset first', 'error');
                return;
            }
            s.showStatus('Play mode is not implemented in modular UI yet', 'error');
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
                s.showStatus('Please select a preset to rename', 'error');
                return;
            }

            const askedName = window.prompt(`Rename preset "${oldName}" to:`, oldName);
            if (askedName === null) return;
            const v = this.validatePresetName(askedName);
            if (!v.ok) {
                s.showStatus(v.message, 'error');
                return;
            }
            const newName = v.name;
            if (newName === oldName) return;
            if (s.presetsData[newName]) {
                s.showStatus(`Preset "${newName}" already exists`, 'error');
                return;
            }

            s.presetsData[newName] = s.presetsData[oldName];
            delete s.presetsData[oldName];
            delete s.dirtyFlags.presets[oldName];
            s.markDirty('preset', newName);

            const idx = s.presetNames.indexOf(oldName);
            if (idx !== -1) s.presetNames[idx] = newName;
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

            if (s.configData.preset === oldName) {
                s.configData.preset = newName;
                s.markDirty('config');
            }

            s.selectPreset(newName);
            qurayTransport.apiFetch(`/presets/${oldName}.yml`, { method: 'DELETE' }).catch((e) => {
                console.error(`Error deleting old preset file "${oldName}.yml":`, e);
            });
            s.showStatus(`Preset renamed from "${oldName}" to "${newName}"`, 'success');
        },
        copyPreset() {
            const s = Alpine.store('app');
            const sourceName = s.currentPresetName;
            if (!sourceName) {
                s.showStatus('Please select a preset to copy', 'error');
                return;
            }

            const askedName = window.prompt(`Copy preset "${sourceName}" as:`, `${sourceName}_copy`);
            if (askedName === null) return;
            const v = this.validatePresetName(askedName);
            if (!v.ok) {
                s.showStatus(v.message, 'error');
                return;
            }
            const newName = v.name;
            if (s.presetsData[newName]) {
                s.showStatus(`Preset "${newName}" already exists`, 'error');
                return;
            }

            s.presetsData[newName] = JSON.parse(JSON.stringify(s.presetsData[sourceName]));
            s.presetNames.push(newName);
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            s.markDirty('preset', newName);
            s.selectPreset(newName);
            s.showStatus(`Preset copied as "${newName}"`, 'success');
        },
        deletePreset() {
            const s = Alpine.store('app');
            const deletedName = s.currentPresetName;
            if (!deletedName) {
                s.showStatus('Please select a preset to delete', 'error');
                return;
            }

            const confirmed = window.confirm(
                `Are you sure you want to DELETE preset "${deletedName}"?\n\nThis will permanently remove the preset and cannot be undone.`
            );
            if (!confirmed) return;

            delete s.presetsData[deletedName];
            delete s.dirtyFlags.presets[deletedName];

            s.presetNames = s.presetNames.filter((name) => name !== deletedName);
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

            if (s.configData.preset === deletedName) {
                s.configData.preset = '';
                s.markDirty('config');
            }

            const nextPresetName = s.presetNames.length > 0 ? s.presetNames[0] : '';
            s.selectPreset(nextPresetName);

            qurayTransport.apiFetch(`/presets/${deletedName}.yml`, { method: 'DELETE' }).catch((e) => {
                console.error(`Error deleting preset file "${deletedName}.yml":`, e);
            });
            s.showStatus(`Preset "${deletedName}" deleted`, 'success');
        },
        clearPreset() {
            const s = Alpine.store('app');
            const name = s.currentPresetName;
            if (!name) {
                s.showStatus('Please select a preset to clear', 'error');
                return;
            }

            const confirmed = window.confirm(`Are you sure you want to clear all gestures from preset "${name}"?`);
            if (!confirmed) return;

            s.saveHistory();
            s.presetsData[name] = { gestures: [] };
            s.markDirty('preset', name);
            s.selectedGestureIndices = [0];
            s.showStatus(`Preset "${name}" cleared`, 'success');
        },
        createNewPreset() {
            const s = Alpine.store('app');
            const askedName = window.prompt('Enter name for the new preset:', 'new_preset');
            if (askedName === null) return;
            const v = this.validatePresetName(askedName);
            if (!v.ok) {
                s.showStatus(v.message, 'error');
                return;
            }
            const newName = v.name;
            if (s.presetsData[newName]) {
                s.showStatus(`Preset "${newName}" already exists`, 'error');
                return;
            }

            s.presetsData[newName] = { gestures: [] };
            s.presetNames.push(newName);
            s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
            s.markDirty('preset', newName);
            s.selectPreset(newName);
            s.showStatus(`New preset "${newName}" created`, 'success');
        },
        undo() {
            Alpine.store('app').undo();
        },
        redo() {
            Alpine.store('app').redo();
        },
    };
}
