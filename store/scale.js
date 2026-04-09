/**
 * Preset-level scale metadata (editor only; device ignores).
 */

const SCALE_DEFAULTS = {
    root: 'C',
    octave: 0,
    scale: 'major',
};

function storeScaleMethods() {
    return {
        defaultPresetScale() {
            return { ...SCALE_DEFAULTS };
        },

        /** Пустая строка → preset.scale = null, иначе объект с ладом и полями root/octave. */
        setPresetScaleSelection(kind) {
            const preset = this.currentPreset();
            if (!preset) return;
            this.saveHistory();
            const k = String(kind ?? '').trim();
            if (!k) {
                preset.scale = null;
                recomputeMidiNotesFromPresetScale(preset);
            } else if (preset.scale && typeof preset.scale === 'object') {
                preset.scale = { ...preset.scale, scale: k };
                if (preset.scale.root === undefined) preset.scale.root = SCALE_DEFAULTS.root;
                if (preset.scale.octave === undefined) preset.scale.octave = SCALE_DEFAULTS.octave;
            } else {
                preset.scale = { ...SCALE_DEFAULTS, scale: k };
            }
            recomputeMidiNotesFromPresetScale(preset);
            this.markDirty('preset', this.currentPresetName);
        },

        setPresetScaleRoot(root) {
            const preset = this.currentPreset();
            if (!preset?.scale || typeof preset.scale !== 'object') return;
            this.saveHistory();
            preset.scale.root = root;
            recomputeMidiNotesFromPresetScale(preset);
            this.markDirty('preset', this.currentPresetName);
        },

        setPresetScaleOctave(octave) {
            const preset = this.currentPreset();
            if (!preset?.scale || typeof preset.scale !== 'object') return;
            this.saveHistory();
            const n = parseInt(String(octave), 10);
            preset.scale.octave = Number.isNaN(n)
                ? SCALE_DEFAULTS.octave
                : Math.min(SCALE_OCTAVE_MAX, Math.max(SCALE_OCTAVE_MIN, n));
            recomputeMidiNotesFromPresetScale(preset);
            this.markDirty('preset', this.currentPresetName);
        },
    };
}
