// Sound for Docent: synthesized WebAudio only, no audio files.
//   sting(name)      quiet stage stings (intro, chapter, checkpoint, outro) through a soft, compressed bus
//   playSfx(name)    short punchy effect sounds for the v2 effect library through their own limited bus
// Global mute: setMuted(true) (also on when the page URL has ?mute=1). Callers still decide with opts.sound.
// Levels sit well under the narration (about -16 LUFS): at normal intensity effect sounds peak at -14 to -20 dBFS
// and their loudest 400 ms stays at -25 LUFS or below; setVolume(0..1) scales everything (default 1).

let ctx = null;
let bus = null;
let muted = false;
let volume = 1;
try {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('mute') === '1') muted = true;
} catch { /* not a browser */ }

/** Silence every sting and effect sound (for example from a mute toggle). */
export function setMuted(value) { muted = !!value; }
export function isMuted() { return muted; }

const STING_LEVEL = 0.5;
const SFX_LEVEL = 0.26;

/** Overall volume for stings and effect sounds, 0 to 1 (default 1). */
export function setVolume(value) {
  volume = Math.min(1, Math.max(0, Number(value) || 0));
  if (bus && ctx) {
    bus.stingOut.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    bus.sfxOut.gain.setTargetAtTime(SFX_LEVEL * volume, ctx.currentTime, 0.02);
  }
}
export function getVolume() { return volume; }

/** The shared AudioContext, created lazily. Returns null where WebAudio is unavailable. */
export function audioContext() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
  }
  return ctx;
}

/** Call from a user gesture (Play button, lab buttons) so later sounds can play. */
export function unlockAudio() {
  const c = audioContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  return c;
}

function impulse(c, seconds = 2.2, decay = 3.4) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function graph(c) {
  if (bus) return bus;
  // Stings: gentle and compressed.
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 18;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  const master = c.createGain();
  master.gain.value = STING_LEVEL;
  const stingOut = c.createGain();
  stingOut.gain.value = volume;
  const dry = c.createGain();
  const send = c.createGain();
  const verb = c.createConvolver();
  verb.buffer = impulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.5;
  dry.connect(master);
  send.connect(verb).connect(wet).connect(master);
  master.connect(comp).connect(stingOut).connect(c.destination);
  // Effect sounds: punchy, with a fast limiter so peaks stay near -10 dBFS.
  const sfxIn = c.createGain();
  const sfxSend = c.createGain();
  const sfxVerb = c.createConvolver();
  sfxVerb.buffer = impulse(c, 0.9, 4.5);
  const sfxWet = c.createGain();
  sfxWet.gain.value = 0.35;
  const limit = c.createDynamicsCompressor();
  limit.threshold.value = -12;
  limit.knee.value = 3;
  limit.ratio.value = 14;
  limit.attack.value = 0.001;
  limit.release.value = 0.09;
  const sfxOut = c.createGain();
  sfxOut.gain.value = SFX_LEVEL * volume; // the limiter adds makeup gain; with TRIM below, peaks land at -14 to -20 dBFS
  sfxIn.connect(limit);
  sfxSend.connect(sfxVerb).connect(sfxWet).connect(limit);
  limit.connect(sfxOut).connect(c.destination);
  bus = { dry, send, master, stingOut, sfxOut, sfx: { dry: sfxIn, send: sfxSend } };
  return bus;
}

const route = (b, which) => (which === 'sfx' ? b.sfx : b);

/**
 * One oscillator note with an exponential envelope. Times in seconds (AudioContext time).
 * curve: optional array of frequency multipliers spread over the note (for bends and wobbles).
 */
export function voice(c, { t, freq, to = null, glide = 0.08, type = 'sine', gain = 0.12, attack = 0.005, decay = 0.6, send = 0.25, detune = 0, filter = null, pan = 0, curve = null, bus: which = 'sting' }) {
  const b = route(graph(c), which);
  const osc = c.createOscillator();
  osc.type = type;
  if (curve && curve.length > 1) {
    osc.frequency.setValueCurveAtTime(Float32Array.from(curve, (m) => Math.max(20, freq * m)), t, attack + decay);
  } else {
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + glide);
  }
  osc.detune.value = detune;
  let node = osc;
  if (filter) {
    const f = c.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + (filter.time ?? decay));
    f.Q.value = filter.q ?? 0.7;
    node.connect(f);
    node = f;
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  node.connect(g);
  let out = g;
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    out = p;
  }
  out.connect(b.dry);
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    out.connect(s).connect(b.send);
  }
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

