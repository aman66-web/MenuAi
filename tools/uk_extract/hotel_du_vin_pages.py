"""Reader for the "allergen matrix" pages Ten Kites hosts for Hotel du Vin (https://menus.tenkites.com/mhdv/hotelduvin), standard
library only (builds on the small DOM in tenkites_c.py).

Layout (Frasers Hospitality brands on Ten Kites: Hotel du Vin, Malmaison). One page per menu tab (the tabs are the same URL with
?mguid=<menu id>, listed in the page's own menu selector). Every page carries its dishes several times (a hidden "food print" copy,
the desktop table row, a hidden desktop card, a mobile row and a hidden mobile card). This reader uses the desktop table block
and cross-checks it against the mobile block of the same page, then returns one record per printed dish:

    {"menu": "Autumn Menu 2026", "section": "Plats principaux/mains", "name": "...", "kcal": "437" or "",
     "states": {"Milk": "yes"/"may"/"no", ... 14 allergen columns},
     "popup": {"Milk": "Contains Milk", "Cereals with Gluten": "Contains Cereals with Gluten (Rye, Wheat)", ...},
     "contains": [("Milk", []), ("Cereals with Gluten", ["Rye", "Wheat"])], "may": [...],     # the "Dietary Information" lines
     "ids": (data-all-labels, data-no-may-labels), "recipe_id": "78260", "ingredients": "<the dish's ingredient text>"}

What the page prints about nutrition: ONE number per dish, the calories "(437 kcal)" beside the name (five copies of it on the page:
the food-print copy, the desktop row, the mobile row and the data-calories attribute of every copy). There is no nutrition table,
not even a hidden one: the words protein, carbohydrate, fat, saturates, sugars, fibre, salt-as-a-nutrient and kJ do not occur
outside ingredient text. Nothing here converts, rounds or fills in a number.
"""
from __future__ import annotations
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402

STATE = {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}
# the 14 columns of the matrix, as the page names them
COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
           "Sulphur Dioxide/Sulphites", "Peanuts", "Tree Nuts", "Cereals with Gluten"]
KCAL = re.compile(r"^(\d+(?:,\d{3})*(?:\.\d+)?)\s*kcal$")
FILE_NAME = re.compile(r'<section class="k10-menus"[^>]*data-file-name="([^"]*)"')


def menu_tabs(page: str) -> list[tuple[str, str]]:
    """(menu name, menu id) for every entry of the page's menu selector, in order (the active one first on the default page)."""
    tabs = []
    for m in re.finditer(r'<span data-menu-identifier="([^"]+)" class="[^"]*"[^>]*>\s*<span[^>]*>\s*([^<]*?)\s*</span>', page, re.S):
        tabs.append((re.sub(r"\s+", " ", html.unescape(m.group(2))).strip(), m.group(1)))
    return tabs


def page_menu(page: str) -> tuple[str, str]:
    """(menu title from <title>, the file name the page names for itself)."""
    t = re.search(r"<title>(.*?)</title>", page, re.S)
    f = FILE_NAME.search(page)
    return (html.unescape(t.group(1)).strip() if t else ""), (f.group(1) if f else "")


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\xa0", " ").replace("ㅤ", " ")).strip()


def _kcal(node: tk.Node, where: str) -> str:
    spans = node.find_all("k10-primary-nutrient__item")
    if not spans:
        return ""
    if len(spans) != 1:
        raise ValueError(f"{where}: {len(spans)} calorie values on one dish")
    m = KCAL.match(spans[0].text())
    if not m:
        raise ValueError(f"{where}: unknown calorie text {spans[0].text()!r}")
    return tk.printed(m.group(1))


def _lines(card: tk.Node, where: str) -> dict:
    """The 'Dietary Information' block of a dish: {"contains": parts or None, "may": parts or None}."""
    out: dict = {"contains": None, "may": None}
    blocks = card.find_all("k10-recipe__label-names-wrapper")
    if len(blocks) > 1:
        raise ValueError(f"{where}: {len(blocks)} Dietary Information blocks")
    for block in blocks:
        for div in block.children:
            if not isinstance(div, tk.Node) or div.tag != "div":
                continue
            text = div.text()
            m = re.match(r"^(Contains|May contain):\s*(.*)$", text)
            if not m:
                raise ValueError(f"{where}: unknown Dietary Information line {text!r}")
            key = "contains" if m.group(1) == "Contains" else "may"
            if out[key] is not None:
                raise ValueError(f"{where}: two '{m.group(1)}' lines")
            out[key] = tk._parts(m.group(2))
    return out


