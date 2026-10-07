"""Reader for Bill's allergen & nutrition pages (menus.tenkites.com/bills/bills, hosted by Ten Kites). Standard library only.

The page is the same Ten Kites platform as Carluccio's (see tenkites_c.py) but each menu also holds "build your own" blocks
(`k10-byo`): a dish offered in sizes (3 / 5 stack pancakes, small / large), with add-ons, or with a choice of milk. Each choice is a
`k10-byo-item` with its own pop-up (allergens + "Nutrition (per portion)" table). tenkites_c.read_popover_layout only reads the
plain dishes, so this module reads both kinds, in page order, and returns one row per printed pop-up:

    {"menu": 1, "path": ["MAINS & SALADS"], "kind": "dish" | "option", "name": "BILL'S FISH PIE", "desc": ["line", ...],
     "price": "15.50", "nutrients": {"Energy (kCal)": "682"}, "suitable": "Suitable for: ...", "contains": [...], "may": [...],
     "label_ids": (...), "filter": {...}, "group": "7.3" | None, "group_info": ["text of the dish line above the options", ...],
     "subsection": "TOPPERS" | ""}

The page also embeds the menu as schema.org JSON-LD (names, prices, calories); `json_ld_items` reads it so the caller can
cross-check the two readings of the same page. Numbers are copied as printed ("1,440" -> "1440"); nothing is converted.
"""
from __future__ import annotations
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402


def lines_of(node) -> list:
    """Text of a node split where the page breaks the line (<br>, <em>, block elements): ['4.6%', 'Only available ...']."""
    parts = [""]

    def walk(n):
        for c in n.children:
            if isinstance(c, str):
                parts[-1] += c
            elif c.tag in ("br", "em", "div", "p", "li"):
                parts.append("")
                walk(c)
                parts.append("")
            elif c.tag not in ("script", "style", "svg"):
                walk(c)

    walk(node)
    return [re.sub(r"\s+", " ", p).strip() for p in parts if re.sub(r"\s+", " ", p).strip()]


def _popover(node, name: str) -> dict:
    pop = node.find("k10-popover__nutrients-table")
    vals = {}
    if pop is not None:
        for tr in pop.find_all(tag="tr"):
            tds = tr.find_all(tag="td")
            if len(tds) >= 2:
                vals[tds[0].text()] = tk.printed(tds[1].text())
    suit = node.find("k10-popover__label-names-wrapper")
    lines = {"contains": None, "may": None}
    for div in (c for c in (suit.children if suit is not None else []) if isinstance(c, tk.Node)):
        tk._line(div.text(), lines, {"Contains:": "contains", "May contain:": "may", "Suitable for:": None}, name)
    return {"nutrients": vals, "suitable": suit.text() if suit is not None else "", **lines}


def read_menu(text: str, menu: int) -> list:
    root = tk.parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise SystemExit("the page has no k10-all-courses block: the layout changed")
    filt = tk.filter_labels(root)
    rows = []
    group = 0
    for rec in body.iter():
        if not rec.has("k10-recipe"):
            continue
        if rec.has("k10-recipe_menu-item"):
            name = rec.find("k10-recipe__name")
            if name is None or rec.find("k10-popover__nutrients-table") is None:
                raise SystemExit(f"menu {menu}: a dish without a name or nutrition pop-up: the layout changed")
            desc = rec.find("k10-recipe__desc")
            price = rec.find("k10-recipe__price")
            rows.append({"menu": menu, "path": tk._course_names(rec), "kind": "dish", "name": name.text(),
                         "desc": lines_of(desc) if desc is not None else [], "price": price.text() if price is not None else "",
                         "group": None, "group_info": [], "subsection": "", "label_ids": tk._label_ids(rec),
                         "filter": filt, **_popover(rec, name.text())})
        elif rec.has("k10-recipe_byo"):
            group += 1
            info = [c.text() for c in rec.find_all("k10-info-row__name") if c.text()]
            sub_names = {}
            for sec in rec.find_all("k10-byo__section"):
                head = sec.find("k10-byo__section-name")
                if head is not None:
                    for it in sec.find_all("k10-byo-item"):
                        sub_names[id(it)] = head.text()
            for it in rec.find_all("k10-byo-item"):
                name = it.find("k10-byo-item__name")
                if name is None:
                    continue  # a text line above the options, kept in group_info
                if it.find("k10-popover__nutrients-table") is None:
                    raise SystemExit(f"menu {menu}: option {name.text()!r} has no nutrition pop-up: the layout changed")
                desc = it.find("k10-byo-item__description")
                price = it.find("k10-byo-item__price")
                rows.append({"menu": menu, "path": tk._course_names(rec), "kind": "option", "name": name.text(),
                             "desc": lines_of(desc) if desc is not None else [], "price": price.text() if price is not None else "",
                             "group": f"{menu}.{group}", "group_info": info, "subsection": sub_names.get(id(it), ""),
                             "label_ids": tk._label_ids(it, it.attrs.get("data-recipe-id", "")), "filter": filt,
                             **_popover(it, name.text())})
    return rows


def json_ld_items(text: str) -> list:
    """(section path, name, calories) from the schema.org Menu the page embeds; calories as printed ('682 calories' -> '682')."""
    out = []
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', text, re.S):
        try:
            data = json.loads(m.group(1))
        except ValueError:
            continue

        def walk(node, path):
            if isinstance(node, dict):
                if node.get("@type") == "MenuItem":
                    cal = (node.get("nutrition") or {}).get("calories", "")
                    out.append((tuple(path), html.unescape(node.get("name", "")).strip(), re.sub(r"\s*calories?$", "", str(cal)).strip()))
                    return
                p = path + [node["name"]] if node.get("@type") == "MenuSection" and "name" in node else path
                for v in node.values():
                    walk(v, p)
            elif isinstance(node, list):
                for v in node:
                    walk(v, path)

        walk(data, [])
    return out
