"""Readers for Dunkin' UK's own allergen pages and product pages (dunkin.co.uk). Used by dunkin.py.

The allergen pages (https://dunkin.co.uk/allergens-donuts, -munchkins, -cookies, -bakery, -lto-donuts, -hot-drinks, -cold-drinks)
are Magento page-builder HTML: one <p> per product holding a link (the product page), the product name, and lines such as
"Allergens: ...", "May Contain: ...", "Nutrition: 222 kcal". Nothing is read from images or by position.
The product pages repeat the allergens and show "Nutrition ... N kcal per donut".
"""
from __future__ import annotations
import html
import re
import time
import urllib.request
from pathlib import Path

HOST = "https://dunkin.co.uk"
# robots.txt (checked 2026-10-07): "Crawl-delay: 30", "Disallow: /*?" (no query strings). We wait 31 s between requests.
CRAWL_DELAY = 31
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SIZES = ("small", "medium", "large")


def fetch(url: str, dest: Path) -> None:
    """One polite download (honours the 30 s crawl delay by sleeping before every call)."""
    if "?" in url:
        raise SystemExit(f"robots.txt disallows URLs with a query string: {url}")
    time.sleep(CRAWL_DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s).replace("\xa0", " ")).strip()


def read_allergen_page(text: str, where: str) -> list[dict]:
    """Every product on an allergen page -> dicts: name, url, desc (other lines), allergens (printed text after 'Allergens:', or None
    if there is no such line), may_contain (same), nutrition (the printed nutrition text, '' if the line is empty), bare (a lone
    'Milk' line printed without a label). A product is a link to its product page; its text runs to the next product link."""
    nav = text.find("COLD DRINKS")  # the last entry of the category menu on every allergen page (upper case; the site header says "Cold Drinks")
    end = text.find('<div class="newsletter')
    if nav < 0 or end < 0 or end < nav:
        raise SystemExit(f"{where}: the page layout changed (category menu or newsletter block not found)")
    region = text[nav:end]
    anchors = []
    for m in re.finditer(r'<a\b[^>]*href="(https://dunkin\.co\.uk/[^"#]+)"[^>]*>(.*?)</a>', region, flags=re.S):
        name = _clean(re.sub(r"<[^>]+>", "", m.group(2)))
        if name:
            anchors.append((m.group(1), name, m.start(), m.end()))
    out = []
    for i, (url, name, _, e) in enumerate(anchors):
        chunk = region[e:anchors[i + 1][2] if i + 1 < len(anchors) else len(region)]
        chunk = re.sub(r"<br\s*/?>|</p>|</div>", "\n", chunk)
        lines = [_clean(l) for l in re.sub(r"<[^>]+>", "", chunk).split("\n")]
        lines = [l for l in lines if l]
        rec = {"name": name, "url": url, "desc": [], "allergens": None, "may_contain": None, "nutrition": None, "bare": []}
        for l in lines:
            low = l.lower()
            if low.startswith("allergens"):
                rec["allergens"] = l.split(":", 1)[1].strip() if ":" in l else ""
            elif low.startswith("may contain"):
                rec["may_contain"] = l.split(":", 1)[1].strip() if ":" in l else ""
            elif low.startswith("nutrition"):
                rec["nutrition"] = l
            elif "kcal" in low:
                if rec["nutrition"] not in (None, ""):
                    raise SystemExit(f"{where}: {name!r} has two nutrition lines")
                rec["nutrition"] = l
            elif low == "milk":
                rec["bare"].append(l)  # 'Milk' printed alone, without an 'Allergens:' label
            else:
                rec["desc"].append(l)
        if rec["nutrition"] is None:
            raise SystemExit(f"{where}: {name!r} has no nutrition line: the layout changed")
        out.append(rec)
    return out


_KCAL = re.compile(r"(?:(small|medium|large)\s*-?\s*)?(\d+(?:\s*-\s*\d+)?)\s*kcal", re.I)


