// Docent cast art: minji, doyun, owner and pai as small bust avatars (head and shoulders) drawn in SVG.
// Flat shapes, ink outlines, big eyes. Pure: nothing here touches the DOM, so the compiler can import it in Node.
//
// Frame: a 150 x 150 box, x from -75 to 75 (x = 0 is the centre line, the viewer's left is x < 0), y from 0 to 150.
// The bust is cut at y = 150 (the <svg> clips its bottom edge in CSS); hands, emote marks and jumps may leave the
// box on the other sides. Colours come from classes that styles/cast.css maps to tokens and skin tones.

export const BOX = 150;

const f = (v) => String(Math.round(v * 100) / 100);
const d = (...parts) => parts.map((v) => (typeof v === 'number' ? f(v) : v)).join(' ');
const path = (cls, dd) => '<path class="' + cls + '" d="' + dd + '"/>';
const ell = (cls, cx, cy, rx, ry) => '<ellipse class="' + cls + '" cx="' + f(cx) + '" cy="' + f(cy) + '" rx="' + f(rx) + '" ry="' + f(ry) + '"/>';
const circ = (cls, cx, cy, r) => '<circle class="' + cls + '" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '"/>';
const g = (attrs, inner) => '<g ' + attrs + '>' + inner + '</g>';
const at = (x, y) => 'transform="translate(' + f(x) + ' ' + f(y) + ')"';
export const rot = (deg) => 'rotate(' + f(deg) + 'deg)';

// ---------------------------------------------------------------- expressions

export const EXPR_IDS = ['neutral', 'happy', 'excited', 'surprised', 'thinking', 'flustered', 'sad', 'proud', 'wink', 'annoyed'];

// eyes / brows / mouth: part styles. talk: the open mouth used while talking. blush: cheek opacity.
// tilt: head tilt in degrees. pose: where the hands (or pai's tail) go.
export const LOOK = {
  neutral:   { eyes: 'open',    brows: 'soft',      mouth: 'smile',  talk: 'd',     blush: 0.3,  tilt: 0,  pose: 'rest' },
  happy:     { eyes: 'happy',   brows: 'raised',    mouth: 'open',   talk: 'd',     blush: 0.62, tilt: -4, pose: 'rest' },
  excited:   { eyes: 'sparkle', brows: 'high',      mouth: 'grin',   talk: 'd',     blush: 0.72, tilt: 0,  pose: 'up' },
  surprised: { eyes: 'wide',    brows: 'high',      mouth: 'o',      talk: 'o',     blush: 0.14, tilt: 0,  pose: 'whoa' },
  thinking:  { eyes: 'up',      brows: 'up',        mouth: 'side',   talk: 'o',     blush: 0.2,  tilt: 6,  pose: 'chin' },
  flustered: { eyes: 'small',   brows: 'worried',   mouth: 'wavy',   talk: 'o',     blush: 0.95, tilt: -3, pose: 'flail', lines: true },
  sad:       { eyes: 'droop',   brows: 'sad',       mouth: 'frown',  talk: 'frown', blush: 0.12, tilt: 6,  pose: 'rest', tear: true },
  proud:     { eyes: 'content', brows: 'confident', mouth: 'smirk',  talk: 'd',     blush: 0.5,  tilt: -6, pose: 'thumb' },
  wink:      { eyes: 'wink',    brows: 'wink',      mouth: 'tongue', talk: 'd',     blush: 0.55, tilt: -7, pose: 'wave' },
  annoyed:   { eyes: 'flat',    brows: 'angry',     mouth: 'flat',   talk: 'flat',  blush: 0.1,  tilt: 3,  pose: 'rest' },
};

// ---------------------------------------------------------------- face parts

function eyeOpen(x, y, rx, ry, k = 1) {
  rx *= k; ry *= k;
  return ell('ink', x, y, rx, ry) +
    circ('wh', x + rx * 0.3, y - ry * 0.36, rx * 0.42) +
    circ('wh', x - rx * 0.3, y + ry * 0.42, rx * 0.17);
}

function eyeSparkle(x, y, rx, ry) {
  rx *= 1.12; ry *= 1.08;
  const sx = x + rx * 0.22, sy = y - ry * 0.26, a = rx * 0.7, b = rx * 0.2;
  return ell('ink', x, y, rx, ry) +
    path('wh', d('M', sx, sy - a, 'L', sx + b, sy - b, 'L', sx + a, sy, 'L', sx + b, sy + b, 'L', sx, sy + a, 'L', sx - b, sy + b, 'L', sx - a, sy, 'L', sx - b, sy - b, 'Z')) +
    circ('wh', x - rx * 0.36, y + ry * 0.46, rx * 0.18);
}

function eyeWide(x, y, rx, ry) {
  return ell('wh o3', x, y, rx * 1.22, ry * 1.1) +
    circ('ink', x, y + 0.6, rx * 0.6) +
    circ('wh', x + rx * 0.22, y - ry * 0.12, rx * 0.2);
}

function eyeArc(x, y, rx, ry, up) {
  const dd = up
    ? d('M', x - rx * 1.1, y + ry * 0.26, 'Q', x, y - ry * 0.95, x + rx * 1.1, y + ry * 0.26)
    : d('M', x - rx * 1.1, y - ry * 0.2, 'Q', x, y + ry * 0.62, x + rx * 1.1, y - ry * 0.2);
  return path('ln eye-ln', dd);
}

