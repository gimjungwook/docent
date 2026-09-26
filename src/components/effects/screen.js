// Docent v2 screen effects (group "screen", kind "point"): moments of result, success and warning.
// Owner: fx agent. Markup (compiler, SPEC 12): an empty <span class="fx-anchor" data-fx="NAME" id="…"
// data-text="…" data-title="…" data-sub="…"></span> inside the .u word it fires on. Position comes from that
// word (anchorPoint); screen-wide effects ignore it. Nothing here lasts: after the effect the page is exactly
// as before, every overlay and canvas actor is removed, and finish() jumps to that clean end.
// Colours come from styles/tokens.css only (the v1 burst palette for celebrations).

import { setup, sfx, warmSound, Timeline, instant, stop, E, frames, phase, colors, party, overlay, unoverlay, anchorPoint, pageOf, clipX, viewportSize, clamp, lerp, rand, pick, emit, alpha, byId } from './lib/core.js';
import { addActor, canvasSize, twinklePath } from './lib/canvas.js';

const cleanups = new WeakMap();

function onClean(el, fn) {
  const list = cleanups.get(el) || [];
  list.push(fn);
  cleanups.set(el, list);
}

function clean(el) {
  const list = cleanups.get(el);
  if (!list) return;
  cleanups.delete(el);
  for (const fn of list.reverse()) {
    try { fn(); } catch (err) { console.error('[docent fx]', err); }
  }
}

function point(name, build) {
  return {
    prime(el) { el = byId(el); if (el) { stop(el, 'finish'); clean(el); } },
    settle(el) { el = byId(el); if (el) { stop(el, 'finish'); clean(el); } },
    reset(el) { el = byId(el); if (el) { stop(el, 'finish'); clean(el); } },
    run(el, opts) {
      el = byId(el);
      if (!el) return instant();
      const o = setup(name, el, opts || {});
      stop(el, 'finish');
      clean(el);
      if (o.reduced) return instant();
      warmSound(o);
      const tl = new Timeline(el);
      build(tl, el, o);
      tl.hold(o.D);
      tl.then(() => clean(el));
      return tl.play();
    },
  };
}

/** Run a canvas actor for this effect; it is removed when the effect ends or is finished early. */
function actor(el, step, layer = 0) {
  const h = addActor(step, { layer });
  onClean(el, () => h.remove());
  return h;
}

/** Keep a v1 spray handle so finish() can clear it. */
function spray(el, opts) {
  const h = emit(opts);
  onClean(el, () => h.clear());
  return h;
}

function layer(el, cls, html) {
  const node = overlay(cls, html);
  onClean(el, () => unoverlay(node));
  return node;
}

/** Shake the page (the closest main) with decaying offsets. */
function shakePage(tl, el, { at = 0, dur, amp = 10, rot = 0.6, n = 14 }) {
  const page = pageOf(el);
  if (!page || dur <= 0) return;
  const frames = [{ offset: 0, transform: 'translate(0px, 0px) rotate(0deg)' }];
  for (let i = 1; i < n; i++) {
    const k = Math.pow(1 - i / n, 1.6);
    const sx = i % 2 ? 1 : -1;
    frames.push({
      offset: i / n, easing: 'cubic-bezier(.4,0,.6,1)',
      transform: 'translate(' + (sx * amp * k * rand(0.6, 1)).toFixed(2) + 'px, ' + (rand(-0.55, 0.55) * amp * k).toFixed(2) + 'px) rotate(' + (rand(-1, 1) * rot * k).toFixed(3) + 'deg)',
    });
  }
  frames.push({ offset: 1, transform: 'translate(0px, 0px) rotate(0deg)' });
  tl.to(page, frames, { at, dur });
  // Clip horizontal overflow from the start of the effect (a timer could land a frame after the shake begins),
  // and pivot around the middle of the screen, not the middle of a (much taller) page.
  const release = clipX();
  onClean(el, release);
  const r = page.getBoundingClientRect();
  const { vw, vh } = viewportSize();
  const prevOrigin = page.style.transformOrigin;
  page.style.transformOrigin = (vw / 2 - r.left).toFixed(1) + 'px ' + (vh / 2 - r.top).toFixed(1) + 'px';
  onClean(el, () => { page.style.transformOrigin = prevOrigin; });
  tl.cue(() => {
    const t = setTimeout(release, dur + 40);
    onClean(el, () => clearTimeout(t));
  }, at);
}

