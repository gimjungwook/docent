// Docent effect kit: the fx API from SPEC section 6.
//
//   import { fx, prime, settle, reset } from '../components/index.js';
//   const h = fx.pop(el, { mode: 'play', intensity: 'normal', reduced: false, sound: false });
//   h.duration  // ms, known synchronously
//   await h.done  // resolves when the effect ends or h.finish() is called (never rejects)
//
// Every component module exports { prime, play, settle, reset } (see README.md in this folder).

import intro from './intro.js';
import chapter from './chapter.js';
import pop from './pop.js';
import burst from './burst.js';
import flip from './flip.js';
import run from './run.js';
import step from './step.js';
import checkpoint from './checkpoint.js';
import outro from './outro.js';
import { normalize } from '../fx/motion.js';
import { instant } from '../fx/timeline.js';

export { drawMotif } from './intro.js';
export { unlockAudio } from '../fx/sound.js';
export { clearParticles } from '../fx/particles.js';

const registry = { intro, chapter, pop, burst, flip, run, step, checkpoint, outro };

/** Duration budgets at intensity 'normal' (SPEC section 6). run: per line + output. */
export const BUDGET = { intro: 4800, chapter: 1400, pop: 700, burst: 1100, flip: 1000, runLine: 380, runOutput: 420, step: 900, checkpoint: 1600, outro: 1800 };

function byId(el) {
  return typeof el === 'string' ? document.getElementById(el) : el;
}

/** Find the element an effect acts on: the element itself, or the [data-fx=name] inside/around it. */
function resolve(el, name) {
  el = byId(el);
  if (!el || !el.matches) return null;
  const sel = '[data-fx="' + name + '"]';
  if (name === 'burst' || el.matches(sel)) return el;
  return el.querySelector(sel) || el.closest(sel) || el;
}

function componentOf(el) {
  el = byId(el);
  if (!el || !el.matches) return [null, null];
  const target = el.matches('[data-fx]') ? el : el.querySelector('[data-fx]');
  if (!target) return [null, null];
  return [registry[target.dataset.fx] || null, target];
}

export const fx = {};
for (const [name, comp] of Object.entries(registry)) {
  fx[name] = (el, opts = {}) => {
    const target = resolve(el, name);
    if (!target) return instant();
    try {
      return comp.play(target, normalize(opts)) || instant();
    } catch (err) {
      console.error('[docent fx] ' + name + ' failed', err);
      try { comp.settle?.(target, normalize(opts)); } catch { /* keep the page readable */ }
      return instant();
    }
  };
}

/** Put every effectable element under root into its initial (pre-effect) state. Idempotent. */
export function prime(root = document) {
  root = byId(root) || document;
  for (const [name, comp] of Object.entries(registry)) {
    if (!comp.prime) continue;
    const sel = '[data-fx="' + name + '"]';
    const list = Array.from(root.querySelectorAll(sel));
    if (root.matches?.(sel)) list.unshift(root);
    for (const el of list) {
      try { comp.prime(el); } catch (err) { console.error('[docent fx] prime ' + name, err); }
    }
  }
}

/**
 * Jump to the final state instantly (seek forward past the effect).
 * Optional opts: { n } for a figure step, { line } for a single-line run.
 */
export function settle(el, opts) {
  const [comp, target] = componentOf(el);
  if (!comp) return;
  try { comp.settle?.(target, opts ? normalize(opts) : undefined); } catch (err) { console.error('[docent fx] settle', err); }
}

/**
 * Jump to the initial state instantly (seek backward before the effect).
 * Optional opts: { n } puts a figure at the step before n; { line } hides only that line's output.
 */
export function reset(el, opts) {
  const [comp, target] = componentOf(el);
  if (!comp) return;
  try { comp.reset?.(target, opts ? normalize(opts) : undefined); } catch (err) { console.error('[docent fx] reset', err); }
}
