#!/usr/bin/env python3
"""Build the "recipe shop files": the lean, labelled subset of each other supermarket's list that a recipe can swap an ingredient to
(docs/DATA.md "Recipe shop files"; founder's request: swap an ingredient for a product from another supermarket).

    python3 tools/groceries/build_recipe_shop_files.py                          # web/public/groceries/recipe/<shop>.json + a `recipe` entry per shop in all-manifest.json
    python3 tools/groceries/build_recipe_shop_files.py --page-barcodes-only     # only Sainsbury's labels whose barcode its own page printed (see below)
    python3 tools/groceries/build_recipe_shop_files.py --no-shop-internal-community   # also drop community records joined by a shop's own internal number

Recipes are built from Sainsbury's products, the only shop whose product pages we read for nutrition. The other shops' lists carry a name, a price and a
barcode for some rows but no numbers, so a recipe can use a product at another shop only when a published label for that exact product is joined to the
row, at build time, never in the browser and never by guess. For each priced row of Tesco, Asda, Morrisons, Waitrose and Iceland
(web/public/groceries/all/<shop>.json) with a valid barcode, the first of these that exists is copied, as published, into the row's nutrition slot (index 10;
a label is [kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kJ, "g"|"ml", state]):

  1. the shop's own product page, when its catalogue record for that barcode was read from it (record `source: "retailer"`);
  2. the label Sainsbury's own page prints for the IDENTICAL barcode, with its state word ("" as sold, or "drained": a drained tin stays drained);
  3. the Open Food Facts contributors' record of that barcode in the same shop's catalogue file (web/public/groceries/<shop>.json). Community data: the slot
     carries a 12th element "c", so the app can leave it out (config.ts RECIPE_COMMUNITY_NUMBERS) and always labels it.

Two sources are never blended. When two sources of the same state disagree materially (kcal by more than 15% and 10 kcal, protein by more than 3 g, carbs or
fat by more than 15% and 5 g) the row is held back, not chosen between; a drink Open Food Facts files per 100 g that the shop's page prints per 100 ml is the
same product, so a different unit alone is no disagreement (the page label is used). Nothing is estimated or averaged. Refused:
  * a shop-internal ("restricted") barcode: a Sainsbury's label under one is never offered to another shop (a restricted number can be a different product
    elsewhere); a community or own-page record for the shop's OWN restricted number (Tesco's produce codes) is joined within that shop only;
  * a barcode whose check digit fails, a row with no price (recipes need one), and a Sainsbury's barcode that two different Sainsbury's labels share;
  * a label that fails build_groceries.implausible() including the kJ-against-kcal test (which the published Sainsbury's list does not apply to its own page
    labels: 3 rows fail it and stay in that list unchanged, but are not copied to another shop), and a state word recipes cannot use ("cooked", "prepared", ...);
  * a community record whose name shares no word with the shop's own name for the product, and a community record for a barcode whose Sainsbury's page label
    is for the cooked or prepared food (the record cannot say which it is).
An optional row that cannot hold (saturates above fat, sugars above carbohydrate) is left out of the copy and shows as "not on the label".

A Sainsbury's list row without a page-read barcode got its list barcode from an exact name-and-size twin at another shop (the 2026-10-11 rule), so about a
quarter of the barcodes in the pool are such pairings; `--page-barcodes-only` leaves those out (the report counts both).

Rows are copied unchanged from the list (same id, name, price, unit price, card price, picture, page path, borrowed photo) and keep its order; the file has
the list's envelope (retailer, name, checkedOn, pageBase, photoTemplate, categories, schemes ...), so the app decodes it with the same code, plus
`communityGeneratedOn` when it holds community rows. Aldi (one barcode), Lidl and M&S (none, and most have no price) have nothing to join and get no file.
Output is deterministic. Everything held back is in data/groceries/recipe/held-back.csv and counted in data/groceries/recipe/report.txt.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_groceries as bg  # noqa: E402  (the same barcode, number-reading and plausibility rules as the catalogue)

ROOT = Path(__file__).resolve().parents[2]
GROCERIES = ROOT / "web" / "public" / "groceries"
REPORT_DIR = ROOT / "data" / "groceries" / "recipe"
HOME = "sainsburys"                                                  # the shop whose product pages we read for nutrition
RECIPE_SHOPS = ("tesco", "asda", "morrisons", "waitrose", "iceland")  # Aldi, Lidl and M&S have no barcodes to join (and Lidl/M&S mostly no prices)
COMMUNITY_FLAG = "c"                                                 # 12th element of a nutrition slot: Open Food Facts contributors' numbers
USABLE_STATES = ("", "drained")                                      # the only states recipes use (as sold; drained tins)

# "Disagree materially" between two labels of the same state for one barcode (docs/DATA.md "Recipe shop files"): the tolerances are on top of rounding
# and reformulation, so a pack variant or a typo shows up and an honest difference between two editions does not.
KCAL_REL, KCAL_ABS = 0.15, 10.0            # more than 15% of the larger figure AND more than 10 kcal
PROTEIN_ABS = 3.0                          # more than 3 g per 100
CARB_FAT_REL, CARB_FAT_ABS = 0.15, 5.0     # carbohydrate or fat: more than 15% AND more than 5 g per 100

PAGE, SHOP_PAGE, COMMUNITY = "sainsburys-page", "shop-page", "community"   # where a label comes from
SOURCE_ORDER = (SHOP_PAGE, PAGE, COMMUNITY)                                 # ... and the order they are preferred in


def valid_barcode(code: str) -> bool:
    """A real GS1 number: the check digit holds. Leading zeros don't matter (a GTIN-14 or EAN-13 of the same product), so it is checked as 14 digits."""
    n = bg.norm_code(code)
    return n.isdigit() and 6 <= len(n) <= 14 and bg.gtin_ok(n.zfill(14))


