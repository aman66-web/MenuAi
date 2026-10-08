"""Reader for Haven's allergen and nutrition guide on viewthe.menu (a Ten Kites page), used by tools/uk_extract/haven.py.

The guide https://viewthe.menu/1afv is Haven's "menu allergy and nutritional information guide" for the main restaurants of its
holiday parks (linked from https://www.haven.com/discover/food-and-drink). The page is server-rendered HTML but holds ONE menu at
a time: the menu picker lists 19 menus, each reached by adding ?mguid=<menu identifier> to the same URL (one request per menu).

Each menu is a wide table (the "desktop" block): one row per dish with the dish name and, in brackets, its calories ("( 498 kcal )"),
then a column per allergen (a tick = contains, an "M" = may contain) and for Vegan / Vegetarian. Opening a row shows the dish's
description and a "Dietary Information" block with the same facts in words:

    Suitable for: Vegetarian
    Contains: Eggs, Cereals Containing Gluten (Barley, Kamut (Wheat), Spelt (Wheat), Wheat)
    May contain: Milk, Soya, Cereals Containing Gluten (Oats, Rye)

There are no other nutrients on the page (no protein, carbohydrate, fat, salt, kJ or weights): calories only.

Every row returned by read_menu() is exactly what the page prints; nothing is converted, rounded or filled. The allergen facts
exist in three forms on the page (the columns, the printed lines, and the label ids the page's own allergen filter reads) and
allergens_for() stops the run if they disagree. Standard library only (plus tenkites_c, which holds the shared DOM helpers).
"""
from __future__ import annotations
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tc  # noqa: E402
from common import allergen_words  # noqa: E402

# Haven's own spellings of two cereals (the bracket of "Cereals Containing Gluten" prints "Kamut (Wheat)" and "Spelt (Wheat)").
EXTRA_WORDS = {"kamut (wheat)": ("gluten", "kamut"), "spelt (wheat)": ("gluten", "spelt")}

# The page also prints two labels that are NOT among the 14 allergens and that Haven keeps apart from "Cereals Containing Gluten":
# "Gluten Free Oats" (label id 1000) and "Gluten Free Barley" (id 1004). A dish can carry one of them with no "Cereals Containing
# Gluten" at all ("Contains: Milk, Gluten Free Oats"). They are read here (so the checks still see every printed word) and then
# left out of the allergen data: there is no field for them and mapping them to gluten would be inventing a fact the guide does
# not print. haven.py says so in note.txt.
GLUTEN_FREE_LABELS = {"Gluten Free Oats": "1000", "Gluten Free Barley": "1004"}

# The 14 allergen columns as the page prints them, and the Suitable-for columns.
ALLERGEN_COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
                    "Sulphur Dioxide/Sulphites", "Peanuts", "Tree Nuts", "Cereals Containing Gluten"]
SUITABLE_COLUMNS = ["Vegan", "Vegetarian"]
EXPECTED_COLUMNS = ALLERGEN_COLUMNS + list(GLUTEN_FREE_LABELS) + SUITABLE_COLUMNS

KCAL = re.compile(r"^(\d+(?:,\d{3})*)\s*kcal$", re.I)


def menu_list(page_text: str) -> list:
    """[(index, menu identifier, printed menu name)] from the page's menu picker."""
    root = tc.parse_html(page_text)
    out = []
    for n in root.iter():
        ident = n.attrs.get("data-menu-identifier")
        if ident and n.has("k10-menu-selector__option-name"):
            out.append((int(n.attrs.get("data-index", "-1")), ident, n.text()))
    return sorted(out)


def split_parts(text: str) -> list:
    """'Cereals Containing Gluten (Barley, Kamut (Wheat), Wheat), Eggs' -> [('Cereals Containing Gluten', ['Barley',
    'Kamut (Wheat)', 'Wheat']), ('Eggs', [])]. Brackets may nest ("Kamut (Wheat)" sits inside the gluten bracket)."""
    parts = []
    for p in tc._split_top(text):
        head, paren, rest = p.partition("(")
        inner = []
        if paren:
            body = rest.rstrip()
            if not body.endswith(")"):
                raise ValueError(f"unbalanced bracket in {p!r}")
            inner = tc._split_top(body[:-1])
        parts.append((head.strip(), inner))
    return parts


