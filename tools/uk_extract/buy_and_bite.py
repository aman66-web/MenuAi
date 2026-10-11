#!/usr/bin/env python3
"""Build data/source/buy-and-bite/ from Buy & Bite's official "Nutrition Guide" PDF (calories, fat, carbs and protein per dish).

    python3 tools/uk_extract/buy_and_bite.py path/to/nutrition-guide.pdf --checked-on 2026-10-11 [--out DIR]

Source (the file the chain's own Menu page links as "Nutrition Guide"):
    https://www.buyandbite.co.uk/menu  ->  https://www.buyandbite.co.uk/_files/ugd/88035e_3b02e06dfeee4c43a4902f6be64b120c.pdf
    served as "Estimate Nutrition Guide.pdf", Last-Modified 3 Oct 2025; PDF title "Nutrition Guide", made in Canva, created 2025-10-03;
    7 A2 pages with a text layer. robots.txt of www.buyandbite.co.uk: `User-agent: *  Allow: /` (only `*?lightbox=` is disallowed).
Sites (the homepage's "Find the Bites", read 2026-10-11): Farringdon (5A Cowcross St EC1M 6DW), Soho (5 Noel St W1F 8GD),
Wembley (3 Wellers Way HA9 0UH): three London sites, one chain-wide guide, no per-site menus. 3 is the minimum for a full-macros chain.
Needs `pdftotext` (poppler). The text is read in the order the PDF stores it (name, "NNN kcal", "Ng fat", "Ng carbs", "Ng protein").

Numbers are copied as printed ("5.0", "1060", "8.1"); only names, categories and the hold-back list are written by hand. The script stops
if the guide changes shape (a new, renamed or removed dish, another number of dishes per section).

How the guide is read:
- Names: the section heading is added where the same dish name is printed in two sections (Green Curry Chicken is both an Omurice and a
  Rice bowl: "Green Curry Chicken Omurice", "Green Curry Chicken Rice Bowl"; noodle bowls get "Noodle Bowl", the three "Noodle Salad"
  dishes keep their printed name). Crunchy wraps print a sauce in bold at the start of each row ("Korean Sauce Tofu Wrap  Chicken Wrap
  Prawn Wrap") and the Chicken and Prawn wraps in that row are the same sauce: "Korean Sauce Chicken Wrap". Nothing else is renamed.
- No serving is stated, so `serving` stays blank. Salt, sugar and saturated fat are not printed: blank (never estimated).
- Tags: the guide marks nothing vegetarian, and no name says pork or beef, so no tags. Meat type is stated by every name except
  "Spicy Korean Bao" (filling not named).
- rankable: omurice, rice bowls, noodle bowls, crunchy wraps and loaded waffle fries are meals (true); bao buns and small snacks and
  sweet treats are not an order on their own (false).

Held back (docs/DATA.md holdback.csv; never corrected, never chosen between): the guide has copy-paste slips.
- 869 kcal / 48 g fat / 76 g carbs / 31 g protein is printed for THREE different dishes: Omurice "Katsu Crispy Shrimp Curry", Rice bowl
  "Katsu Crispy Shrimp Curry" and "Crispy Shrimp Tempura" (the other omurice and rice-bowl dishes differ by hundreds of kcal).
- 848 / 44 / 72 / 38 is printed for Omurice "Sweet & Sour Chicken" and Omurice "Teriyaki Chicken".
- Noodle bowls "Miso Roasted Chicken" (560 kcal, 5.7 g carbs) and "Teriyaki Chicken" (570 kcal, 5.6 g carbs): 4P + 4C + 9F comes to about
  350 and 330 kcal, so the carbohydrate cannot be right (probably 57 g and 56 g, but nothing is corrected).
The script finds these two kinds of problem itself (identical numbers on different dishes; calories more than 15% away from 4P+4C+9F) and
stops if the set it finds differs from HELD_BACK below, so a new guide is re-read by a person.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "buy-and-bite"
SOURCE_URL = "https://www.buyandbite.co.uk/_files/ugd/88035e_3b02e06dfeee4c43a4902f6be64b120c.pdf"
SOURCE_TITLE = "Buy & Bite Nutrition Guide (PDF created 3 October 2025)"
ALIASES = ["buy & bite", "buy and bite", "buy&bite", "buyandbite", "buy bite"]
NOTE = ("Buy & Bite prints calories, fat, carbs and protein for each dish in one guide for all three of its sites (no salt, sugar or "
        "saturated fat). Dishes whose figures repeat another dish's, or cannot add up, are not published.")
EXPECTED_SHA256 = "c8e22abd883f7f607788ec59f538db17fc824f4a0dee0916e675a0bb4e510b33"

HEADINGS = {"OMURICE": "Omurice", "RICE BOWLS": "Rice bowls", "NOODLE BOWLS": "Noodle bowls", "CRUNCHY WRAPS": "Crunchy wraps",
            "LOADED WAFFLE FRIES": "Loaded waffle fries", "BAO BUNS & SNACKS": "Bao buns & snacks", "SWEET TREATS": "Sweet treats"}
SUFFIX = {"Omurice": " Omurice", "Rice bowls": " Rice Bowl", "Noodle bowls": " Noodle Bowl"}
RANKABLE = {"Omurice": True, "Rice bowls": True, "Noodle bowls": True, "Crunchy wraps": True, "Loaded waffle fries": True,
            "Bao buns & snacks": False, "Sweet treats": False}
EXPECTED_COUNTS = {"Omurice": 6, "Rice bowls": 8, "Noodle bowls": 8, "Crunchy wraps": 12, "Loaded waffle fries": 3,
                   "Bao buns & snacks": 10, "Sweet treats": 2}
# id -> reason (checked against what the script finds)
HELD_BACK = {
    "katsu-crispy-shrimp-curry-omurice": "Printed 869 kcal/48 g fat/76 g carbs/31 g protein, identical to the Rice bowl 'Katsu Crispy Shrimp Curry' and to 'Crispy Shrimp Tempura': three different dishes with one set of numbers (copy-paste in the chain's guide).",
    "katsu-crispy-shrimp-curry-rice-bowl": "Printed 869 kcal/48 g fat/76 g carbs/31 g protein, identical to the Omurice 'Katsu Crispy Shrimp Curry' and to 'Crispy Shrimp Tempura': three different dishes with one set of numbers (copy-paste in the chain's guide).",
    "crispy-shrimp-tempura": "Printed 869 kcal/48 g fat/76 g carbs/31 g protein, identical to both 'Katsu Crispy Shrimp Curry' dishes (Omurice and Rice bowl): three different dishes with one set of numbers (copy-paste in the chain's guide).",
    "sweet-and-sour-chicken-omurice": "Printed 848 kcal/44 g fat/72 g carbs/38 g protein, identical to the Omurice 'Teriyaki Chicken': two different dishes with one set of numbers (copy-paste in the chain's guide).",
    "teriyaki-chicken-omurice": "Printed 848 kcal/44 g fat/72 g carbs/38 g protein, identical to the Omurice 'Sweet & Sour Chicken': two different dishes with one set of numbers (copy-paste in the chain's guide).",
    "miso-roasted-chicken-noodle-bowl": "Printed 560 kcal with 5.7 g carbs: 4 x protein + 4 x carbs + 9 x fat comes to about 350 kcal, so the carbohydrate figure cannot be right (not corrected).",
    "teriyaki-chicken-noodle-bowl": "Printed 570 kcal with 5.6 g carbs: 4 x protein + 4 x carbs + 9 x fat comes to about 332 kcal, so the carbohydrate figure cannot be right (not corrected).",
}

NUM = r"\d+(?:\.\d+)?"


def read_blocks(pdf: Path) -> list[dict]:
    text = subprocess.run(["pdftotext", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    section, names, cur, blocks = None, [], None, []
    for raw in text.replace("\f", "\n").splitlines():
        line = raw.strip()
        if not line or line == "NUTRITION GUIDE":
            continue
        if line in HEADINGS:
            if names or cur:
                raise SystemExit(f"A heading {line!r} came in the middle of a dish ({names}, {cur}): the layout changed")
            section = HEADINGS[line]
            continue
        m_kcal = re.fullmatch(rf"({NUM}) ?kcal", line)
        m_fat = re.fullmatch(rf"({NUM})g fat", line)
        m_carbs = re.fullmatch(rf"({NUM})g carbs", line)
        m_protein = re.fullmatch(rf"({NUM})g protein", line)
        if m_kcal:
            if cur is not None or not names or section is None:
                raise SystemExit(f"Unexpected calories line {line!r} (names so far {names}): the layout changed")
            cur = {"section": section, "printed": " ".join(names), "calories": m_kcal.group(1)}
        elif m_fat or m_carbs or m_protein:
            if cur is None:
                raise SystemExit(f"Nutrient line {line!r} with no dish: the layout changed")
            key, m = ("fat_g", m_fat) if m_fat else ("carbs_g", m_carbs) if m_carbs else ("protein_g", m_protein)
            if key in cur:
                raise SystemExit(f"{cur['printed']}: {key} printed twice")
            cur[key] = m.group(1)
            if m_protein:
                if not all(k in cur for k in ("fat_g", "carbs_g", "protein_g")):
                    raise SystemExit(f"{cur['printed']}: not all of fat, carbs and protein printed (order changed?)")
                blocks.append(cur)
                cur, names = None, []
        else:
            if cur is not None:
                raise SystemExit(f"Text {line!r} inside a dish block ({cur['printed']}): the layout changed")
            names.append(line)
    if cur is not None or names:
        raise SystemExit(f"The text ended inside a dish: {names} {cur}")
    return blocks


def build_items(blocks: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for b in blocks:
        counts[b["section"]] = counts.get(b["section"], 0) + 1
    if counts != EXPECTED_COUNTS:
        raise SystemExit(f"The guide changed: dishes per section are now {counts}, expected {EXPECTED_COUNTS}. Re-read it and update the script.")
    items, sauce = [], None
    for b in blocks:
        sec, printed = b["section"], b["printed"]
        name = printed
        if sec == "Crunchy wraps":
            if printed.endswith(" Tofu Wrap"):
                sauce = printed[: -len(" Tofu Wrap")]
            elif printed in ("Chicken Wrap", "Prawn Wrap"):
                if sauce is None:
                    raise SystemExit("A Chicken/Prawn wrap came before any sauce row: the layout changed")
                name = f"{sauce} {printed}"
            else:
                raise SystemExit(f"Unexpected wrap name {printed!r}")
        elif sec in SUFFIX and not printed.endswith("Salad"):
            name = printed + SUFFIX[sec]
        notes = f"Printed '{printed}' under {sec.upper()}" + ("; sauce taken from the row's first (bold) name" if sec == "Crunchy wraps" else "")
        items.append(dict(name=name, category=sec, calories=b["calories"], protein_g=b["protein_g"], carbs_g=b["carbs_g"],
                          fat_g=b["fat_g"], tags="", rankable=RANKABLE[sec], notes=notes))
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items


def find_problems(items: list[dict]) -> dict[str, str]:
    """Items the guide prints impossibly: the same four numbers on different dishes, or calories far from 4P+4C+9F."""
    found: dict[str, str] = {}
    by_numbers: dict[tuple, list[dict]] = {}
    for it in items:
        by_numbers.setdefault((it["calories"], it["fat_g"], it["carbs_g"], it["protein_g"]), []).append(it)
    for group in by_numbers.values():
        if len(group) > 1:
            for it in group:
                found[slug(it["name"])] = "identical numbers on different dishes"
    for it in items:
        k, p, c, f = (float(it[x]) for x in ("calories", "protein_g", "carbs_g", "fat_g"))
        energy = 4 * p + 4 * c + 9 * f
        if abs(k - energy) / k > 0.15:
            found[slug(it["name"])] = f"{k:g} kcal printed but 4P+4C+9F = {energy:.0f}"
    return found


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the Nutrition Guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    sha = sha256_file(args.pdf)
    print(f"PDF sha256 {sha}  {args.pdf}")
    if sha != EXPECTED_SHA256:
        print("NOTE: the file differs from the one this script was written against; the structure checks below decide if it is still read correctly.")
    items = build_items(read_blocks(args.pdf))
    problems = find_problems(items)
    if set(problems) != set(HELD_BACK):
        raise SystemExit(f"Problem rows changed. Found {sorted(problems)}, expected {sorted(HELD_BACK)}. Re-read the guide and update HELD_BACK.")
    ids = {slug(i["name"]) for i in items}
    if not set(HELD_BACK) <= ids:
        raise SystemExit(f"HELD_BACK names ids that do not exist: {sorted(set(HELD_BACK) - ids)}")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Buy & Bite", cuisine="Asian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=sorted(HELD_BACK.items()))
    print(f"wrote {len(items)} items ({len(items) - len(HELD_BACK)} publishable, {len(HELD_BACK)} held back) to {out}")
    for sec, n in EXPECTED_COUNTS.items():
        print(f"  {sec}: {n}")


if __name__ == "__main__":
    main()
