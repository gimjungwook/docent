// Synthesized stings for the stage moments (intro, chapter, checkpoint, outro).
// WebAudio only, no audio files. Everything is short and quiet and runs through one soft bus.

let ctx = null;
let bus = null;

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

/** Call from a user gesture (Play button, lab buttons) so later stings can sound. */
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
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 18;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  const master = c.createGain();
  master.gain.value = 0.5;
  const dry = c.createGain();
  const send = c.createGain();
  const verb = c.createConvolver();
  verb.buffer = impulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.5;
  dry.connect(master);
  send.connect(verb).connect(wet).connect(master);
  master.connect(comp).connect(c.destination);
  bus = { dry, send, master };
  return bus;
}

/** One oscillator note with an exponential envelope. Times in seconds (AudioContext time). */
export function voice(c, { t, freq, to = null, glide = 0.08, type = 'sine', gain = 0.12, attack = 0.005, decay = 0.6, send = 0.25, detune = 0, filter = null, pan = 0 }) {
  const b = graph(c);
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + glide);
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
/** Filtered noise (whooshes, air, soft clicks). */
export function noise(c, { t, dur = 0.3, gain = 0.06, type = 'bandpass', freq = 1200, to = null, q = 0.8, attack = 0.01, send = 0.2 }) {
  const b = graph(c);
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
  src.connect(f).connect(g).connect(b.dry);
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    g.connect(s).connect(b.send);
  }
  src.start(t);
  src.stop(t + dur + 0.05);
}

const stings = new Map();

/** Register a named sting: fn({ c, t, amp, voice, noise }) schedules notes starting at AudioContext time t. */
export function registerSting(name, fn) {
  stings.set(name, fn);
}

/**
 * Play a named sting "delay" ms from now. amp scales loudness gently (pass opts.k.amp).
 * Does nothing if audio is locked or unavailable, or if the sting is unknown.
 */
export function sting(name, { delay = 0, amp = 1 } = {}) {
  const fn = stings.get(name);
  const c = audioContext();
  if (!fn || !c) return;
  const run = () => {
    try {
      graph(c);
      const a = Math.min(1.25, Math.max(0.5, amp));
      fn({ c, t: c.currentTime + 0.03 + delay / 1000, amp: a, voice: (o) => voice(c, o), noise: (o) => noise(c, o) });
    } catch (err) {
      console.warn('[docent sound]', err);
    }
  };
  if (c.state === 'running') { run(); return; }
  const asked = performance.now();
  c.resume().then(() => { if (c.state === 'running' && performance.now() - asked < 250) run(); }).catch(() => {});
}

// Paper-level effects (pop, burst, flip, run, step) are silent by design. Stage moments:

// Chapter: a low, soft landing with a breath of air before it.
registerSting('chapter', ({ t, amp, voice, noise }) => {
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