function topSafe() {
  const bar = document.querySelector('.topbar');
  return Math.max(12, (bar ? bar.getBoundingClientRect().bottom : 0) + 12);
}

// ------------------------------------------------------------------ confetti: a party popper from the word
const confetti = point('confetti', (tl, el, o) => {
  const p = anchorPoint(el);
  const D = o.D;
  const a = o.k.amp;
  const n = o.k.count;
  const cols = party();
  const c = colors();
  const life = [D * 0.7, D * 0.94];
  tl.cue(() => {
    spray(el, { x: p.x, y: p.y, kind: 'ring', colors: [c.coral], ring: { from: 8, to: 70 + 50 * a, width: 3, life: D * 0.4 } });
    spray(el, { x: p.x, y: p.y, kind: 'spark', count: Math.round(20 * n), colors: [c.coral, c.gold, c.marker], spread: Math.PI * 2, speed: [380 * a, 760 * a], life: [D * 0.22, D * 0.38], radius: 8 });
    spray(el, { x: p.x - 6, y: p.y, kind: 'confetti', count: Math.round(46 * n), colors: cols, angle: -Math.PI / 2 - 0.55, spread: 0.75, speed: [700 * a, 1250 * a], life, size: [6, 11] });
    spray(el, { x: p.x + 6, y: p.y, kind: 'confetti', count: Math.round(46 * n), colors: cols, angle: -Math.PI / 2 + 0.55, spread: 0.75, speed: [700 * a, 1250 * a], life, size: [6, 11] });
    sfx(o, 'pop');
  }, 0);
  tl.cue(() => {
    spray(el, { x: p.x, y: p.y - 4, kind: 'confetti', count: Math.round(34 * n), colors: cols, angle: -Math.PI / 2, spread: Math.PI * 1.1, speed: [380 * a, 820 * a], life: [D * 0.62, D * 0.9], size: [5, 9] });
  }, D * 0.05);
});