// Lower part of the eye under a lid line. s: -1 left eye, +1 right eye. tilt > 0 droops the outer corner.
function eyeLidded(x, y, rx, ry, s, tilt, lid) {
  const ly = y + ry * lid;
  const xo = x + s * rx * 1.1, xi = x - s * rx * 1.1;
  const yo = ly + tilt, yi = ly - tilt * 0.55;
  return path('ink', d('M', xi, yi, 'L', xo, yo, 'C', xo, y + ry * 1.3, xi, y + ry * 1.3, xi, yi, 'Z')) +
    circ('wh', x + rx * 0.3, y + ry * 0.38, rx * 0.26) +
    path('ln eye-ln', d('M', xi - s * 1.4, yi - 0.4, 'L', xo + s * 2.4, yo + 0.2));
}

function eyes(kind, F) {
  const { ex, ey, rx, ry } = F;
  const L = -ex, R = ex;
  switch (kind) {
    case 'happy': return eyeArc(L, ey, rx, ry, true) + eyeArc(R, ey, rx, ry, true);
    case 'content': return eyeArc(L, ey + 1.5, rx, ry, false) + eyeArc(R, ey + 1.5, rx, ry, false);
    case 'sparkle': return eyeSparkle(L, ey, rx, ry) + eyeSparkle(R, ey, rx, ry);
    case 'wide': return eyeWide(L, ey, rx, ry) + eyeWide(R, ey, rx, ry);
    case 'up': return eyeOpen(L + 2.4, ey - 2.8, rx, ry, 0.9) + eyeOpen(R + 2.4, ey - 2.8, rx, ry, 0.9);
    case 'small': return eyeOpen(L, ey + 1, rx, ry, 0.66) + eyeOpen(R, ey + 1, rx, ry, 0.66);
    case 'droop': return eyeLidded(L, ey, rx, ry, -1, 3.8, -0.12) + eyeLidded(R, ey, rx, ry, 1, 3.8, -0.12);
    case 'flat': return eyeLidded(L, ey, rx, ry, -1, -0.8, 0.04) + eyeLidded(R, ey, rx, ry, 1, -0.8, 0.04);
    case 'wink': return eyeOpen(L, ey, rx, ry) + eyeArc(R, ey + 1, rx, ry, true);
    default: return eyeOpen(L, ey, rx, ry) + eyeOpen(R, ey, rx, ry);
  }
}

const canBlink = (kind) => kind === 'open' || kind === 'sparkle' || kind === 'up' || kind === 'small' || kind === 'wide';

function brow(x, y, bl, kind, s) {
  const xo = x + s * bl / 2, xi = x - s * bl / 2;
  const q = (y1, cy, y2) => path('brow', d('M', xo, y1, 'Q', x, cy, xi, y2));
  switch (kind) {
    case 'raised': return q(y - 2.5, y - 8, y - 3);
    case 'high': return q(y - 6, y - 14, y - 8);
    case 'worried': return q(y + 2.5, y - 1, y - 6.5);
    case 'sad': return q(y + 4, y - 0.5, y - 7.5);
    case 'angry': return q(y - 6, y - 3, y + 4);
    case 'confident': return q(y - 3, y - 7.5, y - 4.5);
    case 'up': return s < 0 ? q(y - 5, y - 13, y - 6.5) : q(y + 1, y - 1, y + 3);
    case 'wink': return s < 0 ? q(y - 3.5, y - 10, y - 4.5) : q(y + 3, y + 1, y + 3.5);
    default: return q(y + 1.5, y - 2.8, y + 1);
  }
}

// Open mouth: flat-ish top, round bottom. my = top line, a = half width, h = depth.
function mouthD(my, a, h, { tongue = true, teeth = false } = {}) {
  let s = path('mo o3', d('M', -a, my, 'Q', 0, my + 2.2, a, my, 'C', a * 0.96, my + h * 1.3, -a * 0.96, my + h * 1.3, -a, my, 'Z'));
  if (teeth) s += path('wh', d('M', -a * 0.8, my + 1.8, 'Q', 0, my + 4.2, a * 0.8, my + 1.8, 'L', a * 0.72, my + 5.4, 'Q', 0, my + 7.8, -a * 0.72, my + 5.4, 'Z'));
  if (tongue) s += path('tg', d('M', -a * 0.5, my + h * 0.8, 'Q', 0, my + h * 0.48, a * 0.5, my + h * 0.8, 'Q', 0, my + h * 0.96, -a * 0.5, my + h * 0.8, 'Z'));
  return s;
}

