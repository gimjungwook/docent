// Time index for a compiled lesson plus its voice timings.
export function buildTimeline(lesson, timings) {
  const byId = new Map((timings.segments || []).map((s) => [s.id, s]));
  const segs = [];
  for (const s of lesson.segments) {
    const t = byId.get(s.id);
    if (!t) continue;
    const words = t.words || [];
    const unitEls = s.units.map((_, k) => document.getElementById(s.id + "-u" + k));
    const unitTimes = s.units.map((u) => {
      const [a, b] = u.say;
      if (b > a && words[a] && words[b - 1]) return [words[a][0], words[b - 1][1]];
      const w = words[Math.min(a, words.length - 1)];
      return w ? [w[0], w[0]] : [t.start, t.start];
    });
    const cues = s.cues.map((c, k) => ({
      ...c,
      seg: s.id, idx: k,
      time: Math.max(0, (unitTimes[c.unit] ? unitTimes[c.unit][0] : t.start) - (c.lead || 0) / 1000),
    }));
    const el = document.querySelector('[data-seg="' + s.id + '"]');
    const speaker = s.speaker && s.speaker !== "narr" ? s.speaker : null;
    const rowEl = el ? el.closest("li.line") : null;
    segs.push({
      id: s.id, block: s.block, chapter: s.chapter, text: s.text,
      start: t.start, end: t.end,
      el,
      blockEl: document.getElementById(s.block),
      speaker,
      rowEl,
      // The speaking character: the avatar in its dialogue row, or the mascot beside an aside.
      actorEl: speaker ? (rowEl ? rowEl.querySelector(".line-avatar .actor") : document.getElementById(s.block + "-" + speaker)) : null,
      unitEls, unitTimes, cues,
    });
  }
  const cues = segs.flatMap((s) => s.cues).sort((a, b) => a.time - b.time);
  const chapters = lesson.chapters.map((c) => {
    const first = segs.find((s) => s.chapter === c.id);
    return { ...c, start: first ? Math.max(0, first.start - 0.5) : 0 };
  });
  return { segs, cues, chapters, duration: timings.duration };
}

// Index of the last segment whose start <= t (or -1).
export function indexAt(segs, t) {
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