def is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v


def label_problem(n) -> str | None:
    """Why a nutrition array (a list row's slot 10) can't be copied to another shop's row; None when it can. Reasons: 'no label', 'incomplete',
    'unit' (not per 100 g or ml), 'kj' (kJ and kcal disagree), 'implausible' (build_groceries.implausible), 'state' (a state word recipes cannot use)."""
    if not isinstance(n, (list, tuple)) or len(n) < 10:
        return "no label"
    kcal, protein, carbs, fat = n[:4]
    if not all(is_number(v) for v in (kcal, protein, carbs, fat)):
        return "incomplete"
    if n[9] not in ("g", "ml"):
        return "unit"
    why = bg.implausible(kcal, protein, carbs, fat, n[8] if is_number(n[8]) else None)
    if why:
        return "kj" if why.startswith("kJ") else "implausible"
    return None if (n[10] if len(n) > 10 else "") in USABLE_STATES else "state"


def clean_label(n) -> list:
    """The 11-element label to copy: the four main numbers and kJ as published, each optional row only when it is a number that can hold (saturates
    not above fat, sugars not above carbohydrate: a figure that can't be right is left out, shown as "not on the label", never corrected)."""
    kcal, protein, carbs, fat = n[:4]
    opt = [v if is_number(v) and v >= 0 else None for v in n[4:9]]
    sat, sugars = opt[0], opt[1]
    if sat is not None and sat > fat + 0.2:
        opt[0] = None
    if sugars is not None and sugars > carbs + 0.2:
        opt[1] = None
    return [kcal, protein, carbs, fat, *opt, n[9], (n[10] if len(n) > 10 else "") or ""]


def community_slot(rec: dict) -> list:
    """A catalogue record (Open Food Facts based, or the shop's own page when `source` is "retailer") as a nutrition slot."""
    return [rec.get("kcal"), rec.get("protein"), rec.get("carbs"), rec.get("fat"), rec.get("saturates"), rec.get("sugars"), rec.get("fibre"), rec.get("salt"),
            rec.get("kj"), rec.get("per"), ""]


