"""Reader for Loungers' (the Lounge brand's) own menu pages on Ten Kites (https://menus.tenkites.com/loungers/lounges09),
standard library only.

The page is the chain's "nutrition and allergen" embed (thelounges.co.uk/<venue>/menus embeds it). One URL per menu:
?mguid=<menu id>, the ids being listed in the page's own menu selector (STANDARD is the page's first menu, with no mguid).

CALORIES ARE HIDDEN BY DEFAULT. The page's toolbar has a switch "Hide Calories" (Yes / No) that starts on Yes: the page then
shows no calories beside the dishes and none in the dish pop-up; a visitor flips the switch to No and every dish shows
"<n> kcal" beside its name and "Nutrition (per portion) Energy (kCal)" in its pop-up. The figures are in the page's HTML all
along (hidden with CSS until the switch is flipped); this reader reads those figures, which are the same ones the switch shows.

Each dish is returned as

    {"menu": "STANDARD", "section": "Brunch", "subsection": "", "role": "dish" | "base" | "option", "group": "Add" (an option's
     heading, else ""), "name": "LOUNGE BREAKFAST", "recipe_id": "73752", "energy": "963 kcal" (the figure beside the name, "" if
     none), "table": {"Energy (kCal)": "963"} (the pop-up's nutrition table, {} if none), "desc": "Smoked back bacon, ...",
     "suitable": ["Vegan", "Vegetarian"], "contains": [("Cereals with Gluten", ["Wheat"]), ...] ([] = "none of the listed
     allergens"), "may": [...] or None (no "May contain" line), "label_ids": (all ids, contained ids), "filter": {id: name}}

so that tenkites_c.allergens_checked() can cross-check the printed lines against the label ids the page's own allergen filter
reads. Nothing here converts, rounds or fills in a number (a thousands comma is dropped by tenkites_c.printed).

Roles: "dish" is a plain menu dish; "base" is the main dish of a block that offers add-ons or choices ("SMASHED AVOCADO BRUNCH"
with "Add: STREAKY BACON"); "option" is one of those add-ons / choices / sides, with its own figure.
"""
from __future__ import annotations
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402

NONE_MSG = "This dish contains none of the listed allergens"
TOGGLE_ID = "k10-filter-nutrition"


def menu_tabs(page: str) -> list[tuple[str, str]]:
    """(menu name, menu id) for every entry of the page's menu selector, in order."""
    tabs = []
    for m in re.finditer(r'data-menu-identifier="([^"]+)"[^>]*data-index="\d+">\s*<span[^>]*>\s*([^<]*?)\s*</span>', page, re.S):
        tabs.append((re.sub(r"\s+", " ", html.unescape(m.group(2))).strip(), m.group(1)))
    return tabs


def page_title(page: str) -> str:
    return tk.page_title(page)


def toggle_info(page: str) -> dict:
    """What the page says about its calorie switch: its label, whether it starts on (= calories hidden) and what it shows."""
    root = tk.parse_html(page)
    label = root.find("k10-labels-filter2__nutrition-text")
    inp = next((n for n in root.iter() if n.attrs.get("id") == TOGGLE_ID), None)
    lab = next((n for n in root.iter() if n.tag == "label" and n.attrs.get("for") == TOGGLE_ID), None)
    if label is None or inp is None or lab is None:
        raise ValueError("the page has no 'Hide Calories' switch: the Ten Kites layout changed")
    return {"label": label.text(), "default_hides": inp.attrs.get("data-default") == "true",
            "on": lab.attrs.get("data-on", ""), "off": lab.attrs.get("data-off", "")}


def _name(rec: "tk.Node") -> "tk.Node | None":
    return rec.find("k10-recipe__name") or rec.find("k10-byo-item__name")


def _own_energy(rec: "tk.Node") -> list[str]:
    return [n.text() for n in rec.find_all("k10-primary-nutrient__item")]


def _lines(rec: "tk.Node", name: str) -> dict:
    out = {"contains": None, "may": None, "suitable": []}
    box = rec.find("k10-popover__label-names-wrapper")
    if box is None:
        raise ValueError(f"{name}: no allergen block in the dish pop-up")
    for div in (c for c in box.children if isinstance(c, tk.Node)):
        text = div.text()
        if text == NONE_MSG:
            if out["contains"] is not None:
                raise ValueError(f"{name}: two 'Contains' lines")
            out["contains"] = []
        elif text.startswith("Suitable for:"):
            out["suitable"] = [s.strip() for s in text[len("Suitable for:"):].split(",") if s.strip()]
        elif text.startswith("Contains:"):
            if out["contains"] is not None:
                raise ValueError(f"{name}: two 'Contains' lines")
            out["contains"] = tk._parts(text[len("Contains:"):].strip())
        elif text.startswith("May contain:"):
            if out["may"] is not None:
                raise ValueError(f"{name}: two 'May contain' lines")
            out["may"] = tk._parts(text[len("May contain:"):].strip())
        else:
            raise ValueError(f"{name}: unknown allergen line {text!r}")
    if out["contains"] is None:
        # Ten Kites leaves a section out when it is empty: a dish with only a "May contain" line has no "Contains" line. It is read
        # as "contains none" only with a "May contain" line present, and allergens_checked() then compares it with the label ids.
        if out["may"] is None:
            raise ValueError(f"{name}: no 'Contains' line, no 'May contain' line and no 'none of the listed allergens' message")
        out["contains"] = []
    return out


