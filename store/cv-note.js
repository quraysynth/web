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
            const prevCh = parseInt(String(ev.cvChannel), 10);
            const ch = parseInt(String(rawChannel), 10);
            const nextCh = Number.isNaN(ch) ? 1 : ch;
            if (!Number.isNaN(prevCh) && prevCh !== nextCh) {
                removeCvNoteSyncedLegacyOnChannel(this.currentGesture(), ev, prevCh);
            }
            ev.cvChannel = nextCh;
            syncLegacyCvFromCvNotesForGesture(this.currentGesture());
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
            if (!ev || ev.note === undefined) return;
            this.saveHistory();
            const preset = this.currentPreset();
            const scale = preset?.scale;
            let oct = parseInt(String(rawOctave), 10);
            if (Number.isNaN(oct)) oct = midiOctaveFromNumber(ev.note);
            oct = Math.max(MIDI_NOTE_OCTAVE_MIN, Math.min(MIDI_NOTE_OCTAVE_MAX, oct));
            ev.octave = oct;
            const deg = parseInt(String(degreeIndex), 10);
            if (Number.isNaN(deg)) {
                ev.scaleDegree = null;
                const pc = midiPitchClassFromNote(ev.note);
                ev.note = midiNumberFromIndexAndOctave(pc, oct);
                syncLegacyCvFromCvNotesForGesture(this.currentGesture());
                this.markDirty('preset', this.currentPresetName);
                return;
            }
            ev.scaleDegree = deg;
            if (scale && typeof scale === 'object') {
                const n = midiNoteFromPresetScaleDegree(scale, deg, oct);
                if (n != null) ev.note = n;
            } else {
                ev.scaleDegree = null;
                const pc = midiPitchClassFromNote(ev.note);
                ev.note = midiNumberFromIndexAndOctave(pc, oct);
            }
            syncLegacyCvFromCvNotesForGesture(this.currentGesture());
            this.markDirty('preset', this.currentPresetName);
        },

        setCvNoteEventNoteChromatic(index, pitchClass, rawOctave) {
            const ev = this.cvNoteEventAt(index);
            if (!ev || ev.note === undefined) return;
            this.saveHistory();
            ev.scaleDegree = null;
            let oct = parseInt(String(rawOctave), 10);
            if (Number.isNaN(oct)) oct = midiOctaveFromNumber(ev.note);
            oct = Math.max(MIDI_NOTE_OCTAVE_MIN, Math.min(MIDI_NOTE_OCTAVE_MAX, oct));
            ev.octave = oct;
            let pc = parseInt(String(pitchClass), 10);
            if (Number.isNaN(pc)) pc = midiPitchClassFromNote(ev.note);
            pc = ((pc % 12) + 12) % 12;
            ev.note = midiNumberFromIndexAndOctave(pc, oct);
            syncLegacyCvFromCvNotesForGesture(this.currentGesture());
            this.markDirty('preset', this.currentPresetName);
        },

        setCvNoteEventNoteOctave(index, rawOctave) {
            const ev = this.cvNoteEventAt(index);
            if (!ev || ev.note === undefined) return;
            this.saveHistory();
            let oct = parseInt(String(rawOctave), 10);
            if (Number.isNaN(oct)) oct = midiOctaveFromNumber(ev.note);
            oct = Math.max(MIDI_NOTE_OCTAVE_MIN, Math.min(MIDI_NOTE_OCTAVE_MAX, oct));
            ev.octave = oct;
            const preset = this.currentPreset();
            const scale = preset?.scale;
            if (ev.scaleDegree != null && ev.scaleDegree !== '' && scale && typeof scale === 'object') {
                const deg = parseInt(String(ev.scaleDegree), 10);
                if (!Number.isNaN(deg)) {
                    const n = midiNoteFromPresetScaleDegree(scale, deg, oct);
                    if (n != null) ev.note = n;
                }
            } else {
                const pc = midiPitchClassFromNote(ev.note);
                ev.note = midiNumberFromIndexAndOctave(pc, oct);
            }
            syncLegacyCvFromCvNotesForGesture(this.currentGesture());
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
                scaleDegree: null,
                ...(initial && typeof initial === 'object' ? initial : {}),
            };
            gesture.cv_note.push(ev);
            syncLegacyCvFromCvNotesForGesture(gesture);
            this.markDirty('preset', this.currentPresetName);
        },

        deleteCvNoteEvent(index) {
            const gesture = this.currentGesture();
            if (!gesture || !gesture.cv_note || index < 0 || index >= gesture.cv_note.length) return;
            this.saveHistory();
            gesture.cv_note.splice(index, 1);
            syncLegacyCvFromCvNotesForGesture(gesture);
            this.markDirty('preset', this.currentPresetName);
        },
    };
}
