// name-tag: the variables lesson figure. A value is a box; a name is a tag tied to it, read like "price = 4500".
// Steps: 1 price -> 4500 | 2 price moves to 5000 and 4500 is left without a name | 3 count -> 3 |
//        4 price x count feeds a small x that makes 15000, named total.
// Pure data + string markup (svg) so the compiler can import it in Node; mount() adds the DOM behaviour.

import { ease } from '../../fx/motion.js';

const W = 720;
const H = 400;
const COL = 250;                  // left edge of the value column
const ROW = [70, 160, 250, 340];  // row centre lines
const BOX_H = 60;
const BOX = {
  a: { value: '4500', w: 150, row: 0 },
  b: { value: '5000', w: 150, row: 1 },
  c: { value: '3', w: 96, row: 2 },
  r: { value: '15000', w: 176, row: 3 },
};
const TAGS = ['price', 'count', 'total'];
const HOLE = { dx: -40, dy: -8 }; // tag hole relative to the box's left-middle point
const REST = -3;                  // resting tilt of a tag in degrees
const HIDDEN = 1.02;              // dash offset that hides a pathLength=1 stroke completely (no end caps)
const OP = { x: COL + 150 + 92, y: (ROW[1] + ROW[2]) / 2 };

// Camera framing per step so every static state reads as a finished diagram.
const CAM = [
  { x: 244, y: 72, s: 1.38 },
  { x: 244, y: 72, s: 1.38 },
  { x: 244, y: 116, s: 1.3 },
  { x: 252, y: 160, s: 1.14 },
  { x: 300, y: 205, s: 1 },
];

const r2 = (n) => Math.round(n * 100) / 100;
const px = (n) => r2(n) + 'px';
const camT = (c) => 'translate(' + px(W / 2) + ', ' + px(H / 2) + ') scale(' + c.s + ') translate(' + px(-c.x) + ', ' + px(-c.y) + ')';
const holeOf = (box) => ({ x: COL + HOLE.dx, y: ROW[BOX[box].row] + HOLE.dy });
const anchorT = (box, dx = 0, dy = 0) => {
  const h = holeOf(box);
  return 'translate(' + px(h.x + dx) + ', ' + px(h.y + dy) + ')';
};

function state(step) {
  const s = Math.max(0, Math.min(4, step | 0));
  return {
    cam: CAM[s],
    box: { a: s >= 2 ? 0.35 : s >= 1 ? 1 : 0, b: s >= 2 ? 1 : 0, c: s >= 3 ? 1 : 0, r: s >= 4 ? 1 : 0 },
    clip: { a: s === 1, b: s >= 2, c: s >= 3, r: s >= 4 },
    tag: {
      price: { box: s >= 2 ? 'b' : 'a', on: s >= 1 },
      count: { box: 'c', on: s >= 3 },
      total: { box: 'r', on: s >= 4 },
    },
    op: s >= 4,
  };
}

// Inline style for every moving part at a given state (shared by svg() and set()).
function styleOf(key, st) {
  const [kind, id] = key.split(':');
  switch (kind) {
    case 'cam': return 'transform:' + camT(st.cam);
    case 'box': return 'opacity:' + st.box[id];
    case 'clip': return 'opacity:' + (st.clip[id] ? 1 : 0);
    case 'tag': return 'transform:' + anchorT(st.tag[id].box) + ';opacity:' + (st.tag[id].on ? 1 : 0);
    case 'body': return 'transform:rotate(' + REST + 'deg)';
    case 'string': return 'stroke-dashoffset:' + (st.tag[id].on ? 0 : HIDDEN);
    case 'line': return 'stroke-dashoffset:' + (st.op ? 0 : HIDDEN);
    case 'arrow': return 'opacity:' + (st.op ? 1 : 0);
    case 'node': return 'opacity:' + (st.op ? 1 : 0);
    default: return '';
  }
}

const attr = (key, st) => ' data-k="' + key + '" style="' + styleOf(key, st) + '"';

function boxMarkup(id, st) {
  const b = BOX[id];
  return '<g transform="translate(' + COL + ' ' + ROW[b.row] + ')">' +
    '<g class="nt-box"' + attr('box:' + id, st) + '>' +
    '<rect class="nt-box-base" x="0" y="' + (-BOX_H / 2 + 5) + '" width="' + b.w + '" height="' + BOX_H + '" rx="12"/>' +
    '<rect class="nt-box-face" x="0" y="' + (-BOX_H / 2) + '" width="' + b.w + '" height="' + BOX_H + '" rx="12"/>' +
    '<text class="nt-value" x="' + b.w / 2 + '" y="1">' + b.value + '</text>' +
    '<rect class="nt-clip" x="-4.5" y="-10" width="9" height="20" rx="3"' + attr('clip:' + id, st) + '/>' +
    '</g></g>';
}

