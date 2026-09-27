// The player: narration audio drives highlight, camera, characters and effect cues.
import { buildTimeline, indexAt, fmtTime } from "./timeline.js";
import { Dock } from "./dock.js";
import { BIG } from "./fxhub.js";
import { cueKey } from "./reader.js";

const LEAD = 0.45;               // seconds the camera starts moving before a sentence
// Effects that need their block framed before they play (the camera moves first).
const BLOCK_FX = new Set(["intro", "chapter", "run", "step", "flip", "checkpoint", "outro", "typecode", "terminal", "flyvalue", "diff", "errorfx"]);
const SPEEDS = [1, 1.25, 1.5];

export class Player {
  // fx: the effect hub (engine/fxhub.js). free(cue): the cue may play next to another effect (story pages).
  constructor({ lesson, timings, base, fx, camera, reader, nav, settings, free = () => false }) {
    this.lesson = lesson; this.fx = fx; this.camera = camera; this.reader = reader; this.nav = nav; this.settings = settings;
    this.free = free;
    this.state = "idle";
    this.available = !!timings;
    this.tl = timings ? buildTimeline(lesson, timings) : { segs: [], cues: [], chapters: [], duration: 0 };
    this.cuesByTarget = new Map();
    for (const c of this.tl.cues) {
      if (!this.cuesByTarget.has(c.target)) this.cuesByTarget.set(c.target, []);
      this.cuesByTarget.get(c.target).push(c);
    }
    // Dialogue rows of scenes, with the timeline indexes of their sentences (for said / now / not yet).
    const segIndex = new Map(this.tl.segs.map((s, i) => [s.id, i]));
    this.rows = [...document.querySelectorAll(".scene li.line")].map((row) => ({
      row, scene: row.closest(".scene"),
      idx: [...row.querySelectorAll("[data-seg]")].map((e) => segIndex.get(e.dataset.seg)).filter((n) => n != null),
    })).filter((r) => r.idx.length);
    this.active = -1; this.cameraSeg = null; this.cueIdx = 0; this.pending = []; this.fxBusyUntil = 0; this.firing = false;
    this.talker = null; this.lastWord = -1; this.liveScene = null;
    this.storeKey = "docent:" + lesson.id + ":t";
    if (this.available) {
      this.audio = new Audio(base + timings.audio);
      this.audio.preload = "auto";
      this.audio.addEventListener("ended", () => this._ended());
      this.audio.addEventListener("pause", () => { if (this.state === "playing" && !this.audio.ended) this._setState("paused"); });
    }
    this.dock = new Dock({
      duration: this.tl.duration, chapters: this.tl.chapters, available: this.available,
      onToggle: () => this.toggle(),
      onSeek: (t) => this.seek(t, { resume: this.state === "playing" }),
      onSpeed: () => this.cycleSpeed(),
      onReturn: () => this.refollow(),
    });
    this.aiVoice = !!(timings && timings.voice && timings.voice.provider !== "say");
    if (this.available) this.dock.setInvite("재생하며 보기", fmtTime(this.tl.duration) + (this.aiVoice ? " · AI 음성" : ""));
    let saved = 0;
    try { saved = Number(localStorage.getItem(this.storeKey) || 0); } catch {}
    if (this.available && saved > 8 && saved < this.tl.duration - 8) { this.resumeAt = saved; this.dock.setInvite("이어서 듣기", fmtTime(saved) + "부터"); }
    camera.onDetach(() => {
      if (this.state === "idle") return;
      document.body.classList.remove("is-following");
      this._updateReturn();
      // Paused and scrolling on their own, the learner is reading: effects ahead play as in read mode.
      if (this.state === "paused") this.reader && this.reader.resume();
    });
    this._tick = this._tick.bind(this);
    this._bindKeys();
    this._bindSentenceSeek();
  }

  // ---- transport ----
  toggle() { if (this.state === "playing") this.pause(); else this.play(); }

