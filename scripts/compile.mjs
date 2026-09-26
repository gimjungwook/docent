#!/usr/bin/env node
// Docent compiler: content/lessons/<id>.md -> data/lessons/<id>.json + lessons/<id>.html, and index.html.
// Usage: node scripts/compile.mjs [lessonId ...]   (default: every lesson and story version with a script)
// v2 (2026-09-27): generic effect tags from the registry, scenes with characters and dialogue, mascot asides,
// per-speaker voices and story mode (no budgets, louder holds). Calm v1 lessons compile as before.
// Scenes keep the v0.1 page design: characters appear as avatars beside their own dialogue rows.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderFigure } from "../src/components/figures/index.js";
import { motifSVG } from "../src/components/intro/motifs.js";
import { EFFECTS, STYLES, CAST, CAST_BY_NAME, EXPRESSIONS, EMOTES, ACTIONS } from "../src/components/effects/registry.js";

let castArt = null;
try { const m = await import("../src/components/cast/index.js"); if (typeof m.renderActor === "function") castArt = m; } catch {}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const warnings = [];
const fail = (msg) => { throw new Error(msg); };
const warn = (msg) => warnings.push(msg);

// Hold times (ms). The voice pipeline inserts this silence so effects can finish while the camera holds still.
const HOLD = { sentence: 280, paragraph: 520, pop: 300, burst: 900, flip: 800, run: 500, step: 450,
  introBefore: 1500, introAfter: 1700, chapterBefore: 450, chapterAfter: 1000,
  checkpointBefore: 450, checkpointAfter: 900, outroBefore: 1700, outroAfter: 1400, sceneBefore: 450, lineAfter: 380 };
const FACTOR = { soft: 0.7, normal: 1, strong: 1.2 };
const HOLD_WEIGHT = { inline: 0.45, point: 1, block: 1, actor: 0.45 };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Final-state artwork inlined for readers without JavaScript; prime() swaps in the live versions.
const plate = (motif) => { try { return '<div class="intro-plate"><div class="intro-plate-in">' + motifSVG(motif) + "</div></div>"; } catch { return ""; } };
const figureArt = (name, step) => { try { return renderFigure(name, step); } catch { return ""; } };
const dataAttrs = (params) => Object.entries(params || {}).filter(([k]) => /^[a-z][a-z0-9-]*$/.test(k)).map(([k, v]) => " data-" + k + '="' + esc(v) + '"').join("");

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
  for (const m of String(s || "").matchAll(/(\w+)=("([^"]*)"|(\S+))/g)) out[m[1]] = m[3] ?? m[4];
  return out;
}

// Scene lines: "[narr] …", "민지: …", tag-only lines (their tags fire on the next line), or plain narration.
function parseLines(raw) {
  const out = [];
  let pending = "";
  for (const line of raw.map((l) => l.trim()).filter(Boolean)) {
    let m;
    if ((m = line.match(/^\[narr\]\s*(.*)$/))) { out.push({ speaker: "narr", text: (pending + " " + m[1]).trim() }); pending = ""; continue; }
    if ((m = line.match(/^([^\s:\[\]]+):\s*(.+)$/)) && CAST_BY_NAME[m[1]]) { out.push({ speaker: CAST_BY_NAME[m[1]], text: (pending + " " + m[2]).trim() }); pending = ""; continue; }
    if (/^(\[[^\[\]]+\]\s*)+$/.test(line)) { pending += " " + line; continue; }
    out.push({ speaker: "narr", text: (pending + " " + line).trim() });
    pending = "";
  }
  if (pending.trim()) { if (!out.length) fail("a scene needs at least one spoken line"); out[out.length - 1].text += " " + pending.trim(); }
  return out;
}

function parseBlocks(body) {
  const lines = body.split("\n");
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: "para", text: para.join(" ") }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const until = (end) => { const acc = []; i++; while (i < lines.length && lines[i].trim() !== end) { acc.push(lines[i]); i++; } if (i >= lines.length) fail("unclosed " + end); return acc; };
    let m;
    if (!t) { flush(); continue; }
    if ((m = t.match(/^#\s+(.+)$/))) { flush(); blocks.push({ type: "chapter", title: m[1].trim() }); continue; }
    if ((m = t.match(/^\[intro\]\s*(.+)$/))) { flush(); blocks.push({ type: "intro", text: m[1] }); continue; }
    if ((m = t.match(/^\[code\s+([\w-]+)(\s+error)?\]$/))) { flush(); blocks.push({ type: "code", id: m[1], expectError: !!m[2], code: until("[/code]").join("\n").replace(/\s+$/, "") }); continue; }
    if ((m = t.match(/^\[figure\s+([\w-]+)\s+([\w-]+)(.*)\]$/))) { flush(); blocks.push({ type: "figure", id: m[1], figure: m[2], attrs: parseAttrs(m[3]), caption: until("[/figure]").join(" ").trim() }); continue; }
    if (t === "[tip]") { flush(); blocks.push({ type: "tip", text: until("[/tip]").join(" ").trim() }); continue; }
    if ((m = t.match(/^\[turn\s+([\w-]+)(.*)\]$/))) { flush(); const a = parseAttrs(m[2]); blocks.push({ type: "turn", id: m[1], front: a.front, back: a.back }); continue; }
    if ((m = t.match(/^\[checkpoint\]\s*(.+)$/))) { flush(); blocks.push({ type: "checkpoint", text: m[1] }); continue; }
    if ((m = t.match(/^\[scene\s+([\w-]+)((?:\s+[^\s\]]+)*)\s*\]$/))) {
      flush();
      const tokens = m[2].trim().split(/\s+/).filter(Boolean);
      const attrs = parseAttrs(tokens.filter((x) => x.includes("=")).join(" "));
      const cast = tokens.filter((x) => !x.includes("=")).map((n) => CAST_BY_NAME[n] || fail("unknown character " + n + " in [scene " + m[1] + "]"));
      const menu = attrs.menu ? Object.fromEntries(attrs.menu.split(",").map((p) => p.split(":"))) : null;
      blocks.push({ type: "scene", id: m[1], cast, menu, lines: parseLines(until("[/scene]")) });
      continue;
    }
    if ((m = t.match(/^\[pai\]\s*(.+)$/))) { flush(); blocks.push({ type: "mascot", text: m[1] }); continue; }
    if (t === "[outro]") { flush(); blocks.push({ type: "outro", recap: until("[/outro]").map((l) => l.trim().replace(/^-\s*/, "")).filter(Boolean) }); continue; }
    if ((m = t.match(/^\[outro-say\]\s*(.+)$/))) { flush(); const o = [...blocks].reverse().find((b) => b.type === "outro"); if (!o) fail("[outro-say] before [outro]"); o.say = m[1]; continue; }
    if (t === "[practice]") { flush(); blocks.push({ type: "practice" }); continue; }
    para.push(t);
  }
  flush();
  return blocks;
}

