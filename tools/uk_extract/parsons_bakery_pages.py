"""Fetch helpers for Parsons Bakery's allergens page and its one-PDF-per-product files (used by parsons_bakery.py).

The page https://www.parsonsbakery.co.uk/allergens (Squarespace) lists every product under an h3 heading (Bread allergens, Cake
Allergens, ...) with a link "/s/<file>.pdf". Each link redirects (HTTP 302) to a static1.squarespace.com file. robots.txt of
www.parsonsbakery.co.uk names AI crawlers in one group together with `*`: the group disallows only /config, /search, /account, /api/,
/static/ and some query strings, so /s/*.pdf is allowed (checked with robots_rfc.py on every fetch run). static1.squarespace.com has no
robots.txt (HTTP 404, i.e. no restrictions) and is where the redirect ends. One request per file, 1.1 seconds apart, a normal browser
User-Agent. Python 3.9 compatible.
"""
from __future__ import annotations
import html
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402

SITE = "https://www.parsonsbakery.co.uk"
PAGE_URL = SITE + "/allergens"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
GAP = 1.1  # seconds between requests


class NotFound(Exception):
    """HTTP 404: a dead link on the chain's page (not a block)."""


def http_get(url: str) -> bytes:
    """One polite GET (sleeps first). Follows the site's own /s/ redirect to its file host. 404 raises NotFound; any other error stops."""
    time.sleep(GAP)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotFound(url)
        raise SystemExit(f"{url}: HTTP {e.code}. Stop: do not work round a block; download the file in your own browser.")


def robots_rules() -> list:
    return robots_rfc.parse(http_get(SITE + "/robots.txt").decode("utf-8", "replace"))


def parse_index(page_html: str) -> list:
    """[(heading, link text, path)] for every /s/*.pdf link under an h3 heading on the allergens page, in page order.
    The gender pay gap report (linked in the page header and footer) is not a product and is skipped."""
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", page_html, flags=re.S)
    out = []
    heading = None
    for m in re.finditer(r"<h3\b[^>]*>(.*?)</h3>|<a\b[^>]*href=\"(/s/[^\"]+\.pdf)\"[^>]*>(.*?)</a>", body, flags=re.S):
        if m.group(1) is not None:
            heading = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
        else:
            path = m.group(2)
            text = " ".join(html.unescape(re.sub(r"<[^>]+>", "", m.group(3))).split())
            if "pay-gap" in path.lower() or heading is None:
                continue
            if any(p == path for _, _, p in out):
                raise SystemExit(f"{path} is linked twice on the page: check the page by hand")
            out.append((heading, text, path))
    return out


def fetch_all(dest: Path) -> tuple:
    """Download the allergens page (robots.txt first) and every product PDF once into `dest`; returns (index, dead links)."""
    dest.mkdir(parents=True, exist_ok=True)
    rules = robots_rules()
    if not robots_rfc.allowed(rules, "/allergens"):
        raise SystemExit("robots.txt disallows /allergens for us: stop and report")
    page = http_get(PAGE_URL)
    (dest / "allergens.html").write_bytes(page)
    index = parse_index(page.decode("utf-8", "replace"))
    blocked = [p for _, _, p in index if not robots_rfc.allowed(rules, p)]
    if blocked:
        raise SystemExit(f"robots.txt disallows these product PDFs for us: {blocked[:5]}...: stop and report, do not fetch")
    dead = []
    for _, _, path in index:
        target = dest / Path(path).name
        if target.exists() and target.stat().st_size > 0:
            continue
        try:
            data = http_get(SITE + path)
        except NotFound:
            dead.append(path)
            continue
        if not data.startswith(b"%PDF"):
            raise SystemExit(f"{path}: the answer is not a PDF")
        target.write_bytes(data)
    return index, dead
