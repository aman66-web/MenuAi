"""Reader and downloader for Amalfi's own menu pages on Ten Kites (https://menus.tenkites.com/thebigtg/amalfi02 and its sister pages),
used by amalfi.py. Standard library only; run python with -I when reading saved pages. Python 3.9 compatible.

Amalfi's own site lists its restaurants at https://www.amalfi.co.uk/locations and links one Ten Kites page per open restaurant from
https://www.amalfi.co.uk/our-menus:
    Oxford Circus (25 Argyll Street, Soho)      https://menus.tenkites.com/thebigtg/amalfi02   (the page's own unit name: "Agryll Street")
    St Paul's (5-14 St. Paul's Churchyard)      https://menus.tenkites.com/thebigtg/amalfi10   ("St Pauls")
    Woburn Center Parcs (Woburn Forest)         https://menus.tenkites.com/thebigtg/amalfi07   ("CP WOBURN")
(a fourth, St Katharine Docks, is "Coming Soon" and has no page). A page opens its first menu; the other menus are the same address
with ?mguid=<menu id>, the ids being listed in the page's own menu selector.

This is the older Ten Kites "pop-over" template (the one Cafe Rouge uses): every dish, and every choice inside a "build your own"
block (a gluten-free version, an add-on, a side), has a pop-over with "Suitable for:", "Contains:" and "May contain:" lines (allergens
separated by " / ", cereals and tree nuts named in brackets) and a table "Nutritional Values:" that holds ONE row, Energy (kCal). The same
figure is printed beside the dish ("493 kcal"). There is no protein, carbohydrate, fat, salt, sugar, fibre, kJ or weight anywhere on the
page: calories only. The page's toolbar has a switch "Hide Calories"; it is NOT switched on when the page opens (no `checked`, no
`data-default`), so the calories are shown to every visitor.

Each dish is returned as

    {"menu": "Main Menu", "section": "ANTIPASTI", "block": "BRUSCHETTA" (the build-your-own block, "" for a plain dish),
     "heading": "Add:" (the option group inside the block, "" for a main choice), "kind": "dish" | "choice", "name": "Bruschetta",
     "energy": "234 kcal" (the figure beside the name), "table": {"Energy (kCal)": "234"}, "desc": "...", "suitable": ["Vegan", ...],
     "contains": [("Milk", []), ("Cereals", ["Rye", "Wheat"])] or None (no line printed), "may": [...] or None,
     "label_ids": (all ids, contained ids), "filter": {id: name}}

so that tenkites_c.allergens_checked() can cross-check the printed lines against the label ids the page's own allergen filter reads.
Nothing here converts, rounds or fills in a number (a thousands comma is dropped by tenkites_c.printed).
"""
from __future__ import annotations
import hashlib
import html
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as ta  # noqa: E402  (menu_tabs, fetch_text, _split_top)
import tenkites_c as tk  # noqa: E402

BASE = "https://menus.tenkites.com/thebigtg/"
TOGGLE_ID = "k10-filter-nutrition"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def fetch_menus(code: str, cache_dir: Path, delay: float = 1.0) -> "list[tuple[str, Path]]":
    """Download the page BASE+code and each other menu tab (?mguid=<id>) into cache_dir (files already there are reused),
    one request at a time, `delay` seconds apart. Returns [(menu name, saved page)] in tab order."""
    return ta.fetch_menus(BASE + code, cache_dir, delay)


def unit_info(page: str) -> dict:
    """The unit the page says it belongs to (its own k10.settings): output code and unit view name."""
    def get(key: str) -> str:
        m = re.search(r"k10\.settings\.%s\s*=\s*'([^']*)'" % key, page)
        return m.group(1) if m else ""
    return {"code": get("UnitOutputCode"), "unit": get("UnitViewName"), "menu": get("MenuName")}


def toggle_info(page: str) -> dict:
    """What the page says about its calorie switch: its label and whether it starts switched on (= calories hidden)."""
    root = tk.parse_html(page)
    label = root.find("k10-labels-filter2__nutrition-text")
    inp = next((n for n in root.iter() if n.attrs.get("id") == TOGGLE_ID), None)
    if label is None or inp is None:
        raise ValueError("the page has no 'Hide Calories' switch: the Ten Kites layout changed")
    return {"label": label.text(), "starts_on": "checked" in inp.attrs or inp.attrs.get("data-default") == "true"}


def _parts_slash(text: str) -> list:
    """'Milk / Cereals (Rye, Wheat)' -> [('Milk', []), ('Cereals', ['Rye', 'Wheat'])] (allergens are separated by ' / ' here)."""
    out = []
    for part in ta._split_top(text, " / "):
        head, _, inner = part.partition("(")
        out.append((head.strip(), [w.strip() for w in inner.rstrip().rstrip(")").split(",") if w.strip()]))
    return out


def _lines(rec: "tk.Node", name: str) -> dict:
    out = {"suitable": [], "contains": None, "may": None}
    box = rec.find("k10-popover__label-names-wrapper")
    if box is None:
        return out          # no dietary box at all: the dish prints no Suitable-for, Contains or May contain line
    for div in (c for c in box.children if isinstance(c, tk.Node)):
        text = div.text()
        if text.startswith("Suitable for:"):
            out["suitable"] = [w.strip() for w in text[len("Suitable for:"):].split(" / ") if w.strip()]
        elif text.startswith("Contains:"):
            if out["contains"] is not None:
                raise ValueError("%s: two 'Contains' lines" % name)
            out["contains"] = _parts_slash(text[len("Contains:"):].strip())
        elif text.startswith("May contain:"):
            if out["may"] is not None:
                raise ValueError("%s: two 'May contain' lines" % name)
            out["may"] = _parts_slash(text[len("May contain:"):].strip())
        else:
            raise ValueError("%s: unknown dietary line %r" % (name, text))
    return out


