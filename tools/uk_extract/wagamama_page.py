"""Reader for Wagamama UK's menu page (https://www.wagamama.com/menu).

The page is a Nuxt site: the whole menu, with each item's nutrition per serving and per 100g, is embedded in the HTML as a
`<script id="__NUXT_DATA__">` JSON payload in "devalue" format (a flat list in which objects refer to each other by index).
This module resolves those references and walks menu -> sections -> recipes. It returns what the page prints, as strings:
nothing is converted, rounded or filled in.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

sys.setrecursionlimit(20000)

NUXT_RE = re.compile(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', re.S)
WRAPPERS = {"ShallowReactive", "Reactive", "Ref", "ShallowRef"}
MENU_KEY = "tenkites-menu-menu"


def _resolve(flat: list):
    cache: dict[int, object] = {}

    def res(i: int):
        if i in cache:
            return cache[i]
        x = flat[i]
        if isinstance(x, list):
            if len(x) == 2 and isinstance(x[0], str) and x[0] in WRAPPERS:
                out = res(x[1])
                cache[i] = out
                return out
            out: list = []
            cache[i] = out
            out.extend(None if j == -1 else res(j) if isinstance(j, int) else j for j in x)
            return out
        if isinstance(x, dict):
            out_d: dict = {}
            cache[i] = out_d
            for k, v in x.items():
                out_d[k] = None if v == -1 else res(v) if isinstance(v, int) else v
            return out_d
        cache[i] = x
        return x

    return res


def _walk(section: dict, path: tuple):
    here = path + (section["Name"],)
    for recipe in section.get("Recipes") or []:
        yield here, recipe
    for child in section.get("Sections") or []:
        yield from _walk(child, here)


def read_menu(html_path: Path) -> dict:
    """Return {"menu_name", "menu_modified", "recipes": [...]} with recipes in the page's reading order.

    Each recipe: section (tuple of section names), ident, name, orig_name, desc, modified, vegetarian, vegan,
    nutr ({printed nutrient label: per-serving string}), nutr_100g, sizes (number of size rows), servings,
    intols (the recipe's own allergen/dietary flags as the page carries them: [(id, "yes"|"maybe", [(child id, value)])]).
    "intol_names" maps every flag id the page defines to its printed name ("celery", "cereals containing gluten", "wheat"...).
    """
    html = Path(html_path).read_text(encoding="utf-8")
    m = NUXT_RE.search(html)
    if not m:
        raise SystemExit("No __NUXT_DATA__ payload in the page: the site changed, so the reader needs updating.")
    flat = json.loads(m.group(1))
    res = _resolve(flat)
    data = res(flat[1]["data"])
    if MENU_KEY not in data:
        raise SystemExit(f"The page has no '{MENU_KEY}' entry: the site changed, so the reader needs updating.")
    menu_root = data[MENU_KEY]
    menus = menu_root["Menus"]
    if len(menus) != 1:
        raise SystemExit(f"Expected one menu in the page, found {len(menus)}: re-check which one is the Great Britain menu.")
    menu = menus[0]
    recipes = []
    for top in menu["Sections"]:
        for path, r in _walk(top, ()):
            flags = {i["Id"]: i["Val"] for i in (r.get("Intols") or [])}
            nutr, nutr100 = {}, {}
            for n in r["Nutrs"]:
                if n["Desc"] in nutr:
                    raise SystemExit(f"{r['Name']!r}: nutrient {n['Desc']!r} listed twice")
                nutr[n["Desc"]] = n["PerServ"]
                nutr100[n["Desc"]] = n["Per100g"]
            recipes.append({
                "section": path, "ident": r["Ident"], "name": r["Name"], "orig_name": r.get("OrigName") or "",
                "desc": r.get("Desc") or "", "pro_desc": r.get("ProDesc") or "", "modified": r["Modified"],
                "vegetarian": flags.get(50) == "yes", "vegan": flags.get(52) == "yes",
                "nutr": nutr, "nutr_100g": nutr100, "sizes": len(r.get("Sizes") or []), "servings": r.get("Servings"),
                "intols": [(i["Id"], i["Val"], [(c["Id"], c["Val"]) for c in (i.get("ChIntols") or [])])
                           for i in (r.get("Intols") or [])],
            })
    names = {}
    for i in menu_root["Intols"]:
        if i["Id"] in names or i.get("ChIntols"):
            raise SystemExit(f"Flag {i['Id']} is defined twice or has children: the reader needs updating.")
        names[i["Id"]] = i["Desc"]
    return {"menu_name": menu["Name"], "menu_modified": menu["Modified"], "recipes": recipes, "intol_names": names}
