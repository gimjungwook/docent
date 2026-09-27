// Docent practice section: "직접 해 보기" at the end of a lesson (SPEC section 9).
//
//   import { mountPractice } from '../src/practice/practice.js';
//   mountPractice(document.querySelector('section.practice'), {
//     lessonId: 'variables',
//     dataUrl: '../content/practice/variables.json', // optional; defaults to this path
//     ai: undefined,     // default: local Ollama at 127.0.0.1:11434 when the page is served locally
//                        // false turns the helper off; { endpoint, models, probe } overrides
//     timeoutMs: 5000,   // optional: stop learner code after this long
//   });
//
// The learner picks a theme (remembered in localStorage) and gets that theme's
// exercises. Code runs in the browser with Pyodide in a Web Worker, loaded only on
// the first run. Grading uses src/practice/harness.py, the same grader that
// scripts/check_practice.py runs with real Python.

import { createEditor, codeBlock } from './editor.js';
import { getRunner } from './runner.js';
import { explainError, explainTimeout } from './errors.js';
import {
  createAssistant,
  buildMessages,
  guardAnswer,
  hideUnfinishedCode,
  stripEmoji,
  capSentences,
  HIDDEN_BLOCK,
} from './ai.js';

const STORE_PREFIX = 'docent.practice.';
const DEFAULT_TIMEOUT_MS = 5000;
const HINT_PARTICLE = { 1: '을', 2: '를', 3: '을' };
const HIDDEN_NOTE = '정답 코드는 힌트를 모두 본 뒤에 보여 드려요.';
let sectionCount = 0;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'hidden') el.hidden = Boolean(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Text with `code` spans turned into <code>, built without innerHTML. */
function rich(text) {
  const frag = document.createDocumentFragment();
  String(text ?? '')
    .split('`')
    .forEach((part, i) => {
      if (part) frag.append(i % 2 ? h('code', { class: 'pr-ic' }, part) : part);
    });
  return frag;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Exercise code as shown in the editor: without the file's trailing newline. */
const editorText = (code) => String(code ?? '').replace(/\n+$/, '');

function reveal(el, block = 'nearest') {
  if (!el || el.hidden) return;
  el.scrollIntoView({ block, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function isMac() {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

function openStore(lessonId) {
  const key = STORE_PREFIX + lessonId;
  const empty = () => ({ theme: null, current: {}, code: {}, solved: {}, hints: {} });
  const state = empty();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.theme === 'string') state.theme = saved.theme;
      for (const field of ['current', 'code', 'solved', 'hints']) {
        if (saved[field] && typeof saved[field] === 'object' && !Array.isArray(saved[field])) state[field] = saved[field];
      }
    }
  } catch {
    // storage can be unavailable (private mode); practice still works without it
  }
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota or privacy errors
    }
  };
  return {
    state,
    save,
    saveSoon() {
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    },
    clear() {
      clearTimeout(timer);
      Object.assign(state, empty());
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

/** Split model output into paragraphs and fenced code blocks (no HTML from the model is used). */
function answerNodes(text) {
  const nodes = [];
  const parts = String(text).split(/```[\w-]*\n?/);
  parts.forEach((part, i) => {
    if (i % 2) {
      const codeText = part.replace(/\n+$/, '');
      if (codeText.trim()) nodes.push(codeBlock(codeText));
      return;
    }
    const clean = part
      .replace(/\*\*|__/g, '')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, '');
    for (const para of clean.split(/\n{2,}/)) {
      const line = para.replace(/\s*\n\s*/g, ' ').trim();
      if (line === HIDDEN_BLOCK) nodes.push(h('p', { class: 'pr-ai-wait' }, HIDDEN_NOTE));
      else if (line) nodes.push(h('p', {}, rich(line)));
    }
  });
  return nodes;
}

export async function mountPractice(sectionEl, options = {}) {
  if (!(sectionEl instanceof Element)) throw new TypeError('mountPractice needs the practice <section> element');
  const lessonId = options.lessonId || sectionEl.dataset.practice || 'lesson';
  const dataUrl = options.dataUrl || new URL(`../../content/practice/${lessonId}.json`, import.meta.url).href;
  const uid = `pr${++sectionCount}`;
  sectionEl.classList.add('practice');
  sectionEl.setAttribute('aria-labelledby', `${uid}-title`);
  const heading = () => h('h2', { class: 'pr-title', id: `${uid}-title` }, '직접 해 보기');
  sectionEl.replaceChildren(h('div', { class: 'pr-head' }, heading(), h('p', { class: 'pr-lead' }, '문제를 불러오고 있어요…')));

  let data;
  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    if (!Array.isArray(data.themes) || !data.themes.length) throw new Error('no themes in practice data');
  } catch (error) {
    sectionEl.replaceChildren(
      h('div', { class: 'pr-head' }, heading(), h('p', { class: 'pr-lead' }, '문제를 불러오지 못했어요. 페이지를 새로 고쳐 보세요.')),
    );
    console.warn('[docent practice] could not load', dataUrl, error);
    return { element: sectionEl, ok: false, setTheme() {}, resetProgress() {}, destroy() {} };
  }

  const practice = new Practice(sectionEl, data, {
    ...options,
    lessonId,
    uid,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
  });
  return practice.controller();
}

class Practice {
  constructor(section, data, options) {
    this.section = section;
    this.data = data;
    this.options = options;
    this.uid = options.uid;
    this.timeoutMs = options.timeoutMs;
    this.store = openStore(options.lessonId);
    this.runner = getRunner({ timeoutMs: options.timeoutMs });
    this.assistant = createAssistant(options.ai);
    this.aiMode = 'checking';
    this.aiAbort = null;
    this.busy = false;
    this.destroyed = false;
    this.last = { run: null, grade: null };
    this.build();
    const find = (id) => data.themes.find((theme) => theme.id === id);
    const theme = find(this.store.state.theme) || find(data.defaultTheme) || data.themes[0];
    this.showTheme(theme.id);
    this.aiReady = this.initAssistant();
  }

  build() {
    const u = this.uid;
    const mac = isMac();
    const title = h('h2', { class: 'pr-title', id: `${u}-title` }, '직접 해 보기');
    const lead = h(
      'p',
      { class: 'pr-lead' },
      '마음에 드는 주제를 고르면 그 주제로 문제가 나와요. 코드를 고쳐 실행해 보고, 채점으로 확인해 보세요.',
    );

    this.chips = this.data.themes.map((theme) =>
      h(
        'button',
        { type: 'button', class: 'pr-chip', 'data-theme': theme.id, 'aria-pressed': 'false', onclick: () => this.pickTheme(theme.id) },
        theme.label,
        h('span', { class: 'pr-done', hidden: true }, h('span', { class: 'pr-sr' }, ' 모두 통과')),
      ),
    );
    const themes = h('div', { class: 'pr-themes', role: 'group', 'aria-label': '관심 주제' }, this.chips);

    this.steps = h('div', { class: 'pr-steps', role: 'group', 'aria-label': '문제 단계' });
    this.exTitle = h('h3', { class: 'pr-ex-title', id: `${u}-ex`, tabindex: '-1' });
    this.prompt = h('p', { class: 'pr-prompt' });

    const helpId = `${u}-editor-help`;
    this.editor = createEditor({
      label: '코드 편집기',
      describedBy: helpId,
      onChange: (value) => this.onCodeChange(value),
      onRun: () => this.execute('run'),
      onGrade: () => this.execute('grade'),
    });
    const help = h(
      'p',
      { class: 'pr-sr', id: helpId },
      `Tab 키는 빈칸 네 개를 넣어요. 편집기에서 나가려면 Esc를 누른 뒤 Tab을 누르세요. ${mac ? 'Command' : 'Ctrl'}와 Enter를 함께 누르면 실행하고, Shift까지 함께 누르면 채점해요.`,
    );

    this.runBtn = h('button', { type: 'button', class: 'pr-btn pr-btn--primary', onclick: () => this.execute('run') }, '실행');
    this.gradeBtn = h('button', { type: 'button', class: 'pr-btn', onclick: () => this.execute('grade') }, '채점');
    this.hintBtn = h('button', { type: 'button', class: 'pr-btn', onclick: () => this.revealHint() }, '힌트');
    const kbd = h('span', { class: 'pr-kbd', 'aria-hidden': 'true' }, mac ? '⌘ Enter로 실행' : 'Ctrl + Enter로 실행');
    const resetBtn = h('button', { type: 'button', class: 'pr-btn pr-btn--quiet', onclick: () => this.resetCode() }, '처음 코드로');
    const actions = h('div', { class: 'pr-actions' }, this.runBtn, this.gradeBtn, this.hintBtn, kbd, resetBtn);

    this.consoleState = h('span', { class: 'pr-console-state' });
    this.progress = h('span', { class: 'pr-progress', hidden: true, 'aria-hidden': 'true' });
    this.console = h('pre', { class: 'pr-console', role: 'region', tabindex: '0', 'aria-labelledby': `${u}-out` });
    this.output = h(
      'div',
      { class: 'pr-output' },
      h('div', { class: 'pr-console-head' }, h('span', { id: `${u}-out` }, '출력'), this.consoleState),
      this.progress,
      this.console,
    );

    this.errorTitle = h('p', { class: 'pr-error-title' });
    this.errorBody = h('p', { class: 'pr-error-body' });
    this.errorCode = h('pre', { class: 'pr-error-code' });
    this.errorBox = h('div', { class: 'pr-error', hidden: true }, this.errorTitle, this.errorBody, this.errorCode);

    this.checksSummary = h('p', { class: 'pr-checks-summary' });
    this.checksList = h('ul', { class: 'pr-check-list' });
    this.checksBox = h(
      'section',
      { class: 'pr-checks', hidden: true, 'aria-labelledby': `${u}-checks` },
      h('h4', { class: 'pr-sub', id: `${u}-checks` }, '채점 결과'),
      this.checksSummary,
      this.checksList,
    );

    this.hintList = h('ol', { class: 'pr-hint-list' });
    this.solutionBox = h('div', { class: 'pr-solution', hidden: true });
    this.hintsBox = h(
      'section',
      { class: 'pr-hints', hidden: true, 'aria-labelledby': `${u}-hints` },
      h('h4', { class: 'pr-sub', id: `${u}-hints` }, '힌트'),
      this.hintList,
      this.solutionBox,
    );

    this.aiBtn = h('button', { type: 'button', class: 'pr-btn', hidden: true, onclick: () => this.askAi() }, 'AI 도우미에게 물어보기');
    const warm = () => this.assistant.warm();
    this.aiBtn.addEventListener('pointerenter', warm);
    this.aiBtn.addEventListener('focus', warm);
    this.aiHintBtn = h('button', { type: 'button', class: 'pr-btn', hidden: true, onclick: () => this.revealHint() }, '힌트 열기');
    this.aiNote = h('p', { class: 'pr-ai-note' });
    this.aiAnswer = h('div', { class: 'pr-ai-answer', hidden: true, 'aria-live': 'polite', 'aria-busy': 'false' });
    this.aiBy = h('p', { class: 'pr-ai-by', hidden: true });
    this.aiBox = h(
      'section',
      { class: 'pr-ai', 'aria-labelledby': `${u}-ai` },
      h('h4', { class: 'pr-sub', id: `${u}-ai` }, 'AI 도우미'),
      h('div', { class: 'pr-ai-row' }, this.aiBtn, this.aiHintBtn, this.aiNote),
      this.aiAnswer,
      this.aiBy,
    );

    this.nextBtn = h('button', { type: 'button', class: 'pr-btn pr-next', onclick: () => this.goNext() });
    this.card = h(
      'article',
      { class: 'pr-card', 'aria-labelledby': `${u}-ex` },
      this.steps,
      this.exTitle,
      this.prompt,
      this.editor.element,
      help,
      actions,
      this.output,
      this.errorBox,
      this.checksBox,
      this.hintsBox,
      this.aiBox,
      h('div', { class: 'pr-foot' }, this.nextBtn),
    );
    this.live = h('p', { class: 'pr-sr', 'aria-live': 'polite' });
    this.section.replaceChildren(h('div', { class: 'pr-head' }, title, lead), themes, this.card, this.live);
  }

  controller() {
    const self = this;
    return {
      element: this.section,
      ok: true,
      get theme() {
        return self.theme.id;
      },
      get exercise() {
        return self.exercise.id;
      },
      /** { mode: 'checking' | 'live' | 'offline', model } */
      get ai() {
        return { mode: self.aiMode, model: self.assistant.model };
      },
      aiReady: this.aiReady,
      setTheme(id) {
        self.pickTheme(id);
      },
      resetProgress() {
        self.store.clear();
        const first = self.data.themes.find((theme) => theme.id === self.data.defaultTheme) || self.data.themes[0];
        self.showTheme(first.id);
      },
      destroy() {
        self.destroyed = true;
        self.stopAi();
        self.section.replaceChildren();
      },
    };
  }

  announce(message) {
    this.live.textContent = '';
    setTimeout(() => {
      this.live.textContent = message;
    }, 60);
  }

  // ---- themes and exercises -------------------------------------------------

  pickTheme(id) {
    if (this.theme && this.theme.id === id) return;
    this.showTheme(id);
    this.announce(`${this.theme.label} 주제 문제로 바꿨어요.`);
  }

  showTheme(id) {
    const theme = this.data.themes.find((item) => item.id === id) || this.data.themes[0];
    this.theme = theme;
    this.store.state.theme = theme.id;
    for (const chip of this.chips) chip.setAttribute('aria-pressed', String(chip.dataset.theme === theme.id));
    const saved = this.store.state.current[theme.id];
    const index = Number.isInteger(saved) && saved >= 0 && saved < theme.exercises.length ? saved : 0;
    this.showExercise(index);
  }

  showExercise(index) {
    this.stopAi();
    const exercise = this.theme.exercises[index];
    this.index = index;
    this.exercise = exercise;
    this.store.state.current[this.theme.id] = index;
    this.store.save();
    this.exTitle.textContent = exercise.title;
    this.prompt.replaceChildren(rich(exercise.prompt));
    this.editor.setValue(this.store.state.code[exercise.id] ?? editorText(exercise.starter));
    this.last = { run: null, grade: null };
    this.clearOutput();
    this.renderHints();
    this.clearAiAnswer();
    this.renderProgress();
  }

  renderProgress() {
    const solved = this.store.state.solved;
    this.steps.replaceChildren(
      ...this.theme.exercises.map((exercise, i) =>
        h(
          'button',
          {
            type: 'button',
            class: 'pr-step',
            title: exercise.title,
            'aria-current': i === this.index ? 'step' : null,
            onclick: () => {
              if (i !== this.index) this.showExercise(i);
            },
          },
          `${exercise.level}단계`,
          solved[exercise.id] ? h('span', { class: 'pr-done' }, h('span', { class: 'pr-sr' }, ' 통과')) : null,
        ),
      ),
    );
    for (const chip of this.chips) {
      const theme = this.data.themes.find((item) => item.id === chip.dataset.theme);
      chip.querySelector('.pr-done').hidden = !theme.exercises.every((exercise) => solved[exercise.id]);
    }
    const last = this.index >= this.theme.exercises.length - 1;
    const nextTheme = this.nextTheme();
    this.nextBtn.hidden = last && !nextTheme;
    this.nextBtn.textContent = last && nextTheme ? `다음 주제: ${nextTheme.label} →` : '다음 문제 →';
    this.nextBtn.classList.toggle('pr-btn--primary', Boolean(solved[this.exercise.id]));
  }

  nextTheme() {
    const themes = this.data.themes;
    if (themes.length < 2) return null;
    return themes[(themes.indexOf(this.theme) + 1) % themes.length];
  }

  goNext() {
    if (this.index < this.theme.exercises.length - 1) this.showExercise(this.index + 1);
    else if (this.nextTheme()) this.showTheme(this.nextTheme().id);
    reveal(this.card, 'start');
    this.exTitle.focus({ preventScroll: true });
  }

  onCodeChange(value) {
    const exercise = this.exercise;
    if (editorText(value) === editorText(exercise.starter)) delete this.store.state.code[exercise.id];
    else this.store.state.code[exercise.id] = value;
    this.store.saveSoon();
  }

  resetCode() {
    const exercise = this.exercise;
    this.editor.replaceAll(editorText(exercise.starter));
    delete this.store.state.code[exercise.id];
    this.store.save();
    this.clearOutput();
    this.announce('처음 코드로 되돌렸어요.');
  }

  // ---- running and grading --------------------------------------------------

  setBusy(on) {
    this.busy = on;
    for (const button of [this.runBtn, this.gradeBtn]) button.setAttribute('aria-disabled', String(on));
    this.output.setAttribute('aria-busy', String(on));
  }

  clearOutput() {
    this.console.replaceChildren(h('span', { class: 'is-dim' }, '실행을 누르면 결과가 여기에 나와요.'));
    this.consoleState.textContent = '';
    this.progress.hidden = true;
    this.errorBox.hidden = true;
    this.checksBox.hidden = true;
    this.editor.markLine(null);
  }

  async execute(mode) {
    if (this.busy) return null;
    const exercise = this.exercise;
    const code = this.editor.value;
    this.setBusy(true);
    const loading = this.runner.state !== 'ready';
    this.progress.hidden = !loading;
    this.consoleState.textContent = loading ? '준비 중' : '실행 중';
    this.console.replaceChildren(
      h('span', { class: 'is-dim' }, loading ? '파이썬을 준비하고 있어요. 처음 한 번만 몇 초 걸려요…' : '실행하고 있어요…'),
    );
    this.errorBox.hidden = true;
    if (loading) this.announce('파이썬을 준비하고 있어요.');

    let result;
    try {
      result = await this.runner.run(code, mode === 'grade' ? exercise.checks : null, { timeoutMs: this.timeoutMs });
    } catch {
      this.setBusy(false);
      if (!this.destroyed && this.exercise === exercise) this.showLoadFailure();
      return null;
    }
    this.setBusy(false);
    if (this.destroyed || this.exercise !== exercise) return null;
    if (result.cancelled) {
      this.clearOutput();
      return null;
    }
    const summary = this.renderResult(result, mode);
    const record = { code, result };
    this.last.run = record;
    if (mode === 'grade') this.last.grade = record;
    this.announce(summary);
    return result;
  }

  showLoadFailure() {
    this.progress.hidden = true;
    this.consoleState.textContent = '';
    this.console.replaceChildren(
      h('span', { class: 'is-err' }, '파이썬을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 실행해 보세요.'),
    );
    this.announce('파이썬을 불러오지 못했어요.');
  }

  renderResult(result, mode) {
    this.progress.hidden = true;
    let summary;
    if (result.timedOut) {
      this.consoleState.textContent = '멈춤';
      this.console.replaceChildren(h('span', { class: 'is-dim' }, '실행을 멈췄어요.'));
      this.showExplanation(explainTimeout(result.timeoutMs));
      this.editor.markLine(null);
      summary = '코드가 끝나지 않아 실행을 멈췄어요.';
    } else {
      const nodes = [];
      const out = result.stdout || '';
      if (out) nodes.push(out.endsWith('\n') ? out : `${out}\n`);
      if (result.truncated) nodes.push(h('span', { class: 'is-dim' }, '(출력이 길어서 앞부분만 보여 줘요)\n'));
      if (result.stderr) nodes.push(h('span', { class: 'is-err' }, result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`));
      if (result.error) nodes.push(h('span', { class: 'is-err' }, result.error.summary));
      if (!nodes.length) nodes.push(h('span', { class: 'is-dim' }, '출력된 내용이 없어요. print()로 값을 화면에 보여 줄 수 있어요.'));
      this.console.replaceChildren(...nodes);
      this.console.scrollTop = 0;
      this.consoleState.textContent = result.error ? '오류' : '완료';
      const info = explainError(result.error);
      if (info) this.showExplanation(info);
      else this.errorBox.hidden = true;
      this.editor.markLine(result.error ? result.error.line : null);
      summary = info ? `${info.title}. ${info.body.replaceAll('`', '')}` : '실행이 끝났어요.';
    }
    if (mode === 'grade') {
      summary = this.renderChecks(result);
      reveal(this.checksBox);
    } else {
      reveal(result.timedOut || result.error ? this.errorBox : this.output);
    }
    return summary;
  }

  // The original Python error line stays in the output console right above this box.
  showExplanation(info) {
    this.errorTitle.textContent = info.title;
    this.errorBody.replaceChildren(rich(info.body));
    if (info.line && info.code !== null) {
      this.errorCode.hidden = false;
      this.errorCode.replaceChildren(h('span', { class: 'pr-ln', 'aria-hidden': 'true' }, String(info.line)), info.code || ' ');
    } else {
      this.errorCode.hidden = true;
    }
    this.errorBox.hidden = false;
  }

  renderChecks(result) {
    const exercise = this.exercise;
    const skipped = Boolean(result.timedOut || result.error);
    const items = result.checks || exercise.checks.map((check) => ({ label: check.label, type: check.type, passed: false }));
    const passed = items.filter((item) => item.passed).length;
    const all = !skipped && items.length > 0 && passed === items.length;
    this.checksList.replaceChildren(...items.map((item, i) => this.checkItem(item, exercise.checks[i], skipped)));
    let summary;
    if (result.timedOut) summary = '코드가 끝나지 않아 채점하지 못했어요.';
    else if (result.error) summary = '코드가 오류로 멈춰서 채점하지 못했어요. 위의 설명을 보고 오류부터 고쳐 보세요.';
    else if (all) summary = '모든 검사를 통과했어요. 다음 문제로 넘어가 볼까요?';
    else summary = `${items.length}개 가운데 ${passed}개를 통과했어요.`;
    this.checksSummary.textContent = summary;
    this.checksSummary.classList.toggle('is-pass', all);
    this.checksBox.hidden = false;
    if (all) this.markSolved();
    return summary;
  }

  checkItem(item, check = {}, skipped) {
    const state = skipped ? 'skip' : item.passed ? 'pass' : 'fail';
    const said = { pass: '통과', fail: '실패', skip: '채점하지 못함' }[state];
    const body = [h('span', { class: 'pr-sr' }, `${said}: `), h('p', { class: 'pr-check-label' }, rich(item.label || check.label))];
    if (state === 'fail') {
      const missing = item.missing ? `아직 없는 이름이에요: ``${item.missing}``. ` : '';
      body.push(h('p', { class: 'pr-check-reason' }, rich(missing + (item.fail || check.fail || ''))));
      if (item.type === 'stdout') {
        body.push(
          h(
            'dl',
            { class: 'pr-check-detail' },
            h('dt', {}, '기대한 출력'),
            h('dd', {}, item.expected || '(없음)'),
            h('dt', {}, '지금 출력'),
            h('dd', {}, item.actual || '(출력 없음)'),
          ),
        );
      }
    }
    return h('li', { class: `pr-check is-${state}` }, h('span', { class: 'pr-check-icon', 'aria-hidden': 'true' }), h('div', { class: 'pr-check-body' }, body));
  }

  markSolved() {
    const exercise = this.exercise;
    if (!this.store.state.solved[exercise.id]) {
      this.store.state.solved[exercise.id] = true;
      this.store.save();
    }
    this.renderProgress();
  }

  // ---- hints ----------------------------------------------------------------

  hintCount() {
    const n = this.store.state.hints[this.exercise.id];
    return Number.isInteger(n) ? Math.min(Math.max(n, 0), 4) : 0; // 4 = solution shown
  }

  revealHint() {
    const n = this.hintCount();
    if (n >= 4) return;
    this.store.state.hints[this.exercise.id] = n + 1;
    this.store.save();
    this.renderHints();
    if (n + 1 <= 3) {
      reveal(this.hintList.lastElementChild);
      this.announce(`힌트 ${n + 1}${HINT_PARTICLE[n + 1]} 열었어요.`);
    } else {
      reveal(this.solutionBox);
      this.announce('정답 코드를 열었어요.');
    }
  }

  renderHints() {
    const exercise = this.exercise;
    const n = this.hintCount();
    this.hintList.replaceChildren(
      ...exercise.hints.slice(0, Math.min(n, 3)).map((hint, i) =>
        h('li', { class: 'pr-hint' }, h('span', { class: 'pr-hint-label' }, `힌트 ${i + 1}`), h('p', { class: 'pr-hint-text' }, rich(hint))),
      ),
    );
    if (n >= 4) {
      this.solutionBox.replaceChildren(h('p', { class: 'pr-hint-label' }, '정답'), codeBlock(exercise.solution, { label: '정답 코드' }));
      this.solutionBox.hidden = false;
    } else {
      this.solutionBox.replaceChildren();
      this.solutionBox.hidden = true;
    }
    this.hintsBox.hidden = n === 0;
    const label = n === 0 ? '힌트' : n < 3 ? '다음 힌트' : n === 3 ? '정답 보기' : '정답을 열었어요';
    this.hintBtn.textContent = label;
    this.hintBtn.setAttribute('aria-disabled', String(n >= 4));
    this.aiHintBtn.textContent = n === 0 ? '힌트 열기' : label;
    this.aiHintBtn.hidden = this.aiMode !== 'offline' || n >= 4;
  }

  // ---- AI helper ------------------------------------------------------------

  async initAssistant() {
    this.setAiMode('checking');
    const status = await this.assistant.probe();
    if (this.destroyed) return;
    this.setAiMode(status.available ? 'live' : 'offline');
  }

  setAiMode(mode) {
    this.aiMode = mode;
    this.aiBox.dataset.mode = mode;
    this.aiBtn.hidden = mode !== 'live';
    this.aiBtn.textContent = 'AI 도우미에게 물어보기';
    if (mode === 'checking') this.aiNote.textContent = 'AI 도우미를 찾고 있어요…';
    else if (mode === 'live') this.aiNote.textContent = '지금 코드와 채점 결과를 보고 짧게 조언해 줘요.';
    else this.aiNote.textContent = 'AI 도우미는 AI 모델이 설치된 컴퓨터에서 이 페이지를 열면 함께해요. 지금은 힌트를 하나씩 열어 보세요.';
    this.renderHints();
  }

  clearAiAnswer() {
    this.aiAnswer.hidden = true;
    this.aiAnswer.replaceChildren();
    this.aiBy.hidden = true;
  }

  stopAi() {
    if (this.aiAbort) this.aiAbort.abort();
  }

  finishAi(controller) {
    if (this.aiAbort === controller) this.aiAbort = null;
    this.aiAnswer.setAttribute('aria-busy', 'false');
    if (this.aiMode === 'live') this.aiBtn.textContent = 'AI 도우미에게 물어보기';
  }

  aiWait(message) {
    this.aiAnswer.replaceChildren(h('p', { class: 'pr-ai-wait' }, message));
  }

  async askAi() {
    if (this.aiMode !== 'live') return;
    if (this.aiAbort) {
      this.aiAbort.abort();
      return;
    }
    if (this.busy) return;
    const exercise = this.exercise;
    const controller = new AbortController();
    this.aiAbort = controller;
    this.aiBtn.textContent = '멈추기';
    this.aiBy.hidden = true;
    this.aiAnswer.hidden = false;
    this.aiAnswer.setAttribute('aria-busy', 'true');
    this.aiWait('지금 코드를 먼저 채점해 볼게요…');
    this.assistant.warm();

    let code = this.editor.value;
    let result = this.last.grade && this.last.grade.code === code ? this.last.grade.result : null;
    if (!result) result = await this.execute('grade');
    if (controller.signal.aborted || this.destroyed || this.exercise !== exercise) {
      if (controller.signal.aborted && this.exercise === exercise) this.aiWait('질문을 멈췄어요.');
      this.finishAi(controller);
      return;
    }
    if (this.last.grade) code = this.last.grade.code;
    const hintsSeen = Math.min(this.hintCount(), 3);
    const allowSolution = hintsSeen >= 3;
    const messages = buildMessages({
      lessonTitle: this.data.lessonTitle || this.data.title || '',
      lessonSummary: this.data.lessonSummary || '',
      exercise,
      code,
      result,
      hintsSeen,
      allowSolution,
    });
    this.aiWait('AI 도우미가 코드를 읽고 있어요…');
    reveal(this.aiBox);
    let latest = '';
    let capped = false;
    const guard = { solution: exercise.solution, starter: exercise.starter, code };
    // Returns true once the answer is long enough (then the stream is stopped).
    const render = (raw, final) => {
      const short = capSentences(stripEmoji(raw), this.assistant.maxSentences);
      let text = short.text;
      if (!allowSolution && !final && !short.capped) text = hideUnfinishedCode(text);
      const safe = allowSolution ? { text, redacted: false } : guardAnswer(text, guard);
      const nodes = answerNodes(safe.text);
      if (safe.redacted && !safe.text.includes(HIDDEN_BLOCK)) nodes.push(h('p', { class: 'pr-ai-wait' }, HIDDEN_NOTE));
      if (nodes.length) this.aiAnswer.replaceChildren(...nodes);
      return short.capped;
    };
    try {
      const text = await this.assistant.stream(messages, {
        signal: controller.signal,
        onText: (full) => {
          if (capped) return;
          latest = full;
          if (render(full, false)) {
            capped = true; // long enough: stop the model here
            controller.abort();
          }
        },
      });
      if (text.trim()) render(text, true);
      else this.aiWait('AI 도우미가 이번에는 답을 만들지 못했어요. 한 번 더 물어보세요.');
      this.answered();
    } catch {
      if (capped) {
        this.answered();
      } else if (controller.signal.aborted) {
        if (this.exercise === exercise) {
          if (latest.trim()) {
            render(latest, true);
            this.aiAnswer.append(h('p', { class: 'pr-ai-wait' }, '여기서 멈췄어요.'));
          }
          else this.aiWait('질문을 멈췄어요.');
        }
      } else {
        const status = await this.assistant.probe();
        if (!status.available) {
          this.clearAiAnswer();
          this.setAiMode('offline');
        } else {
          this.aiWait('AI 도우미가 답하지 못했어요. 잠시 뒤에 다시 물어보세요.');
        }
      }
    } finally {
      this.finishAi(controller);
    }
  }

  answered() {
    this.aiBy.textContent = `이 컴퓨터의 ${this.assistant.model} 모델이 답했어요.`;
    this.aiBy.hidden = false;
    this.announce('AI 도우미가 답했어요.');
  }
}
