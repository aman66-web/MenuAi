"""Reader for Rosa's Thai's allergen pages (a 10kites page, https://viewthe.menu/dy2v, one menu per ?mguid=<menu id>).

Standard library only; builds on the HTML tree of tenkites_b.py. The pages are the "table" layout of Cote / Giggling Squid, but
with ONE difference that tenkites_b._read_table cannot read: the dish rows print calories only ("(1,195 kcal)" beside the name,
no nutrient columns), and each dish's hidden info card carries a column per INGREDIENT, so the whole wrapper cannot be read at
once. Each dish is therefore read from its own desktop row (names, calories, the 14 allergen columns, label ids) and its own
info card ("Contains:" / "May contain:" lines, description, ingredient text).

A record is one printed dish row:

    {"menu", "course": [section names, outermost first], "kind": "item" | "root" | "option" | "heading",
     "name", "parent" (the root's name for kind "option"), "kcal" (as printed, thousands comma dropped) or "",
     "recipe_id", "key" (recipe id + byo ids), "marks" {label name: yes|may|no}, "ids_all", "ids_no_may",
     "contains", "may" (the card's printed lines), "desc", "ingredients", "vegetarian", "vegan"}

Kinds: "item" a stand-alone dish; "root" the main row of a "build your own" block that carries its own calories (its
siblings are separate dishes); "heading" a block's main row that prints no calories (its options carry the calories);
"option" a dish printed under "Choose from:" below a heading.

Nothing here converts, rounds or estimates: the calories are the page's own text. The page is read twice, as the desktop
and as the mobile copy of the same menu, and the two must agree on every dish, calorie value and allergen column.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tb  # noqa: E402

Node = tb.Node
clean = tb._clean

# The 14 allergen columns and the other label columns the page prints (spice and "new" flags, diets). Any other label
# name stops the run, so a new column can't be skipped silently.
ALLERGEN_COLUMNS = ["Tree Nuts", "Cereals with Gluten", "Peanuts", "Celery", "Mustard", "Eggs", "Milk", "Sesame Seeds", "Fish",
                    "Crustaceans", "Molluscs", "Soya", "Sulphites", "Lupin"]
OTHER_COLUMNS = ["Can be spicy", "Definitely spicy", "Thai spicy", "New Dish", "New Recipe", "Vegetarian", "Vegan", "New"]
STATE = {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}
# label names that are flags, not allergens or diets (kept out of the label list handed to tenkites_b's allergen reader)
FLAG_LABELS = {"Can be spicy", "Definitely spicy", "Thai spicy", "New Dish", "New Recipe", "New"}


def menus_on_page(text: str) -> List[tuple]:
    """[(menu guid, printed name)] from the page's own menu drop-down, in its order."""
    out = []
    for m in re.finditer(r'data-menu-identifier="([0-9a-f-]{36})" class="k10-menu-selector__option-name[^>]*data-index="(\d+)">\s*'
                         r'<span[^>]*>\s*([^<]+?)\s*</span>', text):
        out.append((m.group(1), clean(re.sub(r"&#39;", "'", m.group(3)))))
    return out


def _kcal(node: Node, where: str) -> str:
    attr = node.attrs.get("data-calories", "").strip()
    shown = node.find("k10-primary-nutrient__item")
    txt = clean(shown.text()) if shown else ""
    m = re.fullmatch(r"([\d,]+(?:\.\d+)?) kcal", txt) if txt else None
    if txt and not m:
        raise SystemExit(f"{where}: calories printed as {txt!r}, not 'N kcal': the page format changed")
    printed = m.group(1).replace(",", "") if m else ""
    if attr.replace(",", "") != printed and not (attr == "-" and not printed):  # "-" = the page prints no calories
        raise SystemExit(f"{where}: data-calories {attr!r} disagrees with the printed {txt!r}")
    return printed


