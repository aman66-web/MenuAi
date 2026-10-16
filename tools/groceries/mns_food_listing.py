#!/usr/bin/env python3
"""Every product of M&S's "Foodhall" catalogue (the "M&S Food Catalogue" at https://www.marksandspencer.com/food), read from the shop's own aisle pages.

Founder's request (2026-10-16): "M&S definetly has more products add the rest of them please". Today the M&S list holds only the 194 priced food-to-order,
gift and Christmas products (data/groceries/listing/marks-and-spencer.csv). The big range (about 6,000 products, ids "fdp<digits>") has **no price in its aisle
lists** (every price field of every tile is empty; M&S's own product page says "Select your store", and what it shows once a store is chosen was not looked at), so,
like Lidl's everyday range (tools/groceries/lidl_range.py), each product is listed with its name, pack size (when M&S prints one), photo and a link, and the app says
"Price in store". Nothing is estimated: no price, no barcode, no nutrition, no allergens are read or invented here (those would be a separate, much larger job).

    python3 tools/groceries/mns_food_listing.py read                  # the crawl: about 81 aisle pages, 1 request a second, resumable
    python3 tools/groceries/mns_food_listing.py read --only eggs      # one aisle (a dry run of about 3 requests: --only chilled-desserts)
    python3 tools/groceries/mns_food_listing.py read --redo eggs      # forget one aisle's pages and read them again
    python3 tools/groceries/mns_food_listing.py write                 # the lists -> data/groceries/listing/marks-and-spencer-food.csv (+ coverage, summary)
    python3 tools/groceries/mns_food_listing.py write --partial       # a crawl that stopped part way: the aisles read in full, and the pages read of an unfinished one

Where it comes from: each aisle page https://www.marksandspencer.com/food/l/<aisle> (and ?page=N, 96 products a page) is server-rendered; its
<script id="__NEXT_DATA__"> JSON holds the products (id, title, pack size, brand, product page path, picture) and the paging (total items, total pages).
The price fields of every tile are null. Only those few fields are kept, in data/groceries/listing/raw/marks-and-spencer-food.jsonl (one line per product
and one per page); the pages themselves are never stored (the temporary cache is deleted).

Rules (hard; the run STOPS, keeps what it has and exits 2, and never works round anything):
  * robots.txt is read first (HTTP 200, the rules parsed); every URL is checked against it with the RFC 9309 matcher (tools/uk_extract/robots_rfc.py) before it
    is fetched. Used: /food/l/<aisle> and ?page=N only. Never used: /*pgNumber, /*prefn1, /*prefv1, /*srule=, /*productId=, /*quickView=, any search path,
    any path with a colon, /offers/, and no product page is fetched at all (links only).
  * 1 request a second, one at a time, the repo's browser User-Agent unchanged, no cookies, no proxy, no rotating addresses or agents, no side channel
    (tools/uk_extract/images_common.polite_get). A 401, 403 or 429, any 5xx, a connection that still fails after polite_get's two retries, a bot-check or
    challenge page, a robots.txt that now answers 401/429/5xx, disallows /food/l/ or names an AI crawler, a page that fails the checks below, more than 100
    page requests in one run, or 'shop:marks-and-spencer' in web/public/logos/hidden.json: STOP. A response cut short or a garbled reply (http.client
    errors) is a dropped connection: asked again twice by polite_get, then STOP like any other connection that still fails.
  * Page checks: at least 50 KB; a __NEXT_DATA__ block that parses; ranged products and paging of the shape above; the first item number equals
    (page - 1) * 96 + 1 (a request past the last page, or a redirect, would silently give page 1 again); the printed total within 0.8x to 1.25x of the
    count seen on 2026-10-16 (the table below); page 1's page count within 2 of that count's; no challenge words. A product tile whose id, product path,
    picture or title doesn't have the expected shape is skipped and counted; more than 1% of a page skipped (one odd tile on a page of up to 199 tiles
    is tolerated and counted, two stop the run) means the format changed. A tile with **no pack size** is valid: M&S prints none for things sold by the
    piece ("Pain Aux Raisins", "Palmier"), and the product is listed by its name alone (an empty pack size was once taken for a format change and stopped
    the crawl on Bakery & Cakes page 3).

Which aisles (UNITS, in this order; the first aisle to list a product gives it its category): the 14 food aisles, Hot Drinks and Soft Drinks from Drinks, Kids'
Food & Snacks, then the overlap collections Picky Bits and Halloween Food (additions only). "Meat Alternatives" is read first so its products are labelled
meat-free for the diet filter. **Not crawled** (this script never requests them and keeps nothing from them): Drinks as a whole, Alcoholic Drinks, Wine, Household,
Pet Supplies, Baby Changing, Christmas Groceries In Store (it holds Festive Household and gift lines), New In, Home of Health, Remarksable Value, Food brands, Home of
Dine In, gift lists: no alcohol, groceries only (the builder's is_alcohol and not_food backstops still run on every row). Before this script was written a scouting
step read the first page of some of those aisles once, only for the total each prints (raw/marks-and-spencer-food_categories.txt). Accepted losses: alcohol-free
lines that sit in the alcoholic aisle.

`write` needs every page of every aisle (else it lists what is missing and exits 1), checks that each aisle's distinct products reach 98% of the total its page
printed and that every page's tile lines add up to the tiles its page line says were kept (also with --partial: a line the file lost is never written round),
keeps each product once (first aisle wins), drops the ids in marks-and-spencer-food-exclude.csv (product_id,reason) and the products whose name
equals a priced row's name in marks-and-spencer.csv (a product whose id is also priced stays in the file and the builder keeps the priced row), and writes
the 11-column listing format of marks-and-spencer.csv with the price columns EMPTY:
  product_id (fdp<digits>), name (M&S's title, a brand put first when the title doesn't start with it and the brand is a maker or range name, not a claim such as
  "High Protein" or "Nutrient Dense" and the title does not already name it, then the pack size as M&S prints it unless the title already has that same
  size), category_path
  (the aisle), page_url (the product's own page), image_url (M&S's own picture at 400 px, resized there, never cropped), checked_on (the UTC day it was read).
`write --partial` is for a crawl that STOPPED (a stop rule is never worked round, so it can leave aisles unread): the aisles read in full are written as above;
an aisle read in part gives the products of the pages read (its 98% gate is not applied); an aisle not read at all gives none. The coverage csv says so for every
aisle (status complete / partial / not read, "collected X of Y"), so nobody can mistake the list for the whole range. Nothing else changes: still no price, no
barcode, no nutrition.
Tile labels ("Eat Well", "New In", ...) are never copied (CLAUDE.md rule 3).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import http.client
import json
import math
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402
import robots_rfc  # noqa: E402

HOST = "www.marksandspencer.com"
BASE = "https://" + HOST
PAGE_SIZE = 96
MAX_PAGES_PER_UNIT = 30
MAX_REQUESTS = 100            # page requests in one run
MIN_BODY = 50_000
BAND = (0.8, 1.25)            # the printed total against the count seen on 2026-10-16
COVERAGE_GATE = 0.98          # `write`: distinct products of an aisle against the total its page printed
ROWS_RANGE = (5_000, 7_500)   # `write`: sanity band for the whole list
ROWS_RANGE_PARTIAL = (1_000, 7_500)  # `write --partial`: a crawl that stopped part way
IMAGE_BASE = "https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/"

LISTING = ROOT / "data" / "groceries" / "listing"
RAW = LISTING / "raw"
OUT = LISTING / "marks-and-spencer-food.csv"
COVERAGE = LISTING / "marks-and-spencer-food-coverage.csv"
EXCLUDE = LISTING / "marks-and-spencer-food-exclude.csv"
PRICED = LISTING / "marks-and-spencer.csv"
HIDDEN = ROOT / "web" / "public" / "logos" / "hidden.json"
HEADER = ["product_id", "name", "price_gbp", "unit_price_gbp", "unit", "member_price_gbp", "member_scheme", "category_path", "page_url", "image_url", "checked_on"]


class Unit(NamedTuple):
    slug: str
    label: str
    expected: int | None   # the count the aisle page printed on 2026-10-16 (None: not known)
    additions_only: bool = False


# Table order = dedupe priority (the first aisle to list a product gives it its category).
UNITS = [
    Unit("meat/meat-alternatives", "Meat Alternatives", None),
    Unit("fruit-and-vegetables", "Fruit & Vegetables", 608),
    Unit("meat", "Meat", 414),
    Unit("poultry", "Poultry", 122),
    Unit("cured-and-ready-to-eat-meats", "Cured & Ready to Eat Meats", 125),
    Unit("fish-and-seafood", "Fish & Seafood", 167),
    Unit("dairy", "Dairy", 441),
    Unit("eggs", "Eggs", 36),
    Unit("deli", "Deli", 283),
    Unit("food-on-the-move", "Food on the Move", 345),
    Unit("chilled-desserts", "Chilled Desserts", 131),
    Unit("ready-to-cook", "Ready to Cook", 701),
    Unit("food-cupboard", "Food Cupboard", 1794),
    Unit("bakery-and-cakes", "Bakery & Cakes", 414),
    Unit("frozen-food", "Frozen Food", 325),
    Unit("drinks/hot-drinks", "Hot Drinks", 130),
    Unit("drinks/soft-drinks", "Soft Drinks", 212),
    Unit("kids-toddler-and-baby-products/kids-food-and-snacks", "Kids' Food & Snacks", 25),
    Unit("picky-bits", "Picky Bits", 266, True),
    Unit("halloween-food", "Halloween Food", 36, True),
]
BY_SLUG = {u.slug: u for u in UNITS}
ORDER = {u.slug: i for i, u in enumerate(UNITS)}

# Never requested (see the docstring). The table is checked against this at import and by the tests.
FORBIDDEN_SLUG = re.compile(r"alcohol|wine|beer|spirit|cider|household|pet-supplies|baby-changing|christmas|festive|new-in|home-of-health|ways-to-save|"
                            r"food-brands|dine-in|hamper|gift|:|0-off|5-off|pgnumber|prefn|prefv|srule|search|offers|multi", re.I)
FORBIDDEN_WHOLE = {"drinks", "kids-toddler-and-baby-products", "ready-to-eat-meats"}
AI_AGENT = re.compile(r"claude|anthropic|gpt|openai|ccbot|google-extended|perplexity|bytespider|cohere|diffbot|omgili|applebot-extended|meta-externalagent|ai2bot|youbot", re.I)
CHALLENGE = re.compile(r"access denied|reference #|captcha|verify you are human|unusual traffic|pardon our interruption|just a moment", re.I)

NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
TITLE_TAG = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
ID_RE = re.compile(r"\d{6,10}")
SEO_RE = re.compile(r"/food/[a-z0-9\-_.%]+/p/fdp\d+")
IMG_RE = re.compile(r"[0-9a-f]{32}\.jpg")
SIZE_TOKEN = re.compile(r"\b\d+(?:\.\d+)?\s?(?:kg|g|ml|cl|l|ltr|litres?)\b", re.I)
PAGE_QUERY = re.compile(r"page=([1-9]\d?)")


class Stop(Exception):
    """A stop rule fired: keep what we have, report, never work round it."""

    def __init__(self, url: str, reason: str):
        super().__init__(f"{url} {reason}")
        self.url, self.reason = url, reason


def assert_units_safe() -> None:
    for u in UNITS:
        if u.slug in FORBIDDEN_WHOLE or FORBIDDEN_SLUG.search(u.slug):
            raise AssertionError(f"forbidden aisle in UNITS: {u.slug}")


assert_units_safe()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- addresses

def page_url(unit: Unit, page: int) -> str:
    return f"{BASE}/food/l/{unit.slug}" + (f"?page={page}" if page > 1 else "")


def allowed_url(url: str, total_pages: int | None = None) -> bool:
    """The allow-list: https, this host, exactly /food/l/<an aisle of UNITS>, and no query or exactly page=N with 2 <= N <= total_pages (30 at most)."""
    u = urllib.parse.urlsplit(url)
    if u.scheme != "https" or u.netloc != HOST or u.fragment or not u.path.startswith("/food/l/"):
        return False
    slug = u.path[len("/food/l/"):]
    if slug not in BY_SLUG:
        return False
    if not u.query:
        return True
    m = PAGE_QUERY.fullmatch(u.query)
    return bool(m) and total_pages is not None and 2 <= int(m.group(1)) <= min(total_pages, MAX_PAGES_PER_UNIT)


# ---------------------------------------------------------------- names

def clean_title(s: str | None) -> str:
    """M&S's title as plain text: entities decoded, tags like <br /> dropped, the TM / R / C-in-circle marks and the broken 'andtrade;' style fragments removed."""
    s = s or ""
    for _ in range(3):
        t = html.unescape(s)
        if t == s:
            break
        s = t
    s = re.sub(r"<[^>]*>", " ", s)
    for ch in ("™", "®", "©"):
        s = s.replace(ch, "")
    for frag in ("andtrade;", "andreg;", "andcopy;"):
        s = s.replace(frag, "")
    return " ".join(s.split())


