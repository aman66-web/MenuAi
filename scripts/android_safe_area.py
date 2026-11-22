#!/usr/bin/env python3
"""Makes the packed web app keep clear of Android's system bars the way it does on the iPhone (docs/ANDROID_BUILD.md "Looking the same as the iPhone").

The page keeps clear of the status bar, the camera cut-out and the home bar with `env(safe-area-inset-*)` (viewport-fit=cover). The iPhone's web view fills those four
values in; many Android web views only fill them in for a camera cut-out, not for the status bar and navigation bar, and the web view the phone has is whatever Google last
updated it to. So the Android app tells the page the four values itself, as CSS variables on <html> (--sai-top, --sai-right, --sai-bottom, --sai-left, in CSS pixels;
web/MainActivity + SafeArea.kt), and this script makes the packed copy of the page read them first:

    env(safe-area-inset-top)   ->   var(--sai-top,env(safe-area-inset-top))

Where the app has not set a variable (or on a web view that does fill in env() itself) the original env() is what is used, so it can only make things agree. Only the
packed copy is changed; web/ and the iPhone's pack are untouched.

What is rewritten, and what is not:
  * every `env(safe-area-inset-...)` in the stylesheets (a Tailwind class's selector has its brackets escaped, so only declarations match);
  * in script files, the ones that are CSS text (inline styles, a style sheet in a string). A Tailwind class name that contains one (`pt-[max(0.5rem,env(safe-area-inset-top))]`)
    is NOT touched: it is the name the stylesheet's rule is selected by, and renaming it would orphan the rule. Such a name is a run of characters with a "[" in it, between
    quotes or spaces; CSS text always has a space, a quote or a ";" before the function.
  * html and flight (.txt) files hold only class names with it; they are checked, not changed (an inline style there would be reported and stop the build).

Usage: python3 scripts/android_safe_area.py <packed WebApp folder>      (prints a count; exits 1 if something unexpected is found)
       python3 scripts/android_safe_area.py --selftest
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PATTERN = re.compile(r"env\(safe-area-inset-(top|right|bottom|left)\)")
# what ends a "word": a Tailwind class name is one word; CSS text has these before a function
WORD_BREAK = set(" \t\r\n\"'`")


def replacement(match: re.Match[str]) -> str:
    side = match.group(1)
    return f"var(--sai-{side},env(safe-area-inset-{side}))"


def in_class_name(text: str, start: int) -> bool:
    """True when the env() at `start` sits inside one word that has a "[" before it (a Tailwind arbitrary-value class)."""
    i = start
    while i > 0 and text[i - 1] not in WORD_BREAK:
        i -= 1
    return "[" in text[i:start]


def already(text: str, m: re.Match[str]) -> bool:
    """The env() is the fallback of a variable this script already put there (so running twice changes nothing)."""
    prefix = f"var(--sai-{m.group(1)},"
    return text[max(0, m.start() - len(prefix)): m.start()] == prefix


def rewrite_css(text: str) -> tuple[str, int]:
    out: list[str] = []
    last = 0
    count = 0
    for m in PATTERN.finditer(text):
        if already(text, m):
            continue
        out.append(text[last:m.start()])
        out.append(replacement(m))
        last = m.end()
        count += 1
    out.append(text[last:])
    return "".join(out), count


def rewrite_script(text: str) -> tuple[str, int]:
    out: list[str] = []
    last = 0
    count = 0
    for m in PATTERN.finditer(text):
        if already(text, m) or in_class_name(text, m.start()):
            continue
        out.append(text[last:m.start()])
        out.append(replacement(m))
        last = m.end()
        count += 1
    out.append(text[last:])
    return "".join(out), count


def unexpected_inline(text: str) -> list[str]:
    """Occurrences in html/txt that are not inside a class name (there must be none: we do not rewrite those files)."""
    return [text[max(0, m.start() - 50): m.end() + 20] for m in PATTERN.finditer(text) if not already(text, m) and not in_class_name(text, m.start())]


def main(root: Path) -> int:
    css = js = 0
    problems: list[str] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in {".css", ".js", ".html", ".txt"}:
            continue
        text = path.read_text(encoding="utf-8")
        if "env(safe-area-inset-" not in text:
            continue
        if path.suffix == ".css":
            new, n = rewrite_css(text)
            css += n
        elif path.suffix == ".js":
            new, n = rewrite_script(text)
            js += n
        else:
            problems += [f"{path.relative_to(root)}: {x!r}" for x in unexpected_inline(text)]
            continue
        if n:
            path.write_text(new, encoding="utf-8")
    if problems:
        print("An inline safe-area value in a page or flight file (not rewritten, would not follow the app's insets):", *problems, sep="\n  ", file=sys.stderr)
        return 1
    print(f"Safe area: {css} stylesheet and {js} script uses now read the app's --sai-* variables first.")
    return 0


def selftest() -> int:
    tw = "pt-[max(0.5rem,env(safe-area-inset-top))]"
    # a class name keeps its text; the same function in CSS text is rewritten
    s = f'className:"flex {tw} px-5",style:{{marginTop:"calc(-1 * max(1.25rem, env(safe-area-inset-top)))"}}'
    out, n = rewrite_script(s)
    assert n == 1 and tw in out and "max(1.25rem, var(--sai-top,env(safe-area-inset-top)))" in out, out
    assert rewrite_script(f"a.cssText='padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)'")[1] == 2
    assert rewrite_script("top-[env(safe-area-inset-top)] bottom-[calc(env(safe-area-inset-bottom)+1rem)]")[1] == 0
    css = r".pt-\[env\(safe-area-inset-top\)\]{padding-top:env(safe-area-inset-top)}.a{left:max(12px, env(safe-area-inset-left))}"
    out, n = rewrite_css(css)
    assert n == 2 and r".pt-\[env\(safe-area-inset-top\)\]{" in out and "padding-top:var(--sai-top,env(safe-area-inset-top))" in out, out
    assert rewrite_css(out)[1] == 0 and rewrite_script(out)[1] == 0 # running it twice changes nothing
    assert unexpected_inline(f'<div class="{tw}">') == []
    assert len(unexpected_inline('<div style="padding-top:env(safe-area-inset-top)">')) == 1
    print("selftest ok")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        sys.exit(selftest())
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1]).resolve()))
