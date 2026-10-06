#!/usr/bin/env python3
"""Take item photos from menu pages the founder saved in their own browser (for chains whose sites refuse automated visits).

    python3 tools/uk_extract/images_from_saved_page.py <chain-id> saved-pages/<chain-id>            # dry run: lists every match
    python3 tools/uk_extract/images_from_saved_page.py <chain-id> saved-pages/<chain-id> --apply    # stores photos + images.csv

or, from a list Claude in Chrome (running in the founder's own browser) wrote while looking at the chain's menu pages:

    python3 tools/uk_extract/images_from_saved_page.py <chain-id> --list saved-pages/<chain-id>.csv           # dry run
    python3 tools/uk_extract/images_from_saved_page.py <chain-id> --list saved-pages/<chain-id>.csv --apply   # downloads + stores

The list is a CSV with the header `name,image_url,page_url`: the item name exactly as the page prints it, the address of that
item's own photo file, and the address of the menu page it was on (https). Each photo is then downloaded politely (robots.txt
honoured; a refusal from the image host stops that photo, it is never worked around) and attached under the same exact-name rule.

How to save a page (Chrome): open the chain's menu page, scroll to the bottom so every photo loads, File > Save Page As >
"Webpage, Complete". That writes `Page.html` and a `Page_files` folder next to it; put both in saved-pages/<chain-id>/.

Rules (docs/UK_DATA_PLAYBOOK.md Phase 4, CLAUDE.md rule 2): the photo comes from the chain's own page (the address Chrome
records in the saved file becomes source_url); it is attached to an item ONLY when the page itself names that item exactly
(the <img alt>, or the single heading inside the same one-photo card, equals the item name once case, accents, punctuation
and "&"/"and" are ignored). Ambiguous names (two different photos for one name, or one name matching two items) get no photo.
Photos are resized to <=640 px WebP and never edited. Sizes of one product that share a card/photo each get the photo only if
the page names each size exactly. The saved pages themselves are not committed (saved-pages/ is git-ignored).
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
import tenkites_c as tk  # noqa: E402  (its small HTML parser is reused)

SAVED_FROM = re.compile(r"saved from url=\(\d+\)(\S+)")
HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


def local_file(page_dir: Path, src: str) -> Path | None:
    """The saved copy of an image: relative paths into the *_files folder only (a remote URL was not saved)."""
    if not src or src.startswith(("http://", "https://", "data:", "//")):
        return None
    p = (page_dir / urllib.parse.unquote(src.split("?")[0].split("#")[0])).resolve()
    return p if p.is_file() and page_dir.resolve() in p.parents else None


def best_src(img, page_dir: Path) -> Path | None:
    cands = []
    srcset = img.attrs.get("srcset", "")
    for part in [p.strip() for p in srcset.split(",") if p.strip()]:
        url = part.split()[0]
        f = local_file(page_dir, url)
        if f:
            cands.append(f)
    f = local_file(page_dir, img.attrs.get("src", ""))
    if f:
        cands.append(f)
    return max(cands, key=lambda p: p.stat().st_size, default=None)


def names_for(img) -> list[str]:
    """What the page itself calls this photo: its alt text, and the one heading in its one-photo card."""
    names = []
    if img.attrs.get("alt", "").strip():
        names.append(img.attrs["alt"].strip())
    node = img.parent
    for _ in range(5):
        if node is None:
            break
        imgs = [n for n in node.iter() if n.tag == "img"]
        heads = [n for n in node.iter() if n.tag in HEADINGS and n.text().strip()]
        if len(imgs) == 1 and len(heads) == 1:
            names.append(heads[0].text().strip())
            break
        if len(imgs) > 1:
            break  # a wider block holding several photos: not one product's card
        node = node.parent
    return names


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chain")
    ap.add_argument("folder", type=Path, nargs="?")
    ap.add_argument("--list", type=Path, help="CSV name,image_url,page_url written by Claude in Chrome")
    ap.add_argument("--cache", type=Path, default=Path("/private/tmp/photo-list-cache"))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if bool(args.folder) == bool(args.list):
        raise SystemExit("give either a folder of saved pages or --list FILE.csv")
    items = ic.load_items(args.chain)
    by_name: dict[str, list[dict]] = defaultdict(list)
    for it in items:
        by_name[ic.norm_name(it["name"])].append(it)

    pages = sorted(args.folder.glob("*.htm*")) if args.folder else []
    if args.folder and not pages:
        raise SystemExit(f"no saved .html page in {args.folder}")
    found: dict[str, dict[str, tuple[Path, str]]] = defaultdict(dict)  # norm name -> {file key: (path or url, page url)}
    if args.list:
        import csv
        with open(args.list, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                key = ic.norm_name(r.get("name", ""))
                url, page = (r.get("image_url") or "").strip(), (r.get("page_url") or "").strip()
                if key in by_name and url.startswith("https://") and page.startswith("https://"):
                    found[key][url] = (url, page)  # type: ignore[assignment]
    for page in pages:
        text = page.read_text(encoding="utf-8", errors="replace")
        m = SAVED_FROM.search(text[:2000])
        page_url = m.group(1) if m and m.group(1).startswith("https://") else ""
        root = tk.parse_html(text)
        for img in [n for n in root.iter() if n.tag == "img"]:
            f = best_src(img, page.parent)
            if f is None:
                continue
            for name in names_for(img):
                key = ic.norm_name(name)
                if key in by_name:
                    found[key][str(f)] = (f, page_url)

    rows: dict[str, tuple[str, str]] = {}
    skipped = []
    for key, files in found.items():
        targets = by_name[key]
        if len(files) != 1:
            skipped.append(f"{targets[0]['name']!r}: {len(files)} different photos on the page(s): ambiguous")
            continue
        if len(targets) != 1:
            skipped.append(f"{targets[0]['name']!r}: {len(targets)} items share this name: ambiguous")
            continue
        (path, page_url), = files.values()
        if isinstance(path, str):  # a list row: the photo is downloaded now (politely), the page address is the list's
            try:
                raw = ic.polite_get(path, args.cache, referer=page_url) if args.apply else b""
            except ic.Blocked as e:
                skipped.append(f"{targets[0]['name']!r}: {e}")
                continue
            except Exception as e:  # noqa: BLE001  (network error: skip this photo, keep going)
                skipped.append(f"{targets[0]['name']!r}: could not download ({e})")
                continue
            try:
                fname = ic.store_image(args.chain, raw) if args.apply else path.rsplit("/", 1)[-1]
            except ValueError as e:
                skipped.append(f"{targets[0]['name']!r}: photo unusable ({e})")
                continue
            rows[targets[0]["id"]] = (fname, page_url)
            continue
        if not page_url:
            skipped.append(f"{targets[0]['name']!r}: the saved page doesn't record its address (save with Chrome 'Webpage, Complete')")
            continue
        try:
            fname = ic.store_image(args.chain, path.read_bytes()) if args.apply else path.name
        except ValueError as e:
            skipped.append(f"{targets[0]['name']!r}: {path.name} unusable ({e})")
            continue
        rows[targets[0]["id"]] = (fname, page_url)

    print(f"{len(rows)} of {len(items)} items matched exactly by name")
    for item_id, (fname, url) in sorted(rows.items()):
        print(f"  {item_id:50s} {fname}  <- {url}")
    for s in skipped:
        print("  skipped:", s)
    shared = ic.suspected_placeholders(rows)
    for f, ids in shared.items():
        print(f"  CHECK by eye: {f} is used by {len(ids)} items ({', '.join(ids[:4])}...): a placeholder or banner?")
    if not args.apply:
        print("dry run: nothing written. Re-run with --apply after looking at the matches.")
        return 0
    existing: dict[str, tuple[str, str]] = {}
    csv_path = ic.ROOT / "data" / "source" / args.chain / "images.csv"
    if csv_path.exists():
        import csv
        with open(csv_path, newline="", encoding="utf-8") as fh:
            existing = {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(fh)}
    existing.update(rows)
    ic.write_images_csv(args.chain, existing)
    print(f"wrote {csv_path} ({len(existing)} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
