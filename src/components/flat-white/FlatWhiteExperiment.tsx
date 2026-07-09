import { useCallback, useEffect, useRef, useState } from "react";
import { createSurface, type Surface, type SurfaceUniforms } from "./surface";
import { structureStats } from "./structure";

// Tuning. The mixing model is a proxy, not a solver, so these are chosen for
// legibility of the full mixing progression rather than realism.
const DIFFUSE_SECONDS = 34; // order → uniform once stirring has begun
const WIND_FULL = 7; // winding (radians) that reads as fully structured
const WIND_MAX = 14; // clamp so filaments stay broad and legible
const CURVE_HZ = 12; // curve points per second
const CURVE_SPAN = 22; // seconds held in the curve window
const CURVE_N = CURVE_HZ * CURVE_SPAN;
const MEASURE_INTERVAL = 0.5; // seconds between surface readbacks

interface Sim {
  wind: number;
  diffuse: number;
  energy: number;
  pointer: [number, number];
  time: number;
  started: boolean;
  dragging: boolean;
  lastAngle: number | null;
  clock: number; // performance.now of last frame
  curveAcc: number; // seconds accumulated toward the next curve point
  measureAcc: number; // seconds accumulated toward the next readback
  structure: number; // displayed value, eased toward structureTarget
  structureTarget: number; // latest measured score
}

function freshSim(): Sim {
  return {
    wind: 0,
    diffuse: 0,
    energy: 0,
    pointer: [0, 0],
    time: 0,
    started: false,
    dragging: false,
    lastAngle: null,
    clock: 0,
    curveAcc: 0,
    measureAcc: 0,
    structure: 0,
    structureTarget: 0,
  };
}

