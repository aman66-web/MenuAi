"""Reader for Slim Chickens' own "Allergy and Dietary Information" menu pages on Ten Kites
(https://menus.tenkites.com/brg/slimscore?sitecode=...; the chain's menu page links to it as "Check the Dietary Information").

The pages are server-rendered. The menu is a list of "courses" (sections). Inside a course there are two kinds of dishes:

* plain items (sides, sauces, shakes, wraps ...): a ``div.k10-recipe_menu-item`` whose own pop-up (``div.k10-modal-perfect``) holds the
  full nutrition table (kJ, kcal, protein, carb, sugars, fat, sat fat, fibre, salt: one ``div.k10-recipe__nutrient-value`` per row,
  named by ``data-nutr-name``) and an allergen table (``Contain`` / ``May Contain`` columns, one row per allergen that applies);
* "build your own" items (tenders, wings, meals, sandwiches): a menu item whose pop-up lists the sizes as options. The options carry
  the same data as a JSON attribute ``data-recipe`` (``ntrs`` = the nutrition rows with the printed ``Val``; ``lbls`` = the allergen and
  diet labels with ``Value`` yes / maybe). The page's script shows these very values when the item is ticked (checked in Chromium).
  The sauces offered inside such a pop-up are repeated sauce options (``k10-recipe_sub-byo``) and are not read here: the "HOUSE SAUCES"
  course lists every sauce once, as a plain item.

Nothing here converts, rounds or fills a gap: values are returned as printed (strings) and a blank stays blank. Standard library only
(Python 3.9). Run python with -I when reading saved pages.
"""
from __future__ import annotations
import html
import json
import re
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.children, self.parent = tag, attrs or {}, [], parent

    @property
    def classes(self):
        return set((self.attrs.get("class") or "").split())

    def iter(self):
        yield self
        for c in self.children:
            if isinstance(c, Node):
                yield from c.iter()

    def find_all(self, cls):
        return [n for n in self.iter() if cls in n.classes]

    def text(self):
        out = []
        for c in self.children:
            out.append(c.text() if isinstance(c, Node) else c)
        return " ".join("".join(out).split())


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, {k: (v if v is not None else "") for k, v in attrs}, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        n = Node(tag, {k: (v if v is not None else "") for k, v in attrs}, self.cur)
        self.cur.children.append(n)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse(page: str) -> Node:
    b = _Builder()
    b.feed(page)
    return b.root


def _clean(s: str) -> str:
    return " ".join(s.replace("\xa0", " ").split())


def _ancestor_has_class(n: Node, cls: str, stop: Node) -> bool:
    p = n.parent
    while p is not None and p is not stop:
        if cls in p.classes:
            return True
        p = p.parent
    return False


def _name_of(item: Node) -> str:
    h3 = None
    for n in item.iter():
        if n.tag == "h3" and "k10-recipe__name" in n.classes:
            h3 = n
            break
    if h3 is None:
        raise SystemExit("a menu item has no name heading: the page layout changed")
    parts = [_clean(sp.text()) for sp in h3.iter() if "k10-recipe__name-value" in sp.classes]
    return " ".join(p for p in parts if p)


def _printed_kcal(item: Node) -> str:
    for n in item.iter():
        if "k10-recipe__nutrient_energy" in n.classes:
            m = re.search(r"\(\s*([\d,\.]+)\s*kcal\s*\)", _clean(n.text()))
            return m.group(1) if m else ""
    return ""


