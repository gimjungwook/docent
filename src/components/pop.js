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
    // Strong (the story lessons' default) is sized and timed to be unmistakable: a bigger jump, and the word
    // stays coral for most of the effect before the highlighter sweeps in. Soft and normal keep the v0.1 timing.
    const loud = o.intensity === 'strong';
    const lift = (loud ? 4.5 : 3) * a;
    const grow = (loud ? 0.24 : 0.2) * a;
    const tl = new Timeline(el);
    tl.to(el, [
      { transform: 'translateY(0px) scale(1)', easing: ease.out },
      { transform: 'translateY(' + (-lift).toFixed(2) + 'px) scale(' + (1 + grow).toFixed(3) + ')', offset: 0.22, easing: ease.inOut },
      { transform: 'translateY(0px) scale(' + (1 - 0.04 * a).toFixed(3) + ')', offset: 0.46, easing: ease.inOut },
      { transform: 'translateY(0px) scale(' + (1 + 0.014 * a).toFixed(3) + ')', offset: 0.66, easing: ease.inOut },
      { transform: 'translateY(0px) scale(1)' },
    ], { dur: D * 0.9 });
    if (loud) {
      tl.to(el, [
        { fontWeight: 400, '--pop-heat': 0, easing: ease.out },
        { fontWeight: 820, '--pop-heat': 1, offset: 0.14, easing: 'linear' },
        { fontWeight: 780, '--pop-heat': 1, offset: 0.6, easing: ease.inOut },
        { fontWeight: 700, '--pop-heat': 0 },
      ], { dur: D });
      tl.to(el, [{ '--pop-mark': 0, easing: 'linear' }, { '--pop-mark': 0, offset: 0.5, easing: ease.out }, { '--pop-mark': 1 }], { dur: D });
    } else {
      tl.to(el, [
        { fontWeight: 400, '--pop-heat': 0 },
        { fontWeight: 820, '--pop-heat': 1, offset: 0.2 },
        { fontWeight: 760, '--pop-heat': 1, offset: 0.5 },
        { fontWeight: 700, '--pop-heat': 0 },
      ], { dur: D, ease: ease.out });
      tl.to(el, [{ '--pop-mark': 0 }, { '--pop-mark': 0, offset: 0.4 }, { '--pop-mark': 1 }], { dur: D, ease: ease.out });
    }
    tl.then(() => setState(el, 'final'));
    return tl.play();
  },
};
