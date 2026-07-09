# Flat White — *Structura Lactis*

A small interactive model of structure between order and uniformity. A milk
heart on dark coffee is stirred into filaments and eddies, then diffuses into a
uniform flat white — with a live curve tracking a **visible-structure proxy**.

**Live:** [full screen](https://solnicol.com/experiments/flat-white/) ·
embedded in the [project notes](https://solnicol.com/projects/flat-white/)

This folder is the canonical source. It renders as a React island inside the
[solnicol.com](https://solnicol.com) Astro site — there is no separate app.

## The idea

Order is simple; noise is simple; the interesting part is the unstable middle.
The heart is ordered but trivial. A uniform beige is the maximum-entropy end
state and equally trivial. In between, stirring draws the milk into coherent
filaments — briefly *more* visible structure than either extreme — before
diffusion erases it.

This is a modest visual model of mixing (advection, stretching, folding,
diffusion), **not** a physics simulator and not a universal law. The measured
value is a *structure proxy*, not "true complexity".

## What it does

- **Stir** — drag or touch the surface. Angular motion around the centre winds
  the pattern; a live vortex trails the pointer.
- **Watch structure rise and fall** — an SVG curve labelled *visible structure*
  climbs through the stirred middle and falls as the surface settles.
- **Compare with noise** — a comparison mode shows a high-frequency random field.
  It is busy everywhere and coherent nowhere, and the proxy stays low: busy is
  not the same as structured.
- **Replay / Pause** — reset to the ordered heart, or freeze the evolution.

## How it works (MVP)

The surface is a single Three.js full-screen quad (`ShaderMaterial` on a plane)
drawn with a GLSL fragment shader.

The mixing is a **simplified, stateless model**, not a solver:

- The milk field is defined once in a *material* coordinate space, built the
  way a latte heart actually forms: a soft round milk mass (the monk's head)
  with a vertical centre cut that carves the top cleft and draws out the
  tapered tail. Contour rings and a pale pour spine give it poured texture.
- Stirring is a coordinate warp read back per frame: a live vortex around the
  pointer, plus a **global differential rotation** whose angle grows toward the
  centre. Differential rotation is what actually winds a compact blob into
  spiral filaments, so it does the visual work.
- Diffusion blends the whole field toward one mean milk fraction and melts the
  edges.

## How the score is computed

The visible-structure curve is **measured from the rendered surface**, not
from the gesture. Every half second the current field — coffee or noise alike —
is rendered into a 64×64 offscreen target and read back, then scored in
`structure.ts`:

1. Pixels map to milk concentration via luminance, normalised between the
   espresso and cream tones. The crema rim is masked out.
2. **fine** = fraction of neighbouring pixel pairs whose concentration step
   exceeds a visibility threshold (0.15) — boundary density at pixel scale.
3. **medium** = the same fraction after 2×2 box-downsampling — boundaries that
   survive blurring, i.e. contours organised into shapes.
4. **coherence** = 1 − fine/medium, clamped to [0, 1]. Coherent form has sparse
   pixel-scale boundaries relative to shape-scale ones; noise has fine ≥ medium
   and gates to ~0.
5. **score** = medium × coherence, normalised and shown with a mild display
   gamma.

Measured values: uniform beige ≈ 0%, the clean heart ≈ 45–50%, the stirred
middle ≈ 95%+, random noise ≈ 5% despite being the busiest field on screen.
That last contrast is the point: busy is not the same as structured. If the
WebGL readback ever fails, the curve falls back to a pointer-derived estimate
rather than dying.

## What this taught me

The artefact is the residue of having to understand a handful of primitives
well enough to make them operate. Recording them here is the point: an object
you can interrogate beats an object you can only admire.

**The primitives underneath this project**

1. **Advection as a coordinate warp** — moving fluid is equivalent to moving
   *where you look up* the material. The shader never moves paint; it warps
   the lookup coordinates and reads the original field through them.
2. **Differential rotation → stretching and folding** — a rotation whose angle
   grows toward the centre winds a compact blob into spiral filaments.
   Interface length grows as feature width shrinks; that is what mixing *is*.
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
- **Mistakes corrected:** two. The first curve measured the *gesture* (pointer
  winding), not the surface — decorative, not evidential. And the first
  comparison field was low-frequency fbm, which the measurement correctly
  scored as *structure*: clouds are coherent form. The measure disciplined the
  exhibit, which is what a real measure does.
- **Test I should now pass:** explain why random noise scores near zero under
  a fine/medium coherence gate while stirred filaments score high — and why
  raw contrast alone would invert that ranking.

**Check yourself**

1. Why does stirring *increase* visible structure before diffusion erases it?
2. Why must the comparison noise live at pixel scale for "busy is not
   structured" to be an honest demonstration?
3. Why does the score gate on the fine/medium boundary *ratio* rather than
   subtracting one from the other?

Because the field is a pure function of a handful of uniforms, the surface is
cheap and the render loop stops when nothing is changing.

## Files

- `FlatWhiteExperiment.tsx` — the island: state, animation timing, pointer
  interaction, the measurement cadence, the curve, the badge and the controls.
- `surface.ts` — the Three.js renderer: `ShaderMaterial`, quad, uniform
  plumbing, and the offscreen sampling target for the measurement.
- `shaders.ts` — the GLSL vertex and fragment shaders (the mixing model).
- `structure.ts` — the visible-structure score, computed from sampled pixels.

## Upgrade path

Replace the stateless `milkAt` in `shaders.ts` with a **ping-pong simulation**:
two `THREE.WebGLRenderTarget`s, advect + diffuse the milk field each step, and
sample the result. The renderer would gain the target pair and a step shader;
the component wiring and the page around it would not change.

## Accessibility & performance

- Pointer Events cover mouse and touch; `touch-action: none` on the canvas.
- `prefers-reduced-motion` freezes the shimmer and noise animation and slows the
  diffusion clock; stirring stays user-driven.
- The `requestAnimationFrame` loop runs only while something is changing (a drag,
  live energy, an unfinished diffusion, or animated noise) and stops when idle.

## Running locally

It lives inside the site, so run the site — from the repo root:

```sh
npm install
npm run dev   # then open /experiments/flat-white/ or /projects/flat-white/
```
