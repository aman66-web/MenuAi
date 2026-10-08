"""Reader for Malmaison's own allergen and calorie pages (menus.tenkites.com/mhdv/malmaison, hosted by Ten Kites) and for
the chain's printed menu PDFs on malmaison.com (used only to cross-check the calories). Standard library only; PDFs need
`pdftotext` (poppler). Python 3.9 compatible.

The page is the "table layout" of Ten Kites (like Farmer J and Yo! Sushi) but it prints ONE number per dish, the energy:
"(488 kcal)" beside the dish name (settings on the page: ShowNutrients = false, ShowPrimaryNutrients = true). No other
nutrient is in the page's HTML at all, so nothing is hidden and nothing can be revealed (checked: no "Nutrition" text, no kJ,
no nutrient cells). Each dish also carries the 14-allergen matrix (Contains / May contain), written three ways that
`allergens` cross-checks: the column icons, the pop-up text and the label ids on the dish.

`read_menu(text)` returns one dict per dish:
    section, name, kcal_text ("1,469 kcal"), kcal_attr (data-calories), kcal_copy (the page's second, hidden copy of the
    same energy), recipe_id, states {allergen column: yes|may|no}, lines {column: {"contains": parts, "may": parts}},
    ids_contains / ids_all (the dish's own label ids), ingredients [{name, states}] (the sub-recipes of the dish).
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

import tenkites_c as tk

# The 14 allergen columns as this page prints them.
COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
           "Sulphur Dioxide/Sulphites", "Peanuts", "Tree Nuts", "Cereals with Gluten"]
STATE = {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}


def _states(node, only_own: bool = True) -> dict:
    """{column: yes|may|no} for the label cells that are direct children of `node`."""
    out = {}
    for cell in node.children:
        if hasattr(cell, "has") and cell.has("k10-recipe__label") and cell.attrs.get("data-label-name"):
            st = None
            for n in cell.iter():
                v = n.attrs.get("data-label-name", "")
                if v in STATE:
                    st = STATE[v]
            out[cell.attrs["data-label-name"]] = st
    return out


def _lines(node) -> dict:
    """{column: {"contains": parts|None, "may": parts|None}} from the pop-up of each label cell (the pop-up follows its
    label cell and shares the guid '<dish guid>-<label id>')."""
    ids = {c.attrs["data-label-id"]: c.attrs["data-label-name"] for c in node.children
           if hasattr(c, "has") and c.has("k10-recipe__label") and c.attrs.get("data-label-id")}
    out = {}
    for pop in node.children:
        if not (hasattr(pop, "has") and pop.has("k10-popover")):
            continue
        guid = pop.attrs.get("data-k10-popover-guid", "")
        lid = guid.rsplit("-", 1)[-1]
        if lid not in ids:
            raise ValueError(f"pop-up {guid!r} does not belong to a label of its dish")
        entry = {"contains": None, "may": None}
        content = pop.find("k10-popover__content")
        for div in (content.children if content is not None else []):
            if not hasattr(div, "text"):
                continue
            text = div.text()
            for head, field in (("Contains ", "contains"), ("May contain ", "may")):
                if text.startswith(head):
                    if entry[field] is not None:
                        raise ValueError(f"two {head!r} lines in one pop-up: {text!r}")
                    entry[field] = tk._parts(text[len(head):])
                    break
            else:
                raise ValueError(f"unknown pop-up line {text!r}")
        out[ids[lid]] = entry
    return out


def read_menu(text: str) -> dict:
    """Parse one saved page. Returns {"menu": name, "dishes": [...], "flags": {...}}."""
    import html as _html
    m = re.search(r"k10\.settings\.MenuName = '([^']*)'", text)
    flags = {k: re.search(r"k10\.settings\.%s = '(\w+)' === 'true'" % k, text) for k in ("ShowNutrients", "ShowPrimaryNutrients")}
    flags = {k: (v.group(1) == "true" if v else None) for k, v in flags.items()}
    root = tk.parse_html("<div>" + tk._desktop_part(text) + "</div></div>")
    filt = tk.filter_labels(tk.parse_html(text))
    dishes = []
    section = ""
    pending_copy = ""
    for n in root.iter():
        if n.has("k10-course__name") and n.has("k10-w-course__name"):
            section = n.text()
        if n.has("k10-recipe__foodprint"):
            item = n.find("k10-primary-nutrient__item")
            pending_copy = item.text() if item is not None else ""
        if not (n.has("k10-recipe__wrapper")):
            continue
        dish = next((c for c in n.children if hasattr(c, "has") and c.has("k10-w-recipe__info") and c.has("k10-recipe")), None)
        card = next((c for c in n.children if hasattr(c, "has") and c.has("k10-recipe-card")), None)
        if dish is None:
            raise ValueError("a dish wrapper without its dish row")
        shown = dish.find_all("k10-primary-nutrient__item")
        ingredients = []
        if card is not None:
            for wrap in card.find_all("k10-recipe__ingredient-name-wrapper"):
                nm = wrap.find("k10-recipe__ingredient-name")
                ingredients.append({"name": nm.text() if nm is not None else "", "states": _states(wrap)})
        ids_all = [x for x in dish.attrs.get("data-all-labels", "").split(",") if x]
        ids_no_may = [x for x in dish.attrs.get("data-no-may-labels", "").split(",") if x]
        dishes.append({
            "section": section, "name": _html.unescape(dish.find("k10-w-recipe__name").text()),
            "kcal_text": " | ".join(x.text() for x in shown), "kcal_attr": dish.attrs.get("data-calories", ""),
            "kcal_copy": pending_copy, "recipe_id": dish.attrs.get("data-recipe-id", ""),
            "states": _states(dish), "lines": _lines(dish), "ids_contains": ids_no_may, "ids_all": ids_all,
            "ingredients": ingredients, "filter": filt})
        pending_copy = ""
    return {"menu": _html.unescape(m.group(1)) if m else "", "dishes": dishes, "flags": flags, "title": tk.page_title(text)}


def printed_kcal(value: str) -> str:
    """'1,469 kcal' -> '1469' (the thousands comma is dropped; nothing else changes). '' when not of that form."""
    m = re.fullmatch(r"\s*(\d{1,3}(?:,\d{3})+|\d+)\s*kcal\s*", value)
    return m.group(1).replace(",", "") if m else ""


# ---------------------------------------------------------------- allergens (docs/DATA.md "Allergens")

def allergens(dish: dict, where: str) -> dict:
    """The dish's allergens, read from three printed forms that must agree: the 14 column marks, the pop-up lines
    ("Contains Cereals with Gluten (Barley, Wheat)", "May contain Milk") and the dish's own label ids (as named by the
    page's allergen filter). Raises ValueError (naming the dish) when they disagree or a column has no mark."""
    from common import allergen_words
    states = dish["states"]
    missing = [c for c in COLUMNS if states.get(c) not in ("yes", "may", "no")]
    if missing or set(states) != set(COLUMNS):
        raise ValueError(f"{where}: allergen columns missing or unmarked: {missing or sorted(set(states) ^ set(COLUMNS))}")
    lines = dish["lines"]
    contains, may_only, cereals, nuts = set(), set(), set(), set()
    for col in COLUMNS:
        st, entry = states[col], lines.get(col, {"contains": None, "may": None})
        if st == "no" and (entry["contains"] is not None or entry["may"] is not None):
            raise ValueError(f"{where}: {col} is marked 'no' but its pop-up says {entry}")
        if st == "yes" and entry["contains"] is None:
            raise ValueError(f"{where}: {col} is marked 'contains' but its pop-up has no 'Contains' line")
        if st == "may" and (entry["may"] is None or entry["contains"] is not None):
            raise ValueError(f"{where}: {col} is marked 'may contain' but its pop-up says {entry}")
        if st in ("yes", "may"):
            key, _, _ = allergen_words([col], where)
            (contains if st == "yes" else may_only).update(key)
            if st == "yes":
                for head, inner in entry["contains"]:
                    k, c, n = allergen_words([head], where)
                    if k != key:
                        raise ValueError(f"{where}: pop-up names {head!r} under {col}")
                    ik, ic, inn = allergen_words(inner, where) if inner else (set(), set(), set())
                    if ik - key:
                        raise ValueError(f"{where}: {head!r} names {sorted(ik - key)} in its brackets")
                    cereals |= ic
                    nuts |= inn
            for head, inner in (entry["may"] or []):
                k, _, _ = allergen_words([head], where)
                if k != key:
                    raise ValueError(f"{where}: pop-up names {head!r} under {col}")
                if inner:
                    allergen_words(inner, where)  # unknown spellings stop the run
    # the dish's own label ids, named by the page's allergen filter
    filt = dish["filter"]
    named = {i: allergen_words([nm], where)[0] for i, nm in filt.items()}
    id_contains = set().union(*[named[i] for i in dish["ids_contains"] if i in named]) if dish["ids_contains"] else set()
    id_may = set().union(*[named[i] for i in dish["ids_all"] if i in named and i not in dish["ids_contains"]]) if dish["ids_all"] else set()
    if id_contains != contains:
        raise ValueError(f"{where}: label ids say contains {sorted(id_contains)}, the columns say {sorted(contains)}")
    if id_may != may_only:
        raise ValueError(f"{where}: label ids say may contain {sorted(id_may)}, the columns say {sorted(may_only)}")
    return {"contains": contains, "may_contain": may_only, "cereals": cereals, "nuts": nuts}


