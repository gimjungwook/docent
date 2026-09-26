// Taste settings (시안 비교): intro style, effect strength, focus mode, sound.
const KEY = "docent:settings";
const DEFAULTS = { introStyle: "cinema", intensity: "normal", focus: true, sound: true };
const CHOICES = {
  introStyle: [["cinema", "시네마"], ["editorial", "에디토리얼"], ["playful", "플레이풀"]],
  intensity: [["soft", "약하게"], ["normal", "보통"], ["strong", "강하게"]],
  focus: [[true, "켜기"], [false, "끄기"]],
  sound: [[true, "켜기"], [false, "끄기"]],
};
const URL_MAP = { intro: "introStyle", fx: "intensity", focus: "focus", sound: "sound" };

export function createSettings() {
  let s = { ...DEFAULTS };
  try { s = { ...s, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
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
    document.body.dataset.introStyle = s.introStyle;
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
  panel.innerHTML = "<h2>시안 비교</h2><p>디자인 시안을 바꿔 가며 비교해 보세요. 고른 값은 이 브라우저에 기억돼요.</p>" +
    group("introStyle", "인트로") + group("intensity", "효과 세기") + group("focus", "읽는 문장에 집중") + group("sound", "효과음") +
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
    const val = typeof DEFAULTS[key] === "boolean" ? input.value === "true" : input.value;
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
