// Structural checks for compiled lessons, generated pages and voice timings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const course = JSON.parse(fs.readFileSync(path.join(ROOT, "content/course.json"), "utf8"));
const lessons = course.lessons.filter((l) => fs.existsSync(path.join(ROOT, "data/lessons", l.id + ".json")));

for (const meta of lessons) {
  const lesson = JSON.parse(fs.readFileSync(path.join(ROOT, "data/lessons", meta.id + ".json"), "utf8"));
  const html = fs.readFileSync(path.join(ROOT, "lessons", meta.id + ".html"), "utf8");

  test(meta.id + ": units cover every spoken word exactly once", () => {
    for (const s of lesson.segments) {
      const words = s.say.split(/\s+/).filter(Boolean);
      let next = 0;
      for (const u of s.units) {
        assert.equal(u.say[0], next, s.id + " unit starts where the previous ended");
        assert.ok(u.say[1] >= u.say[0], s.id + " unit range is ordered");
        next = u.say[1];
      }
      assert.equal(next, words.length, s.id + " units end at the last spoken word");
    }
  });

  test(meta.id + ": spoken text is Hangul only (no digits or Latin letters)", () => {
    for (const s of lesson.segments) assert.doesNotMatch(s.say, /[A-Za-z0-9]/, s.id + ": " + s.say);
  });

  test(meta.id + ": every cue target and every segment exists on the page", () => {
    for (const s of lesson.segments) {
      assert.ok(html.includes('data-seg="' + s.id + '"'), "segment " + s.id);
      for (const c of s.cues) assert.ok(html.includes('id="' + c.target + '"'), s.id + " cue " + c.fx + " -> " + c.target);
    }
  });

  test(meta.id + ": component budgets hold", () => {
    const cues = lesson.segments.flatMap((s) => s.cues.map((c) => ({ ...c, chapter: s.chapter })));
    assert.equal(cues.filter((c) => c.fx === "checkpoint").length, 1, "exactly one checkpoint");
    assert.ok(cues.filter((c) => c.fx === "flip").length <= 1, "at most one flip");
    for (const ch of lesson.chapters) assert.ok(cues.filter((c) => c.fx === "burst" && c.chapter === ch.id).length <= 1, "one burst per chapter at most: " + ch.id);
  });

  const timingsPath = path.join(ROOT, "data", meta.id + ".timings.json");
  test(meta.id + ": voice timings match the compiled lesson", { skip: !fs.existsSync(timingsPath) }, () => {
    const t = JSON.parse(fs.readFileSync(timingsPath, "utf8"));
    const byId = new Map(t.segments.map((s) => [s.id, s]));
    let prevEnd = 0;
    for (const s of lesson.segments) {
      const ts = byId.get(s.id);
      assert.ok(ts, "timings for " + s.id);
      assert.equal(ts.words.length, s.say.split(/\s+/).filter(Boolean).length, s.id + " word count");
      assert.ok(ts.start >= prevEnd - 0.01, s.id + " starts after the previous segment");
      assert.ok(ts.end > ts.start, s.id + " has a length");
      for (const [a, b] of ts.words) assert.ok(a >= ts.start - 0.01 && b <= ts.end + 0.01 && b >= a, s.id + " word inside its segment");
      prevEnd = ts.end;
    }
    assert.ok(t.duration >= prevEnd, "duration covers the last segment");
  });
}
