"""Shared helpers for item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4).

Founder's decision (2026-10-06, CLAUDE.md rule 2): an item may show the CHAIN'S OWN photo of it, taken only from the
chain's own official pages or feeds, stored unmodified except for the technical resize/format change done here.
Nothing here crops, recolours, retouches, generates or "improves" a photo, and nothing guesses which photo belongs to
which item: a photo is attached only when the chain's own page ties it to that item by an exact (normalised) name.

An image script (tools/uk_extract/images_<chain>.py) does, for one chain:
    items   = load_items(chain_id)                      # the published rows of data/source/<chain>/items.csv
    raw     = polite_get(photo_url, cache_dir)          # one request per second, robots.txt honoured, never works round a block
    fname   = store_image(chain_id, raw)                # validates, resizes, writes web/public/menu-images/<chain>/<hash>.webp
    rows[item_id] = (fname, page_url)                   # page_url = the chain page that shows this photo for this item
    write_images_csv(chain_id, rows)                    # data/source/<chain>/images.csv; also removes files nothing uses
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGES_ROOT = ROOT / "web" / "public" / "menu-images"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Safari/537.36")
MAX_SIDE = 640            # longest side in pixels; the item page shows it at most ~450 CSS px wide
MIN_SIDE = 200            # smaller than this is an icon/thumbnail, not a photo
MAX_BYTES = 140_000       # the pipeline rejects files over 150,000 bytes
HEADERS = ["item_id", "file", "source_url", "retrieved_on"]


class Blocked(Exception):
    """The site refused us (403/429/robots). Stop and report: we never work round a block."""


# ---------------------------------------------------------------- names

def norm_name(s: str) -> str:
    """Exact-match key for 'does the chain's page entry name this item?': case, accents, punctuation, '&'/'and' and
    spacing are ignored; words are never dropped, reordered or approximated."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().replace("&", " and ").replace("'", "").replace("`", "")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def load_items(chain_id: str) -> list[dict]:
    """The rows of data/source/<chain>/items.csv that are published (not in holdback.csv): id, name, category."""
    folder = ROOT / "data" / "source" / chain_id
    held = set()
    hb = folder / "holdback.csv"
    if hb.exists():
        with open(hb, newline="", encoding="utf-8-sig") as f:
            held = {r["item_id"] for r in csv.DictReader(f)}
    with open(folder / "items.csv", newline="", encoding="utf-8-sig") as f:
        return [r for r in csv.DictReader(f) if r["id"] not in held]


# ---------------------------------------------------------------- fetching

_last_request: dict[str, float] = {}
_robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}


