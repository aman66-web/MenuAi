"""Read Harbour Hotels' menu PDFs into dish records (name, description, printed calories).

Used by tools/uk_extract/harbour_hotels.py. Requires `pdftotext` (poppler). Calories are returned exactly as printed (strings such as
"516"); nothing is converted, rounded or estimated here.

Every hotel's menus are InDesign layouts with a real text layer, in several columns. A dish prints as a paragraph in one column:

    Roast Pork Tenderloin 25                       <- name, dietary marks (V, VG, VGA), price (or none on set menus)
    Burnt apple purée, crisp potato rösti, ...     <- description
    broccoli, Cornish Orchards Cider jus 735 kcal  <- the calories end the dish ("735 kcal" or "735kcal")

Some menus print name and description on one line ("Mac 'n' Cheese, Cheddar, cream sauce 506 kcal 6"), a few print only "Fries V 144 kcal".
A paragraph is read as: the lines of one column (left edges within 4 pt) that follow each other without a gap of more than 14 pt, ended by the
first line that contains "kcal". Lines before it that are a section title ("Starters", "Mains" ...) are dropped (the caller passes the titles).
A paragraph is NOT a dish, and is skipped, when its calorie line holds two or more values ("383 kcal or ... kcal"), a size pair ("214/388 kcal"),
a decimal, when a qualifier follows the figure ("116 kcal per 100g", "per slice", "each"), when it starts with "Add" or a lower-case word or ends the first line with a comma (a description whose name line sits in another
column), or when it is the footer ("Adults require approximately 2000 kcal a day").
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

KC = re.compile(r"(\d+(?:\.\d+)?(?:\s*/\s*\d+)?)\s*kcal", re.I)
MARK = re.compile(r"[\s,]*\b(V|VG|VGA|VGO|GF|DF|N)\b,?$")
PRICE = re.compile(r"\s+(?:£?\d+(?:\.\d\d)?|MP|•|\|)$")
GAP = 14.0
SAME_X = 4.0


def norm(text: str) -> str:
    """Comparison form: lower case, quotes and '&' unified, punctuation removed (letters with accents are kept)."""
    t = text.lower().replace("&", " and ").replace("’", "'").replace("‘", "'").replace("'", "")
    return " ".join(re.sub(r"[^\w]+", " ", t).split())


def strip_marks(heading: str) -> tuple:
    """('Burrata Mozzarella V, VGA 14') -> ('Burrata Mozzarella', ['V', 'VGA'])."""
    h, marks = heading.strip(), []
    for _ in range(10):
        n = PRICE.sub("", h)
        m = MARK.search(n)
        if m:
            marks.append(m.group(1))
            n = n[:m.start()]
        n = n.strip()
        if n == h:
            break
        h = n
    return h, marks[::-1]


def page_lines(pdf: Path) -> list:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for pg in out.split("<page ")[1:]:
        lines = []
        for lm in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', pg, re.S):
            x0, y0, _x1, y1, body = lm.groups()
            words = [html.unescape(w) for w in re.findall(r"<word[^>]*>(.*?)</word>", body)]
            text = " ".join(" ".join(words).replace("​", "").replace("\t", " ").split())
            lines.append(dict(x0=float(x0), y0=float(y0), y1=float(y1), text=text))
        pages.append(lines)
    return pages


def paragraphs(pdf: Path) -> list:
    """[{page, x, y, lines}]: each ends with the first line that prints calories."""
    res = []
    for pi, lines in enumerate(page_lines(pdf), 1):
        groups: list = []
        for ln in sorted(lines, key=lambda l: l["x0"]):
            for g in groups:
                if abs(g[0]["x0"] - ln["x0"]) <= SAME_X:
                    g.append(ln)
                    break
            else:
                groups.append([ln])
        for g in groups:
            g.sort(key=lambda l: l["y0"])
            para: list = []
            for ln in g:
                if para and ln["y0"] - para[-1]["y1"] > GAP:
                    para = []
                para.append(ln)
                if KC.search(ln["text"]):
                    res.append(dict(page=pi, x=para[0]["x0"], y=para[0]["y0"], lines=[p["text"] for p in para]))
                    para = []
    return res


def section_titles(all_paragraphs: list) -> set:
    """First lines of multi-line paragraphs that precede at least 5 different second lines: they are section titles ("Starters", "Mains")."""
    follow: dict = {}
    for p in all_paragraphs:
        if len(p["lines"]) >= 2 and not KC.search(p["lines"][0]):
            follow.setdefault(p["lines"][0], set()).add(p["lines"][1])
    return {t for t, s in follow.items() if len(s) >= 5 and len(t.split()) <= 6}


def record(p: dict, titles: set):
    """A dish record, or None when the paragraph is not a single clearly printed dish (see the module docstring)."""
    lines = list(p["lines"])
    while len(lines) > 1 and lines[0] in titles:
        lines = lines[1:]
    last = lines[-1]
    hits = KC.findall(last)
    if len(hits) != 1 or "/" in hits[0] or "." in hits[0]:
        return None
    kcal = hits[0].replace(" ", "")
    # a qualifier after the figure ("116 kcal per 100g", "67 kcal per slice", "... each") means it is not the dish as served: skip
    if re.search(r"\b(per|each|every)\b|\d\s*(?:g|ml)\b", last[KC.search(last).end():], re.I):
        return None
    if re.search(r"approximately|kcal a day|2000 kcal", " ".join(lines), re.I):
        return None
    first = lines[0]
    if first.startswith("Add") or first[:1].islower() or (len(lines) > 1 and first.endswith(",")):
        return None
    if len(lines) == 1:
        head_text = first[:KC.search(first).start()].strip()
        body = ""
    else:
        head_text = first
        body = " ".join(lines[1:])
        body = body[:KC.search(body).start()].strip()
    name, marks = strip_marks(head_text)
    if not name:
        return None
    if body:  # dietary marks can also end the description ("... cream V 512 kcal")
        body, body_marks = strip_marks(body)
        marks = marks + body_marks
    # the name used to spot the same dish printed with another value: for a one-line dish with its description after a comma, the words
    # before the first comma ("Mac 'n' Cheese, Cheddar, cream sauce 506 kcal" -> "Mac 'n' Cheese")
    name_key = norm(name.split(",")[0]) if not body else norm(name)
    return dict(name=name, marks=marks, body=body, kcal=kcal, key=norm(name + " / " + body) if body else norm(name), name_key=name_key)
