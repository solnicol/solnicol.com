import "@fontsource/ibm-plex-mono/300.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  BEAT_HZ,
  BEAT_PERIOD_S,
  C4_FREQ,
  CAPTIONS,
  ET_FIFTH_FLATTENING_CENTS,
  G4_ET,
  NOTES,
  PYTHAGOREAN_COMMA_CENTS,
  spiralFreqOf,
} from "./musicMath";
import {
  closeAudioEngine,
  fadeOutDyad,
  getAudioEngine,
  playStrike,
  startHeldFifth,
} from "./audioEngine";

// Palettes in OKLCH (perceptually uniform; animations below move only L/C).
// "dark" is the instrument's own workshop theme (fullscreen route).
// "blueprint" redraws it in the site's ink so the embedded figure sits on
// the sheet itself - it inherits the page's custom properties.
const THEMES = {
  dark: {
    brass: "oklch(0.728 0.138 89.7)",
    ink: "oklch(0.925 0.007 88.6)",
    dim: "oklch(0.524 0.006 95.2)",
    faint: "oklch(0.286 0.004 286.2)",
    bg: "oklch(0.164 0.002 286.2)",
    btnBorder: "oklch(0.349 0.003 286.2)",
    glowPure: "oklch(0.85 0.152 90)",
    beatLo: "oklch(0.62 0.1 89.7)",
    beatHi: "oklch(0.88 0.16 90)",
    dotLo: "oklch(0.6 0.11 89.7)",
    dotHi: "oklch(0.8 0.15 90)",
  },
  blueprint: {
    brass: "var(--signal, oklch(0.8 0.08 97))",
    ink: "var(--fg-0, oklch(0.985 0.003 260))",
    dim: "var(--fg-2, oklch(0.76 0.018 260))",
    faint: "oklch(1 0 0 / 0.22)",
    bg: "var(--ikb, oklch(0.3785 0.1954 263.23))",
    btnBorder: "var(--border-strong, oklch(1 0 0 / 0.36))",
    glowPure: "oklch(0.87 0.09 96)",
    beatLo: "oklch(0.66 0.06 97)",
    beatHi: "oklch(0.9 0.1 96)",
    dotLo: "oklch(0.64 0.07 97)",
    dotHi: "oklch(0.84 0.09 96)",
  },
};

