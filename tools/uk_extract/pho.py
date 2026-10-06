#!/usr/bin/env python3
"""Build data/source/pho/ from Pho's official UK "Nutritional Guidelines" PDF.

    python3 tools/uk_extract/pho.py path/to/Pho-Nutritional-Guidelines-2026_web.pdf --checked-on 2026-10-06

Source: https://pho-media.sp.works/wp-content/uploads/2026/04/Pho-Nutritional-Guidelines-2026_web.pdf
(linked from https://www.phocafe.co.uk/nutrition/; "accurate as of 31/01/2026"; one UK-wide guide, values per dish as served).

The PDF has a text layer. Numbers are read from it with `pdftotext -layout` and written exactly as printed (kcal, protein,
carbs, fat, saturates, fibre, sugar; the guide prints no salt, sodium or kJ). The only edits to a printed cell are
typographic: "< 0.5" becomes "<0.5" (the pipeline reads both the same) and the "*" footnote mark after the curries' fat is
dropped. Only the NAMES, categories, tags and the exclusions below are typed by hand, in the PDF's reading order. If Pho
adds, removes or reorders rows the row count or a row's printed label no longer matches ROWS and this script stops, so a
human re-checks ROWS against the PDF before running again.

Excluded printed rows (see X(...) entries): two sides where the guide prints two calorie values "a / b" (with / without
chillies) against ONE set of macros without saying which is which, and the cauliflower-rice rows (protein and carbs are
printed as "-"). Never filled in, never guessed. The second "broken rice portion" is an identical repeat and is dropped.
"""
import argparse
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "pho"
SOURCE_URL = "https://pho-media.sp.works/wp-content/uploads/2026/04/Pho-Nutritional-Guidelines-2026_web.pdf"
SOURCE_TITLE = "Pho Nutritional Guidelines 2026 (accurate as of 31/01/2026)"
PRINTED_DATE = "accurate as of 31/01/2026"

# categories in display order
ST, PH, HS, HO, CN, CU, RB, WR, WN, BN, SL, CR, SA, AD = (
    "Starters & sides", "Phở", "Hot & spicy soups", "House specials", "Curry noodle soup", "Curry", "Rice bowls",
    "Wok fried rice", "Wok fried noodles", "Vermicelli noodles (bún)", "Salads", "Crackers", "Sauces", "Add-ons")
CATEGORY_ORDER = [ST, PH, HS, HO, CN, CU, RB, WR, WN, BN, SL, CR, SA, AD]
# Curries and rice bowls are printed WITHOUT the rice they are served with (the rice is listed separately), so their
# numbers understate a real order. They are therefore not suggested by "Best for you" (rankable=false). Flip to True to
# rank them anyway.
RANK_RICE_DISHES = False
PORK, BEEF = "contains_pork", "contains_beef"
SAUCE_SERVING = "standard starter serving"  # the guide: "* Based on the standard starter serving"


def R(anchor, name, cat, *, vg=False, tags="", serving="", rankable=True, note=""):
    """One printed row we publish. `anchor` = text that must be in the row's printed label (diacritics and punctuation
    ignored; a leading "=" means the printed label on the number line must equal it). `vg` = the guide's own "vg" mark."""
    return dict(kind="item", anchor=anchor, name=name, cat=cat, vg=vg, tags=tags, serving=serving, rankable=rankable, note=note)


def X(anchor, reason, *, vg=False):
    """A printed row we deliberately leave out."""
    return dict(kind="exclude", anchor=anchor, reason=reason, vg=vg)


def DUP(anchor, of_name):
    """A printed row that repeats an earlier row exactly (checked); not published twice."""
    return dict(kind="dup", anchor=anchor, of=of_name, vg=False)


TWO_CAL = "guide prints two calorie values (a / b, with / without chillies) against one set of macros and does not say which is which"
NO_MACROS = "guide prints '-' for protein and carbs, so the required macros are missing"
RICE_NOTE = "Printed without the rice it is served with (rice is a separate row); not suggested by Best for you"
COCONUT = "Fat is printed with a '*' footnote mark (the guide's footnote is about coconut milk in the sauce); the mark is dropped, the number is as printed. " + RICE_NOTE