def _marks(node: Node, where: str) -> Dict[str, str]:
    """{label name: yes|may|no} from the dish row's own label columns (not the info card's ingredient columns)."""
    marks: Dict[str, str] = {}
    for col in node.find_all("k10-recipe__label", attr="data-label-id"):
        state = [c.attrs["data-label-name"] for c in col.iter() if c is not col and c.attrs.get("data-label-name", "").startswith("LabelValue")]
        name = clean(col.attrs.get("data-label-name", ""))
        if len(state) != 1:
            raise SystemExit(f"{where}: label column {name!r} has {len(state)} states")
        if name not in ALLERGEN_COLUMNS and name not in OTHER_COLUMNS:
            raise SystemExit(f"{where}: unknown label column {name!r}: classify it in ALLERGEN_COLUMNS / OTHER_COLUMNS after reading the page")
        if name in marks:
            raise SystemExit(f"{where}: label column {name!r} printed twice")
        marks[name] = STATE[state[0]]
    if set(marks) != set(ALLERGEN_COLUMNS) | set(OTHER_COLUMNS):
        raise SystemExit(f"{where}: label columns are {sorted(marks)}")
    return marks


def _lines(card: Optional[Node], where: str) -> Dict[str, str]:
    out = {"contains": "", "may": "", "suitable": ""}
    wrap = card.find("k10-recipe__label-names-wrapper") if card is not None else None
    if wrap is None:
        return out
    for line in [c for c in wrap.children if isinstance(c, Node)]:
        txt = clean(line.text())
        if not txt:
            continue
        head, sep, rest = txt.partition(":")
        slot = {"contains": "contains", "may contain": "may", "suitable for": "suitable"}.get(head.strip().lower()) if sep else None
        if slot is None:
            raise SystemExit(f"{where}: dietary line {txt!r} not known")
        if out[slot]:
            raise SystemExit(f"{where}: two {slot!r} lines")
        out[slot] = rest.strip()
    return out


def _dish_nodes(root: Node, view: str) -> List[Node]:
    """The dish rows of one view ('desktop' or 'mobile'), in page order: not the info cards, not the hidden 'foodprint' copies."""
    out = []
    for n in root.iter():
        if "data-recipe-id" not in n.attrs or not n.has(f"k10-recipe_{view}") or n.has("k10-recipe-card"):
            continue
        if not (n.has("k10-recipe_menu-item") or n.has("k10-byo-item")):
            continue
        if any(a.has("k10-recipe__foodprint") for a in n.ancestors()):
            continue
        out.append(n)
    return out


