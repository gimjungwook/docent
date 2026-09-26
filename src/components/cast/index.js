// Docent cast: character avatars for story lessons (SPEC §12, §13; root's avatar layout of 2026-09-27).
//
//   import { effects, renderActor, renderMenu, primeCast } from '../components/cast/index.js';
//   renderActor('minji', 'happy', 'sc1-r3-minji')   // pure string, Node-safe (the compiler uses it)
//   renderMenu('sc1-menu', { 아메리카노: '4500', 라떼: '5000', 케이크: '6500' })
//   effects.react.run(el, { intensity, reduced, sound, params: { expr: 'surprised' } })  // -> { duration, done, finish }
//
// effects = { react, emote, act, menuprice }; each has run, prime, settle, reset. Nothing here touches the DOM at
// import time. Durations are the registry value x intensity (soft 0.7, normal 1, strong 1.2); reduced motion = 0 ms.

import { EFFECTS, EXPRESSIONS, EMOTES, ACTIONS, CAST_BY_NAME } from '../effects/registry.js';
import { Timeline, instant, stop } from '../../fx/timeline.js';
import { spring, prefersReducedMotion } from '../../fx/motion.js';
import { CHARS, LOOK, EXPR_IDS, EMOTE_IDS, HANDS, actorSVG, faceInner, limbPose, handShape, headTilt, emoteBadge, rot } from './art.js';
import { enliven, primeCast, sfx } from './live.js';

export { primeCast } from './live.js';
export const CAST_IDS = Object.keys(CHARS);
export { EXPR_IDS, EMOTE_IDS };
export const ACTION_IDS = ['enter', 'exit', 'jump', 'nod', 'shakehead', 'point', 'clap', 'highfive'];

// ---------------------------------------------------------------- static renderers (pure)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function castIdOf(v) {
  if (CHARS[v]) return v;
  return CAST_BY_NAME[v] && CHARS[CAST_BY_NAME[v]] ? CAST_BY_NAME[v] : null;
}

export function normExpr(v) {
  if (v == null || v === '') return 'neutral';
  v = String(v).trim();
  if (LOOK[v]) return v;
  if (EXPRESSIONS[v]) return EXPRESSIONS[v];
  return 'neutral';
}

const EMOTE_ALIAS = { bulb: 'idea', lightbulb: 'idea', note: 'music', notes: 'music', drop: 'sweat', vein: 'anger', star: 'sparkle', '!?': 'exclaim' };
export function normEmote(v) {
  v = String(v == null ? '' : v).trim();
  if (EMOTE_IDS.includes(v)) return v;
  if (EMOTES[v]) return EMOTES[v];
  return EMOTE_ALIAS[v] || 'exclaim';
}

export function normAction(v) {
  v = String(v == null ? '' : v).trim();
  if (ACTION_IDS.includes(v)) return v;
  if (ACTIONS[v]) return ACTIONS[v];
  if (v === 'shake' || v === 'headshake') return 'shakehead';
  if (v === 'high-five' || v === 'high5') return 'highfive';
  return 'nod';
}

/**
 * One avatar: <div class="actor" id data-actor data-expr data-expr0><div class="actor-body"><svg…></div></div>.
 * castId: minji | doyun | owner | pai (or 민지 | 도윤 | 사장님 | 파이). expr: an EXPRESSIONS value or its Korean label.
 * opts.enter: start hidden until an "enter" act. opts.side: "l" (faces right, default) or "r".
 */
export function renderActor(castId, expr = 'neutral', id = '', opts = {}) {
  const c = castIdOf(castId);
  if (!c) return '';
  const e = normExpr(expr);
  const side = opts.side === 'r' ? 'r' : 'l';
  return '<div class="actor" ' + (id ? 'id="' + esc(id) + '" ' : '') + 'data-actor="' + c + '" data-expr="' + e + '" data-expr0="' + e + '"' +
    (side === 'r' ? ' data-side="r"' : '') + (opts.enter ? ' data-enter="1"' : '') + '>' +
    '<div class="actor-body">' + actorSVG(c, e, side) + '</div></div>';
}

export const DEFAULT_MENU = { 아메리카노: '4500', 라떼: '5000', 케이크: '6500' };

const digits = (v) => {
  const n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};