  play(from) {
    if (!this.available) return;
    // Called from click/keyboard handlers: lets Safari play the synthesized stings later.
    this.fx.unlockAudio();
    const starting = this.state === "idle" || this.state === "ended";
    if (starting) {
      document.body.classList.add("has-player", "is-narrating", "is-following");
      this.reader && this.reader.suspend();
      this.camera.active = true;
      this.camera.follow();
      const t = from != null ? from : this.state === "ended" ? 0 : (this.resumeAt || 0);
      this.resumeAt = 0;
      this.seek(t, { resume: false, arrive: true });
    } else if (from != null) this.seek(from, { resume: false, arrive: true });
    document.body.classList.add("is-narrating");
    this.audio.play().then(() => {}).catch(() => this._setState("paused"));
    this._setState("playing");
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this._tick);
  }

  pause() { if (!this.available) return; this.audio.pause(); this._setState("paused"); this._save(); }

  cycleSpeed() {
    if (!this.available) return;
    const i = SPEEDS.indexOf(this.audio.playbackRate);
    const rate = SPEEDS[(i + 1) % SPEEDS.length];
    this.audio.playbackRate = rate;
    this.dock.setSpeed(rate);
  }

  refollow() {
    if (this.state === "paused") this.reader && this.reader.suspend();
    this.camera.follow();
    document.body.classList.add("is-following");
    this.dock.hideReturn();
    this.cameraSeg = null;
    const seg = this.tl.segs[this.active];
    if (seg) this._aim(seg, true);
  }

  seek(t, { resume = false, arrive = false } = {}) {
    if (!this.available) return;
    t = Math.min(Math.max(0, t), this.tl.duration - 0.05);
    this._setAudioTime(t);
    this._syncEffects(t);
    this.pending = [];
    this.cueIdx = this.tl.cues.findIndex((c) => c.time > t + 0.001);
    if (this.cueIdx < 0) this.cueIdx = this.tl.cues.length;
    this.fxBusyUntil = 0;
    this.camera.lockUntil = 0;
    const i = indexAt(this.tl.segs, t + 0.02);
    this._activate(i);
    this.cameraSeg = null;
    if (this.camera.following) { const seg = this.tl.segs[Math.max(0, i)]; if (seg) this._aim(seg, arrive); }
    this._render(t);
    if (resume && this.state !== "playing") this.play();
  }

  // Audio without metadata ignores currentTime; apply the jump as soon as it can.
  _setAudioTime(t) {
    if (this.audio.readyState >= 1) { this.pendingTime = null; this.audio.currentTime = t; return; }
    this.pendingTime = t;
    if (this._metaWait) return;
    this._metaWait = true;
    this.audio.addEventListener("loadedmetadata", () => {
      this._metaWait = false;
      if (this.pendingTime != null) { this.audio.currentTime = this.pendingTime; this.pendingTime = null; }
    }, { once: true });
  }

  playFromSegment(segId) {
    const seg = this.tl.segs.find((s) => s.id === segId);
    if (!seg) return;
    const t = this._startOf(seg);
    if (this.state === "idle" || this.state === "ended") this.play(t);
    else { this.camera.follow(); document.body.classList.add("is-following"); this.dock.hideReturn(); this.seek(t, { resume: true }); }
  }

  // Where to jump so a sentence's own effects (including block effects that start before the voice) still play.
  _startOf(seg) {
    const earliest = seg.cues.reduce((m, c) => Math.min(m, c.time), seg.start);
    return Math.max(0, Math.min(seg.start - 0.25, earliest - 0.12));
  }

  // ---- loop ----
  _tick() {
    if (this.state !== "playing") return;
    const t = this.pendingTime != null ? this.pendingTime : this.audio.currentTime;
    this._render(t);
    this._camera(t);
    this._cues(t);
    if (Math.floor(t) % 3 === 0) this._save();
    this.raf = requestAnimationFrame(this._tick);
  }

  _render(t) {
    const i = indexAt(this.tl.segs, t + 0.02);
    if (i !== this.active) this._activate(i);
    const seg = this.tl.segs[i];
    let talking = null;
    if (seg) {
      let spoken = 0;
      for (let k = 0; k < seg.unitEls.length; k++) {
        const u = seg.unitEls[k];
        const on = seg.unitTimes[k][0] <= t + 0.04;
        if (on) spoken = k + 1;
        if (u) u.classList.toggle("is-spoken", on);
      }
      // The character whose line is being spoken moves its mouth, word by word.
      if (seg.actorEl && this.state === "playing" && t >= seg.start - 0.05 && t <= seg.end + 0.05) {
        talking = seg.actorEl;
        if (spoken && spoken !== this.lastWord) {
          this.lastWord = spoken;
          seg.actorEl.dispatchEvent(new CustomEvent("docent:word", { detail: { index: spoken - 1 } }));
        }
      }
    }
    this._setTalker(talking);
    this.dock.setTime(t);
    if (!this.camera.following) this._updateReturn();
  }

  _setTalker(el) {
    if (el === this.talker) return;
    if (this.talker) this.talker.classList.remove("is-talking");
    this.talker = el;
    this.lastWord = -1;
    if (el) el.classList.add("is-talking");
  }

  _activate(i) {
    const prev = this.tl.segs[this.active];
    if (prev) {
      prev.el && prev.el.classList.remove("is-active");
      prev.blockEl && prev.blockEl.classList.remove("is-current-block");
      for (const u of prev.unitEls) u && u.classList.remove("is-spoken");
    }
    this.active = i;
    this._markRows(i);
    const seg = this.tl.segs[i];
    if (!seg) { this.dock.setLabel(this.lesson.title); return; }
    seg.el && seg.el.classList.add("is-active");
    seg.blockEl && seg.blockEl.classList.add("is-current-block");
    const ch = this.tl.chapters.find((c) => c.id === seg.chapter);
    this.dock.setLabel(this.camera.following ? (ch ? ch.title : this.lesson.title) : seg.text);
    if (this.nav && seg.chapter) this.nav.setActive(seg.chapter);
  }

  // Scene rows: .is-active while spoken, .is-said once spoken; the scene is .is-live while one of its rows plays.
  _markRows(i) {
    const seg = this.tl.segs[i];
    const scene = seg && seg.rowEl ? seg.rowEl.closest(".scene") : null;
    if (scene !== this.liveScene) {
      if (this.liveScene) this.liveScene.classList.remove("is-live");
      this.liveScene = scene;
      if (scene) scene.classList.add("is-live");
    }
    for (const r of this.rows) {
      const active = i >= 0 && r.idx.includes(i);
      r.row.classList.toggle("is-active", active);
      r.row.classList.toggle("is-said", !active && i >= 0 && Math.max(...r.idx) < i);
    }
  }

  _camera(t) {
    if (!this.camera.following || this.camera.moving || this.camera.locked || this.firing) return;
    const i = this.active;
    const seg = this.tl.segs[i];
    const next = this.tl.segs[i + 1];
    const target = next && t >= next.start - LEAD ? next : seg;
    if (target && target !== this.cameraSeg) this._aim(target, false);
  }

  _targetOf(seg) {
    const kind = seg.block;
    if (kind === "intro") return { el: document.getElementById("intro"), mode: "top", kind: "block" };
    if (/^ch\d+$/.test(kind)) return { el: seg.blockEl, mode: "center", kind: "block" };
    if (kind === "checkpoint") return { el: seg.blockEl, mode: "center", kind: "block" };
    if (kind === "outro" && seg.cues.some((c) => c.fx === "outro")) return { el: seg.blockEl, mode: "center", kind: "block" };
    if (seg.rowEl && seg.rowEl.getClientRects().length) return { el: seg.rowEl, mode: "line", kind: "line" };
    const el = seg.el && seg.el.getClientRects().length ? seg.el : seg.blockEl;
    return { el, mode: "line", kind: "line" };
  }

  _aim(seg, instantIfFar) {
    this.cameraSeg = seg;
    const { el, mode, kind } = this._targetOf(seg);
    if (!el) return;
    if (this.camera.inView(el, kind)) return;
    const far = Math.abs(el.getBoundingClientRect().top) > window.innerHeight * 1.5;
    this.camera.moveTo(el, mode, { instant: instantIfFar && far });
  }

  // ---- cues ----
  _cues(t) {
    // Cues the reader already played while narration was paused are not played a second time.
    const seen = (c) => this.reader && this.reader.fired.has(cueKey(c));
    if (this.pending.length) this.pending = this.pending.filter((c) => { if (!seen(c)) return true; c.fired = true; return false; });
    while (this.cueIdx < this.tl.cues.length && this.tl.cues[this.cueIdx].time <= t) {
      const c = this.tl.cues[this.cueIdx++];
      if (seen(c)) { c.fired = true; continue; }
      this.pending.push(c);
    }
    if (!this.pending.length || this.firing || this.camera.moving) return;
    // Characters and word effects join in at once; screen and block effects take turns.
    const rest = [];
    for (const c of this.pending) { if (this.free(c)) this._fireFree(c); else rest.push(c); }
    this.pending = rest;
    if (!this.pending.length || performance.now() < this.fxBusyUntil) return;
    this._fire(this.pending.shift());
  }

  _fireFree(cue) {
    const el = document.getElementById(cue.target);
    cue.fired = true;
    if (!el || !this.fx.has(cue.fx)) return;
    const h = this.fx.run(cue.fx, el, this._opts(cue, el));
    this.reader && this.reader.setFired(cue, true);
    const d = (h && h.duration) || 0;
    if (!/^(react|emote|act|menuprice)$/.test(cue.fx)) this.camera.lock(Math.min(d, 900));
  }

  async _fire(cue) {
    const el = document.getElementById(cue.target);
    cue.fired = true;
    if (!el || !this.fx.has(cue.fx)) return;
    this.firing = true;
    try {
      if (BLOCK_FX.has(cue.fx) && this.camera.following && cue.fx !== "intro") {
        const pair = cue.fx === "flyvalue" && cue.params && cue.params.to && cue.params.to !== "out" ? document.getElementById(cue.params.to) : null;
        const frame = pair ? [el, pair] : el;
        if (!this.camera.inView(frame, "block")) await this.camera.moveTo(frame, "center");
      }
      const h = this.fx.run(cue.fx, el, this._opts(cue, el));
      const d = (h && h.duration) || 0;
      this.reader && this.reader.setFired(cue, true);
      this.camera.lock(d);
      this.fxBusyUntil = performance.now() + Math.min(d, cue.fx === "intro" ? 600 : 1400);
    } finally { this.firing = false; }
  }

  _opts(cue = {}, el = null) {
    const s = this.settings.get();
    const o = { mode: "play", intensity: s.intensity, reduced: this.camera.reduced, sound: s.sound };
    if (cue.line != null) o.line = cue.line;
    if (cue.n != null) o.n = cue.n;
    if (cue.params) o.params = cue.params;
    if (BIG.includes(cue.fx)) o.style = this.settings.styleFor(cue.fx, el);
    return o;
  }

  // Seeking: every effect goes back to its start, then each cue already passed jumps to its final state in order.
  _syncEffects(t) {
    for (const [target, list] of this.cuesByTarget) {
      const el = document.getElementById(target);
      if (!el) continue;
      const names = [...new Set(list.map((c) => c.fx))].reverse();
      for (const name of names) {
        const first = list.find((c) => c.fx === name);
        const o = this._opts(first, el);
        if (name === "run") delete o.line;
        this.fx.reset(name, el, o);
      }
      for (const c of list) {
        c.fired = c.time <= t + 0.001;
        if (c.fired) this.fx.settle(c.fx, el, this._opts(c, el));
        this.reader && this.reader.setFired(c, c.fired);
      }
    }
  }

  // ---- state ----
  _setState(state) {
    this.state = state;
    // Narrating: the player owns the effects. Paused after the learner scrolled away: read mode takes over.
    if (this.reader) {
      if (state === "playing") this.reader.suspend();
      else if (state === "paused" && !this.camera.following) this.reader.resume();
    }
    this.dock.setState(state === "ended" ? "paused" : state);
    document.body.classList.toggle("is-playing", state === "playing");
    if (state !== "playing") { cancelAnimationFrame(this.raf); this._setTalker(null); }
  }

  _ended() {
    this._setState("ended");
    for (const c of this.tl.cues) { const el = document.getElementById(c.target); if (el) this.fx.settle(c.fx, el, this._opts(c, el)); }
    this.reader && this.reader.markAll();
    document.body.classList.remove("is-narrating", "is-following");
    this.camera.active = false;
    this.dock.hideReturn();
    const seg = this.tl.segs[this.active];
    seg && seg.el && seg.el.classList.remove("is-active");
    this._markRows(-1);
    try { localStorage.removeItem(this.storeKey); } catch {}
    this.dock.setLabel("레슨 끝 · 다시 들으려면 재생");
    this.reader && this.reader.resume();
  }

  _save() { if (this.available && this.audio.currentTime > 3) { try { localStorage.setItem(this.storeKey, String(this.audio.currentTime.toFixed(1))); } catch {} } }

  _updateReturn() {
    if (this.camera.following || this.state === "idle" || this.state === "ended") { this.dock.hideReturn(); return; }
    const seg = this.tl.segs[this.active];
    if (!seg) return;
    const { el } = this._targetOf(seg);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const off = r.bottom < 0 || r.top > window.innerHeight;
    if (off) this.dock.showReturn(r.bottom < 0 ? "up" : "down"); else this.dock.hideReturn();
    const ch = this.tl.chapters.find((c) => c.id === seg.chapter);
    this.dock.setLabel(off ? seg.text : (ch ? ch.title : this.lesson.title));
  }

  _bindKeys() {
    window.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
      if (e.target && e.target.closest && e.target.closest(".practice")) return;
      if (e.key === " " && !(e.target && e.target.closest && e.target.closest("button, a"))) { e.preventDefault(); this.toggle(); }
      if (this.state === "idle") return;
      if (e.key === "ArrowRight" && !(e.target && e.target.closest(".dock-track"))) { e.preventDefault(); const s = this.tl.segs[this.active + 1]; if (s) this.seek(this._startOf(s), { resume: this.state === "playing" }); }
      if (e.key === "ArrowLeft" && !(e.target && e.target.closest(".dock-track"))) {
        e.preventDefault();
        const cur = this.tl.segs[this.active];
        const back = cur && this.audio.currentTime - cur.start > 1.2 ? cur : this.tl.segs[Math.max(0, this.active - 1)];
        if (back) this.seek(this._startOf(back), { resume: this.state === "playing" });
      }
    });
  }

  _bindSentenceSeek() {
    document.addEventListener("click", (e) => {
      if (this.state === "idle" || !this.available) return;
      if (e.target.closest("a, button, .practice, .figure, .code, .turn, .scene-stage")) return;
      const segEl = e.target.closest("[data-seg]");
      if (!segEl) return;
      if (window.getSelection && String(window.getSelection()).length) return;
      this.playFromSegment(segEl.dataset.seg);
    });
  }
}
