#!/usr/bin/env python3
"""Build data/source/the-sushi-co/ (calories only) from The Sushi Co's own counter menu PDF.

    python3 -I tools/uk_extract/the_sushi_co.py --pdf FILE --checked-on 2026-10-12 [--out DIR]

FILE is the counter menu linked from the chain's home page https://www.thesushico.co.uk/ (served from thesushico.com):
https://thesushico.com/wp-content/uploads/2026/02/21945_TSC_CounterMenu_No-Pricing_530x297mm.pdf (one page, InDesign, created
6 January 2026, text layer). Every dish line prints its pieces and calories ("KAPPA MAKI 8pc | 126kcal V"). The page is read from its
word boxes (pdftotext -bbox-layout): section headings are the large lines, a dish belongs to the heading above it in the same column,
and every "NNNkcal" on the page must be used or left out by a rule named below, so a new or moved figure stops the run.
Only the names' capitalisation and the categories are written by hand. The chain's allergen matrix (29 January 2026) names dishes
differently from the menu and adds dipping-sauce notes, so it is linked, not copied. Its "Nutritional Information" pictures (uploaded
August 2024) are not used: no text layer.

Found through the Food Standards Agency's hygiene-rating open data (38 GB outlets registered as "The Sushi Co", 12 October 2026).
"""
from __future__ import annotations
import argparse
import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "the-sushi-co"
SOURCE_URL = "https://thesushico.com/wp-content/uploads/2026/02/21945_TSC_CounterMenu_No-Pricing_530x297mm.pdf"
SOURCE_TITLE = "The Sushi Co counter menu (PDF created 6 January 2026, uploaded February 2026)"
ALLERGEN_GUIDE = {"title": "The Sushi Co allergen matrix (TSC_Allergen_29JAN26V01, 29 January 2026)",
                  "url": "https://thesushico.com/wp-content/uploads/2026/02/TSC_Allergen_29JAN26V01.pdf", "may_contain_published": False}
NOTE = ("Calories per item as printed on The Sushi Co's counter menu (January 2026). The two chicken dishes offered 'with rice/noodles' "
        "print one figure for both and are left out.")
EXPECTED_KCAL = 91          # "NNNkcal" figures on the page
# printed heading -> (category shown, rankable)
SECTIONS = {
    "Hosomaki": ("Hosomaki", True), "Uramaki": ("Uramaki", True), "Crunch": ("Crunch rolls", True), "Futomaki": ("Futomaki", True),
    "Sashimi": ("Sashimi", True), "Nigiri": ("Nigiri", True), "Tataki": ("Tataki", True), "Kaburi": ("Kaburi", True),
    "Poke Bowls": ("Poke bowls", True), "Sushi Boxes": ("Sushi boxes", True), "Sharing Platters": ("Sharing platters", False),
    "Bao Buns": ("Bao buns", True), "Sandos": ("Sandos", True), "Rice & Noodles": ("Rice & noodles", True), "Sides": ("Sides", True),
    "Desserts": ("Desserts", False), "Drinks": ("Drinks", False), "Extras": ("Extras", False),   # no figures printed in the last two
}
# "THE signature" box sits in its own panel (top right) whose heading is a picture: its one figure line is named by hand.
SIGNATURE_X = 1400
SIGNATURE = ("The Signature", "Sushi boxes", True)
# one figure printed for two different dishes (with rice or with noodles): left out, never split or chosen
ONE_FIGURE_FOR_TWO = re.compile(r"WITH RICE/NOODLES")
SMALL = {"and", "with", "of", "the", "&"}
KCAL = re.compile(r"(\d[\d,]*)kcal")
ITEM = re.compile(r"^(?P<name>.*?)\s*(?:\bNEW\s+)?(?:(?P<count>\d+\s?(?:pc|PC|skewers))\s*\|\s*)?(?P<kcal>\d[\d,]*)kcal(?:\s+(?P<mark>VE|V|C))?$")


def tidy(name: str) -> str:
    words = re.sub(r"\s+", " ", name.replace(" NEW", "")).strip().split(" ")
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        out.append(lw if i and lw in SMALL else (w if not w.isupper() and not w.islower() else lw.capitalize()))
    return " ".join(out).replace("Bao Buns", "Bao Buns")


def serving(count: str | None) -> str:
    if not count:
        return ""
    n = re.match(r"(\d+)\s?(pc|PC|skewers)", count)
    return f"{n.group(1)} pieces" if n.group(2).lower() == "pc" else f"{n.group(1)} skewers"