export const formatPrice = (n) => String(digits(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The menu card for a scene. Each price span carries data-item (the item name) and data-price0 (its first price). */
export function renderMenu(id, menu) {
  const items = menu && typeof menu === 'object' && Object.keys(menu).length ? menu : DEFAULT_MENU;
  const rows = Object.entries(items).map(([name, price]) => {
    const p = digits(price);
    return '<li class="menu-item"><span class="menu-name">' + esc(name) + '</span>' +
      '<span class="menu-cost"><span class="menu-price" data-item="' + esc(name) + '" data-price0="' + p + '" data-price="' + p + '">' + formatPrice(p) + '</span></span></li>';
  }).join('');
  return '<div class="menu-card" ' + (id ? 'id="' + esc(id) + '" ' : '') + 'data-menu role="group" aria-label="메뉴판">' +
    '<p class="menu-title">메뉴</p><ul class="menu-list">' + rows + '</ul></div>';
}

// ---------------------------------------------------------------- runtime helpers

const FACTOR = { soft: 0.7, normal: 1, strong: 1.2 };
const AMP = { soft: 0.7, normal: 1, strong: 1.3 };

function norm(opts = {}) {
  const intensity = FACTOR[opts.intensity] ? opts.intensity : 'normal';
  const reduced = typeof opts.reduced === 'boolean' ? opts.reduced : prefersReducedMotion();
  return { ...opts, intensity, reduced, sound: opts.sound === true, params: opts.params || {}, k: FACTOR[intensity], amp: AMP[intensity] };
}

function durOf(name, o) {
  return o.reduced ? 0 : Math.round(EFFECTS[name].dur * o.k);
}

function byId(el) {
  if (typeof el === 'string') return typeof document !== 'undefined' ? document.getElementById(el) : null;
  return el || null;
}

function asActor(el) {
  el = byId(el);
  if (!el || !el.matches) return null;
  if (el.matches('.actor')) return el;
  return el.querySelector('.actor') || el.closest('.actor');
}

const q = (root, sel) => root.querySelector(sel);
const sideOf = (actor) => (actor.dataset.side === 'r' ? 'r' : 'l');

function angleOf(el) {
  if (!el) return 0;
  const m = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(el.style.transform || '');
  return m ? parseFloat(m[1]) : 0;
}

// Cue ledger: applied cues per channel, so resets can arrive in any order.
let SEQ = 0;
function cueKey(o, name) {
  if (o.key != null) return String(o.key);
  if (o.cue && o.cue.id != null) return String(o.cue.id);
  if (o.id != null) return String(o.id);
  return name + ':' + JSON.stringify(o.params || {});
}
function ledger(el, ch) {
  const st = el.__castLedger || (el.__castLedger = {});
  return st[ch] || (st[ch] = new Map());
}
function applyCue(el, ch, key, value) { ledger(el, ch).set(key, { value, seq: ++SEQ }); }
function current(el, ch, fallback) {
  let best = null;
  for (const v of ledger(el, ch).values()) if (!best || v.seq > best.seq) best = v;
  return best ? best.value : fallback;
}
function clearLedger(el, ch) {
  if (!el.__castLedger) return;
  if (ch) delete el.__castLedger[ch]; else el.__castLedger = {};
}

function limbEls(actor) {
  const out = {};
  for (const s of ['l', 'r']) {
    const arm = q(actor, '.a-arm-' + s);
    if (!arm) continue;
    out[s] = { u: q(arm, '.j-u'), f: q(arm, '.j-f'), hand: q(arm, '.a-hand') };
  }
  return out;
}

function readLimbs(actor) {
  const els = limbEls(actor);
  const out = {};
  for (const s in els) out[s] = { u: angleOf(els[s].u), f: angleOf(els[s].f), hand: els[s].hand ? els[s].hand.dataset.hand : '' };
  return out;
}

function writeAngles(actor, pose) {
  const els = limbEls(actor);
  for (const s in pose) {
    if (!els[s]) continue;
    els[s].u.style.transform = rot(pose[s].u);
    els[s].f.style.transform = rot(pose[s].f);
  }
}

function writeHands(actor, pose) {
  const c = CHARS[actor.dataset.actor];
  if (!c || !c.arm) return;
  const els = limbEls(actor);
  for (const s in pose) {
    const h = els[s] && els[s].hand;
    if (!h || !pose[s].hand || h.dataset.hand === pose[s].hand) continue;
    h.dataset.hand = pose[s].hand;
    h.innerHTML = handShape(pose[s].hand, c.arm.hr, Number(h.dataset.s) || (s === 'l' ? -1 : 1));
  }
}

function poseFor(actor, poseName) {
  return limbPose(actor.dataset.actor, poseName, sideOf(actor));
}

/** Put an actor into an expression instantly (face, head tilt, arms). */
function setExpr(actor, expr) {
  const id = actor.dataset.actor;
  if (!CHARS[id]) return;
  actor.dataset.expr = expr;
  const face = q(actor, '.a-face');
  if (face) face.innerHTML = faceInner(id, expr);
  const head = q(actor, '.a-head');
  if (head) head.style.transform = rot(headTilt(expr, sideOf(actor)));
  const pose = poseFor(actor, (LOOK[expr] || LOOK.neutral).pose);
  writeAngles(actor, pose);
  writeHands(actor, pose);
}

// Tracks that move every limb joint through a list of poses at the given offsets (0..1 of dur).
function limbTracks(tl, actor, poses, offsets, { at = 0, dur, ease = 'linear' }) {
  const els = limbEls(actor);
  for (const s in els) {
    for (const part of ['u', 'f']) {
      const el = els[s][part];
      if (!el || !poses.every((p) => p[s])) continue;
      const vals = poses.map((p) => p[s][part]);
      if (vals.every((v) => Math.abs(v - vals[0]) < 0.5)) continue;
      tl.to(el, vals.map((v, i) => ({ transform: rot(v), offset: offsets[i] })), { at, dur, ease });
    }
  }
}

function clearEmotes(actor) {
  actor.querySelectorAll('.cast-emote').forEach((n) => n.remove());
}

function clearMarks(actor) {
  actor.querySelectorAll('.cast-mark').forEach((n) => n.remove());
}

function addMark(actor, html) {
  const rig = q(actor, '.a-rig');
  if (!rig) return null;
  rig.insertAdjacentHTML('beforeend', html);
  return rig.lastElementChild;
}

function stopGesture(actor) {
  if (actor.__castGesture) stop(actor.__castGesture, 'finish');
}

// ---------------------------------------------------------------- react: change expression

const TAKE = {
  surprised: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(0px, -9px)', offset: 0.24 }, { transform: 'translate(0px, 1.5px)', offset: 0.5 }, { transform: 'translate(0px, 0px)' }],
  excited: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(0px, -8px)', offset: 0.2 }, { transform: 'translate(0px, 0px)', offset: 0.4 }, { transform: 'translate(0px, -5px)', offset: 0.6 }, { transform: 'translate(0px, 0px)', offset: 0.8 }, { transform: 'translate(0px, 0px)' }],
  happy: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(0px, -5px)', offset: 0.3 }, { transform: 'translate(0px, 0px)', offset: 0.62 }, { transform: 'translate(0px, 0px)' }],
  proud: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(0px, -4px)', offset: 0.34 }, { transform: 'translate(0px, 0px)' }],
  sad: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(0px, 5px)', offset: 0.4 }, { transform: 'translate(0px, 2px)', offset: 0.72 }, { transform: 'translate(0px, 0px)' }],
  flustered: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(-2.5px, 0px)', offset: 0.16 }, { transform: 'translate(2.5px, 0px)', offset: 0.32 }, { transform: 'translate(-2px, 0px)', offset: 0.48 }, { transform: 'translate(2px, 0px)', offset: 0.64 }, { transform: 'translate(0px, 0px)', offset: 0.8 }, { transform: 'translate(0px, 0px)' }],
  annoyed: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(0px, 3px)', offset: 0.3 }, { transform: 'translate(0px, 0px)', offset: 0.6 }, { transform: 'translate(0px, 0px)' }],
};

function scaleKF(k, amp) {
  const a = (v) => 1 + (v - 1) * amp;
  return k.map(([sx, sy, off]) => (off == null ? { transform: 'scale(' + a(sx) + ', ' + a(sy) + ')' } : { transform: 'scale(' + a(sx) + ', ' + a(sy) + ')', offset: off }));
}

const react = {
  run(el, opts) {
    const o = norm(opts);
    const actor = asActor(el);
    if (!actor || !CHARS[actor.dataset.actor]) return instant();
    enliven(actor);
    const expr = normExpr(o.params.expr != null ? o.params.expr : o.params.face);
    applyCue(actor, 'expr', cueKey(o, 'react'), expr);
    stopGesture(actor);
    if (o.reduced) return instant(() => setExpr(actor, expr));

    const D = durOf('react', o);
    const id = actor.dataset.actor;
    const s = sideOf(actor);
    const head = q(actor, '.a-head');
    const take = q(actor, '.a-head-react');
    const rig = q(actor, '.a-rig');
    const face = q(actor, '.a-face');
    const fromTilt = angleOf(head);
    const toTilt = headTilt(expr, s);
    const from = readLimbs(actor);
    const to = poseFor(actor, (LOOK[expr] || LOOK.neutral).pose);

    const tl = new Timeline(take);
    tl.set(() => {
      actor.dataset.expr = expr;
      head.style.transform = rot(toTilt);
      writeAngles(actor, to);
    }, 0);
    tl.set(() => { if (face) face.innerHTML = faceInner(id, expr); writeHands(actor, to); }, D * 0.3);
    tl.to(take, scaleKF([[1, 1, 0], [1.08, 0.88, 0.22], [0.95, 1.08, 0.46], [1.015, 0.985, 0.72], [1, 1]], o.amp), { dur: D, ease: 'ease-in-out' });
    if (Math.abs(fromTilt - toTilt) > 0.2) tl.to(head, [{ transform: rot(fromTilt) }, { transform: rot(toTilt) }], { at: D * 0.12, dur: D * 0.72, ease: spring(0.35) });
    limbTracks(tl, actor, [from, to], [0, 1], { at: D * 0.08, dur: D * 0.8, ease: spring(0.28) });
    const kf = TAKE[expr];
    if (kf && rig) tl.to(rig, kf, { dur: D, ease: 'ease-in-out' });
    if (expr === 'surprised') tl.cue(() => sfx('boing', o), 0);
    tl.hold(D);
    return tl.play();
  },
  prime(el) {
    const actor = asActor(el);
    if (!actor) return;
    enliven(actor);
  },
  settle(el, opts) {
    const actor = asActor(el);
    if (!actor) return;
    enliven(actor);
    const o = norm(opts);
    stop(q(actor, '.a-head-react'), 'finish');
    if (opts && opts.params && (opts.params.expr != null || opts.params.face != null)) {
      const expr = normExpr(o.params.expr != null ? o.params.expr : o.params.face);
      applyCue(actor, 'expr', cueKey(o, 'react'), expr);
      setExpr(actor, expr);
    }
  },
  // Back to the avatar's starting expression (data-expr0). The player resets once per target and then
  // settles every cue it has passed, in order.
  reset(el) {
    const actor = asActor(el);
    if (!actor) return;
    enliven(actor);
    stop(q(actor, '.a-head-react'), 'cancel');
    clearLedger(actor, 'expr');
    setExpr(actor, actor.dataset.expr0 || 'neutral');
  },
};

// ---------------------------------------------------------------- emote: a small bubble with an icon

const EMOTE_MOTION = {
  heart: [{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.14 }, { transform: 'scale(1)', offset: 0.3 }, { transform: 'scale(1.16)', offset: 0.46 }, { transform: 'scale(1)', offset: 0.62 }, { transform: 'scale(1)' }],
  exclaim: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-12deg)', offset: 0.12 }, { transform: 'rotate(10deg)', offset: 0.26 }, { transform: 'rotate(-7deg)', offset: 0.4 }, { transform: 'rotate(4deg)', offset: 0.54 }, { transform: 'rotate(0deg)', offset: 0.68 }, { transform: 'rotate(0deg)' }],
  question: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-14deg)', offset: 0.2 }, { transform: 'rotate(10deg)', offset: 0.44 }, { transform: 'rotate(-5deg)', offset: 0.66 }, { transform: 'rotate(0deg)' }],
  sweat: [{ transform: 'translate(0px, -6px)' }, { transform: 'translate(0px, 7px)', offset: 0.8 }, { transform: 'translate(0px, 7px)' }],
  sparkle: [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(18deg) scale(1.15)', offset: 0.3 }, { transform: 'rotate(-8deg) scale(0.95)', offset: 0.6 }, { transform: 'rotate(0deg) scale(1)' }],
  idea: [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.18 }, { transform: 'scale(1)', offset: 0.36 }, { transform: 'scale(1)' }],
  music: [{ transform: 'translate(0px, 2px) rotate(-8deg)' }, { transform: 'translate(0px, -3px) rotate(8deg)', offset: 0.33 }, { transform: 'translate(0px, 1px) rotate(-6deg)', offset: 0.66 }, { transform: 'translate(0px, -2px) rotate(4deg)' }],
  anger: [{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.15 }, { transform: 'scale(0.94)', offset: 0.3 }, { transform: 'scale(1.22)', offset: 0.45 }, { transform: 'scale(0.96)', offset: 0.6 }, { transform: 'scale(1.1)', offset: 0.75 }, { transform: 'scale(1)' }],
};
const EMOTE_SOUND = { heart: 'sparkle', sparkle: 'sparkle', idea: 'chime', exclaim: 'pop', question: 'pop', sweat: 'pop', music: 'chime', anger: 'thud' };

