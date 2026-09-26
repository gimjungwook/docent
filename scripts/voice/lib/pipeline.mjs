// Core steps shared by build.mjs and eval.mjs: synthesize (cached), trim, align (cached), fallback timing.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { SR, decode, trimSilence, writeWav16k } from './audio.mjs';
import { CACHE, VOICE_DIR, hash, hashBytes, rel, run, spokenWords, venvPython, writeAtomic } from './util.mjs';

export const ALIGNER_VERSION = 'ctc-viterbi-1';
// The Korean CTC model scores some correctly placed syllables low where spelling and pronunciation
// differ (e.g. 첫 번째), so confidence alone is a weak signal: combine a low floor with structure checks.
export const MIN_CONFIDENCE = 0.2;
export const REVIEW_CONFIDENCE = 0.5;

const log = (...a) => console.error('[voice]', ...a);
const HANGUL = /^[\uAC00-\uD7A3]$/u;

/** Letters and digits that will be spoken (punctuation and symbols dropped). */
export const spokenChars = (word) => [...word.normalize('NFC')].filter((ch) => /[\p{L}\p{N}]/u.test(ch));

/** Validates the compiled lesson and returns segments with their spoken word lists. */
export function prepareSegments(lesson, { allowNonHangul = false } = {}) {
  if (!Array.isArray(lesson.segments) || lesson.segments.length === 0) throw new Error('lesson has no segments');
  const bad = [];
  const ids = new Set();
  const segments = lesson.segments.map((s) => {
    if (typeof s.id !== 'string' || !s.id) throw new Error('segment without id');
    if (ids.has(s.id)) throw new Error('duplicate segment id ' + s.id);
    ids.add(s.id);
    if (typeof s.say !== 'string' || !s.say.trim()) throw new Error(s.id + ': empty "say"');
    const say = s.say.normalize('NFC');
    const words = spokenWords(say);
    const odd = [...new Set(words.flatMap(spokenChars).filter((ch) => !HANGUL.test(ch)))];
    if (odd.length) bad.push(s.id + ': ' + odd.join(' '));
    const maxUnit = Math.max(0, ...(s.units ?? []).map((u) => u.say?.[1] ?? 0));
    if (s.units?.length && maxUnit !== words.length) {
      log('warning: ' + s.id + ' units cover ' + maxUnit + ' spoken words but "say" has ' + words.length);
    }
    const pauseBefore = Number(s.pauseBefore ?? 0);
    const pauseAfter = Number(s.pauseAfter ?? 0);
    if (!(pauseBefore >= 0) || !(pauseAfter >= 0)) throw new Error(s.id + ': invalid pause');
    return { id: s.id, say, words, pauseBefore, pauseAfter };
  });
  if (bad.length && !allowNonHangul) {
    throw new Error('"say" must be Hangul-normalised (SPEC §4); non-Hangul letters/digits found:\n  ' + bad.join('\n  ') +
      '\nFix the lesson script, or pass --allow-non-hangul to align those characters as wildcards.');
  }
  return segments;
}

/** One cached WAV per segment, keyed by provider + model + voice + options + text. */
export async function synthesize(provider, voice, segments, overrides = {}) {
  const options = { ...(provider.options ?? {}), ...overrides };
  const dir = path.join(CACHE, 'tts', provider.name);
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(CACHE, 'tmp'), { recursive: true });
  const jobs = segments.map((s) => {
    const key = hash([provider.name, provider.model, voice, provider.settingsVersion ?? 1, options, s.say]);
    return { id: s.id, text: s.say, key, wav: path.join(dir, key + '.wav'), meta: path.join(dir, key + '.json') };
  });
  const unique = [...new Map(jobs.filter((j) => !existsSync(j.wav)).map((j) => [j.key, j])).values()];
  if (unique.length) {
    log('synthesizing ' + unique.length + '/' + jobs.length + ' segment(s) with ' + provider.name + ' (' + voice + ') ' + JSON.stringify(options));
    for (const j of unique) j.out = j.wav.replace(/\.wav$/, '.part.wav');
    const info = (await provider.synth(unique, { voice, options })) ?? {};
    for (const j of unique) {
      if (!existsSync(j.out)) throw new Error(provider.name + ' produced no audio for ' + j.id);
      await rename(j.out, j.wav);
      const samples = await decode(j.wav);
      await writeAtomic(j.meta, JSON.stringify({
        provider: provider.name, model: provider.model, voice, options, text: j.text,
        synthSeconds: j.seconds ?? null, loadSeconds: info.loadSeconds ?? null,
        audioSeconds: samples.length / SR, created: new Date().toISOString(),
      }, null, 2));
    }
  } else log('all ' + jobs.length + ' segment(s) cached for ' + provider.name + ' (' + voice + ')');
  for (const j of jobs) j.info = JSON.parse(await readFile(j.meta, 'utf8'));
  return jobs;
}

