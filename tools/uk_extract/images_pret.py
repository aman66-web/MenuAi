#!/usr/bin/env python3
"""Item photos for Pret A Manger from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_pret.py --cache DIR [--dry-run]

Source: the product-category pages of https://www.pret.co.uk/en-GB/products (the pages the nutrition data came from; see
pret_feed.py). Each category page is server-rendered: its <script id="__NEXT_DATA__"> holds every product record of the
category (name, sku, `image`, drink `variants`) and its HTML links every product tile to the product's own page,
/en-GB/products/<SKU>/<slug>. The product page shows the same photo (checked: same file, same sku, same name). Photos are
on images.ctfassets.net, the asset host pret.co.uk's own pages load them from (it is in the site's own Content-Security-Policy).
We fetch the ORIGINAL upload (no resize parameters: the site's own tile URLs ask the CDN for width 800, which would upscale
the 584-786 px originals) and let images_common.store_image do the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the chain's own product record
  (a) has a name that equals the item's name (images_common.norm_name equality against the CURRENT data/source/pret/items.csv), or
  (b) is a drink whose own `variants` list carries the item's milk / decaf variant, i.e. the item name is the product name
      plus the milk / decaf labels of one of THAT product's variants ("Latte (oat milk, decaf)"). The site shows one photo
      per product, shared by its variants, so the same product record carries both the photo and that item's variant.
Names that two different products would claim get no photo (none found at the time of writing). The product page link of the
tile (by sku) is the item's source_url. Products whose image is missing, the site's own placeholder (Placeholder_SVG.svg),
an SVG, or under 200 px are skipped. Photos that print nutrition numbers or claims, or that are another product's photo, are
listed in SKIP_FILES (by asset id or file name).

Items that already have a photo (a row in images.csv from an earlier run). The row's source_url names the product record (sku)
whose page named the item exactly on the day of that run, i.e. the record our published name and figures came from. On a rerun:
  - if that record (same sku) is still on the category pages, it decides, also when Pret has since renamed it (rule: the same
    product record the dish was extracted from). Checked 2026-11-17: Pret renamed three hot ciabattas ("Warm Beef Birria & Jalapeño
    Ciabatta" is now "Beef Birria & Jalapeño Hot Ciabatta", UK021546; likewise UK021538 Chicken Caesar Bacon and UK021470 Three Cheese
    & Tomato); each record prints exactly our published kcal, fat and saturates and serves the very same photo, byte for byte. When the
    photo is unchanged the row keeps its source_url (that address still opens the product's page);
  - if that record has gone from the site (a seasonal product taken off the menu while our published data, extracted 2026-10-08,
    still lists it), the row is kept as it is (same file, same source page) as long as its file is still in web/public/menu-images/pret/
    (CARRY_OVER). The photo was that exact item's own photo on its own product page under the same name on the day it was retrieved.
    A DIFFERENT record that now carries the same name is used instead only when it prints exactly the item's published kcal, protein,
    carbohydrate and fat (so our data was re-extracted from it). Checked 2026-11-17: "Chocolate Chunk Cookie" is now record UK021547
    printing 424 kcal, while our item (329 kcal) is the old record UK004340, whose page now answers 404: the old cookie's photo is kept,
    the new cookie's photo is not attached to the old cookie's numbers. Carried on 2026-11-17 (pages answer 404 or show no product;
    retrieved and looked at 2026-10-07): chicken-satay-baguette, chicken-satay-wrap, chocolate-chunk-cookie,
    italian-style-chicken-basil-hot-wrap, new-yorker-club-sandwich, nutty-pistachio-almond-loaf-cake, prets-chicken-satay-half-baguette,
    prets-lasagne-side-soup, pumpkin-spice-latte (semi-skimmed, skimmed, soya and oat milk), toasted-marshmallow-hot-chocolate,
    toasted-marshmallow-latte, zingy-lemon-almond-loaf-cake.
When re-extraction removes such an item from items.csv, load_items no longer returns it and the rerun drops its photo. Because
write_images_csv stamps one date on every row, the file keeps its earlier retrieved_on date when every row the run writes is exactly
as it was (same photo file, byte for byte, same source page; rows may only have been left out), and is dated today when a photo is new or
changed; the run prints every carried row with the date it was really retrieved. Items listed in DROP_ITEMS get no photo at all.

Checked by eye on 2026-11-17 (contact sheets of every kept photo, and every pack's printed words read in Pret's 1080 px original):
  - Pret has replaced three photos since 2026-10-07 (same record): Chicken & Edamame Protein Pot, Raspberry & White Chocolate Cookie
    and Souper Tomato (+ its side soup). The earlier files carried a teal "New recipe / I'm better than ever!" sticker; today's are
    the same food without it, so the rerun takes today's.
  - Left out after looking (SKIP_FILES): the five poppi cans (another brand's can, "Low Sugar" badge), Vitamin Volcano ("packed with
    vitamins"), Easy Greens ("no added sugar"), and the Dark and Milk Chocolate bars ("Now with 70% / 45% cocoa").
  - Kept: Pret's own packs whose words are only the name, flavour, "Hand cooked crisps", "Cold pressed juice", "Organic", a vegan
    "V" or "Suitable for veggies"; the hot wraps' "HOT!" sleeve; the Soup White Baguette with Butter, whose butter portion is a
    Président pack beside the baguette (the food is shown, the pack is part of the item); the Pret water bottles, whose labels carry
    a strip of tiny boxes at the edge that cannot be read even in the original, so no figure can be read from them; drink variants
    share their product's one photo (Pret shows one photo per drink); side soups show the same soup as the full pot (Pret's own
    side-soup record carries that photo).

Terms (https://www.pret.co.uk/en-GB/terms-and-conditions, read 2026-10-07 and again 2026-11-17, unchanged):
  7.1 "All copyright, trade marks and all other intellectual property rights in and to the Website, the App and their content
      (including without limitation the Website and App design, text, graphics and all software and source codes connected with
      the Platform) are owned by or licensed to Pret or otherwise used by Pret as permitted by law."
  7.2 "In accessing the Platform you agree that you will access the content solely for your personal, non-commercial use. None of
      the content may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without our prior written consent.
      This excludes the downloading, copying and/or printing of pages of the Website for personal, non-commercial home use only."
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2; the founder's accepted risk); Pret's photos come down the
day Pret asks (delete web/public/menu-images/pret/ and data/source/pret/images.csv).
robots.txt (www.pret.co.uk, read 2026-10-07 and again 2026-11-17, unchanged): "User-agent: * / Disallow: /fr-FR / Disallow: /zh-HK /
Disallow: /en-HK / Disallow: /en-US" (we only use /en-GB). images.ctfassets.net/robots.txt answers 404 (no rules). polite_get checks
both on every URL.

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written. A dropped connection or a 5xx is retried
twice after a pause (10 s, 30 s): that is ordinary network trouble, never a way round a block.
"""
from __future__ import annotations

