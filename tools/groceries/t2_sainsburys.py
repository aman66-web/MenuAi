#!/usr/bin/env python3
"""Tier 2 for Sainsbury's: read each product's own page for its nutrition table (docs/GROCERIES_PLAN.md "Every product").

A Chrome agent loads product pages and runs tools/groceries/t2_extractor.js, which prints one short checksummed line per page; this tool hands out the
next slugs, verifies and stores the lines, and finally writes data/groceries/nutrition/sainsburys.csv. The agent never types a slug: each line carries a
4-character hash of the page's own slug, which this tool matches to the slug it handed out (so a redirect or a wrong page is caught), and a 4-character
check of the numbers (so a typing slip is caught). Nothing is estimated; a number the table lacks stays empty.

    python3 tools/groceries/t2_sainsburys.py slices  --work DIR [--n 3] [--limit 4000]   # priority-ordered slices of slugs still to read
    python3 tools/groceries/t2_sainsburys.py next    --work DIR --slice 1 [--n 8]         # the next page addresses to open (one per line)
    python3 tools/groceries/t2_sainsburys.py append  --work DIR --slice 1 < lines         # verify + store the extractor's lines (stdin)
    python3 tools/groceries/t2_sainsburys.py status  --work DIR
    python3 tools/groceries/t2_sainsburys.py ingest  --work DIR [--checked-on 2026-10-09]  # -> data/groceries/nutrition/sainsburys.csv
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_groceries as bg  # noqa: E402

LISTING = ROOT / "data" / "groceries" / "listing" / "sainsburys.csv"
OUT = ROOT / "data" / "groceries" / "nutrition" / "sainsburys.csv"
PAGE = "https://www.sainsburys.co.uk/groceries/product/"
FIELDS = ["per", "kj", "kcal", "fat", "saturates", "carbs", "sugars", "fibre", "protein", "salt"]
HEADER = ["product_id", "per", "kj", "kcal", "fat_g", "saturates_g", "carbs_g", "sugars_g", "fibre_g", "protein_g", "salt_g", "checked_on", "page_url"]
# Read in this order (people looking for protein first). Alcohol pages carry no nutrition table, so those are not handed out at all.
PRIORITY = [
    ("meat & fish", 0), ("dietary & world foods", 1), ("chilled food", 2), ("frozen food", 3), ("food cupboard", 4),
    ("snacks, sweets & treats", 5), ("fruit & vegetables", 6), ("bakery", 7), ("hot drinks, soft drinks & water", 8),
]


def H(s: str) -> str:
    """The same 4-character base-36 hash as t2_extractor.js (h = h*31 + code unit, mod 1679616, from 7)."""
    h = 7
    for c in s:
        h = (h * 31 + ord(c)) % 1679616
    digits, out = "0123456789abcdefghijklmnopqrstuvwxyz", ""
    while h:
        out = digits[h % 36] + out
        h //= 36
    return out.rjust(4, "0")


def done_slugs(work: Path) -> set:
    done: set = set()
    if OUT.exists():
        with open(OUT, newline="", encoding="utf-8") as f:
            done |= {r["product_id"] for r in csv.DictReader(f)}
    for p in list(work.glob("results_*.tsv")) + list(work.glob("none_*.txt")):
        for line in p.read_text(encoding="utf-8").splitlines():
            if line:
                done.add(line.split("\t")[0])
    return done


def priority(cat_path: str):
    top = (cat_path.split(" | ")[0].split(" > ")[0]).strip().lower()
    for name, rank in PRIORITY:
        if top == name:
            return rank
    return None  # beer, wine & spirits and anything else: not handed out


def cmd_slices(a) -> int:
    work = Path(a.work)
    work.mkdir(parents=True, exist_ok=True)
    done = done_slugs(work)
    rows = []
    with open(LISTING, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rank = priority(r["category_path"])
            if rank is not None and r["product_id"] not in done and r["price_gbp"]:
                rows.append((rank, r["category_path"], r["product_id"]))
    rows.sort()
    rows = rows[: a.limit]
    slices: list[list[str]] = [[] for _ in range(a.n)]
    seen: list[set] = [set() for _ in range(a.n)]
    skipped = 0
    for i, (_, _, slug) in enumerate(rows):
        k, h = i % a.n, H(slug)
        if h in seen[k]:
            skipped += 1  # a hash clash inside one slice: left for a later round
            continue
        seen[k].add(h)
        slices[k].append(slug)
    for k, s in enumerate(slices, start=1):
        (work / f"slice{k}.txt").write_text("\n".join(s) + "\n", encoding="utf-8")
    print(f"{len(rows)} products in {a.n} slices ({[len(s) for s in slices]}), {skipped} left for a later round")
    return 0


def pending(work: Path, k: int) -> list[str]:
    slugs = [s for s in (work / f"slice{k}.txt").read_text(encoding="utf-8").splitlines() if s]
    done = done_slugs(work)
    return [s for s in slugs if s not in done]


def cmd_next(a) -> int:
    for s in pending(Path(a.work), a.slice)[: a.n]:
        print(PAGE + s)
    return 0


def cmd_append(a) -> int:
    work = Path(a.work)
    slugs = [s for s in (work / f"slice{a.slice}.txt").read_text(encoding="utf-8").splitlines() if s]
    by_hash = {H(s): s for s in slugs}
    done = done_slugs(work)
    ok = none = 0
    bad = []
    for raw in sys.stdin.read().splitlines():
        line = raw.strip()
        if not line or line == "WAIT":
            continue
        parts = line.split("|")
        if parts[0] == "NONE" and len(parts) == 2:
            slug = by_hash.get(parts[1])
            if slug is None:
                bad.append((line, "page is not one of this slice's slugs"))
            elif slug not in done:
                with open(work / f"none_{a.slice}.txt", "a", encoding="utf-8") as f:
                    f.write(slug + "\n")
                none += 1
            continue
        if len(parts) != 12:
            bad.append((line, "wrong number of fields"))
            continue
        slug = by_hash.get(parts[0])
        if slug is None:
            bad.append((line, "page is not one of this slice's slugs"))
            continue
        body = "|".join(parts[1:11])
        if H(body) != parts[11]:
            bad.append((line, "check does not match: re-run the extractor on that page and copy the line again"))
            continue
        if slug in done:
            continue
        with open(work / f"results_{a.slice}.tsv", "a", encoding="utf-8") as f:
            f.write("\t".join([slug] + parts[1:11] + [date.today().isoformat()]) + "\n")
        done.add(slug)
        ok += 1
    print(f"stored {ok}, no table {none}, rejected {len(bad)}; {len(pending(work, a.slice))} left in slice {a.slice}")
    for line, why in bad:
        print(f"  REJECTED ({why}): {line[:90]}")
    return 0


def cmd_status(a) -> int:
    work = Path(a.work)
    for p in sorted(work.glob("slice*.txt")):
        k = int(p.stem[5:])
        total = len([s for s in p.read_text().splitlines() if s])
        print(f"slice {k}: {total - len(pending(work, k))} of {total} read, {len(pending(work, k))} left")
    return 0


def num(s: str):
    return bg.printed_num(s)


def cmd_ingest(a) -> int:
    work = Path(a.work)
    rows: dict = {}
    if OUT.exists():
        with open(OUT, newline="", encoding="utf-8") as f:
            rows = {r["product_id"]: r for r in csv.DictReader(f)}
    kept = left = 0
    why: dict = {}
    for p in sorted(work.glob("results_*.tsv")):
        for line in p.read_text(encoding="utf-8").splitlines():
            parts = line.split("\t")
            if len(parts) != 12:
                continue
            slug, per, kj, kcal, fat, sat, carb, sugar, fibre, protein, salt, day = parts
            n = {k: num(v) for k, v in dict(kcal=kcal, fat=fat, carbs=carb, protein=protein).items()}
            if per not in ("g", "ml") or None in n.values():
                why["incomplete (no per 100 g/ml basis or a main number missing)"] = why.get("incomplete (no per 100 g/ml basis or a main number missing)", 0) + 1
                left += 1
                continue
            bad = bg.implausible(n["kcal"], n["protein"], n["carbs"], n["fat"])
            if bad:
                why[bad] = why.get(bad, 0) + 1
                left += 1
                continue
            rows[slug] = {"product_id": slug, "per": per, "kj": kj, "kcal": kcal, "fat_g": fat, "saturates_g": sat, "carbs_g": carb, "sugars_g": sugar, "fibre_g": fibre,
                          "protein_g": protein, "salt_g": salt, "checked_on": a.checked_on or day, "page_url": PAGE + slug}
            kept += 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        for slug in sorted(rows):
            w.writerow(rows[slug])
    print(f"{len(rows)} products in {OUT.relative_to(ROOT)} ({kept} from this ingest); left out: {left} {why or ''}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("slices", cmd_slices), ("next", cmd_next), ("append", cmd_append), ("status", cmd_status), ("ingest", cmd_ingest)):
        sp = sub.add_parser(name)
        sp.add_argument("--work", required=True)
        sp.set_defaults(fn=fn)
        if name == "slices":
            sp.add_argument("--n", type=int, default=3)
            sp.add_argument("--limit", type=int, default=4000)
        if name in ("next", "append"):
            sp.add_argument("--slice", type=int, required=True)
        if name == "next":
            sp.add_argument("--n", type=int, default=8)
        if name == "ingest":
            sp.add_argument("--checked-on", default="")
    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