function mouth(kind, F, snake) {
  const my = F.my, w = F.mw;
  const ln = (dd) => path('ln mouth-ln', dd);
  switch (kind) {
    case 'open': return mouthD(my, w * 0.58, w * 0.72);
    case 'grin': return mouthD(my - 1, w * 0.72, w * 0.84, { teeth: !snake });
    case 'o': return ell('mo o3', 0, my + w * 0.22, w * 0.22, w * 0.28);
    case 'side': return ln(d('M', -w * 0.1, my + 2.4, 'Q', w * 0.16, my + 1.2, w * 0.44, my - 1.8));
    case 'wavy': return ln(d('M', -w * 0.56, my + 1, 'Q', -w * 0.28, my - 4.6, 0, my + 1, 'T', w * 0.56, my + 1));
    case 'frown': return ln(d('M', -w * 0.44, my + 4.8, 'Q', 0, my - w * 0.34, w * 0.44, my + 4.8));
    case 'smirk': return ln(d('M', -w * 0.44, my + 0.5, 'Q', w * 0.06, my + w * 0.44, w * 0.54, my - 3.6));
    case 'tongue': return path('tg o3', d('M', w * 0.02, my + w * 0.26, 'V', my + w * 0.5, 'Q', w * 0.16, my + w * 0.74, w * 0.3, my + w * 0.5, 'V', my + w * 0.22)) +
      ln(d('M', -w * 0.5, my, 'Q', 0, my + w * 0.46, w * 0.5, my));
    case 'flat': return ln(d('M', -w * 0.42, my + 1.8, 'L', w * 0.3, my + 0.6, 'Q', w * 0.42, my + 0.4, w * 0.48, my + 3.6));
    default: return ln(d('M', -w * 0.48, my, 'Q', 0, my + w * 0.46, w * 0.48, my));
  }
}

// The talking mouth, drawn fully open; CSS squashes it (scaleY) to flap.
function talkMouth(kind, F) {
  const my = F.my, w = F.mw;
  switch (kind) {
    case 'o': return ell('mo o3', 0, my + w * 0.36, w * 0.28, w * 0.38) + ell('tg', 0, my + w * 0.56, w * 0.15, w * 0.1);
    case 'frown': return path('mo o3', d('M', -w * 0.5, my + w * 0.64, 'C', -w * 0.46, my - w * 0.18, w * 0.46, my - w * 0.18, w * 0.5, my + w * 0.64, 'Q', 0, my + w * 0.58, -w * 0.5, my + w * 0.64, 'Z'));
    case 'flat': return path('mo o3', d('M', -w * 0.44, my, 'H', w * 0.44, 'Q', w * 0.5, my, w * 0.48, my + 4, 'L', w * 0.42, my + w * 0.48, 'Q', 0, my + w * 0.56, -w * 0.42, my + w * 0.48, 'L', -w * 0.48, my + 4, 'Q', -w * 0.5, my, -w * 0.44, my, 'Z'));
    default: return mouthD(my - 0.5, w * 0.56, w * 0.84);
  }
}

function cheeks(F, alpha) {
  return g('class="a-cheeks" style="opacity:' + f(alpha) + '"', ell('blush', -F.ckx, F.cky, F.ckrx, F.ckry) + ell('blush', F.ckx, F.cky, F.ckrx, F.ckry));
}

function blushLines(F) {
  let s = '';
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = sx * F.ckx + (i - 1) * 4.8;
      s += path('ln3', d('M', x + 1.7, F.cky - 3.8, 'L', x - 1.7, F.cky + 3.4));
    }
  }
  return s;
}

function tear(F) {
  const x = -F.ex - F.rx * 0.95, y = F.ey + F.ry * 0.85;
  return path('tear o3', d('M', x, y, 'C', x + 3.6, y + 5.2, x + 4.8, y + 9, x, y + 11.6, 'C', x - 4.8, y + 9, x - 3.6, y + 5.2, x, y, 'Z'));
}

// ---------------------------------------------------------------- arms (two-link, solved from a hand target)

// Hand targets in frame units for an actor facing right: l = the far arm, r = the near arm (towards the text).
export const HANDS = {
  rest:  { l: [-50, 240, 'fist'], r: [50, 240, 'fist'] },
  up:    { l: [-58, 50, 'open'],  r: [58, 50, 'open'] },
  whoa:  { l: [-47, 94, 'open', 'down'], r: [47, 94, 'open', 'down'] },
  chin:  { l: [-50, 240, 'fist'], r: [7, 117, 'fist', 'down'] },
  flail: { l: [-24, 114, 'open', 'down'], r: [24, 114, 'open', 'down'] },
  thumb: { l: [-50, 240, 'fist'], r: [28, 120, 'thumb', 'down'] },
  wave:  { l: [-50, 240, 'fist'], r: [60, 54, 'open'] },
  point: { l: [-50, 240, 'fist'], r: [124, 122, 'point'] },
  high:  { l: [-50, 240, 'fist'], r: [60, 36, 'open'] },
  clapA: { l: [-28, 130, 'open', 'down'], r: [28, 130, 'open', 'down'] },
  clapB: { l: [-8, 128, 'open', 'down'],  r: [8, 128, 'open', 'down'] },
};

// Pai's tail: [base segment, tip segment (absolute)] as SVG rotations for a tail on the viewer's right.
export const TAIL = {
  rest: [-135, -190], up: [-176, -204], whoa: [-180, -182], chin: [-170, -262], flail: [-142, -100],
  thumb: [-166, -214], wave: [-172, -200], point: [-110, -95], high: [-186, -196],
  clapA: [-150, -176], clapB: [-150, -84],
};

const DEG = 180 / Math.PI;
const norm = (a) => ((a + 180) % 360 + 360) % 360 - 180;

