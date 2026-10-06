#!/usr/bin/env python3
"""MenuMacros menu-data pipeline.

Reads one folder per chain from data/source/<chain-id>/ (CSV files typed from each
chain's published nutrition guide), checks the numbers, generates "Best for you"
candidate orders, and writes flat JSON files the app reads:

    <out>/menus-manifest.json
    <out>/chain-<chain-id>.json
    <out>/check-report.md

Usage:
    python3 tools/build_menus.py                                   # dev: data/source -> dist/menus
    python3 tools/build_menus.py --bundle-into MenuMacros/Resources/Menus
    python3 tools/build_menus.py --no-samples --out dist/release --bundle-into MenuMacros/Resources/Menus
    python3 tools/build_menus.py --only bowl-and-co                # rebuild one chain into an existing --out

Exit code 1 if any hard error is found (nothing is written in that case).
Standard library only. See docs/DATA.md for the full data contract.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import re
import shutil
import sys
from dataclasses import dataclass, field
from itertools import product
from pathlib import Path

SCHEMA_VERSION = 1
ROOT = Path(__file__).resolve().parent.parent

REQUIRED_NUTRIENTS = ["calories", "protein", "carbs", "fat"]
OPTIONAL_NUTRIENTS = ["saturatedFat", "sodium", "sugar", "fiber", "salt"]  # salt last: charts without it stay byte-identical
NUTRIENT_COLUMNS = {  # CSV column -> JSON key
    "calories": "calories",
    "protein_g": "protein",
    "carbs_g": "carbs",
    "fat_g": "fat",
    "sat_fat_g": "saturatedFat",
    "sodium_mg": "sodium",
    "sugar_g": "sugar",
    "fiber_g": "fiber",
    "salt_g": "salt",  # UK guides publish salt in grams, not sodium (docs/DATA.md)
}
# Columns a CSV may leave out entirely (older files); when present they are read like any other nutrient column.
OPTIONAL_COLUMNS = {"salt_g"}
SEARCH_FILE = "menus-search.json"
# Item photos (docs/DATA.md "images.csv"): the chain's own photo, resized and stored here by tools/uk_extract/images_common.py.
DEFAULT_IMAGES_DIR = ROOT / "web" / "public" / "menu-images"
IMAGES_DIR = DEFAULT_IMAGES_DIR
IMAGE_FILE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$")
MAX_IMAGE_BYTES = 150_000
INTEGER_NUTRIENTS = {"calories", "sodium"}
TWO_DECIMAL_NUTRIENTS = {"salt"}  # salt is published to 2 decimals (e.g. 0.16 g); rounding it to 1 would change the published figure
_N = list(NUTRIENT_COLUMNS)

# Exact headers per file (order doesn't matter; every column must be present, no extras).
HEADERS = {
    "chain.csv": ["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"],
    "components.csv": ["id", "group", "name", "portion", *_N, "tags", "removable", "allow_double"],
    "items.csv": ["id", "name", "category", "serving", *_N, "tags", "limited_time", "rankable", "components", "added_on", "notes"],
    "modifiers.csv": ["item_id", "id", "label", "kind", *_N, "tags"],
    "combos.csv": ["id", "name", "item_ids"],
    "holdback.csv": ["item_id", "reason"],
    "images.csv": ["item_id", "file", "source_url", "retrieved_on"],
}

ALLOWED_TAGS = {"vegetarian", "contains_pork", "contains_beef"}
ALLOWED_GROUPS = ["base", "wrap", "protein", "topping", "sauce", "side", "drink", "extra"]
ALLOWED_BUILDER_TYPES = {"build_your_own", "standard"}
ALLOWED_MODIFIER_KINDS = {"remove", "add"}

ENERGY_TOLERANCE = 0.15         # flag if calories differ from 4P+4C+9F by more than 15%
ENERGY_MIN_CALORIES = 50        # below this use an absolute check instead (rounding noise)
ENERGY_SMALL_ITEM_SLACK = 25    # small items: flag if 4P+4C+9F exceeds calories by more than this
ITEM_VS_COMPONENTS_TOLERANCE = 0.05
MAX_CANDIDATES_PER_CHAIN = 400  # generated variations + combos kept per chain

ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LESS_THAN_RE = re.compile(r"^<\s*\d+(\.\d+)?$")


# ---------------------------------------------------------------- numbers

def half_up(x: float, places: int = 0) -> float:
    """Round half away from zero (matches Swift's .rounded()). Python's round() is banker's rounding."""
    f = 10 ** places
    return math.floor(abs(x) * f + 0.5) / f * (1 if x >= 0 else -1)


def round_nutrient(key: str, val: float):
    if key in INTEGER_NUTRIENTS:
        return int(half_up(val))
    r = half_up(val, 2 if key in TWO_DECIMAL_NUTRIENTS else 1)
    return int(r) if r == int(r) else r


def nutrients_from_row(row: dict, where: str, errors: list, *, allow_blank_required=False):
    """Parse nutrient columns. Returns dict (missing optional keys omitted) or None if all required blank.

    '<1' style values (as printed in nutrition guides) are stored as 0; see docs/DATA.md."""
    out = {}
    blanks = []
    for col, key in NUTRIENT_COLUMNS.items():
        raw = (row.get(col) or "").strip()
        if raw == "":
            if key in REQUIRED_NUTRIENTS:
                blanks.append(col)
            continue
        if LESS_THAN_RE.match(raw):
            out[key] = 0
            continue
        try:
            val = float(raw)
        except ValueError:
            errors.append(f"{where}: column '{col}' is not a number: {raw!r}")
            continue
        if not math.isfinite(val):
            errors.append(f"{where}: column '{col}' is not a number: {raw!r}")
            continue
        if val < 0:
            errors.append(f"{where}: column '{col}' is negative ({raw})")
            continue
        out[key] = round_nutrient(key, val)
    if blanks:
        if allow_blank_required and len(blanks) == len(REQUIRED_NUTRIENTS):
            return None
        errors.append(f"{where}: missing required nutrient column(s): {', '.join(blanks)}")
    return out


def add_nutrients(parts: list[tuple[dict, float]]) -> dict:
    """Sum (nutrients, multiplier) pairs. Multiplier may be negative (a 'remove' modifier).

    Rule: an optional nutrient appears in the total only if EVERY part publishes it
    ("not published" propagates; we never estimate)."""
    total = {}
    for key in REQUIRED_NUTRIENTS + OPTIONAL_NUTRIENTS:
        if key in OPTIONAL_NUTRIENTS and not all(key in n for n, _ in parts):
            continue
        s = sum(n.get(key, 0) * m for n, m in parts)
        total[key] = round_nutrient(key, max(s, 0))
    return total


def energy_estimate(n: dict) -> float:
    return 4 * n["protein"] + 4 * n["carbs"] + 9 * n["fat"]


def energy_problem(n: dict) -> str | None:
    """Describe an energy-check failure, or None if the numbers look consistent."""
    cal, est = n.get("calories", 0), energy_estimate(n)
    if cal >= ENERGY_MIN_CALORIES:
        diff = abs(cal - est) / cal
        if diff > ENERGY_TOLERANCE:
            return f"calories {cal} vs 4P+4C+9F = {est:.0f} ({diff:.0%} off)"
    elif est > cal + ENERGY_SMALL_ITEM_SLACK:
        return f"calories {cal} but 4P+4C+9F = {est:.0f}"
    return None


def density(n: dict) -> float:
    return (n["protein"] / n["calories"] * 100) if n["calories"] else 0.0


# ---------------------------------------------------------------- parsing helpers

def read_csv(path: Path, errors: list, where: str) -> list[tuple[int, dict]]:
    """Read a CSV strictly: UTF-8, exact headers, every row the same width. Returns (line, row) pairs."""
    if not path.exists():
        return []
    expected = HEADERS[path.name]
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        errors.append(f"{where}: not UTF-8. In your spreadsheet use 'CSV UTF-8' when saving/exporting.")
        return []
    reader = csv.reader(text.splitlines())
    try:
        header = [h.strip() for h in next(reader)]
    except StopIteration:
        errors.append(f"{where}: file is empty (it needs at least the header row)")
        return []
    missing = [h for h in expected if h not in header and h not in OPTIONAL_COLUMNS]
    unknown = [h for h in header if h not in expected]
    if missing or unknown:
        errors.append(f"{where}: header mismatch — missing {missing or '-'}, unknown {unknown or '-'}. Copy the header row from data/source/_template/{path.name}")
        return []
    rows = []
    for line_no, cells in enumerate(reader, start=2):
        if not any(c.strip() for c in cells):
            continue  # blank line
        if len(cells) != len(header):
            errors.append(f"{where} line {line_no}: has {len(cells)} fields, expected {len(header)}. "
                          f"A comma inside a value must be quoted (e.g. \"Chicken, bacon melt\").")
            continue
        rows.append((line_no, {h: c.strip() for h, c in zip(header, cells)}))
    return rows


def parse_bool(raw: str, default: bool, where: str, errors: list) -> bool:
    raw = (raw or "").strip().lower()
    if raw == "":
        return default
    if raw in {"true", "yes", "1", "y"}:
        return True
    if raw in {"false", "no", "0", "n"}:
        return False
    errors.append(f"{where}: expected true/false, got {raw!r}")
    return default


def parse_date(raw: str, col: str, where: str, errors: list) -> str:
    try:
        dt.date.fromisoformat(raw)
    except ValueError:
        errors.append(f"{where}: {col} must be a real date as YYYY-MM-DD, got {raw!r}")
    return raw


def parse_tags(raw: str, where: str, errors: list) -> list[str]:
    tags = [t.strip() for t in (raw or "").split("|") if t.strip()]
    for t in tags:
        if t not in ALLOWED_TAGS:
            errors.append(f"{where}: unknown tag {t!r} (allowed: {', '.join(sorted(ALLOWED_TAGS))})")
    return sorted(set(t for t in tags if t in ALLOWED_TAGS))


def check_id(value: str, where: str, errors: list) -> str:
    if not ID_RE.match(value or ""):
        errors.append(f"{where}: id {value!r} must be lowercase letters, digits and single hyphens")
    return value


def lower_first(label: str) -> str:
    """'No mayo' -> 'no mayo', but keep acronyms: 'BBQ sauce' stays 'BBQ sauce'."""
    if len(label) > 1 and label[1].isupper():
        return label
    return label[:1].lower() + label[1:]


def short_hash(obj) -> str:
    return hashlib.sha1(repr(obj).encode()).hexdigest()[:8]


def combine_tags(tag_lists: list[list[str]]) -> list[str]:
    tags = set()
    for tl in tag_lists:
        tags.update(t for t in tl if t != "vegetarian")
    if tag_lists and all("vegetarian" in tl for tl in tag_lists):
        tags.add("vegetarian")
    return sorted(tags)


def change_list(changes_double: list[str], removed: list[str], swaps: list[str]) -> list[str]:
    """Canonical order and wording for order names (the app's builder must name orders the same way)."""
    out = [f"double {n}" for n in changes_double]
    if removed:
        out.append(", ".join(f"no {n}" for n in removed))
    out += swaps
    return out


# ---------------------------------------------------------------- model

@dataclass
class ChainBuild:
    folder: Path
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    chain: dict = field(default_factory=dict)
    components: dict = field(default_factory=dict)   # id -> component dict
    items: dict = field(default_factory=dict)        # id -> item dict (insertion-ordered)
    combinations: list = field(default_factory=list)
    held: list = field(default_factory=list)         # (item id, name, reason): rows left out of the published menu


def load_chain(folder: Path) -> ChainBuild:
    b = ChainBuild(folder=folder)
    E, W = b.errors, b.warnings
    cid = folder.name

    # chain.csv ---------------------------------------------------------
    rows = read_csv(folder / "chain.csv", E, f"{cid}/chain.csv")
    if len(rows) != 1:
        if not E:
            E.append(f"{cid}/chain.csv: expected exactly 1 row, found {len(rows)}")
        return b
    _, r = rows[0]
    w = f"{cid}/chain.csv"
    check_id(r["id"], w, E)
    if r["id"] != cid:
        E.append(f"{w}: id {r['id']!r} must match the folder name {cid!r}")
    for col in ["name", "cuisine", "builder_type", "source_title", "source_url", "checked_on"]:
        if not r[col]:
            E.append(f"{w}: '{col}' is required")
    if r["builder_type"] and r["builder_type"] not in ALLOWED_BUILDER_TYPES:
        E.append(f"{w}: builder_type must be one of {sorted(ALLOWED_BUILDER_TYPES)}")
    if r["source_url"] and not r["source_url"].startswith("https://"):
        E.append(f"{w}: source_url must start with https://")
    if r["checked_on"]:
        parse_date(r["checked_on"], "checked_on", w, E)
    b.chain = {
        "id": cid,
        "name": r["name"],
        "cuisine": r["cuisine"],
        "builderType": r["builder_type"] or "standard",
        "aliases": [a.strip().lower() for a in r["aliases"].split("|") if a.strip()],
        "sample": parse_bool(r["sample"], False, w, E),
        "source": {"title": r["source_title"], "url": r["source_url"], "checkedOn": r["checked_on"]},
    }
    # note.txt (optional): a limit of the published data that users should know. Its own file, not a chain.csv column,
    # because the extraction scripts rewrite chain.csv on every refresh and would drop it.
    note_path = folder / "note.txt"
    if note_path.exists():
        note = " ".join(note_path.read_text(encoding="utf-8-sig").split())
        if len(note) > 400:
            E.append(f"{cid}/note.txt: {len(note)} characters; keep it under 400 (one or two sentences)")
        elif note:
            b.chain["note"] = note

    # components.csv ----------------------------------------------------
    for line, r in read_csv(folder / "components.csv", E, f"{cid}/components.csv"):
        w = f"{cid}/components.csv line {line}"
        comp_id = check_id(r["id"], w, E)
        if comp_id in b.components:
            E.append(f"{w}: duplicate component id {comp_id!r}")
            continue
        if r["group"] not in ALLOWED_GROUPS:
            E.append(f"{w}: group must be one of {ALLOWED_GROUPS}")
        if not r["name"]:
            E.append(f"{w}: name is required")
        n = nutrients_from_row(r, w, E) or {}
        if all(k in n for k in REQUIRED_NUTRIENTS) and (p := energy_problem(n)):
            W.append(f"{w} ({r['name']}): {p}. Re-check the source.")
        b.components[comp_id] = {
            "id": comp_id,
            "group": r["group"],
            "name": r["name"],
            "portion": r["portion"],
            "nutrients": n,
            "tags": parse_tags(r["tags"], w, E),
            "removable": parse_bool(r["removable"], False, w, E),
            "allowDouble": parse_bool(r["allow_double"], False, w, E),
        }

    # items.csv ---------------------------------------------------------
    item_rows = read_csv(folder / "items.csv", E, f"{cid}/items.csv")
    # holdback.csv: items the chain's own guide prints impossible numbers for (e.g. 367 g of carbs in a burger). They are
    # not published, not corrected, and listed in the check report until the chain fixes its guide. Survives re-extraction.
    holdback = {}
    for line, hr in read_csv(folder / "holdback.csv", E, f"{cid}/holdback.csv"):
        if not hr["item_id"] or not hr["reason"]:
            E.append(f"{cid}/holdback.csv line {line}: both item_id and reason are required")
            continue
        holdback[hr["item_id"]] = hr["reason"]
    names = {r["id"]: r["name"] for _, r in item_rows}
    for hid in holdback:
        if hid not in names:
            W.append(f"{cid}/holdback.csv: {hid!r} is not in items.csv any more (the guide may have changed): remove or update this line")
    b.held = [(hid, names[hid], reason) for hid, reason in holdback.items() if hid in names]
    item_rows = [(line, r) for line, r in item_rows if r["id"] not in holdback]
    if not item_rows and not E:
        E.append(f"{cid}/items.csv: no items found")
    for line, r in item_rows:
        w = f"{cid}/items.csv line {line}"
        item_id = check_id(r["id"], w, E)
        if item_id in b.items:
            E.append(f"{w}: duplicate item id {item_id!r}")
            continue
        if item_id.startswith(("var-", "combo-")):
            E.append(f"{w}: item ids can't start with 'var-' or 'combo-' (reserved for generated orders)")
        for col in ["name", "category"]:
            if not r[col]:
                E.append(f"{w}: '{col}' is required")
        if r["added_on"]:
            parse_date(r["added_on"], "added_on", w, E)

        comps, seen_ids = [], set()
        for part in [p.strip() for p in r["components"].split("|") if p.strip()]:
            comp_id, _, qty_raw = part.partition(":")
            qty = 1
            if qty_raw:
                if qty_raw not in {"1", "2"}:
                    E.append(f"{w}: component quantity must be 1 or 2 ({part!r})")
                    continue
                qty = int(qty_raw)
            if comp_id in seen_ids:
                E.append(f"{w}: component {comp_id!r} is listed twice; write {comp_id}:2 instead")
                continue
            seen_ids.add(comp_id)
            if comp_id not in b.components:
                E.append(f"{w}: unknown component {comp_id!r} (add it to components.csv)")
                continue
            if qty == 2 and not b.components[comp_id]["allowDouble"]:
                E.append(f"{w}: component {comp_id!r} has quantity 2 but allow_double is false")
            comps.append({"id": comp_id, "qty": qty})

        typed = nutrients_from_row(r, w, E, allow_blank_required=bool(comps))
        if comps:
            n = add_nutrients([(b.components[c["id"]]["nutrients"], c["qty"]) for c in comps])
            if typed:
                diff = abs(typed["calories"] - n["calories"]) / max(typed["calories"], 1)
                if diff > ITEM_VS_COMPONENTS_TOLERANCE:
                    W.append(f"{w} ({r['name']}): typed calories {typed['calories']} differ from its components' total {n['calories']} ({diff:.0%}). Using the components' total.")
            extra = parse_tags(r["tags"], w, E)
            tags = combine_tags([b.components[c["id"]]["tags"] for c in comps] + ([extra] if extra else []))
        else:
            n = typed or {}
            tags = parse_tags(r["tags"], w, E)
        if all(k in n for k in REQUIRED_NUTRIENTS) and (p := energy_problem(n)):
            W.append(f"{w} ({r['name']}): {p}. Re-check the source.")

        item = {
            "id": item_id,
            "name": r["name"],
            "category": r["category"],
            "serving": r["serving"],
            "nutrients": n,
            "tags": tags,
            "limitedTime": parse_bool(r["limited_time"], False, w, E),
            "rankable": parse_bool(r["rankable"], True, w, E),
            "components": comps,
            "modifiers": [],
        }
        if r["added_on"]:
            item["addedOn"] = r["added_on"]
        b.items[item_id] = item

    # images.csv (optional): the chain's own photo for an item. The file lives under IMAGES_DIR/<chain-id>/ (written by
    # tools/uk_extract/images_common.py); a row only counts while its item is published. Many items may share one file.
    for line, r in read_csv(folder / "images.csv", E, f"{cid}/images.csv"):
        w = f"{cid}/images.csv line {line}"
        item = b.items.get(r["item_id"])
        if item is None:
            if r["item_id"] not in holdback:
                W.append(f"{w}: item {r['item_id']!r} is not in items.csv any more: remove or update this line")
            continue
        path = IMAGES_DIR / cid / r["file"]
        if not IMAGE_FILE_RE.match(r["file"]):
            E.append(f"{w}: file {r['file']!r} must be a lowercase-hyphen .webp name")
        elif not path.is_file():
            E.append(f"{w}: image file {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path} does not exist")
        elif path.stat().st_size > MAX_IMAGE_BYTES:
            E.append(f"{w}: image is {path.stat().st_size:,} bytes; keep each under {MAX_IMAGE_BYTES:,}")
        else:
            if not r["source_url"].startswith("https://"):
                E.append(f"{w}: source_url must start with https:// (the chain's own page the photo came from)")
            if r["retrieved_on"]:
                parse_date(r["retrieved_on"], "retrieved_on", w, E)
            item["image"] = f"{cid}/{r['file']}"

    # modifiers.csv -----------------------------------------------------
    for line, r in read_csv(folder / "modifiers.csv", E, f"{cid}/modifiers.csv"):
        w = f"{cid}/modifiers.csv line {line}"
        item_id = r["item_id"]
        if item_id not in b.items:
            E.append(f"{w}: unknown item_id {item_id!r}")
            continue
        if b.items[item_id]["components"]:
            E.append(f"{w}: item {item_id!r} is built from components; customise it with components, not modifiers")
            continue
        mod_id = check_id(r["id"], w, E)
        if any(m["id"] == mod_id for m in b.items[item_id]["modifiers"]):
            E.append(f"{w}: duplicate modifier id {mod_id!r} for item {item_id!r}")
            continue
        kind = r["kind"]
        if kind not in ALLOWED_MODIFIER_KINDS:
            E.append(f"{w}: kind must be 'remove' or 'add'")
        if not r["label"]:
            E.append(f"{w}: label is required")
        n = nutrients_from_row(r, w, E) or {}
        mod_tags = parse_tags(r["tags"], w, E)
        if kind == "remove":
            item_n = b.items[item_id]["nutrients"]
            over = [k for k, v in n.items() if k in item_n and v > item_n[k]]
            if over:
                E.append(f"{w}: removing {r['label']!r} would take more {', '.join(over)} than the item has (check both rows against the source)")
            if mod_tags:
                W.append(f"{w}: tags on a 'remove' modifier are ignored (removing never adds tags)")
                mod_tags = []
        b.items[item_id]["modifiers"].append({"id": mod_id, "label": r["label"], "kind": kind, "nutrients": n, "tags": mod_tags})

    if b.chain.get("builderType") == "build_your_own" and not b.components:
        E.append(f"{cid}: builder_type is build_your_own but components.csv is empty")

    # combos.csv (hand-made meal combos of whole items) ------------------
    combos, combo_ids = [], set()
    for line, r in read_csv(folder / "combos.csv", E, f"{cid}/combos.csv"):
        w = f"{cid}/combos.csv line {line}"
        combo_id = check_id(r["id"], w, E)
        if combo_id in combo_ids:
            E.append(f"{w}: duplicate combo id {combo_id!r}")
            continue
        combo_ids.add(combo_id)
        ids = [x.strip() for x in r["item_ids"].split("|") if x.strip()]
        missing = [x for x in ids if x not in b.items]
        if missing:
            E.append(f"{w}: unknown item id(s) {missing}")
            continue
        if len(ids) < 2:
            E.append(f"{w}: a combo needs at least 2 items")
            continue
        parts = [b.items[x] for x in ids]
        combos.append({
            "id": f"combo-{combo_id}",
            "name": r["name"] or " + ".join(p["name"] for p in parts),
            "kind": "combo",
            "baseItemId": None,
            "components": [],
            "items": [{"itemId": x, "modifierIds": []} for x in ids],
            "nutrients": add_nutrients([(p["nutrients"], 1) for p in parts]),
            "tags": combine_tags([p["tags"] for p in parts]),
            "itemCount": len(ids),
        })

    if not E:
        b.combinations = cap_candidates(generate_variations(b) + combos, b)
        all_ids = [c["id"] for c in b.combinations] + list(b.items)
        dupes = sorted({x for x in all_ids if all_ids.count(x) > 1})
        if dupes:
            E.append(f"{cid}: candidate ids collide: {dupes}")
    return b


# ---------------------------------------------------------------- candidate generation

def variation_name(item: dict, changes: list[str]) -> str:
    return item["name"] + "".join(f" · {c}" for c in changes)


def generate_variations(b: ChainBuild) -> list[dict]:
    """Smart variations of real menu items (see docs/DATA.md 'Candidate generation')."""
    out, seen = [], set()
    bases_in_chain = [c for c in b.components.values() if c["group"] == "base"]
    comp = b.components

    for item in b.items.values():
        if not item["rankable"]:
            continue
        if item["components"]:
            base = {c["id"]: c["qty"] for c in item["components"]}
            seen.add(("c", tuple(sorted(base.items()))))
            proteins = [x for x in base if comp[x]["group"] == "protein" and comp[x]["allowDouble"] and base[x] == 1]
            removable = [x for x in base if comp[x]["removable"]]
            bases = [x for x in base if comp[x]["group"] == "base"]

            protein_opts = [None] + proteins
            removal_opts = [()] + [(x,) for x in removable] + ([tuple(removable)] if len(removable) > 1 else [])
            swap_opts = [None] + [(old, new["id"]) for old in bases for new in bases_in_chain if new["id"] not in base]

            for p, rem, swap in product(protein_opts, removal_opts, swap_opts):
                if p is None and not rem and swap is None:
                    continue
                state = dict(base)
                if p:
                    state[p] = 2
                for x in rem:
                    state.pop(x, None)
                if swap:
                    old, new = swap
                    state.pop(old, None)
                    state[new] = 1
                sig = ("c", tuple(sorted(state.items())))
                if sig in seen or not state:
                    continue
                seen.add(sig)
                changes = change_list(
                    [lower_first(comp[p]["name"])] if p else [],
                    [lower_first(comp[x]["name"]) for x in rem],
                    [f"{lower_first(comp[swap[1]]['name'])} instead of {lower_first(comp[swap[0]]['name'])}"] if swap else [])
                out.append({
                    "id": f"var-{item['id']}-{short_hash(sig)}",
                    "name": variation_name(item, changes),
                    "kind": "variation",
                    "baseItemId": item["id"],
                    "components": [{"id": x, "qty": q} for x, q in sorted(state.items(), key=lambda kv: (ALLOWED_GROUPS.index(comp[kv[0]]["group"]), kv[0]))],
                    "items": [],
                    "nutrients": add_nutrients([(comp[x]["nutrients"], q) for x, q in state.items()]),
                    "tags": combine_tags([comp[x]["tags"] for x in state]),
                    "itemCount": 1,
                })
        elif item["modifiers"]:
            removes = [m for m in item["modifiers"] if m["kind"] == "remove"]
            adds = [m for m in item["modifiers"] if m["kind"] == "add"]
            options = [[m] for m in removes] + ([removes] if len(removes) > 1 else []) + [[m] for m in adds]
            for mods in options:
                sig = ("m", item["id"], tuple(sorted(m["id"] for m in mods)))
                if sig in seen:
                    continue
                seen.add(sig)
                parts = [(item["nutrients"], 1)] + [(m["nutrients"], -1 if m["kind"] == "remove" else 1) for m in mods]
                added_tags = [m["tags"] for m in mods if m["kind"] == "add"]
                out.append({
                    "id": f"var-{item['id']}-{short_hash(sig)}",
                    "name": variation_name(item, [lower_first(m["label"]) for m in mods]),
                    "kind": "variation",
                    "baseItemId": item["id"],
                    "components": [],
                    "items": [{"itemId": item["id"], "modifierIds": [m["id"] for m in mods]}],
                    "nutrients": add_nutrients(parts),
                    "tags": combine_tags([item["tags"], *added_tags]) if added_tags else item["tags"],
                    "itemCount": 1,
                })
    return out


def cap_candidates(cands: list[dict], b: ChainBuild) -> list[dict]:
    """Keep at most MAX_CANDIDATES_PER_CHAIN: half by protein density, the rest by fewest calories."""
    if len(cands) <= MAX_CANDIDATES_PER_CHAIN:
        return cands
    half = MAX_CANDIDATES_PER_CHAIN // 2
    keep_ids = {c["id"] for c in sorted(cands, key=lambda c: (-density(c["nutrients"]), c["id"]))[:half]}
    for c in sorted(cands, key=lambda c: (c["nutrients"]["calories"], c["id"])):
        if len(keep_ids) >= MAX_CANDIDATES_PER_CHAIN:
            break
        keep_ids.add(c["id"])
    b.warnings.append(f"{b.chain['id']}: {len(cands)} candidates generated; kept {len(keep_ids)} (cap {MAX_CANDIDATES_PER_CHAIN}).")
    return [c for c in cands if c["id"] in keep_ids]


# ---------------------------------------------------------------- output

def chain_document(b: ChainBuild) -> dict:
    categories = []
    for it in b.items.values():
        if it["category"] not in categories:
            categories.append(it["category"])
    return {"schemaVersion": SCHEMA_VERSION, **b.chain, "categories": categories,
            "components": list(b.components.values()), "items": list(b.items.values()),
            "combinations": b.combinations}


def search_document(out: Path, manifest_chains: list) -> dict:
    """Compact index for the app's search: chain names plus [item id, name, calories] per item, so search never has to
    download every full menu. Built from the chain files just written, so it can never disagree with them."""
    chains = []
    for c in manifest_chains:
        doc = json.loads((out / c["file"]).read_text())
        chains.append({
            "id": doc["id"], "name": doc["name"], "cuisine": doc["cuisine"], "aliases": doc["aliases"], "sample": doc["sample"],
            "items": [[i["id"], i["name"], i["nutrients"]["calories"]] for i in doc["items"]],
        })
    return {"schemaVersion": SCHEMA_VERSION, "chains": chains}


def content_hash(doc: dict) -> str:
    return hashlib.sha256(json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv=None) -> int:
    global IMAGES_DIR
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default=str(ROOT / "data" / "source"))
    ap.add_argument("--out", default=str(ROOT / "dist" / "menus"))
    ap.add_argument("--bundle-into", default=None, help="also copy the JSON files here (e.g. MenuMacros/Resources/Menus)")
    ap.add_argument("--only", action="append", help="rebuild only these chain ids into an existing --out (repeatable)")
    ap.add_argument("--no-samples", action="store_true", help="skip chains marked sample=true (use for release)")
    ap.add_argument("--images-dir", default=None, help="where item photos live (default web/public/menu-images)")
    ap.add_argument("-q", "--quiet", action="store_true", help="print only errors")
    args = ap.parse_args(argv)
    IMAGES_DIR = Path(args.images_dir).resolve() if args.images_dir else DEFAULT_IMAGES_DIR

    src, out = Path(args.source), Path(args.out)
    folders = sorted(p for p in src.iterdir() if p.is_dir() and not p.name.startswith(("_", ".")))
    pre_errors = []
    old_manifest_path = out / "menus-manifest.json"
    if args.only:
        unknown = sorted(set(args.only) - {p.name for p in folders})
        if unknown:
            pre_errors.append(f"--only: no chain folder named {unknown} in {src}")
        if not old_manifest_path.exists():
            pre_errors.append(f"--only needs a full build in {out} first (no menus-manifest.json there)")
        folders = [p for p in folders if p.name in set(args.only)]
    builds = [load_chain(f) for f in folders]
    if args.no_samples:
        builds = [b for b in builds if not b.chain.get("sample")]

    errors = pre_errors + [e for b in builds for e in b.errors]
    warnings = [w for b in builds for w in b.warnings]

    now_utc = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    now = now_utc.isoformat().replace("+00:00", "Z")
    data_version = int(now_utc.strftime("%Y%m%d%H%M%S"))   # monotonic across machines; see docs/DATA.md
    report = ["# Menu data check report", "", f"Generated {now} · dataVersion {data_version}", "",
              f"Chains: {len(builds)} · Errors: {len(errors)} · Warnings: {len(warnings)}", ""]
    if errors:
        report += ["## Errors (nothing was written)", ""] + [f"- {e}" for e in errors] + [""]
    if warnings:
        report += ["## Warnings (check these against the source)", ""] + [f"- {w}" for w in warnings] + [""]
    held = [(b.chain.get("name", b.folder.name), *h) for b in builds for h in b.held]
    if held:
        report += ["## Held back (not published: the chain's own numbers contradict themselves, or its own website disagrees)", ""]
        report += [f"- {chain}: {name} ({iid}): {reason}" for chain, iid, name, reason in held] + [""]

    out.mkdir(parents=True, exist_ok=True)
    if errors:
        (out / "check-report.md").write_text("\n".join(report))
        if args.quiet:
            print("\n".join(f"error: {e}" for e in errors), file=sys.stderr)
        else:
            print("\n".join(report))
        return 1

    manifest_chains = []
    report += ["## Chains", "", "| Chain | Sample | Items | Components | Candidates | Checked on |", "|---|---|---|---|---|---|"]
    for b in builds:
        doc = chain_document(b)
        fname = f"chain-{b.chain['id']}.json"
        (out / fname).write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        manifest_chains.append({
            "id": b.chain["id"], "name": b.chain["name"], "cuisine": b.chain["cuisine"], "file": fname,
            "sha256": file_sha256(out / fname), "contentHash": content_hash(doc), "sample": b.chain["sample"],
            "itemCount": len(doc["items"]), "checkedOn": b.chain["source"]["checkedOn"],
        })
        report.append(f"| {b.chain['name']} | {'yes' if b.chain['sample'] else 'no'} | {len(doc['items'])} | {len(doc['components'])} | {len(doc['combinations'])} | {b.chain['source']['checkedOn']} |")

    if args.only:  # partial build: keep the other chains from the existing manifest
        built = {c["id"] for c in manifest_chains}
        old = json.loads(old_manifest_path.read_text())["chains"]
        manifest_chains = [c for c in old if c["id"] not in built] + manifest_chains
    manifest_chains.sort(key=lambda c: c["id"])

    (out / SEARCH_FILE).write_text(json.dumps(search_document(out, manifest_chains), ensure_ascii=False, separators=(",", ":")) + "\n")
    manifest = {"schemaVersion": SCHEMA_VERSION, "dataVersion": data_version, "generatedAt": now, "chains": manifest_chains,
                "search": {"file": SEARCH_FILE, "sha256": file_sha256(out / SEARCH_FILE)}}
    (out / "menus-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")

    keep = {c["file"] for c in manifest_chains}
    for f in out.glob("chain-*.json"):
        if f.name not in keep:
            f.unlink()
    (out / "check-report.md").write_text("\n".join(report) + "\n")

    if args.bundle_into:
        dest = Path(args.bundle_into)
        dest.mkdir(parents=True, exist_ok=True)
        for f in dest.glob("*.json"):
            f.unlink()
        for f in [out / "menus-manifest.json", out / SEARCH_FILE] + [out / c["file"] for c in manifest_chains]:
            shutil.copy2(f, dest / f.name)

    if not args.quiet:
        print("\n".join(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
