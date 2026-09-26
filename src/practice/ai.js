// AI helper for practice. Talks only to a local Ollama server (default
// http://127.0.0.1:11434): no API keys, no paid services. On pages that are not
// served from this computer (e.g. GitHub Pages) it does not probe at all, so the
// learner never sees a local-network permission prompt; the hint ladder is offered instead.

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
const DEFAULT_MODELS = ['exaone3.5:7.8b', 'llama3.1:latest'];

export function normalizeAiOptions(ai) {
  if (ai === false || ai === 'off' || ai === null) return { enabled: false };
  const opts = typeof ai === 'string' ? { endpoint: ai } : ai || {};
  return {
    enabled: opts.enabled !== false,
    endpoint: String(opts.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ''),
    models: Array.isArray(opts.models) && opts.models.length ? opts.models : DEFAULT_MODELS,
    probe: opts.probe || 'auto', // auto: only when the page itself is served from this computer
    probeTimeoutMs: opts.probeTimeoutMs ?? 2500,
    options: { temperature: 0.3, top_p: 0.9, num_predict: 320, ...(opts.options || {}) },
    maxSentences: opts.maxSentences ?? 6, // the prompt asks for 3-5 sentences; this is the hard stop
  };
}

function servedLocally() {
  const { protocol, hostname } = window.location;
  return (
    protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function pickModel(preferred, installed) {
  const names = new Set(installed);
  for (const want of preferred) {
    if (names.has(want)) return want;
    const alt = want.endsWith(':latest') ? want.slice(0, -':latest'.length) : `${want}:latest`;
    if (names.has(alt)) return alt;
    if (!want.includes(':')) {
      const family = installed.find((name) => name.startsWith(`${want}:`));
      if (family) return family;
    }
  }
  return null;
}

async function probe(opts) {
  if (!opts.enabled || opts.probe === 'never') return { available: false, reason: 'disabled' };
  if (opts.probe === 'auto' && !servedLocally()) return { available: false, reason: 'remote-page' };
  try {
    const response = await fetch(`${opts.endpoint}/api/tags`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.probeTimeoutMs),
    });
    if (!response.ok) return { available: false, reason: `http-${response.status}` };
    const body = await response.json();
    const installed = (body.models || []).map((m) => m.name || m.model).filter(Boolean);
    const model = pickModel(opts.models, installed);
    return model ? { available: true, model } : { available: false, reason: 'no-model' };
  } catch {
    return { available: false, reason: 'unreachable' };
  }
}

async function streamChat(opts, model, messages, { signal, onText }) {
  const response = await fetch(`${opts.endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, keep_alive: '15m', options: opts.options }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Ollama answered ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const handle = (line) => {
    if (!line.trim()) return false;
    const msg = JSON.parse(line);
    if (msg.error) throw new Error(msg.error);
    const delta = (msg.message && msg.message.content) || '';
    if (delta) {
      text += delta;
      onText?.(text);
    }
    return Boolean(msg.done);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (handle(line)) {
        reader.cancel().catch(() => {});
        return text;
      }
      newline = buffer.indexOf('\n');
    }
  }
  handle(buffer + decoder.decode());
  return text;
}

export function createAssistant(option) {
  const opts = normalizeAiOptions(option);
  let model = null;
  let warmed = false;
  return {
    get maxSentences() {
      return opts.maxSentences;
    },
    get model() {
      return model;
    },
    async probe() {
      const status = await probe(opts);
      model = status.model || null;
      return status;
    },
    /** Load the model into memory ahead of the first question (fire and forget). */
    warm() {
      if (warmed || !model) return;
      warmed = true;
      fetch(`${opts.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, keep_alive: '15m' }),
      })
        .then((response) => response.body?.cancel())
        .catch(() => {
          warmed = false;
        });
    },
    stream(messages, { signal, onText } = {}) {
      if (!model) return Promise.reject(new Error('no model'));
      return streamChat(opts, model, messages, { signal, onText });
    },
  };
}

