/**
 * Split gesture modal state/actions.
 */
function storeSplitGestureMethods() {
    function clampMidiNote(n) {
        const v = parseInt(String(n), 10);
        if (Number.isNaN(v)) return 60;
        return Math.max(0, Math.min(127, v));
    }

    function clampMidiOctave(oct) {
        const v = parseInt(String(oct), 10);
        if (Number.isNaN(v)) return 0;
        return Math.max(MIDI_NOTE_OCTAVE_MIN, Math.min(MIDI_NOTE_OCTAVE_MAX, v));
    }

    function positiveMod(value, mod) {
        return ((value % mod) + mod) % mod;
    }

    function buildOffsets(count, order) {
        if (count <= 0) return [];
        if (order === 'random') {
            const rest = Array.from({ length: count - 1 }, (_, i) => i + 1).map((n) =>
                Math.random() < 0.5 ? -n : n
            );
            for (let i = rest.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = rest[i];
                rest[i] = rest[j];
                rest[j] = t;
            }
            return [0, ...rest];
        }
        const step = order === 'jump2' ? 2 : order === 'jump3' ? 3 : 1;
        return Array.from({ length: count }, (_, i) => i * step);
    }

    function findSourceNoteEvent(gesture) {
        if (!gesture || !Array.isArray(gesture.midi)) return null;
        for (const ev of gesture.midi) {
            if (ev && ev.note !== undefined && ev.cc === undefined) return ev;
        }
        return null;
    }

    function findScaleDegreeFromNote(scale, midiNote) {
        if (!scale || typeof scale !== 'object' || Array.isArray(scale)) return null;
        const mode = scale.kind ?? scale.scale;
        const intervals = SCALE_KIND_INTERVALS[mode];
        if (!intervals || !intervals.length) return null;
        const rootIdx = MIDI_NOTE_NAMES.indexOf(scale.root);
        if (rootIdx === -1) return null;
        const pc = positiveMod(midiNote, 12);
        for (let i = 0; i < intervals.length; i += 1) {
            if (positiveMod(rootIdx + intervals[i], 12) === pc) return i;
        }
        return null;
    }

    return {
        showSplit(gesture) {
            this.splitSourceGesture = gesture || null;
            this.splitModalVisible = true;
        },

        closeSplit() {
            this.splitModalVisible = false;
            this.splitSourceGesture = null;
        },

        split(params) {
            const preset = this.currentPreset();
            if (!preset) {
                this.showStatus('No preset selected', 'error');
                this.closeSplit();
                return;
            }
            if (!Array.isArray(preset.gestures)) preset.gestures = [];

            const sourceGesture = this.splitSourceGesture;
            let sourceIndex = sourceGesture ? preset.gestures.indexOf(sourceGesture) : -1;
            if (sourceIndex < 0) {
                const sel = this.selectedGestureIndices;
                if (sel && sel.length > 0) sourceIndex = sel[0];
            }
            let gesture = null;
            let replaceSourceGesture = false;
            if (sourceIndex >= 0 && sourceIndex < preset.gestures.length) {
                gesture = preset.gestures[sourceIndex];
                replaceSourceGesture = true;
            } else {
                // No selected source gesture: split across full gesture space.
                gesture = {
                    position: [true, 0, 0, 1, 1],
                    midi: [],
                    cv: [],
                };
                sourceIndex = preset.gestures.length;
            }
            if (!Array.isArray(gesture.position) || gesture.position.length < 5) {
                this.showStatus('Source gesture has no valid position', 'error');
                this.closeSplit();
                return;
            }

            const sx = parseInt(String(params?.x), 10);
            const sy = parseInt(String(params?.y), 10);
            void params?.order;
            const cols = Math.max(1, Math.min(8, Number.isNaN(sx) ? 1 : sx + 1));
            const rows = Math.max(1, Math.min(8, Number.isNaN(sy) ? 1 : sy + 1));

            const [active, xMin, yMin, xMax, yMax] = gesture.position;
            const width = xMax - xMin;
            const height = yMax - yMin;
            if (width <= 0 || height <= 0) {
                this.showStatus('Source gesture bounds are invalid', 'error');
                this.closeSplit();
                return;
            }

            this.saveHistory();

            const newGestures = [];
            const sourceNoteEvent = findSourceNoteEvent(gesture);
            const baseChannel =
                sourceNoteEvent && !Number.isNaN(parseInt(String(sourceNoteEvent.channel), 10))
                    ? parseInt(String(sourceNoteEvent.channel), 10)
                    : 1;
            const baseNote = sourceNoteEvent ? clampMidiNote(sourceNoteEvent.note) : null;
            const baseOctave = sourceNoteEvent
                ? clampMidiOctave(
                      sourceNoteEvent.octave !== undefined
                          ? sourceNoteEvent.octave
                          : midiOctaveFromNumber(baseNote)
                  )
                : 0;
            let baseDegree =
                sourceNoteEvent && sourceNoteEvent.scaleDegree != null && sourceNoteEvent.scaleDegree !== ''
                    ? parseInt(String(sourceNoteEvent.scaleDegree), 10)
                    : null;
            if (Number.isNaN(baseDegree)) baseDegree = null;
            if (baseDegree == null && sourceNoteEvent && baseNote != null) {
                baseDegree = findScaleDegreeFromNote(preset.scale, baseNote);
            }
            if (!sourceNoteEvent) baseDegree = 0;

            const offsets = buildOffsets(cols * rows, params?.order);
            let noteSeqIndex = 0;
            for (let row = 0; row < rows; row += 1) {
                for (let col = 0; col < cols; col += 1) {
                    const gxMin = xMin + (width * col) / cols;
                    const gxMax = xMin + (width * (col + 1)) / cols;
                    const gyMin = yMin + (height * row) / rows;
                    const gyMax = yMin + (height * (row + 1)) / rows;

                    const copy = JSON.parse(JSON.stringify(gesture));
                    copy.position = [active, gxMin, gyMin, gxMax, gyMax];
                    if (!Array.isArray(copy.midi)) copy.midi = [];
                    let noteEvent = findSourceNoteEvent(copy);
                    if (!noteEvent) {
                        noteEvent = { channel: baseChannel, note: 60, octave: 0, scaleDegree: null };
                        copy.midi.unshift(noteEvent);
                    }

                    const offset = offsets[noteSeqIndex] || 0;
                    noteSeqIndex += 1;
                    noteEvent.channel = baseChannel;

                    if (baseDegree != null && preset.scale) {
                        const mode = preset.scale.kind ?? preset.scale.scale;
                        const degCount = SCALE_KIND_INTERVALS[mode]?.length || 0;
                        if (degCount > 0) {
                            const totalDeg = baseDegree + offset;
                            const degree = positiveMod(totalDeg, degCount);
                            const octaveShift = Math.floor(totalDeg / degCount);
                            const octave = clampMidiOctave(baseOctave + octaveShift);
                            const midi = midiNoteFromPresetScaleDegree(preset.scale, degree, octave);
                            noteEvent.scaleDegree = degree;
                            noteEvent.octave = octave;
                            noteEvent.note = midi == null ? clampMidiNote(baseNote ?? 60) : midi;
                        } else {
                            const midi = clampMidiNote((baseNote ?? 60) + offset);
                            noteEvent.scaleDegree = null;
                            noteEvent.octave = midiOctaveFromNumber(midi);
                            noteEvent.note = midi;
                        }
                    } else {
                        const startNote =
                            baseNote != null
                                ? baseNote
                                : midiNoteFromPresetScaleDegree(preset.scale, 0, 0) ?? 60;
                        const midi = clampMidiNote(startNote + offset);
                        noteEvent.scaleDegree = sourceNoteEvent ? noteEvent.scaleDegree ?? null : 0;
                        noteEvent.octave = sourceNoteEvent ? midiOctaveFromNumber(midi) : 0;
                        noteEvent.note = midi;
                    }
                    newGestures.push(copy);
                }
            }

            if (replaceSourceGesture) {
                preset.gestures.splice(sourceIndex, 1, ...newGestures);
            } else {
                preset.gestures.push(...newGestures);
            }
            this.selectedGestureIndices = [sourceIndex];
            this.markDirty('preset', this.currentPresetName);
            this.showStatus(`Gesture split into ${cols}x${rows} grid`, 'success');
            this.closeSplit();
        },
    };
}
