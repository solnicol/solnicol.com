# Flat White

A small interactive model of structure between order and uniformity. A milk
heart on textured crema folds into filaments and eddies, then diffuses into a
uniform flat white — with a live curve tracking a **visible-structure proxy**.

**Live:** [full screen](https://solnicol.com/experiments/flat-white/) ·
embedded in the [project notes](https://solnicol.com/projects/flat-white/)

This folder is the canonical source. It renders as a React island inside the
[solnicol.com](https://solnicol.com) Astro site — there is no separate app.

## The idea

Order is simple; noise is simple; the interesting part is the unstable middle.
The heart is ordered but legible. A uniform beige is the maximum-entropy end
state and equally trivial. In between, differential flow draws the milk into coherent
filaments — briefly *more* visible structure than either extreme — before
diffusion erases it.

This is a modest visual model of mixing (advection, stretching, folding,
diffusion), **not** a physics simulator and not a universal law. The measured
value is a *structure proxy*, not "true complexity".

## What it does

- **Run automatically** — a roughly one-minute one-shot timeline carries the heart from
  order through folding and diffusion to a uniform surface.
- **Watch structure rise and fall** — an SVG curve labelled *visible structure*
  climbs through the folded middle and falls as the surface settles.
- **Replay / Pause** — reset to the ordered heart, or freeze the evolution.

## How it works

The surface uses Three.js full-screen passes drawn with GLSL fragment shaders.

The mixing is a **simplified advection–diffusion simulation**, not a full fluid
solver:

- A pair of half-float render targets stores milk concentration. A softly
  warped milk mass and centre pull seed the heart into both targets.
- Every frame back-traces the previous concentration through alternating
  horizontal and vertical shear fields. Several neighbouring flow cells fold
  the existing heart boundary without imposing net cup rotation.
- The targets swap after each step, so every fold acts on material already
  changed by the previous one.
- Local diffusion softens neighbouring concentration values. A late coarse
  term represents unresolved cup-scale diffusion towards the seeded field's
  conserved mean.

## How the score is computed

The visible-structure curve is **measured from the rendered surface**, not
from the gesture. Every half second the current coffee surface is rendered into
a 64×64 offscreen target and read back, then scored in
`structure.ts`:

1. Pixels map to milk concentration via luminance, normalised between the
   espresso and cream tones. The crema rim is masked out.
2. **medium edge energy** measures the contour density after a 2x2 box blur.
   This rewards filaments and folds over a stable heart outline.
3. **coarse tonal variation** measures the remaining non-uniformity after an
   8x8 blur, so a visibly soft swirl does not disappear from the curve early.
4. **persistence and fine-detail gates** discount contrast that exists only at
   the smallest scale.
5. **score** combines those three render-derived terms. It never reads the
   animation timeline or elapsed diffusion.

The curve is calibrated so uniform coffee-and-milk reads near 0%, the clean
heart stays legible and the folded middle rises before disappearing with the
surface. If the WebGL readback ever fails, the curve falls back to a
timeline-derived estimate rather than dying.

## What this taught me

The artefact is the residue of having to understand a handful of primitives
well enough to make them operate. Recording them here is the point: an object
you can interrogate beats an object you can only admire.

**The primitives underneath this project**

1. **Advection as a coordinate warp** — moving fluid is equivalent to moving
   *where you look up* the previous material state. Each new texture reads the
   last one through a back-traced flow field.
2. **Alternating shear → stretching and folding** — horizontal and vertical
   shears do not commute. Each direction acts on material stretched by the
   previous one, increasing interface length without a global spin.
3. **Advection creates gradients; diffusion destroys them** — the unstable
   middle exists because the two act on different timescales, and uniformity
   is the only fixed point.
4. **The pour mechanics of a latte heart** — a round milk mass plus one
   vertical centre cut produces both the cleft and the tapered tail. One
   displacement, two features.
5. **Structure ≠ contrast** — boundary density at two scales separates
   coherent form from busyness: coherent contours survive blurring;
   pixel-scale noise does not.
6. **Computed, not quoted** — a displayed measurement must be derived from the
   artefact itself, or it is theatre.

**Learning residue**

- **Primitive learned:** the rise-and-fall of visible structure in mixing can
  be made measurable with nothing more than edge fractions at two scales and
  their ratio — no entropy estimation required.
- **Mistakes corrected:** two. The first curve measured the *input gesture*,
  not the surface — decorative, not evidential. And the first
  comparison field was low-frequency fbm, which the measurement correctly
  scored as *structure*: clouds are coherent form. The measure disciplined the
  exhibit, which is what a real measure does.
- **Test I should now pass:** explain why random noise scores near zero under
  a fine/medium coherence gate while folded filaments score high — and why
  raw contrast alone would invert that ranking.

**Check yourself**

1. Why does folding *increase* visible structure before diffusion erases it?
2. Why must the comparison noise live at pixel scale for "busy is not
   structured" to be an honest demonstration?
3. Why does the score gate on the fine/medium boundary *ratio* rather than
   subtracting one from the other?

The fixed-resolution simulation is independent of the displayed canvas size,
and the render loop stops once the terminal uniform state is reached.

## Files

- `FlatWhiteExperiment.tsx` — the island: timeline state, visibility-aware
  animation, measurement cadence, curve, phase label and controls.
- `surface.ts` — the Three.js renderer: ping-pong targets, simulation and
  display passes, plus the offscreen sampling target for measurement.
- `shaders.ts` — the GLSL seed, advection–diffusion and display shaders.
- `structure.ts` — the visible-structure score, computed from sampled pixels.

## Accessibility & performance

- The canvas requires no pointer gesture, so normal mobile scrolling remains
  untouched.
- `prefers-reduced-motion` presents the ordered surface without running the
  automated timeline.
- The simulation pauses when the canvas leaves the viewport or the document is
  hidden, and stops permanently when diffusion reaches its terminal state.

## Running locally

It lives inside the site, so run the site — from the repo root:

```sh
npm install
npm run dev   # then open /experiments/flat-white/ or /projects/flat-white/
```
