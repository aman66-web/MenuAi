# Extracted but not published

Chains here were extracted from the organisation's own official source but are not published: either they are not restaurants a
person can walk into and order from, or the chain's own sources contradict each other. Moving a folder back into `data/source/` publishes it.
`tools/build_menus.py` only reads `data/source/`, so nothing in this folder reaches the site.

| Folder | Why it is held | Source |
|---|---|---|
| `norse-catering/` | Norfolk primary-school lunch menu (72 items, full nutrition, one held back). Script: `tools/uk_extract/norse_catering.py`, `norse_catering_pdf.py` (they read `data/source/norse-catering`: move the folder back to restore) | Norse Group "Nutrition Analysis for Primary Menu Spring/Summer 2026" PDF, created 26 March 2026 |
| `thaikhun/` | The Ten Kites page (undated, not linked from the chain's own pages) and the chain's own allergen & calorie page (igfd.menu, matches the Aug 2026 menu) print different calories for 53 of 64 same-name dishes; only 6 of 138 dishes agree. Scripts: `tools/uk_extract/thaikhun.py`, `thaikhun_current_page.py` (`--ten-kites-only` would publish all 131, not recommended). Reviewed flags: `data/audit/reviewed/thaikhun.csv` | https://menus.tenkites.com/tlg/thaikhun and the chain's igfd.menu page, saved 2026-10-08 |
| `pgl-travel/` | PGL Travel's UK Families menu (a weekly rota for children's activity-centre holidays, 139 items published-ready, full nutrition, allergens complete): a menu only holiday guests can eat, so not a place the public can order from. Scripts: `tools/uk_extract/pgl_travel.py`, `pgl_travel_pages.py` (read `data/source/pgl-travel`: move the folder back to restore) | https://menus.tenkites.com/pgltravel/pgl02 (Ten Kites), read 2026-10-08, no date shown |
| `papas-fish-and-chips/` | Papa's Fish & Chips: 5 items with full nutrition per portion from 2018 lab reports (read from rendered pages, verified), but the chain has only about 5-9 current shops (below our 10-site bar). Script: `tools/uk_extract/papas_fish_and_chips.py` (reads `data/source/papas-fish-and-chips`: move the folder back to restore) | https://papasfishandchips.com/nutritional-information/ (PDFs created 23 Dec 2018) |
| `chaophraya/` | Chaophraya (6 UK restaurants): the Ten Kites page (undated) and the chain's own igfd.menu Allergens & Calories pages disagree (3 of 8 comparable dishes differ), so only 5 dishes are confirmed by both and 83 are held back; `--ten-kites-only` would publish 85 (not recommended: not chosen between). Scripts: `tools/uk_extract/chaophraya.py`, `chaophraya_current_page.py` (read `data/source/chaophraya`: move the folder back to restore) | https://menus.tenkites.com/chaophraya and the chain's igfd.menu pages, read 2026-10-09 |

To publish one anyway: move its folder back into `data/source/`, then `python3 tools/uk_extract/check_chain.py <id> --fail-on-high`.
