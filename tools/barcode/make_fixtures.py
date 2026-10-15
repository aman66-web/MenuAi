#!/usr/bin/env python3
"""Make the barcode test pictures for web/tests/barcode.test.ts.

The page reads barcodes itself (web/lib/mm/barcode.ts, no library). To test it against something that did not share its tables, the pictures are
drawn here by `python-barcode` (a separate encoder) and each one is checked with `zxing-cpp` (a separate decoder, the reference reader) before it is
saved. Then they are made harder the way a phone camera makes them: a bit turned, blurred, noisy, low in contrast, small, lit unevenly, sideways or
upside down, with other print around them.

Needs (not part of the app): python -m venv v && v/bin/pip install python-barcode zxing-cpp pillow numpy
Run:  v/bin/python tools/barcode/make_fixtures.py          (writes web/tests/fixtures/barcodes/*.pgm.gz and manifest.json)

Each picture is a binary PGM (P5, one byte a pixel, gzip-compressed) so the test can read it with Node alone.
"""
import gzip
import io
import json
import random
import sys
from pathlib import Path

import numpy as np
import zxingcpp
from barcode import EAN13, EAN8, UPCA
from barcode.writer import ImageWriter
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[2] / "web" / "tests" / "fixtures" / "barcodes"
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(20261015)
nrng = np.random.default_rng(20261015)

CODES = {
    "ean13": ["5000157024671", "5010477348630", "4006381333931", "5018374115329", "9780201379624", "5057753912344", "5000169107228"],
    "ean8": ["96385074", "40170725", "73513537"],
    "upca": ["036000291452", "012345678905"],
}


def render(kind, code, module_px, height_px, quiet=True):
    """The barcode alone as a grey picture, drawn by python-barcode."""
    cls = {"ean13": EAN13, "ean8": EAN8, "upca": UPCA}[kind]
    body = code[:-1]  # python-barcode adds the check digit itself
    bc = cls(body, writer=ImageWriter())
    full = bc.get_fullcode()  # the digits it really drew, check digit included
    buf = io.BytesIO()
    bc.write(buf, options={"module_width": 0.2, "module_height": 15.0, "quiet_zone": 6.5 if quiet else 0.0, "write_text": False, "dpi": int(module_px / 0.2 * 25.4)})
    img = Image.open(buf).convert("L")
    # square off the height to what was asked
    w, h = img.size
    return (img.resize((w, height_px), Image.NEAREST) if height_px != h else img), full


def scene(img, size=(640, 360), scale=1.0, angle=0.0, bg=235, clutter=True, offset=(0, 0)):
    """Put the barcode in a larger picture, turned and scaled, with other print around it."""
    sw, sh = size
    canvas = Image.new("L", size, bg)
    if clutter:
        d = ImageDraw.Draw(canvas)
        for _ in range(26):  # a few text-like dark marks around the pack
            x, y = rng.randrange(0, sw), rng.randrange(0, sh)
            d.rectangle([x, y, x + rng.randrange(6, 60), y + rng.randrange(2, 9)], fill=rng.randrange(20, 110))
    b = img.resize((max(8, int(img.width * scale)), max(8, int(img.height * scale))), Image.BILINEAR)
    if angle:
        b = b.rotate(angle, expand=True, fillcolor=bg, resample=Image.BICUBIC)
    x = (sw - b.width) // 2 + offset[0]
    y = (sh - b.height) // 2 + offset[1]
    canvas.paste(b, (x, y))
    return canvas