// ------------------------------------------------------------------ fireworks: rockets and bursts over the page
const fireworks = point('fireworks', (tl, el, o) => {
  const p = anchorPoint(el);
  const D = o.D;
  const a = o.k.amp;
  const c = colors();
  const hues = [c.coral, c.accent, c.mint, c.gold, c.danger, c.accent];
  tl.cue(() => {
    const { W, H } = canvasSize();
    const n = 3 + Math.round(2 * o.k.count);
    const rockets = [];
    for (let i = 0; i < n; i++) {
      const launch = Math.max(0, D * 0.42 * (n > 1 ? i / (n - 1) : 0) + rand(-40, 40));
      const x0 = clamp(p.x + rand(-0.4, 0.4) * Math.min(W, 900), 40, W - 40);
      rockets.push({
        launch, flight: D * rand(0.19, 0.25), x0, y0: H + 12,
        // burst above the reading line (38% of the screen) so the sentence being read stays clear
        x1: clamp(x0 + rand(-70, 70), 40, W - 40), y1: H * rand(0.1, 0.3),
        color: hues[i % hues.length], alt: hues[(i + 2) % hues.length], ring: i % 3 === 1,
        trail: [], burst: false,
      });
    }
    const sparks = [];
    const flashes = [];
    actor(el, (g, dt, ms) => {
      for (const r of rockets) {
        if (r.burst || ms < r.launch) continue;
        const t = (ms - r.launch) / r.flight;
        if (t < 1) {
          const x = lerp(r.x0, r.x1, t);
          const y = lerp(r.y0, r.y1, E.outCubic(t));
          r.trail.push([x, y]);
          if (r.trail.length > 12) r.trail.shift();
          continue;
        }
        r.burst = true;
        const left = D - ms - 40;
        if (left < 200) continue;
        const count = Math.round(60 * o.k.count);
        const vmax = rand(280, 360) * a;
        for (let k = 0; k < count; k++) {
          const ang = (k / count) * Math.PI * 2 + rand(-0.08, 0.08);
          const v = vmax * (r.ring ? rand(0.92, 1) : Math.sqrt(rand(0.12, 1)));
          sparks.push({ x: r.x1, y: r.y1, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, age: 0, life: Math.min(left, rand(0.85, 1.15) * D * 0.42), color: k % 4 === 0 ? r.alt : r.color, w: rand(2.2, 3.4) });
        }
        flashes.push({ x: r.x1, y: r.y1, age: 0, life: 220, color: r.color });
        sfx(o, 'crackle');
      }
      // rockets on the way up
      for (const r of rockets) {
        if (r.burst || r.trail.length < 2) continue;
        for (let i = 1; i < r.trail.length; i++) {
          g.globalAlpha = i / r.trail.length;
          g.strokeStyle = r.color;
          g.lineWidth = 2.2;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(r.trail[i - 1][0], r.trail[i - 1][1]);
          g.lineTo(r.trail[i][0], r.trail[i][1]);
          g.stroke();
        }
        const [hx, hy] = r.trail[r.trail.length - 1];
        g.globalAlpha = 1;
        g.fillStyle = r.color;
        g.beginPath();
        g.arc(hx, hy, 3, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.age += dt * 1000;
        const t = f.age / f.life;
        if (t >= 1) { flashes.splice(i, 1); continue; }
        const rad = 30 + 70 * E.outCubic(t);
        const grad = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
        grad.addColorStop(0, alpha(f.color, 0.35 * (1 - t)));
        grad.addColorStop(1, alpha(f.color, 0));
        g.globalAlpha = 1;
        g.fillStyle = grad;
        g.beginPath();
        g.arc(f.x, f.y, rad, 0, Math.PI * 2);
        g.fill();
      }
      const drag = Math.exp(-1.7 * dt);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt * 1000;
        const t = s.age / s.life;
        if (t >= 1) { sparks.splice(i, 1); continue; }
        s.vx *= drag;
        s.vy = s.vy * drag + 230 * dt;
        const px = s.x;
        const py = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const twinkle = t > 0.6 ? (Math.random() < 0.3 ? 0.35 : 1) : 1;
        g.globalAlpha = Math.pow(1 - t, 1.1) * twinkle;
        g.strokeStyle = s.color;
        g.lineWidth = s.w * (1 - t * 0.5);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(px - s.vx * 0.05, py - s.vy * 0.05);
        g.lineTo(s.x, s.y);
        g.stroke();
      }
      return ms < D;
    });
  }, 0);
  tl.cue(() => sfx(o, 'whoosh'), 0);
});

