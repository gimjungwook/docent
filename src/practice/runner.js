// Runs learner Python off the main thread: a module Web Worker loads Pyodide from
// the official CDN the first time code runs, then grades through harness.py.
// Code that runs too long is stopped by terminating the worker; a fresh one is
// warmed up right away so the next run starts quickly.

export const PYODIDE_VERSION = '314.0.7';
export const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`;

const WORKER_URL = new URL('./py-worker.js', import.meta.url);
const HARNESS_URL = new URL('./harness.py', import.meta.url);
const LOAD_TIMEOUT_MS = 90_000;
const DEFAULT_RUN_TIMEOUT_MS = 5_000;

export class PythonRunner extends EventTarget {
  constructor({ pyodideUrl = PYODIDE_URL, timeoutMs = DEFAULT_RUN_TIMEOUT_MS } = {}) {
    super();
    this.pyodideUrl = pyodideUrl;
    this.timeoutMs = timeoutMs;
    this.state = 'idle'; // idle | loading | ready | failed
    this.info = null; // { version, python } once ready
    this.worker = null;
    this.ready = null;
    this.pending = new Map();
    this.seq = 0;
    this.queue = Promise.resolve();
  }

  setState(state, detail = {}) {
    this.state = state;
    this.dispatchEvent(new CustomEvent('state', { detail: { state, ...detail } }));
  }

  /** Start loading Pyodide if it is not loaded yet. Resolves with { version, python }. */
  ensureReady() {
    if (this.ready) return this.ready;
    return this.spawn();
  }

  spawn() {
    this.kill();
    const worker = new Worker(WORKER_URL, { type: 'module', name: 'docent-python' });
    this.worker = worker;
    this.setState('loading');
    const ready = new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.worker === worker) {
          this.kill();
          this.setState('failed', { error });
        }
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('Python did not finish loading in time')), LOAD_TIMEOUT_MS);
      worker.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.type === 'ready') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.info = { version: msg.version, python: msg.python };
          this.setState('ready', this.info);
          resolve(this.info);
        } else if (msg.type === 'init-error') {
          fail(new Error(msg.message || 'Python could not start'));
        } else if (msg.type === 'result') {
          const done = this.pending.get(msg.id);
          if (done) {
            this.pending.delete(msg.id);
            done(msg.result);
          }
        }
      });
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        fail(new Error(event.message || 'Python worker failed'));
      });
      worker.postMessage({ type: 'init', pyodideUrl: this.pyodideUrl, harnessUrl: HARNESS_URL.href });
    });
    ready.catch(() => {}); // callers handle the rejection; keep the console clean
    this.ready = ready;
    return ready;
  }

  kill() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = null;
    for (const done of this.pending.values()) done({ cancelled: true, stdout: '', stderr: '', error: null });
    this.pending.clear();
  }

  /**
   * Run code (and grade it when checks are given). Runs are queued one at a time.
   * Resolves with the harness result plus { ms }, or { timedOut: true } when stopped.
   * Rejects only when Python cannot be loaded.
   */
  run(code, checks = null, { timeoutMs = this.timeoutMs } = {}) {
    const job = this.queue.then(() => this.runNow(String(code ?? ''), checks, timeoutMs));
    this.queue = job.catch(() => {});
    return job;
  }

  async runNow(code, checks, timeoutMs) {
    await this.ensureReady();
    const worker = this.worker;
    const id = ++this.seq;
    const started = performance.now();
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.kill();
        this.setState('idle', { reason: 'timeout' });
        this.spawn().catch(() => {}); // warm a fresh interpreter for the next run
        resolve({ timedOut: true, timeoutMs, stdout: '', stderr: '', error: null });
      }, timeoutMs);
      this.pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      worker.postMessage({ type: 'run', id, code, checks });
    });
    if (result && result.error && result.error.fatal) {
      this.kill();
      this.setState('idle', { reason: 'fatal' });
    }
    return { ...result, ms: Math.round(performance.now() - started) };
  }
}

let shared = null;

/** One interpreter per page, shared by every practice section. */
export function getRunner(options = {}) {
  if (!shared) shared = new PythonRunner(options);
  else if (options.timeoutMs) shared.timeoutMs = options.timeoutMs;
  return shared;
}
