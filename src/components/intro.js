// intro: the full-screen title sequence that opens a lesson (and the course page hero).
// Three looks share one markup (SPEC section 7):
//   cinema     dark stage, a quiet two-hit sting, a flash of light, the emblem arriving from depth, big type rising
//   editorial  paper, ruled lines drawing in, a large outlined lesson number, a framed plate, calm
//   playful    flat shapes pop in and assemble the motif, the title springs in letter by letter
// The look comes from data-style on the section (cinema when absent); opts.style overrides it and is written
// back, so the static end state matches what played. Every sequence ends in the static title card defined in
// components.css, which is also the lesson header.
//
// For the compiler (readers without JavaScript): motifSVG(motif, style) returns the finished emblem as a string.
// To show it without JS, emit: <div class="intro-stage" aria-hidden="true"><div class="intro-plate">
// <div class="intro-plate-in">SVG</div></div></div>. prime() rebuilds the stage either way.

import { Timeline, instant, setState, stop } from '../fx/timeline.js';
import { ease, spring } from '../fx/motion.js';
import { sting } from '../fx/sound.js';
import { emit, palette } from '../fx/particles.js';
import { motifSVG, motifStory, MOTIF_NAMES } from './intro/motifs.js';
import './intro/stings.js';

export { motifSVG, MOTIF_NAMES };

const LOOKS = ['cinema', 'editorial', 'playful'];
const RULES = 4;
const BITS = 6;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lookOf(el, o) {
  if (o && LOOKS.includes(o.style)) return o.style;
  return LOOKS.includes(el.dataset.style) ? el.dataset.style : 'cinema';
}

function motifOf(el) {
  return MOTIF_NAMES.includes(el.dataset.motif) ? el.dataset.motif : 'generic';
}

function stageMarkup(motif) {
  let rules = '';
  for (let i = 1; i <= RULES; i++) rules += '<i class="r' + i + '"></i>';
  let bits = '';
  for (let i = 1; i <= BITS; i++) bits += '<i class="b' + i + '"></i>';
  return '<div class="intro-light"></div>' +
    '<div class="intro-rules">' + rules + '</div>' +
    '<div class="intro-bits">' + bits + '</div>' +
    '<div class="intro-plate"><div class="intro-plate-in">' + motifSVG(motif) + '</div></div>' +
    '<div class="intro-flare"></div>' +
    '<div class="intro-beam"></div>';
}

// Wrap the title's letters so they can move; the heading keeps its text for assistive technology.
function wrapTitle(el) {
  const h = el.querySelector('.intro-title');
  if (!h || h.querySelector('.intro-title-in')) return;
  const text = h.textContent.trim().replace(/\s+/g, ' ');
  h.setAttribute('aria-label', text);
  const words = text.split(' ').map((w) => '<span class="w">' + Array.from(w).map((c) => '<span class="ch">' + esc(c) + '</span>').join('') + '</span>');
  h.innerHTML = '<span class="intro-title-in" aria-hidden="true">' + words.join(' ') + '</span>';
}

function setup(el, o) {
  const look = lookOf(el, o);
  const motif = motifOf(el);
  el.dataset.style = look;
  const stage = el.querySelector('.intro-stage');
  if (stage && stage.dataset.built !== motif) {
    stage.innerHTML = stageMarkup(motif);
    stage.dataset.built = motif;
  }
  wrapTitle(el);
  return { look, motif };
}

function parts(el) {
  const $ = (s) => el.querySelector(s);
  return {
    stage: $('.intro-stage'),
    light: $('.intro-light'),
    rules: Array.from(el.querySelectorAll('.intro-rules i')),
    bits: Array.from(el.querySelectorAll('.intro-bits i')),
    plate: $('.intro-plate-in'),
    svg: $('.intro-plate svg'),
    flare: $('.intro-flare'),
    beam: $('.intro-beam'),
    course: $('.intro-course'),
    number: $('.intro-number'),
    title: $('.intro-title'),
    titleIn: $('.intro-title-in'),
    chars: Array.from(el.querySelectorAll('.intro-title .ch')),
    subtitle: $('.intro-subtitle'),
  };
}

const rise = (px) => [{ opacity: 0, transform: 'translateY(' + px + 'px)' }, { opacity: 1, transform: 'translateY(0px)' }];

