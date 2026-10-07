#!/usr/bin/env python3
"""Build data/source/rick-steins/ from the calorie figures printed on Rick Stein's own restaurant menus (a CALORIES-ONLY chain).

    python3 tools/uk_extract/rick_steins.py --pdf-dir DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: the menu PDFs that rickstein.com links from four restaurant pages (https://rickstein.com/restaurants/<page>/), all under
https://rickstein.com/wp-content/uploads/2024/02/ (the table MENUS below has file name, venue and the PDF's own creation date):
    The Seafood Restaurant (page the-seafood-restaurant): sample menu, set lunch, signature menu, children's menu
    St Petroc's Bistro (st-petrocs-bistro): lunch, dinner, dessert
    Rick Stein's Cafe (rick-steins-cafe): lunch and dinner menu, children's menu
    The Cornish Arms (the-cornish-arms): a la carte, Sunday roast, dessert, children's and teen's menu
`--fetch` downloads a missing file once (browser User-Agent, one request a second; robots.txt only disallows /cdn-cgi/). Needs poppler
(`pdftotext`, `pdfinfo`). Pages are read by position: see rick_steins_pdf.py (zones = rectangles in PDF points).

What is and is not published
- The menus print CALORIES ONLY, in brackets or after the dish ("(350 Kcal)", "1078kcal"). Protein, carbs and fat are never printed, so they stay
  blank (docs/DATA.md "Calories-only chains"). Every number is copied by this script from the PDF; only the item names (taken from the printed
  headings, tidied), the categories and the grouping are written by hand, in ZONES below.
- Only these four restaurants print calories. The pages of Sandbanks, Barnes, Winchester, Fistral and Stein's Fish & Chips link menus
  without calories (checked: 0 figures in each). A February 2025 calorie menu for Fistral is on the server but no page links it and the
  Fistral page now links a menu without calories: not used.
- Not listed, because the PDF gives no figure or no clear basis: dishes without calories (Sunday roast pies, Chocolate fondant, Market fish,
  Ruby orange sorbet); oysters (4 values) and caviar (3 values) on the sample menu, whose unit is not printed; the two dishes whose two figures
  are printed as "a/b kcal" with no labels (Dover sole, children's fish at the Cafe); "Add prawns (462 Kcal)" under the Pondicherry curry
  (not stated whether that is the add-on or the whole dish). Drinks, wine and festive menus print no calories.
- Held back (holdback.csv, nothing corrected): a dish printed with two figures on one page (Shakshuka 377 and 378), and the same dish at the
  same restaurant printed with different figures on two menus (listed in the check run's output).
- Venue names are not part of the dish names, so a name used at several restaurants gets "(venue)" added, and a conflicting name on two
  menus of one restaurant gets "(menu)" added. Identical repeats on two menus of one restaurant (same name, same figure) are one item.
- Tags: vegetarian only where the menu itself says "Vegetarian". contains_pork / contains_beef when the dish's name or printed description
  says so (pork, bacon, ham, sausage, ...; beef, steak). Nothing else is inferred. Allergens: the menus say "please ask"; Rick Stein publishes
  no allergen guide on the site, so no allergen files are written.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rick_steins_pdf as pdfr  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "rick-steins"
BASE = "https://rickstein.com/wp-content/uploads/2024/02/"
SOURCE_URL = "https://rickstein.com/restaurants/"
SOURCE_TITLE = "Rick Stein restaurant menus with calories (13 PDFs on rickstein.com, created 21 April to 4 October 2026; read 2026-10-07)"
ALIASES = ["rick stein", "rick steins", "rick stein's", "rick stein's cafe", "rick steins cafe", "rick stein padstow", "st petrocs bistro",
           "the seafood restaurant padstow"]
NOTE = ("Calories only, copied from each restaurant's own menu PDF: The Seafood Restaurant, St Petroc's Bistro and Rick Stein's Café "
        "(Padstow) and The Cornish Arms. Menus are samples and change often. Sandbanks, Barnes, Winchester, Fistral and Stein's Fish & "
        "Chips print no calories. The same dish can differ between restaurants.")

CA, BI, CF, SR = "The Cornish Arms", "St Petroc's Bistro", "Rick Stein's Café", "The Seafood Restaurant"
SHORT = {CA: "Cornish Arms", BI: "St Petroc's Bistro", CF: "Rick Stein's Café", SR: "Seafood Restaurant"}

# key -> (venue, menu label, file name, the PDF's own creation date, SHA-256 of the file this script was written against: a different hash only prints a notice)
MENUS = {
    "ca-main": (CA, "a la carte menu", "alc-autumn-menu.pdf", "2026-09-23", "dcda14c69e963b59fb5bc83f7018fde804b8552a4e0757a87c25e6ac39e1d01e"),
    "ca-roast": (CA, "Sunday roast menu", "sunday-roast-new-prices.pdf", "2026-10-04", "3e0ca43bbd825409290e663d45ae34e11866193f7ec4ac4790f2b92977499cd6"),
    "ca-dessert": (CA, "dessert menu", "DESSERT-MENU.pdf", "2026-06-25", "6749f4cb424d28ba4d58aa4b8504655d0fb989cea7b67ef14399d10b4cee3d83"),
    "ca-kids": (CA, "children's and teen's menu", "kids-menu-20.7.pdf", "2026-07-20", "e00621921b8c934a0f667fe5089c004ecaca50f5c87463165aa935c5a1efc2b0"),
    "bi-lunch": (BI, "lunch menu", "21-09-26-LUNCH-SAMPLE.pdf", "2026-09-23", "85b515bb163ccd7d984b10a58de943bba26cc77bdefb4e5eb844321a2490f864"),
    "bi-dinner": (BI, "dinner menu", "21-9-26-Dinner.pdf", "2026-09-23", "edcf79a4ea16bda1531be75c781b14aa667611bdef24ce98308a51e06b3b2079"),
    "bi-dessert": (BI, "dessert menu", "Dessert-Menu-23-9-26.pdf", "2026-09-23", "c2afb0de02b870c4269b389d5180cf2ed70e70ff3813ae0e6decdf389a64552d"),
    "cf-main": (CF, "lunch and dinner menu", "Cafe-Sample-ALC-Menu-2026-lunchdinner-3.10.26.pdf", "2026-10-03", "0d191df36fd085a2aa09123294df4f09a968a1fdd7b59dd524b13362aaaa3e3e"),
    "cf-kids": (CF, "children's menu", "kids-menu-17.7.26.pdf", "2026-07-17", "c5543f336659651fe2b5d2cfd2a5c417f78b00878625fce55eaf878de2d13214"),
    "sr-main": (SR, "sample menu", "S-A-M-P-L-E-M-E-N-U.pdf", "2026-09-21", "e8ccde706648f7cb96655df48b68f81333a1fc5f5da716fd4f05ebd0dc2eb8b7"),
    "sr-set": (SR, "set lunch", "Set-lunch-sample-Sept.pdf", "2026-09-21", "a918e626ababafa21adf158901827b7042e61e5daf696cc98dbcd1d853655589"),
    "sr-sig": (SR, "signature menu", "Signature-Menu-Sample-Sept.pdf", "2026-09-21", "d839cd10311e09be478880e311792622dfd21dc6e1fb8cd0412b096837bebe2a"),
    "sr-kids": (SR, "children's menu", "Kids-Menu.pdf", "2026-04-21", "20f8ed320b708d92b6c0aadf5120097379dcfcb36fe56bcb30d1f04d59836301"),
}
EXPECTED_PAGES = {"ca-roast": 70, "cf-main": 2}  # every other menu is one page; the Sunday roast file is the same page printed 70 times

# A calorie figure as printed: "(350 Kcal)", "( 873 Kcal)", "1078kcal", "665/507 kcal". "around 2000 kcal a day" is the menus' footer.
KCAL = re.compile(r"(?<!around )(?<![\d.])(\d+(?:\s*/\s*\d+)?)\s*[Kk][Cc]al")
PORK = re.compile(r"\b(pork|chorizo|bacon|ham|sausages?|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
UNSAID_MEAT = re.compile(r"\b(hamburger|cheeseburger|kidneys?|charcuterie)\b", re.I)
SMALL = {"and", "with", "of", "in", "on", "a", "the", "for", "de", "la", "le", "to", "from", "an"}


class E:
    """One dish line printed with calories. key = text that starts the dish's entry (searched in reading order inside its zone)."""

    def __init__(self, key, name=None, cat=None, n=1, labels=None, skip=None, serving="", same=None, veg=False):
        self.key, self.name, self.cat, self.labels, self.skip, self.serving, self.same, self.veg = key, name, cat, labels, skip, serving, same, veg
        self.n = len(labels) if labels else n


