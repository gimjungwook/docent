# Docent effect kit (owner: motion)

Everything here implements SPEC section 6 and works on the compiler markup in SPEC section 7.
Entry point: src/components/index.js exports fx, prime, settle, reset, drawMotif, unlockAudio, BUDGET.

## Component module contract

Each component file default-exports an object:

    export default {
      prime(el)          // idempotent: initial (pre-effect) state; never hides body text; never changes layout
      play(el, opts)     // returns a Handle { duration, done, finish } (use Timeline from src/fx/timeline.js)
      settle(el, opts?)  // final state instantly (opts may carry n or line)
      reset(el, opts?)   // initial state instantly
    }

opts arrive normalised by src/fx/motion.js normalize(): { mode, intensity, reduced, sound, style?, line?, n?, k }
where k = { time, amp, count } for the intensity (soft 0.7/0.6/0.55, normal 1/1/1, strong 1.2/1.45/1.7).
Multiply every time by k.time, every distance/scale excursion by k.amp, every particle count by k.count.

## State model

- No data-fx-state attribute = final state. That is what the compiler's static HTML shows without JavaScript,
  so the CSS default for every component must be its finished look.
- prime/reset set data-fx-state="initial"; CSS under [data-fx-state="initial"] hides what the effect reveals.
  Use opacity, transform, clip-path or visibility only: initial and final states must have identical layout,
  because the engine measures positions for its camera.
- play(): stop any running effect on the element, set data-fx-state="playing" (CSS = final look), then build a
  Timeline whose tracks start from the initial look. Tracks use fill 'backwards', so a track shows its first
  keyframe until it starts and hands over to the static CSS when it ends. The last keyframe of every track must
  equal the final CSS so nothing jumps. At the end the Timeline sets data-fx-state="final".
- One track per (element, property). For multi-phase motion use keyframe offsets in one track. Two tracks on the
  same property of the same element fight (the later one's backwards fill wins during the earlier one).
- finish() cancels all tracks (static final CSS remains), runs pending set() callbacks, skips cue() side effects.
- opts.reduced: no motion. Apply the final state and return instant() (duration 0).
- opts.mode 'read': same look; may be quicker where no narration has to line up (for example long run sweeps).
- Sounds only for intro, chapter, checkpoint, outro, and only when opts.sound is true. Use sting() from
  src/fx/sound.js (registerSting to add a named sting). Schedule with tl.cue(() => sting(name, { amp }), atMs).
- Intensity 'strong' is the story lessons' default and must be unmistakable. pop, burst, run, flip and checkpoint
  have strong-only sizing and timing (same look, only size, contrast and time change); soft and normal keep the
  v0.1 values so the calm lesson stays comparable:
  - pop: bigger jump (scale 1 + 0.24 x amp, lift 4.5 x amp px); the word stays coral from 14% to 60% of the
    effect, then the highlighter sweeps in as it cools.
  - burst: the anchor word stays coral for the first half; ring, spark streaks and confetti are 1.35x larger.
  - run: the active-line band is twice as strong (components.css --ln-boost, set on the block while it plays) and
    each output line lands in yellow (--marker) before settling to its normal colour.
  - flip: the card lifts a little higher mid-turn (scale 1 + 0.075 x amp).
  - checkpoint: a bigger ring pulse, a brief mint wash and 2px mint outline on the card when the ring closes,
    and more, larger confetti.

## Visual grammar (keep every component in one family)

- Two surfaces. Paper (--paper, --paper-2, --paper-3, --ink..., --rule) for reading; stage (--stage, --stage-2,
  --stage-3, --stage-ink, --stage-ink-2, --stage-rule) for title bands. The stage is lit, never shadowed: depth on
  stage comes from light pools (large, low-contrast radial fills in stage colours) and scale/parallax.
  Paper uses --shadow-1 / --shadow-2 at most.
- Colour roles. --gold is the stage accent. --coral is the transient emphasis colour (pop, burst). --marker is the
  lasting highlighter. --accent is for interactive things. --mint means correct/progress. Code uses --code-*.
- Type. Pretendard. Titles 760-860 weight with --tracking-tight; body 400; small labels --text-xs, weight 600-650.
  Numerals that count use font-variant-numeric: tabular-nums.
- Motion. Entrances use --ease-out. State changes use --ease-in-out. Springs only for pop, the playful intro and
  the flip settle (spring() in src/fx/motion.js builds a CSS linear() spring). Animate transform, opacity,
  clip-path, stroke-dashoffset and colour only. Blur at most 12px and only on the stage. Nothing loops forever;
  every effect settles into a still, printable final frame. One focal motion at a time: stagger, do not overlap.
- Never: indigo/violet gradients, glassmorphism, glowing dots, emoji, pastel icon tiles, gradient-clipped text,
  01/02/03 kickers, coloured left-border callouts, badge/pill spam. Only tokens from styles/tokens.css.

## Files

- src/fx/motion.js     token(), ease, spring(), INTENSITY, normalize()
- src/fx/timeline.js   Timeline (to/set/cue/hold/then/play), stop(), instant(), setState()
- src/fx/sound.js      sting(), registerSting(), playSfx(), SFX_NAMES, setMuted(), isMuted(), setVolume(),
                       getVolume(), voice(), noise(), unlockAudio()
- src/fx/particles.js  emit() on one shared fixed canvas (thick scales spark streaks), palette(), clearParticles()
- src/components/intro.js (+ intro/)      intro, drawMotif(el, motif)
- src/components/chapter.js, checkpoint.js, outro.js   stage bands and the mid-lesson break
- src/components/pop.js, burst.js, flip.js, run.js (+ highlight.js), step.js
- src/components/figures/index.js         figure registry; figures/name-tag.js
- src/components/effects/code.js          v2 code-block effects: typecode, terminal, flyvalue, diff, errorfx
- styles/components.css                    all component styles (partials under src/components are merged into it)

## v2 code effects (src/components/effects/code.js, SPEC section 12)

export const effects = { typecode, terminal, flyvalue, diff, errorfx }; each is { run(el, opts) -> Handle, prime(el),
settle(el, opts?), reset(el) } on the compiler's code block (figure.blk.code > pre > code > span.ln[data-line],
div.out > span.out-line[data-from]). The module touches no DOM at import. Durations are the registry value x
intensity (soft 0.7, normal 1, strong 1.2); reduced motion returns duration 0 and lands in the final state. Sounds
(playSfx) only when opts.sound is true. Everything stays inside the existing code block design.

