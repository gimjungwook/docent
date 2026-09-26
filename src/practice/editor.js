// A small code editor for practice: a transparent <textarea> laid over a
// syntax-coloured <pre>, with line numbers. Tab inserts four spaces (Esc then Tab
// leaves the editor), Enter keeps the indentation, Cmd/Ctrl+Enter runs.

const KEYWORDS = new Set(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '),
);
const CONSTANTS = new Set(['True', 'False', 'None']);
const BUILTINS = new Set(
  'print input len int str float bool range type round abs sum min max list dict set tuple sorted enumerate zip isinstance'.split(' '),
);
const NAME_START = 'A-Za-z_\\u00C0-\\u024F\\u1100-\\u11FF\\u3130-\\u318F\\uAC00-\\uD7AF';
const TOKEN = new RegExp(
  [
    '(#[^\\n]*)', // comment
    "((?:[rRbBuUfF]{1,2})?(?:'''[\\s\\S]*?(?:'''|$)|\"\"\"[\\s\\S]*?(?:\"\"\"|$)|'(?:\\\\.|[^'\\\\\\n])*'?|\"(?:\\\\.|[^\"\\\\\\n])*\"?))", // string
    '(\\d[\\d_]*(?:\\.\\d*)?(?:[eE][+-]?\\d+)?[jJ]?|\\.\\d+)', // number
    `([${NAME_START}][${NAME_START}0-9]*)`, // name
  ].join('|'),
  'g',
);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escapeHtml = (text) => text.replace(/[&<>]/g, (ch) => ESCAPES[ch]);

/** Python source -> HTML with t-* classes (comments, strings, numbers, keywords, calls). */
export function highlight(code) {
  let html = '';
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(code); match; match = TOKEN.exec(code)) {
    if (match[0] === '') {
      TOKEN.lastIndex += 1;
      continue;
    }
    html += escapeHtml(code.slice(last, match.index));
    const [text, comment, string, number, name] = match;
    let cls = null;
    if (comment) cls = 't-com';
    else if (string) cls = 't-str';
    else if (number) cls = 't-num';
    else if (name) {
      if (CONSTANTS.has(name)) cls = 't-const';
      else if (KEYWORDS.has(name)) cls = 't-kw';
      else if (BUILTINS.has(name) || /^[ \t]*\(/.test(code.slice(TOKEN.lastIndex, TOKEN.lastIndex + 24))) cls = 't-fn';
    }
    html += cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text);
    last = TOKEN.lastIndex;
  }
  return html + escapeHtml(code.slice(last));
}

/** A read-only highlighted code block (used for the solution). */
export function codeBlock(code, { label } = {}) {
  const pre = document.createElement('pre');
  pre.className = 'pr-code';
  if (label) pre.setAttribute('aria-label', label);
  const inner = document.createElement('code');
  inner.innerHTML = highlight(String(code).replace(/\n$/, ''));
  pre.append(inner);
  return pre;
}

let editorCount = 0;

