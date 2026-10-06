"""Read Popeyes UK's official nutrition and allergen data feeds into ordered rows of printed numbers.

Used by tools/uk_extract/popeyes.py. Standard library only. Numbers are returned exactly as they appear in the
feed's JSON text (strings such as "362.1", "0", "45.39") so nothing is converted, rounded or estimated here.

Where the data comes from: popeyesuk.com links its "Nutritional information" and "Allergen information" pages to
https://allergensandnutritions.popeyesuk.com/ (Popeyes' own "Allergen Recipe Platform"). Those pages are a small
single-page app that load these two JSON feeds (one request each, no login):

    curl -g -o nutrition.json  'https://app-allergenplatform-prod-westeurope-001.azurewebsites.net/api/recipes/get-information?pagination[page]=0&pagination[pageSize]=500&allergens=false&nutrition=true'
    curl -g -o allergens.json  'https://app-allergenplatform-prod-westeurope-001.azurewebsites.net/api/recipes/get-information?pagination[page]=0&pagination[pageSize]=500&allergens=true&nutrition=false'

The nutrition page shows the figures "Per Serving": energy kcal and kJ, protein, carbohydrates, sugar, fat, saturated
fats, fibre and salt (it rounds kcal to a whole number and the rest to 1 decimal, and prints "-" for 0). The feed
carries the same figures to 2 decimals plus a `sodium` field that the page does not show and that does not agree with
`salt`, so it is ignored here. The allergen feed carries the chain's own `preference` mark (none / vegetarian / vegan)
and, per row, three lists of allergens: `contains`, `may_contain` and `free_from`. The public allergen page
(https://allergensandnutritions.popeyesuk.com/allergen-information, linked from popeyesuk.com) shows only the first two:
a "Contains" mark or a "May contain traces of" mark per allergen column, and a blank cell otherwise; `free_from` is not
shown there and is not used here.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

NUTRIENT_KEYS = ("kcal", "kJ", "fats", "saturated_fats", "carbohydrates", "sugar", "protein", "salt", "fibre")
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")


def _load(path: Path) -> list[dict]:
    # parse_float / parse_int = str keeps every number exactly as written in the file.
    doc = json.loads(Path(path).read_text(encoding="utf-8"), parse_float=str, parse_int=str)
    if not isinstance(doc, dict) or not isinstance(doc.get("data"), list):
        raise ValueError(f"{path}: expected an object with a 'data' list")
    if str(doc.get("pages")) != "1":
        raise ValueError(
            f"{path}: the feed now has {doc.get('pages')} pages but this reader handles one (pageSize=500). "
            "Fetch the other pages and extend popeyes_feed.py before running again."
        )
    return doc["data"]


def read_nutrition(path: Path) -> list[dict]:
    """One dict per feed row: id (int), category, name (as printed), and each nutrient as printed text."""
    rows = []
    for r in _load(path):
        n = r.get("nutrition") or {}
        missing = [k for k in NUTRIENT_KEYS if k not in n]
        if missing:
            raise ValueError(f"{path}: row {r.get('id')} {r.get('name')!r} has no {missing}")
        bad = [k for k in NUTRIENT_KEYS if not NUMBER.match(str(n[k]))]
        if bad:
            raise ValueError(f"{path}: row {r.get('id')} {r.get('name')!r} has non-numeric {bad}: {[n[k] for k in bad]}")
        rows.append({"id": int(r["id"]), "category": r["recipe_category"], "name": r["name"], **{k: str(n[k]) for k in NUTRIENT_KEYS}})
    return rows


def read_preferences(path: Path) -> dict[int, str]:
    """feed id -> the chain's own mark: 'none', 'vegetarian' or 'vegan'."""
    out = {}
    for r in _load(path):
        pref = r.get("preference")
        if pref not in ("none", "vegetarian", "vegan"):
            raise ValueError(f"{path}: row {r.get('id')} {r.get('name')!r} has unknown preference {pref!r}")
        out[int(r["id"])] = pref
    return out


def read_allergens(path: Path) -> dict[int, dict]:
    """feed id -> {'contains': [printed allergen names], 'may_contain': [printed allergen names]}, exactly the two lists the
    allergen page shows. Stops if a row lacks either list, names an allergen without a name, puts one allergen in two
    lists, or if one allergen id carries two different names in the feed. (On 2026-10-06 the free_from list of 53 rows left
    out oats, and of 28 of them also rye and the eight tree nuts; the page shows those cells blank like every other
    unmarked allergen, so nothing is added here.)"""
    out, names = {}, {}
    for r in _load(path):
        where = f"{path}: row {r.get('id')} {r.get('name')!r}"
        a = r.get("allergens")
        if not isinstance(a, dict) or not all(isinstance(a.get(k), list) for k in ("contains", "may_contain", "free_from")):
            raise ValueError(f"{where}: no contains / may_contain / free_from lists")
        seen = {}
        for k in ("contains", "may_contain", "free_from"):
            for x in a[k]:
                aid, name = str(x.get("id")), x.get("name")
                if not isinstance(name, str) or not name.strip():
                    raise ValueError(f"{where}: allergen {aid} has no name")
                if names.setdefault(aid, name) != name:
                    raise ValueError(f"{where}: allergen {aid} is called {name!r} here and {names[aid]!r} elsewhere")
                if aid in seen:
                    raise ValueError(f"{where}: {name!r} is in both {seen[aid]} and {k}")
                seen[aid] = k
        out[int(r["id"])] = {"contains": [x["name"] for x in a["contains"]], "may_contain": [x["name"] for x in a["may_contain"]]}
    return out
