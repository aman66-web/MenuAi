# Chrome inbox: what has been imported (2026-10-10 / 11)

Imported into `data/source/<chain>/` with `tools/uk_extract/chrome_import.py` (gate: `check_chain.py <chain> --fail-on-high`: 0 errors, 0 high audit flags for each):

| Chain | Items in source | Held back | Allergens | Site count evidence |
|---|---|---|---|---|
| McDonald's | 153 | 2 (Cappuccino: the page prints 34 g salt) | link only (12 products print none) | 1,600 UK & Ireland (own newsroom) |
| Costa | 141 | 0 | complete | 50 within a mile of central London (own store locator: a lower bound) |
| Burger King | 54 | 2 (page kcal vs its own macros 22% and 18% apart) | link only | 300+ towns listed on its own locations page |
| Starbucks | 56 (food only) | 1 (Banana Nut Loaf: fat printed as 368 g) | link only | 1,300+ UK stores (own 2024 supply chain statement) |
| Turtle Bay | 60 | 0 | link only | 43 (menu dropdown) |
| Sushi Shop | 136 | 0 | none (a link on each page) | 4 London shops |
| The Alchemist | 24 | 1 (Tempura Fish & Chips: no gluten marked) | complete | 12 cities |

Not imported: John Lewis Café (its "Place to Eat" brand is being replaced by Platter, and the figures come from a sample menu).
Domino's came from PDFs: `tools/uk_extract/dominos.py` -> `data/source/dominos/` (see PDF_DOWNLOADS.md).

Still to do by the session that publishes: an independent re-read of at least 15 rows per chain against the live pages (the reads here were made once, with kcal-vs-macros and kJ checks), logos, `./scripts/publish_menus.sh`. Each row's page address is in `data/chrome-inbox/<chain>/items.csv`.
