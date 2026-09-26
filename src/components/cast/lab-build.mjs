// Refreshes the pre-rendered parts of lab/cast.html (the static art readers see without JavaScript).
// Run after changing the art:  node src/components/cast/lab-build.mjs
// Regions are marked in the page as <!--gen:name-->…<!--/gen:name-->; everything else is left as it is.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderActor, renderMenu, EXPR_IDS, EMOTE_IDS, ACTION_IDS } from './index.js';
import { EXPRESSIONS, EMOTES, ACTIONS } from '../effects/registry.js';

const LAB = new URL('../../../lab/cast.html', import.meta.url);
const inv = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const EXPR_KO = inv(EXPRESSIONS), EMOTE_KO = inv(EMOTES), ACTION_KO = inv(ACTIONS);
const NAMES = { minji: '민지', doyun: '도윤', owner: '사장님', pai: '파이' };
const ROLES = {
  minji: '코랄 앞치마를 두른 아르바이트생. 파이썬을 처음 배워요.',
  doyun: '둥근 안경, 남색 후드, 노트북. 카페 단골 개발자 친구예요.',
  owner: '초록 카디건과 콧수염. 가격을 자주 바꾸는 사장님이에요.',
  pai: '이름표를 목에 건 작은 노란 뱀. 레슨의 안내자예요.',
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const xg = Object.keys(NAMES).map((c) => {
  const cells = EXPR_IDS.map((e) => '<li class="xg-cell"><button class="xg-btn" type="button" aria-label="' + NAMES[c] + ' ' + EXPR_KO[e] + ' 표정 재생">' +
    renderActor(c, e, 'x-' + c + '-' + e) + '</button><span class="xg-label">' + EXPR_KO[e] + '<small>' + e + '</small></span></li>').join('');
  return '<section class="xg-row"><header class="xg-head"><h3>' + NAMES[c] + '<code>' + c + '</code></h3><p>' + ROLES[c] + '</p></header><ol class="xg-list">' + cells + '</ol></section>';
}).join('');

const pick = (name) => '<div class="seg-ctl" role="radiogroup" aria-label="등장인물">' + Object.keys(NAMES).map((c, i) =>
  '<label><input type="radio" name="' + name + '" value="' + c + '"' + (i === 0 ? ' checked' : '') + '><span>' + NAMES[c] + '</span></label>').join('') + '</div>';

const words = (s) => s.split(/\s+/).map((w) => '<span class="u">' + esc(w) + '</span>').join(' ');
let segN = 0;
const seg = (text) => '<span class="seg" data-seg="d' + (++segN) + '">' + words(text) + '</span>';
const LINES = [
  { who: 'narr', text: '월요일 아침, 민지가 일하는 카페.' },
  { who: 'owner', expr: 'happy', text: '민지 씨, 아메리카노 세 잔 주문 들어왔어요!' },
  { who: 'minji', expr: 'neutral', text: '한 잔에 4,500원이니까… 세 잔이면 얼마더라?' },
  { who: 'doyun', expr: 'happy', text: '그런 계산은 파이썬한테 맡겨 봐.', enter: true },
  { who: 'owner', expr: 'neutral', text: '아, 그리고 오늘부터 아메리카노는 5,000원이에요.' },
  { who: 'minji', expr: 'neutral', text: '네? 가격이 또 바뀌었어요?' },
  { who: 'doyun', expr: 'neutral', text: '괜찮아. 가격에 이름표를 붙여 두면 한 줄만 고치면 돼.' },
];
const MENU = { 아메리카노: '4500', 라떼: '5000', 케이크: '6500' };
const lines = LINES.map((L, i) => {
  const id = 'sc1-r' + (i + 1);
  if (L.who === 'narr') return '<li class="line line-narr" data-speaker="narr" id="' + id + '"><p class="line-text">' + seg(L.text) + '</p></li>';
  return '<li class="line" data-speaker="' + L.who + '" id="' + id + '"><div class="line-avatar">' + renderActor(L.who, L.expr, id + '-' + L.who, { enter: L.enter }) + '</div>' +
    '<div class="line-body"><span class="line-name">' + NAMES[L.who] + '</span><p class="line-text">' + seg(L.text) + '</p></div></li>';
}).join('\n    ');
const scene = '\n  <section class="blk scene" id="sc1" data-cast="owner minji doyun">\n    ' + renderMenu('sc1-menu', MENU) +
  '\n    <ol class="scene-lines">\n    ' + lines + '\n    </ol>\n  </section>\n  ' +
  '<aside class="blk mascot" id="m1" data-actor="pai"><div class="mascot-art">' + renderActor('pai', 'happy', 'm1-pai') + '</div><p class="mascot-text">' +
  seg('가격이 바뀌어도 걱정 마. 이름표는 새 값으로 옮겨 붙이면 돼!') + '</p></aside>\n';

const parts = {
  xg,
  'pick-emote': pick('emote-who'),
  'emote-btns': EMOTE_IDS.map((e) => '<button class="lab-btn" type="button" data-emote="' + e + '"><b>' + esc(EMOTE_KO[e]) + '</b>' + e + '</button>').join(''),
  'pick-act': pick('act-who'),
  'act-btns': ACTION_IDS.map((a) => '<button class="lab-btn" type="button" data-act="' + a + '"><b>' + ACTION_KO[a] + '</b>' + a + '</button>').join(''),
  talkers: Object.keys(NAMES).map((c) => '<li class="talk-cell">' + renderActor(c, c === 'owner' || c === 'pai' ? 'happy' : 'neutral', 't-' + c) + '<span class="xg-label">' + NAMES[c] + '</span></li>').join(''),
  menu: renderMenu('m-menu', MENU),
  scene,
  'emote-actor': renderActor('minji', 'neutral', 'emote-stage-minji'),
  'act-actor': renderActor('minji', 'neutral', 'act-stage-minji'),
};

let html = readFileSync(LAB, 'utf8');
for (const [name, body] of Object.entries(parts)) {
  const re = new RegExp('<!--gen:' + name + '-->[\\s\\S]*?<!--/gen:' + name + '-->');
  if (!re.test(html)) throw new Error('lab/cast.html has no region ' + name);
  html = html.replace(re, () => '<!--gen:' + name + '-->' + body + '<!--/gen:' + name + '-->');
}
writeFileSync(LAB, html);
console.log('lab/cast.html: refreshed ' + Object.keys(parts).length + ' regions');

