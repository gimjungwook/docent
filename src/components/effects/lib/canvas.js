// The v2 effect canvas: one fixed, click-through canvas for the richer screen effects (fireworks, streamers,
// comet, balloons, code rain, confetti rain, sparkles, dust). Effects add "actors"; each actor is a step
// function called every frame, and the canvas removes itself when the last actor ends.
// The v1 spray canvas (src/fx/particles.js, emit()) keeps doing simple sprays and sits above this one.

let cv = null;
let g = null;
let dpr = 1;
let raf = 0;
let last = 0;
let W = 0;
let H = 0;
const actors = new Set();

function resize() {
  if (!cv) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = document.documentElement.clientWidth || window.innerWidth;
  H = window.innerHeight;
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
}

function mount() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.className = 'fx-canvas';
  cv.setAttribute('aria-hidden', 'true');
  Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147482000' });
  document.body.appendChild(cv);
  g = cv.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function unmount() {
  if (!cv) return;
  window.removeEventListener('resize', resize);
  cv.remove();
  cv = null;
  g = null;
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  unmount();
}

function tick(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  if (!g) { raf = 0; return; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const list = Array.from(actors).sort((a, b) => a.layer - b.layer);
  for (const a of list) {
    let alive = false;
    g.save();
    try {
      alive = a.step(g, dt, now - a.t0, W, H) !== false;
    } catch (err) {
      console.error('[docent fx] canvas actor', err);
      alive = false;
    }
    g.restore();
    if (!alive) {
      actors.delete(a);
      a.resolve();
    }
  }
  if (actors.size) raf = requestAnimationFrame(tick);
  else stopLoop();
}

/**
 * Add an actor: step(g, dt, ms, W, H) draws one frame (dt in seconds since the last frame, ms since the actor
 * started, W/H the viewport in CSS px) and returns false when it is finished. Lower layer draws first.
 * Returns { done: Promise<void>, remove() }.
 */
export function addActor(step, { layer = 0 } = {}) {
  if (typeof document === 'undefined') return { done: Promise.resolve(), remove() {} };
  mount();
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const a = { step, layer, t0: performance.now(), resolve };
  actors.add(a);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  return {
    done,
    remove() {
      if (actors.delete(a)) a.resolve();
      if (!actors.size) stopLoop();
    },
  };
}

/** Remove every actor now (used when seeking). */
export function clearCanvas() {
  for (const a of actors) a.resolve();
  actors.clear();
  stopLoop();
}

export function canvasSize() {
  return { W: W || document.documentElement.clientWidth || window.innerWidth, H: H || window.innerHeight };
}

// ---------------------------------------------------------------- shapes
/** An n-point star path (not filled). */
export function starPath(g, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R;
    const a = rot + (i * Math.PI) / n;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}

/** A four-point twinkle (curved sides) path, the classic sparkle glyph. */
export function twinklePath(g, x, y, r, rot = 0) {
  const k = 0.18 * r;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    const b = a + Math.PI / 4;
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    const nx = x + Math.cos(a + Math.PI / 2) * r;
    const ny = y + Math.sin(a + Math.PI / 2) * r;
    const cx = x + Math.cos(b) * k;
    const cy = y + Math.sin(b) * k;
    if (i === 0) g.moveTo(tx, ty);
    g.quadraticCurveTo(cx, cy, nx, ny);
  }
  g.closePath();
}
