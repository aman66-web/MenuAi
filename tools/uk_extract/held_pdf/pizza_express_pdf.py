"""Read PizzaExpress UK's official "Nutritional Information: England, Wales & Scotland" PDF into tables of printed numbers.

Used by tools/uk_extract/pizza_express.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.0", "106", "<0.5") and nothing is converted or estimated here.

Every table prints PER PORTION columns first and PER 100g columns second (9 each: kcal, kJ, fat, saturates, carbohydrates,
sugars, fibre, protein, salt). A few cells are blank in the PDF, so a row is NOT read by counting numbers: each number is
assigned to the column whose x position is nearest, and the header words of every table are checked against those columns.
Only the per-portion values are returned.
"""
from __future__ import annotations
import html
import re
import statistics
import subprocess
from pathlib import Path

NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
KEYS = ("kcal", "kj", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
# header word -> column index it must sit over (same for the per-100g half, +9)
HEADER_COLUMN = {"(kcal)": 0, "(KJ)": 1, "Fat": 2, "Saturates": 3, "Carbohydrates": 4, "Sugars": 5, "Fibre": 6, "Protein": 7}
HEADER_WORDS = {"Energy", "(kcal)", "(KJ)", "Fat", "(g)", "Saturates", "Carbohydrates", "Sugars", "Fibre", "Protein", "Salt", "PER", "PORTION", "100g"}
LINE_TOL = 1.2        # words whose yMin differs by less than this are on one line
NAME_GAP = 17.0       # a name-only line sits at most this far above the row it belongs to


class PdfLayoutError(RuntimeError):
    pass


def first_page_containing(pdf: Path, phrase: str, start: int = 1) -> int | None:
    """1-based number of the first PDF page (from page `start`) whose text contains `phrase`, or None."""
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    for n, page in enumerate(text.split("\f"), 1):
        if n >= start and phrase in page:
            return n
    return None


def _words(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
                      re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', chunk)])
    return pages


def _lines(words):
    """Group words into visual lines (top to bottom), each sorted left to right."""
    lines: list[list] = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) < LINE_TOL:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(l, key=lambda w: w[0]) for l in lines]


def _cx(w):
    return (w[0] + w[2]) / 2


def _title_above(lines, hi):
    """The line above an Energy line when it carries the first half of a two-line title ("Piccolo - Pasta &" / "Salad")."""
    if hi == 0:
        return None
    hl, above = lines[hi], lines[hi - 1]
    fx = next(w for w in hl if w[4] == "Energy")[0]
    if (hl[0][1] - above[0][1] <= 21 and all(w[0] < fx for w in above) and all(w[4] not in HEADER_WORDS for w in above)
            and not any(NUM.match(w[4]) for w in above)):
        return above
    return None


def read_tables(pdf: Path) -> list[dict]:
    """Tables in reading order: {"page", "title", "rows": [{"name", "cells": {key: printed or ""}, "y"}]}.
    Raises PdfLayoutError (with a plain message) when anything does not look the way this reader expects."""
    tables: list[dict] = []
    for pno, words in enumerate(_words(pdf), 1):
        lines = _lines(words)
        heads = []
        for i, l in enumerate(lines):
            if not any(w[4] == "Energy" for w in l):
                continue
            # a second header line that also says "Energy" (the kJ column) belongs to the table above it
            if (heads and heads[-1] == i - 1 and l[0][1] - lines[i - 1][0][1] <= 14 and all(w[4] in HEADER_WORDS for w in l)):
                continue
            heads.append(i)
        for hn, hi in enumerate(heads):
            nxt = heads[hn + 1] if hn + 1 < len(heads) else len(lines)
            end = nxt
            if hn + 1 < len(heads):
                # a table ends at the "PER PORTION" banner above the next table, else at its (two-line) title
                banner = [k for k in range(hi + 1, nxt) if "PER" in [w[4] for w in lines[k]]]
                if banner:
                    end = banner[-1]
                elif _title_above(lines, nxt) is not None:
                    end = nxt - 1
            hl = lines[hi]
            fx = next(w for w in hl if w[4] == "Energy")[0]
            title_words = [w[4] for w in hl if w[0] < fx]
            above = _title_above(lines, hi)
            if above is not None:
                title_words = [w[4] for w in above] + title_words
            title = " ".join(title_words).strip()
            if not title:
                raise PdfLayoutError(f"page {pno}: a table header has no title")
            tables.append({"page": pno, "title": title, "_hl": hl, "_body": lines[hi + 1:end]})
    return [_read_table(t) for t in tables]