# One entry per printed nutrition row, in the PDF's reading order (the PDF's page 2 to page 8).
ROWS = [
    # page 2: starters & sides
    R("spring rolls cha gio veggie", "Spring rolls - Veggie (Chả giò)", ST, vg=True),
    R("spring rolls cha gio pork", "Spring rolls - Pork (Chả giò)", ST, tags=PORK),
    R("summer rolls veggie goi cuon", "Summer rolls - Veggie (Gỏi cuốn)", ST, vg=True),
    R("summer rolls chicken goi cuon", "Summer rolls - Chicken (Gỏi cuốn)", ST),
    R("summer rolls this isn t chicken goi cuon", "Summer rolls - THIS isn't chicken (Gỏi cuốn)", ST, vg=True),
    R("summer rolls prawn goi cuon", "Summer rolls - Prawn (Gỏi cuốn)", ST),
    R("chicken wings canh ga", "Chicken wings (Cánh gà)", ST),
    R("pork lemongrass meatballs nem nuong", "Pork & lemongrass meatballs (Nem nướng)", ST, tags=PORK),
    R("baby squid muc chien gion", "Baby squid (Mực chiên giòn)", ST),
    R("seafood spring roll nem hai san", "Seafood spring roll (Nem hải sản)", ST, tags=PORK,
      note="The guide's description says king prawn, crab and pork"),
    R("beef betel bo la lot", "Beef betel (Bò lá lốt)", ST, tags=BEEF),
    X("morning glory rau muong xao", TWO_CAL, vg=True),
    X("stir fried chinese leaf cai thao xao", TWO_CAL, vg=True),
    R("vietnamese pancake tofu banh xeo", "Vietnamese pancake - Tofu (Bánh xèo)", ST, vg=True),
    R("vietnamese pancake this isn t chicken banh xeo", "Vietnamese pancake - THIS isn't chicken (Bánh xèo)", ST, vg=True),
    R("vietnamese pancake chicken prawn banh xeo", "Vietnamese pancake - Chicken & Prawn (Bánh xèo)", ST),
    # page 3: phở classics, hot & spicy soups, house specials
    R("beef brisket pho chin", "Beef brisket (Phở chín)", PH, tags=BEEF),
    R("steak pho tai thinly sliced steak", "Steak (Phở tái)", PH, tags=BEEF),
    R("steak with garlic pho tai lan", "Steak with garlic (Phở tái lăn)", PH, tags=BEEF),
    R("beef combo pho bo combo", "Beef combo (Phở bò combo)", PH, tags=BEEF, note="The guide's description says steak, brisket and meatballs"),
    R("chicken pho ga", "Chicken (Phở gà)", PH),
    R("king prawns pho tom", "King prawns (Phở tôm)", PH),
    R("tofu button mushrooms pho chay", "Tofu & button mushrooms (Phở chay)", PH, vg=True),
    R("3 mushrooms pho nam rom", "3 Mushrooms (Phở nấm rơm)", PH, vg=True),
    R("hot spicy chicken bun ga hue", "Hot & spicy chicken (Bún gà Huế)", HS),
    R("hot spicy beef brisket bun bo hue", "Hot & spicy beef brisket (Bún bò Huế)", HS, tags=BEEF),
    R("hot spicy king prawn bun tom hue", "Hot & spicy king prawn (Bún tôm Huế)", HS),
    R("hot spicy this isn t chicken bun ga chay hue", "Hot & spicy THIS isn't chicken (Bún gà chay Huế)", HS, vg=True),
    R("hot spicy tofu mushroom bun chay hue", "Hot & spicy tofu & mushroom (Bún chay Huế)", HS, vg=True),
    R("hot spicy 3 mushrooms bun nam rom hue", "Hot & spicy 3 mushrooms (Bún nấm rơm Huế)", HS, vg=True),
    R("super green morning glory green beans", "Super Green", HO, vg=True),
    R("spicy green chicken", "Spicy Green - Chicken", HO),
    R("spicy green this isn t chicken", "Spicy Green - THIS isn't chicken", HO, vg=True),
    R("spicy green tofu", "Spicy Green - Tofu", HO, vg=True),
    # page 4: house specials (cont.), curry noodle soup
    R("brisket mushroom pho bo nam trung", "Brisket & mushroom (Phở bò nấm trúng)", HO, tags=BEEF,
      note="The guide's description says brisket in beef broth"),
    R("crab noodle soup bun rieu", "Crab noodle soup (Bún riêu)", HO, tags=BEEF, note="The guide's description says wafer thin steak and tofu"),
    R("pho house pho dac biet", "Phở house (Phở đặc biệt)", HO, tags=BEEF, note="The guide's description says king prawns, chicken and steak in beef broth"),
    R("beef brisket", "Curry noodle soup - Beef brisket", CN, tags=BEEF),
    R("chicken", "Curry noodle soup - Chicken", CN),
    R("king prawn", "Curry noodle soup - King prawn", CN),
    R("this isn t chicken", "Curry noodle soup - THIS isn't chicken", CN, vg=True),
    R("tofu mushroom", "Curry noodle soup - Tofu & mushroom", CN, vg=True),
    R("3 mushroom", "Curry noodle soup - 3 Mushroom", CN, vg=True),
    # page 5: curry (classic, spicy), rice
    R("chicken", "Classic curry - Chicken", CU, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("beef brisket", "Classic curry - Beef brisket", CU, tags=BEEF, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("king prawn", "Classic curry - King prawn", CU, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("fish", "Classic curry - Fish", CU, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("tofu", "Classic curry - Tofu", CU, vg=True, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("this isn t chicken", "Classic curry - THIS isn't chicken", CU, vg=True, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("chicken", "Spicy curry - Chicken", CU, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("beef brisket", "Spicy curry - Beef brisket", CU, tags=BEEF, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("king prawn", "Spicy curry - King prawn", CU, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("fish", "Spicy curry - Fish", CU, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("tofu", "Spicy curry - Tofu", CU, vg=True, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("this isn t chicken", "Spicy curry - THIS isn't chicken", CU, vg=True, rankable=RANK_RICE_DISHES, note=COCONUT),
    R("broken rice portion", "Broken rice portion", AD, serving="1 portion", rankable=False),
    X("cauliflower rice portion", NO_MACROS),
    # page 6: rice bowls, wok fried rice, wok fried noodles
    R("chargrilled chicken thigh", "Rice bowl - Chargrilled chicken thigh", RB, rankable=RANK_RICE_DISHES, note=RICE_NOTE),
    R("beef in betel leaf", "Rice bowl - Beef in betel leaf", RB, tags=BEEF, rankable=RANK_RICE_DISHES, note=RICE_NOTE),
    R("chargrilled pork", "Rice bowl - Chargrilled pork", RB, tags=PORK, rankable=RANK_RICE_DISHES, note=RICE_NOTE),
    R("3 meat combo", "Rice bowl - 3 Meat combo", RB, rankable=RANK_RICE_DISHES, note=RICE_NOTE + "; meat types not stated"),
    R("tofu veg", "Rice bowl - Tofu & veg", RB, vg=True, rankable=RANK_RICE_DISHES, note=RICE_NOTE),
    R("this isn t chicken veg", "Rice bowl - THIS isn't chicken & veg", RB, vg=True, rankable=RANK_RICE_DISHES, note=RICE_NOTE),
    DUP("broken rice portion", "Broken rice portion"),
    X("cauliflower rice portion", NO_MACROS),
    R("chicken dried shrimp", "Wok fried rice - Chicken & dried shrimp (Cơm chiên)", WR),
    R("shiitake thai basil", "Wok fried rice - Shiitake & Thai basil (Cơm chiên)", WR, vg=True),
    R("this isn t chicken", "Wok fried rice - THIS isn't chicken (Cơm chiên)", WR, vg=True),
    R("chicken", "Wok fried noodles - Chicken (Phở xào)", WN),
    R("beef", "Wok fried noodles - Beef (Phở xào)", WN, tags=BEEF),
    R("chicken prawn", "Wok fried noodles - Chicken & Prawn (Phở xào)", WN),
    R("tofu mushroom", "Wok fried noodles - Tofu & Mushroom (Phở xào)", WN, vg=True),
    R("this isn t chicken", "Wok fried noodles - THIS isn't chicken (Phở xào)", WN, vg=True),
    # page 7: vermicelli noodles (bún)
    R("chicken", "Wok-fried bún - Chicken", BN),
    R("beef", "Wok-fried bún - Beef", BN, tags=BEEF),
    R("king prawn", "Wok-fried bún - King Prawn", BN),
    R("nem nuong pork balls", "Wok-fried bún - Nem Nướng Pork Balls", BN, tags=PORK),
    R("tofu mushroom", "Wok-fried bún - Tofu & Mushroom", BN, vg=True),
    R("veggie spring rolls", "Wok-fried bún - Veggie Spring Rolls", BN, vg=True),
    R("this isn t chicken", "Wok-fried bún - THIS isn't chicken", BN, vg=True),
    R("chargrilled chicken thigh", "Grilled bún - Chargrilled chicken thigh", BN),
    R("chargrilled pork loin", "Grilled bún - Chargrilled pork loin", BN, tags=PORK),
    R("beef in betel leaf", "Grilled bún - Beef in betel leaf", BN, tags=BEEF),
    R("3 meat combo", "Grilled bún - 3 meat combo", BN, note="Meat types not stated"),
    R("single vegetarian spring roll", "Single vegetarian spring roll", AD, serving="1 spring roll", rankable=False, tags="vegetarian",
      note="Tagged vegetarian because the guide's own item name says so (it has no 'vg' mark)"),
    R("cha ca la vong", "Chả cá Lã Vọng", BN),
    # page 8: salads, crackers, sauces
    R("chicken salad goi ga", "Chicken salad (Gỏi gà)", SL),
    R("this isn t chicken salad goi ga", "THIS isn't chicken salad (Gỏi gà)", SL, vg=True),
    R("veggie salad goi chay", "Veggie salad (Gỏi chay)", SL, vg=True),
    R("green papaya salad chicken goi du du", "Green papaya salad - Chicken (Gỏi đu đủ)", SL),
    R("green papaya salad this isn t chicken goi du du", "Green papaya salad - THIS isn't chicken (Gỏi đu đủ)", SL, vg=True),
    R("green papaya salad prawn goi du du", "Green papaya salad - Prawn (Gỏi đu đủ)", SL),
    R("prawn cracker portion served with green papaya salad", "Prawn cracker portion (with Green papaya salad)", AD, serving="1 portion", rankable=False),
    R("mango salad goi xoai", "Mango salad (Gỏi xoài)", SL, tags=PORK, note="The guide's description says topped with pork, dried shrimp and peanuts"),
    R("prawn pomelo salad goi buoi", "Prawn & pomelo salad (Gỏi bưởi)", SL),
    R("prawn crackers banh phong tom", "Prawn crackers with sweet chilli sauce (Bánh phồng tôm)", CR, rankable=False),
    R("prawnless crackers banh phong chay", "Prawnless crackers with sweet chilli sauce (Bánh phồng chay)", CR, vg=True, rankable=False),
    R("=nuoc cham", "Nước chấm", SA, serving=SAUCE_SERVING, rankable=False),
    R("=nuoc cham chay", "Nước chấm chay", SA, serving=SAUCE_SERVING, rankable=False),
    R("=peanut", "Peanut sauce", SA, serving=SAUCE_SERVING, rankable=False),
    R("=ginger soy", "Ginger soy sauce", SA, serving=SAUCE_SERVING, rankable=False),
    R("=sweet chilli", "Sweet chilli sauce", SA, serving=SAUCE_SERVING, rankable=False),
]

# Oddities in the printed numbers, by item name. They go in the (unexported) notes column; every value is entered as printed.
# The pipeline's energy warnings (calories vs 4P+4C+9F) are exactly the six "calories" entries below.
ANOMALIES = {
    "Spicy curry - Tofu": "Printed calories (789) are about 28% above what 4P+4C+9F gives (572); the classic tofu curry prints 769 kcal with 60.4 g fat",
    "Rice bowl - Chargrilled chicken thigh": "Printed calories (239) are about 24% below what 4P+4C+9F gives (296); fibre and sugar are printed as the same number (3.8)",
    "Rice bowl - Chargrilled pork": "Printed calories (281) are about 23% above what 4P+4C+9F gives (218)",
    "Rice bowl - THIS isn't chicken & veg": "Printed calories (205) are about 31% below what 4P+4C+9F gives (268)",
    "Prawnless crackers with sweet chilli sauce (Bánh phồng chay)": "Printed calories (320) are about 20% above what 4P+4C+9F gives (254); protein, carbs, fat, saturates and fibre are printed identical to the prawn crackers row, which prints 253 kcal",
    "Broken rice portion": "Printed calories (370) are about 18% below what 4P+4C+9F gives (437). The guide prints this row twice (curry page and rice bowl page), identical both times",
    "Chicken wings (Cánh gà)": "Sugar (0.29) is printed higher than carbohydrate (0.2), and fibre (1.2) higher than carbohydrate",
    "Nước chấm": "Sugar (5.49) is printed higher than carbohydrate (5.19); calories printed to one decimal",
    "Nước chấm chay": "Sugar (4.5) is printed higher than carbohydrate (4.41); calories printed to one decimal",
    "Ginger soy sauce": "Calories printed to one decimal",
    "Sweet chilli sauce": "Calories printed to one decimal",
    "Hot & spicy chicken (Bún gà Huế)": "Fat and fibre are printed as the same number (3.1)",
    "Spicy Green - THIS isn't chicken": "Fat and fibre are printed as the same number (12.5)",
    "Wok-fried bún - King Prawn": "Fat and sugar are printed as the same number (3.8)",
    "Chicken salad (Gỏi gà)": "Saturates and fibre are printed as the same number (1.3)",
}

# Items the guide prints impossibly: (item id, reason). Nothing is corrected. The guide's inconsistencies above are moderate
# (a fifth to a third off, unlike the 3x-10x errors held back for other chains), so none are held back.
HOLDBACK: list[tuple[str, str]] = []

# Limits printed in the guide's own section headings and footnotes: starters "Excludes dipping sauces", curry and rice bowls
# "Excludes rice (see below)", bún "* All exclude veggie spring roll"; noodles, bún and salads "Includes sauces / dressings".
NOTE = ("Values are per dish as served; the guide says they vary slightly because dishes are cooked to order. "
        "Starters exclude dipping sauces. Curries and rice bowls exclude the rice they are served with (rice is listed separately). "
        "Vermicelli (bún) dishes exclude the veggie spring roll.")

# ---------------------------------------------------------------- reading the PDF

CAL = r"\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)?"
VAL = r"<\s?\d+(?:\.\d+)?|\d+(?:\.\d+)?\*?|-"
ROW_RE = re.compile(rf"^(?P<own>.*?)(?:^|\s{{2,}})(?P<cal>{CAL})\s+" + r"\s+".join(f"(?P<{k}>{VAL})" for k in ("p", "c", "f", "s", "fi", "su")) + r"\s*$")


def norm(text: str) -> str:
    """Lower-case, no diacritics, punctuation to single spaces: for comparing printed labels with our anchors."""
    t = unicodedata.normalize("NFKD", text.replace("đ", "d").replace("Đ", "D"))
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def ascii_slug(name: str) -> str:
    t = unicodedata.normalize("NFKD", name.replace("đ", "d").replace("Đ", "D"))
    return slug("".join(ch for ch in t if not unicodedata.combining(ch)))


def read_text(pdf: Path) -> str:
    return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout


def read_rows(text: str) -> list[dict]:
    """Every line that ends in the 7 printed numbers, in reading order, with the label text around it."""
    lines = text.split("\n")
    hits = []
    for i, line in enumerate(lines):
        m = ROW_RE.match(line.strip())
        if m:
            hits.append((i, m))
    rows = []
    for n, (i, m) in enumerate(hits):
        prev_i = hits[n - 1][0] if n else -1
        next_i = hits[n + 1][0] if n + 1 < len(hits) else len(lines)
        ctx = " ".join(lines[prev_i + 1:i + 1])
        around = " ".join(lines[prev_i + 1:next_i])
        vals = {k: re.sub(r"\s+", "", m.group(k)) for k in ("cal", "p", "c", "f", "s", "fi", "su")}
        rows.append({"own": norm(m.group("own")), "ctx": norm(ctx), "around": norm(around), "raw": vals})
    return rows


def clean(cell: str, *, allow_star: bool = False) -> str:
    """A printed cell as stored: '-' (not printed) becomes blank, the curries' '*' footnote mark is dropped."""
    if cell == "-":
        return ""
    if cell.endswith("*"):
        if not allow_star:
            raise SystemExit(f"unexpected '*' on {cell!r}")
        cell = cell[:-1]
    return cell


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live menu")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    text = read_text(args.pdf)
    if PRINTED_DATE not in text:
        print(f"The PDF no longer says '{PRINTED_DATE}': update SOURCE_TITLE and re-check ROWS against the new guide.", file=sys.stderr)
        return 1
    rows = read_rows(text)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}. The layout or menu changed: "
              "re-check ROWS against the PDF before running again.", file=sys.stderr)
        return 1

    items, seen_values = [], {}
    for n, (printed, spec) in enumerate(zip(rows, ROWS), start=1):
        anchor = spec["anchor"]
        exact = anchor.startswith("=")
        a = norm(anchor.lstrip("="))
        ok = (printed["own"] == a if exact else a in (printed["own"] if printed["own"] else printed["ctx"]))
        if not ok:
            print(f"Row {n}: expected a printed label containing {anchor!r} but the PDF row reads "
                  f"{(printed['own'] or printed['ctx'])[-90:]!r}. The order or names changed: re-check ROWS.", file=sys.stderr)
            return 1
        if spec["vg"] and not re.search(r"\bvg\b", printed["around"]):
            print(f"Row {n} ({anchor!r}) is marked vg in ROWS but no 'vg' is printed near it.", file=sys.stderr)
            return 1
        raw = printed["raw"]
        if spec["kind"] == "exclude":
            continue
        if spec["kind"] == "dup":
            if seen_values.get(spec["of"]) != raw:
                print(f"Row {n} is meant to repeat {spec['of']!r} exactly but the numbers differ.", file=sys.stderr)
                return 1
            continue
        for key in ("cal", "p", "c", "f"):
            if not re.fullmatch(r"<\d+(?:\.\d+)?|\d+(?:\.\d+)?\*?", raw[key]):
                print(f"Row {n} ({spec['name']}): required value {key} is printed as {raw[key]!r}: add it to the exclusions.", file=sys.stderr)
                return 1
        seen_values[spec["name"]] = raw
        star = raw["f"].endswith("*")
        tags = "|".join(dict.fromkeys((["vegetarian"] if spec["vg"] else []) + [t for t in spec["tags"].split("|") if t]))
        items.append({
            "id": ascii_slug(spec["name"]), "name": spec["name"], "category": spec["cat"], "serving": spec["serving"],
            "calories": clean(raw["cal"]), "protein_g": clean(raw["p"]), "carbs_g": clean(raw["c"]), "fat_g": clean(raw["f"], allow_star=star),
            "sat_fat_g": clean(raw["s"]), "sodium_mg": "", "salt_g": "", "sugar_g": clean(raw["su"]), "fiber_g": clean(raw["fi"]),
            "tags": tags, "limited_time": False, "rankable": spec["rankable"], "notes": spec["note"],
        })

    # the "vg" marks: every printed mark (outside the legend and the one section note) must belong to a row we know about
    marks = len(re.findall(r"\bvg\b", text)) - text.count("vg - vegan friendly dishes") - text.count("vg dish served with")
    expected = sum(1 for s in ROWS if s["vg"])
    if marks != expected:
        print(f"The PDF has {marks} 'vg' marks on rows but ROWS marks {expected}: re-check the vegetarian tags.", file=sys.stderr)
        return 1

    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    unknown = set(ANOMALIES) - {i["name"] for i in items}
    assert not unknown, f"ANOMALIES names no published item: {sorted(unknown)}"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    for i in items:
        i["notes"] = "; ".join(n for n in (i["notes"], ANOMALIES.get(i["name"], "")) if n)

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Pho", cuisine="Vietnamese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["pho", "phở", "pho cafe"], items=items, out=args.out, note=NOTE, holdback=HOLDBACK)
    print(f"wrote {len(items)} items to {out} (PDF sha256 {sha256_file(args.pdf)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
