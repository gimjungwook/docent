#!/usr/bin/env node
// Docent compiler: content/lessons/<id>.md -> data/lessons/<id>.json + lessons/<id>.html, and index.html.
// Usage: node scripts/compile.mjs [lessonId ...]   (default: every lesson with a script)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const warnings = [];
const fail = (msg) => { throw new Error(msg); };
const warn = (msg) => warnings.push(msg);

// Hold times (ms). The voice pipeline inserts this silence so effects can finish while the camera holds still.
const HOLD = { sentence: 280, paragraph: 520, pop: 300, burst: 900, flip: 800, run: 500, step: 450,
  introBefore: 1500, introAfter: 1700, chapterBefore: 450, chapterAfter: 1000,
  checkpointBefore: 450, checkpointAfter: 900, outroBefore: 1700, outroAfter: 1400 };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- parsing ----------
function parseFrontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) fail("front matter missing");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/);
    if (mm) meta[mm[1]] = mm[2];
  }
  return { meta, body: src.slice(m[0].length) };
}

function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(/(\w+)=("([^"]*)"|(\S+))/g)) out[m[1]] = m[3] ?? m[4];
  return out;
}

function parseBlocks(body) {
  const lines = body.split("\n");
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: "para", text: para.join(" ") }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const until = (end) => { const acc = []; i++; while (i < lines.length && lines[i].trim() !== end) { acc.push(lines[i]); i++; } if (i >= lines.length) fail("unclosed " + end); return acc; };
    let m;
    if (!t) { flush(); continue; }
    if ((m = t.match(/^#\s+(.+)$/))) { flush(); blocks.push({ type: "chapter", title: m[1].trim() }); continue; }
    if ((m = t.match(/^\[intro\]\s*(.+)$/))) { flush(); blocks.push({ type: "intro", text: m[1] }); continue; }
    if ((m = t.match(/^\[code\s+([\w-]+)\]$/))) { flush(); blocks.push({ type: "code", id: m[1], code: until("[/code]").join("\n").replace(/\s+$/, "") }); continue; }
    if ((m = t.match(/^\[figure\s+([\w-]+)\s+([\w-]+)(.*)\]$/))) { flush(); blocks.push({ type: "figure", id: m[1], figure: m[2], attrs: parseAttrs(m[3]), caption: until("[/figure]").join(" ").trim() }); continue; }
    if (t === "[tip]") { flush(); blocks.push({ type: "tip", text: until("[/tip]").join(" ").trim() }); continue; }
    if ((m = t.match(/^\[turn\s+([\w-]+)(.*)\]$/))) { flush(); const a = parseAttrs(m[2]); blocks.push({ type: "turn", id: m[1], front: a.front, back: a.back }); continue; }
    if ((m = t.match(/^\[checkpoint\]\s*(.+)$/))) { flush(); blocks.push({ type: "checkpoint", text: m[1] }); continue; }
    if (t === "[outro]") { flush(); blocks.push({ type: "outro", recap: until("[/outro]").map((l) => l.trim().replace(/^-\s*/, "")).filter(Boolean) }); continue; }
    if ((m = t.match(/^\[outro-say\]\s*(.+)$/))) { flush(); const o = [...blocks].reverse().find((b) => b.type === "outro"); if (!o) fail("[outro-say] before [outro]"); o.say = m[1]; continue; }
    if (t === "[practice]") { flush(); blocks.push({ type: "practice" }); continue; }
    para.push(t);
  }
  flush();
  return blocks;
}

// Inline atoms: text, code (with spoken form), sub (shown|spoken), tags.
const INLINE = /\x60([^\x60]+)\x60\{([^{}]*)\}|\x60([^\x60]+)\x60|\{([^{}|]+)\|([^{}]+)\}|\[(pop|\/pop|burst)\]|\[run\s+([\w-]+)(?::(\d+))?\]|\[step\s+([\w-]+)\s+(\d+)\]|\[flip\s+([\w-]+)\]/g;
function atomize(str, { narrated = true } = {}) {
  const atoms = [];
  let last = 0;
  for (const m of str.matchAll(INLINE)) {
    if (m.index > last) atoms.push({ k: "text", s: str.slice(last, m.index) });
    if (m[1] !== undefined) atoms.push({ k: "code", d: m[1], sp: m[2].trim() });
    else if (m[3] !== undefined) { if (narrated) fail("inline code needs a spoken form: \x60" + m[3] + "\x60{…}"); atoms.push({ k: "code", d: m[3], sp: "" }); }
    else if (m[4] !== undefined) atoms.push({ k: "sub", d: m[4], sp: m[5].trim() });
    else if (m[6] === "pop") atoms.push({ k: "popOpen" });
    else if (m[6] === "/pop") atoms.push({ k: "popClose" });
    else if (m[6] === "burst") atoms.push({ k: "cue", fx: "burst" });
    else if (m[7] !== undefined) atoms.push({ k: "cue", fx: "run", target: m[7], line: m[8] ? Number(m[8]) : undefined });
    else if (m[9] !== undefined) atoms.push({ k: "cue", fx: "step", target: m[9], n: Number(m[10]) });
    else if (m[11] !== undefined) atoms.push({ k: "cue", fx: "flip", target: m[11] });
    last = m.index + m[0].length;
  }
  if (last < str.length) atoms.push({ k: "text", s: str.slice(last) });
  return atoms;
}

// Split atoms into sentences at . ? ! (plus closing quotes) followed by whitespace, only inside text atoms.
function splitSentences(atoms) {
  const out = [];
  let cur = [];
  for (const a of atoms) {
    if (a.k !== "text") { cur.push(a); continue; }
    let s = a.s;
    const re = /([.?!…]+["'’”)]*)(\s+)/g;
    let m, last = 0;
    while ((m = re.exec(s))) {
      const end = m.index + m[1].length;
      cur.push({ k: "text", s: s.slice(last, end) });
      out.push(cur); cur = [];
      last = end + m[2].length;
    }
    if (last < s.length) cur.push({ k: "text", s: s.slice(last) });
  }
  if (cur.some((a) => a.k !== "text" || a.s.trim())) out.push(cur);
  return out.map(trimSentence).filter((s) => s.length);
}
function trimSentence(atoms) {
  const a = atoms.map((x) => ({ ...x }));
  while (a.length && a[0].k === "text" && !a[0].s.trim()) a.shift();
  if (a.length && a[0].k === "text") a[0].s = a[0].s.replace(/^\s+/, "");
  while (a.length && a[a.length - 1].k === "text" && !a[a.length - 1].s.trim()) a.pop();
  if (a.length && a[a.length - 1].k === "text") a[a.length - 1].s = a[a.length - 1].s.replace(/\s+$/, "");
  return a;
}

const SAY_STRIP = /[‘’“”"'()\[\]«»]/g;
const cleanSay = (s) => s.replace(SAY_STRIP, "").replace(/\s+/g, " ").trim();

// Build units (whitespace-delimited display words; code/sub atoms are atomic) for one sentence.
function buildSegment(atoms, segId, ctx) {
  const units = [];
  let cur = null;
  let inPop = false;
  const pendingCues = [];
  const newUnit = () => { cur = { html: "", say: "", cues: [], pop: false }; units.push(cur); for (const c of pendingCues.splice(0)) cur.cues.push(c); };
  const ensure = () => { if (!cur) newUnit(); };
  const addPiece = (html, say) => {
    ensure();
    if (inPop) { cur.popHtml = (cur.popHtml || "") + html; } else { cur.html += html; }
    cur.say += say;
  };
  const closePopIfOpen = () => { if (cur && cur.popHtml !== undefined && cur.popHtml !== null) { cur.html += '<span class="fx-pop" data-fx="pop">' + cur.popHtml + "</span>"; cur.popHtml = null; cur.pop = true; } };
  for (const a of atoms) {
    if (a.k === "text") {
      const parts = a.s.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        if (/^\s+$/.test(p)) { if (inPop) fail(segId + ": [pop] must stay inside one word"); cur = null; continue; }
        addPiece(esc(p), p);
      }
    } else if (a.k === "code") { addPiece('<code class="ic">' + esc(a.d) + "</code>", a.sp); }
    else if (a.k === "sub") { addPiece(esc(a.d), a.sp); }
    else if (a.k === "popOpen") { ensure(); if (cur.pop || cur.popHtml) fail(segId + ": two pops in one word"); inPop = true; cur.popHtml = ""; }
    else if (a.k === "popClose") { inPop = false; closePopIfOpen(); }
    else if (a.k === "cue") { if (cur && cur.html === "" && cur.popHtml == null) cur.cues.push(a); else pendingCues.push(a); }
  }
  if (inPop) fail(segId + ": unclosed [pop]");
  if (pendingCues.length) { if (!units.length) fail(segId + ": cue without words"); units[units.length - 1].cues.push(...pendingCues); }

  // Spoken words and ranges.
  const sayWords = [];
  const outUnits = [];
  const cues = [];
  let html = "";
  units.forEach((u, i) => {
    const words = cleanSay(u.say).split(" ").filter(Boolean);
    const from = sayWords.length;
    sayWords.push(...words);
    outUnits.push({ text: u.html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"'), say: [from, sayWords.length] });
    const uid = segId + "-u" + i;
    let uhtml = u.html;
    if (u.pop) { uhtml = uhtml.replace('<span class="fx-pop" data-fx="pop">', '<span class="fx-pop" data-fx="pop" id="' + uid + '-pop">'); cues.push({ unit: i, fx: "pop", target: uid + "-pop" }); ctx.counts.pop++; ctx.paraPops++; }
    for (const c of u.cues) {
      const cue = { unit: i, fx: c.fx, target: c.fx === "burst" ? uid : c.target };
      if (c.line) cue.line = c.line;
      if (c.n !== undefined) cue.n = c.n;
      cues.push(cue);
      ctx.counts[c.fx] = (ctx.counts[c.fx] || 0) + 1;
      if (c.fx === "burst") ctx.chapterBursts++;
      if (c.fx !== "burst") ctx.refs.push({ seg: segId, fx: c.fx, target: c.target });
    }
    const isBurst = u.cues.some((c) => c.fx === "burst");
    html += (i ? " " : "") + '<span class="u" id="' + uid + '"' + (isBurst ? ' data-fx="burst"' : "") + ">" + uhtml + "</span>";
  });
  const say = sayWords.join(" ");
  if (/[A-Za-z0-9]/.test(say)) warn(segId + ": spoken text still contains Latin letters or digits -> " + say);
  const text = outUnits.map((u) => u.text).join(" ");
  let pauseAfter = HOLD.sentence;
  for (const c of cues) pauseAfter = Math.max(pauseAfter, HOLD.sentence + (HOLD[c.fx] || 0));
  return { seg: { id: segId, text, say, units: outUnits, cues, pauseBefore: 0, pauseAfter }, html };
}

// ---------- code ----------
function runCode(blocks) {
  if (!blocks.length) return {};
  const res = JSON.parse(execFileSync("python3", [rel("scripts/check_code.py")], { input: JSON.stringify(blocks.map((b) => ({ id: b.id, code: b.code }))), encoding: "utf8" }));
  const map = {};
  for (const r of res) { if (r.error) fail("code " + r.id + " raised " + r.error.type + ": " + r.error.message + " (line " + r.error.line + ")"); map[r.id] = r.lines; }
  return map;
}

// ---------- compile one lesson ----------
function compileLesson(id, course) {
  const src = fs.readFileSync(rel("content/lessons", id + ".md"), "utf8");
  const { meta, body: scriptBody } = parseFrontMatter(src);
  const blocks = parseBlocks(scriptBody);
  const outputs = runCode(blocks.filter((b) => b.type === "code"));
  const ctx = { counts: { pop: 0 }, refs: [], paraPops: 0, chapterBursts: 0 };
  const segments = [];
  const chapters = [];
  const html = [];
  const ids = new Set();
  let segN = 0, paraN = 0, tipN = 0, chapter = null;
  const nextSeg = () => "s" + ++segN;
  const narrate = (text, blockId, opts = {}) => {
    const sentences = opts.single ? [atomize(text)] : splitSentences(atomize(text));
    const parts = [];
    sentences.forEach((atoms, i) => {
      const { seg, html: h } = buildSegment(trimSentence(atoms), nextSeg(), ctx);
      seg.block = blockId; seg.chapter = chapter ? chapter.id : null;
      if (i === sentences.length - 1) seg.pauseAfter = Math.max(seg.pauseAfter, HOLD.paragraph);
      segments.push(seg);
      parts.push('<span class="seg" data-seg="' + seg.id + '">' + h + "</span>");
    });
    return parts.join(" ");
  };
  const lessonCourse = { id: course.id, title: course.title };
  const nextLesson = meta.next ? course.lessons.find((l) => l.id === meta.next) : null;

  for (const b of blocks) {
    if (b.type === "intro") {
      const segHtml = narrate(b.text, "intro", { single: true });
      const s = segments[segments.length - 1];
      s.pauseBefore = HOLD.introBefore; s.pauseAfter = HOLD.introAfter;
      s.cues.unshift({ unit: 0, fx: "intro", target: "intro", lead: HOLD.introBefore });
      html.push('<section class="blk intro" id="intro" data-fx="intro" data-motif="' + esc(meta.motif || "generic") + '">\n  <div class="intro-stage" aria-hidden="true"></div>\n  <div class="intro-copy">\n    <p class="intro-course">' + esc(course.title) + '</p>\n    <p class="intro-number">' + String(meta.number).padStart(2, "0") + '</p>\n    <h1 class="intro-title">' + esc(meta.title) + '</h1>\n    <p class="intro-subtitle">' + esc(meta.subtitle) + '</p>\n    <p class="intro-voice" hidden>' + segHtml + "</p>\n  </div>\n</section>");
      ids.add("intro");
    } else if (b.type === "chapter") {
      if (chapter && ctx.chapterBursts > 1) fail(chapter.id + ": more than one [burst] in a chapter");
      ctx.chapterBursts = 0;
      chapter = { id: "ch" + (chapters.length + 1), title: b.title, block: "ch" + (chapters.length + 1) };
      chapters.push(chapter);
      const segHtml = narrate(b.title, chapter.id, { single: true });
      const s = segments[segments.length - 1];
      s.pauseBefore = HOLD.chapterBefore; s.pauseAfter = HOLD.chapterAfter;
      s.cues.unshift({ unit: 0, fx: "chapter", target: chapter.id, lead: HOLD.chapterBefore });
      html.push('<section class="blk chapter" id="' + chapter.id + '" data-fx="chapter" data-index="' + chapters.length + '">\n  <p class="chapter-index" aria-hidden="true">' + chapters.length + '</p>\n  <h2 class="chapter-title">' + segHtml + "</h2>\n</section>");
      ids.add(chapter.id);
    } else if (b.type === "para") {
      const pid = "p" + ++paraN;
      ctx.paraPops = 0;
      const segHtml = narrate(b.text, pid);
      if (ctx.paraPops > 1) fail(pid + ": more than one [pop] in a paragraph");
      html.push('<p class="blk para" id="' + pid + '">' + segHtml + "</p>");
      ids.add(pid);
    } else if (b.type === "code") {
      const lines = b.code.split("\n");
      const out = outputs[b.id] || [];
      html.push('<figure class="blk code" id="' + b.id + '" data-fx="run" data-lines="' + lines.length + '">\n  <pre><code>' + lines.map((l, i) => '<span class="ln" data-line="' + (i + 1) + '">' + esc(l) + "</span>").join("\n") + "</code></pre>\n  " +
        (out.length ? '<div class="out" aria-label="실행 결과">' + out.map((o) => '<span class="out-line" data-from="' + o.from + '">' + esc(o.text) + "</span>").join("\n") + "</div>" : '<div class="out out-empty" aria-label="실행 결과"></div>') + "\n</figure>");
      ids.add(b.id);
    } else if (b.type === "figure") {
      const from = Number(b.attrs.from ?? 0), to = Number(b.attrs.to ?? from);
      html.push('<figure class="blk figure" id="' + b.id + '" data-fx="step" data-figure="' + esc(b.figure) + '" data-from="' + from + '" data-to="' + to + '">\n  <div class="figure-stage" aria-hidden="true"></div>\n  <figcaption>' + inlineStatic(b.caption) + "</figcaption>\n</figure>");
      ids.add(b.id);
    } else if (b.type === "tip") {
      const tid = "tip" + ++tipN;
      html.push('<aside class="blk tip" id="' + tid + '"><p class="tip-label">참고</p><p>' + inlineStatic(b.text) + "</p></aside>");
    } else if (b.type === "turn") {
      if (ctx.counts.turn) fail("more than one [turn] in a lesson");
      ctx.counts.turn = 1;
      html.push('<div class="blk turn" id="' + b.id + '" data-fx="flip">\n  <div class="turn-card"><div class="turn-front">' + esc(b.front) + '</div><div class="turn-back">' + esc(b.back) + "</div></div>\n</div>");
      ids.add(b.id);
    } else if (b.type === "checkpoint") {
      if (ctx.counts.checkpoint) fail("more than one [checkpoint]");
      ctx.counts.checkpoint = 1;
      const first = segments.length;
      const segHtml = narrate(b.text, "checkpoint");
      segments[first].pauseBefore = HOLD.checkpointBefore;
      segments[first].cues.unshift({ unit: 0, fx: "checkpoint", target: "checkpoint", lead: HOLD.checkpointBefore });
      segments[segments.length - 1].pauseAfter = HOLD.checkpointAfter;
      html.push('<section class="blk checkpoint" id="checkpoint" data-fx="checkpoint" data-progress="__PROGRESS__">\n  <div class="checkpoint-ring" aria-hidden="true"></div>\n  <p class="checkpoint-text">' + segHtml + "</p>\n</section>");
      ids.add("checkpoint");
    } else if (b.type === "outro") {
      const first = segments.length;
      const segHtml = b.say ? narrate(b.say, "outro") : "";
      if (b.say) {
        segments[first].pauseBefore = HOLD.outroBefore;
        segments[first].cues.unshift({ unit: 0, fx: "outro", target: "outro", lead: HOLD.outroBefore });
        segments[segments.length - 1].pauseAfter = HOLD.outroAfter;
      }
      const next = nextLesson ? (nextLesson.status === "ready"
        ? '<a class="outro-next" href="' + nextLesson.id + '.html"><span class="outro-next-label">다음 레슨</span><strong>' + esc(nextLesson.title) + "</strong><em>" + esc(nextLesson.subtitle) + "</em></a>"
        : '<p class="outro-next is-planned"><span class="outro-next-label">다음 레슨 · 준비 중</span><strong>' + esc(nextLesson.title) + "</strong><em>" + esc(nextLesson.subtitle) + "</em></p>") : "";
      html.push('<section class="blk outro" id="outro" data-fx="outro">\n  <p class="outro-kicker">레슨 ' + meta.number + ' 마침</p>\n  <h2 class="outro-title">오늘 배운 것</h2>\n  <ol class="recap">' + b.recap.map((r) => "<li>" + inlineStatic(r) + "</li>").join("") + '</ol>\n  <p class="outro-say">' + segHtml + "</p>\n  " + next + "\n</section>");
      ids.add("outro");
    } else if (b.type === "practice") {
      html.push('<section class="blk practice" id="practice" data-practice="' + esc(meta.id) + '" aria-label="직접 해 보기">\n  <noscript><p>직접 해 보기는 자바스크립트가 켜져 있어야 동작해요.</p></noscript>\n</section>');
      ids.add("practice");
    }
  }
  if (ctx.chapterBursts > 1) fail(chapter.id + ": more than one [burst] in a chapter");
  if (ctx.counts.checkpoint !== 1) fail("[checkpoint] must appear exactly once");
  for (const r of ctx.refs) if (!ids.has(r.target)) fail(r.seg + ": " + r.fx + " target '" + r.target + "' does not exist");

  // Checkpoint progress = share of spoken characters before it.
  const total = segments.reduce((n, s) => n + s.say.length, 0);
  const cpIdx = segments.findIndex((s) => s.block === "checkpoint");
  const before = segments.slice(0, cpIdx).reduce((n, s) => n + s.say.length, 0);
  const progress = Math.round((before / total) * 100) / 100;
  const body = html.join("\n\n").replace("__PROGRESS__", String(progress));

  const lesson = { id: meta.id, number: Number(meta.number), title: meta.title, subtitle: meta.subtitle, motif: meta.motif || "generic",
    course: lessonCourse, next: nextLesson ? { id: nextLesson.id, title: nextLesson.title, status: nextLesson.status } : null,
    chapters, segments, stats: { segments: segments.length, spokenChars: total, estimatedSeconds: Math.round(total / 6.2 + segments.reduce((n, s) => n + s.pauseBefore + s.pauseAfter, 0) / 1000) } };
  return { lesson, body, meta };
}

function inlineStatic(s) {
  return atomize(s, { narrated: false }).map((a) => a.k === "text" ? esc(a.s) : a.k === "code" ? '<code class="ic">' + esc(a.d) + "</code>" : a.k === "sub" ? esc(a.d) : "").join("");
}

// ---------- pages ----------
const HEAD = (title, base, desc) => '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>' + esc(title) + '</title>\n<meta name="description" content="' + esc(desc) + '">\n<meta name="theme-color" content="#0b0d12">\n<link rel="icon" href="' + base + 'assets/favicon.svg" type="image/svg+xml">\n' +
  ["tokens", "base", "layout", "components", "engine", "practice"].map((n) => '<link rel="stylesheet" href="' + base + "styles/" + n + '.css">').join("\n") + "\n</head>\n";

function timingsFor(id) { try { return JSON.parse(fs.readFileSync(rel("data", id + ".timings.json"), "utf8")); } catch { return null; } }
const fmtMin = (sec) => Math.max(1, Math.round(sec / 60)) + "분";

function sidebar(course, current, chapters) {
  return '<nav class="sidebar" id="sidebar" aria-label="코스 목차">\n  <a class="sidebar-course" href="../index.html">' + esc(course.title) + '</a>\n  <ol class="sidebar-lessons">\n' + course.lessons.map((l) => {
    if (l.id === current) return '    <li class="is-current"><a href="' + l.id + '.html" aria-current="page"><span class="n">' + l.number + "</span>" + esc(l.title) + '</a>\n      <ol class="sidebar-chapters">\n' + chapters.map((c) => '        <li><a href="#' + c.id + '" data-chapter="' + c.id + '">' + esc(c.title) + "</a></li>").join("\n") + '\n        <li><a href="#practice" data-chapter="practice">직접 해 보기</a></li>\n      </ol>\n    </li>';
    if (l.status === "ready") return '    <li><a href="' + l.id + '.html"><span class="n">' + l.number + "</span>" + esc(l.title) + "</a></li>";
    return '    <li class="is-planned"><span class="sidebar-planned"><span class="n">' + l.number + "</span>" + esc(l.title) + '<em>준비 중</em></span></li>';
  }).join("\n") + "\n  </ol>\n</nav>";
}

function topbar(base, crumb) {
  return '<header class="topbar">\n  <button class="topbar-menu" type="button" aria-controls="sidebar" aria-expanded="false"><span class="sr-only">목차 열기</span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>\n  <a class="brand" href="' + base + 'index.html"><span class="brand-mark" aria-hidden="true">&gt;&gt;&gt;</span><span class="brand-name">Docent</span></a>\n  ' + (crumb || "") + '\n  <button class="topbar-taste" type="button" aria-haspopup="dialog" aria-expanded="false">시안 비교</button>\n</header>';
}

function renderLesson(compiled, course) {
  const { lesson, body } = compiled;
  const crumb = '<p class="topbar-crumb"><a href="../index.html">' + esc(course.title) + '</a><span aria-hidden="true">/</span><span>' + lesson.number + ". " + esc(lesson.title) + "</span></p>";
  return HEAD(lesson.title + " — " + course.title + " · Docent", "../", lesson.subtitle) +
    '<body class="page-lesson" data-lesson="' + lesson.id + '" data-base="../">\n<a class="skip-link" href="#lesson">본문으로 건너뛰기</a>\n' + topbar("../", crumb) + '\n<div class="shell">\n' + sidebar(course, lesson.id, lesson.chapters) + '\n<main class="lesson" id="lesson">\n' + body + '\n</main>\n</div>\n<script type="module" src="../src/app.js"></script>\n</body>\n</html>\n';
}

function renderCourse(course, compiledById) {
  const cards = course.lessons.map((l) => {
    const c = compiledById[l.id];
    const t = timingsFor(l.id);
    const dur = t ? fmtMin(t.duration) : c ? "약 " + fmtMin(c.lesson.stats.estimatedSeconds) : "";
    const ready = l.status === "ready" && c;
    const inner = '<span class="toc-motif" data-motif="' + esc(l.motif) + '" aria-hidden="true"></span>\n      <span class="toc-number">레슨 ' + l.number + '</span>\n      <strong class="toc-title">' + esc(l.title) + '</strong>\n      <span class="toc-subtitle">' + esc(l.subtitle) + '</span>\n      <span class="toc-meta">' + (ready ? (c.lesson.chapters.length + "개 장 · " + dur) : "준비 중") + "</span>";
    return ready ? '    <li><a class="toc-card" href="lessons/' + l.id + '.html">\n      ' + inner + "\n    </a></li>" : '    <li><div class="toc-card is-planned" aria-disabled="true">\n      ' + inner + "\n    </div></li>";
  }).join("\n");
  const first = course.lessons.find((l) => l.status === "ready");
  return HEAD(course.title + " · Docent", "", course.subtitle) +
    '<body class="page-course" data-base="">\n<a class="skip-link" href="#course">본문으로 건너뛰기</a>\n' + topbar("", "") + '\n<main class="course" id="course">\n' +
    '<section class="blk intro intro-course-hero" id="intro" data-fx="intro" data-motif="generic">\n  <div class="intro-stage" aria-hidden="true"></div>\n  <div class="intro-copy">\n    <p class="intro-course">Docent 코스</p>\n    <p class="intro-number">입문</p>\n    <h1 class="intro-title">' + esc(course.title) + '</h1>\n    <p class="intro-subtitle">' + esc(course.subtitle) + '</p>\n  </div>\n</section>\n\n' +
    '<section class="course-start">\n  <div class="course-start-copy">\n    <p class="course-lead">글로 읽으면 교과서처럼, 재생 버튼을 누르면 옆에서 설명해 주는 강의처럼 봅니다. 레슨이 끝나면 내 관심사에 맞춘 문제로 직접 연습해요.</p>\n    ' + (first ? '<a class="btn btn-primary" href="lessons/' + first.id + '.html">첫 레슨 시작하기</a>' : "") + '\n  </div>\n</section>\n\n' +
    '<section class="course-toc" aria-labelledby="toc-heading">\n  <div class="course-toc-head"><h2 id="toc-heading">레슨</h2><p>' + course.lessons.length + '개 중 ' + course.lessons.filter((l) => l.status === "ready").length + '개 공개</p></div>\n  <ol class="toc-track">\n' + cards + '\n  </ol>\n</section>\n\n' +
    '<section class="course-how" aria-labelledby="how-heading">\n  <h2 id="how-heading">이렇게 공부해요</h2>\n  <ol class="how-list">\n    <li><strong>읽기</strong><span>스크롤하며 읽으면 그림과 코드가 필요한 자리에서 한 번씩 움직여요.</span></li>\n    <li><strong>듣기</strong><span>재생 버튼을 누르면 음성이 설명하고, 화면이 지금 읽는 곳을 따라가요. 언제든 직접 스크롤해도 돼요.</span></li>\n    <li><strong>해 보기</strong><span>레슨 끝에서 관심 있는 주제를 고르면 그 주제로 된 문제를 브라우저에서 바로 풀어요.</span></li>\n  </ol>\n</section>\n</main>\n<footer class="site-footer"><p>Docent · 파이썬 첫걸음 시안 · 2026</p></footer>\n<script type="module" src="src/app.js"></script>\n</body>\n</html>\n';
}

// ---------- main ----------
const course = JSON.parse(fs.readFileSync(rel("content/course.json"), "utf8"));
const wanted = process.argv.slice(2);
const ids = (wanted.length ? wanted : course.lessons.map((l) => l.id)).filter((id) => fs.existsSync(rel("content/lessons", id + ".md")));
const compiled = {};
for (const id of ids) {
  const c = compileLesson(id, course);
  compiled[id] = c;
  fs.mkdirSync(rel("data/lessons"), { recursive: true });
  fs.writeFileSync(rel("data/lessons", id + ".json"), JSON.stringify(c.lesson, null, 1) + "\n");
  fs.writeFileSync(rel("lessons", id + ".html"), renderLesson(c, course));
  console.log("compiled " + id + ": " + c.lesson.segments.length + " segments, " + c.lesson.chapters.length + " chapters, ~" + c.lesson.stats.estimatedSeconds + " s");
}
fs.writeFileSync(rel("index.html"), renderCourse(course, compiled));
console.log("wrote index.html");
if (warnings.length) { console.log("\nwarnings:"); for (const w of warnings) console.log("  - " + w); }
