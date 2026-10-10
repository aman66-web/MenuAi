# PDFs that hold the data (Claude in Chrome cannot read Chrome's PDF viewer, and downloading needs your OK)

Written 2026-10-10 after the queue run. Each chain below publishes its nutrition (or allergens) only as a PDF on its own website. Say
"download the PDFs" (or name some chains) and I will fetch each one politely from your Mac (robots.txt honoured, one request per second,
saved into `data/held-downloads/<chain>/`, never worked round a refusal), then the cloud session reads them with its PDF readers.
Or save them yourself from your browser into `data/held-downloads/` and say "inbox: <chain>".

| Chain | PDF | What it holds |
|---|---|---|
| Domino's | files on https://corporate.dominos.co.uk/about-us/our-food/allergens-and-nutrition (two nutrition files + allergen file) | nutrition per product |
| Papa Johns | https://www.papajohns.co.uk/static/assets/pdfs/nutritional-information.pdf | 84 pages, nutrition + allergens |
| Shake Shack | https://www.shakeshack.co.uk/wp-content/uploads/2026/05/Shake-Shack-Allergens-Info-May-2026.pdf, https://www.shakeshack.co.uk/wp-content/uploads/2026/09/NUTRITIONAL-ISLAND-CHICKEN-LTO-Shake-Shack-UK-2.pdf and the main-menu nutrition PDF linked from https://www.shakeshack.co.uk/menu/allergen-information/ | calories + allergens |
| Tonkotsu | https://tonkotsu.co.uk/wp-content/uploads/2025/11/Tonkotsu-Nutritional-Information.pdf | nutrition |
| Krispy Kreme | "View our nutritional PDF" on https://www.krispykreme.co.uk/nutritionals | doughnut nutrition + allergens |
| West Cornwall Pasty Co. | https://westcornwallpasty.co.uk/wp-content/uploads/2026/09/WCP_Allergens_28-09-26.pdf | allergens + per-product and per-100 g nutrition (one page, v12, 28/09/2026) |
| Bubbleology | https://bubbleology.co.uk/wp-content/uploads/2023/09/Nutritional-Information.pdf (2023) and its allergen book PDF | nutrition (dated 2023) + allergens |
| Maki & Ramen | eight PDFs linked from https://www.makiramen.com/our-menu/calorie-info/ (sashimi, rice, sides, sushi sets, yakisoba, maki rolls, nigiri, ramen) | calories |
| Fireaway Pizza | "Download Allergen Information (PDF)" on https://www.fireaway.co.uk/allergen-information | nutrition + allergen guide |
| IRO Sushi | https://www.irosushi.com/wp-content/uploads/2025/10/IRO_SUSHI_MENU.pdf | menu (may hold calories) |
| Hydes | https://www.hydesbrewery.com/wp-content/uploads/2026/07/SS26-07-JULY-Main-Menu.pdf | menu with kcal |
| Mother Hubbard's | https://www.mother-hubbards.co.uk/wp-content/uploads/2026/04/2026_food_and_drink.pdf | menu |
| Cineworld | https://www.cineworld.ie/magnoliaPublic/dam/jcr:3bfbe003-5658-4ca0-add4-3918c1cb6bee/26-07-22%20Cineworld%20Allergen%20and%20Nutritional%20Information.pdf | allergens + nutrition |
| Kew Gardens cafés | https://www.kew.org/sites/default/files/2026-10/Pavilion-menu-Autumn-2026.pdf and three more on https://www.kew.org/kew-gardens/eating-and-drinking | menus (single attraction: probably not worth it) |
| Pizza Express | "Download PDF" buttons (allergens, nutritionals, ingredients list) on https://www.pizzaexpress.com/allergens-and-nutritionals (robots.txt of the site allows the page; the page also shows a cookie dialog that this session did not accept; note docs/PROGRESS.md says Pizza Express's earlier PDF host disallows automated fetching, so save the files yourself) | nutrition per dish + allergens |
| Subway UK | Nutrition and Allergen PDFs (September 2026) linked from https://www.subway.com/en-gb/menunutrition/nutrition on media.subway.com (the menu pages are a JavaScript app that does not load in Chrome here and show no calories) | nutrition + allergens |

Held for other reasons (not PDFs): Joe & The Juice (its robots.txt forbids automated reading), Cinnabon and Brakspear (a security check screen), Dobbies (menu loads only after accepting cookies), Millie's Cookies (needs a decision on which calorie figure is "the serving").

## Result of the download run (2026-10-10, after your "yes, all listed")

Downloader: `tools/uk_extract/inbox_pdfs.py` (list in `data/held-downloads/pdf_list.csv`, outcome per chain in `data/held-downloads/<chain>/downloads.csv`). Each host's robots.txt was read first (RFC 9309) and one request per second was kept; a refusal was never worked round.

| Chain | Result |
|---|---|
| Domino's | **4 files stored** (nutrition for pizzas 21 pages, sides and desserts 4 pages, allergen leaflet, ingredients and allergens), all dated 7 September 2026, text layer readable; full macros per pizza and per slice |
| Papa Johns, Shake Shack, Tonkotsu, Krispy Kreme, West Cornwall Pasty, Bubbleology, Hydes, Pizza Express, Maki & Ramen | **not fetched: the site's own robots.txt disallows the PDF address** (save the files from your own browser if you want them) |
| Mother Hubbard's | HTTP 403 from the site: not worked round |
| IRO Sushi | stored then deleted: an image-only menu, no text and no calorie figures |
| Subway | the host did not answer twice (read timed out, not a refusal): save the two September 2026 PDFs from your own browser |
| Cineworld | its Irish host failed the TLS handshake with our downloader: not worked round |
| Fireaway | its site now shows a Cloudflare "you have been blocked" page to the browser: not worked round |
| Kew Gardens cafes | not fetched: a single attraction (fewer than 3 UK sites) |