class Z:
    """A zone: a rectangle (x0, y0, x1, y1 in points, None = whole page) of one page, with its default course and its dish lines in order."""

    def __init__(self, menu, page, box, cat, *entries):
        self.menu, self.page, self.box, self.cat, self.entries = menu, page, box, cat, entries


PROPER = {"cornish", "padstow", "loch", "duart", "hanoi", "singapore", "vietnamese", "indonesian", "dorset", "basque", "asian", "kalamata",
          "perello", "gordal", "amritsari"}


def tidy(key: str) -> str:
    """Printed heading -> item name: ALL CAPS becomes sentence case (place and brand words keep a capital); mixed case is kept."""
    if any(c.islower() for c in key):
        return key[0].upper() + key[1:]
    words = [w.lower() for w in key.split()]
    words = [w.capitalize() if w in PROPER else w for w in words]
    words[0] = words[0][0].upper() + words[0][1:]
    return " ".join(words)


# ---------------------------------------------------------------------------------------------------- the zones
ICE = [("strawberry", "Treleavens strawberry ice cream", "3 scoops"), ("vanilla", "Treleavens vanilla ice cream", "3 scoops"),
       ("chocolate", "Treleavens chocolate ice cream", "3 scoops"), ("raspberry ripple", "Treleavens raspberry ripple ice cream", "3 scoops")]
SORBET = [("mango", "Treleavens mango sorbet", "3 scoops"), ("lemon and lime", "Treleavens lemon and lime sorbet", "3 scoops"),
          ("raspberry", "Treleavens raspberry sorbet", "3 scoops"), ("rhubarb", "Treleavens rhubarb sorbet", "3 scoops")]
CAR = ("salted caramel", "Treleavens salted caramel ice cream", "3 scoops")
HAMBURGER_ADDON = " (to the Cornish Arms hamburger)"
SAUSAGE_NOTE = "same"

