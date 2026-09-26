// Intro motifs: small symbolic drawings for a lesson's intro (and the course page cards).
//   tag     a name tag swinging onto a value box (variables)
//   branch  a path splitting in two, one way chosen (conditionals)
//   loop    a circular arrow with dots going round (loops)
//   list    items sliding into a row of slots (lists)
//   generic the course emblem ">>>" with a cursor
// motifSVG(name, look) is pure (a string, no DOM), so the compiler can inline the finished drawing.
// motifStory(svg, name, tl, t0, ctx) adds the drawing's own animation to a Timeline and returns its end time.
// Colours come from CSS custom properties set per look in components.css (--m-ink, --m-face, ...).

import { ease } from '../../fx/motion.js';

export const MOTIF_NAMES = ['tag', 'branch', 'loop', 'list', 'generic'];

const r2 = (n) => Math.round(n * 100) / 100;
const pt = (x, y) => r2(x) + ' ' + r2(y);

// ---------------------------------------------------------------- geometry
const TAG_SHAPE = 'M-158 -32 H-12 L12 -11 V11 L-12 32 H-158 Q-170 32 -170 20 V-20 Q-170 -32 -158 -32 Z';

function tag() {
  return '<g class="m-pop" data-p="box">' +
      '<rect class="m-base" x="236" y="156" width="196" height="136" rx="24"/>' +
      '<rect class="m-face" x="236" y="148" width="196" height="136" rx="24"/>' +
      '<text class="m-value" x="334" y="217">4500</text>' +
    '</g>' +
    '<g data-p="tag" style="transform:translate(190px,206px)">' +
      '<path class="m-string m-draw" data-p="string" pathLength="1" d="M0 0 Q 26 20 46 12"/>' +
      '<g data-p="swing" style="transform:rotate(-5deg)">' +
        '<path class="m-accent" d="' + TAG_SHAPE + '"/>' +
        '<circle class="m-hole" r="6.5"/>' +
        '<text class="m-tagtext" x="-80" y="1">price</text>' +
      '</g>' +
    '</g>' +
    '<rect class="m-clip m-pop" data-p="clip" x="229" y="203" width="14" height="30" rx="4"/>';
}

const BR = {
  stem: [40, 180, 176, 180],
  up: [[236, 180], [292, 180], [300, 94], [368, 94]],
  down: [[236, 180], [292, 180], [300, 266], [368, 266]],
  yes: [398, 94],
  no: [398, 266],
};
function branch() {
  const c = (p) => 'M' + pt(...p[0]) + ' C ' + pt(...p[1]) + ' ' + pt(...p[2]) + ' ' + pt(...p[3]);
  return '<path class="m-line m-thick m-draw" data-p="stem" pathLength="1" d="M' + pt(BR.stem[0], BR.stem[1]) + ' H' + BR.stem[2] + '"/>' +
    '<path class="m-line m-thick m-draw" data-p="up" pathLength="1" d="' + c(BR.up) + '"/>' +
    '<path class="m-line m-thick m-draw m-dimmed" data-p="down" pathLength="1" d="' + c(BR.down) + '"/>' +
    '<path class="m-face m-pop" data-p="diamond" d="M206 150 L236 180 L206 210 L176 180 Z"/>' +
    '<circle class="m-ring" data-p="yes-ring" cx="' + BR.yes[0] + '" cy="' + BR.yes[1] + '" r="26"/>' +
    '<circle class="m-accent m-pop" data-p="yes" cx="' + BR.yes[0] + '" cy="' + BR.yes[1] + '" r="26"/>' +
    '<circle class="m-ring m-dimmed" data-p="no" cx="' + BR.no[0] + '" cy="' + BR.no[1] + '" r="26"/>' +
    '<text class="m-label" data-p="label" x="' + BR.yes[0] + '" y="42">True</text>' +
    '<text class="m-label m-dimmed" data-p="label" x="' + BR.no[0] + '" y="320">False</text>' +
    '<circle class="m-dot m-traveler" data-p="dot" r="11"/>';
}

