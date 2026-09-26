// checkpoint: the mid-lesson break. A progress ring fills to data-progress, the number counts up,
// a little confetti and a soft chime mark the moment. The narrated sentence is never hidden.
// Markup: section.blk.checkpoint[data-fx=checkpoint][data-progress] > div.checkpoint-ring + p.checkpoint-text.

import { Timeline, instant, setState, stop } from '../fx/timeline.js';
import { ease, token } from '../fx/motion.js';
import { sting } from '../fx/sound.js';
import { emit, palette } from '../fx/particles.js';

const R = 27;

// Mix two #rrggbb colours (t = share of b). Falls back to CSS color-mix for other formats.
function mix(a, b, t) {
  const hex = (c) => (/^#([0-9a-f]{6})$/i.exec(c) || [])[1];
  const ha = hex(a);
  const hb = hex(b);
  if (!ha || !hb) return 'color-mix(in srgb, ' + b + ' ' + Math.round(t * 100) + '%, ' + a + ')';
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  const out = [0, 2, 4].map((i) => Math.round(ch(ha, i) * (1 - t) + ch(hb, i) * t));
  return 'rgb(' + out.join(', ') + ')';
}

function progress(el) {
  const p = parseFloat(el.dataset.progress);
  return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0.5;
}

function enhance(el) {
  const holder = el.querySelector('.checkpoint-ring');
  if (!holder) return null;
  const pct = Math.round(progress(el) * 100);
  if (!holder.querySelector('svg')) {
    holder.innerHTML =
      '<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">' +
      '<circle class="cp-track" cx="32" cy="32" r="' + R + '"/>' +
      '<circle class="cp-arc" cx="32" cy="32" r="' + R + '" pathLength="100"/>' +
      '</svg><span class="cp-num"><span class="cp-value">' + pct + '</span><small>%</small></span>';
  }
  const arc = holder.querySelector('.cp-arc');
  arc.style.strokeDasharray = pct + ' 100';
  return { holder, arc, value: holder.querySelector('.cp-value'), pct };
}

function paint(el, done) {
  const r = enhance(el);
  if (!r) return;
  r.value.textContent = String(done ? r.pct : 0);
  r.arc.style.strokeDashoffset = done ? '0' : String(r.pct);
}

export default {
  prime(el) { stop(el, 'cancel'); paint(el, false); setState(el, 'initial'); },
  settle(el) { stop(el, 'cancel'); paint(el, true); setState(el, 'final'); },
  reset(el) { stop(el, 'cancel'); paint(el, false); setState(el, 'initial'); },
  play(el, o) {
    stop(el, 'finish');
    const r = enhance(el);
    if (!r) return instant(() => setState(el, 'final'));
    if (o.reduced) return instant(() => { paint(el, true); setState(el, 'final'); });
    paint(el, true);
    setState(el, 'playing');
    const D = 1600 * o.k.time;
    const at = (p) => p * D;
    const tl = new Timeline(el);
    const fillAt = at(0.08);
    const fillDur = at(0.58);
    // Strong (story lessons): a bigger pulse, a brief mint wash over the card when the ring closes, and larger
    // confetti. Soft and normal keep the v0.1 sizes.
    const loud = o.intensity === 'strong';
    tl.to(r.arc, [{ strokeDashoffset: r.pct }, { strokeDashoffset: 0 }], { at: fillAt, dur: fillDur, ease: ease.inOut });
    tl.to(r.holder, [
      { transform: 'scale(1)' },
      { transform: 'scale(' + (1 + (loud ? 0.16 : 0.1) * o.k.amp).toFixed(3) + ')', offset: 0.4 },
      { transform: 'scale(1)' },
    ], { at: fillAt + fillDur - at(0.04), dur: at(0.3), ease: ease.out });
    if (loud) {
      const paper = token('--paper-2');
      const mint = token('--mint');
      const rule = token('--rule');
      const wash = mix(paper, mint, 0.16);
      tl.to(el, [
        { backgroundColor: paper, boxShadow: 'inset 0 0 0 1px ' + rule, easing: ease.out },
        { backgroundColor: wash, boxShadow: 'inset 0 0 0 2px ' + mint, offset: 0.18, easing: 'linear' },
        { backgroundColor: wash, boxShadow: 'inset 0 0 0 2px ' + mint, offset: 0.4, easing: ease.inOut },
        { backgroundColor: paper, boxShadow: 'inset 0 0 0 1px ' + rule },
      ], { at: fillAt + fillDur - at(0.06), dur: D - (fillAt + fillDur - at(0.06)) });
    }
    // Count the number up in step with the ring.
    let raf = 0;
    const start = { t: 0 };
    tl.set(() => { r.value.textContent = '0'; }, 0);
    tl.cue(() => {
      start.t = performance.now();
      const tick = (now) => {
        const x = Math.min(1, (now - start.t) / fillDur);
        const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        r.value.textContent = String(Math.round(r.pct * e));
        if (x < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, fillAt);
    let spray = null;
    tl.cue(() => {
      const b = r.holder.getBoundingClientRect();
      spray = emit({
        x: b.left + b.width / 2, y: b.top + b.height / 2, kind: 'confetti', count: Math.round((loud ? 22 : 16) * o.k.count),
        colors: palette(['--mint', '--marker', '--accent', '--gold']), angle: -Math.PI / 2, spread: Math.PI * 1.2,
        speed: [220 * o.k.amp, 460 * o.k.amp], life: [0.4 * D, 0.52 * D], size: loud ? [5, 9.5] : [4, 7], radius: b.width * 0.36,
      });
    }, fillAt + fillDur - at(0.02));
    if (o.sound) tl.cue(() => sting('checkpoint', { amp: o.k.amp }), fillAt + fillDur - at(0.06));
    tl.hold(D);
    tl.then(() => {
      cancelAnimationFrame(raf);
      r.value.textContent = String(r.pct);
      spray?.clear();
      setState(el, 'final');
    });
    return tl.play();
  },
};
