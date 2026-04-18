function cvVoltsLabel(internalValue) {
    const v = Number(internalValue);
    if (Number.isNaN(v)) return '0.00';
    return (v * 2).toFixed(2);
}

function eventsView() {
    return {
        midiNoteNames: MIDI_NOTE_NAMES,
        midiOctaveMin: MIDI_NOTE_OCTAVE_MIN,
        midiOctaveMax: MIDI_NOTE_OCTAVE_MAX,

        channels16: Array.from({ length: 16 }, (_, i) => i + 1),
        channels4: [1, 2, 3, 4],

        cvVoltsLabel,

        get eventsEditingEnabled() {
            const s = Alpine.store('app');
            if ((s.selectedGestureIndices || []).length !== 1) return false;
            return !!s.currentGesture();
        },

        get gestureMidi() {
            const g = Alpine.store('app').currentGesture();
            if (!g) return [];
            if (!g.midi) g.midi = [];
            return g.midi;
        },

        get cvEvents() {
            const g = Alpine.store('app').currentGesture();
            if (!g) return [];
            if (!g.cv) g.cv = [];
            return g.cv;
        },

        get gestureCvNotes() {
            const g = Alpine.store('app').currentGesture();
            if (!g) return [];
            if (!g.cv_note) g.cv_note = [];
            return g.cv_note;
        },

        get eventRows() {
            const rows = [];
            const g = Alpine.store('app').currentGesture();
            const cvNoteChannels = new Set();
            if (g?.cv_note?.length) {
                for (const cn of g.cv_note) {
                    const ch = parseInt(String(cn.cvChannel), 10);
                    if (!Number.isNaN(ch)) cvNoteChannels.add(ch);
                }
            }
            for (let i = 0; i < this.gestureMidi.length; i++) {
                rows.push({ kind: 'midi', index: i });
            }
            const cvArr = g?.cv;
            const cvLen = Array.isArray(cvArr) ? cvArr.length : 0;
            for (let i = 0; i < cvLen; i++) {
                const ev = cvArr[i];
                const ch = ev ? parseInt(String(ev.channel), 10) : NaN;
                if (!Number.isNaN(ch) && cvNoteChannels.has(ch)) continue;
                rows.push({ kind: 'cv', index: i });
            }
            for (let i = 0; i < this.gestureCvNotes.length; i++) {
                rows.push({ kind: 'cvNote', index: i });
            }
            return rows;
        },

        rowKey(row) {
            return row.kind === 'cvNote' ? `cvn-${row.index}` : `${row.kind}-${row.index}`;
        },

        midiEventForRow(row) {
            if (row.kind !== 'midi') return null;
            const g = Alpine.store('app').currentGesture();
            return g?.midi?.[row.index] ?? null;
        },

        cvEventForRow(row) {
            if (row.kind !== 'cv') return null;
            return Alpine.store('app').cvEventAt(row.index);
        },

        cvNoteEventForRow(row) {
            if (row.kind !== 'cvNote') return null;
            return Alpine.store('app').cvNoteEventAt(row.index);
        },

        eventsEmptyHint() {
            const s = Alpine.store('app');
            if (!s.currentPresetName || !s.presetsData[s.currentPresetName]) return 'No preset selected';
            const p = s.presetsData[s.currentPresetName];
            if (!p.gestures?.length) return 'No gesture selected';
            const sel = s.selectedGestureIndices || [];
            if (sel.length === 0) return 'No gesture selected';
            if (sel.length > 1) return 'Select exactly one gesture to edit events';
            if (!s.currentGesture()) return 'No gesture selected';
            if (!this.eventRows.length) return 'No events. Click + to add.';
            return '';
        },

        get scaleDegreeOptions() {
            const s = Alpine.store('app');
            const name = s.currentPresetName;
            if (!name || !s.presetsData[name]) return [];
            return midiScaleDegreeOptionsFromPresetScale(s.presetsData[name].scale);
        },

        typeValueForRow(row) {
            if (row.kind === 'cvNote') return 'cvNote';
            if (row.kind === 'cv') return 'cv';
            const ev = this.midiEventForRow(row);
            if (!ev) return 'note';
            return ev.note !== undefined ? 'note' : 'cc';
        },

        eventOctaveDisplay(event) {
            if (event.octave !== undefined && event.octave !== null) {
                const o = parseInt(String(event.octave), 10);
                if (!Number.isNaN(o)) return o;
            }
            return midiOctaveFromNumber(event.note);
        },

        noteSelectValue(event) {
            const raw = event?.scaleDegree;
            const empty =
                raw === undefined ||
                raw === null ||
                String(raw).trim() === '' ||
                String(raw).trim().toLowerCase() === 'null';
            if (empty) {
                return `pc:${midiPitchClassFromNote(event.note)}`;
            }
            const deg = parseInt(String(raw), 10);
            const opts = this.scaleDegreeOptions;
            if (!Number.isNaN(deg) && opts[deg] !== undefined) return `deg:${deg}`;
            return `pc:${midiPitchClassFromNote(event.note)}`;
        },

        addEvent() {
            Alpine.store('app').addMidiEvent();
        },

        deleteEventRow(row) {
            const s = Alpine.store('app');
            if (row.kind === 'midi') s.deleteMidiEvent(row.index);
            else if (row.kind === 'cv') s.deleteCvEvent(row.index);
            else s.deleteCvNoteEvent(row.index);
        },

        handleEventTypeChange(row, newType) {
            if (this.typeValueForRow(row) === newType) return;
            const s = Alpine.store('app');

            if (newType === 'note' || newType === 'cc') {
                if (row.kind === 'midi') {
                    s.setMidiEventKind(row.index, newType);
                    return;
                }
                let cvNoteEv = null;
                if (row.kind === 'cvNote') {
                    cvNoteEv = s.cvNoteEventAt(row.index);
                    s.deleteCvNoteEvent(row.index);
                } else if (row.kind === 'cv') {
                    s.deleteCvEvent(row.index);
                }
                s.addMidiEvent();
                const g = s.currentGesture();
                const ni = g.midi.length - 1;
                s.setMidiEventKind(ni, newType);
                if (newType === 'note' && cvNoteEv) {
                    if (cvNoteEv.scaleDegree != null && cvNoteEv.scaleDegree !== '') {
                        s.setMidiEventNoteDegree(ni, parseInt(String(cvNoteEv.scaleDegree), 10), cvNoteEv.octave);
                    } else {
                        s.setMidiEventNoteChromatic(ni, midiPitchClassFromNote(cvNoteEv.note), cvNoteEv.octave);
                    }
                }
                return;
            }

            if (newType === 'cv') {
                if (row.kind === 'cv') return;
                if (row.kind === 'midi') {
                    s.deleteMidiEvent(row.index);
                } else {
                    s.deleteCvNoteEvent(row.index);
                }
                s.addCvEvent();
                return;
            }

            if (newType === 'cvNote') {
                if (row.kind === 'cvNote') return;
                let noteFields = {};
                if (row.kind === 'midi') {
                    const ev = s.midiEventAt(row.index);
                    if (ev && ev.note !== undefined) {
                        const oct =
                            ev.octave !== undefined && ev.octave !== null
                                ? parseInt(String(ev.octave), 10)
                                : midiOctaveFromNumber(ev.note);
                        noteFields = {
                            note: ev.note,
                            octave: Number.isNaN(oct) ? midiOctaveFromNumber(ev.note) : oct,
                            scaleDegree: ev.scaleDegree != null && ev.scaleDegree !== '' ? ev.scaleDegree : null,
                        };
                    }
                    s.deleteMidiEvent(row.index);
                } else {
                    s.deleteCvEvent(row.index);
                }
                s.addCvNoteEvent(noteFields);
            }
        },

        onCvNoteNameChange(index, raw) {
            const ev = Alpine.store('app').cvNoteEventAt(index);
            if (!ev || ev.note === undefined) return;
            const oct =
                ev.octave !== undefined && ev.octave !== null
                    ? parseInt(String(ev.octave), 10)
                    : midiOctaveFromNumber(ev.note);
            const o = Number.isNaN(oct) ? midiOctaveFromNumber(ev.note) : oct;
            const str = String(raw);
            if (str.startsWith('deg:')) {
                Alpine.store('app').setCvNoteEventNoteDegree(index, parseInt(str.slice(4), 10), o);
            } else if (str.startsWith('pc:')) {
                Alpine.store('app').setCvNoteEventNoteChromatic(index, parseInt(str.slice(3), 10), o);
            } else {
                Alpine.store('app').setCvNoteEventNoteChromatic(index, parseInt(str, 10), o);
            }
        },

        onCvNoteOctaveChange(index, raw) {
            Alpine.store('app').setCvNoteEventNoteOctave(index, raw);
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
            const str = String(raw);
            if (str.startsWith('deg:')) {
                Alpine.store('app').setMidiEventNoteDegree(index, parseInt(str.slice(4), 10), o);
            } else if (str.startsWith('pc:')) {
                Alpine.store('app').setMidiEventNoteChromatic(index, parseInt(str.slice(3), 10), o);
            } else {
                Alpine.store('app').setMidiEventNoteChromatic(index, parseInt(str, 10), o);
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

        onCvChannelChange(index, event) {
            Alpine.store('app').setCvEventChannel(index, event.target.value);
        },

        onCvAxisChange(index, value) {
            Alpine.store('app').setCvEventAxis(index, value);
        },

        onCvSlider(index, property, rawValue) {
            Alpine.store('app').setCvSlider(index, property, rawValue);
        },

        onCvSingleValueChange(index, enabled) {
            Alpine.store('app').setCvSingleValue(index, enabled);
        },

        onCvNoteCvChange(index, raw) {
            Alpine.store('app').setCvNoteEventCvChannel(index, raw);
        },

        onCvNoteGateChange(index, raw) {
            Alpine.store('app').setCvNoteEventGateChannel(index, raw);
        },
    };
}
