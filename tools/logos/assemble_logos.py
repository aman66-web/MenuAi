#!/usr/bin/env python3
"""Assemble web/lib/mm/logos.ts and web/public/logos/SOURCES.md from the per-chain records next to the logo files.

Each chain has web/public/logos/<id>.source.txt (one `key: value` per line; see docs/UK_DATA_PLAYBOOK.md, Phase 3). This script
  * adds a line to CHAIN_LOGOS for every record with `status: installed` whose `file` exists (the `tile` key picks "dark"; lines already in
    logos.ts are never changed),
  * adds / refreshes one row per record in the SOURCES.md table (rows for records that no longer exist are kept).
Nothing else is touched. Re-runnable. Usage: python3 tools/logos/assemble_logos.py [--check]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOGOS = ROOT / "web" / "public" / "logos"
TS = ROOT / "web" / "lib" / "mm" / "logos.ts"
SOURCES = LOGOS / "SOURCES.md"
EXT_OK = {".svg", ".png", ".jpg", ".jpeg", ".webp"}
BAD_SVG = re.compile(rb"<script|javascript:|onload\s*=|<foreignObject|href\s*=\s*[\"']https?:", re.I)


def read_record(path: Path) -> dict[str, str]:
    rec: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if ": " in line:
            k, v = line.split(": ", 1)
            rec[k.strip()] = v.strip()
    return rec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    ts = TS.read_text(encoding="utf-8")
    existing = set(re.findall(r'^\s*"([a-z0-9-]+)":\s*\{\s*src:', ts, re.M))
    new_lines: dict[str, str] = {}
    rows: dict[str, tuple[str, str, str, str]] = {}
    problems: list[str] = []
    for sc in sorted(LOGOS.glob("*.source.txt")):
        cid = sc.name[: -len(".source.txt")]
        rec = read_record(sc)
        status = rec.get("status", "")
        why = rec.get("why") or rec.get("decision") or ""
        terms = rec.get("terms_url") or "not reviewed"
        rows[cid] = (cid, status, why.replace("|", "/"), terms.replace("|", "/") + "", rec.get("retrieved", ""))
        if status != "installed":
            continue
        f = rec.get("file", "")
        p = LOGOS / f
        if not f or p.suffix.lower() not in EXT_OK or not p.is_file() or not f.startswith(cid + "."):
            problems.append(f"{cid}: record says installed but file {f!r} is missing or misnamed")
            continue
        if p.suffix.lower() == ".svg" and BAD_SVG.search(p.read_bytes()):
            problems.append(f"{cid}: SVG contains script or external references: not installed")
            continue
        if p.stat().st_size > 200_000:
            problems.append(f"{cid}: file larger than 200 KB")
            continue
        if cid in existing:
            continue
        tile = ', tile: "dark"' if rec.get("tile") == "dark" else ""
        new_lines[cid] = f'  "{cid}": {{ src: "/logos/{f}"{tile} }},'

    # insert new lines into the CHAIN_LOGOS block in alphabetical order
    m = re.search(r"(export const CHAIN_LOGOS[^{]*\{\n)(.*?)(\n\};)", ts, re.S)
    assert m, "CHAIN_LOGOS block not found"
    entries = [ln for ln in m.group(2).split("\n") if ln.strip()]
    keyed = {re.match(r'\s*"([a-z0-9-]+)"', ln).group(1): ln for ln in entries}
    keyed.update(new_lines)
    block = "\n".join(keyed[k] for k in sorted(keyed))
    ts_new = ts[: m.start(2)] + block + ts[m.end(2):]

    # SOURCES.md: keep the intro and header, rebuild rows (existing rows for ids without a record are kept)
    md = SOURCES.read_text(encoding="utf-8")
    head, _, table = md.partition("| Chain | Status | Why | Terms page | Retrieved |\n|---|---|---|---|---|\n")
    old_rows = {}
    for ln in table.splitlines():
        if ln.startswith("| "):
            cid = ln[2:].split(" |", 1)[0]
            old_rows[cid] = ln
    for cid, (c, status, why, terms, retrieved) in rows.items():
        if cid in old_rows and not read_record(LOGOS / f"{cid}.source.txt").get("why"):
            continue   # older record without a `why` line: its table row was written by hand, keep it
        old_rows[cid] = f"| {c} | {status} | {why} | {terms} | {retrieved} |"
    md_new = head + "| Chain | Status | Why | Terms page | Retrieved |\n|---|---|---|---|---|\n" + "\n".join(old_rows[k] for k in sorted(old_rows)) + "\n"

    print(f"{len(new_lines)} logo(s) to add: {', '.join(sorted(new_lines)) or '-'}")
    for p in problems:
        print("PROBLEM:", p)
    if not args.check:
        TS.write_text(ts_new, encoding="utf-8")
        SOURCES.write_text(md_new, encoding="utf-8")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
