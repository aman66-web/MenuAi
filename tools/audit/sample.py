#!/usr/bin/env python3
"""Print the rows an independent source re-check should compare for one chain.

    python3 tools/audit/sample.py <chain-id> [--n 14] [--flags-max 30] [--seed 1]

Prints (1) every high/medium audit flag for the chain (up to --flags-max rows, high first), then (2) --n random items spread
over the chain's categories, each with every published nutrient, serving, tags and allergens exactly as the app shows them.
Compare each against the chain's OFFICIAL source read afresh, never against the extraction script's own output.
Run `python3 tools/audit/accuracy_audit.py` first so data/audit/flags/<chain>.csv exists.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def fmt(it: dict) -> str:
    n = it["nutrients"]
    nut = " ".join(f"{k}={v}" for k, v in n.items())
    a = it.get("allergens")
    al = ""
    if a:
        al = f" | contains={','.join(a['contains']) or '-'} may={','.join(a['mayContain']) or '-'}"
        if a.get("cereals"):
            al += f" cereals={','.join(a['cereals'])}"
        if a.get("nuts"):
            al += f" nuts={','.join(a['nuts'])}"
    tags = f" tags={','.join(it['tags'])}" if it.get("tags") else ""
    return f"{it['id']} | {it['name']} | cat={it.get('category', '')} | serving={it.get('serving') or '-'} | {nut}{tags}{al}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chain")
    ap.add_argument("--n", type=int, default=14)
    ap.add_argument("--flags-max", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()
    doc = json.loads((ROOT / "web" / "public" / "menus" / f"chain-{args.chain}.json").read_text())
    by_id = {i["id"]: i for i in doc["items"]}
    print(f"# {doc['id']}: {len(doc['items'])} items, level={doc.get('nutritionLevel', 'full')}")
    print(f"# source: {doc['source'].get('title')} | {doc['source'].get('url')} | checked {doc['source'].get('checkedOn')}")
    g = doc.get("allergenGuide")
    print(f"# allergen guide: {g['title'] if g else 'none'} | {g['url'] if g else ''} | complete={g.get('complete') if g else '-'}")
    fl = ROOT / "data" / "audit" / "flags" / f"{args.chain}.csv"
    flagged: list[str] = []
    if fl.exists():
        rows = [r for r in csv.DictReader(fl.open()) if r["severity"] in ("high", "medium") and r["item"] in by_id]
        rows.sort(key=lambda r: (r["severity"] != "high", r["code"]))
        print(f"\n## FLAGGED ({len(rows)} high/medium flags; showing up to {args.flags_max})")
        seen = set()
        for r in rows[: args.flags_max]:
            print(f"[{r['severity']}] {r['code']}: {r['detail']}\n    {fmt(by_id[r['item']])}")
            seen.add(r["item"])
        flagged = list(seen)
    rest = [i for i in doc["items"] if i["id"] not in flagged]
    rng = random.Random(f"{args.chain}-{args.seed}")
    cats: dict[str, list[dict]] = {}
    for i in rest:
        cats.setdefault(i.get("category", ""), []).append(i)
    picks: list[dict] = []
    keys = list(cats)
    rng.shuffle(keys)
    while len(picks) < min(args.n, len(rest)) and keys:
        for k in list(keys):
            if cats[k] and len(picks) < args.n:
                picks.append(cats[k].pop(rng.randrange(len(cats[k]))))
            if not cats[k]:
                keys.remove(k)
    print(f"\n## RANDOM SAMPLE ({len(picks)} items spread over categories)")
    for i in picks:
        print(fmt(i))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
