"""Readers for Drake & Morgan's own menu pages (drakeandmorgan.co.uk). Used by drake_and_morgan.py.

Every bar has a page https://www.drakeandmorgan.co.uk/<venue>/menus/ with a menu selector (<select id="menu_filter">, one <option value=
"<menuID>"> per menu). The page loads a menu with the same call its own script makes (theme file main.min.js):
    POST https://www.drakeandmorgan.co.uk/<venue>/wp-admin/admin-ajax.php   action=ajax_menus&menuID=<menuID>
which answers JSON {menu_sections, calories_filter_section, hide_allergen_filters, hide_allergen_icons, menus}; "menus" is the HTML the
page shows: sections (<h2 class="menus__section-heading ...">, sometimes with <h3> sub-headings) holding items (<div class="menu__item ...">) with a name, a description, a
price, "NNN KCAL" and one allergen tooltip per allergen ("Contains Wheat" / "May Contain Wheat"). Nothing is read from images.
The main-site page https://www.drakeandmorgan.co.uk/sample-menus/ uses the same call (without a venue) for the shared menus.

robots.txt (checked 2026-10-08): "User-agent: *  Disallow:" (nothing disallowed). We send one request a second.
"""
from __future__ import annotations
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

HOST = "https://www.drakeandmorgan.co.uk/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# Pre-order package menus (food / drinks packages, group set menu) are sold as packages for groups, not as dishes.
PACKAGE_MENUS = {"18417", "18408", "18412"}


def _pause() -> None:
    time.sleep(1.1)  # at most one request a second


def fetch_text(url: str, data: dict | None = None, referer: str | None = None) -> bytes:
    headers = {"User-Agent": UA}
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        headers.update({"X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def menu_options(menus_page_html: str, where: str) -> list[tuple[str, str]]:
    """(menuID, label) for every option of the page's menu selector, in order."""
    i = menus_page_html.find('<select name="menu_filter"')
    if i < 0:
        raise SystemExit(f"{where}: no menu selector found: the page layout changed")
    j = menus_page_html.find("</select>", i)
    return [(a, html.unescape(b).strip()) for a, b in re.findall(r'<option value="(\d+)"[^>]*>([^<]*)</option>', menus_page_html[i:j])]


def fetch_venue(pages: Path, venue: str) -> None:
    """Download <venue>/menus/ and every non-package menu in its selector (skips files already on disk)."""
    pages.mkdir(parents=True, exist_ok=True)
    page = pages / f"{venue}-menus.html"
    if not page.exists():
        _pause()
        page.write_bytes(fetch_text(f"{HOST}{venue}/menus/"))
    for menu_id, _ in menu_options(page.read_text(encoding="utf-8"), venue):
        if menu_id in PACKAGE_MENUS:
            continue
        dest = pages / f"{venue}__{menu_id}.json"
        if dest.exists():
            continue
        _pause()
        dest.write_bytes(fetch_text(f"{HOST}{venue}/wp-admin/admin-ajax.php", {"action": "ajax_menus", "menuID": menu_id}, f"{HOST}{venue}/menus/"))


def sha256_text_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _clean(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    return "\n".join(" ".join(line.split()) for line in s.split("\n")).strip()


_SVG = re.compile(r"<svg\b.*?</svg>", re.S)
_ITEM = re.compile(r"""<div class="menu__item \|[^"]*"\s+data-dietary-filters='([^']*)'\s+data-allergen-filters='([^']*)'\s+data-calories="(\d*)">""")
_BLOCK = re.compile(r'<div class="menu__section"[^>]*>')
_H2 = re.compile(r'<h2 class="menus__section-heading[^"]*">(.*?)</h2>', re.S)
_H3 = re.compile(r'<h3 class="menus__section-subheading[^"]*">(.*?)</h3>', re.S)


def read_menu(text: str, where: str) -> dict:
    """One menu response (the JSON text) -> {hide_icons, hide_filters, pdfs, items: [dict]}. Each item: section (the <h2> heading, carried
    over to the following blocks that have none), sub (the <h3> sub-heading of its block, or ''), name, desc, price, kcal_text (the printed
    "NNN KCAL" or ''), data_calories (the page's filter attribute), dietary (list), filters (list: the page's allergen filter keys),
    contains / may (printed tooltip words, 'Contains ' / 'May Contain ' removed)."""
    try:
        data = json.loads(text)
        body = data["menus"]
    except (ValueError, KeyError):
        raise SystemExit(f"{where}: not the JSON the menu call returns: the site changed")
    body = _SVG.sub("", body)
    if len(re.findall(r'class="menu__item \|', body)) != len(_ITEM.findall(body)):
        raise SystemExit(f"{where}: the item markup changed (an item could not be read)")
    starts = [m.start() for m in _BLOCK.finditer(body)]
    items = []
    h2, h3 = "", ""
    for n, s in enumerate(starts):
        block = body[s:starts[n + 1] if n + 1 < len(starts) else len(body)]
        first = _ITEM.search(block)
        head = block[:first.start()] if first else block
        m2, m3 = _H2.search(head), _H3.search(head)
        if m2:
            h2, h3 = _clean(m2.group(1)), (_clean(m3.group(1)) if m3 else "")
        elif m3:
            h3 = _clean(m3.group(1))
        found = list(_ITEM.finditer(block))
        for k, m in enumerate(found):
            if not h2:
                raise SystemExit(f"{where}: an item before the first section heading")
            chunk = block[m.end():found[k + 1].start() if k + 1 < len(found) else len(block)]

            def one(pattern: str, required: bool = False) -> str:
                mm = re.search(pattern, chunk, re.S)
                if not mm:
                    if required:
                        raise SystemExit(f"{where}: an item has no {pattern!r}")
                    return ""
                return _clean(mm.group(1))

            contains, may = [], []
            for tip in re.findall(r'role="tooltip">\s*<div class="d-flex">.*?</div>(.*?)</div>', chunk, re.S):
                words = _clean(tip)
                if words.startswith("Contains "):
                    contains.append(words[len("Contains "):].strip())
                elif words.startswith("May Contain "):
                    may.append(words[len("May Contain "):].strip())
                else:
                    raise SystemExit(f"{where}: allergen tooltip {words!r} is neither 'Contains ...' nor 'May Contain ...'")
            items.append({
                "section": h2, "sub": h3,
                "name": one(r'class="menu__item-name[^"]*">(.*?)</span>', True),
                "desc": one(r'class="menu__item-description[^"]*">(.*?)</div>'),
                "price": one(r'class="menu__item-price[^"]*">(.*?)</span>'),
                "kcal_text": one(r'class="menu__item-calories[^"]*">(.*?)</div>'),
                "data_calories": m.group(3),
                "dietary": json.loads(m.group(1) or "[]"),
                "filters": json.loads(m.group(2) or "[]"),
                "contains": contains,
                "may": may,
            })
    if len(items) != len(_ITEM.findall(body)):
        raise SystemExit(f"{where}: {len(items)} items read but the page has {len(_ITEM.findall(body))}: the section markup changed")
    pdfs = sorted(set(re.findall(r'href="([^"]+\.pdf)"', body)))
    return {"hide_icons": bool(data.get("hide_allergen_icons")), "hide_filters": bool(data.get("hide_allergen_filters")), "pdfs": pdfs, "items": items}
