// The player: narration audio drives highlight, camera and effect cues.
import { buildTimeline, indexAt, fmtTime } from "./timeline.js";
import { Dock } from "./dock.js";

const LEAD = 0.45;               // seconds the camera starts moving before a sentence
const BLOCK_FX = new Set(["intro", "chapter", "run", "step", "flip", "checkpoint", "outro"]);
const SPEEDS = [1, 1.25, 1.5];

export class Player {
  constructor({ lesson, timings, base, fx, camera, reader, nav, settings }) {
    this.lesson = lesson; this.fx = fx; this.camera = camera; this.reader = reader; this.nav = nav; this.settings = settings;
    this.state = "idle";
    this.available = !!timings;
    this.tl = timings ? buildTimeline(lesson, timings) : { segs: [], cues: [], chapters: [], duration: 0 };
    this.cuesByTarget = new Map();
    for (const c of this.tl.cues) {
      if (!this.cuesByTarget.has(c.target)) this.cuesByTarget.set(c.target, []);
      this.cuesByTarget.get(c.target).push(c);
    }
    this.active = -1; this.cameraSeg = null; this.cueIdx = 0; this.pending = []; this.fxBusyUntil = 0; this.firing = false;
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
    const saved = Number(localStorage.getItem(this.storeKey) || 0);
    if (this.available && saved > 8 && saved < this.tl.duration - 8) { this.resumeAt = saved; this.dock.setInvite("이어서 듣기", fmtTime(saved) + "부터"); }
    camera.onDetach(() => { if (this.state !== "idle") { document.body.classList.remove("is-following"); this._updateReturn(); } });
    this._tick = this._tick.bind(this);
    this._bindKeys();
    this._bindSentenceSeek();
  }

  // ---- transport ----
  toggle() { if (this.state === "playing") this.pause(); else this.play(); }

