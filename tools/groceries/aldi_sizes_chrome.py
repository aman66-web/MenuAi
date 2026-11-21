#!/usr/bin/env python3
"""Aldi's pack sizes and prices per kg or litre, read from its own product pages in Chrome (founder 2026-11-21: recipes for every shop; Aldi's shop tiles
printed no size when its list was read, so a serving's cost couldn't be worked out for most of its recipes).

Aldi's product page prints the selling size and the price per kg or litre on the line under the product name, e.g. "1 kg (£0.85/1 KG)". This reads that line,
exactly as printed, for the products in data/groceries/wanted/aldi-sizes.txt (Aldi products a recipe could use whose cost can't be worked out; made by a
throwaway test from lib/mm/recipes.ts candidates), and puts it into data/groceries/listing/aldi.csv: the size after the name when the name has none, and the
price per kg or litre when the row has none. Nothing is computed except a "per 100 g" or "per 100 ml" price turned into per kg or litre (times 10).

    python3 tools/groceries/aldi_sizes_chrome.py next N --tab TAB   # harvest, then the next N unread pages as a browser_batch action list
    python3 tools/groceries/aldi_sizes_chrome.py --harvest           # copy every size line from Claude's own transcripts into data/groceries/listing/aldi-sizes.jsonl
    python3 tools/groceries/aldi_sizes_chrome.py write               # put the sizes into data/groceries/listing/aldi.csv (run again after ingest_listing.py aldi)

Then: python3 tools/groceries/build_all_products.py --only aldi
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from labels_chrome_next import MARK, TRANSCRIPTS, _texts  # noqa: E402

WANTED = ROOT / "data" / "groceries" / "wanted" / "aldi-sizes.txt"
OUT = ROOT / "data" / "groceries" / "listing" / "aldi-sizes.jsonl"
LISTING = ROOT / "data" / "groceries" / "listing" / "aldi.csv"
PAGE = "https://www.aldi.co.uk/product/{page}"

# The reader: the product's name (h1) and the first of the three lines under it that starts with a size, as the page prints it. WANT is the product id asked for.
READER = (
    "await new Promise((r) => setTimeout(r, 2500)); (() => { const h1 = (document.querySelector('h1')?.innerText || '').trim(); "
    "const lines = (document.querySelector('main') || document.body).innerText.split('\\n').map((s) => s.trim()).filter(Boolean); "
    "const i = lines.indexOf(h1); const line = i < 0 ? null : (lines.slice(i + 1, i + 4).find((s) => /^\\d[\\d.,]*\\s*(?:x\\s*\\d[\\d.,]*\\s*)?(?:kg|g|ml|cl|l|litres?|pack|each|ea)\\b/i.test(s)) ?? null); "
    "const blocked = /verify you are human|access denied|robot/i.test(document.title + ' ' + lines.slice(0, 5).join(' ')); "
    "return JSON.stringify({ aldiSize: WANT, host: location.host, h1, line, blocked }); })()"
)


def wanted() -> list[tuple[str, str]]:
    out = []
    for line in WANTED.read_text(encoding="utf-8").splitlines():
        if "\t" in line:
            pid, name = line.split("\t", 1)
            out.append((pid.strip(), name.strip()))
    return out


def read_out() -> dict[str, dict]:
    got: dict[str, dict] = {}
    if OUT.exists():
        for line in OUT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                got[str(r["aldiSize"])] = r
    return got


def harvest(days: float = 2) -> str:
    """Every reader result in this project's transcripts of the last `days` days, copied as returned (the last read of a page wins)."""
    got = read_out()
    before = len(got)
    since = time.time() - days * 86400
    for path in TRANSCRIPTS.rglob("*.jsonl"):
        if path.stat().st_mtime < since:
            continue
        with open(path, encoding="utf-8", errors="replace") as f:
            for raw in f:
                if '\\"aldiSize\\"' not in raw and '"aldiSize"' not in raw:
                    continue
                try:
                    node = json.loads(raw)
                except ValueError:
                    continue
                for text in _texts(node):
                    dec = json.JSONDecoder()
                    i = text.find(MARK)
                    while i >= 0:
                        j = i + len(MARK)
                        try:
                            obj, _ = dec.raw_decode(text, j)
                            if isinstance(obj, str):
                                obj = json.loads(obj)
                            if isinstance(obj, dict) and "aldiSize" in obj and obj.get("host", "").endswith("aldi.co.uk") and not obj.get("blocked"):
                                got[str(obj["aldiSize"])] = {k: obj.get(k) for k in ("aldiSize", "h1", "line")}
                        except ValueError:
                            pass
                        i = text.find(MARK, j)
    with open(OUT, "w", encoding="utf-8") as f:
        for pid in sorted(got):
            f.write(json.dumps(got[pid], ensure_ascii=False) + "\n")
    return f"harvested {len(got) - before} new; {len(got)} in all"


