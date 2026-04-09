/**
 * Assembles Alpine.store('app'). See store/*.js for pieces. Network: transport.js.
 */

document.addEventListener('alpine:init', () => {
    Alpine.store(
        'app',
        Object.assign(
            {},
            getInitialAppState(),
            storeConfigMethods(),
            storeCalibrationMethods(),
            storeMidiMethods(),
            storeCvMethods(),
            storeHistoryMethods(),
            storeScaleMethods(),
            storeSplitGestureMethods(),
            storeLoadExportNavigationMethods()
        )
    );

    const app = Alpine.store('app');
    qurayTransport.bindApp(app);
    app.sensorData.signal_level = Array(app.HW_CH_COUNT).fill(0);
    app.sensorData.distance = Array(app.HW_CH_COUNT).fill(0);

    app.loadAllFiles().then(() => {
        app.startDirtyCheckTimer();
        app.startSensorDataPolling();
    });

    window.saveAll = () => Alpine.store('app').saveAll();
    window.downloadAll = () => Alpine.store('app').downloadAll();

});
