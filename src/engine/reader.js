// Read mode: without narration, each effect plays once when its element has settled in view.
// "Settled" = the page has been still for STILL_MS. One effect at a time, in document order.
const STILL_MS = 180;

export class Reader {
  constructor({ fx, opts }) {
    this.fx = fx;
    this.opts = opts;
    this.fired = new WeakSet();
    this.suspended = false;
    this.busyUntil = 0;
    this.timer = 0;
    this.targets = [...document.querySelectorAll("main [data-fx]")];
    const poke = () => this.schedule();
    window.addEventListener("scroll", poke, { passive: true });
    window.addEventListener("resize", poke);
    this.schedule(420);
  }

  schedule(delay = STILL_MS) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), Math.max(0, delay));
  }

  check() {
    if (this.suspended) return;
    const now = performance.now();
    if (now < this.busyUntil) { this.schedule(this.busyUntil - now + 30); return; }
    for (const el of this.targets) {
      if (this.fired.has(el) || !this.ready(el)) continue;
      this.fire(el);
      this.schedule(this.busyUntil - performance.now() + 30);
      return;
    }
  }

  ready(el) {
    const r = el.getBoundingClientRect();
    if (!r.height && !r.width) return false;
    const vh = window.innerHeight;
    const bar = document.querySelector(".topbar");
    const top = bar ? bar.getBoundingClientRect().height : 0;
    const kind = el.dataset.fx;
    if (kind === "pop" || kind === "burst") return r.top >= vh * 0.18 && r.bottom <= vh * 0.72;
    const visible = Math.min(r.bottom, vh) - Math.max(r.top, top);
    return visible >= Math.min(r.height, vh - top) * 0.6;
  }

  fire(el) {
    const name = el.dataset.fx;
    const fn = this.fx.fx[name];
    this.fired.add(el);
    if (!fn) return;
    const opts = { ...this.opts(), mode: "read" };
    if (name === "step") opts.n = Number(el.dataset.to);
    const h = fn(el, opts);
    const d = (h && h.duration) || 0;
    this.busyUntil = performance.now() + Math.min(d, name === "intro" ? 900 : 1600);
  }

  replay(el) { this.fired.delete(el); this.fx.reset && this.fx.reset(el); this.fire(el); }
  markFired(el) { this.fired.add(el); }
  unmark(el) { this.fired.delete(el); }
  suspend() { this.suspended = true; clearTimeout(this.timer); }
  resume() { this.suspended = false; this.schedule(); }
}
