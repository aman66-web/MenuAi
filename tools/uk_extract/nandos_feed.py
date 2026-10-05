"""Read Nando's UK official menu data feed into rows of printed numbers.

Used by tools/uk_extract/nandos.py. Standard library only.

Where the numbers come from
---------------------------
Nando's does not publish a nutrition PDF any more (https://www.nandos.co.uk/food/nutrition is a 404). Its public menu
page https://www.nandos.co.uk/food/menu (redirects to /food/menu/index.html) shows only kcal on the cards, but every
card opens a product panel ("This item contains: Energy, Fat, Of which saturates, Carbohydrates, Of which sugars,
Fibre, Protein, Salt") built from the data file the page itself loads:

    https://www.nandos.co.uk/food/menu/page-data/index/page-data.<N>.json

where <N> is the number in the page's script name `/food/menu/app-<N>.js`. Always take <N> from the live HTML
(`feed_url_from_html`): the same folder also holds an old, unversioned `page-data.json` from January 2022 whose dish
list no longer matches the menu. Never use that one.

The feed stores every nutrient in milligrams (`fatMg: 36800`). The page divides by 1000 and prints grams
("Fat (g) 36.8"), and so do we (exact decimal division, no rounding). kcal is printed as is; kJ is not used.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.request
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

PAGE_URL = "https://www.nandos.co.uk/food/menu/index.html"
FEED_BASE = "https://www.nandos.co.uk/food/menu/page-data/index/"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# CSV column -> feed key (all in mg except kcal)
MG_FIELDS = {
    "fat_g": "fatMg", "sat_fat_g": "saturatesMg", "carbs_g": "totalCarbsMg", "sugar_g": "sugarsMg",
    "fiber_g": "fibreMg", "protein_g": "proteinMg", "salt_g": "saltMg",
}


def feed_url_from_html(html: str) -> str:
    """The versioned feed the live menu page loads (`app-<N>.js` -> `page-data.<N>.json`)."""
    found = sorted(set(re.findall(r"/food/menu/app-(\d+)\.js", html)))
    if len(found) != 1:
        raise SystemExit(f"Expected exactly one /food/menu/app-<N>.js in the menu page, found {found}. "
                         "The site changed: look at how the page loads its data before re-running.")
    return f"{FEED_BASE}page-data.{found[0]}.json"


def _get(url: str) -> tuple[bytes, dict]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read(), dict(r.headers)


def fetch(dest: Path) -> dict:
    """Download the menu page and its data feed (two requests, one second apart) into `dest` (a folder)."""
    dest.mkdir(parents=True, exist_ok=True)
    html_bytes, _ = _get(PAGE_URL)
    (dest / "menu-index.html").write_bytes(html_bytes)
    url = feed_url_from_html(html_bytes.decode("utf-8"))
    time.sleep(1.1)
    body, headers = _get(url)
    (dest / "page-data.json").write_bytes(body)
    return {"url": url, "last_modified": headers.get("Last-Modified"), "sha256": hashlib.sha256(body).hexdigest(),
            "html_sha256": hashlib.sha256(html_bytes).hexdigest()}


def grams(mg: int | float) -> str:
    """mg -> grams as the page prints it: exact division by 1000, shortest form ('36.8', '0', '20')."""
    d = (Decimal(str(mg)) / Decimal(1000)).normalize()
    return format(d, "f")


def facts_to_cells(f: dict) -> dict:
    """One feed `factsForPortionSizes` entry -> CSV cells (strings). Missing keys stay blank."""
    cells = {"calories": "" if f.get("energyKcal") is None else str(f["energyKcal"])}
    for col, key in MG_FIELDS.items():
        cells[col] = "" if f.get(key) is None else grams(f[key])
    return cells


@dataclass
class Row:
    key: str                      # stable id of the printed entry (plu); shared by its Regular/Large rows
    kind: str                     # "item" | "nandino-side" | "spice"
    category: str                 # as printed on the menu page
    name: str                     # as printed
    description: str
    serving_info: str             # as printed beside the kcal ("Serves 2", "Meal for 2"...), "" if none
    portion: str | None           # None, "Regular" or "Large" (the page labels the first/second set that way)
    facts: dict
    messages: list[str]
    diets: list[str]
    lozenge: str | None
    flags: list[str]
    abv: float | None = None
    extra: dict = field(default_factory=dict)


def load(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _portion_rows(base: dict, item: dict, kind: str, category: str, key: str) -> list[Row]:
    info = item.get("nutritionalInfo") or {}
    sizes = info.get("factsForPortionSizes") or []
    if len(sizes) > 2:
        raise SystemExit(f"{key}: {len(sizes)} portion sizes; the menu page only labels two (Regular, Large). Check the page.")
    rows = []
    for n, facts in enumerate(sizes):
        portion = None if len(sizes) == 1 else ("Regular", "Large")[n]
        rows.append(Row(
            key=key, kind=kind, category=category, name=_clean(item.get("displayName")), description=_clean(item.get("description")),
            serving_info=_clean(item.get("servingInfo")), portion=portion, facts=facts,
            messages=[_clean(m) for m in info.get("messages") or []], diets=list(item.get("diets") or []),
            lozenge=((item.get("lozenge") or {}).get("label")), flags=list(item.get("flags") or []),
            abv=facts.get("alcoholByVolumePercent"), **base))
    if len(sizes) == 2 and not sizes[0]["energyKcal"] <= sizes[1]["energyKcal"]:
        raise SystemExit(f"{key}: the second portion has fewer kcal than the first, so 'Regular'/'Large' may be the wrong way round.")
    return rows


def read_menu(menu: dict) -> tuple[list[Row], dict]:
    """Rows for everything the public menu page shows to ALL of Great Britain, in feed order, plus what was left out.

    Left out (and counted in the second return value):
      * items with a `restaurantGroup` (Gatwick-only, pricing trials, Northern Ireland, Scotland, Ninos, beer/cocktail trials,
        delivery-only alcohol...). The page itself shows only un-grouped items (plus Scotland / Northern Ireland sections).
      * items flagged IS_TRIAL
      * items with no nutrition published at all (e.g. "Dare to share", which is "any three starters").
    Added from the product panels: the Nandino side options (kid-size chips, corn, cucumber, rice) and the spice levels, both of
    which Nando's prints with full values but never lists as menu cards of their own.
    """
    data = menu["result"]["data"]["nandos"]["menu"]
    if menu["result"]["pageContext"].get("market") != "UK":
        raise SystemExit("Feed market is not UK.")
    rows: list[Row] = []
    left_out = {"grouped": {}, "trial": [], "no_nutrition": []}
    bastes: dict[str, set] = {}
    baste_rows: dict[str, dict] = {}
    nandino_sides: dict[str, tuple[dict, str]] = {}

    for section in data["sections"]:
        cat = _clean(section["displayName"])
        for item in section["items"]:
            group = item.get("restaurantGroup")
            # Spice levels and Nandino sides are only reachable through the modifiers of ungrouped items.
            if not group:
                for mod in item.get("modifiers") or []:
                    for opt in mod.get("options") or []:
                        if opt.get("restaurantGroup"):
                            continue
                        sizes = (opt.get("nutritionalInfo") or {}).get("factsForPortionSizes") or []
                        if mod["slug"] == "choose-baste" and sizes:
                            bastes.setdefault(opt["slug"], set()).add(json.dumps(sizes, sort_keys=True))
                            baste_rows[opt["slug"]] = opt
                        if str(opt.get("plu", "")).startswith("nandinos-side:") and sizes:
                            prev = nandino_sides.get(opt["plu"])
                            if prev and prev[1] != json.dumps(sizes, sort_keys=True):
                                raise SystemExit(f"{opt['plu']}: differing values between dishes.")
                            nandino_sides[opt["plu"]] = (opt, json.dumps(sizes, sort_keys=True))
            if group:
                left_out["grouped"].setdefault(group, []).append(_clean(item["displayName"]))
                continue
            if "IS_TRIAL" in (item.get("flags") or []):
                left_out["trial"].append(_clean(item["displayName"]))
                continue
            made = _portion_rows({}, item, "item", cat, item["plu"])
            if not made:
                left_out["no_nutrition"].append(_clean(item["displayName"]))
            rows.extend(made)

    for plu, (opt, _) in nandino_sides.items():
        rows.extend(_portion_rows({}, opt, "nandino-side", "Nandinos (Kids)", plu))

    flagged_bastes = {b["slug"]: b for b in data["bastes"]}
    for slug, variants in bastes.items():
        if len(variants) != 1:
            raise SystemExit(f"Spice '{slug}' has different values on different dishes; decide how to publish it before re-running.")
        top = flagged_bastes.get(slug, {})
        opt = baste_rows[slug]
        merged = dict(opt)
        merged["description"] = top.get("description", "")
        merged["flags"] = top.get("flags", [])
        rows.extend(_portion_rows({}, merged, "spice", "Spice levels", f"spice:{slug}"))
    for slug, b in flagged_bastes.items():
        if slug not in bastes:
            offered = any(o.get("slug") == slug for sec in data["sections"] for it in sec["items"]
                          for mod in it.get("modifiers") or [] for o in mod.get("options") or [])
            why = "no nutrition published" if offered else "not offered on any dish"
            left_out["no_nutrition"].append(f"{_clean(b['displayName'])} (spice level, {why})")
    return rows, left_out