ZONES = [
    # ---------------- The Cornish Arms: a la carte (A3 page, three columns; sides in four)
    Z("ca-main", 1, (0, 85, 290, 170), "Appetisers", E("WHITEBAIT", "Whitebait with tartare sauce"), E("PICKLED ANCHOVIES"),
      E("DARREN BRAY", "Darren Bray’s pork belly bites")),
    Z("ca-main", 1, (290, 85, 550, 170), "Appetisers", E("HALLOUMI SAGANAKI", "Halloumi saganaki with honey and sesame seeds"),
      E("COOMBESHEAD SOURDOUGH", "Coombeshead sourdough with homemade flavoured butters")),
    Z("ca-main", 1, (550, 85, 842, 170), "Appetisers", E("CHARCUTERIE BOARD", cat="Starters"), E("MARINATED OLIVES")),
    Z("ca-main", 1, (0, 200, 290, 320), "Starters", E("SPICED BUTTERNUT SQUASH SOUP"), E("HOT SMOKED SALMON SALAD"), E("DEVILLED KIDNEYS")),
    Z("ca-main", 1, (290, 200, 550, 320), "Starters", E("TOMATO BRUSCHETTA", "Tomato bruschetta with pickled anchovies and Parmesan"),
      E("BAKED WHOLE CAMEMBERT FOR TWO", "Baked whole Camembert for two", serving="For two")),
    Z("ca-main", 1, (550, 200, 842, 320), "Starters", E("CHICKEN WINGS", "Chicken wings, tamarind & chilli sambal"), E("SCALLOP SALAD"),
      E("SALT AND PEPPER PRAWNS")),
    Z("ca-main", 1, (0, 370, 290, 640), "Mains", E("PONDICHERRY", "Pondicherry fish curry"),
      E("Vegetarian", "Pondicherry curry, vegetarian", veg=True),
      E("Add Prawns", skip="Add Prawns (462 Kcal), under the Pondicherry curry: the menu does not say whether that is the add-on or the whole dish"),
      E("SALMON FILLET"), E("FENNEL RAVIOLI"), E("BACON CHOP")),
    Z("ca-main", 1, (290, 370, 550, 640), "Mains", E("WHOLE PLAICE"), E("SOFT SHELL CRAB BURGER"), E("WALNUT CRUSTED GOATS CHEESE"),
      E("10oz RUMP STEAK", "10oz rump steak"), E("8oz SIRLOIN STEAK", "8oz sirloin steak"), E("Peppercorn Sauce", "Peppercorn sauce (to the sirloin steak)")),
    Z("ca-main", 1, (550, 400, 842, 640), "Classics", E("CORNISH ARMS HAMBURGER", "Cornish Arms hamburger"),
      E("BACON", "Add bacon" + HAMBURGER_ADDON), E("BLUE CHEESE", "Add blue cheese" + HAMBURGER_ADDON),
      E("JALAPEÑO PEPPERS", "Add jalapeño peppers" + HAMBURGER_ADDON), E("BATTERED FISH AND CHIPS"), E("SCAMPI IN THE BASKET")),
    Z("ca-main", 1, (0, 685, 235, 750), "Sides", E("ONION RINGS"), E("THIN CUT CHIPS")),
    Z("ca-main", 1, (235, 685, 428, 750), "Sides", E("BITTER LEAF SALAD", "Bitter leaf salad with honey and mustard dressing and radish")),
    Z("ca-main", 1, (428, 685, 634, 750), "Sides", E("ROASTED CARROTS", "Roasted carrots with butter and tarragon")),
    Z("ca-main", 1, (634, 685, 842, 750), "Sides", E("VINE TOMATOES", "Vine tomatoes with basil and balsamic"),
      E("CRUSHED NEW POTATOES", "Crushed new potatoes with watercress")),
    # ---------------- The Cornish Arms: Sunday roast (A4, two columns)
    Z("ca-roast", 1, (0, 140, 300, 265), "Starters", E("SPICED BUTTERNUT SQUASH SOUP"), E("DEVILLED KIDNEYS"), E("LA MOUCLADE", "La Mouclade mussels")),
    Z("ca-roast", 1, (300, 140, 595, 270), "Starters", E("SCALLOP SALAD"), E("HOT SMOKED SALMON SALAD"), E("CHARCUTERIE BOARD")),
    Z("ca-roast", 1, (0, 330, 300, 560), "Sunday roast", E("ROAST TOPSIDE OF BEEF"), E("ROAST PORK"), E("HALF ROAST CHICKEN"), E("CELERIAC ROSTI")),
    Z("ca-roast", 1, (300, 360, 595, 560), "Mains", E("WHOLE PLAICE"), E("PONDICHERRY FISH CURRY", "Pondicherry fish curry"), E("WALNUT CRUSTED GOATS CHEESE")),
    Z("ca-roast", 1, (0, 625, 300, 760), "Desserts", E("CARAMEL SUNDAE"),
      E("TRELEAVENS CORNISH ICE CREAMS", labels=ICE + [CAR]), E("TRELEAVENS CORNISH SORBETS", labels=SORBET)),
    Z("ca-roast", 1, (300, 625, 595, 760), "Desserts", E("STICKY TOFFEE PUDDING"), E("CORNISH ARMS CHEESEBOARD", "Cornish Arms cheeseboard"), E("HAZELNUT PAVLOVA")),
    # ---------------- The Cornish Arms: dessert menu
    Z("ca-dessert", 1, None, "Desserts", E("CARAMEL SUNDAE"), E("TREACLE TART"), E("HAZELNUT PAVLOVA"), E("STICKY TOFFEE PUDDING"),
      E("TRELEAVENS CORNISH ICE CREAMS", labels=ICE + [CAR]), E("TRELEAVENS CORNISH SORBETS", labels=SORBET),
      E("CORNISH ARMS CHEESE BOARD", "Cornish Arms cheeseboard")),
    # ---------------- The Cornish Arms: children's and teen's menu
    Z("ca-kids", 1, None, "Children's menu", E("Hummus, carrot", "Hummus, carrot, cucumber and grilled flat bread"),
      E("Pasta in a tomato sauce", "Pasta in a tomato sauce with parmesan"), E("Cheeseburger", "Cheeseburger with lettuce & ketchup in a toasted bun with chips"),
      E("Fish (grilled or battered)", "Fish (grilled or battered) with chips and mushy peas"), E("4oz rump steak", "4oz rump steak with chips and a cheesemaker salad"),
      E("Chicken Wings", "Chicken wings, tamarind & chilli sambal", cat="Teen's menu"), E("Battered fish and chips", "Battered fish and chips", cat="Teen's menu"),
      E("Cornish Arms Hamburger", "Cornish Arms hamburger", cat="Teen's menu"), E("Pondicherry Fish Curry", "Pondicherry fish curry", cat="Teen's menu")),
    # ---------------- St Petroc's Bistro
    Z("bi-lunch", 1, None, "Appetisers",
      E("SOURDOUGH, BUTTER & OLIVES", "Sourdough, butter & olives", same="bi-sourdough"),
      E("WHIPPED COD ROE AND SOURDOUGH", "Whipped cod roe and sourdough", same="bi-codroe"),
      E("PADRON PEPPERS", "Padron peppers with olive oil and sea salt"), E("CRAB & SAFFRON CROQUETAS", "Crab & saffron croquetas"),
      E("SHAKSHUKA", "Shakshuka", cat="Lunch classics", n=2), E("SALAD OF MACKEREL FILLET", "Salad of mackerel fillet", cat="Lunch classics"),
      E("BISTRO BRIOCHE BAP", cat="Lunch classics"), E("4OZ RUMP STEAK, FRIED EGGS & CHIPS", "4oz rump steak, fried eggs & chips", cat="Lunch classics"),
      E("SCALLOPS", "Scallops with coriander and hazelnut butter", cat="Lunch classics"), E("BISTRO BEEF BURGER", cat="Lunch classics"),
      E("KING PRAWN", "King prawn with basil and lime butter", cat="Lunch classics"),
      E("CHICKEN PALLIARD", "Chicken paillard with soy butter sauce and spring onion mash", cat="Lunch classics"),
      E("COD WITH SAUCE VERTE AND BUTTER BEANS", "Cod with sauce verte and butter beans, with new potatoes", cat="Lunch classics"),
      E("GRILLED BREAM FILLET", "Grilled bream fillet with spinach, beurre blanc and new potatoes", cat="Lunch classics"),
      E("8OZ BAVETTE STEAK", "8oz bavette steak with cheesemaker salad and thin cut chips", cat="Lunch classics"),
      E("MIXED LEAF SALAD", "Mixed leaf salad", cat="Sides"), E("KALE WITH CONFIT SHALLOT", "Kale with confit shallot", cat="Sides"),
      E("CHIPS", "Chips", cat="Sides"), E("BUTTERED POTATOES", "Buttered potatoes", cat="Sides"),
      E("TENDERSTEM BROCCOLI", "Tenderstem broccoli with salsa verde", cat="Sides"),
      E("SALAD OF MACKEREL FILLET", "Salad of mackerel fillet", cat="Set menu"), E("MOUNTAIN SAUSAGE PARPADELLE", "Mountain sausage parpadelle", cat="Set menu"),
      E("CHOCOLATE PAVE", "Chocolate pavé with crystallised peanuts and salted caramel ice cream", cat="Set menu")),
    Z("bi-dinner", 1, None, "Appetisers",
      E("Coombshead sourdough, salted butter and kalamata olives", same="bi-sourdough"), E("Whipped smoked cod roe with sourdough", same="bi-codroe"),
      E("Patatas bravas with a spiced tomato sauce"), E("Padron peppers with olive oil and sea salt"), E("Crab and saffron Croquetas", "Crab & saffron croquetas"),
      E("Jerusalem artichoke soup", "Jerusalem artichoke soup with wild mushrooms, croutons and chives", cat="Starters"),
      E("Mount Bay sardines", "Mount Bay sardines with coarse green herbs", cat="Starters"),
      E("Salad of Cornish mackerel fillet", "Salad of Cornish mackerel fillet with sun dried tomatoes, fennel, thyme, sherry vinegar", cat="Starters"),
      E("Deep fried squid", "Deep fried squid with semolina, aioli and lime", cat="Starters"),
      E("Moules mariniere", "Moules marinière: Porthilly mussels, Rock", cat="Starters"),
      E("Scallops with coriander and hazelnut butter", cat="Starters"),
      E("Chargrilled, butterflied King Prawn", "Chargrilled, butterflied king prawn with basil and lime butter", cat="Starters"),
      E("Chicory and leek gratin", "Chicory and leek gratin with parmesan panko crumb", cat="Mains"),
      E("Crab tagliatelle", "Crab tagliatelle with cherry tomato, chilli and garlic", cat="Mains"),
      E("Chicken paillard", "Chicken paillard with soy butter sauce and spring onion mash", cat="Mains"),
      E("Coley with beer bacon", "Coley with beer bacon, cabbage and mussels", cat="Mains"),
      E("Cod fillet with sauce verte", "Cod fillet with sauce verte, butter beans, chilli, tomato and parsley", cat="Mains"),
      E("Grilled seabream", "Grilled seabream with trout roe, spinach, beurre blanc and new potatoes", cat="Mains"),
      E("8oz bavette steak", "8oz bavette steak with cheesemaker salad and thin cut chips", cat="Mains"),
      E("Mixed leaf salad", cat="Sides"), E("Kale with confit shallot", cat="Sides"), E("Chips", cat="Sides"),
      E("Buttered new potatoes", "Buttered new potatoes with parsley and mint", cat="Sides"),
      E("Bearnaise or peppercorn sauce", cat="Sides"),
      E("Salad of mackerel fillet with sundried", "Salad of mackerel fillet", cat="Set menu"),
      E("Mountain sausage parpadelle", cat="Set menu"),
      E("Chocolate pave", "Chocolate pavé with crystallised peanuts and salted caramel ice cream", cat="Set menu")),
    Z("bi-dessert", 1, None, "Desserts", E("Lemon posset", "Lemon posset with caramelised fig"), E("Affogato", "Affogato served with Frangelico"),
      E("Dark chocolate cremieux", "Dark chocolate cremieux with raspberry coulis and hazelnut crumb"),
      E("Sticky toffee pudding", "Sticky toffee pudding with clotted cream"),
      E("Chocolate pave", "Chocolate pavé with crystallised peanuts and salted caramel ice cream"),
      E("Pear tarte tatin", "Pear tarte tatin with vanilla ice cream", serving="Sharing for 2"),
      E("3 scoops", "Ice cream & sorbet", serving="3 scoops"),
      E("Roquefort", "Roquefort, Quicks cheddar, Brie with apple chutney and crackers")),
    # ---------------- Rick Stein's Cafe (page 1 holds the food; page 2 is drinks)
    Z("cf-main", 1, (0, 150, 325, 270), "Small bites", E("KALAMATA OLIVES"), E("CHAPATTIS", "Chapattis with raita and mango chutney"),
      E("DHAL FRITTERS", "Dhal fritters with a spiced chutney")),
    Z("cf-main", 1, (325, 150, 575, 270), "Small bites", E("SOURDOUGH BREAD", "Sourdough bread with Indian spiced butter"),
      E("FRIED PANEER", "Fried paneer with honey and chat masala"), E("TANDOORI PRAWNS", "Tandoori prawns with chat masala")),
    Z("cf-main", 1, (0, 280, 575, 960), "Starters",
      E("SPICED LENTIL SOUP"), E("BANG BANG CAULIFLOWER"), E("VIETNAMESE POACHED CHICKEN SALAD"), E("AMRITSARI FISH"), E("MUSSEL MASALA"),
      E("SALT AND PEPPER PRAWNS"),
      E("QUICK AS A SANDWICH STIR FRY", "Quick as a sandwich stir fry with tiger prawns", cat="Lunch specials"),
      E("SCAMPI PO", "Scampi po’boy", cat="Lunch specials"),
      E("BEETROOT CURRY", cat="Mains"), E("HANOI CHICKEN BROTH", cat="Mains"), E("MISO SALMON", cat="Mains"), E("NASI GORENG", cat="Mains"),
      E("PONDICHERRY FISH CURRY", "Pondicherry fish curry", cat="Mains")),
    Z("cf-main", 1, (0, 970, 325, 1030), "Sides", E("POPPADOMS"), E("ASIAN COLESLAW"), E("THIN CUT CHIPS")),
    Z("cf-main", 1, (325, 970, 575, 1030), "Sides", E("CHAT MASALA CHIPS"), E("CHILLI SPICED CABBAGE")),
    Z("cf-kids", 1, None, "Children's menu", E("Breaded Chicken Goujons", "Breaded chicken goujons with chips and garden peas"),
      E("Battered or grilled fish of the day", skip="Battered or grilled fish of the day: '665/507 kcal' is printed with no labels saying which figure is which"),
      E("Moules mariniere", "Moules marinière with chips"), E("Scampi", "Scampi with chips and garden peas"),
      E("Sage and butternut squash ravioli", "Sage and butternut squash ravioli with parmesan cheese")),
    # ---------------- The Seafood Restaurant
    Z("sr-main", 1, (0, 150, 842, 280), "Appetisers & sharing plates", E("BREAD, OLIVES AND BRANDADE", "Bread, olives and brandade"),
      E("PERELLO GORDAL OLIVES"), E("DON BOCARTE", "Don Bocarte Cantabrian anchovies"), E("CORNISH PULPO", "Cornish pulpo a la feria"),
      E("JAMON IBERICO", "Jamón ibérico de bellota")),
    Z("sr-main", 1, (0, 282, 440, 345), "Appetisers & sharing plates", E("OYSTERS", n=4, skip="Oysters (Raw, Tempura, Rockefeller, Charentaise): the unit the 4 figures are for is not printed")),
    Z("sr-main", 1, (440, 282, 842, 345), "Appetisers & sharing plates", E("CAVIAR", n=3, skip="Caviar (Baerii, Oscietra, Beluga): the weight the 3 figures are for is not printed")),
    Z("sr-main", 1, (0, 370, 842, 510), "Starters", E("GRILLED MOUNT", "Grilled Mount’s Bay sardines with rock salt and lime"),
      E("FISH AND SHELLFISH SOUP"), E("LOCH DUART SALMON RILLETTE"), E("STEAMED CLAMS", "Steamed clams with garlic, almonds and parsley"),
      E("RAGOÛT OF BRILL", "Ragoût of brill and scallops"), E("TWICE BAKED PADSTOW CRAB SOUFFL", "Twice baked Padstow crab soufflé"),
      E("STEAMED SCALLOPS", "Steamed scallops with a soy and ginger dressing")),
    Z("sr-main", 1, (0, 535, 290, 600), "The raw bar", E("SALMON AND TUNA TARTARE")),
    Z("sr-main", 1, (290, 535, 562, 600), "The raw bar", E("SEARED YELLOWFIN TUNA")),
    Z("sr-main", 1, (562, 535, 842, 600), "The raw bar", E("SASHIMI OF SCALLOPS", "Sashimi of scallops, sea bass, yellowfin tuna and salmon")),
    Z("sr-main", 1, (0, 635, 265, 760), "Shellfish", E("SINGAPORE CHILLI CRAB"), E("LANGOUSTINES ON ICE", serving="Each")),
    Z("sr-main", 1, (265, 635, 565, 760), "Shellfish",
      E("FRUITS DE MER", labels=[("Small", "The “Fruits de mer”, small", "Small (exclude lobster)"), ("Large", "The “Fruits de mer”, large", "Large (half lobster)"),
                                  ("Sharing for two", "The “Fruits de mer”, sharing for two", "Sharing for two (whole lobster)")])),
    Z("sr-main", 1, (565, 635, 842, 760), "Shellfish", E("HOT SHELLFISH")),
    Z("sr-main", 1, (0, 780, 842, 940), "Mains", E("FISH AND CHIPS", "Fish and chips"), E("PAN FRIED BRILL"),
      E("INDONESIAN SEAFOOD CURRY", "Indonesian seafood curry with monkfish, sea bass and prawns"), E("TURBOT HOLLANDAISE"),
      E("CHARGRILLED 14oz", "Chargrilled 14oz sirloin steak on the bone"),
      E("WHOLE DOVER SOLE", skip="Whole Dover sole: '1556/1280 kcal' is printed for meunière or chargrilled with no labels saying which figure is which"),
      E("SHALLOT TARTE TATIN")),
    Z("sr-main", 1, (0, 970, 288, 1030), "Lobster", E("LOBSTER THERMIDOR")),
    Z("sr-main", 1, (288, 970, 548, 1030), "Lobster", E("LOBSTER RISOTTO")),
    Z("sr-main", 1, (548, 970, 842, 1030), "Lobster", E("PADSTOW LOBSTER")),
    Z("sr-main", 1, (0, 1055, 400, 1115), "Sides", E("THIN CUT CHIPS"), E("BUTTERED POTATOES", "Buttered potatoes with parsley and mint"), E("GARDEN SALAD", "Garden salad with fines herbes")),
    Z("sr-main", 1, (400, 1055, 842, 1115), "Sides", E("GLAZED CHANTENAY CARROTS", "Glazed Chantenay carrots with tarragon"), E("KALE", "Kale with confit shallot"),
      E("SAUTÉED SPINACH", "Sautéed spinach with nutmeg")),
    Z("sr-set", 1, None, "Set lunch", E("AMRITSARI FISH", "Amritsari fish with green chutney and kachumber salad"),
      E("BUTTERNUT SQUASH SOUP", "Butternut squash soup with thyme and Gruyère cheese", same="sr-soup"),
      E("CORNISH CRAB WAKAME", "Cornish crab wakame and wasabi mayonnaise", same="sr-wakame"),
      E("CHALK STREAM TROUT", "Chalk stream trout with warm tartare sauce"), E("CHICKEN", "Chicken paillard with watercress"),
      E("ROASTED MONKFISH VINDALOO", "Roasted monkfish vindaloo with raita and poppadums"),
      E("LEMON AND LIME POSSET", "Lemon and lime posset with honeycomb, raspberry and mint"),
      E("CORNISH KERN", "Cornish kern: warm date and Mena Dhu stout loaf, grape and onion chutney")),
    Z("sr-sig", 1, None, "Signature menu", E("COOMBESHEAD FARM SOURDOUGH", "Coombeshead Farm sourdough"), E("DEEP-FRIED CRYSTAL PRAWNS"), E("OCTOPUS CARPACCIO"),
      E("DORSET OYSTER", labels=[("natural", "Dorset oyster, natural", ""), ("charentaise", "Dorset oyster, charentaise", "")]),
      E("GRILLED MUSSELS", "Grilled mussels with romesco sauce"),
      E("BUTTERNUT SQUASH SOUP", "Butternut squash soup with thyme and Gruyère cheese", same="sr-soup"),
      E("CRAB WAKAME", "Crab wakame and wasabi mayonnaise", same="sr-wakame"),
      E("CORNISH COD", "Cornish cod with an apple velouté"), E("PAN-FRIED LEMON SOLE", "Pan-fried lemon sole with lemongrass butter"),
      E("POLENTA", "Polenta and wild mushrooms"), E("INDONESIAN SEAFOOD CURRY", "Indonesian seafood curry"),
      E("LAMB RUMP", "Lamb rump, tomato, shallot salad and aioli"), E("PORK BELLY", "Pork belly, pickled carrot and cider sauce"),
      E("PEA RISOTTO", "Pea risotto, pea purée, grilled artichoke and Parmesan"), E("BASQUE CHEESECAKE", "Basque cheesecake, spiced poached plums"),
      E("VANILLA CR", "Vanilla crème brûlée, dark chocolate and pistachios biscotti"), E("APPLE AND FRANGIPANE BAND", "Apple and frangipane band with caramel sauce"),
      E("CHEESE membrillo", "Cheese: membrillo and sourdough crackers")),
    Z("sr-kids", 1, None, "Children's menu", E("Crudit", "Crudités"), E("Pasta with tomato and basil"), E("Thai fish cakes", "Thai fish cakes with dipping sauce"),
      E("Deep fried tiger prawns", "Deep fried tiger prawns and mayonnaise"),
      E("Battered or grilled fish of the day", "Battered or grilled fish of the day with chips and garden peas"),
      E("Moules frites", "Moules frites with French fries"), E("4oz rump steak", "4oz rump steak with French fries and a mixed leaf salad"),
      E("Fried squid", "Fried squid with French fries, salad, tomatoes and mayonnaise"), E("Sticky toffee pudding"),
      E("Brownie", "Brownie & vanilla ice cream"), E("Selection of ice creams and sorbets")),
]
# Pairs of figures the menus themselves contradict although the dishes' names differ a little: (same-tag) -> handled via E(same=...).


