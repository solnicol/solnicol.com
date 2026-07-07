export const getAudioEngine = (audioEngineRef) => {
  if (!audioEngineRef.current) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Master limiter: overlapping strikes sum their gains, and anything past
    // 0 dBFS clips harshly. A hard-ratio compressor catches spikes gracefully.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.005;
    limiter.connect(ctx.destination);
    audioEngineRef.current = { ctx, destination: limiter };
  }

  if (audioEngineRef.current.ctx.state === "suspended") {
    audioEngineRef.current.ctx.resume();
  }

  return audioEngineRef.current;
};

export const closeAudioEngine = (audioEngineRef) => {
  if (audioEngineRef.current?.ctx) {
    audioEngineRef.current.ctx.close();
    audioEngineRef.current = null;
  }
};

export const playStrike = ({ engine, frequency, when = 0, duration = 2.4 }) => {
  const { ctx, destination } = engine;
  const t = ctx.currentTime + when;
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(destination);

  const partials = [
    { ratio: 1, gain: 0.5 },
    { ratio: 2.0, gain: 0.18 },
    { ratio: 2.98, gain: 0.09 },
    { ratio: 4.2, gain: 0.04 },
  ].filter((partial) => frequency * partial.ratio < 12000);

  partials.forEach((partial) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency * partial.ratio;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(partial.gain, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration * (1 - partial.ratio * 0.12));
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration);
  });

  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, t + duration);
};

export const fadeOutDyad = (engine, dyadNodes) => {
  const { ctx } = engine;
  const t = ctx.currentTime;
  dyadNodes.master.gain.cancelScheduledValues(t);
  dyadNodes.master.gain.setValueAtTime(Math.max(dyadNodes.master.gain.value, 0.0001), t);
  dyadNodes.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  dyadNodes.oscs.forEach((osc) => osc.stop(t + 0.45));
};

export const startHeldFifth = ({ engine, kind, c4Freq, g4Et }) => {
  const { ctx, destination } = engine;
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.5, t + 0.6);
  master.connect(destination);

  const oscs = [];
  // Exact integer harmonics, so the beat between 3xC and 2xG emerges from
  // the tuning itself rather than from a separate effect.
  const freqs = [c4Freq, kind === "pure" ? c4Freq * 1.5 : g4Et];
  const harmonicGains = [0.3, 0.1, 0.05];

  freqs.forEach((frequency) => {
    harmonicGains.forEach((gainValue, harmonic) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency * (harmonic + 1);
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      oscs.push(osc);
    });
  });

  return { master, oscs };
};
