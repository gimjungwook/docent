#!/usr/bin/env python3
"""Check Docent practice sets with real Python.

For every exercise in content/practice/*.json (or the files given):
  * the data has the shape SPEC section 9 describes (ids, levels, prompt, starter,
    checks, exactly 3 hints, solution);
  * the solution runs without an error and passes every check;
  * the starter fails at least one check, so there is something to practise.

Grading uses src/practice/harness.py, the same file the browser runs inside
Pyodide, so a set that passes here grades the same way on the page.

Usage:  python3 scripts/check_practice.py [content/practice/<lesson>.json ...]
Exit status is 0 when everything passes and 1 otherwise.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import signal
import sys

sys.dont_write_bytecode = True  # keep src/practice free of __pycache__

ROOT = pathlib.Path(__file__).resolve().parent.parent
HARNESS_PATH = ROOT / "src" / "practice" / "harness.py"
PRACTICE_DIR = ROOT / "content" / "practice"
BROWSER_PYTHON = (3, 14)  # Pyodide 314.0.7 (src/practice/runner.js) bundles CPython 3.14.2
RUN_SECONDS = 5


def load_harness():
    spec = importlib.util.spec_from_file_location("docent_practice_harness", HARNESS_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RunTimeout(Exception):
    pass


def run_limited(harness, code, checks):
    """Run through the harness, stopping code that loops for more than RUN_SECONDS."""
    if not hasattr(signal, "SIGALRM"):
        return harness.run(code, checks)

    def on_alarm(signum, frame):
        raise RunTimeout(f"did not finish within {RUN_SECONDS} s")

    previous = signal.signal(signal.SIGALRM, on_alarm)
    signal.alarm(RUN_SECONDS)
    try:
        return harness.run(code, checks)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


def text_field(value):
    return isinstance(value, str) and value.strip() != ""


def validate(data):
    """Return a list of problems with the shape of one practice set."""
    problems = []

    def need(condition, message):
        if not condition:
            problems.append(message)

    if not isinstance(data, dict):
        return ["the file must contain a JSON object"]
    need(text_field(data.get("lesson")), "lesson id is missing")
    themes = data.get("themes")
    need(isinstance(themes, list) and themes, "themes must be a non-empty list")
    theme_ids, exercise_ids = set(), set()
    for t_index, theme in enumerate(themes if isinstance(themes, list) else []):
        where = f"themes[{t_index}]"
        if not isinstance(theme, dict):
            problems.append(f"{where}: must be an object")
            continue
        theme_id = theme.get("id")
        need(text_field(theme_id), f"{where}: id is missing")
        need(theme_id not in theme_ids, f"{where}: duplicate theme id {theme_id!r}")
        theme_ids.add(theme_id)
        need(text_field(theme.get("label")), f"{where}: label is missing")
        exercises = theme.get("exercises")
        need(isinstance(exercises, list) and exercises, f"{where}: exercises must be a non-empty list")
        levels = []
        for e_index, exercise in enumerate(exercises if isinstance(exercises, list) else []):
            ewhere = f"{theme_id or where}/{exercise.get('id') if isinstance(exercise, dict) else e_index}"
            if not isinstance(exercise, dict):
                problems.append(f"{ewhere}: must be an object")
                continue
            exercise_id = exercise.get("id")
            need(text_field(exercise_id), f"{ewhere}: id is missing")
            need(exercise_id not in exercise_ids, f"{ewhere}: duplicate exercise id")
            exercise_ids.add(exercise_id)
            level = exercise.get("level")
            need(isinstance(level, int) and not isinstance(level, bool) and level >= 1, f"{ewhere}: level must be a positive integer")
            levels.append(level if isinstance(level, int) else 0)
            for key in ("title", "prompt", "starter", "solution"):
                need(text_field(exercise.get(key)), f"{ewhere}: {key} is missing")
            need(exercise.get("starter") != exercise.get("solution"), f"{ewhere}: starter and solution are identical")
            hints = exercise.get("hints")
            need(isinstance(hints, list) and len(hints) == 3 and all(text_field(h) for h in hints), f"{ewhere}: needs exactly 3 non-empty hints")
            checks = exercise.get("checks")
            need(isinstance(checks, list) and checks, f"{ewhere}: checks must be a non-empty list")
            for c_index, check in enumerate(checks if isinstance(checks, list) else []):
                cwhere = f"{ewhere} check {c_index + 1}"
                if not isinstance(check, dict):
                    problems.append(f"{cwhere}: must be an object")
                    continue
                kind = check.get("type")
                need(kind in ("stdout", "assert"), f"{cwhere}: type must be 'stdout' or 'assert'")
                need(text_field(check.get("label")), f"{cwhere}: label is missing")
                need(text_field(check.get("fail")), f"{cwhere}: fail reason is missing")
                if kind == "stdout":
                    need(isinstance(check.get("expect"), str), f"{cwhere}: expect must be a string")
                    need(check.get("match", "exact") in ("exact", "contains"), f"{cwhere}: match must be 'exact' or 'contains'")
                elif kind == "assert":
                    snippet = check.get("code")
                    need(text_field(snippet), f"{cwhere}: code is missing")
                    if text_field(snippet):
                        try:
                            compile(snippet, "<check>", "exec")
                        except SyntaxError as exc:
                            problems.append(f"{cwhere}: check code does not compile ({exc.msg})")
        need(levels == sorted(levels), f"{where}: exercises should be ordered by level")
    default_theme = data.get("defaultTheme")
    if default_theme is not None:
        need(default_theme in theme_ids, f"defaultTheme {default_theme!r} is not one of the themes")
    return problems


def describe_failure(item):
    if item.get("skipped"):
        return "not graded because the code stopped with an error"
    if item.get("missing"):
        return f"name {item['missing']!r} is not defined"
    if item.get("problem"):
        return item["problem"]
    if item.get("type") == "stdout":
        return f"expected {item.get('expected')!r}, got {item.get('actual')!r}"
    return "assertion failed"


def check_exercise(harness, exercise):
    """Return (problems, one-line summary) for one exercise."""
    problems = []
    if not (text_field(exercise.get("starter")) and text_field(exercise.get("solution")) and isinstance(exercise.get("checks"), list) and exercise["checks"]):
        return ["cannot run: starter, solution or checks are missing"], "not run"
    if not all(isinstance(check, dict) for check in exercise["checks"]):
        return ["cannot run: every check must be an object"], "not run"
    checks = exercise["checks"]
    total = len(checks)

    solution = run_limited(harness, exercise["solution"], checks)
    if solution["error"]:
        err = solution["error"]
        problems.append(f"solution stops with {err['summary']} (line {err.get('line')})")
    for item in solution.get("checks", []):
        if not item["passed"]:
            problems.append(f"solution fails {item['label']!r}: {describe_failure(item)}")
    if solution["stderr"].strip():
        problems.append(f"solution writes to stderr: {solution['stderr'].strip()[:120]!r}")
    solution_passed = sum(1 for item in solution.get("checks", []) if item["passed"])

    starter = run_limited(harness, exercise["starter"], checks)
    starter_failed = [item for item in starter.get("checks", []) if not item["passed"]]
    if not starter_failed:
        problems.append("starter already passes every check, so there is nothing to practise")
    if starter["error"]:
        err = starter["error"]
        starter_note = f"starter stops with {err['type']} on line {err.get('line')}"
    else:
        starter_note = f"starter fails {len(starter_failed)}/{total}"

    summary = f"solution passes {solution_passed}/{total} · {starter_note}"
    return problems, summary


def main(argv):
    paths = [pathlib.Path(arg) for arg in argv] or sorted(PRACTICE_DIR.glob("*.json"))
    if not paths:
        print(f"no practice sets found in {PRACTICE_DIR.relative_to(ROOT)}")
        return 1
    harness = load_harness()
    version = ".".join(str(part) for part in sys.version_info[:3])
    print(f"Docent practice check · Python {version} · grader {HARNESS_PATH.relative_to(ROOT)}")
    if sys.version_info[:2] != BROWSER_PYTHON:
        print(f"note: the browser runs Python {BROWSER_PYTHON[0]}.{BROWSER_PYTHON[1]}; error wording can differ slightly")

    failures = 0
    exercises_seen = 0
    for path in paths:
        shown = path.resolve().relative_to(ROOT) if path.resolve().is_relative_to(ROOT) else path
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"\n{shown}\n  FAIL cannot read: {exc}")
            failures += 1
            continue
        themes = data.get("themes") if isinstance(data, dict) else None
        count = sum(len(t.get("exercises") or []) for t in themes or [] if isinstance(t, dict))
        print(f"\n{shown} · lesson {data.get('lesson') if isinstance(data, dict) else '?'} · {len(themes or [])} themes · {count} exercises")
        shape_problems = validate(data)
        for problem in shape_problems:
            print(f"  FAIL {problem}")
        failures += len(shape_problems)
        if not isinstance(themes, list):
            continue
        for theme in themes:
            exercises = theme.get("exercises") if isinstance(theme, dict) else None
            for exercise in exercises if isinstance(exercises, list) else []:
                if not isinstance(exercise, dict):
                    continue
                exercises_seen += 1
                problems, summary = check_exercise(harness, exercise)
                status = "FAIL" if problems else "ok  "
                print(f"  {status} {str(exercise.get('id')):<10} L{exercise.get('level')}  {summary}")
                for problem in problems:
                    print(f"         - {problem}")
                failures += 1 if problems else 0

    if failures:
        print(f"\n{failures} problem(s) found.")
        return 1
    print(f"\nAll {exercises_seen} exercises OK: every solution passes its checks and every starter fails at least one.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
