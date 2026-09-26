// Code-block effects for the v2 library (SPEC section 12): typecode, terminal, flyvalue, diff, errorfx.
// They work on the compiler's code markup: figure.blk.code > pre > code > span.ln[data-line] + div.out > span.out-line.
// Durations are the registry value x intensity (soft 0.7, normal 1, strong 1.2); reduced motion is instant.
// Nothing here touches the DOM at import time.

import { EFFECTS } from './registry.js';
import { Timeline, instant, stop } from '../../fx/timeline.js';
import { ease, normalize, spring, token } from '../../fx/motion.js';
import { playSfx } from '../../fx/sound.js';
import { emit, palette } from '../../fx/particles.js';
import { highlightBlock } from '../highlight.js';

const TIME = { soft: 0.7, normal: 1, strong: 1.2 };
// How much stronger the active-line band is (components.css --ln-boost): strong doubles the tint.
const BOOST = { soft: 0, normal: 0.5, strong: 1 };
const durOf = (name, o) => Math.round((EFFECTS[name]?.dur ?? 1000) * (TIME[o.intensity] ?? 1));
const opts = (o) => normalize(o || {});
const sfx = (o, name) => { if (o.sound) playSfx(name, { intensity: o.intensity }); };
const px = (n) => Math.round(n * 10) / 10 + 'px';
const boost = (el, o) => el.style.setProperty('--ln-boost', String(BOOST[o.intensity] ?? 0.5));

const lines = (el) => Array.from(el.querySelectorAll('.ln'));
const lineAt = (el, n) => el.querySelector('.ln[data-line="' + n + '"]');
const outs = (el) => Array.from(el.querySelectorAll('.out-line'));

