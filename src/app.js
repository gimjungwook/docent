// Page bootstrap for Docent lesson and course pages.
import { Camera } from "./engine/camera.js";
import { Reader } from "./engine/reader.js";
import { Player } from "./engine/player.js";
import { createSettings, mountTastePanel } from "./engine/settings.js";
import { mountNav } from "./engine/nav.js";

const base = document.body.dataset.base || "";
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const query = new URLSearchParams(location.search);

async function loadFx() {
  try {
    const m = await import("./components/index.js");
    if (m && m.fx) return m;
  } catch {}
  const noop = () => ({ duration: 0, done: Promise.resolve(), finish() {} });
  return { fx: new Proxy({}, { get: () => noop }), prime() {}, settle() {}, reset() {} };
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
  const io = new IntersectionObserver(async (entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    try {
      const m = await import("./practice/practice.js");
      m.mountPractice(el, { lessonId, dataUrl: base + "content/practice/" + lessonId + ".json", ai: { endpoint: "http://127.0.0.1:11434" } });
    } catch {
      el.insertAdjacentHTML("beforeend", '<p class="practice-pending">직접 해 보기는 준비 중이에요.</p>');
    }
  }, { rootMargin: "1200px 0px" });
  io.observe(el);
}

// Desktop hover affordance in read mode: start listening from a paragraph.
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
    const para = e.target.closest(".lesson > .para");
    if (para) { clearTimeout(hideTimer); show(para); }
    else if (!e.target.closest(".listen-here")) { clearTimeout(hideTimer); hideTimer = setTimeout(() => b.classList.remove("is-shown"), 250); }
  });
  b.addEventListener("click", () => { b.classList.remove("is-shown"); if (target) player.playFromSegment(target); });
}

(async function main() {
  const settings = createSettings();
  const fx = await loadFx();
  const root = document.querySelector("main");
  try { fx.prime && fx.prime(root); } catch (e) { console.error("[docent] prime failed", e); }
  const nav = mountNav();
  const camera = new Camera({ reduced });
  const readerOpts = () => { const s = settings.get(); return { intensity: s.intensity, reduced, sound: false, style: s.introStyle }; };
  const reader = new Reader({ fx, opts: readerOpts });
  if (fx.drawMotif) for (const el of document.querySelectorAll(".toc-motif[data-motif]")) { try { fx.drawMotif(el, el.dataset.motif); } catch {} }

  const replayIntro = () => {
    const intro = document.getElementById("intro");
    if (!intro) return;
    window.scrollTo(0, 0);
    fx.reset && fx.reset(intro);
    const s = settings.get();
    fx.fx.intro(intro, { mode: "read", intensity: s.intensity, reduced, sound: s.sound, style: s.introStyle });
    reader.markFired(intro);
  };
  settings.on((s, patch) => {
    if (!("introStyle" in patch)) return;
    const intro = document.getElementById("intro");
    if (!intro) return;
    const r = intro.getBoundingClientRect();
    fx.reset && fx.reset(intro);
    if (r.bottom > 0 && r.top < window.innerHeight) fx.fx.intro(intro, { mode: "read", intensity: s.intensity, reduced, sound: s.sound, style: s.introStyle });
    else fx.settle && fx.settle(intro);
  });
  mountTastePanel(settings, { onReplayIntro: replayIntro });

  const lessonId = document.body.dataset.lesson;
  if (lessonId) {
    // ?timings=dev loads a local throwaway narration from tmp/dev (never deployed); ?mute=1 mutes audio for automated checks.
    const timingsUrl = query.get("timings") === "dev" ? base + "tmp/dev/" + lessonId + ".timings.json" : base + "data/" + lessonId + ".timings.json";
    const [lesson, timings] = await Promise.all([
      getJSON(base + "data/lessons/" + lessonId + ".json"),
      getJSON(timingsUrl),
    ]);
    if (lesson) {
      const player = new Player({ lesson, timings, base, fx, camera, reader, nav, settings });
      if (query.get("mute") === "1" && player.audio) player.audio.muted = true;
      mountListenHere(player);
      window.docent = { player, settings };
    }
    mountPractice(lessonId);
  }
})();
