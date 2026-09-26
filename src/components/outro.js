// outro: the closing band. Title, then the recap items one by one (each with a drawn check), then the
// next-lesson card. A gentle chord closes the lesson when sound is on. The narrated line stays visible.
// Markup: section.blk.outro[data-fx=outro] > p.outro-kicker, h2.outro-title, ol.recap > li, p.outro-say, .outro-next.

import { Timeline, instant, setState, stop } from '../fx/timeline.js';
import { ease } from '../fx/motion.js';
import { sting } from '../fx/sound.js';

export default {
  prime(el) { stop(el, 'cancel'); setState(el, 'initial'); },
  settle(el) { stop(el, 'cancel'); setState(el, 'final'); },
  reset(el) { stop(el, 'cancel'); setState(el, 'initial'); },
  play(el, o) {
    stop(el, 'finish');
    if (o.reduced) return instant(() => setState(el, 'final'));
    setState(el, 'playing');
    const D = 1800 * o.k.time;
    const a = o.k.amp;
    const at = (p) => p * D;
    const tl = new Timeline(el);
    const head = [el.querySelector('.outro-kicker'), el.querySelector('.outro-title')].filter(Boolean);
    const items = Array.from(el.querySelectorAll('.recap > li'));
    const next = el.querySelector('.outro-next');
    const rise = (px) => [{ opacity: 0, transform: 'translateY(' + (px * a).toFixed(1) + 'px)' }, { opacity: 1, transform: 'translateY(0px)' }];

    tl.to(el, [{ '--ol-light': 0 }, { '--ol-light': 1 }], { at: 0, dur: at(0.7), ease: ease.out });
    tl.to(head, rise(18), { at: 0, dur: at(0.3), stagger: at(0.06), ease: ease.out });
    const span = at(0.42);
    const each = items.length ? Math.min(at(0.26), span) : 0;
    const gap = items.length > 1 ? (span - each * 0.4) / items.length : 0;
    items.forEach((li, i) => {
      const t0 = at(0.2) + i * gap;
      tl.to(li, rise(12), { at: t0, dur: each, ease: ease.out });
      tl.to(li, [{ '--chk': 0 }, { '--chk': 0, offset: 0.3 }, { '--chk': 1 }], { at: t0, dur: each * 1.1, ease: ease.out });
    });
    if (next) tl.to(next, rise(22), { at: at(0.7), dur: at(0.3), ease: ease.out });
    if (o.sound) tl.cue(() => sting('outro', { amp: a }), at(0.04));
    tl.hold(D);
    tl.then(() => setState(el, 'final'));
    return tl.play();
  },
};
