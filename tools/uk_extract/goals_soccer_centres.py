#!/usr/bin/env python3
"""Build data/source/goals-soccer-centres/ from the Goals food menu (a CALORIES-ONLY chain; the menu is a picture, so it is read by OCR).

    python3 tools/uk_extract/goals_soccer_centres.py path/to/Food_Menu.webp --checked-on 2026-11-17 [--out DIR]

Source: https://www.goalsfootball.co.uk/about-us/food-menu/ ("Food Menu" on the chain's own website, rebuilt in October 2026; listed in its
page-sitemap.xml) shows the menu as one picture, https://www.goalsfootball.co.uk/wp-content/uploads/2026/10/Food_Menu.webp (1055 x 1491 px,
Last-Modified 14 Oct 2026, no date printed), followed by a second picture that is an app offer (no food, no figures). It replaced the
table-talker PDF https://cdn.goalsfootball.co.uk/media/zyue2gmn/fb-dl-table-talker-designs-v4.pdf (created 12 Jan 2026, linked from the old page
/about-us/food-menu-2025, which now answers 404). robots.txt of www.goalsfootball.co.uk: `User-agent: *  Disallow:` (nothing disallowed; only
ExaSearchBot has rules). The menu is ONE central design for every club.

The menu prints calories ONLY, in a KCAL column beside each price (and "Kcal NNNN" under each pizza): protein, carbs and fat stay blank
(docs/DATA.md "Calories-only chains"). Prices are not used.

How the figures are read (copy, never type): the picture is read by the Mac's own text recognition (Apple's Vision framework, through the
small Swift helper below, compiled once per run with `swiftc`; macOS only, no new dependency) at its own size and enlarged 2x and 3x. Each
recognised line comes with its position: a menu row is the mixed-case name in the left column of the food panel with the KCAL figure on the
same line; a pizza's figure is the "Kcal NNNN" line in the right-hand panel. The script stops unless all three readings give the SAME figure
for every one of the 19 rows, in the expected order, under the expected printed name. (Until 2026-11-17 the PDF was read by Tesseract at three
resolutions; the picture has one resolution, so the three readings differ only in enlargement.) The figures were also read by eye on enlarged
crops. Names, categories and tags are written by hand in ITEMS; the script stops if a printed name or the row count differs.

Tags come from the menu's own icons, which were read by eye (the menu's key: green leaf = Vegetarian, green circle = Halal; "Vegan/Vegetarian
items may be available, please ask a member of staff for details"): vegetarian for French Fries, Cheesy Fries, Doritos Nachos and the Chicago
Town Loaded Cheese Pizza (leaf icon). Halal has no tag in the data model. Pork where the name or the printed ingredients say sausage, bacon,
pepperoni or ham; beef where they say beef (the pepperoni pizza: "slices of beef and pork pepperoni"; the BBQ Magnificent Meat Feast: "slices of
smoked pork and beef pepperoni, cooked ham and fennel sausage"). Meat type not stated: Quarter Pounder With Cheese (and & Fries), 5" Hotdog
(and With Fries). Not listed: drinks (none on the menu). Allergens: none in the file.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import tempfile
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "goals-soccer-centres"
SOURCE_URL = "https://www.goalsfootball.co.uk/about-us/food-menu/"
SOURCE_TITLE = ("Goals food menu (picture Food_Menu.webp on the Goals website's Food Menu page, uploaded 14 October 2026; "
                "no date printed)")
ALIASES = ["goals", "goals soccer centre", "goals soccer centres", "goals football", "goals football centre", "goals football centres"]
NOTE = ("Goals prints calories only, on one menu for all its clubs. Calories are for the whole dish as listed (each pizza is a whole "
        "12-inch Chicago Town pizza). The menu prints no drinks, so none are listed.")
SCALES = (1, 2, 3)
# Panels, as fractions of the picture (x from the left, y from the top): the food panel's rows and the pizza panel.
NAME_X = (0.05, 0.34)       # row names start at x 0.07
KCAL_X = (0.35, 0.42)       # the KCAL column starts at x 0.37 (prices at 0.44)
MENU_Y = (0.33, 0.76)       # from the first row (0.35) to the last (0.75); the "Vegan/Vegetarian items ..." line is at 0.77
PIZZA_X0, PIZZA_Y = 0.50, (0.30, 0.70)
ROW_DY = 0.008              # a figure belongs to the name whose line centre is this close (rows are 0.017-0.030 apart)
PORK, BEEF, VEG = "contains_pork", "contains_beef", "vegetarian"

BH, BR, CW, SI, PZ = "Burgers & hot dogs", "Breakfast rolls", "Chicken & wings", "Sides", "Pizza"
# (printed name on the menu, item name, category, tags, note) in the order the menu prints them.
ITEMS = [
    ("Quarter Pounder With Cheese", "Quarter Pounder With Cheese", BH, [], "Meat type not stated"),
    ("Quarter Pounder With Cheese & Fries", "Quarter Pounder With Cheese & Fries", BH, [], "Meat type not stated"),
    ("Chicken Goujon Burger", "Chicken Goujon Burger", BH, [], "Halal icon on the menu; 456 + the 492 of French Fries = the 948 printed for the burger & fries"),
    ("Chicken Goujon Burger & Fries", "Chicken Goujon Burger & Fries", BH, [], "Halal icon on the menu; the other '& Fries' dishes add about 410 kcal to the dish alone (749 to 1159, 269 to 679), this one 492"),
    ('5" Hotdog', '5" Hotdog', BH, [], "Meat type not stated"),
    ('5" Hotdog With Fries', '5" Hotdog With Fries', BH, [], "Meat type not stated"),
    ("Breakfast Sausage Roll", "Breakfast Sausage Roll", BR, [PORK], "Printed under 'All Day Breakfast Roll'"),
    ("Breakfast Bacon Roll", "Breakfast Bacon Roll", BR, [PORK], "Printed under 'All Day Breakfast Roll'"),
    ("Breakfast Sausage & Bacon Roll", "Breakfast Sausage & Bacon Roll", BR, [PORK], "Printed under 'All Day Breakfast Roll'"),
    ("Chicken Strips (3)", "Chicken Strips (3)", CW, [], "Halal icon on the menu"),
    ("Chicken Strips (5)", "Chicken Strips (5)", CW, [], "Halal icon on the menu"),
    ("Spicy Buffalo Chicken Wings (8)", "Spicy Buffalo Chicken Wings (8)", CW, [], ""),
    ("Chicken Wings (4) & Chicken Strips (3)", "Chicken Wings (4) & Chicken Strips (3)", CW, [], ""),
    ("French Fries", "French Fries", SI, [VEG], "Vegetarian icon on the menu"),
    ("Cheesy Fries", "Cheesy Fries", SI, [VEG], "Vegetarian icon on the menu"),
    ("Doritos Nachos", "Doritos Nachos", SI, [VEG], "Printed 'Doritos® Nachos'; vegetarian icon on the menu"),
    ('Chicago Town 12" Loaded Cheese Pizza', 'Chicago Town 12" Loaded Cheese Pizza', PZ, [VEG], "Vegetarian icon on the menu; printed 'mozzarella, mature cheddar, Monterey Jack and Emmental cheese'"),
    ('Chicago Town 12" Stuffed Crust Pepperoni Pizza', 'Chicago Town 12" Stuffed Crust Pepperoni Pizza', PZ, [PORK, BEEF], "Printed 'slices of beef and pork pepperoni'"),
    ('Chicago Town 12" BBQ Magnificent Meat Feast', 'Chicago Town 12" BBQ Magnificent Meat Feast', PZ, [PORK, BEEF], "Printed 'slices of smoked pork and beef pepperoni, cooked ham and fennel sausage'"),
]
MENU_ROWS, PIZZAS = ITEMS[:16], ITEMS[16:]

# Apple Vision text recognition: prints one line per recognised line of text, "x y w h<TAB>text", as fractions of the picture with
# y measured from the top. No language correction, so figures are not "fixed" into words.
VISION_SWIFT = r'''
import Foundation
import Vision
import AppKit
let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!); exit(1)
}
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
req.recognitionLanguages = ["en-GB"]
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
for obs in req.results ?? [] {
    guard let top = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    print(String(format: "%.5f %.5f %.5f %.5f\t", b.minX, 1 - b.maxY, b.width, b.height) + top.string)
}
'''


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("®", ""))


def build_helper(tmp: Path) -> Path:
    src, exe = tmp / "vision_ocr.swift", tmp / "vision_ocr"
    src.write_text(VISION_SWIFT, encoding="utf-8")
    try:
        subprocess.run(["swiftc", "-O", "-o", str(exe), str(src)], check=True, capture_output=True, text=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        raise SystemExit(f"could not build the Vision OCR helper (needs macOS with swiftc): {e}")
    return exe


def read_once(picture: Path, scale: int, tmp: Path, helper: Path) -> tuple[list[tuple[str, str]], list[str]]:
    im = Image.open(picture).convert("RGB")
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    png = tmp / f"menu_x{scale}.png"
    im.save(png)
    out = subprocess.run([str(helper), str(png)], capture_output=True, text=True, check=True).stdout
    lines = []
    for ln in out.splitlines():
        box, text = ln.split("\t", 1)
        x, y, w, h = map(float, box.split())
        lines.append(dict(x=x, yc=y + h / 2, text=text.strip()))
    in_menu = [l for l in lines if MENU_Y[0] <= l["yc"] < MENU_Y[1]]
    names = [l for l in in_menu if NAME_X[0] <= l["x"] < NAME_X[1] and l["text"] != l["text"].upper()]  # section headings are capitals
    figures = [l for l in in_menu if KCAL_X[0] <= l["x"] < KCAL_X[1] and re.fullmatch(r"\d{3,4}", l["text"])]
    rows = []
    for f in sorted(figures, key=lambda l: l["yc"]):
        near = [n for n in names if abs(n["yc"] - f["yc"]) <= ROW_DY]
        if len(near) != 1:
            raise SystemExit(f"x{scale}: the figure {f['text']} at y={f['yc']:.3f} lines up with {len(near)} names: the layout changed, read the menu by eye")
        rows.append((near[0]["text"], f["text"]))
    if len({r[0] for r in rows}) != len(rows) or len(names) != len(rows):
        raise SystemExit(f"x{scale}: {len(names)} row names but {len(rows)} figures: the layout changed, read the menu by eye")
    pizza = sorted((l for l in lines if l["x"] >= PIZZA_X0 and PIZZA_Y[0] <= l["yc"] < PIZZA_Y[1]), key=lambda l: l["yc"])
    pizzas = [m.group(1) for l in pizza for m in [re.fullmatch(r"K[ce]+al\s+(\d{3,4})", l["text"])] if m]
    return rows, pizzas


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("picture", type=Path, help="the menu picture (Food_Menu.webp, see the docstring)")
    ap.add_argument("--checked-on", required=True, help="the day the picture was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu picture sha256 {sha256_file(args.picture)}  {args.picture}")
    runs = []
    with tempfile.TemporaryDirectory() as t:
        helper = build_helper(Path(t))
        for scale in SCALES:
            runs.append(read_once(args.picture, scale, Path(t), helper))
    kcal: list[str] = []
    for scale, (rows, pizzas) in zip(SCALES, runs):
        if len(rows) != len(MENU_ROWS) or len(pizzas) != len(PIZZAS):
            raise SystemExit(f"OCR at x{scale} found {len(rows)} menu rows and {len(pizzas)} pizzas, expected {len(MENU_ROWS)} and {len(PIZZAS)}: "
                             "the menu changed or the reading failed; read the menu by eye")
        for (label, _), item in zip(rows, MENU_ROWS):
            # the printed name, allowing a stray OCR letter in it ("Breaktast" was read once at x2): the figure is what must agree
            if (SequenceMatcher(None, _norm(label), _norm(item[0])).ratio() < 0.9
                    or re.findall(r"\d", label) != re.findall(r"\d", item[0])):  # "Chicken Strips (3)" vs "(5)" must not pass
                raise SystemExit(f"OCR at x{scale} read the row {label!r} where {item[0]!r} was expected: the menu changed")
    for i in range(len(MENU_ROWS)):
        values = {runs[k][0][i][1] for k in range(len(SCALES))}
        if len(values) != 1:
            raise SystemExit(f"Row {MENU_ROWS[i][0]!r}: the readings disagree ({[runs[k][0][i][1] for k in range(len(SCALES))]}): read the menu by eye")
        kcal.append(values.pop())
    for i in range(len(PIZZAS)):
        values = {runs[k][1][i] for k in range(len(SCALES))}
        if len(values) != 1:
            raise SystemExit(f"Pizza {PIZZAS[i][0]!r}: the readings disagree ({[runs[k][1][i] for k in range(len(SCALES))]}): read the menu by eye")
        kcal.append(values.pop())
    items = [dict(name=name, category=cat, calories=k, tags="|".join(tags), rankable=False,
                  notes="; ".join(x for x in (f"Printed '{printed}' {k} kcal (OCR at x{'/x'.join(map(str, SCALES))} agreed)", note) if x))
             for (printed, name, cat, tags, note), k in zip(ITEMS, kcal)]
    if len({i["name"] for i in items}) != len(items):
        raise SystemExit("Item names are not unique")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Goals", cuisine="Bar & Kitchen", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories")
    cats = Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print("  kcal read (all three readings agree): " + ", ".join(f"{it[1]} {k}" for it, k in zip(ITEMS, kcal)))


if __name__ == "__main__":
    main()