let noiseBuf = null;
/** Filtered noise (whooshes, air, clicks). */
export function noise(c, { t, dur = 0.3, gain = 0.06, type = 'bandpass', freq = 1200, to = null, q = 0.8, attack = 0.01, send = 0.2, pan = 0, bus: which = 'sting' }) {
  const b = route(graph(c), which);
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
  let out = g;
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    out = p;
  }
  src.connect(f).connect(g);
  out.connect(b.dry);
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    out.connect(s).connect(b.send);
  }
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

// Run fn once the context is running; give up quietly if audio stays locked.
function whenRunning(c, fn) {
  if (c.state === 'running') { fn(); return; }
  const asked = performance.now();
  c.resume().then(() => { if (c.state === 'running' && performance.now() - asked < 250) fn(); }).catch(() => {});
}

const stings = new Map();

/** Register a named sting: fn({ c, t, amp, voice, noise }) schedules notes starting at AudioContext time t. */
export function registerSting(name, fn) {
  stings.set(name, fn);
}

/**
 * Play a named sting "delay" ms from now. amp scales loudness gently (pass opts.k.amp).
 * Does nothing if muted, if audio is locked or unavailable, or if the sting is unknown.
 */
export function sting(name, { delay = 0, amp = 1 } = {}) {
  const fn = stings.get(name);
  if (!fn || muted) return;
  const c = audioContext();
  if (!c) return;
  whenRunning(c, () => {
    try {
      graph(c);
      const a = Math.min(1.25, Math.max(0.5, amp));
      fn({ c, t: c.currentTime + 0.03 + delay / 1000, amp: a, voice: (o) => voice(c, o), noise: (o) => noise(c, o) });
    } catch (err) {
      console.warn('[docent sound]', err);
    }
  });
}

// ------------------------------------------------------------------ effect sounds (v2)
const rnd = (a, b) => a + Math.random() * (b - a);

