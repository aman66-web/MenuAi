"""Reader for Giraffe's own menu pages on Ten Kites (https://menus.tenkites.com/brg/giraffeadults), standard library only.

Giraffe's "Allergen & Nutritional" pages use the compact Ten Kites template (Boparan group): one line per dish with the
dish's calories in brackets, two dietary icons, and under "Contains" the allergens the dish contains, plus one line
"This dish could also include ..." for the "may contain" allergens. There is no nutrition table: the page prints
calories only. The six menus (Breakfast, Main, Dessert, Gluten Free, Kid's, Drinks) are the same URL with
?mguid=<menu id>, the ids being listed in the page's own menu selector.

Each dish is returned as

    {"menu": "Main Menu", "section": "SMALL PLATES", "name": "Crispy Calamari", "energy": "(574 kcal)",
     "vegan": True/False, "vegetarian": True/False,          # the page's own icons (..._yes_32.png / ..._no_32.png)
     "contains": [("Cereals with Gluten", ["Wheat"]), ...] or [] ("This dish contains none of the listed allergens"),
     "may": [("Celery", []), ("Milk", [])] or None (no "could also include" line printed),
     "label_ids": (all ids, contained ids) read from the dish element, "filter": {id: name}}

so that tenkites_c.allergens_checked() can cross-check the printed lines against the label ids the page's own allergen
filter reads. Nothing here converts, rounds or fills in a number.
"""
from __future__ import annotations
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402

NONE_MSG = "This dish contains none of the listed allergens"
MAY_PREFIX = "This dish could also include"


def menu_tabs(page: str) -> list[tuple[str, str]]:
    """(menu name, menu id) for every entry of the page's menu selector, in order."""
    tabs = []
    for m in re.finditer(r'<span data-menu-identifier="([^"]+)" class="k10-menu-selector__option-name">\s*'
                         r'<span[^>]*>\s*([^<]*?)\s*</span>', page, re.S):
        tabs.append((re.sub(r"\s+", " ", html.unescape(m.group(2))).strip(), m.group(1)))
    return tabs


def page_menu(page: str) -> tuple[str, str]:
    """(the menu's title, the file name the page names for itself, e.g. GiraffeEATIN-MainMenu_2026-10-07.pdf)."""
    t = re.search(r"<title>(.*?)</title>", page, re.S)
    f = re.search(r'<section class="k10-menus"[^>]*data-file-name="([^"]*)"', page)
    return (html.unescape(t.group(1)).strip() if t else ""), (f.group(1) if f else "")


def _icon(rec: "tk.Node", kind: str) -> bool:
    states = []
    for img in rec.find_all(tag="img"):
        m = re.search(r"/DietaryImage/(vegan|vegetarian)_(yes|no)_32\.png$", img.attrs.get("src", ""))
        if m and m.group(1) == kind:
            states.append(m.group(2))
    if len(states) != 1:
        raise ValueError(f"{kind} icon printed {len(states)} times for one dish: the page layout changed")
    return states[0] == "yes"


def read_dishes(text: str, menu: str) -> list[dict]:
    root = tk.parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise ValueError("the page has no k10-all-courses block: the Ten Kites layout changed")
    filt = tk.filter_labels(root)
    rows = []
    for course in body.find_all("k10-course"):
        head = next((c for c in course.children if isinstance(c, tk.Node) and c.has("k10-course__name")), None)
        section = head.text() if head is not None else ""
        if not section:
            raise ValueError("a menu section without a name")
        for rec in course.find_all("k10-recipe_menu-item"):
            names = rec.find_all("k10-recipe__name-wrapper")
            energy = rec.find_all("k10-recipe__nutrient_energy")
            if len(names) != 1 or len(energy) > 1:
                raise ValueError(f"{section}: a dish with {len(names)} names / {len(energy)} calorie values")
            name = names[0].text()
            lines = {"contains": None, "may": None, "blank": False}
            for box in rec.find_all("k10-recipe__labels-wrapper-content"):
                if box.has("k10-recipe__labels-wrapper-content_may"):
                    text_ = box.text()
                    if not text_.startswith(MAY_PREFIX):
                        raise ValueError(f"{name}: unknown 'may' line {text_!r}")
                    if lines["may"] is not None:
                        raise ValueError(f"{name}: two 'may' lines")
                    lines["may"] = tk._parts(text_[len(MAY_PREFIX):].strip())
                else:
                    if lines["contains"] is not None:
                        raise ValueError(f"{name}: two 'contains' lines")
                    parts = [s.text() for s in box.find_all("k10-recipe__label-name")]
                    if parts:
                        if box.find_all("k10-recipe__no-label-msg"):
                            raise ValueError(f"{name}: allergens and the 'none' message together")
                        lines["contains"] = tk._parts(", ".join(parts))
                    else:
                        msg = [s.text() for s in box.find_all("k10-recipe__no-label-msg")]
                        if msg == [NONE_MSG]:
                            lines["contains"] = []
                        elif not msg and not box.text():
                            # An empty "Contains" box is printed when the dish has only a "could also include" line
                            # (e.g. Tomato). It is read as "contains none" only if the label ids around the dish agree
                            # (allergens_checked compares them) and a "could also include" line exists (checked below).
                            lines["contains"] = []
                            lines["blank"] = True
                        else:
                            raise ValueError(f"{name}: unknown allergen box {box.text()!r}")
            if lines["contains"] is None:
                raise ValueError(f"{name}: no 'Contains' line")
            if lines["blank"] and lines["may"] is None:
                raise ValueError(f"{name}: an empty 'Contains' box and no 'could also include' line")
            rows.append({"menu": menu, "section": section, "name": name, "energy": energy[0].text() if energy else "",
                         "vegan": _icon(rec, "vegan"), "vegetarian": _icon(rec, "vegetarian"),
                         **lines, "label_ids": tk._label_ids(rec), "filter": filt})
    return rows


def calories(energy: str) -> str:
    """'(574 kcal)' -> '574', '(1,150 kcal)' -> '1150' (the number as printed, thousands comma dropped); '' if the dish
    prints no calories; anything else stops the run."""
    if not energy:
        return ""
    m = re.fullmatch(r"\(\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*kcal\s*\)", energy)
    if not m:
        raise ValueError(f"unknown calorie text {energy!r}")
    return tk.printed(m.group(1))


def allergens(row: dict, where: str, extra: dict | None = None) -> dict | None:
    """The dish's allergens: the printed Contains / may lines, checked against the page's own label ids (stops if they
    disagree). `extra` adds the chain's own printed spellings. None if there are no label ids to check against."""
    return tk.allergens_checked(row, where, extra)
