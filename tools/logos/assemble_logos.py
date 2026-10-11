#!/usr/bin/env python3
"""Assemble web/lib/mm/logos.ts and web/public/logos/SOURCES.md from the per-chain records next to the logo files.

Each chain has web/public/logos/<id>.source.txt (one `key: value` per line; see docs/UK_DATA_PLAYBOOK.md, Phase 3). This script
  * adds a line to CHAIN_LOGOS for every record with `status: installed` whose `file` exists (the `tile` key picks "dark"; lines already in
    logos.ts are never changed),
  * adds / refreshes one row per record in the SOURCES.md table (rows for records that no longer exist are kept).
It also rebuilds the SQUARE_ICONS block of logos.ts and web/public/logos/square/SOURCES.md from web/public/logos/square/<id>.source.txt
(written by fetch_square_icons.py; `status: rejected` after looking at the contact sheet drops one). Each square icon is shown `full`
(edge to edge) when its own pixels fill the square, otherwise on the plain tile, "dark" when its visible pixels are mostly light;
a record's `display: full|tile` and `tile: light|dark` lines override that (SVGs default to the light tile).
Nothing else is touched. Re-runnable. Usage: python3 tools/logos/assemble_logos.py [--check]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOGOS = ROOT / "web" / "public" / "logos"
SQUARE = LOGOS / "square"
SHOPS = LOGOS / "shops"
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


def square_display(path: Path, rec: dict[str, str]) -> tuple[bool, str]:
    """(full, tile) for a square icon: full when its own opaque pixels fill the square; a light mark on transparency sits on the dark tile."""
    full, tile = False, "light"
    if path.suffix.lower() == ".png":
        from PIL import Image
        im = Image.open(path).convert("RGBA")
        w, h = im.size
        alpha = im.getchannel("A")
        solid = sum(alpha.histogram()[250:]) / (w * h)
        box = alpha.point(lambda a: 255 if a > 16 else 0).getbbox() or (0, 0, 0, 0)
        full = solid >= 0.9 and (box[2] - box[0]) >= 0.97 * w and (box[3] - box[1]) >= 0.97 * h
        if not full:
            grey = im.convert("L")
            mask = alpha.point(lambda a: 255 if a > 128 else 0)
            hist = grey.histogram(mask=mask)
            n = sum(hist)
            if n and sum(i * c for i, c in enumerate(hist)) / n > 240:  # a white mark on transparency (a light badge stays on white)
                tile = "dark"
    if rec.get("display") in ("full", "tile"):
        full = rec["display"] == "full"
    if rec.get("tile") in ("light", "dark"):
        tile = rec["tile"]
    return full, tile


def assemble_square(ts: str, problems: list[str]) -> tuple[str, str, int]:
    """New logos.ts text with a rebuilt SQUARE_ICONS block, the square/SOURCES.md text, and how many icons are listed."""
    lines: list[str] = []
    rows: list[str] = []
    for sc in sorted(SQUARE.glob("*.source.txt")):
        cid = sc.name[: -len(".source.txt")]
        rec = read_record(sc)
        status = rec.get("status", "")
        why = (rec.get("why") or "").replace("|", "/")
        rows.append(f"| {cid} | {status} | {rec.get('kind', '')} | {rec.get('source_url', '').replace('|', '/')} | {why} | {rec.get('retrieved', '')} |")
        if status != "installed":
            continue
        f = rec.get("file", "")
        p = SQUARE / f
        if not f or p.suffix.lower() not in (".svg", ".png") or not p.is_file() or not f.startswith(cid + "."):
            problems.append(f"square {cid}: record says installed but file {f!r} is missing or misnamed")
            continue
        if p.suffix.lower() == ".svg" and BAD_SVG.search(p.read_bytes()):
            problems.append(f"square {cid}: SVG contains script or external references: not installed")
            continue
        if p.stat().st_size > 100_000:
            problems.append(f"square {cid}: file larger than 100 KB")
            continue
        full, tile = square_display(p, rec)
        extra = (", full: true" if full else "") + (', tile: "dark"' if tile == "dark" and not full else "")
        lines.append(f'  "{cid}": {{ src: "/logos/square/{f}"{extra} }},')
    m = re.search(r"(export const SQUARE_ICONS[^{]*\{\n)(.*?)(\n?\};)", ts, re.S)
    assert m, "SQUARE_ICONS block not found"
    ts_new = ts[: m.start(2)] + "\n".join(lines) + ("" if m.group(3).startswith("\n") else "\n") + ts[m.end(2):] if lines else ts[: m.start(2)] + ts[m.end(2):]
    md = ("# Square icons\n\nEach chain's own square icon (apple-touch-icon, web-app manifest icon or SVG site icon) as its own website serves it, "
          "saved unchanged (a raster over 256 px only scaled down proportionally), fetched by `tools/logos/fetch_square_icons.py` with robots.txt "
          "honoured. Shown in the app's square logo tiles in preference to the wide logo file (founder 2026-10-11: \"All logos should be 1:1\"). "
          "Same terms and take-down rule as the logos in `../SOURCES.md`. `rejected` = looked at on the contact sheet and left out (a platform's "
          "default icon, a different mark, unreadable at tile size).\n\n"
          "| Chain | Status | Kind | Source | Why | Retrieved |\n|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n")
    return ts_new, md, len(lines)


def assemble_shops(ts: str, problems: list[str]) -> tuple[str, str, int]:
    """New logos.ts text with a rebuilt SHOP_LOGOS block (supermarkets: public/logos/shops/), the shops' SOURCES.md, and how many are listed."""
    lines: list[str] = []
    rows: list[str] = []
    ids = sorted({sc.name[: -len(".source.txt")] for sc in SHOPS.glob("*.source.txt")} | {sc.name[: -len(".source.txt")] for sc in (SHOPS / "square").glob("*.source.txt")})
    for sid in ids:
        rec = read_record(SHOPS / f"{sid}.source.txt") if (SHOPS / f"{sid}.source.txt").is_file() else {}
        sq = read_record(SHOPS / "square" / f"{sid}.source.txt") if (SHOPS / "square" / f"{sid}.source.txt").is_file() else {}
        for kind, r, folder in (("logo", rec, SHOPS), ("square icon", sq, SHOPS / "square")):
            if r:
                rows.append(f"| {sid} | {kind} | {r.get('status', '')} | {(r.get('why') or '').replace('|', '/')} | {(r.get('terms_url') or 'not reviewed').replace('|', '/')} | {r.get('retrieved', '')} |")
        def ok(r: dict[str, str], folder: Path, limit: int) -> Path | None:
            if r.get("status") != "installed":
                return None
            f = folder / r.get("file", "")
            if not r.get("file") or f.suffix.lower() not in EXT_OK or not f.is_file() or not r["file"].startswith(sid + "."):
                problems.append(f"shop {sid}: record says installed but file {r.get('file')!r} is missing or misnamed")
                return None
            if f.suffix.lower() == ".svg" and BAD_SVG.search(f.read_bytes()):
                problems.append(f"shop {sid}: SVG contains script or external references: not installed")
                return None
            if f.stat().st_size > limit:
                problems.append(f"shop {sid}: file larger than {limit // 1000} KB")
                return None
            return f
        main_f = ok(rec, SHOPS, 200_000)
        sq_f = ok(sq, SHOPS / "square", 100_000)
        if not main_f and not sq_f:
            continue
        parts = []
        if main_f:
            parts.append(f'src: "/logos/shops/{main_f.name}"' + (', tile: "dark"' if rec.get("tile") == "dark" else ""))
        if sq_f:
            full, tile = square_display(sq_f, sq)
            sqs = f'src: "/logos/shops/square/{sq_f.name}"' + (", full: true" if full else "") + (', tile: "dark"' if tile == "dark" and not full else "")
            if not main_f:
                parts.append(f'src: "/logos/shops/square/{sq_f.name}"')
            parts.append(f"square: {{ {sqs} }}")
        lines.append(f'  "{sid}": {{ {", ".join(parts)} }},')
    m = re.search(r"(export const SHOP_LOGOS[^{]*\{\n)(.*?)(\n?\};)", ts, re.S)
    assert m, "SHOP_LOGOS block not found"
    ts_new = ts[: m.start(2)] + "\n".join(lines) + ("" if m.group(3).startswith("\n") else "\n") + ts[m.end(2):] if lines else ts[: m.start(2)] + ts[m.end(2):]
    md = ("# Supermarket logos\n\nEach supermarket's own logo (and its own square icon where one of its sites serves one), saved as its own website serves it "
          "(founder 2026-10-11: \"Add all logos for grocery stores too\"). Same rules and take-down promise as the restaurant logos in `../SOURCES.md`.\n\n"
          "| Shop | File | Status | Why | Terms page | Retrieved |\n|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n")
    return ts_new, md, len(lines)


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

    ts_new, square_md, n_square = assemble_square(ts_new, problems)
    ts_new, shops_md, n_shops = assemble_shops(ts_new, problems)

    print(f"{len(new_lines)} logo(s) to add: {', '.join(sorted(new_lines)) or '-'}")
    print(f"{n_square} square icon(s) listed")
    print(f"{n_shops} supermarket logo(s) listed")
    for p in problems:
        print("PROBLEM:", p)
    if not args.check:
        TS.write_text(ts_new, encoding="utf-8")
        SOURCES.write_text(md_new, encoding="utf-8")
        if SQUARE.is_dir():
            (SQUARE / "SOURCES.md").write_text(square_md, encoding="utf-8")
        if SHOPS.is_dir():
            (SHOPS / "SOURCES.md").write_text(shops_md, encoding="utf-8")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