const SFX = {
  // A bubble popping: a quick upward chirp with a click on top.
  pop({ t, v, n }) {
    v({ t, freq: 480, to: 1500, glide: 0.05, type: 'sine', gain: 0.9, attack: 0.002, decay: 0.09, send: 0.05 });
    v({ t, freq: 960, to: 2600, glide: 0.035, type: 'triangle', gain: 0.18, attack: 0.001, decay: 0.05, send: 0 });
    n({ t, dur: 0.018, gain: 0.3, type: 'highpass', freq: 3200, attack: 0.001, send: 0 });
  },
  // Air rushing past, sweeping left to right.
  whoosh({ t, n }) {
    n({ t, dur: 0.46, gain: 1.1, type: 'bandpass', freq: 380, to: 3000, q: 1.3, attack: 0.18, pan: -0.4, send: 0.15 });
    n({ t: t + 0.06, dur: 0.38, gain: 0.35, type: 'lowpass', freq: 1100, to: 260, q: 0.6, attack: 0.12, pan: 0.4, send: 0.1 });
  },
  // Something heavy landing.
  thud({ t, v, n }) {
    v({ t, freq: 140, to: 40, glide: 0.14, type: 'sine', gain: 1.2, attack: 0.003, decay: 0.3, send: 0.08 });
    v({ t, freq: 70, to: 36, glide: 0.2, type: 'sine', gain: 0.6, attack: 0.004, decay: 0.34, send: 0 });
    n({ t, dur: 0.09, gain: 0.6, type: 'lowpass', freq: 320, attack: 0.002, send: 0.05 });
  },
  // A bright little bell.
  chime({ t, v }) {
    [[1318.5, 0.55, 0.75], [3638.9, 0.16, 0.35], [7119.9, 0.06, 0.18]].forEach(([f, g, d]) => v({ t, freq: f, type: 'sine', gain: g, attack: 0.002, decay: d, send: 0.35 }));
    v({ t: t + 0.09, freq: 1975.5, type: 'sine', gain: 0.4, attack: 0.002, decay: 0.7, send: 0.35 });
  },
  // Ta-ta-ta-taaa: a short brassy victory phrase.
  fanfare({ t, v }) {
    [[523.25, 0, 0.09], [659.25, 0.1, 0.09], [783.99, 0.2, 0.09], [1046.5, 0.31, 0.5]].forEach(([f, at, d]) => {
      v({ t: t + at, freq: f, type: 'sawtooth', gain: 0.32, attack: 0.012, decay: d + 0.14, send: 0.25, filter: { freq: 3200, to: 1300, time: d + 0.12 } });
      v({ t: t + at, freq: f * 1.003, type: 'sawtooth', gain: 0.18, attack: 0.014, decay: d + 0.12, send: 0.2, filter: { freq: 2400 } });
      v({ t: t + at, freq: f / 2, type: 'triangle', gain: 0.22, attack: 0.01, decay: d + 0.08, send: 0.1 });
    });
  },
  // Firework crackle: a scatter of tiny bright snaps.
  crackle({ t, n }) {
    for (let i = 0; i < 26; i++) {
      n({ t: t + rnd(0, 0.62), dur: rnd(0.008, 0.03), gain: rnd(0.25, 0.8), type: 'highpass', freq: rnd(2400, 6000), q: 0.7, attack: 0.001, pan: rnd(-0.7, 0.7), send: 0.2 });
    }
  },
  // A few keyboard keys.
  typing({ t, v, n }) {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.07 + rnd(0, 0.02);
      n({ t: at, dur: 0.02, gain: 0.8, type: 'bandpass', freq: rnd(2300, 3600), q: 2.4, attack: 0.001, pan: rnd(-0.3, 0.3), send: 0.05 });
      v({ t: at, freq: rnd(170, 230), type: 'sine', gain: 0.35, attack: 0.001, decay: 0.035, send: 0 });
    }
  },
  // A broken signal: stuttering square blips and noise chops.
  glitch({ t, v, n }) {
    for (let i = 0; i < 10; i++) {
      const at = t + i * 0.034;
      v({ t: at, freq: rnd(180, 2200), type: 'square', gain: 0.22, attack: 0.001, decay: 0.026, send: 0, filter: { freq: 4200 } });
      if (i % 2) n({ t: at, dur: 0.024, gain: 0.55, type: 'bandpass', freq: rnd(900, 4200), q: 3, attack: 0.001, send: 0 });
    }
  },
  // A snare roll that swells into a hit.
  drumroll({ t, v, n }) {
    const len = 0.9;
    const hits = 28;
    for (let i = 0; i < hits; i++) {
      n({ t: t + (i / hits) * len, dur: 0.045, gain: 0.12 + 0.5 * (i / hits), type: 'bandpass', freq: 1900, q: 0.9, attack: 0.001, send: 0.1 });
    }
    n({ t: t + len, dur: 0.2, gain: 0.9, type: 'bandpass', freq: 1600, q: 0.7, attack: 0.002, send: 0.25 });
    v({ t: t + len, freq: 120, to: 52, glide: 0.1, type: 'sine', gain: 1.0, attack: 0.002, decay: 0.3, send: 0.1 });
  },
  // Tension building up.
  riser({ t, v, n }) {
    n({ t, dur: 0.86, gain: 0.6, type: 'bandpass', freq: 260, to: 3800, q: 1.2, attack: 0.72, send: 0.2 });
    v({ t, freq: 170, to: 880, glide: 0.86, type: 'sawtooth', gain: 0.2, attack: 0.76, decay: 0.1, send: 0.15, filter: { freq: 700, to: 4200, time: 0.86 } });
  },
  // A cartoon spring.
  boing({ t, v }) {
    const steps = 64;
    const curve = Array.from({ length: steps }, (_, i) => {
      const x = i / (steps - 1);
      return 1 + 1.4 * x + 0.22 * Math.sin(x * Math.PI * 2 * 7) * (1 - x);
    });
    v({ t, freq: 140, type: 'sine', gain: 0.9, attack: 0.004, decay: 0.42, send: 0.1, curve });
    v({ t, freq: 280, type: 'triangle', gain: 0.18, attack: 0.004, decay: 0.3, send: 0.05, curve });
  },
  // A laser zap.
  zap({ t, v }) {
    v({ t, freq: 2600, to: 150, glide: 0.2, type: 'square', gain: 0.56, attack: 0.001, decay: 0.22, send: 0.1, filter: { freq: 4500, to: 700, time: 0.2 } });
    v({ t, freq: 1900, to: 110, glide: 0.22, type: 'sawtooth', gain: 0.38, attack: 0.001, decay: 0.24, send: 0.05 });
  },
  // Tiny twinkles going up.
  sparkle({ t, v }) {
    const notes = [2093, 2637, 3136, 3520, 4186, 5274];
    notes.forEach((f, i) => v({ t: t + i * 0.052, freq: f * (1 + rnd(-0.01, 0.01)), type: 'sine', gain: 0.32, attack: 0.001, decay: 0.22, send: 0.35, pan: rnd(-0.5, 0.5) }));
  },
  // A rubber stamp slammed on paper.
  stamp({ t, v, n }) {
    v({ t, freq: 100, to: 46, glide: 0.08, type: 'sine', gain: 1.2, attack: 0.002, decay: 0.2, send: 0.05 });
    n({ t, dur: 0.07, gain: 0.9, type: 'lowpass', freq: 1500, attack: 0.001, send: 0.05 });
    n({ t: t + 0.004, dur: 0.025, gain: 0.45, type: 'highpass', freq: 4000, attack: 0.001, send: 0 });
  },
  // A woodblock tick.
  tick({ t, v, n }) {
    v({ t, freq: 1850, type: 'sine', gain: 0.7, attack: 0.001, decay: 0.04, send: 0.05 });
    n({ t, dur: 0.012, gain: 0.38, type: 'highpass', freq: 5000, attack: 0.001, send: 0 });
  },
};

