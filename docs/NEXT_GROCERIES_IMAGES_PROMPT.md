# Groceries: each product's own photo from its supermarket's website (for a Claude Code session with Chrome)

Founder's decision (2026-10-08): "use the official images from Sainsbury's, Tesco etc from their website" for every grocery product. The app
shows the supermarket's own photo (hotlinked from its image host, never copied or altered) captioned "Photo from the {shop} website", and falls
back to the Open Food Facts photo where we don't have one yet. The supermarkets' sites refuse automated visits from the cloud build
environment (403: never worked round), so this runs in the founder's own Chrome: `claude --chrome` in a MenuAi clone on `claude/menumacros-kit`.

Already done from the discovery lists in the repo (`data/groceries/discovery/*.csv`): Tesco 298 and Sainsbury's 535 products. Run
`python3 tools/groceries/build_groceries.py --images-only` after adding rows; `python3 tools/groceries/missing_images.py` lists what is still
missing, per supermarket, in `data/groceries/wanted-images/<retailer>.csv` (gtin, name, size; own-brand and high-protein first).

## Rules (they never relax)

- Your own Chrome only, the shop's own website only. Never Google Images, comparison sites, delivery apps, social media, Open Food Facts.
- One tab per supermarket, one page at a time per site, 3-4 seconds between page loads, at most 3 tabs. A "verify you are human" page, a block,
  a CAPTCHA or a login wall: stop that site and tell the user. Never work round it.
- Only the shop's own photo of that exact product: open the shop's product page for the barcode/name/size in the wanted list; if the page's
  name and pack size don't match the wanted row exactly (same product, same size), write nothing for it. A wrong photo is worse than none.
- Copy the image URL exactly as the page's `<img>` serves it (the product photo, not a badge, banner, "image coming soon" placeholder or
  a different pack shot of another size). Do not download or edit the image file.
- Write files as you go (append every ~25 products), so nothing lives only in the tab; a restart must skip what is already on disk.
- No `git commit` / `git push` unless the user asks.

## What to write

`data/groceries/images/<retailer>.csv`, columns exactly `gtin,image_url,page_url,checked_on`:
`gtin` = the barcode from the wanted row (digits only), `image_url` = the photo's https URL, `page_url` = the product page you read it from,
`checked_on` = today (YYYY-MM-DD).

## Image hosts

`tools/groceries/build_groceries.py` only accepts photo URLs on a shop's own image host (`IMAGE_HOSTS`): Tesco `digitalcontent.api.tesco.com`,
Sainsbury's `assets.sainsburys-groceries.co.uk`. For every other supermarket, look at which host its product pages load the photo from
(right-click the photo > Open Image in New Tab shows the address; it must be the shop's or its CDN's own domain), add that host to
`IMAGE_HOSTS` (one tuple entry, e.g. `"asda": ("ui.assets-asda.com",)`), run `python3 -m unittest discover -s tools/tests`, and mention
the new host in your report so the founder can see where photos will load from. Hosts that aren't the shop's own are not added.

## Then

`python3 tools/groceries/build_groceries.py --images-only` (no Open Food Facts cache needed) rewrites `web/public/groceries/*.json` and the
manifest hashes; check the product pages in the web app (`cd web && npm run dev`, /app/groceries) for a few products per shop: the photo is the
right product and the caption reads "Photo from the {shop} website". Report per supermarket: rows written, products skipped (name or size
mismatch), blocks met.