const emote = {
  run(el, opts) {
    const o = norm(opts);
    const actor = asActor(el);
    if (!actor) return instant();
    enliven(actor);
    if (o.reduced) return instant();
    const kind = normEmote(o.params.emote != null ? o.params.emote : o.params.mark);
    const D = durOf('emote', o);
    clearEmotes(actor);
    actor.insertAdjacentHTML('beforeend', emoteBadge(kind));
    const badge = actor.lastElementChild;
    const art = q(badge, '.em-art');
    const tl = new Timeline(badge);
    const a = o.amp;
    tl.to(badge, [
      { transform: 'translate(-10%, 22%) scale(0.2) rotate(-20deg)', opacity: 0 },
      { transform: 'translate(0%, 0%) scale(' + (1 + 0.18 * a) + ') rotate(' + (6 * a) + 'deg)', opacity: 1, offset: 0.14 },
      { transform: 'translate(0%, 0%) scale(0.94) rotate(-2deg)', opacity: 1, offset: 0.24 },
      { transform: 'translate(0%, 0%) scale(1) rotate(0deg)', opacity: 1, offset: 0.32 },
      { transform: 'translate(0%, 0%) scale(1) rotate(0deg)', opacity: 1, offset: 0.8 },
      { transform: 'translate(0%, -18%) scale(0.72) rotate(0deg)', opacity: 0 },
    ], { dur: D, ease: 'linear' });
    if (art && EMOTE_MOTION[kind]) tl.to(art, EMOTE_MOTION[kind], { at: D * 0.3, dur: D * 0.5, ease: 'ease-in-out' });
    const rays = q(badge, '.em-rays');
    if (rays) tl.to(rays, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0.35, offset: 0.55 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }], { at: D * 0.22, dur: D * 0.5 });
    tl.cue(() => sfx(EMOTE_SOUND[kind] || 'pop', o), D * 0.04);
    tl.then(() => badge.remove());
    tl.hold(D);
    return tl.play();
  },
  prime(el) { const a = asActor(el); if (a) { enliven(a); clearEmotes(a); } },
  settle(el) { const a = asActor(el); if (a) clearEmotes(a); },
  reset(el) { const a = asActor(el); if (a) clearEmotes(a); },
};