def _robots_allow(url: str) -> bool:
    host = urllib.parse.urlsplit(url)
    key = f"{host.scheme}://{host.netloc}"
    if key not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(f"{key}/robots.txt", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                rp.parse(r.read().decode("utf-8", "replace").splitlines())
            _robots[key] = rp
        except urllib.error.HTTPError as e:
            # RFC 9309: a 4xx for robots.txt (404, 410, a CDN's odd 400...) means "no rules"; 401/403/429 and 5xx we treat
            # conservatively as "do not fetch".
            # An Amazon S3 bucket answers 403 AccessDenied for a robots.txt it simply doesn't have (the bucket is the site's own public
            # image store; the site's own robots.txt is what states its rules). Treated as "no rules" for S3 bucket hosts only.
            s3_missing_file = e.code == 403 and re.search(r"\.s3[.-][a-z0-9-]*\.?amazonaws\.com$", host.netloc) is not None
            _robots[key] = None if s3_missing_file else _deny_all() if e.code in (401, 403, 429) or e.code >= 500 else None
        except Exception:
            _robots[key] = None
    rp = _robots[key]
    return True if rp is None else rp.can_fetch(UA, url)


def _deny_all() -> urllib.robotparser.RobotFileParser:
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(["User-agent: *", "Disallow: /"])
    return rp


def polite_get(url: str, cache_dir: Path, *, delay: float = 1.0, referer: str | None = None, accept: str = "image/*,*/*;q=0.8") -> bytes:
    """GET with a 1 request/second pace per host, a normal browser User-Agent and robots.txt honoured. Bytes are cached
    in `cache_dir` by URL so reruns and spot checks never fetch twice. 403/429/robots refusals raise Blocked."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_dir / hashlib.sha1(url.encode()).hexdigest()
    if cached.exists():
        return cached.read_bytes()
    if not _robots_allow(url):
        raise Blocked(f"robots.txt disallows {url}")
    host = urllib.parse.urlsplit(url).netloc
    wait = _last_request.get(host, 0) + delay - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    headers = {"User-Agent": UA, "Accept": accept}
    if referer:
        headers["Referer"] = referer
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            _last_request[host] = time.monotonic()
            if e.code in (401, 403, 429):
                raise Blocked(f"HTTP {e.code} from {url}") from e
            raise
        except (urllib.error.URLError, OSError):
            # a dropped connection (reset, TLS EOF, timeout), not a refusal: wait and ask again, twice at most, same pace
            _last_request[host] = time.monotonic()
            if attempt == 2:
                raise
            time.sleep(10 * (attempt + 1))
    _last_request[host] = time.monotonic()
    cached.write_bytes(data)
    return data


# ---------------------------------------------------------------- storing

def store_image(chain_id: str, raw: bytes) -> str:
    """Validate the downloaded bytes are a real photo, resize (longest side <= MAX_SIDE, never enlarged), write WebP
    under web/public/menu-images/<chain>/<sha256 of the source bytes, 12 hex>.webp and return the file name. The same
    source photo always gives the same name, so items that share a photo share one file. Raises ValueError for
    anything that is not a usable photo (too small, not an image, would exceed the size cap)."""
    from PIL import Image, ImageOps, UnidentifiedImageError  # pip install pillow (dev tool only)

    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError(f"not an image: {e}") from e
    if im.format not in {"JPEG", "PNG", "WEBP", "MPO"}:
        raise ValueError(f"unsupported image format {im.format}")
    if getattr(im, "n_frames", 1) > 1:
        raise ValueError("animated image")
    im = ImageOps.exif_transpose(im)
    if min(im.size) < MIN_SIDE:
        raise ValueError(f"too small ({im.size[0]}x{im.size[1]}): an icon, not a photo")
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if has_alpha else "RGB")
    name = hashlib.sha256(raw).hexdigest()[:12] + ".webp"
    out_dir = IMAGES_ROOT / chain_id
    out_dir.mkdir(parents=True, exist_ok=True)
    for quality in (74, 66, 58, 50):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=quality, method=6)  # no EXIF/ICC: metadata is not carried over
        if buf.tell() <= MAX_BYTES:
            (out_dir / name).write_bytes(buf.getvalue())
            return name
    raise ValueError("cannot get under the size cap")


# ---------------------------------------------------------------- the CSV

def write_images_csv(chain_id: str, rows: dict[str, tuple[str, str]], retrieved_on: str | None = None, *, prune: bool = True) -> Path:
    """data/source/<chain>/images.csv from {item_id: (file, source_url)}, sorted for stable reruns. With prune, any file
    in web/public/menu-images/<chain>/ that no row uses is deleted (a rerun never leaves junk behind)."""
    folder = ROOT / "data" / "source" / chain_id
    path = folder / "images.csv"
    today = retrieved_on or date.today().isoformat()
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADERS)
        for item_id in sorted(rows):
            fname, src = rows[item_id]
            w.writerow([item_id, fname, src, today])
    if prune:
        used = {fname for fname, _ in rows.values()}
        d = IMAGES_ROOT / chain_id
        if d.is_dir():
            for p in d.iterdir():
                if p.name not in used:
                    p.unlink()
            if not any(d.iterdir()):
                d.rmdir()
    return path


def suspected_placeholders(rows: dict[str, tuple[str, str]], threshold: int = 4) -> dict[str, list[str]]:
    """Files used by `threshold` or more different items. A shared product photo for sizes/variants is normal, but
    the same picture on many unrelated items is usually the site's 'no photo yet' placeholder or a category banner:
    look at each one with your eyes and drop it if it is not a real photo of those items."""
    by_file: dict[str, list[str]] = {}
    for item_id, (fname, _) in rows.items():
        by_file.setdefault(fname, []).append(item_id)
    return {f: ids for f, ids in by_file.items() if len(ids) >= threshold}
