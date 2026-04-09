function midiEventsView() {
    return {
        midiNoteNames: MIDI_NOTE_NAMES,
        midiOctaveMin: MIDI_NOTE_OCTAVE_MIN,
        midiOctaveMax: MIDI_NOTE_OCTAVE_MAX,

        channels16: Array.from({ length: 16 }, (_, i) => i + 1),

        get midiEditingEnabled() {
            const s = Alpine.store('app');
            if ((s.selectedGestureIndices || []).length !== 1) return false;
            return !!s.currentGesture();
        },

        get midiEvents() {
            const g = Alpine.store('app').currentGesture();
            if (!g) return [];
            if (!g.midi) g.midi = [];
            return g.midi;
        },

        midiEmptyHint() {
            const s = Alpine.store('app');
            if (!s.currentPresetName || !s.presetsData[s.currentPresetName]) return 'No preset selected';
            const p = s.presetsData[s.currentPresetName];
            if (!p.gestures?.length) return 'No gesture selected';
            const sel = s.selectedGestureIndices || [];
            if (sel.length === 0) return 'No gesture selected';
            if (sel.length > 1) return 'Select exactly one gesture to edit MIDI';
            if (!s.currentGesture()) return 'No gesture selected';
            if (!this.midiEvents.length) return 'No MIDI events. Click + to add.';
            return '';
        },

        get scaleDegreeOptions() {
            const s = Alpine.store('app');
            const name = s.currentPresetName;
            if (!name || !s.presetsData[name]) return [];
            return midiScaleDegreeOptionsFromPresetScale(s.presetsData[name].scale);
        },

        typeSelectValue(event) {
            return event.note !== undefined ? 'note' : 'cc';
        },

        /** Октава для поля ввода: из события или из note. */
        eventOctaveDisplay(event) {
            if (event.octave !== undefined && event.octave !== null) {
                const o = parseInt(String(event.octave), 10);
                if (!Number.isNaN(o)) return o;
            }
            return midiOctaveFromNumber(event.note);
        },

        noteSelectValue(event) {
            if (event.scaleDegree != null && event.scaleDegree !== '') {
                const deg = parseInt(String(event.scaleDegree), 10);
                const opts = this.scaleDegreeOptions;
                if (!Number.isNaN(deg) && opts[deg] !== undefined) return `deg:${deg}`;
            }
            return `pc:${midiPitchClassFromNote(event.note)}`;
        },

        addMidiEvent() {
            Alpine.store('app').addMidiEvent();
        },

        deleteMidiEvent(index) {
            Alpine.store('app').deleteMidiEvent(index);
        },

        onTypeChange(index, type) {
            Alpine.store('app').setMidiEventKind(index, type);
        },

        onChannelChange(index, event) {
            Alpine.store('app').setMidiEventChannel(index, event.target.value);
        },

        onNoteNameChange(index, raw) {
            const ev = Alpine.store('app').midiEventAt(index);
            if (!ev || ev.note === undefined) return;
            const oct =
                ev.octave !== undefined && ev.octave !== null
                    ? parseInt(String(ev.octave), 10)
                    : midiOctaveFromNumber(ev.note);
            const o = Number.isNaN(oct) ? midiOctaveFromNumber(ev.note) : oct;
            const s = String(raw);
            if (s.startsWith('deg:')) {
                Alpine.store('app').setMidiEventNoteDegree(index, parseInt(s.slice(4), 10), o);
            } else if (s.startsWith('pc:')) {
                Alpine.store('app').setMidiEventNoteChromatic(index, parseInt(s.slice(3), 10), o);
            } else {
                Alpine.store('app').setMidiEventNoteChromatic(index, parseInt(s, 10), o);
            }
        },

        onNoteOctaveChange(index, raw) {
            Alpine.store('app').setMidiEventNoteOctave(index, raw);
        },

        onCcNumberChange(index, raw) {
            Alpine.store('app').setMidiEventCc(index, raw);
        },

        onAxisChange(index, value) {
            Alpine.store('app').setMidiEventAxis(index, value);
        },

        onCcSlider(index, property, value) {
            Alpine.store('app').setMidiCCSlider(index, property, value);
        },

        onSingleValueChange(index, enabled) {
            Alpine.store('app').setMidiSingleValue(index, enabled);
        },
    };
}
