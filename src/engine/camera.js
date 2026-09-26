// The camera: eases the page so the spoken sentence sits on the reading line.
// It never fights the reader: wheel/touch/keyboard/scrollbar input detaches it.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const NAV_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

export class Camera {
  constructor({ reduced = false } = {}) {
    this.reduced = reduced;
    this.active = false;       // true while the player drives the page
    this.following = true;
    this.moving = false;
    this.lockUntil = 0;
    this._raf = 0;
    this._expectY = window.scrollY;
    this._quietUntil = 0;
    this._detachHandlers = new Set();
    const user = () => this._user();
    window.addEventListener("wheel", user, { passive: true });
    window.addEventListener("touchmove", user, { passive: true });
    window.addEventListener("keydown", (e) => {
      if (!NAV_KEYS.has(e.key)) return;
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
      if (e.target && e.target.closest && e.target.closest(".dock-track")) return;
      user();
    });
    window.addEventListener("scroll", () => {
      if (this.moving || performance.now() < this._quietUntil) return;
      if (Math.abs(window.scrollY - this._expectY) > 48) user();
    }, { passive: true });
  }

  get topOffset() { const bar = document.querySelector(".topbar"); return bar ? bar.getBoundingClientRect().height : 0; }
  get vh() { return window.innerHeight; }
  onDetach(fn) { this._detachHandlers.add(fn); }
  lock(ms) { this.lockUntil = Math.max(this.lockUntil, performance.now() + ms); }
  get locked() { return performance.now() < this.lockUntil; }

  _user() {
    this._expectY = window.scrollY;
    if (!this.active || !this.following) return;
    this.following = false;
    this.cancel();
    for (const fn of this._detachHandlers) fn();
  }

  follow() { this.following = true; this._expectY = window.scrollY; }
  cancel() { cancelAnimationFrame(this._raf); this.moving = false; this._expectY = window.scrollY; this._quietUntil = performance.now() + 150; }

  // Is the element where it should be? 'line' = text near the reading line; 'block' = mostly visible.
  inView(el, kind = "line") {
    const r = el.getBoundingClientRect();
    const vh = this.vh, top = this.topOffset;
    if (kind === "line") {
      const bandTop = Math.max(top + 8, vh * 0.25), bandBottom = vh * 0.58;
      if (r.height > bandBottom - bandTop) return r.top <= vh * 0.42 && r.bottom >= vh * 0.3;
      return r.top >= bandTop && r.bottom <= bandBottom;
    }
    const visible = Math.min(r.bottom, vh) - Math.max(r.top, top);
    return visible >= Math.min(r.height, vh - top) * 0.88;
  }

  targetY(el, mode) {
    const r = el.getBoundingClientRect();
    const y = window.scrollY, vh = this.vh, top = this.topOffset;
    let target;
    if (mode === "top") target = y + r.top - top;
    else if (mode === "center") {
      const avail = vh - top;
      target = r.height >= avail ? y + r.top - top : y + r.top - top - (avail - r.height) / 2;
    } else target = y + r.top - vh * 0.38;
    const max = document.documentElement.scrollHeight - vh;
    return clamp(Math.round(target), 0, Math.max(0, max));
  }

  moveTo(el, mode = "line", { instant = false } = {}) {
    cancelAnimationFrame(this._raf);
    const from = window.scrollY;
    const to = this.targetY(el, mode);
    const dist = to - from;
    if (Math.abs(dist) < 3) { this.moving = false; return Promise.resolve(); }
    if (instant || this.reduced) {
      this._set(to);
      this.moving = false;
      return Promise.resolve();
    }
    // Long jumps: cut most of the way, glide the last stretch so the eye keeps its place.
    let start = from;
    if (Math.abs(dist) > this.vh * 2.2) { start = to - Math.sign(dist) * this.vh * 0.8; this._set(start); }
    const span = to - start;
    const dur = clamp(420 + Math.abs(span) * 0.42, 520, 1050);
    const t0 = performance.now();
    this.moving = true;
    return new Promise((resolve) => {
      const step = (now) => {
        if (!this.moving) return resolve();
        // Someone else moved the page mid-glide (scrollbar drag, find-in-page, a link): hand over at once.
        if (Math.abs(window.scrollY - this._expectY) > 24) { this.moving = false; resolve(); this._user(); return; }
        const p = clamp((now - t0) / dur, 0, 1);
        this._set(start + span * ease(p));
        if (p < 1) this._raf = requestAnimationFrame(step);
        else { this.moving = false; this._quietUntil = performance.now() + 120; resolve(); }
      };
      this._raf = requestAnimationFrame(step);
    });
  }

  _set(y) { this._expectY = Math.round(y); window.scrollTo(0, y); }
}
