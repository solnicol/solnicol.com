// Three.js renderer for the Flat White surface: one full-screen quad drawn
// with the fragment shader in ./shaders, its uniforms updated per frame.
//
// The renderer is deliberately dumb: it owns the Three objects and pushes a
// flat bag of uniforms each frame. All model state lives in the component.
// Swapping the simplified shader for a ping-pong simulation later means
// changing only this file and ./shaders, not the component.

import * as THREE from "three";
import { FRAG, VERT } from "./shaders";

export interface SurfaceUniforms {
  time: number;
  wind: number;
  diffuse: number;
  energy: number;
  pointer: [number, number];
  reduced: number;
}

export interface Surface {
  render(u: SurfaceUniforms): void;
  /** Resize to a CSS pixel box; caps device pixel ratio at 2. */
  resize(cssSize: number): void;
  /**
   * Render the current field into a small offscreen target and return its
   * RGBA bytes. Feeds the visible-structure score, so it samples the same
   * same coffee surface the visitor sees.
   */
  sample(u: SurfaceUniforms): { data: Uint8Array; size: number };
  dispose(): void;
}

const SAMPLE_SIZE = 64;

export function createSurface(canvas: HTMLCanvasElement): Surface {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // The quad already spans clip space, so a plain camera with no transform
  // is all we need — the vertex shader ignores its matrices.
  const camera = new THREE.Camera();

  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uWind: { value: 0 },
    uDiffuse: { value: 0 },
    uEnergy: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uReduced: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  // Offscreen target for the structure measurement; created once, read at a
  // low cadence by the component. 64×64 is plenty for a field this smooth.
  const sampleTarget = new THREE.WebGLRenderTarget(SAMPLE_SIZE, SAMPLE_SIZE, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  const samplePixels = new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE * 4);

  const setUniforms = (v: SurfaceUniforms) => {
    uniforms.uTime.value = v.time;
    uniforms.uWind.value = v.wind;
    uniforms.uDiffuse.value = v.diffuse;
    uniforms.uEnergy.value = v.energy;
    uniforms.uPointer.value.set(v.pointer[0], v.pointer[1]);
    uniforms.uReduced.value = v.reduced;
  };

  return {
    resize(cssSize: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(cssSize, cssSize, false);
      const px = Math.max(1, Math.round(cssSize * dpr));
      uniforms.uRes.value.set(px, px);
    },
    render(v: SurfaceUniforms) {
      setUniforms(v);
      renderer.render(scene, camera);
    },
    sample(v: SurfaceUniforms) {
      setUniforms(v);
      renderer.setRenderTarget(sampleTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.readRenderTargetPixels(
        sampleTarget, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE, samplePixels
      );
      return { data: samplePixels, size: SAMPLE_SIZE };
    },
    dispose() {
      sampleTarget.dispose();
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
