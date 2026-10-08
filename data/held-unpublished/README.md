# Extracted but not published

Chains here were extracted from the organisation's own official source but are not published: either they are not restaurants a
person can walk into and order from, or the chain's own sources contradict each other. Moving a folder back into `data/source/` publishes it.
`tools/build_menus.py` only reads `data/source/`, so nothing in this folder reaches the site.

| Folder | Why it is held | Source |
|---|---|---|
| `norse-catering/` | Norfolk primary-school lunch menu (72 items, full nutrition, one held back). Script: `tools/uk_extract/norse_catering.py`, `norse_catering_pdf.py` (they read `data/source/norse-catering`: move the folder back to restore) | Norse Group "Nutrition Analysis for Primary Menu Spring/Summer 2026" PDF, created 26 March 2026 |
| `thaikhun/` | The Ten Kites page (undated, not linked from the chain's own pages) and the chain's own allergen & calorie page (igfd.menu, matches the Aug 2026 menu) print different calories for 53 of 64 same-name dishes; only 6 of 138 dishes agree. Scripts: `tools/uk_extract/thaikhun.py`, `thaikhun_current_page.py` (`--ten-kites-only` would publish all 131, not recommended). Reviewed flags: `data/audit/reviewed/thaikhun.csv` | https://menus.tenkites.com/tlg/thaikhun and the chain's igfd.menu page, saved 2026-10-08 |

To publish one anyway: move its folder back into `data/source/`, then `python3 tools/uk_extract/check_chain.py <id> --fail-on-high`.
