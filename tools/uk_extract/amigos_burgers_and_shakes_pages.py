"""Reader for Amigos Burgers & Shakes' own menu item pages (www.amigosburgersandshakes.com, a Wix site). Used by amigos_burgers_and_shakes.py.

Every menu item has its own server-rendered page (https://www.amigosburgersandshakes.com/b-001 ...). The visible text between the
"BACK" link and the "Allergen Information" heading is: the item's name, a line such as "2656.8kJ | 635kcal" (kJ sometimes missing, the
figures sometimes split over lines by the page builder: "577 / kcal", "1849 / kJ"), optionally a size line ("(4x Tenders)",
"10x Pieces", "2x 6oz. beef patties") and a description. Nothing is read from images or by position.
"""
from __future__ import annotations
import html
import re
import time
import urllib.request
from pathlib import Path

HOST = "https://www.amigosburgersandshakes.com"
# robots.txt (read 2026-10-08): "User-agent: *  Allow: /  Disallow: *?lightbox=" and a Crawl-delay only for dotbot/AhrefsBot.
# We wait 1.1 s between requests and never use a query string.
DELAY = 1.1
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def fetch(url: str, dest: Path) -> None:
    """One polite download: sleeps first, normal browser User-Agent, no query strings (robots.txt)."""
    if "?" in url:
        raise SystemExit(f"robots.txt disallows URLs with a query string: {url}")
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def check_robots(text: str) -> None:
    """Stop if robots.txt now disallows anything beyond the lightbox query for every crawler."""
    group = []
    in_star = False
    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith("user-agent:"):
            in_star = line.split(":", 1)[1].strip() == "*"
        elif in_star and line.lower().startswith("disallow:"):
            group.append(line.split(":", 1)[1].strip())
    if [d for d in group if d != "*?lightbox="]:
        raise SystemExit(f"robots.txt changed: Disallow rules for all crawlers are now {group}; read it before fetching anything")


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s).replace("\xa0", " ")).strip()


def visible_lines(text: str) -> list[str]:
    body = re.sub(r"<script.*?</script>|<style.*?</style>", "", text, flags=re.S)
    lines = [_clean(l) for l in re.sub(r"<[^>]+>", "\n", body).split("\n")]
    return [l for l in lines if l]


_KCAL = re.compile(r"(\d+(?:\.\d+)?)\s*kcal", re.I)
_KJ = re.compile(r"(\d+(?:\.\d+)?)\s*kJ", re.I)


def read_item_page(text: str, where: str) -> dict:
    """-> dict(title, head, kj (printed text or ''), kcal (printed text), desc, allergens (printed words, only used for checks)).
    `head` is the visible text before the first figure, as printed (name plus any size line), e.g. "THE BOSS 2x 6oz. beef patties"."""
    lines = visible_lines(text)
    if "BACK" not in lines or "Allergen Information" not in lines:
        raise SystemExit(f"{where}: not an item page (no BACK link or no 'Allergen Information' heading): the layout changed")
    block = lines[lines.index("BACK") + 1:lines.index("Allergen Information")]
    joined = " ".join(block)
    kcal = _KCAL.findall(joined)
    kj = _KJ.findall(joined)
    if len(kcal) != 1 or len(kj) > 1:
        raise SystemExit(f"{where}: found {len(kcal)} kcal and {len(kj)} kJ figures in {joined!r}, expected 1 and at most 1")
    starts = [m.start() for m in _KCAL.finditer(joined)] + [m.start() for m in _KJ.finditer(joined)]
    head = joined[:min(starts)].strip().rstrip("|").strip()
    desc = joined[_KCAL.search(joined).end():].strip()
    tail = lines[lines.index("Allergen Information") + 1:]
    for stop in ("Learn More", "View More"):
        if stop in tail:
            tail = tail[:tail.index(stop)]
            break
    else:
        raise SystemExit(f"{where}: no 'Learn More'/'View More' link after the allergen block: the layout changed")
    allergens = [w for w in tail if w not in ("This product", "contains", "the", "following", "ingredients.")]
    return {"title": lines[1], "head": head, "kj": kj[0] if kj else "", "kcal": kcal[0], "desc": desc, "allergens": allergens}
