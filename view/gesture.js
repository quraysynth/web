function gestureView() {
    return {
        get creating() {
            return Alpine.store('app').gestureCreating;
        },
        get showConfirm() {
            return Alpine.store('app').gestureShowDeviceConfirm;
        },
        get currentIndex() {
            const sel = Alpine.store('app').selectedGestureIndices;
            if (!sel || sel.length === 0) return -1;
            return sel[0];
        },
        get totalGestures() {
            const p = Alpine.store('app').currentPreset();
            return p?.gestures?.length ?? 0;
        },
        get exactlyOneGestureSelected() {
            const sel = Alpine.store('app').selectedGestureIndices || [];
            return sel.length === 1;
        },
        counterLabel() {
            const t = this.totalGestures;
            const i = this.currentIndex;
            if (t <= 0) return '−/−';
            if (i < 0) return `−/${t}`;
            return `${i + 1}/${t}`;
        },
        previousGesture() {
            const s = Alpine.store('app');
            const t = this.totalGestures;
            if (t <= 0) return;
            const sel = s.selectedGestureIndices || [];
            if (sel.length === 0) return;
            const cur = sel[0];
            s.selectedGestureIndices = [(cur - 1 + t) % t];
        },
        nextGesture() {
            const s = Alpine.store('app');
            const t = this.totalGestures;
            if (t <= 0) return;
            const sel = s.selectedGestureIndices || [];
            if (sel.length === 0) return;
            const cur = sel[0];
            s.selectedGestureIndices = [(cur + 1) % t];
        },
        startCreateGesture() {
            const s = Alpine.store('app');
            let name = s.currentPresetName;
            if (!name) {
                if (s.presetNames.length > 0) {
                    name = s.presetNames[0];
                    s.selectPreset(name);
                } else {
                    name = 'default';
                    s.presetsData.default = newEmptyPreset();
                    s.presetNames.push('default');
                    s.presetNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
                    s.markDirty('preset', 'default');
                    s.selectPreset('default');
                }
            }
            s.gestureCreating = true;
            s.gestureShowDeviceConfirm = false;
        },
        cancelCreateGesture() {
            const s = Alpine.store('app');
            s.gestureCanvasApi?.abortCreateGestureUi();
        },
        showSplit() {
            const s = Alpine.store('app');
            const sel = s.selectedGestureIndices || [];
            if (sel.length !== 1) {
                return;
            }
            const gesture = s.currentGesture();
            if (!gesture) {
                return;
            }
            s.showSplit(gesture);
        },
        copyGesture() {
            const s = Alpine.store('app');
            const name = s.currentPresetName;
            if (!name || !s.presetsData[name]) {
                return;
            }

            const preset = s.presetsData[name];
            if (!Array.isArray(preset.gestures) || preset.gestures.length === 0) {
                return;
            }

            const sel = s.selectedGestureIndices || [];
            if (sel.length !== 1) {
                return;
            }
            const primary = sel[0];
            const gesture = preset.gestures[primary];
            if (!gesture) {
                return;
            }

            s.saveHistory();
            const copy = JSON.parse(JSON.stringify(gesture));
            preset.gestures.splice(primary + 1, 0, copy);
            s.selectedGestureIndices = [primary + 1];
            s.markDirty('preset', name);
        },
        deleteGesture() {
            const s = Alpine.store('app');
            const name = s.currentPresetName;
            if (!name || !s.presetsData[name]) {
                return;
            }

            const preset = s.presetsData[name];
            if (!Array.isArray(preset.gestures) || preset.gestures.length === 0) {
                return;
            }

            const sel = s.selectedGestureIndices || [];
            if (sel.length === 0) {
                return;
            }
            s.saveHistory();

            const toRemove = [...new Set(sel)].filter((i) => i >= 0 && i < preset.gestures.length);
            toRemove.sort((a, b) => b - a);
            const wasMulti = toRemove.length > 1;

            for (const i of toRemove) {
                preset.gestures.splice(i, 1);
            }

            if (preset.gestures.length === 0) {
                s.selectedGestureIndices = [];
            } else if (wasMulti) {
                s.selectedGestureIndices = [];
            } else {
                const primary = toRemove[0];
                let next = primary;
                if (primary >= preset.gestures.length && preset.gestures.length > 0) {
                    next = preset.gestures.length - 1;
                }
                s.selectedGestureIndices = [next];
            }

            s.markDirty('preset', name);
        },
        confirmDeviceGesture() {
            Alpine.store('app').gestureCanvasApi?.confirmDeviceGesture();
        },
    };
}
