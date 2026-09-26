#!/usr/bin/env python3
"""Qwen3-TTS provider for build.mjs / eval.mjs (Qwen3-TTS 1.7B CustomVoice, 8-bit MLX, Apple Silicon).

Weights: mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit in the Hugging Face cache (Apache-2.0).
Sampling is seeded per sentence so a cached clip can be regenerated identically.

usage: qwen3_tts.py <jobs.json> <out.json>
jobs.json: {"voice": "Sohee", "options": {"model": ..., "language": "korean", "seed": 7, "instruct": null},
            "jobs": [{"id": ..., "text": ..., "out": "/abs/file.wav"}]}
"""
import json
import os
import sys
import time
import zlib
from pathlib import Path

import numpy as np
import soundfile as sf

DEFAULT_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit"


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    opts = spec.get("options", {})
    t0 = time.time()
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model

    model = load_model(opts.get("model", DEFAULT_MODEL))
    load = time.time() - t0
    sr = model.sample_rate
    print(f"[qwen3] model ready in {load:.1f}s (sr {sr}), speaker {spec['voice']}", file=sys.stderr, flush=True)
    results = []
    for job in spec["jobs"]:
        mx.random.seed(int(opts.get("seed", 7)) + zlib.crc32(job["text"].encode("utf-8")) % 100000)
        t1 = time.time()
        chunks = [
            np.asarray(r.audio, dtype=np.float32).reshape(-1)
            for r in model.generate_custom_voice(
                text=job["text"],
                speaker=spec["voice"],
                language=opts.get("language", "korean"),
                instruct=opts.get("instruct"),
                temperature=float(opts.get("temperature", 0.9)),
            )
        ]
        audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
        sf.write(job["out"], audio, sr, subtype="PCM_16")
        secs = time.time() - t1
        results.append({"id": job["id"], "seconds": round(secs, 4)})
        print(f"[qwen3] {job['id']}: {len(audio) / sr:.2f}s audio in {secs:.2f}s", file=sys.stderr, flush=True)
    Path(sys.argv[2]).write_text(json.dumps({"load_seconds": round(load, 3), "results": results}), encoding="utf-8")


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
