#!/usr/bin/env python3
"""Run lesson code blocks and report each printed line with the source line that printed it.

stdin:  [{"id": "c1", "code": "print(1)"}, ...]
stdout: [{"id": "c1", "lines": [{"from": 1, "text": "1"}], "error": null}, ...]
"""
import io
import json
import sys
import traceback


def run_block(cid, code):
    fname = f"<{cid}>"
    out = []
    cur = {"text": "", "line": None}

    def caller_line():
        f = sys._getframe(2)
        while f is not None:
            if f.f_code.co_filename == fname:
                return f.f_lineno
            f = f.f_back
        return None

    class Tracer(io.TextIOBase):
        def writable(self):
            return True

        def write(self, s):
            ln = caller_line()
            parts = s.split("\n")
            for i, part in enumerate(parts):
                if part:
                    cur["text"] += part
                    if cur["line"] is None:
                        cur["line"] = ln
                if i < len(parts) - 1:
                    out.append({"from": cur["line"] or ln, "text": cur["text"]})
                    cur["text"], cur["line"] = "", None
            return len(s)

    error = None
    saved = sys.stdout
    sys.stdout = Tracer()
    try:
        exec(compile(code, fname, "exec"), {"__name__": "__main__"})
    except Exception as exc:  # report, the compiler decides whether that is expected
        tb = traceback.extract_tb(exc.__traceback__)
        line = next((fr.lineno for fr in reversed(tb) if fr.filename == fname), None)
        error = {"type": type(exc).__name__, "message": str(exc), "line": line}
    finally:
        sys.stdout = saved
    if cur["text"]:
        out.append({"from": cur["line"], "text": cur["text"]})
    return {"id": cid, "lines": out, "error": error}


def main():
    blocks = json.load(sys.stdin)
    json.dump([run_block(b["id"], b["code"]) for b in blocks], sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
