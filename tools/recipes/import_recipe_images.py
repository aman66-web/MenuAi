#!/usr/bin/env python3
"""Put the founder's recipe pictures (made with Nano Banana) into the app.

Founder's decision 2026-10-10 (CLAUDE.md rule 2): our OWN recipes may show an illustration made with AI, captioned
"Illustration made with AI". Never a restaurant's or a supermarket's item, never packaging, logos, brand names or text.

  1. Make each picture from its prompt in docs/RECIPE_IMAGE_PROMPTS.md.
  2. Save it as data/recipe-images/<recipe-id>.png (or .jpg / .jpeg / .webp); the id is in the prompt's heading.
  3. Run:  python3 tools/recipes/import_recipe_images.py
     Each picture is centre-cropped to 4:3, resized to 800 x 600 (never enlarged past what it is) and saved as WebP in
     web/public/recipe-images/<id>-<hash>.webp; web/lib/mm/recipeImages.ts is rewritten to list them. A file whose name is not
     a recipe id is reported and skipped. Delete a picture from data/recipe-images/ and rerun to take it out of the app.

The recipe ids are read from web/lib/mm/recipeBook/*.ts (each recipe has `id: "..."`).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "recipe-images"
OUT = ROOT / "web" / "public" / "recipe-images"
INDEX = ROOT / "web" / "lib" / "mm" / "recipeImages.ts"
BOOK = ROOT / "web" / "lib" / "mm" / "recipeBook"
EXTS = {".png", ".jpg", ".jpeg", ".webp"}
SIZE = (800, 600)

HEADER = """// Written by tools/recipes/import_recipe_images.py: do not edit by hand.
// Recipe id → its picture in public/recipe-images/ (an illustration made with AI for our own recipes; founder's decision 2026-10-10).
// The file name carries a hash of its content, so the service worker can cache it for good.
"""


def recipe_ids(book: Path = BOOK) -> set[str]:
    ids: set[str] = set()
    for f in sorted(book.glob("*.ts")):
        ids.update(re.findall(r'\bid:\s*"([a-z0-9-]{3,60})"', f.read_text(encoding="utf-8")))
    return ids


def to_webp(data: bytes) -> bytes:
    from PIL import Image

    with Image.open(io.BytesIO(data)) as im:
        im = im.convert("RGB")
        w, h = im.size
        # centre-crop to 4:3
        if w * 3 > h * 4:
            nw = h * 4 // 3
            im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        elif w * 3 < h * 4:
            nh = w * 3 // 4
            im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        if im.size[0] > SIZE[0]:
            im = im.resize(SIZE, Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=80, method=6)
        return buf.getvalue()


def write_index(mapping: dict[str, str], index: Path = INDEX) -> None:
    lines = [HEADER, "export const RECIPE_IMAGES: Readonly<Record<string, string>> = {"]
    lines += [f'  "{k}": "{v}",' for k, v in sorted(mapping.items())]
    lines.append("};")
    body = "\n".join(lines) + "\n"
    if mapping == {}:
        body = HEADER + "\nexport const RECIPE_IMAGES: Readonly<Record<string, string>> = {};\n"
    index.write_text(body, encoding="utf-8")


def run(source: Path = SOURCE, out: Path = OUT, index: Path = INDEX, ids: set[str] | None = None) -> tuple[dict[str, str], list[str]]:
    ids = recipe_ids() if ids is None else ids
    out.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    skipped: list[str] = []
    files = sorted(p for p in source.glob("*") if p.suffix.lower() in EXTS) if source.exists() else []
    for p in files:
        rid = p.stem.lower()
        if rid not in ids:
            skipped.append(p.name)
            continue
        webp = to_webp(p.read_bytes())
        name = f"{rid}-{hashlib.sha256(webp).hexdigest()[:10]}.webp"
        (out / name).write_bytes(webp)
        mapping[rid] = f"/recipe-images/{name}"
    keep = {Path(v).name for v in mapping.values()}
    for old in out.glob("*.webp"):
        if old.name not in keep:
            old.unlink()
    write_index(mapping, index)
    return mapping, skipped


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=SOURCE)
    args = ap.parse_args()
    mapping, skipped = run(args.source)
    ids = recipe_ids()
    total = sum((OUT / Path(v).name).stat().st_size for v in mapping.values())
    print(f"{len(mapping)} of {len(ids)} recipes have a picture ({total / 1024:.0f} KB in web/public/recipe-images/).")
    for name in skipped:
        print(f"  skipped {name}: not a recipe id (see the headings in docs/RECIPE_IMAGE_PROMPTS.md)")
    missing = sorted(ids - set(mapping))
    if missing:
        print(f"  still without a picture: {len(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
