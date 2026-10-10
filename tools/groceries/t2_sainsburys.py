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
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_groceries as bg  # noqa: E402

LISTING = ROOT / "data" / "groceries" / "listing" / "sainsburys.csv"
OUT = ROOT / "data" / "groceries" / "nutrition" / "sainsburys.csv"
PAGE = "https://www.sainsburys.co.uk/groceries/product/"
STATE_LABELS = [  # (word in the page's heading, the label the app shows next to the numbers): anything else is an unclear basis and the product is left without numbers
    ("grill", "grilled"), ("fri", "fried"), ("roast", "roasted"), ("bak", "baked"), ("oven", "oven cooked"), ("boil", "boiled"), ("microwav", "microwaved"), ("steam", "steamed"),
    ("cook", "cooked"), ("prepar", "prepared"), ("made up", "made up"), ("reconstitut", "made up"), ("rehydrat", "prepared"), ("dilut", "diluted"), ("drain", "drained"),
    ("edible", "edible portion"), ("consum", "as consumed"), ("raw", "raw"), ("dried", "dry"), ("dry", "dry"),
]


def canon_state(state: str):
    """"" for the food as sold, a label from STATE_LABELS for a cooked or prepared column, None when the heading's wording is unclear."""
    st = " ".join((state or "").lower().split())
    if not st or st in PLAIN_WORDS:
        return ""
    for word, label in STATE_LABELS:
        if word in st:
            return label
    return None


STAPLES = re.compile(r"pasta|spaghetti|penne|fusilli|rigatoni|macaroni|farfalle|tagliatelle|linguine|lasagne|noodle|rice|couscous|quinoa|lentil|chickpea|bulgur|barley|polenta|semolina|vermicelli|orzo|risoni|oats|porridge|beans")
PLAIN_WORDS = {"of product", "of food", "of the product", "of the food", "typical", "typical values", "typical analysis", "as sold", "amount"}
BASIS = re.compile(r"(g|ml)(:[a-z][a-z ]{0,23})?|\?")
FIELDS = ["per", "kj", "kcal", "fat", "saturates", "carbs", "sugars", "fibre", "protein", "salt"]
HEADER = ["product_id", "per", "state", "kj", "kcal", "fat_g", "saturates_g", "carbs_g", "sugars_g", "fibre_g", "protein_g", "salt_g", "checked_on", "page_url"]
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
    done: set = set()  # the stored reads are the record; the CSV is derived from them (counting its rows here would hide products that must be read again)
    for p in list(work.glob("results_*.tsv")) + list(work.glob("none_*.txt")):
        for line in p.read_text(encoding="utf-8").splitlines():
            if not line:
                continue
            parts = line.split("\t")
            # rows from extractor v1 (12 columns) or v2 (marker "2") count as read only when the basis is plain and the main numbers are there; a v3 or v4 row counts as read.
            # A "no table" page counts as read only when v4 (which opens the collapsed Nutrition accordion first) said so: older NONEs may be false
            if (len(parts) == 12 or (len(parts) == 13 and parts[12] == "2")) and not _complete(parts):
                continue
            # rows from v3/v4 whose energy figures contradict each other (a "kJ/kcal" label read as kcal = kJ) or that took the %reference-intake column are read again with v5
            if len(parts) == 13 and parts[12] in ("3", "4") and _suspect(parts):
                continue
            # dry staples read before extractor v7 may carry cooked figures under a plain "per 100g" heading (the page's own guide says "cooked"): read again with v7
            if len(parts) == 13 and parts[12] in ("3", "4", "5", "6") and STAPLES.search(parts[0]) and parts[1] in ("g", "ml"):
                continue
            if p.name.startswith("none_") and (len(parts) < 2 or parts[1] != "4"):
                continue
            done.add(parts[0])
    return done


def _suspect(parts: list) -> bool:
    """slug, per, kj, kcal, ...: the energy figures disagree, or the basis is a reference-intake column."""
    if "reference" in parts[1]:
        return True
    kj, kcal = num(parts[2]), num(parts[3])
    if kj and kcal and kcal >= 20 and not 3.55 <= kj / kcal <= 4.82:
        return True
    main = [num(parts[i]) for i in (3, 6, 9, 4)]  # kcal, carbs, protein, fat
    return None not in main and bg.implausible(*main) is not None


