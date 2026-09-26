#!/usr/bin/env python3
"""Re-transcribe evaluation clips with mlx-whisper (large-v3-turbo) to measure pronunciation accuracy.

Runs in a venv that has mlx_whisper (for example the lab's prototypes/.venv-whisper).
usage: transcribe.py <jobs.json> <out.json>
jobs.json: {"jobs": [{"id": ..., "wav": "/abs/clip.wav"}]}
"""
import json
import sys
import time
from pathlib import Path

MODEL = "mlx-community/whisper-large-v3-turbo"


def main() -> None:
    import mlx_whisper

    jobs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["jobs"]
    results = []
    for job in jobs:
        t0 = time.time()
        r = mlx_whisper.transcribe(
            job["wav"],
            path_or_hf_repo=MODEL,
            language="ko",
            temperature=0.0,
            condition_on_previous_text=False,
            word_timestamps=True,
            verbose=None,
        )
        words = [
            {"w": w["word"].strip(), "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3)}
            for seg in r.get("segments", [])
            for w in seg.get("words", [])
        ]
        results.append({"id": job["id"], "text": r["text"].strip(), "words": words, "seconds": round(time.time() - t0, 3)})
        print(f"[whisper] {job['id']}: {r['text'].strip()}", file=sys.stderr, flush=True)
    Path(sys.argv[2]).write_text(json.dumps({"model": MODEL, "results": results}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()

