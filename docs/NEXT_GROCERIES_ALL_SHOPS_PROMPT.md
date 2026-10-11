# Groceries: official labels, barcodes and the missing shops (for a Claude Code session with Chrome on the founder's Mac)

Founder 2026-10-11: "all the grocery stores, all the items ... all the images for every single item, all the nutritional information". What the
cloud session could do is live: every product the shops' own category pages list, with each shop's own photo (Sainsbury's, Tesco, Asda, Aldi,
Lidl, Morrisons, Waitrose, Iceland, M&S), and Open Food Facts numbers matched by exact barcode where a barcode is known (mostly Asda). What it
can't do: read the shops' own product pages (they refuse the cloud environment), so the official labels, most barcodes, Tesco's unfinished
categories and Co-op need your own Chrome. Run `claude --chrome` in a MenuAi clone on `claude/menumacros-kit` and give it this file.

## Rules (they never relax; the same as docs/NEXT_GROCERIES_DISCOVERY_PROMPT.md)

- Your own Chrome, the shop's own website only (never Google, comparison sites, delivery apps or Open Food Facts).
- One tab per shop, one page at a time, 3-4 seconds between pages, at most 3 shops at once. A "verify you are human" page, a CAPTCHA, a block or
  a login wall: stop that shop and say so. Never work round it. Respect each shop's robots.txt (quoted in `data/groceries/listing/raw/<shop>_terms.txt`).
- Copy what the page prints, exactly. Never estimate, convert or fill in a figure. A page whose product name or pack size doesn't match the list row
  exactly: write nothing for it.
- Append to the files every ~25 products so a restart skips what is on disk. No `git commit` or `git push` unless the founder asks.

## 1. Official labels for every shop (the most useful part)

For each shop in `data/groceries/listing/<shop>.csv`, open each product's own page and copy its nutrition table, the way Sainsbury's was done
(`tools/groceries/t2_sainsburys.py` and `t2_extractor.js`: adapt the extractor's selectors to the shop, keep its checks). Write
`data/groceries/nutrition/<shop>.csv` with exactly these columns (the same file `tools/groceries/build_all_products.py` already reads):

`product_id,per,state,kj,kcal,fat_g,saturates_g,carbs_g,sugars_g,fibre_g,protein_g,salt_g,checked_on,page_url`

- `product_id` = the id in that shop's listing file (Tesco's number, Waitrose's `065131-33004-33005`, Iceland's number, Aldi's number, Lidl's `p...`,
  Morrisons' number, M&S's `ckp...`; Asda's listing id).
- Only a plain "per 100g" or "per 100ml" column counts (`per` = `g` or `ml`); a heading that says cooked, prepared, grilled, drained... goes in
  `state` as printed. `<0.5` is copied as printed. A table without kcal, protein, carbohydrate and fat: write nothing.
- Where the page shows a barcode, also write `data/groceries/discovery/<shop>-barcodes.csv` (`product_id,gtin`) and
  `data/groceries/discovery/<shop>.csv` (`product_id,page_url`): the build then joins the product to other shops selling the same barcode.
- Finding the page: Tesco `https://www.tesco.com/groceries/en-GB/products/<id>`; Iceland `https://www.iceland.co.uk/p/x/<id>.html`; Aldi and Lidl
  from `data/groceries/listing/<shop>-pages.csv`; Waitrose, Morrisons, M&S and Asda: the shop's own search for the exact name, then the result
  whose name and size match exactly.
- Order: meat and fish, chilled, frozen, food cupboard, snacks, fruit and veg, bakery, drinks (alcohol has no table: skip it). Tesco first (the
  founder's main ask), then Asda, Waitrose, Morrisons, Aldi, Iceland, Lidl, M&S.

## 2. Finish Tesco's list

Tesco's own bot check stopped the category crawl on 9 October after fresh food, bakery and most of frozen. Carry on with Tier 1 of
docs/NEXT_GROCERIES_DISCOVERY_PROMPT.md for the rest of frozen, food cupboard, treats and snacks, and drinks (append to
`data/groceries/listing/raw/tesco_listing.txt`, same line format). Stop at the first security page.

## 3. Co-op and Ocado

- Co-op blocked even through a UK VPN (CAPTCHA). Try once; if it still asks, stop and tell the founder.
- Ocado: its earlier crawl is quarantined and must not be used. Crawl it again only if the founder says so, politely, from its own category pages.

## Afterwards (the cloud session or you)

```bash
python3 tools/groceries/ingest_listing.py tesco data/groceries/listing/raw/tesco_listing.txt --checked-on <first day>
python3 tools/groceries/build_all_products.py          # lists, photos and the labels you read
python3 tools/groceries/build_groceries.py --patch --out web/public/groceries --add-codes <folder from tools/groceries/fetch_off_codes.py>
cd web && npx vitest run && npm run build
```
