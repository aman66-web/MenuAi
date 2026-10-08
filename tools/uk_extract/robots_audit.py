#!/usr/bin/env python3
"""Check every published chain's source address against its host's robots.txt (RFC 9309 matching, see robots_rfc.py).

Usage: python3 tools/uk_extract/robots_audit.py
Reads data/source/*/chain.csv (source_url) and allergen_guide.csv (url). Prints the addresses a crawler must not fetch, and the hosts whose
robots.txt could not be read (403/5xx/network: look at those by hand). Run it after adding chains. A chain listed as disallowed must not be
published: move it to data/held-robots/ (see the README there).
"""
from __future__ import annotations

import csv
import glob
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import robots_rfc  # noqa: E402

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    by_host: dict[str, list[tuple[str, str]]] = {}
    for f in glob.glob(str(ROOT / "data" / "source" / "*" / "chain.csv")) + glob.glob(str(ROOT / "data" / "source" / "*" / "allergen_guide.csv")):
        chain = Path(f).parent.name
        with open(f, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                u = r.get("source_url") or r.get("url") or ""
                if u.startswith("http") and "example.com" not in u:
                    by_host.setdefault(urllib.parse.urlsplit(u).netloc, []).append((chain, u))
    bad, unreadable = [], []
    for host in sorted(by_host):
        try:
            req = urllib.request.Request(f"https://{host}/robots.txt", headers={"User-Agent": UA})
            rules = robots_rfc.parse(urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429) or e.code >= 500:
                unreadable.append((host, e.code, sorted({c for c, _ in by_host[host]})[:4]))
            continue  # other 4xx: no rules
        except Exception as e:  # network trouble
            unreadable.append((host, str(e)[:40], sorted({c for c, _ in by_host[host]})[:4]))
            continue
        for chain, u in by_host[host]:
            p = urllib.parse.urlsplit(u)
            if not robots_rfc.allowed(rules, p.path + ("?" + p.query if p.query else "")):
                bad.append((chain, u))
    print("Disallowed by robots.txt:" if bad else "No source address is disallowed by its host's robots.txt.")
    for chain, u in sorted(bad):
        print(f"  {chain}  {u}")
    if unreadable:
        print("robots.txt not readable (check by hand):")
        for host, why, chains in unreadable:
            print(f"  {host}  ({why})  {', '.join(chains)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
