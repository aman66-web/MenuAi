"""Reader for Rudy's Pizza Napoletana's own allergen and nutrition page (https://viewthe.menu/5zav, a Ten Kites page).

The page is a wide table, one block per dish (`k10-recipe__wrapper`): a row with the dish name, the 14 allergen cells, the
Vegan / Vegetarian cells and the 7 nutrition cells under the heading "Nutrition values per serving" (the page's own
"View nutrition information" button only shows them), followed by a hidden card with the ingredients, the printed
"Contains / May contain / Suitable for" lines and two nutrition tables ("per 100g" and "per serving"). Only the per-serving
cells are read: they are checked against the card's own "per serving" table, and the per-100g table is never used.

A dish with sizes (Small Campana) has an extra allergy row and one row + card per size. The card of every dish also lists its
ingredients with their own nutrition cells ("Allergens by ingredient / sub-recipe"): those are never read, only the dish's own row.

Every figure is returned exactly as printed (a thousands comma removed, as tenkites_c.printed does). Standard library only.
"""
from __future__ import annotations
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402

NUTRIENTS = ["Energy (kCal)", "Protein (g)", "Carb (g)", "of which Sugars (g)", "Fat (g)", "Sat Fat (g)", "Salt (g)"]
NUTRIENT_FIELDS = ["calories", "protein_g", "carbs_g", "sugar_g", "fat_g", "sat_fat_g", "salt_g"]


def _els(n: tk.Node) -> list:
    return [c for c in n.children if isinstance(c, tk.Node)]


def _own_cells(row: tk.Node) -> dict:
    """The row's own 'Nutrition values per serving' cells, {printed label: printed value}."""
    out: dict = {}
    for c in row.find_all("k10-recipe__label_nutrient"):
        label = html.unescape(c.attrs.get("data-nutrient-name", "")).strip()
        if label in out:
            raise SystemExit(f"nutrition label {label!r} appears twice in one row")
        out[label] = tk.printed(c.text())
    return out


def _states(row: tk.Node) -> dict:
    """{allergen / diet column: 'yes' | 'may' | 'no' | None} from the row's own cells (not the ingredient rows in the card)."""
    out: dict = {}
    for c in row.find_all("k10-recipe__label"):
        name = c.attrs.get("data-label-name")
        if name and not c.has("k10-recipe__label_nutrient"):
            if name in out:
                raise SystemExit(f"column {name!r} appears twice in one row")
            out[name] = tk._state(c)
    return out


def _lines(card: tk.Node) -> dict:
    """The card's printed dietary lines: {'Contains': text, 'May contain': text, 'Suitable for': text}."""
    box = card.find("k10-recipe__label-names-wrapper")
    out: dict = {}
    for div in (_els(box) if box is not None else []):
        m = re.match(r"^(Contains|May contain|Suitable for):\s*(.*)$", div.text())
        if not m:
            raise SystemExit(f"unknown dietary line {div.text()!r}")
        if m.group(1) in out:
            raise SystemExit(f"two {m.group(1)!r} lines in one card")
        out[m.group(1)] = m.group(2)
    return out


def _tables(card: tk.Node) -> dict:
    """{'per 100g': {...}, 'per serving': {...}} from the card's two nutrition tables (the per-100g one is only checked for
    existence, never used). A table whose header has an extra leading column (the size name) is returned under its size."""
    out: dict = {}
    for tb in card.find_all("k10-recipe__nutrients"):
        title = tb.find("k10-recipe__nutrients-title").text().replace("Nutrition values ", "")
        rows = tb.find_all("k10-recipe__nutrients-table-row")
        head = [s.text() for s in rows[0].find_all("k10-recipe__nutrient-name")]
        vals = [tk.printed(s.text()) for s in rows[1].find_all("k10-recipe__nutrient-value")]
        if len(head) != len(vals):
            raise SystemExit(f"nutrition table with {len(head)} headings and {len(vals)} values")
        size = ""
        if head and head[0] == "":
            head, size, vals = head[1:], vals[0], vals[1:]
        out.setdefault((title, size), dict(zip(head, vals)))
    return out


def _course_path(node: tk.Node) -> str:
    names = []
    a = node.parent
    while a is not None:
        if a.has("k10-course"):
            h = next((c for c in _els(a) if c.has("k10-course__name")), None)
            names.append(h.text() if h is not None else "?")
        a = a.parent
    return " > ".join(names[::-1])


def read_food_menu(text: str) -> list:
    """One dict per dish (and per size of a dish with sizes), in page order:
    section, name, size, recipe_id, nutrients {printed label: value}, states {column: yes|may|no}, lines {Contains, May contain,
    Suitable for}, desc, ingredients, label_ids (all, contained), filter."""
    root = tk.parse_html(text)
    desk = root.find("k10-all-courses_desktop")
    if desk is None:
        raise SystemExit("the page has no desktop course block: the layout changed, re-check the reader")
    filt = tk.filter_labels(root)
    rows = []
    for w in desk.find_all("k10-recipe__wrapper"):
        kids = _els(w)
        cards = [k for k in kids if k.has("k10-recipe-card")]
        if not cards:
            raise SystemExit("a dish block has no card")
        first = kids[0]
        name_node = first.find("k10-w-recipe__name")
        if name_node is None:
            raise SystemExit("a dish block has no name")
        name = name_node.text()
        rid = first.attrs.get("data-recipe-id", "")
        states = _states(first)
        lines = _lines(cards[0])
        desc, ing = cards[0].find("k10-recipe__desc"), cards[0].find("k10-recipe__ingredients-wrapper")
        common = {"section": _course_path(w), "name": name, "recipe_id": rid, "states": states, "lines": lines,
                  "desc": desc.text() if desc is not None else "", "ingredients": ing.text() if ing is not None else "",
                  "label_ids": tk._label_ids(first, rid), "filter": filt}
        size_rows = [k for k in kids if k.has("k10-recipe_desktop-nutrition-size")]
        if size_rows:
            for srow in size_rows:
                scard = next((k for k in kids[kids.index(srow) + 1:] if k.has("k10-recipe-card")), None)
                size = srow.find("k10-recipe__size-name").text().replace("\xa0", " ").strip()
                rows.append({**common, "size": size, "nutrients": _own_cells(srow), "table": _tables(scard).get(("per serving", ""), {})})
        else:
            rows.append({**common, "size": "", "nutrients": _own_cells(first), "table": _tables(cards[0]).get(("per serving", ""), {})})
    return rows


def numbers_checked(row: dict) -> dict:
    """The row's seven per-serving figures as item fields, exactly as printed. Stops if a cell is missing, is not a plain
    number, or differs from the same dish's 'Nutrition values per serving' table in its card."""
    where = row["name"] + (f" ({row['size']})" if row["size"] else "")
    cells = row["nutrients"]
    if list(cells) != NUTRIENTS:
        raise SystemExit(f"{where}: nutrition columns are {list(cells)}, expected {NUTRIENTS}")
    if row["table"] and row["table"] != cells:
        raise SystemExit(f"{where}: the row's cells {cells} differ from the card's per-serving table {row['table']}")
    if not row["table"]:
        raise SystemExit(f"{where}: no per-serving table in the card to check the row against")
    out = {}
    for label, field in zip(NUTRIENTS, NUTRIENT_FIELDS):
        v = cells[label]
        if not re.match(r"^-?\d+(\.\d+)?$", v):
            raise SystemExit(f"{where}: {label} is {v!r}, not a plain number")
        out[field] = v
    return out