import argparse
import csv
import http.client
import json
import re
import sys
import time
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "pret"
SITE = "https://www.pret.co.uk"
ENTRY = SITE + "/en-GB/products/categories/hot-drinks"      # its page lists every top-level category (read live)
KNOWN_CATEGORIES = {"hot-drinks", "hot-food", "breakfast", "sandwiches-baguettes-wraps-and-flatbreads", "cold-drinks",
                    "super-plates-salads-and-protein-pots", "sweet-and-savoury-snacks", "fruit-and-fruit-pots",
                    "little-pret-stars", "veggie-and-vegan-friendly", "pret-at-home"}
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PHOTO_HOST = "images.ctfassets.net"
CARRY_OVER = True        # keep an earlier run's row when its product record has gone from the site (see the docstring)
# Photos that are not used, and why. A key is a Contentful asset id (the 21-22 character folder in the photo URL; unique per
# upload) or a file name, and matches any photo URL that contains it. Look at the stored photos before changing this.
SKIP_FILES: dict[str, str] = {
    # Pret's own record gives these two products another product's photo. Checked 2026-11-17: the uploaded file is byte for byte
    # the same picture as the other product's own photo (sha256 63a9dfa05c0f... = the Hazelnut Frappé's, UK000601; 4b20d1a8d365... =
    # the Mocha Frappé's, UK008423), so it is a photo of a different drink, not of the one named (the Caramel Frappé has no espresso,
    # the Hazelnut Frappé has). No photo for them.
    "ffuK4PTWA6iuow1fSJYnW": "Caramel Frappé: the file is the Hazelnut Frappé's own photo, byte for byte (0000_HazelnutFrappe_NVBI_1080_01.png)",
    "5dpDrQu3ca4Prfdtjf3FTF": "Frozen Hot Chocolate: the file is the Mocha Frappé's own photo, byte for byte (0000_MochaFrappe_NVBI_1080_02.png)",
    # Looked at on contact sheets and in Pret's 1080 px originals on 2026-11-17 and left out (they had been kept on 2026-10-07).
    # A third-party brand's can instead of a Pret product, with a "Low Sugar" badge on it (a nutrition claim):
    "2b2FtoxkZWLyA0Fn0Gb9Dm": "poppi Lemon Lime: another brand's can (poppi) with a 'Low Sugar' badge",
    "59EoQ6okhQN6lYF0he3SYI": "poppi Orange: another brand's can (poppi) with a 'Low Sugar' badge",
    "39Qqx2EoD3XpdkYeU4xilL": "poppi Raspberry Rose: another brand's can (poppi)",
    "55PCOxj2y6BVGFmxZ0wu4M": "poppi Strawberry & Lemon: another brand's can (poppi)",
    "4EmHXlZVLV3whnY2BlKsRv": "poppi Wild Berry: another brand's can (poppi)",
    # The pack prints a nutrition claim or a recipe-change line (it could contradict our tables or read as calling the food good):
    "58nTDqqR0bte0H14njiU5K": "Vitamin Volcano: the bottle prints 'Red berry smoothie packed with vitamins' (a nutrition claim)",
    "hVJRcoWlgQa5JDS0ToqQS": "Easy Greens: the label prints '... with no added sugar' (a nutrition claim)",
    "kK50qxbAczMEYrpeSzIDl": "Dark Chocolate with Sea Salt: the wrapper prints 'Now with 70% cocoa' (a recipe-change line with a figure)",
    "4M6b2VMCN3ZsZCGfeCRHLG": "Milk Chocolate Bar: the wrapper prints 'Now with 45% cocoa' (a recipe-change line with a figure)",
}
DROP_ITEMS: dict[str, str] = {}   # item id -> why it gets no photo at all (applies to today's matches and to carried rows)

