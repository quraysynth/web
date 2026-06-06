/**
 * CV note events on the current gesture (note + CV/Gate outputs), stored in gesture.cv_note[].
 */

function storeCvNoteMethods() {
    return {
        cvNoteEventAt(index) {
            const g = this.currentGesture();
            if (!g?.cv_note || index < 0 || index >= g.cv_note.length) return null;
            return g.cv_note[index];
        },

        setCvNoteEventCvChannel(index, rawChannel) {
            const ev = this.cvNoteEventAt(index);
            if (!ev) return;
            this.saveHistory();
            const ch = parseInt(String(rawChannel), 10);
            ev.cvChannel = Number.isNaN(ch) ? 1 : ch;
            this.markDirty('preset', this.currentPresetName);
        },

        setCvNoteEventGateChannel(index, rawChannel) {
            const ev = this.cvNoteEventAt(index);
            if (!ev) return;
            this.saveHistory();
            const ch = parseInt(String(rawChannel), 10);
            ev.gateChannel = Number.isNaN(ch) ? 1 : ch;
            this.markDirty('preset', this.currentPresetName);
        },

        setCvNoteEventNoteDegree(index, degreeIndex, rawOctave) {
            const ev = this.cvNoteEventAt(index);
            if (!ev || !isMidiNoteBinding(ev)) return;
            this.saveHistory();
            const preset = this.currentPreset();
            let oct = parseInt(String(rawOctave), 10);
            if (Number.isNaN(oct)) {
                oct =
                    ev.octave !== undefined && !Number.isNaN(parseInt(String(ev.octave), 10))
                        ? parseInt(String(ev.octave), 10)
                        : 4;
            }
            oct = Math.max(MIDI_NOTE_OCTAVE_MIN, Math.min(MIDI_NOTE_OCTAVE_MAX, oct));
            ev.octave = oct;
            const deg = parseInt(String(degreeIndex), 10);
            if (Number.isNaN(deg) || !scaleDegreeIsValid(deg, preset)) {
                delete ev.scaleDegree;
                const prev = effectiveMidiNoteNumber(ev, preset);
                const pc = prev != null ? midiPitchClassFromNote(prev) : 0;
                ev.note = midiNumberFromIndexAndOctave(pc, oct);
            } else {
                ev.scaleDegree = deg;
                delete ev.note;
            }
            this.markDirty('preset', this.currentPresetName);
        },

        setCvNoteEventNoteChromatic(index, pitchClass, rawOctave) {
            const ev = this.cvNoteEventAt(index);
            if (!ev || !isMidiNoteBinding(ev)) return;
            this.saveHistory();
            const preset = this.currentPreset();
            delete ev.scaleDegree;
            let oct = parseInt(String(rawOctave), 10);
            if (Number.isNaN(oct)) {
                const prev = effectiveMidiNoteNumber(ev, preset);
                oct = prev != null ? midiOctaveFromNumber(prev) : 4;
            }
            oct = Math.max(MIDI_NOTE_OCTAVE_MIN, Math.min(MIDI_NOTE_OCTAVE_MAX, oct));
            ev.octave = oct;
            let pc = parseInt(String(pitchClass), 10);
            if (Number.isNaN(pc)) pc = 0;
            pc = ((pc % 12) + 12) % 12;
            ev.note = midiNumberFromIndexAndOctave(pc, oct);
            this.markDirty('preset', this.currentPresetName);
        },

        setCvNoteEventNoteOctave(index, rawOctave) {
            const ev = this.cvNoteEventAt(index);
            if (!ev || !isMidiNoteBinding(ev)) return;
            this.saveHistory();
            const preset = this.currentPreset();
            let oct = parseInt(String(rawOctave), 10);
            if (Number.isNaN(oct)) {
                const prev = effectiveMidiNoteNumber(ev, preset);
                oct = prev != null ? midiOctaveFromNumber(prev) : 4;
            }
            oct = Math.max(MIDI_NOTE_OCTAVE_MIN, Math.min(MIDI_NOTE_OCTAVE_MAX, oct));
            ev.octave = oct;
            if (!midiEventHasScaleDegree(ev)) {
                const prev = effectiveMidiNoteNumber(ev, preset);
                const pc = prev != null ? midiPitchClassFromNote(prev) : 0;
                ev.note = midiNumberFromIndexAndOctave(pc, oct);
            }
            this.markDirty('preset', this.currentPresetName);
        },

        /**
         * @param {object} [initial] — optional fields merged onto defaults (note, octave, scaleDegree, cvChannel, gateChannel).
         */
        addCvNoteEvent(initial) {
            const preset = this.currentPreset();
            if (!preset || !preset.gestures || preset.gestures.length === 0) {
                return;
            }
            if (!this.selectedGestureIndices || this.selectedGestureIndices.length !== 1) {
                return;
            }
            this.saveHistory();
            const gesture = this.currentGesture();
            if (!gesture) return;
            this.ensureGestureMidiCv(gesture);
            const ev = {
                cvChannel: 1,
                gateChannel: 1,
                note: 60,
                octave: 4,
                ...(initial && typeof initial === 'object' ? initial : {}),
            };
            if (midiEventHasScaleDegree(ev)) {
                delete ev.note;
            } else {
                delete ev.scaleDegree;
            }
            gesture.cv_note.push(ev);
            this.markDirty('preset', this.currentPresetName);
        },

        deleteCvNoteEvent(index) {
            const gesture = this.currentGesture();
            if (!gesture || !gesture.cv_note || index < 0 || index >= gesture.cv_note.length) return;
            this.saveHistory();
            gesture.cv_note.splice(index, 1);
            this.markDirty('preset', this.currentPresetName);
        },
    };
}