function solveArm(S, a, b, T, side, bend) {
  let dx = T[0] - S[0], dy = T[1] - S[1];
  let dist = Math.hypot(dx, dy) || 0.001;
  const hi = a + b - 0.05, lo = Math.abs(a - b) + 0.5;
  const k = dist > hi ? hi / dist : dist < lo ? lo / dist : 1;
  dx *= k; dy *= k; dist *= k;
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (a * a + dist * dist - b * b) / (2 * a * dist))));
  const e1 = [S[0] + a * Math.cos(base + A), S[1] + a * Math.sin(base + A)];
  const e2 = [S[0] + a * Math.cos(base - A), S[1] + a * Math.sin(base - A)];
  const E = bend === 'down' ? (e1[1] >= e2[1] ? e1 : e2) : (side * e1[0] >= side * e2[0] ? e1 : e2);
  const u = Math.atan2(-(E[0] - S[0]), E[1] - S[1]) * DEG;
  const fa = Math.atan2(-(S[0] + dx - E[0]), S[1] + dy - E[1]) * DEG;
  return { u: Math.round(u * 10) / 10, f: Math.round(norm(fa - u) * 10) / 10 };
}

/** Joint angles for a pose: { l: {u, f, hand}, r: {u, f, hand} }. side "r" mirrors the pose (actor facing left). */
export function armPose(castId, pose, side = 'l') {
  const c = CHARS[castId];
  if (!c || !c.arm) return null;
  const h = HANDS[pose] || HANDS.rest;
  const A = c.arm;
  const mir = side === 'r';
  const one = (s) => {
    let t = mir ? (s < 0 ? h.r : h.l) : (s < 0 ? h.l : h.r);
    if (t[1] > 200) t = [(mir ? -1 : 1) * s * (A.sx + 1), t[1], t[2]];
    const tx = mir ? -t[0] : t[0];
    const j = solveArm([s * A.sx, A.sy], A.l1, A.l2, [tx, t[1]], s, t[3]);
    return { u: j.u, f: j.f, hand: t[2] };
  };
  return { l: one(-1), r: one(1) };
}

export function tailPose(pose, side = 'l') {
  const t = TAIL[pose] || TAIL.rest;
  const m = side === 'r' ? -1 : 1;
  return { u: m * t[0], f: m * (t[1] - t[0]), hand: '' };
}

/** Limb angles for a pose: humans { l, r } arms, pai { r } tail. */
export function limbPose(castId, pose, side) {
  return castId === 'pai' ? { r: tailPose(pose, side) } : armPose(castId, pose, side);
}

export function handShape(kind, r, s) {
  switch (kind) {
    case 'point':
      return path('o3 sk', d('M', -3.4, r * 0.3, 'V', r * 2.3, 'A', 3.4, 3.4, 0, 0, 0, 3.4, r * 2.3, 'V', r * 0.3, 'Z')) + circ('o3 sk', 0, r * 0.3, r);
    case 'thumb':
      return path('o3 sk', d('M', -3.8, r * 0.2, 'V', r * 1.9, 'A', 3.8, 3.8, 0, 0, 0, 3.8, r * 1.9, 'V', r * 0.2, 'Z')) + circ('o3 sk', 0, r * 0.2, r * 1.02);
    case 'open':
      return ell('o3 sk', s * r * 0.9, r * 0.2, r * 0.38, r * 0.6) + ell('o3 sk', 0, r * 0.6, r * 1.02, r * 1.2);
    default:
      return circ('o3 sk', 0, r * 0.3, r);
  }
}

function arm(c, s, j) {
  const A = c.arm;
  const foreCls = A.long ? 'o c1' : 'o sk';
  let fore = path(foreCls, d('M', -A.fw / 2, -5, 'V', A.l2, 'A', A.fw / 2, A.fw / 2, 0, 0, 0, A.fw / 2, A.l2, 'V', -5, 'Z'));
  if (A.long) fore += path('o3 ' + (A.cuff || 'c1b'), d('M', -A.fw / 2 - 0.5, A.l2 - 6.5, 'H', A.fw / 2 + 0.5, 'V', A.l2 + 1, 'H', -A.fw / 2 - 0.5, 'Z'));
  const [w0, w1] = A.sw;
  const sleeve = path('o c1', d('M', -w0 / 2, -6, 'L', -w1 / 2, A.l1 + 2, 'A', w1 / 2, w1 / 2, 0, 0, 0, w1 / 2, A.l1 + 2, 'L', w0 / 2, -6, 'A', w0 / 2, w0 / 2, 0, 0, 0, -w0 / 2, -6, 'Z')) +
    (A.long ? '' : path('ln3', d('M', -w1 / 2 + 1, A.l1 - 3.5, 'Q', 0, A.l1 - 1, w1 / 2 - 1, A.l1 - 3.5)));
  const hand = g('class="a-hand" ' + at(0, A.l2) + ' data-hand="' + j.hand + '" data-s="' + s + '"', handShape(j.hand, A.hr, s));
  const forearm = g(at(0, A.l1), g('class="j j-f" style="transform:' + rot(j.f) + '"', fore + hand));
  return g('class="a-arm a-arm-' + (s < 0 ? 'l' : 'r') + '" ' + at(s * A.sx, A.sy), g('class="j j-u" style="transform:' + rot(j.u) + '"', forearm + sleeve));
}

