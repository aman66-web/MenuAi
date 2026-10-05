# UK menu data: status per chain (5 October 2026)

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
