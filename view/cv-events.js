function cvVoltsLabel(internalValue) {
    const v = Number(internalValue);
    if (Number.isNaN(v)) return '0.00';
    return (v * 2).toFixed(2);
}

function cvEventsView() {
    return {
        cvVoltsLabel,
        channels4: [1, 2, 3, 4],

        get cvEditingEnabled() {
            const s = Alpine.store('app');
            if ((s.selectedGestureIndices || []).length !== 1) return false;
            return !!s.currentGesture();
        },

        get cvEvents() {
            const g = Alpine.store('app').currentGesture();
            if (!g) return [];
            if (!g.cv) g.cv = [];
            return g.cv;
        },

        cvEmptyHint() {
            const s = Alpine.store('app');
            if (!s.currentPresetName || !s.presetsData[s.currentPresetName]) return 'No preset selected';
            const p = s.presetsData[s.currentPresetName];
            if (!p.gestures?.length) return 'No gesture selected';
            const sel = s.selectedGestureIndices || [];
            if (sel.length === 0) return 'No gesture selected';
            if (sel.length > 1) return 'Select exactly one gesture to edit CV';
            if (!s.currentGesture()) return 'No gesture selected';
            if (!this.cvEvents.length) return 'No CV events. Click + to add.';
            return '';
        },

        addCvEvent() {
            Alpine.store('app').addCvEvent();
        },

        deleteCvEvent(index) {
            Alpine.store('app').deleteCvEvent(index);
        },

        onChannelChange(index, event) {
            Alpine.store('app').setCvEventChannel(index, event.target.value);
        },

        onAxisChange(index, value) {
            Alpine.store('app').setCvEventAxis(index, value);
        },

        onCvSlider(index, property, rawValue) {
            Alpine.store('app').setCvSlider(index, property, rawValue);
        },

        onCvSingleValueChange(index, enabled) {
            Alpine.store('app').setCvSingleValue(index, enabled);
        },
    };
}
