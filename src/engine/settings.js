// Taste settings (시안 비교): intro look, effect strength, focus mode, sound.
// Story pages keep their own settings (louder by default) so the two versions can be compared side by side.
// A look left at "레슨 기본" uses the look the lesson script chose (data-style on the block).
import { STYLES } from "../components/effects/registry.js";

const KEYS = { calm: "docent:settings", story: "docent:settings:story" };
const BASE = { introStyle: "", chapterStyle: "", checkpointStyle: "", outroStyle: "", intensity: "normal", focus: true, sound: true };
const LABELS = {
  cinema: "시네마", editorial: "에디토리얼", playful: "플레이풀", band: "띠", ring: "진행 링", recap: "요약",
};
const looks = (kind) => [["", "레슨 기본"], ...STYLES[kind].map((v) => [v, LABELS[v] || v])];
const CHOICES = {
  introStyle: looks("intro"),
  chapterStyle: looks("chapter"),
  checkpointStyle: looks("checkpoint"),
  outroStyle: looks("outro"),
  intensity: [["soft", "약하게"], ["normal", "보통"], ["strong", "강하게"]],
  focus: [[true, "켜기"], [false, "끄기"]],
  sound: [[true, "켜기"], [false, "끄기"]],
};
const URL_MAP = { intro: "introStyle", chapter: "chapterStyle", checkpoint: "checkpointStyle", outro: "outroStyle", fx: "intensity", focus: "focus", sound: "sound" };
export const LOOK_KEYS = ["introStyle", "chapterStyle", "checkpointStyle", "outroStyle"];

export function createSettings({ story = false } = {}) {
  const KEY = story ? KEYS.story : KEYS.calm;
  const DEFAULTS = { ...BASE, intensity: story ? "strong" : "normal" };
  let s = { ...DEFAULTS };
  try { s = { ...s, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
  for (const k of Object.keys(CHOICES)) if (!CHOICES[k].some(([c]) => c === s[k])) s[k] = DEFAULTS[k];
  const q = new URLSearchParams(location.search);
  for (const [param, key] of Object.entries(URL_MAP)) {
    if (!q.has(param)) continue;
    const v = q.get(param);
    const val = typeof DEFAULTS[key] === "boolean" ? !(v === "off" || v === "0" || v === "false") : v;
    if (CHOICES[key].some(([c]) => c === val)) s[key] = val;
  }
  const listeners = new Set();
  const apply = () => {
    document.body.classList.toggle("focus-on", !!s.focus);
    document.body.dataset.intensity = s.intensity;
    document.body.dataset.introStyle = s.introStyle || "lesson";
  };
  apply();
  return {
    get: () => s,
    set(patch) {
      s = { ...s, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
      apply();
      for (const fn of listeners) fn(s, patch);
    },
    on(fn) { listeners.add(fn); },
    // The look for a big moment: the reader's choice, else the lesson's (kept in data-author-style).
    styleFor(kind, el) {
      const chosen = s[kind + "Style"];
      if (chosen) return chosen;
      return (el && (el.dataset.authorStyle || el.dataset.style)) || "";
    },
  };
}

export function mountTastePanel(settings, { onReplayIntro } = {}) {
  const btn = document.querySelector(".topbar-taste");
  if (!btn) return;
  const panel = document.createElement("div");
  panel.className = "taste";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "시안 비교");
  const group = (key, legend) => '<fieldset><legend>' + legend + '</legend><div class="taste-options">' +
    CHOICES[key].map(([v, label]) => '<label><input type="radio" name="' + key + '" value="' + v + '"><span>' + label + "</span></label>").join("") + "</div></fieldset>";
  const has = (sel) => !!document.querySelector(sel);
  const choosable = (key) => CHOICES[key].length > 2;
  panel.innerHTML = "<h2>시안 비교</h2><p>디자인 시안을 바꿔 가며 비교해 보세요. 고른 값은 이 브라우저에 기억돼요.</p>" +
    group("introStyle", "인트로") +
    (has(".blk.chapter") && choosable("chapterStyle") ? group("chapterStyle", "장 제목") : "") +
    (has(".blk.checkpoint") && choosable("checkpointStyle") ? group("checkpointStyle", "중간 점검") : "") +
    (has(".blk.outro") && choosable("outroStyle") ? group("outroStyle", "마무리") : "") +
    group("intensity", "효과 세기") + group("focus", "읽는 문장에 집중") + group("sound", "효과음") +
    '<div class="taste-actions"><button class="btn btn-primary" type="button" data-act="intro">인트로 다시 보기</button><button class="btn btn-ghost" type="button" data-act="close">닫기</button></div>';
  document.body.appendChild(panel);
  const sync = () => {
    const s = settings.get();
    for (const input of panel.querySelectorAll("input")) input.checked = String(s[input.name]) === input.value;
  };
  sync();
  panel.addEventListener("change", (e) => {
    const input = e.target;
    const key = input.name;
    const val = typeof BASE[key] === "boolean" ? input.value === "true" : input.value;
    settings.set({ [key]: val });
  });
  const open = (on) => { panel.hidden = !on; btn.setAttribute("aria-expanded", String(on)); if (on) { sync(); panel.querySelector("input:checked")?.focus(); } };
  btn.addEventListener("click", () => open(panel.hidden));
  panel.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "close") { open(false); btn.focus(); }
    if (act === "intro") { open(false); onReplayIntro && onReplayIntro(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { open(false); btn.focus(); } });
  document.addEventListener("pointerdown", (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) open(false); });
}
