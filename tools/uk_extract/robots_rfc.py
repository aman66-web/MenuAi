"""robots.txt matching as RFC 9309 defines it: `*` and `$` wildcards, the longest matching rule wins, Allow wins a tie.

Python's urllib.robotparser ignores the wildcards, so a rule like `Disallow: /*.pdf` never matched and PDFs on such hosts were
downloaded by mistake (found 2026-10-08, see data/held-robots/README.md). Every fetch helper uses this instead.
    rules = parse(robots_txt)             # the rules of the `User-agent: *` group
    allowed(rules, "/files/x.pdf?v=1")    # path plus query, as in the URL
"""
from __future__ import annotations

import re


def parse(text: str) -> list[tuple[str, str]]:
    """The (allow|disallow, pattern) rules of the `User-agent: *` group(s). Other groups are ignored (we send a browser User-Agent)."""
    groups: list[dict] = []
    cur: dict | None = None
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, value = (x.strip() for x in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if cur is None or cur["rules"]:
                cur = {"agents": [], "rules": []}
                groups.append(cur)
            cur["agents"].append(value.lower())
        elif key in ("allow", "disallow") and cur is not None:
            cur["rules"].append((key, value))
    rules: list[tuple[str, str]] = []
    for g in groups:
        if "*" in g["agents"]:
            rules += g["rules"]
    return rules


def _pattern(p: str) -> re.Pattern:
    rx = re.escape(p).replace(r"\*", ".*")
    if rx.endswith(r"\$"):
        rx = rx[:-2] + "$"
    return re.compile("^" + rx)


def allowed(rules: list[tuple[str, str]], path: str) -> bool:
    """Whether `path` (with its query string) may be fetched under the rules; no matching rule means allowed."""
    best_len, best_allow = -1, True
    for kind, value in rules:
        if not value:
            continue
        if _pattern(value).match(path):
            if len(value) > best_len or (len(value) == best_len and kind == "allow"):
                best_len, best_allow = len(value), kind == "allow"
    return best_allow
