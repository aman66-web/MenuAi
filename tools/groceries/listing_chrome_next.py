#!/usr/bin/env python3
"""Shelf pages (a shop's category listings) read in the founder's Chrome, and the harvest that copies what they printed into the raw listing file.

Founder 2026-11-19: "All supermarkets should have all their food products." Tesco's October crawl (data/groceries/listing/raw/tesco_listing.txt) stopped at
Tesco's security page after fresh food, bakery and part of frozen; this reads the rest of its food shelves (the rest of frozen, food cupboard, treats and
snacks, soft drinks; never the beer, wine and spirits shelves) the same way, one page at a time, at a person's pace.

    python3 tools/groceries/listing_chrome_next.py tesco N --tab TAB [--wait S]   # harvest, then the next N pages as a browser_batch action list
    python3 tools/groceries/listing_chrome_next.py --harvest                     # copy every finished page from Claude's transcripts into the raw file
    python3 tools/groceries/listing_chrome_next.py tesco --status                # pages read, pages known to be left, shelves not started

Each page is three actions: navigate to the shelf page; the extractor (tools/groceries/listing_chrome.js), which reads the product tiles, writes them into
the page as one block of text in the line format tools/groceries/ingest_listing.py reads, with a line count and a checksum, and returns a short summary; then
get_page_text, which returns that block whole (a javascript_tool result is cut off at about 1,000 characters; a page of 96 products is about 15,000). The
harvest copies the block from the helper's transcript byte for byte and keeps it only when its line count and checksum match what the page computed, so
no line is ever retyped or edited. Then `ingest_listing.py tesco raw/tesco_listing.txt raw/tesco_listing_chrome.txt` makes data/groceries/listing/tesco.csv.
A page showing a security check ("blocked") is never kept; a helper stops at the first one.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "groceries" / "listing" / "raw"
TRANSCRIPTS = Path.home() / ".claude" / "projects" / ("-" + str(ROOT).strip("/").replace("/", "-"))
STATE = ROOT / "data" / "groceries" / "listing" / ".listing_harvest_state.json"  # where each transcript was read up to (not in git)
JS = Path(__file__).resolve().parent / "listing_chrome.js"
SHOPS = {
    "tesco": {
        "host": "www.tesco.com",
        "plan": RAW / "tesco_categories.txt",
        "done_files": [RAW / "tesco_listing.txt"],
        "out": RAW / "tesco_listing_chrome.txt",
        "per_page": 96,
        "page_url": "{url}?sortBy=relevance&page={k}&count=96",
        # shelves the October crawl finished (its progress notes: "DONE (last page < 96 tiles)"), the department totals, and the alcohol shelves
        "skip": re.compile(r"^(fresh-food|bakery) >|> ALL \(|frozen-food > (vegetables|chips-potatoes-and-sides|meat-and-poultry|fish-and-seafood|party-foods|"
                           r"pies-bakes-and-sausage-rolls|yorkshire-puddings-and-stuffing|fruit-and-pastry|ice-cubes)$|drinks > (beer-and-cider|wine|spirits|"
                           r"ready-to-drink-wine-and-spirits|alcohol-gift-sets)$"),
    },
}
BLOCK = re.compile(r"@@MMLIST (\{[^\n]*\})\n(.*?)\n?@@END (\d+) ([0-9a-f]{8})", re.S)


def fnv(lines: list[str]) -> str:
    """The checksum the page computes (FNV-1a, 32 bit, over the UTF-8 bytes of the lines joined by newlines)."""
    h = 0x811C9DC5
    for b in "\n".join(lines).encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def plan(shop: str) -> list[tuple[str, str]]:
    """The shelves still to read, in the plan's order: (path, url)."""
    cfg = SHOPS[shop]
    out = []
    for line in cfg["plan"].read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or "|" not in line:
            continue
        path, url = [x.strip() for x in line.split("|")[:2]]
        if not cfg["skip"].search(path):
            out.append((path, url))
    return out


def pages_read(shop: str) -> dict[str, dict[int, int]]:
    """For each shelf, the pages already in the output file and the page count each one printed ({path: {page: of}})."""
    got: dict[str, dict[int, int]] = {}
    out = SHOPS[shop]["out"]
    if out.exists():
        for line in out.read_text(encoding="utf-8").splitlines():
            m = re.match(r"#CAT (.+?) \| \S+ \| Page (\d+) of (\d+)", line)
            if m:
                got.setdefault(m.group(1), {})[int(m.group(2))] = int(m.group(3))
    return got


def todo(shop: str) -> list[tuple[str, str, int]]:
    """The pages still to read: page 1 of every shelf not started, then the pages a shelf's page 1 said it has."""
    read = pages_read(shop)
    first, rest = [], []
    for path, url in plan(shop):
        have = read.get(path)
        if not have:
            first.append((path, url, 1))
            continue
        of = max(have.values())
        rest += [(path, url, k) for k in range(1, of + 1) if k not in have]
    return rest + first  # finish the shelves already begun before starting new ones