function tail(j, side) {
  const m = side === 'r' ? -1 : 1;
  const seg1 = path('o c1', d('M', -7.5, -3, 'L', -6, 22, 'A', 6, 6, 0, 0, 0, 6, 22, 'L', 7.5, -3, 'A', 7.5, 7.5, 0, 0, 0, -7.5, -3, 'Z'));
  const seg2 = path('o c1', d('M', -6, -3, 'L', -2.2, 18, 'A', 2.2, 2.2, 0, 0, 0, 2.2, 18, 'L', 6, -3, 'A', 6, 6, 0, 0, 0, -6, -3, 'Z'));
  const tip = g(at(0, 22), g('class="j j-f" style="transform:' + rot(j.f) + '"', seg2));
  return g('class="a-arm a-arm-r a-tail" ' + at(m * 54, 142), g('class="j j-u" style="transform:' + rot(j.u) + '"', tip + seg1));
}

// ---------------------------------------------------------------- the four characters

const MINJI = {
  pivot: [0, 106],
  face: { ex: 17.5, ey: 66, rx: 8.4, ry: 11.2, by: 48, bl: 17, my: 89, mw: 18, ckx: 29, cky: 83, ckrx: 8.6, ckry: 5.2, nose: 'minji' },
  arm: { sx: 42, sy: 126, l1: 38, l2: 36, sw: [22, 19], fw: 14, hr: 9, long: false },
  body() {
    return path('o c1', 'M-20 114C-38 116-50 122-54 138L-58 176H58L54 138C50 122 38 116 20 114Z') +
      path('o sk', 'M-10 94V120H10V94Z') + path('sk2', 'M-10 102Q0 115 10 102V111Q0 124-10 111Z') +
      path('o3 c1', 'M-12 111L-2 128L-21 121Z') + path('o3 c1', 'M12 111L2 128L21 121Z') +
      path('o3 c2', 'M-28 146L-17 116H-10L-20 146Z') + path('o3 c2', 'M28 146L17 116H10L20 146Z') +
      path('o c2', 'M-28 145Q-28 137-20 137H20Q28 137 28 145L32 176H-32Z') +
      path('ln3 c2-line', 'M-16 150H16');
  },
  back() {
    return path('o hr', 'M-53 96C-60 62-57 26-35 12C-18 2 18 2 35 12C57 26 60 62 53 96C50 106 39 110 32 104C26 99-26 99-32 104C-39 110-50 106-53 96Z');
  },
  shape() {
    return path('o sk', 'M-44 60C-44 30-24 16 0 16C24 16 44 30 44 60C44 90 27 108 0 108C-27 108-44 90-44 60Z');
  },
  front() {
    return path('o hr', 'M-45 46C-52 70-50 90-41 103C-36 95-35 74-37 53Z') +
      path('o hr', 'M45 46C52 70 50 90 41 103C36 95 35 74 37 53Z') +
      path('o hr', 'M-46 56C-50 21-28 1 2 1C33 1 52 23 46 56C42 44 36 36 28 32C22 41 11 44 1 38C-8 44-22 44-30 34C-36 40-42 47-46 56Z') +
      path('hl', 'M-30 12C-20 6-8 4 6 5');
  },
};

const DOYUN = {
  pivot: [0, 104],
  face: { ex: 17, ey: 67, rx: 6.8, ry: 9, by: 43, bl: 17, my: 89, mw: 17, ckx: 29, cky: 85, ckrx: 8, ckry: 4.8, nose: 'doyun', glasses: true },
  arm: { sx: 41, sy: 122, l1: 38, l2: 36, sw: [23, 20], fw: 16, hr: 9, long: true, cuff: 'c1b' },
  body() {
    return path('o c1', 'M-22 108C-40 110-52 118-56 134L-60 176H60L56 134C52 118 40 110 22 108Z') +
      path('o c1b', 'M-33 118C-41 101-26 90 0 92C26 90 41 101 33 118C20 127-20 127-33 118Z') +
      path('o sk', 'M-9 90V116H9V90Z') + path('sk2', 'M-9 98Q0 110 9 98V106Q0 118-9 106Z') +
      path('o3 c1', 'M-17 112Q0 126 17 112L19 120Q0 135-19 120Z') +
      path('str-ink', 'M-8 126V146') + path('str', 'M-8 126V146') + path('str-ink', 'M8 126V146') + path('str', 'M8 126V146') +
      path('o3 c2', 'M-11 143H-5V151H-11Z') + path('o3 c2', 'M5 143H11V151H5Z');
  },
  prop() {
    // A laptop tucked under the far arm, lid out, with a pai sticker and a prompt sticker.
    return g('class="a-prop" transform="rotate(-10 -40 138)"',
      path('o lap', 'M-68 124Q-68 118-62 118H-18Q-12 118-12 124V160H-68Z') +
      path('lap-edge', 'M-64 123H-16') +
      circ('o3 stk', -50, 136, 7) + circ('ink', -52.4, 134.8, 1.3) + circ('ink', -47.6, 134.8, 1.3) + path('ln3 stk-smile', 'M-52.5 138.3Q-50 140.2-47.5 138.3') +
      path('o3 stk2', 'M-36 130H-19V141H-36Z') + '<text class="stk-t" x="-27.5" y="138.6">&gt;_</text>');
  },
  back() {
    return circ('o sk', -41, 67, 8) + circ('o sk', 41, 67, 8) +
      path('nose', 'M-43 63Q-38.5 67-43 71') + path('nose', 'M43 63Q38.5 67 43 71');
  },
  shape() {
    return path('o sk', 'M-41 60C-41 30-23 16 0 16C23 16 41 30 41 60C41 90 25 106 0 106C-25 106-41 90-41 60Z');
  },
  front() {
    return path('o hr', 'M-44 58C-50 22-28 2 0 2C29 2 50 22 44 56C42 47 38 41 33 37L31 45L24 35L16 43L9 33L-1 42L-9 32L-20 41L-25 34C-31 36-38 44-44 58Z') +
      path('o hr', 'M-8 5C-7-3 2-7 9-3C5-2 2 1 1 5Z') +
      path('hl', 'M-26 12C-16 6-4 4 8 5');
  },
};

