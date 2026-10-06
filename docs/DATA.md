# MenuMacros data contract

This is the single source of truth for menu data: how the founder enters it, how
`tools/build_menus.py` checks and transforms it, and the JSON the iOS app reads.
The JSON Schemas in `data/schema/` are the machine-readable version of this page.

## Golden rules

1. **Published numbers only.** Every value comes from the chain's own nutrition
   guide or calculator. Never estimate, average, or fill a gap.
2. **Missing means missing.** An optional nutrient that isn't published is left
   blank in the CSV, omitted from the JSON, and shown as "not published" in the app.
   When parts are added together, an optional nutrient appears in the total only if
   *every* part publishes it.
3. **Every chain shows its source** (title, URL, date checked).
4. **Sample chains are fictional** (`sample: true`). Keep their folders (tests, fixtures and
   previews use them); release builds leave them out with `--no-samples`, and the app also hides
   any `sample` chain in Release builds.

## Flow

```
data/source/<chain-id>/*.csv → tools/build_menus.py → <out>/*.json ─┬→ web/public/menus → Vercel (remote updates)
                                        │                           └→ MenuMacros/Resources/Menus/ (bundled set)
                                        └→ <out>/check-report.md (errors stop the build; warnings need a human look)
```

Commands:

```bash
# Development (samples included, bundled into the app):
python3 tools/build_menus.py --bundle-into MenuMacros/Resources/Menus

# Release: ONE build feeds both the app bundle and the website, so they share dataVersion and SHA-256s.
./scripts/publish_menus.sh               # = build --no-samples into dist/release, copy to web/public/menus
                                         #   and MenuMacros/Resources/Menus; then git push → Vercel deploys
./scripts/publish_menus.sh --web-only    # update the live menus without touching the app bundle

python3 tools/build_menus.py --only chipotle --out dist/release   # rebuild one chain into an existing output
python3 -m unittest discover -s tools/tests                         # pipeline tests
```

## Source files (one folder per chain)

Folder name = chain id (lowercase, hyphens: `chick-fil-a`). Copy `data/source/_template/`.

- **Save as "CSV UTF-8"** (Excel/Numbers/Google Sheets all offer it). The header row must match the
  template exactly (any order); every row needs the same number of cells. A value containing a
  comma must be in double quotes: `"Chicken, bacon & ranch melt"` (spreadsheet apps do this for you).
- Blank cells are fine for optional columns. Lists inside a cell are separated by `|`.
- Booleans: `true` / `false`. Dates: `YYYY-MM-DD` (real dates). Units: kcal, grams, sodium in mg.
- **"Less than" values:** guides often print `<1 g` or `<5 mg`. Type them as printed (`<1`); the
  pipeline stores 0 (food labels may round amounts this small to 0, so this is not an estimate).
- Ids may not start with `var-` or `combo-` (reserved for generated orders).

### chain.csv (exactly one row)

| Column | Required | Notes |
|---|---|---|
| id | yes | Must equal the folder name |
| name | yes | Display name, plain text (no logos anywhere) |
| cuisine | yes | e.g. Mexican, Burgers, Chicken, Coffee |
| builder_type | yes | `build_your_own` (bowls, burritos, subs built from parts) or `standard` |
| source_title, source_url | yes | The chain's nutrition guide; URL must be https |
| checked_on | yes | Date you last checked the whole menu against the source |
| aliases | no | Lower-case names Apple Maps may use: `chick fil a\|chick-fil-a\|chickfila` |
| sample | no | `true` only for fictional test data |

### components.csv (build-your-own chains)

