"""Reader for Blacklock's own allergy and nutrition page (https://viewthe.menu/by8v, a Ten Kites page).

Blacklock's menus page (theblacklock.com/menus) links exactly this page ("Click here to view our full allergy and nutrition list").
The page has a menu selector with two menus ("Autumn 2026 Menu Manchester" and "Sunday Main"); the second is the same page with
`?mguid=<the selector's own menu id>` (the page's own og:url uses the same form).

Same markup as the Ten Kites "table" layout that tenkites_b.py reads (one `k10-recipe__wrapper` per dish: a row with the dish name,
the 14 allergen cells and the "Energy (kCal)" cell, then a hidden card with the "Contains / May contain" lines and the ingredients).
The difference is in the card: it holds TWO nutrition tables, "Nutrition values per 100g" first and "Nutrition values per serving"
second, so tenkites_b._read_table (which compares the row with the first table it finds) stops with a mismatch. This reader
compares the row with the card's "per serving" table, and only checks that the per-100g table exists: the per-100g figures are never
used (docs/UK_DATA_PLAYBOOK.md: per-serving only, never converted).

Each record is shaped like tenkites_b's (name, desc, course, nutrients, yes_labels, recipe_id, ingredients, allergen_src, label_map)
so tenkites_b.allergens_from_rec / diet_tags work on it. Every figure is returned exactly as printed ("1,144" stays "1,144"; the
caller drops the thousands comma). Standard library only, Python 3.9.
"""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tb  # noqa: E402


def _tables(card: "tb.Node", where: str) -> Dict[str, Dict[str, str]]:
    """{'per 100g': {printed label: value}, 'per serving': {...}} from the card's nutrition tables."""
    out: Dict[str, Dict[str, str]] = {}
    for block in card.find_all("k10-recipe__nutrients"):
        title_node = block.find("k10-recipe__nutrients-title")
        title = tb._clean(title_node.text()) if title_node is not None else ""
        if not title.startswith("Nutrition values "):
            raise SystemExit(f"{where}: a nutrition table titled {title!r}: the card format changed")
        basis = title[len("Nutrition values "):]
        rows = block.find_all("k10-recipe__nutrients-table-row")
        if len(rows) != 2:
            raise SystemExit(f"{where}: the {basis!r} table has {len(rows)} rows, expected a heading row and a value row")
        names = [tb._clean(s.text()) for s in rows[0].find_all("k10-recipe__nutrient-name")]
        vals = [tb._clean(s.text()) for s in rows[1].find_all("k10-recipe__nutrient-value")]
        if len(names) != len(vals):
            raise SystemExit(f"{where}: the {basis!r} table has {len(names)} headings and {len(vals)} values")
        if basis in out:
            raise SystemExit(f"{where}: two {basis!r} tables")
        out[basis] = dict(zip(names, vals))
    return out


def read_menu(path: Path) -> List[dict]:
    """One record per dish row, in page order."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    if tb.detect_layout(text) != "table":
        raise SystemExit(f"{path}: not the Ten Kites table layout any more: re-read the page")
    root = tb.parse_html(text)
    labels = tb.page_labels(root)
    recs: List[dict] = []
    for w in root.find_all("k10-recipe__wrapper"):
        namenode = w.find("k10-w-recipe__name")
        if namenode is None:
            raise SystemExit("a dish row without a name")
        name = tb._clean(namenode.text())
        where = f"{path.name} / {name}"
        kids = [c for c in w.children if isinstance(c, tb.Node)]
        head = kids[0] if kids else None  # the dish's own row; the card below it also lists the ingredients' allergens
        if head is None or not head.has("k10-recipe") or head.find("k10-w-recipe__name") is None:
            raise SystemExit(f"{where}: the first element of a dish block is not the dish row")
        row = {}
        for d in head.find_all(attr="data-nutrient-name"):
            label = tb._clean(d.attrs["data-nutrient-name"])
            if label in row:
                raise SystemExit(f"{where}: nutrient {label!r} printed twice in the row")
            row[label] = tb._clean(d.text())
        cards = [k for k in kids[1:] if k.has("k10-recipe-card")]
        if len(cards) != 1:
            raise SystemExit(f"{where}: the dish has {len(cards)} cards, expected 1")
        card = cards[0]
        tables = _tables(card, where)
        if set(tables) != {"per 100g", "per serving"}:
            raise SystemExit(f"{where}: the card's nutrition tables are {sorted(tables)}, expected per 100g and per serving")
        if tables["per serving"] != row:
            raise SystemExit(f"{where}: the row's figures {row} differ from the card's per-serving table {tables['per serving']}")
        if set(tables["per 100g"]) != set(row):
            raise SystemExit(f"{where}: the per-100g table has other nutrients than the per-serving one")
        first = head
        marks: Dict[str, str] = {}
        for col in head.find_all("k10-recipe__label", attr="data-label-id"):
            state = [c for c in col.iter() if c is not col and "data-label-name" in c.attrs]
            if len(state) != 1:
                raise SystemExit(f"{where}: label column {col.attrs.get('data-label-name')!r} without exactly one state")
            lname = tb._clean(col.attrs.get("data-label-name", ""))
            if lname in marks:
                raise SystemExit(f"{where}: label column {lname!r} printed twice")
            marks[lname] = {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}[state[0].attrs["data-label-name"]]
        desc = w.find("k10-recipe__desc")
        ingr = w.find("k10-recipe__ingredients-wrapper")
        lines = tb._dietary_lines(w.find("k10-recipe__label-names-wrapper"))
        recs.append({
            "name": name, "desc": tb._clean(desc.text()) if desc is not None else "", "course": tb.course_path(w),
            "nutrients": row, "per100": tables["per 100g"], "yes_labels": tb._yes_labels(w),
            "recipe_id": (first.attrs.get("data-recipe-id", "") if first is not None else ""),
            "data_calories": (first.attrs.get("data-calories", "") if first is not None else ""),
            "ingredients": tb._clean(ingr.text()) if ingr is not None else "", "label_map": labels,
            "allergen_src": {"marks": marks, "marks_all": True, **lines, **tb._label_ids(first)},
        })
    return recs