const OWNER = {
  pivot: [0, 110],
  face: { ex: 18, ey: 62, rx: 6.8, ry: 9, by: 42, bl: 19, my: 101, mw: 18, ckx: 31, cky: 84, ckrx: 9, ckry: 5.2, nose: 'owner', stache: true, brow: 'thick' },
  arm: { sx: 46, sy: 132, l1: 38, l2: 36, sw: [25, 21], fw: 17, hr: 9.5, long: true, cuff: 'c2' },
  body() {
    return path('o c1', 'M-24 116C-44 118-56 126-60 142L-62 176H62L60 142C56 126 44 118 24 116Z') +
      path('o3 c2', 'M-19 116H19L3 176H-3Z') +
      path('o3 c1b', 'M-19 116L-3 176H-10L-26 118Z') + path('o3 c1b', 'M19 116L3 176H10L26 118Z') +
      path('o sk', 'M-11 96V120H11V96Z') + path('sk2', 'M-11 104Q0 116 11 104V112Q0 124-11 112Z') +
      path('o3 c2', 'M-13 112L-1 126L-20 128Z') + path('o3 c2', 'M13 112L1 126L20 128Z') +
      path('o3 c3', 'M0 129L-13 121V138Z') + path('o3 c3', 'M0 129L13 121V138Z') + path('o3 c3', 'M-4 124H4V134H-4Z');
  },
  back() {
    return circ('o sk', -45, 66, 9.5) + circ('o sk', 45, 66, 9.5) +
      path('nose', 'M-47.5 61Q-42.5 66-47.5 71') + path('nose', 'M47.5 61Q42.5 66 47.5 71');
  },
  shape() {
    return path('o sk', 'M-45 62C-45 30-25 14 0 14C25 14 45 30 45 62C45 94 28 112 0 112C-28 112-45 94-45 62Z');
  },
  front() {
    return path('o hr', 'M-46 66C-52 28-29 3 0 3C29 3 52 27 46 64C44 53 41 46 36 41C26 33 13 29 1 30C-8 31-15 34-20 39C-24 33-29 30-34 33C-41 38-45 50-46 66Z') +
      path('o hr', 'M-46 50L-44 74L-39 52Z') + path('o hr', 'M46 50L44 74L39 52Z') +
      path('hr-line', 'M-21 38C-19 26-12 15-2 9') + path('hr-line', 'M-4 30C6 18 20 12 34 16') + path('hr-line', 'M-30 16C-24 10-16 7-8 6');
  },
};

const PAI = {
  pivot: [0, 76],
  face: { ex: 17, ey: 42, rx: 9, ry: 11.2, by: 24, bl: 11, my: 59, mw: 26, ckx: 31, cky: 56, ckrx: 7.2, ckry: 4.4, nose: 'pai', snake: true },
  body() {
    return path('o c1', 'M-62 150C-62 136-52 128-38 128H38C52 128 62 136 62 150C62 164 52 172 38 172H-38C-52 172-62 164-62 150Z') +
      path('c1b', 'M-44 144l4.5-4.5 4.5 4.5-4.5 4.5z') + path('c1b', 'M30 146l4-4 4 4-4 4z') + path('c1b', 'M-8 147l3.5-3.5 3.5 3.5-3.5 3.5z') +
      path('neck-ink', 'M3 116C6 100 3 88 0 70') + path('neck', 'M3 116C6 100 3 88 0 70') + path('neck-belly', 'M2.4 114C4.8 100 2.6 89 0.5 78') +
      path('belly-ln', 'M-3.2 86H4.6') + path('belly-ln', 'M-2.4 95H6') + path('belly-ln', 'M-1.8 104H6.6') +
      path('o c1', 'M-47 118C-47 108-39 102-28 102H28C39 102 47 108 47 118C47 128 39 134 28 134H-28C-39 134-47 128-47 118Z') +
      path('c1b', 'M-38 116l4-4 4 4-4 4z') + path('c1b', 'M30 120l3.5-3.5 3.5 3.5-3.5 3.5z');
  },
  tag() {
    return path('ln3 tag-str', 'M-12 84Q-7 101 -2 110Q6 99 13 84') +
      g('class="a-tag" ' + at(-2, 110), g('class="a-tag-swing" style="transform:' + rot(-7) + '"',
        path('o3 tag', 'M-29 9Q-29 5-25 5H-6L0 0L6 5H25Q29 5 29 9V29Q29 33 25 33H-25Q-29 33-29 29Z') + circ('tag-hole o3', 0, 5.4, 1.9) +
        '<text class="tag-t" x="0" y="26.4">파이</text>'));
  },
  back() { return ''; },
  shape() {
    return path('o c1', 'M-44 46C-44 23-24 11 0 11C24 11 44 23 44 46C44 66 26 77 0 77C-26 77-44 66-44 46Z') +
      path('c1b', 'M-10 16l4.5-3.4 4.5 3.4-4.5 3.4z') + path('c1b', 'M7 15l3.4-2.6 3.4 2.6-3.4 2.6z') + path('c1b', 'M-27 23l3.4-2.6 3.4 2.6-3.4 2.6z') +
      path('hl', 'M-30 26C-26 19-18 15-10 14');
  },
  front() { return ''; },
};