// ------------------------------------------------------------------ sparkle: twinkles around the word
const sparkle = point('sparkle', (tl, el, o) => {
  const p = anchorPoint(el);
  const D = o.D;
  const a = o.k.amp;
  const c = colors();
  const cols = [c.gold, c.gold, c.coral, c.gold, c.accent];
  tl.cue(() => {
    const rx = p.rect.width / 2 + 26;
    const ry = p.rect.height / 2 + 20;
    const N = 4 + Math.round(10 * o.k.count);
    const items = [];
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + rand(-0.3, 0.3);
      const far = rand(0.85, 1.7);
      const start = rand(0, 0.5) * D;
      items.push({
        x: p.x + Math.cos(ang) * rx * far, y: p.y + Math.sin(ang) * ry * far,
        r: rand(6, 12) * (0.8 + 0.3 * a), start, life: Math.min(D - start - 20, rand(0.34, 0.48) * D),
        rot: rand(0, Math.PI), spin: rand(-1.6, 1.6), color: pick(cols), rise: rand(4, 14),
      });
    }
    const glints = [];
    for (let i = 0; i < Math.round(12 * o.k.count); i++) {
      const ang = rand(0, Math.PI * 2);
      const start = rand(0.05, 0.6) * D;
      glints.push({ x: p.x + Math.cos(ang) * rx * rand(0.6, 2), y: p.y + Math.sin(ang) * ry * rand(0.6, 2), start, life: Math.min(D - start - 20, rand(0.18, 0.3) * D), color: pick(cols) });
    }
    actor(el, (g, dt, ms) => {
      for (const s of items) {
        const t = (ms - s.start) / s.life;
        if (t < 0 || t > 1) continue;
        const k = t < 0.34 ? E.outBack(t / 0.34, 2.2) : 1 - E.inCubic((t - 0.34) / 0.66);
        g.globalAlpha = 1;
        g.fillStyle = s.color;
        twinklePath(g, s.x, s.y - s.rise * t, Math.max(0.1, s.r * k), s.rot + s.spin * t);
        g.fill();
      }
      for (const s of glints) {
        const t = (ms - s.start) / s.life;
        if (t < 0 || t > 1) continue;
        g.globalAlpha = Math.sin(t * Math.PI);
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      return ms < D;
    });
    sfx(o, 'sparkle');
  }, 0);
});

// ------------------------------------------------------------------ shockwave: rings from the key word
const shockwave = point('shockwave', (tl, el, o) => {
  const p = anchorPoint(el);
  const D = o.D;
  const a = o.k.amp;
  const c = colors();
  tl.cue(() => {
    const { W, H } = canvasSize();
    const R = Math.min(Math.hypot(W, H) * 0.34, 520) * (0.75 + 0.25 * a);
    const rings = [
      { at: 0, dur: 0.6, r: R, w: 9 * a, color: c.coral, al: 0.95 },
      { at: 0.08, dur: 0.7, r: R * 1.35, w: 4.5 * a, color: c.coral, al: 0.6 },
      { at: 0.16, dur: 0.78, r: R * 1.7, w: 2.5, color: c.ink3, al: 0.45 },
    ];
    actor(el, (g, dt, ms) => {
      const p0 = ms / D;
      const td = phase(p0, 0, 0.26);
      if (td < 1) {
        const rad = 24 + 90 * E.outCubic(td);
        const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        grad.addColorStop(0, alpha(c.coral, 0.32 * (1 - td)));
        grad.addColorStop(1, alpha(c.coral, 0));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(p.x, p.y, rad, 0, Math.PI * 2);
        g.fill();
      }
      for (const ring of rings) {
        const t = phase(p0, ring.at, ring.at + ring.dur);
        if (t <= 0 || t >= 1) continue;
        g.globalAlpha = ring.al * Math.pow(1 - t, 1.4);
        g.strokeStyle = ring.color;
        g.lineWidth = Math.max(0.5, ring.w * (1 - t * 0.85));
        g.beginPath();
        g.arc(p.x, p.y, 10 + ring.r * E.outExpo(t), 0, Math.PI * 2);
        g.stroke();
      }
      return ms < D;
    });
    spray(el, { x: p.x, y: p.y, kind: 'spark', count: Math.round(22 * o.k.count), colors: [c.coral, c.gold, c.ink3], spread: Math.PI * 2, speed: [420 * a, 860 * a], life: [D * 0.28, D * 0.46], radius: 12 });
    sfx(o, 'thud');
  }, 0);
  shakePage(tl, el, { at: 0, dur: D * 0.36, amp: 4 * a, rot: 0.15, n: 8 });
});

