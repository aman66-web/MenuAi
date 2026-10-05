# Adding a UK chain: the data playbook

How a chain gets from "its official nutrition guide" to `data/source/<chain-id>/` without a single
invented number. Read `docs/DATA.md` first (file formats, checks). The worked example is KFC:
`tools/uk_extract/kfc.py` + `kfc_pdf.py` → `data/source/kfc/`.

## Rules (these come from CLAUDE.md and cannot be relaxed)

1. **Official sources only.** The chain's own nutrition guide: its PDF, its website's nutrition page, or the
   data feed that page itself loads. **Not** calorie-counting sites, aggregators, Wikipedia, forums, or
   archived copies of old guides. If the official source can't be read from here (403, challenge page,
   login), do **not** try to get round it: stop and report the exact URL so the founder can download the file.
2. **Copy, never type.** Numbers are extracted by a script from the source file and written to CSV exactly as
   printed. Only names, categories and grouping are written by hand. Keep the script in
   `tools/uk_extract/<chain-id>.py` so the next monthly guide can be re-run; it must stop with a clear message if
   the number of rows no longer matches (see `kfc.py`).
3. **Never estimate, convert or fill a gap.** Salt is `salt_g`, sodium is `sodium_mg`: enter whichever the guide
   prints, never convert one into the other. Fibre/sugar/saturates not printed → leave the cell blank. Per-100g
   values are **not** per-serving values: if a guide only gives per 100g, report it and stop.
4. **Great Britain menu only.** Leave out rows marked as Ireland / Northern Ireland only, regional trials, "selected
   restaurants" only, and rows without a stated serving (e.g. "per 250 ml" when the bottle size isn't given).
   Write each exclusion down in your report.
5. **Plain text only.** No logos, brand colours, mascots, food photos; names as the chain prints them (tidy
   capitalisation and "(regular)/(large)" suffixes are fine).
6. Don't change anything outside your chain's own `data/source/<chain-id>/` and
   `tools/uk_extract/<chain-id>*.py`. No commits, no pushes, no edits to the pipeline, docs, web code or other chains.

## Files

`chain.csv`: `id` = folder name (lowercase-hyphen). `source_title` names the guide **and its own date or
version** ("KFC UK & Ireland Allergen & Nutrition Information (September 2026)"); `source_url` is https and points at
the file/page you used; `checked_on` = the day you extracted it; `aliases` = lower-case names a map app might use;
`cuisine` e.g. Chicken, Burgers, Pizza, Bakery, Coffee, Sandwiches.
`items.csv`: one row per sellable item with printed per-serving numbers. `serving` only when the guide states it
("1 slice", "Regular", "per piece, average"), otherwise blank.
Use `components.csv` + `builder_type = build_your_own` **only** when the chain publishes values per ingredient
(bread, fillings, sauces…) and you can express the default recipes; otherwise `standard` items. Modifiers only where
the chain publishes the add/remove values itself. Skip combos.

Conventions (match `data/source/kfc/items.csv`):
- `rankable=false` for drinks, sauces, desserts/treats, add-ons, condiments, and per-piece items (a single wing or
  nugget isn't an order); `true` for burgers, sandwiches, wraps, bowls, pizzas (by the published serving), meals and
  sides. `limited_time=true` for items the guide labels limited time/seasonal.
- Tags: `vegetarian` only if the chain's own guide marks the item vegetarian or vegan. `contains_pork` /
  `contains_beef` only when the guide's item name or ingredients say so (bacon, ham, pepperoni, sausage, pork,
  salami, chorizo → pork; beef patty, steak, beef → beef). Meat type not stated → no tag, and list those items in
  your report as "meat type not stated".
- Put anything odd in `notes` (it is not exported) and in your report: values that look like typos, kJ/kcal
  disagreeing, identical numbers in different columns, "0.5" printed where "<0.5" is meant, etc. Enter what is
  printed; do not correct it.

## Check before you hand over

1. Develop in a scratch source tree so half-built chains don't break each other's builds:
   `<scratchpad>/<chain-id>/src/<chain-id>/` and run
   `python3 tools/build_menus.py --source <scratchpad>/<chain-id>/src --out <scratchpad>/<chain-id>/out`.
   **0 errors**, and every warning explained by the source (a warning is a possible typo: re-read the source).
2. Independent spot check: re-read at least 15 items (spread across categories, including the largest and smallest)
   straight from the source file (not from your script's output) and compare every number.
3. Copy the final folder to `data/source/<chain-id>/` and re-run the build once with `--source data/source`
   restricted by copying only your chain to a temp tree if other chains are mid-write.
4. Report (under 400 words): files written; item count by category; source URL, the file's date, its SHA-256;
   exclusions and why; anomalies; "meat type not stated" items; anything you could not verify; what a monthly
   refresh needs.

## Politeness

One download of each guide, not a crawl. At most one request per second, a normal browser user-agent, no proxies
or tricks. If a page needs a browser to render, use the Playwright install in the scratchpad
(`<scratchpad>/pw/node_modules/playwright-core`, Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