def _dietary(card: "tc.Node | None", where: str) -> dict:
    """The 'Dietary Information' lines of a dish's detail card: suitable (list), contains / may (parts or None)."""
    out = {"suitable": None, "contains": None, "may": None, "desc": ""}
    if card is None:
        return out
    desc = card.find("k10-recipe__desc")
    out["desc"] = desc.text() if desc is not None else ""
    wrap = card.find("k10-recipe__label-names-wrapper")
    if wrap is None:
        return out
    for div in (c for c in wrap.children if isinstance(c, tc.Node)):
        text = div.text()
        if text.startswith("Suitable for:"):
            key, val = "suitable", [x.strip() for x in text[len("Suitable for:"):].split(",") if x.strip()]
        elif text.startswith("Contains:"):
            key, val = "contains", split_parts(text[len("Contains:"):].strip())
        elif text.startswith("May contain:"):
            key, val = "may", split_parts(text[len("May contain:"):].strip())
        else:
            raise ValueError(f"{where}: unknown dietary line {text!r}")
        if out[key] is not None:
            raise ValueError(f"{where}: two {key!r} lines")
        out[key] = val
    return out


def read_menu(page_text: str) -> dict:
    """One menu page -> {"title", "identifier", "rows": [...]}. A row:
        {"section", "name", "kcal" (as printed, digits), "kcal_attr" (the row's data-calories), "recipe_id", "guid",
         "states": {column: 'yes'|'may'|'no'|None}, "suitable": [...], "contains": parts|None, "may": parts|None,
         "label_ids": (all ids, contained ids)|None, "desc"}"""
    title = html.unescape(tc.page_title(page_text)).strip()
    i = page_text.find("k10-all-courses k10-all-courses_desktop")
    j = page_text.find("k10-all-courses k10-all-courses_mobile")
    if i < 0 or j < 0 or j < i:
        raise SystemExit(f"{title}: the desktop/mobile menu blocks were not found: the page layout changed")
    root = tc.parse_html('<div><div class="' + page_text[i:j] + "</div>")
    section_tag = re.search(r'<section class="k10-menus[^>]*data-menu-identifier="([^"]+)"', page_text)
    ident = section_tag.group(1) if section_tag else ""
    rows = []
    for course in root.find_all("k10-course"):
        name_node = course.find("k10-course__name")
        section = name_node.text() if name_node is not None else ""
        for info in course.find_all("k10-w-recipe__info"):
            if not info.has("k10-recipe"):
                continue  # the dietary block carries the same class; only the dish row itself is a recipe
            nm = info.find("k10-w-recipe__name")
            shown = info.find("k10-primary-nutrient__item")
            if nm is None:
                raise SystemExit(f"{title}/{section}: a row without a dish name")
            name = nm.text()
            where = f"{title} / {section} / {name}"
            kcal = ""
            if shown is not None:
                m = KCAL.match(shown.text())
                if not m:
                    raise SystemExit(f"{where}: unexpected energy text {shown.text()!r}")
                kcal = m.group(1).replace(",", "")  # a thousands comma ("1,420") is dropped, as in tenkites_c.printed
            states = {}
            for cell in info.find_all("k10-recipe__label"):
                lab = cell.attrs.get("data-label-name")
                if lab:
                    if lab in states:
                        raise SystemExit(f"{where}: column {lab!r} twice")
                    states[lab] = tc._state(cell)
            if list(states) != EXPECTED_COLUMNS:
                raise SystemExit(f"{where}: columns are {list(states)}, expected {EXPECTED_COLUMNS}: the page's table changed")
            card = None
            if info.parent is not None:
                for sib in info.parent.children:
                    if isinstance(sib, tc.Node) and sib.has("k10-recipe-card") and sib.attrs.get("data-recipe-id") == info.attrs.get("data-recipe-id"):
                        card = sib
            diet = _dietary(card, where)
            rows.append({"menu": title, "section": section, "name": name, "kcal": kcal, "kcal_attr": info.attrs.get("data-calories", ""),
                         "recipe_id": info.attrs.get("data-recipe-id", ""), "guid": info.attrs.get("data-guid", ""), "states": states,
                         "suitable": diet["suitable"], "contains": diet["contains"], "may": diet["may"], "desc": diet["desc"],
                         "label_ids": tc._label_ids(info, info.attrs.get("data-recipe-id", "")), "has_card": card is not None})
    return {"title": title, "identifier": ident, "rows": rows, "filter": tc.filter_labels(tc.parse_html(page_text))}


def _without_gluten_free(parts: "list | None") -> "list | None":
    if parts is None:
        return None
    return [(h, inner) for h, inner in parts if h not in GLUTEN_FREE_LABELS]