def _courses(rec: "tk.Node") -> "list[str]":
    names = []
    for a in tk._ancestors(rec):
        if a.has("k10-course"):
            head = next((c for c in a.children if isinstance(c, tk.Node) and c.has("k10-course__header")), None)
            n = head.find("k10-course__name") if head is not None else None
            names.append(n.text() if n is not None else "")
    return names[::-1]


def read_menu(text: str, menu: str) -> "list[dict]":
    root = tk.parse_html(text)
    bodies = root.find_all("k10-all-courses")
    if len(bodies) != 1:
        raise ValueError("the page has %d k10-all-courses blocks: the Ten Kites layout changed" % len(bodies))
    body = bodies[0]
    filt = tk.filter_labels(root)
    rows = []
    for rec in body.iter():
        plain = rec.has("k10-recipe") and rec.has("k10-recipe_menu-item")
        choice = rec.has("k10-byo__item")
        if not (plain or choice):
            continue
        if plain and choice:
            raise ValueError("an element is both a plain dish and a choice")
        name_node = rec.find("k10-recipe__name") if plain else rec.find("k10-byo-item__name")
        if name_node is None or not name_node.text():
            raise ValueError("a dish with no name in %s" % menu)
        name = name_node.text()
        energy_nodes = rec.find_all("k10-recipe__nutrient_energy" if plain else "k10-byo-item__nutrient_energy")
        if len(energy_nodes) > 1:
            raise ValueError("%s: %d calorie figures beside one dish" % (name, len(energy_nodes)))
        table = rec.find("k10-popover__nutrients-table")
        vals = {}
        if table is not None:
            for tr in table.find_all(tag="tr"):
                tds = tr.find_all(tag="td")
                if len(tds) != 2:
                    raise ValueError("%s: a nutrition row with %d cells" % (name, len(tds)))
                label = tds[0].text()
                if label in vals:
                    raise ValueError("%s: %r printed twice" % (name, label))
                vals[label] = tk.printed(tds[1].text())
        courses = _courses(rec)
        if not courses or not courses[0]:
            raise ValueError("%s: a dish outside any menu section" % name)
        block = heading = bdesc = ""
        if choice:
            top = next((a for a in tk._ancestors(rec) if a.has("k10-recipe") and a.has("k10-byo")), None)
            if top is None:
                raise ValueError("%s: a choice outside a build-your-own block" % name)
            bn, bd = top.find("k10-byo__name"), top.find("k10-byo__desc")
            block, bdesc = (bn.text() if bn is not None else ""), (bd.text() if bd is not None else "")
            if not (rec.parent is not None and rec.parent.has("k10-byo__section_root")):
                sec = next((a for a in tk._ancestors(rec) if a.has("k10-byo_sub_l1")), None)
                head = next((c for c in sec.children if isinstance(c, tk.Node) and c.has("k10-byo__section-name")), None) if sec is not None else None
                if head is None or not head.text():
                    raise ValueError("%s: an option without a heading" % name)
                heading = head.text()
        desc_node = rec.find("k10-recipe__desc") if plain else None
        rows.append({"menu": menu, "section": " > ".join(courses), "block": block, "heading": heading,
                     "kind": "dish" if plain else "choice", "name": name,
                     "energy": energy_nodes[0].text() if energy_nodes else "", "table": vals,
                     "desc": desc_node.text() if desc_node is not None else bdesc, **_lines(rec, name),
                     "label_ids": tk._label_ids(rec), "filter": filt})
    return rows


def calories(row: dict) -> "tuple[str, str]":
    """(the calories as printed, a problem text or ''). The figure beside the dish ("1,689 kcal") and the one in the dish's pop-up
    table ("1,689") must be the same number. Any other label in the table stops the run."""
    table, shown = row["table"], row["energy"]
    unknown = set(table) - {"Energy (kCal)"}
    if unknown:
        raise ValueError("%s: unknown nutrition label(s) %s" % (row["name"], sorted(unknown)))
    from_table = table.get("Energy (kCal)", "")
    if from_table == "-":
        from_table = ""
    from_shown = ""
    if shown:
        m = re.fullmatch(r"(\d+(?:,\d{3})*(?:\.\d+)?)\s*kcal", shown)
        if not m:
            raise ValueError("%s: unknown calorie text %r" % (row["name"], shown))
        from_shown = tk.printed(m.group(1))
    if from_table and from_shown and from_table != from_shown:
        return "", "%s: the figure beside the dish (%s) differs from the pop-up table (%s)" % (row["name"], shown, from_table)
    value = from_table or from_shown
    if value and not tk.is_number(value):
        raise ValueError("%s: calories %r is not a plain number" % (row["name"], value))
    return value, ""


def allergens(row: dict, where: str, extra: "dict | None" = None) -> "dict | None":
    """The dish's allergens: the printed Contains / May contain lines (an absent line = none printed), checked against the label ids
    the page's own allergen filter reads (stops if they disagree)."""
    if row["label_ids"] is None:
        return None
    return tk.allergens_checked(row, where, extra)


if __name__ == "__main__":     # inspection: python3 -I amalfi_pages.py page.html [...]
    for f in sys.argv[1:]:
        pg = Path(f).read_text(encoding="utf-8")
        info = unit_info(pg)
        print("#", f, info, toggle_info(pg))
        for r in read_menu(pg, info["menu"]):
            print("\t".join([r["section"], r["block"], r["heading"], r["name"], r["energy"], "/".join(r["suitable"])]))
