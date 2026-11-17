#!/usr/bin/env python3
"""The next product pages to read in Chrome: the ids in data/groceries/recipe-candidates/<shop>.csv not yet in raw-<shop>/chrome.jsonl, with their addresses.

    python3 tools/groceries/labels_chrome_next.py <shop> [N]      # prints "id<TAB>url" lines, N (default 70) at most
    python3 tools/groceries/labels_chrome_next.py <shop> --add 'JSON'  # appends one extractor line (validated) to the raw file
    python3 tools/groceries/labels_chrome_next.py <shop> N --batch TAB  # the next N pages as a browser_batch action list (navigate + extractor each)
    python3 tools/groceries/labels_chrome_next.py <shop> --add-file F   # appends every extractor line found in file F (one JSON object per line)
    python3 tools/groceries/labels_chrome_next.py <shop> --install         # the line that stores the reader in the open tab (window.name; kept while the tab
                                                                          # stays on that shop's site), to run once with javascript_tool before --short batches
    python3 tools/groceries/labels_chrome_next.py <shop> N --short TAB [--all]  # --all: every product in the shop's list without its own label, not only recipe ones
    python3 tools/groceries/labels_chrome_next.py <shop> N --short TAB    # the next N pages as navigate + a one-line call of the stored reader (about 200 bytes
                                                                          # a page instead of 2.9 KB); a page where the reader isn't stored answers needInstall
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = {"asda": "https://www.asda.com/groceries/product/{id}", "aldi": "https://www.aldi.co.uk/product/{page}",
        "tesco": "https://www.tesco.com/groceries/en-GB/products/{id}", "marks-and-spencer": "https://www.marksandspencer.com/food/{page}"}


def all_products(shop: str):
    """Every product in the shop's published list (web/public/groceries/all/<shop>.json) that has its own product page and no label read from it yet (founder 2026-11-17:
    "we need nutrients for every single product"), as rows shaped like recipe-candidates (product_id, page). Rows whose only address is the shop's search are skipped."""
    doc = json.loads((ROOT / "web" / "public" / "groceries" / "all" / f"{shop}.json").read_text(encoding="utf-8"))
    for row in doc["products"]:
        nut = row[10] if len(row) > 10 else None
        if nut and not (len(nut) > 11 and nut[11] == "off"):
            continue  # the shop's own label is already read
        page = row[11] if len(row) > 11 and isinstance(row[11], str) else ""
        if shop in ("aldi", "marks-and-spencer") and not page:
            continue
        yield {"product_id": row[0], "page": page}


def main() -> int:
    shop = sys.argv[1]
    raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
    raw.parent.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) > 3 and sys.argv[2] == "--add-file":
        added = 0
        with open(raw, "a", encoding="utf-8") as out:
            for line in Path(sys.argv[3]).read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line.startswith("{"):
                    continue
                rec = json.loads(line)
                if isinstance(rec, dict) and str(rec.get("id", "")).strip() and "nut" in rec:
                    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    added += 1
                    if rec.get("blocked"):
                        print("BLOCKED PAGE:", rec["id"])
        print("added", added)
        return 0
    if len(sys.argv) > 3 and sys.argv[2] == "--add":
        rec = json.loads(sys.argv[3])
        assert isinstance(rec, dict) and str(rec.get("id", "")).strip(), "not an extractor line"
        with open(raw, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print("added", rec["id"], "blocked" if rec.get("blocked") else "")
        return 0
    reader = (Path(__file__).resolve().parent / "labels_chrome.js").read_text(encoding="utf-8")
    reader = " ".join(line.strip() for line in reader[reader.index("(() => {"):].splitlines() if line.strip() and not line.strip().startswith("//"))
    if len(sys.argv) > 2 and sys.argv[2] == "--install":
        print("window.name = " + json.dumps(reader) + "; 'installed'")
        return 0
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 70
    short = len(sys.argv) > 4 and sys.argv[3] == "--short"
    tab = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[3] in ("--batch", "--short") else None
    code = None
    if short:
        # the site allows inline scripts but not eval: the stored reader runs as a script element and leaves its JSON line on window.__lbl
        code = ("await new Promise((r) => setTimeout(r, 2500)); if (!window.name.startsWith('(() => {')) JSON.stringify({ id: location.pathname.split('/').filter(Boolean).pop(), needInstall: true }); "
                "else { const s = document.createElement('script'); s.textContent = 'window.__lbl = ' + window.name; document.head.appendChild(s); s.remove(); window.__lbl }")
    elif tab is not None:
        js = (Path(__file__).resolve().parent / "labels_chrome.js").read_text(encoding="utf-8")
        # a moment for the page to draw its folded sections before reading
        body = js[js.index("(() => {"):]
        # comments and indentation out (it is sent once per page): the same code, smaller
        body = " ".join(line.strip() for line in body.splitlines() if line.strip() and not line.strip().startswith("//"))
        code = "await new Promise((r) => setTimeout(r, 2500)); " + body
    actions = []
    done = set()
    if raw.exists():
        for line in raw.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(str(json.loads(line).get("id")))
    out = 0
    every = "--all" in sys.argv
    for r in (all_products(shop) if every else csv.DictReader(open(ROOT / "data" / "groceries" / "recipe-candidates" / f"{shop}.csv", newline="", encoding="utf-8"))):
        if True:
            key = r["product_id"] if shop != "aldi" else (r["page"] or r["product_id"]).rstrip("/").split("/")[-1]
            if r["product_id"] in done or key in done:
                continue
            url = BASE[shop].format(id=r["product_id"], page=r["page"] or r["product_id"])
            if tab is None:
                print(f"{r['product_id']}\t{url}")
            else:
                actions += [{"name": "navigate", "input": {"url": url, "tabId": tab}}, {"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": tab, "text": code}}]
            out += 1
            if out >= n:
                break
    if tab is not None:
        print(json.dumps(actions, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
