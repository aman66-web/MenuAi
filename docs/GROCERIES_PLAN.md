# Groceries: Sainsbury's, Tesco, Asda, Waitrose, Lidl, Aldi (plan and what is possible)

Founder's request (2026-10-07): add supermarket groceries to the app, as well as restaurants: for each product the image, macros,
price, allergens and, if possible, the barcode number, so people can shop with it, and so recipes can later be generated from the
products with AI. "Pull images and all the information from the stores' websites", using as many agents as needed.

Nothing is built yet. This page is what a one-request-per-site check found on 2026-10-07 (from the founder's Mac), what that means,
and the decisions needed before building. No site was crawled.

## What the check found

| Source | Result |
|---|---|
| tesco.com (groceries) | **403**: refuses automated visits |
| sainsburys.co.uk | **403**: refuses automated visits |
| groceries.asda.com | **403**: refuses automated visits |
| aldi.co.uk | **403**: refuses automated visits |
| lidl.co.uk | 200 (reachable), but Lidl GB's website mostly shows weekly specials, not its everyday range with prices and nutrition: unverified |
| Open Food Facts (open database, world.openfoodfacts.org) | answered; had about 5,800 UK products tagged Tesco and about 1,900 tagged Lidl (its API said "temporarily unavailable" part-way, so the other retailers' counts were not read). It has barcode, nutrition per 100 g, allergens and photos, but **no prices** (its price project is separate and sparse) |
| Claude in Chrome | not connected to this session |

The 403s are bot protection. We never work round a block (CLAUDE.md, docs/UK_DATA_PLAYBOOK.md). A person in a normal browser is let in,
which is why Claude in Chrome (in the founder's own Chrome) is the route for the retailer sites themselves.

## Why this is much bigger than restaurants

- **Scale:** each supermarket sells tens of thousands of products (restaurants: about 13,000 items across 72 chains in total).
- **Prices differ** by store, by online vs in store, and by loyalty price (Clubcard, Nectar, Aldi Price Match). Whatever we show has to be labelled
  "price checked on {date} at {retailer} online; may differ in your store".
- **Barcodes are rarely on retailer pages.** The usual source of GTIN/EAN numbers is Open Food Facts or a barcode database.
- **Allergens are safety information.** The standard we set for restaurants (copied from the chain's own guide, all or nothing, "check the pack") still applies:
  community data (Open Food Facts) can be wrong or out of date, so it would carry a plain "community data: always check the pack" label.
- **Terms:** supermarkets' terms restrict copying their product data, prices and photos. That is the same kind of risk the founder accepted for restaurant photos
  and logos, but at a much larger scale, and for prices (databases) it is a bigger exposure. Needs the founder's explicit call.
- **Usage:** the agent swarm used for restaurants ran into the founder's Claude usage limit; a catalogue of 100,000+ products cannot be crawled by agents at all.
  Anything at that scale has to be done by plain scripts that read published product data, not by agents reading pages.

## Options

**A. Open Food Facts first (fastest, no scraping of the stores).** Build the product catalogue from Open Food Facts for products sold by the five retailers (own brands
and big brands): barcode, name, brand, size, nutrition per 100 g (and per serving where given), allergens, photo. Credit "© Open Food Facts contributors" (data ODbL,
photos CC BY-SA). No prices in v1; the product page links to the retailer's search for the barcode. Not an official source, so labelled as community data.

**B. The retailers' own websites, through Claude in Chrome, for a chosen subset.** Official prices, photos, nutrition and allergens, but only as fast as a
browser agent reads pages: realistic for a few hundred products per retailer (for example the own-brand protein range), not whole catalogues.

**C. Hybrid (recommended).** A for the whole catalogue (barcodes, macros, allergens, photos), then B to add retailer prices and official photos for the products
people actually look at (own-brand and high-protein ranges first), keyed by barcode. Ask each retailer's affiliate or partner programme whether a product
data feed is available: that is the legitimate way to get whole-catalogue prices.

## What it would add to the app

- A "Groceries" tab beside Restaurants: search by name or barcode, filter by retailer, protein per 100 kcal, allergens (display first, filter later), price.
- Product page: photo, per 100 g and per serving, allergens table (same 14), price with retailer, date and "may differ in your store", the barcode number.
- **Barcode scan** in the web app (camera, on the phone, nothing sent anywhere): scan a pack, open the product.
- A basket/shopping list with totals (calories, protein, price), and the product list as the base for the later AI recipe feature.
- Data layer: new `products` catalogue separate from restaurant menus: `retailer, gtin, name, brand, size, nutrition (per 100 g, per serving),
  allergens, image, prices[{retailer, amount, per, channel, checkedOn}]`, built by the same kind of checked pipeline (`tools/build_menus.py` style),
  sharded by retailer so the app downloads only what it needs.

## Decisions needed from the founder

1. Is Open Food Facts (community data, labelled as such) acceptable as the main source for macros, allergens and barcodes, with retailer sites for prices and photos where we can get them?
2. Scope for v1: all five retailers' own brands and protein-relevant ranges (my suggestion), or everything we can get?
3. Prices: are you happy to show retailer online prices with a "may differ in your store" label, taken through Claude in Chrome in your own browser?
4. Are you willing to ask the retailers (or an affiliate network) about product data feeds? That is the only clean route to complete, current prices.