def differ(a: list, b: list) -> str | None:
    """Why two labels for one barcode (both of state "") disagree materially, else None. The numbers are compared as printed: Open Food Facts files many
    drinks per 100 g where the shop's page says per 100 ml, which is a labelling difference, not a different product (a unit difference alone is no conflict)."""
    dk = abs(a[0] - b[0])
    if dk > KCAL_ABS and dk > KCAL_REL * max(a[0], b[0]):
        return f"kcal {a[0]:g} against {b[0]:g}"
    if abs(a[1] - b[1]) > PROTEIN_ABS:
        return f"protein {a[1]:g} against {b[1]:g}"
    for i, word in ((2, "carbs"), (3, "fat")):
        d = abs(a[i] - b[i])
        if d > CARB_FAT_ABS and d > CARB_FAT_REL * max(a[i], b[i]):
            return f"{word} {a[i]:g} against {b[i]:g}"
    return None


def sainsburys_pool(doc: dict, proven: dict[str, str] | None = None, page_barcodes_only: bool = False) -> tuple[dict, dict]:
    """norm barcode -> {label, id, name, page}: the labels Sainsbury's own pages print, for barcodes that may be shared.

    `proven` is slug -> barcode from the pages that printed one (build_all_products.gtins_by_slug); a Sainsbury's row without one got its list barcode
    from an exact name-and-size twin at another shop (the 2026-10-11 rule), so its `page` flag is False; `page_barcodes_only` leaves those out. None = all
    barcodes count as the page's. Returns (pool, stats); stats['kj'] lists the labels refused by the kJ test."""
    stats = {"rows": 0, "no_barcode": 0, "bad_barcode": 0, "restricted": 0, "state": 0, "kj": [], "implausible": 0, "ambiguous": 0, "name_paired": 0, "kept": 0,
             "restricted_codes": {}, "state_codes": {}}
    found: dict[str, list] = {}
    for r in doc["products"]:
        code, n = r[9] if len(r) > 9 else "", r[10] if len(r) > 10 else None
        if not isinstance(n, list):
            continue
        stats["rows"] += 1
        if not code:
            stats["no_barcode"] += 1
        elif not valid_barcode(code):
            stats["bad_barcode"] += 1
        elif bg.restricted_code(code):
            stats["restricted"] += 1
            stats["restricted_codes"][bg.norm_code(code)] = r[1]    # a row at another shop with this number is a different product that happens to share it
        else:
            problem = label_problem(n)
            if problem == "state":
                stats["state"] += 1
                stats["state_codes"][bg.norm_code(code)] = (n[10], r[1])
            elif problem == "kj":
                stats["kj"].append(f"{r[0]} ({r[1]})")
            elif problem:
                stats["implausible"] += 1
            else:
                page = proven is None or bg.norm_code(proven.get(r[0].lower(), "")) == bg.norm_code(code)
                if page_barcodes_only and not page:
                    stats["name_paired"] += 1
                    continue
                found.setdefault(bg.norm_code(code), []).append({"label": clean_label(n), "raw": n, "id": r[0], "name": r[1], "page": page})
    pool: dict[str, dict] = {}
    for code, hits in found.items():
        if len({json.dumps(h["label"]) for h in hits}) > 1:
            stats["ambiguous"] += 1  # two Sainsbury's pages print different numbers under one barcode: neither is chosen
            continue
        pool[code] = hits[0]
    stats["kept"] = len(pool)
    stats["name_paired_kept"] = sum(1 for v in pool.values() if not v["page"])
    return pool, stats


def catalogue_index(products: list[dict]) -> dict[str, dict]:
    """norm barcode -> the shop's catalogue record (the first one, as every other reader of the catalogue does)."""
    out: dict[str, dict] = {}
    for p in products:
        if p.get("gtin"):
            out.setdefault(bg.norm_code(p["gtin"]), p)
    return out


