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
- src/fx/sound.js      sting(), registerSting(), voice(), noise(), unlockAudio()
- src/fx/particles.js  emit() on one shared fixed canvas, palette(), clearParticles()
- src/components/intro.js (+ intro/)      intro, drawMotif(el, motif)
- src/components/chapter.js, checkpoint.js, outro.js   stage bands and the mid-lesson break
- src/components/pop.js, burst.js, flip.js, run.js (+ highlight.js), step.js
- src/components/figures/index.js         figure registry; figures/name-tag.js
- styles/components.css                    all component styles (partials under src/components are merged into it)

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
- Measured offline (before device volume): peaks between -11 and -21 dBFS, tails under 2.5 s.

Layout notes
- The intro keeps its title clear of the dock (bottom padding uses --dock-h) and honours --topbar-h.
- Tip in the right margin on wide screens is a layout.css decision. A float that stays out of the text column:
    @media (min-width: 1360px) {
      .lesson > .tip { float: right; clear: right; width: 13rem; margin: 0 0 var(--s-4) 0;
        margin-right: calc(50% - var(--measure) / 2 - 13rem - var(--s-7)); }
    }

Gallery for checking each element: lab/components.html (python3 -m http.server 8810, then /lab/components.html).
