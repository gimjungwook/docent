// pop: the spoken word itself springs up, flashes coral, then settles into a lasting highlighter emphasis.
// Markup: <span class="fx-pop" data-fx="pop">이름표</span> inside a narrated unit.
// Colour and the marker band run through two registered custom properties (--pop-heat, --pop-mark, see
// components.css) so the word keeps inheriting the narration colours from the engine.

import { Timeline, instant, setState, stop } from '../fx/timeline.js';
import { ease } from '../fx/motion.js';

function reserve(el) {
  // The emphasised weight is reserved from the start (see .fx-pop::after), so nothing reflows.
  if (!el.dataset.text) el.dataset.text = el.textContent.trim();
}

export default {
  prime(el) {
    stop(el, 'cancel');
    reserve(el);
    setState(el, 'initial');
  },
  settle(el) {
    stop(el, 'cancel');
    reserve(el);
    setState(el, 'final');
  },
  reset(el) {
    stop(el, 'cancel');
    reserve(el);
    setState(el, 'initial');
  },
  play(el, o) {
    stop(el, 'finish');
    reserve(el);
    if (o.reduced) return instant(() => setState(el, 'final'));
    setState(el, 'playing');
    const D = 700 * o.k.time;
    const a = o.k.amp;
    const tl = new Timeline(el);
    tl.to(el, [
      { transform: 'translateY(0px) scale(1)', easing: ease.out },
      { transform: 'translateY(' + (-3 * a).toFixed(2) + 'px) scale(' + (1 + 0.2 * a).toFixed(3) + ')', offset: 0.22, easing: ease.inOut },
      { transform: 'translateY(0px) scale(' + (1 - 0.04 * a).toFixed(3) + ')', offset: 0.46, easing: ease.inOut },
      { transform: 'translateY(0px) scale(' + (1 + 0.014 * a).toFixed(3) + ')', offset: 0.66, easing: ease.inOut },
      { transform: 'translateY(0px) scale(1)' },
    ], { dur: D * 0.9 });
    tl.to(el, [
      { fontWeight: 400, '--pop-heat': 0 },
      { fontWeight: 820, '--pop-heat': 1, offset: 0.2 },
      { fontWeight: 760, '--pop-heat': 1, offset: 0.5 },
      { fontWeight: 700, '--pop-heat': 0 },
    ], { dur: D, ease: ease.out });
    tl.to(el, [{ '--pop-mark': 0 }, { '--pop-mark': 0, offset: 0.4 }, { '--pop-mark': 1 }], { dur: D, ease: ease.out });
    tl.then(() => setState(el, 'final'));
    return tl.play();
  },
};