export const SFX_NAMES = Object.keys(SFX);
const LOUD = { soft: 0.7, normal: 1, strong: 1.2 };
// Per-sound trims so bright, long sounds (chime, sparkle, fanfare) do not stand out over short ones.
const TRIM = { chime: 0.42, sparkle: 0.62, fanfare: 0.8, boing: 0.85, riser: 0.85, drumroll: 0.9, zap: 0.9, thud: 0.9 };

/**
 * Play a short effect sound: pop, whoosh, thud, chime, fanfare, crackle, typing, glitch, drumroll,
 * riser, boing, zap, sparkle, stamp, tick. { intensity } scales loudness; { delay } is in ms.
 * Callers only call this when opts.sound is true. Silent when muted or when audio is locked.
 */
export function playSfx(name, { intensity = 'normal', delay = 0 } = {}) {
  const fn = SFX[name];
  if (!fn || muted) return;
  const c = audioContext();
  if (!c) return;
  whenRunning(c, () => {
    try {
      graph(c);
      const amp = (LOUD[intensity] ?? 1) * (TRIM[name] ?? 1);
      const t = c.currentTime + 0.02 + Math.max(0, delay) / 1000;
      const v = (o) => voice(c, { ...o, gain: (o.gain ?? 0.1) * amp, bus: 'sfx' });
      const n = (o) => noise(c, { ...o, gain: (o.gain ?? 0.1) * amp, bus: 'sfx' });
      fn({ c, t, v, n });
    } catch (err) {
      console.warn('[docent sfx]', err);
    }
  });
}

// Paper-level v1 effects (pop, burst, flip, run, step) stay silent. Stage stings:

// Chapter: a low, soft landing with a breath of air before it.
registerSting('chapter', ({ t, amp: a0, voice, noise }) => {
  const amp = a0 * 0.8;
  noise({ t, dur: 0.42, gain: 0.03 * amp, type: 'bandpass', freq: 380, to: 1500, q: 0.6, attack: 0.3, send: 0.35 });
  voice({ t: t + 0.3, freq: 98, to: 61, glide: 0.32, type: 'sine', gain: 0.2 * amp, attack: 0.006, decay: 0.95, send: 0.3 });
  voice({ t: t + 0.3, freq: 196, to: 122, glide: 0.32, type: 'triangle', gain: 0.035 * amp, attack: 0.006, decay: 0.45, send: 0.2, filter: { freq: 900 } });
});

// Checkpoint: a light rising chime.
registerSting('checkpoint', ({ t, amp, voice }) => {
  [659.25, 830.61, 987.77, 1318.51].forEach((f, i) => {
    const at = t + i * 0.075;
    voice({ t: at, freq: f, type: 'sine', gain: 0.07 * amp, attack: 0.004, decay: 0.9 - i * 0.1, send: 0.4, pan: (i - 1.5) * 0.18 });
    voice({ t: at, freq: f * 2, type: 'triangle', gain: 0.012 * amp, attack: 0.004, decay: 0.35, send: 0.3 });
  });
});

// Outro: a warm, gently strummed chord that fades out.
registerSting('outro', ({ t, amp, voice }) => {
  [174.61, 220.0, 261.63, 329.63, 392.0].forEach((f, i) => {
    voice({ t: t + i * 0.04, freq: f, type: 'triangle', gain: 0.045 * amp, attack: 0.06, decay: 1.9, send: 0.45, filter: { freq: 1800, to: 600, time: 1.8 }, pan: (i - 2) * 0.12 });
  });
  voice({ t: t + 0.42, freq: 783.99, type: 'sine', gain: 0.03 * amp, attack: 0.02, decay: 1.3, send: 0.5 });
});