function textBox(node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  const rects = Array.from(r.getClientRects());
  if (!rects.length) return null;
  const left = Math.min(...rects.map((b) => b.left));
  const right = Math.max(...rects.map((b) => b.right));
  const top = Math.min(...rects.map((b) => b.top));
  const bottom = Math.max(...rects.map((b) => b.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function ensure(parent, cls, html = '') {
  let node = parent.querySelector(':scope > .' + cls);
  if (!node) {
    node = document.createElement('span');
    node.className = cls;
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = html;
    parent.appendChild(node);
  }
  return node;
}

// ------------------------------------------------------------------ typecode
// The code types itself line by line with a block caret and key clicks. Initial state: empty editor
// (line numbers only). Final state: the code as written.
function lineGeom(ln) {
  const cs = getComputedStyle(ln);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const width = ln.getBoundingClientRect().width;
  const text = ln.textContent;
  const box = textBox(ln);
  const textW = box ? box.width : 0;
  return { padL, width, len: text.length, textW, charW: text.length ? textW / text.length : 0, top: ln.offsetTop, left: ln.offsetLeft, height: ln.offsetHeight };
}

const typecode = {
  prime(el) { stop(el, 'cancel'); highlightBlock(el); ensure(el.querySelector('pre') || el, 'code-caret'); el.dataset.typed = '0'; },
  settle(el) { stop(el, 'finish'); highlightBlock(el); delete el.dataset.typed; },
  reset(el) { typecode.prime(el); },
  run(el, raw) {
    const o = opts(raw);
    stop(el, 'finish');
    highlightBlock(el);
    const D = durOf('typecode', o);
    if (o.reduced) return instant(() => { delete el.dataset.typed; });
    boost(el, o);
    const pre = el.querySelector('pre') || el;
    const caret = ensure(pre, 'code-caret');
    delete el.dataset.typed; // measure the real layout (identical in both states)
    const all = lines(el);
    const geo = all.map(lineGeom);
    const typing = D * 0.86;
    const gap = 70 * (TIME[o.intensity] ?? 1);
    const minLine = 110 * (TIME[o.intensity] ?? 1);
    const chars = geo.reduce((s, g) => s + g.len, 0) || 1;
    const budget = Math.max(0, typing - gap * Math.max(0, all.length - 1) - minLine * all.length);
    const tl = new Timeline(el);
    tl.set(() => { el.dataset.typed = 'run'; }, 0);
    let at = 0;
    const caretFrames = [];
    all.forEach((ln, i) => {
      const g = geo[i];
      const len = Math.max(1, g.len);
      const dur = minLine + budget * (g.len / chars);
      const hidden = 'inset(-3px ' + px(g.width - g.padL) + ' -3px 0px)';
      const shown = 'inset(-3px ' + px(Math.max(0, g.width - g.padL - g.textW)) + ' -3px 0px)';
      tl.to(ln, [{ clipPath: hidden, easing: 'steps(' + len + ', end)' }, { clipPath: shown }], { at, dur });
      tl.to(ln, [{ '--ln-on': 0 }, { '--ln-on': 1, offset: 0.08 }, { '--ln-on': 1, offset: 0.85 }, { '--ln-on': 0 }], { at, dur: dur + gap, ease: 'linear' });
      const x0 = g.left + g.padL;
      const y = g.top + g.height * 0.14;
      caretFrames.push({ t: at, x: x0, y, easing: 'steps(' + len + ', end)' });
      caretFrames.push({ t: at + dur, x: x0 + g.len * g.charW, y, easing: 'step-end' });
      if (g.len) tl.cue(() => sfx(o, 'typing'), at);
      if (g.len > 22) tl.cue(() => sfx(o, 'typing'), at + dur * 0.5);
      at += dur + gap;
    });
    const end = Math.min(D, at);
    if (caretFrames.length) {
      const last = caretFrames[caretFrames.length - 1];
      const frames = caretFrames.map((f) => ({ transform: 'translate(' + px(f.x) + ',' + px(f.y) + ')', offset: Math.min(1, f.t / D), easing: f.easing }));
      frames.push({ transform: 'translate(' + px(last.x) + ',' + px(last.y) + ')', offset: 1 });
      frames[0].offset = 0;
      tl.to(caret, frames, { at: 0, dur: D, ease: 'linear' });
      // On while typing, then a few blinks, then gone.
      const on = Math.min(0.98, end / D);
      tl.to(caret, [
        { opacity: 1, offset: 0 }, { opacity: 1, offset: on },
        { opacity: 0, offset: Math.min(0.99, on + (1 - on) * 0.25) }, { opacity: 1, offset: Math.min(0.995, on + (1 - on) * 0.5) },
        { opacity: 1, offset: Math.min(0.997, on + (1 - on) * 0.8) }, { opacity: 0, offset: 1 },
      ], { at: 0, dur: D, ease: 'linear' });
    }
    tl.cue(() => sfx(o, 'tick'), end);
    tl.hold(D);
    tl.then(() => { delete el.dataset.typed; });
    return tl.play();
  },
};

// ------------------------------------------------------------------ terminal
// A terminal-style run inside the usual code block: a status chip ("실행 중…" with a spinner) takes the place
// of the "Python" label, the lines light up as they execute, the output types itself in (each line lands in
// yellow), and the chip turns into "실행 완료". Final state: output visible, "실행 완료" in the corner.
const statusHTML = '<span class="term-spin"></span><span class="term-text">실행 중…</span><span class="term-done">실행 완료</span>';

function hideOut(el) { outs(el).forEach((x) => x.setAttribute('data-fx-hidden', '')); }
function showOut(el) { outs(el).forEach((x) => x.removeAttribute('data-fx-hidden')); }

// A block whose output is an error ends with "오류 발생" instead of "실행 완료".
const failed = (el) => el.classList.contains('has-error') || !!el.querySelector('.out-line.out-error') ||
  outs(el).some((x) => /\b[A-Z][A-Za-z]*Error\b/.test(x.textContent));
function statusChip(el) {
  const status = ensure(el, 'term-status', statusHTML);
  const done = status.querySelector('.term-done');
  const bad = failed(el);
  done.classList.toggle('is-failed', bad);
  done.textContent = bad ? '오류 발생' : '실행 완료';
  return status;
}

const terminal = {
  prime(el) {
    stop(el, 'cancel');
    highlightBlock(el);
    statusChip(el);
    hideOut(el);
    el.dataset.term = '0';
  },
  settle(el) { stop(el, 'finish'); highlightBlock(el); statusChip(el); showOut(el); el.dataset.term = 'done'; },
  reset(el) { terminal.prime(el); },
  run(el, raw) {
    const o = opts(raw);
    stop(el, 'finish');
    highlightBlock(el);
    const status = statusChip(el);
    const D = durOf('terminal', o);
    if (o.reduced) return instant(() => { showOut(el); el.dataset.term = 'done'; });
    boost(el, o);
    const spin = status.querySelector('.term-spin');
    const doing = status.querySelector('.term-text');
    const done = status.querySelector('.term-done');
    const out = outs(el);
    const code = lines(el);
    const tl = new Timeline(el);
    const at = (p) => p * D;
    const doneAt = at(0.84);
    tl.set(() => { showOut(el); el.dataset.term = 'run'; }, 0);
    // Status chip: drops in, spins while the code runs, then swaps to "실행 완료" with a small pop.
    tl.to(status, [{ opacity: 0, transform: 'translateY(-8px) scale(0.9)' }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { at: 0, dur: at(0.14), ease: ease.out });
    // Spinner and "실행 중…" hold their last frame (fill both) so they are gone at doneAt even if the state
    // change below lands a frame late; finish() cancels every track and the CSS "done" state takes over.
    const turns = Math.max(1, Math.round(doneAt / 420)) * 360;
    tl.to(spin, [{ transform: 'rotate(0deg)', opacity: 1 }, { transform: 'rotate(' + turns * 0.97 + 'deg)', opacity: 1, offset: 0.97 }, { transform: 'rotate(' + turns + 'deg)', opacity: 0 }], { at: 0, dur: doneAt, ease: 'linear', fill: 'both' });
    tl.to(doing, [{ opacity: 1 }, { opacity: 1, offset: 0.97 }, { opacity: 0 }], { at: 0, dur: doneAt, ease: 'linear', fill: 'both' });
    tl.set(() => { el.dataset.term = 'done'; }, doneAt);
    tl.to(done, [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.18)', offset: 0.55 }, { opacity: 1, transform: 'scale(1)' }], { at: doneAt, dur: D - doneAt, ease: ease.out });
    // The lines "execute": a quick scan down the code.
    const scan = at(0.34) / Math.max(1, code.length);
    code.forEach((ln, i) => tl.to(ln, [{ '--ln-on': 0 }, { '--ln-on': 1, offset: 0.3 }, { '--ln-on': 0 }], { at: at(0.06) + i * scan, dur: scan * 2.2, ease: 'linear' }));
    // Output streams in, one line after another, each typed out fast and landing in yellow.
    const start = at(0.42);
    const span = at(0.4);
    const each = out.length ? span / out.length : 0;
    const hot = token('--marker');
    out.forEach((line, i) => {
      const len = Math.max(1, line.textContent.length);
      const t0 = start + i * each;
      const ink = getComputedStyle(line).color;
      tl.to(line, [
        { opacity: 1, clipPath: 'inset(-2px 100% -2px 0px)', easing: 'steps(' + Math.min(len, 24) + ', end)' },
        { opacity: 1, clipPath: 'inset(-2px 0% -2px 0px)' },
      ], { at: t0, dur: each * 0.8, ease: 'linear' });
      tl.to(line, [{ color: hot }, { color: hot, offset: 0.5 }, { color: ink }], { at: t0, dur: Math.min(Math.max(each, at(0.3)), D - t0), ease: 'linear' });
      tl.cue(() => sfx(o, 'tick'), t0);
    });
    tl.to(el.querySelector('.out'), [{ '--out-on': 0, easing: ease.out }, { '--out-on': 1, offset: 0.15, easing: 'linear' }, { '--out-on': 1, offset: 0.45, easing: ease.inOut }, { '--out-on': 0 }], { at: start, dur: D - start });
    tl.cue(() => sfx(o, 'typing'), at(0.05));
    tl.cue(() => sfx(o, failed(el) ? 'thud' : 'chime'), doneAt);
    tl.hold(D);
    tl.then(() => { el.dataset.term = 'done'; });
    return tl.play();
  },
};

// ------------------------------------------------------------------ flyvalue
// A glowing value flies from a code line (or the output) to a target: a figure id or "out".
let layer = null;
function flyLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'fx-flylayer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
}

function valueSource(el, line) {
  const ln = line != null ? lineAt(el, line) : null;
  if (ln) {
    const toks = Array.from(ln.querySelectorAll('.tok-num, .tok-str'));
    const tok = toks[toks.length - 1];
    if (tok) return { node: tok, text: tok.textContent.trim() };
    const t = ln.textContent;
    const eq = t.indexOf('=');
    return { node: ln, text: (eq >= 0 ? t.slice(eq + 1) : t).trim() || t.trim() };
  }
  const first = outs(el)[0];
  if (first) return { node: first, text: first.textContent.trim() };
  const last = lines(el).pop();
  return last ? { node: last, text: last.textContent.trim() } : null;
}

function valueTarget(el, to, text) {
  if (!to || to === 'out') {
    const o = outs(el).find((x) => x.textContent.trim() === text) || outs(el)[0] || el.querySelector('.out') || el;
    return o;
  }
  const target = document.getElementById(to);
  if (!target) return el.querySelector('.out') || el;
  // Land on a matching value inside a figure when there is one (for example the 4500 box).
  const match = Array.from(target.querySelectorAll('text, .nt-value, .value, .out-line')).find((n) => n.textContent.trim() === text);
  return match || target.querySelector('.figure-stage') || target;
}

// Centre of what the reader sees: the text itself for code and output lines (they are full-width blocks).
function centerOf(node) {
  if (node instanceof HTMLElement && node.matches('.out-line, .ln')) {
    const b = textBox(node);
    if (b && b.width) return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// The spot the value lands on reacts: an output line flashes yellow, a value in a figure jumps and turns coral.
function landOn(tl, node, at, dur) {
  if (!node || !node.isConnected) return () => {};
  if (node instanceof SVGElement && node.tagName.toLowerCase() === 'text') {
    const fill = getComputedStyle(node).fill;
    const coral = token('--coral');
    node.style.transformBox = 'fill-box';
    node.style.transformOrigin = '50% 50%';
    tl.to(node, [
      { transform: 'scale(1)', fill, easing: ease.out },
      { transform: 'scale(1.32)', fill: coral, offset: 0.22, easing: ease.inOut },
      { transform: 'scale(1)', fill: coral, offset: 0.62, easing: ease.inOut },
      { transform: 'scale(1)', fill },
    ], { at, dur });
    return () => { node.style.transformBox = ''; node.style.transformOrigin = ''; };
  }
  if (node instanceof HTMLElement && node.matches('.out-line')) {
    const hot = token('--marker');
    const ink = getComputedStyle(node).color;
    const band = 'color-mix(in srgb, ' + hot + ' 26%, transparent)';
    tl.to(node, [
      { backgroundColor: 'transparent', color: ink, easing: ease.out },
      { backgroundColor: band, color: hot, offset: 0.2, easing: 'linear' },
      { backgroundColor: band, color: hot, offset: 0.55, easing: ease.inOut },
      { backgroundColor: 'transparent', color: ink },
    ], { at, dur });
  }
  return () => {};
}

const flyvalue = {
  prime() {},
  settle(el) { stop(el, 'finish'); },
  reset(el) { stop(el, 'cancel'); },
  run(el, raw) {
    const o = opts(raw);
    stop(el, 'finish');
    highlightBlock(el);
    const p = o.params || {};
    const D = durOf('flyvalue', o);
    if (o.reduced) return instant();
    const src = valueSource(el, p.line != null ? p.line : o.line);
    if (!src) return instant();
    const target = valueTarget(el, p.to, src.text);
    const from = centerOf(src.node);
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const to = centerOf(target);
    to.x = Math.min(vw - 24, Math.max(24, to.x));
    to.y = Math.min(vh - 24, Math.max(24, to.y));
    const cs = getComputedStyle(src.node);
    const chip = document.createElement('div');
    chip.className = 'fly-chip';
    chip.textContent = src.text;
    chip.style.fontSize = cs.fontSize;
    const ring = document.createElement('div');
    ring.className = 'fly-ring';
    const host = flyLayer();
    host.append(chip, ring);
    const cw = chip.offsetWidth;
    const ch = chip.offsetHeight;
    const k = o.k.amp;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const lift = Math.min(220, 60 + dist * 0.35) * k;
    // Keep the top of the arc inside the viewport (a quadratic curve peaks halfway to its control point).
    const low = Math.min(from.y, to.y);
    const ctrl = { x: (from.x + to.x) / 2, y: Math.max(80 - low, low - lift) };
    const pos = (t) => ({
      x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * ctrl.x + t * t * to.x,
      y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * ctrl.y + t * t * to.y,
    });
    const tl = new Timeline(el);
    const at = (q) => q * D;
    // Launch (0-0.18): pop out of the line. Flight (0.18-0.78). Land (0.78-1).
    const frames = [];
    const T0 = 0.18, T1 = 0.78;
    frames.push({ transform: 'translate(' + px(from.x - cw / 2) + ',' + px(from.y - ch / 2) + ') scale(1)', opacity: 0, offset: 0 });
    frames.push({ transform: 'translate(' + px(from.x - cw / 2) + ',' + px(from.y - ch / 2 - 14 * k) + ') scale(' + (1 + 0.45 * k).toFixed(2) + ')', opacity: 1, offset: T0 });
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const q = pos(t);
      const s = 1 + 0.45 * k - 0.2 * t;
      frames.push({ transform: 'translate(' + px(q.x - cw / 2) + ',' + px(q.y - ch / 2) + ') scale(' + s.toFixed(2) + ') rotate(' + ((1 - t) * -8 * k).toFixed(1) + 'deg)', opacity: 1, offset: T0 + (T1 - T0) * t });
    }
    // Landing: the chip is absorbed into the target (which then jumps, see landOn).
    frames.push({ transform: 'translate(' + px(to.x - cw / 2) + ',' + px(to.y - ch / 2) + ') scale(0.5)', opacity: 0, offset: 0.85 });
    frames.push({ transform: 'translate(' + px(to.x - cw / 2) + ',' + px(to.y - ch / 2) + ') scale(0.5)', opacity: 0, offset: 1 });
    tl.to(chip, frames, { at: 0, dur: D, ease: 'linear' });
    tl.to(ring, [
      { transform: 'translate(' + px(to.x) + ',' + px(to.y) + ') scale(0.2)', opacity: 0 },
      { transform: 'translate(' + px(to.x) + ',' + px(to.y) + ') scale(0.2)', opacity: 0, offset: T1 },
      { transform: 'translate(' + px(to.x) + ',' + px(to.y) + ') scale(1)', opacity: 1, offset: T1 + 0.06 },
      { transform: 'translate(' + px(to.x) + ',' + px(to.y) + ') scale(2.2)', opacity: 0 },
    ], { at: 0, dur: D, ease: 'linear' });
    // The source value lights up as it lifts off.
    const hot = token('--marker');
    const srcInk = getComputedStyle(src.node).color;
    const srcBand = 'color-mix(in srgb, ' + hot + ' 30%, transparent)';
    tl.to(src.node, [
      { backgroundColor: 'transparent', color: srcInk, easing: ease.out },
      { backgroundColor: srcBand, color: hot, offset: 0.2, easing: 'linear' },
      { backgroundColor: srcBand, color: hot, offset: 0.6, easing: ease.inOut },
      { backgroundColor: 'transparent', color: srcInk },
    ], { at: 0, dur: at(0.5) });
    const unland = landOn(tl, target, at(T1), D - at(T1));
    const colors = palette(['--marker', '--gold', '--coral']);
    [0.35, 0.5, 0.65].forEach((q) => tl.cue(() => { const c = pos((q - T0) / (T1 - T0)); emit({ x: c.x, y: c.y, kind: 'spark', count: Math.round(5 * o.k.count), colors, speed: [80, 200], life: [240, 380], radius: 3 }); }, at(q)));
    tl.cue(() => emit({ x: to.x, y: to.y, kind: 'confetti', count: Math.round(14 * o.k.count), colors: palette(['--marker', '--coral', '--mint', '--accent']), speed: [180 * k, 380 * k], life: [0.3 * D, 0.42 * D], size: [4, 7] }), at(T1));
    tl.cue(() => sfx(o, 'whoosh'), at(0.12));
    tl.cue(() => sfx(o, 'pop'), at(T1));
    tl.hold(D);
    tl.then(() => { chip.remove(); ring.remove(); unland(); });
    return tl.play();
  },
};

// ------------------------------------------------------------------ diff
// The changed part of a line glows and morphs from the old value (from an earlier line with the same name)
// into the new one, digit by digit like an odometer. The code text itself never changes; afterwards the changed
// token keeps a small marker so readers can find it.
function lhs(text) {
  const m = /^\s*([A-Za-z_][\w.]*)\s*=(?!=)/.exec(text);
  return m ? m[1] : null;
}

function findChange(el, n) {
  const all = lines(el);
  let ln = n != null ? lineAt(el, n) : null;
  if (!ln) {
    // Default: the last line that reassigns a name used earlier.
    for (let i = all.length - 1; i > 0 && !ln; i--) {
      const name = lhs(all[i].textContent);
      if (name && all.slice(0, i).some((p) => lhs(p.textContent) === name)) ln = all[i];
    }
    ln = ln || all[all.length - 1];
  }
  if (!ln) return null;
  const name = lhs(ln.textContent);
  const idx = all.indexOf(ln);
  const prev = name ? all.slice(0, idx).reverse().find((p) => lhs(p.textContent) === name) : null;
  const toks = (x) => Array.from(x.querySelectorAll('[class^="tok-"]')).filter((t) => !t.classList.contains('tok-op'));
  const now = toks(ln);
  if (prev) {
    const before = toks(prev);
    for (let i = 0; i < now.length; i++) {
      if (!before[i] || before[i].textContent !== now[i].textContent) return { ln, tok: now[i], old: before[i] ? before[i].textContent : '' };
    }
  }
  const lit = now.filter((t) => t.classList.contains('tok-num') || t.classList.contains('tok-str'));
  const tok = lit[lit.length - 1] || now[now.length - 1];
  return tok ? { ln, tok, old: null } : { ln, tok: null, old: null };
}

function clearDiff(el) {
  el.querySelectorAll('.tok-changed').forEach((t) => t.classList.remove('tok-changed'));
  el.querySelectorAll('.diff-reel, .diff-glow').forEach((n) => n.remove());
}

const diff = {
  prime(el) { stop(el, 'cancel'); highlightBlock(el); clearDiff(el); },
  settle(el, raw) {
    stop(el, 'finish');
    highlightBlock(el);
    const o = opts(raw);
    const c = findChange(el, o.params?.line ?? o.line);
    if (c && c.tok) c.tok.classList.add('tok-changed');
  },
  reset(el) { diff.prime(el); },
  run(el, raw) {
    const o = opts(raw);
    stop(el, 'finish');
    highlightBlock(el);
    clearDiff(el);
    const D = durOf('diff', o);
    const c = findChange(el, o.params?.line ?? o.line);
    if (!c || !c.tok) return instant();
    if (o.reduced) return instant(() => c.tok.classList.add('tok-changed'));
    boost(el, o);
    const { ln, tok, old } = c;
    const lb = ln.getBoundingClientRect();
    const tb = tok.getBoundingClientRect();
    const k = o.k.amp;
    const tl = new Timeline(el);
    const at = (q) => q * D;
    // Glow behind the token.
    const glow = document.createElement('span');
    glow.className = 'diff-glow';
    glow.setAttribute('aria-hidden', 'true');
    Object.assign(glow.style, { left: px(tb.left - lb.left - 5), top: px(tb.top - lb.top - 2), width: px(tb.width + 10), height: px(tb.height + 4) });
    ln.appendChild(glow);
    tl.to(glow, [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'scale(' + (1 + 0.18 * k).toFixed(2) + ')', offset: 0.25 },
      { opacity: 1, transform: 'scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'scale(1)' },
    ], { at: 0, dur: D, ease: ease.out });
    tl.to(ln, [{ '--ln-on': 0 }, { '--ln-on': 1, offset: 0.2 }, { '--ln-on': 1, offset: 0.7 }, { '--ln-on': 0 }], { at: 0, dur: D, ease: 'linear' });
    // Odometer: each changed character rolls from the old glyph to the new one. A number with no earlier value
    // in the block spins its digits once around from and back to its own value (no invented old value).
    const now = tok.textContent;
    const escHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let seqs = null; // one glyph sequence per column; every sequence has the same length N
    let whole = false;
    if (old != null && old !== now) {
      if (old.length === now.length) seqs = Array.from(now, (ch, i) => [old[i], ch]);
      else { seqs = [[old, now]]; whole = true; }
    } else if (old == null && /^\d[\d_.]*$/.test(now)) {
      seqs = Array.from(now, (ch) => (/\d/.test(ch) ? [0, 4, 7, 0].map((k) => String((Number(ch) + k) % 10)) : [ch, ch, ch, ch]));
    }
    if (seqs) {
      const reel = document.createElement('span');
      reel.className = 'diff-reel';
      reel.setAttribute('aria-hidden', 'true');
      Object.assign(reel.style, { left: px(tb.left - lb.left), top: px(tb.top - lb.top), height: px(tb.height), width: px(tb.width) });
      reel.style.setProperty('--h', px(tb.height));
      reel.style.color = getComputedStyle(tok).color;
      const cw = tb.width / Math.max(1, now.length);
      const N = seqs[0].length;
      const cols = [];
      seqs.forEach((seq, i) => {
        const col = document.createElement('span');
        col.className = 'diff-col' + (whole ? ' is-whole' : '') + (seq.every((g) => g === seq[0]) ? ' is-same' : '');
        if (!whole) { col.style.left = px(i * cw); col.style.width = px(cw); }
        col.innerHTML = seq.map((g) => '<span>' + escHTML(g) + '</span>').join('');
        reel.appendChild(col);
        cols.push(col);
      });
      ln.appendChild(reel);
      tl.to(tok, [{ color: 'transparent' }, { color: 'transparent', offset: 0.96 }, { color: getComputedStyle(tok).color }], { at: 0, dur: D, ease: 'linear' });
      const moving = cols.filter((c2) => !c2.classList.contains('is-same'));
      // Linear timing with per-segment easing, so the old value really holds before it rolls. The reel keeps
      // its last frame (fill forwards) until it fades out; it is removed at the end.
      const stagger = Math.min(D * 0.05, (D * 0.18) / Math.max(1, moving.length - 1));
      const end = (-100 * (N - 1)) / N;
      const over = end - 8 / N;
      const hold = old == null ? 0.12 : 0.3; // hold the old value; a spin starts almost at once
      tl.to(moving, [
        { transform: 'translateY(0%)', easing: 'linear' },
        { transform: 'translateY(0%)', offset: hold, easing: ease.inOut },
        { transform: 'translateY(' + over.toFixed(2) + '%)', offset: 0.74, easing: ease.inOut },
        { transform: 'translateY(' + end.toFixed(2) + '%)' },
      ], { at: 0, dur: D * 0.8, stagger, ease: 'linear', fill: 'both' });
      tl.to(reel, [{ opacity: 1 }, { opacity: 1, offset: 0.95 }, { opacity: 0 }], { at: 0, dur: D, ease: 'linear' });
      moving.forEach((_, i) => tl.cue(() => sfx(o, 'tick'), at(0.2) + i * stagger));
    }
    tl.cue(() => sfx(o, 'pop'), at(0.62));
    tl.cue(() => emit({ x: tb.left + tb.width / 2, y: tb.top + tb.height / 2, kind: 'spark', count: Math.round(10 * o.k.count), colors: palette(['--marker', '--gold']), speed: [140 * k, 300 * k], life: [260, 420], radius: tb.width / 2 }), at(0.62));
    tl.hold(D);
    tl.then(() => { glow.remove(); el.querySelectorAll('.diff-reel').forEach((n) => n.remove()); tok.classList.add('tok-changed'); });
    return tl.play();
  },
};

// ------------------------------------------------------------------ errorfx
// Red flash, a shake and an error badge. The badge names the error when the output shows one
// (NameError, SyntaxError...) and the failing line keeps a red mark. Final state keeps badge and mark.
function errorInfo(el, n) {
  const text = outs(el).map((x) => x.textContent).join('\n');
  const name = (/\b([A-Z][A-Za-z]*Error)\b/.exec(text) || [])[1] || '';
  let line = n != null ? Number(n) : null;
  if (line == null) {
    const m = /line (\d+)/.exec(text);
    if (m) line = Number(m[1]);
  }
  if (line == null) {
    // The compiler records which code line produced each output line (data-from).
    const bad = el.querySelector('.out-line.out-error') || outs(el).find((x) => name && x.textContent.includes(name));
    const from = bad ? Number(bad.dataset.from) : NaN;
    if (Number.isFinite(from) && lineAt(el, from)) line = from;
  }
  return { name, line };
}

function markError(el, info) {
  const badge = ensure(el, 'err-badge', '<b>!</b><span></span>');
  badge.querySelector('span').textContent = info.name || '오류';
  el.dataset.error = 'on';
  el.querySelectorAll('.ln-error').forEach((x) => x.classList.remove('ln-error'));
  if (info.line != null) lineAt(el, info.line)?.classList.add('ln-error');
  // The output line that names the error ("NameError: ...") is marked too, so badge and message connect.
  // The compiler already marks it (.out-error) in lessons; generic markup gets the same class, tagged as ours.
  if (!el.querySelector('.out-line.out-error') && info.name) {
    outs(el).forEach((x) => { if (x.textContent.includes(info.name)) { x.classList.add('out-error'); x.dataset.fxErr = ''; } });
  }
  return badge;
}

function clearError(el) {
  delete el.dataset.error;
  el.querySelectorAll('.ln-error').forEach((x) => x.classList.remove('ln-error'));
  el.querySelectorAll('.out-line[data-fx-err]').forEach((x) => { x.classList.remove('out-error'); delete x.dataset.fxErr; });
}

const errorfx = {
  prime(el) { stop(el, 'cancel'); clearError(el); },
  settle(el, raw) { stop(el, 'finish'); const o = opts(raw); markError(el, errorInfo(el, o.params?.line ?? o.line)); },
  reset(el) { errorfx.prime(el); },
  run(el, raw) {
    const o = opts(raw);
    stop(el, 'finish');
    highlightBlock(el);
    const D = durOf('errorfx', o);
    const info = errorInfo(el, o.params?.line ?? o.line);
    if (o.reduced) return instant(() => markError(el, info));
    const badge = markError(el, info);
    const flash = ensure(el, 'err-flash');
    const k = o.k.amp;
    const tl = new Timeline(el);
    const at = (q) => q * D;
    tl.to(flash, [{ opacity: 0 }, { opacity: 0.55, offset: 0.08 }, { opacity: 0.05, offset: 0.3 }, { opacity: 0.35, offset: 0.4 }, { opacity: 0 }], { at: 0, dur: at(0.7), ease: 'linear' });
    const s = (x) => 'translateX(' + (x * k).toFixed(1) + 'px)';
    tl.to(el, [
      { transform: s(0) }, { transform: s(-14), offset: 0.12 }, { transform: s(12), offset: 0.26 }, { transform: s(-9), offset: 0.4 },
      { transform: s(7), offset: 0.54 }, { transform: s(-4), offset: 0.7 }, { transform: s(2), offset: 0.84 }, { transform: s(0) },
    ], { at: at(0.04), dur: at(0.5), ease: 'linear' });
    tl.to(badge, [
      { opacity: 0, transform: 'scale(0.3) rotate(-18deg)' },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' },
    ], { at: at(0.3), dur: at(0.42), ease: spring(0.45) });
    const bad = el.querySelector('.ln-error');
    if (bad) tl.to(bad, [{ '--err-on': 0 }, { '--err-on': 1, offset: 0.3 }, { '--err-on': 0.4, offset: 0.55 }, { '--err-on': 1 }], { at: at(0.1), dur: at(0.6), ease: 'linear' });
    tl.cue(() => sfx(o, 'glitch'), 0);
    tl.cue(() => sfx(o, 'stamp'), at(0.34));
    tl.cue(() => { const r = badge.getBoundingClientRect(); emit({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: 'spark', count: Math.round(10 * o.k.count), colors: palette(['--danger', '--coral']), speed: [160, 320], life: [240, 400], radius: 6 }); }, at(0.36));
    tl.hold(D);
    return tl.play();
  },
};

export const effects = { typecode, terminal, flyvalue, diff, errorfx };