def pages() -> dict[str, str]:
    doc = json.loads((ROOT / "web" / "public" / "groceries" / "all" / "aldi.json").read_text(encoding="utf-8"))
    return {r[0]: (r[11] if len(r) > 11 and isinstance(r[11], str) and r[11] else r[0]) for r in doc["products"]}


SIZE = re.compile(r"\b\d[\d.,]*\s*(?:x\s*\d[\d.,]*\s*)?(?:kg|g|ml|cl|l|litres?)\b", re.I)
PER = re.compile(r"\(£\s*([\d.]+)\s*/\s*([\d.]+)?\s*(kg|g|l|ml|cl)\s*\)", re.I)


def write() -> str:
    got = read_out()
    rows = list(csv.DictReader(open(LISTING, newline="", encoding="utf-8")))
    fields = list(rows[0].keys())
    named = priced = changed = 0
    for r in rows:
        s = got.get(r["product_id"])
        if not s or not s.get("line"):
            continue
        line = s["line"].strip()
        size = line.split("(")[0].strip()
        if size and not SIZE.search(r["name"]) and SIZE.fullmatch(size):
            r["name"] = f"{r['name']} {size}"
            named += 1
        m = PER.search(line)
        if m and not (r.get("unit_price_gbp") or "").strip():
            price, qty, unit = float(m.group(1)), float(m.group(2) or 1), m.group(3).lower()
            per = {"kg": 1, "g": 1000, "l": 1, "ml": 1000, "cl": 100}[unit] / qty  # the printed price is for qty units: per kg or litre is times this
            page_per = round(price * per, 2)
            # only where it agrees with the price the list was read at (within 3%): the page is read today, the list on 8 October, and a price per kg from a
            # later price would make the product's two prices disagree. The size in the name is enough for the app to work out the cost from the list's price.
            amount = pack_amount(size)
            listed = float(r["price_gbp"]) if (r.get("price_gbp") or "").strip() else None
            if amount and listed and abs(listed / amount - page_per) <= 0.03 * page_per:
                r["unit_price_gbp"] = f"{page_per:.2f}"
                r["unit"] = "per kg" if unit in ("kg", "g") else "per litre"
                priced += 1
            else:
                changed += 1
    with open(LISTING, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    return f"aldi.csv: {named} names given their size, {priced} prices per kg or litre ({changed} left out: the page's price has changed since the list), from {len(got)} pages read"


def pack_amount(size: str) -> float | None:
    """The pack in kg or litres from a size as printed ("500 g" 0.5, "4 x 28 g" 0.112, "1 l" 1, "750 ml" 0.75), else None."""
    m = re.fullmatch(r"\s*(\d[\d.]*)\s*(?:x\s*(\d[\d.]*)\s*)?(kg|g|ml|cl|l|litres?)\s*", size or "", re.I)
    if not m:
        return None
    n = float(m.group(1)) * (float(m.group(2)) if m.group(2) else 1)
    unit = m.group(3).lower()
    return n / {"kg": 1, "g": 1000, "l": 1, "litre": 1, "litres": 1, "ml": 1000, "cl": 100}[unit]


def main() -> int:
    a = sys.argv[1:]
    if a[:1] == ["--harvest"]:
        print(harvest())
        return 0
    if a[:1] == ["write"]:
        print(write())
        return 0
    if a[:1] == ["next"] and len(a) >= 4 and a[2] == "--tab":
        n, tab = int(a[1]), int(a[3])
        print(harvest(), file=sys.stderr)
        got, where = read_out(), pages()
        actions = []
        for pid, _ in wanted():
            if pid in got:
                continue
            actions.append({"name": "navigate", "input": {"url": PAGE.format(page=where.get(pid, pid)), "tabId": tab}})
            actions.append({"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": READER.replace("WANT", json.dumps(pid))}})
            if len(actions) >= 2 * n:
                break
        print(json.dumps(actions, ensure_ascii=False))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