const LOOP = { cx: 240, cy: 180, r: 112, a0: -58, sweep: 296 };
const polar = (deg, r = LOOP.r) => [LOOP.cx + r * Math.cos((deg * Math.PI) / 180), LOOP.cy + r * Math.sin((deg * Math.PI) / 180)];
function loop() {
  const s = polar(LOOP.a0);
  const e = polar(LOOP.a0 + LOOP.sweep);
  const a1 = LOOP.a0 + LOOP.sweep;
  // Arrowhead at the end of the arc, pointing along the clockwise tangent.
  const t = [-Math.sin((a1 * Math.PI) / 180), Math.cos((a1 * Math.PI) / 180)];
  const n = [-t[1], t[0]];
  const tip = [e[0] + t[0] * 26, e[1] + t[1] * 26];
  const wing = (k) => [e[0] - t[0] * 2 + n[0] * k, e[1] - t[1] * 2 + n[1] * k];
  const dots = [82, 202, 322].map((d) => polar(d));
  return '<path class="m-line m-thick m-draw" data-p="arc" pathLength="1" d="M' + pt(...s) + ' A ' + LOOP.r + ' ' + LOOP.r + ' 0 1 1 ' + pt(...e) + '"/>' +
    '<path class="m-head m-pop" data-p="head" d="M' + pt(...wing(17)) + ' L' + pt(...tip) + ' L' + pt(...wing(-17)) + ' Z"/>' +
    '<g data-p="orbit" style="transform-origin:' + LOOP.cx + 'px ' + LOOP.cy + 'px">' +
      dots.map((p, i) => '<circle class="m-dot m-dot-' + (i + 1) + ' m-pop" data-p="dot" cx="' + pt(...p).split(' ')[0] + '" cy="' + pt(...p).split(' ')[1] + '" r="15"/>').join('') +
    '</g>' +
    '<text class="m-count m-pop" data-p="count" x="' + LOOP.cx + '" y="' + (LOOP.cy + 2) + '">\u00d73</text>';
}

const LIST = { x: [96, 172, 248, 324], y: 148, s: 62, values: ['3', '1', '4', '1'] };
function list() {
  const slot = (x) => '<rect class="m-slot" data-p="slot" x="' + x + '" y="' + LIST.y + '" width="' + LIST.s + '" height="' + LIST.s + '" rx="12"/>';
  const item = (x, v, i) => '<g class="m-item m-item-' + (i + 1) + '" data-p="item">' +
    '<rect class="m-face" x="' + x + '" y="' + LIST.y + '" width="' + LIST.s + '" height="' + LIST.s + '" rx="12"/>' +
    '<text class="m-value m-value-sm" x="' + (x + LIST.s / 2) + '" y="' + (LIST.y + LIST.s / 2 + 1) + '">' + v + '</text></g>';
  const idx = (x, i) => '<text class="m-index" data-p="idx" x="' + (x + LIST.s / 2) + '" y="' + (LIST.y + LIST.s + 34) + '">' + i + '</text>';
  return '<path class="m-line m-thick m-draw" data-p="bracket" pathLength="1" d="M88 112 H64 V246 H88"/>' +
    '<path class="m-line m-thick m-draw" data-p="bracket" pathLength="1" d="M392 112 H416 V246 H392"/>' +
    LIST.x.map(slot).join('') +
    LIST.x.map((x, i) => item(x, LIST.values[i], i)).join('') +
    LIST.x.map(idx).join('');
}

function generic() {
  const chev = (x, i) => '<path class="m-line m-chev m-chev-' + (i + 1) + '" data-p="chev" d="M' + x + ' 126 L' + (x + 54) + ' 180 L' + x + ' 234"/>';
  return [74, 152, 230].map(chev).join('') +
    '<rect class="m-accent m-cursor" data-p="cursor" x="326" y="146" width="40" height="70" rx="5"/>';
}

