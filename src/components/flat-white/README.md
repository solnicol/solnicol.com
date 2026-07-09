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
- The structure proxy is computed in TypeScript from accumulated winding, live
  stir energy and the diffusion term — high in the coherent middle, low at both
  extremes.

Because the field is a pure function of a handful of uniforms, the surface is
cheap and the render loop stops when nothing is changing.

## Files

- `FlatWhiteExperiment.tsx` — the island: state, animation timing, pointer
  interaction, the structure proxy, the curve, the state badge and the controls.
- `surface.ts` — the Three.js renderer: `ShaderMaterial`, quad, uniform plumbing.
- `shaders.ts` — the GLSL vertex and fragment shaders (the mixing model).

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
