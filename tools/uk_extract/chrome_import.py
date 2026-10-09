#!/usr/bin/env python3
"""Turn what Claude in Chrome read from a chain's OWN pages into a normal data/source/<chain>/ folder.

    python3 tools/uk_extract/chrome_import.py <chain-id> [--inbox data/chrome-inbox] [--out DIR]

The Chrome agent (prompt: docs/CHROME_TO_APP.md) writes two files into data/chrome-inbox/<chain-id>/ on the founder's Mac and
pushes them. This script does NOT trust them: it re-checks every row with the same rules the other extractors follow, writes the
folder through tools/uk_extract/common.write_chain_folder, and stops (exit 1) with a clear message when something is missing.
Afterwards run `python3 tools/uk_extract/check_chain.py <chain-id> --fail-on-high` (the accuracy gate) as for every chain.

meta.json (all required unless marked optional)
    name, cuisine, source_title (what the page is called, with its date or "(read <date>, no date shown)"), source_url (the
    chain's own page the numbers came from), checked_on (YYYY-MM-DD), nutrition_level ("full" = calories AND protein, carbs and
    fat on every row, or "calories"), basis ("per serving": anything else is refused, per-100 g is never accepted),
    sites (number of UK sites, at least 3) and sites_evidence (the page that says so),
    aliases (optional list), note (optional, under 400 characters: limits users should know),
    allowed_hosts (optional list of extra hostnames of the chain's own ordering platform),
    allergen_guide_title / allergen_guide_url / may_contain_published (optional, needed to publish allergens)

items.csv columns
    name, category, calories, protein_g, carbs_g, fat_g, sat_fat_g, sugar_g, fiber_g, salt_g, energy_kj, weight_g, serving,
    page_url (the chain's own page where the row was read: required), contains, may_contain (allergen words separated by ";";
    the word NONE means the page lists none; blank means unknown)

Rules (a row that breaks one is left out and listed; the run stops if more than a quarter of the rows break them):
    - numbers are copied as printed, per serving; blank = not published; "<0.5", ranges and "-" are not accepted as numbers
    - page_url must be on the chain's own site (source_url's host family or allowed_hosts)
    - a name printed twice with different numbers is held back (both rows), never chosen between
    - rows whose own numbers cannot hold are held back (calories far from 4P+4C+9F, saturates above fat, sugars above carbs,
      kJ against kcal, macros heavier than the serving), never corrected
    - allergens are published only when EVERY kept row has them (all or nothing); an unknown allergen word stops the run
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NUM_COLS = ["calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "salt_g", "energy_kj", "weight_g"]
META_REQUIRED = ["name", "cuisine", "source_title", "source_url", "checked_on", "nutrition_level", "basis", "sites", "sites_evidence"]
BASIS_OK = {"per serving", "per portion", "as sold", "per item"}


def die(msg: str) -> None:
    print(f"chrome_import: {msg}", file=sys.stderr)
    raise SystemExit(1)


def num(text: str, where: str, col: str):
    s = str(text).strip().replace(",", "")
    if s == "":
        return None
    if re.fullmatch(r"-?\d+(\.\d+)?", s) is None:
        raise ValueError(f"{where}: {col} {text!r} is not a plain number")
    v = float(s)
    if v < 0:
        raise ValueError(f"{where}: {col} is negative")
    return v


def host_family(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in ("co", "org", "com", "gov", "ac") and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def impossible(row: dict) -> str:
    """The same gates tools/audit/accuracy_audit.py uses for numbers that cannot hold. '' = fine."""
    kcal, p, c, f = row.get("calories"), row.get("protein_g"), row.get("carbs_g"), row.get("fat_g")
    if kcal is not None and kcal >= 100 and None not in (p, c, f):
        est = 4 * p + 4 * c + 9 * f
        if est > 0 and abs(kcal - est) / max(kcal, est) > 0.30:
            return f"{kcal:g} kcal against {est:.0f} kcal from its own protein, carbs and fat"
    if row.get("sat_fat_g") is not None and f is not None and row["sat_fat_g"] > f + 0.1:
        return "saturates above total fat"
    if row.get("sugar_g") is not None and c is not None and row["sugar_g"] > c + 0.1:
        return "sugars above carbohydrate"
    if row.get("fiber_g") is not None and c is not None and row["fiber_g"] > c + 0.1:
        return "fibre above carbohydrate"
    kj = row.get("energy_kj")
    if kcal is not None and kj is not None and kcal >= 20 and not 0.85 <= kj / (kcal * 4.184) <= 1.15:
        return f"{kj:g} kJ and {kcal:g} kcal disagree"
    wt = row.get("weight_g")
    if wt is not None and None not in (p, c, f) and p + c + f > wt * 1.05 + 0.5:
        return "protein, carbs and fat weigh more than the serving"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("chain")
    ap.add_argument("--inbox", type=Path, default=ROOT / "data" / "chrome-inbox")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    src = args.inbox / args.chain
    if not (src / "meta.json").exists() or not (src / "items.csv").exists():
        die(f"{src}/meta.json and items.csv are required")
    meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    for k in META_REQUIRED:
        if str(meta.get(k, "")).strip() == "":
            die(f"meta.json is missing {k}")
    level = meta["nutrition_level"]
    if level not in ("full", "calories"):
        die("nutrition_level must be 'full' or 'calories'")
    if str(meta["basis"]).strip().lower() not in BASIS_OK:
        die(f"basis {meta['basis']!r} is not accepted: only per-serving figures as printed (never per 100 g, never converted)")
    try:
        sites = int(meta["sites"])
    except ValueError:
        die("sites must be a whole number")
    if sites < 3:
        die(f"only {sites} UK sites: the chain bar is 3 or more")
    hosts = {host_family(meta["source_url"])} | {host_family("https://" + h) for h in meta.get("allowed_hosts", [])}

    dropped, kept = [], []
    with open(src / "items.csv", newline="", encoding="utf-8-sig") as fh:
        raw_rows = list(csv.DictReader(fh))
    if not raw_rows:
        die("items.csv has no rows")
    for i, r in enumerate(raw_rows, start=2):
        where = f"items.csv line {i} ({r.get('name', '?')})"
        try:
            name = (r.get("name") or "").strip()
            if not name:
                raise ValueError(f"{where}: no name")
            page = (r.get("page_url") or "").strip()
            if not page or host_family(page) not in hosts:
                raise ValueError(f"{where}: page_url {page!r} is not on the chain's own site")
            row = {"name": name, "category": (r.get("category") or "Menu").strip() or "Menu", "serving": (r.get("serving") or "").strip(),
                   "page_url": page}
            for c in NUM_COLS:
                row[c] = num(r.get(c, ""), where, c)
            if row["calories"] is None:
                raise ValueError(f"{where}: no calories")
            if level == "full" and any(row[c] is None for c in ("protein_g", "carbs_g", "fat_g")):
                raise ValueError(f"{where}: protein, carbs or fat missing for a full-nutrition chain")
            row["contains"] = (r.get("contains") or "").strip()
            row["may_contain"] = (r.get("may_contain") or "").strip()
            kept.append(row)
        except ValueError as e:
            dropped.append(str(e))
    if len(dropped) > len(raw_rows) / 4:
        die(f"{len(dropped)} of {len(raw_rows)} rows break the rules: fix the file\n  " + "\n  ".join(dropped[:12]))

    # exact duplicates are dropped; the same name with different numbers is held back (both rows)
    seen_exact, unique = set(), []
    for r in kept:
        key = (r["name"].lower(), r["category"].lower(), tuple(r[c] for c in NUM_COLS), r["serving"])
        if key in seen_exact:
            continue
        seen_exact.add(key)
        unique.append(r)
    by_name: dict = {}
    for r in unique:
        by_name.setdefault((r["name"].lower(), r["category"].lower()), []).append(r)
    holdback: list = []
    ids_seen: dict = {}
    items = []
    for r in unique:
        base = common.slug(r["name"])
        n = ids_seen.get(base, 0)
        ids_seen[base] = n + 1
        item_id = base if n == 0 else f"{base}-{n + 1}"
        reason = ""
        if len(by_name[(r["name"].lower(), r["category"].lower())]) > 1:
            reason = "the chain's pages print this dish twice with different numbers; neither is published"
        else:
            bad = impossible(r)
            if bad:
                reason = f"the page's own numbers contradict themselves ({bad}); not published and not corrected"
        if reason:
            holdback.append((item_id, reason))
        it = {k: v for k, v in r.items() if k not in ("page_url", "contains", "may_contain") and v is not None and v != ""}
        it["notes"] = "Read from " + r["page_url"]
        if level == "calories":
            it["rankable"] = False
        items.append((it, r))

    # allergens: all or nothing
    guide = None
    allergens_rows = []
    if all(r["contains"] for _, r in items) and meta.get("allergen_guide_url") and meta.get("allergen_guide_title"):
        guide = {"title": meta["allergen_guide_title"], "url": meta["allergen_guide_url"], "checked_on": meta["checked_on"],
                 "may_contain_published": bool(meta.get("may_contain_published", False))}
        for it, r in items:
            contains = [] if r["contains"].upper() == "NONE" else [w for w in r["contains"].split(";") if w.strip()]
            may = [] if r["may_contain"].upper() in ("", "NONE") else [w for w in r["may_contain"].split(";") if w.strip()]
            ck, cc, cn = common.allergen_words(contains, f"{it['name']} contains")
            mk, mc, mn = common.allergen_words(may, f"{it['name']} may contain")
            it["allergens"] = {"contains": ck, "may_contain": mk, "cereals": cc | mc, "nuts": cn | mn}
    elif meta.get("allergen_guide_url") and meta.get("allergen_guide_title"):
        guide = {"title": meta["allergen_guide_title"], "url": meta["allergen_guide_url"], "checked_on": meta["checked_on"],
                 "may_contain_published": False}
    final_items = [it for it, _ in items]
    note = (meta.get("note") or "").strip()
    tail = f"Read from the chain's own pages on {meta['checked_on']} ({sites} UK sites: {meta['sites_evidence']})."
    note = (note + " " + tail).strip()
    out = common.write_chain_folder(chain_id=args.chain, name=meta["name"], cuisine=meta["cuisine"], source_title=meta["source_title"],
                                    source_url=meta["source_url"], checked_on=meta["checked_on"], aliases=list(meta.get("aliases", [])),
                                    items=final_items, out=args.out, note=note, holdback=holdback or None, allergen_guide=guide,
                                    nutrition_level=level)
    print(f"wrote {len(final_items)} items to {out} ({len(holdback)} held back, {len(dropped)} rows left out, allergens "
          f"{'complete' if guide and all('allergens' in i for i in final_items) else 'link only' if guide else 'none'})")
    for d in dropped[:20]:
        print("  left out:", d)
    for item_id, reason in holdback[:20]:
        print("  held back:", item_id, "-", reason)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
