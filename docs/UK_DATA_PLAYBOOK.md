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
5. **Plain text only** in the nutrition extraction. No logos, brand colours, mascots, food photos (item photos are a separate
   Phase 4 job below); names as the chain prints them (tidy
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

---

# Scaling up: triage, extraction and logos (the overnight run)

## Shared tools

- `tools/uk_extract/common.py`: `write_chain_folder(...)` writes a whole `data/source/<id>/` from a list of item dicts (numbers
  exactly as printed), `slug()`, `sha256_file()`. Look at `tools/uk_extract/kfc.py` for the pattern; use these instead of
  re-implementing CSV writing.
- `python3 tools/uk_extract/check_chain.py <chain-id>`: builds just that chain in isolation and prints errors and
  warnings. Use this, never a full-repo build, while other agents are writing their chains.
- `holdback.csv` (`item_id,reason`) and `note.txt` sit beside `items.csv`; see `docs/DATA.md`. A chain with a few rows the
  guide prints impossibly gets those rows held back (never corrected). A chain whose numbers have a known limit gets a
  one-or-two-sentence `note.txt` (e.g. "values exclude sauces").

## Phase 1: triage (`data/candidates/uk-candidates.csv`, results in `data/candidates/triage/<batch>.csv`)

For each chain in your batch decide, with the least work that is still certain:

| verdict | meaning |
|---|---|
| `GO` | An official, reachable, per-serving table with calories **and protein, carbs and fat**, which a script can read (PDF with a text layer, HTML table, or the JSON the site loads). You opened the real file/page and saw those columns. |
| `GO-OCR` | As GO but the file is image-only (needs OCR: slow and error-prone; extra checking). |
| `NO-MACROS` | Official calories (or calories and a few nutrients) only: protein, carbs or fat missing. Not usable. |
| `NO-DATA` | No official nutrition information found. |
| `BLOCKED` | An official source exists but this environment can't read it (403, location block, login, JavaScript-only with no data feed). Say exactly which URL the founder should download. |
| `CLOSED` | Not a UK chain any more / no UK presence / not found. |

Rules: official sources only (the chain's own site, PDF or data feed); at most ~12 requests per chain, 1 request/second, a
normal browser user-agent; never evade a block; per-100g-only guides are `NO-MACROS` (we never convert). Note when one
file covers several brands (put `parent group publishes one guide: also covers X, Y` in `notes`). Write one CSV row per
chain: `id,verdict,format,source_url,serving_basis,date_or_version,notes` (quote cells that contain commas). The URL must
be the page or file that proves the verdict. Work in your own scratch folder; touch nothing else in the repo.

## Phase 2: extraction (chains triaged `GO` / `GO-OCR`)

Everything above applies (copy don't type; script in `tools/uk_extract/<chain-id>.py`; `check_chain.py` shows 0 errors;
every warning explained; independent spot check of at least 15 items or all rows for a small chain; hold back impossible
rows; `note.txt` for known limits). **Budget:** be economical. Aim for roughly 60-100 tool calls per chain; if a chain
turns out to need far more (OCR, a site that fights you), stop and report what blocks it instead of grinding. Never
commit or push. Final report under 250 words: items published/held back, source URL + file date + SHA-256, exclusions,
"meat type not stated" count, anything unverified.

## Phase 3: logos (`web/public/logos/`)

The founder authorised sourcing official logos (CLAUDE.md rule 2). For each chain you are given:

1. Find the chain's **own** brand/press/media page (or the press kit its site links). Not Wikipedia, search engines'
   image results, logo aggregators or any third party.
2. Read its terms/usage guidelines. **Install the logo only if** the page offers the file for download without a login or
   request form **and** the terms don't forbid this use (identifying the restaurant by name, unmodified, small, with
   "Not affiliated with" shown). If the terms require permission, are "press/media only", or forbid third-party apps,
   do **not** install: record `skipped-terms` instead. Never work around a form, login, or block.
3. Prefer SVG, else PNG. Use the file as published: no recolouring, cropping, outlining or redrawing. A PNG wider than
   600 px may be scaled down proportionally (nothing else). Look at the result (PNGs with the Read tool; SVGs by
   rendering in Chromium): it must be the chain's actual mark, legible on a white tile, not a white-only version.
   Reject any SVG containing `<script`, `javascript:`, `onload=`, `<foreignObject`, or external `href`s.
4. Save to `web/public/logos/<chain-id>.svg|png` (keep it under ~80 KB) and write the sidecar
   `web/public/logos/<chain-id>.source.txt` (one `key: value` per line: `status` = installed | skipped-terms |
   skipped-unavailable, `file`, `source_url`, `terms_url`, `terms_summary` (one sentence), `retrieved` (date)).
   Do **not** edit `logos.ts`, `SOURCES.md` or any other file: the orchestrator assembles them from the sidecars.

## Phase 4: item photos (`web/public/menu-images/`, `data/source/<chain>/images.csv`)

Founder-approved 2026-10-06 (CLAUDE.md rule 2): the chain's own photo of an item, from the chain's own pages/feeds only.
Done after the chain's nutrition data is banked. Use `tools/uk_extract/images_common.py` (see its docstring) and write
`tools/uk_extract/images_<chain>.py` (re-runnable, `--cache <dir>`).

0. **Terms first.** Before downloading any photo, read the chain's website terms page and robots.txt and quote what they say
   about images/content in your report. Founder's decision 2026-10-06 ("make sure to add them"): photos are installed even
   where the terms restrict reuse (the founder's accepted risk). robots.txt and blocks still stop you: never work round them.
1. **Source:** the chain's own website: its menu/product pages or the JSON feed those pages load (often the same feed as the
   nutrition data). Never Google Images, delivery apps, aggregators, social media, stock sites, Wikipedia. If robots.txt
   disallows it, or the site answers 403/429, stop and report: never work round it.
2. **Match exactly:** attach a photo to an item only when the chain's own page/feed entry for that photo has the same name
   (use `norm_name`) as the published item, or when the same product record carries both the photo and the item's size/variant.
   No fuzzy matching, no "closest dish", no category banners. Ambiguous or duplicate names: no photo. Wrong photo is worse than
   none. `source_url` = the page that shows the photo for that item.
3. **Placeholders:** sites often serve a generic "coming soon"/logo image. Run `suspected_placeholders()` and look at every
   file used by 4+ items and at a random 15 others (Read the PNG/WebP files); drop anything that is not a real photo of that item.
4. **Never** crop, recolour, add text, upscale, retouch or generate. `store_image` only downsizes to 640 px and converts to
   WebP; it rejects icons (<200 px) and animations.
5. **Politeness:** 1 request/second per host, normal browser User-Agent, one fetch per photo (cache), no crawling beyond the
   menu pages. Budget: about 40-80 tool calls; the downloads happen inside your script.
6. Deliver: the script, `images.csv`, the stored files, `python3 tools/uk_extract/check_chain.py <chain>` showing 0 errors, and a
   report (under 150 words): items with a photo / published items, source pages, anything skipped and why, any terms or
   robots notice you saw on the site (quote it). Photos are about 20-60 KB each, so skip a chain rather than store hundreds of
   photos that don't match. Do not commit; touch only your chain's files.
