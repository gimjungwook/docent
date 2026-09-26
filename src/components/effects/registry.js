// Docent effect and cast registry (v2, 2026-09-27). Pure data: imported by the compiler (Node) and the page.
// Owner: root. Implementations live in src/components/effects/<group>.js (text, screen: fx agent; code: motion
// agent) and src/components/cast/ (cast agent).
//
// Rule (user, 2026-09-27): the v0.1 design stays as it is. Effects are added for learning and made clearly
// noticeable. Every effect has a learning job (use); an effect without one does not belong here.
// Durations are at intensity 'normal' in ms; 'soft' = 0.7x, 'strong' = 1.2x (story pages default to strong).
// The compiler inserts this much silence after a cue so the camera can hold still.
//
// kind:
//   inline — wraps words:            [marker]이름표[/marker]   [strike to="붙인다"]같다[/strike]
//   point  — fires at a spot:        [confetti]                [stamp text="만 오천!"]
//   block  — targets a block by id:  [typecode c1]             [flyvalue c2 to=f1 line=1]
//   actor  — a character's avatar:   [민지 놀람]  [민지 !]  [민지 등장]   (see CAST below)

export const EFFECTS = {
  // ---- text (inline): point at a key word, show a change, introduce a term ----
  marker:     { label: "형광펜",          group: "text", kind: "inline", dur: 800,  use: "지금 설명하는 핵심어를 칠해 두고, 끝난 뒤에도 옅게 남겨 복습 표시가 된다" },
  underline:  { label: "손밑줄",          group: "text", kind: "inline", dur: 700,  use: "문장에서 꼭 기억할 구절에 밑줄을 긋는다" },
  circle:     { label: "손으로 동그라미", group: "text", kind: "inline", dur: 900,  use: "문제가 되는 값이나 부분을 동그라미로 짚는다" },
  spotlight:  { label: "스포트라이트",    group: "text", kind: "inline", dur: 1600, use: "주변을 어둡게 해 정의나 핵심 문장 하나에 집중시킨다" },
  zoom:       { label: "확대",            group: "text", kind: "inline", dur: 800,  use: "규칙이나 경고처럼 놓치면 안 되는 말을 크게 보여 준다" },
  bouncein:   { label: "뚝 떨어지기",     group: "text", kind: "inline", dur: 800,  use: "새 용어가 처음 나오는 순간을 알린다" },
  jelly:      { label: "착 붙기",         group: "text", kind: "inline", dur: 700,  use: "무언가가 붙거나 연결되는 순간(이름표가 붙음)을 몸짓으로 보여 준다" },
  wave:       { label: "글자 물결",       group: "text", kind: "inline", dur: 900,  use: "캐릭터가 신나서 하는 말이나 가벼운 강조에 리듬을 준다" },
  typewriter: { label: "타자기",          group: "text", kind: "inline", dur: 1200, use: "새 용어나 결론을 한 글자씩 써 내려가 읽는 속도를 맞춘다" },
  callout:    { label: "말풍선 주석",     group: "text", kind: "inline", dur: 1500, params: ["text"], use: "문장 옆에 보충 설명(예: 실제 코드 조각)을 달아 준다" },
  strike:     { label: "지우고 고쳐 쓰기", group: "text", kind: "inline", dur: 1300, params: ["to"], use: "흔한 오해를 줄 긋고 올바른 말로 고쳐 쓴다" },
  flip3d:     { label: "단어 뒤집기",     group: "text", kind: "inline", dur: 900,  use: "서로 다르다는 것, 바뀐다는 것을 단어가 뒤집히며 보여 준다" },
  countup:    { label: "숫자 올리기",     group: "text", kind: "inline", dur: 1200, params: ["from"], use: "계산 결과나 바뀐 값이 어디서부터 얼마가 되는지 세어 보여 준다" },
  odometer:   { label: "숫자 롤링",       group: "text", kind: "inline", dur: 1200, params: ["from"], use: "값이 다른 값으로 바뀌는 순간을 자리마다 굴려 보여 준다" },
  scramble:   { label: "해독",            group: "text", kind: "inline", dur: 1100, use: "알아보기 어려운 것이 읽히는 것으로 풀리는 순간을 보여 준다" },
  shake:      { label: "흔들기",          group: "text", kind: "inline", dur: 600,  use: "틀린 말, 당황하는 말에 붙여 '이건 문제다'를 알린다" },
  glitch:     { label: "오류 글리치",     group: "text", kind: "inline", dur: 900,  use: "오류 메시지나 잘못된 코드를 가리킬 때만 쓴다" },

  // ---- screen (point): moments of result, success and warning ----
  stamp:       { label: "도장 쾅",       group: "screen", kind: "point", dur: 1400, params: ["text"], use: "실행 결과나 정답을 도장으로 확정해 보여 준다" },
  sparkle:     { label: "반짝이",        group: "screen", kind: "point", dur: 1200, use: "잘 이해했을 때 작은 칭찬을 준다" },
  confetti:    { label: "컨페티",        group: "screen", kind: "point", dur: 1400, use: "결과가 기대대로 나왔을 때 축하한다" },
  fireworks:   { label: "폭죽",          group: "screen", kind: "point", dur: 2400, use: "새 개념을 손에 넣은 큰 순간(핵심 정의)을 축하한다" },
  shockwave:   { label: "충격파",        group: "screen", kind: "point", dur: 1000, use: "핵심 결론이 나오는 단어에서 퍼져 나가 주목시킨다" },
  flash:       { label: "번쩍",          group: "screen", kind: "point", dur: 500,  use: "'아하' 하고 깨닫는 순간을 표시한다" },
  vignette:    { label: "주변 어둡게",   group: "screen", kind: "point", dur: 1400, use: "문제 상황이 심각해지는 순간에 긴장을 준다" },
  lowerthird:  { label: "용어 자막바",   group: "screen", kind: "point", dur: 2600, params: ["title", "sub"], use: "새 용어와 뜻을 방송 자막처럼 화면 아래에 띄운다" },
  countdown:   { label: "예상해 보기",   group: "screen", kind: "point", dur: 2600, use: "실행하기 전에 결과를 예상해 보게 3·2·1을 센다" },
  screenshake: { label: "화면 흔들림",   group: "screen", kind: "point", dur: 700,  use: "오류가 나거나 상황이 뒤집히는 순간을 몸으로 느끼게 한다" },

  // ---- code blocks (block): how code is written, runs and changes ----
  typecode: { label: "코드 타이핑",  group: "code", kind: "block", dur: 2200, use: "코드를 한 줄씩 입력해 읽는 순서대로 보여 준다" },
  terminal: { label: "실행하기",     group: "code", kind: "block", dur: 1600, use: "코드를 실행하고 출력이 나오는 과정을 보여 준다" },
  flyvalue: { label: "값 날아가기",  group: "code", kind: "block", dur: 1200, params: ["to", "line"], use: "코드의 값이 그림(상자·이름표)으로 옮겨 가 코드와 그림을 잇는다" },
  diff:     { label: "바뀐 곳 강조", group: "code", kind: "block", dur: 1100, params: ["line"], use: "이전 코드에서 무엇이 바뀌었는지 그 자리만 보여 준다" },
  errorfx:  { label: "오류 표시",    group: "code", kind: "block", dur: 1200, use: "오류가 난 줄과 오류 이름을 분명히 표시한다" },

  // ---- characters (actor) — implemented by src/components/cast ----
  react:     { label: "표정 바꾸기",       group: "cast", kind: "actor", dur: 600,  params: ["expr"],   use: "캐릭터의 감정으로 상황(당황, 이해, 뿌듯함)을 전한다" },
  emote:     { label: "감정 표시",         group: "cast", kind: "actor", dur: 1100, params: ["emote"],  use: "물음표·전구 등으로 질문과 깨달음의 순간을 보여 준다" },
  act:       { label: "동작",              group: "cast", kind: "actor", dur: 900,  params: ["action"], use: "등장, 끄덕임, 박수처럼 대화의 흐름을 몸짓으로 보여 준다" },
  menuprice: { label: "메뉴판 가격 바꾸기", group: "cast", kind: "block", dur: 1300, params: ["item", "price"], use: "현실에서 값이 바뀌는 순간을 보여 줘 변수를 다시 붙일 이유를 만든다" },
};

