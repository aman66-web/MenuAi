#!/usr/bin/env python3
"""Item photos for Creams Cafe (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_creams_cafe.py --cache <dir> [--dry-run]

Source: the chain's own menu pages, https://www.creamscafe.com/menu/<category>/ (the 20 pages in PAGES, every link of the
site's menu bar). Each dish on those pages is one column holding its photo (served from the chain's own image bucket,
storage.googleapis.com/creams-website-media, which the site's WordPress "Stateless" plugin points at) and its printed name
(an <h6>) in the same column. The pages are split into sections by a title column ("Gelato", "Sorbet", "Premium Waffles",
"Soft Swirls Sundaes", "Hot Tea"...); the reader keeps the section each dish is printed under.

Match rule (exact, nothing fuzzy). A photo is attached to a published item (data/source/creams-cafe/items.csv minus
holdback.csv) only when
  1. the column that holds the photo prints the item's name, norm_name equality; or, in a section listed in SECTION_RULES,
     the printed name and the item's name are equal once ONE of them is completed with that section's own noun, the word the
     page's own section title gives it (the waffles page prints "Chocoholic" under "hot WAFFLES" for the item "Chocoholic
     Waffle"; the gelato section prints "Mint Chocolate Chip" for "Mint Chocolate Chip Gelato"; the sorbet section prints
     "Amalfi Lemon Sorbet" for the matrix's "Amalfi Lemon" listed under Sorbet). Nothing else is added, dropped or respelled;
  2. in a section listed in SECTION_RULES, the item belongs to one of the item categories the rule names (so a page section
     can only give photos to the same kind of dish: the gelato section never to a cake, the "under a fiver" soft swirl
     sundaes, which are the tub range, never to the Pepsi collab sundaes of the same names);
  3. every column that matches the item shows the same photo, and the column matches no other published item;
  4. the item is not in EXCLUDE (looked at and left out, reason given).
Sections in SKIP_SECTIONS are not read: the milkshakes page's "Scoop Shakes" columns name gelato FLAVOURS for a
build-your-own shake (several share one generic shake picture), not the gelato itself.
Names the site prints differently from the allergen matrix (the nutrition source) get no photo: "Bubble Gum Blue" vs
"Bubblegum Blue Gelato", "Creams Rocher" vs "Creams Rosher Gelato", "Strawberry Chocolate Indulgence" vs "Strawberry Choc
Indulgence Waffle", "BBQ Chicken Hot Pocket" vs "BBQ Chicken Pocket", "Pan Au Chocolate" vs "Pain Au Chocolat", the thick
shakes and bubble teas (the matrix lists a Regular and a Large of each, the site one picture per flavour), and so on: the
unmatched names are printed by every run.

Also looked at, 2026-11-17: the chain's own ordering app, linked from https://www.creamscafe.com/order-online/ as
https://creamscafe.5loyalty.com/order (and /order-to-table). Its menu JSON (https://hdl-eu-3.5loyalty.com/get_default_menu/
3987L1 and /ikentoo_menu/4144L1/location/<id>/collection, which the page loads; that host's robots.txt answers the app's
HTML, i.e. no rules) names many dishes exactly as the matrix does (e.g. "Hot N Cold Chocolate Cake Volcano", "Choc Tiramisu
Hot Pocket", "Madagascan Vanilla Cheesecake", "Rich Hot Chocolate", "Masala Chai"), but every photo in it is a file on
hybrid-direct-5l.s3.amazonaws.com, and that host answered HTTP 403 to two photo requests sent with the ordering page's own
referer. That is a refusal: nothing was fetched from it, nothing from that feed is used, and it was not worked round (no other
headers, no browser). If the bucket starts serving those files, a feed reader could add those dishes under the same rules.

robots.txt (https://www.creamscafe.com/robots.txt, read 2026-11-17): one group, `User-agent: *`, Disallow /calendar/action*,
/events/action*, /cdn-cgi*, /*? ; Crawl-delay: 3. No URL here has a query string and pages are fetched 3 seconds apart.
storage.googleapis.com/robots.txt answers 404 (no rules). polite_get checks robots.txt on every URL (RFC 9309).

Terms (read 2026-11-17): https://www.creamscafe.com/terms-and-conditions/ holds only the rules of a 2024 prize draw, and the
privacy policy has no clause on reusing the site's content; the pages carry "© Creams Franchising Ltd.". The ordering site's
terms of use (Creams Franchising Ltd, served to that site at https://hdl-eu-3.5loyalty.com/en/terms/creamscafe) say: "You
must not use any part of the materials on our Website for commercial purposes." and "You may print one copy and download
extracts of any pages from our Website for personal reference only. You must not modify the hard or soft copies of any
materials you have. You must not use any illustrations, photographs, video or audio sequences or any graphics from our Website
without the accompanying text." and "We are the owner or the licensee of all intellectual property rights in our Website and in
the material published on it." An express restriction; installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2, his
accepted risk).

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "creams-cafe"
BASE = "https://www.creamscafe.com/menu/"
PAGES = ["specials", "value-menu", "froffles", "under-5", "savoury", "gelato-sorbet-2", "kids", "sundaes", "waffles",
         "crepes", "hot-pockets", "cookie-dough-hot-puddings", "cakes-pastries", "milkshakes", "drinks", "hot-drinks",
         "bubble-tea-ice-cream-floats", "doughnuts", "vegan", "healthy"]
IMG_HOST = "https://storage.googleapis.com/creams-website-media/"

# (page slug, section title exactly as the page prints it; "*" = the whole page) -> (the section's noun, from its own title,
# or None; the item categories (items.csv `category`) the section's dishes may be). See the match rule in the docstring.
SECTION_RULES: dict[tuple[str, str], tuple[str | None, set[str]]] = {
    ("waffles", "*"): ("Waffle", {"Hot waffles"}),                                   # page title "hot WAFFLES"
    ("crepes", "*"): ("Crepe", {"Fresh crepes"}),                                    # page title "fresh crepes"
    ("gelato-sorbet-2", "Gelato"): ("Gelato", {"Gelato"}),
    ("gelato-sorbet-2", "Sorbet"): ("Sorbet", {"Sorbet"}),
    ("under-5", "Gelato and Sorbet"): (None, {"Gelato", "Sorbet"}),
    # the "under a fiver" soft swirl sundaes are the tub range (matrix p.11, e.g. "Chocolate and Strawberry Tub", 436 kcal; the
    # picture is a large tub), not the Pepsi collab sundaes (matrix p.26) the value menu shows: before 2026-11-17 the collab
    # "Strawberry and Chocolate Soft Swirl Sundae" (297 kcal) took this section's tub picture through the shared name.
    ("under-5", "Soft Swirl Sundaes"): (None, {"Soft swirled sundaes"}),
    ("under-5", "Frappes"): ("Frappe", {"Frappes"}),
    ("under-5", "Smoothie Pots"): ("Smoothie Pot", {"Smoothie pots"}),
    ("value-menu", "Soft Swirls Sundaes"): ("Soft Swirl Sundae", {"Pepsi collab: soft swirl sundaes"}),
    ("value-menu", "Pancake Bites"): (None, {"Value menu: stuffed pancake bites"}),
    ("cookie-dough-hot-puddings", "Premium Cookie Dough"): ("Cookie Dough", {"Cookie dough"}),
    ("cookie-dough-hot-puddings", "Warm, Gooey Cookie Dough"): ("Cookie Dough", {"Cookie dough"}),
    ("specials", "Goo Bakes"): ("Goo Bake", {"Winter: goo bakes"}),
    ("hot-drinks", "Hot Tea"): ("Tea", {"Tea"}),
    ("milkshakes", "Cold Frappes"): (None, {"Frappes"}),
    ("milkshakes", "Thick Shakes"): (None, {"Thick shakes"}),
}
SKIP_SECTIONS = {("milkshakes", "Scoop Shakes")}

# Looked at and left out so a rerun can't bring them back (item id -> reason).
EXCLUDE: dict[str, str] = {
    # the name matches, but the page that prints it is a different menu from the item's own (the Kids menu's "Stuffed Pancake
    # bites", 720 kcal, matched the Value menu's 3-bite "Stuffed pancake bites" with hazelnut filling and toffee sauce, 415 kcal
    # in the matrix: not shown to be the same dish). SECTION_RULES now also keeps that section to the value-menu item.
    "stuffed-pancake-bites": "the photo is the value menu's 3-bite portion, not the Kids menu dish",
}


def page_url(slug: str) -> str:
    return f"{BASE}{slug}/"


def _text(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def parse_page(doc: str) -> list[tuple[str, str, str]]:
    """[(section title, printed name, photo url)] for each column of the page that holds exactly one photo and exactly one
    heading. The section is the first text of the latest column that holds neither a photo nor a dish heading."""
    start = doc.find('id="Content"')
    end = doc.find("Quick Links", start)
    body = doc[start:end if end > 0 else len(doc)]
    cols = re.split(r'<div class="wpb_column vc_column_container', body)[1:]
    out = []
    section = ""
    for col in cols:
        imgs = [m for m in re.findall(r"<img\b[^>]*>", col) if 'src="' + IMG_HOST in m]
        heads = re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", col, flags=re.S)
        heads = [_text(h) for h in heads if _text(h)]
        h6 = [_text(h) for h in re.findall(r"<h6[^>]*>(.*?)</h6>", col, flags=re.S) if _text(h)]
        if not imgs and not h6:
            texts = [_text(t) for t in re.findall(r"<(?:p|h[1-5])\b[^>]*>(.*?)</(?:p|h[1-5])>", col, flags=re.S)]
            texts = [t for t in texts if t]
            if texts and "|" not in texts[0]:   # the menu bar ("SPECIALS | CRAVE & SAVE | ...") is not a section
                section = texts[0]
            continue
        if len(imgs) != 1 or len(heads) != 1:
            continue
        src = re.search(r'src="([^"]+)"', imgs[0]).group(1)
        out.append((section, heads[0], src))
    return out


def rule_for(slug: str, section: str) -> tuple[str | None, set[str]] | None:
    return SECTION_RULES.get((slug, section)) or SECTION_RULES.get((slug, "*"))


def keys(name: str, noun: str | None) -> set[str]:
    k = {ic.norm_name(name)}
    if noun:
        k.add(ic.norm_name(f"{name} {noun}"))
    return k


def entry_matches(item: dict, slug: str, section: str, printed: str) -> bool:
    rule = rule_for(slug, section)
    noun, cats = rule if rule else (None, None)
    if cats is not None and item["category"] not in cats:
        return False
    return bool(keys(printed, noun) & keys(item["name"], noun))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; store nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)

    entries: list[tuple[str, str, str, str, str]] = []  # (slug, section, printed name, photo url, page url)
    for slug in PAGES:
        url = page_url(slug)
        try:
            raw = ic.polite_get(url, args.cache, delay=3.0, accept="text/html,*/*;q=0.8")
        except ic.Blocked as e:
            print(f"BLOCKED: {e}")
            return 2
        except Exception as e:  # a missing page is not fatal
            print(f"skip {url}: {e}")
            continue
        found = parse_page(raw.decode("utf-8", "replace"))
        kept = [(slug, s, n, p, url) for s, n, p in found if (slug, s) not in SKIP_SECTIONS]
        print(f"{slug}: {len(found)} dishes with a photo" + (f" ({len(found) - len(kept)} in skipped sections)" if len(kept) != len(found) else ""))
        entries += kept

    # which published items each column names
    hits: dict[int, list[dict]] = {}
    for i, (slug, sec, n, _, _) in enumerate(entries):
        hits[i] = [it for it in items if entry_matches(it, slug, sec, n)]

    matches: dict[str, tuple[str, str, str]] = {}  # item_id -> (photo url, page url, printed name)
    ambiguous: dict[str, str] = {}
    for it in items:
        cands = [(entries[i][3], entries[i][4], entries[i][2]) for i, its in hits.items() if any(x["id"] == it["id"] for x in its)]
        if not cands:
            continue
        shared = [entries[i][2] for i, its in hits.items() if len(its) > 1 and any(x["id"] == it["id"] for x in its)]
        if shared:
            ambiguous[it["id"]] = f"the column(s) {sorted(set(shared))} name more than one published item"
            continue
        if len({p for p, _, _ in cands}) > 1:
            ambiguous[it["id"]] = f"the site shows {len({p for p, _, _ in cands})} different photos under this name"
            continue
        if it["id"] in EXCLUDE:
            continue
        matches[it["id"]] = cands[0]

    print(f"\n{len(entries)} dish entries on {len(PAGES)} pages; {len(matches)} of {len(items)} published items have a photo")
    for iid, why in sorted(ambiguous.items()):
        print(f"  ambiguous, no photo: {iid}: {why}")
    for iid, why in sorted(EXCLUDE.items()):
        print(f"  excluded: {iid}: {why}")
    for iid, (p, page, n) in sorted(matches.items()):
        print(f"  {iid:55s} <- '{n}' ({page.rsplit('/', 2)[-2]})  {p.rsplit('/', 1)[-1]}")
    unmatched = sorted({f"{n}  [{slug}: {sec}]" for i, (slug, sec, n, _, _) in enumerate(entries) if not hits[i]})
    print(f"\nprinted names on the site that name no published item ({len(unmatched)}):")
    for n in unmatched:
        print("  ", n)
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    for iid, (p, page, n) in sorted(matches.items()):
        if p not in stored:
            try:
                raw = ic.polite_get(p, args.cache, delay=1.0, referer=page)
                stored[p] = ic.store_image(CHAIN, raw)
            except ic.Blocked as e:
                print(f"BLOCKED: {e}")
                return 2
            except Exception as e:
                print(f"skip {iid}: {e}")
                stored[p] = ""
        if stored[p]:
            rows[iid] = (stored[p], page)
    ic.write_images_csv(CHAIN, rows)
    total = sum(f.stat().st_size for f in (ic.IMAGES_ROOT / CHAIN).glob("*.webp")) if (ic.IMAGES_ROOT / CHAIN).is_dir() else 0
    print(f"\nstored {len(rows)} items with a photo, {len(set(f for f, _ in rows.values()))} files, {total/1024:.0f} KB")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"shared by {len(ids)} items: {f} -> {ids}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