export const CHARS = { minji: MINJI, doyun: DOYUN, owner: OWNER, pai: PAI };
export const CAST_IDS = Object.keys(CHARS);

// ---------------------------------------------------------------- assembling

function nose(kind) {
  switch (kind) {
    case 'minji': return path('nose', 'M-1 76Q2.6 79-1 82');
    case 'doyun': return path('nose', 'M-1 76Q2.6 79.5-1 83');
    case 'owner': return path('o3 sk', 'M-7 71C-9 82-3 86 0 86C3 86 9 82 7 71');
    case 'pai': return circ('ink', -5, 52, 1.6) + circ('ink', 5, 52, 1.6);
    default: return '';
  }
}

function stache() {
  return path('o3 hr2 a-stache', 'M0 89C-5 85-17 84-25 90C-30 95-27 100-21 99C-13 97-6 96 0 94C6 96 13 97 21 99C27 100 30 95 25 90C17 84 5 85 0 89Z');
}

function glasses() {
  return g('class="a-glasses"',
    circ('o lens', -17, 67, 14.5) + circ('o lens', 17, 67, 14.5) +
    path('ln', 'M-3 65Q0 60.5 3 65') + path('ln', 'M-31.5 64L-40 61') + path('ln', 'M31.5 64L40 61') +
    path('glint', 'M-26 60Q-23.5 55.5-19 54.5') + path('glint', 'M8 60Q10.5 55.5 15 54.5'));
}

/** The expressive part of the face (eyes, brows, mouths, cheeks). Swapped whole when the expression changes. */
export function faceInner(castId, expr) {
  const c = CHARS[castId];
  const F = c.face;
  const L = LOOK[expr] || LOOK.neutral;
  const snake = !!F.snake;
  let s = cheeks(F, L.blush);
  s += g('class="a-eyes' + (canBlink(L.eyes) ? ' can-blink' : '') + '"', eyes(L.eyes, F));
  s += g('class="a-brows' + (F.brow === 'thick' ? ' is-thick' : '') + '"', brow(-F.ex, F.by, F.bl, L.brows, -1) + brow(F.ex, F.by, F.bl, L.brows, 1));
  s += nose(F.nose);
  const fork = snake && (expr === 'excited' || expr === 'wink')
    ? path('tongue-fork', d('M', 4, F.my + 6, 'L', 5, F.my + 14, 'M', 5, F.my + 14, 'L', 2.4, F.my + 18, 'M', 5, F.my + 14, 'L', 8, F.my + 17.4)) : '';
  s += g('class="a-mouth"', mouth(L.mouth, F, snake) + fork);
  s += g('class="a-talk"', talkMouth(L.talk, F));
  if (L.lines) s += blushLines(F);
  if (L.tear) s += tear(F);
  if (F.stache) s += stache();
  if (F.glasses) s += glasses();
  return s;
}

const turnFor = (side) => (side === 'r' ? -2.5 : side === 'c' ? 0 : 2.5);

export function headTilt(expr, side) {
  const L = LOOK[expr] || LOOK.neutral;
  return side === 'r' ? -L.tilt : L.tilt;
}

function head(castId, expr, side) {
  const c = CHARS[castId];
  const [px, py] = c.pivot;
  const inner = c.back() + c.shape() + g('class="a-turn" ' + at(turnFor(side), 0), g('class="a-face"', faceInner(castId, expr))) + c.front();
  return g('class="a-neck" ' + at(px, py), g('class="a-head" style="transform:' + rot(headTilt(expr, side)) + '"',
    g('class="a-head-react"', g('class="a-head-act"', g('class="a-head-idle"', g(at(-px, -py), inner))))));
}

