"""Read Joseph Holt's official menu PDFs (main, kids, lunch supplement) into dishes with their printed calories.

Used by tools/uk_extract/joseph_holt.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as
"927"); nothing is converted, rounded or estimated here.

All three files are InDesign layouts with a real text layer. A dish is a bold name (one or two lines), a description, and the
calories printed as "NNN kcal" on a line of their own under the description, left-aligned with the name:

    Buttermilk Chicken, BBQ Sauce,        9.75       <- name (11 pt) and, on the main menu, the price at the column's right edge
    Bacon and Cheddar Wrap
    Crisp buttermilk chicken fillet, ...             <- description (9 pt)
    927 kcal                                         <- calories (6.5 pt)

Reading is by position, never by counting:

  * main menu: a dish is a price line plus the name line on its own row to the left of it (a second price on the same row is the
    child price of the Sunday roast; Espresso's "Dbl" row is a second price with no name, and is checked against its label);
  * kids and lunch menus print no price on most dishes: a dish is a run of name-sized lines, merged when a name is split in two
    words on one row ("DIET" "COKE");
  * every "NNN kcal" line belongs to the nearest dish above it that starts at the same left edge (columns are left-aligned);
  * digits that the layout letter-spaces ("57 1 kcal" is 571, "4 4 4 kcal" is 444) are joined when the gap between them is far
    smaller than a space; "692 / 699 kcal" is two values.

Anything that does not fit (a calorie line nobody owns, a price with no name, a number that cannot be read) raises, so a new menu layout
stops the run instead of attaching a number to the wrong dish. A calorie line printed on top of a dish name (hidden text that the
rendered page does not show) is not used: it is returned separately so the caller can check it against the rendered page.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">(.*?)</word>')
PRICE = re.compile(r"^\d+\.\d\d$")
COLUMN_TOL = 2.0       # points: left edges closer than this are the same column
DIGIT_GAP = 1.2        # points: digits closer than this are one number (a real space is about 2 points)


def read_lines(pdf: Path) -> list:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = []
    for page_no, page in enumerate(re.split(r"<page ", out)[1:], 1):
        for m in LINE.finditer(page):
            x0, y0, x1, y1 = (float(v) for v in m.groups()[:4])
            words = [(html.unescape(t), float(a), float(b)) for a, b, t in WORD.findall(m.group(5))]
            text = " ".join(" ".join(w[0] for w in words).replace("​", "").split())
            lines.append(dict(page=page_no, x0=x0, y0=y0, x1=x1, y1=y1, h=y1 - y0, text=text, words=words))
    return lines


def kcal_values(ln: dict):
    """['927'] for '927 kcal', ['1496', '823'] for '1496 / 823 kcal', ['571'] for '57 1 kcal'; None if the line is not a calorie line."""
    words = ln["words"]
    if len(words) < 2 or words[-1][0] != "kcal":
        return None
    tokens, prev_x1 = [], None
    for text, x0, x1 in words[:-1]:
        if text.isdigit() and tokens and tokens[-1].isdigit() and prev_x1 is not None and x0 - prev_x1 < DIGIT_GAP:
            tokens[-1] += text
        else:
            tokens.append(text)
        prev_x1 = x1
    values = tokens[0::2]
    if not tokens or any(not v.isdigit() for v in values) or any(s != "/" for s in tokens[1::2]) or len(tokens) % 2 == 0:
        return None
    return values


def _is_price(ln: dict) -> bool:
    return bool(PRICE.match(ln["text"])) and 7.0 <= ln["h"] <= 16.0   # the lunch offer's big "10.45" is artwork, not a dish price


def _same_column(a: dict, b: dict) -> bool:
    return a["page"] == b["page"] and abs(a["x0"] - b["x0"]) <= COLUMN_TOL


def _merge_split_names(names: list) -> list:
    """'DIET' and 'COKE' print as two lines on one row: join them (kids menu)."""
    names = sorted(names, key=lambda n: (n["page"], round(n["y0"]), n["x0"]))
    merged = []
    for n in names:
        p = merged[-1] if merged else None
        if p and p["page"] == n["page"] and abs(p["y0"] - n["y0"]) <= 1.0 and 0 < n["x0"] - p["x1"] < 14:
            merged[-1] = dict(p, x1=n["x1"], text=p["text"] + " " + n["text"])
        else:
            merged.append(n)
    return merged


def read_dishes(lines: list, *, pages: list, name_heights: list, pitch: tuple, need_price: bool, merge_split: bool = False,
                non_dish: frozenset = frozenset(), max_gap: float = 80.0):
    """-> (dishes, hidden, orphan_prices). Each dish: page, x0, y0, name_lines, name, prices [(text, x1, y0)], kcal [(values, line)], desc [lines]."""
    lines = [ln for ln in lines if ln["page"] in pages]
    price_lines = [ln for ln in lines if _is_price(ln)]
    kcal_lines = [(ln, v) for ln in lines for v in [kcal_values(ln)] if v is not None]
    names = [ln for ln in lines if not _is_price(ln) and kcal_values(ln) is None and ln["text"] not in non_dish
             and any(abs(ln["h"] - h) <= 0.4 for h in name_heights) and ln["text"]]
    if merge_split:
        names = _merge_split_names(names)

    def continues(prev, ln):
        return _same_column(prev, ln) and abs(prev["h"] - ln["h"]) <= 0.4 and pitch[0] < ln["y0"] - prev["y0"] < pitch[1]

    dishes, orphans = [], []
    if need_price:
        by_first = {}
        for p in price_lines:
            cands = [n for n in names if n["page"] == p["page"] and abs(n["y0"] - p["y0"]) <= 2.5 and n["x1"] <= p["x0"] + 0.5
                     and p["x1"] - n["x0"] <= 215]
            if not cands:
                orphans.append(p)
                continue
            first = max(cands, key=lambda n: n["x1"])
            by_first.setdefault(id(first), (first, []))[1].append(p)
        first_ids = set(by_first)
        for first, prices in by_first.values():
            chain, prev = [first], first
            while True:
                nxt = [n for n in names if id(n) not in first_ids and continues(prev, n) and n not in chain]
                if not nxt:
                    break
                prev = min(nxt, key=lambda n: n["y0"])
                chain.append(prev)
            dishes.append(dict(page=first["page"], x0=first["x0"], y0=first["y0"], name_lines=chain, prices=sorted(
                [(p["text"], p["x1"], p["y0"]) for p in prices], key=lambda t: t[1])))
    else:
        used = set()
        for n in sorted(names, key=lambda n: (n["page"], n["x0"], n["y0"])):
            if id(n) in used:
                continue
            above = [m for m in names if m is not n and continues(m, n)]
            if above:
                continue  # a continuation line of a name that starts higher up
            chain, prev = [n], n
            used.add(id(n))
            while True:
                nxt = [m for m in names if id(m) not in used and continues(prev, m)]
                if not nxt:
                    break
                prev = min(nxt, key=lambda m: m["y0"])
                chain.append(prev)
                used.add(id(prev))
            dishes.append(dict(page=n["page"], x0=n["x0"], y0=n["y0"], name_lines=chain, prices=[]))
        for p in price_lines:  # kids add-ons print a price on the dish's first row
            owners = [d for d in dishes if d["page"] == p["page"] and abs(d["y0"] - p["y0"]) <= 2.5 and d["name_lines"][0]["x1"] <= p["x0"] + 0.5
                      and p["x1"] - d["x0"] <= 215]
            if not owners:
                orphans.append(p)
            else:
                max(owners, key=lambda d: d["name_lines"][0]["x1"])["prices"].append((p["text"], p["x1"], p["y0"]))
    for d in dishes:
        d["name"] = " ".join(ln["text"] for ln in d["name_lines"])
        d["kcal"] = []
    all_name_lines = [ln for d in dishes for ln in d["name_lines"]]
    hidden = []
    for ln, values in kcal_lines:
        overlap = [n for n in all_name_lines if n["page"] == ln["page"] and n["x0"] - 1 <= ln["x0"] <= n["x1"]
                   and min(n["y1"], ln["y1"]) - max(n["y0"], ln["y0"]) > 0.5 * ln["h"]]
        if overlap:
            owner = [d for d in dishes if overlap[0] in d["name_lines"]][0]
            hidden.append((owner["name"], values, ln))
            continue
        pool = [d for d in dishes if _same_column(d["name_lines"][0], ln) and d["y0"] < ln["y0"] and ln["y0"] - d["y0"] <= max_gap]
        if not pool:
            raise ValueError(f"Calories {ln['text']!r} at page {ln['page']} ({ln['x0']:.0f}, {ln['y0']:.0f}) belong to no dish")
        max(pool, key=lambda d: d["y0"])["kcal"].append((values, ln))
    for d in dishes:
        d["kcal"].sort(key=lambda t: t[1]["y0"])
        last = d["kcal"][-1][1]["y0"] if d["kcal"] else d["y0"]
        d["desc"] = sorted([ln for ln in lines if _same_column(d["name_lines"][0], ln) and d["y0"] - 0.5 <= ln["y0"] <= last + 0.5
                            and kcal_values(ln) is None and not _is_price(ln)], key=lambda ln: ln["y0"])
    dishes.sort(key=lambda d: (d["page"], d["x0"], d["y0"]))
    return dishes, hidden, orphans
