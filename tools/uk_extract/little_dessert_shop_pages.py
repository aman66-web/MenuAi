"""Readers for Little Dessert Shop's own web pages (https://www.littledessertshop.co.uk), used by little_dessert_shop.py.

Both pages are plain server-rendered HTML (no script needed); only the standard library is used (Python 3.9).

menu page  /menu/<store id>/<store slug>  (one per store). A heading block per category
    <div class="col-md-12 col-xs-12 menuitem cat160" data-catid=160><div class="menuitem cat160 alert alert-primary" ...><h4>Viral Desserts</h4>
and a card per product
    <div class="col-md-4 col-xs-6 menuitem allprods prodid6049  cat160 " data-catid=160> ...
      <a class="color-type-2 caption" href="/product/6049/kinder-bueno-french-toast"> Kinder Bueno(R) French Toast <img class=allergen ...></a>
      <span class="label label-primary label-nutrition">553 kcal</span>
      <a class="btn ... addtobasket" data-prodid=6049 [data-prodoptions=yes] data-prodkcal=553 ...>
The small <img class=allergen> icons on a card (nuts, vegetarian, halal, gluten free) are hidden by the site's own stylesheet
(".shop-product-info .menutitle .caption .allergen{display:none}"), so they are NOT read: only what a visitor sees is used.

allergens page  /allergens : one table (id=allergenstable): a header row (Name + 14 allergen columns) and one row per dish. In a dish
row each of the 14 cells holds a green tick (fa-check) with an optional "(May Contain)" after it, or a red cross (fa-times). The page's own
filter buttons show a dish when its cell has a tick, so a tick = the allergen is present. A few rows hold one cell
"Product may vary, please ask a member of staff for further allergen information" instead of marks.
"""
from __future__ import annotations
import html as htmllib
import re
import unicodedata

ALLERGEN_COLUMNS = ["Milk", "Eggs", "Soybeans", "Gluten", "Nuts", "Peanuts", "Sulphur Dioxide", "Lupin", "Celery", "Mustard",
                    "Sesame Seeds", "Fish", "Molluscs", "Crustaceans"]
VARY_TEXT = "Product may vary, please ask a member of staff for further allergen information"


def clean(text: str) -> str:
    """Printed text -> one-line string: tags removed, entities decoded, every kind of space collapsed (non-breaking space too)."""
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", text))
    return " ".join(unicodedata.normalize("NFKC", text).split())


def name_key(name: str) -> str:
    """Key used to join the menu and the allergen table: the printed name with only its spaces tidied (nothing fuzzy)."""
    return clean(name)


_HEADING = re.compile(r'<div class="menuitem cat(\d+) alert alert-primary"[^>]*>.*?<h4>(.*?)</h4>', re.S)
_CARD = re.compile(r'<div class="col-md-4 col-xs-6 menuitem allprods prodid(\d+)\s+cat(\d+)\s*"')
_NAME = re.compile(r'<a class="color-type-2 caption" href="(/product/\d+/[^"]*)"[^>]*>(.*?)</a>', re.S)
_LABEL = re.compile(r'<span class="label label-primary label-nutrition">([^<]*)</span>')
_KCAL_TEXT = re.compile(r"^(\d+) kcal$")
_DATA_KCAL = re.compile(r"data-prodkcal=(\S+)")


