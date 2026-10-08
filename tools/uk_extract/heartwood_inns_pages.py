"""Reader for Heartwood Inns' own menu pages on Ten Kites (https://menus.tenkites.com/hwc/hwialacarte and its sister pages).

Standard library only. Same platform and template as Bill's (see bills_pages.py): every dish, and every choice inside a "build
your own" block (a dish offered with a choice of bun, a sauce to add, a size...), has an info pop-up with an allergen box
("Suitable for:", "Contains:", "May contain:") and a table headed "Nutrition (per serving)": Energy (kCal), Protein (g), Carb (g),
of which Sugars (g), Fat (g), Sat Fat (g), Salt (g). bills_pages does not keep the name of the block a choice belongs to ("Free-range beef
burger") or the heading of its sub-section ("Add:"), which Heartwood needs to name the rows, so this module reads both again and returns
one row per printed pop-up, in page order:

    {"kind": "dish" | "choice", "path": ["Mains"], "name": "Pork tomahawk", "block": "" | "Free-range beef burger",
     "block_desc": "garlic mayonnaise & chips", "section": "" | "Add:", "desc": "...", "price": "23.95",
     "shown_kcal": "1,633 kcal" (the figure on the dish line itself), "nutrients": {"Energy (kCal)": "1633", ...},
     "caption": "Nutrition (per serving)", "suitable": ["Vegan", "Vegetarian"], "contains": [...], "may": [...],
     "label_ids": (...), "filter": {...}, "recipe_id": "69962"}

so that tenkites_c.allergens_checked() can cross-check the printed allergen lines against the label ids the page's own allergen
filter reads. The page also embeds the menu as schema.org JSON-LD; `json_ld_items` returns (section, name, calories) from it so the
caller can cross-check the two readings of the same page. Nothing here converts, rounds or fills in a number.
"""
from __future__ import annotations
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402

HEADS = {"Contains:": "contains", "May contain:": "may", "Suitable for:": None}


def menu_tabs(page: str) -> list[tuple[str, str]]:
    """(menu name, menu id) for every entry of the page's menu selector, in order ([] when the page has a single menu)."""
    tabs = []
    for m in re.finditer(r'<(?:a|span)\b[^>]*?data-menu-identifier="([^"]+)"[^>]*?class="k10-menu-selector__option-name[^"]*"[^>]*>'
                         r'\s*<span[^>]*>\s*([^<]*?)\s*</span>', page, re.S):
        tabs.append((re.sub(r"\s+", " ", html.unescape(m.group(2))).strip(), m.group(1)))
    return tabs


def active_tab(page: str) -> str:
    """Name of the tab the page is showing (its own title when the page has no tab bar)."""
    for m in re.finditer(r'<(?:a|span)\b[^>]*?data-menu-identifier="([^"]+)"[^>]*?class="(k10-menu-selector__option-name[^"]*)"[^>]*>'
                         r'\s*<span[^>]*>\s*([^<]*?)\s*</span>', page, re.S):
        if "option-name_active" in m.group(2):
            return re.sub(r"\s+", " ", html.unescape(m.group(3))).strip()
    return tk.page_title(page)


def _popover(node, name: str) -> dict:
    table = node.find("k10-popover__nutrients-table")
    vals = {}
    if table is not None:
        for tr in table.find_all(tag="tr"):
            tds = tr.find_all(tag="td")
            if len(tds) != 2:
                raise SystemExit(f"{name}: a nutrition row with {len(tds)} cells: the layout changed")
            label = tds[0].text()
            if label in vals:
                raise SystemExit(f"{name}: nutrient {label!r} printed twice")
            vals[label] = tk.printed(tds[1].text())
    caption = ""
    wrap = node.find("k10-popover__nutrients-wrapper")
    if wrap is not None:
        head = wrap.find("k10-popover__labels")
        caption = head.text() if head is not None else ""
    suit = node.find("k10-popover__label-names-wrapper")
    lines = {"contains": None, "may": None}
    suitable: list = []
    for div in (c for c in (suit.children if suit is not None else []) if isinstance(c, tk.Node)):
        line = div.text()
        if line.startswith("Suitable for:"):
            suitable = [w.strip() for w in line[len("Suitable for:"):].split(",") if w.strip()]
        tk._line(line, lines, HEADS, name)
    return {"nutrients": vals, "caption": caption, "suitable": suitable, **lines}


def read_menu(text: str) -> list[dict]:
    root = tk.parse_html(text)
    bodies = root.find_all("k10-all-courses")
    if len(bodies) != 1:
        raise SystemExit(f"expected one k10-all-courses block, found {len(bodies)}: the layout changed")
    body = bodies[0]
    filt = tk.filter_labels(root)
    rows: list[dict] = []
    for rec in body.iter():
        if not rec.has("k10-recipe"):
            continue
        if rec.has("k10-recipe_menu-item"):
            name = rec.find("k10-recipe__name")
            if name is None or rec.find("k10-popover__nutrients-table") is None:
                raise SystemExit("a dish without a name or a nutrition pop-up: the layout changed")
            desc, price, shown = rec.find("k10-recipe__desc"), rec.find("k10-recipe__price"), rec.find("k10-primary-nutrient__item")
            rows.append({"kind": "dish", "path": tk._course_names(rec), "name": name.text(), "block": "", "block_desc": "",
                         "section": "", "desc": desc.text() if desc is not None else "",
                         "price": price.text() if price is not None else "",
                         "shown_kcal": shown.text() if shown is not None else "", "label_ids": tk._label_ids(rec),
                         "filter": filt, "recipe_id": rec.attrs.get("data-recipe-id", ""), **_popover(rec, name.text())})
        elif rec.has("k10-recipe_byo"):
            bname, bdesc = rec.find("k10-byo__name"), rec.find("k10-byo__desc")
            # a block with no name is a bare "Add:" list (sauces, dressings) or a drink's size choices: its rows follow the dishes
            # above it in the same section, and block == "" tells the caller so
            for sec in rec.find_all("k10-byo__section"):
                head = sec.parent.find("k10-byo__section-name") if sec.parent is not None else None   # the heading sits beside the list
                if not sec.has("k10-byo__section_root") and (head is None or sec.parent.has("k10-recipe")):
                    raise SystemExit("a sub-section of choices without a heading: the layout changed")
                sec_name = "" if sec.has("k10-byo__section_root") else head.text()
                for it in sec.children:
                    if not (isinstance(it, tk.Node) and it.has("k10-byo-item")):
                        continue
                    name = it.find("k10-byo-item__name")
                    if name is None or it.find("k10-popover__nutrients-table") is None:
                        raise SystemExit("a choice without a name or nutrition pop-up: the layout changed")
                    desc, price, shown = it.find("k10-byo-item__description"), it.find("k10-byo-item__price"), it.find("k10-primary-nutrient__item")
                    rows.append({"kind": "choice", "path": tk._course_names(rec), "name": name.text(), "block": bname.text() if bname is not None else "",
                                 "block_desc": bdesc.text() if bdesc is not None else "", "section": sec_name,
                                 "desc": desc.text() if desc is not None else "", "price": price.text() if price is not None else "",
                                 "shown_kcal": shown.text() if shown is not None else "",
                                 "label_ids": tk._label_ids(it, it.attrs.get("data-recipe-id", "")), "filter": filt,
                                 "recipe_id": it.attrs.get("data-recipe-id", ""), **_popover(it, name.text())})
    return rows


def json_ld_items(text: str) -> list[tuple]:
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