def allergens_for(row: dict, filt: dict) -> dict:
    """{'contains', 'may_contain', 'cereals', 'nuts'} for one dish, from its printed Contains / May contain lines, checked against
    (1) the allergen columns (tick / M / blank) and (2) the label ids the page's own allergen filter reads. Stops (SystemExit) when
    any of them disagree, or when a printed word is not one of the 14 allergens (or a named cereal / tree nut) and not one of the two
    gluten-free labels. 'Gluten Free Oats' / 'Gluten Free Barley' are checked and then left out (see GLUTEN_FREE_LABELS)."""
    where = f"{row['menu']} / {row['section']} / {row['name']}"
    if row["contains"] is None and row["may"] is None:
        # the page prints a 'Contains' line only when there is something to list: no line means none of the 14 are marked
        pass
    gf_ids = set(GLUTEN_FREE_LABELS.values())
    gf_filter = {i: n for i, n in filt.items() if i not in gf_ids}
    ids = row["label_ids"]
    if ids is not None:
        ids = ([i for i in ids[0] if i not in gf_ids], [i for i in ids[1] if i not in gf_ids])
    contains = _without_gluten_free(row["contains"]) or []
    may = _without_gluten_free(row["may"]) or []
    # the gluten-free labels must still agree between the columns, the printed lines and the ids
    for lab, lid in GLUTEN_FREE_LABELS.items():
        printed_c = any(h == lab for h, _ in (row["contains"] or []))
        printed_m = any(h == lab for h, _ in (row["may"] or []))
        col = row["states"][lab]
        if printed_c != (col == "yes") or printed_m != (col == "may"):
            raise SystemExit(f"{where}: column {lab!r} is {col!r} but the printed lines say contains={printed_c} may={printed_m}")
        if row["label_ids"] is not None:
            in_all, in_no_may = lid in row["label_ids"][0], lid in row["label_ids"][1]
            if (in_no_may != printed_c) or (in_all and not (printed_c or printed_m)) or (printed_m and not in_all):
                raise SystemExit(f"{where}: label id {lid} ({lab}) disagrees with the printed lines")
    checked = tc.allergens_checked({"contains": contains, "may": may, "label_ids": ids, "filter": gf_filter}, where, EXTRA_WORDS)
    if checked is None:
        raise SystemExit(f"{where}: no label ids or no allergen filter to check the printed allergens against")
    # the columns
    col_yes = {c for c in ALLERGEN_COLUMNS if row["states"][c] == "yes"}
    col_may = {c for c in ALLERGEN_COLUMNS if row["states"][c] == "may"}
    if any(row["states"][c] is None for c in ALLERGEN_COLUMNS):
        raise SystemExit(f"{where}: an allergen column has no mark")
    # One printed pattern is allowed to differ from the column: a dish whose 'Contains' line names some tree nuts (or some cereals)
    # and whose 'May contain' line also lists the umbrella allergen for the other kinds ("Contains: Tree Nuts (Brazil Nuts, ...)",
    # "May contain: Tree Nuts (Almond Nuts, ...)"). The umbrella column then shows "M" (the ids agree: the umbrella id sits in the
    # may group, the named kinds in the contains group). The printed lines are the precise statement and are used.
    for umbrella in ("Tree Nuts", "Cereals Containing Gluten"):
        named = [inner for h, inner in contains if h == umbrella and inner]
        in_may_line = any(h == umbrella for h, _ in may)
        if row["states"][umbrella] == "may" and named and in_may_line:
            col_may.discard(umbrella)
            col_yes.add(umbrella)
    yes_keys = allergen_words(sorted(col_yes), where, EXTRA_WORDS)[0]
    may_keys = allergen_words(sorted(col_may), where, EXTRA_WORDS)[0]
    if yes_keys != checked["contains"] or may_keys - yes_keys != checked["may_contain"] - checked["contains"]:
        raise SystemExit(f"{where}: allergen columns (contains {sorted(yes_keys)}, may {sorted(may_keys)}) disagree with the printed "
                         f"lines (contains {sorted(checked['contains'])}, may {sorted(checked['may_contain'])})")
    return checked


def suitable_marks(row: dict) -> set:
    """{'vegan', 'vegetarian'} the page marks the dish suitable for: the columns and the printed 'Suitable for:' line must agree."""
    col = {c.lower() for c in SUITABLE_COLUMNS if row["states"][c] == "yes"}
    printed = {x.lower() for x in (row["suitable"] or [])}
    if col != printed:
        raise SystemExit(f"{row['menu']} / {row['name']}: Suitable-for columns {sorted(col)} disagree with the printed line {sorted(printed)}")
    return printed
