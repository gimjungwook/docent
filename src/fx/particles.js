// One shared, fixed, click-through canvas for every particle effect (burst, checkpoint confetti).
// The canvas exists only while particles are alive and removes itself afterwards.

import { token } from './motion.js';

let canvas = null;
let g = null;
let dpr = 1;
let raf = 0;
let last = 0;
const alive = [];

function mount() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-particles';
  canvas.setAttribute('aria-hidden', 'true');
  // Inline essentials so the overlay is safe even before components.css loads.
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483000' });
  document.body.appendChild(canvas);
  g = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function unmount() {
  if (!canvas) return;
  window.removeEventListener('resize', resize);
  canvas.remove();
  canvas = null;
  g = null;
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = document.documentElement.clientWidth;
  const h = window.innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Resolve token names (e.g. '--coral') to colours. */
export function palette(names) {
  return names.map((n) => (n.startsWith('--') ? token(n) : n)).filter(Boolean);
}

/**
 * Emit particles from a viewport point (clientX/clientY coordinates).
 * kind: 'spark' (short streaks), 'confetti' (tumbling paper), 'ring' (one expanding outline).
 * Returns { done: Promise<void>, clear() }.
 */
export function emit({
  x, y, kind = 'confetti', count = 24, colors = ['#000'],
  angle = -Math.PI / 2, spread = Math.PI * 2, speed = [220, 560], life = [700, 1100],
  gravity = null, size = [5, 9], radius = 0, ring = null,
} = {}) {
  if (typeof document === 'undefined') return { done: Promise.resolve(), clear() {} };
  mount();
  const group = { left: 0, resolve: null };
  group.done = new Promise((r) => { group.resolve = r; });
  const add = (p) => { p.group = group; group.left++; alive.push(p); };

  if (kind === 'ring') {
    add({ kind, x, y, r0: ring?.from ?? 6, r1: ring?.to ?? 60, width: ring?.width ?? 2, color: colors[0], age: 0, life: ring?.life ?? 520 });
  } else {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = rand(speed[0], speed[1]);
      const p = {
        kind, x: x + (radius ? Math.cos(a) * radius : 0), y: y + (radius ? Math.sin(a) * radius : 0),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        color: pick(colors), age: 0, life: rand(life[0], life[1]),
        gravity: gravity ?? (kind === 'spark' ? 260 : 1100),
      };
      if (kind === 'confetti') {
        p.w = rand(size[0], size[1]);
        p.h = p.w * rand(0.45, 0.7);
        p.rot = rand(0, Math.PI * 2);
        p.vr = rand(-9, 9);
        p.flip = rand(0, Math.PI * 2);
        p.vflip = rand(8, 16);
      } else {
        p.width = rand(1.5, 2.4);
        p.len = rand(0.028, 0.05);
      }
      add(p);
    }
  }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  return {
    done: group.done,
    clear() {
      for (let i = alive.length - 1; i >= 0; i--) if (alive[i].group === group) alive.splice(i, 1);
      group.left = 0;
      group.resolve();
      if (!alive.length) stopLoop();
    },
  };
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
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = alive.length - 1; i >= 0; i--) {
    const p = alive[i];
    p.age += dt * 1000;
    const t = p.age / p.life;
    if (t >= 1) {
      alive.splice(i, 1);
      if (--p.group.left <= 0) p.group.resolve();
      continue;
    }
    draw(p, t, dt);
  }
  g.globalAlpha = 1;
  if (alive.length) raf = requestAnimationFrame(tick);
  else stopLoop();
}

function draw(p, t, dt) {
  if (p.kind === 'ring') {
    const e = 1 - Math.pow(1 - t, 3);
    g.globalAlpha = (1 - t) * 0.9;
    g.strokeStyle = p.color;
    g.lineWidth = p.width * (1 - t * 0.6);
    g.beginPath();
    g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * e, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  const dragK = Math.exp(-(p.kind === 'spark' ? 4.2 : 2.4) * dt);
  p.vx *= dragK;
  p.vy = p.vy * dragK + p.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.kind === 'spark') {
    g.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    g.strokeStyle = p.color;
    g.lineWidth = p.width;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x - p.vx * p.len, p.y - p.vy * p.len);
    g.stroke();
    return;
  }
  // confetti: a small card that tumbles (flip scales one axis to fake depth)
  p.rot += p.vr * dt;
  p.flip += p.vflip * dt;
  g.globalAlpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rot);
  g.scale(1, Math.cos(p.flip));
  g.fillStyle = p.color;
  g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  g.restore();
}

/** Remove every particle now (used when seeking). */
export function clearParticles() {
  for (const p of alive) p.group.resolve();
  alive.length = 0;
  stopLoop();
}
