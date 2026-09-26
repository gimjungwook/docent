// One door to every effect. v1 components (src/components/index.js: intro, chapter, pop, burst, flip, run,
// step, checkpoint, outro) and the v2 library (src/components/effects: text, screen, code and cast groups) are
// called the same way here, one cue at a time, so the player and the reader never care which one draws.
// A failing effect never breaks the page: errors are logged and the element is left in its final state.

const V1 = new Set(["intro", "chapter", "pop", "burst", "flip", "run", "step", "checkpoint", "outro"]);
export const BIG = ["intro", "chapter", "checkpoint", "outro"];
const idle = () => ({ duration: 0, done: Promise.resolve(), finish() {} });

export function createFxHub(v1, v2) {
  const table = (v2 && v2.table) || {};
  const safe = (label, fn) => {
    try { return fn(); } catch (e) { console.error("[docent fx] " + label + " failed", e); return undefined; }
  };
  const v1fn = (name) => v1 && v1.fx && v1.fx[name];

  const hub = {
    table,
    loaded: (v2 && v2.loaded) || {},
    isV1: (name) => V1.has(name),
    has: (name) => (V1.has(name) ? !!v1fn(name) : !!(table[name] && table[name].run)),

    run(name, el, opts = {}) {
      if (!el) return idle();
      if (V1.has(name)) {
        const fn = v1fn(name);
        return (fn && safe(name, () => fn(el, opts))) || idle();
      }
      const impl = table[name];
      if (!impl) return idle();
      const h = safe(name, () => impl.run(el, opts));
      if (h && typeof h.duration === "number") return h;
      safe(name + " settle", () => impl.settle && impl.settle(el, opts));
      return idle();
    },

    settle(name, el, opts) {
      if (!el) return;
      if (V1.has(name)) { if (v1 && v1.settle) safe("settle " + name, () => v1.settle(el, opts)); return; }
      const impl = table[name];
      if (impl && impl.settle) safe("settle " + name, () => impl.settle(el, opts || {}));
    },

    reset(name, el, opts) {
      if (!el) return;
      if (V1.has(name)) { if (v1 && v1.reset) safe("reset " + name, () => v1.reset(el, opts)); return; }
      const impl = table[name];
      if (impl && impl.reset) safe("reset " + name, () => impl.reset(el, opts || {}));
    },

    // v1 primes everything under root at once; v2 effects are primed per cue target (first cue of each
    // effect on that target), because block and actor cues point at elements that carry no data-fx of their own.
    primeAll(root, cues = [], optsOf = () => ({})) {
      if (v1 && v1.prime) safe("prime v1", () => v1.prime(root));
      const seen = new Set();
      for (const c of cues) {
        if (V1.has(c.fx)) continue;
        const key = c.target + "|" + c.fx;
        if (seen.has(key)) continue;
        seen.add(key);
        const el = document.getElementById(c.target);
        const impl = table[c.fx];
        if (el && impl && impl.prime) safe("prime " + c.fx, () => impl.prime(el, optsOf(c)));
      }
    },

    unlockAudio() { if (v1 && v1.unlockAudio) safe("unlockAudio", () => v1.unlockAudio()); },
    drawMotif(el, motif) { if (v1 && v1.drawMotif) safe("drawMotif", () => v1.drawMotif(el, motif)); },
  };
  return hub;
}