def _cells(row: tk.Node, where: str) -> tuple[dict, dict]:
    states, popup = {}, {}
    cells = [c for c in row.find_all("k10-recipe__label") if c.attrs.get("data-label-name")]
    # (the food-print copy has an empty hidden label cell without a name; real cells carry data-label-id)
    cells = [c for c in cells if c.attrs.get("data-label-id")]
    names = [html.unescape(c.attrs["data-label-name"]) for c in cells]
    if names != COLUMNS:
        raise ValueError(f"{where}: allergen columns are {names}, expected {COLUMNS}: the matrix layout changed")
    for c in cells:
        name = html.unescape(c.attrs["data-label-name"])
        marks = [n.attrs.get("data-label-name") for n in c.iter() if n.attrs.get("data-label-name") in STATE]
        if len(marks) != 1:
            raise ValueError(f"{where}: column {name} has {len(marks)} marks")
        states[name] = STATE[marks[0]]
    # the pop-ups ("Contains Milk", "May contain Eggs") follow their cell as siblings, keyed by the cell's popover guid
    pops = {p.attrs.get("data-k10-popover-guid"): p.text() for p in row.find_all("k10-popover")}
    for c in cells:
        icon = next((n for n in c.iter() if n.attrs.get("data-k10-popover-guid")), None)
        guid = icon.attrs["data-k10-popover-guid"] if icon else None
        name = html.unescape(c.attrs["data-label-name"])
        if guid in pops:
            popup[name] = _clean(pops[guid])
    return states, popup


def _ids(node: tk.Node) -> tuple[str, str, str, str]:
    a = node.attrs
    return (a.get("data-all-labels", ""), a.get("data-no-may-labels", ""), a.get("data-recipe-id", ""), a.get("data-calories", ""))


def read_dishes(text: str, menu: str) -> list[dict]:
    root = tk.parse_html(text)
    desktop = root.find("k10-all-courses_desktop")
    mobile = root.find("k10-all-courses_mobile")
    if desktop is None or mobile is None:
        raise ValueError("the page has no desktop/mobile k10-all-courses blocks: the Ten Kites layout changed")
    rows = []
    for course in desktop.find_all("k10-course"):
        head = course.find("k10-course__name")
        section = _clean(head.text()) if head is not None else ""
        if not section:
            raise ValueError("a menu section without a name")
        for wrap in course.find_all("k10-recipe__wrapper"):
            info = [c for c in wrap.children if isinstance(c, tk.Node) and c.has("k10-w-recipe__info") and c.has("k10-recipe_menu-item")]
            cards = [c for c in wrap.children if isinstance(c, tk.Node) and c.has("k10-recipe-card")]
            if len(info) != 1 or len(cards) != 1:
                raise ValueError(f"{section}: a dish with {len(info)} rows / {len(cards)} cards")
            row, card = info[0], cards[0]
            names = row.find_all("k10-w-recipe__name")
            if len(names) != 1:
                raise ValueError(f"{section}: a dish with {len(names)} names")
            name = _clean(names[0].text())
            where = f"{menu} > {section} > {name}"
            states, popup = _cells(row, where)
            # all copies of the calories on the dish: row text, data-calories on the row and its card
            kcal = _kcal(row, where)
            attrs = {_ids(row), _ids(card)}
            ids = {(a[0], a[1], a[2]) for a in attrs}
            cal_attr = {a[3] for a in attrs}
            if len(ids) != 1 or len(cal_attr) != 1:
                raise ValueError(f"{where}: the row and its card disagree on labels / recipe id / data-calories: {attrs}")
            ingredients = _clean(" ".join(w.text() for w in card.find_all("k10-recipe__ingredients-wrapper")))
            rows.append({"menu": menu, "section": section, "name": name, "kcal": kcal, "cal_attr": cal_attr.pop(), "states": states,
                         "popup": popup, "ids": next(iter(ids))[:2], "recipe_id": next(iter(ids))[2], "ingredients": ingredients,
                         **_lines(card, where)})
    # the mobile block lists the same dishes again: compare name, calories and the two allergen lines, in order
    mrows = []
    for wrap in mobile.find_all("k10-l-grid__item"):
        names = wrap.find_all("k10-w-recipe__name")
        if len(names) != 1:
            continue
        mrows.append((_clean(names[0].text()), _kcal(wrap, "mobile row"), [d.text() for d in wrap.find_all("k10-recipe__label-name")]))
    if len(mrows) != len(rows):
        raise ValueError(f"the mobile block lists {len(mrows)} dishes, the desktop block {len(rows)}")
    for r, (mname, mkcal, mlines) in zip(rows, mrows):
        if mname != r["name"] or mkcal != r["kcal"]:
            raise ValueError(f"{r['menu']} > {r['name']}: the mobile copy prints {mname!r} ({mkcal} kcal), the desktop copy {r['kcal']!r}")
        r["mobile_lines"] = mlines
    return rows


def sha256(path: Path) -> str:
    return tk.sha256_text_file(path)