// ---------------------------------------------------------------- act: actions

// Marks drawn over the avatar: each line has a paper halo so it reads on dark clothes too.
const mark = (cls, d) => '<g class="cast-mark ' + cls + '"><g class="mk-halo">' + d + '</g><g class="mk-line">' + d + '</g></g>';
const SPARK_D = '<path d="M-11 -12L-19 -23"/><path d="M0 -15V-28"/><path d="M11 -12L19 -23"/><path d="M-16 -2H-28"/><path d="M16 -2H28"/>';
const BURST_D = '<path d="M0 -16V-28"/><path d="M13 -10L22 -18"/><path d="M16 3L28 4"/><path d="M-13 -10L-22 -18"/><path d="M-16 3L-28 4"/>';
const SPARK = mark('cast-spark', SPARK_D);
const STARBURST = mark('cast-burst', BURST_D);
const PUFF = mark('cast-puff', '<path d="M-30 -4L-42 -10"/><path d="M-32 10L-45 12"/><path d="M30 -4L42 -10"/><path d="M32 10L45 12"/>');

function setAway(actor, away) {
  if (away) actor.dataset.away = '1'; else delete actor.dataset.away;
}
function setOut(actor, out) {
  if (out) actor.dataset.out = '1'; else delete actor.dataset.out;
}