function describeChecks(result) {
  if (!result) return '아직 채점하지 못했어요.';
  if (result.timedOut) return '코드가 너무 오래 실행돼서 멈췄고, 채점하지 못했어요.';
  const checks = result.checks || [];
  if (!checks.length) return '채점 결과가 없어요.';
  if (result.error) return '코드가 오류로 멈춰서 채점하지 못했어요.';
  return checks
    .map((check) =>
      check.passed ? `- 통과: ${check.label}` : `- 실패: ${check.label} (이유: ${check.fail || '조건이 맞지 않아요'})`,
    )
    .join('\n');
}

/** Build the chat messages for one question. The solution is included only after all 3 hints were seen. */
export function buildMessages({ lessonTitle, lessonSummary, exercise, code, result, hintsSeen, allowSolution }) {
  const passed = Boolean(result && result.passed && !result.error && !result.timedOut);
  const guidance = passed
    ? [
        '- 학습자는 모든 검사를 통과했어요. 고칠 점을 지어내지 말고, 코드에서 잘한 점을 한두 문장으로 구체적으로 칭찬해요.',
        '- 바로 이어서 어떤 값을 무엇으로 바꿔 다시 실행해 볼지, 작은 도전 하나를 구체적으로 제안해요. 레슨에서 배운 것만 써요.',
      ]
    : [
        '- 먼저 잘한 점을 하나 짚고, 지금 가장 먼저 고칠 점 하나만 쉬운 말로 알려 줘요.',
        '- 줄 번호는 쓰지 말고, 고칠 곳은 학습자 코드에 이미 있는 줄을 백틱(`)으로 그대로 인용해서 가리켜요.',
        allowSolution
          ? '- 학습자가 힌트를 모두 봤으니, 필요하면 고친 줄을 백틱(`) 안에 한 줄 보여 줘도 돼요.'
          : '- 정답 코드는 절대 쓰지 않아요. 고칠 방향만 알려 주고, 코드는 꼭 필요할 때만 백틱(`) 안에 이름이나 기호 하나 정도로 보여 줘요.',
      ];
  const example = passed
    ? '말투 예시(다른 문제에 대한 답): 가로와 세로를 변수에 담고 두 변수를 곱해 넓이를 구한 점이 정말 좋아요. 숫자를 직접 쓰지 않아서 값이 바뀌어도 코드가 알아서 다시 계산해요. 이번에는 가로를 12로 바꿔 실행해 보고, 결과가 어떻게 달라지는지 확인해 보세요.'
    : '말투 예시(다른 문제에 대한 답): 가로와 세로를 변수로 먼저 만들어 둔 점이 좋아요. 지금은 `area = 0` 줄이 0을 담고 있어서 화면에도 0이 나와요. 두 변수로 계산한 값을 담으면 검사를 통과할 수 있어요. 곱하기는 어떤 기호로 쓰는지 떠올려 보세요.';
  const rules = [
    '당신은 파이썬을 처음 배우는 사람 곁에서 돕는 다정한 실습 도우미예요.',
    `학습자는 방금 파이썬 '${lessonTitle}' 레슨을 마쳤어요. 레슨에서 배운 것: ${lessonSummary}`,
    '답할 때 지킬 것:',
    '- 한국어 해요체로, 따뜻하고 격려하는 말투로 써요.',
    '- 세 문장에서 다섯 문장 사이로, 한 문단으로 짧게 써요. 제목, 목록, 표, 이모지는 쓰지 않아요.',
    ...guidance,
    '- 레슨에서 배우지 않은 문법(if, for, 함수 만들기, f-string 같은 것)은 권하지 않아요.',
    '',
    example,
  ].join('\n');

  const error = result && result.error;
  const output = result && !result.timedOut ? (result.stdout || '').trimEnd() : '';
  const where = error && error.line && error.text ? ` (오류가 난 줄: ${error.text.trim()})` : '';
  const parts = [
    `문제: ${exercise.title}`,
    exercise.focus ? `연습할 것: ${exercise.focus}` : null,
    `문제 설명: ${exercise.prompt}`,
    '',
    '학습자 코드:',
    '```python',
    String(code).replace(/\n+$/, ''),
    '```',
    '',
    '실행 결과:',
    result && result.timedOut ? '너무 오래 실행돼서 멈췄어요.' : null,
    error ? `오류: ${error.summary}${where}` : null,
    output ? `출력:\n${output}` : '출력: (출력 없음)',
    '',
    '채점 결과:',
    passed ? '모든 검사를 통과했어요.' : null,
    describeChecks(result),
    '',
    `학습자가 본 힌트: ${hintsSeen}개 (모두 3개)`,
  ];
  if (allowSolution) parts.push('', '참고용 정답 코드:', String(exercise.solution).trimEnd());
  parts.push('', '위 내용을 보고 학습자에게 짧은 피드백을 해 주세요.');
  return [
    { role: 'system', content: rules },
    { role: 'user', content: parts.filter((part) => part !== null).join('\n') },
  ];
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = (line) => line.replace(/#.*$/, '').replace(/\s+/g, '');

/** Remove emoji the model may add despite the instructions. */
export function stripEmoji(text) {
  return text.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, '').replace(/[ \t]+\n/g, '\n');
}

/**
 * Keep at most `max` sentences (ending in . ! or ? followed by a space), ignoring
 * punctuation inside `code`. Returns { text, capped }.
 */
export function capSentences(text, max) {
  let count = 0;
  let inCode = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '`') inCode = !inCode;
    if (inCode || !'.!?'.includes(ch)) continue;
    const next = text[i + 1];
    if (next !== undefined && /\s/.test(next)) {
      count += 1;
      if (count >= max) return { text: text.slice(0, i + 1), capped: true };
    }
  }
  return { text, capped: false };
}