def read_dishes(text: str, menu: str) -> list[dict]:
    root = tk.parse_html(text)
    bodies = root.find_all("k10-all-courses")
    if len(bodies) != 1:
        raise ValueError(f"the page has {len(bodies)} k10-all-courses blocks: the Ten Kites layout changed")
    body = bodies[0]
    filt = tk.filter_labels(root)
    rows = []
    for rec in body.iter():
        rid = rec.attrs.get("data-recipe-id")
        if rid is None:
            continue
        if not (rec.has("k10-recipe_menu-item") or rec.has("k10-byo__item")):
            raise ValueError(f"recipe {rid}: an element of an unknown kind {rec.attrs.get('class')!r}")
        name_node = _name(rec)
        if name_node is None:
            raise ValueError(f"recipe {rid}: no name")
        name = name_node.text()
        table = rec.find("k10-popover__nutrients-table")
        vals = {}
        if table is not None:
            for tr in table.find_all(tag="tr"):
                tds = tr.find_all(tag="td")
                if len(tds) != 2:
                    raise ValueError(f"{name}: a nutrition row with {len(tds)} cells")
                if tds[0].text() in vals:
                    raise ValueError(f"{name}: {tds[0].text()!r} printed twice")
                vals[tds[0].text()] = tk.printed(tds[1].text())
        energy = _own_energy(rec)
        if len(energy) > 1:
            raise ValueError(f"{name}: {len(energy)} calorie figures beside one dish")
        # section = the first-level course; subsection = the second-level one (Cocktails > Classics, Build your own > Pick side 1)
        levels = []
        for a in tk._ancestors(rec):
            if a.has("k10-course"):
                h = next((c for c in a.children if isinstance(c, tk.Node) and c.has("k10-course__header")), None)
                n = h.find("k10-course__name") if h is not None else None
                levels.append(n.text() if n is not None else "")
        levels.reverse()
        if not levels or not levels[0] or len(levels) > 2:
            raise ValueError(f"{name}: unexpected menu section nesting {levels}")
        role, group = "dish", ""
        if rec.has("k10-byo__item"):
            root_sec = rec.parent is not None and rec.parent.has("k10-byo__section_root")
            role = "base" if root_sec else "option"
            if not root_sec:
                sec = next((a for a in tk._ancestors(rec) if a.has("k10-byo_sub_l1")), None)
                head = next((c for c in sec.children if isinstance(c, tk.Node) and c.has("k10-byo__section-name")), None) if sec is not None else None
                if head is None or not head.text():
                    raise ValueError(f"{name}: an option without a heading")
                group = head.text()
        desc = rec.find("k10-recipe__desc") or rec.find("k10-byo-item__description")
        lines = _lines(rec, name)
        rows.append({"menu": menu, "section": levels[0], "subsection": levels[1] if len(levels) > 1 else "", "role": role,
                     "group": group, "name": name, "recipe_id": rid, "energy": energy[0] if energy else "", "table": vals,
                     "desc": desc.text() if desc is not None else "", **lines, "label_ids": tk._label_ids(rec, rid),
                     "filter": filt})
    return rows


def calories(row: dict) -> tuple[str, str]:
    """(the calories as printed, a problem text or ''). The figure beside the dish ("1,689 kcal") and the one in the dish's
    pop-up table ("1,689") must be the same number; a dish with neither (the table says "-") returns ''. Any other label in the
    table stops the run."""
    table, shown = row["table"], row["energy"]
    unknown = set(table) - {"Energy (kCal)"}
    if unknown:
        raise ValueError(f"{row['name']}: unknown nutrition label(s) {sorted(unknown)}")
    from_table = table.get("Energy (kCal)", "")
    if from_table == "-":          # the pop-up's own "not published" mark (the dish shows no figure beside its name either)
        from_table = ""
    from_shown = ""
    if shown:
        m = re.fullmatch(r"(\d+(?:,\d{3})*(?:\.\d+)?)\s*kcal", shown)
        if not m:
            raise ValueError(f"{row['name']}: unknown calorie text {shown!r}")
        from_shown = tk.printed(m.group(1))
    if from_table and from_shown and from_table != from_shown:
        return "", f"{row['name']}: the figure beside the dish ({shown}) differs from the pop-up table ({from_table})"
    value = from_table or from_shown
    if value and not tk.is_number(value):
        raise ValueError(f"{row['name']}: calories {value!r} is not a plain number")
    return value, ""


def allergens(row: dict, where: str, extra: dict | None = None) -> dict | None:
    """The dish's allergens: the printed Contains / May contain lines, checked against the page's own label ids (stops if they
    disagree). `extra` adds the chain's own printed spellings. None if there are no label ids to check against."""
    return tk.allergens_checked(row, where, extra)
