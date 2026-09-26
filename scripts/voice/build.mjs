#!/usr/bin/env node
// Docent narration builder (SPEC §8).
//   node scripts/voice/build.mjs <lessonId> [--provider <name>] [--voice <speaker>] [--input <lesson.json>]
// Reads data/lessons/<lessonId>.json (or --input), synthesizes every segment's "say" separately (cached in
// .cache/voice/), inserts the exact pauseBefore/pauseAfter silences, normalises loudness to about -16 LUFS,
// writes audio/<lessonId>.m4a (AAC mono 96 kbps) and data/<lessonId>.timings.json with absolute word times.
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { SR, decode, encodeM4a, measureLoudness, normalizeLoudness } from './lib/audio.mjs';
import { alignClips, loadClips, prepareSegments, synthesize, wordTimes } from './lib/pipeline.mjs';
import { DEFAULT_PROVIDER, PROVIDERS, ProviderUnavailable, getProvider } from './lib/providers.mjs';
import { ROOT, parseArgs, rel, spokenWords, writeAtomic } from './lib/util.mjs';

const round = (x) => Math.round(x * 1000) / 1000;
const log = (...a) => console.error('[voice]', ...a);

function usage(code = 0) {
  console.error([
    'usage: node scripts/voice/build.mjs <lessonId> [options]',
    '  --provider <name>    ' + Object.keys(PROVIDERS).join(' | ') + ' (default: ' + DEFAULT_PROVIDER + ')',
    '  --voice <speaker>    provider speaker (default per provider)',
    '  --input <file>       compiled lesson JSON (default: data/lessons/<lessonId>.json)',
    '  --force-align        re-run alignment even when cached',
    '  --allow-non-hangul   align non-Hangul letters/digits in "say" as wildcards instead of failing',
  ].join('\n'));
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length !== 1) usage(args.help ? 0 : 1);
  const lessonId = args._[0];
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(lessonId)) throw new Error('invalid lesson id ' + lessonId);
  const input = path.resolve(args.input ?? path.join(ROOT, 'data', 'lessons', lessonId + '.json'));
  const lesson = JSON.parse(await readFile(input, 'utf8'));
  if (lesson.id && lesson.id !== lessonId) log('note: lesson file id is "' + lesson.id + '", writing outputs as "' + lessonId + '"');
  const provider = getProvider(args.provider ?? DEFAULT_PROVIDER);
  const voice = args.voice ?? provider.defaultVoice;
  const segments = prepareSegments(lesson, { allowNonHangul: Boolean(args['allow-non-hangul']) });
  const t0 = performance.now();

  const jobs = await synthesize(provider, voice, segments);
  const clips = await loadClips(jobs);
  const aligned = await alignClips(segments, clips, { force: Boolean(args['force-align']) });

  // Lay out the timeline: exact pauses in samples, clip after clip.
  const layout = [];
  let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    cursor += Math.round((s.pauseBefore / 1000) * SR);
    const start = cursor;
    cursor += clips[i].samples.length;
    layout.push({ start, end: cursor });
    cursor += Math.round((s.pauseAfter / 1000) * SR);
  }
  const full = new Float32Array(cursor);
  for (let i = 0; i < segments.length; i++) full.set(clips[i].samples, layout[i].start);

  const timingSegments = segments.map((s, i) => {
    const start = layout[i].start / SR;
    const end = layout[i].end / SR;
    const t = wordTimes(s, clips[i].samples.length / SR, aligned[i]);
    const words = t.words.map(([a, b]) => [round(Math.min(start + a, end)), round(Math.min(start + b, end))]);
    const expected = spokenWords(s.say).length;
    if (words.length !== expected) throw new Error(s.id + ': ' + words.length + ' word times for ' + expected + ' spoken words');
    for (let k = 1; k < words.length; k++) {
      if (words[k][0] < words[k - 1][0] - 1e-6) throw new Error(s.id + ': word times go backwards at word ' + k);
    }
    return { id: s.id, start: round(start), end: round(end), words, align: t.align, confidence: round(t.confidence) };
  });

  const norm = await normalizeLoudness(full);
  const audioRel = 'audio/' + lessonId + '.m4a';
  const audioFile = path.join(ROOT, audioRel);
  const tmpAudio = audioFile.replace(/\.m4a$/, '.tmp.m4a');
  await encodeM4a(norm.samples, tmpAudio, {
    title: (lesson.title ?? lessonId) + ' — Docent narration',
    comment: provider.name + ' / ' + provider.model + ' / ' + voice,
  });
  const check = await decode(tmpAudio);
  const drift = Math.abs(check.length - full.length) / SR;
  if (drift > 0.05) throw new Error('encoded audio length differs by ' + drift.toFixed(3) + ' s');
  const final = await measureLoudness(check);
  await rename(tmpAudio, audioFile);

  const timings = {
    version: 1,
    lesson: lessonId,
    voice: { provider: provider.name, model: provider.model, speaker: voice, license: provider.license },
    audio: audioRel,
    duration: round(full.length / SR),
    segments: timingSegments,
  };
  const timingsFile = path.join(ROOT, 'data', lessonId + '.timings.json');
  await writeAtomic(timingsFile, JSON.stringify(timings, null, 1).replace(/\[\n\s+([\d.]+),\n\s+([\d.]+)\n\s+\]/g, '[$1, $2]') + '\n');

  const forced = timingSegments.filter((s) => s.align === 'forced');
  const confs = forced.map((s) => s.confidence);
  log('segments: ' + segments.length + ', forced ' + forced.length + ', proportional ' + (segments.length - forced.length) +
    (confs.length ? ', confidence mean ' + (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3) + ' min ' + Math.min(...confs).toFixed(3) : ''));
  log('loudness: ' + norm.before.lufs.toFixed(1) + ' LUFS -> ' + final.lufs.toFixed(1) + ' LUFS (gain ' + norm.gainDb.toFixed(1) + ' dB, highest peak limited ' +
    norm.limitedDb.toFixed(1) + ' dB, ' + (norm.limitedShare * 100).toFixed(2) + '% of samples turned down >1 dB, true peak ' + final.truePeak.toFixed(1) + ' dBTP)');
  log('wrote ' + rel(audioFile) + ' (' + timings.duration.toFixed(2) + ' s) and ' + rel(timingsFile) + ' in ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s');
  if (provider.localOnly) log('NOTE: ' + provider.name + ' audio is a local placeholder; do not publish it.');
  console.log(JSON.stringify({ lesson: lessonId, provider: provider.name, voice, duration: timings.duration, audio: audioRel, timings: rel(timingsFile) }));
}

main().catch((e) => {
  if (e instanceof ProviderUnavailable) {
    console.error('[voice] provider unavailable: ' + e.message);
    process.exit(3);
  }
  console.error('[voice] FAILED: ' + (e.stack || e.message));
  process.exit(1);
});
