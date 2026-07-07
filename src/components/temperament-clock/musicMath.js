const A4 = 440;

export const etFreqOf = (semitonesFromA4) => A4 * Math.pow(2, semitonesFromA4 / 12);

// Labels are pitch classes ordered by fifths, modulo the octave.
export const NOTES = [
  { label: "C", sub: null, rel: "Am", semitoneFromA4: -9, sig: "no sharps or flats", hour: 12 },
  { label: "G", sub: null, rel: "Em", semitoneFromA4: -2, sig: "1 sharp", hour: 1 },
  { label: "D", sub: null, rel: "Bm", semitoneFromA4: -7, sig: "2 sharps", hour: 2 },
  { label: "A", sub: null, rel: "F♯m", semitoneFromA4: 0, sig: "3 sharps", hour: 3 },
  { label: "E", sub: null, rel: "C♯m", semitoneFromA4: -5, sig: "4 sharps", hour: 4 },
  { label: "B", sub: null, rel: "G♯m", semitoneFromA4: 2, sig: "5 sharps", hour: 5 },
  { label: "F♯", sub: "G♭", rel: "D♯m", semitoneFromA4: -3, sig: "6 sharps / 6 flats", hour: 6 },
  { label: "D♭", sub: "C♯", rel: "B♭m", semitoneFromA4: -8, sig: "5 flats", hour: 7 },
  { label: "A♭", sub: null, rel: "Fm", semitoneFromA4: -1, sig: "4 flats", hour: 8 },
  { label: "E♭", sub: null, rel: "Cm", semitoneFromA4: -6, sig: "3 flats", hour: 9 },
  { label: "B♭", sub: null, rel: "Gm", semitoneFromA4: 1, sig: "2 flats", hour: 10 },
  { label: "F", sub: null, rel: "Dm", semitoneFromA4: -4, sig: "1 flat", hour: 11 },
].map((note) => ({ ...note, etFreq: etFreqOf(note.semitoneFromA4) }));

// Spiral tour: literal ascending pure fifths from C2.
export const C2 = 65.406;
export const spiralFreqOf = (fifthSteps) => C2 * Math.pow(3 / 2, fifthSteps);

export const centsOf = (ratio) => 1200 * Math.log2(ratio);
export const PYTHAGOREAN_COMMA_RATIO = Math.pow(3 / 2, 12) / Math.pow(2, 7);
export const PYTHAGOREAN_COMMA_CENTS = centsOf(PYTHAGOREAN_COMMA_RATIO);
export const ET_FIFTH_FLATTENING_CENTS = centsOf(3 / 2) - 700;

export const C4_FREQ = etFreqOf(-9);
export const G4_ET = etFreqOf(-2);
export const BEAT_HZ = Math.abs(3 * C4_FREQ - 2 * G4_ET);
export const BEAT_PERIOD_S = 1 / BEAT_HZ;

export const CAPTIONS = {
  invite: "Twelve pure 3:2 fifths overshoot seven octaves.\nThe gap is the Pythagorean comma.",
  idle: "Tap any note to hear its 12-TET pitch · the breathing dot marks the hour",
  // Terse copy for the guided sequence; the longer captions below remain for
  // manual use and take over once the sequence hands off to the spiral tour.
  guidedPure: "Pure fifth: the harmonics lock.",
  guidedTempered: "Tempered fifth: the harmonics beat.",
  guidedSpiral: "Twelve pure fifths miss home by the comma.",
  circle: `Twelve fifths, each tempered ${ET_FIFTH_FLATTENING_CENTS.toFixed(2)}¢ narrow of pure 3:2 — the thread closes because every step absorbs its share of the comma.`,
  spiral: `Twelve pure 3:2 fifths rising from C2 overshoot seven octaves by ${PYTHAGOREAN_COMMA_CENTS.toFixed(2)}¢ — the thread misses its start by the Pythagorean comma.`,
  pure: "Pure fifth · 3:2 — the third harmonic of C lands exactly on the second harmonic of G. The sound locks.",
  tempered: `Tempered fifth · 2^(7/12) — those harmonics miss by ${BEAT_HZ.toFixed(2)} Hz. The slow beat you hear (and see) is the price of a circle that closes.`,
};
