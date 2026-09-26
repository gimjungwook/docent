#!/usr/bin/env python3
"""Supertonic provider for build.mjs / eval.mjs (Supertone, ONNX Runtime, runs on CPU).

Model weights download on first use into ~/.cache/supertonic3 (override: SUPERTONIC_CACHE_DIR),
never into the repository. Package code: MIT. Model: BigScience Open RAIL-M (see THIRD_PARTY.md).

usage: supertonic_tts.py <jobs.json> <out.json>
jobs.json: {"voice": "F1", "options": {"lang": "ko", "model": "supertonic-3", "steps": 8, "speed": 0.9, "seed": 7},
            "jobs": [{"id": ..., "text": ..., "out": "/abs/file.wav"}]}
The model starts each sentence from NumPy random noise; seeding it per sentence makes a clip reproducible.
"""
import json
import os
import sys
import time
import zlib
from pathlib import Path

import numpy as np
import soundfile as sf


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    opts = spec.get("options", {})
    t0 = time.time()
    from supertonic import TTS

    tts = TTS(model=opts.get("model", "supertonic-3"))
    style = tts.get_voice_style(spec["voice"])
    load = time.time() - t0
    print(f"[supertonic] {tts.model_name} ready in {load:.1f}s, voice {spec['voice']}", file=sys.stderr, flush=True)
    results = []
    for job in spec["jobs"]:
        np.random.seed((int(opts.get("seed", 7)) + zlib.crc32(job["text"].encode("utf-8"))) % (2**32))
        t1 = time.time()
        wav, _ = tts.synthesize(
            job["text"],
            voice_style=style,
            lang=opts.get("lang", "ko"),
            total_steps=int(opts.get("steps", 8)),
            speed=float(opts.get("speed", 1.05)),
        )
        sf.write(job["out"], np.asarray(wav, dtype=np.float32).reshape(-1), tts.sample_rate, subtype="PCM_16")
        results.append({"id": job["id"], "seconds": round(time.time() - t1, 4)})
    Path(sys.argv[2]).write_text(json.dumps({"load_seconds": round(load, 3), "results": results}), encoding="utf-8")


if __name__ == "__main__":
    main()
    # ONNX Runtime can abort in its static destructors while CPython tears down threads on macOS
    # ("recursive_mutex lock failed"); all output is written by now, so skip interpreter teardown.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