/**
 * While an answer is still streaming, hold back a code block or an inline code
 * span that has not closed yet, so a half-written answer line never flashes up.
 */
export function hideUnfinishedCode(text) {
  let inFence = false;
  let fenceStart = -1;
  let inInline = false;
  let inlineStart = -1;
  for (let i = 0; i < text.length; ) {
    if (text.startsWith('```', i) && !inInline) {
      if (!inFence) fenceStart = i;
      inFence = !inFence;
      i += 3;
      continue;
    }
    if (text[i] === '`' && !inFence) {
      if (!inInline) inlineStart = i;
      inInline = !inInline;
    }
    i += 1;
  }
  if (inFence) return text.slice(0, fenceStart);
  if (inInline) return text.slice(0, inlineStart);
  return text;
}

export const HIDDEN_BLOCK = '[[hidden-solution]]';

/**
 * Hide the answer until all hints are seen: a code block that contains an unwritten
 * solution line is replaced by HIDDEN_BLOCK, then any remaining solution line is
 * replaced by "…". Returns { text, redacted }.
 */
export function guardAnswer(text, context) {
  let redacted = false;
  const withoutBlocks = text.replace(/```[\w-]*\n?([\s\S]*?)(?:```|$)/g, (block, inner) => {
    if (!redactSolution(inner, context).redacted) return block;
    redacted = true;
    return `\n\n${HIDDEN_BLOCK}\n\n`;
  });
  const inline = redactSolution(withoutBlocks, context);
  return { text: inline.text, redacted: redacted || inline.redacted };
}

/**
 * Before all hints are seen, hide any solution line the learner has not written
 * yet (whitespace-insensitive), in case the model ignores its instructions.
 */
export function redactSolution(text, { solution, starter, code }) {
  const known = new Set(
    [...String(starter).split('\n'), ...String(code).split('\n')].map(squash).filter(Boolean),
  );
  const secrets = String(solution)
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => squash(line).length >= 5 && !known.has(squash(line)));
  let redacted = false;
  let out = text;
  for (const line of secrets) {
    const pattern = new RegExp([...line.replace(/\s+/g, '')].map(escapeRegExp).join('\\s*'), 'g');
    out = out.replace(pattern, () => {
      redacted = true;
      return '…';
    });
  }
  return { text: out, redacted };
}