  play(from) {
    if (!this.available) return;
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
    this.audio.currentTime = t;
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

  playFromSegment(segId) {
    const seg = this.tl.segs.find((s) => s.id === segId);
    if (!seg) return;
    const t = Math.max(0, seg.start - 0.25);
    if (this.state === "idle" || this.state === "ended") this.play(t);
    else { this.camera.follow(); document.body.classList.add("is-following"); this.dock.hideReturn(); this.seek(t, { resume: true }); }
  }

  // ---- loop ----
  _tick() {
    if (this.state !== "playing") return;
    const t = this.audio.currentTime;
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
    if (seg) {
      for (let k = 0; k < seg.unitEls.length; k++) {
        const u = seg.unitEls[k];
        if (u) u.classList.toggle("is-spoken", seg.unitTimes[k][0] <= t + 0.04);
      }
    }
    this.dock.setTime(t);
    if (!this.camera.following) this._updateReturn();
  }

  _activate(i) {
    const prev = this.tl.segs[this.active];
    if (prev) {
      prev.el && prev.el.classList.remove("is-active");
      prev.blockEl && prev.blockEl.classList.remove("is-current-block");
      for (const u of prev.unitEls) u && u.classList.remove("is-spoken");
    }
    this.active = i;
    const seg = this.tl.segs[i];
    if (!seg) { this.dock.setLabel(this.lesson.title); return; }
    seg.el && seg.el.classList.add("is-active");
    seg.blockEl && seg.blockEl.classList.add("is-current-block");
    const ch = this.tl.chapters.find((c) => c.id === seg.chapter);
    this.dock.setLabel(this.camera.following ? (ch ? ch.title : this.lesson.title) : seg.text);
    if (this.nav && seg.chapter) this.nav.setActive(seg.chapter);
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
    while (this.cueIdx < this.tl.cues.length && this.tl.cues[this.cueIdx].time <= t) this.pending.push(this.tl.cues[this.cueIdx++]);
    if (!this.pending.length || this.firing || this.camera.moving) return;
    if (performance.now() < this.fxBusyUntil) return;
    this._fire(this.pending.shift());
  }

  async _fire(cue) {
    const el = document.getElementById(cue.target);
    const fn = this.fx.fx[cue.fx];
    if (!el || !fn) return;
    this.firing = true;
    try {
      if (BLOCK_FX.has(cue.fx) && this.camera.following && cue.fx !== "intro" && !this.camera.inView(el, "block")) {
        await this.camera.moveTo(el, "center");
      }
      const h = fn(el, this._opts({ line: cue.line, n: cue.n }));
      const d = (h && h.duration) || 0;
      cue.fired = true;
      this.reader && this.reader.markFired(el);
      this.camera.lock(d);
      this.fxBusyUntil = performance.now() + Math.min(d, cue.fx === "intro" ? 600 : 1400);
    } finally { this.firing = false; }
  }

  _opts(extra = {}) {
    const s = this.settings.get();
    return { mode: "play", intensity: s.intensity, reduced: this.camera.reduced, sound: s.sound, style: s.introStyle, ...extra };
  }

  _syncEffects(t) {
    for (const [target, list] of this.cuesByTarget) {
      const el = document.getElementById(target);
      if (!el) continue;
      const done = list.filter((c) => c.time <= t + 0.001);
      for (const c of list) c.fired = c.time <= t + 0.001;
      if (!done.length) { this.fx.reset && this.fx.reset(el); this.reader && this.reader.unmark(el); continue; }
      const last = done[done.length - 1];
      if (last.fx === "step") { const h = this.fx.fx.step(el, this._opts({ n: last.n, reduced: true })); h && h.finish && h.finish(); }
      else this.fx.settle && this.fx.settle(el);
      this.reader && this.reader.markFired(el);
    }
  }

  // ---- state ----
  _setState(state) {
    this.state = state;
    this.dock.setState(state === "ended" ? "paused" : state);
    document.body.classList.toggle("is-playing", state === "playing");
    if (state !== "playing") cancelAnimationFrame(this.raf);
  }

  _ended() {
    this._setState("ended");
    this.fx.fx && this.tl.cues.forEach((c) => { const el = document.getElementById(c.target); if (el && this.fx.settle) this.fx.settle(el); });
    document.body.classList.remove("is-narrating", "is-following");
    this.camera.active = false;
    this.dock.hideReturn();
    const seg = this.tl.segs[this.active];
    seg && seg.el && seg.el.classList.remove("is-active");
    localStorage.removeItem(this.storeKey);
    this.dock.setLabel("레슨 끝 · 다시 들으려면 재생");
    this.reader && this.reader.resume();
  }

  _save() { if (this.available && this.audio.currentTime > 3) localStorage.setItem(this.storeKey, String(this.audio.currentTime.toFixed(1))); }

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
      if (e.key === "ArrowRight" && !(e.target && e.target.closest(".dock-track"))) { e.preventDefault(); const s = this.tl.segs[this.active + 1]; if (s) this.seek(s.start - 0.1, { resume: this.state === "playing" }); }
      if (e.key === "ArrowLeft" && !(e.target && e.target.closest(".dock-track"))) {
        e.preventDefault();
        const cur = this.tl.segs[this.active];
        const back = cur && this.audio.currentTime - cur.start > 1.2 ? cur : this.tl.segs[Math.max(0, this.active - 1)];
        if (back) this.seek(back.start - 0.1, { resume: this.state === "playing" });
      }
    });
  }

  _bindSentenceSeek() {
    document.addEventListener("click", (e) => {
      if (this.state === "idle" || !this.available) return;
      if (e.target.closest("a, button, code, .practice, .figure, .code")) return;
      const segEl = e.target.closest("[data-seg]");
      if (!segEl) return;
      if (window.getSelection && String(window.getSelection()).length) return;
      this.playFromSegment(segEl.dataset.seg);
    });
  }
}
