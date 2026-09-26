"""Docent practice harness: run a learner's code and grade it against checks.

The same file runs in two places, so grading in the browser and the build-time
check can never drift apart:
  * in the browser, inside Pyodide (loaded by src/practice/py-worker.js);
  * on the command line, under CPython (imported by scripts/check_practice.py).

Check kinds (content/practice/<lesson>.json):
  {"type": "stdout", "expect": "13500"}                      exact output
  {"type": "stdout", "expect": "13500", "match": "contains"}  expected text appears
  {"type": "assert", "code": "assert total == 13500"}         snippet must not raise

Output comparisons ignore trailing spaces on each line and trailing blank lines.
Assert snippets run after the learner's code, in the same namespace, and can use
these helpers:
  _src                the learner's source code
  _out                everything the learner's code printed
  _names              names the learner's code defined (sorted list)
  _assigns(name)      how many assignment statements bind `name`
  _uses(name, *deps)  True if some assignment to `name` reads every name in deps
"""

import ast
import builtins
import contextlib
import io
import json
import re
import traceback

LEARNER_FILE = "<learner>"
CHECK_FILE = "<check>"
OUTPUT_LIMIT = 20_000
_SUGGESTION = re.compile(r"Did you mean:? '([^']+)'\?")


class InputNotAvailable(RuntimeError):
    """Raised when learner code calls input(); the practice page has no keyboard stdin."""


InputNotAvailable.__module__ = "builtins"  # show "InputNotAvailable: ..." without a module prefix


def _no_input(prompt=""):
    raise InputNotAvailable("input() is not available here; write the value in the code instead")


class _Capture(io.TextIOBase):
    """A text stream that keeps at most `limit` characters."""

    def __init__(self, limit=OUTPUT_LIMIT):
        super().__init__()
        self._parts = []
        self._size = 0
        self.limit = limit
        self.truncated = False

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        room = self.limit - self._size
        if room > 0:
            piece = text[:room]
            self._parts.append(piece)
            self._size += len(piece)
        if len(text) > max(room, 0):
            self.truncated = True
        return len(text)

    def getvalue(self):
        return "".join(self._parts)


def normalize_output(text):
    """Compare outputs the way a person reads them: ignore trailing spaces and blank lines."""
    text = str(text).replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).rstrip("\n")


def _source_line(code, lineno):
    lines = code.split("\n")
    if lineno and 1 <= lineno <= len(lines):
        return lines[lineno - 1]
    return None


def _describe_syntax_error(exc, code):
    name = type(exc).__name__
    return {
        "kind": "syntax",
        "type": name,
        "message": exc.msg,
        "summary": f"{name}: {exc.msg}",
        "line": exc.lineno,
        "col": exc.offset,
        "endCol": getattr(exc, "end_offset", None),
        "text": _source_line(code, exc.lineno),
    }


def _describe_runtime_error(exc, code):
    line = None
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == LEARNER_FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    try:
        summary = "".join(traceback.TracebackException.from_exception(exc).format_exception_only()).strip()
    except Exception:  # noqa: BLE001 - formatting must never hide the real error
        summary = f"{type(exc).__name__}: {exc}"
    info = {
        "kind": "runtime",
        "type": type(exc).__name__,
        "message": str(exc),
        "summary": summary,
        "line": line,
        "text": _source_line(code, line),
    }
    if isinstance(exc, NameError) and getattr(exc, "name", None):
        info["name"] = exc.name
    match = _SUGGESTION.search(summary)
    if match:
        info["suggestion"] = match.group(1)
    return info


def _binds(target, name):
    if isinstance(target, ast.Name):
        return target.id == name
    if isinstance(target, (ast.Tuple, ast.List)):
        return any(_binds(item, name) for item in target.elts)
    if isinstance(target, ast.Starred):
        return _binds(target.value, name)
    return False


def _read_names(expr):
    return {node.id for node in ast.walk(expr) if isinstance(node, ast.Name)}


