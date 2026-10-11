"""Reader for Cosy Club's menu pages on Ten Kites (https://menus.tenkites.com/loungers/cosyclubss26 and its sister pages),
standard library only.

Cosy Club (a Loungers brand) embeds one of these pages in each venue's menu page (the venue's "menu" record on the chain's own
site carries the address in its `tenkites_menu` field). The layout is Ten Kites' "build your own" list with a pop-up per dish
(newer than the Lounge pages read by loungers_pages.py): every dish is a `k10-byo__item` holding

    - the line shown on the menu: name (k10-byo-item__name), "<n> kcal" (k10-primary-nutrient__item), description;
    - its pop-up (k10-recipe-modal): the name again, the same "<n> kcal", "Suitable for:", "Contains:" and "May contain:" lines,
      and a "Nutrition (per portion)" table (Energy (kCal) only).

Dishes offered as add-ons to another dish ("Add: Smoked Salmon" under Smashed Avocado) sit in a sub-section
(k10-byo__section_sub_l1) under a heading (k10-byo__section-name): they are returned with role "option" and that heading as
`group`; the dish they belong to is the last plain dish before them ("base"). One URL per menu: ?mguid=<menu id>, the ids
being listed in the page's own menu selector.

CALORIES ARE HIDDEN BY DEFAULT behind the toolbar switch "Hide Calories" (Yes / No, starting on Yes), exactly as on the Lounge
pages (loungers_pages.toggle_info reads it); the figures are in the page's HTML all along.

Each dish is returned in the same shape as loungers_pages.read_dishes() so that loungers_pages.calories() and
tenkites_c.allergens_checked() can be used unchanged:

    {"menu", "section", "subsection", "role": "dish" | "base" | "option", "group", "name", "recipe_id", "energy": "1,055 kcal",
     "table": {"Energy (kCal)": "1,055"}, "desc", "suitable": [...], "contains": [...], "may": [...] or None,
     "label_ids": (all ids, contained ids), "filter": {id: name}}

The name and calories printed on the menu line must equal those in the pop-up, or the run stops. Nothing is converted, rounded
or filled in.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402

NONE_MSG = "This dish contains none of the listed allergens"


def _in_modal(node: "tk.Node", rec: "tk.Node") -> bool:
    a = node.parent
    while a is not None and a is not rec:
        if a.has("k10-recipe-modal"):
            return True
        a = a.parent
    return False


def _own(rec: "tk.Node", cls: str, modal: bool) -> list["tk.Node"]:
    """Descendants with class `cls` belonging to this dish (not to a dish nested in it), inside (modal=True) or outside its pop-up."""
    out = []
    for n in rec.find_all(cls):
        a = n.parent
        while a is not None and a is not rec and not (a.has("k10-byo__item") or a.has("k10-recipe_menu-item")):
            a = a.parent
        if a is rec and _in_modal(n, rec) == modal:
            out.append(n)
    return out


def _section_levels(rec: "tk.Node") -> list[str]:
    levels = []
    for a in tk._ancestors(rec):
        if a.has("k10-course"):
            h = next((c for c in a.children if isinstance(c, tk.Node) and c.has("k10-course__header")), None)
            n = h.find("k10-course__name") if h is not None else None
            levels.append(n.text() if n is not None else "")
    levels.reverse()
    return levels


def _group(rec: "tk.Node") -> str:
    """The heading of the add-on block an option sits in ('' for a plain dish)."""
    sec = next((a for a in tk._ancestors(rec) if a.has("k10-byo__section_sub_l1")), None)
    if sec is None:
        return ""
    parent = sec.parent
    kids = [c for c in parent.children if isinstance(c, tk.Node)]
    i = kids.index(sec)
    for c in reversed(kids[:i]):
        if c.has("k10-byo__section-name"):
            return c.text()
        if c.has("k10-byo__section"):
            break
    raise ValueError("an add-on block without a heading: the Ten Kites layout changed")


def read_dishes(text: str, menu: str) -> list[dict]:
    root = tk.parse_html(text)
    bodies = root.find_all("k10-all-courses")
    if len(bodies) != 1:
        raise ValueError(f"the page has {len(bodies)} k10-all-courses blocks: the Ten Kites layout changed")
    filt = tk.filter_labels(root)
    rows: list[dict] = []
    for rec in bodies[0].iter():
        if not (rec.has("k10-byo__item") or rec.has("k10-recipe_menu-item")):
            if "data-recipe-id" in rec.attrs and not rec.has("k10-recipe-modal"):
                raise ValueError(f"recipe {rec.attrs['data-recipe-id']}: an element of an unknown kind {rec.attrs.get('class')!r}")
            continue
        rid = rec.attrs.get("data-recipe-id", "")
        names = _own(rec, "k10-byo-item__name", False) + _own(rec, "k10-recipe__name", False)
        modals = [m for m in rec.find_all("k10-recipe-modal") if m.attrs.get("data-recipe-id") == rid]
        if len(names) != 1 or len(modals) != 1:
            raise ValueError(f"recipe {rid}: {len(names)} names and {len(modals)} pop-ups")
        name, modal = names[0].text(), modals[0]
        mname = modal.find("k10-recipe-modal__recipe-name")
        if mname is None or mname.text() != name:
            raise ValueError(f"{name}: the pop-up names the dish {mname.text() if mname else None!r}")
        line_energy = [n.text() for n in _own(rec, "k10-primary-nutrient__item", False)]
        modal_energy = [n.text() for n in modal.find_all("k10-primary-nutrient__item")]
        if len(line_energy) > 1 or line_energy != modal_energy:
            raise ValueError(f"{name}: the menu line shows {line_energy}, the pop-up {modal_energy}")
        vals: dict[str, str] = {}
        for tr in modal.find_all(tag="tr"):
            tds = tr.find_all(tag="td")
            if len(tds) != 2:
                raise ValueError(f"{name}: a nutrition row with {len(tds)} cells")
            if tds[0].text() in vals:
                raise ValueError(f"{name}: {tds[0].text()!r} printed twice")
            vals[tds[0].text()] = tk.printed(tds[1].text())
        levels = _section_levels(rec)
        if not levels or not levels[0] or len(levels) > 2:
            raise ValueError(f"{name}: unexpected menu section nesting {levels}")
        group = _group(rec)
        role = "option" if group else ("dish" if rec.has("k10-recipe_not-sub-byo") else "?")
        if role == "?":
            raise ValueError(f"{name}: neither a dish nor an add-on")
        suitable_sec = modal.find("k10-recipe-modal__section_suitable")
        suitable = []
        if suitable_sec is not None:
            v = suitable_sec.find("k10-recipe-modal__section-values")
            suitable = [s.strip() for s in (v.text() if v else "").split(",") if s.strip()]
        known = {"k10-recipe-modal__section_suitable", "k10-recipe-modal__section_contains", "k10-recipe-modal__section_may"}
        for sec in modal.find_all("k10-recipe-modal__section"):
            kinds = {c for c in sec.attrs.get("class", "").split() if c.startswith("k10-recipe-modal__section_")}
            if not kinds <= known:
                raise ValueError(f"{name}: unknown dietary section {sorted(kinds)}")
        contains = tk._modal_line(modal, "contains")
        may = tk._modal_line(modal, "may")
        if contains is None:
            # Ten Kites leaves an empty section out: no "Contains" line means none of the 14, but only when the page says so
            # ("none of the listed allergens") or prints a "May contain" line; allergens_checked() then compares with the label ids.
            if NONE_MSG not in modal.text() and may is None:
                raise ValueError(f"{name}: no 'Contains' line, no 'May contain' line and no 'none of the listed allergens' message")
            contains = []
        desc = _own(rec, "k10-byo-item__description", False) + _own(rec, "k10-recipe__desc", False)
        rows.append({"menu": menu, "section": levels[0], "subsection": levels[1] if len(levels) > 1 else "", "role": role,
                     "group": group, "name": name, "recipe_id": rid, "energy": line_energy[0] if line_energy else "",
                     "table": vals, "desc": desc[0].text() if desc else "", "suitable": suitable, "contains": contains, "may": may,
                     "label_ids": tk._label_ids(rec, rid), "filter": filt})
    # the plain dish an add-on block follows is its "base"
    for i, r in enumerate(rows):
        if r["role"] == "option":
            j = i - 1
            while j >= 0 and rows[j]["role"] == "option":
                j -= 1
            if j < 0:
                raise ValueError(f"{r['name']}: an add-on with no dish before it")
            rows[j]["role"] = "base"
            r["base"] = rows[j]["name"]
    return rows
