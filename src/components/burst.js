// burst: one spray of sparks and paper confetti from an anchor (a narrated word marked data-fx="burst").
// Draws on the shared fixed canvas in src/fx/particles.js, which removes itself afterwards.
// The anchor text flashes coral briefly (through --pop-heat); its layout never changes.

import { Timeline, instant, stop } from '../fx/timeline.js';
import { ease } from '../fx/motion.js';
import { emit, palette } from '../fx/particles.js';

export default {
  prime() {},
  settle(el) { stop(el, 'finish'); },
  reset(el) { stop(el, 'cancel'); },
  play(el, o) {
    stop(el, 'finish');
    if (o.reduced) return instant();
    const D = 1100 * o.k.time;
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height * 0.45;
    const n = o.k.count;
    const a = o.k.amp;
    // Strong: the anchor word stays coral through the first half, and sparks, confetti and ring are bigger.
    // Soft and normal keep the v0.1 sizes and timing.
    const loud = o.intensity === 'strong';
    const big = loud ? 1.35 : 1;
    const tl = new Timeline(el);
    const sprays = [];
    if (loud) {
      tl.to(el, [
        { '--pop-heat': 0, easing: ease.out },
        { '--pop-heat': 1, offset: 0.08, easing: 'linear' },
        { '--pop-heat': 1, offset: 0.5, easing: ease.inOut },
        { '--pop-heat': 0 },
      ], { dur: D * 0.85 });
    } else {
      tl.to(el, [{ '--pop-heat': 0 }, { '--pop-heat': 1, offset: 0.12 }, { '--pop-heat': 1, offset: 0.4 }, { '--pop-heat': 0 }], { dur: D * 0.8, ease: ease.out });
    }
    tl.cue(() => {
      sprays.push(emit({ x, y, kind: 'ring', colors: palette(['--coral']), ring: { from: 6, to: (30 + 22 * a) * big, width: 2 * big, life: 420 * o.k.time } }));
      sprays.push(emit({
        x, y, kind: 'spark', count: Math.round(14 * n), colors: palette(['--coral', '--marker', '--gold']),
        spread: Math.PI * 2, speed: [320 * a, 640 * a], life: [300 * o.k.time, 520 * o.k.time], radius: 6, thick: big,
      }));
    }, 0);
    tl.cue(() => {
      sprays.push(emit({
        x, y: y - 4, kind: 'confetti', count: Math.round(22 * n), colors: palette(['--coral', '--marker', '--accent', '--mint', '--gold']),
        angle: -Math.PI / 2, spread: Math.PI * 0.9, speed: [360 * a, 700 * a], life: [0.72 * D, 0.96 * D], size: [5 * big, 9 * big],
      }));
    }, 40);
    tl.hold(D);
    tl.then(() => sprays.forEach((s) => s.clear()));
    return tl.play();
  },
};
