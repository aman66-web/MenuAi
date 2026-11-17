#!/usr/bin/env python3
"""The next product pages to read in Chrome: the ids in data/groceries/recipe-candidates/<shop>.csv not yet in raw-<shop>/chrome.jsonl, with their addresses.

    python3 tools/groceries/labels_chrome_next.py <shop> [N]      # prints "id<TAB>url" lines, N (default 70) at most
    python3 tools/groceries/labels_chrome_next.py <shop> --add 'JSON'  # appends one extractor line (validated) to the raw file
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = {"asda": "https://www.asda.com/groceries/product/{id}", "aldi": "https://www.aldi.co.uk/product/{page}"}


def main() -> int:
    shop = sys.argv[1]
    raw = ROOT / "data" / "groceries" / "nutrition" / f"raw-{shop}" / "chrome.jsonl"
    raw.parent.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) > 3 and sys.argv[2] == "--add":
        rec = json.loads(sys.argv[3])
        assert isinstance(rec, dict) and str(rec.get("id", "")).strip(), "not an extractor line"
        with open(raw, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print("added", rec["id"], "blocked" if rec.get("blocked") else "")
        return 0
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 70
    done = set()
    if raw.exists():
        for line in raw.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(str(json.loads(line).get("id")))
    out = 0
    with open(ROOT / "data" / "groceries" / "recipe-candidates" / f"{shop}.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            key = r["product_id"] if shop != "aldi" else (r["page"] or r["product_id"]).rstrip("/").split("/")[-1]
            if r["product_id"] in done or key in done:
                continue
            print(f"{r['product_id']}\t{BASE[shop].format(id=r['product_id'], page=r['page'] or r['product_id'])}")
            out += 1
            if out >= n:
                break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
