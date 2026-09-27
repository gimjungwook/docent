// Floating dock: play/pause, where you are, progress with chapter ticks, speed. Plus the return pill.
import { fmtTime } from "./timeline.js";

const ICON_PLAY = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export class Dock {
  constructor({ duration = 0, chapters = [], available = true, onToggle, onSeek, onSpeed, onReturn }) {
    this.duration = duration;
    this.handlers = { onToggle, onSeek, onSpeed, onReturn };
    const root = document.createElement("div");
    root.className = "dock is-idle" + (available ? "" : " is-unavailable");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "레슨 재생");
    root.innerHTML =
      '<button class="dock-play" type="button" aria-label="재생">' + ICON_PLAY + ICON_PAUSE + "</button>" +
      '<span class="dock-invite"></span>' +
      '<div class="dock-main"><div class="dock-meta"><span class="dock-label"></span><span class="dock-time">0:00 / ' + fmtTime(duration) + "</span></div>" +
      '<div class="dock-track" role="slider" tabindex="0" aria-label="재생 위치" aria-valuemin="0" aria-valuemax="' + Math.round(duration) + '" aria-valuenow="0"><div class="dock-fill"></div><div class="dock-thumb"></div></div></div>' +
      '<button class="dock-speed" type="button" aria-label="재생 속도 1배">1×</button>';
    document.body.appendChild(root);
    const ret = document.createElement("button");
    ret.type = "button";
    ret.className = "dock-return";
    ret.innerHTML = ICON_DOWN + "<span>지금 읽는 곳으로</span>";
    document.body.appendChild(ret);
    this.root = root; this.ret = ret;
    this.play = root.querySelector(".dock-play");
    this.invite = root.querySelector(".dock-invite");
    this.label = root.querySelector(".dock-label");
    this.time = root.querySelector(".dock-time");
    this.track = root.querySelector(".dock-track");
    this.fill = root.querySelector(".dock-fill");
    this.thumb = root.querySelector(".dock-thumb");
    this.speed = root.querySelector(".dock-speed");
    for (const c of chapters) {
      if (!duration || c.start <= 0.5) continue;
      const tick = document.createElement("span");
      tick.className = "dock-tick";
      tick.style.left = (c.start / duration) * 100 + "%";
      tick.title = c.title;
      this.track.appendChild(tick);
    }
    this.setInvite(available ? "재생하며 보기" : "음성 준비 중", available && duration ? fmtTime(duration) : "");
    this.play.addEventListener("click", () => available && onToggle && onToggle());
    this.speed.addEventListener("click", () => onSpeed && onSpeed());
    ret.addEventListener("click", () => onReturn && onReturn());
    this._bindScrub();
  }

  setInvite(text, small) { this.invite.innerHTML = text + (small ? "<small>" + small + "</small>" : ""); }
  setState(state) {
    this.root.classList.toggle("is-idle", state === "idle");
    this.root.classList.toggle("is-playing", state === "playing");
    this.play.setAttribute("aria-label", state === "playing" ? "일시정지" : "재생");
  }
  setLabel(text) { if (this.label.textContent !== text) this.label.textContent = text; }
  setSpeed(rate) { this.speed.textContent = rate + "×"; this.speed.setAttribute("aria-label", "재생 속도 " + rate + "배"); }
  setTime(t) {
    if (this._scrubbing) return;
    const p = this.duration ? Math.min(1, t / this.duration) : 0;
    this.fill.style.width = p * 100 + "%";
    this.thumb.style.left = p * 100 + "%";
    const text = fmtTime(t) + " / " + fmtTime(this.duration);
    if (this.time.textContent !== text) this.time.textContent = text;
    this.track.setAttribute("aria-valuenow", String(Math.round(t)));
    this.track.setAttribute("aria-valuetext", fmtTime(t));
  }
  showReturn(dir) { this.ret.classList.add("is-shown"); this.ret.classList.toggle("is-up", dir === "up"); }
  hideReturn() { this.ret.classList.remove("is-shown"); }

  _bindScrub() {
    const at = (e) => { const r = this.track.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * this.duration; };
    this.track.addEventListener("pointerdown", (e) => {
      if (!this.duration) return;
      this._scrubbing = true;
      this.root.classList.add("is-scrubbing");
      this.track.setPointerCapture(e.pointerId);
      const move = (ev) => { const t = at(ev); const p = t / this.duration; this.fill.style.width = p * 100 + "%"; this.thumb.style.left = p * 100 + "%"; this.time.textContent = fmtTime(t) + " / " + fmtTime(this.duration); this._pending = t; };
      move(e);
      const up = () => {
        this._scrubbing = false;
        this.root.classList.remove("is-scrubbing");
        this.track.removeEventListener("pointermove", move);
        this.track.removeEventListener("pointerup", up);
        this.track.removeEventListener("pointercancel", up);
        if (this._pending != null && this.handlers.onSeek) this.handlers.onSeek(this._pending);
        this._pending = null;
      };
      this.track.addEventListener("pointermove", move);
      this.track.addEventListener("pointerup", up);
      this.track.addEventListener("pointercancel", up);
    });
    this.track.addEventListener("keydown", (e) => {
      if (!this.handlers.onSeek) return;
      const now = Number(this.track.getAttribute("aria-valuenow")) || 0;
      if (e.key === "ArrowRight") { e.preventDefault(); this.handlers.onSeek(now + 5); }
      if (e.key === "ArrowLeft") { e.preventDefault(); this.handlers.onSeek(Math.max(0, now - 5)); }
    });
  }
}
