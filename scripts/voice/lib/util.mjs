// Shared helpers for the voice pipeline (no dependencies beyond Node 20+).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const VOICE_DIR = path.join(ROOT, 'scripts', 'voice');
export const CACHE = path.join(ROOT, '.cache', 'voice');

export function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function hashBytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Spoken words exactly as SPEC §4 defines them: say.split(/\s+/) (outer spaces ignored). */
export function spokenWords(say) {
  return say.trim().split(/\s+/);
}

export function run(cmd, args, { input, env, capture = true, allowFail = false, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env ?? process.env, cwd, stdio: ['pipe', capture ? 'pipe' : 'inherit', 'pipe'] });
    const out = [];
    const err = [];
    if (capture) child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => {
      err.push(d);
      if (!capture) process.stderr.write(d);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8') };
      if (code !== 0 && !allowFail) {
        const e = new Error(cmd + ' exited with ' + code + '\n' + result.stderr.slice(-2000));
        e.result = result;
        reject(e);
      } else resolve(result);
    });
    child.stdin.on('error', () => {});
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

export async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) args[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

export function venvPython(name) {
  const p = path.join(VOICE_DIR, '.venv-' + name, 'bin', 'python');
  return existsSync(p) ? p : null;
}

export const rel = (p) => path.relative(ROOT, p) || '.';

