// Read mode: without narration, every cue of the lesson plays once when its spot has settled in view, in
// lesson order. "Settled" = the page has been still for STILL_MS. One effect at a time (story pages let
// characters and word effects join in). Cues the reader scrolled past without seeing jump to their final
// state, so nothing is left half-drawn. Pages without a lesson (the course page) use their [data-fx] blocks.
const STILL_MS = 180;
const BLOCKISH = new Set(["intro", "chapter", "run", "step", "flip", "checkpoint", "outro", "typecode", "terminal", "flyvalue", "diff", "errorfx"]);

export const cueKey = (c) => c.seg + ":" + c.idx;

function itemsFromLesson(lesson) {
  const items = [];
  for (const s of lesson.segments) {
    s.cues.forEach((c, idx) => {
      const cue = { ...c, seg: s.id, idx };
      const el = document.getElementById(c.target);
      if (!el) return;
      const block = BLOCKISH.has(c.fx);
      const anchor = block ? el : document.getElementById(s.id + "-u" + c.unit) || el;
      items.push({ cue, el, anchor, block, key: cueKey(cue) });
    });
  }
  return items;
}

function itemsFromDom() {
  return [...document.querySelectorAll("main [data-fx]")].filter((el) => el.id).map((el, i) => {
    const cue = { fx: el.dataset.fx, target: el.id, seg: "dom", idx: i };
    if (cue.fx === "step") cue.n = Number(el.dataset.to);
    return { cue, el, anchor: el, block: true, key: cueKey(cue) };
  });
}

export class Reader {
  // hub: fx hub; opts(cue, el) -> effect options; free(cue) -> may run next to another effect.
  constructor({ hub, opts, lesson = null, free = () => false }) {
    this.hub = hub;
    this.opts = opts;
    this.free = free;
    this.items = lesson ? itemsFromLesson(lesson) : itemsFromDom();
    this.byKey = new Map(this.items.map((it) => [it.key, it]));
    this.fired = new Set();
    this.suspended = false;
    this.busyUntil = 0;
    this.timer = 0;
    const poke = () => this.schedule();
    window.addEventListener("scroll", poke, { passive: true });
    window.addEventListener("resize", poke);
    this.schedule(420);
  }

  schedule(delay = STILL_MS) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), Math.max(0, delay));
  }

  band() {
    const bar = document.querySelector(".topbar");
    return { vh: window.innerHeight, top: bar ? bar.getBoundingClientRect().height : 0 };
  }

  ready(it) {
    const r = it.anchor.getBoundingClientRect();
    if (!r.height && !r.width) return false;
    const { vh, top } = this.band();
    if (it.block) {
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, top);
      return visible >= Math.min(r.height, vh - top) * 0.6;
    }
    return r.top >= vh * 0.18 && r.bottom <= vh * 0.72;
  }

  passed(it) {
    const r = it.anchor.getBoundingClientRect();
    if (!r.height && !r.width) return false;
    return r.bottom < this.band().top;
  }

  check() {
    if (this.suspended) return;
    const now = performance.now();
    const blocked = new Set();
    let next = null;
    for (const it of this.items) {
      if (this.fired.has(it.key)) continue;
      if (blocked.has(it.cue.target)) continue;
      if (this.passed(it)) { this.settleItem(it); continue; }
      if (!this.ready(it)) { blocked.add(it.cue.target); continue; }
      if (this.free(it.cue)) { this.fire(it); continue; }
      if (!next) next = it;
      blocked.add(it.cue.target);
    }
    if (next) {
      if (now < this.busyUntil) { this.schedule(this.busyUntil - now + 30); return; }
      this.fire(next);
      this.schedule(this.busyUntil - performance.now() + 30);
    }
  }

  fire(it) {
    this.fired.add(it.key);
    if (!this.hub.has(it.cue.fx)) return;
    const h = this.hub.run(it.cue.fx, it.el, { ...this.opts(it.cue, it.el), mode: "read" });
    const d = (h && h.duration) || 0;
    if (!this.free(it.cue)) this.busyUntil = performance.now() + Math.min(d, it.cue.fx === "intro" ? 900 : 1600);
  }

  settleItem(it) {
    this.fired.add(it.key);
    this.hub.settle(it.cue.fx, it.el, this.opts(it.cue, it.el));
  }

  // The player keeps the reader in step while it narrates.
  setFired(cue, on) { const k = cueKey(cue); if (on) this.fired.add(k); else this.fired.delete(k); }
  markAll() { for (const it of this.items) this.fired.add(it.key); }
  isFired(target, fx) { return this.items.some((it) => it.cue.target === target && it.cue.fx === fx && this.fired.has(it.key)); }
  replayIntro() {
    for (const it of this.items) if (it.cue.fx === "intro") { this.fired.delete(it.key); this.hub.reset("intro", it.el, this.opts(it.cue, it.el)); this.fire(it); }
  }
  suspend() { this.suspended = true; clearTimeout(this.timer); }
  resume() { this.suspended = false; this.schedule(); }
}