- typecode: the code types itself line by line with a yellow block caret and key clicks. prime() hides the code
  text (line numbers stay) until it plays or settles.
- terminal: a status chip ("실행 중…" with a spinner) takes the place of the "Python" label, the lines light up as
  they run, the output types itself in (each line lands in yellow), and the chip ends as "✓ 실행 완료", or
  "✕ 오류 발생" when the block's output is an error (.has-error, .out-line.out-error, or an ...Error line).
  prime() hides the output lines.
- flyvalue { to: figure id | "out", line }: the last number or string on that line (else the first output line)
  lifts off as a yellow chip, flies in an arc and is absorbed by the target: a figure value with the same text
  (it jumps and turns coral), the figure stage, or the output line (it flashes yellow). Nothing lasting.
- diff { line }: the changed token (compared with the earlier assignment of the same name) gets a yellow frame and
  rolls like an odometer from the old value to the new one (4500 -> 5000); the token keeps a coral underline.
- errorfx { line? }: red flash, shake and an error badge naming the error (NameError, SyntaxError, else 오류). The
  failing line (params.line, "line N" in the output, or the error output line's data-from) is marked red, and the
  error output line is marked (.out-error, which the compiler already emits; errorfx adds it only on generic
  markup and never removes the compiler's). The badge hides the terminal chip.

Integration notes: prime typecode and terminal only on blocks that carry those cues, and make read mode play or
settle them, or the code/output stays hidden. params.line may be a string ("2"). opts.line is accepted as well.
DOM added at prime or run: .code-caret (in pre), .term-status, .err-badge, .err-flash, .diff-glow / .diff-reel
(removed after the effect), and a body-level .fx-flylayer while a value flies. The inline style --ln-boost on the
block only strengthens the active-line band while an effect plays.

## Integration notes for root (motion, 2026-09-26)

The multi-agent message tools were not available in the motion session, so these notes replace the early message.

Import path: src/components/index.js exports fx, prime, settle, reset, drawMotif, unlockAudio, clearParticles, BUDGET.
src/app.js already imports it the right way.

What matches SPEC section 6 exactly
- Every fx(el, opts) returns { duration, done, finish } with duration known synchronously. done never rejects.
- Durations at 'normal' equal the budgets (intro 4800, chapter 1400, pop 700, burst 1100, flip 1000,
  run 380 per line + 420, step 900, checkpoint 1600, outro 1800). 'soft' is 0.7x, 'strong' 1.2x, reduced is 0.
- Initial and final states have identical layout for every component (checked by measuring boxes), so the
  camera can measure positions at any time.
- Without JavaScript the compiler markup shows the final state.

Extensions (additive; calling without them keeps SPEC behaviour)
1. settle(el, opts?) and reset(el, opts?) accept the same opts as fx:
   - step: settle(el, { n }) shows step n; reset(el, { n }) shows step n - 1. Without n: data-to / data-from.
   - run: settle(el, { line }) reveals only that line's output; reset(el, { line }) hides only it.
     player._syncEffects currently calls settle(el) for run blocks; if a block's last cue was a single-line
     run, pass { line: cue.line } so other lines' output stays hidden.
   - intro: settle(el, { style }) / reset(el, { style }) switch the look without playing.
     app.js settles the intro without the new style when it is off-screen, so the old look stays until the next
     play. Pass { style: s.introStyle } there (or set intro.dataset.style first).
2. step(el, { n }) with n beyond data-to is allowed (clamped to the figure's steps).
   Intermediate steps play at 0.55x each.
3. read mode: run caps its line sweep at 1.5 s total; everything else plays the same as in play mode.

Things prime() adds to the compiler markup (decorative or accessibility only; text content never changes)
- intro: builds .intro-stage (light, rules, shapes, the motif plate) and wraps the h1 letters in spans
  (the h1 gets aria-label with its text). The look is data-style on the section (cinema | editorial | playful,
  default cinema); opts.style overrides and is written back. After prime()/reset() the intro shows its FIRST
  frame (empty stage), so the page must play it (app.js does, in read mode) or settle() it.
- chapter: inserts span.chapter-rule before the title.
- pop: sets data-text on .fx-pop (reserves the heavier weight so the line never reflows).
- run: wraps tokens in span.tok-* inside each .ln for colouring; hides output lines with data-fx-hidden.
- flip: back face gets data-term; the card gets tabindex/role=button (click, Enter or Space turns it);
  a span.turn-floor shadow is appended.
- checkpoint: draws the ring SVG into .checkpoint-ring (an empty ring holder is hidden without JS).

Optional compiler hooks for readers without JavaScript (both pure, Node-importable)
- import { renderFigure } from '../src/components/figures/index.js'; renderFigure('name-tag', to) returns the
  finished figure SVG; put it inside .figure-stage. prime() replaces it with the live version.
- import { motifSVG } from '../src/components/intro/motifs.js'; motifSVG(motif) returns the emblem; wrap it as
  <div class="intro-plate"><div class="intro-plate-in">SVG</div></div> inside .intro-stage.

Sound
- Stings play only for intro, chapter, checkpoint and outro, and only when opts.sound is true.
  Call unlockAudio() inside the Play button's click handler so Safari lets later stings sound.
- v2 effect sounds: playSfx(name, { intensity, delay }) with pop, whoosh, thud, chime, fanfare, crackle, typing,
  glitch, drumroll, riser, boing, zap, sparkle, stamp, tick (SFX_NAMES). setMuted(true) or ?mute=1 silences all
  sound; setVolume(0..1) scales stings and effect sounds (default 1).
- Levels sit well under the narration (variables.m4a: -16 LUFS integrated, -1.9 dBFS peak). Measured offline at
  normal intensity: effect sounds peak at -14.4 to -19.8 dBFS and their loudest 400 ms stays at -25 LUFS or below
  (strong adds about 1 to 1.5 dB); stings peak at -16 to -22 dBFS (cinema intro and chapter about -16, strong -14.5).
  Tails stay under 2.5 s.

Layout notes
- The intro keeps its title clear of the dock (bottom padding uses --dock-h) and honours --topbar-h.
- Tip in the right margin on wide screens is a layout.css decision. A float that stays out of the text column:
    @media (min-width: 1360px) {
      .lesson > .tip { float: right; clear: right; width: 13rem; margin: 0 0 var(--s-4) 0;
        margin-right: calc(50% - var(--measure) / 2 - 13rem - var(--s-7)); }
    }

Gallery for checking each element: lab/components.html (python3 -m http.server 8811, then /lab/components.html).
The v2 effects (including the code group) are shown on generic markup in lab/effects.html (root).