/** Decoded, silence-trimmed clip per segment. */
export async function loadClips(jobs) {
  const clips = [];
  for (const j of jobs) {
    const raw = await decode(j.wav);
    const { samples } = trimSilence(raw);
    clips.push({ id: j.id, samples, rawSeconds: raw.length / SR });
  }
  return clips;
}

function alignPython(explicit) {
  return explicit || process.env.DOCENT_ALIGN_PYTHON || venvPython('align');
}

/** Forced alignment per clip (cached by clip audio + text). Returns relative word times or null. */
export async function alignClips(segments, clips, { force = false, python } = {}) {
  const dir = path.join(CACHE, 'align');
  await mkdir(dir, { recursive: true });
  const items = segments.map((s, i) => {
    const bytes = Buffer.from(clips[i].samples.buffer, clips[i].samples.byteOffset, clips[i].samples.byteLength);
    const key = hash([ALIGNER_VERSION, hashBytes(bytes), s.say]);
    return { seg: s, clip: clips[i], key, file: path.join(dir, key + '.json'), wav: path.join(dir, key + '.wav') };
  });
  const todo = items.filter((it) => force || !existsSync(it.file));
  if (todo.length) {
    const py = alignPython(python);
    if (!py) {
      log('warning: no aligner (scripts/voice/.venv-align missing) — using proportional timing');
      return items.map(() => null);
    }
    for (const it of todo) await writeWav16k(it.clip.samples, it.wav);
    const jobFile = path.join(CACHE, 'tmp', 'align-' + process.pid + '-jobs.json');
    const outFile = jobFile.replace(/-jobs\.json$/, '-out.json');
    await writeAtomic(jobFile, JSON.stringify({ jobs: todo.map((it) => ({ id: it.key, wav: it.wav, words: it.seg.words })) }));
    log('aligning ' + todo.length + ' clip(s) with ' + rel(path.join(VOICE_DIR, 'align.py')));
    await run(py, [path.join(VOICE_DIR, 'align.py'), jobFile, outFile], { capture: false });
    const out = JSON.parse(await readFile(outFile, 'utf8'));
    for (const r of out.results) {
      const it = todo.find((x) => x.key === r.id);
      await writeAtomic(it.file, JSON.stringify(r));
    }
  }
  const results = [];
  for (const it of items) results.push(JSON.parse(await readFile(it.file, 'utf8')));
  return results;
}

/** Character-proportional word times across a clip (fallback). */
export function proportional(words, clipSeconds, { lead = 0.03, tail = 0.08 } = {}) {
  const weights = words.map((w) => Math.max(1, spokenChars(w).length));
  const total = weights.reduce((a, b) => a + b, 0);
  const t0 = Math.min(lead, clipSeconds / 4);
  const span = Math.max(0.01, clipSeconds - t0 - Math.min(tail, clipSeconds / 4));
  let acc = 0;
  return weights.map((w) => {
    const a = t0 + (acc / total) * span;
    acc += w;
    return [a, t0 + (acc / total) * span];
  });
}

/** Why a forced alignment should not be trusted (null when it looks sound). */
export function alignmentProblem(seg, clipSeconds, result) {
  if (!result) return 'no aligner';
  if (!result.ok) return result.error;
  const n = seg.words.length;
  if (result.words?.length !== n) return 'word count mismatch';
  if (!(result.confidence >= MIN_CONFIDENCE)) return 'low confidence ' + result.confidence;
  const edge = Math.min(0.6, clipSeconds / 3);
  if (result.words[0][0] > edge) return 'first word starts late (' + result.words[0][0] + ' s)';
  if (result.words[n - 1][1] < clipSeconds - edge) return 'last word ends early (' + result.words[n - 1][1] + ' of ' + clipSeconds.toFixed(2) + ' s)';
  for (let k = 0; k < n; k++) {
    const syll = spokenChars(seg.words[k]).length;
    const [a, b] = result.words[k];
    if (syll && !(b > a)) return 'word ' + k + ' has no duration';
    if (b - a > 0.6 + 0.4 * syll) return 'word ' + k + ' implausibly long (' + (b - a).toFixed(2) + ' s)';
  }
  return null;
}

/** Chooses forced or proportional timing for one segment. */
export function wordTimes(seg, clipSeconds, result) {
  const why = alignmentProblem(seg, clipSeconds, result);
  if (!why) {
    if (result.confidence < REVIEW_CONFIDENCE) log('note: ' + seg.id + ' aligned with low confidence ' + result.confidence + ' — worth a listen');
    return { words: result.words, align: 'forced', confidence: result.confidence };
  }
  log('warning: ' + seg.id + ' uses proportional timing (' + why + ')');
  return { words: proportional(seg.words, clipSeconds), align: 'proportional', confidence: result?.ok ? result.confidence : 0 };
}