function tagMarkup(name, st) {
  const sx = -HOLE.dx;
  const sy = -HOLE.dy;
  return '<g class="nt-tag"' + attr('tag:' + name, st) + '>' +
    '<path class="nt-string" pathLength="1" d="M0 0 Q ' + r2(sx * 0.48) + ' ' + r2(sy + 12) + ' ' + sx + ' ' + sy + '"' + attr('string:' + name, st) + '/>' +
    '<g class="nt-tag-body"' + attr('body:' + name, st) + '>' +
    '<path class="nt-tag-shape" d="M-114 -21 H-6 L10 -7 V7 L-6 21 H-114 Q-122 21 -122 13 V-13 Q-122 -21 -114 -21 Z"/>' +
    '<circle class="nt-hole" cx="0" cy="0" r="4.2"/>' +
    '<text class="nt-name" x="-57" y="1">' + name + '</text>' +
    '</g></g>';
}

function opMarkup(st) {
  const k = 0.7071 * 19;
  const bx = COL + BOX.b.w;
  const cx = COL + BOX.c.w;
  const rx = COL + BOX.r.w;
  return '<g class="nt-op">' +
    '<path class="nt-line" pathLength="1" d="M' + bx + ' ' + ROW[1] + ' C ' + (bx + 40) + ' ' + ROW[1] + ' ' + r2(OP.x - k - 18) + ' ' + r2(OP.y - k - 14) + ' ' + r2(OP.x - k) + ' ' + r2(OP.y - k) + '"' + attr('line:b', st) + '/>' +
    '<path class="nt-line" pathLength="1" d="M' + cx + ' ' + ROW[2] + ' C ' + (cx + 74) + ' ' + ROW[2] + ' ' + r2(OP.x - k - 22) + ' ' + r2(OP.y + k + 16) + ' ' + r2(OP.x - k) + ' ' + r2(OP.y + k) + '"' + attr('line:c', st) + '/>' +
    '<path class="nt-line nt-line-out" pathLength="1" d="M' + OP.x + ' ' + (OP.y + 19) + ' C ' + OP.x + ' ' + (ROW[3] - 44) + ' ' + (OP.x - 12) + ' ' + ROW[3] + ' ' + (rx + 8) + ' ' + ROW[3] + '"' + attr('line:r', st) + '/>' +
    '<path class="nt-arrow" d="M' + (rx + 13) + ' ' + (ROW[3] - 7) + ' L' + (rx + 3) + ' ' + ROW[3] + ' L' + (rx + 13) + ' ' + (ROW[3] + 7) + '"' + attr('arrow', st) + '/>' +
    '<g transform="translate(' + OP.x + ' ' + OP.y + ')"><g class="nt-node"' + attr('node', st) + '>' +
    '<circle r="19"/><text class="nt-op-sign" y="1">\u00d7</text>' +
    '</g></g></g>';
}

/** Static SVG markup of the figure at a step. Pure: safe to call from Node. */
function svg(step) {
  const st = state(step);
  // "slice" lets narrow screens crop the empty sides (see components.css) so labels stay large.
  return '<svg class="nt" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">' +
    '<g class="nt-cam"' + attr('cam', st) + '>' +
    opMarkup(st) +
    TAGS.map((t) => tagMarkup(t, st)).join('') +
    Object.keys(BOX).map((b) => boxMarkup(b, st)).join('') +
    '</g></svg>';
}