// Visible state from enter/exit cues: 'away' (hidden before enter), 'out' (faded after exit) or 'in'.
function applyPresence(actor, state) {
  setAway(actor, state === 'away');
  setOut(actor, state === 'out');
}
function initialPresence(actor) {
  return actor.dataset.enter === '1' || actor.__castEnter ? 'away' : 'in';
}

function handAt(actor, poseName) {
  const h = HANDS[poseName];
  if (!h) return [0, 0];
  const t = h.r;
  return sideOf(actor) === 'r' ? [-t[0], t[1]] : [t[0], t[1]];
}

const act = {
  run(el, opts) {
    const o = norm(opts);
    const actor = asActor(el);
    if (!actor || !CHARS[actor.dataset.actor]) return instant();
    enliven(actor);
    const action = normAction(o.params.action != null ? o.params.action : o.params.act);
    const key = cueKey(o, 'act');
    if (action === 'enter') applyCue(actor, 'presence', key, 'in');
    if (action === 'exit') applyCue(actor, 'presence', key, 'out');
    if (o.reduced) {
      return instant(() => {
        if (action === 'enter') applyPresence(actor, 'in');
        if (action === 'exit') applyPresence(actor, 'out');
      });
    }
    const D = durOf('act', o);
    const a = o.amp;
    const body = q(actor, '.actor-body');
    const headAct = q(actor, '.a-head-act');
    const face = q(actor, '.a-face');
    const isPai = actor.dataset.actor === 'pai';
    const expr = actor.dataset.expr || 'neutral';
    const cur = readLimbs(actor);
    const restPose = poseFor(actor, (LOOK[expr] || LOOK.neutral).pose);
    const P = (name) => poseFor(actor, name);
    const owner = action === 'nod' || action === 'shakehead' ? headAct : body;
    stopGesture(actor);
    stop(q(actor, '.a-head-react'), 'finish');
    const tl = new Timeline(owner);
    actor.__castGesture = owner;
    tl.then(() => { if (actor.__castGesture === owner) actor.__castGesture = null; clearMarks(actor); });

    switch (action) {
      case 'enter': {
        tl.set(() => applyPresence(actor, 'in'), 0);
        tl.to(body, [
          { transform: 'translate(0%, 34%) scale(0.12)', opacity: 0 },
          { transform: 'translate(0%, -12%) scale(' + (1 + 0.16 * a) + ')', opacity: 1, offset: 0.42 },
          { transform: 'translate(0%, 3%) scale(0.94)', opacity: 1, offset: 0.62 },
          { transform: 'translate(0%, -1%) scale(1.03)', opacity: 1, offset: 0.8 },
          { transform: 'translate(0%, 0%) scale(1)', opacity: 1 },
        ], { dur: D, ease: 'ease-out' });
        const puff = addMark(actor, PUFF);
        if (puff) tl.to(puff, [{ opacity: 0, transform: 'translate(0px, 96px) scale(0.6)' }, { opacity: 1, transform: 'translate(0px, 96px) scale(1.05)', offset: 0.45 }, { opacity: 0, transform: 'translate(0px, 96px) scale(1.4)' }], { at: D * 0.24, dur: D * 0.5, ease: 'ease-out' });
        tl.cue(() => sfx('pop', o), D * 0.1);
        break;
      }
      case 'exit': {
        const w = P('wave');
        const wv = (deg) => {
          const p = JSON.parse(JSON.stringify(w));
          if (p.r) p.r.f += sideOf(actor) === 'r' ? -deg : deg;
          return p;
        };
        limbTracks(tl, actor, [cur, w, wv(-26), wv(22), wv(-24), wv(18), cur, cur], [0, 0.14, 0.24, 0.34, 0.44, 0.54, 0.66, 1], { dur: D });
        if (!isPai) {
          tl.set(() => writeHands(actor, w), D * 0.06);
          tl.set(() => writeHands(actor, restPose), D);
        }
        tl.set(() => applyPresence(actor, 'out'), 0);
        tl.to(body, [
          { transform: 'translate(0%, 0%) scale(1)', opacity: 1, filter: 'grayscale(0)' },
          { transform: 'translate(0%, 0%) scale(1)', opacity: 1, filter: 'grayscale(0)', offset: 0.58 },
          { transform: 'translate(0%, 6%) scale(0.94)', opacity: 0.32, filter: 'grayscale(0.5)' },
        ], { dur: D, ease: 'ease-in-out' });
        tl.cue(() => sfx('whoosh', o), D * 0.58);
        break;
      }
      case 'jump': {
        tl.to(body, [
          { transform: 'translate(0%, 0%) scale(1, 1)' },
          { transform: 'translate(0%, 0%) scale(' + (1 + 0.08 * a) + ', ' + (1 - 0.13 * a) + ')', offset: 0.12 },
          { transform: 'translate(0%, ' + (-36 * a) + '%) scale(0.95, 1.08)', offset: 0.4 },
          { transform: 'translate(0%, 0%) scale(' + (1 + 0.1 * a) + ', ' + (1 - 0.14 * a) + ')', offset: 0.66 },
          { transform: 'translate(0%, 0%) scale(0.97, 1.03)', offset: 0.82 },
          { transform: 'translate(0%, 0%) scale(1, 1)' },
        ], { dur: D, ease: 'ease-in-out' });
        tl.cue(() => sfx('boing', o), D * 0.1);
        break;
      }
      case 'nod': {
        const y = 4.5 * a;
        tl.to(headAct, [
          { transform: 'translate(0px, 0px) scale(1, 1)' },
          { transform: 'translate(0px, ' + y + 'px) scale(1, 0.94)', offset: 0.18 },
          { transform: 'translate(0px, -1px) scale(1, 1)', offset: 0.38 },
          { transform: 'translate(0px, ' + y + 'px) scale(1, 0.95)', offset: 0.58 },
          { transform: 'translate(0px, 0px) scale(1, 1)', offset: 0.8 },
          { transform: 'translate(0px, 0px) scale(1, 1)' },
        ], { dur: D, ease: 'ease-in-out' });
        if (face) tl.to(face, [
          { transform: 'translate(0px, 0px)' }, { transform: 'translate(0px, ' + (y + 1.5) + 'px)', offset: 0.18 },
          { transform: 'translate(0px, -0.5px)', offset: 0.38 }, { transform: 'translate(0px, ' + (y + 1) + 'px)', offset: 0.58 },
          { transform: 'translate(0px, 0px)', offset: 0.8 }, { transform: 'translate(0px, 0px)' },
        ], { dur: D, ease: 'ease-in-out' });
        break;
      }
      case 'shakehead': {
        const r = 8 * a, x = 4 * a;
        tl.to(headAct, [
          { transform: 'rotate(0deg)' }, { transform: 'rotate(' + (-r) + 'deg)', offset: 0.14 }, { transform: 'rotate(' + r + 'deg)', offset: 0.32 },
          { transform: 'rotate(' + (-r * 0.8) + 'deg)', offset: 0.5 }, { transform: 'rotate(' + (r * 0.6) + 'deg)', offset: 0.66 }, { transform: 'rotate(' + (-r * 0.25) + 'deg)', offset: 0.82 }, { transform: 'rotate(0deg)' },
        ], { dur: D, ease: 'ease-in-out' });
        if (face) tl.to(face, [
          { transform: 'translate(0px, 0px)' }, { transform: 'translate(' + (-x) + 'px, 0px)', offset: 0.14 }, { transform: 'translate(' + x + 'px, 0px)', offset: 0.32 },
          { transform: 'translate(' + (-x * 0.8) + 'px, 0px)', offset: 0.5 }, { transform: 'translate(' + (x * 0.6) + 'px, 0px)', offset: 0.66 }, { transform: 'translate(' + (-x * 0.25) + 'px, 0px)', offset: 0.82 }, { transform: 'translate(0px, 0px)' },
        ], { dur: D, ease: 'ease-in-out' });
        break;
      }
      case 'point': {
        const p = P('point');
        const jab = JSON.parse(JSON.stringify(p));
        if (jab.r) jab.r.u += (sideOf(actor) === 'r' ? 5 : -5) * a;
        limbTracks(tl, actor, [cur, p, jab, p, p, cur], [0, 0.22, 0.36, 0.5, 0.76, 1], { dur: D, ease: 'ease-in-out' });
        if (!isPai) {
          tl.set(() => writeHands(actor, p), D * 0.1);
          tl.set(() => writeHands(actor, restPose), D);
        }
        tl.cue(() => sfx('whoosh', o), D * 0.1);
        break;
      }
      case 'clap': {
        const A = P('clapA'), B = P('clapB');
        limbTracks(tl, actor, [cur, A, B, A, B, A, B, cur], [0, 0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 1], { dur: D, ease: 'ease-in-out' });
        if (!isPai) {
          tl.set(() => writeHands(actor, A), D * 0.08);
          tl.set(() => writeHands(actor, restPose), D);
        }
        const spark = addMark(actor, SPARK);
        if (spark) {
          const [hx, hy] = isPai ? [50 * (sideOf(actor) === 'r' ? -1 : 1), 104] : [0, 136];
          const T = (s, op, offset) => { const k = { transform: 'translate(' + hx + 'px, ' + hy + 'px) scale(' + s + ')', opacity: op }; if (offset != null) k.offset = offset; return k; };
          tl.to(spark, [T(0.7, 0), T(0.7, 0, 0.27), T(1.05, 1, 0.3), T(1.25, 0, 0.42), T(0.7, 0, 0.5), T(1.05, 1, 0.54), T(1.25, 0, 0.66), T(0.7, 0, 0.74), T(1.1, 1, 0.78), T(1.35, 0, 0.92), T(1.35, 0)], { dur: D });
        }
        const rigEl = q(actor, '.a-rig');
        if (rigEl) {
          const Y = (y, offset) => { const k = { transform: 'translate(0px, ' + y + 'px)' }; if (offset != null) k.offset = offset; return k; };
          tl.to(rigEl, [Y(0), Y(0, 0.22), Y(-3 * a, 0.28), Y(0, 0.36), Y(-3 * a, 0.52), Y(0, 0.6), Y(-3.5 * a, 0.76), Y(0, 0.86), Y(0)], { dur: D, ease: 'ease-in-out' });
        }
        [0.28, 0.52, 0.76].forEach((t) => tl.cue(() => sfx('pop', o), D * t));
        break;
      }
      case 'highfive': {
        const h = P('high');
        limbTracks(tl, actor, [cur, h, h, cur], [0, 0.3, 0.7, 1], { dur: D, ease: 'ease-in-out' });
        if (!isPai) {
          tl.set(() => writeHands(actor, h), D * 0.1);
          tl.set(() => writeHands(actor, restPose), D);
        }
        const burst = addMark(actor, STARBURST);
        if (burst) {
          const [hx, hy] = isPai ? [60 * (sideOf(actor) === 'r' ? -1 : 1), 92] : handAt(actor, 'high');
          const T = (s, op) => ({ transform: 'translate(' + hx + 'px, ' + (hy - 6) + 'px) scale(' + s + ')', opacity: op });
          tl.to(burst, [T(0.4, 0), Object.assign(T(0.4, 0), { offset: 0.3 }), Object.assign(T(1.15, 1), { offset: 0.42 }), Object.assign(T(1.25, 1), { offset: 0.6 }), T(1.5, 0)], { dur: D, ease: 'ease-out' });
        }
        tl.to(body, [
          { transform: 'translate(0%, 0%)' }, { transform: 'translate(0%, ' + (-10 * a) + '%)', offset: 0.32 }, { transform: 'translate(0%, 0%)', offset: 0.55 }, { transform: 'translate(0%, 0%)' },
        ], { dur: D, ease: 'ease-in-out' });
        tl.cue(() => sfx('pop', o), D * 0.34);
        tl.cue(() => sfx('sparkle', o), D * 0.4);
        break;
      }
      default:
        break;
    }
    tl.hold(D);
    return tl.play();
  },
  prime(el, opts) {
    const actor = asActor(el);
    if (!actor) return;
    enliven(actor);
    const action = opts && opts.params ? normAction(opts.params.action != null ? opts.params.action : opts.params.act) : null;
    if (action === 'enter') actor.__castEnter = true;
    applyPresence(actor, current(actor, 'presence', initialPresence(actor)));
  },
  settle(el, opts) {
    const actor = asActor(el);
    if (!actor) return;
    enliven(actor);
    if (actor.__castGesture) stop(actor.__castGesture, 'finish');
    if (!opts || !opts.params) return;
    const action = normAction(opts.params.action != null ? opts.params.action : opts.params.act);
    if (action === 'enter' || action === 'exit') {
      applyCue(actor, 'presence', cueKey(norm(opts), 'act'), action === 'enter' ? 'in' : 'out');
      applyPresence(actor, action === 'enter' ? 'in' : 'out');
    }
  },
  reset(el, opts) {
    const actor = asActor(el);
    if (!actor) return;
    enliven(actor);
    if (actor.__castGesture) stop(actor.__castGesture, 'cancel');
    clearMarks(actor);
    // Back to the start: hidden if this avatar enters later (data-enter, or the first act cue is enter).
    const action = opts && opts.params ? normAction(opts.params.action != null ? opts.params.action : opts.params.act) : null;
    if (action === 'enter') actor.__castEnter = true;
    clearLedger(actor, 'presence');
    applyPresence(actor, initialPresence(actor));
  },
};

