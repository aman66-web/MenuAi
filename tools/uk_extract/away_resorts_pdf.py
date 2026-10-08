"""Read the calorie values out of Away Resorts' menu PDFs (text layer, `pdftotext -raw`). Used by away_resorts.py.

Every dish prints "<name> <number> kcal <price>" (some menus print the number glued to the name: "Pepperoni1210 kcal", or with a
thousands separator: "1,095 kcal"). `kcal_pairs` returns every "<name> <number> kcal" it finds, in file order, with the number exactly
as printed. Names split over two lines in the kids and breakfast menus ("KICKIN' CHICK*N" / "BURGER 407 kcal") are offered as a second
candidate name `full` (the previous line is added when it is entirely upper case). Nothing here decides which dish is which: the table
in away_resorts.py does that, and the script stops when a table row cannot be found.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

# "1,095" / "1.013" (thousands separators, the latter probably a typo in the PDF) or a plain number of up to 4 digits.
_KCAL = re.compile(r"(?<![\d.,])(\d{1,2}[,.]\d{3}|\d{1,4})\s*kca\s?l\b", re.I)


def pdf_text(path: Path) -> str:
    """The PDF's text in content order. Needs pdftotext (poppler)."""
    res = subprocess.run(["pdftotext", "-raw", str(path), "-"], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"pdftotext failed on {path}: {res.stderr.strip()}")
    return res.stdout


def norm_name(name: str) -> str:
    """Lower case, no 'NEW!', apostrophes dropped, '&' read as 'and', punctuation and spacing collapsed."""
    s = name.replace("’", "'").replace("‘", "'").lower()
    s = re.sub(r"\bnew!?", " ", s)
    s = s.replace("&", " and ").replace("'", "").replace(".", "").replace("*", "")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def _clean(name: str) -> str:
    name = name.replace("\t", " ").strip(" ,;|/-")
    name = re.sub(r"^or\s+", "", name)  # "Add Chips 405 kcal or Side Salad 49 kcal"
    return " ".join(name.split())


def kcal_pairs(text: str) -> list[dict]:
    """[{name, full, kcal, line, text}] for every '<name> <n> kcal' on a line. `kcal` is the printed number (string, as printed);
    `name` the words before it on its own line; `full` = previous line + name when that line is all capitals (split titles)."""
    lines = text.splitlines()
    out: list[dict] = []
    for i, raw in enumerate(lines):
        ln = raw.replace("\t", " ")
        pos = 0
        for n, m in enumerate(_KCAL.finditer(ln)):
            name = _clean(ln[pos:m.start()])
            pos = m.end()
            full = name
            prev = lines[i - 1].strip() if i > 0 else ""
            if (n == 0 and name and prev and len(prev) <= 32 and prev == prev.upper() and re.search(r"[A-Z]", prev)
                    and not re.search(r"\d", prev) and name == name.upper()):
                full = _clean(prev + " " + name)
            if n == 0 and not name and i >= 2:  # the number alone on its line: the two lines above are the title ("biscoff" / "billionaire")
                above = [lines[i - 2].strip(), lines[i - 1].strip()]
                if all(a and len(a) <= 24 and not re.search(r"\d", a) for a in above):
                    full = _clean(" ".join(above))
            out.append({"name": name, "full": full, "kcal": m.group(1), "line": i, "text": ln.strip()})
    return out


class LayoutError(Exception):
    """A block of calorie values is not laid out the way the script expects."""


def block_values(text: str, heading: str, count: int, window: int = 8, then: str = ""):
    """The first `count` calorie numbers (as printed) found from the line that is exactly `heading` (regex, whole line, 'NEW!' ignored)
    down to `window` lines further. `then`: a regex the next line must match (to tell a heading from the same word elsewhere).
    Returns None when the heading is not in the file; raises LayoutError when it is there twice or too few numbers follow."""
    lines = text.splitlines()
    hits = []
    for i, raw in enumerate(lines):
        ln = re.sub(r"^NEW!?\s*", "", raw.replace("\t", " ").strip(), flags=re.I)
        if re.fullmatch(heading, ln, flags=re.I) and (not then or (i + 1 < len(lines) and re.match(then, lines[i + 1].strip(), re.I))):
            hits.append(i)
    if not hits:
        return None
    if len(hits) > 1:
        raise LayoutError(f"heading {heading!r} appears {len(hits)} times")
    chunk = "\n".join(lines[hits[0]:hits[0] + window + 1])
    nums = [m.group(1) for m in _KCAL.finditer(chunk)]
    if len(nums) < count:
        raise LayoutError(f"only {len(nums)} calorie values after {heading!r}, expected {count}")
    return nums[:count]
