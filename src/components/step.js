// step: advances a figure (src/components/figures/<name>.js) through its steps.
// Markup: figure.blk.figure[data-fx=step][data-figure=name][data-from][data-to] > .figure-stage + figcaption.
// prime()/reset() show step data-from, settle() shows data-to, fx.step(el, { n }) animates to absolute step n
// (intermediate steps play quickly in sequence). settle/reset also accept { n } for seeking inside a range:
// settle(el, { n }) shows step n, reset(el, { n }) shows step n - 1.

import { figures } from './figures/index.js';
import { Timeline, instant, setState } from '../fx/timeline.js';

const views = new WeakMap();  // el -> { fig, view, current }
const chains = new WeakMap(); // el -> running chain controller

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

function setup(el) {
  let s = views.get(el);
  if (s) return s;
  const fig = figures[el.dataset.figure];
  if (!fig) return null;
  const stage = el.querySelector('.figure-stage') || el;
  s = { fig, view: fig.mount(stage), current: -1 };
  views.set(el, s);
  return s;
}

function range(el, fig) {
  const from = Math.max(0, Math.min(fig.steps, int(el.dataset.from, 0)));
  const to = Math.max(from, Math.min(fig.steps, int(el.dataset.to, fig.steps)));
  return { from, to };
}

function show(el, s, n) {
  s.view.set(n);
  s.current = n;
  el.dataset.step = String(n);
}

function halt(el, how) {
  const c = chains.get(el);
  if (c) c[how]();
}

function chain(el, legs, onEnd) {
  const total = legs.reduce((sum, tl) => sum + tl.length, 0);
  let i = -1;
  let current = null;
  let state = 'running';
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const end = (how) => {
    if (state !== 'running') return;
    state = how;
    chains.delete(el);
    if (current) (how === 'finished' ? current.finish() : current.cancel());
    if (how === 'finished') onEnd();
    resolve();
  };
  const next = () => {
    if (state !== 'running') return;
    i += 1;
    if (i >= legs.length) { end('finished'); return; }
    const leg = legs[i];
    current = leg;
    leg.play().done.then(() => { if (current === leg) next(); });
  };
  const ctl = { finish: () => end('finished'), cancel: () => end('cancelled') };
  chains.set(el, ctl);
  next();
  return { duration: Math.round(total), done, finish: ctl.finish };
}

export default {
  prime(el) {
    const s = setup(el);
    if (!s) return;
    halt(el, 'cancel');
    show(el, s, range(el, s.fig).from);
    setState(el, 'initial');
  },

  settle(el, opts) {
    const s = setup(el);
    if (!s) return;
    halt(el, 'cancel');
    const { to } = range(el, s.fig);
    const n = opts && opts.n != null ? Math.max(0, Math.min(s.fig.steps, int(opts.n, to))) : to;
    show(el, s, n);
    setState(el, n >= to ? 'final' : 'initial');
  },

  reset(el, opts) {
    const s = setup(el);
    if (!s) return;
    halt(el, 'cancel');
    const { from } = range(el, s.fig);
    const n = opts && opts.n != null ? Math.max(0, Math.min(s.fig.steps, int(opts.n, from + 1) - 1)) : from;
    show(el, s, n);
    setState(el, 'initial');
  },

  play(el, opts) {
    const s = setup(el);
    if (!s) return instant();
    halt(el, 'finish');
    const { from, to } = range(el, s.fig);
    let start = s.current < 0 ? from : s.current;
    const target = Math.max(0, Math.min(s.fig.steps, opts.n != null ? int(opts.n, start + 1) : start + 1));
    if (target <= start) {
      // Replaying (for example from the lab): step back once and play the last step again.
      start = Math.max(0, target - 1);
      show(el, s, start);
    }
    const finalState = () => setState(el, target >= to ? 'final' : 'playing');
    if (opts.reduced || target === start) {
      return instant(() => { show(el, s, target); finalState(); });
    }
    setState(el, 'playing');
    const legs = [];
    for (let k = start + 1; k <= target; k++) {
      const quick = k < target;
      const tl = new Timeline(el);
      const n = k;
      tl.set(() => show(el, s, n), 0);
      const ms = s.view.animate(tl, n - 1, n, { T: opts.k.time * (quick ? 0.55 : 1), amp: opts.k.amp, quick, mode: opts.mode });
      tl.hold(ms);
      legs.push(tl);
    }
    return chain(el, legs, () => { show(el, s, target); finalState(); });
  },
};