def read_menu(page: str, where: str):
    """-> (categories {catid: name}, cards [dict(pid, catid, category, name, href, kcal, options, star)])."""
    cats = {}
    for m in _HEADING.finditer(page):
        cats[m.group(1)] = clean(m.group(2))
    starts = [(m.start(), m) for m in _CARD.finditer(page)]
    if not starts:
        raise SystemExit(f"{where}: no product cards found: the page layout changed")
    heading_starts = [m.start() for m in re.finditer(r'<div class="col-md-12 col-xs-12 menuitem cat\d+" data-catid=', page)]
    cards = []
    for n, (pos, m) in enumerate(starts):
        end = len(page)
        if n + 1 < len(starts):
            end = starts[n + 1][0]
        for h in heading_starts:
            if pos < h < end:
                end = h
        chunk = page[pos:end]
        pid, catid = m.group(1), m.group(2)
        if catid not in cats:
            raise SystemExit(f"{where}: card {pid} is in category {catid} which has no heading")
        nm = _NAME.search(chunk)
        if not nm:
            raise SystemExit(f"{where}: card {pid} has no product link")
        if f"/product/{pid}/" not in nm.group(1):
            raise SystemExit(f"{where}: card {pid} links to {nm.group(1)}")
        labels = [clean(x) for x in _LABEL.findall(chunk)]
        datas = _DATA_KCAL.findall(chunk)
        if len(labels) > 1 or len(datas) > 1:
            raise SystemExit(f"{where}: card {pid} has {len(labels)} kcal labels and {len(datas)} data-prodkcal values")
        kcal = None
        if labels:
            km = _KCAL_TEXT.match(labels[0])
            if not km:
                raise SystemExit(f"{where}: card {pid} has the unexpected calorie text {labels[0]!r}")
            kcal = km.group(1)
        # A card shown "out of stock" keeps its calorie label but has no basket button, so no data-prodkcal: allowed only then.
        out_of_stock = "btn-outofstock" in chunk
        if datas and datas[0] != kcal:
            raise SystemExit(f"{where}: card {pid}: label {labels} and data-prodkcal {datas} disagree")
        if bool(labels) != bool(datas) and not (labels and out_of_stock):
            raise SystemExit(f"{where}: card {pid}: label {labels} and data-prodkcal {datas} disagree")
        cards.append({"pid": pid, "catid": catid, "category": cats[catid], "name": clean(nm.group(2)), "href": nm.group(1),
                      "kcal": kcal, "options": "data-prodoptions" in chunk, "star": "fa-star" in nm.group(2), "out_of_stock": out_of_stock})
    return cats, cards


_TH = re.compile(r"<th[^>]*>(.*?)</th>", re.S)
_ROW = re.compile(r"<tr class=info>\s*(.*?)</tr>", re.S)
_TD = re.compile(r"<td([^>]*)>(.*?)</td>", re.S)


def read_allergens(page: str):
    """-> list of dicts (name, vary: bool, cells: {column: 'contains'|'may'|'no'} or {})."""
    t = re.search(r'<table[^>]*id=allergenstable[^>]*>(.*?)</table>', page, re.S)
    if not t:
        raise SystemExit("allergens page: table #allergenstable not found: the layout changed")
    table = t.group(1)
    heads = [clean(x) for x in _TH.findall(table)]
    if heads != ["Name"] + ALLERGEN_COLUMNS:
        raise SystemExit(f"allergens page: the table columns changed: {heads}")
    body = re.search(r"<tbody>(.*?)</tbody>", table, re.S)
    if not body:
        raise SystemExit("allergens page: no table body")
    rows = []
    raw_rows = _ROW.findall(body.group(1))
    if len(raw_rows) != body.group(1).count("<tr"):
        raise SystemExit("allergens page: a table row is not of the expected form")
    for raw in raw_rows:
        tds = _TD.findall(raw)
        name = clean(tds[0][1])
        if len(tds) == 2 and "colspan=14" in tds[1][0]:
            if clean(tds[1][1]) != VARY_TEXT:
                raise SystemExit(f"allergens page: {name!r}: unexpected full-width text {clean(tds[1][1])!r}")
            rows.append({"name": name, "vary": True, "cells": {}})
            continue
        if len(tds) != 15:
            raise SystemExit(f"allergens page: {name!r}: {len(tds)} cells, expected 15")
        cells = {}
        for col, (_, inner) in zip(ALLERGEN_COLUMNS, tds[1:]):
            tick, cross = "fa-check" in inner, "fa-times" in inner
            rest = clean(inner)
            if tick == cross:
                raise SystemExit(f"allergens page: {name!r} / {col}: cell has neither or both of tick and cross")
            if cross:
                if rest:
                    raise SystemExit(f"allergens page: {name!r} / {col}: text {rest!r} beside a cross")
                cells[col] = "no"
            elif rest == "":
                cells[col] = "contains"
            elif rest == "(May Contain)":
                cells[col] = "may"
            else:
                raise SystemExit(f"allergens page: {name!r} / {col}: unexpected text {rest!r} beside a tick")
        rows.append({"name": name, "vary": False, "cells": cells})
    return rows