// ------------------------------------------------------------------ flash: the "aha" moment
const flash = point('flash', (tl, el, o) => {
  const p = anchorPoint(el);
  const D = o.D;
  const a = o.k.amp;
  const c = colors();
  const ov = layer(el, 'fx-flash');
  ov.style.background = 'radial-gradient(circle at ' + p.x.toFixed(1) + 'px ' + p.y.toFixed(1) + 'px, ' + c.paper + ' 0%, ' + c.paper + ' 18%, ' + alpha(c.paper, 0.9) + ' 42%, ' + alpha(c.paper, 0.78) + ' 100%)';
  tl.to(ov, [
    { opacity: 0, easing: 'cubic-bezier(.2,0,.1,1)' },
    { opacity: 1, offset: 0.07, easing: 'linear' },
    { opacity: 1, offset: 0.16, easing: 'cubic-bezier(.2,.6,.3,1)' },
    { opacity: 0 },
  ], { dur: D });
  tl.cue(() => {
    const rays = 14;
    const r0 = Math.max(p.rect.width, p.rect.height) / 2 + 10;
    actor(el, (g, dt, ms) => {
      const t = ms / D;
      if (t >= 1) return false;
      const e = E.outExpo(t);
      g.globalAlpha = Math.pow(1 - t, 1.3);
      g.strokeStyle = c.gold;
      g.lineCap = 'round';
      g.lineWidth = 3 * a * (1 - t * 0.6);
      for (let i = 0; i < rays; i++) {
        const ang = (i / rays) * Math.PI * 2 + 0.2;
        const len = (i % 2 ? 26 : 44) * a;
        const d0 = r0 + e * 70 * a;
        g.beginPath();
        g.moveTo(p.x + Math.cos(ang) * d0, p.y + Math.sin(ang) * d0);
        g.lineTo(p.x + Math.cos(ang) * (d0 + len * (1 - t * 0.5)), p.y + Math.sin(ang) * (d0 + len * (1 - t * 0.5)));
        g.stroke();
      }
      return true;
    }, 1);
    sfx(o, 'zap');
  }, 0);
});

// ------------------------------------------------------------------ vignette: the edges close in (tension)
const vignette = point('vignette', (tl, el, o) => {
  const p = anchorPoint(el);
  const D = o.D;
  const a = o.k.amp;
  const c = colors();
  const ov = layer(el, 'fx-vignette');
  const dark = alpha(c.stage, Math.min(0.94, 0.72 + 0.12 * a));
  tl.cue(() => {
    const loop = frames((t) => {
      const { vw, vh } = viewportSize();
      const inP = E.outCubic(phase(t, 0, 0.3));
      const outP = E.inOutCubic(phase(t, 0.8, 1));
      const beat = phase(t, 0.34, 0.76);
      const pulse = beat > 0 && beat < 1 ? Math.pow(Math.sin(beat * Math.PI * 2), 8) * 0.07 + Math.pow(Math.sin((beat - 0.12) * Math.PI * 2), 8) * 0.05 : 0;
      const k = lerp(1.7, 0.74, inP) - pulse + outP * 1.1;
      const rx = vw * 0.62 * k;
      const ry = vh * 0.62 * k;
      ov.style.opacity = (phase(t, 0, 0.14) * (1 - outP)).toFixed(3);
      ov.style.background = 'radial-gradient(' + rx.toFixed(1) + 'px ' + ry.toFixed(1) + 'px at ' + p.x.toFixed(1) + 'px ' + p.y.toFixed(1) + 'px, transparent 34%, ' + dark + ' 100%)';
    }, D);
    onClean(el, () => loop.stop());
    sfx(o, 'riser');
  }, 0);
});

