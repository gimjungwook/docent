#!/usr/bin/env python3
"""Per-word forced alignment of known Korean text to short speech clips.

CTC Viterbi alignment with the wav2vec2 model kresnik/wav2vec2-large-xlsr-korean
(Apache-2.0, cached in ~/.cache/huggingface). build.mjs calls this once per build
with every clip that is not in the alignment cache, so the model loads once.

jobs file: {"jobs": [{"id": "s1", "wav": "/abs/clip-16k.wav", "words": ["파이썬", "첫걸음,", ...]}]}
out file:  {"model": ..., "results": [{"id", "ok", "words": [[start, end], ...],
            "wordConfidence": [...], "confidence", "error"}]}
Times are seconds relative to the start of the clip. Clips must be 16 kHz mono 16-bit PCM.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import unicodedata
import wave
from pathlib import Path

import numpy as np

MODEL_ID = "kresnik/wav2vec2-large-xlsr-korean"
SR = 16000
HOP = 320            # wav2vec2 frame stride in samples (20 ms)
PAD_S = 0.2          # silence added around each clip before inference
NEG = -1e30


def log(msg: str) -> None:
    print(f"[align] {msg}", file=sys.stderr, flush=True)


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getframerate() != SR:
            raise ValueError(f"{path}: expected 16 kHz mono 16-bit PCM")
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
    return pcm.astype(np.float32) / 32768.0


def spoken_chars(word: str) -> str:
    """Letters only: drops punctuation, symbols, spaces and control characters."""
    word = unicodedata.normalize("NFC", word)
    return "".join(ch for ch in word if unicodedata.category(ch)[0] in "LN")


def targets(words: list[str], vocab: dict[str, int], delim: int):
    """Token ids (-1 = wildcard for characters outside the model vocabulary) and owning word index (-1 = delimiter)."""
    tokens: list[int] = []
    owner: list[int] = []
    for wi, word in enumerate(words):
        chars = spoken_chars(word)
        if not chars:
            continue
        if tokens:
            tokens.append(delim)
            owner.append(-1)
        for ch in chars:
            tokens.append(vocab.get(ch, -1))
            owner.append(wi)
    return tokens, owner


def ctc_viterbi(logp: np.ndarray, tokens: list[int], blank: int):
    """Best CTC path (blank-interleaved topology) through the known token sequence."""
    T = logp.shape[0]
    L = len(tokens)
    S = 2 * L + 1
    if T < L:
        raise ValueError(f"clip too short: {T} frames for {L} tokens")
    wildcard = np.delete(logp, blank, axis=1).max(axis=1)
    em = np.empty((T, S), dtype=np.float64)
    em[:, 0::2] = logp[:, blank][:, None]
    for k, tok in enumerate(tokens):
        em[:, 2 * k + 1] = wildcard if tok < 0 else logp[:, tok]
    skip = np.zeros(S, dtype=bool)
    for k in range(1, L):
        skip[2 * k + 1] = tokens[k] < 0 or tokens[k] != tokens[k - 1]
    dp = np.full(S, NEG)
    dp[0] = em[0, 0]
    dp[1] = em[0, 1]
    back = np.zeros((T, S), dtype=np.int8)
    idx = np.arange(S)
    for t in range(1, T):
        from1 = np.concatenate(([NEG], dp[:-1]))
        from2 = np.where(skip, np.concatenate(([NEG, NEG], dp[:-2])), NEG)
        stacked = np.stack([dp, from1, from2])
        choice = stacked.argmax(axis=0)
        dp = stacked[choice, idx] + em[t]
        back[t] = choice
    end = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    if dp[end] < NEG / 2:
        raise ValueError("no valid alignment")
    path = np.empty(T, dtype=np.int64)
    s = end
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= back[t, s]
    return path, em


def frame_energy_db(audio: np.ndarray, n_frames: int) -> np.ndarray:
    out = np.full(n_frames, -120.0)
    for t in range(n_frames):
        chunk = audio[t * HOP:(t + 1) * HOP]
        if chunk.size:
            out[t] = 20 * np.log10(np.sqrt(np.mean(chunk.astype(np.float64) ** 2)) + 1e-9)
    return out


def align_clip(model, fe, torch, device, vocab, blank, delim, wav: str, words: list[str]):
    audio = read_wav(wav)
    clip_s = len(audio) / SR
    pad = np.zeros(int(PAD_S * SR), dtype=np.float32)
    padded = np.concatenate([pad, audio, pad])
    feats = fe(padded, sampling_rate=SR, return_tensors="pt")
    with torch.inference_mode():
        logits = model(feats.input_values.to(device)).logits[0]
    logp = torch.log_softmax(logits.float(), dim=-1).cpu().numpy()
    T = logp.shape[0]

    tokens, owner = targets(words, vocab, delim)
    if not tokens:
        raise ValueError("no alignable characters")
    path, em = ctc_viterbi(logp, tokens, blank)

    L = len(tokens)
    first = np.full(L, -1)
    last = np.full(L, -1)
    probs = [[] for _ in range(L)]
    for t, s in enumerate(path):
        if s % 2 == 1:
            k = (s - 1) // 2
            if first[k] < 0:
                first[k] = t
            last[k] = t
            probs[k].append(float(np.exp(em[t, s])))

    n = len(words)
    spans: list[list[int] | None] = [None] * n
    conf = [0.0] * n
    for wi in range(n):
        ks = [k for k in range(L) if owner[k] == wi]
        if not ks:
            continue
        spans[wi] = [int(first[ks].min()), int(last[ks].max()) + 1]
        conf[wi] = float(np.mean([np.mean(probs[k]) for k in ks]))

    # Snap word edges to the speech energy: extend a word to the end of its sound (not into a pause)
    # and pull a word start back to its onset after a pause (at most 100 ms).
    energy = frame_energy_db(padded, T)
    thr = max(float(energy.max()) - 38.0, -55.0)
    lo = int(PAD_S * SR / HOP)
    hi = min(T, int((PAD_S + clip_s) * SR / HOP) + 1)
    present = [wi for wi in range(n) if spans[wi] is not None]
    for j, wi in enumerate(present):
        start, end = spans[wi]
        next_start = spans[present[j + 1]][0] if j + 1 < len(present) else hi
        while end < next_start and energy[end] > thr:
            end += 1
        if j + 1 == len(present):
            end = max(end, min(hi, spans[wi][1]))
        spans[wi][1] = max(end, start + 1)
    for j, wi in enumerate(present):
        prev_end = spans[present[j - 1]][1] if j > 0 else lo
        start = spans[wi][0]
        floor = max(prev_end, start - 5, lo)
        while start - 1 >= floor and energy[start - 1] > thr:
            start -= 1
        spans[wi][0] = start

    # Words without letters (only symbols) get a zero-length slot at the previous word's end.
    times: list[list[float]] = []
    prev = 0.0
    for wi in range(n):
        if spans[wi] is None:
            times.append([prev, prev])
            continue
        s = min(max(spans[wi][0] * HOP / SR - PAD_S, 0.0), clip_s)
        e = min(max(spans[wi][1] * HOP / SR - PAD_S, s), clip_s)
        times.append([round(s, 3), round(e, 3)])
        prev = times[-1][1]
    scored = [conf[wi] for wi in range(n) if spans[wi] is not None]
    return {
        "ok": True,
        "words": times,
        "wordConfidence": [round(c, 3) for c in conf],
        "confidence": round(float(np.mean(scored)), 3) if scored else 0.0,
        "wildcards": sum(1 for t in tokens if t < 0),
        "clip": round(clip_s, 3),
    }


def load_model(device: str):
    import torch
    from huggingface_hub import hf_hub_download
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC

    def get(fn, *a, **kw):
        try:
            return fn(*a, local_files_only=True, **kw)
        except Exception:
            return fn(*a, **kw)

    vocab = json.loads(Path(get(hf_hub_download, MODEL_ID, "vocab.json")).read_text(encoding="utf-8"))
    fe = get(Wav2Vec2FeatureExtractor.from_pretrained, MODEL_ID)
    model = get(Wav2Vec2ForCTC.from_pretrained, MODEL_ID).to(device).eval()
    blank = int(model.config.pad_token_id)
    return torch, model, fe, vocab, blank, int(vocab["|"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    jobs = json.loads(args.jobs.read_text(encoding="utf-8"))["jobs"]
    t0 = time.time()
    torch, model, fe, vocab, blank, delim = load_model(args.device)
    log(f"model ready in {time.time() - t0:.1f}s ({args.device}); aligning {len(jobs)} clip(s)")
    results = []
    for job in jobs:
        t1 = time.time()
        try:
            res = align_clip(model, fe, torch, args.device, vocab, blank, delim, job["wav"], job["words"])
        except Exception as exc:  # the caller falls back to proportional timing
            res = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        res["id"] = job["id"]
        res["seconds"] = round(time.time() - t1, 3)
        results.append(res)
    args.out.write_text(json.dumps({"model": MODEL_ID, "results": results}, ensure_ascii=False), encoding="utf-8")
    log(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()

