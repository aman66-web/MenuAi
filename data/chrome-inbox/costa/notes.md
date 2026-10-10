# Costa Coffee read, 2026-10-09 — things to look at before publishing

Rows: 141 (79 food and snack pages, 62 drink rows from 53 drink pages: drinks with different In store / Take-Out numbers have two rows).
Read by the page text of each product page (nutrition table, allergen table and ingredients are all in the page text; nothing was clicked for those).

## Blocks / decisions for the founder
- **Store count missing.** `meta.json` has `"sites": 0` on purpose: no Costa page read prints a store count (Our story, store locator, sustainability, menu). The importer stops until you give a number and the Costa page it comes from.
- **Drinks are the default selection only** (usually Medium, semi-skimmed or whole milk, Signature blend). Sizes (Small/Medium/Large), plant milks, syrups, extra shots and toppings change the figures and were NOT read. Food has one portion each.
- **No numbers on the page, so not written (5):** Popchips Barbeque, Bounce Peanut Protein Ball, Tyrrells Lightly Sea Salted, Tyrrells Mature Cheddar & Chive, Tyrrells Sea Salt & Cider Vinegar ("Nutrition information is not available for this combination").
- **Photos not captured.** Costa's product pictures are not exposed as addresses by the page tools (no address in the page tree or request log), so `images.csv` was not written. Nothing was downloaded.
- **Terms and robots.** costa.co.uk/robots.txt: `Allow: /`, `Disallow: /api/`. Product pages are allowed. The page costa.co.uk/terms-and-conditions holds only Costa Club and promotion terms (no clause on copying, reproducing or automated reading), so Costa's terms of use for the website were NOT found; McDonald's clause 8(h) shows such terms can forbid automated reading, so please check /policies-and-reports before publishing.

## Copied as printed that look odd
- Dried Mango: fat per portion "0" while saturates "0.1" (page rounding).
- Caramelised Biscuit Rocky Road, Millionaire's Shortbread (Gluten Free), Belgian Chocolate Brownie (Gluten Free): fibre per portion printed "0" although per 100 g is 0.6-0.9.
- Maple Hazel Iced Latte and Spanish Iced Latte: the Take-Out column prints the same numbers as In store although the volumes differ (469 vs 379 ml; 380 vs 365 ml): only the In store row is written.
- Coca-Cola-style zero entries (Pure Chamomile Infusion, teas) print 0 kJ / 0-2 kcal.
- Jammy Shortbread has no fibre row on its page (left blank).

## Allergens
- Written from the page's "Allergens present" table: Yes -> contains, C -> may contain. Tree nut pages name the nut (almonds, pecans, walnuts, pistachio, cashews) and that name is used; where the page only says "Tree Nuts Products C" the generic word "nuts" is used.
- Apple Slices, Watermelon, teas and plain coffees show no "Allergens present" table at all: written as NONE.
- Costa's menu page says a product with no table has no listed allergens, but the page also says no product is free from allergens.
- Photos (2026-10-10): none captured. Each product page shows a photo, but the page's network log (read_network_requests) never lists the picture's request, even after a hard reload, and the accessibility tree exposes no src for it, so no address could be read without running a script on the page (not allowed). To add Costa photos, save a product page from your own browser (File > Save Page As) and use docs/PHOTOS_WITH_CLAUDE_IN_CHROME.md, or say how you want to proceed.
