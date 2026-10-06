#!/usr/bin/env python3
"""Fetch every UK branch of each chain from OpenStreetMap (Overpass API) into web/public/branches/branches.json.

    python3 tools/branches/fetch_osm_branches.py [--only kfc,greggs] [--cache DIR] [--refresh]

Why OpenStreetMap: free open data with good UK coverage of chain branches (founder's decision 2026-10-06). The result is a
derived database under the ODbL: it is credited as "© OpenStreetMap contributors" in the app, on the privacy page and in
web/public/branches/LICENSE.txt. Nothing here touches a user's location: the phone picks the nearest branches itself.

Matching (data/branches/osm-match.json): a place counts as a branch only when its `name` or `brand` equals one of the
chain's names EXACTLY (case-insensitive) and it is a food place (amenity/shop/tourism kinds below). Ambiguous names can
require extra tags or a website domain. Anything fuzzy is left out: a missing pin is better than a wrong one.

Politeness: one query at a time, 6 seconds apart, a descriptive User-Agent, results cached per chain so reruns are free.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "branches" / "branches.json"
MATCH = ROOT / "data" / "branches" / "osm-match.json"
REPORT = ROOT / "data" / "branches" / "REPORT.md"
ENDPOINT = "https://overpass-api.de/api/interpreter"
UA = "MenuMathBranchFetch/1.0 (UK nutrition app; contact aman66@hotmail.co.uk)"

DEFAULT_KINDS = {  # regular expressions matched against the whole tag value
    "amenity": "fast_food|restaurant|cafe|pub|bar|ice_cream|food_court|biergarten",
    "shop": "bakery|coffee|confectionery|pastry|deli|chocolate|food",
}
DEDUPE_METRES = 60  # a restaurant mapped as both a building and a point is one branch


def chains() -> list[dict]:
    out = []
    manifest = json.loads((ROOT / "web" / "public" / "menus" / "menus-manifest.json").read_text())
    for c in manifest["chains"]:
        with open(ROOT / "data" / "source" / c["id"] / "chain.csv", newline="", encoding="utf-8-sig") as f:
            row = next(csv.DictReader(f))
        out.append({"id": c["id"], "name": c["name"], "aliases": [a for a in row["aliases"].split("|") if a]})
    return out


def build_query(names: list[str]) -> str:
    """Exact-value lookups only: Overpass indexes them, whereas a case-insensitive regex over all of Great Britain times out."""
    variants: list[str] = []
    for n in names:
        for v in (n, n.upper(), n.replace("'", "\u2019")):
            if v not in variants:
                variants.append(v)
    clauses = []
    for v in variants:
        esc = v.replace("\\", "\\\\").replace('"', '\\"')
        for tag in ("name", "brand"):
            clauses.append(f'  nwr["{tag}"="{esc}"](area.uk);')
    return '[out:json][timeout:300];\narea["ISO3166-1"="GB"][admin_level=2]->.uk;\n(\n' + "\n".join(clauses) + "\n);\nout center tags;"


def is_food_place(tags: dict, kinds: dict[str, str]) -> bool:
    import re
    return any(k in tags and re.fullmatch(v, tags[k]) for k, v in kinds.items())


def fetch(query: str, cache: Path) -> dict:
    key = hashlib.sha1(query.encode()).hexdigest()
    f = cache / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text())
    cache.mkdir(parents=True, exist_ok=True)
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(ENDPOINT, data=body, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=240) as r:
                data = json.loads(r.read().decode("utf-8"))
            f.write_text(json.dumps(data))
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504):
                time.sleep(20 * (attempt + 1))
                continue
            raise
        except (TimeoutError, urllib.error.URLError):
            time.sleep(20 * (attempt + 1))
    raise RuntimeError("Overpass kept refusing; try again later (never loop faster).")


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def points(elements: list[dict], kinds: dict[str, str], websites: list[str]) -> list[tuple[float, float]]:
    seen: list[tuple[float, float]] = []
    for e in elements:
        tags = e.get("tags", {})
        if not is_food_place(tags, kinds):
            continue
        if websites and not any(w.lower() in (tags.get("website", "") + tags.get("contact:website", "")).lower() for w in websites):
            continue
        lat = e.get("lat") if "lat" in e else e.get("center", {}).get("lat")
        lon = e.get("lon") if "lon" in e else e.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        p = (round(lat, 5), round(lon, 5))
        if not (49.8 <= p[0] <= 61.0 and -8.7 <= p[1] <= 2.0):  # Great Britain + Northern Ireland only
            continue
        if any(abs(p[0] - q[0]) < 0.001 and abs(p[1] - q[1]) < 0.002 and metres(p, q) < DEDUPE_METRES for q in seen):
            continue
        seen.append(p)
    return sorted(seen)


def write_out(result: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = {"v": 1, "generatedOn": date.today().isoformat(), "source": "© OpenStreetMap contributors (ODbL)", "chains": dict(sorted(result.items()))}
    OUT.write_text(json.dumps(doc, separators=(",", ":")) + "\n")


BATCH = 3  # chains per Overpass query: six at once timed out on the shared server


def lower_names(names: list[str]) -> set[str]:
    return {n.lower().replace("\u2019", "'") for n in names}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--cache", type=Path, default=Path("/private/tmp/osm-branches-cache"))
    ap.add_argument("--delay", type=float, default=15.0)
    ap.add_argument("--refresh", action="store_true", help="re-query chains that already have branches")
    args = ap.parse_args()
    cfg = json.loads(MATCH.read_text()) if MATCH.exists() else {}
    only = {x for x in args.only.split(",") if x}
    existing = json.loads(OUT.read_text()) if OUT.exists() else {"chains": {}}
    result = existing.get("chains", {})
    plan = []  # (chain, names, kinds, websites)
    notes: dict[str, str] = {}
    for c in chains():
        if only and c["id"] not in only:
            continue
        if not only and not args.refresh and result.get(c["id"]):
            notes[c["id"]] = "(kept from an earlier run)"
            continue
        m = cfg.get(c["id"], {})
        if m.get("skip"):
            notes[c["id"]] = f"skipped: {m['skip']}"
            result.pop(c["id"], None)
            continue
        kinds = {**DEFAULT_KINDS, **m.get("kinds", {})}
        kinds = {k: v for k, v in kinds.items() if v is not None}
        plan.append((c, m.get("names") or sorted({c["name"], *c["aliases"]}), kinds, m.get("websites", []), m.get("note", "")))
    failed: dict[str, str] = {}
    for i in range(0, len(plan), BATCH):
        batch = plan[i:i + BATCH]
        allnames = sorted({n for _, names, _, _, _ in batch for n in names})
        q = build_query(allnames)
        cached = (args.cache / f"{hashlib.sha1(q.encode()).hexdigest()}.json").exists()
        try:
            data = fetch(q, args.cache)
            if "runtime error" in data.get("remark", ""):
                (args.cache / f"{hashlib.sha1(q.encode()).hexdigest()}.json").unlink(missing_ok=True)
                raise RuntimeError(data["remark"])
        except (RuntimeError, urllib.error.HTTPError) as e:
            for c, *_ in batch:
                failed[c["id"]] = str(e)
            print(f"batch {[c['id'] for c, *_ in batch]}: FAILED ({e})", flush=True)
            time.sleep(args.delay * 3)
            continue
        for c, names, kinds, websites, note in batch:
            wanted = lower_names(names)
            mine = [e for e in data.get("elements", [])
                    if e.get("tags", {}).get("name", "").lower().replace("\u2019", "'") in wanted
                    or e.get("tags", {}).get("brand", "").lower().replace("\u2019", "'") in wanted]
            pts = points(mine, kinds, websites)
            result[c["id"]] = [v for p in pts for v in p]
            notes[c["id"]] = note
            print(f"{c['id']}: {len(pts)}", flush=True)
        write_out(result)
        if not cached:
            time.sleep(args.delay)
    lines = ["# Branch counts from OpenStreetMap", "", f"Fetched {date.today().isoformat()} (see tools/branches/fetch_osm_branches.py). Review any count that looks wrong for the chain.", "", "| chain | branches | notes |", "|---|---|---|"]
    for c in chains():
        n = len(result.get(c["id"], [])) // 2
        lines.append(f"| {c['id']} | {n} | {notes.get(c['id'], '')}{' FAILED this run (' + failed[c['id']] + '); rerun to retry' if c['id'] in failed else ''} |")
    write_out(result)
    REPORT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes); {len(failed)} chains failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
