#!/usr/bin/env python3
"""Build data/source/grounded-kitchen/ from the "Nutrition facts per serving" Grounded Kitchen's own ordering site prints once a shop is picked.

    python3 tools/uk_extract/grounded_kitchen.py CACHE_DIR --fetch                 # robots check, then each shop's category and product pages
    python3 tools/uk_extract/grounded_kitchen.py CACHE_DIR --checked-on 2026-10-12 [--out DIR]

Source: Grounded Kitchen (groundedkitchen.com, Korean-inspired bowls, 9 restaurants in England). Its allergen guide says "Carbohydrate and sugar
values are available in the nutritional information for each dish on our Order Online website", and its Order Online link is
https://groundedkitchen.vmos.io (a Vita Mojo site; robots.txt `Disallow:` empty; vmos2.vmos.io serves no robots file: no rules). After a shop is
picked, each product's page has a "Nutrition" tab printing "Nutrition facts per serving": energy (kcal and kJ), fats, carbs, of which saturates,
of which sugars, proteins, fibres and salt. Read with the shared reader vita_mojo.py (headless Chromium, one page at a time).
Shops: High Wycombe has its own menu ("All Day", Grounded Kitchen - New CD); the other 8 share one ("All day", QSR Menu Own). Read: Leamington Spa
and Metrocentre (the shared menu, two regions) and High Wycombe.

Rule (as for the pub chains): a product is published only when the same name prints the same figures at 2 or more of the shops read, and left
out if any shop prints other figures. What is copied is the printed per-serving block (page text); the API answer the page loaded is used only
to check the copy (`check`: each printed figure must equal the product's own per-100 g figure times its serving weight, at the printed precision).
Figures are for the dish as listed, before a flavour, extra sauce or add-on is chosen (the tile's kcal is the same figure).
A product offering sizes (rice bowls: Small, Regular, Go Large; baos: Single, ...) is published at the size its page opens on, named in brackets
("Chicken Rice Bowl (Small)"): the page's block describes that size (checked against its weight in the data); the other sizes are printed only as
"+NNN kcal" on top and are not listed (nothing is added up).
Left out: the "Bundles" (meal deals) and "Alcohol" categories, products with no nutrition block or a block missing kcal, protein, carbohydrate or
fat, and a product a restaurant prints twice with different blocks (High Wycombe's Chicken Bao).
Allergens: link to the chain's own allergen chart page (groundedkitchen.com/allergen-chart); the ordering site lists only the base dish's
allergens, not those of the flavour chosen, so its lists are not copied. Tags: vegetarian where the chain's own data marks the product vegetarian or vegan; contains_beef /
contains_pork only from the product's own name or description.
"""
from __future__ import annotations

import argparse
import collections
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vita_mojo as vm  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "grounded-kitchen"
ORIGIN = "https://groundedkitchen.vmos.io"
QSR, CD = "eb420246-7df2-473b-a7f2-73e1bd2c261a", "a7e8648a-336d-4125-ab49-962300446f54"
STORES = [("4d8659e5-2322-437e-aa13-205887c51b27", "Leamington Spa", QSR), ("0d978562-16f5-4f5a-b6ee-e52973c1ef62", "Metrocentre", QSR),
          ("44c62867-1c0b-40d8-8a23-ec66acb52ab3", "High Wycombe", CD)]
SKIP = r"^(bundles|alcohol|meal deals?)$"
MIN_STORES = 2
SOURCE_URL = ORIGIN + "/"
SOURCE_TITLE = "Grounded Kitchen online ordering, Nutrition facts per serving (groundedkitchen.vmos.io, 3 restaurants, read 12 October 2026)"
ALLERGEN_URL = "https://www.groundedkitchen.com/allergen-chart"
NOTE = ("Per serving, as Grounded Kitchen's ordering site prints each dish's nutrition once a restaurant is picked; 3 restaurants were read and only "
        "figures printed the same at 2 or more are shown. Figures are for the dish as listed (rice bowls and baos at the size named): the "
        "flavour, sauce or add-ons you choose are not counted.")
