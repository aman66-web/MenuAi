"""Reader for Flight Club's menu pages on menus.tenkites.com ("Red Engine" template of Ten Kites). Standard library only.

https://menus.tenkites.com/redengine/flightclub is the "allergen tool" that flightclubdarts.com/uk/faqs links to. One menu tab per
page (the same address with ?mguid=<menu id>; the ids are in the tab bar). Each dish is printed in four places on a page and all
four are read and must agree, or the run stops:

  * the dish row (desktop): 14 allergen columns (yes / may / no), 4 diet columns (Halaal, Kosher, Vegan, Vegetarian) and seven
    nutrient cells that the page's own column header names (Energy kCal ... Salt). The cells are in the markup and the page hides
    the columns with CSS, so they are NOT used as a source: they are only compared with the card;
  * the dish's card, opened with the arrow beside the dish name ("Nutrition values per serving", a visible control): the numbers
    used, plus the "Dietary Information" box ("Suitable for:", "Contains:", "May contain:");
  * the same card for narrow screens (mobile), opened with its own arrow: a row per nutrient;
  * the attributes the page's own allergen filter reads (data-all-labels, data-no-may-labels, data-calories).

read_page() returns records in the shape tenkites_b.py uses for its "table" layout, so tenkites_b.allergens_from_rec,
collect_rows and make_items can be used on them. Nothing is converted, rounded or filled in.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as b  # noqa: E402

STATES = {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}
CARD_TITLE = "Nutrition values per serving"
HEADERS = ["Energy (kCal)", "Protein (g)", "Carb (g)", "of which Sugars (g)", "Fat (g)", "Sat Fat (g)", "Salt (g)"]
# the diet columns are printed with the allergen columns but are not allergens
b.NOT_ALLERGENS |= {"halaal", "kosher"}


NONE_TEXT = "This dish contains none of the listed allergens"


def _suitable(box) -> str:
    """The 'Suitable for: Vegan, Vegetarian' line of a dietary box ('' when absent)."""
    for line in [c for c in box.children if isinstance(c, b.Node)] if box is not None else []:
        t = b._clean(line.text())
        if t.lower().startswith("suitable for"):
            return t.partition(":")[2].strip()
    return ""


def _card(node: b.Node, where: str) -> dict:
    """{printed nutrient name: printed value} from a 'Nutrition values per serving' block (two layouts: a header row and a
    value row for desktop, a row per nutrient for mobile)."""
    title = node.find("k10-recipe__nutrients-title")
    if title is None or b._clean(title.text()) != CARD_TITLE:
        raise SystemExit(f"{where}: nutrition block is not titled {CARD_TITLE!r}")
    table = node.find("k10-recipe__nutrients-table")
    if table is None:
        raise SystemExit(f"{where}: no nutrition table")
    rows = table.find_all("k10-recipe__nutrients-table-row")
    out: dict[str, str] = {}
    if len(rows) == 2:
        names = [b._clean(s.text()) for s in rows[0].find_all("k10-recipe__nutrient-name")]
        vals = [b._clean(s.text()) for s in rows[1].find_all("k10-recipe__nutrient-value")]
        if len(names) != len(vals):
            raise SystemExit(f"{where}: {len(names)} nutrient names but {len(vals)} values")
        pairs = list(zip(names, vals))
    else:
        pairs = []
        for r in rows:
            n = r.find_all("k10-recipe__nutrient-name")
            v = r.find_all("k10-recipe__nutrient-value")
            if len(n) != 1 or len(v) != 1:
                raise SystemExit(f"{where}: a nutrient row without exactly one name and one value")
            pairs.append((b._clean(n[0].text()), b._clean(v[0].text())))
    for n, v in pairs:
        if n in out:
            raise SystemExit(f"{where}: nutrient {n!r} listed twice")
        out[n] = v
    if list(out) != HEADERS:
        raise SystemExit(f"{where}: nutrient rows are {list(out)}, expected {HEADERS}")
    return out


def read_page(path: Path | str) -> tuple[str, list[dict]]:
    """(page title, records in page order)."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    if "k10-recipe__wrapper" not in text:
        raise SystemExit(f"{path}: not a Ten Kites table page (no dish rows)")
    root = b.parse_html(text)
    labels = b.page_labels(root)
    heads = [b._clean(n.text()) for n in root.find_all("k10-course__header_nutrients")]
    # the page prints its nutrient column header once at the top and again for every section: they must all be the same list
    if not heads or len(heads) % len(HEADERS) or heads != HEADERS * (len(heads) // len(HEADERS)):
        raise SystemExit(f"{path}: nutrient column headers are {heads[:9]}, expected {HEADERS}")
    # mobile cards, in page order
    mobile = [n for n in root.find_all("k10-recipe-card") if n.has("k10-recipe_mobile")]
    wrappers = root.find_all("k10-recipe__wrapper")
    if len(mobile) != len(wrappers):
        raise SystemExit(f"{path}: {len(wrappers)} dish rows but {len(mobile)} mobile cards")
    recs = []
    for w, mcard in zip(wrappers, mobile):
        rows = w.find_all("k10-w-recipe__name")
        # first hit is the name in the dish row (the optional kcal in brackets sits in a sibling span)
        if not rows:
            raise SystemExit(f"{path}: a dish row without a name")
        name = b._clean(rows[0].text())
        where = f"{Path(path).name} {name}"
        info = w.find("k10-w-recipe__info")
        if info is None or "data-guid" not in info.attrs:
            raise SystemExit(f"{where}: no recipe element with a guid")
        guid = info.attrs["data-guid"]
        if mcard.attrs.get("data-guid") != guid:
            raise SystemExit(f"{where}: the mobile card at this position belongs to guid {mcard.attrs.get('data-guid')}, not {guid}")
        # desktop card
        nutrients = _card(w, where)
        # mobile copy must agree
        mob = _card(mcard, where + " (mobile card)")
        if mob != nutrients:
            raise SystemExit(f"{where}: desktop card {nutrients} and mobile card {mob} disagree")
        # the row's own seven cells (hidden by the page's CSS; used only as a cross-check)
        cells = [b._clean(c.text()) for c in info.find_all("k10-recipe__label_nutrient")]
        if cells != list(nutrients.values()):
            raise SystemExit(f"{where}: row cells {cells} and card {list(nutrients.values())} disagree")
        # the energy the page's filter attribute carries must be the card's kcal
        cal_attr = info.attrs.get("data-calories", "")
        kcal = nutrients["Energy (kCal)"]
        if cal_attr.strip() == kcal.strip():   # the same text ("1,343", or "-" when the dish has no numbers)
            ok = True
        else:
            try:
                ok = abs(float(cal_attr.replace(",", "")) - float(kcal.replace(",", ""))) <= 1
            except ValueError:
                ok = False
        if not ok:
            raise SystemExit(f"{where}: data-calories={cal_attr!r} but the card prints {kcal!r} kcal")
        # allergen / diet columns
        marks: dict[str, str] = {}
        diet: dict[str, str] = {}
        for col in info.find_all("k10-recipe__label", attr="data-label-id"):
            state = [c for c in col.iter() if c is not col and "data-label-name" in c.attrs]
            if len(state) != 1:
                raise SystemExit(f"{where}: label column {col.attrs.get('data-label-name')!r} without exactly one state")
            lname = b._clean(col.attrs.get("data-label-name", ""))
            st = STATES[state[0].attrs["data-label-name"]]
            if lname.lower() in ("halaal", "kosher", "vegan", "vegetarian"):
                diet[lname] = st
            else:
                if lname in marks:
                    raise SystemExit(f"{where}: label column {lname!r} printed twice")
                marks[lname] = st
        box = w.find("k10-recipe__label-names-wrapper")
        if len(w.find_all("k10-recipe__label-names-wrapper")) > 1 or len(w.find_all("k10-recipe__nutrients-table")) != 1:
            raise SystemExit(f"{where}: more than one dietary box or nutrition table in a dish row: the page layout changed")
        lines = b._dietary_lines(box)  # raises on a line heading it does not know
        mbox = mcard.find("k10-recipe__label-names-wrapper")
        if (box is None) != (mbox is None):
            raise SystemExit(f"{where}: the dietary box is on only one of the desktop and mobile cards")
        if box is None:
            # a dish with no dietary box says so in words on both cards: that is the page's own "no allergens" statement
            if NONE_TEXT not in w.text() or NONE_TEXT not in mcard.text():
                raise SystemExit(f"{where}: no dietary box and no {NONE_TEXT!r} statement: allergens not readable")
        else:
            if NONE_TEXT in w.text() or NONE_TEXT in mcard.text():
                raise SystemExit(f"{where}: a dietary box and a {NONE_TEXT!r} statement on the same dish")
            if b._dietary_lines(mbox) != lines or _suitable(mbox) != _suitable(box):
                raise SystemExit(f"{where}: dietary box differs between the desktop and mobile cards")
        suitable = _suitable(box)
        # the diet columns and the "Suitable for" line must agree
        printed_diet = {x.strip().lower() for x in suitable.split(",") if x.strip()}
        col_diet = {k.lower() for k, v in diet.items() if v == "yes"}
        if printed_diet != col_diet:
            raise SystemExit(f"{where}: diet columns {sorted(col_diet)} and 'Suitable for: {suitable}' disagree")
        desc = w.find("k10-recipe__desc")
        # the "Allergens by ingredient / sub-recipe" list under the dish: the chain's own names for what goes into it
        ingredients = "; ".join(b._clean(n.text()) for n in w.find_all("k10-recipe__ingredient-name"))
        recs.append({
            "name": name, "desc": b._clean(desc.text()) if desc else "", "course": b.course_path(w), "nutrients": nutrients,
            "yes_labels": [k for k, v in diet.items() if v == "yes"], "diet": diet, "recipe_id": info.attrs.get("data-recipe-id", ""),
            "guid": guid, "group": "", "sub": "", "ingredients": ingredients,
            "has_dietary_box": box is not None,
            "allergen_src": {"marks": marks, "marks_all": True, **lines, **b._label_ids(info)},
            "label_map": labels,
        })
    m = re.search(r"<title>([^<]*)</title>", text)
    return (b._clean(m.group(1)) if m else ""), recs


if __name__ == "__main__":
    for f in sys.argv[1:]:
        title, recs = read_page(f)
        print(f"# {f}: {title!r}: {len(recs)} dishes")
        for r in recs:
            print(" > ".join(r["course"]), "|", r["name"], "|", list(r["nutrients"].values()), "|", r["yes_labels"])
