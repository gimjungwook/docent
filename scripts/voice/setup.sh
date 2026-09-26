#!/bin/sh
# Creates the Python environments the voice pipeline uses, in scripts/voice/.venv-<name> (gitignored).
# Model weights download on first use into ~/.cache (Hugging Face cache, ~/.cache/supertonic3), never into the repo.
#   scripts/voice/setup.sh align supertonic qwen3 whisper
set -eu
cd "$(dirname "$0")"
[ "$#" -gt 0 ] || set -- align supertonic
for name in "$@"; do
  echo "setting up .venv-$name"
  uv venv ".venv-$name" --python 3.12 -q --allow-existing
  uv pip install -q --python ".venv-$name/bin/python" -r "requirements-$name.txt"
done
