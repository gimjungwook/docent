// Light Python syntax colouring for code blocks. Wraps tokens in spans; the text content never changes.

const KEYWORDS = new Set(('False None True and as assert async await break class continue def del elif else except ' +
  'finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case').split(' '));
const BUILTINS = new Set(('print len range input int str float list dict set tuple type sum min max abs round sorted ' +
  'enumerate zip map filter open bool isinstance reversed any all').split(' '));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wrap = (cls, s) => '<span class="tok-' + cls + '">' + esc(s) + '</span>';

const NUMBER = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?j?)/;
const IDENT = /^[A-Za-z_\u00c0-\uffff][A-Za-z0-9_\u00c0-\uffff]*/;
const STRING_START = /^([rRbBuUfF]{0,2})('''|"""|'|")/;

/**
 * Colour one line. "open" carries an unterminated triple-quoted string from the previous line.
 * Returns { html, open }.
 */
export function highlightLine(text, open = null) {
  let i = 0;
  let html = '';
  let prevWord = '';
  if (open) {
    const end = text.indexOf(open);
    if (end < 0) return { html: wrap('str', text), open };
    html += wrap('str', text.slice(0, end + 3));
    i = end + 3;
    open = null;
  }
  while (i < text.length) {
    const rest = text.slice(i);
    const ch = rest[0];
    if (ch === '#') { html += wrap('com', rest); break; }
    const sm = STRING_START.exec(rest);
    if (sm && (sm[1] === '' || /[A-Za-z]$/.test(sm[1]))) {
      const q = sm[2];
      const start = sm[0].length;
      let j = start;
      let closed = false;
      if (q.length === 3) {
        const end = rest.indexOf(q, start);
        if (end >= 0) { j = end + 3; closed = true; } else { j = rest.length; open = q; }
      } else {
        while (j < rest.length) {
          if (rest[j] === '\\') { j += 2; continue; }
          if (rest[j] === q) { j += 1; closed = true; break; }
          j += 1;
        }
      }
      html += wrap('str', rest.slice(0, Math.min(j, rest.length)));
      i += Math.min(j, rest.length);
      prevWord = '';
      if (!closed && open) break;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(rest[1] || ''))) {
      const m = NUMBER.exec(rest);
      if (m && m[0]) { html += wrap('num', m[0]); i += m[0].length; prevWord = ''; continue; }
    }
    const id = IDENT.exec(rest);
    if (id) {
      const w = id[0];
      const after = rest.slice(w.length).match(/^\s*\(/);
      if (KEYWORDS.has(w)) html += wrap('kw', w);
      else if (BUILTINS.has(w) || after || prevWord === 'def' || prevWord === 'class') html += wrap('fn', w);
      else html += esc(w);
      prevWord = w;
      i += w.length;
      continue;
    }
    if (/\s/.test(ch)) { html += ch; i += 1; continue; }
    html += wrap('op', ch);
    prevWord = '';
    i += 1;
  }
  return { html, open };
}

/** Colour every .ln of a code block once (idempotent). */
export function highlightBlock(el) {
  if (el.dataset.highlighted) return;
  let open = null;
  el.querySelectorAll('.ln').forEach((ln) => {
    const res = highlightLine(ln.textContent, open);
    ln.innerHTML = res.html;
    open = res.open;
  });
  el.dataset.highlighted = 'python';
}
