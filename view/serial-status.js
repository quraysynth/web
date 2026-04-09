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
        async toggleSerial() {
            await Alpine.store('app').toggleSerial();
        },
        toggleRecording() {
            /* stub */
        },
        startCalibration() {
            Alpine.store('app').startDeviceCalibration();
        },
    };
}
