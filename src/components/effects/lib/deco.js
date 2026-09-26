// Hand-drawn decorations (SVG) laid over the text of an inline effect: marker, circle, underline, strike.
// The drawing is measured from the text's own line boxes (Range rects, grouped per line), so it follows
// wrapped phrases. Each element keeps one seeded shape (seeded by its id), so settle() redraws the same
// stroke, and live decorations are redrawn after a resize or once web fonts finish loading.

import { seeded, isRunning } from './core.js';
import * as draw from './draw.js';

const NS = 'http://www.w3.org/2000/svg';
const SKIP = '.fx-deco, .fx-strike-to, .fx-ghost, .fx-neon-pill';

const KINDS = {
  marker: { paths: draw.marker },
  circle: { paths: draw.loop },
  underline: { paths: draw.scribble },
  strike: { paths: draw.strike },
};

/** Text line boxes of el in viewport coordinates: [{ x, y, w, h }] top to bottom. */
export function lineBoxes(el, skip = SKIP) {
  const rects = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!/\S/.test(t.data)) continue;
    if (skip && t.parentElement && t.parentElement.closest(skip)) continue;
    range.selectNodeContents(t);
    for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rects.push(r);
  }
  rects.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const r of rects) {
    const mid = r.top + r.height / 2;
    const line = lines.find((l) => mid >= l.top && mid <= l.bottom);
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
  }
  return lines.map((l) => ({ x: l.left, y: l.top, w: l.right - l.left, h: l.bottom - l.top }));
}

export function clearDeco(el, kind) {
  if (!el) return;
  el.querySelectorAll(':scope > .fx-deco' + (kind ? '-' + kind : '')).forEach((n) => n.remove());
}

/**
 * Draw decoration "kind" over el (finished look) and return its strokes in drawing order:
 * [{ path, length, line }]. Animate them with stroke-dashoffset from length to 0.
 */
export function drawDeco(el, kind) {
  const spec = KINDS[kind];
  clearDeco(el, kind);
  if (!spec) return [];
  const box = document.createElement('span');
  box.className = 'fx-deco fx-deco-' + kind;
  box.setAttribute('aria-hidden', 'true');
  el.appendChild(box);
  const origin = box.getBoundingClientRect();
  const lines = lineBoxes(el);
  const rnd = seeded((el.id || el.dataset.fx || '') + ':' + kind);
  const out = [];
  lines.forEach((L, li) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fx-deco-svg');
    svg.setAttribute('width', L.w.toFixed(1));
    svg.setAttribute('height', L.h.toFixed(1));
    svg.setAttribute('viewBox', '0 0 ' + L.w.toFixed(1) + ' ' + L.h.toFixed(1));
    svg.style.left = (L.x - origin.left).toFixed(1) + 'px';
    svg.style.top = (L.y - origin.top).toFixed(1) + 'px';
    for (const p of spec.paths(L.w, L.h, rnd)) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', p.d);
      path.setAttribute('class', 'fx-deco-path');
      path.style.strokeWidth = p.width.toFixed(2) + 'px';
      if (p.opacity != null) path.style.opacity = String(p.opacity);
      svg.appendChild(path);
      out.push({ path, line: li, length: 0 });
    }
    box.appendChild(svg);
  });
  for (const s of out) {
    try { s.length = s.path.getTotalLength(); } catch { s.length = 1000; }
  }
  keep(el, kind);
  return out;
}

// ---------------------------------------------------------------- keep drawings in place
const kept = new Map(); // el -> kind
let armed = false;
let timer = 0;

function keep(el, kind) {
  kept.set(el, kind);
  if (armed || typeof window === 'undefined') return;
  armed = true;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(refreshDecos, 140);
  });
  if (document.fonts) {
    document.fonts.ready.then(refreshDecos).catch(() => {});
    document.fonts.addEventListener?.('loadingdone', refreshDecos);
  }
}

/** Redraw every finished decoration (after the layout changed). */
export function refreshDecos() {
  for (const [el, kind] of Array.from(kept)) {
    if (!el.isConnected || !el.querySelector(':scope > .fx-deco-' + kind)) {
      kept.delete(el);
      continue;
    }
    if (isRunning(el)) continue;
    drawDeco(el, kind);
  }
}