ALCOHOL = re.compile(r"(?<!ginger )(?<!root )\b(beer|lager|ale|cider|wine|prosecco|soju|sake|gin|vodka|rum|whisk(?:e)?y|cocktail|alcohol)\b", re.I)
REQUIRED = ("calories", "protein_g", "carbs_g", "fat_g")
RANKABLE = re.compile(r"^(bowls|sticky rice \+|bao's & wraps|lunch menu|kids menu)$", re.I)
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]")  # chilli-pepper heat marks after a few names: tidied away, nothing else changes
VEG_DIETS = {"08278098-ea04-11eb-8fee-0a87bd7d9523", "08278161-ea04-11eb-8fee-0a87bd7d9523"}  # vegetarian, vegan (catalog/diets)
TOL = {"calories": 1.0, "energy_kj": 5.0, "salt_g": 0.0051}  # grams printed to 1 decimal: 0.051


def check(printed: dict, b: dict) -> str | None:
    """Printed per-serving figures vs the data the page loaded (per 100 g x serving grams / 100). Returns a reason when they differ."""
    base = vm.base_items(b)
    if len(base) != 1:
        return f"{len(base)} base items"
    nm = base[0].get("nutritionalMeta") or {}
    q = nm.get("defaultQuantity")
    ds = vm.default_size(b)
    if ds and re.fullmatch(r"\d+(\.\d+)?", ds[1]):
        q = ds[1]   # a product offering sizes: the page's block describes the size it opens on (its weight in the data)
    if not q:
        return "no serving weight in the data"
    pairs = {"calories": "calories", "fat_g": "fats", "carbs_g": "carbs", "sat_fat_g": "fatSaturates", "sugar_g": "carbsSugar",
             "protein_g": "proteins", "fiber_g": "fibre", "salt_g": "salt"}
    for k, src in pairs.items():
        if k not in printed or nm.get(src) is None:
            continue
        want = float(nm[src]) * float(q) / 100
        if abs(float(printed[k]) - want) > TOL.get(k, 0.051):
            return f"{k} printed {printed[k]}, data gives {want:.3f}"
    return None


