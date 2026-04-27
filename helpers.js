/**
 * Pure helpers (no Alpine store).
 */

const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiNoteToName(noteNumber) {
    const octave = Math.floor(noteNumber / 12) - 1;
    const noteName = MIDI_NOTE_NAMES[noteNumber % 12];
    return `${noteName}${octave}`;
}

function noteNameToMidi(noteName) {
    const match = String(noteName).trim().match(/^([A-G]#?)(-?\d+)$/);
    if (!match) return 60;
    const [, note, octave] = match;
    const noteIndex = MIDI_NOTE_NAMES.indexOf(note);
    if (noteIndex === -1) return 60;
    return (parseInt(octave, 10) + 1) * 12 + noteIndex;
}

/** Диапазон октавы в пресете (scale); по умолчанию 0. */
const SCALE_OCTAVE_MIN = -8;
const SCALE_OCTAVE_MAX = 8;

const VALID_SCALE_KINDS = new Set([
    'major',
    'natural_minor',
    'dorian',
    'phrygian',
    'lydian',
    'mixolydian',
    'locrian',
    'major_pentatonic',
    'minor_pentatonic',
    'chromatic',
]);

/** Лад по умолчанию: при загрузке без scale и при создании нового пресета. */
const PRESET_SCALE_DEFAULT_ON_LOAD = {
    scale: 'natural_minor',
    root: 'D',
    octave: 1,
};

/** Пустой пресет (без жестов) с ладом по умолчанию. */
function newEmptyPreset() {
    return {
        gestures: [],
        scale: { ...PRESET_SCALE_DEFAULT_ON_LOAD },
    };
}

/** Семитоны от тоники для каждого лада (совпадает с VALID_SCALE_KINDS). */
const SCALE_KIND_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    natural_minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10],
    major_pentatonic: [0, 2, 4, 7, 9],
    minor_pentatonic: [0, 3, 5, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const CHROMATIC_DEGREE_LABELS = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

const DIATONIC_DEGREE_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const SCALE_KIND_DEGREE_LABELS = {
    major: DIATONIC_DEGREE_LABELS,
    natural_minor: DIATONIC_DEGREE_LABELS,
    dorian: DIATONIC_DEGREE_LABELS,
    phrygian: DIATONIC_DEGREE_LABELS,
    lydian: DIATONIC_DEGREE_LABELS,
    mixolydian: DIATONIC_DEGREE_LABELS,
    locrian: DIATONIC_DEGREE_LABELS,
    major_pentatonic: ['I', 'II', 'III', 'V', 'VI'],
    minor_pentatonic: ['I', '♭III', 'IV', 'V', '♭VII'],
    chromatic: CHROMATIC_DEGREE_LABELS,
};

/** Диапазон октавы для поля «Octave» у MIDI-ноты (полный MIDI 0–127). */
const MIDI_NOTE_OCTAVE_MIN = -1;
const MIDI_NOTE_OCTAVE_MAX = 9;

function midiPitchClassFromNote(noteNumber) {
    return ((noteNumber % 12) + 12) % 12;
}

function midiOctaveFromNumber(noteNumber) {
    return Math.floor(noteNumber / 12) - 1;
}

function midiNumberFromIndexAndOctave(noteIndex, octave) {
    const o = parseInt(String(octave), 10);
    const i = parseInt(String(noteIndex), 10);
    if (Number.isNaN(o) || Number.isNaN(i)) return 60;
    const n = (o + 1) * 12 + i;
    return Math.max(0, Math.min(127, n));
}

/** MIDI-номер по индексу ступени лада пресета (0…n−1) и октаве. */
function midiNoteFromPresetScaleDegree(scale, degreeIndex, octave) {
    if (!scale || typeof scale !== 'object' || Array.isArray(scale)) return null;
    const mode = scale.kind ?? scale.scale;
    if (!mode || !VALID_SCALE_KINDS.has(mode)) return null;
    const intervals = SCALE_KIND_INTERVALS[mode];
    if (!intervals || degreeIndex < 0 || degreeIndex >= intervals.length) return null;
    const rootIdx = MIDI_NOTE_NAMES.indexOf(scale.root);
    if (rootIdx === -1) return null;
    const pc = (rootIdx + intervals[degreeIndex]) % 12;
    return midiNumberFromIndexAndOctave(pc, octave);
}

/**
 * Опции для селектора MIDI-ноты: ступени лада (degreeIndex) и подпись.
 * Пустой массив, если лад не задан или данные неполные.
 */
function midiScaleDegreeOptionsFromPresetScale(scale) {
    if (!scale || typeof scale !== 'object' || Array.isArray(scale)) return [];
    const mode = scale.kind ?? scale.scale;
    if (!mode || !VALID_SCALE_KINDS.has(mode)) return [];
    const intervals = SCALE_KIND_INTERVALS[mode];
    const labels = SCALE_KIND_DEGREE_LABELS[mode];
    if (!intervals || !labels || intervals.length !== labels.length) return [];
    const rootIdx = MIDI_NOTE_NAMES.indexOf(scale.root);
    if (rootIdx === -1) return [];
    return intervals.map((interval, i) => {
        const pc = (rootIdx + interval) % 12;
        const name = MIDI_NOTE_NAMES[pc];
        const deg = labels[i];
        return { degreeIndex: i, pitchClass: pc, label: `${deg} (${name})` };
    });
}

function normalizeMidiNoteEvent(event, preset) {
    if (event.note === undefined || event.cc !== undefined) return;
    let oct = event.octave;
    if (oct === undefined || Number.isNaN(parseInt(String(oct), 10))) {
        oct = midiOctaveFromNumber(event.note);
        event.octave = oct;
    }
    if (event.scaleDegree == null || event.scaleDegree === '') {
        if (event.scaleDegree === '') delete event.scaleDegree;
        return;
    }
    const deg = parseInt(String(event.scaleDegree), 10);
    if (Number.isNaN(deg)) {
        delete event.scaleDegree;
        return;
    }
    const scale = preset?.scale;
    if (!scale || typeof scale !== 'object') {
        delete event.scaleDegree;
        return;
    }
    const mode = scale.kind ?? scale.scale;
    const nDeg = SCALE_KIND_INTERVALS[mode]?.length;
    if (!nDeg || deg < 0 || deg >= nDeg) {
        delete event.scaleDegree;
        return;
    }
    const recomputed = midiNoteFromPresetScaleDegree(scale, deg, event.octave);
    if (recomputed != null) event.note = recomputed;
}

/** После смены root/mode/… у preset.scale — пересчитать note у событий с scaleDegree. */
function recomputeMidiNotesFromPresetScale(preset) {
    if (!preset?.gestures) return;
    for (const gesture of preset.gestures) {
        if (!gesture?.midi?.length) continue;
        for (const ev of gesture.midi) {
            if (ev.note === undefined || ev.cc !== undefined) continue;
            normalizeMidiNoteEvent(ev, preset);
        }
    }
}

/**
 * @param {object} preset
 * @param {{ fillMissingScale?: boolean }} [options] — при загрузке с устройства/импорта: подставить лад, если scale нет.
 */
function normalizePresetData(preset, options) {
    if (!preset) return;
    const fillMissingScale = options && options.fillMissingScale === true;

    if (preset.scale !== undefined && preset.scale !== null) {
        if (typeof preset.scale !== 'object' || Array.isArray(preset.scale)) {
            preset.scale = null;
        }
    }

    if (fillMissingScale && preset.scale == null) {
        preset.scale = { ...PRESET_SCALE_DEFAULT_ON_LOAD };
    }

    if (preset.scale != null && typeof preset.scale === 'object' && !Array.isArray(preset.scale)) {
        const s = preset.scale;
        if (!MIDI_NOTE_NAMES.includes(s.root)) s.root = 'C';
        {
            const o = typeof s.octave === 'number' ? s.octave : parseInt(String(s.octave), 10);
            s.octave = Number.isNaN(o)
                ? 0
                : Math.min(SCALE_OCTAVE_MAX, Math.max(SCALE_OCTAVE_MIN, o));
        }
        if (s.kind && VALID_SCALE_KINDS.has(s.kind) && !VALID_SCALE_KINDS.has(s.scale)) {
            s.scale = s.kind;
        }
        if (!VALID_SCALE_KINDS.has(s.scale)) s.scale = 'major';
    }

    if (!preset.gestures) return;

    const old_max_distance = 700;

    preset.gestures.forEach((gesture) => {
        if (gesture.midi && Array.isArray(gesture.midi)) {
            gesture.midi.forEach((event) => {
                if (event.cc !== undefined) {
                    if (event.bottom === undefined) event.bottom = 0;
                    if (event.top === undefined) event.top = 127;
                    if (event.singleValue === undefined) event.singleValue = false;
                }
                if (event.note !== undefined && event.cc === undefined) {
                    normalizeMidiNoteEvent(event, preset);
                }
            });
        }

        if (!gesture.cv || !Array.isArray(gesture.cv)) {
            gesture.cv = [];
        }
        gesture.cv.forEach((event) => {
            if (event.bottom === undefined) event.bottom = -5.0;
            if (event.top === undefined) event.top = 5.0;
            if (event.singleValue === undefined) event.singleValue = false;
        });

        if (gesture.position && Array.isArray(gesture.position) && gesture.position.length >= 5) {
            const y_min_raw = parseFloat(gesture.position[2]);
            const y_max_raw = parseFloat(gesture.position[4]);
            if (y_min_raw > 1.0 || y_max_raw > 1.0) {
                gesture.position[2] = y_min_raw / old_max_distance;
                gesture.position[4] = y_max_raw / old_max_distance;
            }
        }
    });
}