def _helpers(code, stdout, ns):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        tree = None
    names = sorted(key for key in ns if not (key.startswith("__") and key.endswith("__")))

    def assignments(name):
        found = []
        if tree is None:
            return found
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                if any(_binds(target, name) for target in node.targets):
                    found.append(_read_names(node.value))
            elif isinstance(node, ast.AugAssign):
                if _binds(node.target, name):
                    found.append(_read_names(node.value) | {name})
            elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)):
                if node.value is not None and _binds(node.target, name):
                    found.append(_read_names(node.value))
        return found

    def _assigns(name):
        return len(assignments(name))

    def _uses(name, *deps):
        return any(set(deps) <= used for used in assignments(name))

    return {"_src": code, "_out": stdout, "_names": names, "_assigns": _assigns, "_uses": _uses}


def _run_assert(snippet, ns, helpers):
    saved = {key: ns[key] for key in helpers if key in ns}
    ns.update(helpers)
    sink = _Capture(2000)
    try:
        compiled = compile(snippet, CHECK_FILE, "exec", dont_inherit=True)
        with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            exec(compiled, ns)
    except AssertionError:
        return {"passed": False}
    except NameError as exc:
        return {"passed": False, "missing": getattr(exc, "name", None)}
    except Exception as exc:  # noqa: BLE001 - a check that cannot run counts as failed
        return {"passed": False, "problem": f"{type(exc).__name__}: {exc}"}
    finally:
        for key in helpers:
            ns.pop(key, None)
        ns.update(saved)
    return {"passed": True}


def _grade(checks, code, stdout, ns, error):
    results = []
    helpers = None
    for index, check in enumerate(checks):
        kind = check.get("type")
        item = {"id": check.get("id") or f"c{index + 1}", "type": kind, "label": check.get("label", ""), "passed": False}
        if error is not None:
            item["skipped"] = True
        elif kind == "stdout":
            expected = normalize_output(check.get("expect", ""))
            actual = normalize_output(stdout)
            if check.get("match", "exact") == "contains":
                item["passed"] = expected in actual
            else:
                item["passed"] = actual == expected
            item["expected"] = expected
            item["actual"] = actual[:2000]
        elif kind == "assert":
            if helpers is None:
                helpers = _helpers(code, stdout, ns)
            item.update(_run_assert(check.get("code", ""), ns, helpers))
        else:
            item["problem"] = f"unknown check type: {kind!r}"
        if not item["passed"]:
            item["fail"] = check.get("fail", "")
        results.append(item)
    return results


def run(code, checks=None):
    """Run learner code in a fresh namespace; grade it when checks are given."""
    code = str(code).replace("\r\n", "\n").replace("\r", "\n")
    out, err = _Capture(), _Capture()
    safe_builtins = dict(vars(builtins))
    safe_builtins["input"] = _no_input
    ns = {"__name__": "__main__", "__builtins__": safe_builtins}
    error = None
    try:
        compiled = compile(code, LEARNER_FILE, "exec", dont_inherit=True)
    except SyntaxError as exc:
        error = _describe_syntax_error(exc, code)
    except ValueError as exc:  # e.g. the source contains a null byte
        error = {"kind": "syntax", "type": "ValueError", "message": str(exc), "summary": f"ValueError: {exc}", "line": None, "text": None}
    else:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                exec(compiled, ns)
            except SystemExit:
                pass
            except BaseException as exc:  # noqa: BLE001 - every failure is reported to the learner
                error = _describe_runtime_error(exc, code)
    result = {"stdout": out.getvalue(), "stderr": err.getvalue(), "truncated": out.truncated, "error": error}
    if checks:
        result["checks"] = _grade(checks, code, result["stdout"], ns, error)
        result["passed"] = all(item["passed"] for item in result["checks"])
    return result


def run_json(code, checks_json=""):
    """JSON in, JSON out: the entry point the browser worker calls."""
    checks = json.loads(checks_json) if checks_json else None
    return json.dumps(run(code, checks), ensure_ascii=False)