| Column | Required | Notes |
|---|---|---|
| id, name | yes | |
| group | yes | `base` (rice, lettuce), `wrap` (tortilla, bun, shell), `protein`, `topping`, `sauce`, `side`, `drink`, `extra` |
| portion | no | As published: "4 oz", "1 tortilla" |
| calories, protein_g, carbs_g, fat_g | yes | |
| sat_fat_g, sodium_mg, salt_g, sugar_g, fiber_g | no | `salt_g` is for UK guides, which publish salt in grams (stored to 2 decimals, e.g. 0.16). Enter what the guide prints: sodium if it prints sodium, salt if it prints salt. **Never convert one into the other.** The `salt_g` column may be left out of older files |
| tags | no | `vegetarian`, `contains_pork`, `contains_beef` |
| removable | no (false) | true for things people commonly drop: cheese, sour cream, sauces, dressing |
| allow_double | no (false) | true only if the chain sells and publishes a double portion (usually proteins) |

### items.csv

| Column | Required | Notes |
|---|---|---|
| id, name, category | yes | Category order in the file = display order in the app |
| serving | no | "1 bowl", "8 pieces", "20 fl oz" |
| nutrient columns | yes for standard items | For items with `components`, leave blank: totals are computed from the parts. If typed anyway, a >5% difference is a warning |
| tags | no | For component items, tags are derived from the parts (vegetarian only if every part is) |
| limited_time | no (false) | Shows a "Limited time" label |
| rankable | no (true) | false = never suggested by "Best for you" (drinks, sauces, desserts) |
| components | no | Default recipe: `chicken\|white-rice\|black-beans`; a double portion is `chicken:2` (never list a component twice) |
| added_on | no | Date added; the app shows "New" for 30 days |
| notes | no | For you only; not exported |

### modifiers.csv (standard chains, only where the chain publishes the values)

`item_id, id, label, kind, <nutrient columns>, tags` — `kind` is `remove` ("No mayo") or `add`
("Extra fillet", "Add bacon"). Enter the ingredient's own published nutrition as positive numbers;
`kind` decides whether it is subtracted or added. A remove that would exceed the item's own value
is an error (one of the two rows is wrong). `tags` applies to `add` modifiers only (bacon →
`contains_pork`; the result is no longer vegetarian). Items built from components can't have modifiers.

### note.txt (optional)

One or two plain sentences (under 400 characters) about a limit of the chain's published data that users should know,
shown under the source on the chain page, e.g. "Sub values cover the bread, filling and basic salad only, not
sauces." It is its own file because extraction scripts rewrite `chain.csv` on every refresh.

### holdback.csv (optional)

`item_id, reason` — items listed here are **not published**: use it when the chain's own guide prints impossible
numbers (e.g. 367 g of carbohydrate in a burger, 43 kcal with 18 g of fat). Nothing is corrected or guessed; the item is
left out of the menu and shown in the check report under "Held back" until the chain fixes its guide. It lives beside
the extraction script's output, so a monthly re-extraction never brings the item back by accident. A line whose item no
longer exists gives a warning.

### images.csv (optional)

`item_id,file,source_url,retrieved_on`: the chain's **own photo** of an item (founder's decision 2026-10-06, CLAUDE.md
rule 2). `file` is a `<12 hex>.webp` under `web/public/menu-images/<chain-id>/`, written by
`tools/uk_extract/images_common.py` (resize to 640 px and WebP only: no crop, recolour or retouch). `source_url` is the
chain page that shows that photo for that item; a photo is attached only when the chain's own page names the item exactly.
Several items may share one file (sizes of one product). The build exports `image: "<chain-id>/<file>"` on the item
(errors: missing file, not `.webp`, over 150,000 bytes, non-https source; warning: item no longer in items.csv). Rows for
held-back items are ignored. Never from third-party sites, stock libraries, or generated/edited images.

### combos.csv (optional, hand-made meals of whole items)

`id, name, item_ids` — e.g. `nuggets-fruit, Nuggets (12 ct) + fruit cup, nuggets-12|fruit-cup`.
Use it for popular meals people order together.

## Checks

