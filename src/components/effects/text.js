// Docent v2 text effects (group "text", kind "inline"): the spoken words themselves move, get marked or change.
// Owner: fx agent. Markup (compiler, SPEC 12):
//   <span class="fx fx-NAME" data-fx="NAME" id="…" data-to="…" data-text="…" data-from="…">…</span>
// inside one .u word, or wrapping several .u words. Params come from opts.params first, then data-*.
// Rules: the engine's .u elements are never replaced (only text nodes are split and put back), colours go on
// our own spans through color-mix(… currentColor) so the narration colours keep working, and the layout of
// the sentence never changes while an effect plays (strike is the one exception: its correction makes room).
// Transient effects end on the untouched text. marker, underline and circle draw boldly, then settle into a
// faint trace that stays as a review mark; strike keeps its correction; callout keeps a dotted underline.

import { setup, sfx, warmSound, Timeline, instant, stop, setState, E, frames, phase, colors, overlay, unoverlay, viewportSize, clamp, lerp, emit, alpha, byId } from './lib/core.js';
import { splitChars, unsplit, fixWidths } from './lib/split.js';
import { drawDeco, clearDeco, lineBoxes } from './lib/deco.js';

const SKIP = '.fx-deco, .fx-strike-to, .fx-ghost';
const cleanups = new WeakMap(); // el -> [fn] registered by the running effect

function onClean(el, fn) {
  const list = cleanups.get(el) || [];
  list.push(fn);
  cleanups.set(el, list);
}

/** Put a transient effect's element back to its untouched markup. Idempotent. */
function clean(el) {
  const list = cleanups.get(el);
  if (list) {
    cleanups.delete(el);
    for (const fn of list.reverse()) {
      try { fn(); } catch (err) { console.error('[docent fx]', err); }
    }
  }
  unsplit(el);
  el.classList.remove('fx-block', 'fx-words', 'fx-typing', 'is-blink');
  el.querySelectorAll(':scope > .fx-ghost').forEach((n) => n.remove());
}

function begin(name, el, opts) {
  const o = setup(name, el, opts);
  stop(el, 'finish');
  clean(el);
  warmSound(o);
  return o;
}

/** What moves as one piece: the single word, a one-line phrase, or each word of a wrapped phrase. */
function units(el) {
  const words = Array.from(el.querySelectorAll('.u'));
  if (!words.length) return [el];
  if (el.getClientRects().length <= 1) {
    el.classList.add('fx-block');
    return [el];
  }
  el.classList.add('fx-words');
  return words;
}

function letters(el) {
  return splitChars(el, { skip: SKIP }).chars;
}

/** The largest scale (up to want) at which every target still fits inside the viewport horizontally. */
function fitScale(targets, want, pad = 10) {
  const { vw } = viewportSize();
  let s = want;
  for (const t of targets) {
    const r = t.getBoundingClientRect();
    if (!r.width) continue;
    const cx = r.left + r.width / 2;
    const room = 2 * Math.min(cx - pad, vw - pad - cx);
    s = Math.min(s, room / r.width);
  }
  return Math.max(1, s);
}

function textOf(el) {
  let s = '';
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (t.parentElement && t.parentElement.closest(SKIP)) continue;
    s += t.data;
  }
  return s.replace(/\s+/g, ' ').trim();
}

function ghost(el, cls) {
  const g = document.createElement('span');
  g.className = 'fx-ghost ' + cls;
  g.setAttribute('aria-hidden', 'true');
  g.textContent = textOf(el);
  el.appendChild(g);
  return g;
}

const px = (n) => n.toFixed(2) + 'px';
const em = (n) => n.toFixed(3) + 'em';
const heat = (peak = 0.2, hold = 0.5) => [{ '--fxc-heat': 0 }, { '--fxc-heat': 1, offset: peak }, { '--fxc-heat': 1, offset: Math.max(peak, hold) }, { '--fxc-heat': 0 }];

function transient(run) {
  return {
    prime(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); },
    settle(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); },
    reset(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); },
    run(el, opts) {
      el = byId(el);
      if (!el) return instant();
      return run(el, opts || {});
    },
  };
}

function finishTl(tl, el, o, after) {
  tl.hold(o.D);
  tl.then(() => {
    clean(el);
    if (after) after();
  });
  return tl.play();
}

