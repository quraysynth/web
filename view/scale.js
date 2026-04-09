/** id → label (major modes + pentatonics) */
const SCALE_KIND_OPTIONS = [
    { id: 'major', label: 'Major (Ionian)' },
    { id: 'natural_minor', label: 'Natural minor (Aeolian)' },
    { id: 'dorian', label: 'Dorian' },
    { id: 'phrygian', label: 'Phrygian' },
    { id: 'lydian', label: 'Lydian' },
    { id: 'mixolydian', label: 'Mixolydian' },
    { id: 'locrian', label: 'Locrian' },
    { id: 'major_pentatonic', label: 'Major pentatonic' },
    { id: 'minor_pentatonic', label: 'Minor pentatonic' },
    { id: 'chromatic', label: 'Chromatic' },
];

function scaleView() {
    return {
        rootNotes: MIDI_NOTE_NAMES,
        scaleKinds: SCALE_KIND_OPTIONS,

        get hasPreset() {
            const s = Alpine.store('app');
            return !!(s.currentPresetName && s.presetsData[s.currentPresetName]);
        },

        get scaleData() {
            const p = Alpine.store('app').currentPreset();
            if (!p || p.scale == null) return null;
            return p.scale;
        },

        /** Значение для select «Scale»: '' если лада нет. */
        get scaleKindValue() {
            const d = this.scaleData;
            return d && d.scale ? d.scale : '';
        },

        onKindChange(ev) {
            Alpine.store('app').setPresetScaleSelection(ev.target.value);
        },

        onRootChange(ev) {
            Alpine.store('app').setPresetScaleRoot(ev.target.value);
        },

        onOctaveChange(ev) {
            Alpine.store('app').setPresetScaleOctave(ev.target.value);
        },

        emptyHint() {
            if (!this.hasPreset) return 'No preset selected';
            return '';
        },
    };
}
