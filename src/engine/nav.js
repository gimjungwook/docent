// Side navigation (drawer on narrow screens), chapter scroll-spy, and the top bar over dark bands.
export function mountNav() {
  const body = document.body;
  const btn = document.querySelector(".topbar-menu");
  const sidebar = document.getElementById("sidebar");
  const topbar = document.querySelector(".topbar");
  const setOpen = (on) => { body.classList.toggle("nav-open", on); btn && btn.setAttribute("aria-expanded", String(on)); };
  btn && btn.addEventListener("click", () => setOpen(!body.classList.contains("nav-open")));
  document.addEventListener("click", (e) => {
    if (!body.classList.contains("nav-open")) return;
    if (e.target.closest(".sidebar a")) setOpen(false);
    else if (!e.target.closest(".sidebar") && !e.target.closest(".topbar-menu")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  const links = sidebar ? [...sidebar.querySelectorAll("a[data-chapter]")] : [];
  const targets = links.map((a) => document.getElementById(a.dataset.chapter)).filter(Boolean);
  let current = null;
  const setActive = (id) => {
    if (id === current) return;
    current = id;
    let before = true;
    for (const a of links) {
      const on = a.dataset.chapter === id;
      if (on) before = false;
      a.classList.toggle("is-active", on);
      a.classList.toggle("is-done", before && !on);
      if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    }
  };

  const bands = [...document.querySelectorAll(".intro, .chapter, .outro")];
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const barH = topbar ? topbar.getBoundingClientRect().height : 0;
      if (topbar) topbar.classList.toggle("on-stage", bands.some((b) => { const r = b.getBoundingClientRect(); return r.top <= barH * 0.5 && r.bottom > barH * 0.5; }));
      if (body.classList.contains("is-narrating")) return;
      const line = window.innerHeight * 0.4;
      let id = null;
      for (const t of targets) if (t.getBoundingClientRect().top < line) id = t.id;
      if (id) setActive(id);
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
  return { setActive };
}
