---
id: variables-story
number: 1
title: 변수
subtitle: 카페 알바 민지의 첫 파이썬
motif: tag
next: conditionals
mode: story
---

[intro] 카페 알바 민지의 첫 파이썬. 첫 번째 레슨, 변수.

# 월요일 아침, 주문 폭주

[scene sc1 민지 사장님 menu=아메리카노:4500,라떼:5000,케이크:6500]
[narr] 월요일 아침 여덟 시. 민지가 일하는 작은 카페에 손님이 몰려들어요.
[사장님 등장]
사장님: 민지 씨, 아메리카노 [circle]세 잔[/circle] 주문이요! [사장님 !]
[민지 당황]
민지: 한 잔에 [marker]{4,500원|사천오백 원}[/marker]이니까, 세 잔이면… [민지 땀]
[민지 전구]
민지: 맞다, 요즘 배우는 파이썬으로 계산해 보자!
[/scene]

[code c1]
print(4500 * 3)
[/code]

[typecode c1] 민지가 노트북에 한 줄을 입력해요. [countdown]실행하기 전에 결과를 먼저 예상해 볼까요? [terminal c1] 실행하면 [countup from=0]{13500|만 삼천오백}[/countup]이 나와요.

[pai] 안녕, 나는 파이야! [파이 윙크] `print`{프린트}는 괄호 안을 계산해서 [underline]화면에 보여 주는 명령[/underline]이야.

# 가격이 오른다고요?

[scene sc2 민지 사장님 도윤 menu=아메리카노:4500,라떼:5000,케이크:6500]
[narr] 점심시간이 지나고, 사장님이 심각한 얼굴로 다가왔어요.
[사장님 짜증]
사장님: 원두값이 또 올랐어요. [사장님 분노] 다음 주부터 아메리카노는 [zoom]{5,000원|오천 원}[/zoom]이에요. [메뉴 아메리카노 5000] [screenshake]
[민지 놀람]
민지: [shake]네에?[/shake] 오늘 짠 코드마다 [circle]{4500|사천오백}[/circle]을 열 번도 넘게 썼는데요! [민지 땀]
[narr] 숫자가 들어간 곳을 전부 찾아서 고쳐야 해요. [vignette]한 군데라도 놓치면 계산이 틀리죠.
[도윤 등장]
도윤: 안녕, 민지야! 무슨 일 있어? [도윤 손짓]
민지: 가격이 바뀌면 코드를 전부 고쳐야 해. [민지 슬픔]
도윤: [도윤 윙크] 그럼 숫자에 [marker]이름[/marker]을 붙여 둬. 그러면 [underline]한 곳만[/underline] 고치면 돼.
[민지 ?]
민지: 숫자에 이름을 붙인다고?
[/scene]

# 이름표 붙이기

[pai] 그게 바로 [bouncein]변수[/bouncein]야! [파이 신남] [lowerthird title="변수" sub="값에 붙이는 이름표"]변수는 값에 붙이는 이름표라고 생각하면 돼.

[code c2]
price = 4500
print(price * 3)
[/code]

[typecode c2] 도윤이 알려 준 대로 민지가 두 줄을 입력해요.

[figure f1 name-tag from=0 to=1]
price 이름표가 4500이 든 상자에 붙어요.
[/figure]

[flyvalue c2 to=f1 line=1] 첫 줄 `price = 4500`{프라이스 이콜 사천오백}은 {4500|사천오백}이라는 값에 `price`{프라이스}라는 [marker]이름표를 붙이라는[/marker] 뜻이에요. [step f1 1] 이름표가 상자에 [jelly]착[/jelly] 붙었죠.

[terminal c2] 이제 `price`{프라이스}라고 부르면 이름표가 붙은 값이 나와요. 그래서 `price * 3`{프라이스 곱하기 삼}은 [countup from=0]{13500|만 삼천오백}[/countup]이에요.

등호는 수학에서 말하는 [strike to="붙인다"]같다[/strike]가 아니에요. 오른쪽 값에 왼쪽 이름을 [spotlight]붙인다는 뜻이에요.[/spotlight]

# 다음 주 월요일

[scene sc3 민지 사장님]
[narr] 드디어 다음 주 월요일. 오늘부터 아메리카노가 {5,000원|오천 원}이에요.
사장님: 민지 씨, 오늘도 아메리카노 세 잔이요! [사장님 기쁨]
민지: [민지 뿌듯] 걱정 마세요. 이번엔 [typewriter]한 줄만[/typewriter] 고치면 돼요! [민지 끄덕]
[/scene]

[code c3]
price = 4500
price = 5000
print(price * 3)
[/code]

[typecode c3] 민지가 코드를 이렇게 고쳤어요. [diff c3 line=2] 같은 이름에 다시 등호를 쓰면, 이름표가 {4500|사천오백}에서 떨어져 {5000|오천}으로 [step f2 2]옮겨 가요.

[figure f2 name-tag from=1 to=2]
price 이름표가 5000으로 옮겨 가요. 이름이 없어진 4500은 더 이상 부를 수 없어요.
[/figure]

