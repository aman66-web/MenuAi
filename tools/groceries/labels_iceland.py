#!/usr/bin/env python3
"""Nutrition labels for Iceland's recipe candidates, read from each product's own page on iceland.co.uk (founder 2026-11-17: recipes from the shop the
person picks, so each shop's own labels are needed, not Sainsbury's).

    python3 tools/groceries/labels_iceland.py read [--limit N] [--ids 87650,66833] [--cache DIR]   # fetch pages not read yet (resumable)
    python3 tools/groceries/labels_iceland.py write                                              # data/groceries/nutrition/iceland.csv from the stored reads

What is read: the products in data/groceries/recipe-candidates/iceland.csv. Iceland's product page for an id is https://www.iceland.co.uk/p/x/<id>.html
(the slug part is ignored by the site; the listing crawl of 2026-10-09 used the same address, data/groceries/listing/raw/iceland_listing.txt). The page is a
server-rendered React page whose own data block (<script id="mobify-data" type="application/json">) holds the product under
__PRELOADED_STATE__ ... productStore.productsById[<id>]; its `nutritionInformation` ({"headings": [...], "nutrients": [{"name", "values": [...]}]}) is what
the page's "Show full nutritional table" opens (pages-product.js renders it whenever `nutrients` is not empty). Only that object, the product's id and name and
the page address are kept (data/groceries/nutrition/raw-iceland/pages.jsonl, one line per page read); the page itself is never stored in the repo.

Fetching (tools/uk_extract/images_common.py rules): one request a second to www.iceland.co.uk, a normal browser User-Agent, robots.txt honoured (RFC 9309,
robots_rfc.py; /p/ is not disallowed), gzip asked for to keep the transfer small. A 401/403/429, or a 200 page that looks like a bot check or carries no
product data, STOPS the run: it is never worked round. A 404/410 is recorded as "gone" and the product stays without numbers.

Writing (rebuilt from the stored reads every time, so a rule that tightens never leaves an old row behind):
  * only a per-100 g or per-100 ml column (the column whose heading names 100 g / 100 ml); `per` is g or ml as that heading says;
  * `state` is "" for a plain per-100 heading ("Per 100g", "Typical values per 100g", "as sold"), else the label for the cooked/prepared wording the heading adds
    (same labels as tools/groceries/t2_sainsburys.py: "oven cooked", "cooked", "drained", ...); a heading whose extra words we can't place leaves the product out;
  * a bare "Per 100g" column beside a cooked or prepared per-serving column (Birds Eye: "100g Provides:" | "Per serving (80g) microwaved provides:") is
    unclear and leaves the product out; a %RI column is never the food's figures;
  * numbers are copied exactly as printed (the unit letters "g", "kJ", "kcal", a "(9%*)" reference-intake note after a figure and the brackets of an
    "(of which ...)" row are not numbers and are dropped; "<0.5" stays "<0.5"; a thousands comma in an energy figure is dropped; a decimal comma with 1 or 2
    digits after it, "25,0 g", is written with a point, the same number); nothing is computed, converted, rounded or filled in: a figure the table doesn't
    print, or prints in another unit or as a word ("Trace"), is left empty; a missing or unreadable kcal, fat, carbohydrate or protein leaves the product out;
  * the energy may sit in two cells of one row ("1052 kJ" | "253 kcal"), two cells per column ("620kJ","146kcal","564kJ","133kcal"), or kJ on the "Energy"
    row and kcal on an unnamed row under it: each cell must print its own unit (or the row's own name gives it: "Energy kJ" | "796"), else the product is left out;
  * a product whose kJ and kcal disagree, or whose numbers fail build_groceries.implausible(), is left out (never fixed);
  * a page whose own product id differs from the one asked for is left out.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402  (robots.txt, User-Agent, pacing, Blocked)
import build_groceries as bg  # noqa: E402  (printed_num, implausible)

SHOP = "iceland"
CANDIDATES = ROOT / "data" / "groceries" / "recipe-candidates" / f"{SHOP}.csv"
RAW = ROOT / "data" / "groceries" / "nutrition" / f"raw-{SHOP}"
PAGES = RAW / "pages.jsonl"
OUT = ROOT / "data" / "groceries" / "nutrition" / f"{SHOP}.csv"
HOST = "www.iceland.co.uk"
PAGE = "https://www.iceland.co.uk/p/x/{}.html"
HEADER = ["product_id", "per", "state", "kj", "kcal", "fat_g", "saturates_g", "carbs_g", "sugars_g", "fibre_g", "protein_g", "salt_g", "checked_on", "page_url"]
DATA_BLOCK = re.compile(r'<script id="mobify-data" type="application/json">(.*?)</script>', re.S)
CHALLENGE = re.compile(r"access denied|captcha-container|px-captcha|cf-chl|challenge-platform|please verify you are a human|_incapsula_resource|"
                       r"request unsuccessful|pardon our interruption|are you a robot", re.I)


# ---------------------------------------------------------------- reading

class Stop(Exception):
    """A refusal, a bot check or a page we can't recognise: stop the run and report (never worked round)."""