// ---------- inline tokens ----------
const TOKEN = /\x60([^\x60]+)\x60\{([^{}]*)\}|\x60([^\x60]+)\x60|\{([^{}|]+)\|([^{}]+)\}|\[(\/?)([^\[\]\s]+)([^\[\]]*)\]/g;
const isInline = (n) => n === "pop" || (EFFECTS[n] && EFFECTS[n].kind === "inline");

// scope = where actor tags point: { kind: "scene", id, cast } or { kind: "mascot", id }.
function atomize(str, { narrated = true, scope = null } = {}) {
  const atoms = [];
  let last = 0;
  for (const m of str.matchAll(TOKEN)) {
    if (m.index > last) atoms.push({ k: "text", s: str.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1] !== undefined) { atoms.push({ k: "code", d: m[1], sp: m[2].trim() }); continue; }
    if (m[3] !== undefined) { if (narrated) fail("inline code needs a spoken form: \x60" + m[3] + "\x60{…}"); atoms.push({ k: "code", d: m[3], sp: "" }); continue; }
    if (m[4] !== undefined) { atoms.push({ k: "sub", d: m[4], sp: m[5].trim() }); continue; }
    const close = m[6] === "/", name = m[7], rest = (m[8] || "").trim();
    if (!narrated) continue;
    if (close) { if (!isInline(name)) fail("[/" + name + "] is not a wrapping effect"); atoms.push({ k: "close", name }); continue; }
    if (isInline(name)) { atoms.push({ k: "open", name, params: parseAttrs(rest) }); continue; }
    if (name === "burst") { atoms.push({ k: "cue", fx: "burst" }); continue; }
    if (name === "run") { const [id, line] = rest.split(":"); atoms.push({ k: "cue", fx: "run", target: id, line: line ? Number(line) : undefined }); continue; }
    if (name === "step") { const [id, n] = rest.split(/\s+/); atoms.push({ k: "cue", fx: "step", target: id, n: Number(n) }); continue; }
    if (name === "flip") { atoms.push({ k: "cue", fx: "flip", target: rest }); continue; }
    const e = EFFECTS[name];
    if (e && e.kind === "point") { atoms.push({ k: "point", fx: name, params: parseAttrs(rest) }); continue; }
    if (e && e.kind === "block") { const first = rest.split(/\s+/)[0]; if (!first) fail("[" + name + "] needs a block id"); atoms.push({ k: "cue", fx: name, target: first, params: parseAttrs(rest.slice(first.length)) }); continue; }
    if (name === "메뉴") {
      if (!scope || scope.kind !== "scene") fail("[메뉴 …] only works inside a scene");
      if (!scope.menu) fail("[메뉴 …] needs menu=… on [scene " + scope.id + "]");
      const [item, price] = rest.split(/\s+/);
      if (!(item in scope.menu)) fail("[메뉴 " + item + "] is not on the menu of [scene " + scope.id + "]");
      atoms.push({ k: "cue", fx: "menuprice", target: scope.id + "-menu", params: { item, price } });
      continue;
    }
    if (CAST_BY_NAME[name]) {
      const who = CAST_BY_NAME[name];
      if (!scope) fail("[" + name + " " + rest + "] needs a scene or a mascot aside");
      if (scope.kind === "scene" && !scope.cast.includes(who)) fail(name + " is not in [scene " + scope.id + "]");
      if (scope.kind === "mascot" && who !== "pai") fail("only 파이 can react in a mascot aside");
      let fx, params;
      if (EXPRESSIONS[rest]) { fx = "react"; params = { expr: EXPRESSIONS[rest] }; }
      else if (EMOTES[rest]) { fx = "emote"; params = { emote: EMOTES[rest] }; }
      else if (ACTIONS[rest]) { fx = "act"; params = { action: ACTIONS[rest] }; }
      else fail("unknown expression/emote/action '" + rest + "' for " + name);
      atoms.push({ k: "cue", fx, target: scope.kind === "scene" ? scope.avatarOf(who) : scope.id + "-" + who, params });
      continue;
    }
    fail("unknown tag [" + name + (rest ? " " + rest : "") + "]");
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
    const s = a.s;
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
  // Tags after a sentence's final punctuation ("…돼요. [confetti]") belong to that sentence: they fire on its last
  // word. Tags before the first sentence join the next one.
  const hasWords = (s) => s.some((a) => (a.k === "text" && a.s.trim()) || a.k === "code" || a.k === "sub");
  const merged = [];
  for (const s of out.map(trimSentence).filter((s) => s.length)) {
    if (!hasWords(s) && merged.length) merged[merged.length - 1].push(...s);
    else merged.push(s);
  }
  if (merged.length > 1 && !hasWords(merged[0])) merged[1].unshift(...merged.shift());
  return merged;
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
const stripTags = (h) => h.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

function holdFor(cue, ctx) {
  if (ctx.mode !== "story") return HOLD[cue.fx] || 0;
  const e = EFFECTS[cue.fx];
  if (e) return Math.round(e.dur * FACTOR[ctx.intensity] * (HOLD_WEIGHT[e.kind] ?? 1));
  return Math.round((HOLD[cue.fx] || 0) * FACTOR[ctx.intensity]);
}

// One sentence -> units (display words), spoken words, cues and HTML.
function buildSegment(atoms, segId, ctx) {
  const units = [];
  let cur = null;
  const pendingStart = [];
  const startUnit = () => { cur = { toks: [] }; units.push(cur); if (pendingStart.length) cur.toks.push(...pendingStart.splice(0)); };
  const hasWord = (u) => u && u.toks.some((t) => t.t === "w");
  for (const a of atoms) {
    if (a.k === "text") {
      for (const part of a.s.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { cur = null; continue; }
        if (!cur) startUnit();
        cur.toks.push({ t: "w", html: esc(part), say: part });
      }
    } else if (a.k === "code" || a.k === "sub") {
      if (!cur) startUnit();
      cur.toks.push({ t: "w", html: a.k === "code" ? '<code class="ic">' + esc(a.d) + "</code>" : esc(a.d), say: a.sp });
    } else if (a.k === "open") {
      const tok = { t: "open", name: a.name, params: a.params || {} };
      if (cur && hasWord(cur)) cur.toks.push(tok); else pendingStart.push(tok);
    } else if (a.k === "close") {
      const tok = { t: "close", name: a.name };
      if (cur) cur.toks.push(tok);
      else if (units.length) units[units.length - 1].toks.push(tok);
      else fail(segId + ": [/" + a.name + "] before any word");
    } else {
      const tok = { t: a.k === "point" ? "point" : "cue", a };
      if (cur && hasWord(cur)) cur.toks.push(tok); else pendingStart.push(tok);
    }
  }
  if (pendingStart.length) { if (!units.length) fail(segId + ": tags without words"); units[units.length - 1].toks.push(...pendingStart.splice(0)); }

  // Pair wrapping tags. Same word -> inner span; across words -> wrapper around whole words.
  const stack = [];
  const wrappers = [];
  let fxN = 0;
  units.forEach((u, ui) => u.toks.forEach((tk) => {
    if (tk.t === "open") stack.push({ ui, tk });
    else if (tk.t === "close") {
      const idx = stack.map((s) => s.tk.name).lastIndexOf(tk.name);
      if (idx < 0) fail(segId + ": [/" + tk.name + "] without an opening tag");
      const o = stack.splice(idx, 1)[0];
      const legacyPop = tk.name === "pop" && o.ui === ui;
      const id = legacyPop ? segId + "-u" + ui + "-pop" : segId + "-fx" + fxN++;
      o.tk.id = id;
      if (o.ui === ui) { o.tk.inner = true; tk.inner = true; tk.id = id; }
      else { o.tk.cross = true; tk.cross = true; wrappers.push({ name: tk.name, params: o.tk.params, from: o.ui, to: ui, id }); }
    }
  }));
  if (stack.length) fail(segId + ": unclosed [" + stack[0].tk.name + "]");
  for (const a of wrappers) for (const b of wrappers) {
    if (a !== b && a.from < b.from && b.from <= a.to && a.to < b.to) fail(segId + ": overlapping effects [" + a.name + "] and [" + b.name + "] must nest");
  }

  const sayWords = [];
  const outUnits = [];
  const cues = [];
  const unitHtml = [];
  let anchorN = 0;
  units.forEach((u, i) => {
    const uid = segId + "-u" + i;
    let inner = "";
    let say = "";
    let isBurst = false;
    for (const tk of u.toks) {
      if (tk.t === "w") { inner += tk.html; say += tk.say; }
      else if (tk.t === "open") {
        cues.push({ unit: i, fx: tk.name, target: tk.id, ...(Object.keys(tk.params).length ? { params: tk.params } : {}) });
        if (tk.inner) inner += tk.name === "pop" ? '<span class="fx-pop" data-fx="pop" id="' + tk.id + '">' : '<span class="fx fx-' + tk.name + '" data-fx="' + tk.name + '" id="' + tk.id + '"' + dataAttrs(tk.params) + ">";
      } else if (tk.t === "close") { if (tk.inner) inner += "</span>"; }
      else if (tk.t === "point") {
        const aid = uid + "-a" + anchorN++;
        inner += '<span class="fx-anchor" data-fx="' + tk.a.fx + '" id="' + aid + '"' + dataAttrs(tk.a.params) + "></span>";
        cues.push({ unit: i, fx: tk.a.fx, target: aid, ...(tk.a.params && Object.keys(tk.a.params).length ? { params: tk.a.params } : {}) });
      } else if (tk.t === "cue") {
        const c = tk.a;
        if (c.fx === "burst") isBurst = true;
        const cue = { unit: i, fx: c.fx, target: c.fx === "burst" ? uid : c.target };
        if (c.line) cue.line = c.line;
        if (c.n !== undefined) cue.n = c.n;
        if (c.params && Object.keys(c.params).length) cue.params = c.params;
        cues.push(cue);
        if (c.fx === "burst") ctx.chapterBursts++;
        if (c.fx !== "burst") ctx.refs.push({ seg: segId, fx: c.fx, target: c.target });
      }
    }
    const words = cleanSay(say).split(" ").filter(Boolean);
    const from = sayWords.length;
    sayWords.push(...words);
    outUnits.push({ text: stripTags(inner), say: [from, sayWords.length] });
    unitHtml.push('<span class="u" id="' + uid + '"' + (isBurst ? ' data-fx="burst"' : "") + ">" + inner + "</span>");
  });
  let html = "";
  unitHtml.forEach((h, i) => {
    const opening = wrappers.filter((w) => w.from === i).sort((a, b) => b.to - a.to);
    const closing = wrappers.filter((w) => w.to === i).sort((a, b) => a.from - b.from).reverse();
    html += (i ? " " : "") + opening.map((w) => '<span class="fx fx-' + w.name + '" data-fx="' + w.name + '" id="' + w.id + '"' + dataAttrs(w.params) + ">").join("") + h + closing.map(() => "</span>").join("");
  });
  ctx.paraPops += cues.filter((c) => c.fx === "pop").length;
  const say = sayWords.join(" ");
  if (/[A-Za-z0-9]/.test(say)) warn(segId + ": spoken text still contains Latin letters or digits -> " + say);
  let pauseAfter = HOLD.sentence;
  for (const c of cues) pauseAfter = Math.max(pauseAfter, HOLD.sentence + holdFor(c, ctx));
  return { seg: { id: segId, text: outUnits.map((u) => u.text).join(" "), say, units: outUnits, cues, pauseBefore: 0, pauseAfter }, html };
}

// ---------- code ----------
function runCode(blocks) {
  if (!blocks.length) return {};
  const res = JSON.parse(execFileSync("python3", [rel("scripts/check_code.py")], { input: JSON.stringify(blocks.map((b) => ({ id: b.id, code: b.code }))), encoding: "utf8" }));
  const map = {};
  for (const r of res) {
    const b = blocks.find((x) => x.id === r.id);
    if (r.error && !b.expectError) fail("code " + r.id + " raised " + r.error.type + ": " + r.error.message + " (line " + r.error.line + ")");
    if (!r.error && b.expectError) fail("code " + r.id + " is marked error but ran without one");
    map[r.id] = r.error ? [...r.lines, { from: r.error.line || 1, text: r.error.type + ": " + r.error.message.replace(/ \(<c\w*>, line \d+\)$/, ""), error: true }] : r.lines;
  }
  return map;
}

// ---------- compile one lesson ----------
function compileLesson(id, course) {
  const src = fs.readFileSync(rel("content/lessons", id + ".md"), "utf8");
  const { meta, body: scriptBody } = parseFrontMatter(src);
  if (meta.id && meta.id !== id) fail(id + ".md declares id " + meta.id);
  const mode = meta.mode === "story" ? "story" : "calm";
  const intensity = FACTOR[meta.intensity] ? meta.intensity : mode === "story" ? "strong" : "normal";
  const styles = {};
  for (const k of ["intro", "chapter", "checkpoint", "outro"]) {
    const v = meta[k + "Style"];
    if (v) { if (!STYLES[k].includes(v)) fail("unknown " + k + "Style " + v); styles[k] = v; }
  }
  const styleAttr = (k) => (styles[k] ? ' data-style="' + styles[k] + '"' : "");
  const blocks = parseBlocks(scriptBody);
  const outputs = runCode(blocks.filter((b) => b.type === "code"));
  const ctx = { mode, intensity, counts: { pop: 0 }, refs: [], paraPops: 0, chapterBursts: 0 };
  const segments = [];
  const chapters = [];
  const html = [];
  const ids = new Set();
  let segN = 0, paraN = 0, tipN = 0, mascotN = 0, chapter = null;
  const nextSeg = () => "s" + ++segN;
  const narrate = (text, blockId, opts = {}) => {
    const atoms = atomize(text, { scope: opts.scope || null });
    const sentences = opts.single ? [atoms] : splitSentences(atoms);
    const parts = [];
    sentences.forEach((sAtoms, i) => {
      const { seg, html: h } = buildSegment(trimSentence(sAtoms), nextSeg(), ctx);
      seg.block = blockId; seg.chapter = chapter ? chapter.id : null;
      if (opts.speaker) { seg.speaker = opts.speaker; if (opts.speaker !== "narr") seg.voice = CAST[opts.speaker].voice; }
      if (i === sentences.length - 1) seg.pauseAfter = Math.max(seg.pauseAfter, opts.lineEnd ? HOLD.lineAfter : HOLD.paragraph);
      segments.push(seg);
      parts.push('<span class="seg" data-seg="' + seg.id + '">' + h + "</span>");
    });
    return parts.join(" ");
  };
  const nextLesson = meta.next ? course.lessons.find((l) => l.id === meta.next) : null;
  const base = course.lessons.find((l) => l.id === id || l.story === id);

  for (const b of blocks) {
    if (b.type === "intro") {
      const segHtml = narrate(b.text, "intro", { single: true });
      const s = segments[segments.length - 1];
      s.pauseBefore = HOLD.introBefore; s.pauseAfter = HOLD.introAfter;
      s.cues.unshift({ unit: 0, fx: "intro", target: "intro", lead: HOLD.introBefore });
      html.push('<section class="blk intro" id="intro" data-fx="intro" data-motif="' + esc(meta.motif || "generic") + '"' + styleAttr("intro") + '>\n  <div class="intro-stage" aria-hidden="true">' + plate(meta.motif || "generic") + '</div>\n  <div class="intro-copy">\n    <p class="intro-course">' + esc(course.title) + '</p>\n    <p class="intro-number">' + String(meta.number).padStart(2, "0") + '</p>\n    <h1 class="intro-title">' + esc(meta.title) + '</h1>\n    <p class="intro-subtitle">' + esc(meta.subtitle) + '</p>\n    <p class="intro-voice" hidden>' + segHtml + "</p>\n  </div>\n</section>");
      ids.add("intro");
    } else if (b.type === "chapter") {
      if (mode === "calm" && chapter && ctx.chapterBursts > 1) fail(chapter.id + ": more than one [burst] in a chapter");
      ctx.chapterBursts = 0;
      chapter = { id: "ch" + (chapters.length + 1), title: b.title, block: "ch" + (chapters.length + 1) };
      chapters.push(chapter);
      const segHtml = narrate(b.title, chapter.id, { single: true });
      const s = segments[segments.length - 1];
      s.pauseBefore = HOLD.chapterBefore; s.pauseAfter = Math.round(HOLD.chapterAfter * (mode === "story" ? FACTOR[intensity] : 1));
      s.cues.unshift({ unit: 0, fx: "chapter", target: chapter.id, lead: HOLD.chapterBefore });
      html.push('<section class="blk chapter" id="' + chapter.id + '" data-fx="chapter" data-index="' + chapters.length + '"' + styleAttr("chapter") + '>\n  <p class="chapter-index" aria-hidden="true">' + chapters.length + '</p>\n  <h2 class="chapter-title">' + segHtml + "</h2>\n</section>");
      ids.add(chapter.id);
    } else if (b.type === "para") {
      const pid = "p" + ++paraN;
      ctx.paraPops = 0;
      const segHtml = narrate(b.text, pid);
      if (mode === "calm" && ctx.paraPops > 1) fail(pid + ": more than one [pop] in a paragraph");
      html.push('<p class="blk para" id="' + pid + '">' + segHtml + "</p>");
      ids.add(pid);
    } else if (b.type === "scene") {
      // Every character row carries its speaker's avatar (id <row>-<cast>). An actor tag points at the avatar
      // of that character in the same row, else the nearest earlier row, else the nearest later one.
      const rowIds = b.lines.map((_, k) => b.id + "-r" + (k + 1));
      const speakers = b.lines.map((ln) => ln.speaker);
      for (const who of new Set(speakers)) if (who !== "narr" && !b.cast.includes(who)) fail(CAST[who].name + " speaks in [scene " + b.id + "] but is not listed in it");
      const avatarOf = (who, k) => {
        if (speakers[k] === who) return rowIds[k] + "-" + who;
        for (let j = k - 1; j >= 0; j--) if (speakers[j] === who) return rowIds[j] + "-" + who;
        for (let j = k + 1; j < speakers.length; j++) if (speakers[j] === who) return rowIds[j] + "-" + who;
        return fail(CAST[who].name + " reacts in [scene " + b.id + "] but has no line there");
      };
      const first = segments.length;
      const texts = b.lines.map((ln, k) => {
        const scope = { kind: "scene", id: b.id, cast: b.cast, menu: b.menu, avatarOf: (who) => avatarOf(who, k) };
        const from = segments.length;
        const segHtml = narrate(ln.text, b.id, { scope, speaker: ln.speaker, lineEnd: true });
        return { segHtml, cues: segments.slice(from).flatMap((s) => s.cues) };
      });
      segments[first].pauseBefore = Math.max(segments[first].pauseBefore, HOLD.sceneBefore);
      // An avatar starts with the expression its character had at the end of the previous rows.
      const exprBefore = (who, k) => {
        let e = "neutral";
        for (let j = 0; j < k; j++) for (const c of texts[j].cues) if (c.fx === "react" && c.target.endsWith("-" + who)) e = c.params.expr;
        return e;
      };
      const avatar = (who, id, expr) => {
        let art = "";
        try { if (castArt) art = castArt.renderActor(who, expr, id); } catch (e) { warn(id + ": renderActor failed (" + e.message + ")"); }
        return art.includes('id="' + id + '"') ? art : '<div class="actor" id="' + id + '" data-actor="' + who + '" data-expr="' + expr + '" data-expr0="' + expr + '"></div>';
      };
      const rows = b.lines.map((ln, k) => {
        const rid = rowIds[k];
        if (ln.speaker === "narr") return '    <li class="line line-narr" id="' + rid + '"><p class="line-text">' + texts[k].segHtml + "</p></li>";
        return '    <li class="line" id="' + rid + '" data-speaker="' + ln.speaker + '"><div class="line-avatar">' + avatar(ln.speaker, rid + "-" + ln.speaker, exprBefore(ln.speaker, k)) +
          '</div><div class="line-body"><span class="line-name">' + esc(CAST[ln.speaker].name) + '</span><p class="line-text">' + texts[k].segHtml + "</p></div></li>";
      });
      let menu = "";
      if (b.menu) {
        const mid = b.id + "-menu";
        try { if (castArt && castArt.renderMenu) menu = castArt.renderMenu(mid, b.menu); } catch (e) { warn(mid + ": renderMenu failed (" + e.message + ")"); }
        if (!menu.includes('id="' + mid + '"')) menu = '<div class="menu-card" id="' + mid + '"><ul>' + Object.entries(b.menu).map(([item, price]) => '<li><span>' + esc(item) + '</span> <span class="menu-price" data-item="' + esc(item) + '" data-price0="' + esc(price) + '">' + esc(Number(price).toLocaleString("ko-KR")) + "원</span></li>").join("") + "</ul></div>";
        menu = "\n  " + menu;
      }
      html.push('<section class="blk scene" id="' + b.id + '" data-cast="' + b.cast.join(" ") + '">' + menu + '\n  <ol class="scene-lines">\n' + rows.join("\n") + "\n  </ol>\n</section>");
      ids.add(b.id);
    } else if (b.type === "mascot") {
      const mid = "m" + ++mascotN;
      const segHtml = narrate(b.text, mid, { scope: { kind: "mascot", id: mid }, speaker: "pai" });
      let art = "";
      try { if (castArt && castArt.renderActor) art = castArt.renderActor("pai", "happy", mid + "-pai"); } catch (e) { warn(mid + ": renderActor failed (" + e.message + ")"); }
      if (!art.includes('id="' + mid + '-pai"')) art += '<div class="actor" id="' + mid + '-pai" data-actor="pai"></div>';
      html.push('<aside class="blk mascot" id="' + mid + '" data-actor="pai">\n  <div class="mascot-art">' + art + '</div>\n  <p class="mascot-text">' + segHtml + "</p>\n</aside>");
      ids.add(mid);
    } else if (b.type === "code") {
      const lines = b.code.split("\n");
      const out = outputs[b.id] || [];
      html.push('<figure class="blk code' + (b.expectError ? " has-error" : "") + '" id="' + b.id + '" data-fx="run" data-lines="' + lines.length + '">\n  <pre><code>' + lines.map((l, i) => '<span class="ln" data-line="' + (i + 1) + '">' + esc(l) + "</span>").join("\n") + "</code></pre>\n  " +
        (out.length ? '<div class="out" aria-label="실행 결과">' + out.map((o) => '<span class="out-line' + (o.error ? " out-error" : "") + '" data-from="' + o.from + '">' + esc(o.text) + "</span>").join("\n") + "</div>" : '<div class="out out-empty" aria-label="실행 결과"></div>') + "\n</figure>");
      ids.add(b.id);
    } else if (b.type === "figure") {
      const from = Number(b.attrs.from ?? 0), to = Number(b.attrs.to ?? from);
      html.push('<figure class="blk figure" id="' + b.id + '" data-fx="step" data-figure="' + esc(b.figure) + '" data-from="' + from + '" data-to="' + to + '">\n  <div class="figure-stage" aria-hidden="true">' + figureArt(b.figure, to) + '</div>\n  <figcaption>' + inlineStatic(b.caption) + "</figcaption>\n</figure>");
      ids.add(b.id);
    } else if (b.type === "tip") {
      const tid = "tip" + ++tipN;
      html.push('<aside class="blk tip" id="' + tid + '"><p class="tip-label">참고</p><p>' + inlineStatic(b.text) + "</p></aside>");
    } else if (b.type === "turn") {
      if (mode === "calm" && ctx.counts.turn) fail("more than one [turn] in a lesson");
      ctx.counts.turn = (ctx.counts.turn || 0) + 1;
      html.push('<div class="blk turn" id="' + b.id + '" data-fx="flip">\n  <div class="turn-card"><div class="turn-front">' + esc(b.front) + '</div><div class="turn-back">' + esc(b.back) + "</div></div>\n</div>");
      ids.add(b.id);
    } else if (b.type === "checkpoint") {
      if (ctx.counts.checkpoint) fail("more than one [checkpoint]");
      ctx.counts.checkpoint = 1;
      const first = segments.length;
      const segHtml = narrate(b.text, "checkpoint");
      segments[first].pauseBefore = HOLD.checkpointBefore;
      segments[first].cues.unshift({ unit: 0, fx: "checkpoint", target: "checkpoint", lead: HOLD.checkpointBefore });
      segments[segments.length - 1].pauseAfter = Math.round(HOLD.checkpointAfter * (mode === "story" ? 1.6 : 1));
      html.push('<section class="blk checkpoint" id="checkpoint" data-fx="checkpoint" data-progress="__PROGRESS__"' + styleAttr("checkpoint") + '>\n  <div class="checkpoint-ring" aria-hidden="true"></div>\n  <p class="checkpoint-text">' + segHtml + "</p>\n</section>");
      ids.add("checkpoint");
    } else if (b.type === "outro") {
      const first = segments.length;
      const segHtml = b.say ? narrate(b.say, "outro") : "";
      if (b.say) {
        segments[first].pauseBefore = HOLD.outroBefore;
        segments[first].cues.unshift({ unit: 0, fx: "outro", target: "outro", lead: HOLD.outroBefore });
        segments[segments.length - 1].pauseAfter = HOLD.outroAfter;
      }
      const nextHref = nextLesson ? (nextLesson.story && fs.existsSync(rel("content/lessons", nextLesson.story + ".md")) ? nextLesson.story : nextLesson.id) : null;
      const next = nextLesson ? (nextLesson.status === "ready"
        ? '<a class="outro-next" href="' + nextHref + '.html"><span class="outro-next-label">다음 레슨</span><strong>' + esc(nextLesson.title) + "</strong><em>" + esc(nextLesson.subtitle) + "</em></a>"
        : '<p class="outro-next is-planned"><span class="outro-next-label">다음 레슨 · 준비 중</span><strong>' + esc(nextLesson.title) + "</strong><em>" + esc(nextLesson.subtitle) + "</em></p>") : "";
      html.push('<section class="blk outro" id="outro" data-fx="outro"' + styleAttr("outro") + '>\n  <p class="outro-kicker">레슨 ' + meta.number + ' 마침</p>\n  <h2 class="outro-title">오늘 배운 것</h2>\n  <ol class="recap">' + b.recap.map((r) => "<li>" + inlineStatic(r) + "</li>").join("") + '</ol>\n  <p class="outro-say">' + segHtml + "</p>\n  " + next + "\n</section>");
      ids.add("outro");
    } else if (b.type === "practice") {
      html.push('<section class="blk practice" id="practice" data-practice="' + esc(base ? base.id : meta.id) + '" aria-label="직접 해 보기">\n  <noscript><p>직접 해 보기는 자바스크립트가 켜져 있어야 동작해요.</p></noscript>\n</section>');
      ids.add("practice");
    }
  }
  if (mode === "calm" && ctx.chapterBursts > 1) fail(chapter.id + ": more than one [burst] in a chapter");
  if (ctx.counts.checkpoint !== 1) fail("[checkpoint] must appear exactly once");
  // Screen and code effects take turns, so more than two in one sentence starts to lag behind the voice.
  const heavy = (fx) => (EFFECTS[fx] ? EFFECTS[fx].kind === "point" || (EFFECTS[fx].kind === "block" && fx !== "menuprice") : ["burst", "run", "step", "flip"].includes(fx));
  for (const s of segments) {
    const n = s.cues.filter((c) => heavy(c.fx)).length;
    if (n > 2) warn(s.id + ": " + n + " screen/code effects in one sentence play one after another and may lag the voice");
  }
  for (const r of ctx.refs) {
    const scoped = /-(minji|doyun|owner|pai|menu)$/.test(r.target);
    if (!scoped && !ids.has(r.target)) fail(r.seg + ": " + r.fx + " target '" + r.target + "' does not exist");
  }

  const total = segments.reduce((n, s) => n + s.say.length, 0);
  const cpIdx = segments.findIndex((s) => s.block === "checkpoint");
  const before = segments.slice(0, cpIdx).reduce((n, s) => n + s.say.length, 0);
  const progress = Math.round((before / total) * 100) / 100;
  const body = html.join("\n\n").replace("__PROGRESS__", String(progress));
  const versions = base && base.story ? { calm: base.id, story: base.story } : null;

  const lesson = { id, number: Number(meta.number), title: meta.title, subtitle: meta.subtitle, motif: meta.motif || "generic",
    mode, intensity, styles, versions, course: { id: course.id, title: course.title },
    next: nextLesson ? { id: nextLesson.id, title: nextLesson.title, status: nextLesson.status } : null,
    chapters, segments, stats: { segments: segments.length, spokenChars: total, estimatedSeconds: Math.round(total / 6.2 + segments.reduce((n, s) => n + s.pauseBefore + s.pauseAfter, 0) / 1000) } };
  return { lesson, body, meta, base };
}

function inlineStatic(s) {
  return atomize(s, { narrated: false }).map((a) => a.k === "text" ? esc(a.s) : a.k === "code" ? '<code class="ic">' + esc(a.d) + "</code>" : a.k === "sub" ? esc(a.d) : "").join("");
}

// ---------- pages ----------
const STYLESHEETS = ["tokens", "base", "layout", "components", "effects", "cast", "engine", "practice"].filter((n) => fs.existsSync(rel("styles", n + ".css")));
const HEAD = (title, base, desc) => '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>' + esc(title) + '</title>\n<meta name="description" content="' + esc(desc) + '">\n<meta name="theme-color" content="#0b0d12">\n<link rel="icon" href="' + base + 'assets/favicon.svg" type="image/svg+xml">\n' +
  STYLESHEETS.map((n) => '<link rel="stylesheet" href="' + base + "styles/" + n + '.css">').join("\n") + "\n</head>\n";

function timingsFor(id) { try { return JSON.parse(fs.readFileSync(rel("data", id + ".timings.json"), "utf8")); } catch { return null; } }
const fmtMin = (sec) => Math.max(1, Math.round(sec / 60)) + "분";
const hasScript = (id) => id && fs.existsSync(rel("content/lessons", id + ".md"));
const pageOf = (l) => (hasScript(l.story) ? l.story : l.id);

function sidebar(course, currentId, chapters) {
  return '<nav class="sidebar" id="sidebar" aria-label="코스 목차">\n  <a class="sidebar-course" href="../index.html">' + esc(course.title) + '</a>\n  <ol class="sidebar-lessons">\n' + course.lessons.map((l) => {
    if (l.id === currentId || l.story === currentId) return '    <li class="is-current"><a href="' + currentId + '.html" aria-current="page"><span class="n">' + l.number + "</span>" + esc(l.title) + '</a>\n      <ol class="sidebar-chapters">\n' + chapters.map((c) => '        <li><a href="#' + c.id + '" data-chapter="' + c.id + '">' + esc(c.title) + "</a></li>").join("\n") + '\n        <li><a href="#practice" data-chapter="practice">직접 해 보기</a></li>\n      </ol>\n    </li>';
    if (l.status === "ready") return '    <li><a href="' + pageOf(l) + '.html"><span class="n">' + l.number + "</span>" + esc(l.title) + "</a></li>";
    return '    <li class="is-planned"><span class="sidebar-planned"><span class="n">' + l.number + "</span>" + esc(l.title) + '<em>준비 중</em></span></li>';
  }).join("\n") + "\n  </ol>\n</nav>";
}

function topbar(base, crumb, versions, currentId) {
  const switcher = versions ? '\n  <nav class="topbar-versions" aria-label="레슨 버전">' +
    [["story", "스토리판"], ["calm", "기본판"]].map(([k, label]) => '<a href="' + versions[k] + '.html"' + (versions[k] === currentId ? ' aria-current="page"' : "") + ">" + label + "</a>").join("") + "</nav>" : "";
  return '<header class="topbar">\n  <button class="topbar-menu" type="button" aria-controls="sidebar" aria-expanded="false"><span class="sr-only">목차 열기</span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>\n  <a class="brand" href="' + base + 'index.html"><span class="brand-mark" aria-hidden="true">&gt;&gt;&gt;</span><span class="brand-name">Docent</span></a>\n  ' + (crumb || "") + switcher + '\n  <button class="topbar-taste" type="button" aria-haspopup="dialog" aria-expanded="false">시안 비교</button>\n</header>';
}

function voiceNote(id) {
  const t = timingsFor(id);
  if (!t || !t.voice) return "";
  const v = t.voice;
  if (v.provider === "say") return '<p class="voice-note">이 음성은 로컬 확인용 임시 음성이에요.</p>';
  const model = v.model === "supertonic-3" ? "Supertonic 3" : v.model;
  return '<p class="voice-note">이 레슨의 음성은 AI로 합성했어요. 음성 모델: ' + esc(model) + (v.speakers ? " (캐릭터마다 다른 목소리)" : "") + ".</p>";
}

function renderLesson(compiled, course) {
  const { lesson, body } = compiled;
  const crumb = '<p class="topbar-crumb"><a href="../index.html">' + esc(course.title) + '</a><span aria-hidden="true">/</span><span>' + lesson.number + ". " + esc(lesson.title) + "</span></p>";
  return HEAD(lesson.title + (lesson.mode === "story" ? " (스토리)" : "") + " — " + course.title + " · Docent", "../", lesson.subtitle) +
    '<body class="page-lesson' + (lesson.mode === "story" ? " is-story" : "") + '" data-lesson="' + lesson.id + '" data-base="../">\n<a class="skip-link" href="#lesson">본문으로 건너뛰기</a>\n' + topbar("../", crumb, lesson.versions, lesson.id) + '\n<div class="shell">\n' + sidebar(course, lesson.id, lesson.chapters) + '\n<main class="lesson" id="lesson">\n' + body + '\n<footer class="lesson-footer">' + voiceNote(lesson.id) + '<p>코드 예시의 실행 결과는 레슨을 만들 때 파이썬으로 실제로 실행해서 채웠어요.</p></footer>\n</main>\n</div>\n<script type="module" src="../src/app.js"></script>\n</body>\n</html>\n';
}

function renderCourse(course, compiledById) {
  const cards = course.lessons.map((l) => {
    const pid = pageOf(l);
    const c = compiledById[pid] || compiledById[l.id];
    const t = timingsFor(pid);
    const dur = t ? fmtMin(t.duration) : c ? "약 " + fmtMin(c.lesson.stats.estimatedSeconds) : "";
    const ready = l.status === "ready" && c;
    let art = "";
    try { art = motifSVG(l.motif); } catch {}
    const inner = '<span class="toc-motif" data-motif="' + esc(l.motif) + '" aria-hidden="true">' + art + '</span>\n      <span class="toc-number">레슨 ' + l.number + (pid !== l.id ? " · 스토리" : "") + '</span>\n      <strong class="toc-title">' + esc(l.title) + '</strong>\n      <span class="toc-subtitle">' + esc(pid !== l.id && l.storySubtitle ? l.storySubtitle : l.subtitle) + '</span>\n      <span class="toc-meta">' + (ready ? (c.lesson.chapters.length + "개 장 · " + dur) : "준비 중") + "</span>";
    const calmLink = ready && pid !== l.id && compiledById[l.id] ? '\n      <a class="toc-alt" href="lessons/' + l.id + '.html">기본판 보기</a>' : "";
    return ready ? '    <li class="toc-item"><a class="toc-card" href="lessons/' + pid + '.html">\n      ' + inner + "\n    </a>" + calmLink + "</li>" : '    <li class="toc-item"><div class="toc-card is-planned" aria-disabled="true">\n      ' + inner + "\n    </div></li>";
  }).join("\n");
  const first = course.lessons.find((l) => l.status === "ready");
  return HEAD(course.title + " · Docent", "", course.subtitle) +
    '<body class="page-course" data-base="">\n<a class="skip-link" href="#course">본문으로 건너뛰기</a>\n' + topbar("", "", null, null) + '\n<main class="course" id="course">\n' +
    '<section class="blk intro intro-course-hero" id="intro" data-fx="intro" data-motif="generic">\n  <div class="intro-stage" aria-hidden="true">' + plate("generic") + '</div>\n  <div class="intro-copy">\n    <p class="intro-course">Docent 코스</p>\n    <p class="intro-number">입문</p>\n    <h1 class="intro-title">' + esc(course.title) + '</h1>\n    <p class="intro-subtitle">' + esc(course.subtitle) + '</p>\n  </div>\n</section>\n\n' +
    '<section class="course-start">\n  <div class="course-start-copy">\n    <p class="course-lead">글로 읽으면 교과서처럼, 재생 버튼을 누르면 옆에서 설명해 주는 강의처럼 봅니다. 레슨이 끝나면 내 관심사에 맞춘 문제로 직접 연습해요.</p>\n    ' + (first ? '<a class="btn btn-primary" href="lessons/' + pageOf(first) + '.html">첫 레슨 시작하기</a>' : "") + '\n  </div>\n</section>\n\n' +
    '<section class="course-toc" aria-labelledby="toc-heading">\n  <div class="course-toc-head"><h2 id="toc-heading">레슨</h2><p>' + course.lessons.length + '개 중 ' + course.lessons.filter((l) => l.status === "ready").length + '개 공개</p></div>\n  <ol class="toc-track">\n' + cards + '\n  </ol>\n</section>\n\n' +
    '<section class="course-how" aria-labelledby="how-heading">\n  <h2 id="how-heading">이렇게 공부해요</h2>\n  <ol class="how-list">\n    <li><strong>읽기</strong><span>스크롤하며 읽으면 그림과 코드가 필요한 자리에서 한 번씩 움직여요.</span></li>\n    <li><strong>듣기</strong><span>재생 버튼을 누르면 음성이 설명하고, 화면이 지금 읽는 곳을 따라가요. 언제든 직접 스크롤해도 돼요.</span></li>\n    <li><strong>해 보기</strong><span>레슨 끝에서 관심 있는 주제를 고르면 그 주제로 된 문제를 브라우저에서 바로 풀어요.</span></li>\n  </ol>\n</section>\n</main>\n<footer class="site-footer"><p>Docent · 파이썬 첫걸음 시안 · 2026 · 레슨 음성은 AI로 합성했어요.</p></footer>\n<script type="module" src="src/app.js"></script>\n</body>\n</html>\n';
}

// ---------- main ----------
const course = JSON.parse(fs.readFileSync(rel("content/course.json"), "utf8"));
const wanted = process.argv.slice(2);
const all = course.lessons.flatMap((l) => [l.id, l.story].filter(Boolean));
const ids = (wanted.length ? wanted : all).filter((id) => hasScript(id));
const compiled = {};
for (const id of ids) {
  const c = compileLesson(id, course);
  compiled[id] = c;
  fs.mkdirSync(rel("data/lessons"), { recursive: true });
  fs.writeFileSync(rel("data/lessons", id + ".json"), JSON.stringify(c.lesson, null, 1) + "\n");
  fs.writeFileSync(rel("lessons", id + ".html"), renderLesson(c, course));
  console.log("compiled " + id + " (" + c.lesson.mode + "): " + c.lesson.segments.length + " segments, " + c.lesson.chapters.length + " chapters, ~" + c.lesson.stats.estimatedSeconds + " s");
}
if (!wanted.length) { fs.writeFileSync(rel("index.html"), renderCourse(course, compiled)); console.log("wrote index.html"); }
if (warnings.length) { console.log("\nwarnings:"); for (const w of warnings) console.log("  - " + w); }
