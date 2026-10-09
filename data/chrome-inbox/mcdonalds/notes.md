# McDonald's read, 2026-10-09 — things to look at before publishing

Rows: 153 products (every product page reachable from the 16 menu categories except Meal / Happy Meal / Meal Deal pages).
Per-portion table read from the rendered page (zoomed screenshot), all nine rows printed: kJ, kcal, fat, saturates, carbs, sugars, fibre, protein, salt.
Checks run on the file: calories vs 4P+4C+9F+2fibre within 12% for every food row; kJ vs kcal only off by rounding on near-zero drinks; no duplicate names or addresses.

## Numbers copied as printed that look wrong (hold back or ask McDonald's)
- Frozen Strawberry Lemonade (Regular and Large): the page itself says "0 kJ | 0 kcal", every nutrient 0 — placeholder.
- Cappuccino (Regular and Large): salt printed as 34.294484 g and 34.362971 g (572% RI) — page error.

## Allergens
- contains = allergen words the page marks in bold; NONE where an ingredient list is shown with none marked.
- BLANK (the page's Ingredients & Allergens panel lists no ingredients at all, so unknown, not "none"): Apple Slices, Coca-Cola Classic (S/M/L), Tropicana Orange Juice, Hot Chocolate (R/L), Tea (R/L), Milk Portion, Canderel Yellow Sweetener, Lurpak Spreadable. Because of these 12 rows the chain falls to "link only" under the all-or-nothing rule unless you decide otherwise.
- Side Salad: no word marked, but its Crispy Onions text says "wheat flour": written as wheat.
- Smarties McFlurry (+ Mini): panel lists only the ice cream component (no Smarties): allergens may be incomplete.
- may_contain read from the panel's N.B. lines on screen: coffee drinks "traces of milk", Caramel Iced Frappé "wheat and soya", Big Mac bun "milk, barley and rye", Porridge "wheat and barley", Porridge with sugar/jam/syrup and Quick Oats "wheat, barley and rye".
- The page tree hid some "may contain" text behind a "Potential Allergen Ingredient:" label; I opened those panels on screen (Big Mac, Caramel Frappé, Latte, Cappuccino, plain Porridge). If you see that label on a page I did not open, its N.B. line may be missing here. Pages that showed the label: Flat White, Latte, Cappuccino, White Coffee, Americano, Espresso, Double Espresso, Big Mac, Caramel Iced Frappé, Porridge, Porridge with Sugar/Jam/Syrup, Quick Oats.

## Photos (images.csv)
- images.csv holds the address of each product's own photo (McDonald's Scene7 account), copied from the page's own request log. Nothing was downloaded.
- File names that do not match the item: Coca-Cola Classic S/M/L ("Zero-Sugar ... FIFA-promo"), Deep RiverRock 330ml ("250ml"), Flahavan's Quick Oats ("Quaker Oat So Simple Apple Cherry"), Caramel Iced Frappé regular/large (file names look swapped). Check these on the contact sheet before installing.
- The photo host's robots.txt must be checked by the importer first.

## Not read / not found
- Meal, Happy Meal and Meal Deal pages (/meal/ pages).
- Triple Cheeseburger, Bacon Double Cheeseburger and the Breakfast/Bacon Rolls show in "Related products" but their pages redirect to "What's new": not live, so left out.
- Sizes: every size has its own page and its own row (soft drinks S/M/L, milkshakes S/M, coffees Regular/Large, smoothie, frappé and lemonade Regular/Large, fries S/M/L).
