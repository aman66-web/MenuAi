#!/usr/bin/env python3
"""Small copies of the recipe pictures, for the places a recipe is shown small (founder 2026-11-17: "Use images please when possible" and
"when the user downloads the app it shouldn't use excessive storage").

The 800 x 600 pictures in web/public/recipe-images/ are about 100 KB each; a 64 px tile or a 40 px stack of three (the shopping list's
"What can I cook with this?", "You might also need", the Recipes list's "Cook with what's on your list") needs far less. Each picture
gets a copy at most 240 px wide (resized only: never cropped, recoloured or otherwise changed; never enlarged) under
web/public/recipe-images/thumbs/ with the SAME file name (the name carries the full picture's hash, so the copy can be cached for good),
and web/lib/mm/recipeThumbs.ts lists them by recipe id. The app shows the small copy and falls back to the full picture, then to the
drawing, when one doesn't load (offline in the iPhone app, which loads pictures from numbite.com: lib/mm/config.ts assetUrl).

  python3 tools/recipes/make_recipe_thumbs.py      (import_recipe_images.py runs it too)

A copy whose picture is gone is deleted; an existing copy is kept as it is (same name = same picture).
"""
from __future__ import annotations

import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "web" / "public" / "recipe-images"
THUMBS = IMAGES / "thumbs"
IMAGES_INDEX = ROOT / "web" / "lib" / "mm" / "recipeImages.ts"
THUMBS_INDEX = ROOT / "web" / "lib" / "mm" / "recipeThumbs.ts"
MAX_WIDTH = 240

HEADER = """// Written by tools/recipes/make_recipe_thumbs.py: do not edit by hand.
// Recipe id → a small copy (at most 240 px wide, resized only) of its picture in public/recipe-images/thumbs/, with the full picture's file name,
// for recipes shown small (lib/mm/recipeImages.ts has the full pictures; app/app/recipes/RecipeThumb.tsx falls back to them).
"""

ENTRY = re.compile(r'^\s*"([a-z0-9-]+)":\s*"/recipe-images/([A-Za-z0-9._-]+\.webp)",\s*$', re.M)
ENTRY_THUMB = re.compile(r'^\s*"([a-z0-9-]+)":\s*"/recipe-images/thumbs/([A-Za-z0-9._-]+\.webp)",\s*$', re.M)


def read_index(index: Path = IMAGES_INDEX) -> dict[str, str]:
    """Recipe id → file name of its full picture, from recipeImages.ts."""
    return dict(ENTRY.findall(index.read_text(encoding="utf-8"))) if index.exists() else {}


def to_thumb(data: bytes, max_width: int = MAX_WIDTH) -> bytes:
    from PIL import Image

    with Image.open(io.BytesIO(data)) as im:
        im = im.convert("RGB")
        w, h = im.size
        if w > max_width:
            im = im.resize((max_width, max(1, round(h * max_width / w))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=78, method=6)
        return buf.getvalue()


def write_index(mapping: dict[str, str], index: Path = THUMBS_INDEX) -> None:
    lines = [HEADER, "export const RECIPE_THUMBS: Readonly<Record<string, string>> = {"]
    lines += [f'  "{k}": "/recipe-images/thumbs/{v}",' for k, v in sorted(mapping.items())]
    lines.append("};")
    body = "\n".join(lines) + "\n" if mapping else HEADER + "\nexport const RECIPE_THUMBS: Readonly<Record<string, string>> = {};\n"
    index.write_text(body, encoding="utf-8")


def run(images: Path = IMAGES, thumbs: Path = THUMBS, images_index: Path = IMAGES_INDEX, thumbs_index: Path = THUMBS_INDEX) -> dict[str, str]:
    """Makes the missing copies, deletes the ones whose picture is gone, writes the list. Returns recipe id → file name."""
    full = read_index(images_index)
    thumbs.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    for rid, name in sorted(full.items()):
        src = images / name
        if not src.exists():
            continue
        dest = thumbs / name
        if not dest.exists():
            dest.write_bytes(to_thumb(src.read_bytes()))
        mapping[rid] = name
    keep = set(mapping.values())
    for old in thumbs.glob("*.webp"):
        if old.name not in keep:
            old.unlink()
    write_index(mapping, thumbs_index)
    return mapping


def main() -> int:
    mapping = run()
    total = sum((THUMBS / n).stat().st_size for n in mapping.values())
    print(f"{len(mapping)} small recipe pictures ({total / 1024:.0f} KB in web/public/recipe-images/thumbs/).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
