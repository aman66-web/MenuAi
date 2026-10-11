"""Read one Blue Diamond dish card (a 640 x 720 picture: the dish's name across the top in sage green, a photo, and one or two sage-green
circles at the bottom holding "<n> kcal" in white, sometimes with a size label such as "Regular" / "Large" or "For One" / "For Two").

Standard library + Pillow + the tesseract and ImageMagick programs only. Nothing here guesses: the title band and each circle are cut out
by colour, turned into black text on white, and read by tesseract at two enlargements; a read that differs between the two enlargements is
returned as a disagreement for a person to look at.
"""
from __future__ import annotations
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

SAGE = (158, 172, 138)
KCAL = re.compile(r"(\d[\d,]*)\s*kcal", re.I)


def _green(p) -> bool:
    r, g, b = p[:3]
    return abs(r - SAGE[0]) <= 30 and abs(g - SAGE[1]) <= 28 and abs(b - SAGE[2]) <= 32 and g >= r - 6 and g > b


def _tess(img: Image.Image, psm: int, scale: int) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "x.png"
        img.resize((img.width * scale, img.height * scale), Image.LANCZOS).save(p)
        out = subprocess.run(["tesseract", str(p), "-", "--psm", str(psm)], capture_output=True, text=True, check=True).stdout
    return " ".join(out.split())


def title_image(im: Image.Image) -> Image.Image:
    """The top band (title) as black text on white: sage-green pixels black, everything else white."""
    w, h = im.size
    band = im.crop((0, 0, w, int(h * 0.25)))
    out = Image.new("L", band.size, 255)
    px, op = band.load(), out.load()
    for y in range(band.height):
        for x in range(band.width):
            if _green(px[x, y]):
                op[x, y] = 0
    bbox = Image.eval(out, lambda v: 255 - v).getbbox()
    return out.crop((max(0, bbox[0] - 8), max(0, bbox[1] - 8), min(w, bbox[2] + 8), min(out.height, bbox[3] + 8))) if bbox else out


def circles(im: Image.Image) -> list[tuple[int, int, int, int]]:
    """Bounding boxes of the large sage-green blobs in the lower part of the card (the calorie circles), left to right."""
    w, h = im.size
    top = int(h * 0.40)
    cell = 8
    gw, gh = w // cell, (h - top) // cell
    px = im.load()
    grid = [[False] * gw for _ in range(gh)]
    for gy in range(gh):
        for gx in range(gw):
            n = 0
            for dy in range(0, cell, 2):
                for dx in range(0, cell, 2):
                    if _green(px[gx * cell + dx, top + gy * cell + dy]):
                        n += 1
            grid[gy][gx] = n >= 10   # of 16 samples
    seen = [[False] * gw for _ in range(gh)]
    boxes = []
    for gy in range(gh):
        for gx in range(gw):
            if grid[gy][gx] and not seen[gy][gx]:
                stack, cells = [(gy, gx)], []
                seen[gy][gx] = True
                while stack:
                    y, x = stack.pop()
                    cells.append((y, x))
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < gh and 0 <= nx < gw and grid[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((ny, nx))
                if len(cells) >= 150:   # a circle of about 120 px across or more
                    ys, xs = [c[0] for c in cells], [c[1] for c in cells]
                    boxes.append((min(xs) * cell, top + min(ys) * cell, (max(xs) + 1) * cell, top + (max(ys) + 1) * cell))
    return sorted(boxes)


def circle_image(im: Image.Image, box) -> Image.Image:
    """The white writing inside one circle as black text on white (pixels outside the inscribed ellipse ignored)."""
    x0, y0, x1, y1 = box
    crop = im.crop(box)
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).ellipse((4, 4, crop.width - 5, crop.height - 5), fill=255)
    out = Image.new("L", crop.size, 255)
    px, mp, op = crop.load(), mask.load(), out.load()
    for y in range(crop.height):
        for x in range(crop.width):
            if mp[x, y] and min(px[x, y][:3]) >= 215:
                op[x, y] = 0
    return out


def read_card(path: Path) -> dict:
    im = Image.open(path).convert("RGB")
    t_img = title_image(im)
    titles = [_tess(t_img, 6, s) for s in (2, 3)]
    figs = []
    for box in circles(im):
        c_img = circle_image(im, box)
        reads = [_tess(c_img, 6, s) for s in (2, 3)]
        figs.append({"box": box, "reads": reads})
    return {"titles": titles, "figures": figs, "size": im.size}


def parse_figure(text: str) -> tuple[str, str] | None:
    """'Regular 44 kcal' -> ('Regular', '44'); '1373 kcal' -> ('', '1373'); None if no '<n> kcal'."""
    m = KCAL.search(text)
    if not m:
        return None
    label = text[:m.start()].strip(" .,:;-|")
    return label, m.group(1).replace(",", "")