function mount(stage) {
  stage.innerHTML = svg(4);
  const parts = {};
  stage.querySelectorAll('[data-k]').forEach((el) => { parts[el.dataset.k] = el; });
  const P = (k) => parts[k];

  function set(step) {
    const st = state(step);
    for (const key in parts) parts[key].style.cssText = styleOf(key, st);
  }

  // Tracks for one step (from -> to = from + 1). Returns the step length in ms.
  function animate(tl, from, to, ctx = {}) {
    const T = ctx.T ?? 1;
    const amp = ctx.amp ?? 1;
    const D = 900 * T;
    const A = state(from);
    const B = state(to);
    const at = (p) => p * D;
    const swing = (deg) => 'rotate(' + r2(deg * amp) + 'deg)';

    const cA = camT(A.cam);
    const cB = camT(B.cam);
    if (cA !== cB) tl.to(P('cam'), [{ transform: cA }, { transform: cB }], { at: 0, dur: D, ease: ease.inOut });

    const appear = (id, t0, len, from = 'drop') => {
      const off = from === 'side' ? 'translate(' + px(26 * amp) + ', 0px) scale(0.96)' : 'translate(0px, ' + px(-12 * amp) + ') scale(0.94)';
      tl.to(P('box:' + id), [{ opacity: 0, transform: off }, { opacity: B.box[id], transform: 'translate(0px, 0px) scale(1)' }], { at: t0, dur: len, ease: ease.out });
    };
    const clipIn = (id, t0, len) => {
      tl.to(P('clip:' + id), [
        { opacity: 0, transform: 'scale(0.3)' },
        { opacity: 1, transform: 'scale(1.45)', offset: 0.55 },
        { opacity: 1, transform: 'scale(1)' },
      ], { at: t0, dur: len, ease: ease.out });
    };
    const swingIn = (name, box, t0, len) => {
      tl.to(P('tag:' + name), [
        { transform: anchorT(box, -64 * amp, -96 * amp), opacity: 0 },
        { opacity: 1, offset: 0.22 },
        { transform: anchorT(box), opacity: 1 },
      ], { at: t0, dur: len * 0.62, ease: ease.out });
      tl.to(P('body:' + name), [
        { transform: swing(-50), easing: ease.inOut },
        { transform: swing(17), offset: 0.42, easing: ease.inOut },
        { transform: swing(-9), offset: 0.66, easing: ease.inOut },
        { transform: swing(3), offset: 0.84, easing: ease.inOut },
        { transform: 'rotate(' + REST + 'deg)' },
      ], { at: t0, dur: len, ease: 'linear' });
    };
    const attach = (name, box, t0, len) => {
      tl.to(P('string:' + name), [{ strokeDashoffset: HIDDEN }, { strokeDashoffset: 0 }], { at: t0, dur: len * 0.6, ease: ease.out });
      clipIn(box, t0 + len * 0.45, len * 0.55);
    };

    if (to === 1) {
      appear('a', 0, at(0.34));
      swingIn('price', 'a', at(0.12), at(0.64));
      attach('price', 'a', at(0.66), at(0.34));
    } else if (to === 2) {
      appear('b', 0, at(0.32), 'side');
      // The string lets go of 4500, the tag travels to 5000 and ties on again.
      tl.to(P('string:price'), [
        { strokeDashoffset: 0 },
        { strokeDashoffset: HIDDEN, offset: 0.18 },
        { strokeDashoffset: HIDDEN, offset: 0.8 },
        { strokeDashoffset: 0 },
      ], { at: at(0.08), dur: at(0.84), ease: 'linear' });
      tl.to(P('clip:a'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.4)' }], { at: at(0.08), dur: at(0.16), ease: ease.out });
      tl.to(P('tag:price'), [
        { transform: anchorT('a') },
        { transform: anchorT('a', -26 * amp, -16 * amp), offset: 0.3 },
        { transform: anchorT('b', -14 * amp, -8 * amp), offset: 0.78 },
        { transform: anchorT('b') },
      ], { at: at(0.2), dur: at(0.56), ease: ease.inOut });
      tl.to(P('body:price'), [
        { transform: 'rotate(' + REST + 'deg)', easing: ease.inOut },
        { transform: swing(-18), offset: 0.3, easing: ease.inOut },
        { transform: swing(13), offset: 0.62, easing: ease.inOut },
        { transform: swing(-7), offset: 0.8, easing: ease.inOut },
        { transform: swing(1), offset: 0.92, easing: ease.inOut },
        { transform: 'rotate(' + REST + 'deg)' },
      ], { at: at(0.2), dur: at(0.74), ease: 'linear' });
      tl.to(P('box:a'), [{ opacity: 1 }, { opacity: B.box.a }], { at: at(0.3), dur: at(0.46), ease: ease.inOut });
      clipIn('b', at(0.84), at(0.16));
    } else if (to === 3) {
      appear('c', 0, at(0.34));
      swingIn('count', 'c', at(0.12), at(0.64));
      attach('count', 'c', at(0.66), at(0.34));
    } else if (to === 4) {
      tl.to([P('line:b'), P('line:c')], [{ strokeDashoffset: HIDDEN }, { strokeDashoffset: 0 }], { at: at(0.04), dur: at(0.28), stagger: at(0.05), ease: ease.inOut });
      tl.to(P('node'), [
        { opacity: 0, transform: 'scale(0.2)' },
        { opacity: 1, transform: 'scale(1.18)', offset: 0.6 },
        { opacity: 1, transform: 'scale(1)' },
      ], { at: at(0.26), dur: at(0.24), ease: ease.out });
      tl.to(P('line:r'), [{ strokeDashoffset: HIDDEN }, { strokeDashoffset: 0 }], { at: at(0.44), dur: at(0.2), ease: ease.inOut });
      tl.to(P('arrow'), [{ opacity: 0 }, { opacity: 1 }], { at: at(0.6), dur: at(0.08), ease: 'linear' });
      appear('r', at(0.52), at(0.24), 'side');
      swingIn('total', 'r', at(0.56), at(0.36));
      attach('total', 'r', at(0.8), at(0.2));
    }
    return D;
  }

  return { set, animate };
}

export default { name: 'name-tag', label: '이름표', steps: 4, svg, mount };
