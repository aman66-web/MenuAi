"""Read Hoburne's official menu PDFs (calories printed inline after each dish) into dish segments with their printed kcal values.

Used by tools/uk_extract/hoburne_holidays.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as
"1238", "1,238" is returned as "1238": the thousands comma is the only change, it is the same number); nothing is converted,
rounded or estimated here.

The PDFs are InDesign layouts with a real text layer. Every text frame is CENTRED, so all lines of one visual column share the same
centre x. A page is read column by column (centre x), top to bottom:

  * a HEAD line is a dish heading: only UPPER-CASE words, the menu's marks (v, vg, lc, gfi, sa), "(gfi option available)", prices
    and kcal values. Description lines are ordinary mixed-case text;
  * a segment starts at a HEAD line that follows a description line, or a HEAD line that already ended a heading (it carries a price
    or a kcal value), so "ADD ONS" lists of one-line dishes split into one segment each and two-line headings stay together;
  * a section title is a big-font line that is not a HEAD line ("Mains", "Sharers" + "& Small Plates", "Baked Jacket" + "Potatoes");
  * every "NNNkcal" / "+NNNkcal" word belongs to the segment whose lines contain it. A value followed by "per 100ml" (the plant-milk
    note) and the "Adults need around 2000kcal a day" footer are not dish values: they are counted and returned separately.

The caller checks every segment against its own table, so a new or changed menu stops the run instead of attaching a number to
the wrong dish.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
KCAL = re.compile(r"(\+?)(\d[\d,]*)\s?kca\s?l\b", re.I)  # the text layer splits one value as "1002kca l"
PRICE = re.compile(r"(?<![\d.])\d+\.\d\d(?![\d])")
ALLOWED_LOWER = {"v", "vg", "vgo", "lc", "gfi", "sa", "option", "available)", "(gfi", "(vg", "(vg)", "(hot)", "(hot", "from", "or",
                 "oz", "go", "large", "&", "|", "/", "(gfi)"}
SECTION_LINES = {"ADD ONS"}  # upper-case lines that are not dish headings and end the dish above
# upper-case notes that are not dish headings (opening hours, "all served with ...", the vegan-swap note): they end a dish
NOTE_LINES = re.compile(r"^(MENU AVAILABLE|AVAILABLE |ALL SERVED|ALL MAINS|MAKE IT VEGAN BY)")
TITLE_MIN_HEIGHT = 24.0       # points: section titles are set in a bigger font than headings (18) and descriptions (15.6)
SAME_COLUMN = 6.0             # points: centres closer than this are the same column


def _lines(pdf: Path, page: int) -> list[dict]:
    out = subprocess.run(["pdftotext", "-bbox-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         check=True, capture_output=True, text=True).stdout
    lines = []
    for m in LINE.finditer(out):
        x0, y0, x1, y1, body = m.groups()
        words = [html.unescape(w) for w in WORD.findall(body)]
        text = " ".join(" ".join(words).replace("​", "").split())
        lines.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), text=text, cx=(float(x0) + float(x1)) / 2,
                          h=float(y1) - float(y0)))
    return lines


def _head_word(w: str) -> bool:
    """A word of a heading line: a mark, a price, a kcal value, a number, or an UPPER-CASE word (accents allowed)."""
    w = w.rstrip(",")
    lw = w.lower()
    if lw in ALLOWED_LOWER or KCAL.fullmatch(w) or re.fullmatch(r"\d+oz", lw):
        return True
    core = re.sub(r"[’'][sS]$", "", w)
    letters = [c for c in core if c.isalpha()]
    return all(c.isupper() for c in letters)


def is_head(text: str) -> bool:
    """True when every word is a heading word and at least one word is a real upper-case word (two capitals or more)."""
    words = text.split()
    return bool(words) and all(_head_word(w) for w in words) and any(sum(c.isupper() for c in w) >= 2 for w in words)


def _tokens(text: str) -> list[dict]:
    """kcal values of one line, in reading order: value (digits only), plus sign, 'per 100ml' flag, the text before it."""
    toks = []
    for m in KCAL.finditer(text):
        after = text[m.end():m.end() + 12].lower()
        toks.append(dict(value=m.group(2).replace(",", ""), plus=bool(m.group(1)), per100=after.startswith(" per 100") or after.startswith("per 100"),
                         start=m.start(), end=m.end(), printed=m.group(0)))
    return toks


def read_menu(pdf: Path) -> tuple[list[dict], dict]:
    """-> (segments, stats). A segment: heading (head lines joined), head_marks, section, page, col, y, text (all its lines joined
    with a space), tokens [{value, plus, before (the 3 words before it), line}], desc (description text, for the meat tags).
    stats: kcal words seen, ignored ones (footer 2000kcal, per-100ml milks) and the lines read."""
    n_pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], check=True, capture_output=True, text=True).stdout).group(1))
    segments: list[dict] = []
    stats = dict(kcal_words=0, footer=0, per100=0, lines=0)
    for page in range(1, n_pages + 1):
        lines = _lines(pdf, page)
        stats["lines"] += len(lines)
        cols: list[list[dict]] = []
        for ln in sorted(lines, key=lambda l: (l["cx"], l["y0"])):
            for col in cols:
                if abs(col[0]["cx"] - ln["cx"]) <= SAME_COLUMN:
                    col.append(ln)
                    break
            else:
                cols.append([ln])
        cols.sort(key=lambda c: c[0]["cx"])
        for ci, col in enumerate(sorted(cols, key=lambda c: c[0]["cx"])):
            col.sort(key=lambda l: l["y0"])
            cur: dict | None = None
            title: list[tuple[float, str]] = []
            section = ""
            for ln in col:
                text = ln["text"]
                if re.search(r"Adults need around 2,?000\s?kcal", text, re.I):
                    stats["footer"] += len(KCAL.findall(text))
                    stats["kcal_words"] += len(KCAL.findall(text))
                    continue
                toks = [t for t in _tokens(text)]
                stats["kcal_words"] += len(toks)
                for t in toks:
                    if t["per100"]:
                        stats["per100"] += 1
                toks = [t for t in toks if not t["per100"]]
                head = is_head(text)
                if text in SECTION_LINES:  # "ADD ONS": ends the dish above, does not change the section
                    cur = None
                    continue
                if NOTE_LINES.match(text):
                    cur = None
                    continue
                if not head and ln["h"] >= TITLE_MIN_HEIGHT and not toks:
                    # section title; consecutive big lines (gap < 40pt) are one title
                    if title and ln["y0"] - title[-1][0] < 40:
                        title.append((ln["y0"], text))
                    else:
                        title = [(ln["y0"], text)]
                    section = " ".join(t for _, t in title)
                    cur = None
                    continue
                if head:
                    if cur is not None and not cur["head_done"]:
                        cur["head_lines"].append(text)
                        cur["lines"].append(ln)
                        cur["head_done"] = bool(PRICE.search(text) or toks)
                    else:
                        cur = dict(page=page, col=ci, y=ln["y0"], section=section, head_lines=[text], lines=[ln], head_done=bool(PRICE.search(text) or toks),
                                   desc_lines=[])
                        segments.append(cur)
                else:
                    if cur is None:
                        cur = dict(page=page, col=ci, y=ln["y0"], section=section, head_lines=[], lines=[], head_done=True, desc_lines=[])
                        segments.append(cur)
                    cur["head_done"] = True
                    cur["desc_lines"].append(text)
                    cur["lines"].append(ln)
                if toks:
                    for t in toks:
                        t["line"] = text
                    cur.setdefault("tok_lines", []).append((text, toks))
    for s in segments:
        s["heading"] = " ".join(s["head_lines"])
        s["text"] = " ".join(l["text"] for l in s["lines"])
        s["desc"] = " ".join(s["desc_lines"])
        # marks printed on the heading (up to the line with the price), parenthesised "(vg option available)" removed
        head_text, found_price = [], False
        for t in s["head_lines"] + s["desc_lines"]:
            head_text.append(t)
            if PRICE.search(t):
                found_price = True
                break
        head_text = re.sub(r"\([^)]*\)", " ", " ".join(head_text)) if found_price else re.sub(r"\([^)]*\)", " ", s["heading"])
        s["marks"] = sorted({w for w in head_text.split() if w in ("v", "vg", "vgo", "lc", "gfi", "sa")})
        tokens = []
        words_so_far = ""
        for l in s["lines"]:
            words_so_far_line = l["text"]
            for t in _tokens(words_so_far_line):
                if t["per100"]:
                    continue
                before_words = (words_so_far + " " + words_so_far_line[:t["start"]]).split()
                tokens.append(dict(value=t["value"], plus=t["plus"], before=" ".join(before_words[-3:]).lower(), line=words_so_far_line))
            words_so_far += " " + words_so_far_line
        s["tokens"] = tokens
        s.pop("tok_lines", None)
        s.pop("lines", None)
    return segments, stats
