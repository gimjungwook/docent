// Audio helpers built on ffmpeg: decode, trim, silence, loudness and AAC encoding.
import { run } from './util.mjs';

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const SR = 44100;

function toFloat32(buf) {
  const out = new Float32Array(buf.byteLength / 4);
  new Uint8Array(out.buffer).set(buf.subarray(0, out.length * 4));
  return out;
}

const f32Bytes = (samples) => Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);

/** Decode any audio file to mono float samples at SR. */
export async function decode(file) {
  const { stdout } = await run(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1']);
  return toFloat32(stdout);
}

/** Write mono float samples (SR) as a 16 kHz 16-bit WAV for the aligner. */
export async function writeWav16k(samples, file) {
  await run(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0',
    '-ar', '16000', '-c:a', 'pcm_s16le', file], { input: f32Bytes(samples) });
}

/**
 * Cut leading and trailing silence so the lesson's pauseBefore/pauseAfter are the only pauses
 * around a sentence. Keeps a short margin so soft onsets and final consonants survive.
 */
export function trimSilence(samples, { relDb = -40, floorDb = -55, keepStart = 0.03, keepEnd = 0.08 } = {}) {
  const win = Math.round(SR * 0.01);
  const n = Math.floor(samples.length / win);
  const db = new Float64Array(n);
  let peak = -Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * win; j < (i + 1) * win; j++) s += samples[j] * samples[j];
    db[i] = 10 * Math.log10(s / win + 1e-12);
    if (db[i] > peak) peak = db[i];
  }
  const thr = Math.max(peak + relDb, floorDb);
  let first = 0;
  while (first < n && db[first] < thr) first++;
  let last = n - 1;
  while (last > first && db[last] < thr) last--;
  if (first >= n) return { samples, offset: 0 };
  const from = Math.max(0, first * win - Math.round(keepStart * SR));
  const to = Math.min(samples.length, (last + 1) * win + Math.round(keepEnd * SR));
  return { samples: samples.slice(from, to), offset: from / SR };
}

/** Integrated loudness (LUFS) and true peak (dBTP) via ffmpeg's EBU R128 loudnorm analysis. */
export async function measureLoudness(samples) {
  const { stderr } = await run(FFMPEG, ['-hide_banner', '-nostats', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { input: f32Bytes(samples) });
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  const m = JSON.parse(json);
  return { lufs: Number(m.input_i), truePeak: Number(m.input_tp), lra: Number(m.input_lra) };
}

/**
 * Normalise by a single gain (timing and silences stay sample-exact): aim for the target
 * loudness; if the peaks would pass the ceiling, first tame them with a smooth look-ahead
 * limiter (offline, zero latency), then cap the gain so the true peak stays under the ceiling.
 */
export async function normalizeLoudness(samples, { target = -16, ceiling = -1.5 } = {}) {
  const before = await measureLoudness(samples);
  let work = samples;
  let gainDb = target - before.lufs;
  let limitedDb = 0;
  let limitedShare = 0;
  if (before.truePeak + gainDb > ceiling) {
    const thresholdDb = ceiling - 1.0 - gainDb;
    const limited = limitPeaks(samples, Math.pow(10, thresholdDb / 20));
    work = limited.samples;
    limitedShare = limited.share;
    const mid = await measureLoudness(work);
    limitedDb = before.truePeak - mid.truePeak;
    gainDb = target - mid.lufs;
    if (mid.truePeak + gainDb > ceiling) gainDb = ceiling - mid.truePeak;
  }
  const g = Math.pow(10, gainDb / 20);
  const out = new Float32Array(work.length);
  for (let i = 0; i < work.length; i++) out[i] = work[i] * g;
  return { samples: out, gainDb, limitedDb, limitedShare, before };
}

/**
 * Offline peak limiter: per-sample gain that keeps |x| under `ceilingLin`, spread over a 5 ms
 * look-ahead/behind window and released over ~80 ms. Returns the limited copy (no delay) and the
 * share of samples turned down by more than 1 dB.
 */
export function limitPeaks(samples, ceilingLin) {
  const n = samples.length;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(samples[i]);
    need[i] = a > ceilingLin ? ceilingLin / a : 1;
  }
  const w = Math.round(0.005 * SR);
  const g = slidingMin(need, w);
  const rel = 1 - Math.exp(-1 / (0.08 * SR));
  const att = 1 - Math.exp(-1 / (0.002 * SR));
  for (let i = 1; i < n; i++) g[i] = Math.min(g[i], g[i - 1] + (1 - g[i - 1]) * rel);
  for (let i = n - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + (1 - g[i + 1]) * att);
  const out = new Float32Array(n);
  let touched = 0;
  for (let i = 0; i < n; i++) {
    out[i] = samples[i] * g[i];
    if (g[i] < 0.891) touched++;
  }
  return { samples: out, share: touched / Math.max(1, n) };
}

function slidingMin(x, radius) {
  const n = x.length;
  const out = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + radius);
    while (next <= hi) {
      while (tail > head && x[dq[tail - 1]] >= x[next]) tail--;
      dq[tail++] = next++;
    }
    while (dq[head] < i - radius) head++;
    out[i] = x[dq[head]];
  }
  return out;
}

/** Encode mono float samples to AAC in an MP4 container (.m4a). */
export async function encodeM4a(samples, file, { bitrate = '96k', title, comment } = {}) {
  const meta = [];
  if (title) meta.push('-metadata', 'title=' + title);
  if (comment) meta.push('-metadata', 'comment=' + comment);
  await run(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0',
    '-c:a', 'aac', '-b:a', bitrate, '-ac', '1', ...meta, '-movflags', '+faststart', file], { input: f32Bytes(samples) });
}

export function silence(ms) {
  return new Float32Array(Math.round((ms / 1000) * SR));
}
