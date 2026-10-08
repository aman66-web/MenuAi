"""Download helper for hall_and_woodhouse.py: the pub list, the pubs read, and one polite download of every menu page.

    python3 -I tools/uk_extract/hall_and_woodhouse_fetch.py --pages DIR [--pubs xap7,xa7y,...]

Pages are saved as DIR/<pub code>_<menu id>.html (one request per page, 1.5 s apart, robots.txt of viewthe.menu checked with
robots_rfc.py before every request). The pub's first page (https://viewthe.menu/<code>) is its first menu; its tab bar names the others.
The hall-woodhouse.co.uk allergens page (the drop-down of pubs) is fetched once with a 10 s pause after it: that site's robots.txt prints
a stray "Crawl-delay: 10" and an empty Disallow.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import hall_and_woodhouse_pages as hp  # noqa: E402
import tenkites_c as tk  # noqa: E402

HUB_URL = "https://www.hall-woodhouse.co.uk/allergens/"
# The pubs read (code = the address https://viewthe.menu/<code>, exactly as the hub page's drop-down lists it). Hall & Woodhouse's own
# five managed pubs, then pubs of other kinds, so a dish counts only if it is printed the same wherever it is printed.
PUBS = [
    ("xap7", "Hall & Woodhouse Bath"),
    ("xa7y", "Hall & Woodhouse Crowthorne"),
    ("xaq8", "Hall & Woodhouse Portishead"),
    ("xa7b", "Hall & Woodhouse Taplow"),
    ("xah8", "Hall & Woodhouse Wichelstowe"),
    ("xad2", "The Black Rabbit"),
    ("xa9b", "The Ship Inn"),
    ("xamz", "The Plough"),
]
# Tabs that are not read. "Food Modifications" lists the kitchen's allergy swaps ("Food Mod Allergy - Anchovy"), not dishes. The two
# "Buffet Menu" tabs are group-catering platters whose calories are for a whole platter of no stated size ("Cheese & Coleslaw Sandwich"
# 5221 kcal, "Grain Salad x 10"): not what one diner orders, so not published.
SKIP_TABS = {"Food Modifications"}


def skipped(tab: str) -> bool:
    return tab in SKIP_TABS or tab.lower().startswith("buffet")


def fetch_hub(dest: Path) -> list:
    """Download the hub page once and return its drop-down: [(code, pub name)]. The pause afterwards honours the Crawl-delay."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", tk.USER_AGENT, "-o", str(dest), HUB_URL], check=True)
    time.sleep(10)
    return hub_pubs(dest)


def hub_pubs(path: Path) -> list:
    import html
    text = Path(path).read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'<option[^>]*value="https://viewthe\.menu/([a-z0-9]+)"[^>]*>([^<]*)</option>', text):
        out.append((m.group(1), html.unescape(m.group(2)).strip()))
    return out


def page_path(pages: Path, code: str, guid: str) -> Path:
    return pages / f"{code}_{guid}.html"


def fetch_pub(pages: Path, code: str, rules: list) -> list:
    """Download a pub's first page and every other menu tab it lists (except SKIP_TABS). Returns [(tab name, menu id)] for the tabs read,
    in tab order; pages already on disk are not downloaded again."""
    first_url = f"{hp.SITE}/{code}"
    tmp = pages / f"{code}_first.html"
    if not tmp.exists():
        hp.fetch(first_url, tmp, rules)
    text = tmp.read_text(encoding="utf-8")
    root = tk.parse_html(text)
    tabs = hp.menu_tabs(root)
    if not tabs:
        raise SystemExit(f"{code}: no tab bar on the page")
    # the first page is the first tab's menu: keep it under that tab's own name so every page is <code>_<menu id>.html
    first_guid = tabs[0][1]
    first_path = page_path(pages, code, first_guid)
    if not first_path.exists():
        tmp.rename(first_path)
    else:
        tmp.unlink()
    for name, guid in tabs[1:]:
        if skipped(name):
            continue
        dest = page_path(pages, code, guid)
        if not dest.exists():
            hp.fetch(f"{first_url}?mguid={guid}", dest, rules)
    return [(n, g) for n, g in tabs if not skipped(n)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--pubs", default="", help="comma-separated pub codes (default: all of PUBS)")
    args = ap.parse_args()
    rules = hp.robots_rules(args.pages / "robots.txt", fetch=not (args.pages / "robots.txt").exists())
    codes = [c for c in args.pubs.split(",") if c] or [c for c, _ in PUBS]
    for code in codes:
        tabs = fetch_pub(args.pages, code, rules)
        print(code, len(tabs), "menus", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
