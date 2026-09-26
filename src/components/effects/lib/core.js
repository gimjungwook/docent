// Shared plumbing for the v2 text and screen effects (owner: fx agent).
// Nothing here touches the DOM at import time. Effects build on the v1 motion kit:
// Timeline/instant/stop from src/fx/timeline.js, normalize/token/ease/spring from src/fx/motion.js,
// emit/palette from src/fx/particles.js (the shared spray canvas).

import { EFFECTS } from '../registry.js';
import { normalize, token, ease, spring, clamp, lerp } from '../../../fx/motion.js';
import { Timeline, instant, stop, setState, isRunning } from '../../../fx/timeline.js';
import { emit, palette, clearParticles } from '../../../fx/particles.js';

export { Timeline, instant, stop, setState, isRunning, normalize, token, ease, spring, clamp, lerp, emit, palette, clearParticles };

/** Duration factor per intensity (SPEC 12): soft 0.7, normal 1, strong 1.2. */
export const FACTOR = { soft: 0.7, normal: 1, strong: 1.2 };

const PARAM_KEYS = ['to', 'text', 'from', 'title', 'sub'];

/**
 * Normalised opts for one run: normalize() (mode, intensity, reduced, sound, k = { time, amp, count })
 * plus name, D (registry dur x intensity factor, 0 when reduced) and params (opts.params first, then data-*).
 */
export function setup(name, el, opts = {}) {
  const o = normalize(opts || {});
  const def = EFFECTS[name] || {};
  const params = {};
  if (el && el.dataset) {
    for (const key of new Set([...PARAM_KEYS, ...(def.params || [])])) {
      const v = el.dataset[key];
      if (v != null && v !== '') params[key] = v;
    }
  }
  if (opts && opts.params && typeof opts.params === 'object') {
    for (const [k, v] of Object.entries(opts.params)) if (v != null && v !== '') params[k] = v;
  }
  o.name = name;
  o.params = params;
  o.D = o.reduced ? 0 : Math.round((def.dur || 1000) * (FACTOR[o.intensity] || 1));
  return o;
}

// ---------------------------------------------------------------- sound
// sound.js is loaded lazily so a missing playSfx (or a broken sound module) never stops an effect.
let soundP = null;
function soundModule() {
  if (!soundP) soundP = import('../../../fx/sound.js').catch(() => null);
  return soundP;
}

/** Play a synthesized sfx now if opts.sound is on and src/fx/sound.js exports playSfx. */
export function sfx(o, name, extra) {
  if (!o || !o.sound) return;
  soundModule().then((m) => {
    try { if (m && typeof m.playSfx === 'function') m.playSfx(name, { intensity: o.intensity, ...(extra || {}) }); } catch (err) { /* sound is optional */ }
  });
}

/** Warm the sound module (call at the start of run so the first cue is not late). */
export function warmSound(o) { if (o && o.sound) soundModule(); }

// ---------------------------------------------------------------- geometry
export function byId(el) {
  return typeof el === 'string' ? document.getElementById(el) : el;
}

/**
 * The word a point anchor fires on. The compiler puts the empty span.fx-anchor inside its .u word
 * (usually the first child); older markup put it right before the word, so fall back to the next sibling.
 */
export function anchorWord(el) {
  if (!el) return null;
  const parent = el.parentElement;
  if (parent && parent.classList && parent.classList.contains('u')) return parent;
  let n = el.nextSibling;
  while (n && n.nodeType === 3 && !n.textContent.trim()) n = n.nextSibling;
  if (n) return n;
  return parent || el;
}

/** Bounding rect of an element or a text node (viewport coordinates). */
export function rectOf(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node.getBoundingClientRect();
  const r = document.createRange();
  r.selectNodeContents(node);
  return r.getBoundingClientRect();
}

export function viewportSize() {
  return { vw: document.documentElement.clientWidth || window.innerWidth, vh: window.innerHeight };
}

/**
 * Centre of the word a point effect fires on, in viewport coordinates, clamped into the viewport
 * (pad px from the edges) so the effect is always visible. rect is the unclamped word box.
 */
export function anchorPoint(el, pad = 24) {
  const word = anchorWord(el);
  let r = rectOf(word);
  if (!r || (!r.width && !r.height)) r = el.getBoundingClientRect();
  const { vw, vh } = viewportSize();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return {
    x: clamp(cx, pad, Math.max(pad, vw - pad)),
    y: clamp(cy, pad, Math.max(pad, vh - pad)),
    rect: r, word, vw, vh,
    onScreen: cy >= 0 && cy <= vh && cx >= 0 && cx <= vw,
  };
}

