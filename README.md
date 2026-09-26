# Docent (도슨트)

글로 읽으면 교과서처럼 읽히고, 재생 버튼을 누르면 옆에서 설명해 주는 강의처럼 재생되는 레슨 페이지입니다. 재생하면 음성이 레슨을 읽고, 페이지는 지금 읽는 문장이 늘 같은 자리에 오도록 스스로 스크롤하며, 대본에 약속해 둔 자리에서 효과가 한 번씩 나옵니다. 효과가 나오는 동안에는 화면이 멈추고, 직접 스크롤하면 언제든 사용자가 우선입니다.

- 첫 코스: 파이썬 첫걸음 (레슨 1 "변수" 공개)
- 만드는 방식: HTML·CSS·JavaScript만 사용한 정적 페이지
- 레슨 음성: AI 합성 음성 (Supertonic 3, 라이선스는 [THIRD_PARTY.md](THIRD_PARTY.md))

## 보기

```bash
python3 -m http.server 8810
```

| 주소 | 내용 |
| --- | --- |
| http://127.0.0.1:8810/ | 코스 첫 화면 |
| http://127.0.0.1:8810/lessons/variables.html | 레슨 1 "변수" |
| http://127.0.0.1:8810/lab/components.html | 구성 요소 10종을 하나씩 확인 |
| http://127.0.0.1:8810/lab/voices.html | 목소리 비교 |
| http://127.0.0.1:8810/lab/practice.html | 직접 해 보기(실습)만 따로 확인 |

레슨 화면 오른쪽 위 "시안 비교"에서 인트로 스타일, 효과 세기, 읽는 문장 집중, 효과음을 바꿔 볼 수 있습니다. 실습의 AI 도우미는 이 컴퓨터에서 Ollama(EXAONE 3.5 7.8B)가 켜져 있을 때만 동작하고, 그렇지 않으면 힌트로 안내합니다.

## 만들기

```bash
node scripts/compile.mjs                       # 대본(content/lessons/*.md) → 페이지와 레슨 데이터. 코드 예시를 실제로 실행합니다.
scripts/voice/setup.sh align supertonic         # 음성 도구 설치(처음 한 번)
node scripts/voice/build.mjs variables          # 레슨 음성과 단어별 시각 만들기
node --test tests/*.test.mjs                    # 구조 검사
python3 scripts/check_practice.py               # 실습 문제 검사
```

## 문서

- [SPEC.md](SPEC.md): 개발 규약
- [DESIGN.md](DESIGN.md): 디자인 결정과 참고한 디자인
- [COMPONENTS.md](COMPONENTS.md): 레슨 대본에 쓰는 구성 요소 10종과 규칙 (AI가 레슨을 쓸 때 따르는 문서)
- [docs/voice-eval.md](docs/voice-eval.md): 목소리 비교 결과
