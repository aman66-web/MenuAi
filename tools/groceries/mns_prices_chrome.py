#!/usr/bin/env python3
"""M&S prices for its Foodhall range, read from M&S's own aisle pages in the founder's Chrome once a store is chosen there.

Founder 2026-11-18 ("There must be a way to find price. Try and find it for me", then "Yes for M&S do that for me"): M&S prices each store separately. With no
store chosen its aisle and product pages carry no price (tools/groceries/mns_food_listing.py, run on the Mac, found every price field empty); with a store chosen
on marksandspencer.com (M&S Marble Arch, picked on 18 November 2026 by searching "Marble Arch": a central store, nothing about where the founder lives), each aisle
page's own data (__NEXT_DATA__, props.pageProps.viewModel.productSearch.productLists.ranged) carries every tile's "price" ("£5.25") and "unitPrice"
("£1.31 per 100g"), and a tile M&S doesn't sell at that store carries none. This copies those two strings exactly; nothing is estimated.

    python3 tools/groceries/mns_prices_chrome.py next TAB [N]   # the next N aisle pages (default 4) as a browser_batch action list: navigate, then 4 reads of 25 tiles
    python3 tools/groceries/mns_prices_chrome.py harvest        # copy the reads from the helpers' transcripts into raw/marks-and-spencer-prices.jsonl
    python3 tools/groceries/mns_prices_chrome.py write          # the prices -> data/groceries/listing/marks-and-spencer-food.csv (price columns), with the store

Same pages as the October crawl (data/groceries/listing/raw/marks-and-spencer-food.jsonl, 80 aisle pages; robots.txt allows /food/l/<aisle> and ?page=N),
one page at a time in the founder's own browser, read-only; a page that is a bot check, or not on marksandspencer.com, or without the chosen store's name stops it.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import labels_chrome_next as L  # noqa: E402  (the transcript readers)
import mns_food_listing as M  # noqa: E402  (the aisles and their page addresses)

RAW = ROOT / "data" / "groceries" / "listing" / "raw" / "marks-and-spencer-food.jsonl"
PRICES = ROOT / "data" / "groceries" / "listing" / "raw" / "marks-and-spencer-prices.jsonl"
STATE = ROOT / "data" / "groceries" / "nutrition" / ".mprice_state.json"
LISTING = ROOT / "data" / "groceries" / "listing" / "marks-and-spencer-food.csv"
CHUNK = 25

# one read: the chosen store's name from the page, and tiles [off, off+25) as [id, price, unitPrice] exactly as the page's own data gives them
JS = ("WAIT const nd = JSON.parse(document.getElementById('__NEXT_DATA__').textContent); "
      "const r = ((((nd.props || {}).pageProps || {}).viewModel || {}).productSearch || {}).productLists || {}; const t = r.ranged || []; "
      "const txt = document.body ? document.body.innerText : ''; const st = (txt.match(/\\n([A-Z][A-Z0-9 '.-]{2,40})\\n\\s*Change store/) || [])[1] || ''; "
      "const blocked = /verify you are human|access denied|pardon our interruption|are you a robot|captcha/i.test(document.title + ' ' + txt.slice(0, 2000)); "
      "JSON.stringify({ want: WANT, host: location.hostname.replace(/^www\\./, ''), part: 'mprice', off: OFF, n: t.length, store: st, blocked, "
      "rows: t.slice(OFF, OFF + 25).map((x) => [String(x.id || ''), String(x.price || ''), String(x.unitPrice || '')]), checked_on: new Date().toISOString().slice(0, 10) })")


def pages() -> list[tuple[str, int]]:
    out = []
    for line in RAW.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        if r.get("k") == "page":
            out.append((r["unit"], int(r["page"]), int(r.get("tiles") or 0)))
    return out


def key(unit: str, page: int) -> str:
    return unit.replace("/", "~") + "|" + str(page)  # no "/" in a result (the browser tool hides results that look like addresses)


def stored() -> dict[str, dict]:
    out = {}
    if PRICES.exists():
        for line in PRICES.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["want"]] = r
    return out


def harvest() -> str:
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    offsets, chunks = state.get("offsets", {}), state.get("chunks", {})
    for path in L.TRANSCRIPTS.glob("**/*.jsonl"):
        try:
            size = path.stat().st_size
            start = offsets.get(str(path), 0)
            if start > size:
                start = 0
            if start == size:
                continue
            with open(path, "rb") as f:
                f.seek(start)
                data = f.read()
        except OSError:
            continue
        end = data.rfind(b"\n")
        if end < 0:
            continue
        offsets[str(path)] = start + end + 1
        for raw in data[: end + 1].split(b"\n"):
            if b"mprice" not in raw:
                continue
            try:
                node = json.loads(raw.decode("utf-8", errors="replace"))
            except ValueError:
                continue
            for text in L._texts(node):
                for r in L._results(text):
                    if r.get("part") == "mprice" and r.get("host") == "marksandspencer.com" and isinstance(r.get("rows"), list):
                        chunks.setdefault(r["want"], {})[str(r["off"])] = r
    have = stored()
    added, blocked = 0, []
    with open(PRICES, "a", encoding="utf-8") as out:
        for want, parts in sorted(chunks.items()):
            if want in have:
                continue
            first = parts.get("0")
            if not first:
                continue
            if first.get("blocked") or not first.get("store"):
                blocked.append(want)
                continue
            n = int(first.get("n") or 0)
            need = [str(o) for o in range(0, max(n, 1), CHUNK)]
            if not all(o in parts for o in need):
                continue
            rows = [row for o in need for row in parts[o]["rows"]]
            out.write(json.dumps({"want": want, "store": first["store"], "n": n, "rows": rows, "checked_on": first["checked_on"]}, ensure_ascii=False) + "\n")
            added += 1
    state = {"offsets": offsets, "chunks": {w: p for w, p in chunks.items() if w not in stored()}}
    STATE.write_text(json.dumps(state))
    return f"M&S prices: {added} aisle pages added, {len(stored())} of {len(pages())} read" + (f"; NOT USED (bot check or no store shown): {', '.join(blocked)}" if blocked else "")


def next_actions(tab: int, n: int) -> list[dict]:
    have = stored()
    acts = []
    units = {u.slug: u for u in M.UNITS}
    for unit, page, tiles in pages():
        if key(unit, page) in have:
            continue
        acts.append({"name": "navigate", "input": {"url": M.page_url(units[unit], page), "tabId": tab}})
        for i, off in enumerate(range(0, max(tiles, 1) + 10, CHUNK)):  # a few more than October's count, in case the aisle grew
            code = JS.replace("WAIT", "await new Promise((r) => setTimeout(r, 3500));" if i == 0 else "").replace("WANT", json.dumps(key(unit, page))).replace("OFF", str(off))
            acts.append({"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": code}})
        n -= 1
        if n <= 0:
            break
    return acts


def to_unit(unit_price: str) -> tuple[str, str]:
    """'£1.31 per 100g' -> ('13.10', 'kg'): only exact conversions (per 100 g x10 = per kg, per 100 ml x10 = per litre, per kg / per litre / each as printed)."""
    m = re.fullmatch(r"\s*£\s*(\d+(?:\.\d+)?)\s*per\s*(100\s*g|100\s*ml|kg|1\s*kg|litre|1\s*l|l|each|ea)\s*", unit_price or "", re.I)
    if not m:
        return "", ""
    v, per = float(m.group(1)), re.sub(r"\s+", "", m.group(2).lower())
    if per == "100g":
        return f"{v * 10:.2f}", "kg"
    if per == "100ml":
        return f"{v * 10:.2f}", "litre"
    if per in ("kg", "1kg"):
        return f"{v:.2f}", "kg"
    if per in ("litre", "1l", "l"):
        return f"{v:.2f}", "litre"
    return f"{v:.2f}", "each"


def write() -> int:
    prices, stores, dates = {}, set(), set()
    for r in stored().values():
        stores.add(r["store"])
        dates.add(r["checked_on"])
        for pid, price, unit_price in r["rows"]:
            m = re.fullmatch(r"\s*£\s*(\d+(?:\.\d{1,2})?)\s*", price or "")
            if pid and m:
                prices.setdefault("fdp" + pid, (f"{float(m.group(1)):.2f}", *to_unit(unit_price), r["checked_on"]))
    with open(LISTING, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    n = 0
    for row in rows:
        p = prices.get(row["product_id"])
        if p:
            row["price_gbp"], row["unit_price_gbp"], row["unit"], row["checked_on"] = p
            n += 1
    with open(LISTING, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=M.HEADER)
        w.writeheader()
        w.writerows(rows)
    (ROOT / "data" / "groceries" / "listing" / "marks-and-spencer-price-store.txt").write_text(
        f"M&S prices read from M&S's own aisle pages with the store set to {', '.join(sorted(stores))} on marksandspencer.com, on {', '.join(sorted(dates))}.\n", encoding="utf-8")
    print(f"M&S: {n} of {len(rows)} range products priced at {', '.join(sorted(stores)) or '?'} ({len(prices)} prices read)")
    return 0


def main() -> int:
    if sys.argv[1] == "harvest":
        print(harvest())
    elif sys.argv[1] == "next":
        print(harvest(), file=sys.stderr)
        print(json.dumps(next_actions(int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 4), ensure_ascii=False))
    elif sys.argv[1] == "write":
        return write()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
