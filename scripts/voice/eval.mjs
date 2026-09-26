#!/usr/bin/env node
// Voice evaluation for docs/voice-eval.md and lab/voices.html.
//   node scripts/voice/eval.mjs [--input content/samples/voice-sample.json]
//        [--candidates say:Yuna,supertonic:F1,qwen3:Sohee,fish-openrouter] [--whisper-python <python with mlx_whisper>]
// For each candidate (provider:voice): synthesizes every fixture sentence (cached), measures the real-time
// factor, re-transcribes each sentence with mlx-whisper large-v3-turbo, computes the character error rate
// against "say" (spaces and punctuation ignored), aligns the words, and writes a lab clip with word timings.
// Results: audio/lab/eval.json (+ audio/lab/<candidate>.m4a; local-only voices go to .cache/voice/lab/).
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SR, encodeM4a, normalizeLoudness, writeWav16k } from './lib/audio.mjs';
import { alignClips, loadClips, prepareSegments, spokenChars, synthesize, wordTimes } from './lib/pipeline.mjs';
import { ProviderUnavailable, getProvider } from './lib/providers.mjs';
import { CACHE, ROOT, hash, hashBytes, parseArgs, rel, run, writeAtomic } from './lib/util.mjs';

const SUPERTONIC_VOICES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'].map((v) => 'supertonic:' + v);
// Supertonic runs at the pipeline's speed (0.9); F1@1.05 shows the package's default pace for comparison.
const DEFAULT_CANDIDATES = ['say:Yuna', ...SUPERTONIC_VOICES, 'supertonic:F1@1.05', 'qwen3:Sohee', 'fish-openrouter'];
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const log = (...a) => console.error('[eval]', ...a);

