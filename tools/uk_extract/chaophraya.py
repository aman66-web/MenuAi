#!/usr/bin/env python3
"""Build data/source/chaophraya/ from Chaophraya's allergen and calorie page hosted by Ten Kites (a CALORIES-ONLY chain).

    python3 tools/uk_extract/chaophraya.py --page DIR/menu_a.html --checked-on 2026-10-09 [--fetch] [--ten-kites-only] [--out DIR]

Source: https://menus.tenkites.com/tlg/chaophraya04 ("A La Carte", Thai Leisure Group's page, no date shown). robots.txt there only
disallows /fonts/, /views/ and *.less. The page lists 93 dishes in 10 sections; 91 show "- 559 kcal" beside the name (a thousands comma in
three of them: "1,010 kcal") and every dish has a pop-up with "Contains:" / "May contain:" lines. It prints no protein, carbs, fat or any other
nutrient, so protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"). Calories are copied exactly as printed; `serving` stays
blank (the page says nothing about portions). Only the A La Carte menu is read (the chain's other menus are separate pages).

Restaurants (checked 2026-10-09 on the chain's own site, https://chaophraya.co.uk/): six, all in Great Britain: Aberdeen, Birmingham, Edinburgh,
Glasgow, Leeds, Newcastle (each has /thai-restaurant/<town>/menus). The chain's robots.txt only disallows /typo3/.

SOURCE PROBLEM FOUND 2026-10-09 (read this before banking): the Ten Kites page is not linked from chaophraya.co.uk. Every restaurant's
own menu page links "ALLERGENS & CALORIES" to its own igfd.menu page (chaophraya_current_page.py holds what those six pages print), and:
  * the Ten Kites page is an OLDER copy of the menu: it prints "Khao Kriab Tod", "Taco Gai", "Poh Pia Pak Tod"... where the chain's
    current menu (A La Carte PDF dated July 2026, and the igfd.menu pages) says "Khao Kriab Goong", "Tacos Gai", "Poh Pia Pak", ...;
  * the chain's current pages carry calories for very few dishes: the five restaurants on the Estate menu (Aberdeen, Birmingham, Glasgow, Leeds,
    Newcastle: identical feeds) for 8 of 74 dishes, Edinburgh (its own menu, different recipes) for 60 of 76;
  * where they overlap the two sources disagree: of the 8 Estate dishes with calories, 5 equal the Ten Kites figure and 3 do not (vegan prawn
    crackers 254 vs 469, chicken tacos 307 vs 362, vegetable tacos 312 vs 313); Edinburgh's page prints different figures again for most
    dishes both have (Pad Thai chicken 970 vs 825, Khao Soi Gai 1,250 vs 1,010, ...).
Neither page is chosen over the other: by default a dish is published ONLY when the Ten Kites page and the chain's current Estate page print the
same calories for the same dish (the dish is named by ITEMS below: same Thai name, or the same description where the chain renamed it), the
Edinburgh page does not print a different figure, and the allergens agree. Every other dish stays in items.csv but is listed in holdback.csv with
the reason (delete a line there to restore it). With --ten-kites-only the "not confirmed" holds are skipped and every dish the Ten Kites page prints is
published (the founder's call), but a dish whose figure the chain's current page CONTRADICTS stays held back either way.

The dishes ITEMS names with a current-page counterpart (the last two arguments) and why they are the same dish:
  Khao Kriab Tod / KHAO KRIAB TOD (vegan)  = KHAO KRIAB GOONG / KHAO KRIAB GOONG JAY: identical descriptions ("Thai Prawn Crackers", "Vegan Thai
      Prawn Crackers"); the July 2026 menu PDF prints the "Goong" names and the same descriptions.
  Taco Gai / Taco Pak = TACOS GAI (Chicken) / TACOS PAK (Vegetable): "Chicken / Vegetable Thai Tacos, our signature red curry" on both.
  Pad Prik Tai Dum (Beef - Black Pepper Sauce) = NUEA PAD PRIK TAI DUM Beef Black Pepper: same description "Stir-fried with garlic, onion, mushroom(s),
      carrot and peppers"; Pad Met Mamuang Himmapan (Vegan Chicken / Tofu) = the same names with the protein at the end.
  Gai Pad Met Mamuang Himmapan: the same name on both.

What the script does with the printed allergens: each dish's "Contains" and "May contain" lines are read with the shared helpers (common.allergen_words,
tenkites_c._keys) and checked against the label ids on the dish (the page's own allergen filter names them): the two must agree for every dish or
the run stops. Three dishes (Gaeng Panang, Gaeng Keow Wan chicken, Gaeng Ped Yang) have no allergen or dietary label at all, so their allergens are
unknown and they are left out. Two dishes print no calories ("Pad Thai Lobster", "Hor Mok Pla & Lobster Panang": both say "Exclusively for Chaophraya
Edinburgh only") and are left out. For a dish that is published, its allergens must also equal the Estate page's (and Edinburgh's, where it has the
dish) UK-14 allergens or it is held back.

Names: the page prints Thai names with the English dish in the description, several times over with only the protein differing; ITEMS gives each
dish a name that tells them apart (typed by hand, checked against the page on every run: section, printed name and the start of the description
must match, in order). The page marks 7 dishes with "✩" and some with chilli marks: dropped (the page prints no legend for "✩"). Tags: vegetarian
when the page marks the dish Vegetarian or Vegan; contains_pork / contains_beef when the name or description says so. Run python with -I when
reading saved pages. Python 3.9 compatible.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
import chaophraya_current_page as cur  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "chaophraya"
URL = "https://menus.tenkites.com/tlg/chaophraya04"
SOURCE_TITLE = "Chaophraya A La Carte allergen and calorie page (Ten Kites, accessed {date}, no date shown)"
ALLERGEN_TITLE = "Chaophraya A La Carte allergen information (Ten Kites)"
ALIASES = ["chaophraya", "chaophraya thai restaurant", "chaophraya thai", "chao phraya"]
EXPECTED_DISHES = 93
EXPECTED_SECTIONS = ["Nibbles", "Sharing Platters", "Small Plates", "Thai Soups", "Salads", "Noodles and Rice", "Curry", "Stir-Fry", "Grill", "Sides"]
MARKS = re.compile("[\U0001F336️✩♥]")  # chilli marks, "✩" and heart printed beside names
ENERGY = re.compile(r"^- ([\d,]+) kcal$")
SUITABLE = {"52": "Vegan", "50": "Vegetarian"}
GENERIC_NUTS_ID = "29"  # the page's own generic "Nuts" label (not one of the labels its allergen filter offers): read as tree nuts, as for Thaikhun
RESTAURANTS = "Aberdeen, Birmingham, Edinburgh, Glasgow, Leeds, Newcastle"


def E(section, printed, desc_start, name, estate=None, edinburgh=None):
    return {"section": section, "printed": printed, "desc_start": desc_start, "name": name, "estate": estate, "edinburgh": edinburgh}


ITEMS = [  # (section, name as printed without marks, start of the description, name shown, same dish on the current Estate page, on Edinburgh's page)
    E('Nibbles', 'Khao Kriab Tod', 'Thai Prawn Crackers / Wi', 'Khao Kriab Tod (Thai Prawn Crackers)', 'KHAO KRIAB GOONG', 'KHAO KRIAB GOONG'),
    E('Nibbles', 'KHAO KRIAB TOD', 'Vegan Thai “Prawn” Crack', 'Khao Kriab Tod (Vegan Thai Prawn Crackers)', 'KHAO KRIAB GOONG JAY', 'KHAO KRIAB GOONG JAY'),
    E('Nibbles', 'Thai Spiced Cashews', 'CP Bar Snack', 'Thai Spiced Cashews'),
    E('Nibbles', 'Chilli Crackers', 'CP Bar Snack', 'Chilli Crackers'),
    E('Sharing Platters', 'Chaophraya Platter', 'Our classic starter sele', 'Chaophraya Platter'),
    E('Sharing Platters', 'Ted Sakarn Jay', 'Sweetcorn cakes, vegetab', 'Ted Sakarn Jay Platter'),
    E('Sharing Platters', 'White Lotus Platter', 'A premium platter featur', 'White Lotus Platter'),
    E('Small Plates', 'Satay Gai', 'Chicken Satay Chaophraya', 'Satay Gai (Chicken Satay)'),
    E('Small Plates', 'King Prawn Satay', 'Satay Chaophraya Style /', 'King Prawn Satay'),
    E('Small Plates', 'POH PIA GAI', 'Chicken Spring Rolls / W', 'Poh Pia Gai (Chicken Spring Rolls)'),
    E('Small Plates', 'Poh Pia Pak Tod', 'Vegetable Spring Rolls /', 'Poh Pia Pak Tod (Vegetable Spring Rolls)'),
    E('Small Plates', 'KHANOM JEEP', 'Steamed Dumplings / Hand', 'Khanom Jeep (Steamed Dumplings)'),
    E('Small Plates', 'Goong Choop Pang Tod', 'King Prawn Tempura / Wit', 'Goong Choop Pang Tod (King Prawn Tempura)'),
    E('Small Plates', 'Pak Choop Pang Tod', 'Vegetable Tempura / With', 'Pak Choop Pang Tod (Vegetable Tempura)'),
    E('Small Plates', 'TACO GAI', 'Chicken Thai Tacos / Our', 'Taco Gai (Chicken Thai Tacos)', 'TACOS GAI (Chicken)', 'TACOS GAI (Chicken)'),
    E('Small Plates', 'Taco Pak', 'Vegetable Thai Tacos / V', 'Taco Pak (Vegetable Thai Tacos)', 'TACOS PAK (Vegetable)', 'TACOS PAK (Vegetable)'),
    E('Small Plates', 'See Krong Moo Yang', 'Pork Spare Ribs / Marina', 'See Krong Moo Yang (Pork Spare Ribs)'),
    E('Small Plates', 'TOD MAN KHAO POHD', 'Sweetcorn Cakes / Sweetc', 'Tod Man Khao Pohd (Sweetcorn Cakes)'),
    E('Small Plates', 'MUEK PRIK KLUEA', 'Salt & Pepper Squid / Wi', 'Muek Prik Kluea (Salt & Pepper Squid)'),
    E('Small Plates', 'MOO GROB', 'Crispy Belly Pork / With', 'Moo Grob (Crispy Belly Pork)'),
    E('Small Plates', 'HOY SHELL YANG', 'Pan-seared Scallop on Sc', 'Hoy Shell Yang (Scallop on Scottish Black Pudding)'),
    E('Thai Soups', 'Tom Yum', 'Hot and Sour Soup / Chic', 'Tom Yum Chicken (Hot and Sour Soup)'),
    E('Thai Soups', 'Tom Yum', 'Hot and Sour Soup / King', 'Tom Yum King Prawn (Hot and Sour Soup)'),
    E('Thai Soups', 'Tom Yum', 'Hot and Sour Soup / Mush', 'Tom Yum Mushroom (Hot and Sour Soup)'),
    E('Thai Soups', 'Tom Kha', 'Coconut Milk Soup / Chic', 'Tom Kha Chicken (Coconut Milk Soup)'),
    E('Thai Soups', 'Tom Kha', 'Coconut Milk Soup / King', 'Tom Kha King Prawn (Coconut Milk Soup)'),
    E('Thai Soups', 'Tom Kha', 'Coconut Milk Soup / Mush', 'Tom Kha Mushroom (Coconut Milk Soup)'),
    E('Salads', 'Som Tum', 'Papaya Salad / Shredded ', 'Som Tum (Papaya Salad, dried shrimps recipe)'),
    E('Salads', 'Som Tum', 'Papaya Salad / Shredded ', 'Som Tum (Papaya Salad, other recipe)'),
    E('Salads', 'Yum Ped Grob', 'Crispy Duck Salad / With', 'Yum Ped Grob (Crispy Duck Salad)'),
    E('Salads', 'PLA GOONG', 'Zesty Aromatic King Praw', 'Pla Goong (Zesty Aromatic King Prawn Salad)'),
    E('Salads', 'YUM NUEA', 'Weeping Tiger Salad / Si', 'Yum Nuea (Weeping Tiger Salad)'),
    E('Noodles and Rice', 'Khao Pad Ka Prao', 'Chicken - Thai Basil Fri', 'Khao Pad Ka Prao Chicken (Thai Basil Fried Rice)'),
    E('Noodles and Rice', 'Khao Pad Ka Prao Nuea', 'Thai Basil Fried Rice Be', 'Khao Pad Ka Prao Nuea (Thai Basil Fried Rice Beef)'),
    E('Noodles and Rice', 'KHAO PAD KA PRAO', 'Belly Pork - Thai Basil ', 'Khao Pad Ka Prao Belly Pork (Thai Basil Fried Rice)'),
    E('Noodles and Rice', 'Khao Pad Ka Prao', 'King Prawn - Thai Basil ', 'Khao Pad Ka Prao King Prawn (Thai Basil Fried Rice)'),
    E('Noodles and Rice', 'Udon Pad Kee Mao Talay', 'Seafood Udon Noodles / W', 'Udon Pad Kee Mao Talay (Seafood Udon Noodles)'),
    E('Noodles and Rice', 'Khao Pad Sapparod', 'King Prawn Pineapple Fri', 'Khao Pad Sapparod (King Prawn Pineapple Fried Rice)'),
    E('Noodles and Rice', 'PAD MEE SUA', 'Chicken - Stir-Fried Egg', 'Pad Mee Sua Chicken (Stir-Fried Egg Noodles)'),
    E('Noodles and Rice', 'PAD MEE SUA', 'Belly Pork - Stir-Fried ', 'Pad Mee Sua Belly Pork (Stir-Fried Egg Noodles)'),
    E('Noodles and Rice', 'PAD MEE SUA', 'Vegan Chicken - Stir-Fri', 'Pad Mee Sua Vegan Chicken (Stir-Fried Egg Noodles)'),
    E('Noodles and Rice', 'Pad Thai', 'Chicken Pad Thai / Our s', 'Pad Thai Chicken'),
    E('Noodles and Rice', 'Pad Thai', 'Belly Pork Pad Thai / Ou', 'Pad Thai Belly Pork'),
    E('Noodles and Rice', 'Pad Thai', 'King Prawn Pad Thai / Ou', 'Pad Thai King Prawn'),
    E('Noodles and Rice', 'Pad Thai', 'Tofu Pad Thai / Our stap', 'Pad Thai Tofu'),
    E('Noodles and Rice', 'Pad Thai', 'Vegan Chicken Pad Thai /', 'Pad Thai Vegan Chicken'),
    E('Noodles and Rice', 'Pad Thai Lobster', 'Traditional Pad Thai wra', 'Pad Thai Lobster'),
    E('Curry', 'Gaeng Massaman', 'Royal Lamb Massaman / So', 'Gaeng Massaman (Royal Lamb Massaman)'),
    E('Curry', 'Gaeng Panang', 'Beef Panang / Our most c', 'Gaeng Panang (Beef Panang)'),
    E('Curry', 'Khao Soi Gai', 'Breaded Chicken and Nood', 'Khao Soi Gai (Breaded Chicken and Noodle Curry)'),
    E('Curry', 'KHAO SOI NUEA', 'Beef Curry Noodles / A r', 'Khao Soi Nuea (Beef Curry Noodles)'),
    E('Curry', 'Gaeng Keow Wan', 'Chicken Thai Green / Our', 'Gaeng Keow Wan Chicken (Thai Green)'),
    E('Curry', 'Gaeng Keow Wan', 'Vegan Chicken Thai Green', 'Gaeng Keow Wan Vegan Chicken (Thai Green Curry)'),
    E('Curry', 'Gaeng Keow Wan', 'Tofu Thai Green Curry / ', 'Gaeng Keow Wan Tofu (Thai Green Curry)'),
    E('Curry', 'Gaeng Ped Yang', 'Roast Duck Thai Red / Wi', 'Gaeng Ped Yang (Roast Duck Thai Red)'),
    E('Curry', 'Thai Red Curry', 'Butternut squash, spinac', 'Thai Red Curry (Butternut Squash, Spinach)'),
    E('Curry', 'GAENG HUNG LAY', 'Slow-Cooked Belly Pork C', 'Gaeng Hung Lay (Slow-Cooked Belly Pork Curry)'),
    E('Curry', 'Gaeng Hung Lay', 'Sous Vide Beef / Authent', 'Gaeng Hung Lay (Sous Vide Beef)'),
    E('Stir-Fry', 'Pad Ka Prao', 'Chicken - Chilli with Th', 'Pad Ka Prao Chicken (Chilli with Thai Basil)'),
    E('Stir-Fry', 'Pad Ka Prao', 'Beef - Chilli with Thai ', 'Pad Ka Prao Beef (Chilli with Thai Basil)'),
    E('Stir-Fry', 'Pad Ka Prao', 'Belly Pork - Chilli with', 'Pad Ka Prao Belly Pork (Chilli with Thai Basil)'),
    E('Stir-Fry', 'Pad Ka Prao', 'King Prawn - Chilli with', 'Pad Ka Prao King Prawn (Chilli with Thai Basil)'),
    E('Stir-Fry', 'Pad Ka Prao', 'Crispy Aubergine - Chill', 'Pad Ka Prao Crispy Aubergine (Chilli Thai Basil Stir-fry)'),
    E('Stir-Fry', 'Pad Prik Tai Dum', 'Chicken - Black Pepper S', 'Pad Prik Tai Dum Chicken (Black Pepper Sauce)'),
    E('Stir-Fry', 'Pad Prik Tai Dum', 'Beef - Black Pepper Sauc', 'Pad Prik Tai Dum Beef (Black Pepper Sauce)', 'NUEA PAD PRIK TAI DUM Beef Black Pepper', 'NUEA PAD PRIK TAI DUM Beef Black Pepper'),
    E('Stir-Fry', 'Gai Pad Met Mamuang Himmapan', 'Crispy Chicken with Cash', 'Gai Pad Met Mamuang Himmapan (Crispy Chicken with Cashew Nuts)', 'GAI PAD MET MAMUANG HIMMAPAN', 'GAI PAD MET MAMUANG HIMMAPAN'),
    E('Stir-Fry', 'Pad Met Mamuang Himmapan', 'Vegan Chicken with Cashe', 'Pad Met Mamuang Himmapan Vegan Chicken (with Cashew Nuts)', 'PAD MET MAMUANG HIMMAPAN VEGAN CHICKEN', 'PAD MET MAMUANG HIMMAPAN VEGAN CHICKEN'),
    E('Stir-Fry', 'Pad Met Mamuang Himmapan', 'Tofu Cashew Nuts / Stir-', 'Pad Met Mamuang Himmapan Tofu (Cashew Nuts)', 'PAD MET MAMUANG HIMMAPAN TOFU', 'PAD MET MAMUANG HIMMAPAN TOFU'),
    E('Stir-Fry', 'Pad Prew Waan Gai', 'Sweet & Sour Crispy Chic', 'Pad Prew Waan Gai (Sweet & Sour Crispy Chicken with Dragon Fruit)'),
    E('Stir-Fry', 'Pad Prew Waan', 'Vegan Chicken - Sweet & ', 'Pad Prew Waan Vegan Chicken (Sweet & Sour with Dragon Fruit)'),
    E('Stir-Fry', 'Pad Prew Waan', 'Tofu - Sweet & Sour with', 'Pad Prew Waan Tofu (Sweet & Sour with Dragon Fruit)'),
    E('Stir-Fry', 'Khua Kling', 'Spicy Southern Chicken /', 'Khua Kling Chicken (Spicy Southern)'),
    E('Stir-Fry', 'KHUA KLING', 'Spicy Southern Stir-Fry ', 'Khua Kling Beef (Spicy Southern Stir-Fry Beef Strips)'),
    E('Stir-Fry', 'KHUA KLING', 'Spicy Southern Belly Por', 'Khua Kling Belly Pork (Spicy Southern)'),
    E('Stir-Fry', 'Moo Grob Pad Prik Khing', 'Crispy pork belly, stir-', 'Moo Grob Pad Prik Khing (Crispy Pork Belly Red Curry Stir-fry)'),
    E('Stir-Fry', 'Pla Sam Rod', 'Crispy Tamarind Seabass ', 'Pla Sam Rod (Crispy Tamarind Seabass)'),
    E('Stir-Fry', 'Goong Prik Klua', 'Salt and Pepper King Pra', 'Goong Prik Klua (Salt and Pepper King Prawns)'),
    E('Grill', 'Suea Rong Hai', 'Weeping Tiger Sirloin St', 'Suea Rong Hai (Weeping Tiger Sirloin Steak)'),
    E('Grill', 'PLA YANG', 'Grilled Sea Bass Fillets', 'Pla Yang (Grilled Sea Bass Fillets)'),
    E('Grill', 'Ped Yang Sauce Makam', 'Tamarind Roast Duck / Wi', 'Ped Yang Sauce Makam (Tamarind Roast Duck)'),
    E('Grill', 'GAI GOR-LAE', 'Southern Chicken Skewers', 'Gai Gor-Lae (Southern Chicken Skewers)'),
    E('Grill', 'Hor Mok Pla & Lobster Panang', 'A traditional Thai steam', 'Hor Mok Pla & Lobster Panang'),
    E('Sides', 'Khao Suay', 'Jasmine Rice', 'Khao Suay (Jasmine Rice)'),
    E('Sides', 'Khao Pad Khai', 'Egg Fried Rice', 'Khao Pad Khai (Egg Fried Rice)'),
    E('Sides', 'Khao Neow', 'Sticky Rice', 'Khao Neow (Sticky Rice)'),
    E('Sides', 'Khao Ma Prao', 'Coconut Rice', 'Khao Ma Prao (Coconut Rice)'),
    E('Sides', 'BA MEE', 'Egg Noodles', 'Ba Mee (Egg Noodles)'),
    E('Sides', 'Five Spice Fries', 'Stir fried with onions a', 'Five Spice Fries'),
    E('Sides', 'FIVE SPICE FRIES LOADED WITH RED CURRY CHICKEN', 'Stir fried with onions a', 'Five Spice Fries Loaded with Red Curry Chicken'),
    E('Sides', 'Fries', 'with Sriracha Mayo', 'Fries (with Sriracha Mayo)'),
    E('Sides', 'TENDERSTEM BROCCOLI', 'With fried garlic and oy', 'Tenderstem Broccoli'),
    E('Sides', 'PAK CHOI', 'With fried garlic and oy', 'Pak Choi'),
    E('Sides', 'Roti', '', 'Roti'),
]


def render(node) -> str:
    """Text of a node with line breaks written as ' / ' (the page separates description lines with <br>)."""
    out = []
    for c in node.children:
        if isinstance(c, str):
            out.append(c)
        elif c.tag == "br":
            out.append(" / ")
        else:
            out.append(render(c))
    return "".join(out)


def flat(s: str) -> str:
    return " ".join(s.split())


# ---------------------------------------------------------------- reading the page

def read_page(text: str) -> list[dict]:
    """One row per dish, in page order: {"section", "printed", "clean", "kcal" (None when the page prints none), "desc", "contains", "may", "ids", "no_may_ids"}."""
    root = tk.parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise SystemExit("the page no longer has a k10-all-courses block: its layout changed, check the script before running again")
    filt = tk.filter_labels(root)
    suitable = {n.attrs["data-label-id"]: n.attrs["data-label-name"].strip() for n in root.iter()
                if n.attrs.get("data-label-id") and n.attrs.get("data-label-isext") == "False"}
    if suitable != SUITABLE:
        raise SystemExit(f"the page's dietary labels are now {suitable}: check the script (expected {SUITABLE})")
    rows = []
    for rec in body.iter():
        if not rec.has("k10-recipe_menu-item"):
            continue
        printed = rec.find("k10-recipe__name-wrapper").text()
        energy = rec.find("k10-recipe__nutrient_energy")
        kcal = None
        if energy is not None:
            m = ENERGY.match(energy.text())
            if not m:
                raise SystemExit(f"{printed!r}: calories printed as {energy.text()!r}, expected '- NNN kcal': the page changed")
            kcal = m.group(1).replace(",", "")
        desc = rec.find("k10-recipe__desc")
        lines = {"contains": None, "may": None}
        pop = rec.find("k10-popover__label-names-wrapper")
        for div in (c for c in (pop.children if pop is not None else []) if isinstance(c, tk.Node) and c.tag == "div"):
            if div.text():
                tk._line(div.text(), lines, {"Contains:": "contains", "May contain:": "may", "Suitable for:": None}, printed)
        rows.append({"section": tk._course_section(rec), "printed": printed, "clean": re.sub(r"\s+", " ", MARKS.sub("", printed)).strip(),
                     "kcal": kcal, "desc": flat(render(desc)) if desc is not None else "", **lines,
                     "ids": [x for x in rec.attrs.get("data-all-labels", "").split(",") if x],
                     "no_may_ids": [x for x in rec.attrs.get("data-no-may-labels", "").split(",") if x],
                     "named": dict(filt)})
    return rows


def allergens_of(row: dict) -> dict | None:
    """The dish's allergens from its printed lines, checked against its label ids. None when the page gives the dish no label at all."""
    if not row["ids"]:
        return None
    where = row["printed"]
    named = {i: allergen_words([n], where)[0] for i, n in row["named"].items()}

    def from_ids(group):
        keys = set()
        for i in group:
            keys |= named.get(i, set())
            if i == GENERIC_NUTS_ID:
                keys.add("nuts")
        return keys

    contains, cereals, nuts = tk._keys(row["contains"], where, None)
    may, _, _ = tk._keys(row["may"], where, None)
    id_contains = from_ids(row["no_may_ids"])
    id_may = from_ids([i for i in row["ids"] if i not in row["no_may_ids"]])
    if contains != id_contains or (may - contains) != (id_may - id_contains):
        raise SystemExit(f"{where}: the printed allergen lines (contains {sorted(contains)}, may contain {sorted(may - contains)}) disagree "
                         f"with the dish's label ids (contains {sorted(id_contains)}, may contain {sorted(id_may - id_contains)})")
    if ("Nuts" in [h for h, _ in (row["contains"] or [])]) != (GENERIC_NUTS_ID in row["no_may_ids"]):
        raise SystemExit(f"{where}: the generic 'Nuts' label and the label id {GENERIC_NUTS_ID} no longer go together")
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


