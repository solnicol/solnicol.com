import { useCallback, useEffect, useRef, useState } from "react";
import { createSurface, type Surface, type SurfaceUniforms } from "./surface";
import { structureStats } from "./structure";

// Tuning. The mixing model is a proxy, not a solver, so these are chosen for
// legibility of the full mixing progression rather than realism.
const ORDER_END = 1.5;
const FOLD_END = 35;
const DIFFUSE_START = 35;
const RELAX_START = 27;
const TOTAL_SECONDS = 59;
const CURVE_HZ = 8; // curve points per second
const CURVE_SPAN = TOTAL_SECONDS;
const CURVE_N = CURVE_HZ * CURVE_SPAN;
const MEASURE_INTERVAL = 0.5; // seconds between surface readbacks

interface Sim {
  advection: number;
  diffusion: number;
  time: number;
  clock: number; // performance.now of last frame
  curveAcc: number; // seconds accumulated toward the next curve point
  measureAcc: number; // seconds accumulated toward the next readback
  structure: number; // displayed value, eased toward structureTarget
  structureTarget: number; // latest measured score
}

function freshSim(): Sim {
  return {
    advection: 0,
    diffusion: 0,
    time: 0,
    clock: 0,
    curveAcc: 0,
    measureAcc: 0,
    structure: 0,
    structureTarget: 0,
  };
}

function smoothRange(from: number, to: number, value: number): number {
  const x = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return x * x * (3 - 2 * x);
}

function applyTimeline(s: Sim) {
  const folding = s.time < ORDER_END
    ? 0
    : 0.2 + 0.8 * smoothRange(ORDER_END, 21, s.time);
  const relaxing = smoothRange(RELAX_START, FOLD_END, s.time);
  s.advection = folding * (1 - relaxing);
  s.diffusion = 3.2 * smoothRange(DIFFUSE_START + 2, TOTAL_SECONDS, s.time);
}

function phaseOf(time: number): string {
  if (time < ORDER_END) return "Order";
  if (time < FOLD_END) return "Folding";
  if (time < TOTAL_SECONDS - 4) return "Diffusion";
  return "Uniformity";
}

export default function FlatWhiteExperiment({ embedded = false }: { embedded?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const simRef = useRef<Sim>(freshSim());
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const valueRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<SVGPolylineElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef(true);

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ).current;

  // Fallback only: if the WebGL readback ever fails, the curve degrades to
  // this timeline-derived estimate instead of dying. The real score comes
  // from the rendered pixels via structureScore.
  const structureProxy = useCallback((s: Sim): number => {
    const remaining = 1 - smoothRange(RELAX_START, TOTAL_SECONDS, s.time);
    return Math.max(0, Math.min(1, s.advection * remaining));
  }, []);

  const fallbackRef = useRef(false);

  const uniformsOf = useCallback(
    (s: Sim): SurfaceUniforms => ({
      time: s.time,
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
      if (phaseRef.current) phaseRef.current.textContent = phaseOf(s.time);
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

    if (!pausedRef.current && activeRef.current && !reduced) {
      s.time = Math.min(TOTAL_SECONDS, s.time + dt);
      applyTimeline(s);
      surface.step({
        time: s.time,
        dt,
        advection: s.advection,
        diffusion: s.diffusion,
      });
    }

    // Measure the surface at a fixed cadence, then ease the displayed value
    // toward the latest reading between readbacks.
    if (!pausedRef.current && activeRef.current && !reduced) {
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
    if (!pausedRef.current && activeRef.current && !reduced) {
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

    // The sequence is one-shot: the final uniform surface consumes no frames.
    const busy =
      !pausedRef.current &&
      activeRef.current &&
      !reduced &&
      s.time < TOTAL_SECONDS;
    if (busy) {
      rafRef.current = requestAnimationFrame(frame);
    } else {
      rafRef.current = null;
    }
  }, [measureNow, paint, reduced, structureProxy, uniformsOf]);

  const ensureLoop = useCallback(() => {
    if (rafRef.current == null && !pausedRef.current && activeRef.current) {
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
    if (!reduced) ensureLoop();

    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    let intersecting = true;
    const syncActivity = () => {
      activeRef.current = intersecting && !document.hidden;
      if (activeRef.current) ensureLoop();
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting;
        syncActivity();
      },
      { threshold: 0.05 }
    );
    io.observe(canvas);
    document.addEventListener("visibilitychange", syncActivity);

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", syncActivity);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      surface.dispose();
      surfaceRef.current = null;
    };
  }, [ensureLoop, measureNow, paint, reduced, uniformsOf]);

  const replay = useCallback(() => {
    simRef.current = freshSim();
    historyRef.current = [];
    setPaused(false);
    pausedRef.current = false;
    const surface = surfaceRef.current;
    if (surface) {
      surface.reset();
      surface.render(uniformsOf(simRef.current));
      measureNow(simRef.current, true);
    }
    paint(simRef.current);
    ensureLoop();
  }, [ensureLoop, measureNow, paint, uniformsOf]);

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
          aria-label="Circular flat white whose poured heart slowly folds into filaments and diffuses into a uniform surface"
        />
        <p className="fw-phase" aria-hidden="true">
          <span ref={phaseRef}>Order</span>
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
          margin: 0 auto 0.45rem;
          aspect-ratio: 1;
          overscroll-behavior: contain;
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
        .fw-canvas {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          box-shadow:
            0 1px 0 oklch(1 0 0 / 0.06) inset,
            0 18px 48px oklch(0 0 0 / 0.45);
        }
        .fw-canvas[data-unavailable] {
          background: radial-gradient(circle at 40% 38%, oklch(0.86 0.06 82), oklch(0.36 0.07 55));
        }

        .fw-phase {
          position: absolute;
          top: calc(100% + 0.75rem);
          left: 0;
          right: 0;
          text-align: center;
          font-family: var(--font-mono, "Geist Mono Variable", monospace);
          font-size: 0.72rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--fw-dim);
          pointer-events: none;
        }
        .fw-phase span {
          display: inline-block;
          min-width: 7.5rem;
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

      `}</style>
    </div>
  );
}
