function configurationView() {
    return {
        pointTypeOptions: [
            { value: 'cloud', label: 'Cloud' },
            { value: 'cross', label: 'Cross' },
        ],
        get config() {
            return Alpine.store('app').configData;
        },
        deviceColor1Hex() {
            return '-';
        },
        deviceColor2Hex() {
            return '-';
        },
        get configPresetOptions() {
            const names = Alpine.store('app').presetNames;
            return [{ value: '', label: 'Select preset...' }, ...names.map((n) => ({ value: n, label: n }))];
        },
        onConfigField(key, value) {
            Alpine.store('app').setConfigField(key, value);
        },
        onConfigNumber(key, raw) {
            const n = parseInt(String(raw), 10);
            Alpine.store('app').setConfigField(key, Number.isNaN(n) ? 0 : n);
        },
    };
}
