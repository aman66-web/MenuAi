#!/usr/bin/env python3
"""Download and store the photos a Claude in Chrome read listed for a chain in data/chrome-inbox/<chain>/images.csv.

    python3 tools/uk_extract/inbox_photos.py <chain-id>            # dry run: lists what would be fetched
    python3 tools/uk_extract/inbox_photos.py <chain-id> --apply    # downloads, resizes, stores, writes photos.csv

images.csv has the header `name,page_url,image_url` (or `name,image_url,page_url`): the dish name as the chain's page prints it,
the chain's own page that shows it, and the address of its own photo file. Rules are the same as every other photo
(CLAUDE.md rule 2, tools/uk_extract/images_common.py): the chain's own site/CDN only, robots.txt honoured (RFC 9309), one request per
second per host, a refusal (403/429/robots) stops that host and is reported, never worked round, and the photo is only resized to
<=640 px WebP, never edited. Files go to data/chrome-inbox/<chain>/photos/<hash>.webp and photos.csv records, per photo, the dish name,
the stored file, the source address, the page and the date. Nothing here guesses which photo belongs to which dish: the name comes
from the list. Attaching photos to the published items (matching names to item ids) is the import step that follows
`chrome_import.py`.
"""
from __future__ import annotations

import argparse
import csv
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

INBOX = ic.ROOT / "data" / "chrome-inbox"
FIELDS = ["name", "file", "source_url", "page_url", "retrieved_on", "status"]


def read_list(chain: str) -> list[dict]:
    path = INBOX / chain / "images.csv"
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    need = {"name", "image_url", "page_url"}
    if not rows or not need <= set(rows[0]):
        sys.exit(f"{path}: header must contain {sorted(need)}")
    seen, out = set(), []
    for r in rows:
        key = (r["name"].strip(), r["image_url"].strip())
        if key in seen or not key[0] or not key[1].startswith("https://"):
            continue
        seen.add(key)
        out.append({"name": key[0], "image_url": key[1], "page_url": r["page_url"].strip()})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("chain")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    rows = read_list(args.chain)
    print(f"{args.chain}: {len(rows)} listed photos")
    if not args.apply:
        for r in rows[:5]:
            print("  ", r["name"], "->", r["image_url"])
        print("   ... dry run, nothing fetched (add --apply)")
        return
    ic.IMAGES_ROOT = INBOX                                  # store_image writes <IMAGES_ROOT>/<chain_id>/<hash>.webp
    chain_dir = f"{args.chain}/photos"
    cache = Path(tempfile.gettempdir()) / "mm_inbox_photos" / args.chain
    blocked_hosts: set[str] = set()
    result, stored = [], 0
    today = date.today().isoformat()
    for r in rows:
        host = r["image_url"].split("/")[2]
        status, fname = "", ""
        if host in blocked_hosts:
            status = "skipped: host refused earlier"
        else:
            try:
                raw = ic.polite_get(r["image_url"], cache, referer=r["page_url"] or None)
                fname = ic.store_image(chain_dir, raw)
                status = "stored"
                stored += 1
            except ic.Blocked as e:
                blocked_hosts.add(host)
                status = f"blocked: {e}"
                print("  BLOCKED, stopping this host:", e)
            except Exception as e:  # not a usable photo, network error: recorded, never retried round a refusal
                status = f"not stored: {e}"
        result.append({"name": r["name"], "file": fname, "source_url": r["image_url"], "page_url": r["page_url"],
                       "retrieved_on": today, "status": status})
        if len(result) % 25 == 0:
            print(f"  {len(result)}/{len(rows)} done, {stored} stored")
    with open(INBOX / args.chain / "photos.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(result)
    print(f"{args.chain}: {stored} of {len(rows)} stored in data/chrome-inbox/{args.chain}/photos/; "
          f"the rest are listed with their reason in photos.csv")


if __name__ == "__main__":
    main()
