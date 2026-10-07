# Groceries: every product, exact names, full details (for a Claude Code session with Chrome)

Run with `claude --chrome` in the MenuAi folder (or in the session that is already running). Founder's wishes (2026-10-07): every product
each supermarket sells is in the app; the name is **exactly** what that supermarket's website prints (for example "Sainsbury's Mini Potatoes
750g"); each listing shows that shop's own nutrition, ingredients and allergy wording; one listing per size; prices at the other shops.

## Rules (they never relax)

- Your own Chrome only, the shop's own website only. Never Google, price-comparison sites, delivery apps or social media.
- **One tab per supermarket, one page at a time per site, about 3-4 seconds between page loads.** Different supermarkets may run at the same
  time (at most 3 tabs open). Never two tabs on the same site.
- A "verify you are human" page, a block, a CAPTCHA or a login wall: **stop that site and tell the user.** Never work round it.
- Copy exactly what the page prints. Never calculate, convert, round, guess or fill a gap (blank if the page doesn't show it).
- Shelf price only: leave out Clubcard / Nectar / multi-buy / "was" prices.
- Write files as you go (append every ~25 products or every category page, whichever comes first), so nothing lives only in the tab.
  A restart must skip what is already on disk.
- No `git commit` / `git push`: only write the files named here. Send one line of progress to the session "menu ai - terminal" after each
  supermarket's tier finishes, or if anything blocks.

## Tier 1: list EVERYTHING (fast: a listing page shows 48-100 products)

For each supermarket: start at its groceries home, walk the **whole category tree** down to the leaf categories, and page through every
page of every leaf category. From the listing cards (no need to open each product):

`data/groceries/discovery/<retailer>.csv`, columns exactly:
`product_id,name_on_page,price_gbp,unit_price_gbp,unit,category_path,page_url,image_url,in_stock,checked_on`

- `product_id`: the shop's own id for the product (the number or code in its product URL). One row per product id (de-duplicate:
  a product appears in several categories, keep the first, remember all category paths separated by " | ").
- `name_on_page`: the product title **exactly as the listing prints it, including the brand and the pack size when the title has them**
  (example: `Sainsbury's Mini Potatoes 750g`). Same capitals, same punctuation, same words.
- `price_gbp`, `unit_price_gbp`, `unit`: as printed ("£1.10", "£2.62 / kg" gives 1.10, 2.62, per kg).
- `page_url`: the product's page. `image_url`: the card's photo address (do not download it). `in_stock`: yes/no.

**Prove nothing was missed.** Each category page says how many products it has ("213 products"). Write
`data/groceries/discovery/<retailer>-coverage.csv` with columns `category_path,category_url,shown_total,collected,checked_on` (one row per
leaf category). If `collected` is lower than `shown_total`, go back and find the missing ones before moving on; if it still differs,
leave the row as it is and say so in the progress line. The user wants "X of Y listed products collected" for every shop.

## Tier 2: read each product page (slower: one page per product)

For every product (priority order: the products in `data/groceries/wanted/<retailer>.csv` first, then own-brand ranges, then everyday basics:
milk, eggs, bread, meat, fish, cheese, yoghurt, rice, pasta, cereal, fruit and veg, then the rest), open its page and write
`data/groceries/details/<retailer>.csv`, columns exactly:

`gtin,product_id,name_on_page,pack_size,ingredients,allergy_advice,nutrition_basis,energy_kj,energy_kcal,fat_g,saturates_g,carbs_g,sugars_g,fibre_g,protein_g,salt_g,other_nutrients,per_portion_text,image_url,in_stock,page_url,checked_on`

- `gtin`: the product's barcode if the page shows it (in the page data it is often called gtin, ean or barcode); blank if the shop doesn't
  show one (and say in the progress line whether the shop's pages show barcodes at all).
- `name_on_page`: the product page's own title, exactly as printed.
- `ingredients`: the ingredients text as printed (allergen emphasis words are plain text).
- `allergy_advice`: the "allergy advice" / "may contain" wording as printed.
- `nutrition_basis`: "per 100g" or "per 100ml" as labelled; if the page only shows per-portion figures, put "per portion only" and leave
  the nutrient columns blank. The nutrient columns are the per-100 g/ml figures as printed, with their units ("87kcal", "0.5g", "<0.1g";
  blank if absent). If the table's row is called "Available Carbohydrate" (or "Total Carbohydrate"), that figure goes in `carbs_g`.
- `other_nutrients`: every OTHER row of the nutrition table (vitamins, minerals, polyunsaturates, starch, polyols...) as
  "Label: value; Label: value". `per_portion_text`: the per-portion column and its %RI values as "Label: value; Label: value", serving size first.
- Price rows for the same products also go to `data/groceries/prices/<retailer>.csv` as before (see `docs/NEXT_GROCERIES_PROMPT.md`) when the
  product has a barcode and is in stock.
- Never skip a product because its page is missing a field: write the row with blanks.

## How the app uses it

`tools/groceries/build_groceries.py` merges these files: the exact `name_on_page` becomes that shop's name for the product, its nutrition
replaces the community numbers when complete, ingredients and allergy wording are shown as the shop prints them, and the same barcode at
several shops is one product with each shop's price. Coverage ("X of Y") comes from the coverage files.
