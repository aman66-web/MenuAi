# Store listing crawls (Tier 1: every food and drink product a shop's category pages show)

Read from each shop's own category pages in the founder's Chrome on 8-9 October 2026 by agents, one tab each, one page at a time, read-only
(docs/NEXT_GROCERIES_DISCOVERY_PROMPT.md; rules in the `*_terms.txt` files, which quote each shop's robots.txt and terms). Names, prices and photo
addresses are exactly what the shop's page printed; nothing is estimated. **These lists carry no barcode and no nutrition**, so a product here is not in
the app until its own page has been read (Tier 2) or a barcode matches the Open Food Facts catalogue.

- `raw/<shop>_listing.txt`: the crawl as printed (`#CAT ... | Page k of N | tiles T` header per page, then one `|` separated line per product),
  with `_coverage.txt` (leaf categories done, tiles collected vs shown), `_categories.txt`, `_progress.txt` (what is done and not done, method notes)
  and `_terms.txt`. Unique products collected: Sainsbury's 17,059 (all food and drink categories), Morrisons 18,412 (complete; the world-foods and dietary pages list only ids not already collected and include a few non-food items), Iceland 6,216 (done: all frozen, fresh, food cupboard, bakery, world foods and drinks pages; Treats & Snacks pages 2-33 and some promo views were only sampled, all repeats; its terms clause 3.2 forbids copying site content without written permission, published 2026-10-11 as the founder's accepted risk), Asda, Waitrose, Aldi, Lidl, M&S as in each `_progress.txt`. Co-op: blocked (Imperva, non-UK IP), 0 products.
- `sainsburys.csv` / `sainsburys-coverage.csv`: the same crawl as one row per product id (`tools/groceries/ingest_listing.py`); `checked_on` is the first day of the crawl.
- `asda.csv`, `aldi.csv`, `lidl.csv` (+ `-coverage.csv`): the same, for the three shops whose lists the founder published on 2026-10-11 (`tools/groceries/build_all_products.py`).
  Unit prices are copied as printed and only converted exactly to per kg / per litre / each (Aldi "100 G" x10, "75 CL" /0.75; Asda "per 10g" x100); a unit we
  can't read leaves the unit price out. Aldi's "note:" column (e.g. "While Stock Lasts") is an offer note, not a card price.
- `tesco.csv`, `waitrose.csv`, `morrisons.csv`, `iceland.csv`, `marks-and-spencer.csv` (+ `-coverage.csv`): published too on 2026-10-11 ("all the
  grocery stores, all the items", the founder's accepted risk; terms in docs/IMAGE_TERMS.md). Morrisons' size line follows the name as its tile prints them;
  a Morrisons meal deal is not a card price; Waitrose loose items ("Typical weight ...", an estimated price) and M&S tiles with two prices and no "was"
  are left out; Iceland's page is /p/x/<id>.html. The builder keeps groceries only (candles, sparklers, flower bouquets, cake cases, pet items are left out).
- `aldi-pages.csv`, `lidl-pages.csv`: each listed product's own page address, from the shop's own product sitemap (`tools/groceries/shop_pages.py`;
  `raw/aldi_sitemap_products.xml` is the copy Aldi served on 2026-10-11, since it answers our script's client 403). Lidl's photo addresses come from each
  product's own page: `data/groceries/images/lidl-listing.csv` (`tools/groceries/lidl_photos.py`).
- **Ocado is not here:** its crawl was stopped by the shop's bot challenge and the data is quarantined until the founder decides (see docs/PROGRESS.md).
- Tesco: 6,442 products (all fresh food and bakery, and most of frozen food), then **stopped by Tesco's own security check** (every listing page returned its "failed some security checks" error page); the crawl did not retry or work round it. Not done: the rest of frozen, all food cupboard, treats and snacks, drinks. Tesco's terms: "you must not use any automated system, software, or process (including bots, crawlers, scrapers, or AI tools) to access, extract, or collect data from this Site for any purpose without our prior written consent" (the founder accepted this risk for the crawl). Published 2026-10-11 (founder: "all the grocery stores").
