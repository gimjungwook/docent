// Timeline: collects Web Animations and timed callbacks for one effect and exposes the fx Handle
// { duration, done, finish } described in SPEC section 6.
//
// Rules every effect follows (see src/components/README.md):
//  - Before play() the component puts the element in its FINAL state (the static CSS state).
//  - Tracks use fill: 'backwards', so each track shows its first keyframe until it starts and hands
//    over to the static CSS state when it ends. The last keyframe must therefore equal the final CSS.
//  - Use one track per (element, property); express multi-phase motion with keyframe offsets.
//  - finish() cancels every track (the static final state remains), runs pending set() callbacks and
//    skips pending cue() side effects such as sounds or particles.

const live = new WeakMap(); // owner element -> running Timeline

const toList = (targets) => {
  if (!targets) return [];
  if (typeof Element !== 'undefined' && targets instanceof Element) return [targets];
  return Array.from(targets).filter(Boolean);
};

export class Timeline {
  constructor(owner) {
    this.owner = owner;
    this.tracks = [];
    this.sets = [];
    this.cues = [];
    this.endings = [];
    this.length = 0;
    this.anims = [];
    this.timers = [];
    this.state = 'idle';
    this.done = null;
  }

  /** Animate targets. "at" and "dur" in ms; "stagger" adds a per-target delay. */
  to(targets, keyframes, { at = 0, dur = 300, ease = 'linear', fill = 'backwards', stagger = 0, iterations = 1, direction = 'normal', composite = 'replace' } = {}) {
    toList(targets).forEach((target, i) => {
      const delay = Math.max(0, at + i * stagger);
      this.tracks.push({ target, keyframes, timing: { delay, duration: Math.max(1, dur), easing: ease, fill, iterations, direction, composite } });
      this.length = Math.max(this.length, delay + Math.max(1, dur) * iterations);
    });
    return this;
  }

  /** A state change at time "at". Runs even if the effect is finished early; at <= 0 runs synchronously on play(). */
  set(fn, at = 0) {
    this.sets.push({ fn, at, done: false });
    this.length = Math.max(this.length, at);
    return this;
  }

  /** A transient side effect (sound, particles) at time "at". Skipped when finished early. Does not extend the length. */
  cue(fn, at = 0) {
    this.cues.push({ fn, at });
    return this;
  }

  /** Make the effect last at least "ms" (used to honour a duration budget). */
  hold(ms) {
    this.length = Math.max(this.length, ms);
    return this;
  }

  /** Run once when the effect ends, naturally or through finish(). */
  then(fn) {
    this.endings.push(fn);
    return this;
  }

  play() {
    const prev = live.get(this.owner);
    if (prev && prev !== this) prev.finish();
    if (this.owner) live.set(this.owner, this);
    this.state = 'running';
    let resolve;
    this.done = new Promise((r) => { resolve = r; });
    this._resolve = resolve;

    for (const s of this.sets) if (s.at <= 0) this._run(s);
    for (const tr of this.tracks) {
      try {
        const a = tr.target.animate(tr.keyframes, tr.timing);
        a.id = 'docent-fx';
        this.anims.push(a);
      } catch (err) {
        console.warn('[docent fx] skipped a track', err);
      }
    }
    for (const s of this.sets) if (s.at > 0) this.timers.push(setTimeout(() => this._run(s), s.at));
    for (const c of this.cues) {
      const fire = () => { if (this.state === 'running') safely(c.fn); };
      if (c.at <= 0) fire(); else this.timers.push(setTimeout(fire, c.at));
    }
    this.timers.push(setTimeout(() => this.finish(), this.length));
    return { duration: Math.round(this.length), done: this.done, finish: () => this.finish() };
  }

  _run(s) {
    if (s.done) return;
    s.done = true;
    safely(s.fn);
  }

  _stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    for (const a of this.anims) { try { a.cancel(); } catch { /* already gone */ } }
    this.anims = [];
    if (live.get(this.owner) === this) live.delete(this.owner);
  }

  /** Jump to the end state now. */
  finish() {
    if (this.state !== 'running') return;
    this.state = 'finished';
    for (const s of this.sets) this._run(s);
    this._stop();
    for (const fn of this.endings) safely(fn);
    this._resolve?.();
  }

  /** Stop without applying the end state (the caller then resets the element). */
  cancel() {
    if (this.state !== 'running') return;
    this.state = 'cancelled';
    this._stop();
    this._resolve?.();
  }
}

function safely(fn) {
  try { fn(); } catch (err) { console.error('[docent fx]', err); }
}

/** Stop whatever effect is running on an owner element: 'finish' jumps to its end, 'cancel' just stops it. */
export function stop(owner, how = 'cancel') {
  const tl = owner && live.get(owner);
  if (tl) tl[how]();
}

export function isRunning(owner) {
  return !!(owner && live.get(owner));
}

/** A Handle for an instant state change (reduced motion, nothing to animate). */
export function instant(fn) {
  if (fn) safely(fn);
  return { duration: 0, done: Promise.resolve(), finish() {} };
}

/** Mark an effect root's state: 'initial' | 'playing' | 'final'. No attribute = final (the no-JS markup). */
export function setState(el, state) {
  if (el) el.dataset.fxState = state;
}
