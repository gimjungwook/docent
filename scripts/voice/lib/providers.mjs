// Pluggable speech providers. Each synthesizes one WAV per job: jobs = [{ id, text, out }].
// A provider may set job.seconds (synthesis wall time) and return { loadSeconds } for evaluation.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FFMPEG } from './audio.mjs';
import { CACHE, VOICE_DIR, run, venvPython, writeAtomic } from './util.mjs';

export class ProviderUnavailable extends Error {}

const now = () => performance.now() / 1000;

/** macOS system voice. Apple's licence does not cover publishing this audio: local placeholder only. */
const say = {
  name: 'say',
  model: 'macos-say',
  defaultVoice: 'Yuna',
  settingsVersion: 1,
  localOnly: true,
  license: 'Apple macOS system voice — local placeholder only; do not publish this audio.',
  async synth(jobs, { voice }) {
    if (process.platform !== 'darwin') throw new ProviderUnavailable('say: macOS only');
    const tmp = path.join(CACHE, 'tmp');
    await mkdir(tmp, { recursive: true });
    for (const job of jobs) {
      const txt = path.join(tmp, 'say-' + process.pid + '-' + job.id + '.txt');
      await writeFile(txt, job.text, 'utf8');
      const t0 = now();
      await run('say', ['-v', voice, '-f', txt, '-o', job.out, '--file-format=WAVE', '--data-format=LEI16@22050']);
      job.seconds = now() - t0;
      await rm(txt, { force: true });
    }
    return { loadSeconds: 0 };
  },
};

/** Runs scripts/voice/providers/<script> in its own venv; the model loads once per build. */
function pythonProvider({ name, venv, script, model, defaultVoice, license, options = {}, settingsVersion = 1 }) {
  return {
    name, model, defaultVoice, license, settingsVersion, options, localOnly: false,
    async synth(jobs, { voice, options: opts = options }) {
      const py = venvPython(venv);
      if (!py) throw new ProviderUnavailable(name + ': missing scripts/voice/.venv-' + venv + ' (see scripts/voice/README.md)');
      const jobFile = path.join(CACHE, 'tmp', name + '-' + process.pid + '-jobs.json');
      const outFile = jobFile.replace(/-jobs\.json$/, '-out.json');
      await writeAtomic(jobFile, JSON.stringify({ voice, options: opts, jobs: jobs.map(({ id, text, out }) => ({ id, text, out })) }));
      await run(py, [path.join(VOICE_DIR, 'providers', script), jobFile, outFile], { capture: false });
      const res = JSON.parse(await readFile(outFile, 'utf8'));
      for (const r of res.results) {
        const job = jobs.find((j) => j.id === r.id);
        if (job) job.seconds = r.seconds;
      }
      await rm(jobFile, { force: true });
      await rm(outFile, { force: true });
      return { loadSeconds: res.load_seconds ?? null };
    },
  };
}

// Supertonic (Supertone). Licence details: THIRD_PARTY.md (voice section).
const supertonic = pythonProvider({
  name: 'supertonic',
  venv: 'supertonic',
  script: 'supertonic_tts.py',
  model: 'supertonic-3',
  defaultVoice: 'F1',
  license: 'Supertonic 3 (Supertone) model: BigScience Open RAIL-M; output must be disclosed as machine-generated (Attachment A(e)); see THIRD_PARTY.md',
  // speed 0.9 ≈ 5.1 syllables/s: a calm lesson pace (package default 1.05 ≈ 6 syllables/s); docs/voice-eval.md
  options: { lang: 'ko', model: 'supertonic-3', steps: 8, speed: 0.9, seed: 7 },
});

// Qwen3-TTS 1.7B CustomVoice, 8-bit MLX conversion, run with mlx-audio on Apple Silicon.
const qwen3 = pythonProvider({
  name: 'qwen3',
  venv: 'qwen3',
  script: 'qwen3_tts.py',
  model: 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit',
  defaultVoice: 'Sohee',
  license: 'Qwen3-TTS: Apache-2.0 (Alibaba Qwen team)',
  options: { language: 'korean', seed: 7, temperature: 0.9 },
});

// Fish Audio S2 Pro through OpenRouter. The key comes from OPENROUTER_API_KEY, or from the .env file named by
// DOCENT_ENV_FILE; it is never printed.
async function openrouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim() || null;
  const file = process.env.DOCENT_ENV_FILE ? process.env.DOCENT_ENV_FILE.replace(/^~(?=\/)/, os.homedir()) : null;
  if (!file) return null;
  let text;
  try {
    text = await readFile(path.resolve(file), 'utf8');
  } catch {
    return null;
  }
  const m = text.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m);
  return m ? m[1].replace(/^['"]|['"]$/g, '') || null : null;
}

const redact = (s) => String(s).replace(/sk-or-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 300);

const fishOpenrouter = {
  name: 'fish-openrouter',
  model: 'fish-audio/s2-pro',
  defaultVoice: 'default',
  settingsVersion: 1,
  localOnly: false,
  license: 'Fish Audio S2 Pro via OpenRouter — output use governed by Fish Audio and OpenRouter terms',
  async synth(jobs, { voice }) {
    const key = await openrouterKey();
    if (!key) throw new ProviderUnavailable('fish-openrouter: set OPENROUTER_API_KEY or DOCENT_ENV_FILE');
    for (const job of jobs) {
      const body = { model: 'fish-audio/s2-pro', input: job.text, response_format: 'mp3' };
      if (voice && voice !== 'default') body.voice = voice;
      const t0 = now();
      let res;
      try {
        res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(180000),
        });
      } catch (e) {
        throw new ProviderUnavailable('fish-openrouter: request failed (' + redact(e.message) + ')');
      }
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        throw new ProviderUnavailable('fish-openrouter: HTTP ' + res.status + ' (key unauthorized or out of credit) — skipped');
      }
      if (!res.ok) throw new Error('fish-openrouter: HTTP ' + res.status + ' ' + redact(await res.text()));
      const mp3 = job.out.replace(/\.wav$/, '.mp3');
      await writeFile(mp3, Buffer.from(await res.arrayBuffer()));
      job.seconds = now() - t0;
      await run(FFMPEG, ['-v', 'error', '-y', '-i', mp3, '-ac', '1', job.out]);
      await rm(mp3, { force: true });
    }
    return { loadSeconds: 0 };
  },
};

export const PROVIDERS = { say, supertonic, qwen3, 'fish-openrouter': fishOpenrouter };

/** Default = the evaluation winner that is safe to publish (docs/voice-eval.md). */
export const DEFAULT_PROVIDER = 'supertonic';

export function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error('unknown provider "' + name + '"; choose one of: ' + Object.keys(PROVIDERS).join(', '));
  return p;
}

export const hasVenv = (name) => existsSync(path.join(VOICE_DIR, '.venv-' + name));
