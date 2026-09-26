# Cast (owner: cast)

Character avatars for story lessons: 민지 (minji), 도윤 (doyun), 사장님 (owner) and 파이 (pai), drawn in code as SVG.
They sit beside dialogue lines as small busts (56px, 44px on phones; the pai mascot 72px) and inside a scene's menu card
effect. No third-party art. Styles: `styles/cast.css`. Gallery: `lab/cast.html`.

## Exports — `src/components/cast/index.js`

```js
import { effects, renderActor, renderMenu, primeCast } from '../src/components/cast/index.js';
```

Importing touches no DOM (the compiler uses the renderers in Node).

| export | what |
|---|---|
| `effects` | `{ react, emote, act, menuprice }`; each `{ run(el, opts) → { duration, done, finish }, prime(el, opts?), settle(el, opts?), reset(el, opts?) }` |
| `renderActor(castId, expr, id, opts?)` | `<div class="actor" id data-actor data-expr data-expr0><div class="actor-body"><svg class="cast-art">…`. castId: minji, doyun, owner, pai (or 민지, 도윤, 사장님, 파이). expr: an EXPRESSIONS value or its Korean label. `opts.enter: true` adds `data-enter="1"` (hidden until an enter act). Returns '' for unknown ids such as narr |
| `renderMenu(id, menu)` | the scene's menu card. `menu` = `{ 아메리카노: "4500", … }` in display order; default 아메리카노 4500, 라떼 5000, 케이크 6500. Each price span has `data-item` and `data-price0` |
| `primeCast(root)` | makes every `.actor` under root live (blinking, word-synced mouth) and draws pai into an empty `.mascot-art`. Idempotent. The effects' `prime` calls it for their element too |
| `CAST_IDS`, `EXPR_IDS`, `EMOTE_IDS`, `ACTION_IDS`, `normExpr`, `normEmote`, `normAction` | ids and label normalisers |

## Effects

`opts` as SPEC §6/§12: `{ mode, intensity, reduced, sound, params }`. Duration = registry dur × soft 0.7 / normal 1 / strong 1.2
(react 600, emote 1100, act 900, menuprice 1300 at normal). `reduced` (or the OS setting when omitted) → 0 ms and the end state.
Korean labels are accepted in params (놀람, 땀, 등장 …).

| effect | el | params | what you see | settle / reset |
|---|---|---|---|---|
| react | the line's avatar (`sc1-r3-minji`) | `{ expr }` | the head squashes, the face and hands change (e.g. surprised: hands to cheeks) | settle: that expression. reset: `data-expr0` |
| emote | avatar | `{ emote }` exclaim question sweat heart sparkle idea music anger | a small speech bubble with the icon pops beside the head and fades | nothing lasts; both clear it |
| act | avatar | `{ action }` enter exit jump nod shakehead point clap highfive | enter pops the avatar out of its row; exit waves, then fades to 30%; point aims a finger at the bubble; clap and high-five spark | enter/exit are remembered (see below); the rest leave no trace |
| menuprice | `#sc1-menu` | `{ item, price }` | the old price is struck through, the new one drops in with a highlighter band, a "+500" note pops; the struck old price stays beside the new one | settle: the new price. reset: every item to `data-price0` |

Enter: an avatar whose first act is enter must start hidden. Either render it with `renderActor(id, expr, domId, { enter: true })`
or call `effects.act.prime(el, { params: { action: 'enter' } })`. Without JS it stays visible (final state).

Seeking (matches src/engine/player.js): `reset(el, opts?)` returns the element to its start for that effect — react to
`data-expr0`, menuprice to every item's `data-price0`, act to its presence before the first entrance (hidden if the avatar has
`data-enter` or the given opts are an enter cue). Then `settle(el, opts)` for each passed cue, in order, applies that cue's end
state; menuprice remembers the order so the struck old price is always the one before the current price. emote leaves nothing.

## Engine hooks

- `.is-talking` on an avatar → its mouth flaps and the head bobs. `docent:word` (CustomEvent, detail `{ index }`) on it → one mouth burst per word, sized to the gap between words.
- Rows: `li.line.is-active` (speaking, bubble outlined in the speaker's colour), `li.line.is-said`; while `.scene.is-live`, rows not yet reached step back to 38% opacity. Narrator rows are plain text.
- Mascot: `aside.blk.mascot` highlights its bubble while one of its segments is active (or with `.is-active`).
- The menu card is sticky under the top bar within its scene, so a price change is on screen when it happens.
- Blinking pauses off screen; reduced motion stops blinking and swaying and shows a still open mouth while talking.
- Sounds (only with `opts.sound`): `playSfx` from `src/fx/sound.js` (pop, boing, whoosh, sparkle, chime, thud, tick, stamp).

## Files

- `art.js` — the four characters, ten expressions, poses (hands solved from target points), emote icons. Pure.
- `index.js` — renderers and effects. `live.js` — runtime: word-synced mouths, blinking, sound loading.
- `lab-build.mjs` — refreshes the pre-rendered regions of `lab/cast.html` after art changes: `node src/components/cast/lab-build.mjs`.