def build_shop(shop: str, doc: dict, pool: dict, catalogue: dict[str, dict], generated_on: str = "", pool_day: str = "",
               blocks: dict | None = None, allow_restricted_community: bool = True) -> tuple[dict | None, dict, list]:
    """The recipe file for one shop: (document or None when no row has a usable label, stats, held-back rows).

    Held-back rows are [shop, id, name, barcode, reason, detail]: every priced row with a barcode that had a candidate label (or a bad barcode) and was left out.
    A row with no price, no barcode or nothing to join is only counted. The counters `restricted`, `name_differs` and `community_refused` count rows where that
    candidate was refused, whether or not another candidate then kept the row. `blocks` is the pool's stats: the Sainsbury's barcodes whose label was not shared
    (shop-internal numbers, and numbers printed for a cooked or prepared food)."""
    blocks = blocks or {}
    stats = dict.fromkeys(("unpriced", "no_barcode", "bad_barcode", "no_label", "kept", "page", "page_name_paired", "shop_page", "community", "community_restricted",
                           "conflict", "unit_note", "restricted", "state_blocked", "name_differs", "community_refused", "drained_community_ignored", "optional_left_out"), 0)
    stats["rows"] = len(doc["products"])
    held: list = []
    rows: list = []
    own_days: set[str] = set()
    for r in doc["products"]:
        pid, name, code = r[0], r[1], r[9] if len(r) > 9 else ""
        if not (is_number(r[2]) and r[2] > 0):
            stats["unpriced"] += 1
            continue
        if not code:
            stats["no_barcode"] += 1
            continue
        if not valid_barcode(code):
            stats["bad_barcode"] += 1
            continue
        key, restricted = bg.norm_code(code), bg.restricted_code(code)
        cands: list[dict] = []     # the labels that may be used, then sorted into preference order
        refused: list[tuple[str, str]] = []
        rec = catalogue.get(key)
        if rec is not None:
            slot, own_page = community_slot(rec), rec.get("source") == "retailer"
            why = label_problem(slot)
            if why:
                stats["community_refused"] += 1
                refused.append((f"catalogue record unusable ({why})", rec.get("name") or ""))
            elif bg.names_agree(name, rec.get("name") or "") is not True:
                stats["name_differs"] += 1
                refused.append(("catalogue record's name shares no word with the shop's", rec.get("name") or ""))
            elif not own_page and key in blocks.get("state_codes", {}):
                state, other = blocks["state_codes"][key]
                stats["state_blocked"] += 1
                refused.append((f"Sainsbury's page prints numbers for the {state} food under this barcode, so a record that doesn't say which can't be trusted", other))
            elif restricted and not own_page and not allow_restricted_community:
                stats["restricted"] += 1
                refused.append(("shop-internal barcode: no community record is joined", rec.get("name") or ""))
            else:
                cands.append({"source": SHOP_PAGE if own_page else COMMUNITY, "raw": slot, "label": clean_label(slot), "name": rec.get("name") or "",
                              "day": rec.get("checkedOn") or "", "page": True})
        hit = pool.get(key)
        if key in blocks.get("restricted_codes", {}):
            stats["restricted"] += 1
            refused.append(("shop-internal barcode: no label is shared from another shop", blocks["restricted_codes"][key]))
        if hit is not None:
            if bg.names_agree(name, hit["name"]) is False:
                stats["name_differs"] += 1
                refused.append(("the Sainsbury's product with this barcode has a name sharing no word with the shop's", hit["name"]))
            else:
                cands.append({"source": PAGE, "raw": hit["raw"], "label": hit["label"], "name": hit["name"], "day": "", "page": hit["page"]})
        cands.sort(key=lambda c: SOURCE_ORDER.index(c["source"]))
        if not cands:
            if refused:
                held.append([shop, pid, name, code, "; ".join(x[0] for x in refused), " | ".join(x[1] for x in refused)])
            else:
                stats["no_label"] += 1
            continue
        # Two labels of the same state must agree, or the row is held back and neither is chosen. A drained label can't be compared with a state-less record
        # (the record can't say whether it is for the drained food), so the drained label is used and the record is ignored.
        comparable = [c for c in cands if not c["label"][10]]
        clash = next(((a, b, d) for i, a in enumerate(comparable) for b in comparable[i + 1:] if (d := differ(a["label"], b["label"]))), None)
        if clash:
            a, b, why = clash
            stats["conflict"] += 1
            held.append([shop, pid, name, code, f"{a['source']} and {b['source']} disagree: {why}", f"{a['name']} | {b['name']}"])
            continue
        use = cands[0]
        stats["unit_note"] += any(c["label"][9] != use["label"][9] for c in comparable)   # another source printed the other unit and was not used
        stats["drained_community_ignored"] += use["label"][10] != "" and any(c["source"] == COMMUNITY for c in cands)
        slot = list(use["label"])
        stats["optional_left_out"] += sum(1 for a, b in zip(use["raw"][4:8], slot[4:8]) if is_number(a) and b is None)
        if use["source"] == COMMUNITY:
            slot.append(COMMUNITY_FLAG)
            stats["community"] += 1
            stats["community_restricted"] += restricted
        elif use["source"] == PAGE:
            stats["page"] += 1
            stats["page_name_paired"] += not use["page"]
        else:
            stats["shop_page"] += 1
            if use["day"]:
                own_days.add(use["day"])
        rows.append(list(r[:10]) + [slot] + list(r[11:]))
        stats["kept"] += 1
    if not rows:
        return None, stats, held
    out = {k: v for k, v in doc.items() if k != "products"}
    if stats["page"] and pool_day:
        own_days.add(pool_day)
    out["nutritionCheckedOn"] = min(own_days) if own_days else ""
    if stats["community"] and generated_on:
        out["communityGeneratedOn"] = generated_on   # the day the community catalogue (Open Food Facts based) was built
    out["products"] = rows
    return out, stats, held