// ---------------------------------------------------------------- menuprice: the old price is struck, the new one lands

function asMenu(el) {
  el = byId(el);
  if (!el || !el.matches) return null;
  if (el.matches('.menu-card, [data-menu]')) return el;
  return el.querySelector('.menu-card, [data-menu]') || el.closest('.menu-card, [data-menu]');
}

function priceEl(menu, item) {
  const name = String(item == null ? '' : item).trim();
  let hit = null;
  menu.querySelectorAll('.menu-price[data-item]').forEach((p) => { if (!hit && p.dataset.item === name) hit = p; });
  if (hit) return hit;
  const ALIAS = { americano: '아메리카노', latte: '라떼', cake: '케이크' };
  const alt = ALIAS[name.toLowerCase()];
  if (alt) menu.querySelectorAll('.menu-price[data-item]').forEach((p) => { if (!hit && p.dataset.item === alt) hit = p; });
  return hit;
}

function cost(p) { return p.closest('.menu-cost') || p.parentNode; }

/** Show a price. prev (number) adds the struck old price beside it; null removes it. */
function showPrice(p, price, prev) {
  p.dataset.price = String(price);
  p.textContent = formatPrice(price);
  const box = cost(p);
  const old = box.querySelector('.menu-old');
  const changed = prev != null && prev !== price;
  if (changed) {
    const html = '<s class="menu-old"><span class="sr-only">이전 가격 </span>' + formatPrice(prev) + '</s>';
    if (old) old.outerHTML = html; else box.insertAdjacentHTML('beforeend', html);
  } else if (old) old.remove();
  box.classList.toggle('is-changed', changed);
  p.classList.toggle('is-changed', changed);
}