# ---------------------------------------------------------------------------------------------------- reading
def fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")


def norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", fold(s).lower().replace("’", "").replace("'", "")).strip()


def read_zone(pdf: Path, page: int, box, zone: Z) -> list[dict]:
    words = pdfr.read_words(pdf, page)
    text = " ".join(t for _, _, t in pdfr.zone_rows(words, box))
    text = re.sub(r"\s+", " ", text.replace("\xa0", " "))
    total = len(KCAL.findall(text))
    wanted = sum(e.n for e in zone.entries)
    if total != wanted:
        raise SystemExit(f"{zone.menu} page {page} zone {box}: {total} calorie figures printed there, the script expects {wanted}. The menu changed: re-read it.\n{text}")
    found = []
    start = 0
    for e in zone.entries:
        pos = text.find(e.key, start)
        if pos < 0:
            raise SystemExit(f"{zone.menu} page {page} zone {box}: the dish line {e.key!r} was not found after position {start}. The menu changed: re-read it.\n{text}")
        found.append(pos)
        start = pos + len(e.key)
    out = []
    for i, e in enumerate(zone.entries):
        seg = text[found[i]: found[i + 1] if i + 1 < len(found) else len(text)]
        toks = [m.group(1) for m in KCAL.finditer(seg)]
        if len(toks) != e.n:
            raise SystemExit(f"{zone.menu} page {page}: {e.key!r} has {len(toks)} calorie figures, expected {e.n}: {seg!r}")
        desc = KCAL.sub(" ", seg)
        if e.labels:
            for label, name, serving in e.labels:
                m = re.search(re.escape(label) + r"\s*\(?\s*(\d+)\s*[Kk][Cc]al", seg)
                if not m:
                    raise SystemExit(f"{zone.menu} page {page}: {e.key!r}: no figure printed right after {label!r}: {seg!r}")
                out.append(dict(entry=e, name=name, serving=serving, kcal=m.group(1), desc=label, cat=e.cat or zone.cat, seg=seg))
        elif e.skip:
            out.append(dict(entry=e, name=None, skip=e.skip, kcal=" / ".join(toks), seg=seg, cat=e.cat or zone.cat))
        else:
            out.append(dict(entry=e, name=e.name or tidy(e.key), serving=e.serving, kcal=toks[0], extra=toks[1:], desc=desc, cat=e.cat or zone.cat, seg=seg))
    return out