// ------------------------------------------------------------------ wave
const wave = transient((el, opts) => {
  const o = begin('wave', el, opts);
  if (o.reduced) return instant();
  const cs = letters(el);
  const n = cs.length;
  const a = o.k.amp;
  const per = o.D * 0.5;
  const gap = n > 1 ? (o.D - per) / (n - 1) : 0;
  const tl = new Timeline(el);
  cs.forEach((c, i) => {
    tl.to(c, [
      { transform: 'translateY(0em) rotate(0deg) scale(1)', easing: 'cubic-bezier(.3,0,.25,1)' },
      { transform: 'translateY(' + em(-0.5 * a) + ') rotate(' + (-7 * a).toFixed(1) + 'deg) scale(' + (1 + 0.2 * a).toFixed(3) + ')', offset: 0.36, easing: 'cubic-bezier(.5,0,.5,1)' },
      { transform: 'translateY(' + em(0.1 * a) + ') rotate(' + (2.5 * a).toFixed(1) + 'deg) scale(0.97)', offset: 0.7, easing: 'cubic-bezier(.4,0,.3,1)' },
      { transform: 'translateY(0em) rotate(0deg) scale(1)' },
    ], { at: i * gap, dur: per });
    tl.to(c, heat(0.3, 0.45), { at: i * gap, dur: per });
  });
  tl.cue(() => sfx(o, 'whoosh'), 0);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ jelly
const jelly = transient((el, opts) => {
  const o = begin('jelly', el, opts);
  if (o.reduced) return instant();
  const targets = units(el);
  const cs = letters(el);
  const a = o.k.amp;
  const s = (x, y, ty) => 'translateY(' + em(ty || 0) + ') scale(' + (1 + (x - 1) * a).toFixed(3) + ', ' + (1 + (y - 1) * a).toFixed(3) + ')';
  const bend = 'cubic-bezier(.33,0,.3,1)';
  const tl = new Timeline(el);
  tl.to(targets, [
    { transform: s(1, 1, 0), easing: bend },
    { transform: s(1.34, 0.7, 0.02), offset: 0.15, easing: bend },
    { transform: s(0.8, 1.24, -0.16 * a), offset: 0.31, easing: bend },
    { transform: s(1.13, 0.9, 0), offset: 0.47, easing: bend },
    { transform: s(0.95, 1.06, 0), offset: 0.63, easing: bend },
    { transform: s(1.025, 0.98, 0), offset: 0.8, easing: bend },
    { transform: s(1, 1, 0) },
  ], { dur: o.D });
  tl.to(cs, heat(0.15, 0.5), { dur: o.D });
  tl.cue(() => sfx(o, 'boing'), 0);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ bouncein
const bouncein = transient((el, opts) => {
  const o = begin('bouncein', el, opts);
  if (o.reduced) return instant();
  const cs = letters(el);
  const n = cs.length;
  const a = o.k.amp;
  const per = o.D * 0.62;
  const gap = n > 1 ? (o.D - per) / (n - 1) : 0;
  const fall = 'cubic-bezier(.55,0,1,.45)';
  const rise = 'cubic-bezier(0,.55,.45,1)';
  const tl = new Timeline(el);
  cs.forEach((c, i) => {
    tl.to(c, [
      { transform: 'translateY(' + em(-1.7 * a) + ') scale(0.9, 1.14)', opacity: 0, easing: fall },
      { transform: 'translateY(' + em(-1.2 * a) + ') scale(0.92, 1.12)', opacity: 1, offset: 0.12, easing: fall },
      { transform: 'translateY(0em) scale(1.22, 0.76)', offset: 0.4, easing: rise },
      { transform: 'translateY(' + em(-0.36 * a) + ') scale(0.95, 1.06)', offset: 0.6, easing: fall },
      { transform: 'translateY(0em) scale(1.07, 0.94)', offset: 0.78, easing: rise },
      { transform: 'translateY(' + em(-0.06 * a) + ') scale(1, 1)', offset: 0.9 },
      { transform: 'translateY(0em) scale(1, 1)', opacity: 1 },
    ], { at: i * gap, dur: per });
    tl.to(c, [{ '--fxc-heat': 0 }, { '--fxc-heat': 0, offset: 0.38 }, { '--fxc-heat': 1, offset: 0.42 }, { '--fxc-heat': 0.6, offset: 0.7 }, { '--fxc-heat': 0 }], { at: i * gap, dur: per });
  });
  tl.cue(() => sfx(o, 'boing'), per * 0.4);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ zoom
const zoom = transient((el, opts) => {
  const o = begin('zoom', el, opts);
  if (o.reduced) return instant();
  const targets = units(el);
  const cs = letters(el);
  const a = o.k.amp;
  const tl = new Timeline(el);
  targets.forEach((t) => t.classList.add('fx-lift'));
  onClean(el, () => targets.forEach((t) => t.classList.remove('fx-lift')));
  tl.cue(() => sfx(o, 'pop'), 0);
  if (targets.length > 1) {
    // A phrase that wraps: the words punch one after another, so only one word is big at a time.
    const n = targets.length;
    const per = o.D * 0.46;
    const gap = (o.D - per) / (n - 1);
    targets.forEach((t, i) => {
      const peak = fitScale([t], 1 + 0.4 * a);
      const at = i * gap;
      tl.to(t, [
        { transform: 'scale(1)', easing: 'cubic-bezier(.2,.9,.25,1)' },
        { transform: 'scale(' + peak.toFixed(3) + ')', offset: 0.3, easing: 'cubic-bezier(.5,0,.5,1)' },
        { transform: 'scale(' + peak.toFixed(3) + ')', offset: 0.52, easing: 'cubic-bezier(.45,0,.3,1)' },
        { transform: 'scale(0.97)', offset: 0.78 },
        { transform: 'scale(1)' },
      ], { at, dur: per });
      tl.to(t, [{ '--fx-lift': 0 }, { '--fx-lift': 1, offset: 0.26 }, { '--fx-lift': 1, offset: 0.55 }, { '--fx-lift': 0, offset: 0.8 }, { '--fx-lift': 0 }], { at, dur: per });
      tl.to(t.querySelectorAll('.fxc'), heat(0.26, 0.6), { at, dur: per });
    });
    return finishTl(tl, el, o);
  }
  // soft 1.28, normal 1.46, strong 1.67 — but never wider than the screen
  const peak = fitScale(targets, 1 + 0.46 * a);
  tl.to(targets, [
    { transform: 'scale(1)', easing: 'cubic-bezier(.2,.9,.25,1)' },
    { transform: 'scale(' + peak.toFixed(3) + ')', offset: 0.22, easing: 'cubic-bezier(.5,0,.5,1)' },
    { transform: 'scale(' + peak.toFixed(3) + ')', offset: 0.5, easing: 'cubic-bezier(.45,0,.3,1)' },
    { transform: 'scale(' + (1 - 0.05 * a).toFixed(3) + ')', offset: 0.72, easing: 'cubic-bezier(.4,0,.4,1)' },
    { transform: 'scale(' + (1 + 0.02 * a).toFixed(3) + ')', offset: 0.86 },
    { transform: 'scale(1)' },
  ], { dur: o.D });
  tl.to(targets, [{ '--fx-lift': 0 }, { '--fx-lift': 1, offset: 0.18 }, { '--fx-lift': 1, offset: 0.52 }, { '--fx-lift': 0, offset: 0.76 }, { '--fx-lift': 0 }], { dur: o.D });
  tl.to(cs, heat(0.18, 0.62), { dur: o.D });
  let ring = null;
  tl.cue(() => {
    const r = el.getBoundingClientRect();
    if (r.width > 180) return;
    ring = emit({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: 'ring', colors: [colors().coral], ring: { from: Math.max(10, r.width * 0.45), to: r.width * 0.5 + 46 * a, width: 2.5, life: o.D * 0.55 } });
  }, o.D * 0.16);
  return finishTl(tl, el, o, () => { if (ring) ring.clear(); });
});

// ------------------------------------------------------------------ flip3d
const flip3d = transient((el, opts) => {
  const o = begin('flip3d', el, opts);
  if (o.reduced) return instant();
  const cs = letters(el);
  const n = cs.length;
  const a = o.k.amp;
  const per = o.D * 0.56;
  const gap = n > 1 ? (o.D - per) / (n - 1) : 0;
  const tl = new Timeline(el);
  cs.forEach((c, i) => {
    tl.to(c, [
      { transform: 'perspective(360px) translateY(0em) rotateX(0deg) scale(1)', easing: 'cubic-bezier(.55,0,.45,1)' },
      { transform: 'perspective(360px) translateY(' + em(-0.22 * a) + ') rotateX(-180deg) scale(' + (1 + 0.16 * a).toFixed(3) + ')', offset: 0.5, easing: 'cubic-bezier(.55,0,.45,1)' },
      { transform: 'perspective(360px) translateY(0em) rotateX(-360deg) scale(1)' },
    ], { at: i * gap, dur: per });
    tl.to(c, heat(0.35, 0.6), { at: i * gap, dur: per });
  });
  tl.cue(() => sfx(o, 'whoosh'), 0);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ glitch (errors only)
const NOISE_LATIN = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz#$%&*+=<>?';
function noiseFor(ch) {
  if (/[\uAC00-\uD7A3]/.test(ch)) return String.fromCharCode(0xac00 + Math.floor(Math.random() * 11172));
  if (/[0-9]/.test(ch)) return String(Math.floor(Math.random() * 10));
  if (/[A-Za-z]/.test(ch)) return NOISE_LATIN[Math.floor(Math.random() * NOISE_LATIN.length)];
  return '#$%&*+=<>?/'[Math.floor(Math.random() * 11)];
}

const glitch = transient((el, opts) => {
  const o = begin('glitch', el, opts);
  if (o.reduced) return instant();
  const targets = units(el);
  const cs = letters(el);
  fixWidths(cs);
  const orig = cs.map((c) => c.textContent);
  const a = o.k.amp;
  const END = 0.8;
  const N = 12;
  const rnd = Math.random;
  const tl = new Timeline(el);
  const calm = 'translate(0em, 0em) skewX(0deg)';
  const jit = [];
  for (let i = 0; i < N; i++) {
    const still = i === 0 || rnd() < 0.2;
    jit.push({
      offset: (i / N) * END, easing: 'steps(1, end)',
      transform: still ? calm : 'translate(' + em((rnd() - 0.5) * 0.22 * a) + ', ' + em((rnd() - 0.5) * 0.08 * a) + ') skewX(' + ((rnd() - 0.5) * 24 * a).toFixed(1) + 'deg)',
    });
  }
  jit.push({ offset: END, transform: calm });
  jit.push({ offset: 1, transform: calm });
  tl.to(targets, jit, { dur: o.D });
  if (targets.length === 1) {
    [['fx-glitch-a', 1], ['fx-glitch-b', -1]].forEach(([cls, dir]) => {
      const g = ghost(el, cls);
      const kf = [];
      for (let i = 0; i < N; i++) {
        const top = Math.floor(rnd() * 70);
        const bottom = Math.floor(rnd() * (92 - top));
        const show = i > 0 && rnd() > 0.25;
        kf.push({
          offset: (i / N) * END, easing: 'steps(1, end)', opacity: show ? 1 : 0,
          clipPath: 'inset(' + top + '% 0% ' + bottom + '% 0%)',
          transform: 'translateX(' + em(dir * (0.05 + rnd() * 0.16) * a) + ')',
        });
      }
      kf.push({ offset: END, opacity: 0, clipPath: 'inset(0% 0% 0% 0%)', transform: 'translateX(0em)' });
      kf.push({ offset: 1, opacity: 0, clipPath: 'inset(0% 0% 0% 0%)', transform: 'translateX(0em)' });
      tl.to(g, kf, { dur: o.D });
    });
  }
  tl.cue(() => {
    let slot = -1;
    const loop = frames((p, ms) => {
      if (p >= END) {
        cs.forEach((c, i) => { c.textContent = orig[i]; c.classList.remove('is-error'); });
        return;
      }
      const s = Math.floor(ms / 60);
      if (s === slot) return;
      slot = s;
      cs.forEach((c, i) => {
        const on = rnd() < 0.24;
        c.textContent = on ? noiseFor(orig[i]) : orig[i];
        c.classList.toggle('is-error', on);
      });
    }, o.D);
    onClean(el, () => loop.stop());
  }, 0);
  tl.cue(() => sfx(o, 'glitch'), 0);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ scramble
const scramble = transient((el, opts) => {
  const o = begin('scramble', el, opts);
  if (o.reduced) return instant();
  const cs = letters(el);
  fixWidths(cs);
  const orig = cs.map((c) => c.textContent);
  const n = cs.length;
  const D = o.D;
  const at = cs.map((_, i) => D * (0.2 + 0.66 * (n > 1 ? i / (n - 1) : 1)));
  const tl = new Timeline(el);
  cs.forEach((c, i) => {
    const dur = Math.max(1, Math.min(D * 0.2, D - at[i]));
    tl.to(c, [{ transform: 'translateY(0em) scale(1)' }, { transform: 'translateY(-0.14em) scale(1.3)', offset: 0.3, easing: 'cubic-bezier(.3,0,.3,1)' }, { transform: 'translateY(0em) scale(1)' }], { at: at[i], dur });
    tl.to(c, [{ '--fxc-heat': 1 }, { '--fxc-heat': 1, offset: 0.2 }, { '--fxc-heat': 0 }], { at: at[i], dur });
  });
  tl.cue(() => {
    let slot = -1;
    const loop = frames((p, ms) => {
      const s = Math.floor(ms / 50);
      const fresh = s !== slot;
      slot = s;
      cs.forEach((c, i) => {
        if (ms >= at[i] || p >= 1) {
          if (c.classList.contains('is-noise')) {
            c.textContent = orig[i];
            c.classList.remove('is-noise');
          }
        } else if (fresh) {
          c.textContent = noiseFor(orig[i]);
          c.classList.add('is-noise');
        }
      });
    }, D);
    onClean(el, () => loop.stop());
  }, 0);
  tl.cue(() => sfx(o, 'typing'), 0);
  tl.cue(() => sfx(o, 'tick'), at[n - 1] || 0);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ typewriter
const typewriter = transient((el, opts) => {
  const o = begin('typewriter', el, opts);
  if (o.reduced) return instant();
  const cs = letters(el);
  const n = cs.length;
  const D = o.D;
  el.classList.add('fx-typing');
  const start = D * 0.08;
  const end = D * 0.78;
  const weights = cs.map((c) => (c.previousSibling || !c.parentElement.previousSibling ? 1 : 1.6) * (0.65 + Math.random() * 0.7));
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  let acc = 0;
  const times = weights.map((w) => {
    acc += w;
    return start + (end - start) * (acc / total);
  });
  if (cs[0]) cs[0].classList.add('is-caret-start');
  const tl = new Timeline(el);
  cs.forEach((c, i) => {
    const dur = Math.max(1, Math.min(160, D - times[i]));
    tl.to(c, [{ transform: 'translateY(-0.2em) scale(1.25)' }, { transform: 'translateY(0em) scale(1)' }], { at: times[i], dur, ease: 'cubic-bezier(.2,.8,.3,1)' });
    tl.to(c, [{ '--fxc-heat': 1 }, { '--fxc-heat': 0 }], { at: times[i], dur: Math.max(1, Math.min(320, D - times[i])) });
  });
  tl.cue(() => {
    let shown = 0;
    const loop = frames((p, ms) => {
      while (shown < n && (ms >= times[shown] || p >= 1)) {
        const c = cs[shown];
        c.classList.add('is-typed');
        if (shown === 0) c.classList.remove('is-caret-start');
        else cs[shown - 1].classList.remove('is-caret');
        c.classList.add('is-caret');
        shown++;
      }
      if (shown >= n && !el.classList.contains('is-blink')) el.classList.add('is-blink');
    }, D);
    onClean(el, () => loop.stop());
  }, 0);
  tl.cue(() => sfx(o, 'typing'), start);
  if (n > 7) tl.cue(() => sfx(o, 'typing'), times[Math.floor(n / 2)]);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ shake
const shake = transient((el, opts) => {
  const o = begin('shake', el, opts);
  if (o.reduced) return instant();
  const targets = units(el);
  const cs = letters(el);
  const danger = colors().danger;
  cs.forEach((c) => c.style.setProperty('--fx-hue', danger));
  const a = o.k.amp;
  const xs = [0, -0.3, 0.28, -0.23, 0.18, -0.12, 0.07, -0.03, 0];
  const rs = [0, -3, 3, -2.4, 1.8, -1.1, 0.5, -0.2, 0];
  const tl = new Timeline(el);
  tl.to(targets, xs.map((x, i) => ({
    offset: i / (xs.length - 1), easing: 'cubic-bezier(.4,0,.6,1)',
    transform: 'translateX(' + em(x * a) + ') rotate(' + (rs[i] * a).toFixed(2) + 'deg)',
  })), { dur: o.D });
  tl.to(cs, heat(0.08, 0.6), { dur: o.D });
  tl.cue(() => sfx(o, 'thud'), 0);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ spotlight
const spotlight = transient((el, opts) => {
  const o = begin('spotlight', el, opts);
  if (o.reduced) return instant();
  const D = o.D;
  const a = o.k.amp;
  const targets = units(el);
  const cs = letters(el);
  const dim = alpha(colors().stage, Math.min(0.9, 0.62 + 0.14 * a));
  const ov = overlay('fx-spot');
  onClean(el, () => unoverlay(ov));
  const tl = new Timeline(el);
  tl.to(targets, [
    { transform: 'scale(1)' },
    { transform: 'scale(1)', offset: 0.12, easing: 'cubic-bezier(.2,.8,.3,1.2)' },
    { transform: 'scale(' + (1 + 0.1 * a).toFixed(3) + ')', offset: 0.3 },
    { transform: 'scale(' + (1 + 0.1 * a).toFixed(3) + ')', offset: 0.78, easing: 'cubic-bezier(.4,0,.2,1)' },
    { transform: 'scale(1)' },
  ], { dur: D });
  tl.to(cs, heat(0.28, 0.78), { dur: D });
  tl.cue(() => {
    const loop = frames((p) => {
      const r = el.getBoundingClientRect();
      const { vw, vh } = viewportSize();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // the words sit inside the clear 72% of the ellipse; the soft edge starts beyond them
      const rx = (r.width / 2 + 20) / 0.72;
      const ry = (r.height / 2 + 14) / 0.72;
      const cover = Math.hypot(vw, vh) / Math.min(rx, ry);
      const inP = E.outCubic(phase(p, 0, 0.3));
      const outP = E.inCubic(phase(p, 0.8, 1));
      const k = lerp(cover, 1, inP) + outP * cover * 0.5;
      ov.style.opacity = (phase(p, 0, 0.1) * (1 - E.inOutCubic(phase(p, 0.82, 1)))).toFixed(3);
      ov.style.background = 'radial-gradient(' + px(rx * k) + ' ' + px(ry * k) + ' at ' + px(cx) + ' ' + px(cy) + ', transparent 72%, ' + dim + ' 100%)';
    }, D);
    onClean(el, () => loop.stop());
  }, 0);
  tl.cue(() => sfx(o, 'riser'), 0);
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ numbers: countup, odometer
const NUM_RE = /\d(?:[\d,]*\d)?(?:\.\d+)?/;
const toNum = (s) => parseFloat(String(s).replace(/[^\d.-]/g, ''));

function formatLike(v, sample) {
  const dec = (sample.split('.')[1] || '').length;
  let s = Math.abs(v).toFixed(dec);
  if (sample.includes(',')) {
    const [i, f] = s.split('.');
    s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
  }
  return (v < 0 ? '-' : '') + s;
}

/** Wrap the first number in el's text in span.fx-num (put back by clean). */
function isolateNumber(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (t.parentElement && t.parentElement.closest(SKIP)) continue;
    const m = NUM_RE.exec(t.data);
    if (!m) continue;
    const mid = t.splitText(m.index);
    mid.splitText(m[0].length);
    const span = document.createElement('span');
    span.className = 'fx-num';
    const parent = mid.parentNode;
    parent.insertBefore(span, mid);
    span.appendChild(mid);
    onClean(el, () => {
      if (!span.parentNode) return;
      span.parentNode.replaceChild(document.createTextNode(m[0]), span);
      parent.normalize();
    });
    return { span, text: m[0] };
  }
  return null;
}

function popInstead(el, o) {
  const targets = units(el);
  const cs = letters(el);
  const a = o.k.amp;
  const tl = new Timeline(el);
  tl.to(targets, [{ transform: 'scale(1)' }, { transform: 'scale(' + (1 + 0.3 * a).toFixed(3) + ')', offset: 0.3, easing: 'cubic-bezier(.3,0,.3,1)' }, { transform: 'scale(0.97)', offset: 0.6 }, { transform: 'scale(1)' }], { dur: o.D * 0.7 });
  tl.to(cs, heat(0.25, 0.55), { dur: o.D * 0.8 });
  tl.cue(() => sfx(o, 'pop'), 0);
  return finishTl(tl, el, o);
}

const countup = transient((el, opts) => {
  const o = begin('countup', el, opts);
  if (o.reduced) return instant();
  const num = isolateNumber(el);
  if (!num) return popInstead(el, o);
  const D = o.D;
  const a = o.k.amp;
  const target = toNum(num.text);
  const f = o.params.from != null ? toNum(o.params.from) : NaN;
  const from = Number.isFinite(f) ? f : 0;
  const span = num.span;
  span.style.minWidth = px(span.getBoundingClientRect().width);
  const land = 0.8;
  const tl = new Timeline(el);
  tl.to(span, [
    { transform: 'translateY(0em) scale(1)' },
    { transform: 'translateY(0em) scale(1)', offset: land - 0.02, easing: 'cubic-bezier(.3,0,.3,1)' },
    { transform: 'translateY(' + em(-0.1 * a) + ') scale(' + (1 + 0.3 * a).toFixed(3) + ')', offset: land + 0.07, easing: 'cubic-bezier(.3,0,.3,1)' },
    { transform: 'translateY(0em) scale(1)' },
  ], { dur: D });
  tl.to(span, [{ '--fx-heat': 0.75 }, { '--fx-heat': 0.75, offset: land - 0.02 }, { '--fx-heat': 1, offset: land + 0.06 }, { '--fx-heat': 0 }], { dur: D });
  tl.cue(() => {
    let last = '';
    const loop = frames((p) => {
      const q = E.outExpo(phase(p, 0, land));
      const v = p >= land ? target : from + (target - from) * q;
      const s = formatLike(v, num.text);
      if (s !== last) {
        span.textContent = s;
        last = s;
      }
    }, D);
    onClean(el, () => loop.stop());
  }, 0);
  [0, 0.12, 0.26, 0.42, 0.6].forEach((t) => tl.cue(() => sfx(o, 'tick'), D * t));
  tl.cue(() => sfx(o, 'pop'), D * land);
  return finishTl(tl, el, o);
});

const odometer = transient((el, opts) => {
  const o = begin('odometer', el, opts);
  if (o.reduced) return instant();
  const num = isolateNumber(el);
  if (!num) return popInstead(el, o);
  const D = o.D;
  const text = num.text;
  const digits = text.replace(/\D/g, '');
  let from = o.params.from != null ? String(o.params.from).replace(/\D/g, '') : '';
  from = (from || '0').padStart(digits.length, '0').slice(-digits.length);
  const span = num.span;
  span.classList.add('fx-odo');
  span.textContent = '';
  const cols = [];
  let di = 0;
  for (const ch of text) {
    if (/\d/.test(ch)) {
      const col = document.createElement('span');
      col.className = 'fx-odo-col';
      const ph = document.createElement('span');
      ph.className = 'fx-odo-ph';
      ph.textContent = ch;
      const strip = document.createElement('span');
      strip.className = 'fx-odo-strip';
      strip.setAttribute('aria-hidden', 'true');
      col.append(ph, strip);
      span.appendChild(col);
      cols.push({ col, strip, a: +from[di], b: +ch });
      di++;
    } else {
      span.appendChild(document.createTextNode(ch));
    }
  }
  // Digits are packed one em apart (like a real counter wheel) and the strip is shifted by half the extra
  // line height, so every row sits on the text's own baseline.
  const lineH = cols.length ? cols[0].col.getBoundingClientRect().height : 0;
  const H = parseFloat(getComputedStyle(span).fontSize) || 16;
  span.style.setProperty('--odo-row', px(H));
  span.style.setProperty('--odo-top', px((lineH - H) / 2));
  const n = cols.length;
  const tl = new Timeline(el);
  cols.forEach((c, i) => {
    // Few turns so the digits stay readable while they roll: the last digit turns once,
    // an unchanged digit next to it turns once too, everything else rolls straight to its value.
    const turns = i === n - 1 || (i === n - 2 && c.a === c.b) ? 1 : 0;
    const s = ((c.b - c.a + 10) % 10) + 10 * turns;
    for (let k = 0; k <= s + 1; k++) {
      const d = document.createElement('span');
      d.textContent = String((c.a + k) % 10);
      c.strip.appendChild(d);
    }
    c.strip.style.transform = 'translateY(' + px(-s * H) + ')';
    const t0 = D * 0.04;
    const t1 = D * (0.52 + 0.36 * (n > 1 ? i / (n - 1) : 1));
    if (s > 0) {
      tl.to(c.strip, [
        { transform: 'translateY(0px)', easing: 'cubic-bezier(.45,0,.25,1)' },
        { transform: 'translateY(' + px(-(s + 0.24) * H) + ')', offset: 0.86, easing: 'cubic-bezier(.3,0,.4,1)' },
        { transform: 'translateY(' + px(-s * H) + ')' },
      ], { at: t0, dur: t1 - t0 });
    } else {
      tl.to(c.strip, [{ transform: 'translateY(0px)' }, { transform: 'translateY(' + px(-0.24 * H) + ')', offset: 0.5 }, { transform: 'translateY(0px)' }], { at: t1 - D * 0.18, dur: D * 0.18 });
    }
    tl.to(c.col, [{ '--fx-heat': 0 }, { '--fx-heat': 1, offset: 0.25 }, { '--fx-heat': 0 }], { at: t1 - D * 0.04, dur: Math.min(D * 0.3, D - (t1 - D * 0.04)) });
    tl.cue(() => sfx(o, 'tick'), t1);
  });
  tl.to(span, [{ transform: 'scale(1)' }, { transform: 'scale(1)', offset: 0.88 }, { transform: 'scale(' + (1 + 0.14 * o.k.amp).toFixed(3) + ')', offset: 0.94 }, { transform: 'scale(1)' }], { dur: D });
  return finishTl(tl, el, o);
});

// ------------------------------------------------------------------ hand-drawn marks: marker, underline, circle
// Drawn boldly while playing, then (after a short afterglow) they relax into a faint review trace.
function live(el) {
  el.setAttribute('data-fx-live', '');
}

function markEffect(name, kind, { start, end, ease, sound, bump }) {
  const initial = (el) => {
    live(el);
    el.classList.remove('is-afterglow', 'is-fading');
    setState(el, 'initial');
    clearDeco(el, kind);
  };
  const final = (el, glow) => {
    live(el);
    setState(el, 'final');
    if (!el.querySelector(':scope > .fx-deco-' + kind)) drawDeco(el, kind);
    if (glow) {
      // Stay bold for a beat after the effect, then let CSS fade the mark to its faint trace.
      el.classList.add('is-afterglow', 'is-fading');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-afterglow')));
    } else {
      el.classList.remove('is-afterglow', 'is-fading');
    }
  };
  return {
    prime(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); initial(el); },
    settle(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); final(el, false); },
    reset(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); initial(el); },
    run(el, opts) {
      el = byId(el);
      if (!el) return instant();
      const o = begin(name, el, opts);
      if (o.reduced) return instant(() => final(el, false));
      live(el);
      el.classList.remove('is-afterglow', 'is-fading');
      setState(el, 'playing');
      const strokes = drawDeco(el, kind);
      const D = o.D;
      const t0 = D * start;
      const t1 = D * end;
      const total = strokes.reduce((s, x) => s + x.length, 0) || 1;
      const tl = new Timeline(el);
      let at = t0;
      for (const s of strokes) {
        const dur = Math.max(1, (t1 - t0) * (s.length / total));
        const L = px(s.length);
        tl.to(s.path, [
          { strokeDasharray: L + ' ' + L, strokeDashoffset: L },
          { strokeDasharray: L + ' ' + L, strokeDashoffset: '0px' },
        ], { at, dur, ease });
        at += dur;
      }
      if (bump) {
        const targets = units(el);
        tl.to(targets, [{ transform: 'scale(1)' }, { transform: 'scale(1)', offset: end - 0.06 }, { transform: 'scale(' + (1 + bump * o.k.amp).toFixed(3) + ')', offset: Math.min(0.97, end + 0.06), easing: 'cubic-bezier(.3,0,.3,1)' }, { transform: 'scale(1)' }], { dur: D });
      }
      tl.cue(() => sfx(o, sound), t0);
      tl.hold(D);
      tl.then(() => {
        clean(el);
        final(el, true);
      });
      return tl.play();
    },
  };
}

const marker = markEffect('marker', 'marker', { start: 0.04, end: 0.84, ease: 'cubic-bezier(.45,0,.25,1)', sound: 'whoosh', bump: 0 });
const underline = markEffect('underline', 'underline', { start: 0.04, end: 0.8, ease: 'cubic-bezier(.4,0,.3,1)', sound: 'whoosh', bump: 0 });
const circle = markEffect('circle', 'circle', { start: 0.04, end: 0.8, ease: 'cubic-bezier(.45,.05,.35,1)', sound: 'whoosh', bump: 0.08 });

// ------------------------------------------------------------------ strike: cross out, then write the correction
function strikeRep(el, to) {
  let rep = el.querySelector(':scope > .fx-strike-to');
  const text = to != null && to !== '' ? String(to) : el.dataset.to || (rep ? rep.textContent : '');
  if (!text) {
    if (rep) rep.remove();
    return null;
  }
  if (!rep) {
    rep = document.createElement('span');
    rep.className = 'fx-strike-to';
    rep.innerHTML = '<span class="fx-strike-word"></span>';
    el.appendChild(rep);
  }
  rep.firstChild.textContent = text;
  if (!el.dataset.to) el.dataset.to = text;
  return rep;
}

const strike = {
  prime(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); strikeInitial(el); },
  settle(el, opts) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); strikeFinal(el, opts && opts.params ? opts.params.to : undefined); },
  reset(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); strikeInitial(el); },
  run(el, opts) {
    el = byId(el);
    if (!el) return instant();
    const o = begin('strike', el, opts);
    const to = o.params.to;
    if (o.reduced) return instant(() => strikeFinal(el, to));
    live(el);
    const rep = strikeRep(el, to);
    setState(el, 'playing');
    const D = o.D;
    const a = o.k.amp;
    const strokes = drawDeco(el, 'strike');
    const tl = new Timeline(el);
    const s0 = D * 0.03;
    const s1 = D * 0.36;
    const total = strokes.reduce((s, x) => s + x.length, 0) || 1;
    let at = s0;
    for (const s of strokes) {
      const dur = Math.max(1, (s1 - s0) * (s.length / total));
      const L = px(s.length);
      tl.to(s.path, [{ strokeDasharray: L + ' ' + L, strokeDashoffset: L }, { strokeDasharray: L + ' ' + L, strokeDashoffset: '0px' }], { at, dur, ease: 'cubic-bezier(.5,0,.3,1)' });
      at += dur;
    }
    tl.to(el, [{ '--fx-dim': 0 }, { '--fx-dim': 0, offset: 0.08 }, { '--fx-dim': 1, offset: 0.36 }, { '--fx-dim': 1 }], { dur: D });
    if (rep) {
      const W = rep.getBoundingClientRect().width;
      const word = rep.firstChild;
      tl.to(rep, [
        { maxWidth: '0px', marginLeft: '0em' },
        { maxWidth: '0px', marginLeft: '0em', offset: 0.38, easing: 'cubic-bezier(.55,0,.25,1)' },
        { maxWidth: px(W), marginLeft: '0.3em', offset: 0.58 },
        { maxWidth: px(W), marginLeft: '0.3em' },
      ], { dur: D });
      tl.to(word, [
        { opacity: 0, transform: 'translateY(0.35em) scale(0.3) rotate(-12deg)' },
        { opacity: 0, transform: 'translateY(0.35em) scale(0.3) rotate(-12deg)', offset: 0.52, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { opacity: 1, transform: 'translateY(' + em(-0.1 * a) + ') scale(' + (1 + 0.28 * a).toFixed(3) + ') rotate(4deg)', offset: 0.68, easing: 'cubic-bezier(.4,0,.3,1)' },
        { opacity: 1, transform: 'translateY(0em) scale(0.96) rotate(-1deg)', offset: 0.8 },
        { opacity: 1, transform: 'translateY(0em) scale(1) rotate(0deg)' },
      ], { dur: D });
      tl.cue(() => sfx(o, 'pop'), D * 0.55);
    }
    tl.cue(() => sfx(o, 'whoosh'), s0);
    tl.hold(D);
    tl.then(() => {
      clean(el);
      setState(el, 'final');
      drawDeco(el, 'strike');
    });
    return tl.play();
  },
};

function strikeInitial(el) {
  live(el);
  setState(el, 'initial');
  clearDeco(el, 'strike');
}

function strikeFinal(el, to) {
  live(el);
  strikeRep(el, to);
  setState(el, 'final');
  drawDeco(el, 'strike');
}

// ------------------------------------------------------------------ callout: a speech bubble with a note
function topSafe() {
  const bar = document.querySelector('.topbar, .lab-bar');
  const b = bar ? bar.getBoundingClientRect().bottom : 0;
  return Math.max(8, b + 8);
}

const callout = {
  prime(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); setState(el, 'initial'); },
  settle(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); setState(el, 'final'); },
  reset(el) { el = byId(el); if (!el) return; stop(el, 'finish'); clean(el); setState(el, 'initial'); },
  run(el, opts) {
    el = byId(el);
    if (!el) return instant();
    const o = begin('callout', el, opts);
    const note = o.params.text != null ? String(o.params.text) : el.dataset.text || '';
    if (note && !el.dataset.text) el.dataset.text = note;
    if (o.reduced) return instant(() => setState(el, 'final'));
    setState(el, 'playing');
    const D = o.D;
    const a = o.k.amp;
    const targets = units(el);
    const cs = letters(el);
    const tl = new Timeline(el);
    tl.to(targets, [{ transform: 'translateY(0em) scale(1)' }, { transform: 'translateY(' + em(-0.08 * a) + ') scale(' + (1 + 0.12 * a).toFixed(3) + ')', offset: 0.12, easing: 'cubic-bezier(.3,0,.3,1)' }, { transform: 'translateY(0em) scale(1)', offset: 0.3 }, { transform: 'translateY(0em) scale(1)' }], { dur: D });
    tl.to(cs, heat(0.1, 0.84), { dur: D });
    if (note) {
      const bub = overlay('fx-bubble');
      bub.innerHTML = '<div class="fx-bubble-in"><span class="fx-bubble-text"></span><span class="fx-bubble-tail"></span></div>';
      bub.querySelector('.fx-bubble-text').textContent = note;
      onClean(el, () => unoverlay(bub));
      const inner = bub.firstChild;
      let below = false;
      const place = () => {
        const { vw } = viewportSize();
        const lines = lineBoxes(el);
        const r = lines.length ? lines[0] : (() => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })();
        const bw = bub.offsetWidth;
        const bh = bub.offsetHeight;
        const cx = r.x + r.w / 2;
        const x = clamp(cx - bw / 2, 10, Math.max(10, vw - 10 - bw));
        below = r.y - bh - 14 < topSafe();
        const y = below ? r.y + r.h + 14 : r.y - bh - 14;
        bub.style.left = px(x);
        bub.style.top = px(y);
        bub.classList.toggle('is-below', below);
        inner.style.setProperty('--tail-x', px(clamp(cx - x, 18, bw - 18)));
      };
      place();
      const dy = below ? -1 : 1;
      tl.to(inner, [
        { opacity: 0, transform: 'translateY(' + (12 * dy) + 'px) scale(0.35)', easing: 'cubic-bezier(.25,1.5,.4,1)' },
        { opacity: 1, transform: 'translateY(0px) scale(1)', offset: 0.2 },
        { opacity: 1, transform: 'translateY(0px) scale(1)', offset: 0.84, easing: 'cubic-bezier(.5,0,.75,0)' },
        { opacity: 0, transform: 'translateY(' + (-6 * dy) + 'px) scale(0.92)' },
      ], { dur: D });
      tl.cue(() => {
        const loop = frames(place, D);
        onClean(el, () => loop.stop());
      }, 0);
    }
    tl.cue(() => sfx(o, 'pop'), 0);
    tl.hold(D);
    tl.then(() => {
      clean(el);
      setState(el, 'final');
    });
    return tl.play();
  },
};

export const effects = {
  marker, underline, circle, spotlight, zoom, bouncein, jelly, wave, typewriter, callout,
  strike, flip3d, countup, odometer, scramble, shake, glitch,
};