def serialise(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"


def run(root: Path = GROCERIES, report_dir: Path | None = REPORT_DIR, page_barcodes_only: bool = False, proven: dict | None = None, quiet: bool = False,
        allow_restricted_community: bool = True) -> dict:
    """Read the lists and catalogue files under `root` (web/public/groceries), write root/recipe/<shop>.json for every shop with a labelled row and put
    each file's {file, count, own, sha256} in root/all/all-manifest.json as `recipe`; write the report under `report_dir` (None = no report files).
    Returns {shop: stats} plus {"_pool": stats of Sainsbury's pool}."""
    allp, recp = root / "all", root / "recipe"
    sains = json.loads((allp / f"{HOME}.json").read_text())
    if proven is None:
        from build_all_products import gtins_by_slug  # the barcodes Sainsbury's own pages printed (data/groceries/discovery)
        proven = gtins_by_slug(HOME)
    pool, pool_stats = sainsburys_pool(sains, proven, page_barcodes_only)
    manifest_path = allp / "all-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    recp.mkdir(parents=True, exist_ok=True)
    results: dict = {"_pool": pool_stats}
    held_all: list = []
    entries: dict[str, dict] = {}
    for shop in RECIPE_SHOPS:
        path = allp / f"{shop}.json"
        if not path.exists():
            continue
        cat_path = root / f"{shop}.json"
        cat = json.loads(cat_path.read_text()) if cat_path.exists() else {}
        doc, stats, held = build_shop(shop, json.loads(path.read_text()), pool, catalogue_index(cat.get("products", [])), cat.get("generatedOn") or "",
                                    sains.get("nutritionCheckedOn") or "", pool_stats, allow_restricted_community)
        held_all += held
        out_path = recp / f"{shop}.json"
        if doc is None:
            out_path.unlink(missing_ok=True)
            results[shop] = {**stats, "bytes": 0, "gzip": 0}
            continue
        text = serialise(doc)
        out_path.write_text(text)
        results[shop] = {**stats, "bytes": len(text.encode()), "gzip": len(gzip.compress(text.encode(), 9, mtime=0))}
        entries[shop] = {"file": f"{shop}.json", "count": len(doc["products"]), "own": stats["page"] + stats["shop_page"], "sha256": hashlib.sha256(text.encode()).hexdigest()}
    for entry in manifest["retailers"]:
        entry.pop("recipe", None)
        if entry["id"] in entries:
            entry["recipe"] = entries[entry["id"]]
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    if report_dir is not None:
        write_report(report_dir, results, held_all, page_barcodes_only)
    if not quiet:
        print_summary(results)
    return results


def write_report(folder: Path, results: dict, held: list, page_barcodes_only: bool) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    with open(folder / "held-back.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["shop", "product_id", "name", "barcode", "reason", "detail"])
        w.writerows(held)
    (folder / "report.txt").write_text("\n".join(report_lines(results, page_barcodes_only)) + "\n", encoding="utf-8")


def report_lines(results: dict, page_barcodes_only: bool) -> list[str]:
    p = results["_pool"]
    lines = ["Recipe shop files (tools/groceries/build_recipe_shop_files.py; docs/DATA.md \"Recipe shop files\")",
             "Sainsbury's page labels offered to other shops" + (" (barcodes its own page printed only)" if page_barcodes_only else "") + ":",
             f"  rows with a label {p['rows']}; no barcode {p['no_barcode']}; bad check digit {p['bad_barcode']}; shop-internal barcode {p['restricted']}; "
             f"state recipes cannot use {p['state']}; implausible {p['implausible']}; barcode shared by two different labels {p['ambiguous']}; "
             f"barcode only from an exact name-and-size twin {p['name_paired']} (left out) ; offered {p['kept']} barcodes, {p.get('name_paired_kept', 0)} of them from a name-and-size twin",
             f"  refused by the kJ against kcal test (still in Sainsbury's own list, unchanged): {len(p['kj'])}" + "".join(f"\n    {x}" for x in p["kj"])]
    for shop in RECIPE_SHOPS:
        s = results.get(shop)
        if not s:
            continue
        lines += ["", f"{shop}: {s['rows']} rows in the list, {s['kept']} in the recipe file ({s['bytes']:,} bytes, {s['gzip']:,} gzip)",
                  f"  not joined: no price {s['unpriced']}, no barcode {s['no_barcode']}, bad check digit {s['bad_barcode']}, no label found {s['no_label']}",
                  f"  kept: Sainsbury's page label of the same barcode {s['page']} ({s['page_name_paired']} where that Sainsbury's barcode came from a name-and-size twin), "
                  f"the shop's own page {s['shop_page']}, community record {s['community']} ({s['community_restricted']} with a shop-internal barcode, same shop only)",
                  f"  held back or refused: sources disagree {s['conflict']}, name shares no word {s['name_differs']}, catalogue record unusable {s['community_refused']}, "
                  f"shop-internal barcode matched a Sainsbury's number {s['restricted']}, community record for a barcode Sainsbury's prints a cooked/prepared label for {s['state_blocked']}",
                  f"  a drained Sainsbury's label used and a state-less community record ignored: {s['drained_community_ignored']}; "
                  f"another source printed the other unit (per 100 ml against 100 g) with agreeing numbers and was not used: {s['unit_note']}; "
                  f"optional rows left out because they can't hold (saturates above fat, sugars above carbohydrate): {s['optional_left_out']}"]
    return lines


def print_summary(results: dict) -> None:
    for line in report_lines(results, False):
        print(line)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--page-barcodes-only", action="store_true", help="copy a Sainsbury's label only where its own product page printed the barcode, not where the barcode came "
                    "from an exact name-and-size twin at another shop")
    ap.add_argument("--no-shop-internal-community", action="store_true", help="also leave out the community records joined by a shop's own shop-internal number "
                    "(Tesco's produce codes): about 100 Tesco rows")
    ap.add_argument("--root", type=Path, default=GROCERIES, help="web/public/groceries")
    a = ap.parse_args(argv)
    run(a.root, REPORT_DIR if a.root == GROCERIES else None, a.page_barcodes_only, allow_restricted_community=not a.no_shop_internal_community)
    return 0


if __name__ == "__main__":
    sys.exit(main())