export default function TemperamentClock({ embedded = false }) {
  const {
    brass: BRASS, ink: INK, dim: DIM, faint: FAINT, bg: BG, btnBorder: BTN_BORDER,
    glowPure: GLOW_PURE, beatLo: BEAT_LO, beatHi: BEAT_HI, dotLo: DOT_LO, dotHi: DOT_HI,
  } = THEMES[embedded ? "blueprint" : "dark"];
  const [now, setNow] = useState(() => new Date());
  const [activeIdx, setActiveIdx] = useState(null);   // face position (mod 12)
  const [activeStep, setActiveStep] = useState(null); // absolute chain step (0-12)
  const [touring, setTouring] = useState(false);
  const [tourAnim, setTourAnim] = useState(null); // { mode, startedAt } while the tour thread is on screen
  const [tourNow, setTourNow] = useState(0);
  const [lastTour, setLastTour] = useState(null); // caption persists after a tour ends
  const [dyad, setDyad] = useState(null); // null | "pure" | "tempered"
  const [guided, setGuided] = useState(null); // null | "pure" | "tempered" | "spiral"
  const [guidedUsed, setGuidedUsed] = useState(false); // demotes the invitation after first use
  const audioEngineRef = useRef(null);
  const dyadNodesRef = useRef(null);
  const guidedTimersRef = useRef([]);
  const timersRef = useRef([]); // strike flashes + tour teardown
  // Sync the CSS-driven second hand to real time once at mount.
  const [secOffset] = useState(() => (Date.now() / 1000) % 60);
  const [prefersReducedMotion] = useState(
    typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // The second hand sweeps via CSS, so the render clock only needs to keep
  // the digital readout and minute/hour hands honest - 4 Hz, not 60.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, []);

  // The tour thread animates per-frame, but only while a tour is on screen.
  useEffect(() => {
    if (!tourAnim || prefersReducedMotion) return;
    let raf;
    const loop = () => {
      setTourNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [prefersReducedMotion, tourAnim]);

  const getAudio = useCallback(() => getAudioEngine(audioEngineRef), []);

  // Tracked setTimeout: strike flashes and tour teardown must not fire setState
  // after unmount - same discipline as the audio and guided-sequence teardown.
  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // If the component unmounts mid-tour, scheduled oscillators would keep
  // ringing on the audio thread. Shut the engine down with the component.
  useEffect(() => {
    return () => {
      closeAudioEngine(audioEngineRef);
    };
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    },
    []
  );

  // fifthSteps: position in fifths order (0 = C). "et" indexes the
  // octave-folded pitch class; "spiral" exponentiates a true 3:2.
  const freqFor = useCallback(
    (idx, mode) => (mode === "spiral" ? spiralFreqOf(idx) : NOTES[idx].etFreq),
    []
  );

  const strike = useCallback(
    (idx, when = 0, dur = 2.4, mode = "et") => {
      playStrike({ engine: getAudio(), frequency: freqFor(idx, mode), when, duration: dur });
      schedule(() => {
        setActiveIdx(idx % 12);
        setActiveStep(idx);
        schedule(() => {
          setActiveIdx((cur) => (cur === idx % 12 ? null : cur));
          setActiveStep((cur) => (cur === idx ? null : cur));
        }, 1400);
      }, when * 1000);
    },
    [freqFor, getAudio, schedule]
  );

  const stopDyad = useCallback(() => {
    const d = dyadNodesRef.current;
    if (d && audioEngineRef.current) {
      fadeOutDyad(audioEngineRef.current, d);
      dyadNodesRef.current = null;
    }
    setDyad(null);
  }, []);

  // Unconditional start - the guided sequence needs this so a fifth the user
  // already had held can't toggle the phase silent.
  const startFifth = useCallback(
    (kind) => {
      stopDyad();
      dyadNodesRef.current = startHeldFifth({ engine: getAudio(), kind, c4Freq: C4_FREQ, g4Et: G4_ET });
      setDyad(kind);
    },
    [getAudio, stopDyad]
  );

  const holdFifth = (kind) => {
    if (dyad === kind) {
      stopDyad();
      return;
    }
    startFifth(kind);
  };

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const hourIdx = NOTES.findIndex((n) => n.hour === hour12);

  // Tours. "Circle": 12 octave-folded 12-TET pitch classes; the thread closes.
  // "Spiral": 13 strikes walk twelve literal pure 3:2 fifths up from C2; the
  // final strike lands near C but comma-sharp, and the thread misses its start.
  const runTour = (mode) => {
    if (touring) return;
    stopDyad();
    setTouring(true);
    setLastTour(mode);
    getAudio();
    const steps = mode === "spiral" ? 13 : 12;
    for (let i = 0; i < steps; i++) strike(i, i * 0.55, 1.6, mode);
    schedule(() => {
      setTouring(false);
      setActiveStep(null);
    }, steps * 550 + 800);
    // The thread overlay animates off the tour clock; this timeout only
    // removes it once it has fully faded.
    setTourAnim({ mode, startedAt: Date.now() });
    schedule(() => setTourAnim(null), 12 * 550 + 600 + 1400 + 200);
  };

  const clearGuidedTimers = () => {
    guidedTimersRef.current.forEach(clearTimeout);
    guidedTimersRef.current = [];
  };

  // A cancelled sequence must not fire late phases into a state that no
  // longer expects them - same discipline as the audio-engine teardown.
  useEffect(() => clearGuidedTimers, []);

  // Guided first-run sequence: pure fifth locks (3.5 s), tempered fifth beats
  // (4.5 s - four beat cycles at ≈0.89 Hz), a breath of silence, then the
  // spiral tour plays the comma. Clicking again cancels: dyads stop at once;
  // if the tour has already begun it rings out like any tour.
  const hearTheProblem = () => {
    if (guided) {
      clearGuidedTimers();
      stopDyad();
      setGuided(null);
      return;
    }
    if (touring) return;
    setGuidedUsed(true);
    startFifth("pure");
    setGuided("pure");
    const at = (ms, fn) => guidedTimersRef.current.push(setTimeout(fn, ms));
    at(3500, () => {
      startFifth("tempered");
      setGuided("tempered");
    });
    at(8000, () => stopDyad());
    at(8700, () => {
      setGuided("spiral");
      runTour("spiral");
    });
    at(8700 + 12 * 550 + 600 + 1400 + 200, () => setGuided(null));
  };

  const C = 200;
  const smooth = !prefersReducedMotion;
  const secAngle = (seconds / 60) * 360; // only used under reduced motion
  const minAngle = ((minutes + seconds / 60) / 60) * 360;
  const hrAngle = (((hours % 12) + minutes / 60) / 12) * 360;

  const polar = (angleDeg, r) => {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };

  // Static geometry: the tick ring never moves, so build it once.
  const clockTicks = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const [x1, y1] = polar(i * 6, major ? 168 : 174);
        const [x2, y2] = polar(i * 6, 180);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={major ? INK : DIM}
            strokeWidth={major ? 1.4 : 0.6}
            opacity={major ? 0.9 : 0.45}
          />
        );
      }),
    []
  );

  const currentNote = NOTES[hourIdx];
  const pad = (n) => String(n).padStart(2, "0");
  const chainDrift = (step) => step * ET_FIFTH_FLATTENING_CENTS;

  // Guided phases outrank the dyad/tour captions they trigger, or the two
  // systems would flicker against each other; the invitation shows only
  // until the sequence has been used once.
  const captionKey = guided
    ? `guided-${guided}`
    : dyad
      ? dyad
      : tourAnim
        ? tourAnim.mode
        : lastTour
          ? lastTour
          : guidedUsed
            ? "idle"
            : "invite";
  const captionText =
    {
      "guided-pure": CAPTIONS.guidedPure,
      "guided-tempered": CAPTIONS.guidedTempered,
      "guided-spiral": CAPTIONS.guidedSpiral,
      circle: CAPTIONS.circle,
      spiral: CAPTIONS.spiral,
      pure: CAPTIONS.pure,
      tempered: CAPTIONS.tempered,
      invite: CAPTIONS.invite,
    }[captionKey] ?? CAPTIONS.idle;

  return (
    <div className={embedded ? "page page-embedded" : "page"}>
      <style>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(ellipse 70% 55% at 50% 34%, oklch(0.196 0.004 286.2) 0%, ${BG} 68%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 16px 36px;
          font-family: 'IBM Plex Mono', ui-monospace, monospace;
          color: ${INK};
        }
        /* Embedded: the figure is drawn on the sheet itself - no slab, no
           radial vignette, site mono for UI text, square corners below. */
        .page-embedded {
          min-height: 0 !important;
          background: none !important;
          padding: 8px 16px 30px;
          font-family: var(--font-mono, ui-monospace), ui-monospace, monospace;
        }
        .page-embedded .btn {
          border-radius: 0;
        }
        .note-label { font-family: 'Cormorant Garamond', Georgia, serif; }

        .ring-pulse { animation: ringPulse 1.4s ease-out; transform-origin: center; }
        @keyframes ringPulse { 0% { opacity: 0.9; } 100% { opacity: 0; } }

        .struck { animation: notePop 1.2s cubic-bezier(0.22, 0.8, 0.3, 1); }
        @keyframes notePop {
          0% { font-size: var(--note-size); }
          10% { font-size: var(--note-pop-size); }
          100% { font-size: var(--note-size); }
        }

        /* Animated OKLCH, used only where the motion carries meaning: */

        /* 1. The tempered fifth beats at ${BEAT_HZ.toFixed(3)} Hz - the glow's
              L and C oscillate at exactly that computed period. The pure
              fifth holds still: locked sound, locked light. */
        .dyad-pure { fill: ${GLOW_PURE}; }
        .dyad-tempered { animation: beatGlow ${BEAT_PERIOD_S.toFixed(3)}s ease-in-out infinite; }
        @keyframes beatGlow {
          0%, 100% { fill: ${BEAT_LO}; }
          50% { fill: ${BEAT_HI}; }
        }

        /* 2. The hour marker breathes slowly - L rises and settles. */
        .hour-dot { animation: breathe 4s ease-in-out infinite; }
        @keyframes breathe {
          0%, 100% { fill: ${DOT_LO}; }
          50% { fill: ${DOT_HI}; }
        }

        .sec-sweep {
          transform-box: view-box;
          transform-origin: 50% 50%;
          animation: sweep 60s linear infinite;
        }
        @keyframes sweep { to { transform: rotate(360deg); } }

        @media (prefers-reduced-motion: reduce) {
          .ring-pulse, .struck, .dyad-tempered, .hour-dot, .sec-sweep { animation: none; }
          .ring-pulse { opacity: 0; }
          .dyad-tempered { fill: ${GLOW_PURE}; }
        }

        .btn {
          background: transparent;
          color: ${INK};
          border: 1px solid ${BTN_BORDER};
          border-radius: 999px;
          padding: 9px 18px;
          font-family: inherit;
          font-size: 11px;
          letter-spacing: 0.14em;
          white-space: nowrap;
          cursor: pointer;
          transition: border-color 0.3s ease, color 0.3s ease, background 0.3s ease, opacity 0.3s ease;
        }
        .btn:hover:not(:disabled):not(.active) {
          border-color: oklch(0.728 0.138 89.7 / 0.55);
          color: oklch(0.97 0.005 89);
        }
        .btn.active { background: ${BRASS}; color: ${BG}; border-color: ${BRASS}; }
        /* An active button reads as active even when locked out during its
           own tour - keep its brass full-strength rather than dimming it. */
        .btn.active:disabled { opacity: 1; }
        /* First-run invitation: primary by brass, not by size or chrome. */
        .btn-invite { border-color: oklch(0.728 0.138 89.7 / 0.65); color: ${BRASS}; }
        .btn-invite:hover:not(:disabled) { border-color: ${BRASS}; color: oklch(0.82 0.15 90); }

        /* Controls: one primary action, then two even pairs (see / hear).
           Equal-width grid cells keep the rows tidy; pairs stack on phones. */
        .controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          width: min(100%, 360px);
          margin-top: 20px;
        }
        .control-pair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          width: 100%;
        }
        .control-pair .btn { width: 100%; }
        .btn-primary { width: 100%; }
        @media (max-width: 400px) {
          .control-pair { grid-template-columns: 1fr; }
        }
        .btn:disabled { opacity: 0.45; cursor: default; }
        .btn:focus-visible { outline: 1px solid ${BRASS}; outline-offset: 3px; }

        .note { cursor: pointer; }
        .note-hit { outline: none; }
        .note-hit:focus-visible { stroke: oklch(0.728 0.138 89.7 / 0.55); }

        .caption { animation: captionIn 0.6s ease; }
        @keyframes captionIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {!embedded && (
        <header style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.24em", color: INK, textTransform: "uppercase" }}>
            Temperament Clock
          </div>
          <div style={{ marginTop: 6, fontSize: 9, letterSpacing: "0.24em", color: DIM, textTransform: "uppercase" }}>
            A study in musical temperament
          </div>
        </header>
      )}

      <svg
        viewBox="0 0 400 400"
        style={{ width: "min(88vw, 420px)", height: "auto", display: "block" }}
        role="img"
        aria-label={`Circle of fifths clock showing ${pad(hours)}:${pad(minutes)} with hour note ${currentNote.label}`}
      >
        <circle cx={C} cy={C} r={192} fill="none" stroke={FAINT} strokeWidth="1" />
        <circle cx={C} cy={C} r={186} fill="none" stroke={DIM} strokeWidth="0.5" opacity="0.5" />

        <circle
          cx={C}
          cy={C}
          r={192}
          fill="none"
          stroke={BRASS}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={`${((minutes * 60 + seconds) / 3600) * 2 * Math.PI * 192} ${2 * Math.PI * 192}`}
          transform={`rotate(-90 ${C} ${C})`}
          opacity="0.55"
        />

        {clockTicks}

        {NOTES.map((n, i) => {
          const [x, y] = polar(i * 30, 143);
          const [rx, ry] = polar(i * 30, 110);
          const isHour = i === hourIdx;
          const isRinging = i === activeIdx;
          // C and G carry the sustained fifth; they glow while it plays.
          const dyadClass =
            dyad && (i === 0 || i === 1) ? (dyad === "pure" ? "dyad-pure" : "dyad-tempered") : "";
          return (
            <g
              key={n.label}
              className="note"
              onClick={() => strike(i, 0, 1.8)}
            >
              {isRinging && (
                <circle className="ring-pulse" cx={x} cy={y} r={26} fill="none" stroke={BRASS} strokeWidth="1" />
              )}
              <circle
                className="hit note-hit"
                cx={x}
                cy={y}
                r={22}
                fill="transparent"
                stroke="none"
                strokeWidth="1"
                role="button"
                tabIndex={0}
                aria-label={`${n.label} note`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  strike(i, 0, 1.8);
                }
              }}
              />
              <text
                className={`note-label ${isRinging ? "struck" : ""} ${dyadClass}`}
                x={x}
                y={y + (n.sub ? -2 : 1)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={n.sub ? 21 : 27}
                fontWeight={600}
                fill={isRinging ? BRASS : isHour ? INK : DIM}
                style={{
                  "--note-size": `${n.sub ? 21 : 27}px`,
                  "--note-pop-size": `${(n.sub ? 21 : 27) * 1.09}px`,
                  transition: "fill 0.6s ease",
                }}
              >
                {n.label}
              </text>
              {n.sub && (
                <text
                  className="note-label"
                  x={x}
                  y={y + 15}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={14}
                  fill={isRinging ? BRASS : isHour ? INK : DIM}
                  opacity="0.8"
                  style={{ transition: "fill 0.6s ease" }}
                >
                  {n.sub}
                </text>
              )}
              {/* Relative minor - the circle of fifths' everyday reference use. */}
              <text
                className="note-label"
                x={rx}
                y={ry}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontStyle="italic"
                fill={DIM}
                opacity={isHour ? 0.95 : 0.6}
                pointerEvents="none"
                aria-hidden="true"
              >
                {n.rel}
              </text>
              {isHour && (
                <circle className="hour-dot" cx={x} cy={y + (n.sub ? 27 : 21)} r={1.8} fill={BRASS} />
              )}
            </g>
          );
        })}

        {/* Tour thread: while a tour plays, a thread traces one lap in step with
            the strikes, then fades. On the circle tour it closes perfectly. On
            the spiral tour the radius grows by the accumulated sharpness of
            pure fifths over 12-TET (1.6 px per cent), so the thread misses its
            start by the Pythagorean comma - the gap made visible, to scale. */}
        {tourAnim && (() => {
          // Clamp below at 0: the tour clock starts on the first rAF after launch.
          const clock = prefersReducedMotion ? now.getTime() : tourNow;
          const elapsed = Math.max(0, clock - tourAnim.startedAt);
          const spiral = tourAnim.mode === "spiral";
          const p = Math.min(elapsed / 550, 12);
          const rOf = (k) => 58 + (spiral ? k * ET_FIFTH_FLATTENING_CENTS * 1.6 : 0);
          const pts = [];
          for (let k = 0; k < p; k += 0.1) pts.push(polar(k * 30, rOf(k)));
          pts.push(polar(p * 30, rOf(p)));
          const fadeStart = 12 * 550 + 600;
          const opacity = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / 1400);
          const closed = p >= 12;
          const [tipX, tipY] = polar(p * 30, rOf(p));
          const [c0x, c0y] = polar(0, rOf(0));
          const [c12x, c12y] = polar(0, rOf(12));
          return (
            <g opacity={opacity} pointerEvents="none">
              <polyline
                points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
                fill="none"
                stroke={BRASS}
                strokeWidth="1"
                opacity="0.7"
              />
              {Array.from({ length: Math.floor(p) + 1 }, (_, k) => {
                const [dx, dy] = polar(k * 30, rOf(k));
                return <circle key={k} cx={dx} cy={dy} r={k === 0 ? 2.6 : 1.8} fill={BRASS} />;
              })}
              {!closed && <circle cx={tipX} cy={tipY} r={3.2} fill="none" stroke={BRASS} strokeWidth="1" />}
              {closed && spiral && (
                <g>
                  <line x1={c0x} y1={c0y} x2={c12x} y2={c12y} stroke={INK} strokeWidth="0.8" opacity="0.9" />
                  <text x={c0x + 7} y={(c0y + c12y) / 2 + 3} fontSize="9" fill={BRASS} letterSpacing="0.08em">
                    +{PYTHAGOREAN_COMMA_CENTS.toFixed(1)}¢
                  </text>
                </g>
              )}
              {closed && !spiral && (
                <circle className="ring-pulse" cx={c0x} cy={c0y} r={10} fill="none" stroke={BRASS} strokeWidth="1" />
              )}
            </g>
          );
        })()}

        {(() => {
          const [hx, hy] = polar(hrAngle, 88);
          const [mx, my] = polar(minAngle, 124);
          return (
            <g>
              <line x1={C} y1={C} x2={hx} y2={hy} stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
              <line x1={C} y1={C} x2={mx} y2={my} stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
              {smooth ? (
                <g className="sec-sweep" style={{ animationDelay: `-${secOffset.toFixed(3)}s` }}>
                  <line x1={C} y1={C + 24} x2={C} y2={C - 150} stroke={BRASS} strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />
                </g>
              ) : (
                (() => {
                  const [sx, sy] = polar(secAngle, 150);
                  const [st, sty] = polar(secAngle + 180, 24);
                  return <line x1={st} y1={sty} x2={sx} y2={sy} stroke={BRASS} strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />;
                })()
              )}
              <circle cx={C} cy={C} r={4.5} fill={BG} stroke={BRASS} strokeWidth="1.2" />
            </g>
          );
        })()}
      </svg>

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: "0.08em" }}>
          {pad(hours)}:{pad(minutes)}
          <span style={{ color: DIM, fontSize: 18 }}>:{pad(seconds)}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: DIM, letterSpacing: "0.12em" }}>
          THE HOUR IS{" "}
          <span className="note-label" style={{ color: BRASS, fontSize: 17, letterSpacing: 0 }}>
            {currentNote.label}
            {currentNote.sub ? ` / ${currentNote.sub}` : ""}
          </span>
          <span>{` (${currentNote.sig}, relative `}</span>
          <span className="note-label" style={{ fontSize: 15, fontStyle: "italic", letterSpacing: 0 }}>
            {currentNote.rel}
          </span>
          <span>)</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: BRASS, letterSpacing: "0.16em", minHeight: 16 }}>
          {touring && tourAnim?.mode === "spiral" && activeStep !== null && (
            <>
              PURE FIFTH {activeStep}
              {activeStep > 0 ? `: +${chainDrift(activeStep).toFixed(2)}¢` : ""}
              {activeStep === 12 ? ", MISSES C" : ""}
            </>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          fontSize: 11,
          color: DIM,
          letterSpacing: "0.16em",
          textAlign: "center",
        }}
      >
        PYTHAGOREAN COMMA: {" "}
        <span style={{ color: BRASS, letterSpacing: "0.04em" }}>
          {PYTHAGOREAN_COMMA_CENTS.toFixed(2)}¢
        </span>
      </div>

      <div className="controls">
        <button
          className={`btn btn-primary ${guided ? "active" : !guidedUsed ? "btn-invite" : ""}`}
          onClick={hearTheProblem}
          disabled={touring && !guided}
        >
          {guided === "spiral" ? "watching the comma..." : guided ? "listening, tap to stop" : "hear the comma"}
        </button>

        <div className="control-pair">
          <button
            className={`btn ${touring && lastTour === "circle" ? "active" : ""}`}
            onClick={() => runTour("circle")}
            disabled={touring || !!guided}
          >
            {touring && lastTour === "circle" ? "touring…" : "tour the circle"}
          </button>
          <button
            className={`btn ${touring && lastTour === "spiral" ? "active" : ""}`}
            onClick={() => runTour("spiral")}
            disabled={touring || !!guided}
          >
            {touring && lastTour === "spiral" ? "climbing…" : "climb the spiral"}
          </button>
        </div>

        <div className="control-pair">
          <button className={`btn ${dyad === "pure" ? "active" : ""}`} onClick={() => holdFifth("pure")} disabled={touring || !!guided}>
            pure fifth
          </button>
          <button className={`btn ${dyad === "tempered" ? "active" : ""}`} onClick={() => holdFifth("tempered")} disabled={touring || !!guided}>
            tempered fifth
          </button>
        </div>
      </div>

      <div
        key={captionKey}
        className="caption"
        aria-live="polite"
        style={{
          marginTop: 22,
          fontSize: 10,
          color: DIM,
          letterSpacing: "0.14em",
          textAlign: "center",
          maxWidth: 400,
          lineHeight: 1.8,
          minHeight: 54,
          textTransform: "uppercase",
          whiteSpace: "pre-line",
        }}
      >
        {captionText}
      </div>

    </div>
  );
}