function menuItems(menu) {
  return Array.from(menu.querySelectorAll('.menu-price[data-item]'));
}

function menuState(menu, p) {
  // Current price and the one before it, from the ledger of applied cues for this item.
  const ch = 'price:' + p.dataset.item;
  const list = Array.from(ledger(menu, ch).values()).sort((x, y) => x.seq - y.seq);
  const p0 = digits(p.dataset.price0);
  if (!list.length) return { price: p0, prev: null };
  return { price: list[list.length - 1].value, prev: list.length > 1 ? list[list.length - 2].value : p0 };
}

function resetMenu(menu) {
  clearLedger(menu);
  menuItems(menu).forEach((p) => {
    stop(p, 'cancel');
    cost(p).querySelectorAll('.menu-was, .menu-delta').forEach((n) => n.remove());
    showPrice(p, digits(p.dataset.price0), null);
  });
}

const menuprice = {
  run(el, opts) {
    const o = norm(opts);
    const menu = asMenu(el);
    if (!menu) return instant();
    const p = priceEl(menu, o.params.item);
    if (!p) return instant();
    const price = digits(o.params.price);
    const before = digits(p.dataset.price != null ? p.dataset.price : p.dataset.price0);
    applyCue(menu, 'price:' + p.dataset.item, cueKey(o, 'menuprice'), price);
    stop(p, 'finish');
    if (o.reduced) return instant(() => showPrice(p, price, before === price ? menuState(menu, p).prev : before));
    const D = durOf('menuprice', o);
    if (price === before) {
      // Same price again: a short nudge so the moment is still seen, and the duration stays the registry value.
      const same = new Timeline(p);
      same.to(p, [
        { transform: 'scale(1)' }, { transform: 'scale(' + (1 + 0.12 * o.amp) + ')', offset: 0.22 }, { transform: 'scale(0.97)', offset: 0.42 },
        { transform: 'scale(1.03)', offset: 0.6 }, { transform: 'scale(1)', offset: 0.78 }, { transform: 'scale(1)' },
      ], { dur: D, ease: 'ease-in-out' });
      same.cue(() => sfx('tick', o), D * 0.1);
      same.hold(D);
      return same.play();
    }
    const box = cost(p);
    const a = o.amp;
    // Final state first (new price, old price struck beside it); every step below runs on the animation clock.
    showPrice(p, price, before);
    const old = box.querySelector('.menu-old');
    const was = document.createElement('span');
    was.className = 'menu-was';
    was.setAttribute('aria-hidden', 'true');
    was.textContent = formatPrice(before);
    const strike = document.createElement('span');
    strike.className = 'menu-strike';
    was.appendChild(strike);
    box.appendChild(was);
    const delta = document.createElement('span');
    delta.className = 'menu-delta' + (price < before ? ' is-down' : '');
    delta.setAttribute('aria-hidden', 'true');
    delta.textContent = (price > before ? '+' : '\u2212') + formatPrice(Math.abs(price - before));
    p.appendChild(delta);

    const tl = new Timeline(p);
    tl.then(() => { was.remove(); delta.remove(); });
    // The old number pulses, gets struck through, then gives way.
    tl.to(was, [
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
      { transform: 'translate(0px, 0px) scale(' + (1 + 0.1 * a) + ')', opacity: 1, offset: 0.1 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0.2 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0.34 },
      { transform: 'translate(-4px, 3px) scale(0.9)', opacity: 0, offset: 0.4 },
      { transform: 'translate(-4px, 3px) scale(0.9)', opacity: 0 },
    ], { dur: D, ease: 'ease-in-out' });
    tl.to(strike, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { at: D * 0.1, dur: D * 0.22, ease: 'ease-out' });
    // The new number drops in with a small bounce, then the highlighter sweeps under it.
    tl.to(p, [
      { transform: 'translate(0px, -55%) scale(' + (1 + 0.24 * a) + ')', opacity: 0 },
      { transform: 'translate(0px, -55%) scale(' + (1 + 0.24 * a) + ')', opacity: 0, offset: 0.4 },
      { transform: 'translate(0px, 8%) scale(0.94)', opacity: 1, offset: 0.56 },
      { transform: 'translate(0px, -3%) scale(1.06)', opacity: 1, offset: 0.68 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0.8 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    ], { dur: D, ease: 'ease-in-out' });
    tl.to(p, [{ '--menu-mark': 0 }, { '--menu-mark': 0, offset: 0.52 }, { '--menu-mark': 1, offset: 0.74 }, { '--menu-mark': 1 }], { dur: D, ease: 'ease-out' });
    if (old) tl.to(old, [
      { transform: 'translate(-8px, 0px)', opacity: 0 },
      { transform: 'translate(-8px, 0px)', opacity: 0, offset: 0.44 },
      { transform: 'translate(0px, 0px)', opacity: 1, offset: 0.64 },
      { transform: 'translate(0px, 0px)', opacity: 1 },
    ], { dur: D, ease: 'ease-out' });
    tl.to(delta, [
      { transform: 'translate(0px, 4px) scale(0.5)', opacity: 0 },
      { transform: 'translate(0px, -2px) scale(1.08)', opacity: 1, offset: 0.22 },
      { transform: 'translate(0px, -4px) scale(1)', opacity: 1, offset: 0.72 },
      { transform: 'translate(0px, -10px) scale(0.96)', opacity: 0 },
    ], { at: D * 0.44, dur: D * 0.56, ease: 'ease-out' });
    tl.cue(() => sfx('tick', o), D * 0.1);
    tl.cue(() => sfx('pop', o), D * 0.44);
    tl.cue(() => sfx('stamp', o), D * 0.56);
    tl.hold(D);
    return tl.play();
  },
  prime(el) {
    const menu = asMenu(el);
    if (menu) resetMenu(menu);
  },
  settle(el, opts) {
    const menu = asMenu(el);
    if (!menu) return;
    menuItems(menu).forEach((p) => stop(p, 'finish'));
    if (!opts || !opts.params || opts.params.item == null) return;
    const p = priceEl(menu, opts.params.item);
    if (!p) return;
    applyCue(menu, 'price:' + p.dataset.item, cueKey(norm(opts), 'menuprice'), digits(opts.params.price));
    const st = menuState(menu, p);
    showPrice(p, st.price, st.prev);
  },
  // Every item back to its first price (data-price0).
  reset(el) {
    const menu = asMenu(el);
    if (menu) resetMenu(menu);
  },
};

export const effects = { react, emote, act, menuprice };
