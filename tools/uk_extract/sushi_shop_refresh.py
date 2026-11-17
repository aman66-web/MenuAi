#!/usr/bin/env python3
"""Refresh Sushi Shop UK's Chrome-inbox files from the site's own menu data, then data/source is rebuilt by chrome_import.py.

    python3 tools/uk_extract/sushi_shop_refresh.py data/chrome-inbox/sushi-shop PAGE_DATA_JSON NEW_INBOX/sushi-shop --checked-on YYYY-MM-DD --last-modified "12 November 2026"
    python3 tools/uk_extract/chrome_import.py sushi-shop --inbox NEW_INBOX --out SCRATCH/src/sushi-shop

PAGE_DATA_JSON is one download of the data file named below (first used 2026-11-17).

The published Sushi Shop folder was imported (tools/uk_extract/chrome_import.py) from data/chrome-inbox/sushi-shop/, read on
2026-10-10 from each product's page; that read checked that the site's own menu data
(https://www.mysushishop.co.uk/rollingstart/page-data/en/delivery/maki/page-data.json, the file the pages load, robots.txt allows it)
prints the same figure as each product page's "N calories" line for all 120 pages compared. The figure sits in the data's
`kilojoules` field (the site labels it "calories" on every page; 296 = "296 calories" on the Salmon Avocado page, 2026-11-17).

Numbers are COPIED from that file (as printed, never converted). Names and categories of rows already published are kept as they
were written; only these change:
  calories  = the product's figure now (`kilojoules` field, as printed)
  serving   = "<quantity> pieces" when the old serving was "<n> pieces" (the page shows the count; a struck-through old count is the
              `strikethrough_quantity` field); a blank serving stays blank
  page_url  = the product's current page
A published row whose product is no longer on the live menu (no page address), or whose product now shows no figure, is DROPPED
and listed. A live product with a figure that the old inbox did not have is ADDED with the name and category the site prints
(only in categories already used, never a drink).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

HOST = "https://www.mysushishop.co.uk"
FIELDS = ["name", "category", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "salt_g", "energy_kj",
          "weight_g", "serving", "page_url", "contains", "may_contain"]
NOTE = ("Calories only, one figure per product. About 20 products (gyozas, yakitori, most poke bowls, some mochi) show no calories "
        "and are left out, and drinks show none. Allergens are only a link on each page, so none are recorded.")


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("old_inbox", type=Path)
    ap.add_argument("page_data", type=Path)
    ap.add_argument("new_inbox", type=Path)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--last-modified", required=True)
    a = ap.parse_args()

    data = json.loads(a.page_data.read_text(encoding="utf-8"))["result"]["data"]
    cats = {c["id_category"]: c["name"] for c in data["listingCategories"]["nodes"]}
    prods = data["listingProducts"]["nodes"]
    live = [p for p in prods if p["active_web"] and p["uri"]]  # on the live menu: has a page
    by_id = {p["id_product"]: p for p in live}
    by_name: dict[str, list] = {}
    for p in live:
        by_name.setdefault(norm(p["name"]), []).append(p)

    old = list(csv.DictReader((a.old_inbox / "items.csv").open(encoding="utf-8")))
    page_ids = {}
    for r in old:
        m = re.search(r"-(\d+)$", r["page_url"].strip())
        page_ids[id(r)] = m.group(1) if m else None
    claimed = {pid for pid in page_ids.values() if pid in by_id}  # products another row's own page still points at
    out, used, report = [], set(), []
    for r in old:
        pid = page_ids[id(r)]
        p = by_id.get(pid) if pid else None
        how = "page id"
        if p is None:
            hits = [h for h in by_name.get(norm(r["name"]), []) if h["id_product"] not in claimed]
            if len(hits) == 1:
                p, how = hits[0], "same name"
        if p is None:
            report.append(f"DROPPED {r['name']!r} ({r['calories']} kcal): no product of that page or name on the live menu")
            continue
        if p["id_product"] in used:
            raise SystemExit(f"{r['name']!r}: product {p['id_product']} is already used by another row")
        if not p["kilojoules"]:
            report.append(f"DROPPED {r['name']!r} ({r['calories']} kcal): product {p['id_product']} now shows no calories")
            continue
        fig = str(p["kilojoules"]).strip()
        if not re.fullmatch(r"\d+(\.\d+)?", fig):
            raise SystemExit(f"{p['name']}: figure {fig!r} is not a plain number")
        used.add(p["id_product"])
        new = dict(r)
        new["calories"] = fig
        new["page_url"] = HOST + p["uri"]
        if re.fullmatch(r"\d+ pieces", r["serving"].strip()) and int(p["quantity"] or 0) > 0:
            new["serving"] = f"{int(p['quantity'])} pieces"
        changes = [f"{k} {r[k]!r} -> {new[k]!r}" for k in ("calories", "serving") if (r[k] or "") != (new[k] or "")]
        if changes:
            report.append(f"CHANGED {r['name']!r} (product {p['id_product']} by {how}; was "
                          f"{p['strikethrough_quantity']} pieces struck through): " + "; ".join(changes))
        out.append(new)

    known = {norm(r["name"]) for r in old}
    used_cats = {r["category"] for r in old}
    for p in live:
        if p["id_product"] in used or not p["kilojoules"]:
            continue
        cat = cats.get(p["id_category_default"], "")
        if cat not in used_cats or cat == "Drinks" or norm(p["name"]) in known:
            report.append(f"NOT ADDED {p['name']!r} ({p['kilojoules']}, category {cat!r}): category not used or name already listed")
            continue
        q = int(p["quantity"] or 0)
        out.append({k: "" for k in FIELDS} | {"name": p["name"].strip(), "category": cat, "calories": str(p["kilojoules"]).strip(),
                                              "serving": f"{q} pieces" if q > 1 else "", "page_url": HOST + p["uri"]})
        report.append(f"ADDED {p['name']!r} ({p['kilojoules']} kcal, {cat}, product {p['id_product']})")

    meta = json.loads((a.old_inbox / "meta.json").read_text(encoding="utf-8"))
    meta["checked_on"] = a.checked_on
    meta["source_title"] = (f"Sushi Shop UK online menu: the menu data its product pages show (last modified {a.last_modified}), "
                            f"read {a.checked_on}")
    meta["note"] = NOTE
    meta["sites_evidence"] = "mysushishop.co.uk/en/stores listed four London shops on 2026-10-10; not re-read"
    a.new_inbox.mkdir(parents=True, exist_ok=True)
    (a.new_inbox / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with (a.new_inbox / "items.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)
    for line in report:
        print(line)
    print(f"{len(old)} old rows -> {len(out)} rows written to {a.new_inbox}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