def norm_name(s: str) -> str:
    """Exact-match key for 'is this the same product name as a priced row?': case, '&'/'and', punctuation and spacing ignored; a leading 'M&S' dropped."""
    s = clean_title(s).lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = " ".join(s.split())
    for lead in ("marks and spencer ", "m and s "):
        if s.startswith(lead):
            s = s[len(lead):]
            break
    return s


def _words(s: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s.lower().replace("&", " and ")).split())


# Tile "brands" that are a claim or a label rather than a maker or a range name ("High Protein", "Nutrient Dense", "Brain Food", "Eat Well", ...): CLAUDE.md rule 3 says
# the app never calls food healthy or good, and we have not read these products' numbers, so such a brand is never put in front of M&S's own title
# (a title M&S itself starts with the words, "Nutrient Dense 35 Plants Salad", is shown exactly as M&S prints it).
CLAIM_BRAND = re.compile(r"\b(?:high protein|nutrient dense|brain food|good gut|made without|eat well|free from|healthy|health|wellness|superfood|boost|immun\w*|detox|diet|"
                         r"slimming|skinny|low (?:fat|sugar|calorie)|only\b.*\bingredients)\b|[\u2026]", re.I)


def _squash(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower().replace("&", "and"))


def _starts_with(title_words: list[str], brand_words: list[str]) -> bool:
    """Whether the title begins with the brand, spaces and punctuation ignored ("Taste Buds" / "Tastebuds Pears", "M&S" / "M & S")."""
    target, acc = _squash(" ".join(brand_words)), ""
    for w in title_words:
        acc += _squash(w)
        if acc == target:
            return True
        if len(acc) >= len(target) or not target.startswith(acc):
            return False
    return False


