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
an SVG, or under 200 px are skipped. Photos that print nutrition numbers or claims, or whose uploaded file is named after a
different product, are listed in SKIP_FILES (by asset id or file name).

Terms (https://www.pret.co.uk/en-GB/terms-and-conditions, read 2026-10-07):
  7.1 "All copyright, trade marks and all other intellectual property rights in and to the Website, the App and their content
      (including without limitation the Website and App design, text, graphics and all software and source codes connected with
      the Platform) are owned by or licensed to Pret or otherwise used by Pret as permitted by law."
  7.2 "In accessing the Platform you agree that you will access the content solely for your personal, non-commercial use. None of
      the content may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without our prior written consent.
      This excludes the downloading, copying and/or printing of pages of the Website for personal, non-commercial home use only."
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2; the founder's accepted risk); Pret's photos come down the
day Pret asks (delete web/public/menu-images/pret/ and data/source/pret/images.csv).
robots.txt (www.pret.co.uk, read 2026-10-07): "User-agent: * / Disallow: /fr-FR / Disallow: /zh-HK / Disallow: /en-HK /
Disallow: /en-US" (we only use /en-GB). images.ctfassets.net/robots.txt answers 404 (no rules). polite_get checks both on every URL.

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written. A dropped connection or a 5xx is retried
twice after a pause (10 s, 30 s): that is ordinary network trouble, never a way round a block.
"""
from __future__ import annotations

import argparse
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
# Photos that are not used, and why. A key is a Contentful asset id (the 21-22 character folder in the photo URL; unique per
# upload) or a file name, and matches any photo URL that contains it. Look at the stored photos before changing this.
SKIP_FILES: dict[str, str] = {
    # Pret's own record gives these two products a photo whose uploaded file is named after a DIFFERENT drink (the file name is
    # Pret's own label for the picture; the other product has its own upload under the same name). We cannot tell from the
    # chain's page alone that the picture shows the right flavour, so they get no photo until someone has looked at them:
    # delete the two lines to include them.
    "ffuK4PTWA6iuow1fSJYnW": "Caramel Frappe: the uploaded file is named 0000_HazelnutFrappe_NVBI_1080_01.png (the Hazelnut Frappe's name)",
    "5dpDrQu3ca4Prfdtjf3FTF": "Frozen Hot Chocolate: the uploaded file is named 0000_MochaFrappe_NVBI_1080_02.png (the Mocha Frappe's name)",
}

# Variant labels, as the site's own barista flags name them (the same words the published item names use).
MILK_FLAGS = {"isBlack": "black", "milkIsOat": "oat milk", "milkIsSemiSkimmed": "semi-skimmed milk",
              "milkIsSkimmed": "skimmed milk", "milkIsSoya": "soya milk", "milkIsHalfAndHalf": "half and half",
              "milkIsWhole": "whole milk", "milkIsAlmond": "almond milk"}


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


# ---------------------------------------------------------------- names

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


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the pages only; print the matches; write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
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

    matches: dict[str, tuple[str, str, str, str]] = {}       # item id -> (photo url, page url, sku, how)
    for it in items:
        got = claims.get(ic.norm_name(it["name"]))
        if not got:
            continue
        if len(got) > 1:
            skipped.append(f"{it['id']}: the name is claimed by {len(got)} products ({', '.join(sorted(got))}), ambiguous, no photo")
            continue
        (sku, (p, how)), = got.items()
        img = p.get("image") or {}
        src = img.get("src") or ""
        photo = abs_url(src)
        fname = photo.rsplit("/", 1)[-1]
        if not src:
            skipped.append(f"{it['id']}: product {sku} has no photo")
        elif photo in placeholders or fname.lower().endswith(".svg") or not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            skipped.append(f"{it['id']}: product {sku} shows the site's placeholder or a non-photo file ({fname})")
        elif not photo.startswith(f"https://{PHOTO_HOST}/"):
            skipped.append(f"{it['id']}: photo host is not {PHOTO_HOST} ({photo})")
        elif min(img.get("width") or 0, img.get("height") or 0) < ic.MIN_SIDE:
            skipped.append(f"{it['id']}: photo {fname} is smaller than {ic.MIN_SIDE}px")
        elif any(k in photo for k in SKIP_FILES):
            why = next(v for k, v in SKIP_FILES.items() if k in photo)
            skipped.append(f"{it['id']}: {fname} skipped: {why}")
        elif sku not in links:
            skipped.append(f"{it['id']}: no product page link for {sku} on the category pages")
        elif ic.norm_name(links[sku].rsplit("/", 1)[-1].replace("-", " ")) != ic.norm_name(p["name"]):
            skipped.append(f"{it['id']}: the product page link ({links[sku]}) does not name {p['name']!r}")
        else:
            matches[it["id"]] = (photo, links[sku], sku, how)

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
            rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            sku_of[item_id] = sku
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing more written; images.csv not updated): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")
        except (OSError, http.client.HTTPException) as e:
            skipped.append(f"{item_id}: {photo}: could not be downloaded ({e!r})")

    for s in skipped:
        print("skip:", s)
    unmatched = [it for it in items if it["id"] not in matches]
    for it in unmatched:
        if not any(it["id"] in s.split(":", 1)[0] for s in skipped):
            print(f"no photo: {it['id']} ({it['name']}): no Pret product record carries this name or variant")
    if args.dry_run:
        print(f"{len(matches)} of {len(items)} published items matched")
        photos = {m[0] for m in matches.values()}
        print(f"{len(photos)} distinct photos from {len({m[2] for m in matches.values()})} products")
        return 0

    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        if len({sku_of[i] for i in ids}) > 1:
            print(f"LOOK: {f} is used by items of {len({sku_of[i] for i in ids})} different products: {', '.join(ids)}")
        else:
            print(f"shared: {f} is the one photo of a drink's {len(ids)} milk / decaf variants (normal): {', '.join(ids[:3])}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
