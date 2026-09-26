// Hand-drawn path generators for the text decorations (marker, circle, underline, strike).
// All coordinates are local to one text line box (0..w, 0..h, y down). rnd is a seeded random function.

const f = (n) => Math.round(n * 10) / 10;

/** Smooth path through points (uniform Catmull-Rom converted to cubic Beziers). */
export function smooth(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  let d = 'M' + f(p[1][0]) + ' ' + f(p[1][1]);
  for (let i = 1; i < p.length - 2; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const [x3, y3] = p[i + 2];
    d += 'C' + f(x1 + (x2 - x0) / 6) + ' ' + f(y1 + (y2 - y0) / 6) + ' ' + f(x2 - (x3 - x1) / 6) + ' ' + f(y2 - (y3 - y1) / 6) + ' ' + f(x2) + ' ' + f(y2);
  }
  return d;
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Highlighter: a broad pass left to right and a thinner pass back, slightly tilted. */
export function marker(w, h, rnd) {
  const sw = h * 0.64;
  const y = h * 0.6;
  const x0 = -h * 0.06 + sw * 0.3;
  const x1 = w + h * 0.06 - sw * 0.3;
  const n = Math.max(3, Math.round(w / 36));
  const tilt = (rnd() - 0.5) * h * 0.1;
  const a = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    a.push([lerp(x0, x1, t), y + tilt * (t - 0.5) + (rnd() - 0.5) * h * 0.05]);
  }
  const b = [];
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    b.push([lerp(x0 + sw * 0.25, x1 - sw * 0.1, t), y - h * 0.1 + tilt * (t - 0.5) + (rnd() - 0.5) * h * 0.06]);
  }
  return [
    { d: smooth(a), width: sw, opacity: 1 },
    { d: smooth(b), width: sw * 0.6, opacity: 0.7 },
  ];
}

/** A pen loop around the words that overshoots its start. */
export function loop(w, h, rnd) {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 + Math.max(6, h * 0.28);
  const ry = h / 2 + Math.max(6, h * 0.34);
  const tilt = (rnd() - 0.5) * 0.09;
  const start = -Math.PI * (0.6 + rnd() * 0.12);
  const sweep = Math.PI * 2 + 0.55 + rnd() * 0.35;
  const n = 34;
  const ph = rnd() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + sweep * t;
    const wob = 1 + 0.04 * Math.sin(a * 2 + ph) + (rnd() - 0.5) * 0.018;
    const grow = 1 - 0.03 + 0.1 * t;
    const x = Math.cos(a) * rx * wob * grow;
    const y = Math.sin(a) * ry * wob * grow;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return [{ d: smooth(pts), width: Math.max(3.2, h * 0.15) }];
}

/** A quick scribbled underline: a wavy pass and a hooked return underneath. */
export function scribble(w, h, rnd) {
  const y = h * 1.04;
  const n = Math.max(4, Math.round(w / 20));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lerp(-h * 0.12, w + h * 0.14, t), y + Math.sin(t * Math.PI * (n / 2.4)) * h * 0.045 + (rnd() - 0.5) * h * 0.05 - t * h * 0.03]);
  }
  const m = Math.max(3, Math.round(n * 0.55));
  for (let i = 1; i <= m; i++) {
    const t = i / m;
    pts.push([lerp(w + h * 0.06, w * 0.2, t), y + h * 0.17 + (rnd() - 0.5) * h * 0.05 + t * h * 0.02]);
  }
  return [{ d: smooth(pts), width: Math.max(3.2, h * 0.15) }];
}

/** A strike-out: one confident stroke through the middle and a zig back. */
export function strike(w, h, rnd) {
  const y = h * 0.56;
  const a = [
    [-h * 0.14, y + h * 0.07],
    [w * 0.34, y + (rnd() - 0.5) * h * 0.08],
    [w * 0.68, y - h * 0.03 + (rnd() - 0.5) * h * 0.08],
    [w + h * 0.14, y - h * 0.1],
  ];
  const b = [
    [w + h * 0.04, y + h * 0.02],
    [w * 0.64, y + h * 0.11 + (rnd() - 0.5) * h * 0.05],
    [w * 0.3, y + h * 0.08 + (rnd() - 0.5) * h * 0.05],
    [-h * 0.08, y + h * 0.17],
  ];
  const sw = Math.max(3, h * 0.13);
  return [{ d: smooth(a), width: sw }, { d: smooth(b), width: sw * 0.8 }];
}