def _names_brand(name: str, brand: str) -> bool:
    """Whether the title already names the brand somewhere (whole words, case, '&' and punctuation ignored): "Scottish Organic Large Eggs" / "Organic",
    "Reduced Sugar Percy Pig Sweets" / "Percy Pig". Putting the brand in front again would write it twice."""
    b = _words(brand)
    return bool(b) and f" {b} " in f" {_words(name)} "


def _size_key(s: str) -> str:
    """A pack size as a comparison key: "1.5 Litres" / "1.5ltr" / "1.5 l" are one size, "800g" / "800 g" too."""
    s = re.sub(r"\s+", "", s.lower())
    return re.sub(r"(?:litres?|ltr)$", "l", s)


def row_name(title: str, brand: str, weight: str) -> str:
    """The name shown: M&S's title, the brand first when the title doesn't start with it or name it (and the brand is a name, not a claim), then the pack size
    exactly as M&S prints it (unless the title already has that same size; a size in the title that is something else, such as the "6g" of "6g Protein ...", is
    not the pack size). A product M&S prints no pack size for is shown by its name alone."""
    name = clean_title(title)
    b = clean_title(brand)
    if b and not CLAIM_BRAND.search(b):
        bw, tw = b.split(), name.split()
        nb, nt = [_words(w) for w in bw], [_words(w) for w in tw]
        if not _starts_with(tw, bw) and not _names_brand(name, b):
            # M&S prints brand "M&S Collection" with title "Collection Mini Macaroons": the words the two share at the join are written once
            k = max((k for k in range(min(len(nb), len(nt)), 0, -1) if nb[-k:] == nt[:k]), default=0)
            name = " ".join(bw[:len(bw) - k] + tw)
    w = clean_title(weight)
    if w and _size_key(w) not in {_size_key(m.group(0)) for m in SIZE_TOKEN.finditer(name)}:
        name = f"{name} {w}"
    return name


# ---------------------------------------------------------------- reading a page

def _dig(d, *path):
    for k in path:
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def tile_problem(raw) -> str | None:
    """Why a tile doesn't have the expected shape ("id", "seoUrl", "imageUrl", "title"), or None when it does. The pack size ("weight") may be empty: M&S prints
    none for things sold by the piece (a pain aux raisins, a palmier, a pretzel), and such a product is listed by its name alone."""
    if not isinstance(raw, dict):
        return "not an object"
    pid = str(raw.get("id") or "").strip()
    seo = str(raw.get("seoUrl") or "").strip()
    img = str(raw.get("imageUrl") or "").strip()
    if not ID_RE.fullmatch(pid):
        return "id"
    if not SEO_RE.fullmatch(seo) or not seo.endswith("/p/fdp" + pid):
        return "seoUrl"
    if not IMG_RE.fullmatch(img):
        return "imageUrl"
    if len(clean_title(raw.get("title") if isinstance(raw.get("title"), str) else "")) < 2:
        return "title"
    return None


def read_tile(raw) -> dict | None:
    """One product tile -> the few fields kept, or None when the tile doesn't have the expected shape (skipped and counted)."""
    if tile_problem(raw):
        return None
    brand = raw.get("brand") if isinstance(raw.get("brand"), str) else ""
    weight = raw.get("weight") if isinstance(raw.get("weight"), str) else ""   # empty when M&S prints no pack size
    return {"id": str(raw["id"]).strip(), "title": raw["title"], "weight": weight, "brand": brand, "seo": raw["seoUrl"].strip(), "img": raw["imageUrl"].strip()}


