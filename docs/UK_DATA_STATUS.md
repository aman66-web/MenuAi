# UK menu data: status per chain (6 October 2026)

Every number below was copied by script from the chain's own published file (see `docs/UK_DATA_PLAYBOOK.md`), never
typed or estimated. Each chain folder in `data/source/` has a re-runnable extractor in `tools/uk_extract/` (a new guide is
usually published monthly: download it, run the script, and it stops if the menu changed). The check report
(`python3 tools/build_menus.py`) lists every warning and every held-back item.

## Done

| Chain | Published | Source and date | Things to know |
|---|---|---|---|
| KFC | 108 | Official PDF, September 2026 | Ireland-only and Northern-Ireland-only rows left out. Popcorn chicken prints the same number for fat, carbs and protein (calories agree with it). |
| Burger King | 193 of 197 | The site's own /nutritional-info page, which links its nutrition PDF (Kit 6 National, 18 June 2026) | **The PDF is image-only, so it was read by OCR** (nine readings per cell, a vote, arithmetic alarms) and then all 200 rows were checked by eye against enlarged crops; an independent 20-item check found 0 mismatches. 14 cells were corrected by eye after OCR (listed as `OVERRIDES` in the script). **4 held back** (Big King at 1,402 kcal, Chilli Cheese Bites 20pc at 106 kcal, Big King Sauce with kcal/kJ swapped, Caesar Style Sauce with 161 g fat). Both vanilla milkshakes left out (columns shifted in print). The table is older than the newer allergen poster, so some newer items (wraps, tenders, drinks) aren't in it. The extractor needs `pip install rapidocr-onnxruntime pillow numpy` and takes about 18 minutes (`--cache` skips the OCR). |
| Greggs | 263 | Official guide PDF, September 2026 | Hospital-shop rows and three Fairtrade juices left out. "Bread & rolls" (8 rows) may not be sold on their own: easy to drop. |
| Subway | 145 | Official PDF, September 2026 | **Sub, toastie and wrap values cover the bread, filling and basic salad only, not sauces** (shown as a note on the chain page). 6-inch only; the guide says a footlong is double. |
| Pizza Hut | 237 | Official dine-in booklet, July 2026 | **Dine-in menu only**; the delivery/takeaway guide could not be read (JavaScript page). Per slice by size and base. Ice-cream rows (per 100 g only) and two superseded tenders rows left out. |
| Nando's | 138 | The menu page's own data feed, last modified 2 Oct 2026 | Sharing platters left out (Nando's publishes only the chicken). Gatwick-only, regional-trial and delivery-only rows left out. |
| Five Guys | 69 of 72 | Official UK guide PDF, version 20260805 | Kept as printed totals (the per-ingredient values don't add up to the printed items, so no build-your-own). **3 held back**: Little Bacon Burger (367 g carbs printed) and the two Flake shakes (18 g fat with 43 kcal). |
| Popeyes | 187 | The official allergen/nutrition site's JSON feed (no date shown) | 12 shake warnings: printed kcal is 15-20% above what the macros add up to. |
| Pret A Manger | 329 | Pret's own product pages (per serving). The allergen PDF has no nutrition | Decaf and milk variants are separate rows. 27 rows with an unexplained "no milk" flag left out. |
| Starbucks | 347 | Official Autumn 2026 beverage (18/09/26) and food (17/08/26) PDFs | **Default milk:** for 38 core drinks the guide marks no standard milk; the milk used is named on the row and was inferred from the guide's own standard builds: please confirm in the Starbucks UK app. Chocolate, snacks and bottled drinks (27 rows) left out: the guide prints no serving basis for them. |
| Taco Bell | 102 of 146 | Taco Bell's nutrition page, which frames a table hosted by Nutritionix (dated 30 Sep 2026) | **44 held back**: all 34 drinks and 10 quesadilla rows (impossible values, e.g. 803 kcal for a large iced tea, 1,849-2,708 kcal for one quesadilla). Fixed meals and sharing boxes left out. Decision for you: is a table hosted by Nutritionix on Taco Bell's own page acceptable as "official"? |

## Added on 6 October 2026

Every number was copied by script from the chain's own published file, page or feed (same rules as above). Each chain has a
re-runnable extractor in `tools/uk_extract/` that stops if the source's rows change, and a spot check against the rendered
source (every agent compared at least 15 items, mostly 20-60, or every row of a small chain, with 0 mismatches).
"Held back" are rows left out and listed in the check report; delete a line in the chain's `holdback.csv` to publish it as printed.

<!-- added:start -->
<!-- added:end -->

### Needs your decision

- **Held back as "disagrees with something", not "impossible"** (publish by deleting the line): ASK Italian (6 dishes whose calories
  differ 5%+ from askitalian.co.uk/menus), Baskin-Robbins (Strawberry Cheesecake, Caramel Cookies 'N Cream: site and sheet disagree),
  the Mitchells & Butlers carveries and pubs' battered seafood (Harvester, Miller & Carter, Vintage Inns, Sizzling Pubs, Stonehouse:
  printed kcal 19-50% above their own macros), Ping Pong ice cream (black coconut), Fat Hippo (29 panels that contradict themselves).
- **Old or thin data:** Chipotle (single ingredients only, from an August 2022 sheet), Tortilla (41 items: the guide lists burrito and
  bowl ingredients but no dish totals, so those are not published), O'Neill's (63 items: the guide is the whole M&B High Street estate,
  so only the lunch deal and breakfast menus are included; the main-menu burgers and pizzas are missing), Ping Pong (June 2025),
  Baskin-Robbins (June 2025), Greene King (Spring/Summer 2024 guide), Cooplands (March 2026 Easter items marked limited time).
- **Is "official" enough?** Fifteen chains publish through Ten Kites-hosted nutrition pages that the chains' own sites link
  (Bella Italia, Frankie & Benny's, Cafe Rouge, Las Iguanas, Chiquito, Côte, Giggling Squid, Banana Tree, Gourmet Burger Kitchen,
  Slug & Lettuce, Farmer J, Yo! Sushi, Hickory's, Carluccio's, Be At One). **Chiquito**: its FAQ still says it doesn't publish a full
  calorie list and its menu page carries an "allergen data under review" notice: confirm before launch.
- **Basis not stated:** Auntie Anne's pages never say per item or per 100 g; the agent showed from the numbers they are per item
  (sizes scale, per-100 g is impossible). Pepe's veggie items are tagged vegetarian from the chain's "Veggie Table" although its
  notice says they are cooked alongside meat. Prezzo's page states no basis (figures look like one whole dish).
- **Ranking calls:** Pho curries and rice bowls are not ranked (rice isn't included; flip `RANK_RICE_DISHES` in `pho.py`);
  Wagamama kids mains are ranked like KFC's; component and add-on rows are never ranked.
- **Meat type not stated** (the no-pork / no-beef filters only know what a guide says): Gourmet Burger Kitchen 66 burgers,
  Prezzo 26, Wimpy about 23, Zizzi 22, ASK Italian 18, Greene King 17, Pepe's 17, Wendy's 16, Hickory's 14, Premier Inn 11,
  Tim Hortons 10, Bella Italia 9, Frankie & Benny's 9, Sbarro 14 (6 + 8 with no stated meat), Harvester 4, Fat Hippo 5, Las Iguanas 6,
  M&B pubs 6, Stonehouse 3, Miller & Carter 3, Chiquito 3, Pho 2, others 0-1. Per-item lists are in each `items.csv` notes.
- **Left out on purpose:** itsu's Vitality Glass Noodle Bowl (its page errors); Subway-style footlong sizes aren't invented; no
  rows from Ireland / Northern Ireland, selected-store-only or single-venue menus except Sizzling Pubs and Stonehouse (one venue each, stated in their notes).

### Blocked or not usable (added)

- **Coffee Republic**: the official PDF (coffeerepublic.co.uk/nutrition-allergen/nutrition-and-allergen-information.pdf, last updated
  Sep 2023) answers 403 / connection reset from this environment: download it on your own connection if you want it (it is old).
- **Burger King photos**: the site is a JavaScript-only app and the menu feed is private; this environment's browser can't trust the
  proxy certificate, so nothing was fetched.

## Blocked: needs a file from you

| Chain | What happened | What to do |
|---|---|---|
| McDonald's | Every page returns 403 from this build environment's (US) address | On your own connection open the nutrition page (mcdonalds.com/gb, Good to know > Nutrition calculator), download the UK nutrition guide PDF if there is one, and send it |
| Domino's | "Not available in your location" | Open dominos.co.uk/nutritional-information, download the nutrition or allergen guide (per slice by size and base) |
| Papa Johns | Every page returns 403 | Open papajohns.co.uk, find the footer's nutrition/allergen guide, download it |
| Costa | The site errors on every request (looks like an outage) | Try again later, or download the allergen and nutrition guide from costa.co.uk |

## Meat type not stated (the "no pork" / "no beef" filters can only use what a guide says)

Tags come only from the chain's own wording (bacon, pepperoni, "beef patty", ingredient lists). Where a guide doesn't
say, the item has no pork/beef tag, so the filters can't promise it is meat-free of that kind (this matters for halal).
Items to look at:

- **Burger King:** 34 items: 26 burgers in the Beef category, 4 breakfast sandwiches, 2 kids burgers and 2 patties (6 items are tagged beef from "Angus"/"Wagyu" in the name).
- **Subway:** Big Breakwich, Tex Mexan, Spicy Italian, Italian B.M.T, B.M.T & Cheese spud, BLT Saver Sub, Meatballs Snack Bowl and Protein Pot.
- **Greggs:** Lorne breakfast rolls/baguettes, Lorne & omelette items, Breakfast Box, Scotch Pie, Savoury Mince Pie, BBQ Bites Meal Box (and BLT / Lorne sausage are tagged from the name).
- **Pizza Hut:** Hawaiian, Chicken Supreme, Meat Feast, BBQ Americano, Farmhouse, Lasagne, Chicken Delight Flatbread and the buffet versions.
- **Taco Bell:** 7-Layer Burrito, Loaded Protein Bowl, Baby Quesadilla, Cheesy Gordita Crunch, Cheesy Roll Up, Nachos Bell Grande.
- **Nando's:** Wing Roulette. **Popeyes:** fries and hash browns (cooked in an oil blend that includes beef tallow, per the page) and Honey BBQ Cheesy Loaded Fries.

## Vegetarian tags

Only chains whose guide marks vegetarian/vegan items have `vegetarian` tags: KFC, Nando's, Popeyes, Pizza Hut, Pret
(from its ingredients). Subway, Greggs, Burger King, Five Guys and Taco Bell have none except where an item's name says
"vegan"/"plant-based"; the vegetarian filter will therefore hide almost everything there.

## Source quirks worth knowing

KFC: Apple Tango and Lipton Ice Tea rows have inconsistent kJ/salt. Nando's: eight alcoholic drinks trigger energy warnings
(alcohol isn't in the macros). Greggs: decaf rows repeat the regular numbers. Starbucks: 39 semi-skimmed rows print
saturates almost equal to total fat. Every quirk is also in the `notes` column of that chain's `items.csv`.