// ------------------------------------------------------------------ stamp: a result stamped onto the screen
const STAMP_DEFAULT = '좋아요!';
const stamp = point('stamp', (tl, el, o) => {
  const p = anchorPoint(el);
  const D = o.D;
  const a = o.k.amp;
  const c = colors();
  const label = o.params.text != null && String(o.params.text).trim() ? String(o.params.text) : STAMP_DEFAULT;
  const node = layer(el, 'fx-stamp', '<div class="fx-stamp-in"><span class="fx-stamp-text"></span></div>');
  node.querySelector('.fx-stamp-text').textContent = label;
  const inner = node.firstChild;
  const { vw, vh } = viewportSize();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const x = clamp(p.x - w / 2, 12, Math.max(12, vw - 12 - w));
  const y = clamp(p.y - h / 2, topSafe(), Math.max(topSafe(), vh - h - 90));
  node.style.left = x.toFixed(1) + 'px';
  node.style.top = y.toFixed(1) + 'px';
  const land = 0.2;
  const rot = -7;
  tl.to(inner, [
    { opacity: 0, transform: 'scale(' + (2.6 + 0.4 * a).toFixed(2) + ') rotate(' + (rot - 10) + 'deg)', easing: 'cubic-bezier(.55,0,.9,.4)' },
    { opacity: 1, transform: 'scale(0.9) rotate(' + rot + 'deg)', offset: land, easing: 'cubic-bezier(.2,.9,.3,1)' },
    { opacity: 1, transform: 'scale(1.04) rotate(' + rot + 'deg)', offset: land + 0.08, easing: 'cubic-bezier(.4,0,.4,1)' },
    { opacity: 1, transform: 'scale(1) rotate(' + rot + 'deg)', offset: land + 0.16 },
    { opacity: 1, transform: 'scale(1) rotate(' + rot + 'deg)', offset: 0.82, easing: 'cubic-bezier(.5,0,.75,0)' },
    { opacity: 0, transform: 'scale(1.08) rotate(' + (rot + 2) + 'deg)' },
  ], { dur: D });
  tl.cue(() => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const puffs = [];
    const N = Math.round(26 * o.k.count);
    for (let i = 0; i < N; i++) {
      const side = i % 4;
      const u = rand(-0.5, 0.5);
      const px0 = side < 2 ? cx + u * w : cx + (side === 2 ? -1 : 1) * w * 0.5;
      const py0 = side < 2 ? cy + (side === 0 ? 1 : -1) * h * 0.5 : cy + u * h;
      const ang = Math.atan2(py0 - cy, px0 - cx) + rand(-0.4, 0.4);
      const v = rand(120, 320) * a;
      puffs.push({ x: px0, y: py0, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: rand(4, 9), life: rand(0.35, 0.55) * D, age: 0, color: i % 3 ? c.ink4 : c.coral });
    }
    actor(el, (g, dt, ms) => {
      const drag = Math.exp(-4 * dt);
      for (const d of puffs) {
        d.age += dt * 1000;
        const t = d.age / d.life;
        if (t >= 1) continue;
        d.vx *= drag;
        d.vy *= drag;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        g.globalAlpha = 0.4 * Math.pow(1 - t, 1.5);
        g.fillStyle = d.color;
        g.beginPath();
        g.arc(d.x, d.y, d.r * (1 + 1.6 * t), 0, Math.PI * 2);
        g.fill();
      }
      return ms < D * (1 - land) && puffs.some((d) => d.age < d.life);
    });
    sfx(o, 'stamp');
  }, D * land);
  shakePage(tl, el, { at: D * land, dur: D * 0.26, amp: 7 * a, rot: 0.3, n: 9 });
});

