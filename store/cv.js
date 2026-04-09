/**
 * CV events on the current gesture + CRUD.
 */

function storeCvMethods() {
    return {
        cvEventAt(index) {
            const g = this.currentGesture();
            if (!g?.cv || index < 0 || index >= g.cv.length) return null;
            return g.cv[index];
        },

        ensureCvDefaults(ev) {
            if (ev.bottom === undefined) ev.bottom = -5.0;
            if (ev.top === undefined) ev.top = 5.0;
            if (ev.singleValue === undefined) ev.singleValue = false;
        },

        setCvEventChannel(index, rawChannel) {
            const ev = this.cvEventAt(index);
            if (!ev) return;
            this.saveHistory();
            const ch = parseInt(String(rawChannel), 10);
            ev.channel = Number.isNaN(ch) ? 1 : ch;
            this.markDirty('preset', this.currentPresetName);
        },

        setCvEventAxis(index, axis) {
            const ev = this.cvEventAt(index);
            if (!ev) return;
            this.saveHistory();
            ev.axis = axis;
            this.markDirty('preset', this.currentPresetName);
        },

        setCvSlider(index, property, rawValue) {
            const ev = this.cvEventAt(index);
            if (!ev) return;
            this.saveHistory();
            this.ensureCvDefaults(ev);
            const value = parseFloat(String(rawValue));
            if (Number.isNaN(value)) return;
            ev[property] = value;
            if (ev.singleValue) {
                ev.bottom = value;
                ev.top = value;
            }
            this.markDirty('preset', this.currentPresetName);
        },

        setCvSingleValue(index, enabled) {
            const ev = this.cvEventAt(index);
            if (!ev) return;
            this.saveHistory();
            this.ensureCvDefaults(ev);
            ev.singleValue = !!enabled;
            if (ev.singleValue) {
                const currentValue =
                    ev.bottom !== undefined
                        ? ev.bottom
                        : ev.top !== undefined
                          ? ev.top
                          : 0.0;
                ev.bottom = currentValue;
                ev.top = currentValue;
            }
            this.markDirty('preset', this.currentPresetName);
        },

        addCvEvent() {
            const preset = this.currentPreset();
            if (!preset || !preset.gestures || preset.gestures.length === 0) {
                this.showStatus('No gesture selected', 'error');
                return;
            }
            if (!this.selectedGestureIndices || this.selectedGestureIndices.length !== 1) {
                this.showStatus(
                    this.selectedGestureIndices?.length > 1
                        ? 'Select exactly one gesture to edit CV'
                        : 'No gesture selected',
                    'error'
                );
                return;
            }
            this.saveHistory();
            const gesture = this.currentGesture();
            if (!gesture) return;
            this.ensureGestureMidiCv(gesture);
            gesture.cv.push({
                channel: 1,
                axis: 'y',
                bottom: -5.0,
                top: 5.0,
                singleValue: false,
            });
            this.markDirty('preset', this.currentPresetName);
            this.showStatus('CV event added', 'success');
        },

        deleteCvEvent(index) {
            const gesture = this.currentGesture();
            if (!gesture || !gesture.cv || index < 0 || index >= gesture.cv.length) return;
            this.saveHistory();
            gesture.cv.splice(index, 1);
            this.markDirty('preset', this.currentPresetName);
            this.showStatus('CV event deleted', 'success');
        },
    };
}