def fetch(url: str, cache: Path | None) -> tuple[int, str, str]:
    """(HTTP status, final URL, decoded HTML). Paced at one request a second per host, robots.txt honoured."""
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        hit = cache / (hashlib.sha1(url.encode()).hexdigest() + ".json.gz")
        if hit.exists():
            d = json.loads(gzip.decompress(hit.read_bytes()))
            return d["status"], d["final"], d["html"]
    if not ic._robots_allow(url):
        why = ic._robots_unreadable.get(f"https://{HOST}")
        raise Stop(f"robots.txt could not be read ({why}): not fetched" if why else f"robots.txt disallows {url}")
    wait = ic._last_request.get(HOST, 0) + 1.0 - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": ic.UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                                               "Accept-Language": "en-GB,en;q=0.9", "Accept-Encoding": "gzip"})
    status, final, body = 0, url, b""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                status, final, enc, body = r.status, r.geturl(), (r.headers.get("Content-Encoding") or "").lower(), r.read()
            break
        except urllib.error.HTTPError as e:
            ic._last_request[HOST] = time.monotonic()
            if e.code in (401, 403, 429):
                raise Stop(f"HTTP {e.code} from {url}") from e
            if e.code in (404, 410):
                return e.code, url, ""
            if e.code >= 500 and attempt < 2:
                time.sleep(10 * (attempt + 1))
                continue
            raise Stop(f"HTTP {e.code} from {url}") from e
        except (urllib.error.URLError, OSError) as e:
            ic._last_request[HOST] = time.monotonic()
            if attempt == 2:
                raise Stop(f"{type(e).__name__} from {url}: {e}") from e
            time.sleep(10 * (attempt + 1))
    ic._last_request[HOST] = time.monotonic()
    if enc == "gzip":
        body = gzip.decompress(body)
    elif enc == "deflate":
        body = zlib.decompress(body)
    html = body.decode("utf-8", "replace")
    if cache is not None:
        hit.write_bytes(gzip.compress(json.dumps({"status": status, "final": final, "html": html}).encode()))
    return status, final, html


def product_of(html: str, pid: str) -> dict | None:
    m = DATA_BLOCK.search(html)
    if not m:
        return None
    try:
        d = json.loads(m.group(1))
        store = d["__PRELOADED_STATE__"]["__STATE_MANAGEMENT_LIBRARY"]["store"]["productStore"]["productsById"]
    except (ValueError, KeyError, TypeError):
        return None
    return store.get(pid) if isinstance(store, dict) else None


def read_done() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if PAGES.exists():
        for line in PAGES.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["product_id"]] = r
    return out