def _complete(parts: list) -> bool:
    """slug, per, kj, kcal, fat, sat, carb, sugar, fibre, protein, salt, day: the basis is plain and the four main numbers are numbers."""
    return parts[1] in ("g", "ml") and all(num(parts[i]) is not None for i in (3, 4, 6, 9))  # only plain bases count for rows from the older extractors


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
    rows = rows[a.skip : a.skip + a.limit]
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
    existing = [work / f"slice{k}.txt" for k in range(a.first, a.first + a.n) if (work / f"slice{k}.txt").exists()]
    if existing and not a.force:
        print("REFUSED: these slice files already exist and readers are using them: " + ", ".join(p.name for p in existing) + ". Slices are handed out by the lead only (use --force to overwrite).")
        return 1
    for k, s in enumerate(slices, start=a.first):
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
                    f.write(slug + "\t4\n")
                none += 1
            continue
        if len(parts) != 12:
            bad.append((line, "wrong number of fields"))
            continue
        slug = by_hash.get(parts[0])
        if slug is None:
            bad.append((line, "page is not one of this slice's slugs"))
            continue
        if not BASIS.fullmatch(parts[1]):
            bad.append((line, "basis is not g, ml, g:word, ml:word or ?: re-run the extractor"))
            continue
        body = "|".join(parts[1:11])
        if H(body) != parts[11]:
            bad.append((line, "check does not match: re-run the extractor on that page and copy the line again"))
            continue
        if slug in done:
            continue
        with open(work / f"results_{a.slice}.tsv", "a", encoding="utf-8") as f:
            f.write("\t".join([slug] + parts[1:11] + [date.today().isoformat(), "7"]) + "\n")
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
    rows: dict = {}  # rebuilt from the stored reads every time (the rules above can tighten; a row the rules now reject must not linger from an older ingest)
    kept = left = 0
    why: dict = {}
    for p in sorted(work.glob("results_*.tsv")):
        for line in p.read_text(encoding="utf-8").splitlines():
            parts = line.split("\t")
            if len(parts) not in (12, 13):
                continue
            slug, per, kj, kcal, fat, sat, carb, sugar, fibre, protein, salt, day = parts[:12]
            n = {k: num(v) for k, v in dict(kcal=kcal, fat=fat, carbs=carb, protein=protein).items()}
            if "reference" in per:
                why["reference-intake column"] = why.get("reference-intake column", 0) + 1
                left += 1
                continue
            per, _, state = per.partition(":")
            label = canon_state(state)
            if label is None:
                why["unclear basis wording"] = why.get("unclear basis wording", 0) + 1
                left += 1
                continue
            state = label
            if per not in ("g", "ml") or None in n.values():
                why["incomplete (no per 100 g/ml basis or a main number missing)"] = why.get("incomplete (no per 100 g/ml basis or a main number missing)", 0) + 1
                left += 1
                continue
            bad = bg.implausible(n["kcal"], n["protein"], n["carbs"], n["fat"])
            kjn = num(kj)
            if not bad and kjn and n["kcal"] >= 20 and not 3.55 <= kjn / n["kcal"] <= 4.82:
                bad = "kJ and kcal disagree (the page's own energy figures contradict each other)"
            if bad:
                why[bad] = why.get(bad, 0) + 1
                left += 1
                continue
            rows[slug] = {"product_id": slug, "per": per, "state": state.strip(), "kj": kj, "kcal": kcal, "fat_g": fat, "saturates_g": sat, "carbs_g": carb, "sugars_g": sugar, "fibre_g": fibre,
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
            sp.add_argument("--force", action="store_true", help="overwrite slice files that already exist (the lead only)")
            sp.add_argument("--skip", type=int, default=0, help="start after this many products of the priority order (to add slices beyond ones already handed out)")
            sp.add_argument("--first", type=int, default=1, help="number of the first slice file written (slice<first>.txt ...)")
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