// ------------------------------------------------------------------ lowerthird: the new term as a caption bar
const lowerthird = point('lowerthird', (tl, el, o) => {
  const D = o.D;
  const word = anchorPoint(el).word;
  const fallback = word && word.textContent ? word.textContent.trim().replace(/[.,!?…]+$/, '') : '';
  const title = o.params.title != null && String(o.params.title).trim() ? String(o.params.title) : fallback;
  const sub = o.params.sub != null ? String(o.params.sub) : '';
  const node = layer(el, 'fx-lt', '<div class="fx-lt-bar"></div><div class="fx-lt-body"><div class="fx-lt-title"><span></span></div>' + (sub ? '<div class="fx-lt-sub"><span></span></div>' : '') + '</div>');
  node.querySelector('.fx-lt-title span').textContent = title;
  if (sub) node.querySelector('.fx-lt-sub span').textContent = sub;
  const block = el.closest('.blk, p, li, section') || el.parentElement;
  const { vw } = viewportSize();
  const left = block ? block.getBoundingClientRect().left : 16;
  node.style.left = clamp(left, 16, Math.max(16, vw * 0.5 - 120)).toFixed(1) + 'px';
  const bar = node.querySelector('.fx-lt-bar');
  const tBox = node.querySelector('.fx-lt-title');
  const tText = node.querySelector('.fx-lt-title span');
  const sBox = node.querySelector('.fx-lt-sub');
  const sText = node.querySelector('.fx-lt-sub span');
  const out = 0.86;
  tl.to(bar, [
    { transform: 'scaleY(0)', easing: 'cubic-bezier(.2,.9,.3,1)' },
    { transform: 'scaleY(1)', offset: 0.08 },
    { transform: 'scaleY(1)', offset: out + 0.04, easing: 'cubic-bezier(.6,0,.8,.3)' },
    { transform: 'scaleY(0)', offset: 0.99 },
    { transform: 'scaleY(0)' },
  ], { dur: D });
  tl.to(tBox, [
    { clipPath: 'inset(0% 100% 0% 0%)', easing: 'cubic-bezier(.7,0,.2,1)' },
    { clipPath: 'inset(0% 100% 0% 0%)', offset: 0.04, easing: 'cubic-bezier(.7,0,.2,1)' },
    { clipPath: 'inset(0% 0% 0% 0%)', offset: 0.17 },
    { clipPath: 'inset(0% 0% 0% 0%)', offset: out, easing: 'cubic-bezier(.7,0,.3,1)' },
    { clipPath: 'inset(0% 100% 0% 0%)', offset: 0.97 },
    { clipPath: 'inset(0% 100% 0% 0%)' },
  ], { dur: D });
  tl.to(tText, [
    { transform: 'translateX(-24px)', opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: 'translateX(-24px)', opacity: 0, offset: 0.08, easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: 'translateX(0px)', opacity: 1, offset: 0.24 },
    { transform: 'translateX(0px)', opacity: 1 },
  ], { dur: D });
  if (sBox) {
    tl.to(sBox, [
      { clipPath: 'inset(0% 100% 0% 0%)', easing: 'cubic-bezier(.7,0,.2,1)' },
      { clipPath: 'inset(0% 100% 0% 0%)', offset: 0.13, easing: 'cubic-bezier(.7,0,.2,1)' },
      { clipPath: 'inset(0% 0% 0% 0%)', offset: 0.26 },
      { clipPath: 'inset(0% 0% 0% 0%)', offset: out - 0.03, easing: 'cubic-bezier(.7,0,.3,1)' },
      { clipPath: 'inset(0% 100% 0% 0%)', offset: 0.94 },
      { clipPath: 'inset(0% 100% 0% 0%)' },
    ], { dur: D });
    tl.to(sText, [
      { transform: 'translateX(-16px)', opacity: 0 },
      { transform: 'translateX(-16px)', opacity: 0, offset: 0.17, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { transform: 'translateX(0px)', opacity: 1, offset: 0.32 },
      { transform: 'translateX(0px)', opacity: 1 },
    ], { dur: D });
  }
  tl.cue(() => sfx(o, 'whoosh'), 0);
  tl.cue(() => sfx(o, 'whoosh'), D * out);
});

// ------------------------------------------------------------------ countdown: guess the result, 3 2 1
const COUNTDOWN_DEFAULT = '결과를 예상해 보세요';
const countdown = point('countdown', (tl, el, o) => {
  const D = o.D;
  const label = o.params.text != null && String(o.params.text).trim() ? String(o.params.text) : COUNTDOWN_DEFAULT;
  const C = 2 * Math.PI * 54;
  const node = layer(el, 'fx-cd',
    '<div class="fx-cd-in"><p class="fx-cd-label"></p><div class="fx-cd-dial">' +
    '<svg class="fx-cd-ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="fx-cd-track" cx="60" cy="60" r="54"/><circle class="fx-cd-arc" cx="60" cy="60" r="54"/></svg>' +
    '<span class="fx-cd-n">3</span><span class="fx-cd-n">2</span><span class="fx-cd-n">1</span></div></div>');
  node.querySelector('.fx-cd-label').textContent = label;
  const inner = node.firstChild;
  const arc = node.querySelector('.fx-cd-arc');
  arc.style.strokeDasharray = C.toFixed(2) + ' ' + C.toFixed(2);
  arc.style.strokeDashoffset = C.toFixed(2);
  const nums = Array.from(node.querySelectorAll('.fx-cd-n'));
  const slots = [[0.06, 0.34], [0.34, 0.62], [0.62, 0.9]];
  tl.to(node, [
    { opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
    { opacity: 1, offset: 0.07 },
    { opacity: 1, offset: 0.9, easing: 'cubic-bezier(.5,0,.5,1)' },
    { opacity: 0 },
  ], { dur: D });
  tl.to(inner, [
    { transform: 'translateY(18px) scale(0.96)', easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: 'translateY(0px) scale(1)', offset: 0.1 },
    { transform: 'translateY(0px) scale(1)', offset: 0.9, easing: 'cubic-bezier(.5,0,.75,0)' },
    { transform: 'translateY(-10px) scale(1.04)' },
  ], { dur: D });
  const arcKf = [{ offset: 0, strokeDashoffset: C.toFixed(2) + 'px' }];
  slots.forEach(([s0, s1]) => {
    arcKf.push({ offset: s0, strokeDashoffset: C.toFixed(2) + 'px', easing: 'linear' });
    arcKf.push({ offset: s1 - 0.02, strokeDashoffset: '0px' });
    arcKf.push({ offset: s1 - 0.0001, strokeDashoffset: '0px' });
  });
  arcKf.push({ offset: 1, strokeDashoffset: C.toFixed(2) + 'px' });
  tl.to(arc, arcKf, { dur: D });
  nums.forEach((nEl, i) => {
    const [s0, s1] = slots[i];
    const len = s1 - s0;
    tl.to(nEl, [
      { opacity: 0, transform: 'scale(1.7)' },
      { opacity: 0, transform: 'scale(1.7)', offset: s0, easing: 'cubic-bezier(.2,.9,.3,1.25)' },
      { opacity: 1, transform: 'scale(1)', offset: s0 + len * 0.3 },
      { opacity: 1, transform: 'scale(1)', offset: s0 + len * 0.78, easing: 'cubic-bezier(.6,0,.9,.4)' },
      { opacity: 0, transform: 'scale(0.55)', offset: s1 },
      { opacity: 0, transform: 'scale(0.55)' },
    ], { dur: D });
    tl.cue(() => sfx(o, 'tick'), D * s0);
  });
  tl.cue(() => sfx(o, 'pop'), D * 0.9);
});

// ------------------------------------------------------------------ screenshake: the page jolts
const screenshake = point('screenshake', (tl, el, o) => {
  const a = o.k.amp;
  shakePage(tl, el, { at: 0, dur: o.D, amp: 13 * a, rot: 0.7 * a, n: 16 });
  tl.cue(() => sfx(o, 'thud'), 0);
});

export const effects = { stamp, sparkle, confetti, fireworks, shockwave, flash, vignette, lowerthird, countdown, screenshake };