def candidates() -> list[dict]:
    with open(CANDIDATES, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cmd_read(a) -> int:
    done = read_done()
    rows = candidates()
    if a.ids:
        want = set(a.ids.split(","))
        rows = [r for r in rows if r["product_id"] in want]
    todo = [r for r in rows if r["product_id"] not in done]
    if a.limit:
        todo = todo[: a.limit]
    print(f"{len(todo)} pages to read ({len(done)} already read)", flush=True)
    RAW.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    n = 0
    with open(PAGES, "a", encoding="utf-8") as f:
        for r in todo:
            pid = r["product_id"]
            url = PAGE.format(pid)
            try:
                status, final, html = fetch(url, a.cache)
                rec = {"product_id": pid, "page_url": url, "final_url": final, "http": status, "checked_on": today, "listing_name": r["name"]}
                if status in (404, 410):
                    rec["status"] = "gone"
                else:
                    u = urllib.parse.urlsplit(final)
                    if u.netloc != HOST or not re.fullmatch(r"/p/[^/]+/" + re.escape(pid) + r"\.html", u.path):
                        rec["status"] = "redirected"
                    else:
                        p = product_of(html, pid)
                        if p is None:
                            if CHALLENGE.search(html[:200000]) or len(html) < 50000:
                                raise Stop(f"{url}: no product data and the page looks like a bot check or an error page ({len(html)} characters)")
                            raise Stop(f"{url}: a 200 page without this product's data (layout changed?), not guessed at")
                        rec.update(status="ok", page_id=str(p.get("id") or ""), page_name=p.get("name") or "",
                                   nutritionInformation=p.get("nutritionInformation"), drainedWeight=p.get("drainedWeight"))
            except Stop as e:
                print(f"STOPPED (never worked round): {e}. {n} pages read this run.", flush=True)
                return 2
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            f.flush()
            n += 1
            if n % 50 == 0:
                print(f"{n} of {len(todo)} read", flush=True)
    print(f"done: {n} pages read this run", flush=True)
    return 0


# ---------------------------------------------------------------- writing

# The extra words a per-100 heading may carry. Plain = the food as sold. Otherwise the label (as tools/groceries/t2_sainsburys.py STATE_LABELS)
# for the cooked or prepared food; anything else is an unclear basis and the product is left without numbers.
FILLER = {"per", "a", "for", "of", "the", "product", "food", "contains", "provides", "typical", "values", "value", "average", "nutrition", "nutritional",
          "information", "amount", "quantity"}   # "100g Provides:", "for 100ml product", "Typical values per 100g": the plain column
AS_SOLD = {"as", "sold", "unprepared", "uncooked", "dry"}   # "Per 100g as Sold", "per 100g sold", "Per 100g Unprepared", "dry/uncooked": as sold, said outright
STATE_WORDS = [  # (pattern on the heading's extra words, label); checked in order, first match wins
    (r"\bdrained\b", "drained"),
    (r"\bgrill", "grilled"), (r"\bfried\b|\bfry\b|pan.?fried|deep.?fried|shallow.?fried", "fried"), (r"\broast", "roasted"),
    (r"oven\s*-?\s*bak|oven\s*-?\s*cook", "oven cooked"), (r"\bbak", "baked"), (r"\bboil", "boiled"), (r"microwav", "microwaved"), (r"\bsteam", "steamed"),
    (r"\bair\s*-?\s*fr", "fried"), (r"(?<!un)cooked\b|\bheated\b", "cooked"), (r"(?<!un)prepar", "prepared"), (r"made\s*up|reconstitut", "made up"),
    (r"dilut", "diluted"), (r"as\s+consumed|as\s+served", "as consumed"),
]


def heading_words(t: str) -> list[str]:
    t = re.sub(r"[()\[\]:*,.\-–/]", " ", html.unescape(str(t or "")).lower().replace("\u00a0", " "))
    return [w for w in t.split() if w not in FILLER]


def cooked_heading(h: str) -> bool:
    """Whether a heading (any column, per 100 g or per serving) names a cooked or prepared food."""
    t = " ".join(heading_words(h))
    return any(re.search(rx, t) for rx, _ in STATE_WORDS)


def bare_per100(h: str) -> bool:
    """A per-100 heading with no words at all about the food's state ("Per 100g", "100g Provides:")."""
    t = " ".join(html.unescape(str(h or "")).lower().split())
    t = re.sub(r"(?<![\d.])100\s*(millilitres?|milliliters?|ml|grams?|g)(?![\d])", " ", t)
    return not heading_words(t)


def heading_basis(h: str, name: str = "") -> tuple[str, str | None] | None:
    """(per, state) for a per-100 g/ml heading, None when the heading isn't per 100 g/ml. state None = extra words we can't place.
    Words of the product's own name that say nothing about cooking are not counted ("dry/uncooked rice Per 100g" on Tilda Basmati Rice = as sold);
    a cooking word stays even when the name has it ("Per 100g oven baked" on "Oven Baked Chips" is still the cooked food)."""
    t = " ".join(html.unescape(str(h or "")).lower().replace("\u00a0", " ").split())
    if "%" in t or re.search(r"\bri\b|reference|intake|\bgda\b", t):
        return None  # a reference-intake column ("(%RI per 100g)") is not the food's figures
    # no word boundary after the unit: Iceland prints "Per 100gAir Fried" as well as "Per 100g Air Fried"
    m = re.search(r"(?<![\d.])100\s*(millilitres?|milliliters?|ml|grams?|g)(?![\d])", t)
    if not m:
        return None
    per = "ml" if m.group(1).startswith("m") else "g"
    rest = (t[: m.start()] + " " + t[m.end():])
    def as_sold(ws: list[str]) -> bool:
        return not ws or (set(ws) <= AS_SOLD and bool(set(ws) & {"sold", "unprepared", "uncooked", "dry"}))

    words = heading_words(rest)
    if as_sold(words):
        return per, ""
    for rx, label in STATE_WORDS:
        if re.search(rx, " ".join(words)):
            return per, label
    own = set(re.findall(r"[a-z]+", str(name or "").lower())) - AS_SOLD   # no cooking word at all: the product's own name words don't count
    return (per, "") if as_sold([w for w in words if w not in own]) else (per, None)


GRAM = re.compile(r"(<\s*)?(\d+(?:\.\d+)?)\s*g?")
RI_NOTE = re.compile(r"\s*\(\s*<?\s*\d+(?:\.\d+)?\s*%\s*\*?\s*\)\s*$")   # "762 kJ (9%*)", "0.6 g (<1%*)": the %RI note after a figure
ENERGY_PART = re.compile(r"(<\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(kj|kcal)", re.I)


def gram_value(v: str) -> str | None:
    """The printed grams as text ("2.8g" -> "2.8", "(1.0g)" -> "1.0", "<0.5g" -> "<0.5"); None when it isn't a plain gram figure."""
    t = " ".join(html.unescape(str(v or "")).replace("\u00a0", " ").split()).strip()
    t = RI_NOTE.sub("", t).replace("(", "").replace(")", "").strip()   # the brackets of an "(of which ...)" row: "1.0g)", "3.2)g"
    # a decimal comma ("25,0 g", "<0,5g": Olympus, Blue Dragon, Rodolfi) is written with a point: the same number. Only with 1 or 2 digits after the
    # comma, which can't be a thousands comma; anything else stays unreadable.
    t = re.sub(r"^(<?\s*\d+),(\d{1,2})(\s*g?)$", r"\1.\2\3", t, flags=re.I)
    m = GRAM.fullmatch(t.lower())
    if not m:
        return None
    return ("<" if m.group(1) else "") + m.group(2)


def energy_values(v: str, row_name: str = "") -> dict[str, str]:
    """{"kj": "600", "kcal": "142"} from "600 kJ / 142 kcal" (either order, either alone); a thousands comma is dropped, nothing else changed.
    A bare number counts only in a row whose own name gives the unit ("Energy kJ" | "796")."""
    out: dict[str, str] = {}
    t = RI_NOTE.sub("", html.unescape(str(v or "")).replace("\u00a0", " "))
    unit_in_name = re.findall(r"kj|kcal", str(row_name or "").lower())
    bare = re.fullmatch(r"\s*(<\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*", t)
    if bare and len(set(unit_in_name)) == 1:
        return {unit_in_name[0]: ("<" if bare.group(1) else "") + bare.group(2).replace(",", "")}
    pair = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*", t)
    if pair and unit_in_name in (["kj", "kcal"], ["kcal", "kj"]):
        return {unit_in_name[0]: pair.group(1), unit_in_name[1]: pair.group(2)}  # "Energy (kJ /kcal)" | "1234/295": the units in the row's own order
    for m in ENERGY_PART.finditer(t):
        unit = m.group(3).lower()
        if unit in out:
            return {"conflict": "1"}
        out[unit] = ("<" if m.group(1) else "") + m.group(2).replace(",", "")
    leftover = ENERGY_PART.sub("", t)
    if re.search(r"\d", leftover):
        return {"conflict": "1"}  # another number in the cell (a decimal comma, a second figure): unclear, not guessed at
    return out


FIELD_OF = [  # (pattern on the row's name, field); first match wins
    (r"equivalent as salt|salt equivalent", "salt_g"),  # Philadelphia: "Equivalent As Salt *to Sodium" | "0.70 g" is the salt row
    (r"reference|intake|^\*", None),  # "*Reference intake of an average adult (8400kJ/2000kcal)" is a footnote row
    (r"unsaturat|mono|poly|trans|polyol|starch|lactose|omega|cholesterol|sodium|vitamin|calcium|iron|"
     r"riboflavin|thiamin|niacin|folic|potassium|magnesium|zinc|phosphorus|caffeine|alcohol", None), (r"saturat", "saturates_g"),
    (r"sugar", "sugars_g"), (r"carbohydrate|^carbs?\b", "carbs_g"), (r"fibre|fiber", "fibre_g"), (r"protein", "protein_g"), (r"salt", "salt_g"),
    (r"\bfat\b|^fats?\b", "fat_g"), (r"energy|kcal|kj|calorie", "energy"),
]


def field_of(name: str) -> str | None:
    t = " ".join(str(name or "").lower().split())
    for rx, field in FIELD_OF:
        if re.search(rx, t):
            return field
    return None


def row_from(rec: dict) -> tuple[dict | None, str]:
    """(CSV row, "") or (None, why it was left out)."""
    if rec.get("status") != "ok":
        return None, f"page {rec.get('status')}"
    if rec.get("page_id") != rec["product_id"]:
        return None, "the page's own product id differs"
    ni = rec.get("nutritionInformation") or {}
    heads, nutrients = ni.get("headings") or [], ni.get("nutrients") or []
    if not nutrients:
        return None, "no nutrition table on the page"
    cols = [(i, heading_basis(h, rec.get("page_name", ""))) for i, h in enumerate(heads)]
    per100 = [(i, b) for i, b in cols if b is not None]
    if not per100:
        return None, "no per 100 g/ml column"
    clear = [(i, b) for i, b in per100 if b[1] is not None]
    if not clear:
        return None, "unclear per-100 heading wording"
    plain = [(i, b) for i, b in clear if b[1] == ""]
    col, (per, state) = (plain or clear)[0]
    if len({b for _, b in (plain or clear)}) > 1 or len(plain) > 1:
        return None, "two per-100 columns of the same kind"
    if (state == "" and bare_per100(heads[col]) and any(cooked_heading(h) for i, h in enumerate(heads) if i != col)
            and not any(b[1] for i, b in clear if i != col)):
        # Birds Eye: "100g Provides:" beside "Per serving (80g) microwaved provides:" -- whether the 100 g figures are the frozen or the microwaved
        # peas isn't said. (Oxo: "Per 100g" beside "Per 100ml portion of stock as prepared" is clear: the prepared food has its own per-100 column.)
        return None, "a bare per-100 column beside a cooked or prepared serving column (basis unclear)"
    vals: dict[str, str | None] = {}
    seen: Counter = Counter()
    prev = None
    for n in nutrients:
        values = n.get("values") or []
        if not any(str(v or "").strip() for v in values):
            continue  # a footnote or spacer row ("Contains naturally occurring sugars", "This pack contains 25 servings")
        f = field_of(n.get("name"))
        if f is None and not str(n.get("name") or "").strip() and prev == "energy":
            f = "energy"  # Young's tables print kJ on the "Energy" row and kcal on the unnamed row under it
        prev = f
        if f is None:
            continue
        if col >= len(values):
            return None, "a row has no figure in the per-100 column"
        if len(heads) == 1 and f == "energy" and len(values) > 1:
            cell = " / ".join(values)  # one per-100 column with the energy in two cells ("1052 kJ" | "253 kcal"): each must name its unit
        elif f == "energy" and len(heads) > 1 and len(values) == 2 * len(heads):
            # Sharwood's: the energy row has two cells per column ("620kJ", "146kcal", "564kJ", "133kcal"); each pair must be one kJ and one kcal
            pair = values[2 * col: 2 * col + 2]
            units = [sorted(energy_values(v)) for v in values]
            if any(u not in (["kj"], ["kcal"]) for u in units) or any(sorted(units[2 * i] + units[2 * i + 1]) != ["kcal", "kj"] for i in range(len(heads))):
                return None, "unclear energy cells"
            cell = " / ".join(pair)
        elif any(str(v or "").strip() for v in values[len(heads):]):
            return None, "a row has more figures than the table has columns"
        else:
            cell = values[col]
        if f == "energy":
            e = energy_values(cell, n.get("name"))
            if "conflict" in e:
                return None, "unclear energy cell"
            for k, v in e.items():
                seen[k] += 1
                if k in vals and vals[k] != v:
                    return None, "two different energy figures"
                vals[k] = v
            continue
        seen[f] += 1
        g = gram_value(cell)
        if f in vals and vals[f] != g:
            return None, f"two different {f} rows"
        vals[f] = g
    row = {"product_id": rec["product_id"], "per": per, "state": state, "checked_on": rec.get("checked_on", ""), "page_url": rec["page_url"]}
    for k in ("kj", "kcal", "fat_g", "saturates_g", "carbs_g", "sugars_g", "fibre_g", "protein_g", "salt_g"):
        row[k] = vals.get(k) or ""
    main = [bg.printed_num(row[k]) for k in ("kcal", "protein_g", "carbs_g", "fat_g")]
    if None in main:
        return None, "a main number (kcal, protein, carbs or fat) missing or not a plain figure"
    kj = bg.printed_num(row["kj"])
    bad = bg.implausible(main[0], main[1], main[2], main[3], kj, bg.printed_num(row["fibre_g"]))
    if not bad and kj and main[0] >= 20 and not 3.55 <= kj / main[0] <= 4.82:
        bad = "kJ and kcal disagree"
    if bad:
        return None, bad
    return row, ""


def name_words(name: str) -> set[str]:
    """The words of a product name without its pack size, for "is the page still the product the listing named?" (a report, not a rule)."""
    t = str(name or "").lower().replace("&", " and ")
    t = re.sub(r"\d+(?:\.\d+)?\s*(?:kg|g|ml|l|cl|ltr|litres?|pack|pk|x)\b|\b\d+\s*x\b|\(approx\.?\)", " ", t)
    return set(re.findall(r"[a-z]+", t)) - {"and", "with", "in", "a", "of", "the"}


def cmd_write(a) -> int:
    done = read_done()
    order = [r["product_id"] for r in candidates()]
    rows, why = [], Counter()
    left: list[tuple[str, str]] = []
    for pid in order:
        rec = done.get(pid)
        if rec is None:
            why["not read yet"] += 1
            continue
        row, reason = row_from(rec)
        if row is None:
            why[reason] += 1
            left.append((pid, reason))
        else:
            rows.append(row)
    rows.sort(key=lambda r: r["product_id"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} products in {OUT.relative_to(ROOT)}; left out: {sum(why.values())} {dict(why)}")
    states = Counter(r["state"] for r in rows)
    print(f"states: {dict(states)}")
    renamed = []
    for r in rows:
        rec = done[r["product_id"]]
        lw, pw = name_words(rec.get("listing_name", "")), name_words(rec.get("page_name", ""))
        if lw != pw:
            renamed.append((r["product_id"], rec.get("listing_name", ""), rec.get("page_name", ""), len(lw & pw) / max(1, len(lw | pw))))
    print(f"rows whose page name differs from the listing name beyond the pack size: {len(renamed)}")
    if a.verbose:
        for pid, reason in left:
            print(f"  {pid}: {reason}")
        for pid, ln, pn, overlap in sorted(renamed, key=lambda x: x[3]):
            print(f"  renamed {pid} ({overlap:.2f}): listing {ln!r} / page {pn!r}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("step", choices=["read", "write"])
    ap.add_argument("--limit", type=int, default=0, help="read at most N pages this run (a trial)")
    ap.add_argument("--ids", default="", help="comma-separated product ids to read (others skipped)")
    ap.add_argument("--cache", type=Path, default=None, help="keep fetched pages here (outside the repo) so a rerun never fetches twice")
    ap.add_argument("--verbose", action="store_true", help="write: list every product left out and why")
    a = ap.parse_args()
    return cmd_read(a) if a.step == "read" else cmd_write(a)


if __name__ == "__main__":
    sys.exit(main())