// ---------------------------------------------------------------- overlays
// One fixed, click-through layer for DOM overlays (flash, wipe, stamp, callout bubbles...). It exists only
// while an overlay is alive. The v2 canvas (lib/canvas.js) sits above it and the v1 spray canvas above that.
let layer = null;

export function overlay(className, html) {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, { position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', pointerEvents: 'none', zIndex: '2147481000', overflow: 'hidden' });
    document.body.appendChild(layer);
  }
  const node = document.createElement('div');
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  layer.appendChild(node);
  return node;
}

export function unoverlay(node) {
  if (node && node.parentNode) node.parentNode.removeChild(node);
  if (layer && !layer.childElementCount) {
    layer.remove();
    layer = null;
  }
}

/** The page surface that screen effects may move (shake, punch): the closest main, else the first main. */
export function pageOf(el) {
  return (el && el.closest && el.closest('main')) || document.querySelector('main') || null;
}

// While the page is scaled or shaken, clip horizontal overflow on the root so no scrollbar flashes.
let clipCount = 0;
let clipPrev = '';
export function clipX() {
  const de = document.documentElement;
  if (clipCount++ === 0) {
    clipPrev = de.style.overflowX;
    de.style.overflowX = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--clipCount <= 0) {
      clipCount = 0;
      de.style.overflowX = clipPrev;
    }
  };
}

// ---------------------------------------------------------------- time
/** Drive a JS animation for dur ms: fn(p, ms) with p in [0, 1]; fn(1) always runs last unless stopped. */
export function frames(fn, dur) {
  let raf = 0;
  let stopped = false;
  const t0 = performance.now();
  const tick = (now) => {
    if (stopped) return;
    const ms = now - t0;
    const p = dur > 0 ? Math.min(1, ms / dur) : 1;
    try { fn(p, ms); } catch (err) { stopped = true; console.error('[docent fx]', err); return; }
    if (p < 1) raf = requestAnimationFrame(tick);
    else stopped = true;
  };
  try { fn(0, 0); } catch (err) { console.error('[docent fx]', err); }
  raf = requestAnimationFrame(tick);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}

/** Easing functions for JS-driven motion (canvas, rAF). t in [0, 1]. */
export const E = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** Map p from [a, b] to [0, 1] (clamped). Handy for phases inside one duration. */
export const phase = (p, a, b) => (b <= a ? (p >= b ? 1 : 0) : clamp((p - a) / (b - a), 0, 1));

// ---------------------------------------------------------------- randomness and colour
/** Deterministic random numbers from a string (so settle() redraws the same hand-drawn shape). */
export function seeded(str = '') {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Token colours by short name, resolved once per call from styles/tokens.css. */
export function colors() {
  return {
    ink: token('--ink', '#16181d'), ink2: token('--ink-2', '#3a404b'), ink3: token('--ink-3', '#6a7180'), ink4: token('--ink-4', '#9aa0ab'),
    paper: token('--paper', '#fbfaf6'), paper2: token('--paper-2', '#f3f1ea'), paper3: token('--paper-3', '#e9e6dc'),
    stage: token('--stage', '#0b0d12'), stage2: token('--stage-2', '#141821'), stage3: token('--stage-3', '#1e2430'),
    stageInk: token('--stage-ink', '#f4f1e8'), stageInk2: token('--stage-ink-2', '#a8aebb'),
    accent: token('--accent', '#2c5fe0'), accentSoft: token('--accent-soft', '#e6edff'),
    marker: token('--marker', '#ffe25a'), markerSoft: token('--marker-soft', '#fff4bf'),
    gold: token('--gold', '#f3c33f'), coral: token('--coral', '#ff5b37'), mint: token('--mint', '#16a36f'), danger: token('--danger', '#d6423f'),
    codeStr: token('--code-str', '#a5d66f'), codeFn: token('--code-fn', '#82a8ff'), codeKw: token('--code-kw', '#ff9e64'), codeNum: token('--code-num', '#f3c33f'),
  };
}

/** The party palette used by confetti-like effects. */
export function party() {
  const c = colors();
  return [c.coral, c.marker, c.accent, c.mint, c.gold];
}

/** "#rrggbb" + alpha -> rgba() string (tokens are hex). */
export function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
