// Intro stings, one per look. Quiet, short, synthesized (see src/fx/sound.js).

import { registerSting } from '../../fx/sound.js';

// Cinema: a two-hit "ta-dum". A soft low tap, then a deep resonant landing with a little air on top.
registerSting('intro-cinema', ({ t, amp, voice, noise }) => {
  const h1 = t + 0.1;
  const h2 = t + 0.47;
  voice({ t: h1, freq: 70, to: 48, glide: 0.18, type: 'sine', gain: 0.22 * amp, attack: 0.004, decay: 0.42, send: 0.2 });
  voice({ t: h1, freq: 140, to: 100, glide: 0.12, type: 'triangle', gain: 0.05 * amp, attack: 0.003, decay: 0.2, send: 0.15, filter: { freq: 900 } });
  noise({ t: h1, dur: 0.05, gain: 0.025 * amp, type: 'bandpass', freq: 1800, q: 1.2, attack: 0.002, send: 0.1 });
  voice({ t: h2, freq: 62, to: 44, glide: 0.5, type: 'sine', gain: 0.25 * amp, attack: 0.005, decay: 1.7, send: 0.35 });
  voice({ t: h2, freq: 124, to: 96, glide: 0.45, type: 'triangle', gain: 0.06 * amp, attack: 0.005, decay: 1.4, send: 0.35, filter: { freq: 1400, to: 260, time: 1.3 } });
  voice({ t: h2, freq: 186, to: 146, glide: 0.45, type: 'triangle', gain: 0.03 * amp, attack: 0.005, decay: 1.2, send: 0.4, filter: { freq: 1200, to: 240, time: 1.1 } });
  noise({ t: h2 - 0.02, dur: 0.5, gain: 0.02 * amp, type: 'lowpass', freq: 520, to: 160, q: 0.5, attack: 0.01, send: 0.3 });
  voice({ t: h2 + 0.05, freq: 1244.5, type: 'sine', gain: 0.008 * amp, attack: 0.25, decay: 1.6, send: 0.6 });
  voice({ t: h2 + 0.05, freq: 1864.7, type: 'sine', gain: 0.005 * amp, attack: 0.3, decay: 1.5, send: 0.6 });
});

// Editorial: a soft felt-piano phrase, like opening a book.
registerSting('intro-editorial', ({ t, amp, voice, noise }) => {
  noise({ t, dur: 0.45, gain: 0.008 * amp, type: 'bandpass', freq: 3200, to: 1800, q: 0.7, attack: 0.12, send: 0.2 });
  const note = (at, f, g = 1) => {
    voice({ t: at, freq: f, type: 'sine', gain: 0.07 * amp * g, attack: 0.008, decay: 1.7, send: 0.4, filter: { freq: 2200, to: 900, time: 1.4 } });
    voice({ t: at, freq: f * 2, type: 'triangle', gain: 0.012 * amp * g, attack: 0.006, decay: 0.6, send: 0.3, filter: { freq: 2400 } });
  };
  note(t + 0.05, 329.63);
  note(t + 0.5, 440.0, 0.9);
  note(t + 0.52, 554.37, 0.6);
  note(t + 1.35, 659.25, 0.55);
});

// Playful: three bright blips as the shapes land, then a small bell.
registerSting('intro-playful', ({ t, amp, voice }) => {
  [523.25, 659.25, 783.99].forEach((f, i) => {
    voice({ t: t + i * 0.13, freq: f, to: f * 1.02, glide: 0.05, type: 'triangle', gain: 0.085 * amp, attack: 0.003, decay: 0.2, send: 0.2, pan: (i - 1) * 0.3 });
  });
  voice({ t: t + 1.2, freq: 1046.5, type: 'sine', gain: 0.075 * amp, attack: 0.004, decay: 1.3, send: 0.45 });
  voice({ t: t + 1.2, freq: 2637.0, type: 'sine', gain: 0.016 * amp, attack: 0.004, decay: 0.6, send: 0.4 });
});