# ---------------------------------------------------------------- cross-check with the chain's current pages

ESTATE = {r[1]: r for r in cur.ESTATE}
EDINBURGH = {r[1]: r for r in cur.EDINBURGH}
if len(ESTATE) != len(cur.ESTATE) or len(EDINBURGH) != len(cur.EDINBURGH):
    raise SystemExit("chaophraya_current_page.py has a dish name twice: fix the capture")


def check_against_current(e: dict, kcal: str, allergens: dict, ten_kites_only: bool) -> str:
    """'' when the dish may be published, else the reason to hold it back."""
    k = int(kcal)
    est = ESTATE.get(e["estate"]) if e["estate"] else None
    edi = EDINBURGH.get(e["edinburgh"]) if e["edinburgh"] else None
    if e["estate"] and est is None:
        raise SystemExit(f"{e['name']}: ITEMS names {e['estate']!r} on the current Estate page, but chaophraya_current_page.py has no such dish")
    if e["edinburgh"] and edi is None:
        raise SystemExit(f"{e['name']}: ITEMS names {e['edinburgh']!r} on Edinburgh's page, but chaophraya_current_page.py has no such dish")
    if est is not None and est[2] is not None and est[2] != k:
        return (f"Contradicted: Chaophraya's current Allergens & Calories page for the five Estate-menu restaurants (igfd.menu, captured {cur.CAPTURED_ON}) "
                f"prints {est[2]} kcal for {e['estate']!r}, the Ten Kites page {k}. Not chosen between.")
    if edi is not None and edi[2] is not None and edi[2] != k:
        return (f"Contradicted: Edinburgh's Allergens & Calories page (igfd.menu, captured {cur.CAPTURED_ON}) prints {edi[2]} kcal for "
                f"{e['edinburgh']!r}, the Ten Kites page {k}. Not chosen between.")
    confirmed = est is not None and est[2] == k
    if not confirmed:
        if ten_kites_only:
            return ""
        return (f"Not confirmed: Chaophraya's current Allergens & Calories pages (igfd.menu, captured {cur.CAPTURED_ON}) print no calories for this dish at "
                "the five Estate-menu restaurants (Edinburgh's page, for its own menu, prints some different figures); the Ten Kites page is an older, undated copy.")
    mine = (sorted(allergens["contains"]), sorted(allergens["may_contain"] - allergens["contains"]))
    for label, row in (("Estate", est), ("Edinburgh", edi)):
        if row is None:
            continue
        theirs = (sorted(row[3]), sorted(set(row[4]) - set(row[3])))
        if mine != theirs:
            return (f"Allergens contradicted: calories agree ({kcal}) but the {label} page lists different allergens (Ten Kites: contains {mine[0]}, may contain "
                    f"{mine[1]}; {label} page: contains {theirs[0]}, may contain {theirs[1]}). Not published.")
    return ""