export function createEditor({ value = '', label = '코드 편집기', describedBy = '', onChange, onRun, onGrade } = {}) {
  const id = `pr-code-${++editorCount}`;
  const root = document.createElement('div');
  root.className = 'pr-editor';
  const gutter = document.createElement('div');
  gutter.className = 'pr-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  const scroller = document.createElement('div');
  scroller.className = 'pr-editor-scroll';
  const stack = document.createElement('div');
  stack.className = 'pr-editor-stack';
  const flag = document.createElement('div');
  flag.className = 'pr-editor-flag';
  flag.hidden = true;
  const pre = document.createElement('pre');
  pre.className = 'pr-editor-hl';
  pre.setAttribute('aria-hidden', 'true');
  const code = document.createElement('code');
  pre.append(code);
  const input = document.createElement('textarea');
  input.className = 'pr-editor-input';
  input.id = id;
  input.spellcheck = false;
  for (const [key, val] of Object.entries({
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    wrap: 'off',
    translate: 'no',
    'aria-label': label,
    'data-gramm': 'false',
  })) input.setAttribute(key, val);
  if (describedBy) input.setAttribute('aria-describedby', describedBy);
  stack.append(flag, pre, input);
  scroller.append(stack);
  root.append(gutter, scroller);

  let lineCount = 0;
  let errorLine = null;
  let tabLeaves = false;
  let measureCtx = null;

  function renderGutter(count) {
    if (count === lineCount) return;
    lineCount = count;
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= count; n += 1) {
      const span = document.createElement('span');
      span.textContent = String(n);
      frag.append(span);
    }
    gutter.replaceChildren(frag);
  }

  function applyMark() {
    const show = Boolean(errorLine) && errorLine <= lineCount;
    flag.hidden = !show;
    if (show) flag.style.setProperty('--pr-line', String(errorLine));
    gutter.querySelectorAll('.is-error').forEach((el) => el.classList.remove('is-error'));
    if (show) gutter.children[errorLine - 1]?.classList.add('is-error');
  }

  function render() {
    const text = input.value;
    code.innerHTML = highlight(text) + (text === '' || text.endsWith('\n') ? ' ' : '');
    renderGutter(text.split('\n').length);
    applyMark();
  }

  // Keep the caret visible when a long line scrolls sideways.
  function revealCaret() {
    if (document.activeElement !== input || scroller.scrollWidth <= scroller.clientWidth) return;
    const { selectionStart, value: text } = input;
    const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
    const before = text.slice(lineStart, selectionStart).replace(/\t/g, '    ');
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    const style = getComputedStyle(input);
    measureCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const x = parseFloat(style.paddingLeft) + measureCtx.measureText(before).width;
    const margin = 24;
    if (x < scroller.scrollLeft + margin) scroller.scrollLeft = Math.max(0, x - margin);
    else if (x > scroller.scrollLeft + scroller.clientWidth - margin) scroller.scrollLeft = x - scroller.clientWidth + margin;
  }

  function insertText(text) {
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function lineBounds(from, to) {
    const text = input.value;
    const start = text.lastIndexOf('\n', from - 1) + 1;
    let end = text.indexOf('\n', Math.max(to - (to > from && text[to - 1] === '\n' ? 1 : 0), from));
    if (end === -1) end = text.length;
    return [start, end];
  }

  function indent() {
    const { selectionStart: from, selectionEnd: to, value: text } = input;
    if (!text.slice(from, to).includes('\n')) {
      insertText('    ');
      return;
    }
    const [start, end] = lineBounds(from, to);
    const block = text.slice(start, end).replace(/^/gm, '    ');
    input.setSelectionRange(start, end);
    insertText(block);
    input.setSelectionRange(start, start + block.length);
  }

  function outdent() {
    const { selectionStart: from, selectionEnd: to, value: text } = input;
    const [start, end] = lineBounds(from, to);
    const original = text.slice(start, end);
    const block = original.replace(/^( {1,4}|\t)/gm, '');
    if (block === original) return;
    const single = !text.slice(from, to).includes('\n');
    input.setSelectionRange(start, end);
    insertText(block);
    if (single) {
      const removed = original.length - block.length;
      const caret = Math.max(start, from - removed);
      input.setSelectionRange(caret, caret);
    } else {
      input.setSelectionRange(start, start + block.length);
    }
  }

  function newline() {
    const { selectionStart: from, value: text } = input;
    const lineStart = text.lastIndexOf('\n', from - 1) + 1;
    const current = text.slice(lineStart, from);
    let pad = (current.match(/^[ \t]*/) || [''])[0];
    if (/:[ \t]*(#.*)?$/.test(current)) pad += '    ';
    insertText(`\n${pad}`);
  }

  input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return; // let Korean IME finish composing
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'Enter' && mod) {
      event.preventDefault();
      (event.shiftKey ? onGrade : onRun)?.();
      return;
    }
    if (event.key === 'Escape') {
      tabLeaves = true;
      return;
    }
    if (event.key === 'Tab') {
      if (tabLeaves || mod || event.altKey) {
        tabLeaves = false;
        return; // let focus move on
      }
      event.preventDefault();
      if (event.shiftKey) outdent();
      else indent();
      return;
    }
    tabLeaves = false;
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      newline();
    }
  });

  input.addEventListener('input', () => {
    errorLine = null;
    render();
    revealCaret();
    onChange?.(input.value);
  });
  input.addEventListener('keyup', revealCaret);
  input.addEventListener('click', revealCaret);
  input.addEventListener('blur', () => {
    tabLeaves = false;
  });
  // The textarea is sized to its content, so it should never scroll by itself.
  input.addEventListener('scroll', () => {
    input.scrollTop = 0;
    input.scrollLeft = 0;
  });
  // Clicking the gutter or the empty area puts the caret in the editor.
  root.addEventListener('mousedown', (event) => {
    if (event.target !== input) {
      event.preventDefault();
      input.focus();
    }
  });

  input.value = value;
  render();

  return {
    element: root,
    input,
    get value() {
      return input.value;
    },
    setValue(text) {
      input.value = String(text ?? '');
      errorLine = null;
      scroller.scrollLeft = 0;
      render();
    },
    focus() {
      input.focus();
    },
    /** Replace everything as one undoable edit (Cmd/Ctrl+Z brings the old code back). */
    replaceAll(text) {
      input.focus();
      input.select();
      insertText(String(text ?? ''));
      input.setSelectionRange(0, 0);
      scroller.scrollLeft = 0;
      errorLine = null;
      render();
    },
    markLine(line) {
      errorLine = Number.isInteger(line) && line > 0 ? line : null;
      applyMark();
    },
  };
}