const BUILD = { tag, branch, loop, list, generic };

/** Finished motif drawing as an SVG string. look: 'cinema' | 'editorial' | 'playful' | 'mini'. */
export function motifSVG(name, look = 'cinema') {
  const m = BUILD[name] ? name : 'generic';
  return '<svg class="motif motif-' + m + ' motif-look-' + look + '" viewBox="0 0 480 360" focusable="false" aria-hidden="true">' + BUILD[m]() + '</svg>';
}

// ---------------------------------------------------------------- stories
const pop = (big = 1.14) => [
  { opacity: 0, transform: 'scale(0.2)' },
  { opacity: 1, transform: 'scale(' + big + ')', offset: 0.6 },
  { opacity: 1, transform: 'scale(1)' },
];
const draw = [{ strokeDashoffset: 1.02 }, { strokeDashoffset: 0 }];
const rot = (d) => ({ transform: 'rotate(' + r2(d) + 'deg)' });

function cubic(p, t) {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
}

const STORY = {
  tag(q, tl, t0, c) {
    const S = c.T;
    tl.to(q('box'), [{ opacity: 0, transform: 'translateY(' + r2(-30 * c.amp) + 'px) scale(0.9)' }, { opacity: 1, transform: 'translateY(0px) scale(1)' }], { at: t0, dur: 560 * S, ease: c.ease });
    tl.to(q('tag'), [
      { transform: 'translate(' + r2(190 - 118 * c.amp) + 'px,' + r2(206 - 160 * c.amp) + 'px)', opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: 'translate(190px,206px)', opacity: 1 },
    ], { at: t0 + 260 * S, dur: 620 * S, ease: ease.out });
    tl.to(q('swing'), [
      { ...rot(-64 * c.amp), easing: ease.inOut },
      { ...rot(22 * c.amp), offset: 0.4, easing: ease.inOut },
      { ...rot(-12 * c.amp), offset: 0.63, easing: ease.inOut },
      { ...rot(5 * c.amp), offset: 0.82, easing: ease.inOut },
      rot(-5),
    ], { at: t0 + 260 * S, dur: 1120 * S, ease: 'linear' });
    tl.to(q('string'), draw, { at: t0 + 860 * S, dur: 260 * S, ease: ease.out });
    tl.to(q('clip'), pop(1.5), { at: t0 + 1040 * S, dur: 300 * S, ease: ease.out });
    return t0 + 1380 * S;
  },

  branch(q, tl, t0, c) {
    const S = c.T;
    tl.to(q('stem'), draw, { at: t0, dur: 420 * S, ease: ease.inOut });
    tl.to(q('diamond'), pop(1.2), { at: t0 + 300 * S, dur: 380 * S, ease: c.ease });
    tl.to([q('up'), q('down')], draw, { at: t0 + 520 * S, dur: 460 * S, ease: ease.inOut });
    tl.to(q('yes-ring'), [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { at: t0 + 860 * S, dur: 300 * S, ease: ease.out });
    // One track for the unchosen end: it appears with the other, then steps back once the choice is made.
    tl.to(q('no'), [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'scale(1)', offset: 0.36 },
      { opacity: 1, transform: 'scale(1)', offset: 0.48 },
      { opacity: 0.32, transform: 'scale(1)' },
    ], { at: t0 + 860 * S, dur: 800 * S, ease: ease.out });
    // The traveller runs the stem, crosses the diamond and takes the upper way.
    const frames = [];
    const push = (x, y, off) => frames.push({ transform: 'translate(' + r2(x) + 'px,' + r2(y) + 'px)', offset: off });
    const A = 0.3, B = 0.42, C = 0.9;
    for (let i = 0; i <= 6; i++) push(BR.stem[0] + (BR.stem[2] - BR.stem[0]) * (i / 6), 180, (A * i) / 6);
    push(206, 180, (A + B) / 2);
    for (let i = 0; i <= 12; i++) { const [x, y] = cubic(BR.up, i / 12); push(x, y, B + ((C - B) * i) / 12); }
    push(BR.yes[0], BR.yes[1], 1);
    frames.forEach((f, i) => { f.opacity = i === 0 ? 0 : 1; });
    frames[1].opacity = 1;
    frames[frames.length - 1].opacity = 0;
    tl.to(q('dot'), frames, { at: t0 + 160 * S, dur: 1160 * S, ease: 'linear' });
    tl.to(q('yes'), pop(1.16), { at: t0 + 1240 * S, dur: 380 * S, ease: c.ease });
    tl.to(q('down'), [{ opacity: 1 }, { opacity: 0.32 }], { at: t0 + 1240 * S, dur: 420 * S, ease: ease.inOut });
    tl.to(q('label', true), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)' }], { at: t0 + 1300 * S, dur: 380 * S, stagger: 80 * S, ease: ease.out });
    return t0 + 1760 * S;
  },

  loop(q, tl, t0, c) {
    const S = c.T;
    tl.to(q('arc'), draw, { at: t0, dur: 820 * S, ease: ease.inOut });
    tl.to(q('head'), pop(1.25), { at: t0 + 720 * S, dur: 300 * S, ease: c.ease });
    tl.to(q('dot', true), pop(1.3), { at: t0 + 260 * S, dur: 360 * S, stagger: 110 * S, ease: c.ease });
    tl.to(q('orbit'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { at: t0 + 760 * S, dur: 1320 * S, ease: ease.inOut });
    tl.to(q('count'), pop(1.2), { at: t0 + 1900 * S, dur: 380 * S, ease: c.ease });
    return t0 + 2280 * S;
  },

  list(q, tl, t0, c) {
    const S = c.T;
    tl.to(q('bracket', true), draw, { at: t0, dur: 440 * S, ease: ease.inOut });
    tl.to(q('slot', true), [{ opacity: 0 }, { opacity: 1 }], { at: t0 + 180 * S, dur: 320 * S, stagger: 60 * S, ease: ease.out });
    tl.to(q('item', true), [
      { opacity: 0, transform: 'translateX(' + r2(300 * c.amp) + 'px)' },
      { opacity: 1, offset: 0.25 },
      { opacity: 1, transform: 'translateX(0px)' },
    ], { at: t0 + 400 * S, dur: 560 * S, stagger: 150 * S, ease: c.ease });
    tl.to(q('idx', true), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0px)' }], { at: t0 + 1180 * S, dur: 320 * S, stagger: 60 * S, ease: ease.out });
    return t0 + 1680 * S;
  },

  generic(q, tl, t0, c) {
    const S = c.T;
    tl.to(q('chev', true), [
      { opacity: 0, transform: 'translateX(' + r2(-40 * c.amp) + 'px)' },
      { opacity: 1, transform: 'translateX(0px)' },
    ], { at: t0, dur: 440 * S, stagger: 150 * S, ease: c.ease });
    tl.to(q('cursor'), [
      { opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.34 },
      { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.54 }, { opacity: 1, offset: 0.76 }, { opacity: 0, offset: 0.8 },
      { opacity: 0, offset: 0.92 }, { opacity: 1 },
    ], { at: t0 + 600 * S, dur: 1400 * S, ease: 'linear' });
    return t0 + 2000 * S;
  },
};

/**
 * Add a motif's story to a Timeline. ctx: { T: time factor, amp: amplitude, ease: easing for arrivals }.
 * Returns the end time in ms.
 */
export function motifStory(svg, name, tl, t0, ctx = {}) {
  const m = STORY[name] ? name : 'generic';
  const q = (p, all = false) => {
    const list = Array.from(svg.querySelectorAll('[data-p="' + p + '"]'));
    return all ? list : list[0];
  };
  return STORY[m](q, tl, t0, { T: 1, amp: 1, ease: ease.out, ...ctx });
}
