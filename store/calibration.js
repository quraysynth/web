/**
 * calib.yml / calibration panel.
 */

function storeCalibrationMethods() {
    return {
        async reloadCalibYamlFromDevice() {
            const HW = this.HW_CH_COUNT;
            try {
                const resp = await qurayTransport.apiFetch('/calib.yml');
                const text = await resp.text();
                const parsed = jsyaml.load(text);
                if (parsed && parsed.min_signal) {
                    this.calibData.min_signal = parsed.min_signal;
                    this.calibData.max_distance = parsed.max_distance;
                    this.calibData.manual_max_distance = parsed.manual_max_distance || 1200;
                    while (this.calibData.min_signal.length < HW) this.calibData.min_signal.push(0);
                    while (this.calibData.max_distance.length < HW) this.calibData.max_distance.push(1000);
                    this.calibData.min_signal = this.calibData.min_signal.slice(0, HW);
                    this.calibData.max_distance = this.calibData.max_distance.slice(0, HW);
                }
            } catch (_e) {
                /* ignore */
            }
        },

        handleDeviceCalibStatus(cal) {
            if (cal && cal !== 'done' && typeof cal === 'string' && cal.includes('/')) {
                this.calibButtonState = 'calibrating';
                this.calibProgress = cal;
            } else if (cal === 'done') {
                if (this.calibrationPending) {
                    this.calibrationPending = false;
                    this.calibButtonState = 'calibrated';
                    this.calibProgress = null;
                    this.reloadCalibYamlFromDevice();
                }
            }
        },

        async startDeviceCalibration() {
            if (this.calibrationPending) return;
            this.calibrationPending = true;
            this.calibButtonState = 'calibrating';
            this.calibProgress = null;
            try {
                const r = await qurayTransport.apiFetch('/calibrate', { method: 'POST' });
                if (!r.ok) {
                    throw new Error('HTTP ' + r.status);
                }
            } catch (e) {
                this.calibrationPending = false;
                this.calibButtonState = 'idle';
                this.calibProgress = null;
                console.error('Calibration failed:', e);
            }
        },

        setCalibManualMaxDistance(raw) {
            const v = parseInt(String(raw), 10);
            if (Number.isNaN(v)) return;
            this.calibData.manual_max_distance = Math.max(100, Math.min(1200, v));
            this.markDirty('calib');
        },

        setCalibMinSignal(index, raw) {
            if (index < 0 || index >= this.HW_CH_COUNT) return;
            const v = parseInt(String(raw), 10);
            if (Number.isNaN(v)) return;
            this.calibData.min_signal[index] = Math.max(0, v);
            this.markDirty('calib');
        },

        setCalibMaxDistance(index, raw) {
            if (index < 0 || index >= this.HW_CH_COUNT) return;
            const v = parseInt(String(raw), 10);
            if (Number.isNaN(v)) return;
            this.calibData.max_distance[index] = Math.max(0, v);
            this.markDirty('calib');
        },
    };
}