// The title rises out of its own baseline: the heading clips below itself while the inner line moves up.
function titleRise(tl, p, at, dur, scale = 1.04) {
  if (!p.title || !p.titleIn) return;
  tl.to(p.title, [{ clipPath: 'inset(-60% -12% 0% -12%)' }, { clipPath: 'inset(-60% -12% 0% -12%)' }], { at: 0, dur: at + dur });
  tl.to(p.titleIn, [
    { transform: 'translateY(112%) scale(' + scale + ')' },
    { transform: 'translateY(0%) scale(1)' },
  ], { at, dur, ease: ease.out });
}

const LOOK = {
  cinema(tl, p, o, motif) {
    const T = o.k.time;
    const a = o.k.amp;
    const at = (ms) => ms * T;
    tl.to(p.stage, [{ transform: 'scale(' + (1 + 0.07 * a).toFixed(3) + ')' }, { transform: 'scale(1)' }], { at: 0, dur: at(4800), ease: ease.out });
    tl.to(p.flare, [
      { opacity: 0, transform: 'scaleX(0.06)' },
      { opacity: 1, transform: 'scaleX(1)', offset: 0.28 },
      { opacity: 0, transform: 'scaleX(1.35)' },
    ], { at: at(150), dur: at(820), ease: ease.out });
    // The second hit lands: the light blooms past its resting size, then settles.
    tl.to(p.light, [
      { opacity: 0, transform: 'scale(0.4)' },
      { opacity: 1, transform: 'scale(' + (1 + 0.12 * a).toFixed(3) + ')', offset: 0.28 },
      { opacity: 1, transform: 'scale(1)' },
    ], { at: at(560), dur: at(2000), ease: ease.out });
    tl.to(p.plate, [
      { opacity: 0, transform: 'scale(' + (1 + 0.2 * a).toFixed(3) + ')', filter: 'blur(12px)' },
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
    ], { at: at(560), dur: at(1400), ease: ease.out });
    if (p.svg) motifStory(p.svg, motif, tl, at(620), { T, amp: a, ease: ease.out });
    tl.to([p.course, p.number], rise(14), { at: at(1900), dur: at(700), stagger: at(90), ease: ease.out });
    titleRise(tl, p, at(2100), at(1050));
    tl.to(p.subtitle, rise(12), { at: at(2750), dur: at(800), ease: ease.out });
    tl.to(p.beam, [
      { opacity: 0, transform: 'translateX(-40%) skewX(-16deg)' },
      { opacity: 1, offset: 0.22 },
      { opacity: 1, offset: 0.7 },
      { opacity: 0, transform: 'translateX(360%) skewX(-16deg)' },
    ], { at: at(3000), dur: at(1500), ease: ease.inOut });
    if (o.sound) tl.cue(() => sting('intro-cinema', { amp: a }), at(150));
    tl.hold(at(4800));
  },

  editorial(tl, p, o, motif) {
    const T = o.k.time;
    const a = o.k.amp;
    const at = (ms) => ms * T;
    p.rules.forEach((r, i) => {
      const vertical = r.classList.contains('r3');
      const from = vertical ? 'scaleY(0)' : 'scaleX(0)';
      const to = vertical ? 'scaleY(1)' : 'scaleX(1)';
      tl.to(r, [{ transform: from }, { transform: to }], { at: at(100 + i * 170), dur: at(950), ease: ease.inOut });
    });
    tl.to(p.number, [
      { opacity: 0, clipPath: 'inset(-10% 100% -10% 0%)', transform: 'translateX(' + (-24 * a).toFixed(1) + 'px)' },
      { opacity: 1, clipPath: 'inset(-10% -10% -10% 0%)', transform: 'translateX(0px)' },
    ], { at: at(480), dur: at(1400), ease: ease.out });
    tl.to(p.plate, [
      { opacity: 0, transform: 'translateY(' + (22 * a).toFixed(1) + 'px)', clipPath: 'inset(0% 0% 100% 0%)' },
      { opacity: 1, transform: 'translateY(0px)', clipPath: 'inset(-40% -40% -40% -40%)' },
    ], { at: at(760), dur: at(1000), ease: ease.out });
    if (p.svg) motifStory(p.svg, motif, tl, at(1100), { T, amp: a * 0.85, ease: ease.out });
    tl.to(p.course, rise(8), { at: at(1350), dur: at(800), ease: ease.out });
    titleRise(tl, p, at(1750), at(1100), 1);
    tl.to(p.subtitle, rise(10), { at: at(2350), dur: at(900), ease: ease.out });
    if (o.sound) tl.cue(() => sting('intro-editorial', { amp: a }), at(260));
    tl.hold(at(4800));
  },

  playful(tl, p, o, motif) {
    const T = o.k.time;
    const a = o.k.amp;
    const at = (ms) => ms * T;
    const bouncy = spring(0.42);
    p.bits.forEach((b, i) => {
      tl.to(b, [{ opacity: 0, transform: 'scale(0) rotate(-60deg)' }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }], { at: at(60 + i * 95), dur: at(820), ease: bouncy });
    });
    tl.to(p.plate, [
      { opacity: 0, transform: 'scale(0.4) rotate(-10deg)' },
      { opacity: 1, offset: 0.3 },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' },
    ], { at: at(220), dur: at(980), ease: bouncy });
    if (p.svg) motifStory(p.svg, motif, tl, at(420), { T, amp: a, ease: spring(0.36) });
    tl.to(p.number, [{ opacity: 0, transform: 'scale(0.3) rotate(-24deg)' }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }], { at: at(1150), dur: at(760), ease: bouncy });
    tl.to(p.course, [{ opacity: 0, transform: 'translateX(-18px)' }, { opacity: 1, transform: 'translateX(0px)' }], { at: at(1260), dur: at(640), ease: ease.out });
    const n = Math.max(1, p.chars.length);
    tl.to(p.chars, [
      { opacity: 0, transform: 'translateY(0.55em) scale(0.35) rotate(-8deg)' },
      { opacity: 1, transform: 'translateY(0em) scale(1) rotate(0deg)' },
    ], { at: at(1360), dur: at(820), stagger: at(Math.min(95, 520 / n)), ease: bouncy });
    tl.to(p.subtitle, rise(12), { at: at(2250), dur: at(760), ease: ease.out });
    tl.cue(() => {
      if (!p.plate) return;
      const b = p.plate.getBoundingClientRect();
      if (b.width < 1) return;
      emit({
        x: b.left + b.width * 0.5, y: b.top + b.height * 0.42, kind: 'confetti', count: Math.round(18 * o.k.count),
        colors: palette(['--coral', '--marker', '--mint', '--accent']), angle: -Math.PI / 2, spread: Math.PI * 1.1,
        speed: [260 * a, 560 * a], life: [700 * T, 1000 * T], size: [5, 9],
      });
    }, at(1500));
    if (o.sound) tl.cue(() => sting('intro-playful', { amp: a }), at(200));
    tl.hold(at(4800));
  },
};

