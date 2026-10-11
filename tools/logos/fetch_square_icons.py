#!/usr/bin/env python3
"""Fetch each published chain's own SQUARE icon from its own website, so every logo tile in the app is a true 1:1 mark.

Founder 2026-10-11: "All logos should be 1:1 too for the app." A logo file is never cropped, padded, stretched, recoloured or redrawn
(CLAUDE.md rule 2), so a wide wordmark can't be made square. What the chain's own site does serve is a square icon: the
`apple-touch-icon`, the icons in its web-app manifest, or an SVG site icon. Those are the chain's own official files (earlier rounds already
used site icons where a chain had no other logo file), so this script fetches the best one, unchanged (a raster larger than 256 px is only
scaled down proportionally, as the playbook allows for logos), into web/public/logos/square/<id>.<ext> with a record <id>.source.txt.

Rules: the chain's own site only (its home page, as recorded in web/public/logos/<id>.source.txt page_url, or the host of its logo file);
robots.txt honoured for the page, the manifest and the icon (RFC 9309 via images_common._robots_allow, which stops on 401/403/429 except an
object store's "missing file" answer); one request per second per host; a 403/429/challenge stops that chain (never worked round).
An icon must be square (within 2%) and at least 120 px (or an SVG with a square viewBox and no script/external references).
Duplicates (the same file for several chains = a platform's default icon) are flagged for the contact sheet, never installed blindly.

    python3 tools/logos/fetch_square_icons.py [--only id,id] [--cache DIR]
Then look at every icon (node web/e2e/square-sheet.mjs) and set `status: rejected` in a record to drop it; assemble_logos.py reads the records.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import urllib.parse
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
import images_common as ic  # noqa: E402

from PIL import Image  # noqa: E402

LOGOS = ROOT / "web" / "public" / "logos"
SQUARE = LOGOS / "square"
MIN_PX = 120
MAX_PX = 256
BAD_SVG = re.compile(rb"<script|javascript:|onload\s*=|<foreignObject|href\s*=\s*[\"']https?:", re.I)
# hosts that are not a chain's own website (menu platforms, file hosts): never used as "the chain's site"
NOT_OWN = re.compile(r"(^cdn\.|cms-assets|b-cdn\.net|webediamovies|tenkites|tkmenus|docs\.google|drive\.google|sanity\.io|amazonaws|cloudfront|flippingbook|issuu|wixstatic|"
                     r"squarespace-cdn|website-files|storyblok|ctfassets|served-app|harlo|ifoodi|smartchef|nutritics|kafoodle|"
                     r"saffronfdh|andithas|digitaloceanspaces|sharepoint|blob\.core\.windows)", re.I)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "link":
            self.links.append({k.lower(): (v or "") for k, v in attrs})


def read_record(path: Path) -> dict[str, str]:
    rec: dict[str, str] = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            if ": " in line:
                k, v = line.split(": ", 1)
                rec[k.strip()] = v.strip()
    return rec


# chains whose records point at a file host rather than their own home page
# (each icon found this way is checked against the chain's logo on the contact sheet before it goes live)
HOME = {
    "be-at-one": "https://www.beatone.co.uk/",
    "bills": "https://bills-website.co.uk/",
    "booths-cafe": "https://www.booths.co.uk/",
    "comptoir-libanais": "https://www.comptoirlibanais.com/",
    "everyman": "https://www.everymancinema.com/",
    "goals-soccer-centres": "https://www.goalsfootball.co.uk/",
    "greene-king": "https://www.greeneking.co.uk/",
    "heritage-pubs": "https://www.heritagepubs.co.uk/",
    "hollywood-bowl": "https://www.hollywoodbowl.co.uk/",
    "jamaica-blue": "https://www.jamaicablue.co.uk/",
    "mildreds": "https://www.mildreds.co.uk/",
    "muffin-break": "https://www.muffinbreak.co.uk/",
    "puccinos": "https://www.puccinos.com/",
    "slug-and-lettuce": "https://www.slugandlettuce.co.uk/",
    "social-pub-and-kitchen": "https://www.socialpubandkitchen.co.uk/",
    "village-hotels": "https://www.village-hotels.co.uk/",
}


def home_for(cid: str) -> str | None:
    """The chain's own site: the logo record's page, else its logo file's host, else its nutrition source's host (if not a platform)."""
    if cid in HOME:
        return HOME[cid]
    rec = read_record(LOGOS / f"{cid}.source.txt")
    for key in ("page_url", "source_url"):
        u = rec.get(key, "")
        if u.startswith("http") and not NOT_OWN.search(urllib.parse.urlsplit(u).netloc):
            p = urllib.parse.urlsplit(u)
            return f"{p.scheme}://{p.netloc}/"
    chain = ROOT / "data" / "source" / cid / "chain.csv"
    if chain.is_file():
        row = next(csv.DictReader(chain.open(encoding="utf-8")), {})
        u = row.get("source_url", "")
        if u.startswith("http") and not NOT_OWN.search(urllib.parse.urlsplit(u).netloc):
            p = urllib.parse.urlsplit(u)
            return f"{p.scheme}://{p.netloc}/"
    return None


def size_of(s: str) -> int:
    m = re.findall(r"(\d+)x(\d+)", s or "")
    return max((min(int(a), int(b)) for a, b in m), default=0)


def candidates(home: str, html: bytes, cache: Path) -> list[tuple[int, str, str]]:
    """(score, url, kind), best first."""
    p = LinkParser()
    try:
        p.feed(html.decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001 - a broken page just gives fewer links
        pass
    out: list[tuple[int, str, str]] = []
    manifest = None
    for ln in p.links:
        rel = ln.get("rel", "").lower().split()
        href = ln.get("href", "").strip()
        if not href or href.startswith("data:"):
            continue
        url = urllib.parse.urljoin(home, href)
        if "apple-touch-icon" in rel or "apple-touch-icon-precomposed" in rel:
            out.append((300 + (size_of(ln.get("sizes", "")) or 180), url, "apple-touch-icon"))
        elif "manifest" in rel:
            manifest = url
        elif "icon" in rel or "shortcut" in rel:
            if url.lower().split("?")[0].endswith(".svg") or "svg" in ln.get("type", ""):
                out.append((250, url, "svg-icon"))
            elif size_of(ln.get("sizes", "")) >= MIN_PX:
                out.append((100 + size_of(ln.get("sizes", "")), url, "icon"))
            elif not ln.get("sizes"):
                out.append((60, url, "icon"))  # size not declared: its real size is checked after download
    if manifest:
        try:
            data = json.loads(ic.polite_get(manifest, cache, accept="application/json,*/*;q=0.5"))
            for icon in data.get("icons", []) if isinstance(data, dict) else []:
                s = size_of(str(icon.get("sizes", "")))
                if s >= MIN_PX and icon.get("src"):
                    purpose = str(icon.get("purpose", ""))
                    out.append((200 + min(s, 512) - (50 if "maskable" in purpose and "any" not in purpose else 0), urllib.parse.urljoin(manifest, icon["src"]), "manifest-icon"))
        except Exception as e:  # noqa: BLE001
            print(f"    manifest unreadable: {e}")
    if not any(k == "apple-touch-icon" for _, _, k in out):
        out.append((150, urllib.parse.urljoin(home, "/apple-touch-icon.png"), "apple-touch-icon (default path)"))
    seen: set[str] = set()
    best = []
    for c in sorted(out, key=lambda x: -x[0]):
        if c[1] not in seen:
            seen.add(c[1])
            best.append(c)
    return best


def check_image(raw: bytes, url: str) -> tuple[str, int, bool] | None:
    """(extension, side, opaque) for a usable square icon, else None."""
    if url.lower().split("?")[0].endswith(".svg") or raw.lstrip()[:5] in (b"<?xml", b"<svg ") or b"<svg" in raw[:400]:
        if BAD_SVG.search(raw):
            return None
        m = re.search(rb'viewBox\s*=\s*["\']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)', raw)
        if not m:
            return None
        w, h = float(m.group(1)), float(m.group(2))
        return ("svg", 512, False) if w > 0 and abs(w - h) / max(w, h) <= 0.02 else None
    try:
        im = Image.open(io.BytesIO(raw))
        if im.format == "ICO":
            im.size = max(im.info.get("sizes", {im.size}))  # the largest image the .ico holds (pixels unchanged)
        im.load()
    except Exception:  # noqa: BLE001
        return None
    w, h = im.size
    if min(w, h) < MIN_PX or abs(w - h) / max(w, h) > 0.02:
        return None
    rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A")
    # opaque = the icon fills its square (an app-icon style tile): shown edge to edge; otherwise it sits on our plain tile
    opaque = alpha.getextrema()[0] >= 250 or sum(alpha.histogram()[:200]) < 0.02 * w * h
    return ("png", min(w, MAX_PX), opaque)


def save(cid: str, raw: bytes, kind: tuple[str, int, bool]) -> tuple[str, bytes]:
    ext, side, _ = kind
    if ext == "svg":
        data = raw
    else:
        im = Image.open(io.BytesIO(raw))
        if im.format == "ICO":
            im.size = max(im.info.get("sizes", {im.size}))
        im = im.convert("RGBA")
        if im.size[0] > MAX_PX:
            im = im.resize((MAX_PX, MAX_PX), Image.LANCZOS)  # proportional (square stays square): the only change allowed
        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
        data = buf.getvalue()
    SQUARE.mkdir(parents=True, exist_ok=True)
    name = f"{cid}.{ext}"
    (SQUARE / name).write_bytes(data)
    return name, data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--cache", default=str(ROOT / ".." / "square-icon-cache"))
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    chains = sorted(d.name for d in (ROOT / "data" / "source").iterdir() if (d / "chain.csv").is_file() and d.name not in ("_template", "cluck-house", "bowl-and-co"))
    if args.only:
        chains = [c for c in chains if c in args.only.split(",")]
    hashes: dict[str, list[str]] = {}
    summary = {"installed": 0, "none": 0, "blocked": 0, "no-site": 0}
    for cid in chains:
        rec_path = SQUARE / f"{cid}.source.txt"
        if read_record(rec_path).get("status") in ("installed", "rejected"):
            print(f"{cid}: already decided, skipped")
            continue
        home = home_for(cid)
        if not home:
            print(f"{cid}: no own website known")
            summary["no-site"] += 1
            continue
        print(f"{cid}: {home}")
        try:
            html = ic.polite_get(home, cache, accept="text/html,application/xhtml+xml")
        except ic.Blocked as e:
            print(f"    blocked: {e}")
            summary["blocked"] += 1
            write_record(rec_path, status="skipped-unavailable", why=f"home page refused or robots.txt disallows: {e}", page_url=home)
            continue
        except Exception as e:  # noqa: BLE001
            print(f"    unreachable: {e}")
            summary["blocked"] += 1
            continue
        done = False
        for score, url, kind in candidates(home, html, cache):
            try:
                raw = ic.polite_get(url, cache)
            except ic.Blocked as e:
                print(f"    {kind} blocked: {e}")
                continue
            except Exception:  # noqa: BLE001 - a 404 default path etc.
                continue
            info = check_image(raw, url)
            if not info:
                print(f"    {kind} not square / too small: {url}")
                continue
            name, data = save(cid, raw, info)
            digest = hashlib.sha256(data).hexdigest()
            hashes.setdefault(digest, []).append(cid)
            write_record(rec_path, status="installed", file=name, kind=kind, opaque="yes" if info[2] else "no", source_url=url, page_url=home,
                         why=f"the chain's own {kind}, declared by its home page {home}; saved unchanged" + (" (scaled down proportionally to 256 px)" if info[0] == "png" and info[1] >= MAX_PX else "")
                         + (" (the largest image in its .ico, stored as PNG, pixels unchanged)" if raw[:4] == b"\x00\x00\x01\x00" else ""),
                         sha256=digest, retrieved=date.today().isoformat())
            print(f"    installed {name} ({kind}, opaque={info[2]})")
            summary["installed"] += 1
            done = True
            break
        if not done:
            summary["none"] += 1
            write_record(rec_path, status="skipped-unavailable", why="no square icon of 120 px or more (or an SVG with a square viewBox) declared by the home page", page_url=home)
    dups = {h: ids for h, ids in hashes.items() if len(ids) > 1}
    for ids in dups.values():
        print(f"DUPLICATE icon for {', '.join(ids)}: look at it on the contact sheet (a platform default is rejected)")
    print(summary)
    return 0


def write_record(path: Path, **kv: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(f"{k}: {v}\n" for k, v in kv.items()), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
