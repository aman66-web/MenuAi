# Plan: "Smaller shops stock fewer products" for the supermarkets in Numbite

**Status: a plan with proposed wording, for the founder to approve (CLAUDE.md rule 8). Nothing is built.**
Founder's idea (16 Nov 2026): for each supermarket, tell the person that a product may not be in a smaller shop (a Sainsbury's Local) the way it is in a big one, and keep them inside the app.

## What this is, and is not
- It is **not** live stock. No UK supermarket lets an outside app read its shelves (docs/STOCK_CHECK_FEASIBILITY.md, on branch `stock-check-research` once pushed), and Sainsbury's checker is protected against programs, so we do not try.
- It **is** honest guidance from something the shops themselves say: ranges differ by store (Sainsbury's help: each store has its own range; its checker has the status "Not Available: we don't stock this product in the store you selected"). We never say a named product is missing from a smaller shop, because no shop publishes that.
- The person's choice stays **on the phone** (CLAUDE.md rule 4). Nothing is sent anywhere.

## Which shops get the choice (version 1)
Shop names for each size are the shop's own; **to confirm on each shop's own store finder before building** (read-only, in the founder's Chrome).

| Shop | Larger | Smaller |
|---|---|---|
| Tesco | Extra, Superstore | Metro, Express |
| Sainsbury's | Superstore, Supermarket | Local |
| Asda | Supercentre, Superstore, Supermarket | Express |
| Morrisons | Morrisons | Morrisons Daily |
| Waitrose | Waitrose | Little Waitrose |
| M&S | Foodhall | Simply Food |

No choice: **Aldi** and **Lidl** (one kind of store; their ranges change by week, not by size), **Ocado** (no shops), **Co-op** and **Iceland** (no clear size difference to state; left out until confirmed). Shops can be added later by adding one row of data.

## What the person sees (proposed wording, English only)
1. **Choice** (on a shop's list screen, the shop picker and Settings › Your supermarkets): "Which kind of {shop} do you use?" with "A larger store" and "A smaller shop ({names})". Remembered per shop. Default: not chosen (nothing extra is shown until they choose).
2. **Caution** under a product's name or on its page, only when they chose a smaller shop: "Smaller {shop} shops stock fewer products, so this one may not be there."
3. **Recipes:** next to each ingredient that is one of our "everyday" kinds (the 84 kinds most small shops sell, `EVERYDAY_KINDS` in `lib/mm/pantry.ts`): "Usually in small shops". This is our judgement, not a shop's published list, so the recipe page also says: "We can't see what's on any shop's shelves, so check in store."
4. **Shopping list:** a "Couldn't find it?" button on each item. It shows the substitutes we already hold for recipe ingredients ("Try one of these instead") and, for an item with none, "We don't have a swap for this one." No stock claims.
5. **One footer sentence** wherever the caution shows: "Ranges differ from shop to shop. Check in store."

## Rules kept
- No claim that any named product is, or isn't, in a smaller shop; no word like good, bad or healthy; no live-stock look; nothing about where the person is leaves the phone.
- All new sentences are listed here for approval and logged in `docs/PROGRESS.md` when built.

## Build (about 2 days, on a branch; nothing goes live until the founder has seen it)
1. A small table of shops and sizes (`web/lib/mm/shopSizes.ts`) and a stored choice per shop (like the existing shop settings).
2. The choice control, the caution, the recipe label and "Couldn't find it?", with tests and the browser checks the project already uses (the heavy runs go to a cloud session).
3. Confirm each shop's size names in the founder's Chrome first.

## Later (not in version 1)
- Suggest the nearest store and its size from the phone's own location, using free OpenStreetMap data (location stays on the phone). The map files hold restaurants only today, so supermarket branches would have to be fetched first: about 3 to 5 more days.
- If Sainsbury's agrees to a feed (docs/SAINSBURYS_STOCK_FEED_EMAIL_DRAFT.md), real stock can replace the general caution for that shop.
