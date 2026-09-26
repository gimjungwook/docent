// run: code lines light up one by one as they are narrated, then the output appears.
// Markup: figure.blk.code[data-fx=run] > pre > code > span.ln[data-line] ... + div.out > span.out-line[data-from].
// opts.line (1-based) lights only that line and reveals only the output lines whose data-from equals it.
// settle/reset accept { line } too, so seeking can restore partial output.

import { Timeline, instant, setState, stop } from '../fx/timeline.js';
import { ease } from '../fx/motion.js';
import { highlightBlock } from './highlight.js';

const outputs = (el, line) => Array.from(el.querySelectorAll('.out-line'))
  .filter((o) => line == null || String(o.dataset.from) === String(line));

function hide(list) { list.forEach((o) => o.setAttribute('data-fx-hidden', '')); }
function show(list) { list.forEach((o) => o.removeAttribute('data-fx-hidden')); }

function syncState(el) {
  const any = el.querySelector('.out-line[data-fx-hidden]');
  setState(el, any ? 'initial' : 'final');
}

export default {
  prime(el) {
    stop(el, 'cancel');
    highlightBlock(el);
    hide(outputs(el));
    setState(el, 'initial');
  },
  settle(el, opts) {
    stop(el, 'finish');
    highlightBlock(el);
    show(outputs(el, opts && opts.line != null ? opts.line : null));
    syncState(el);
  },
  reset(el, opts) {
    stop(el, 'cancel');
    highlightBlock(el);
    hide(outputs(el, opts && opts.line != null ? opts.line : null));
    syncState(el);
  },
  play(el, o) {
    stop(el, 'finish');
    highlightBlock(el);
    const single = o.line != null && Number.isFinite(Number(o.line));
    const lines = Array.from(el.querySelectorAll('.ln'));
    const lit = single ? lines.filter((ln) => String(ln.dataset.line) === String(o.line)) : lines;
    const outs = outputs(el, single ? o.line : null);
    if (o.reduced) return instant(() => { show(outs); syncState(el); });

    const T = o.k.time;
    const n = Math.max(1, lit.length);
    const per = (o.mode === 'read' && !single ? Math.min(380, 1500 / n) : 380) * T;
    const outDur = 420 * T;
    const tl = new Timeline(el);
    const wasHidden = outs;
    tl.set(() => { show(outs); setState(el, 'playing'); }, 0);

    if (single) {
      tl.to(lit, [{ '--ln-on': 0 }, { '--ln-on': 1, offset: 0.14 }, { '--ln-on': 1, offset: 0.78 }, { '--ln-on': 0 }], { dur: per + outDur, ease: ease.inOut });
    } else {
      lit.forEach((ln, i) => {
        const last = i === lit.length - 1;
        tl.to(ln, [{ '--ln-on': 0 }, { '--ln-on': 1, offset: 0.12 }, { '--ln-on': 1, offset: last ? 0.5 : 0.62 }, { '--ln-on': 0 }],
          { at: i * per, dur: last ? per + outDur : per * 1.5, ease: ease.inOut });
      });
    }
    const outAt = per * (single ? 1 : lit.length);
    if (wasHidden.length) {
      const stagger = Math.min(90 * T, (outDur * 0.5) / wasHidden.length);
      tl.to(wasHidden, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)' }],
        { at: outAt, dur: outDur - stagger * (wasHidden.length - 1), stagger, ease: ease.out });
      tl.to(el.querySelector('.out'), [{ '--out-on': 0 }, { '--out-on': 1, offset: 0.25 }, { '--out-on': 0 }], { at: outAt, dur: outDur, ease: ease.out });
    }
    tl.hold(outAt + outDur);
    tl.then(() => syncState(el));
    return tl.play();
  },
};