export default {
  prime(el) { stop(el, 'cancel'); setup(el); setState(el, 'initial'); },
  // settle/reset also accept { style } so a look can be switched without playing it.
  settle(el, o) { stop(el, 'cancel'); setup(el, o); setState(el, 'final'); },
  reset(el, o) { stop(el, 'cancel'); setup(el, o); setState(el, 'initial'); },
  play(el, o) {
    stop(el, 'finish');
    const { look, motif } = setup(el, o);
    if (o.reduced) return instant(() => setState(el, 'final'));
    setState(el, 'playing');
    const tl = new Timeline(el);
    LOOK[look](tl, parts(el), o, motif);
    tl.then(() => setState(el, 'final'));
    return tl.play();
  },
};

/**
 * Draw a small motif (tag | branch | loop | list | generic) into el, for the course page lesson cards.
 * Static by default; hovering the card replays the motif once (not with reduced motion).
 */
export function drawMotif(el, motif) {
  if (!el) return;
  const name = MOTIF_NAMES.includes(motif) ? motif : (MOTIF_NAMES.includes(el.dataset.motif) ? el.dataset.motif : 'generic');
  el.innerHTML = motifSVG(name, 'mini');
  el.classList.add('has-motif');
  if (el.dataset.motifReady) return;
  el.dataset.motifReady = '1';
  const card = el.closest('a, .toc-card') || el;
  card.addEventListener('pointerenter', () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const svg = el.querySelector('svg');
    if (!svg) return;
    const tl = new Timeline(el);
    motifStory(svg, el.dataset.motif && MOTIF_NAMES.includes(el.dataset.motif) ? el.dataset.motif : name, tl, 0, { T: 0.75, amp: 0.8, ease: ease.out });
    tl.play();
  });
}