def ingredient_conflicts(dish: dict) -> list:
    """Columns where a sub-recipe of the dish contains (or may contain) an allergen that the dish row itself marks 'no'
    (or, for 'contains', only 'may'): the page contradicting itself. Empty list when consistent or when the dish has no
    sub-recipe rows."""
    out = []
    for ing in dish["ingredients"]:
        for col in COLUMNS:
            s, d = ing["states"].get(col), dish["states"].get(col)
            if s == "yes" and d != "yes":
                out.append(f"{ing['name']!r} contains {col} but the dish row says {d}")
            elif s == "may" and d == "no":
                out.append(f"{ing['name']!r} may contain {col} but the dish row says no")
    return out


# ---------------------------------------------------------------- printed menu PDFs (calorie cross-check only)

def pdf_text(path: Path) -> str:
    """The PDF's text in reading order, whitespace collapsed to single spaces."""
    out = subprocess.run(["pdftotext", "-raw", str(path), "-"], check=True, capture_output=True).stdout.decode("utf-8", "replace")
    return re.sub(r"\s+", " ", out)


def pdf_kcal(text: str, needle: str, index: int = 0, where: str = "") -> int:
    """The calories printed with the dish whose heading contains `needle` (exactly once in the PDF): the first
    '(NNNkcal)' or '(A/B/Ckcal)' after it, within 320 characters, option number `index`."""
    hits = [m.start() for m in re.finditer(re.escape(needle), text)]
    if len(hits) != 1:
        raise SystemExit(f"{where}: the PDF heading {needle!r} is found {len(hits)} times (expected once): the menu changed, re-check PDF_CHECKS")
    m = re.compile(r"\(((?:\d+\s*(?:kcal)?\s*[/|]\s*)*\d+)\s*kcal\)").search(text, hits[0])
    if not m or m.start() - hits[0] > 320:
        raise SystemExit(f"{where}: no calories printed within 320 characters after {needle!r}")
    values = re.findall(r"\d+", m.group(1))
    if index >= len(values):
        raise SystemExit(f"{where}: {needle!r} prints {len(values)} calorie values, wanted number {index + 1}")
    return int(values[index])
