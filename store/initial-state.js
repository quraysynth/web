/**
 * Default data fields for Alpine.store('app') (methods merged separately).
 */

function getInitialAppState() {
    return {
        HW_CH_COUNT: 10,

        calibData: {
            min_signal: [],
            max_distance: [],
            manual_max_distance: 1200,
        },
        configData: {},
        presetsData: {},
        presetNames: [],
        currentPresetName: '',
        /** Индексы выделенных жестов; пока используется только [0] как «текущий». */
        selectedGestureIndices: [0],

        sensorData: {
            signal_level: [],
            distance: [],
        },
        /** Точки с девайса (serial JSON `p`), для жёлтой подложки на канвасе */
        devicePoints: [],

        gestureCreating: false,
        gestureShowDeviceConfirm: false,
        gestureCanvasApi: null,
        splitModalVisible: false,
        splitSourceGesture: null,

        dirtyFlags: {
            calib: false,
            config: false,
            presets: {},
        },
        autosaveEnabled: true,
        serialConnected: false,

        calibrationPending: false,
        /** 'idle' | 'calibrating' | 'calibrated' — только для классов, не для текста */
        calibButtonState: 'idle',
        /** null | строка вида "12/64" с устройства */
        calibProgress: null,

        undoStack: [],
        redoStack: [],
        MAX_HISTORY: 10,

        statusMessage: '',
        statusType: 'success',
        statusVisible: false,
        _statusHideTimer: null,
    };
}
