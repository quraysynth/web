function splitGestureView() {
    return {
        axisOptions: Array.from({ length: 8 }, (_, i) => ({
            value: i,
            label: String(i + 1),
        })),
        orderOptions: [
            { value: 'linear', label: 'linear' },
            { value: 'jump2', label: 'jump 2' },
            { value: 'jump3', label: 'jump 3' },
            { value: 'random', label: 'random' },
        ],
        splitX: 0,
        splitY: 0,
        splitOrder: 'linear',
        get visible() {
            return Alpine.store('app').splitModalVisible;
        },
        get hasScale() {
            const preset = Alpine.store('app').currentPreset();
            return preset?.scale != null;
        },
        close() {
            Alpine.store('app').closeSplit();
        },
        split() {
            Alpine.store('app').split({
                x: this.splitX,
                y: this.splitY,
                order: this.splitOrder,
            });
        },
    };
}