# Variant labels, as the site's own barista flags name them (the same words the published item names use).
MILK_FLAGS = {"isBlack": "black", "milkIsOat": "oat milk", "milkIsSemiSkimmed": "semi-skimmed milk",
              "milkIsSkimmed": "skimmed milk", "milkIsSoya": "soya milk", "milkIsHalfAndHalf": "half and half",
              "milkIsWhole": "whole milk", "milkIsAlmond": "almond milk"}
# The per-serving rows compared when a different record now carries an item's name (Pret's labels -> items.csv columns).
FIGURES = {"Energy (Kcal)": "calories", "Protein (g)": "protein_g", "Carbohydrates (g)": "carbs_g", "Fat (g)": "fat_g"}


# ---------------------------------------------------------------- fetching

def get(url: str, cache: Path, accept: str) -> bytes:
    """ic.polite_get, plus two patient retries for dropped connections and 5xx. Blocks (401/403/429/robots) are never retried."""
    delays = [10, 30]
    for attempt in range(3):
        try:
            return ic.polite_get(url, cache, accept=accept)
        except ic.Blocked:
            raise
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 2:
                raise
        except (OSError, http.client.HTTPException):
            if attempt == 2:
                raise
        time.sleep(delays[attempt])
    raise AssertionError("unreachable")


