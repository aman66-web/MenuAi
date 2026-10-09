# Getting the chain files our cloud environment can't reach (Claude in Chrome, or you)

About 25 chains' nutrition files are out of reach for our cloud sessions. There are two different reasons, and they need
different handling.

| Kind of block | What it means | Best way to get the file |
|---|---|---|
| **A. Blocked from our cloud address only** (Cloudflare "just a moment", HTTP 403, "not available in your location", a page that only renders in a real browser) | The site refuses our US server but is happy to show a person its page. No `robots.txt` rule is involved. | **Claude in Chrome** can do this for you: it works inside your own Chrome, from your own connection. Good for pages and tables. |
| **B. The chain's `robots.txt` says no automated downloads** (e.g. `Disallow: /*.pdf`, `Disallow: /`) | The chain asked bots and crawlers not to fetch these files. Our rule is that we never work round that. A person saving a file is not what `robots.txt` is about; an AI agent clicking for you is a grey area. | **You click "Save" yourself** (right-click the link, Save Link As). It is about 15 files and takes about ten minutes. Claude in Chrome may navigate and show you the link, but you do the final click. |

## The files, by kind

### A. Blocked from our address (Claude in Chrome is fine)

| Chain | Page to open | What to get |
|---|---|---|
| McDonald's | mcdonalds.com/gb: Good to know, Nutrition calculator (or the UK nutrition guide PDF) | the UK nutrition guide (per item: calories, protein, carbs, fat, salt) |
| Domino's | dominos.co.uk/nutritional-information | the nutrition/allergen guide (per slice by size and base) |
| Papa Johns | papajohns.co.uk, footer: Nutrition / Allergen guide | the guide |
| Costa | costa.co.uk, the allergen and nutrition guide | the guide |
| Coffee Republic | https://coffeerepublic.co.uk/nutrition-allergen/nutrition-and-allergen-information.pdf | the 10-page PDF (September 2023) |
| Sushi Shop | https://www.mysushishop.co.uk/en/delivery/ (177 product pages listed in https://www.mysushishop.co.uk/sitemap_products.xml) | one line per product: name, calories (calories only) |
| Betty's | bettys.co.uk/allergens | the allergen page (save as PDF/HTML) |
| Angus Steakhouse | https://www.angussteakhouse.co.uk/allergens (links an ifoodi menu) | the calorie and allergen table |
| John Lewis restaurants | https://www.johnlewis.com/our-services/restaurants | the page with calories (save as PDF/HTML) |
| Burger King | https://www.burgerking.co.uk/nutritional-info and /allergy-info | the nutrition guide (it is a Google Drive link: **this one is kind B**, click it yourself) |

### B. `robots.txt` says no automated downloads (you click Save)

| Chain | File |
|---|---|
| Dave's Hot Chicken | https://cdn.sanity.io/files/ysupxjc9/production/4197d7ab55a5f626cea8dacde450fd8788c28063.pdf/Nutritional-Guide-April-2026.pdf (may print full macros) |
| Zizzi | the nutrition guide and allergen guide PDFs linked from zizzi.co.uk (autumn 2026) |
| ASK Italian | the May 2026 and autumn 2026 allergen guides linked from askitalian.co.uk |
| Coco di Mama | the AW26 Store Nutrition Guide and Allergen Guide |
| Pizza Express | the nutrition and allergen PDFs linked from pizzaexpress.com |
| Ole & Steen | its nutrition PDF |
| Subway | media.subway.com: "UKI Builds and Ingredients Nutritional Information" PDF |
| Starbucks | starbucks.co.uk/quick-links/nutrition-info: the Beverages guide and the Food guide PDFs |
| Brewhouse & Kitchen | its core menu allergen matrix PDF (August 2026) |
| Atis | atis.life/allergens-nutritionals: the four nutritional guide PDFs (curated menu, build-your-own, drinks, catering): full macros, 15 London sites |
| Smith & Western | https://www.smith-western.co.uk/wp-content/uploads/2024/08/Nutrition-Aug-2024.pdf (full macros) |
| Hungry Horse | one pub's "Allergens & Nutritional Reports" page on smartchef.co.uk (linked from hungryhorse.co.uk/allergens): may print full macros |
| Cafe Concerto | the six PDFs linked from caffeconcerto.co.uk/allergens |
| Dave's Hot Chicken (allergens) | the two allergen matrix PDFs on the same page |

The exact addresses of the held chains are also in `data/held-robots/<chain>/chain.csv` and `allergen_guide.csv`.

## Setting up Claude in Chrome (once)

Follow section 1 of `docs/PHOTOS_WITH_CLAUDE_IN_CHROME.md` (install "Claude in Chrome", sign in, allow it for one site at a time).
Do **not** run it in a mode that approves everything: if it asks to run JavaScript on a page or to send data anywhere, say no. It
only ever needs to read the page and save a file.

## Prompt for kind A (paste into the Claude in Chrome side panel)

```
I run a nutrition app and need the OFFICIAL UK nutrition/allergen file from {CHAIN NAME}'s own website ({PAGE}).
Only use {CHAIN NAME}'s own website. Do not use other sites.

1. Open {PAGE} and find the official nutrition or allergen-and-calorie guide for UK menus (a PDF or a table on the page).
   If a "verify you are human" check or login appears, stop and tell me; I will do it.
2. If it is a PDF: open it and tell me the direct address, then download it to my Downloads folder with the name
   {CHAIN-ID}.pdf. If it is a table on the page: scroll so the whole table has loaded, and give me the complete table as ONE
   CSV code block (header row first, one line per item, numbers exactly as printed, nothing converted or rounded).
3. Tell me the date or version printed on it, and how many items it has.
4. Do not click anything else, do not run scripts on the page, do not visit other sites.
```

## After you have a file

Put it in the repo on your Mac and push it, so the cloud session can read it:

```bash
cd ~/MenuAi
mkdir -p data/held-downloads/<chain-id>
mv ~/Downloads/<file> data/held-downloads/<chain-id>/
git add data/held-downloads && git commit -m "Saved <chain> guide from my browser" && git push
```

Then tell Claude "files are in data/held-downloads/<chain-id>": it reads them from disk, extracts them with the usual script
and accuracy checks, and republishes. The chains that print full macros (Dave's Hot Chicken, Atis, Smith & Western, Hungry
Horse, McDonald's, Domino's, Papa Johns, Costa) count towards the complete-nutrition target.
