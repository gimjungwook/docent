// flip: a definition card turns once in 3D (front: the term, back: its meaning).
// Markup: div.blk.turn[data-fx=flip] > .turn-card > .turn-front + .turn-back. Final (no-JS) state shows the back.
// With JavaScript the reader can also turn the card by clicking it or pressing Enter/Space.

import { Timeline, instant, setState, stop } from '../fx/timeline.js';
import { ease } from '../fx/motion.js';

const ready = new WeakSet();

function enhance(el) {
  if (ready.has(el)) return;
  ready.add(el);
  const card = el.querySelector('.turn-card');
  const front = el.querySelector('.turn-front');
  const back = el.querySelector('.turn-back');
  if (!card || !front || !back) return;
  if (!back.dataset.term) back.dataset.term = front.textContent.trim();
  if (!el.querySelector('.turn-floor')) {
    const floor = document.createElement('span');
    floor.className = 'turn-floor';
    floor.setAttribute('aria-hidden', 'true');
    el.appendChild(floor);
  }
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  const sync = () => {
    const showingBack = el.dataset.fxState !== 'initial';
    card.setAttribute('aria-label', showingBack ? '카드 뒤집기: 앞면 보기' : '카드 뒤집기: 뜻 보기');
  };
  sync();
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['data-fx-state'] });
  const toggle = () => {
    const toBack = el.dataset.fxState === 'initial';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    turn(el, toBack, { reduced, k: { time: 0.7, amp: 0.8 } });
  };
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
}

function turn(el, toBack, o) {
  stop(el, 'finish');
  const end = toBack ? 'final' : 'initial';
  if (o.reduced) return instant(() => setState(el, end));
  const card = el.querySelector('.turn-card');
  const floor = el.querySelector('.turn-floor');
  const D = 1000 * o.k.time;
  const a = o.k.amp;
  const from = toBack ? 0 : 180;
  const to = toBack ? 180 : 360;
  const tl = new Timeline(el);
  setState(el, toBack ? 'playing' : 'initial');
  const r = (deg) => 'rotateY(' + deg + 'deg)';
  tl.to(card, [
    { transform: r(from) + ' translateZ(0px) scale(1)', easing: ease.inOut },
    { transform: r(from + 92) + ' translateZ(0px) scale(' + (1 + 0.05 * a).toFixed(3) + ')', offset: 0.46, easing: ease.out },
    { transform: r(to + 7 * a) + ' translateZ(0px) scale(1.01)', offset: 0.78, easing: ease.inOut },
    { transform: r(to) + ' translateZ(0px) scale(1)' },
  ], { dur: D });
  if (floor) {
    tl.to(floor, [
      { transform: 'scaleX(1)', opacity: 1 },
      { transform: 'scaleX(0.35)', opacity: 0.55, offset: 0.46 },
      { transform: 'scaleX(1.04)', opacity: 1, offset: 0.8 },
      { transform: 'scaleX(1)', opacity: 1 },
    ], { dur: D, ease: ease.inOut });
  }
  tl.then(() => setState(el, end));
  return tl.play();
}

export default {
  prime(el) {
    stop(el, 'cancel');
    enhance(el);
    setState(el, 'initial');
  },
  settle(el) {
    stop(el, 'cancel');
    enhance(el);
    setState(el, 'final');
  },
  reset(el) {
    stop(el, 'cancel');
    enhance(el);
    setState(el, 'initial');
  },
  play(el, o) {
    enhance(el);
    return turn(el, true, o);
  },
};