// Looks of the big moments: the v0.1 designs (unchanged by the 2026-09-27 experiment).
export const STYLES = {
  intro: ["cinema", "editorial", "playful"],
  chapter: ["band"],
  checkpoint: ["ring"],
  outro: ["recap"],
};

// The cast. voice = Supertonic 3 speaker used for that character's lines.
export const CAST = {
  narr:  { name: "내레이터", voice: "F1" },
  minji: { name: "민지",   voice: "F3", role: "카페에서 일하며 파이썬을 처음 배우는 주인공" },
  doyun: { name: "도윤",   voice: "M1", role: "카페 단골인 개발자 친구" },
  owner: { name: "사장님", voice: "M4", role: "카페 사장님. 가격을 자주 바꾼다" },
  pai:   { name: "파이",   voice: "F5", role: "이름표를 목에 건 작은 파이썬 뱀. 레슨의 안내자" },
};
export const CAST_BY_NAME = Object.fromEntries(Object.entries(CAST).map(([id, c]) => [c.name, id]));

export const EXPRESSIONS = { 기본: "neutral", 기쁨: "happy", 신남: "excited", 놀람: "surprised", 고민: "thinking", 당황: "flustered", 슬픔: "sad", 뿌듯: "proud", 윙크: "wink", 짜증: "annoyed" };
export const EMOTES = { "!": "exclaim", "?": "question", 땀: "sweat", 하트: "heart", 반짝: "sparkle", 전구: "idea", 음표: "music", 분노: "anger" };
export const ACTIONS = { 등장: "enter", 퇴장: "exit", 점프: "jump", 끄덕: "nod", 도리도리: "shakehead", 손짓: "point", 박수: "clap", 하이파이브: "highfive" };