// ---- text normalisation for CER -------------------------------------------------------------
const letters = (s) => [...s.normalize('NFC')].filter((ch) => /[\p{L}\p{N}]/u.test(ch));
const DIG = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
function group4(n) {
  let s = '';
  for (const [u, name] of [[1000, '천'], [100, '백'], [10, '십'], [1, '']]) {
    const d = Math.floor(n / u) % 10;
    if (d) s += (d === 1 && name ? '' : DIG[d]) + name;
  }
  return s;
}
/** Sino-Korean reading of an integer (4500 -> 사천오백, 13500 -> 만삼천오백). */
export function sinoKorean(n) {
  if (n === 0) return '영';
  let out = '';
  let rest = n;
  for (const [u, name] of [[1e8, '억'], [1e4, '만'], [1, '']]) {
    const g = Math.floor(rest / u);
    rest %= u;
    if (g) out += (g === 1 && name === '만' ? '' : group4(g)) + name;
  }
  return out;
}
// Native Korean numbers before counters (세 잔, 두 개): Whisper writes them as digits ("3잔").
const NATIVE = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const COUNTERS = '잔|개|명|마리|살|권|장|대|병|그릇|줄|시간|군데|가지';
// Code words Whisper writes in Latin letters or symbols; the lesson says them in Hangul.
const CODE_WORDS = { python: '파이썬', price: '프라이스', equal: '이콜', '=': '이콜', print: '프린트', count: '카운트', total: '토탈', age: '에이지' };
/** Rewrites Whisper's formatting (digits, Latin code words) into the lesson's Hangul reading. */
function toLessonReading(s) {
  let t = s.replace(/\b1(?=\s*만)/g, '');
  t = t.replace(new RegExp('(\\d+)(?=\\s*(?:' + COUNTERS + '))', 'g'), (m) => (Number(m) <= 10 ? NATIVE[Number(m)] : m));
  t = t.replace(/\d[\d,]*/g, (m) => sinoKorean(Number(m.replace(/,/g, ''))));
  t = t.replace(/[A-Za-z]+|=/g, (m) => CODE_WORDS[m.toLowerCase()] ?? m);
  return t;
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ---- helpers ------------------------------------------------------------------------------------
function whisperPython(explicit) {
  const candidates = [explicit, process.env.DOCENT_WHISPER_PYTHON,
    path.join(ROOT, 'scripts', 'voice', '.venv-whisper', 'bin', 'python'),
    path.join(ROOT, '..', 'prototypes', '.venv-whisper', 'bin', 'python')];
  return candidates.find((p) => p && existsSync(p));
}

const slugOf = (provider, voice, speed) => (provider + '-' + voice + (speed ? '-speed' + speed : '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-');

async function transcribeAll(items, python) {
  const dir = path.join(CACHE, 'asr');
  await mkdir(dir, { recursive: true });
  const todo = items.filter((it) => !existsSync(path.join(dir, it.key + '.json')));
  if (todo.length) {
    if (!python) throw new Error('no python with mlx_whisper found; pass --whisper-python');
    for (const it of todo) await writeWav16k(it.samples, path.join(dir, it.key + '.wav'));
    const jobFile = path.join(CACHE, 'tmp', 'asr-' + process.pid + '-jobs.json');
    const outFile = jobFile.replace(/-jobs\.json$/, '-out.json');
    await writeAtomic(jobFile, JSON.stringify({ jobs: todo.map((it) => ({ id: it.key, wav: path.join(dir, it.key + '.wav') })) }));
    log('re-transcribing ' + todo.length + ' clip(s) with mlx-whisper large-v3-turbo');
    await run(python, [path.join(ROOT, 'scripts', 'voice', 'transcribe.py'), jobFile, outFile], { capture: false });
    const out = JSON.parse(await readFile(outFile, 'utf8'));
    for (const r of out.results) await writeAtomic(path.join(dir, r.id + '.json'), JSON.stringify(r));
  }
  const map = new Map();
  for (const it of items) map.set(it.key, JSON.parse(await readFile(path.join(dir, it.key + '.json'), 'utf8')));
  return map;
}

/** Median |start difference| between Whisper word timestamps and the forced alignment (matched words only). */
function startAgreement(refWords, alignedWords, asrWords) {
  const diffs = [];
  let j = 0;
  for (let i = 0; i < refWords.length; i++) {
    const want = letters(refWords[i]).join('');
    for (let k = j; k < Math.min(asrWords.length, j + 3); k++) {
      if (letters(asrWords[k].w).join('') === want) {
        diffs.push(Math.abs(asrWords[k].start - alignedWords[i][0]) * 1000);
        j = k + 1;
        break;
      }
    }
  }
  return diffs;
}

// ---- main ---------------------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.input ?? path.join(ROOT, 'content', 'samples', 'voice-sample.json'));
  const lesson = JSON.parse(await readFile(input, 'utf8'));
  const segments = prepareSegments(lesson);
  const specs = args.candidates ? String(args.candidates).split(',') : DEFAULT_CANDIDATES;
  const whisperPy = whisperPython(args['whisper-python']);
  const results = [];
  const asrItems = [];
  const prepared = [];

  for (const spec of specs) {
    // provider[:voice][@speed]  e.g. supertonic:F1@0.9
    const [head, speedArg] = spec.split('@');
    const [pname, v] = head.split(':');
    const provider = getProvider(pname);
    const voice = v ?? provider.defaultVoice;
    const overrides = speedArg ? { speed: Number(speedArg) } : {};
    const slug = slugOf(provider.name, voice, speedArg);
    const base = { slug, provider: provider.name, model: provider.model, voice, options: { ...(provider.options ?? {}), ...overrides }, license: provider.license, localOnly: provider.localOnly };
    let jobs;
    try {
      jobs = await synthesize(provider, voice, segments, overrides);
    } catch (e) {
      if (!(e instanceof ProviderUnavailable)) throw e;
      log('skip ' + spec + ': ' + e.message);
      results.push({ ...base, status: 'unavailable', reason: e.message });
      continue;
    }
    const clips = await loadClips(jobs);
    const aligned = await alignClips(segments, clips);
    const items = clips.map((c, i) => {
      const bytes = Buffer.from(c.samples.buffer, c.samples.byteOffset, c.samples.byteLength);
      return { key: hash(['asr-1', hashBytes(bytes)]), samples: c.samples, seg: segments[i] };
    });
    asrItems.push(...items);
    prepared.push({ base, jobs, clips, aligned, items });
  }

  const asr = await transcribeAll(asrItems, whisperPy);
  const labDir = path.join(ROOT, 'audio', 'lab');
  const localDir = path.join(CACHE, 'lab');
  await mkdir(labDir, { recursive: true });
  await mkdir(localDir, { recursive: true });

  for (const { base, jobs, clips, aligned, items } of prepared) {
    // Speed: synthesis wall time per sentence (model load reported separately).
    const synthSeconds = sum(jobs.map((j) => j.info.synthSeconds ?? 0));
    const audioSeconds = sum(jobs.map((j) => j.info.audioSeconds));
    const loadSeconds = Math.max(0, ...jobs.map((j) => j.info.loadSeconds ?? 0));

    // Lab clip: the fixture read with its pauses, loudness-normalised, with word times.
    let cursor = 0;
    const layout = [];
    for (let i = 0; i < segments.length; i++) {
      cursor += Math.round((Math.min(segments[i].pauseBefore, 400) / 1000) * SR);
      layout.push(cursor);
      cursor += clips[i].samples.length + Math.round((Math.min(segments[i].pauseAfter, 400) / 1000) * SR);
    }
    const full = new Float32Array(cursor);
    clips.forEach((c, i) => full.set(c.samples, layout[i]));
    const norm = await normalizeLoudness(full);
    const audioFile = path.join(base.localOnly ? localDir : labDir, base.slug + '.m4a');
    await encodeM4a(norm.samples, audioFile, { bitrate: '64k', title: 'Docent voice lab — ' + base.slug });

    let edits = 0;
    let editsNum = 0;
    let refLen = 0;
    const agree = [];
    const segs = segments.map((s, i) => {
      const t = wordTimes(s, clips[i].samples.length / SR, aligned[i]);
      const hyp = asr.get(items[i].key);
      const ref = letters(s.say);
      const e = levenshtein(ref, letters(hyp.text));
      const en = levenshtein(ref, letters(toLessonReading(hyp.text)));
      edits += e;
      editsNum += en;
      refLen += ref.length;
      agree.push(...startAgreement(s.words, t.words, hyp.words));
      const start = layout[i] / SR;
      return {
        id: s.id, start: round(start), end: round(start + clips[i].samples.length / SR),
        words: t.words.map(([a, b]) => [round(start + a), round(start + b)]),
        align: t.align, confidence: round(t.confidence), hyp: hyp.text, cer: round(e / ref.length, 4), cerNumbers: round(en / ref.length, 4),
      };
    });
    const syllables = sum(segments.map((s) => s.words.flatMap(spokenChars).length));
    const speech = sum(clips.map((c) => c.samples.length / SR));
    const forced = segs.filter((s) => s.align === 'forced');
    results.push({
      ...base, status: 'ok',
      audio: rel(audioFile),
      rtf: round(synthSeconds / audioSeconds, 3), synthSeconds: round(synthSeconds, 2), audioSeconds: round(audioSeconds, 2), loadSeconds: round(loadSeconds, 1),
      cer: round(edits / refLen, 4), cerNumbers: round(editsNum / refLen, 4), refChars: refLen,
      syllablesPerSecond: round(syllables / speech, 2),
      forced: forced.length, confidence: round(sum(forced.map((s) => s.confidence)) / Math.max(1, forced.length)),
      startAgreementMs: { median: agree.length ? Math.round(median(agree)) : null, matched: agree.length, words: sum(segments.map((s) => s.words.length)) },
      segments: segs,
    });
  }

  const out = {
    generated: new Date().toISOString(),
    fixture: rel(input),
    whisper: 'mlx-community/whisper-large-v3-turbo (language ko, temperature 0)',
    aligner: 'kresnik/wav2vec2-large-xlsr-korean (CTC Viterbi, scripts/voice/align.py)',
    sentences: segments.map((s) => ({ id: s.id, say: s.say })),
    candidates: results,
  };
  await writeAtomic(path.join(labDir, 'eval.json'), JSON.stringify(out, null, 1) + '\n');

  const rows = results.map((r) => r.status !== 'ok'
    ? '| ' + r.slug + ' | — | — | — | — | — | ' + r.reason + ' |'
    : '| ' + r.slug + ' | ' + r.rtf.toFixed(3) + ' | ' + r.loadSeconds + ' s | ' + (r.cer * 100).toFixed(1) + '% | ' + (r.cerNumbers * 100).toFixed(1) + '% | ' +
      r.syllablesPerSecond + ' | forced ' + r.forced + '/' + segments.length + ', conf ' + r.confidence + ', Δstart ' + r.startAgreementMs.median + ' ms |');
  console.log(['| candidate | RTF | load | CER raw | CER normalised | syll/s | alignment |', '|---|---|---|---|---|---|---|', ...rows].join('\n'));
  log('wrote ' + rel(path.join(labDir, 'eval.json')));
}

main().catch((e) => {
  console.error('[eval] FAILED: ' + (e.stack || e.message));
  process.exit(1);
});