def _merge_split_lines(data, cut):
    """A row whose numbers sit a hair above its name (a different baseline) arrives as two lines: join them."""
    out = []
    i = 0
    while i < len(data):
        l = data[i]
        has_nums = any(NUM.match(w[4]) and _cx(w) >= cut for w in l)
        has_name = any(not (NUM.match(w[4]) and _cx(w) >= cut) for w in l)
        if has_nums and not has_name and i + 1 < len(data):
            n = data[i + 1]
            n_nums = any(NUM.match(w[4]) and _cx(w) >= cut for w in n)
            if not n_nums and n[0][1] - l[0][1] <= 3:
                out.append(sorted(l + n, key=lambda w: w[0]))
                i += 2
                continue
        out.append(l)
        i += 1
    return out


def _read_table(t: dict) -> dict:
    pno, title, body = t["page"], t["title"], t["_body"]
    # header block: leading lines made only of header words
    k = 0
    while k < len(body) and all(w[4] in HEADER_WORDS for w in body[k]):
        k += 1
    header_words = [w for l in ([t["_hl"]] + body[:k]) for w in l]
    kcal_headers = sorted((w for w in header_words if w[4] == "(kcal)"), key=lambda w: w[0])
    if len(kcal_headers) != 2:
        raise PdfLayoutError(f"page {pno} '{title}': expected 2 '(kcal)' headers, found {len(kcal_headers)}")
    cut = _cx(kcal_headers[0]) - 14
    data = _merge_split_lines(body[k:], cut)
    # classify lines
    rows: list[dict] = []
    pending: list[str] = []
    pending_y = None
    for l in data:
        nums = [w for w in l if NUM.match(w[4]) and _cx(w) >= cut]
        name_words = [w[4] for w in l if not (NUM.match(w[4]) and _cx(w) >= cut)]
        if any(w[4] in ("PER", "PORTION") for w in l) and not nums:
            continue
        if not nums:
            if any(w[4] in HEADER_WORDS for w in l):
                raise PdfLayoutError(f"page {pno} '{title}': unexpected header text {[w[4] for w in l]}")
            pending.append(" ".join(name_words))
            pending_y = l[0][1]
            continue
        if any(w[0] >= cut and not NUM.match(w[4]) and w[4] not in HEADER_WORDS for w in l):
            raise PdfLayoutError(f"page {pno} '{title}': non-numeric text in the number columns on the line of {' '.join(name_words)!r}")
        if pending and l[0][1] - pending_y > NAME_GAP:
            raise PdfLayoutError(f"page {pno} '{title}': stray text {pending!r} above {' '.join(name_words)!r}")
        name = " ".join(pending + [" ".join(name_words)]) if pending else " ".join(name_words)
        name = re.sub(r"(?<=\w)- (?=\w)", "-", name) if pending and re.search(r"\w-$", pending[-1]) else name
        name = re.sub(r"\s+", " ", name).strip()
        pending, pending_y = [], None
        rows.append({"name": name, "nums": nums, "y": l[0][1]})
    if pending:
        raise PdfLayoutError(f"page {pno} '{title}': stray text {pending!r} below the last row")
    if not rows:
        raise PdfLayoutError(f"page {pno} '{title}': no rows found")
    # reference column centres from rows that have all 18 numbers
    full = [r for r in rows if len(r["nums"]) == 18]
    if not full:
        raise PdfLayoutError(f"page {pno} '{title}': no complete row to fix the columns from")
    centres = [statistics.median(_cx(r["nums"][c]) for r in full) for c in range(18)]
    pitch = min(b - a for a, b in zip(centres, centres[1:]))
    # header words must sit over the column they name
    for w in header_words:
        if w[4] in HEADER_COLUMN or w[4] == "Salt":
            col = HEADER_COLUMN.get(w[4], 8)
            cands = [c for c in range(18) if abs(centres[c] - _cx(w)) < pitch * 0.55]
            if w[4] == "Salt":
                # "Salt" is printed with its own "(g)" and can sit slightly off centre: accept either neighbour distance
                cands = [c for c in range(18) if abs(centres[c] - _cx(w)) < pitch * 0.8]
            if not any(c % 9 == col for c in cands):
                raise PdfLayoutError(f"page {pno} '{title}': header '{w[4]}' is not over its expected column "
                                     f"(x {_cx(w):.0f}, columns {[round(c) for c in centres[:9]]})")
    out_rows = []
    for r in rows:
        cells = [""] * 18
        taken = {}
        for w in r["nums"]:
            d = [abs(c - _cx(w)) for c in centres]
            col = d.index(min(d))
            if min(d) > pitch * 0.45:
                raise PdfLayoutError(f"page {pno} '{title}': a number in '{r['name']}' is not clearly in one column ({w[4]} at x {_cx(w):.0f})")
            if col in taken:
                raise PdfLayoutError(f"page {pno} '{title}': two numbers in one column for '{r['name']}'")
            taken[col] = True
            cells[col] = w[4]
        out_rows.append({"name": r["name"], "cells": dict(zip(KEYS, cells[:9])), "per100": dict(zip(KEYS, cells[9:])), "blank_portion_cells": [k for k, v in zip(KEYS, cells[:9]) if v == ""], "y": r["y"]})
    return {"page": pno, "title": title, "rows": out_rows}
