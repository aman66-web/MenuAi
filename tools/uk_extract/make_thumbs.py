"""Small copies of the chains' own dish photos, for the 56 px tiles in lists.

Founder 2026-11-17: "when the user downloads the app it shouldn't use excessive storage". A list tile is 56 px, but the full photo
(web/public/menu-images/<chain>/<hash>.webp, written by images_common.store_image) is up to 640 px, so every tile used to fetch the
whole file and the iPhone app kept it in its cache. This writes, for every full photo,

    web/public/menu-images/thumbs/<chain>/<hash>.webp      THUMB_SIDE px on its shortest side (smaller photos are copied unchanged)

The picture is only made smaller (CLAUDE.md rule 2: resized, never cropped, recoloured, retouched or edited): Pillow's proportional
`thumbnail` resize, then WebP at quality THUMB_QUALITY with no metadata. A photo that is already that small is copied byte for byte,
and so is one whose small copy would come out bigger than the photo itself. The app (web/lib/mm/images.ts itemThumbUrl,
ItemThumb) asks for the small copy first and falls back to the full photo, then to its plain tile, so a missing small copy never
hides a photo: it only costs bytes.

Reruns are cheap: a small copy newer than its full photo is left alone, and one whose full photo is gone is deleted (with its folder
once empty). "thumbs" can therefore never be a chain id: the script stops if data/source/thumbs exists.

Run after any photo job (tools/uk_extract/images_<chain>.py) and before publishing:
    python3 tools/uk_extract/make_thumbs.py            # make, refresh and tidy; prints counts and sizes
    python3 tools/uk_extract/make_thumbs.py --check    # change nothing; exit 1 if any small copy is missing, old or orphaned
"""
from __future__ import annotations

import argparse
import io
import os
import re
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMAGES_ROOT = ROOT / "web" / "public" / "menu-images"
SOURCE_ROOT = ROOT / "data" / "source"
THUMBS = "thumbs"          # the folder under menu-images/ that holds the small copies; never a chain id
THUMB_SIDE = 168           # SHORT side in pixels: a 56 px tile on a 3x iPhone is 168 device pixels, so a wide photo isn't stretched (founder 2026-11-17: sharp on the phone)
THUMB_QUALITY = 78
CHAIN_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")        # tools/build_menus.py ID_RE
FILE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$")   # tools/build_menus.py IMAGE_FILE_RE


@dataclass
class Report:
    made: int = 0          # no small copy before
    refreshed: int = 0     # the full photo was newer
    up_to_date: int = 0
    copied: int = 0        # of made + refreshed: the full photo's own bytes (already small, or smaller than a re-encode)
    deleted: int = 0       # small copies whose full photo is gone
    errors: list[str] = field(default_factory=list)
    stale: list[str] = field(default_factory=list)   # --check: what a real run would change


def thumb_bytes(full: bytes) -> tuple[bytes, bool]:
    """The small copy of one full photo, and whether it is the photo's own bytes unchanged."""
    with Image.open(io.BytesIO(full)) as im:
        im.load()
        if min(im.size) <= THUMB_SIDE:
            return full, True
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        small = im.convert("RGBA" if has_alpha else "RGB")
        scale = THUMB_SIDE / min(small.size)
        small = small.resize((max(1, round(small.width * scale)), max(1, round(small.height * scale))), Image.LANCZOS)  # proportional: never cropped or stretched
        buf = io.BytesIO()
        small.save(buf, "WEBP", quality=THUMB_QUALITY, method=6)  # no EXIF/ICC carried over
    out = buf.getvalue()
    return (full, True) if len(out) >= len(full) else (out, False)


def write_atomic(path: Path, data: bytes, not_before: float) -> None:
    """Write then rename, so the website never serves a half-written file. Same bytes: only the date is touched. The file's
    date ends up no earlier than `not_before` (its full photo's), so the next run sees it as up to date."""
    stamp = max(time.time(), not_before)
    if path.is_file() and path.read_bytes() == data:
        os.utime(path, (stamp, stamp))
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".webp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.utime(tmp, (stamp, stamp))
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def chain_dirs(images_root: Path) -> list[Path]:
    return sorted(p for p in images_root.iterdir() if p.is_dir() and not p.is_symlink() and p.name != THUMBS and CHAIN_RE.match(p.name))


