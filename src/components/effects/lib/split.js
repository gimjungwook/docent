// Split the text of an effect element into character spans for per-letter motion, and put it back.
// Only text nodes are replaced: element nodes (the engine's .u words, inline code) stay exactly where they are,
// so the engine's references and word colours keep working. restore() puts the original text nodes back.

const live = new WeakMap(); // root element -> restore()
let segmenter = null;

function graphemes(s) {
  if (segmenter === null) {
    segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : false;
  }
  return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
}

/**
 * Wrap every visible character under root in span.fxc (inside span.fxw per word run, which never wraps).
 * Whitespace stays plain text. Nodes inside "skip" (a selector) are left alone.
 * Returns { chars, restore }. Calling it again first restores the previous split.
 */
export function splitChars(root, { skip = '' } = {}) {
  unsplit(root);
  const texts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.data || !/\S/.test(t.data)) continue;
    if (skip && t.parentElement && t.parentElement.closest(skip)) continue;
    texts.push(t);
  }
  const chars = [];
  const records = [];
  for (const t of texts) {
    const frag = document.createDocumentFragment();
    const made = [];
    for (const part of t.data.split(/(\s+)/)) {
      if (!part) continue;
      if (!/\S/.test(part)) {
        const s = document.createTextNode(part);
        frag.appendChild(s);
        made.push(s);
        continue;
      }
      const w = document.createElement('span');
      w.className = 'fxw';
      for (const g of graphemes(part)) {
        const c = document.createElement('span');
        c.className = 'fxc';
        c.textContent = g;
        w.appendChild(c);
        chars.push(c);
      }
      frag.appendChild(w);
      made.push(w);
    }
    const parent = t.parentNode;
    parent.insertBefore(frag, t);
    parent.removeChild(t);
    records.push({ t, made });
  }
  root.classList.add('fx-split');
  const restore = () => {
    if (live.get(root) !== restore) return;
    live.delete(root);
    for (const { t, made } of records) {
      const first = made.find((m) => m.parentNode);
      if (first) first.parentNode.insertBefore(t, first);
      for (const m of made) if (m.parentNode) m.parentNode.removeChild(m);
    }
    root.classList.remove('fx-split');
  };
  live.set(root, restore);
  return { chars, restore };
}

/** Undo splitChars on root (no-op when it is not split). */
export function unsplit(root) {
  const restore = root && live.get(root);
  if (restore) restore();
}

/** Freeze each char's current width so swapping its glyph never reflows the line. */
export function fixWidths(chars) {
  const widths = chars.map((c) => c.getBoundingClientRect().width);
  chars.forEach((c, i) => {
    c.style.width = widths[i].toFixed(2) + 'px';
    c.classList.add('is-fixed');
  });
  return widths;
}
