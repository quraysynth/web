/**
 * MIDI events on the current gesture + CRUD.
 */

function storeMidiMethods() {
    return {
        midiEventAt(index) {
            const g = this.currentGesture();
            if (!g?.midi || index < 0 || index >= g.midi.length) return null;
            return g.midi[index];
        },

        ensureMidiCCDefaults(ev) {
            if (ev.bottom === undefined) ev.bottom = 0;
            if (ev.top === undefined) ev.top = 127;
            if (ev.singleValue === undefined) ev.singleValue = false;
        },

        setMidiEventKind(index, type) {
            const g = this.currentGesture();
            if (!g?.midi?.[index]) return;
            this.saveHistory();
            const ev = g.midi[index];
            const channel = ev.channel || 1;
            if (type === 'note') {
                g.midi[index] = { channel, note: 60, octave: 4, scaleDegree: null };
            } else {
                g.midi[index] = {
                    channel,
                    cc: 0,
                    axis: 'y',
                    bottom: 0,
                    top: 127,
                    singleValue: false,
                };
            }
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiEventChannel(index, rawChannel) {
            const ev = this.midiEventAt(index);
            if (!ev) return;
            this.saveHistory();
            const ch = parseInt(String(rawChannel), 10);
            ev.channel = Number.isNaN(ch) ? 1 : ch;
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiEventNoteDegree(index, degreeIndex, rawOctave) {
            const ev = this.midiEventAt(index);
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
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiEventNoteChromatic(index, pitchClass, rawOctave) {
            const ev = this.midiEventAt(index);
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
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiEventNoteOctave(index, rawOctave) {
            const ev = this.midiEventAt(index);
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
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiEventCc(index, rawCc) {
            const ev = this.midiEventAt(index);
            if (!ev || ev.cc === undefined) return;
            this.saveHistory();
            let cc = parseInt(String(rawCc), 10);
            if (Number.isNaN(cc)) cc = 0;
            ev.cc = Math.max(0, Math.min(127, cc));
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiEventAxis(index, axis) {
            const ev = this.midiEventAt(index);
            if (!ev || ev.cc === undefined) return;
            this.saveHistory();
            ev.axis = axis;
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiCCSlider(index, property, rawValue) {
            const ev = this.midiEventAt(index);
            if (!ev || ev.cc === undefined) return;
            this.saveHistory();
            this.ensureMidiCCDefaults(ev);
            const v = Number(rawValue);
            if (Number.isNaN(v)) return;
            ev[property] = v;
            if (ev.singleValue) {
                ev.bottom = v;
                ev.top = v;
            }
            this.markDirty('preset', this.currentPresetName);
        },

        setMidiSingleValue(index, enabled) {
            const ev = this.midiEventAt(index);
            if (!ev || ev.cc === undefined) return;
            this.saveHistory();
            this.ensureMidiCCDefaults(ev);
            ev.singleValue = !!enabled;
            if (enabled) {
                const current =
                    ev.bottom !== undefined ? ev.bottom : ev.top !== undefined ? ev.top : 64;
                ev.bottom = current;
                ev.top = current;
            }
            this.markDirty('preset', this.currentPresetName);
        },

        addMidiEvent() {
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
            gesture.midi.push({ channel: 1, note: 60, octave: 4, scaleDegree: null });
            this.markDirty('preset', this.currentPresetName);
        },

        deleteMidiEvent(index) {
            const gesture = this.currentGesture();
            if (!gesture || !gesture.midi || index < 0 || index >= gesture.midi.length) return;
            this.saveHistory();
            gesture.midi.splice(index, 1);
            this.markDirty('preset', this.currentPresetName);
        },
    };
}
