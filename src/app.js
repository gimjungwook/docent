// Page bootstrap for Docent lesson and course pages.
import { Camera } from "./engine/camera.js";
import { Reader } from "./engine/reader.js";
import { Player } from "./engine/player.js";
import { createFxHub, BIG } from "./engine/fxhub.js";
import { createSettings, mountTastePanel } from "./engine/settings.js";
import { mountNav } from "./engine/nav.js";
import { EFFECTS } from "./components/effects/registry.js";

const base = document.body.dataset.base || "";
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const query = new URLSearchParams(location.search);
const isStory = document.body.classList.contains("is-story");

async function loadFx() {
  try {
    const m = await import("./components/index.js");
    if (m && m.fx) return m;
  } catch (e) { console.error("[docent] effect kit failed to load", e); }
  const noop = () => ({ duration: 0, done: Promise.resolve(), finish() {} });
  return { fx: new Proxy({}, { get: () => noop }), prime() {}, settle() {}, reset() {} };
}

async function loadEffectLibrary() {
  try {
    const m = await import("./components/effects/index.js");
    return await m.loadEffects();
  } catch (e) { console.error("[docent] effect library failed to load", e); return { table: {}, loaded: {} }; }
}

async function getJSON(url) {
  try {
    const r = await fetch(url, { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function mountPractice(lessonId) {
  const el = document.querySelector(".practice[data-practice]");
  if (!el) return;
  const practiceId = el.dataset.practice || lessonId;
  const io = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    try {
      const m = await import("./practice/practice.js");
      m.mountPractice(el, { lessonId: practiceId, dataUrl: base + "content/practice/" + practiceId + ".json", ai: { endpoint: "http://127.0.0.1:11434" } });
    } catch {
      el.insertAdjacentHTML("beforeend", '<p class="practice-pending">직접 해 보기는 준비 중이에요.</p>');
    }
  }, { rootMargin: "1200px 0px" });
  io.observe(el);
}

// Desktop hover affordance in read mode: start listening from a paragraph, a dialogue row or an aside.
function mountListenHere(player) {
  if (!player.available || window.matchMedia("(hover: none)").matches) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "listen-here";
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>여기서부터 듣기';
  document.body.appendChild(b);
  let target = null, hideTimer = 0;
  const show = (para) => {
    const seg = para.querySelector("[data-seg]");
    if (!seg) return;
    target = seg.dataset.seg;
    const r = para.getBoundingClientRect();
    const left = r.left + window.scrollX - b.offsetWidth - 20;
    if (left < 8) return;
    b.style.left = left + "px";
    b.style.top = r.top + window.scrollY + 2 + "px";
    b.classList.add("is-shown");
  };
  document.addEventListener("mouseover", (e) => {
    if (player.state === "playing") { b.classList.remove("is-shown"); return; }
    const para = e.target.closest(".lesson > .para, .lesson > .mascot, .scene li.line");
    if (para) { clearTimeout(hideTimer); show(para); }
    else if (!e.target.closest(".listen-here")) { clearTimeout(hideTimer); hideTimer = setTimeout(() => b.classList.remove("is-shown"), 250); }
  });
  b.addEventListener("click", () => { b.classList.remove("is-shown"); if (target) player.playFromSegment(target); });
}

// Story pages let characters and word effects play next to a screen or block effect; calm pages keep one at a time.
const free = (cue) => {
  if (!isStory) return false;
  const e = EFFECTS[cue.fx];
  return cue.fx === "pop" || cue.fx === "menuprice" || !!(e && (e.kind === "actor" || e.kind === "inline"));
};

(async function main() {
  const settings = createSettings({ story: isStory });
  const [v1, v2] = await Promise.all([loadFx(), loadEffectLibrary()]);
  const hub = createFxHub(v1, v2);
  const root = document.querySelector("main");
  // Keep the look each lesson chose: effects rewrite data-style when a reader picks another look.
  for (const el of document.querySelectorAll("main [data-style]")) el.dataset.authorStyle = el.dataset.style;

  const lessonId = document.body.dataset.lesson;
  let lesson = null, timings = null;
  if (lessonId) {
    // ?timings=dev loads a local throwaway narration from tmp/dev (never deployed); ?mute=1 mutes audio for automated checks.
    const timingsUrl = query.get("timings") === "dev" ? base + "tmp/dev/" + lessonId + ".timings.json" : base + "data/" + lessonId + ".timings.json";
    [lesson, timings] = await Promise.all([getJSON(base + "data/lessons/" + lessonId + ".json"), getJSON(timingsUrl)]);
  }
  const cues = lesson ? lesson.segments.flatMap((s) => s.cues.map((c, idx) => ({ ...c, seg: s.id, idx }))) : [];

  // Options for reading (no narration): the reader's settings, no sound.
  const readOpts = (cue = {}, el = null) => {
    const s = settings.get();
    const o = { mode: "read", intensity: s.intensity, reduced, sound: false };
    if (cue.line != null) o.line = cue.line;
    if (cue.n != null) o.n = cue.n;
    if (cue.params) o.params = cue.params;
    if (BIG.includes(cue.fx)) o.style = settings.styleFor(cue.fx, el);
    return o;
  };
  hub.primeAll(root, cues, (c) => readOpts(c, document.getElementById(c.target)));
  const nav = mountNav();
  const camera = new Camera({ reduced });
  const reader = new Reader({ hub, opts: readOpts, lesson, free });
  for (const el of document.querySelectorAll(".toc-motif[data-motif]")) hub.drawMotif(el, el.dataset.motif);

  const replayIntro = () => {
    if (!document.getElementById("intro")) return;
    window.scrollTo(0, 0);
    reader.replayIntro();
  };
  settings.on((s, patch) => {
    if (!("introStyle" in patch)) return;
    const intro = document.getElementById("intro");
    if (!intro) return;
    const r = intro.getBoundingClientRect();
    const o = { ...readOpts({ fx: "intro" }, intro), sound: s.sound };
    hub.reset("intro", intro, o);
    if (r.bottom > 0 && r.top < window.innerHeight) hub.run("intro", intro, o);
    else hub.settle("intro", intro, o);
  });
  mountTastePanel(settings, { onReplayIntro: replayIntro });

  if (lesson) {
    const player = new Player({ lesson, timings, base, fx: hub, camera, reader, nav, settings, free });
    if (query.get("mute") === "1" && player.audio) player.audio.muted = true;
    mountListenHere(player);
    window.docent = { player, settings, hub };
  }
  if (lessonId) mountPractice(lessonId);
})();