def _modal_rows(modal: Node):
    """Nutrition rows [(label, value)] and allergen rows [(name, contains?, may?)] of one plain item's pop-up."""
    nutr = []
    for n in modal.iter():
        if "k10-recipe__nutrient-value" in n.classes and "data-nutr-name" in n.attrs:
            nutr.append((_clean(n.attrs["data-nutr-name"]), _clean(n.text())))
    allergens = []
    tables = [n for n in modal.iter() if "k10-recipe__labels_allergens" in n.classes]
    for t in tables:
        for row in [r for r in t.iter() if "k10-modal-perfect__table-row" in r.classes]:
            name = ""
            yes = may = False
            for c in row.children:
                if not isinstance(c, Node):
                    continue
                if "k10-modal-perfect__table-name" in c.classes:
                    name = _clean(c.text())
                if "k10-recipe__label-value_yes" in c.classes and "k10-recipe__label-value_hidden" not in c.classes:
                    yes = True
                if "k10-recipe__label-value_may" in c.classes and "k10-recipe__label-value_hidden" not in c.classes:
                    may = True
            allergens.append((name, yes, may))
    return nutr, allergens, bool(tables)


def _recipe_json(root: Node) -> dict:
    """All data-recipe JSON objects of the page by id (the same recipe repeated must be identical)."""
    out = {}
    for n in root.iter():
        raw = n.attrs.get("data-recipe")
        if not raw:
            continue
        d = json.loads(raw)
        # the same recipe is repeated in every pop-up that offers it; only the id of the group it is offered in differs
        same = {k: v for k, v in d.items() if k not in ("subByoId", "subByoName")}
        if d["id"] in out and out[d["id"]][0] != same:
            raise SystemExit(f"recipe {d['id']} ({d['name']}) appears twice with different data")
        out[d["id"]] = (same, d)
    return {k: v[0] for k, v in out.items()}


def read_menu(page: str) -> list:
    """Every dish of the page, in page order:
    {"course", "course_prefix", "name", "kind" ("plain"|"byo"), "id", "printed_kcal", "nutrients": [(label, value)],
     "allergens": [(name, contains, may)], "labels": [(id, description, value)], "desc", "price"}"""
    root = parse(page)
    recipes = _recipe_json(root)
    out = []
    for course in root.find_all("k10-course"):
        name_el = [n for n in course.iter() if "k10-course__name-value" in n.classes]
        pre_el = [n for n in course.iter() if "k10-course__name-prefix" in n.classes]
        if not name_el:
            raise SystemExit("a course without a name: the page layout changed")
        cname = _clean(name_el[0].text())
        prefix = _clean(pre_el[0].text()) if pre_el else ""
        for item in course.find_all("k10-recipe_menu-item"):
            rid = item.attrs.get("data-recipe-id", "")
            nm = _name_of(item)
            entry = {"course": cname, "course_prefix": prefix, "name": nm, "id": rid, "printed_kcal": _printed_kcal(item),
                     "nutrients": [], "allergens": [], "labels": [], "desc": "", "price": "", "kind": "plain"}
            if rid in recipes:                      # build-your-own style item: the data is the recipe JSON
                d = recipes[rid]
                entry["kind"] = "byo"
                entry["desc"] = _clean(d.get("desc", ""))
                entry["price"] = d.get("price", "")
                entry["nutrients"] = [(_clean(x["Name"]) + " (" + x["Uom"] + ")", x["Val"]) for x in d["ntrs"]]
                entry["labels"] = [(x["Id"], x["Description"], x["Value"]) for x in d["lbls"]]
                entry["recipe_name"] = d["name"]
            else:
                modals = [n for n in item.iter() if "k10-modal-perfect" in n.classes]
                if len(modals) != 1:
                    raise SystemExit(f"{cname} / {nm}: expected one pop-up, found {len(modals)}")
                nutr, allergens, has_table = _modal_rows(modals[0])
                if not nutr:
                    raise SystemExit(f"{cname} / {nm}: pop-up without a nutrition table")
                entry["nutrients"] = nutr
                entry["allergens"] = allergens
                entry["has_allergen_table"] = has_table
                entry["data_labels"] = item.attrs.get("data-labels", "")
                entry["all_labels"] = item.attrs.get("data-all-labels", "")
                entry["no_may_labels"] = item.attrs.get("data-no-may-labels", "")
                entry["suitable"] = " ".join(_clean(n.text()) for n in modals[0].iter() if "k10-recipe__labels_suitableFor" in n.classes)
            out.append(entry)
    return out
