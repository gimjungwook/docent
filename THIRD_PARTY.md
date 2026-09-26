# Third-party assets

## Fonts

- Pretendard Variable — SIL Open Font License 1.1 — `assets/fonts/PRETENDARD-LICENSE.txt`

## Voice (narration pipeline, scripts/voice)

The narration in `audio/*.m4a` and the comparison clips in `audio/lab/` are machine-generated speech. Every page that plays them must say so (Supertonic licence, Attachment A (e)); `lab/voices.html` does. Model weights are never stored in this repository.

| Component | Used for | Licence | What the repo contains |
|---|---|---|---|
| Supertonic 3 model (Supertone Inc.), `Supertone/supertonic-3`, revision 724fb5a pinned by the package | default narration voice (F1, speed 0.9) | BigScience Open RAIL-M (2022-08-18), `https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE`. §6: the licensor claims no rights in generated output; we are accountable for it, and its use may not contravene the licence. Attachment A lists restricted uses, including (e): no machine-generated content placed in any context without expressly and intelligibly disclaiming that it is machine generated. §7: make reasonable efforts to use the latest model version. | generated audio only; weights download to `~/.cache/supertonic3` |
| `supertonic` Python package 1.3.1, ONNX Runtime | runs Supertonic | MIT, MIT | nothing (installed in `scripts/voice/.venv-supertonic`) |
| Qwen3-TTS 1.7B CustomVoice (Alibaba Qwen), 8-bit MLX conversion `mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit`; mlx-audio 0.5.6 | optional provider, lab comparison clip | Apache-2.0; mlx-audio MIT | lab clip only |
| `kresnik/wav2vec2-large-xlsr-korean`; PyTorch 2.8, Transformers 4.57 | per-word timings (forced alignment) in `data/*.timings.json` | Apache-2.0; BSD-3-Clause, Apache-2.0 | timings only |
| mlx-whisper 0.4.3 with `whisper-large-v3-turbo` | evaluation only (re-transcription) | MIT | nothing |
| FFmpeg | decoding, loudness measurement and AAC encoding at build time | LGPL/GPL (local Homebrew build) | nothing (build tool) |
| macOS `say` (Yuna) | local placeholder only | Apple's macOS licence limits system voices to personal, non-commercial use | nothing: its clips live in the gitignored `.cache/` |
| Fish Audio S2 Pro via OpenRouter | optional provider (lab key currently unauthorized) | Fish Audio and OpenRouter terms | nothing |

## Practice (src/practice, content/practice)

The practice section runs Python in the learner's browser and can ask a local AI model for feedback. Nothing below is stored in this repository, no API key is used, and no paid service is called.

| Component | Used for | Licence | What the repo contains |
|---|---|---|---|
| Pyodide 314.0.7 (`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`), bundling CPython 3.14.2 | runs and grades learner code in a Web Worker; fetched from the official jsDelivr CDN only when a learner first presses 실행 or 채점 | Mozilla Public License 2.0 (Pyodide); PSF License Agreement (CPython); bundled parts keep their own licences, listed at `https://github.com/pyodide/pyodide` | nothing (version pinned in `src/practice/runner.js`) |
| Ollama | optional local model server for the AI helper at `http://127.0.0.1:11434`; probed only when the page itself is served from the same computer | MIT | nothing |
| EXAONE 3.5 7.8B (LG AI Research), Ollama tag `exaone3.5:7.8b` | preferred model for the AI helper's Korean feedback | EXAONE AI Model License Agreement 1.1 - NC: research and non-commercial use only; the model, derivatives and outputs may not be used commercially, and commercial use needs a separate licence from LG Management Development Institute | nothing (installed with `ollama pull exaone3.5:7.8b`) |
| Llama 3.1 8B (Meta), Ollama tag `llama3.1:latest` | fallback model when EXAONE is not installed | Llama 3.1 Community License Agreement and Meta's Acceptable Use Policy | nothing |

If Docent is ever used commercially, the AI helper must not use EXAONE 3.5 without a commercial licence; pass another model through `mountPractice(..., { ai: { models: [...] } })`.

## Effects, motion and sound (motion)

- No third-party code, images, fonts or audio files. Effects use the Web Animations API and Canvas 2D; every sound is synthesized at runtime with the Web Audio API (the reverb impulse is generated noise). Python syntax colouring in code blocks is our own small tokenizer (`src/components/highlight.js`).
