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

Held for other reasons (not PDFs): Joe & The Juice (its robots.txt forbids automated reading), Cinnabon and Brakspear (a security check screen), Dobbies (menu loads only after accepting cookies), Millie's Cookies (needs a decision on which calorie figure is "the serving").
