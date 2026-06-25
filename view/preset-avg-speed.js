function presetAvgSpeedView() {
    return {
        get hasPreset() {
            const s = Alpine.store('app');
            return !!(s.currentPresetName && s.presetsData[s.currentPresetName]);
        },

        get preset() {
            return Alpine.store('app').currentPreset();
        },

        get xAvgSpeed() {
            return normalizePresetAvgSpeed(this.preset?.x_avg_speed);
        },

        get yAvgSpeed() {
            return normalizePresetAvgSpeed(this.preset?.y_avg_speed);
        },

        onXChange(ev) {
            Alpine.store('app').setPresetAvgSpeed('x', ev.target.value);
        },

        onYChange(ev) {
            Alpine.store('app').setPresetAvgSpeed('y', ev.target.value);
        },

        emptyHint() {
            if (!this.hasPreset) return 'No preset selected';
            return '';
        },
    };
}
