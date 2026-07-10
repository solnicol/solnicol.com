// Stateful Three.js surface for the Flat White experiment. Milk concentration
// is advected and diffused between two fixed-size render targets; a separate
// display pass colours that material and adds the cup surface.

import * as THREE from "three";
import { DISPLAY_FRAG, SIM_FRAG, VERT } from "./shaders";

export interface SurfaceUniforms {
  time: number;
  reduced: number;
}

export interface SurfaceStep {
  time: number;
  dt: number;
  advection: number;
  diffusion: number;
}

export interface Surface {
  reset(): void;
  step(v: SurfaceStep): void;
  render(v: SurfaceUniforms): void;
  resize(cssSize: number): void;
  sample(v: SurfaceUniforms): { data: Uint8Array; size: number };
  dispose(): void;
}

const SAMPLE_SIZE = 64;
const SIM_SIZE = 320;

function target(size: number, type: THREE.TextureDataType = THREE.UnsignedByteType) {
  const result = new THREE.WebGLRenderTarget(size, size, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
  result.texture.generateMipmaps = false;
  return result;
}

export function createSurface(canvas: HTMLCanvasElement): Surface {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });
  renderer.setClearColor(0x000000, 0);

  const camera = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);

  const simUniforms = {
    uPrevious: { value: null as THREE.Texture | null },
    uSimRes: { value: new THREE.Vector2(SIM_SIZE, SIM_SIZE) },
    uTime: { value: 0 },
    uDt: { value: 0 },
    uAdvection: { value: 0 },
    uDiffusion: { value: 0 },
    uSeed: { value: 1 },
  };
  const simMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: SIM_FRAG,
    uniforms: simUniforms,
    depthTest: false,
    depthWrite: false,
  });
  const simScene = new THREE.Scene();
  const simMesh = new THREE.Mesh(geometry, simMaterial);
  simScene.add(simMesh);

  let read = target(SIM_SIZE, THREE.HalfFloatType);
  let write = target(SIM_SIZE, THREE.HalfFloatType);

  const displayUniforms = {
    uMilk: { value: read.texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uReduced: { value: 0 },
  };
  const displayMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: DISPLAY_FRAG,
    uniforms: displayUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const displayScene = new THREE.Scene();
  const displayMesh = new THREE.Mesh(geometry, displayMaterial);
  displayScene.add(displayMesh);

  const sampleTarget = target(SAMPLE_SIZE);
  const samplePixels = new Uint8Array(SAMPLE_SIZE * SAMPLE_SIZE * 4);

  const swap = () => {
    const previous = read;
    read = write;
    write = previous;
    displayUniforms.uMilk.value = read.texture;
  };

  const drawSimulation = () => {
    renderer.setRenderTarget(write);
    renderer.render(simScene, camera);
    renderer.setRenderTarget(null);
    swap();
  };

  const setDisplay = (v: SurfaceUniforms) => {
    displayUniforms.uTime.value = v.time;
    displayUniforms.uReduced.value = v.reduced;
  };

  const reset = () => {
    simUniforms.uSeed.value = 1;
    simUniforms.uPrevious.value = read.texture;
    drawSimulation();
    // Seed both targets so replay never exposes stale material during the
    // first back-trace.
    simUniforms.uPrevious.value = read.texture;
    drawSimulation();
    simUniforms.uSeed.value = 0;
  };

  reset();

  return {
    reset,
    step(v: SurfaceStep) {
      if (v.dt <= 0) return;
      simUniforms.uPrevious.value = read.texture;
      simUniforms.uTime.value = v.time;
      simUniforms.uDt.value = v.dt;
      simUniforms.uAdvection.value = v.advection;
      simUniforms.uDiffusion.value = v.diffusion;
      simUniforms.uSeed.value = 0;
      drawSimulation();
    },
    resize(cssSize: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(cssSize, cssSize, false);
      const px = Math.max(1, Math.round(cssSize * dpr));
      displayUniforms.uRes.value.set(px, px);
    },
    render(v: SurfaceUniforms) {
      setDisplay(v);
      renderer.setRenderTarget(null);
      renderer.render(displayScene, camera);
    },
    sample(v: SurfaceUniforms) {
      setDisplay(v);
      renderer.setRenderTarget(sampleTarget);
      renderer.render(displayScene, camera);
      renderer.setRenderTarget(null);
      renderer.readRenderTargetPixels(
        sampleTarget, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE, samplePixels
      );
      return { data: samplePixels, size: SAMPLE_SIZE };
    },
    dispose() {
      read.dispose();
      write.dispose();
      sampleTarget.dispose();
      geometry.dispose();
      simMaterial.dispose();
      displayMaterial.dispose();
      renderer.dispose();
    },
  };
}
