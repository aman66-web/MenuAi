"""Reader for The Restaurant Hub's own allergy and nutrition page on Ten Kites
(https://menus.tenkites.com/brg/therestauranthub, linked from therestauranthub.co.uk as "Allergens & Nutrition").

The page has one tab per brand sold in the hubs (?mguid=<tab id>). Two kinds of dishes appear on a tab:

* plain dishes: a pop-up card with a "Nutrition (per portion)" table and "Contains / May contain" lines (read by
  tenkites_c.read_modal_layout);
* "build your own" dishes (Slim Chickens' tenders, wings, sandwiches, salads; Caffe Carluccio's coffees with a milk choice):
  one card per group whose first-level options are the dishes (4 / 5 / 7 Tenders ...) and whose deeper options are the sauces or
  milks to add. The page embeds each option's figures and allergen labels as JSON (``data-recipe``); the page's script shows these
  very values when the option is ticked. Only the first-level options (the `k10-byo__section_root` section) are dishes; they are
  read here with the same label ids the page's allergen filter uses, so tenkites_c.allergens_checked can cross-check them.

Nothing here converts, rounds or fills a gap: values are returned as printed (strings). Standard library only (Python 3.9).
Run python with -I when reading saved pages.
"""
from __future__ import annotations
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402


def diet_ids(root: "tk.Node") -> dict:
    """The label ids the page's own "Show me" filter uses for Vegetarian / Vegan: {id: 'vegetarian'|'vegan'}."""
    out = {}
    for n in root.iter():
        i, name = n.attrs.get("data-label-id"), n.attrs.get("data-label-name")
        if i and name and name.strip().lower() in ("vegetarian", "vegan"):
            out[i] = name.strip().lower()
    return out


def _byo_nutrients(j: dict) -> dict:
    vals = {}
    for x in j.get("ntrs", []):
        uom = {"kcal": "kCal"}.get(x["Uom"], x["Uom"])
        key = f'{x["Name"].strip()} ({uom})'
        if key in vals:
            raise SystemExit(f"{j['name']}: nutrition row {key!r} twice")
        vals[key] = tk.printed(x["Val"])
    return vals


def read_tab(text: str) -> list:
    """Every dish of one tab, in page order:
    {"section", "name", "kind" ('plain'|'byo'), "nutrients" {printed label: value}, "basis", "desc", "diet" (set of 'vegetarian'/'vegan'),
     "contains", "may" (parts as tenkites_c), "label_ids", "filter", "recipe_id", "group" (the BYO group's own name)}."""
    root = tk.parse_html(text)
    ids = diet_ids(root)
    out = []
    for r in tk.read_modal_layout(text):
        if r["group"] or r["choice"]:
            raise SystemExit(f"{r['dish']}: a plain pop-up with choices ({r['group']!r}/{r['choice']!r}): the page layout changed")
        diet = {w.strip().lower() for w in r["suitable"].replace("Suitable for:", "").split(",") if w.strip()}
        if diet - {"vegetarian", "vegan"}:
            raise SystemExit(f"{r['dish']}: unknown 'Suitable for' words {sorted(diet)}")
        out.append({"section": r["section"], "name": r["dish"], "kind": "plain", "nutrients": r["nutrients"], "basis": r["per"],
                    "desc": r["desc"], "diet": diet, "contains": r["contains"], "may": r["may"], "label_ids": r["label_ids"],
                    "filter": r["filter"], "recipe_id": r["recipe_id"], "group": ""})
    body = root.find("k10-all-courses")
    filt = tk.filter_labels(root)
    for top in body.iter():
        if not (top.has("k10-recipe") and top.has("k10-byo")):
            continue
        if any(a.has("k10-recipe") for a in tk._ancestors(top)):
            continue  # an option inside a group: handled with its group
        gname = top.find("k10-byo__name")
        group = gname.text() if gname is not None else ""
        sections = top.find_all("k10-byo__section_root")
        if len(sections) != 1:
            raise SystemExit(f"{group!r}: expected one root option list, found {len(sections)}: the page layout changed")
        for item in sections[0].children:
            if not hasattr(item, "attrs"):
                continue
            raw = item.attrs.get("data-recipe")
            if not raw:
                raise SystemExit(f"{group!r}: a root option without dish data: the page layout changed")
            try:
                j = json.loads(raw)
            except ValueError:
                j = json.loads(html.unescape(raw))
            lab_ids = tk._label_ids(item)
            diet = {ids[i] for i in (item.attrs.get("data-labels", "").split(",")) if i in ids}
            out.append({"section": tk._course_section(top), "name": j["name"].strip(), "kind": "byo", "nutrients": _byo_nutrients(j),
                        "basis": "Nutrition (per portion)", "desc": j.get("desc", ""), "diet": diet,
                        "contains": tk._json_parts(j, "yes"), "may": tk._json_parts(j, "maybe"), "label_ids": lab_ids,
                        "filter": filt, "recipe_id": str(j.get("id", "")), "group": group})
    return out


if __name__ == "__main__":   # inspection: python3 -I the_restaurant_hub_pages.py tab.html
    for f in sys.argv[1:]:
        rows = read_tab(Path(f).read_text(encoding="utf-8"))
        print(f"# {f}: {len(rows)} dishes")
        for r in rows:
            n = r["nutrients"]
            print("\t".join([r["kind"], r["section"], r["group"], r["name"], n.get("Energy (kCal)", ""), n.get("Protein (g)", ""),
                             n.get("Carb (g)", ""), n.get("Fat (g)", ""), "/".join(sorted(r["diet"]))]))
