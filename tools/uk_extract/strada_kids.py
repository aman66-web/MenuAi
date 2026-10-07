"""Read Strada's official Kids menu (an IMAGE, no text layer) into dishes with their printed calories, by OCR.

Used by tools/uk_extract/strada.py. Requires the `tesseract` program (OCR, English) and Pillow (`pip install pillow`).
The numbers come out of the OCR of the chain's own file and are never typed by hand; each one was also compared by eye with the
rendered image when the data was built. Each block is read at ten settings (5 enlargements x 2 page modes) and the run STOPS unless at least three clean
readings (the dish names and exactly the number of calorie values expected, ENTRIES below) exist and at least 75% of them agree on every value, so a new kids
menu, or an OCR slip, is never read silently.

The menu is one JPEG (2961 x 2094, Strada-Jan-2025_Kids-Menu-WEB.jpg) with four coloured blocks. Each is cropped (BOXES, pixel
boxes measured from this file), converted to grey, enlarged 1x to 4x and read with tesseract page-segmentation modes 6 and 4. Dish lines look like
"MARGHERITA PIZZA (V) 374kcal". The typeface draws a zero as a round "O", which OCR sometimes returns as the letter O
("5Okcal"): inside a number followed by "kcal" an O is read as 0 (a calorie value has no letters). The dietary mark
(V) = suitable for vegetarians, (VO) = "can be made vegetarian" is read from the same line.
"""
from __future__ import annotations
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path

# block -> pixel box (left, top, right, bottom) in the 2961 x 2094 image
BOXES = {"starters": (800, 570, 1440, 790), "mains": (120, 1050, 900, 1300),
         "desserts": (140, 1570, 900, 1900), "drinks": (1100, 930, 1570, 1690)}
# block -> [(text OCR must show before the value, mark printed on that line ('' none), number of the value in the block)]
# Dish names are as printed (upper case); drinks print the brand on one line and the flavour below, so the flavour is the key.
ENTRIES = {
    "starters": [("VEGGIE STICKS", "V"), ("GRISSINI", "V")],
    "mains": [("MARGHERITA PIZZA", "V"), ("PENNE POMODORO", "VO"), ("CHARGRILLED CHICKEN", ""), ("LINGUINE BOLOGNESE", ""),
              ("PASTA CARBONARA", "")],
    "desserts": [("FRESH FRUIT", "V"), ("CHOCOLATE & HAZELNUT PIZZETTA", "V"), ("ICE CREAM", "V"), ("ICE LOLLY", "V")],
    "drinks": [("MILK", ""), ("APPLE & PEAR", ""), ("APPLE & MANGO", ""), ("APPLE & SUMMER BERRIES", "")],
}
KCAL_WORD = re.compile(r"(?<![A-Za-z0-9.])([0-9O][0-9O.\-–]*)\s?kcal")  # no letter or digit may touch the number on its left
MARK = re.compile(r"\(\s*(VO|V)\s*[)J\]]")
# each block is read at these (enlargement, tesseract page-segmentation mode) settings; at least MIN_AGREEING readings must be clean
# and ALL clean readings must agree on every value
READINGS = [(scale, psm) for scale in (1, 1.5, 2, 3, 4) for psm in (6, 4)]
MIN_AGREEING = 3
DISSENT = []  # filled by read_kids: dishes where a minority of readings differed (printed by strada.py)


def _ocr(image: Path, box: tuple, scale: float, psm: int, scratch: Path, name: str) -> str:
    from PIL import Image  # imported here so the rest of the script runs without Pillow
    crop = scratch / f"{name}-{scale}-{psm}.png"
    grey = Image.open(image).crop(box).convert("L")  # grey and enlarged: OCR misses small white text on colour at some sizes
    if scale != 1:
        grey = grey.resize((int(grey.width * scale), int(grey.height * scale)), Image.LANCZOS)
    grey.save(crop)
    out = subprocess.run(["tesseract", str(crop), "-", "--psm", str(psm)], check=True, capture_output=True, text=True).stdout
    return " ".join(out.split())


def _parse_block(block: str, text: str) -> list[dict]:
    """One OCR reading of one block -> its dishes, or raises ValueError saying what is wrong with this reading."""
    values = [(m.start(), m.group(1).replace("O", "0")) for m in KCAL_WORD.finditer(text)]
    if len(values) != len(ENTRIES[block]):
        raise ValueError(f"{len(values)} clean calorie values, expected {len(ENTRIES[block])}")
    if block == "drinks" and text.count("CAWSTON PRESS") != 3:
        raise ValueError("the brand 'CAWSTON PRESS' is not shown three times")
    used, rows = set(), []
    for key, mark in ENTRIES[block]:
        at = text.find(key)
        if at < 0:
            raise ValueError(f"{key!r} not found")
        after = [(pos, v) for pos, v in values if pos >= at + len(key) and pos not in used]
        if not after:
            raise ValueError(f"no calorie value after {key!r}")
        pos, value = min(after)
        used.add(pos)
        between = text[at + len(key):pos]
        m = MARK.search(between) if len(between) < 14 else None
        if (m.group(1) if m else "") != mark:
            raise ValueError(f"{key!r} should carry the mark {mark!r}, OCR shows {between!r}")
        rows.append(dict(block=block, key=key, mark=mark, value=value))
    return rows


def read_kids(image: Path) -> list[dict]:
    """-> one dict per dish line: block, key (printed name), mark, value (kcal text as printed, e.g. '374', '97.5-125'), block_text
    (everything the OCR read in that block, used to confirm words such as 'beef' or 'Ham' that the meat tags rest on).
    A block is read at every setting in READINGS; readings that are not clean are dropped, and the run stops unless at least
    MIN_AGREEING clean readings exist and at least 75% of them give the same value for every dish (the others are listed in DISSENT).
    One OCR setting once read '47kcal' as 'A7kcal' and another '40kcal' as '400kcal': a single reading is never trusted."""
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        for block, box in BOXES.items():
            good, problems, texts = [], [], []
            for scale, psm in READINGS:
                text = _ocr(image, box, scale, psm, Path(tmp), block)
                texts.append(text)
                try:
                    good.append(_parse_block(block, text))
                except ValueError as e:
                    problems.append(f"x{scale}/psm{psm}: {e}")
            if len(good) < MIN_AGREEING:
                raise ValueError(f"Kids menu {block}: only {len(good)} clean OCR readings ({'; '.join(problems)}). Texts: {texts}")
            joined = " | ".join(texts)
            for i, (key, mark) in enumerate(ENTRIES[block]):
                votes = Counter(g[i]["value"] for g in good)
                value, n = votes.most_common(1)[0]
                if n < MIN_AGREEING or n < 0.75 * len(good):
                    raise ValueError(f"Kids menu {block}: OCR readings of {key!r} do not agree: {dict(votes)}")
                if len(votes) > 1:
                    DISSENT.append(f"kids {key}: {value} read {n} of {len(good)} times, other readings {dict((v, c) for v, c in votes.items() if v != value)}")
                results.append(dict(block=block, key=key, mark=mark, value=value, block_text=joined))
    return results
