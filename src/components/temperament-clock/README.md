# Temperament Clock

A working clock whose hours are the circle of fifths - and an audible, visible
demonstration of why that circle only closes because we tempered it shut.

**Live:** [full screen](https://solnicol.com/experiments/temperament-clock/) ·
embedded in the [project notes](https://solnicol.com/projects/temperament-clock/)

This folder is the canonical source. The clock renders as a React island inside
the [solnicol.com](https://solnicol.com) Astro site - there is no separate app to
keep in sync.

## The idea

A 12-hour clock face and the circle of fifths share exactly one property: twelve
positions arranged in a circle. This overlays one on the other - 12 o'clock is C,
1 o'clock is G, and so on around the dial by fifths. The hour hand always points
at a key; each key shows its signature and relative minor.

That coincidence is the delivery mechanism for something real. Stack twelve
mathematically pure 3:2 fifths and you do **not** return to your starting pitch:

```
(3/2)^12 ÷ 2^7 ≈ 1.01364  →  23.46 cents sharp
```

That gap is the **Pythagorean comma**. Modern equal temperament closes the circle
by flattening every fifth 1.955 cents narrow of pure - each step absorbs its share
of the comma. Every number shown is computed from this arithmetic at runtime, not
quoted.

## What it does

- **Tour the circle** - twelve octave-folded 12-TET pitch classes strike in fifths
  order while a thread traces the lap and closes into a perfect circle.
- **Climb the spiral** - thirteen strikes walk twelve *literal* pure fifths up from
  C2. The thread's radius grows with the accumulated sharpness over equal
  temperament, so the final strike lands at 12 o'clock visibly outside its starting
  point: the comma, drawn to scale and labeled.
- **Hold a fifth** - the audible case for temperament. A sustained pure fifth locks
  (3×C lands exactly on 2×G). The tempered fifth's harmonics miss by 0.89 Hz, heard
  as a slow beat - and shown as a glow on C and G whose OKLCH lightness oscillates
  at exactly that computed period.
- **Hear the problem** - a guided first listen moves from pure fifth, to tempered
  beat, to the pure-fifths spiral that misses home. Tap any note to hear it; notes
  are keyboard-accessible (Tab + Enter).

## What this taught me

The artefact is not just a demo of a phenomenon - it is the residue of having to
understand a handful of primitives well enough to make them operate. Recording them
here is the point: an object you can interrogate beats an object you can only admire.

**The primitives underneath this project**

1. **Cyclic order** - the clock face and the circle of fifths are both 12-position
   rings; the whole piece is one ring wearing the other's clothes.
2. **Modular arithmetic** - the note labels advance by fifths but fold back into a
   single octave (arithmetic mod 12). The dial is a quotient, not a ladder.
3. **Frequency ratio** - a pure fifth is the ratio 3:2. Consonance is arithmetic.
4. **Equal temperament** - a semitone is multiplication by 2^(1/12), so a tempered
   fifth is 2^(7/12) - deliberately *not* 3:2.
5. **The Pythagorean comma** - twelve pure fifths do not equal seven octaves:
   (3/2)^12 / 2^7 ≈ 1.01364, about 23.46 cents. The defect is not a rounding error;
   it is structural.
6. **Perceptual proof** - the pure fifth locks and the tempered fifth beats, so the
   maths is not asserted but *heard*. The beat frequency is the arithmetic made
   audible.

**Learning residue**

- **Primitive learned:** twelve 3:2 fifths overshoot seven octaves because
  multiplicative pitch ratios do not align with the additive-looking symmetry of a
  12-part circle. Multiplying by 3/2 twelve times and multiplying by 2 seven times
  are simply different numbers.
- **Mistake corrected:** the circle of fifths is a pitch-*class* map, not a literal
  always-ascending frequency ladder. Its neat closure is a property of the labels
  (mod the octave), which is exactly why the honest, un-folded spiral fails to close.
- **Test I should now pass:** explain why equal temperament closes the circle by
  making every fifth slightly narrow - and what it sacrifices to do so.

**Check yourself**

1. Why does the circle close *visually* but not *acoustically*?
2. Why does D follow G in the pitch-class circle even though the raw frequency may be
   octave-folded back down?
3. Why does equal temperament require every fifth to be slightly narrow rather than,
   say, absorbing the whole comma into one fifth?

## Notes on the build

- **A React island in an Astro site**, no other runtime dependencies. The same
  component renders two ways from one `embedded` prop: a dark "workshop" theme on the
  full-screen route, and a "blueprint" theme that inherits the site's ink and ground
  tokens (transparent background, so the page's drafting grid shows through) when
  embedded in the project notes.
- **All sound is synthesized** with the Web Audio API - sine partials through a
  shared limiter, with exact integer harmonics in the fifth lab so the beat is
  physically real rather than an effect.
- **Cheap by default.** The second hand sweeps via a CSS animation synced once at
  mount; the render clock ticks at 4 Hz, and per-frame rendering runs only while a
  tour thread is on screen. Idle CPU is near zero.
- **OKLCH palette, meaningful motion only** - the beat glow oscillates at the beat
  frequency and the hour marker breathes slowly; `prefers-reduced-motion` disables
  both and falls back to a discrete second hand.
- **Honest visualization.** The spiral maps radius to *deviation from equal
  temperament* (1.6 px per cent), not absolute pitch - a true log-frequency spiral
  would make the comma an invisible 0.3% of the total rise.

## Files

- `TemperamentClock.jsx` - the component: state, the SVG dial, the controls, and the
  two-theme table.
- `audioEngine.js` - Web Audio synthesis: strikes, sustained fifths, the shared
  limiter.
- `musicMath.js` - the arithmetic: equal-tempered frequencies, the Pythagorean comma,
  cents, and the caption strings computed from them.

## Running locally

It lives inside the site, so run the site - from the repo root:

```sh
npm install
npm run dev   # then open /projects/temperament-clock/ or /experiments/temperament-clock/
```

---

*Twelve pure fifths ≠ seven octaves. Everything else follows.*