/** The whole avatar SVG for a cast member and expression. side: "l" faces right (default), "r" faces left. */
export function actorSVG(castId, expr = 'neutral', side = 'l') {
  const c = CHARS[castId];
  if (!c) return '';
  const e = LOOK[expr] ? expr : 'neutral';
  const pose = LOOK[e].pose;
  let rig;
  if (castId === 'pai') {
    rig = c.body() + tail(tailPose(pose, side), side) + c.tag() + head(castId, e, side);
  } else {
    const j = armPose(castId, pose, side);
    rig = c.body() + (c.prop ? c.prop() : '') + head(castId, e, side) + g('class="a-arms"', arm(c, -1, j.l) + arm(c, 1, j.r));
  }
  return '<svg class="cast-art" viewBox="-75 0 150 150" aria-hidden="true" focusable="false">' +
    g('class="a-rig"', rig) + '</svg>';
}

// ---------------------------------------------------------------- emote icons (drawn around 0,0, about 44 units)

function star(x, y, r, cls) {
  const b = r * 0.3;
  return path(cls, d('M', x, y - r, 'Q', x + b * 0.4, y - b * 0.4, x + r, y, 'Q', x + b * 0.4, y + b * 0.4, x, y + r, 'Q', x - b * 0.4, y + b * 0.4, x - r, y, 'Q', x - b * 0.4, y - b * 0.4, x, y - r, 'Z'));
}

function note(x, y) {
  return ell('o3 ink', x, y, 6, 4.6) + path('o3 ink', d('M', x + 4, y - 1.6, 'V', y - 22, 'H', x + 6.6, 'V', y - 2.6, 'Z')) +
    path('o3 ink', d('M', x + 6.6, y - 22, 'Q', x + 14, y - 18.6, x + 13, y - 10, 'Q', x + 11.4, y - 15.4, x + 6.6, y - 16.4, 'Z'));
}

export const EMOTE_ART = {
  exclaim: g('class="em-main"', path('o3 em-coral', 'M-6 -21Q-6 -25 0 -25Q6 -25 6 -21L3.6 5Q3.2 8 0 8Q-3.2 8-3.6 5Z') + circ('o3 em-coral', 0, 16, 5.2)),
  question: g('class="em-main"', path('o3 em-blue', 'M-11.5 -10C-12.5 -24 11 -27 12.5 -12C13.4 -2 4.4-1 3.6 7V9.5H-5.6V5C-5 -6 3.6 -6 3.6 -11.4C3.6 -16.6-2.6 -17.4-2.6 -10.4Z') + circ('o3 em-blue', -1, 18, 5.2)),
  sweat: g('class="em-main"', path('o3 em-sweat', 'M0 -21C5.6 -10.6 12 -3 12 5C12 12.6 6.6 17.6 0 17.6C-6.6 17.6-12 12.6-12 5C-12 -3-5.6 -10.6 0 -21Z') + path('em-shine', 'M-5.6 3.6Q-5.6 10 0 12')),
  heart: g('class="em-main"', path('o3 em-coral', 'M0 17C-17.6 5.6-24 -4.6-19.6 -12.6C-15.8 -20-4.8 -19.4 0 -10.4C4.8 -19.4 15.8 -20 19.6 -12.6C24 -4.6 17.6 5.6 0 17Z') + path('em-shine', 'M-13 -9.4Q-11.4 -14-6 -14.4')),
  sparkle: g('class="em-main"', star(-3, 3, 15, 'o3 em-gold') + star(14, -13, 7.6, 'o3 em-gold') + star(-15, -15, 5.6, 'o3 em-gold')),
  idea: g('class="em-rays"', path('ln3', 'M0 -26V-32') + path('ln3', 'M-16 -20L-20.4 -24.4') + path('ln3', 'M16 -20L20.4 -24.4') + path('ln3', 'M-21 -5H-27') + path('ln3', 'M21 -5H27')) +
    g('class="em-main"', path('o3 em-bulb', 'M-12 -6C-12 -20 12 -20 12 -6C12 2 7 5.6 6 11.6H-6C-7 5.6-12 2-12 -6Z') +
      path('ln3 em-fil', 'M-4.4 4L-2.6 -4L0 0.4L2.6 -5L4.4 4') + path('o3 em-base', 'M-6 11.6H6V17.6Q6 20.4 3.4 20.4H-3.4Q-6 20.4-6 17.6Z')),
  music: g('class="em-main"', note(-10, 12) + note(6, 2)),
  anger: g('class="em-main"', path('em-vein', 'M-3.6 -15Q-3.6 -3.6-15 -3.6') + path('em-vein', 'M3.6 -15Q3.6 -3.6 15 -3.6') + path('em-vein', 'M-3.6 15Q-3.6 3.6-15 3.6') + path('em-vein', 'M3.6 15Q3.6 3.6 15 3.6')),
};

export const EMOTE_IDS = Object.keys(EMOTE_ART);

/** A small speech-bubble badge holding an emote icon (HTML string). */
export function emoteBadge(kind) {
  const art = EMOTE_ART[kind] || EMOTE_ART.exclaim;
  return '<span class="cast-emote" data-emote="' + kind + '" aria-hidden="true"><svg viewBox="-30 -30 60 60" focusable="false">' +
    '<path class="em-bubble" d="M-4 -27H4C18 -27 27 -18 27 -4V2C27 16 18 25 4 25H-8L-21 31L-17 21C-24 16-27 9-27 2V-4C-27 -18-18 -27-4 -27Z"/>' +
    g('transform="scale(0.78)"', g('class="em-art"', art)) + '</svg></span>';
}