[terminal c3] 실행하면 [odometer from=13500]{15000|만 오천}[/odometer]이 나와요. [stamp text="15000"]계산하는 줄은 한 글자도 고치지 않았는데, 결과가 [confetti]알아서 바뀌었어요!

[scene sc4 민지 사장님]
사장님: 우와, 벌써 계산 끝났어요? [사장님 놀람] [사장님 박수]
민지: [민지 점프] [wave]이름표 덕분이에요![/wave] [민지 하트]
[사장님 퇴장]
[narr] 사장님은 흐뭇하게 웃으며 주방으로 들어갔어요.
[/scene]

[checkpoint] 여기까지 [sparkle]잘 따라왔어요. 이름표를 붙이고 옮겨 붙이는 것까지 배웠어요.

# 영수증에도 이름표를

[scene sc5 민지 사장님]
[narr] 마감 후, 카페 뒷방 사무실.
사장님: 민지 씨, 새로 온 알바생이 민지 씨 코드를 보더니 [scramble]숫자가 뭔지 모르겠대요.[/scramble] [사장님 고민]
민지: [민지 전구] 그럼 잔 수랑 합계에도 이름표를 붙일게요!
[/scene]

[code c4]
price = 5000
count = 3
total = price * count
print(total)
[/code]

[typecode c4] 민지가 코드를 이렇게 바꿨어요.

[figure f3 name-tag from=2 to=4]
count와 total 이름표가 생겼어요. total은 price와 count를 곱한 값에 붙어요.
[/figure]

[step f3 3] 잔 수 {3|삼}에는 `count`{카운트}라는 이름표를 붙였어요. [step f3 4] 그리고 `price * count`{프라이스 곱하기 카운트}로 계산한 새 값에는 `total`{토탈}이라는 [marker]이름표를 붙였죠.[/marker]

[terminal c4] 마지막 줄에서 `total`{토탈}을 출력하면 {15000|만 오천}이 [confetti]나와요.

[pai] 숫자만 늘어놓을 때보다, [callout text="total = price * count"]이름만 읽어도[/callout] 무엇을 계산하는지 한눈에 보이지? [파이 반짝]

# 이름 짓기 규칙

[scene sc6 민지 도윤]
[narr] 손님이 뜸한 오후, 민지는 카페 구석 자리에서 노트북을 켰어요. 옆자리에는 도윤이 앉아 있어요.
민지: 이번엔 나이에도 이름표를 붙여 볼래. [민지 음표]
[/scene]

[code c5 error]
2age = 20
[/code]

[typecode c5] 민지가 지은 이름은 `2age`{투 에이지}예요. [terminal c5] [errorfx c5] 실행하자마자 [glitch]오류[/glitch]가 떴어요!

[scene sc7 민지 도윤]
[민지 당황]
민지: 도윤아, 이거 왜 안 돼? [민지 ?]
도윤: [도윤 도리도리] 이름은 [zoom]숫자로 시작할 수 없어.[/zoom] 글자나 밑줄로 시작해야 해.
도윤: [도윤 손짓] 그리고 대문자와 소문자는 [flip3d]서로 다른[/flip3d] 이름이야.
민지: [flash]아하! [민지 기쁨] [민지 하이파이브] [도윤 하이파이브]
[/scene]

[code c6]
user_name = "민지"
age = 20
Age = 30
print(user_name, age, Age)
[/code]

[typecode c6] 규칙대로 고치면 이렇게 돼요. 숫자는 맨 앞만 아니면 괜찮아서, `age2`{에이지 투}는 되지만 `2age`{투 에이지}는 안 돼요. [terminal c6] 실행해 보면 `age`{에이지}는 {20|이십}, `Age`{대문자 에이지}는 {30|삼십}이 나와요. 대문자와 소문자가 다르면 [shockwave]다른 이름표예요.

[tip]
여러 단어로 된 이름은 `user_name`처럼 밑줄로 이어 써요. 파이썬 코드에서 가장 많이 쓰는 방식이에요.
[/tip]

# 오늘의 한 줄

[pai] 자, 오늘 배운 걸 카드 한 장으로 정리해 볼까? [파이 신남]

[turn t1 front="변수" back="값에 붙인 이름표"]

[flip t1] 카드를 뒤집으면, 변수는 [marker]값에 붙인 이름표[/marker]예요. [fireworks]

[outro]
- 변수는 값에 붙인 이름표예요.
- `=`는 오른쪽 값에 왼쪽 이름을 붙여요.
- 이름표는 언제든 다른 값으로 옮겨 붙일 수 있어요.
- 이름은 숫자로 시작할 수 없고, 대문자와 소문자를 구분해요.
[/outro]

[outro-say] 민지는 가격이 바뀌어도 한 줄만 고치면 되는 코드를 만들었어요. 이제 여러분 차례예요. 관심 있는 주제를 골라 직접 연습해 봐요. 다음 레슨에서는 조건문으로 코드에 갈림길을 만들어요.

[practice]