def parse_page(url: str, unit: Unit, page: int, body: str) -> dict:
    """Validate one aisle page (see the docstring) and return {"tiles", "skipped", "priced", "unranged", "pagination", "buildId", "warnings"}; raises Stop."""
    head = body[:4096]
    tm = TITLE_TAG.search(body)
    title = tm.group(1) if tm else ""
    if CHALLENGE.search(head) or CHALLENGE.search(title):
        raise Stop(url, "a bot-check or challenge page came back")
    if len(body) < MIN_BODY:
        raise Stop(url, f"the page is only {len(body)} bytes (expected at least {MIN_BODY})")
    m = NEXT_DATA.search(body)
    if not m:
        raise Stop(url, "no __NEXT_DATA__ block in the page")
    try:
        data = json.loads(m.group(1))
    except ValueError as e:
        raise Stop(url, f"__NEXT_DATA__ is not JSON ({e})")
    lists = _dig(data, "props", "pageProps", "viewModel", "productSearch", "productLists")
    pag = _dig(data, "props", "pageProps", "viewModel", "productSearch", "pagination")
    ranged = lists.get("ranged") if isinstance(lists, dict) else None
    if not isinstance(ranged, list) or not isinstance(pag, dict):
        raise Stop(url, "the page has no ranged product list or paging (the format changed)")
    ints = {}
    for k in ("totalItems", "totalPages", "pageFirstItemNum", "pageLastItemNum"):
        v = pag.get(k)
        if not isinstance(v, int) or isinstance(v, bool) or v < 0:
            raise Stop(url, f"paging field {k} is {v!r}, not a number (the format changed)")
        ints[k] = v
    if ints["pageFirstItemNum"] != (page - 1) * PAGE_SIZE + 1:
        raise Stop(url, f"page {page} starts at item {ints['pageFirstItemNum']}, expected {(page - 1) * PAGE_SIZE + 1} (a redirect or a different page came back)")
    if page > ints["totalPages"]:
        raise Stop(url, f"page {page} is past the last page ({ints['totalPages']})")
    # the page must say it is this aisle and this page (a redirect to another aisle or another host shows here, since polite_get follows redirects silently)
    canon = _dig(data, "props", "pageProps", "viewModel", "canonicalUrl")
    if isinstance(canon, str) and canon:
        cu = urllib.parse.urlsplit(canon)
        if cu.scheme != "https" or cu.netloc != HOST or cu.path != "/food/l/" + unit.slug:
            raise Stop(url, f"the page says it is {canon}, not the aisle asked for (a redirect)")
    q = data.get("query")
    if isinstance(q, dict):
        cats, qpage = q.get("categories"), q.get("page")
        if isinstance(cats, list) and cats and "/".join(str(c).lower() for c in cats) != unit.slug:
            raise Stop(url, f"the page is for aisle {'/'.join(map(str, cats))}, not {unit.slug} (a redirect)")
        if qpage is not None and str(qpage) != str(page):
            raise Stop(url, f"the page says it is page {qpage}, not page {page} (a redirect)")
    warnings: list[str] = []
    if unit.expected:
        lo, hi = BAND[0] * unit.expected, BAND[1] * unit.expected
        if not lo <= ints["totalItems"] <= hi:
            raise Stop(url, f"the page prints {ints['totalItems']} items; {unit.label} had {unit.expected} on 2026-10-16 (allowed {math.floor(lo)} to {math.ceil(hi)})")
        if page == 1 and abs(ints["totalPages"] - math.ceil(unit.expected / PAGE_SIZE)) > 2:
            raise Stop(url, f"{ints['totalPages']} pages; expected about {math.ceil(unit.expected / PAGE_SIZE)}")
    if ints["totalPages"] > MAX_PAGES_PER_UNIT:
        raise Stop(url, f"{ints['totalPages']} pages is over the cap of {MAX_PAGES_PER_UNIT}")
    if page < ints["totalPages"] and len(ranged) < 90:
        warnings.append(f"page {page}: only {len(ranged)} tiles on a page that is not the last")
    tiles, skipped, priced, why = [], 0, 0, []
    for raw in ranged:
        if isinstance(raw, dict) and (raw.get("price") is not None or raw.get("unitPrice") is not None):
            priced += 1
        problem = tile_problem(raw)
        if problem:
            skipped += 1
            # the id, the field that failed and its value are noted (no other content), so a stop can be understood without fetching the page again
            why.append(f"{raw.get('id') if isinstance(raw, dict) else '?'}: {problem}" + (f" = {str(raw.get(problem))[:60]!r}" if isinstance(raw, dict) and problem in ("imageUrl", "seoUrl") else ""))
        else:
            tiles.append(read_tile(raw))
    if skipped > max(1, len(ranged) // 100):
        raise Stop(url, f"{skipped} of {len(ranged)} tiles don't have the expected shape (the format changed): " + "; ".join(why[:5]))
    unr = lists.get("unranged")
    return {"tiles": tiles, "seen": len(ranged), "skipped": skipped, "priced": priced, "unranged": len(unr) if isinstance(unr, list) else 0,
            "pagination": ints, "buildId": data.get("buildId") or "", "warnings": warnings, "skipped_why": why}


# ---------------------------------------------------------------- state (the jsonl)

def file_lines(path: Path) -> list[tuple[int, str]]:
    """(line number, text) of every non-empty line of the jsonl. Split on "\\n" ONLY: str.splitlines() also splits on U+2028, U+2029 and U+0085, which
    json.dumps(ensure_ascii=False) writes raw, so a title holding one would be cut in two and silently lost."""
    if not path.exists():
        return []
    return [(n, line) for n, line in enumerate(path.read_text(encoding="utf-8").split("\n"), 1) if line.strip()]


def parse_lines(path: Path) -> list[tuple[str, dict]]:
    """[(line, record)] of the jsonl. A last line that is not JSON is a run cut off mid-write and is ignored (the page is read again); a bad line anywhere
    else is a damaged file and stops everything (a lost tile line would otherwise go unnoticed)."""
    rows = file_lines(path)
    out: list[tuple[str, dict]] = []
    for i, (n, line) in enumerate(rows):
        try:
            out.append((line, json.loads(line)))
        except ValueError:
            if i == len(rows) - 1:
                continue
            raise SystemExit(f"{path}: line {n} is not JSON and is not the last line: the file is damaged; run `read --redo <aisle>` for the aisle it belongs to")
    return out


def load_state(path: Path, *, repair: bool = True):
    """({(slug, page): page line}, {(slug, page): [tile lines]}) from the jsonl. Tile lines of a page whose page line was never written (a run cut off
    mid-page) are dropped from the file, so the page is read again cleanly."""
    pages: dict[tuple[str, int], dict] = {}
    tiles: dict[tuple[str, int], list[dict]] = {}
    lines: list[tuple[str, dict]] = []
    if path.exists():
        for line, r in parse_lines(path):
            lines.append((line, r))
            key = (r.get("unit"), r.get("page"))
            if r.get("k") == "page":
                if key in pages:
                    raise SystemExit(f"{path}: page {key} appears twice; run `read --redo {key[0]}`")
                pages[key] = r
            elif r.get("k") == "tile":
                tiles.setdefault(key, []).append(r)
    orphans = [k for k in tiles if k not in pages]
    if orphans and repair:
        keep = [line for line, r in lines if (r.get("unit"), r.get("page")) in pages or r.get("k") == "page"]
        _rewrite(path, keep)
        for k in orphans:
            del tiles[k]
    return pages, {k: v for k, v in tiles.items() if k in pages}


def _rewrite(path: Path, lines: list[str]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text("".join(x + "\n" for x in lines), encoding="utf-8")
    os.replace(tmp, path)


def forget_unit(path: Path, slug: str) -> list[str]:
    """Drop one aisle's lines from the jsonl and return them (the caller puts them back if the re-read cannot start or stops before reading a page)."""
    if not path.exists():
        return []
    keep, dropped = [], []
    for line, r in parse_lines(path):
        (dropped if r.get("unit") == slug else keep).append(line)
    _rewrite(path, keep)
    return dropped


def restore_unit(path: Path, slug: str, lines: list[str]) -> bool:
    """Put an aisle's old lines back when the re-read of it wrote no page at all (a run that stopped first must not cost the pages already read)."""
    if not lines or any(r.get("unit") == slug for _, r in parse_lines(path)):
        return False
    with open(path, "a", encoding="utf-8") as f:
        f.write("".join(x + "\n" for x in lines))
    return True


# ---------------------------------------------------------------- fetching

def preflight() -> list[tuple[str, str]]:
    """robots.txt must answer 200 with rules, allow what we use, disallow what we don't, and name no AI crawler. Returns the parsed rules."""
    url = BASE + "/robots.txt"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ic.UA}), timeout=20) as r:
            status, text = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise Stop(url, f"robots.txt answered HTTP {e.code}")
    except (urllib.error.URLError, OSError, http.client.HTTPException) as e:
        raise Stop(url, f"robots.txt could not be read ({e!r})")
    if status != 200:
        raise Stop(url, f"robots.txt answered HTTP {status}")
    rules = robots_rfc.parse(text)
    if len(rules) < 20:
        raise Stop(url, f"robots.txt has only {len(rules)} rules for all crawlers; expected the shop's real file")
    for m in re.finditer(r"(?im)^\s*user-agent\s*:\s*(.+?)\s*$", text):
        if m.group(1) != "*" and AI_AGENT.search(m.group(1)):
            raise Stop(url, f"robots.txt now has a group for {m.group(1)!r}")
    checks = {"/food/l/food-cupboard?page=2": True, "/food/l/x?pgNumber=2": False, "/search?searchTerm=x": False}
    for path, want in checks.items():
        if robots_rfc.allowed(rules, path) != want:
            raise Stop(url, f"robots.txt reads differently than expected for {path}")
    for u in UNITS:
        for q in ("", "?page=2"):
            if not robots_rfc.allowed(rules, f"/food/l/{u.slug}{q}"):
                raise Stop(url, f"robots.txt now disallows /food/l/{u.slug}{q}")
    return rules