def run(images_root: Path = IMAGES_ROOT, *, check: bool = False) -> Report:
    rep = Report()
    thumbs_root = images_root / THUMBS
    if not images_root.is_dir():
        rep.errors.append(f"{images_root} does not exist")
        return rep

    # 1. A small copy for every full photo.
    for cdir in chain_dirs(images_root):
        for full in sorted(cdir.iterdir()):
            if not full.is_file() or full.is_symlink() or not FILE_RE.match(full.name):
                continue
            thumb = thumbs_root / cdir.name / full.name
            rel = f"{cdir.name}/{full.name}"
            try:
                full_mtime = full.stat().st_mtime
                if thumb.is_file() and thumb.stat().st_mtime >= full_mtime:
                    rep.up_to_date += 1
                    continue
                existed = thumb.is_file()
                if check:
                    rep.stale.append(f"{'old' if existed else 'missing'}: thumbs/{rel}")
                    continue
                data, same = thumb_bytes(full.read_bytes())
                write_atomic(thumb, data, full_mtime)
                rep.copied += same
                if existed:
                    rep.refreshed += 1
                else:
                    rep.made += 1
            except FileNotFoundError:
                continue  # a photo job removed it meanwhile; step 2 tidies its small copy
            except Exception as e:  # noqa: BLE001 - one unreadable file must not stop the rest; reported and the exit code says so
                rep.errors.append(f"{rel}: {e}")

    # 2. Small copies whose full photo is gone.
    if thumbs_root.is_dir():
        for tdir in sorted(thumbs_root.iterdir()):
            if not tdir.is_dir() or tdir.is_symlink():
                rep.errors.append(f"thumbs/{tdir.name}: not a chain folder (left alone)")
                continue
            for t in sorted(tdir.iterdir()):
                if t.name.startswith(".tmp-"):
                    if not check:
                        t.unlink(missing_ok=True)  # left by an interrupted run
                    continue
                if (images_root / tdir.name / t.name).is_file():
                    continue
                if check:
                    rep.stale.append(f"orphan: thumbs/{tdir.name}/{t.name}")
                elif t.is_file() or t.is_symlink():
                    t.unlink()
                    rep.deleted += 1
                else:
                    rep.errors.append(f"thumbs/{tdir.name}/{t.name}: not a file (left alone)")
            if not check and not any(tdir.iterdir()):
                tdir.rmdir()
    return rep


def size_of(paths) -> tuple[int, int]:
    files = [p for p in paths if p.is_file()]
    return len(files), sum(p.stat().st_size for p in files)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true", help="change nothing; exit 1 if any small copy is missing, old or orphaned")
    ap.add_argument("--images-dir", default=None, help="where the full photos live (default web/public/menu-images)")
    a = ap.parse_args(argv)
    images_root = Path(a.images_dir).resolve() if a.images_dir else IMAGES_ROOT

    if (SOURCE_ROOT / THUMBS).exists():
        print(f"data/source/{THUMBS} exists, but '{THUMBS}' is the folder of small photo copies and can't be a chain id: rename the chain.", file=sys.stderr)
        return 2

    rep = run(images_root, check=a.check)
    full_n, full_b = size_of(p for d in chain_dirs(images_root) for p in d.iterdir() if FILE_RE.match(p.name)) if images_root.is_dir() else (0, 0)
    thumbs_root = images_root / THUMBS
    th_n, th_b = size_of(thumbs_root.rglob("*.webp")) if thumbs_root.is_dir() else (0, 0)

    if a.check:
        for s in rep.stale[:40]:
            print(s)
        if len(rep.stale) > 40:
            print(f"... and {len(rep.stale) - 40} more")
        print(f"{len(rep.stale)} to change, {rep.up_to_date} up to date")
    else:
        print(f"made {rep.made}, refreshed {rep.refreshed}, up to date {rep.up_to_date}, deleted {rep.deleted}"
              f" ({rep.copied} of the new ones are the photo's own bytes: already small, or smaller than a re-encode)")
    print(f"full photos: {full_n:,} files, {full_b / 1e6:.1f} MB")
    print(f"small copies: {th_n:,} files, {th_b / 1e6:.1f} MB" + (f" (average {th_b / th_n / 1e3:.1f} KB)" if th_n else ""))
    for e in rep.errors:
        print(f"error: {e}", file=sys.stderr)
    return 1 if rep.errors or (a.check and rep.stale) else 0


if __name__ == "__main__":
    sys.exit(main())
