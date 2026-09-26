// Motion vocabulary shared by every Docent effect.
// Values come from styles/tokens.css; this file adds no colours or sizes of its own.

const tokenCache = new Map();

/** Read a custom property from :root. Resolved values are cached; empty ones are retried later. */
export function token(name, fallback = '') {
  const hit = tokenCache.get(name);
  if (hit) return hit;
  let value = '';
  if (typeof document !== 'undefined' && document.documentElement) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  if (value) tokenCache.set(name, value);
  return value || fallback;
}

/** Easing strings for the Web Animations API (which cannot read var()). */
export const ease = {
  get out() { return token('--ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)'); },
  get inOut() { return token('--ease-in-out', 'cubic-bezier(0.65, 0, 0.35, 1)'); },
  get spring() { return token('--ease-spring', 'cubic-bezier(0.34, 1.56, 0.64, 1)'); },
  linear: 'linear',
};

/** Intensity scales time (duration multiplier), amplitude (distance/scale) and particle counts. */
export const INTENSITY = {
  soft: { time: 0.7, amp: 0.6, count: 0.55 },
  normal: { time: 1, amp: 1, count: 1 },
  strong: { time: 1.2, amp: 1.45, count: 1.7 },
};

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Normalise the opts object every fx receives (see SPEC section 6). Adds k = INTENSITY[intensity]. */
export function normalize(opts = {}) {
  const intensity = INTENSITY[opts.intensity] ? opts.intensity : 'normal';
  return {
    ...opts,
    mode: opts.mode === 'read' ? 'read' : 'play',
    intensity,
    reduced: typeof opts.reduced === 'boolean' ? opts.reduced : prefersReducedMotion(),
    sound: opts.sound === true,
    k: INTENSITY[intensity],
  };
}

let linearOk;
function linearSupported() {
  if (linearOk === undefined) {
    linearOk = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 0.5 50%, 1)') === true;
  }
  return linearOk;
}

const springCache = new Map();
/**
 * A damped spring as a CSS linear() easing, normalised so the animation's duration is the settle time.
 * bounce 0 = critically damped (no overshoot), 0.5 = lively. Falls back to --ease-spring.
 */
export function spring(bounce = 0.3) {
  const key = Math.round(bounce * 100);
  if (springCache.has(key)) return springCache.get(key);
  let value;
  if (!linearSupported()) {
    value = bounce > 0.05 ? ease.spring : ease.out;
  } else {
    const zeta = Math.min(0.999, Math.max(0.12, 1 - bounce));
    const w = 2 * Math.PI;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    const end = Math.log(1000) / (zeta * w); // envelope below 0.1 %
    const n = 56;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * end;
      const x = 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
      pts.push(i === n ? '1' : String(Math.round(x * 10000) / 10000));
    }
    value = 'linear(' + pts.join(', ') + ')';
  }
  springCache.set(key, value);
  return value;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
