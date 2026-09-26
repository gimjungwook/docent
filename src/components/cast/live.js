// Docent cast, runtime side: makes an avatar live (talking mouth synced to words, blinking, sounds).
// Browser only; imported lazily by index.js functions, never touching the DOM at import time.

import { actorSVG, CHARS } from './art.js';

let io = null;
let sfxMod = null;
let sfxLoading = null;

/** Start loading src/fx/sound.js (motion agent). Missing module or missing playSfx = silent. */
export function loadSfx() {
  if (!sfxLoading && typeof window !== 'undefined') {
    sfxLoading = import('../../fx/sound.js').then((m) => { sfxMod = m; }).catch(() => { sfxMod = null; });
  }
  return sfxLoading;
}

/** Play a short synthesized sound if the sound module offers playSfx. */
export function sfx(name, o) {
  if (!o || !o.sound) return;
  if (sfxMod && typeof sfxMod.playSfx === 'function') {
    try { sfxMod.playSfx(name, { intensity: o.intensity }); } catch (err) { /* sound is optional */ }
  } else {
    loadSfx();
  }
}

function observer() {
  if (io || typeof IntersectionObserver === 'undefined') return io;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle('is-offscreen', !e.isIntersecting);
  }, { rootMargin: '120px 0px' });
  return io;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One mouth burst per spoken word: open, half-close, open, close. The length follows the word rhythm.
function onWord(e) {
  const actor = e.currentTarget;
  const st = actor.__cast;
  if (!st) return;
  actor.classList.add('is-word-sync');
  const now = performance.now();
  const gap = st.lastWord ? now - st.lastWord : 360;
  st.lastWord = now;
  const talk = actor.querySelector('.a-talk');
  if (!talk || typeof talk.animate !== 'function') return;
  if (st.wordAnim) { try { st.wordAnim.cancel(); } catch (err) { /* gone */ } }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const dur = clamp(gap * 0.9, 220, 560);
  st.wordAnim = talk.animate([
    { transform: 'scaleY(0.18)' },
    { transform: 'scaleY(1)', offset: 0.22 },
    { transform: 'scaleY(0.42)', offset: 0.48 },
    { transform: 'scaleY(0.9)', offset: 0.7 },
    { transform: 'scaleY(0.18)' },
  ], { duration: dur, easing: 'ease-in-out' });
}

/** Rebuild an empty placeholder actor from its data attributes. */
function fill(actor) {
  const id = actor.dataset.actor;
  if (!CHARS[id]) return;
  const expr = actor.dataset.expr || actor.dataset.expr0 || 'neutral';
  actor.innerHTML = '<div class="actor-body">' + actorSVG(id, expr, actor.dataset.side || 'l') + '</div>';
}

/** Make an actor live. Idempotent. Records its starting expression (data-expr0). */
export function enliven(actor) {
  if (!actor || actor.__cast) return actor;
  if (!actor.dataset.expr0) actor.dataset.expr0 = actor.dataset.expr || 'neutral';
  if (!actor.querySelector('svg.cast-art')) fill(actor);
  actor.__cast = { ledger: {}, lastWord: 0, wordAnim: null };
  actor.classList.add('is-live');
  actor.style.setProperty('--blink-delay', (-Math.random() * 6).toFixed(2) + 's');
  actor.addEventListener('docent:word', onWord);
  const o = observer();
  if (o) o.observe(actor);
  loadSfx();
  return actor;
}

/** Make every actor under root live, and draw pai into empty mascot asides. */
export function primeCast(root) {
  if (typeof document === 'undefined') return;
  root = typeof root === 'string' ? document.getElementById(root) : (root || document);
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.mascot-art').forEach((art) => {
    if (!art.querySelector('.actor')) {
      const aside = art.closest('.mascot');
      const id = (aside && aside.id ? aside.id : 'mascot') + '-pai';
      art.innerHTML = '<div class="actor" id="' + id + '" data-actor="pai" data-expr="happy" data-expr0="happy"></div>';
    }
  });
  const list = Array.from(root.querySelectorAll('.actor'));
  if (root.matches && root.matches('.actor')) list.unshift(root);
  list.forEach(enliven);
}

