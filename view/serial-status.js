function serialStatusView() {
    return {
        get serialConnected() {
            return Alpine.store('app').serialConnected;
        },
        get showCalibrate() {
            if (this.serialConnected) return true;
            try {
                const p = window.location.protocol;
                return p === 'http:' || p === 'https:';
            } catch (_e) {
                return false;
            }
        },
        get showRecord() {
            return this.serialConnected;
        },
        get calibButtonClass() {
            const s = Alpine.store('app').calibButtonState;
            if (s === 'calibrating') return 'calibrating';
            if (s === 'calibrated') return 'calibrated';
            return '';
        },
        get calibButtonLabel() {
            const app = Alpine.store('app');
            if (app.calibButtonState === 'calibrated') return 'Calibrated';
            if (app.calibProgress) return app.calibProgress;
            if (app.calibrationPending && app.calibButtonState === 'calibrating') return '…';
            return 'Calibrate';
        },
        get transferStatusText() {
            const pending = Number(Alpine.store('app').deviceIoInFlight) || 0;
            return pending > 0 ? `Transfer in progress (${pending})` : 'No active transfer';
        },
        get transferStatusBusy() {
            return (Number(Alpine.store('app').deviceIoInFlight) || 0) > 0;
        },
        async toggleSerial() {
            await Alpine.store('app').toggleSerial();
        },
        async reloadFromDevice() {
            await Alpine.store('app').reloadFromDevice();
        },
        async saveToDevice() {
            await Alpine.store('app').saveToDevice();
        },
        async importFromFile() {
            await Alpine.store('app').importFromFile();
        },
        async exportToFile() {
            await Alpine.store('app').exportToFile();
        },
        toggleRecording() {
            /* stub */
        },
        startCalibration() {
            Alpine.store('app').startDeviceCalibration();
        },
    };
}