def parse_kcal(nutrition: str) -> list[dict]:
    """The printed nutrition text -> [{size or None, value (string as printed), is_range}]. Only the kcal figures; the text is
    never reinterpreted (a range stays a range, an unlabelled first figure keeps size None)."""
    text = re.sub(r"^nutrition\s*(\([^)]*\))?\s*:?", "", nutrition.strip(), flags=re.I)
    res = []
    for m in _KCAL.finditer(text):
        size, val = m.group(1), re.sub(r"\s+", "", m.group(2))
        res.append({"size": size.title() if size else None, "value": val, "is_range": "-" in val})
    return res


_SIZE_WORD = {"s": "Small", "m": "Medium", "l": "Large", "small": "Small", "medium": "Medium", "large": "Large"}
_SIZED = re.compile(r"\b(small|medium|large|s|m|l)\b\s*-?\s*(\d+(?:\s*-\s*\d+)?)", re.I)
_PLAIN = re.compile(r"(\d+(?:\s*-\s*\d+)?)\s*kcal", re.I)


def parse_product_figures(nutrition: str) -> list[dict]:
    """A product page's 'Nutrition' text -> [{variant, size, value, is_range}] (value as printed, spaces removed).
    The product pages print the figures in several layouts: 'Small 76 kcal - Medium 113 kcal', 'Small - 119 Kcal - Medium 182 Kcal',
    'Iced Kcal - S 267 - M 350 - L 433' (+ a 'Hot Kcal - S 195 ...' line), 'Kcal Medium 180', '222 kcal per donut'. variant is
    'Iced' / 'Hot' when the line says so, size is None for a figure printed without one. Lines that are not figures (the
    'May contain traces' line, 'Not recommended...') have no digits followed by a size or kcal and give nothing."""
    out: list[dict] = []
    for line in (nutrition or "").split("\n"):
        line = line.strip()
        if not line or line.lower().startswith(("(may contain", "may contain", "not recommended")):
            continue
        variant = "Iced" if line.lower().startswith("iced") else "Hot" if line.lower().startswith("hot") else None
        sized = list(_SIZED.finditer(line))
        if sized:
            for m in sized:
                val = re.sub(r"\s+", "", m.group(2))
                out.append({"variant": variant, "size": _SIZE_WORD[m.group(1).lower()], "value": val, "is_range": "-" in val})
        else:
            for m in _PLAIN.finditer(line):
                val = re.sub(r"\s+", "", m.group(1))
                out.append({"variant": variant, "size": None, "value": val, "is_range": "-" in val})
    return out


def page_title(text: str) -> str:
    """The first <title> of a page, tidied ('' if none)."""
    m = re.search(r"<title>(.*?)</title>", text, flags=re.S)
    return _clean(re.sub(r"<[^>]+>", "", m.group(1))) if m else ""


def read_product_page(text: str) -> dict:
    """A product page -> category, title, allergens (printed text or None), nutrition text (between 'Nutrition' and 'Adults need')."""
    body = text[text.find("<body"):]
    body = re.sub(r"<script.*?</script>", "", body, flags=re.S)
    body = re.sub(r"<style.*?</style>", "", body, flags=re.S)
    body = re.sub(r"<br\s*/?>", "\n", body)
    body = re.sub(r"</(p|div|li|tr|h\d)>", "\n", body)
    body = _clean_keep_lines(re.sub(r"<[^>]+>", " ", body))
    if "Adults need around" not in body:
        return {"ok": False, "text": body[:300]}
    head = body[:body.find("Adults need around")]
    nut = head.rsplit("\nNutrition\n", 1)
    allergens = None
    if "\nAllergens\n" in head:
        allergens = head.split("\nAllergens\n", 1)[1].split("\n", 1)[0].strip()
    return {"ok": True, "title": page_title(text), "allergens": allergens, "nutrition": nut[1].strip() if len(nut) == 2 else None,
            "head": head[-700:]}


def _clean_keep_lines(s: str) -> str:
    s = html.unescape(s).replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = "\n".join(l.strip() for l in s.split("\n"))
    return re.sub(r"\n\s*\n+", "\n", s)
