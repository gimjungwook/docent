# 음성 파이프라인 (scripts/voice)

레슨의 `say` 문장을 한 문장씩 합성하고, 문장 사이에 `pauseBefore`/`pauseAfter` 무음을 정확히 넣어 `audio/<id>.m4a`를 만들고, 단어마다 절대 시각을 붙인 `data/<id>.timings.json`(SPEC §8)을 씁니다.

## 처음 한 번

```bash
scripts/voice/setup.sh align supertonic      # 기본 경로: 정렬 + Supertonic
scripts/voice/setup.sh qwen3 whisper         # 선택: Qwen3-TTS, 평가용 받아쓰기
```

가상환경은 `scripts/voice/.venv-*`(gitignore)에 생기고, 모델 가중치는 처음 쓸 때 `~/.cache`(Hugging Face 캐시, `~/.cache/supertonic3`)로 내려받습니다. 저장소에는 가중치를 두지 않습니다.

## 빌드

```bash
node scripts/voice/build.mjs variables                      # 기본 목소리(Supertonic 3, F1)
node scripts/voice/build.mjs variables --provider say       # macOS 유나: 로컬 확인용, 공개 금지
node scripts/voice/build.mjs sample --input content/samples/voice-sample.json
```

옵션: `--provider supertonic|qwen3|say|fish-openrouter`, `--voice <화자>`, `--force-align`, `--allow-non-hangul`.

- 합성 결과는 `.cache/voice/tts/<provider>/`에 문장별로 저장됩니다(키: provider+model+voice+설정+문장). 문장을 고치면 그 문장만 다시 합성합니다.
- 단어 시각은 `kresnik/wav2vec2-large-xlsr-korean`으로 문장마다 강제 정렬합니다(`align.py`). 정렬이 실패하거나 믿기 어려우면 글자 수 비례 시각으로 바꾸고 `"align": "proportional"`로 표시합니다.
- `say`는 한글로 정규화돼 있어야 합니다. 숫자나 영문이 남아 있으면 빌드가 멈춥니다.
- 음량은 약 -16 LUFS(참 피크 -1.5 dBTP 이하)로 맞추고 AAC 96 kbps 모노로 저장합니다. 무음 길이와 시각은 샘플 단위로 유지됩니다.
- Fish S2 Pro(OpenRouter)는 환경 변수 `OPENROUTER_API_KEY` 또는 `DOCENT_ENV_FILE`이 가리키는 .env 파일의 키를 읽고, 키가 거부되면(401) 건너뜁니다.

## 목소리 평가

```bash
node scripts/voice/eval.mjs     # audio/lab/eval.json, audio/lab/*.m4a → lab/voices.html
```

결과와 추천은 [docs/voice-eval.md](../../docs/voice-eval.md)에 있습니다. 공개 페이지에서 Supertonic 음성을 쓸 때는 AI 합성 음성이라는 표기가 필요합니다(THIRD_PARTY.md).
