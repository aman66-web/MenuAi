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
`salt`, so it is ignored here. The allergen feed carries the chain's own `preference` mark (none / vegetarian / vegan).
"""
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
