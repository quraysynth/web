function logScalePercent(signalLevel, minSig, logMax) {
    const lo = minSig;
    const hi = logMax;
    const v = signalLevel || 0;
    const logLo = Math.log(lo + 1);
    const logHi = Math.log(hi + 1);
    const logV = Math.log(v + 1);
    const pct = ((logV - logLo) / (logHi - logLo)) * 100;
    return Math.max(0, Math.min(100, pct));
}

function signalCalibrationView() {
    return {
        get calib() {
            return Alpine.store('app').calibData;
        },
        get sensorData() {
            return Alpine.store('app').sensorData;
        },
        get sensorIndices() {
            return Array.from({ length: Alpine.store('app').HW_CH_COUNT }, (_, i) => i);
        },
        signalBarPct(i) {
            const s = Alpine.store('app');
            const minSig = s.calibData.min_signal[i] != null ? s.calibData.min_signal[i] : 0;
            return logScalePercent(s.sensorData.signal_level[i] || 0, minSig, 1000);
        },
        onManualMaxInput(event) {
            Alpine.store('app').setCalibManualMaxDistance(event.target.value);
        },
        onMinSignalInput(index, raw) {
            Alpine.store('app').setCalibMinSignal(index, raw);
        },
        onMaxDistanceInput(index, raw) {
            Alpine.store('app').setCalibMaxDistance(index, raw);
        },
    };
}