export default function FlatWhiteExperiment({ embedded = false }: { embedded?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const simRef = useRef<Sim>(freshSim());
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const valueRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<SVGPolylineElement>(null);

  const [paused, setPaused] = useState(false);
  const [stirred, setStirred] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ).current;

  // Fallback only: if the WebGL readback ever fails, the curve degrades to
  // this pointer-derived estimate instead of dying. The real score comes
  // from the rendered pixels via structureScore.
  const structureProxy = useCallback((s: Sim): number => {
    const windNorm = Math.min(Math.abs(s.wind) / WIND_FULL, 1);
    const live = Math.min(s.energy * 0.25, 0.2);
    return Math.max(0, Math.min(1, (windNorm + live) * (1 - s.diffuse)));
  }, []);

  const fallbackRef = useRef(false);

  const uniformsOf = useCallback(
    (s: Sim): SurfaceUniforms => ({
      time: s.time,
      wind: s.wind,
      diffuse: s.diffuse,
      energy: s.energy,
      pointer: s.pointer,
      reduced: reduced ? 1 : 0,
    }),
    [reduced]
  );

  // Read the rendered surface back and score it. `snap` jumps the displayed
  // value (mount, replay, mode switch); otherwise the frame loop eases
  // toward the target between readbacks.
  const measureNow = useCallback(
    (s: Sim, snap: boolean) => {
      const surface = surfaceRef.current;
      if (!surface || fallbackRef.current) return;
      try {
        const { data, size } = surface.sample(uniformsOf(s));
        const stats = structureStats(data, size);
        s.structureTarget = stats.score;
        if (snap) s.structure = s.structureTarget;
      } catch (err) {
        console.warn("Flat White: surface readback failed, using proxy", err);
        fallbackRef.current = true;
      }
    },
    [uniformsOf]
  );

  // Push the current sim into the DOM readouts without re-rendering React.
  const paint = useCallback((s: Sim) => {
      if (valueRef.current) {
        valueRef.current.textContent = `${Math.round(s.structure * 100)}%`;
      }
      const path = pathRef.current;
      const h = historyRef.current;
      if (path) {
        if (h.length > 1) {
          const step = 100 / (CURVE_N - 1);
          let pts = "";
          for (let i = 0; i < h.length; i++) {
            const x = (i * step).toFixed(2);
            const y = (32 - h[i] * 30).toFixed(2);
            pts += `${x},${y} `;
          }
          path.setAttribute("points", pts.trim());
        } else {
          path.setAttribute("points", "");
        }
      }
    }, []);

  const frame = useCallback(() => {
    const surface = surfaceRef.current;
    const s = simRef.current;
    if (!surface) return;

    const now = performance.now();
    const dt = s.clock ? Math.min((now - s.clock) / 1000, 0.05) : 0;
    s.clock = now;

    if (!pausedRef.current) {
      if (!reduced) s.time += dt;
      // Energy fades fast; winding relaxes very slowly.
      s.energy *= Math.exp(-dt * 3.2);
      s.wind *= Math.exp(-dt * 0.06);
      if (s.started && s.diffuse < 1) {
        const rate = reduced ? dt / (DIFFUSE_SECONDS * 2.5) : dt / DIFFUSE_SECONDS;
        s.diffuse = Math.min(1, s.diffuse + rate);
      }
    }

    // Measure the surface at a fixed cadence, then ease the displayed value
    // toward the latest reading between readbacks.
    if (!pausedRef.current) {
      s.measureAcc += dt;
      if (s.measureAcc >= MEASURE_INTERVAL) {
        s.measureAcc = 0;
        measureNow(s, false);
      }
    }
    if (fallbackRef.current) {
      s.structure = structureProxy(s);
    } else {
      s.structure += (s.structureTarget - s.structure) * Math.min(1, dt * 4);
    }

    // Append to the curve at a fixed rate regardless of frame rate.
    if (!pausedRef.current) {
      s.curveAcc += dt;
      const interval = 1 / CURVE_HZ;
      while (s.curveAcc >= interval) {
        s.curveAcc -= interval;
        const h = historyRef.current;
        h.push(s.structure);
        if (h.length > CURVE_N) h.shift();
      }
    }

    surface.render(uniformsOf(s));
    paint(s);

    // Keep looping only while something is actually changing.
    const busy =
      !pausedRef.current &&
      (s.dragging ||
        s.energy > 0.002 ||
        (s.started && s.diffuse < 1));
    if (busy) {
      rafRef.current = requestAnimationFrame(frame);
    } else {
      rafRef.current = null;
    }
  }, [measureNow, paint, reduced, structureProxy, uniformsOf]);

  const ensureLoop = useCallback(() => {
    if (rafRef.current == null && !pausedRef.current) {
      simRef.current.clock = 0;
      rafRef.current = requestAnimationFrame(frame);
    }
  }, [frame]);

  // Mount: create the surface, size it, draw the first ordered frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let surface: Surface;
    try {
      surface = createSurface(canvas);
    } catch (err) {
      console.warn("Flat White: WebGL unavailable", err);
      canvas.dataset.unavailable = "true";
      return;
    }
    surfaceRef.current = surface;

    const fit = () => {
      const size = canvas.clientWidth;
      // Measure only after a real layout: with no size, uRes still holds its
      // placeholder and the shader's supersample offsets blow up, so a sample
      // would read a uniform field and report a convincing-looking zero.
      if (size > 0) {
        surface.resize(size);
        // Redraw the current state after a resize even when idle.
        surface.render(uniformsOf(simRef.current));
        measureNow(simRef.current, true);
        paint(simRef.current);
      }
    };
    fit();
    paint(simRef.current);

    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      surface.dispose();
      surfaceRef.current = null;
    };
  }, [measureNow, paint, uniformsOf]);

  // Pointer → stir. Angular motion around the centre winds the pattern;
  // any motion feeds the live vortex energy.
  const pointerPos = useCallback((e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    return [x, y];
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!surfaceRef.current) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is a nicety (keeps a drag alive off-canvas), not
        // essential; some pointers reject it.
      }
      const s = simRef.current;
      s.dragging = true;
      const [x, y] = pointerPos(e);
      s.pointer = [x, y];
      s.lastAngle = Math.atan2(y, x);
      if (!s.started) {
        s.started = true;
        setStirred(true);
      }
      ensureLoop();
    },
    [ensureLoop, pointerPos]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const s = simRef.current;
      if (!s.dragging) return;
      e.preventDefault();
      const [x, y] = pointerPos(e);
      const prev = s.pointer;
      const dist = Math.hypot(x - prev[0], y - prev[1]);
      s.pointer = [x, y];

      const angle = Math.atan2(y, x);
      if (s.lastAngle != null) {
        let d = angle - s.lastAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        s.wind = Math.max(-WIND_MAX, Math.min(WIND_MAX, s.wind + d));
      }
      s.lastAngle = angle;
      s.energy = Math.min(1.2, s.energy + Math.min(dist * 4, 0.6));
      ensureLoop();
    },
    [ensureLoop, pointerPos]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = simRef.current;
    s.dragging = false;
    s.lastAngle = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const replay = useCallback(() => {
    simRef.current = freshSim();
    historyRef.current = [];
    setStirred(false);
    setPaused(false);
    pausedRef.current = false;
    const surface = surfaceRef.current;
    if (surface) {
      surface.render(uniformsOf(simRef.current));
      measureNow(simRef.current, true);
    }
    paint(simRef.current);
  }, [measureNow, paint, uniformsOf]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      pausedRef.current = next;
      if (!next) ensureLoop();
      return next;
    });
  }, [ensureLoop]);

  return (
    <div className="fw" data-embedded={embedded ? "" : undefined}>
      <div className="fw-stage">
        <canvas
          ref={canvasRef}
          className="fw-canvas"
          role="img"
          aria-label="Circular flat white with a rosetta that stirs into filaments before settling into a uniform beige"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
        <p className="fw-instruction" data-stirred={stirred ? "" : undefined} aria-hidden="true">
          Stir the pattern
        </p>
      </div>

      <div className="fw-readout">
        <div className="fw-curve" aria-hidden="true">
          <span className="fw-curve-label">Structure</span>
          <svg className="fw-curve-plot" viewBox="0 0 100 34" preserveAspectRatio="none">
            <line className="fw-curve-base" x1="0" y1="32" x2="100" y2="32" />
            <polyline ref={pathRef} className="fw-curve-line" points="" />
          </svg>
          <span className="fw-value" ref={valueRef}>
            0%
          </span>
        </div>

        <div className="fw-controls">
          <button type="button" onClick={replay}>
            Replay
          </button>
          <button type="button" onClick={togglePause} aria-pressed={paused}>
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      <style>{`
        .fw {
          --fw-ink: oklch(0.93 0.02 82);
          --fw-dim: oklch(0.72 0.03 70);
          --fw-line: oklch(0.93 0.02 82 / 0.16);
          --fw-line-strong: oklch(0.93 0.02 82 / 0.34);
          --fw-signal: oklch(0.78 0.11 62);
          font-family: var(--font-main, "Geist Variable", sans-serif);
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
          width: 100%;
          -webkit-user-select: none;
          user-select: none;
        }
        .fw[data-embedded] {
          --fw-ink: var(--fg-0);
          --fw-dim: var(--fg-2);
          --fw-line: var(--border-soft);
          --fw-line-strong: var(--border-strong);
          --fw-signal: var(--signal);
        }

        .fw-stage {
          position: relative;
          width: min(30rem, 100%);
          margin: 0 auto;
          aspect-ratio: 1;
          overscroll-behavior: contain;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
        /* You stir with a teaspoon, not a hand. Hotspot sits in the bowl. */
        .fw-canvas {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cg transform='rotate(40 16 16)'%3E%3Crect x='14.8' y='2.5' width='2.4' height='14' rx='1.2' fill='%23f2e9d8' stroke='%233a2718' stroke-width='1'/%3E%3Cellipse cx='16' cy='23' rx='4.4' ry='6' fill='%23f2e9d8' stroke='%233a2718' stroke-width='1.2'/%3E%3C/g%3E%3C/svg%3E") 12 21, pointer;
          touch-action: none;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
          box-shadow:
            0 1px 0 oklch(1 0 0 / 0.06) inset,
            0 18px 48px oklch(0 0 0 / 0.45);
        }
        .fw-canvas[data-unavailable] {
          background: radial-gradient(circle at 40% 38%, oklch(0.86 0.06 82), oklch(0.36 0.07 55));
        }

        .fw-instruction {
          position: absolute;
          bottom: 2.6rem; /* sits on the liquid, clear of the ceramic rim */
          left: 0;
          right: 0;
          text-align: center;
          font-family: var(--font-mono, "Geist Mono Variable", monospace);
          font-size: 0.72rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: oklch(0.96 0.02 85);
          text-shadow: 0 1px 6px oklch(0 0 0 / 0.6);
          pointer-events: none;
          transition: opacity 600ms ease;
        }
        .fw-instruction[data-stirred] {
          opacity: 0;
        }

        .fw-readout {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1.25rem;
          width: min(30rem, 100%);
          margin: 0 auto;
        }

        .fw-curve {
          flex: 1 1 14rem;
          min-width: 0;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 0.4rem 0.6rem;
        }
        .fw-curve-label,
        .fw-value {
          font-family: var(--font-mono, "Geist Mono Variable", monospace);
          font-size: 0.66rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--fw-dim);
        }
        .fw-value {
          justify-self: end;
          color: var(--fw-signal);
          font-variant-numeric: tabular-nums;
        }
        .fw-curve-plot {
          grid-column: 1 / -1;
          width: 100%;
          height: 2.6rem;
          overflow: visible;
        }
        .fw-curve-base {
          stroke: var(--fw-line);
          stroke-width: 0.5;
        }
        .fw-curve-line {
          fill: none;
          stroke: var(--fw-signal);
          stroke-width: 1.4;
          stroke-linejoin: round;
          stroke-linecap: round;
          vector-effect: non-scaling-stroke;
        }

        .fw-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .fw-controls button {
          font-family: var(--font-mono, "Geist Mono Variable", monospace);
          font-size: 0.68rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fw-ink);
          background: transparent;
          border: 1px solid var(--fw-line-strong);
          border-radius: 2px;
          padding: 0.5rem 0.7rem;
          cursor: pointer;
          transition:
            border-color 160ms ease,
            background-color 160ms ease,
            color 160ms ease;
        }
        .fw-controls button:hover {
          border-color: var(--fw-ink);
          background: oklch(1 0 0 / 0.06);
        }
        .fw-controls button:focus-visible {
          outline: 1px solid var(--fw-ink);
          outline-offset: 3px;
        }
        .fw-controls button[aria-pressed="true"] {
          border-color: var(--fw-signal);
          color: var(--fw-signal);
        }

        @media (prefers-reduced-motion: reduce) {
          .fw-instruction {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