def harvest(days: float = 4) -> str:
    """Copy every whole, checked page block from the last few days' transcripts into the shop's output file (each page once)."""
    import fcntl
    import time
    STATE.parent.mkdir(parents=True, exist_ok=True)
    lock = open(STATE.with_suffix(".lock"), "w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        try:
            state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
        except ValueError:
            state = {}
        offsets = state.get("offsets", {})
        hosts = {c["host"]: s for s, c in SHOPS.items()}
        have = {s: pages_read(s) for s in SHOPS}
        added: dict[str, int] = {}
        bad = blocked = 0
        cutoff = time.time() - days * 86400
        for path in TRANSCRIPTS.glob("**/*.jsonl"):
            try:
                st = path.stat()
                if st.st_mtime < cutoff:
                    continue
                start = offsets.get(str(path), 0)
                if start > st.st_size:
                    start = 0
                if start == st.st_size:
                    continue
                with open(path, "rb") as fb:
                    fb.seek(start)
                    data = fb.read()
            except OSError:
                continue
            end = data.rfind(b"\n")
            if end < 0:
                continue
            offsets[str(path)] = start + end + 1
            for raw_line in data[: end + 1].split(b"\n"):
                if b"@@MMLIST" not in raw_line:
                    continue
                try:
                    node = json.loads(raw_line.decode("utf-8", errors="replace"))
                except ValueError:
                    continue
                for text in _strings(node):
                    for m in BLOCK.finditer(text):
                        try:
                            head = json.loads(m.group(1))
                        except ValueError:
                            continue
                        lines = [ln for ln in m.group(2).split("\n") if ln] if m.group(2) else []
                        shop = hosts.get(str(head.get("host", "")))
                        if not shop or head.get("part") != "list":
                            continue
                        if head.get("blocked"):
                            blocked += 1
                            continue
                        if len(lines) != int(m.group(3)) or fnv(lines) != m.group(4) or len(lines) != head.get("n"):
                            bad += 1  # cut short or changed on the way: the page is offered again
                            continue
                        cat, page, of = head.get("cat"), int(head.get("page") or 0), int(head.get("of") or 0)
                        if not cat or page < 1 or of < 1 or page in have[shop].get(cat, {}):
                            continue
                        header = (f"#CAT {cat} | {head.get('url', '')} | Page {page} of {of} | tiles {head.get('tiles', len(lines))} | "
                                  f"shown {head.get('shown', '')} | marketplace-skipped {head.get('marketplace', 0)} | sponsored-skipped {head.get('sponsored', 0)} | "
                                  f"checked_on {head.get('checked_on', '')}")
                        with open(SHOPS[shop]["out"], "a", encoding="utf-8") as f:
                            f.write(header + "\n" + "".join(ln + "\n" for ln in lines))
                        have[shop].setdefault(cat, {})[page] = of
                        added[shop] = added.get(shop, 0) + 1
        tmp = STATE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"offsets": offsets}), encoding="utf-8")
        tmp.replace(STATE)
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()
    note = ", ".join(f"{s} {n} pages" for s, n in sorted(added.items())) or "nothing new"
    return f"harvested {note}" + (f"; {bad} cut short (offered again)" if bad else "") + (f"; BLOCKED pages seen: {blocked}" if blocked else "")


def _strings(node):
    """Every string inside a transcript line (tool results nest their text at different depths)."""
    if isinstance(node, dict):
        for v in node.values():
            yield from _strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _strings(v)
    elif isinstance(node, str) and "@@MMLIST" in node:
        yield node


def actions(shop: str, n: int, tab: int, wait_s: float) -> list[dict]:
    cfg = SHOPS[shop]
    body = JS.read_text(encoding="utf-8")
    body = " ".join(line.strip() for line in body.splitlines() if line.strip() and not line.strip().startswith("//"))
    out = []
    for path, url, k in todo(shop)[:n]:
        page = cfg["page_url"].format(url=url, k=k)
        args = json.dumps({"cat": path, "page": k, "per": cfg["per_page"], "waitMs": int(wait_s * 1000)})
        out += [{"name": "navigate", "input": {"url": page, "tabId": tab}},
                {"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": f"({body})({args})"}},
                {"name": "get_page_text", "input": {"tabId": tab}}]
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    if sys.argv[1] == "--harvest":
        print(harvest())
        return 0
    shop = sys.argv[1]
    if shop not in SHOPS:
        print(f"unknown shop {shop!r}; known: {', '.join(SHOPS)}")
        return 1
    if "--status" in sys.argv:
        read = pages_read(shop)
        left = todo(shop)
        started = sum(1 for p, _ in plan(shop) if p in read)
        print(f"{shop}: {sum(len(v) for v in read.values())} pages read on {started} shelves; {len([t for t in left if t[2] > 1 or t[0] in read])} pages known to be left; "
              f"{len([t for t in left if t[0] not in read])} shelves not started")
        return 0
    n = int(sys.argv[2])
    tab = int(sys.argv[sys.argv.index("--tab") + 1])
    wait_s = float(sys.argv[sys.argv.index("--wait") + 1]) if "--wait" in sys.argv else 6
    print(harvest())
    print(json.dumps(actions(shop, n, tab, wait_s), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