def build(cache: Path, checked_on: str, out: Path | None) -> None:
    seen: dict[str, dict[str, object]] = collections.defaultdict(dict)  # name (lower case) -> {restaurant: figures or reason}
    first: dict[str, dict] = {}
    order: list[str] = []
    left_out: list[str] = []
    checked = 0
    for store, sname, menu in STORES:
        for c in vm.categories(cache, store, menu):
            cat = " ".join(c["name"].split())
            if re.match(SKIP, cat, re.I):
                continue
            prods = vm.all_bundles(cache, store, c["uuid"], SKIP)
            listing = vm.listing_kcal((cache / f"{store}_cat_{c['uuid']}.txt").read_text(encoding="utf-8"), [b["name"].strip() for _, b in prods])
            for sub, b in prods:
                name = re.sub(r"^new!\s*", "", " ".join(EMOJI.sub("", b["name"]).split()), flags=re.I)
                ds = vm.default_size(b)
                if ds:
                    name = f"{name} ({ds[0]})"   # the block printed is for the size the page opens on; the others print only "+NNN kcal"
                key = name.lower()
                if key not in first:
                    first[key] = dict(b=b, cat=cat, sub=sub, name=name)
                    order.append(key)
                txt = (cache / f"{store}_prod_{b['uuid']}.txt").read_text(encoding="utf-8")
                nut = vm.nutrition_from_text(txt)
                if vm.size_count(b) > 1 and not ds:
                    val: object = "SIZES"
                elif not nut or any(k not in nut for k in REQUIRED):
                    val = None
                else:
                    tiles = [t for t in listing.get(b["name"].strip(), []) if t is not None]
                    if tiles and any(t != nut["calories"] for t in tiles):
                        raise SystemExit(f"{sname}: {name!r} tile prints {tiles} kcal but its nutrition tab {nut['calories']}: look")
                    why = check(nut, b)
                    if why:
                        val = f"CHECK: {why}"
                    else:
                        checked += 1
                        val = tuple(sorted(nut.items()))
                prev = seen[key].get(sname)
                if prev is not None and val is not None and prev != val:
                    val = f"CONFLICT: one restaurant prints two different blocks for {name}"
                if val is not None or sname not in seen[key]:
                    seen[key][sname] = val
    items, disagree, one_store = [], [], []
    for key in order:
        cat, name, b = first[key]["cat"], first[key]["name"], first[key]["b"]
        by = seen[key]
        vals = {s: v for s, v in by.items() if isinstance(v, tuple)}
        bad = {s: v for s, v in by.items() if isinstance(v, str)}
        if ALCOHOL.search(name):
            left_out.append(f"{cat}: {name} (alcoholic drink)")
            continue
        if bad:
            left_out.append(f"{cat}: {name} ({bad})")
            continue
        if not vals:
            left_out.append(f"{cat}: {name} (no complete nutrition block)")
            continue
        if len(set(vals.values())) > 1:
            disagree.append(f"{cat}: {name} {vals}")
            continue
        if len(vals) < MIN_STORES:
            one_store.append(f"{cat}: {name} (at {sorted(vals)} only)")
            continue
        nut = dict(next(iter(vals.values())))
        desc = " ".join((b.get("description") or "").split())
        tags = []
        if VEG_DIETS & set(b.get("diets") or []):
            tags.append("vegetarian")
        if re.search(r"\bbeef\b", name + " " + desc, re.I):
            tags.append("contains_beef")
        if re.search(r"\b(pork|bacon|ham)\b", name + " " + desc, re.I):
            tags.append("contains_pork")
        items.append(dict(id=slug(name), name=name, category=cat, serving="1 serving", rankable=bool(RANKABLE.search(cat)), tags="|".join(tags),
                          notes=f"printed identically at {len(vals)} of {len(STORES)} restaurants: {', '.join(sorted(vals))}; {desc}", **nut))
    seen_names: dict[str, dict] = {}
    unique = []
    for it in items:
        prev = seen_names.get(it["name"].lower())
        if prev:
            if any(prev.get(k) != it.get(k) for k in ("calories", "protein_g", "carbs_g", "fat_g")):
                raise SystemExit(f"{it['name']} is in two categories with different figures: look")
            continue
        seen_names[it["name"].lower()] = it
        unique.append(it)
    print(f"product pages checked against the page's own data: {checked}, all within rounding")
    print(f"published {len(unique)} items from {len(STORES)} restaurants")
    for title, rows in (("left out", left_out), ("DIFFERENT figures between restaurants (left out)", disagree), ("at one restaurant only (left out)", one_store)):
        print(f"{title}: {len(rows)}")
        for r in rows:
            print("   ", r)
    guide = {"title": "Grounded Kitchen allergen chart", "url": ALLERGEN_URL, "checked_on": checked_on, "may_contain_published": False}
    write_chain_folder(chain_id=CHAIN_ID, name="Grounded Kitchen", cuisine="Asian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                       checked_on=checked_on, aliases=["grounded kitchen", "grounded"], items=unique, out=out, note=NOTE, allergen_guide=guide)
    print("written", out or f"data/source/{CHAIN_ID}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--checked-on", default=time.strftime("%Y-%m-%d"))
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    if a.fetch:
        vm.harvest(a.cache, ORIGIN, [(s, m) for s, _, m in STORES], products=True, skip=SKIP, delay=2.0)
    build(a.cache, a.checked_on, a.out)


if __name__ == "__main__":
    main()
