// chapter: a dark band opens each chapter. The index numeral rises out of a hairline and the title follows.
// Markup: section.blk.chapter[data-fx=chapter][data-index] > p.chapter-index + h2.chapter-title (narrated).
// A decorative rule is inserted at prime time; the stage light is a pseudo-element driven by --ch-light.

import { Timeline, instant, setState, stop } from '../fx/timeline.js';
import { ease } from '../fx/motion.js';
import { sting } from '../fx/sound.js';

function enhance(el) {
  if (el.querySelector('.chapter-rule')) return;
  const rule = document.createElement('span');
  rule.className = 'chapter-rule';
  rule.setAttribute('aria-hidden', 'true');
  const title = el.querySelector('.chapter-title');
  el.insertBefore(rule, title || null);
}

export default {
  prime(el) { stop(el, 'cancel'); enhance(el); setState(el, 'initial'); },
  settle(el) { stop(el, 'cancel'); enhance(el); setState(el, 'final'); },
  reset(el) { stop(el, 'cancel'); enhance(el); setState(el, 'initial'); },
  play(el, o) {
    stop(el, 'finish');
    enhance(el);
    if (o.reduced) return instant(() => setState(el, 'final'));
    setState(el, 'playing');
    const D = 1400 * o.k.time;
    const a = o.k.amp;
    const at = (p) => p * D;
    const index = el.querySelector('.chapter-index');
    const rule = el.querySelector('.chapter-rule');
    const title = el.querySelector('.chapter-title');
    const tl = new Timeline(el);
    tl.to(el, [{ '--ch-light': 0 }, { '--ch-light': 1 }], { at: 0, dur: at(0.75), ease: ease.out });
    tl.to(rule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { at: at(0.04), dur: at(0.46), ease: ease.inOut });
    tl.to(index, [
      { opacity: 0, transform: 'translateY(' + (0.36 * a).toFixed(3) + 'em)', clipPath: 'inset(100% -10% -12% -10%)' },
      { opacity: 1, transform: 'translateY(0em)', clipPath: 'inset(-12% -10% -12% -10%)' },
    ], { at: at(0.22), dur: at(0.5), ease: ease.out });
    tl.to(title, [
      { opacity: 0, transform: 'translateY(' + (16 * a).toFixed(1) + 'px)', clipPath: 'inset(100% -4% -20% -4%)' },
      { opacity: 1, transform: 'translateY(0px)', clipPath: 'inset(-20% -4% -20% -4%)' },
    ], { at: at(0.5), dur: at(0.5), ease: ease.out });
    if (o.sound) tl.cue(() => sting('chapter', { amp: a }), at(0.02));
    tl.hold(D);
    tl.then(() => setState(el, 'final'));
    return tl.play();
  },
};