def page_tokens(pdf: Path, page: int) -> int:
    words = pdfr.read_words(pdf, page)
    return len(KCAL.findall(re.sub(r"\s+", " ", " ".join(t for _, _, t in pdfr.zone_rows(words, None)))))


def check_pdf_shape(menu: str, pdf: Path) -> None:
    pages = pdfr.page_count(pdf)
    if pages != EXPECTED_PAGES.get(menu, 1):
        raise SystemExit(f"{pdf.name}: {pages} pages, expected {EXPECTED_PAGES.get(menu, 1)}: the file changed")
    if menu == "ca-roast":  # the same page printed 70 times: check they really are identical, then read the first
        raw = subprocess.run(["pdftotext", "-raw", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
        parts = [p for p in raw.split("\f") if p.strip()]
        if len(set(parts)) != 1 or len(parts) != pages:
            raise SystemExit(f"{pdf.name}: the {pages} pages are no longer one page printed {pages} times: re-read it")


def fetch(name: str, dest: Path) -> None:
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"})
    time.sleep(1)
    with urllib.request.urlopen(req, timeout=60) as r:  # a 403 or other error stops the run: never work round a block
        dest.write_bytes(r.read())


def build(pdf_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[dict]]:
    raw: list[dict] = []
    for zone in ZONES:
        venue, label, fname, created, _ = MENUS[zone.menu]
        for d in read_zone(pdf_dir / fname, zone.page, zone.box, zone):
            d.update(menu=zone.menu, venue=venue, menu_label=label, file=fname, created=created)
            raw.append(d)
    # every figure on every page must belong to a zone
    for menu, (venue, label, fname, created, _) in MENUS.items():
        for page in range(1, (1 if menu == "ca-roast" else EXPECTED_PAGES.get(menu, 1)) + 1):
            captured = sum(len(KCAL.findall(re.sub(r"\s+", " ", " ".join(t for _, _, t in pdfr.zone_rows(pdfr.read_words(pdf_dir / fname, page), z.box)))))
                           for z in ZONES if z.menu == menu and z.page == page)
            if captured != page_tokens(pdf_dir / fname, page):
                raise SystemExit(f"{fname} page {page}: {page_tokens(pdf_dir / fname, page)} figures on the page, {captured} inside the zones: a zone no longer covers the page")
    published = [d for d in raw if d.get("name")]
    excluded = [d for d in raw if not d.get("name")]
    # identical repeats on two menus of one restaurant (same name, same figure) are one item
    seen: dict = {}
    items: list[dict] = []
    for d in published:
        k = (d["venue"], norm_name(d["name"]), d["kcal"])
        if k in seen:
            seen[k].setdefault("also", []).append(f"{d['menu_label']} ({d['file']})")
            continue
        seen[k] = d
        items.append(d)
    # conflicts: the same dish (same name, or the same E(same=...)) at one restaurant with different figures
    holds: dict[int, str] = {}
    groups: dict = {}
    for d in items:
        tag = d["entry"].same if d["entry"].same else norm_name(d["name"])
        groups.setdefault((d["venue"], tag), []).append(d)
    for (venue, tag), members in groups.items():
        if len({m["kcal"] for m in members}) > 1:
            where = "; ".join(f"{m['kcal']} kcal on the {m['menu_label']}" for m in members)
            for m in members:
                holds[id(m)] = f"The same dish is printed with different figures at {SHORT[venue]}: {where}. Neither is published."
    for d in items:
        if d["entry"].n == 2 and not d["entry"].labels:
            holds[id(d)] = f"The {d['menu_label']} prints two different figures for this dish ({d['kcal']} and {d['extra'][0]} kcal). Not published."
    # names: a name used at several restaurants gets the restaurant added; a clash inside one restaurant gets the menu added
    by_name: dict = {}
    for d in items:
        by_name.setdefault(norm_name(d["name"]), []).append(d)
    for members in by_name.values():
        if len(members) > 1 and len({m["venue"] for m in members}) > 1:
            for m in members:
                m["name"] = f"{m['name']} ({SHORT[m['venue']]})"
    by_name = {}
    for d in items:
        by_name.setdefault(norm_name(d["name"]), []).append(d)
    for members in by_name.values():
        if len(members) > 1:
            for m in members:
                m["name"] = f"{m['name']} ({m['menu_label']})"
    names = [norm_name(d["name"]) for d in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique after disambiguation")
    out_items = []
    holdback = []
    for d in items:
        e = d["entry"]
        text = d["name"] if e.labels else d["seg"]  # tags come from what the menu prints (heading and description), not from names added here
        tags = []
        if e.veg:
            tags.append("vegetarian")
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        d["unsaid_meat"] = (bool(UNSAID_MEAT.search(text + " " + d["name"])) and not ({"contains_pork", "contains_beef"} & set(tags))
                            and not d["name"].startswith("Add "))
        iid = slug(fold(d["name"]))
        notes = f"{SHORT[d['venue']]}, {d['menu_label']} ({d['file']}, PDF created {d['created']}); printed {d['kcal']} kcal"
        if d.get("also"):
            notes += "; the same figure is also printed on the " + ", ".join(d["also"])
        out_items.append(dict(id=iid, name=d["name"], category=f"{SHORT[d['venue']]}: {d['cat']}", serving=d.get("serving", ""), calories=d["kcal"],
                              tags="|".join(tags), rankable=False, notes=notes))
        if id(d) in holds:
            holdback.append((iid, holds[id(d)]))
    ids = [i["id"] for i in out_items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids are not unique")
    d_info = [d for d in items if d["unsaid_meat"]]
    return out_items, holdback, [dict(excluded=excluded, unsaid=[d["name"] for d in d_info])]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", required=True, type=Path, help="folder with the menu PDFs (file names as published)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download missing PDFs (one request a second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    args.pdf_dir.mkdir(parents=True, exist_ok=True)
    for menu, (venue, label, fname, created, sha) in MENUS.items():
        path = args.pdf_dir / fname
        if not path.exists():
            if not args.fetch:
                raise SystemExit(f"missing {path}: download it from {BASE}{fname} or run with --fetch")
            fetch(fname, path)
        digest = sha256_file(path)
        print(f"sha256 {digest}  {fname}  ({SHORT[venue]}, {label})" + ("" if digest == sha else "  NOTICE: not the file this script was written against"))
        check_pdf_shape(menu, path)
    items, holdback, info = build(args.pdf_dir)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Rick Stein", cuisine="Seafood", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=None, nutrition_level="calories")
    cats: dict = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    for c, n in cats.items():
        print(f"  {c}: {n}")
    print("held back:")
    for iid, why in holdback:
        print(f"  {iid}: {why}")
    print("not listed (no clear figure or basis):")
    for d in info[0]["excluded"]:
        print(f"  {d['menu']}: {d['skip']} [{d['kcal']}]")
    print("meat type not stated (no pork/beef tag):", ", ".join(info[0]["unsaid"]))


if __name__ == "__main__":
    main()