def shop_taken_down() -> bool:
    try:
        return "shop:marks-and-spencer" in (json.loads(HIDDEN.read_text(encoding="utf-8")).get("hidden") or [])
    except (OSError, ValueError):
        return False


class Run:
    def __init__(self, rules, cache: Path, keep: bool = False):
        self.rules, self.cache, self.keep, self.requests = rules, cache, keep, 0

    def fetch(self, unit: Unit, page: int, total_pages: int | None) -> tuple[str, str]:
        url = page_url(unit, page)
        if not allowed_url(url, total_pages):
            raise Stop(url, "not on this crawler's allow-list")
        parts = urllib.parse.urlsplit(url)
        if not robots_rfc.allowed(self.rules, parts.path + ("?" + parts.query if parts.query else "")):
            raise Stop(url, "robots.txt disallows it")
        if self.requests >= MAX_REQUESTS:
            raise Stop(url, f"more than {MAX_REQUESTS} page requests in one run")
        self.requests += 1
        try:
            raw = ic.polite_get(url, self.cache, accept="text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
        except ic.Blocked as e:
            raise Stop(url, f"refused: {e}")
        except urllib.error.HTTPError as e:
            raise Stop(url, f"HTTP {e.code}")
        except (urllib.error.URLError, OSError, http.client.HTTPException) as e:   # HTTPException: a cut-off or garbled reply (IncompleteRead, BadStatusLine)
            raise Stop(url, f"the connection failed after two retries ({e!r})")
        finally:
            if not self.keep:  # only the few fields parse_page returns are kept; the page itself is deleted
                (Path(self.cache) / hashlib.sha1(url.encode()).hexdigest()).unlink(missing_ok=True)
        return url, raw.decode("utf-8", "replace")


def notes_text(status: str, run_requests: int, started: str, raw_dir: Path, stop: Stop | None) -> str:
    pages, tiles = load_state(raw_dir / "marks-and-spencer-food.jsonl", repair=False)
    lines = [
        "M&S Foodhall crawl (tools/groceries/mns_food_listing.py): the \"M&S Food Catalogue\" aisles at https://www.marksandspencer.com/food/l/<aisle>",
        f"status: {status}",
        f"run started {started}, updated {now_utc().strftime('%Y-%m-%dT%H:%M:%SZ')}; page requests in this run: {run_requests} (cap {MAX_REQUESTS})",
        "method: robots.txt read first (RFC 9309 matcher, every URL checked); 1 request a second, one at a time; the aisle pages' __NEXT_DATA__ only; no product page, no price,",
        "        barcode or nutrition is read; only id, title, pack size, brand, product path and picture are kept (raw/marks-and-spencer-food.jsonl); pages are not stored.",
        "",
    ]
    done_units = 0
    for u in UNITS:
        first = pages.get((u.slug, 1))
        if not first:
            lines.append(f"  {u.label} ({u.slug}): not read yet")
            continue
        total = first["totalPages"]
        got = sorted(p for (s, p) in pages if s == u.slug)
        n_tiles = sum(len(tiles.get((u.slug, p), [])) for p in got)
        complete = got == list(range(1, total + 1))
        done_units += complete
        lines.append(f"  {u.label} ({u.slug}): {len(got)} of {total} pages, {n_tiles} products, page 1 printed {first['totalItems']}{'  DONE' if complete else ''}")
    lines += ["", f"aisles complete: {done_units} of {len(UNITS)}"]
    if stop:
        lines += ["", f"STOPPED: {stop.url} {stop.reason}", "The crawl does not retry or work round this; what was collected is kept. Report to the founder."]
    lines += ["", "Not crawled, on purpose: Drinks as a whole, Alcoholic Drinks, Wine and every gift list (no alcohol); Household, Pet Supplies, Baby Changing, Christmas Groceries In Store",
              "(Festive Household), New In, Home of Health, Remarksable Value, Food brands, Home of Dine In (non-food, or overlaps of the aisles above); product pages (links only)."]
    return "\n".join(lines) + "\n"


def cmd_read(a) -> int:
    raw_dir = Path(a.raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    jsonl, progress = raw_dir / "marks-and-spencer-food.jsonl", raw_dir / "marks-and-spencer-food_progress.txt"
    wanted = [s for s in (a.only or "").split(",") if s]
    redo = [s for s in (a.redo or "").split(",") if s]
    for s in wanted + redo:
        if s not in BY_SLUG:
            print(f"unknown aisle {s!r}; known: {', '.join(BY_SLUG)}")
            return 1
    units = [u for u in UNITS if not wanted or u.slug in wanted]
    held: dict[str, list[str]] = {}    # --redo: the old lines of an aisle, forgotten only once the run is known to be able to start
    started = now_utc().strftime("%Y-%m-%dT%H:%M:%SZ")
    stop: Stop | None = None
    run = Run([], Path("."))
    cache_ctx = None
    try:
        if shop_taken_down():
            raise Stop(str(HIDDEN), "'shop:marks-and-spencer' is in hidden.json: the list is taken down")
        if a.cache:
            cache = Path(a.cache).resolve()
            if ROOT in cache.parents or cache == ROOT:
                print("--cache must be outside the repository (no page copies in the repo)")
                return 1
            cache.mkdir(parents=True, exist_ok=True)
        else:
            cache_ctx = tempfile.TemporaryDirectory(prefix="mns-food-")
            cache = Path(cache_ctx.name)
        rules = preflight()
        ic._robots[BASE] = rules                   # polite_get reads the same rules we just checked (no second robots.txt request)
        ic._last_request[HOST] = time.monotonic()
        run = Run(rules, cache, keep=bool(a.cache))
        for s in redo:
            held[s] = forget_unit(jsonl, s)
            print(f"--redo {s}: forgot {len(held[s])} lines", flush=True)
        pages, _ = load_state(jsonl)
        print(f"robots.txt ok ({len(rules)} rules). {len(units)} aisles, {len(pages)} pages already read", flush=True)
        for u in units:
            total = pages[(u.slug, 1)]["totalPages"] if (u.slug, 1) in pages else None
            page = 1
            while total is None or page <= total:
                if (u.slug, page) not in pages:
                    url, body = run.fetch(u, page, total)
                    r = parse_page(url, u, page, body)
                    p = r["pagination"]
                    total = p["totalPages"]
                    day = now_utc().strftime("%Y-%m-%d")
                    lines = [json.dumps({"k": "tile", "unit": u.slug, "page": page, **t}, ensure_ascii=False) for t in r["tiles"]]
                    line = {"k": "page", "unit": u.slug, "page": page, "totalItems": p["totalItems"], "totalPages": p["totalPages"],
                            "first": p["pageFirstItemNum"], "last": p["pageLastItemNum"], "tiles": r["seen"], "skipped": r["skipped"], "unranged": r["unranged"],
                            "priced_tiles": r["priced"], "buildId": r["buildId"], "checked_on": day, "warnings": r["warnings"] + [f"skipped tile {w}" for w in r["skipped_why"]]}
                    lines.append(json.dumps(line, ensure_ascii=False))
                    with open(jsonl, "a", encoding="utf-8") as f:  # one write per page, the page line last: a cut-off run never leaves a page that looks finished
                        f.write("".join(x + "\n" for x in lines))
                        f.flush()
                    pages[(u.slug, page)] = line
                    print(f"{u.label}: page {page} of {total}: {len(r['tiles'])} products (printed total {p['totalItems']}; skipped {r['skipped']}; priced tiles {r['priced']}) [{run.requests} requests]", flush=True)
                    for w in r["warnings"]:
                        print("  warning:", w, flush=True)
                    progress.write_text(notes_text("running", run.requests, started, raw_dir, None), encoding="utf-8")
                page += 1
        status = "finished (all the aisles asked for)"
    except Stop as s:
        stop = s
        status = "STOPPED"
        print(f"STOPPED: {s.url} {s.reason}", flush=True)
    finally:
        if cache_ctx:
            cache_ctx.cleanup()
        for s, old in held.items():
            if restore_unit(jsonl, s, old):
                print(f"--redo {s}: the run stopped before it read a page of it, so its {len(old)} old lines are back", flush=True)
    progress.write_text(notes_text(status, run.requests, started, raw_dir, stop), encoding="utf-8")
    print(f"progress -> {_show(progress)}")
    return 2 if stop else 0


# ---------------------------------------------------------------- write

def cmd_write(a) -> int:
    raw_dir = Path(a.raw_dir)
    partial = bool(getattr(a, "partial", False))
    pages, tiles = load_state(raw_dir / "marks-and-spencer-food.jsonl")
    problems: list[str] = []
    status: dict[str, str] = {}   # aisle -> "complete" | "partial" | "not read"
    for u in UNITS:
        first = pages.get((u.slug, 1))
        if not first:
            problems.append(f"{u.slug}: not read at all")
            status[u.slug] = "not read"
            continue
        missing = [p for p in range(1, first["totalPages"] + 1) if (u.slug, p) not in pages]
        if missing:
            problems.append(f"{u.slug}: pages {missing} of {first['totalPages']} are missing")
        status[u.slug] = "partial" if missing else "complete"
    # every page's tile lines must add up to the tiles its page line says were kept: a lost or damaged line is never written round (also with --partial)
    damaged = [f"{slug} page {page}: {len(tiles.get((slug, page), []))} tile lines but the page line says {pl['tiles'] - pl['skipped']} were kept: run `read --redo {slug}`"
               for (slug, page), pl in sorted(pages.items()) if len(tiles.get((slug, page), [])) != pl["tiles"] - pl["skipped"]]
    if damaged:
        print("Cannot write: the saved pages are not whole:\n  " + "\n  ".join(damaged))
        return 1
    if problems and not partial:
        print("Cannot write yet:\n  " + "\n  ".join(problems) + "\nRun `read` (it resumes), or `read --redo <aisle>`.")
        return 1
    if partial and not any(v != "not read" for v in status.values()):
        print("Cannot write: nothing has been read.")
        return 1

    excluded = {}
    if EXCLUDE.exists():
        with open(EXCLUDE, newline="", encoding="utf-8") as f:
            excluded = {r["product_id"]: r.get("reason", "") for r in csv.DictReader(f)}
    priced_ids, priced_names = set(), {}
    with open(PRICED, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            priced_ids.add(r["product_id"])
            priced_names.setdefault(norm_name(r["name"]), r["product_id"])

    seen: dict[str, dict] = {}
    cov, gate_fail = [], []
    per_unit_rows: Counter[str] = Counter()
    shared_images: dict[str, set[str]] = {}
    dup_names: list[tuple[str, str, str]] = []
    dropped_excluded: list[str] = []
    totals = Counter()
    for u in UNITS:
        if status[u.slug] == "not read":
            cov.append({"unit": u.slug, "label": u.label, "url": page_url(u, 1), "status": "not read", "pages_loaded": 0, "pages_printed": "", "tiles_seen": 0, "tiles_collected": 0,
                        "distinct_ids": 0, "new_ids_after_dedupe": 0, "printed_total": "", "collected_of_printed": "not read", "skipped_tiles": 0, "priced_tiles": 0,
                        "unranged": 0, "warnings": "", "checked_on": ""})
            continue
        first = pages[(u.slug, 1)]
        n_pages = first["totalPages"]
        read_pages = [p for p in range(1, n_pages + 1) if (u.slug, p) in pages]
        ids, seen_tiles, skipped, priced_t, unranged, warns, new = set(), 0, 0, 0, 0, [], 0
        day = max(pages[(u.slug, p)]["checked_on"] for p in read_pages)
        collected = 0
        for p in read_pages:
            pl = pages[(u.slug, p)]
            seen_tiles += pl["tiles"]
            skipped += pl["skipped"]
            priced_t += pl["priced_tiles"]
            unranged += pl["unranged"]
            warns += pl.get("warnings", [])
            for t in tiles.get((u.slug, p), []):
                collected += 1
                ids.add(t["id"])
                shared_images.setdefault(t["img"], set()).add(t["id"])
                if t["id"] in seen:
                    continue
                seen[t["id"]] = {**t, "unit": u, "checked_on": pl["checked_on"]}
                new += 1
        printed = first["totalItems"]
        if status[u.slug] == "complete" and u.expected is not None and len(ids) < COVERAGE_GATE * printed:
            gate_fail.append(f"{u.label}: {len(ids)} distinct products of {printed} printed ({100 * len(ids) / printed:.1f}%, needs {100 * COVERAGE_GATE:.0f}%): run `read --redo {u.slug}`")
        cov.append({"unit": u.slug, "label": u.label, "url": page_url(u, 1), "status": status[u.slug], "pages_loaded": len(read_pages), "pages_printed": n_pages,
                    "tiles_seen": seen_tiles, "tiles_collected": collected, "distinct_ids": len(ids), "new_ids_after_dedupe": new, "printed_total": printed,
                    "collected_of_printed": f"collected {len(ids)} of {printed}" + (f" (stopped after {len(read_pages)} of {n_pages} pages)" if status[u.slug] == "partial" else ""),
                    "skipped_tiles": skipped, "priced_tiles": priced_t, "unranged": unranged, "warnings": "; ".join(warns), "checked_on": day})
        totals.update(skipped=skipped, priced=priced_t, unranged=unranged)
    if gate_fail:
        print("Cannot write: an aisle's list looks incomplete (ordering is by relevance and can shift while we read):\n  " + "\n  ".join(gate_fail))
        return 1

    rows, ids_also_priced = [], 0
    for pid, t in seen.items():
        full_id = "fdp" + pid
        if full_id in excluded:
            dropped_excluded.append(full_id)
            continue
        name = row_name(t["title"], t["brand"], t["weight"])
        if len(name) < 2:
            totals["short name"] += 1
            continue
        if full_id in priced_ids:
            ids_also_priced += 1
        key = norm_name(name)
        if key in priced_names:
            dup_names.append((full_id, name, priced_names[key]))
            continue
        rows.append([full_id, name, "", "", "", "", "", t["unit"].label, BASE + t["seo"], IMAGE_BASE + t["img"], t["checked_on"]])
        per_unit_rows[t["unit"].label] += 1
    band = ROWS_RANGE
    if partial and problems:   # a list from an unfinished crawl may be smaller than the whole range, never larger
        band = (min(ROWS_RANGE_PARTIAL[0], ROWS_RANGE[0]), ROWS_RANGE[1])
    if not band[0] <= len(rows) <= band[1]:
        print(f"Cannot write: {len(rows)} rows is outside the expected {band[0]} to {band[1]}. Nothing written.")
        return 1

    summary = build_summary(rows, cov, per_unit_rows, ids_also_priced, dup_names, dropped_excluded, totals, shared_images, seen, problems if partial else [])
    print(summary)
    if a.dry:
        print("(--dry: nothing written)")
        return 0
    _write_csv(OUT, HEADER, rows)
    _write_dicts(COVERAGE, list(cov[0].keys()), cov)
    (raw_dir / "marks-and-spencer-food_summary.txt").write_text(summary + "\n", encoding="utf-8")
    print(f"-> {_show(OUT)} ({len(rows)} products), {_show(COVERAGE)}")
    return 0


def _show(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _write_csv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
    os.replace(tmp, path)


def _write_dicts(path: Path, header: list[str], rows: list[dict]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)


def build_summary(rows, cov, per_unit_rows, ids_also_priced, dup_names, dropped_excluded, totals, shared_images, seen, unfinished=()) -> str:
    out = [f"M&S Foodhall list: {len(rows)} products (tools/groceries/mns_food_listing.py write, {now_utc().strftime('%Y-%m-%d')})"]
    if unfinished:
        out += ["", "PARTIAL: the crawl stopped before it was finished (write --partial). This list does NOT hold the whole range:"] + [f"    {x}" for x in unfinished]
    out += ["", "Rows per aisle (first aisle to list a product gives it its category):"]
    out += [f"  {per_unit_rows.get(u.label, 0):5d}  {u.label}" for u in UNITS]
    out += ["", "Per aisle, collected against the total the page printed:"]
    out += [f"  {c['label']}: {c['collected_of_printed']} ({c['pages_loaded']} pages, {c['tiles_seen']} tiles seen, {c['new_ids_after_dedupe']} new after the earlier aisles)" if c["status"] != "not read"
            else f"  {c['label']}: not read" for c in cov]
    out += ["", f"ids that are also in marks-and-spencer.csv (the priced row wins in the builder): {ids_also_priced}",
            f"name duplicates of a priced row dropped: {len(dup_names)}"]
    out += [f"    {pid}  {name}  (= priced {other})" for pid, name, other in dup_names[:20]]
    out += [f"dropped by marks-and-spencer-food-exclude.csv: {len(dropped_excluded)}",
            f"tiles skipped (id / path / picture / title not as expected): {totals['skipped']}",
            f"tiles that carried a price field (never copied): {totals['priced']}",
            f"unranged products (counted, never read): {totals['unranged']}"]
    try:
        import build_all_products as bap
        import build_groceries as bg
    except Exception as e:  # the audit is a convenience; the list does not depend on it
        out += ["", f"(builder audit unavailable: {e})"]
        return "\n".join(out)
    drop, loose = [], []
    for r in rows:
        name, cat = r[1], r[7]
        if bap.not_food(name) or bg.is_alcohol(name, cat):
            drop.append(name)
        elif bg.ALCOHOL_WORD.search(name):
            loose.append(name)
    out += ["", f"names the builder will drop (is_alcohol or not_food): {len(drop)}"] + [f"    {n}" for n in drop[:40]]
    out += ["", f"names with a loose alcohol word that STAY (eyeball these): {len(loose)}"] + [f"    {n}" for n in loose[:150]]
    left = [r[1] for r in rows if re.search(r"[<;]|&amp", r[1])]
    out += ["", f"names with a leftover '<', ';' or '&amp;': {len(left)}"] + [f"    {n}" for n in left[:40]]
    long_ = [r[1] for r in rows if len(r[1]) > 100]
    out += ["", f"names over 100 characters: {len(long_)}"] + [f"    {n}" for n in long_[:20]]
    shared = {img: ids for img, ids in shared_images.items() if len(ids) >= 2}
    out += ["", f"picture ids shared by 2 or more products (look at these): {len(shared)}"]
    for img, ids in sorted(shared.items(), key=lambda kv: -len(kv[1]))[:30]:
        out.append(f"    {img}  x{len(ids)}  " + " | ".join(sorted(row_name(seen[i]['title'], seen[i]['brand'], seen[i]['weight']) for i in ids)[:4]))
    brands = Counter(clean_title(t["brand"]) for t in seen.values())
    out += ["", "brands as the tiles print them (top 40):"] + [f"  {n:5d}  {b or '(none)'}" for b, n in brands.most_common(40)]
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="step", required=True)
    r = sub.add_parser("read", help="the crawl (resumable)")
    r.add_argument("--only", help="comma-separated aisle slugs to read (a dry run: --only chilled-desserts)")
    r.add_argument("--redo", help="comma-separated aisle slugs to forget and read again")
    r.add_argument("--cache", help="keep the fetched pages in this folder (outside the repository); default: a temporary folder, each page deleted after it is read")
    r.add_argument("--raw-dir", default=str(RAW), help="where the jsonl and progress notes go (default data/groceries/listing/raw)")
    w = sub.add_parser("write", help="the listing csv, coverage and summary")
    w.add_argument("--raw-dir", default=str(RAW))
    w.add_argument("--dry", action="store_true", help="print the summary and write nothing")
    w.add_argument("--partial", action="store_true", help="the crawl stopped part way: write the aisles read in full and the pages read of an unfinished aisle (the coverage csv says which)")
    a = ap.parse_args()
    return cmd_read(a) if a.step == "read" else cmd_write(a)


if __name__ == "__main__":
    sys.exit(main())
