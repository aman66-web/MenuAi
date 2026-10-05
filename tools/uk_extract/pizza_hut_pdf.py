"""Read Pizza Hut Restaurants UK's official "Dietary Information" booklet (allergen + nutrition PDF).

Used by tools/uk_extract/pizza_hut.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.00", "7.0", "618.6") so nothing is converted or estimated here.

Two readers:
  read_nutrition_events(pdf) -> the nutrition tables (PDF pages 10-13) as an ordered list of
      ("heading", text) and ("row", name, [numbers as printed]) events;
  read_dietary(pdf)          -> the allergen tables' "Suitable for?" columns, keyed by (section, dish name).
"""
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
# A nutrition row: a name, a wide gap, then 8 numbers (portion tables) or 9 numbers (pizza tables: slices first).
ROW = re.compile(rf"^\s*(?P<name>\S.*?)\s{{2,}}(?P<nums>(?:{NUM}\s+){{7,8}}{NUM})\s*$")
# Page furniture and table header words that are not headings.
NOISE = re.compile(
    r"Pizza Hut Restaurants|^\s*Nutrition Information\s*$|Page \d+ of \d+|Product Name|Energy per|Protein per|protein per|"
    r"Weight of|Average [Ww]eight|Portion \(|Slice \(|Slices per|\(kcal\)|Carbohydra|carbohydrate|Saturate|saturated|"
    r"Fat per|fat per|Salt per|salt per|Sugar per|sugar per|^\s*Number of\s*$|^\s*Weight \(g\)|per 100g|^\s*\(g\)\s*$|^\s*Portion\s*$|"
    r"^\s*100g \(kcal\)"
)

NUTRITION_PAGES = (10, 13)  # first and last PDF page of the nutrition tables
DIETARY_PAGES = (2, 4)      # allergen tables ("Suitable for?")


def _page_text(pdf: Path, page: int) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         check=True, capture_output=True, text=True).stdout
    return out.split("\n")


def read_nutrition_events(pdf: Path) -> list[tuple]:
    events: list[tuple] = []
    for page in range(NUTRITION_PAGES[0], NUTRITION_PAGES[1] + 1):
        lines = _page_text(pdf, page)
        if not any(l.strip() == "Nutrition Information" for l in lines):
            raise SystemExit(f"PDF page {page} is no longer a 'Nutrition Information' page: the booklet layout changed.")
        for line in lines:
            if not line.strip():
                continue
            m = ROW.match(line)
            if m:
                events.append(("row", re.sub(r"\s+", " ", m["name"]).strip(), m["nums"].split()))
            elif not NOISE.search(line):
                events.append(("heading", re.sub(r"\s+", " ", line).strip()))
    return events


# Section headings of the allergen tables that we need, in the booklet's words (matched as "starts with").
DIETARY_SECTIONS = [
    "Sides", "Tabletop Sauces", "Dips", "Takeaway Dips", "Salad Station", "Dressed Salad Lines", "Fresh Salad Lines",
    "Dry Items", "Dressings", "Pizza Bases", "Pizza Base Sauces", "Cheese", "Pizza Toppings", "Pizza Finishers",
    "Pizza Combinations", "Lites (Flatbread) Combinations", "Buffet Pizza", "Buffet Sides", "Kids Mains", "Desserts",
    "Ice Cream Factory", "Drinks", "Hot Drinks", "Alcoholic Drinks", "Alcohol Free",
]
DIETARY_ROW = re.compile(r"^\s*(?P<name>\S.*?)\s{2,}(?P<veg>Yes|No)\s+(?P<vegan>Yes|No)\s+(?P<coeliac>Yes|No)(?:\s|$)")


def read_dietary(pdf: Path) -> dict[tuple[str, str], tuple[str, str, str]]:
    """(section, dish name) -> (vegetarian, vegan, coeliac) as printed ("Yes"/"No")."""
    found: dict[tuple[str, str], tuple[str, str, str]] = {}
    section = ""
    for page in range(DIETARY_PAGES[0], DIETARY_PAGES[1] + 1):
        for line in _page_text(pdf, page):
            m = DIETARY_ROW.match(line)
            if m:
                key = (section, re.sub(r"\s+", " ", m["name"]).strip())
                if key in found:
                    raise SystemExit(f"Allergen table lists {key} twice: the booklet layout changed.")
                found[key] = (m["veg"], m["vegan"], m["coeliac"])
                continue
            text = re.sub(r"\s+", " ", line).strip()
            for s in DIETARY_SECTIONS:
                if text == s or text.startswith(s + " ("):
                    section = s
                    break
    return found
