"""Read Tim Hortons UK's official nutrition pages into rows of printed numbers.

Used by tools/uk_extract/tim_hortons.py. Standard library only.

timhortons.co.uk has no nutrition PDF. Every product has its own server-rendered page,
https://timhortons.co.uk/information/<id>, with a per-serving table (serving size, energy kJ/kcal, fat, saturates,
carbohydrates, sugars, fibre, protein, salt) and the full menu index (every product id, grouped by menu section) in the
sidebar of every page. Drinks with sizes link to /information/<id>/small and /information/<id>/large; the page without a
suffix is the Medium one. Numbers are returned exactly as printed (strings such as "<0.5", "0.00", "2.1"); nothing is
converted, rounded or estimated here.
"""
from __future__ import annotations
import hashlib
import html
import re
import time
import urllib.request
from pathlib import Path

BASE = "https://timhortons.co.uk/information/"
INDEX_ID = "56"  # any product page carries the whole menu index; this one is used to read it
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")

# Row labels of the table, in the order the page prints them.
LABELS = ("Serving Size", "Energy", "Fat", "of which Saturates", "Carbohydrates", "of which Sugars", "Fibre", "Protein", "Salt")
FIELDS = ("serving", "energy", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")

_NUM_G = re.compile(r"^(<?\d+(?:\.\d+)?)g$")
_ENERGY = re.compile(r"^(\d+(?:\.\d+)?)kJ/(\d+(?:\.\d+)?)Kcal$")
_SERVING = re.compile(r"^(\d+(?:\.\d+)?) ?(g|oz)(?: ?(?:g|oz))?$")
_TAGS = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def fetch(path: str, dest: Path, delay: float = 1.0) -> None:
    """Download BASE + path to dest (one polite request; the caller must not call this more than once a second)."""
    req = urllib.request.Request(BASE + path, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"{BASE + path} returned HTTP {resp.status}")
        dest.write_bytes(resp.read())
    time.sleep(delay)


def clean(text: str) -> str:
    return _WS.sub(" ", html.unescape(_TAGS.sub("", text)).replace("\xa0", " ")).strip()


def read_index(page: str) -> list[tuple[str, str, list[tuple[str, str]]]]:
    """The menu index: [(section slug, section title, [(product id, product name as listed)])] in page order."""
    start = page.find('<div id="accordion">')
    end = page.find('<div class="photo_detail_area', start)
    if start < 0 or end < 0:
        raise SystemExit("No menu index found in the page: the layout changed, re-check the source.")
    out = []
    for m in re.finditer(r'<h3 id="([^"]*)">([^<]*)</h3>(.*?)(?=<h3 id=|$)', page[start:end], flags=re.S):
        items = [(i, clean(n)) for i, n in re.findall(r'href="https://timhortons\.co\.uk/information/(\d+)\s*">(.*?)</a>', m.group(3), flags=re.S)]
        out.append((m.group(1), clean(m.group(2)), items))
    return out


def read_sizes(page: str) -> list[tuple[str, str, bool]]:
    """[(label, suffix, is_this_page)] for a drink's size switch ('' suffix = the Medium page); [] when there is none."""
    detail = page[page.find('<div class="photo_detail_area'):page.find('<div class="information_detail">')]
    out = []
    for m in re.finditer(r'<a href="https://timhortons\.co\.uk/information/\d+(?:/(\w+))?\s*"(\s+class="active")?\s*>([SML])</a><br/>(\w+)', detail):
        out.append((m.group(4), m.group(1) or "", bool(m.group(2))))
    return out


def read_page(page: str) -> dict:
    """The product name (h1), the printed table cells and the dietary line of one page."""
    m = re.search(r"<h1>(.*?)</h1>", page, flags=re.S)
    if not m:
        raise SystemExit("A product page has no title: the layout changed, re-check the source.")
    start = page.find('<div class="information_detail">')
    table = page[start:page.find("</table>", start)]
    rows = []
    for r in re.findall(r"<tr>(.*?)</tr>", table, flags=re.S):
        th = re.findall(r"<th[^>]*>(.*?)</th>", r, flags=re.S)
        td = re.findall(r"<td[^>]*>(.*?)</td>", r, flags=re.S)
        if th and td:
            rows.append((clean(th[0]), clean(td[0])))
    if tuple(label for label, _ in rows) != LABELS:
        raise SystemExit(f"The table's rows changed.\n  expected {LABELS}\n  found    {tuple(label for label, _ in rows)}")
    diet = re.search(r"Dietary considerations:</strong>(.*?)</p>", page, flags=re.S)
    allergens = re.search(r"<strong>Allergens:</strong>(.*?)</p>", page, flags=re.S)
    return {"name": clean(m.group(1)), "cells": dict(zip(FIELDS, (v for _, v in rows))),
            "diet": clean(diet.group(1)) if diet else "", "allergens": clean(allergens.group(1)) if allergens else ""}


def printed_numbers(cells: dict[str, str]) -> dict[str, str] | None:
    """Turn the printed cells into the numbers as printed (no unit): kj, kcal, fat, sat, carbs, sugars, fibre, protein, salt
    and the serving as 'number unit'. Returns None when the page prints no usable numbers (empty table)."""
    e = _ENERGY.match(cells["energy"].replace(" ", ""))
    if not e:
        return None
    out = {"kj": e.group(1), "kcal": e.group(2)}
    for key in ("fat", "sat", "carbs", "sugars", "fibre", "protein", "salt"):
        g = _NUM_G.match(cells[key].replace(" ", ""))
        if not g:
            raise SystemExit(f"Unreadable {key} value {cells[key]!r} (energy {cells['energy']!r}): the page changed, re-check the source.")
        out[key] = g.group(1)
    s = _SERVING.match(cells["serving"])
    if not s:
        raise SystemExit(f"Unreadable serving size {cells['serving']!r}: the page changed, re-check the source.")
    out["serving"] = f"{s.group(1)} {s.group(2)}"
    out["serving_printed"] = cells["serving"]
    return out


def sha256_bytes(*chunks: bytes) -> str:
    h = hashlib.sha256()
    for c in chunks:
        h.update(c)
    return h.hexdigest()