def next_data(html: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise SystemExit("A Pret page no longer carries its page data (__NEXT_DATA__): the site changed, re-check by hand.")
    return json.loads(m.group(1))


def walk_products(cat: dict):
    """Every product record in a category, its subcategories and theirs."""
    for p in cat.get("products") or []:
        yield p
    for sub in cat.get("subcategories") or []:
        yield from walk_products(sub)


def abs_url(src: str) -> str:
    return ("https:" + src) if src.startswith("//") else src


# ---------------------------------------------------------------- names and figures

def claimed_names(p: dict) -> dict[str, str]:
    """{norm_name: how} for the item names this product record may carry a photo for: its own name, and its own drink variants."""
    base = re.sub(r"\s+", " ", p["name"]).strip()
    out = {ic.norm_name(base): "name"}
    for v in p.get("variants") or []:
        attrs = v.get("baristaAttributes") or {}
        milk = [MILK_FLAGS[k] for k, on in (attrs.get("milkOptions") or {}).items() if on and k in MILK_FLAGS]
        caf = attrs.get("caffeine") or {}
        label = ("decaf pod" if caf.get("isDecafPod") else "decaf" if caf.get("isDecaf")
                 else "half-caf" if caf.get("isHalfCaf") else "")
        if len(milk) > 1:
            continue                                   # not explained by the flags: claim nothing
        parts = [x for x in (milk[0] if milk else "", label) if x]
        if parts:
            out.setdefault(ic.norm_name(f"{base} ({', '.join(parts)})"), "variant " + ", ".join(parts))
    return out


def same_figures(p: dict, item: dict) -> bool:
    """True when a plain product record (no drink variants) prints exactly the item's published kcal, protein, carbohydrate and fat."""
    if p.get("variants"):
        return False                                   # drink variants print per-variant tables: never switched by this rule
    printed: dict[str, str] = {}
    for row in p.get("nutritionals") or []:
        d = {c.get("name"): c.get("value") for c in row}
        if d.get("nutrient") in FIGURES:
            printed[FIGURES[d["nutrient"]]] = str(d.get("perServing") or "").strip()
    return len(printed) == len(FIGURES) and all(printed[k] == (item.get(k) or "").strip() for k in FIGURES.values())


def read_prior() -> tuple[dict[str, dict], set[str]]:
    """The rows images.csv holds now ({item_id: {file, source_url, retrieved_on, sku}}) and the retrieved_on dates in it."""
    path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if not path.exists():
        return {}, set()
    with open(path, newline="", encoding="utf-8-sig") as f:
        got = list(csv.DictReader(f))
    out = {}
    for r in got:
        m = re.search(r"/en-GB/products/(UK\d+)/", r["source_url"])
        out[r["item_id"]] = {**r, "sku": m.group(1) if m else ""}
    return out, {r["retrieved_on"] for r in got}


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the pages only; print the matches; write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    prior, prior_dates = read_prior()
    skipped: list[str] = []
    products: dict[str, dict] = {}           # sku -> record
    links: dict[str, str] = {}               # sku -> product page url
    placeholders: set[str] = set()
    try:
        entry = get(ENTRY, args.cache, HTML_ACCEPT).decode("utf-8", "replace")
        live = [c["slug"] for c in next_data(entry)["props"]["pageProps"]["categories"]]
        if set(live) != KNOWN_CATEGORIES:
            skipped.append(f"category list differs from the last check: {sorted(set(live) ^ KNOWN_CATEGORIES)} "
                           "(new ones are read too; nothing is matched by category)")
        for slug in live:
            page_url = f"{SITE}/en-GB/products/categories/{slug}"
            html = entry if page_url == ENTRY else get(page_url, args.cache, HTML_ACCEPT).decode("utf-8", "replace")
            pp = next_data(html)["props"]["pageProps"]
            ph = ((pp.get("settings") or {}).get("globalPlaceholderImage") or {}).get("src")
            if ph:
                placeholders.add(abs_url(ph))
            for p in walk_products(pp["selectedCategory"]):
                old = products.setdefault(p["sku"], p)
                if old is not p and (old.get("image") or {}).get("src") != (p.get("image") or {}).get("src"):
                    skipped.append(f"{p['name']} ({p['sku']}): two different photos in the site's data, ambiguous, no photo")
                    old["image"] = None
            for path, sku in re.findall(r'href="(/en-GB/products/(UK\d+)/[^"?#/]+)(?:[?#][^"]*)?"', html):
                links.setdefault(sku, SITE + path)
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2
    except (OSError, http.client.HTTPException) as e:
        print(f"STOPPED (nothing written): could not read a Pret page: {e!r}", file=sys.stderr)
        return 1

    # Which product records claim which item name.
    claims: dict[str, dict[str, tuple[dict, str]]] = {}      # norm name -> {sku: (record, how)}
    for sku, p in products.items():
        for key, how in claimed_names(p).items():
            claims.setdefault(key, {})[sku] = (p, how)

    def photo_problem(p: dict, sku: str) -> str:
        """Why this live record's photo cannot be used ("" when it can)."""
        img = p.get("image") or {}
        src = img.get("src") or ""
        photo = abs_url(src)
        fname = photo.rsplit("/", 1)[-1]
        if not src:
            return f"product {sku} has no photo"
        if photo in placeholders or fname.lower().endswith(".svg") or not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            return f"product {sku} shows the site's placeholder or a non-photo file ({fname})"
        if not photo.startswith(f"https://{PHOTO_HOST}/"):
            return f"photo host is not {PHOTO_HOST} ({photo})"
        if min(img.get("width") or 0, img.get("height") or 0) < ic.MIN_SIDE:
            return f"photo {fname} is smaller than {ic.MIN_SIDE}px"
        if any(k in photo for k in SKIP_FILES):
            return f"{fname} skipped: " + next(v for k, v in SKIP_FILES.items() if k in photo)
        if sku not in links:
            return f"no product page link for {sku} on the category pages"
        return ""

    matches: dict[str, tuple[str, str, str, str]] = {}       # item id -> (photo url, page url, sku, how)
    carried: dict[str, dict] = {}                           # item id -> its earlier images.csv row, kept as it is
    notes: list[str] = []

    def carry(it: dict, why: str) -> None:
        r = prior[it["id"]]
        if not CARRY_OVER:
            skipped.append(f"{it['id']}: {why}; CARRY_OVER is off, no photo")
        elif not (ic.IMAGES_ROOT / CHAIN / r["file"]).is_file():
            skipped.append(f"{it['id']}: {why}; its earlier photo file {r['file']} is missing, not carried")
        else:
            carried[it["id"]] = r
            notes.append(f"carried from an earlier run: {it['id']}: {r['file']} from {r['source_url']} "
                         f"(retrieved {r['retrieved_on']}); {why}")

    for it in items:
        iid = it["id"]
        if iid in DROP_ITEMS:
            skipped.append(f"{iid}: no photo: {DROP_ITEMS[iid]}")
            continue
        got = claims.get(ic.norm_name(it["name"])) or {}
        old = prior.get(iid)
        if old and old["sku"] in products:
            # The record the item's photo came from is still listed: it decides (same product id), renamed or not.
            sku = old["sku"]
            p = products[sku]
            how = got[sku][1] if sku in got else f"same product record as the earlier row, now named {p['name']!r}"
            if sku not in got:
                notes.append(f"renamed: {iid} ({it['name']!r}): its record {sku} is now named {p['name']!r}")
            others = sorted(s for s in got if s != sku)
            if others:
                notes.append(f"{iid}: the name is also claimed by {', '.join(others)}; its own earlier record {sku} decides")
            why = photo_problem(p, sku)
            src = (p.get("image") or {}).get("src") or ""
            if src and any(k in src for k in SKIP_FILES):
                skipped.append(f"{iid}: {why}")            # a photo we decided against after looking: no photo, nothing carried
            elif why:
                carry(it, f"its record {sku} now has no usable photo ({why})")
            else:
                matches[iid] = (abs_url(p["image"]["src"]), links[sku], sku, how)
            continue
        if old:
            # The record the photo came from has gone from the site (a seasonal product taken off the menu, say).
            if len(got) == 1:
                (sku, (p, how)), = got.items()
                if same_figures(p, it) and not photo_problem(p, sku):
                    notes.append(f"{iid}: earlier record {old['sku']} gone; {sku} now carries the name and prints exactly the "
                                 "item's published kcal, protein, carbohydrate and fat: today's record decides")
                    matches[iid] = (abs_url(p["image"]["src"]), links[sku], sku, how + ", same figures")
                    continue
                carry(it, f"its record {old['sku']} is no longer on the site; {sku} ({p['name']!r}) now carries the name but is a "
                          "different product record whose figures are not the item's, so its photo is not used")
            else:
                carry(it, f"its record {old['sku']} is no longer on the site")
            continue
        if not got:
            continue
        if len(got) > 1:
            skipped.append(f"{iid}: the name is claimed by {len(got)} products ({', '.join(sorted(got))}), ambiguous, no photo")
            continue
        (sku, (p, how)), = got.items()
        why = photo_problem(p, sku)
        if why:
            skipped.append(f"{iid}: {why}")
        elif ic.norm_name(links[sku].rsplit("/", 1)[-1].replace("-", " ")) != ic.norm_name(p["name"]):
            skipped.append(f"{iid}: the product page link ({links[sku]}) does not name {p['name']!r}")
        else:
            matches[iid] = (abs_url(p["image"]["src"]), links[sku], sku, how)

    names = {it["id"]: it["name"] for it in items}
    rows: dict[str, tuple[str, str]] = {}
    sku_of: dict[str, str] = {}
    for item_id in sorted(matches):
        photo, page_url, sku, how = matches[item_id]
        if args.dry_run:
            print(f"{item_id} | {names[item_id]} | {photo} | {page_url} | {sku} ({how})")
            continue
        try:
            raw = get(photo, args.cache, "image/*,*/*;q=0.8")
            fname = ic.store_image(CHAIN, raw)
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing more written; images.csv not updated): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")
            continue
        except (OSError, http.client.HTTPException) as e:
            skipped.append(f"{item_id}: {photo}: could not be downloaded ({e!r})")
            continue
        old = prior.get(item_id)
        # Same record, same photo (byte for byte): the earlier source page is kept (it still opens that product's page).
        keep_src = old and old["sku"] == sku and old["file"] == fname
        rows[item_id] = (fname, old["source_url"] if keep_src else page_url)
        sku_of[item_id] = sku
    for item_id, r in carried.items():
        rows[item_id] = (r["file"], r["source_url"])
        sku_of[item_id] = r["sku"]

    for s in skipped:
        print("skip:", s)
    for n in notes:
        print(n)
    unmatched = [it for it in items if it["id"] not in matches and it["id"] not in carried]
    for it in unmatched:
        if not any(it["id"] in s.split(":", 1)[0] for s in skipped):
            print(f"no photo: {it['id']} ({it['name']}): no Pret product record carries this name or variant")
    if args.dry_run:
        print(f"{len(matches)} of {len(items)} published items matched on today's pages, {len(carried)} more carried from an earlier run")
        photos = {m[0] for m in matches.values()}
        print(f"{len(photos)} distinct photos from {len({m[2] for m in matches.values()})} products")
        return 0

    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        before = {i: (r["file"], r["source_url"]) for i, r in prior.items()}
        unchanged = len(prior_dates) == 1 and all(before.get(i) == v for i, v in rows.items())
        ic.write_images_csv(CHAIN, rows, retrieved_on=next(iter(prior_dates)) if unchanged else None)
        if unchanged:
            print("every row kept is exactly as before (same photos, byte for byte, same pages; rows may only have been left out): "
                  "the earlier retrieved_on date is kept")
        elif carried:
            print(f"NOTE: write_images_csv dates every row today; the {len(carried)} carried rows were really retrieved on the dates "
                  "printed above")
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo ({len(rows) - len(carried)} from today's pages, "
          f"{len(carried)} carried)")
    for f, ids in ic.suspected_placeholders(rows).items():
        if len({sku_of[i] for i in ids}) > 1:
            print(f"LOOK: {f} is used by items of {len({sku_of[i] for i in ids})} different products: {', '.join(ids)}")
        else:
            print(f"shared: {f} is the one photo of a drink's {len(ids)} milk / decaf variants (normal): {', '.join(ids[:3])}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
