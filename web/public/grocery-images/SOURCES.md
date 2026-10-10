# Supermarket product photos: where they come from

Founder's decision 2026-10-08 (docs/PROGRESS.md): a product may show **the supermarket's own photo of it**, resized only (400 px longest side since Option D, 2026-10-09; WebP; never cropped,
recoloured, retouched or generated), taken only from that supermarket's own pages (a product page we priced, or the shop's listing page for the product), for the exact product whose barcode the shop's page gave.
Caption in the app: "Photo from the {shop} website". Never used in marketing, the share card, the app icon or store screenshots. A shop's photos come down the day it
asks (delete its folder here and `data/groceries/images/<shop>.csv`, rebuild). Where no shop has a photo of a product, the app shows "no photo": Open Food Facts'
photos are never used (founder 2026-10-10: every picture comes from the supermarket's own website).

| shop | source page | image host | robots / terms (quoted in docs/IMAGE_TERMS.md) |
|---|---|---|---|
| Sainsbury's | the product page in `data/groceries/images/sainsburys.csv` (`page_url`) | assets.sainsburys-groceries.co.uk (`/gol/<id>/1/640x640.jpg`) | no robots.txt on the image host; the site's robots.txt does not disallow product pages; terms: no clause on content copying or automated access found |
| Tesco | hotlinked only: the picture address on the product's own page (`data/groceries/discovery/tesco.csv`, `details/tesco.csv`) or on the listing row (`listing/tesco.csv`) of the page a price row was read from | digitalcontent.api.tesco.com | robots.txt answers 403 (treated as do-not-fetch): **no Tesco photo is downloaded**; terms prohibit automated access and copying |

Each CSV row: `gtin,image_url,page_url,checked_on,file` (file = `<sha256 of the source bytes, 12 hex>.webp` in the shop's folder here). Choose and fetch with
`python3 tools/groceries/select_stored_photos.py` (priced products first, then protein per 100 kcal, at most 3,000), then `python3 tools/groceries/build_groceries.py --patch` (or the full build); look at `tools/groceries/photo_sheet.py <shop>` before trusting a set.