def degrade(img, blur=0.0, noise=0.0, contrast=1.0, shade=0.0):
    a = np.asarray(img, dtype=np.float32)
    if blur:
        a = np.asarray(img.filter(ImageFilter.GaussianBlur(blur)), dtype=np.float32)
    if contrast != 1.0:
        a = 128 + (a - 128) * contrast
    if shade:  # light falling off across the picture
        gx = np.linspace(1 - shade, 1 + shade, a.shape[1], dtype=np.float32)[None, :]
        a = a * gx
    if noise:
        a = a + nrng.normal(0, noise, a.shape).astype(np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def save(name, img, expect, note, must_decode=True):
    arr = np.asarray(img, dtype=np.uint8)
    h, w = arr.shape
    raw = f"P5\n{w} {h}\n255\n".encode() + arr.tobytes()
    (OUT / f"{name}.pgm.gz").write_bytes(gzip.compress(raw, 9, mtime=0))
    ref = [r.text for r in zxingcpp.read_barcodes(img)]
    return {"file": f"{name}.pgm.gz", "expect": expect, "note": note, "width": w, "height": h, "reference_reads": expect in ref, "must_decode": must_decode}


manifest = []

# 1. clean pictures of every code at a normal size
for kind, codes in CODES.items():
    for code in codes:
        img, full = render(kind, code, module_px=3, height_px=120)
        expect = full if len(full) != 12 else "0" + full
        manifest.append(save(f"clean-{kind}-{full}", scene(img, clutter=False), expect, "clean, 3 px modules"))

# 2. the ways a phone camera makes it harder
HARD = [
    ("small", dict(scale=0.7), dict(), "modules about 2 px wide"),
    ("large", dict(scale=2.2), dict(), "modules about 6.6 px wide, runs near the picture's edges"),
    ("turn8", dict(angle=8), dict(), "turned 8 degrees"),
    ("turn-8", dict(angle=-8), dict(), "turned 8 degrees the other way"),
    ("turn20", dict(angle=20), dict(), "turned 20 degrees"),
    ("upside-down", dict(angle=180), dict(), "upside down"),
    ("sideways90", dict(angle=90), dict(), "turned a quarter, so it is read down the picture"),
    ("sideways270", dict(angle=270), dict(), "turned three quarters"),
    ("blur", dict(), dict(blur=1.1), "out of focus a little"),
    ("blur-small", dict(scale=0.8), dict(blur=0.9), "small and soft"),
    ("noise", dict(), dict(noise=14), "grainy, as in dim light"),
    ("noise-turn", dict(angle=6), dict(noise=18, blur=0.7), "grainy, soft and turned"),
    ("low-contrast", dict(bg=190), dict(contrast=0.45), "washed out"),
    ("shaded", dict(), dict(shade=0.35), "lit from one side"),
    ("dark-pack", dict(bg=60), dict(), "on a dark background"),
    ("off-centre", dict(offset=(150, 70)), dict(), "off to one side"),
]
SECOND = [("ean13", "5010477348630"), ("ean8", "96385074"), ("upca", "036000291452"), ("ean13", "5057753912344")]
for n, (tag, sc, dg, note) in enumerate(HARD):
    # every way is tried on the usual EAN-13 and on one of the others, so each kind meets several of them
    for kind, code in (("ean13", "5000157024671"), SECOND[n % len(SECOND)]):
        img, full = render(kind, code, module_px=3, height_px=120)
        expect = full if len(full) != 12 else "0" + full
        bg = sc.get("bg", 235)
        pic = degrade(scene(img, scale=sc.get("scale", 1.0), angle=sc.get("angle", 0.0), bg=bg, offset=sc.get("offset", (0, 0))), **dg)
        manifest.append(save(f"{tag}-{kind}-{full}", pic, expect, note, must_decode=True))

# 3. pictures that must read as NOTHING
blank = Image.new("L", (640, 360), 220)
manifest.append(save("none-blank", blank, None, "empty", must_decode=False))
noise_only = Image.fromarray(nrng.integers(0, 256, (360, 640), dtype=np.uint8))
manifest.append(save("none-noise", noise_only, None, "pure noise", must_decode=False))
stripes = Image.new("L", (640, 360), 235)
d = ImageDraw.Draw(stripes)
x = 40
while x < 600:  # barcode-like bars of random widths: not a code
    w = rng.randrange(2, 9)
    d.rectangle([x, 80, x + w, 280], fill=15)
    x += w + rng.randrange(2, 9)
manifest.append(save("none-random-bars", stripes, None, "bars of random widths", must_decode=False))
text = Image.new("L", (640, 360), 240)
d = ImageDraw.Draw(text)
for row in range(12):
    for col in range(40):
        d.rectangle([20 + col * 15, 20 + row * 27, 20 + col * 15 + rng.randrange(3, 11), 34 + row * 27], fill=rng.randrange(30, 90))
manifest.append(save("none-text", text, None, "a page of text-like marks", must_decode=False))

# manifest + a report on the reference reader
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
ok = sum(1 for m in manifest if m["expect"] and m["reference_reads"])
tot = sum(1 for m in manifest if m["expect"])
print(f"{len(manifest)} pictures; the reference reader (zxing-cpp) reads {ok} of {tot} that hold a code")
for m in manifest:
    if m["expect"] and not m["reference_reads"]:
        print("  reference reader misses:", m["file"], "-", m["note"])