def read_lines(pdf: Path) -> list[dict]:
    xml = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = []
    for x0, y0, x1, y1, body in re.findall(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', xml, re.S):
        text = html.unescape(" ".join(re.findall(r"<word[^>]*>(.*?)</word>", body)))
        lines.append({"x": float(x0), "y": float(y0), "h": float(y1) - float(y0), "text": text})
    return lines


def build(pdf: Path) -> tuple[list[dict], list[str]]:
    lines = read_lines(pdf)
    total = sum(len(KCAL.findall(ln["text"])) for ln in lines)
    if total != EXPECTED_KCAL:
        raise SystemExit(f"the page prints {total} kcal figures, this script expects {EXPECTED_KCAL}: the menu changed, re-check it")
    # the big script headings ("Hosomaki", "Sides" ...); the printer's credit and "PRICE BAND 2" run up the page edge
    heads = [ln for ln in lines if ln["h"] > 25 and ln["x"] < SIGNATURE_X]   # page-edge print notes (x > 1480) are rotated
    for h in heads:
        if h["text"] not in SECTIONS:
            raise SystemExit(f"unknown heading {h['text']!r}: add it to SECTIONS")

    def heading(ln):
        cands = [h for h in heads if abs(h["x"] - ln["x"]) < 3 and h["y"] < ln["y"]]
        if not cands:
            raise SystemExit(f"no heading above {ln['text']!r} at x={ln['x']}")
        return max(cands, key=lambda h: h["y"])["text"]

    def line_above(ln):
        cands = [o for o in lines if abs(o["x"] - ln["x"]) < 3 and 0 < ln["y"] - o["y"] < 16 and not KCAL.search(o["text"])]
        if len(cands) != 1:
            raise SystemExit(f"cannot find the name line above {ln['text']!r}")
        return cands[0]["text"]

    items, report, used = [], [], 0
    for ln in sorted(lines, key=lambda l: (l["x"] // 200, l["y"])):
        found = KCAL.findall(ln["text"])
        if not found:
            continue
        text = ln["text"].strip()
        if ln["x"] > SIGNATURE_X:                         # the signature box panel
            m = ITEM.match(text)
            if not m or m.group("name"):
                raise SystemExit(f"unexpected line in the signature panel: {text!r}")
            name, category, rankable = SIGNATURE
            items.append({"name": name, "category": category, "serving": serving(m.group("count")), "calories": m.group("kcal"),
                          "tags": "", "rankable": rankable})
            used += 1
            continue
        category, rankable = SECTIONS[heading(ln)]
        if ONE_FIGURE_FOR_TWO.search(text):
            report.append(f"left out {text!r}: one figure printed for two dishes (with rice or with noodles)")
            used += len(found)
            continue
        parts = [p.strip() for p in text.split(" | ")] if text.count("kcal") > 1 else [text]
        if len(parts) > 1 or (ln["h"] < 9.0 and not text[0].isdigit()):
            # variants printed in smaller type under a dish heading in the larger dish-name type (9.3 pt), e.g.
            # KATSU CURRY / PUMPKIN 717kcal VE / CHICKEN 715kcal / PRAWN 715kcal; STIR FRIED RICE / EGG 509kcal V | CHICKEN 559kcal;
            # MOCHI 2PC / Strawberry Cheesecake 226kcal ...: the parent is the nearest dish-name line above with no figure (within 40 pt)
            above = [o for o in lines if abs(o["x"] - ln["x"]) < 3 and 0 < ln["y"] - o["y"] < 40 and o["h"] > 9.0
                     and not KCAL.search(o["text"])]
            if not above:
                raise SystemExit(f"no dish heading above the variant line {text!r}")
            parent = max(above, key=lambda o: o["y"])["text"]
            for p in parts:
                m = re.match(r"^(?P<v>.+?)\s+(?P<kcal>\d[\d,]*)kcal(?:\s+(?P<mark>VE|V))?$", p)
                if not m:
                    raise SystemExit(f"cannot read variant {p!r} in {text!r}")
                base = re.sub(r"\s*2PC$", "", parent)
                if category == "Desserts":
                    name, srv = f"{tidy(m.group('v'))} {tidy(base)}", ("2 pieces" if parent.endswith("2PC") else "")
                else:
                    name, srv = f"{tidy(base)} ({m.group('v').lower()})", ""
                items.append({"name": name, "category": category, "serving": srv, "calories": m.group("kcal"),
                              "tags": "vegetarian" if m.group("mark") in ("V", "VE") else "", "rankable": rankable})
                used += 1
            continue
        m = ITEM.match(text)
        if not m:
            raise SystemExit(f"cannot read dish line {text!r}")
        name = m.group("name").strip() or line_above(ln)
        items.append({"name": tidy(name), "category": category, "serving": serving(m.group("count")), "calories": m.group("kcal"),
                      "tags": "vegetarian" if m.group("mark") in ("V", "VE") else "", "rankable": rankable})
        used += 1
    if used != total:
        raise SystemExit(f"{total} kcal figures on the page but {used} used or left out")
    names = [i["name"] for i in items]
    dup = {n for n in names if names.count(n) > 1}
    if dup:
        raise SystemExit(f"names printed twice: {sorted(dup)}")
    for it in items:
        it["id"] = slug(it["name"])
        it["calories"] = it["calories"].replace(",", "")
        if it["category"] == "Desserts":
            it["rankable"] = False
    return items, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    items, report = build(args.pdf)
    out = write_chain_folder(chain_id=CHAIN_ID, name="The Sushi Co", cuisine="Japanese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["the sushi co", "sushi co", "the sushi company"], items=items,
                             out=args.out, note=NOTE, allergen_guide={**ALLERGEN_GUIDE, "checked_on": args.checked_on},
                             nutrition_level="calories")
    print(f"PDF sha256 {sha256_file(args.pdf)}")
    print("\n".join(report))
    cats: dict[str, int] = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
