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
        onConfigField(key, value) {
            Alpine.store('app').setConfigField(key, value);
        },
        onConfigNumber(key, raw) {
            const n = parseInt(String(raw), 10);
            Alpine.store('app').setConfigField(key, Number.isNaN(n) ? 0 : n);
        },
    };
}
