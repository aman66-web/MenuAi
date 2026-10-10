#!/usr/bin/env python3
"""Download the chains' own nutrition PDFs listed in data/held-downloads/pdf_list.csv (founder's go-ahead 2026-10-10, "yes, all listed").

    python3 tools/uk_extract/inbox_pdfs.py            # dry run: lists what would be fetched
    python3 tools/uk_extract/inbox_pdfs.py --apply    # downloads into data/held-downloads/<chain>/<file>, writes downloads.csv per chain

pdf_list.csv header: chain,filename,url,what. Same rules as every other fetch (tools/uk_extract/images_common.py): the chain's own site/CDN
only, robots.txt honoured (RFC 9309 matcher), one request per second per host, a refusal (403/429/robots) is recorded and never worked
round, nothing is converted. A file is kept only if it starts with %PDF. The cloud session reads the PDFs afterwards.
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

ROOT = ic.ROOT / "data" / "held-downloads"
FIELDS = ["filename", "url", "what", "retrieved_on", "bytes", "status"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--chain", help="only this chain id")
    args = ap.parse_args()
    with open(ROOT / "pdf_list.csv", newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if not args.chain or r["chain"] == args.chain]
    print(f"{len(rows)} files listed")
    if not args.apply:
        for r in rows:
            print("  ", r["chain"], r["filename"], "<-", r["url"])
        print("   ... dry run, nothing fetched (add --apply)")
        return
    cache = Path(tempfile.gettempdir()) / "mm_inbox_pdfs"
    blocked_hosts: set[str] = set()
    results: dict[str, list[dict]] = {}
    today = date.today().isoformat()
    for r in rows:
        host = r["url"].split("/")[2]
        status, size = "", 0
        out = ROOT / r["chain"] / r["filename"]
        if host in blocked_hosts:
            status = "skipped: host refused earlier"
        else:
            try:
                raw = ic.polite_get(r["url"], cache, accept="application/pdf,*/*;q=0.8")
                if not raw.startswith(b"%PDF"):
                    status = "not stored: the address did not return a PDF"
                else:
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(raw)
                    size, status = len(raw), "stored"
            except ic.Blocked as e:
                blocked_hosts.add(host)
                status = f"blocked: {e}"
            except Exception as e:  # network error or HTTP 404: recorded, not retried round a refusal
                status = f"not stored: {e}"
        print(f"  {r['chain']}/{r['filename']}: {status}" + (f" ({size // 1024} KB)" if size else ""))
        results.setdefault(r["chain"], []).append({"filename": r["filename"], "url": r["url"], "what": r.get("what", ""),
                                                   "retrieved_on": today, "bytes": size or "", "status": status})
    for chain, items in results.items():
        (ROOT / chain).mkdir(parents=True, exist_ok=True)
        with open(ROOT / chain / "downloads.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(items)


if __name__ == "__main__":
    main()
