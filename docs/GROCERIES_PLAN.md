# Groceries: the eleven biggest UK supermarkets (what is built, what is possible)

Supermarkets: Tesco, Sainsbury's, Asda, Aldi, Morrisons, Lidl, Co-op, Waitrose, M&S, Iceland, Ocado (see docs/PROGRESS.md for the share figures).

Founder's request (2026-10-07): add supermarket groceries to the app, as well as restaurants: for each product the image, macros,
price, allergens and, if possible, the barcode number, so people can shop with it, and so recipes can later be generated from the
products with AI. "Pull images and all the information from the stores' websites", using as many agents as needed. Waitrose was
added the same day. Later the founder said "you can do it all for me": the options below were decided by Claude (the hybrid, C).

## Status

Built and in the app (web): Groceries tab, search by name or barcode, supermarket and type filters, sort by protein per 100 kcal,
product page (photo, per-100 g macros, the 14 allergens, barcode, price where known, links to each supermarket's own search),
shopping list, barcode entry and camera scanning. Catalogue = Open Food Facts (see below); it fills as `tools/groceries/fetch_off.py`
runs (the counts per supermarket are in `data/groceries/REPORT.md` and `web/public/groceries/groceries-manifest.json`).

Not done, and why:
- **Prices.** Open Food Facts has none, and the supermarkets' websites refuse automated visits. They need a person's browser:
  `docs/NEXT_GROCERIES_PROMPT.md` is the prompt for a Claude Code session with Chrome (`claude --chrome`) that writes
  `data/groceries/prices/<retailer>.csv`; `tools/groceries/build_groceries.py` validates and merges it. `tools/groceries/make_wanted.py`
  lists which barcodes to look up first (own-brand and high-protein products).
- **Official photos and nutrition from the retailers.** Same blocker, same route. **Photos (founder, 2026-10-08: "use the official images from
  Sainsbury's, Tesco etc from their website"):** built. A product shows its supermarket's own photo (hotlinked from the shop's image host,
  captioned "Photo from the {shop} website") and falls back to Open Food Facts'. Sources, in order: `data/groceries/images/<retailer>.csv`
  (written by the Chrome session of `docs/NEXT_GROCERIES_IMAGES_PROMPT.md`), the details file's `image_url`, then the discovery lists; only
  URLs on a host listed in `IMAGE_HOSTS` (`tools/groceries/build_groceries.py`) are accepted. Today: Tesco 298 and Sainsbury's 535 products;
  the other nine supermarkets have no products in the catalogue yet (Open Food Facts fetch incomplete), so there is nothing to attach to.
  **Photo chain, "Option D" (founder, 2026-10-09):** the app tries, in order, (1) our own stored 400 px WebP copy of the shop's photo
  (`photo` on the product, served from `/grocery-images/<shop>/`, chosen by `tools/groceries/select_stored_photos.py`: priced products first, then
  the default "Most protein per 100 kcal" order, at most 3,000, only shops in `fetch_retailer_images.STORE`: Sainsbury's today, **never Tesco**
  because its image host answers 403 to robots.txt and its terms ban automated tools), (2) the shop's picture hotlinked (`retailerImage`,
  `referrerPolicy="no-referrer"`), (3) Open Food Facts' picture, (4) "no photo". A picture that fails to load moves to the next place
  (`photoSources` in `web/lib/mm/groceries.ts`, `usePhotoSource` in `ProductPhoto.tsx`). Captions: "Photo from the {shop} website" for (1)
  and (2), "Photo: Open Food Facts contributors (CC BY-SA)" for (3). Stored copies live on our server, not on the visitor's phone; the privacy
  page says which places a picture can be loaded from.
- **AI recipes.** Later; the catalogue (barcode, macros per 100 g, allergens, size) is the base for it.

## What the check found (2026-10-07, from the founder's Mac, one request per site)

| Source | Result |
|---|---|
| tesco.com (groceries) | **403**: refuses automated visits |
| sainsburys.co.uk | **403** |
| groceries.asda.com | **403** |
| aldi.co.uk | **403** |
| lidl.co.uk | 200, but mostly weekly specials, not the everyday range with prices and nutrition |
| Open Food Facts (world.openfoodfacts.org) | works: barcode, per-100 g nutrition, allergens, photos; **no prices** |
| Claude in Chrome | not connected to the build session |

The 403s are bot protection. We never work round a block (CLAUDE.md, docs/UK_DATA_PLAYBOOK.md). A person in a normal browser is
let in, which is why Claude in Chrome / `claude --chrome` in the founder's own Chrome is the route for the retailer sites.

## Rules for this data

- **Community data, not official.** Open Food Facts is edited by volunteers: the app says so on the product page and the privacy page,
  credits "Open Food Facts contributors" (data ODbL, photos CC BY-SA, hotlinked from images.openfoodfacts.org, nothing copied).
- Only products with a valid barcode (GTIN check digit), a name and complete, plausible per-100 g kcal, protein, carbs and fat are kept.
- **Allergens:** an unknown stays "unknown" and is never shown as "none". Always "check the pack".
- **Prices** (when they arrive) are labelled "price checked on {date} at {retailer} online; may differ in your store" (Clubcard, Nectar and
  Aldi Price Match prices are not the shelf price).
- Scale: the fetcher is deliberately slow (Open Food Facts allows about 10 searches a minute and caps a query at 1,000 results, so big
  queries are sliced by an internal nutrition-grade tag). It is resumable (`/private/tmp/off-cache`), and `--skip-unknown` leaves out the
  heavy "no nutrition grade" slice on a first pass.

## Terms

Supermarkets' terms restrict copying their product data, prices and photos. The founder accepted the same kind of risk for restaurant
photos and logos. Open Food Facts avoids it for the catalogue; the exposure comes with prices and retailer photos, which is why those go
through the founder's own browser session and only for the products people look at.

## Data layer

`web/public/groceries/<retailer>.json` (sharded by retailer so the app downloads only what it needs) plus `groceries-manifest.json` with
a SHA-256 per file; each product: `gtin, name, brand, size, per-100 g nutrition, serving where given, allergens, image, category,
prices[{retailer, amount, per, channel, checkedOn}]`. Built by the checked pipeline in `tools/groceries/` (tests in
`tools/tests/test_groceries.py`, `web/tests/groceries.test.ts`).

## Still to decide with the founder

1. Whether to ask the retailers (or an affiliate network such as Awin or Impact) for a product data feed: the only clean route to
   complete, current prices.
2. How far to take prices through the browser route (a few hundred own-brand and protein products per retailer is realistic).

## Every product (founder, 2026-10-09)

The catalogue above is what Open Food Facts knows (barcode, numbers). The shops list far more (Sainsbury's 17,036 priced products). `tools/groceries/build_all_products.py` turns each published
shop's listing crawl (`data/groceries/listing/<shop>.csv`) into `web/public/groceries/all/<shop>.json`; the app shows it under "Every {shop} product" as name, price, price per kg or litre,
card price, the shop's picture and a link to the shop's page, and says plainly that nutrition has not been read. `PUBLISH` lists the shops that may be shown; add one only after the founder has
seen its terms (`data/groceries/listing/raw/<shop>_terms.txt`). Reading product pages (Tier 2, `docs/NEXT_GROCERIES_DISCOVERY_PROMPT.md`) adds barcodes and nutrition; a product with a barcode
we already hold links to its full page.