**Errors (build stops, nothing is written):** file not UTF-8; header row not matching the template;
a row with too many/few cells (usually an unquoted comma); missing required fields; non-numeric,
infinite or negative values; impossible dates; non-https source URL; duplicate ids (items,
components, modifiers per item, combos); reserved or badly formed ids; unknown component/item ids;
unknown tags or groups; quantity other than 1 or 2; a component listed twice in a recipe; doubling
a component without `allow_double`; a remove modifier larger than its item; modifiers on component
items; `build_your_own` chain without components; chain id not matching its folder; `--only` naming
a chain that doesn't exist.

**Warnings (build continues; check against the source):**
- *Energy check*: calories differ from 4 × protein + 4 × carbs + 9 × fat by more than 15%
  (items under 50 kcal: flagged if 4P + 4C + 9F is more than 25 above the calories). Fibre, sugar
  alcohols and rounding cause small gaps; big gaps are usually typos (e.g. values in the wrong column).
- Typed item totals that differ >5% from the sum of their components.
- More candidates generated than the cap (400 per chain).

## Candidate generation ("Best for you")

The phone only filters and scores; the pipeline pre-builds the candidates so the logic is
testable and the data reviewable. Candidates = every rankable item (as-is, read from
`items`) plus `combinations`:

- **Build-your-own items** — every combination of: protein as-is or doubled (if
  `allow_double`); removable parts as-is, each removed alone, or all removed; base as-is or
  swapped for each other `base` component of the chain. Duplicates (same set of parts and
  quantities) are dropped. Name: `Chicken bowl · double chicken · no cheese, no sour cream · romaine lettuce instead of white rice`
  (doubles, then removals joined with ", ", then swaps — the app's builder names orders the same way).
- **Standard items with modifiers** — each `remove` alone, all removes together, each `add` alone.
  Name: `Spicy deluxe sandwich · no mayo · no cheese` (labels with the first letter lower-cased
  unless the second letter is upper-case: "No BBQ sauce" → "no BBQ sauce").
- **Combos** from `combos.csv`.
- **Cap**: if a chain exceeds 400, keep the 200 with the most protein per 100 kcal and fill the
  rest with the lowest-calorie ones (so both muscle-building and GLP-1 users keep options).
- Tags: union of `contains_*`; `vegetarian` only if every part is vegetarian. Remove-modifier
  variations keep the item's tags (conservative); add-modifier variations combine the modifier's tags.
- Candidate ids (`var-<item>-<hash>`, `combo-<id>`) are unique per chain and never equal an item id,
  so a pick can be looked up unambiguously.

## Output JSON

Flat files (so Xcode can bundle them without folder references): `menus-manifest.json` and
`chain-<id>.json`. Formal definitions: `data/schema/manifest.schema.json`, `data/schema/chain.schema.json`.
Example (trimmed) from the fictional sample:

```json
{
  "schemaVersion": 1,
  "id": "bowl-and-co",
  "name": "Bowl & Co.",
  "cuisine": "Mexican",
  "builderType": "build_your_own",
  "aliases": ["bowl and co", "bowl co", "bowl & co"],
  "sample": true,
  "source": { "title": "Bowl & Co. Nutrition Guide (FICTIONAL SAMPLE)", "url": "https://example.com/bowl-and-co/nutrition", "checkedOn": "2026-10-01" },
  "categories": ["Bowls", "Burritos", "Salads", "Sides", "Drinks"],
  "components": [
    { "id": "chicken", "group": "protein", "name": "Chicken", "portion": "4 oz",
      "nutrients": { "calories": 180, "protein": 32, "carbs": 0, "fat": 7, "saturatedFat": 3, "sodium": 310, "sugar": 0, "fiber": 0 },
      "tags": [], "removable": false, "allowDouble": true }
  ],
  "items": [
    { "id": "chicken-bowl", "name": "Chicken bowl", "category": "Bowls", "serving": "1 bowl",
      "nutrients": { "calories": 655, "protein": 50, "carbs": 67, "fat": 20.5, "saturatedFat": 9, "sodium": 1610, "sugar": 3, "fiber": 9 },
      "tags": [], "limitedTime": false, "rankable": true, "addedOn": "2026-10-01",
      "components": [ { "id": "chicken", "qty": 1 }, { "id": "white-rice", "qty": 1 }, { "id": "black-beans", "qty": 1 },
                      { "id": "tomato-salsa", "qty": 1 }, { "id": "cheese", "qty": 1 } ],
      "modifiers": [] }
  ],
  "combinations": [
    { "id": "var-chicken-bowl-310d0919", "name": "Chicken bowl · double chicken", "kind": "variation",
      "baseItemId": "chicken-bowl",
      "components": [ { "id": "white-rice", "qty": 1 }, { "id": "chicken", "qty": 2 }, { "id": "black-beans", "qty": 1 },
                      { "id": "cheese", "qty": 1 }, { "id": "tomato-salsa", "qty": 1 } ],
      "items": [], "nutrients": { "calories": 835, "protein": 82, "carbs": 67, "fat": 27.5, "saturatedFat": 12, "sodium": 1920, "sugar": 3, "fiber": 9 },
      "tags": [], "itemCount": 1 }
  ]
}
```

Manifest:

```json
{ "schemaVersion": 1, "dataVersion": 20261201100000, "generatedAt": "2026-12-01T10:00:00Z",
  "chains": [ { "id": "bowl-and-co", "name": "Bowl & Co.", "file": "chain-bowl-and-co.json",
                "sha256": "<64 hex>", "contentHash": "<64 hex>", "sample": true, "itemCount": 7, "checkedOn": "2026-10-01" } ] }
```

Versioning: `dataVersion` is the UTC build time as `YYYYMMDDHHMMSS`, so it only ever increases,
on any machine, with no state to keep. `sha256` is of the exact file bytes (the app verifies
downloads and uses it to skip unchanged chains). `contentHash` lets tools detect stale copies.
Chain files contain no timestamps, so an unchanged chain produces an identical file.

## How the app uses the data

The app always reads ONE complete set (a manifest + all its chain files) from
`Application Support/Menus/` (the "active set"). The bundle holds the set the app shipped with
(`Bundle.main.url(forResource: "menus-manifest", withExtension: "json")`, then `"chain-\(id)"`).

1. **At launch, before loading:** if there is no active set, or its manifest can't be decoded, or its
   `schemaVersion` isn't supported, or the bundle's `dataVersion` is **greater** than the active
   set's (an app update shipped newer data) → replace the active set with a copy of the bundled set.
2. **Load** the active set into `MenuStore`. In Release builds drop chains with `sample == true`.
3. **Update** (at most once every 6 hours, and only if `menuBaseURL` isn't the placeholder):
   fetch `<menuBaseURL>/menus-manifest.json` (with `.reloadIgnoringLocalCacheData`). Stop quietly if the
   request fails or isn't HTTP 200 (e.g. 404 before the first publish), if its `schemaVersion` isn't supported, or if its
   `dataVersion` ≤ the active set's. Otherwise build the new set in a temporary folder: for each
   chain, copy the active file if its `sha256` matches, else download `<menuBaseURL>/<file>` and
   verify SHA-256. If every file succeeds, write the new manifest and swap the folder in atomically,
   then reload `MenuStore`. Any failure → discard the temporary folder and keep the active set.
   Chains missing from the new manifest disappear with the swap.
- **Never** mix local edits into menu files; user data (saved orders, logs) references
  `chainId` + item/component ids and must survive data updates. If a referenced id disappears,
  show "No longer on the menu".
- `menuBaseURL` lives in `AppConfig.swift`; while it is the placeholder `https://example.com/menus/`,
  the app skips remote updates.

## Routine (for the founder)

- Weekly: check the top 20 chains for new and limited-time items.
- Monthly: re-check every chain against its source; update `checked_on`.
- Within 48 hours of a "Report a number": verify, fix the CSV, rebuild, upload, and reply.