def _read_view(root: Node, view: str, menu: str) -> List[dict]:
    recs = []
    for n in _dish_nodes(root, view):
        sibs = [c for c in n.parent.children if isinstance(c, Node)]
        i = next(k for k, c in enumerate(sibs) if c is n)
        card = sibs[i + 1] if i + 1 < len(sibs) else None  # each dish row is followed by its own hidden info card
        if card is None or not card.has("k10-recipe-card") or card.attrs.get("data-guid") != n.attrs.get("data-guid"):
            raise SystemExit(f"{menu}: a dish row is not followed by its own info card")
        namenode = n.find("k10-w-recipe__name") or n.find("k10-w-byo-sub-item__name")
        if namenode is None:
            raise SystemExit(f"{menu}: a dish row without a name")
        name = clean(namenode.text())
        where = f"{menu} / {name}"
        kcal = _kcal(n, where)
        if n.has("k10-byo-item__sub"):
            kind = "option"
        elif n.has("k10-recipe_byo"):
            kind = "root" if kcal else "heading"
        else:
            kind = "item"  # kcal may be '' (the page prints no calories for some drinks): the chain script lists those as not published
        marks = _marks(n, where) if view == "desktop" else {}  # the mobile copy prints names and calories only
        lines = _lines(card, where)
        suitable = sorted(x.strip() for x in lines["suitable"].split(",") if x.strip())
        if view == "desktop":
            yes_other = sorted(c for c in OTHER_COLUMNS if marks[c] == "yes")
            # the card's "Suitable for:" line names the diet / spice columns the row ticks (it leaves out the 'new' flags)
            if [x for x in suitable if x not in yes_other] or [d for d in ("Vegetarian", "Vegan") if (marks[d] == "yes") != (d in suitable)]:
                raise SystemExit(f"{where}: 'Suitable for' line {suitable} disagrees with the ticked columns {yes_other}")
        ids_all = [x.strip() for x in n.attrs.get("data-all-labels", "").split(",") if x.strip()]
        ids_no_may = [x.strip() for x in n.attrs.get("data-no-may-labels", "").split(",") if x.strip()]
        desc = card.find("k10-recipe__desc")
        ingr = card.find("k10-recipe__ingredients-wrapper")
        recs.append({
            "menu": menu, "course": tb.course_path(n), "kind": kind, "name": name, "parent": "", "kcal": kcal,
            "recipe_id": n.attrs["data-recipe-id"],
            "key": f"{n.attrs['data-recipe-id']}/{n.attrs.get('data-byo-id', '')}/{n.attrs.get('data-sub-byo-id', '')}",
            "marks": marks, "ids_all": ids_all, "ids_no_may": ids_no_may, "contains": lines["contains"], "may": lines["may"],
            "desc": clean(desc.text()) if desc else "", "ingredients": clean(ingr.text()) if ingr else "",
            "vegetarian": marks.get("Vegetarian") == "yes", "vegan": marks.get("Vegan") == "yes",
        })
    # An option belongs to the nearest heading before it in the same section (the page prints "Choose from:" under it). A heading
    # that has no options of its own is followed directly by "root" rows (the page prints them as the heading's choices, e.g.
    # "Tom Yum Noodle Soup" then "Veg & Tofu", "Chicken", "Prawns"): those rows get the heading as their parent too.
    last_heading: Dict[tuple, str] = {}
    open_heading = ""  # a heading seen directly before this row with no option yet
    for r in recs:
        sec = tuple(r["course"])
        if r["kind"] == "heading":
            last_heading[sec] = r["name"]
            open_heading = r["name"]
            continue
        if r["kind"] == "option":
            r["parent"] = last_heading.get(sec, "")
            open_heading = ""
        elif r["kind"] == "root" and open_heading:
            r["parent"] = open_heading
        else:
            open_heading = ""
    return recs


def read_page(path: Path, menu: str) -> List[dict]:
    """Records of one saved menu page (desktop view), after checking the mobile copy says the same thing. Each record also
    carries `allergen_src` and `label_map` in the form tenkites_b.allergens_from_rec() reads (three printed forms of the same
    allergens: the 14 columns, the card's Contains / May contain lines, and the label ids)."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    root = tb.parse_html(text)
    desktop = _read_view(root, "desktop", menu)
    mobile = _read_view(root, "mobile", menu)
    sig = lambda r: (r["recipe_id"], r["name"], r["kcal"], r["kind"], r["contains"], r["may"], r["desc"], r["ingredients"])  # noqa: E731
    if [sig(r) for r in desktop] != [sig(r) for r in mobile]:
        raise SystemExit(f"{menu}: the desktop and mobile copies of the page disagree")
    labels = {i: n for i, n in tb.page_labels(root).items() if n not in FLAG_LABELS}
    for r in desktop:
        r["label_map"] = labels
        r["allergen_src"] = {"marks": {k: v for k, v in r["marks"].items() if k in ALLERGEN_COLUMNS}, "marks_all": True,
                             "contains": r["contains"], "may": r["may"], "ids_all": r["ids_all"], "ids_no_may": r["ids_no_may"]}
    return desktop


if __name__ == "__main__":
    for r in read_page(Path(sys.argv[1]), sys.argv[1]):
        print(" > ".join(r["course"]), "|", r["kind"], "|", r["parent"], "|", r["name"], "|", r["kcal"], "|", r["key"])
