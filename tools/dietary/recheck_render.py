#!/usr/bin/env python3
"""Second pass of the halal re-check: pages whose words are built by JavaScript are rendered in headless Chromium.

    python3 tools/dietary/recheck_render.py --static DIR --sites targets.json --out DIR2 [--only a,b] [--conc 4]

Uses the pages the plain crawl (recheck_halal.py) found, renders the start page and the best FAQ / halal / dietary pages, reads the links of
the rendered page for more of the same kind, and renders those too. robots.txt (RFC 9309, a 4xx answer = no rules) is checked here for every
page BEFORE it is given to the browser; a page that answers 401/403/429 or shows a bot check stops that chain. Nothing is clicked except
closed FAQ items on the page itself.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "dietary"))
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
import recheck_halal as rh  # noqa: E402
import robots_rfc  # noqa: E402


def allowed(url: str, cache: dict) -> bool:
    p = urllib.parse.urlsplit(url)
    origin = f"{p.scheme}://{p.netloc}"
    if origin not in cache:
        rules, note = rh.robots_for(origin)
        cache[origin] = (rules, note)
    rules, note = cache[origin]
    if note.startswith(("UNREACHABLE", "robots 401", "robots 429", "robots 5")):
        return False
    return robots_rfc.allowed(rules, p.path + ("?" + p.query if p.query else ""))


def run_node(jobs: list[dict], out: Path, conc: int) -> list[dict]:
    jf = out.with_suffix(".jobs.json")
    jf.write_text(json.dumps(jobs))
    subprocess.run(["node", str(ROOT / "tools" / "dietary" / "render_pages.mjs"), str(jf), str(out), str(conc)], check=False)
    return json.loads(out.read_text()) if out.exists() else []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--static", required=True)
    ap.add_argument("--sites", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--conc", type=int, default=4)
    ap.add_argument("--first", type=int, default=5, help="pages from the plain crawl to render, besides the start page")
    ap.add_argument("--second", type=int, default=4, help="pages found by links of the rendered pages")
    ap.add_argument("--resume", action="store_true", help="use an existing pass1.json instead of rendering pass 1 again")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    sites = json.loads(Path(a.sites).read_text())
    chains = [c for c in a.only.split(",") if c] or list(sites)
    rcache: dict = {}
    jobs1: list[dict] = []
    for c in chains:
        start = sites[c][0]
        urls = [start]
        sj = Path(a.static) / f"{c}.json"
        if sj.exists():
            r = json.loads(sj.read_text())
            cand = [(rh.score(p["url"]), p["url"]) for p in r.get("pages", []) if p.get("status") == 200 and p["url"] != start]
            cand.sort(key=lambda t: -t[0])
            urls += [u for s, u in cand if s >= 30][: a.first]
        for u in sites[c][1:]:
            if u not in urls:
                urls.append(u)
        for u in dict.fromkeys(urls):
            if allowed(u, rcache):
                jobs1.append({"chain": c, "url": u})
    print(f"pass 1: {len(jobs1)} pages for {len(chains)} chains", flush=True)
    res1 = json.loads((out / "pass1.json").read_text()) if (a.resume and (out / "pass1.json").exists()) else run_node(jobs1, out / "pass1.json", a.conc)
    seen = {(r["chain"], r["url"]) for r in res1} | {(r["chain"], r.get("finalUrl")) for r in res1}
    jobs2: list[dict] = []
    per: dict[str, int] = {}
    cands: list[tuple[int, str, str]] = []
    stopped = {r["chain"] for r in res1 if r.get("blocked")}
    for r in res1:
        if r["chain"] in stopped or not r.get("links"):
            continue
        reg = rh.registrable(urllib.parse.urlsplit(sites[r["chain"]][0]).netloc)
        for href, txt in r["links"]:
            if not isinstance(href, str) or not isinstance(txt, str):
                continue  # an SVG <a> gives an object, not an address
            u = href.split("#")[0]
            pu = urllib.parse.urlsplit(u)
            if pu.scheme not in ("http", "https") or rh.registrable(pu.netloc) != reg:
                continue
            if rh.SKIP_EXT.search(pu.path) and not pu.path.lower().endswith(".pdf"):
                continue
            sc = rh.score(u, txt)
            if sc >= 60 and (r["chain"], u) not in seen:
                cands.append((sc, r["chain"], u))
    cands.sort(key=lambda t: -t[0])
    for sc, c, u in cands:
        if (c, u) in seen or per.get(c, 0) >= a.second:
            continue
        if u.lower().split("?")[0].endswith(".pdf"):
            continue  # PDFs are read by the plain crawl, not rendered
        if allowed(u, rcache):
            seen.add((c, u))
            per[c] = per.get(c, 0) + 1
            jobs2.append({"chain": c, "url": u})
    print(f"pass 2: {len(jobs2)} pages", flush=True)
    res2 = run_node(jobs2, out / "pass2.json", a.conc) if jobs2 else []
    (out / "ALL.json").write_text(json.dumps(res1 + res2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
