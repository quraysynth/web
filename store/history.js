/**
 * Undo / redo for current preset (deep copy), aligned with index.html.old canvas edits.
 */

function storeHistoryMethods() {
    return {
        saveHistory() {
            const name = this.currentPresetName;
            if (!name || !this.presetsData[name]) return;

            const state = {
                presetName: name,
                preset: JSON.parse(JSON.stringify(this.presetsData[name])),
                selectedGestureIndices: [...this.selectedGestureIndices],
            };

            this.undoStack.push(state);
            if (this.undoStack.length > this.MAX_HISTORY) {
                this.undoStack.shift();
            }
            this.redoStack = [];
        },

        undo() {
            if (this.undoStack.length === 0) return;

            const name = this.currentPresetName;
            if (name && this.presetsData[name]) {
                const currentState = {
                    presetName: name,
                    preset: JSON.parse(JSON.stringify(this.presetsData[name])),
                    selectedGestureIndices: [...this.selectedGestureIndices],
                };
                this.redoStack.push(currentState);
                if (this.redoStack.length > this.MAX_HISTORY) {
                    this.redoStack.shift();
                }
            }

            const state = this.undoStack.pop();
            if (state) {
                this.presetsData[state.presetName] = JSON.parse(JSON.stringify(state.preset));
                this.currentPresetName = state.presetName;
                this.selectedGestureIndices = Array.isArray(state.selectedGestureIndices)
                    ? [...state.selectedGestureIndices]
                    : [state.gestureIndex ?? 0];
                this.markDirty('preset', state.presetName);
            }
        },

        redo() {
            if (this.redoStack.length === 0) return;

            const name = this.currentPresetName;
            if (name && this.presetsData[name]) {
                const currentState = {
                    presetName: name,
                    preset: JSON.parse(JSON.stringify(this.presetsData[name])),
                    selectedGestureIndices: [...this.selectedGestureIndices],
                };
                this.undoStack.push(currentState);
                if (this.undoStack.length > this.MAX_HISTORY) {
                    this.undoStack.shift();
                }
            }

            const state = this.redoStack.pop();
            if (state) {
                this.presetsData[state.presetName] = JSON.parse(JSON.stringify(state.preset));
                this.currentPresetName = state.presetName;
                this.selectedGestureIndices = Array.isArray(state.selectedGestureIndices)
                    ? [...state.selectedGestureIndices]
                    : [state.gestureIndex ?? 0];
                this.markDirty('preset', state.presetName);
            }
        },
    };
}