# ---------------------------------------------------------------- building the items

def build(text: str, ten_kites_only: bool) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    rows = read_page(text)
    if len(rows) != EXPECTED_DISHES or len(ITEMS) != EXPECTED_DISHES:
        raise SystemExit(f"the page has {len(rows)} dishes and ITEMS {len(ITEMS)}, this script expects {EXPECTED_DISHES}: the menu changed, re-check before running again")
    sections = []
    for r in rows:
        if r["section"] not in sections:
            sections.append(r["section"])
    if sections != EXPECTED_SECTIONS:
        raise SystemExit(f"sections are now {sections}, expected {EXPECTED_SECTIONS}")
    report: list[str] = []
    items, holdback = [], []
    names = set()
    for r, e in zip(rows, ITEMS):
        if (r["section"], r["clean"]) != (e["section"], e["printed"]) or not r["desc"].startswith(e["desc_start"]):
            raise SystemExit(f"the page's dish {r['section']!r}/{r['clean']!r} ({r['desc'][:30]!r}) is not what ITEMS expects here "
                             f"({e['section']!r}/{e['printed']!r}, {e['desc_start']!r}): the menu changed, update ITEMS")
        if e["name"] in names:
            raise SystemExit(f"ITEMS gives two dishes the name {e['name']!r}")
        names.add(e["name"])
        if r["kcal"] is None:
            report.append(f"excluded {e['name']!r}: the page prints no calories for it ({r['desc'][-45:]!r})")
            continue
        allergens = allergens_of(r)
        if allergens is None:
            report.append(f"excluded {e['name']!r}: the page gives this dish no allergen or dietary label at all, so its allergens are unknown")
            continue
        veg = any(i in r["ids"] for i in SUITABLE)
        meat, unspecified = tk.meat_tags(e["name"], r["desc"], vegetarian=veg)
        if unspecified:
            report.append(f"meat type not stated: {e['name']}")
        notes = [f"printed '{r['printed']}'" if r["printed"] != e["name"] else ""]
        if r["printed"] != r["clean"]:
            notes[0] = f"printed '{r['printed']}' (chilli / star marks dropped)"
        notes.append(f"description: {r['desc']}")
        items.append({"name": e["name"], "category": r["section"], "serving": "", "calories": r["kcal"],
                      "tags": "|".join((["vegetarian"] if veg else []) + meat), "rankable": False, "allergens": allergens,
                      "notes": "; ".join(n for n in notes if n), "_e": e})
    # ids exactly as write_chain_folder will make them (slug of the name, numeric suffix for a clash)
    seen: dict = {}
    for it in items:
        base = slug(it["name"])
        n = seen.get(base, 0)
        seen[base] = n + 1
        it["_id"] = base if n == 0 else f"{base}-{n + 1}"
        reason = check_against_current(it["_e"], it["calories"], it["allergens"], ten_kites_only)
        if reason:
            holdback.append((it["_id"], reason))
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved Ten Kites page (menu_a.html)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was saved")
    ap.add_argument("--fetch", action="store_true", help="download the page into --page first (one request)")
    ap.add_argument("--ten-kites-only", action="store_true",
                    help="skip the 'not confirmed' holds: publish every dish the Ten Kites page prints that the chain's current pages do not contradict (founder's call)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        tk.fetch(URL, args.page)
    text = args.page.read_text(encoding="utf-8")
    items, holdback, report = build(text, args.ten_kites_only)
    published = len(items) - len(holdback)
    if args.ten_kites_only:
        note = (f"Calories only: protein, carbs and fat are not published. Figures are from an undated Chaophraya page that may be older than the current "
                f"menu; recipes differ in Edinburgh. chaophraya.co.uk lists six restaurants ({RESTAURANTS}). Kids, desserts, drinks and set menus not included.")
    else:
        note = (f"Calories only: protein, carbs and fat are not published. Chaophraya's undated allergen page is older than its current menu, so only the "
                f"{published} dishes its current pages confirm are listed. chaophraya.co.uk lists six restaurants ({RESTAURANTS}); recipes differ in Edinburgh.")
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters, the limit is 400")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Chaophraya", cuisine="Thai", source_title=SOURCE_TITLE.format(date=args.checked_on),
                             source_url=URL, checked_on=args.checked_on, aliases=ALIASES,
                             items=[{k: v for k, v in it.items() if k not in ("_id", "_e")} for it in items],
                             out=args.out, note=note, holdback=holdback, nutrition_level="calories",
                             allergen_guide={"title": ALLERGEN_TITLE, "url": URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"{args.page.name} sha256 {tk.sha256_text_file(args.page)}")
    print("\n".join(report))
    print(f"held back {len(holdback)}:")
    for item_id, reason in holdback:
        print(f"  {item_id}: {reason}")
    print(f"wrote {len(items)} items ({published} published, {len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
