# Prompt: add supermarket prices with Claude Code + Chrome (run this in the Mac terminal)

Tesco, Sainsbury's, Asda, Waitrose and Aldi refuse automated visits from our scripts (403), but not a normal browser. Claude Code can drive
your own Chrome, which is how prices get collected. Prices are the one thing the open product database (Open Food Facts) doesn't have.

## One-time setup

1. Install the **Claude in Chrome** extension in Chrome (Chrome Web Store, or claude.ai/chrome) and sign in with your Claude account.
2. In a Terminal: `cd ~/MenuAi && git pull && claude --chrome`   (inside Claude Code, `/chrome` shows whether Chrome is connected).
3. Say: **"read docs/NEXT_GROCERIES_PROMPT.md and do it"**.

---

You are adding supermarket PRICES to Menu Math (repo `~/MenuAi`, branch `claude/menumacros-kit`). Read `CLAUDE.md`, `docs/GROCERIES_PLAN.md` and
`tools/groceries/build_groceries.py` (its docstring says exactly what a price file is). Work through Chrome, in the founder's own browser.

## What to do

1. `python3 tools/groceries/make_wanted.py --top 300` writes `data/groceries/wanted/<retailer>.csv` (`gtin,name,brand,size`): the most-scanned
   products per supermarket that still have no price. Do one supermarket at a time: Aldi, Tesco, Sainsbury's, Asda, Waitrose (Lidl's site has no
   everyday range online: skip it unless its pages show prices).
2. For each wanted product, open the supermarket's own website in Chrome, search for the product (by barcode if the site supports it, otherwise by
   its name and brand), and open the matching product page. **Match exactly**: same brand, same product name and the same pack size as the wanted row.
   If the page shows a different size, a different flavour, or you are unsure, skip it: a wrong price is worse than none.
3. Record the **regular price in pounds** (the price before any card) and the unit price the page shows ("£0.25 per 100g" → `unit_price_gbp=0.25`, `unit=per 100g`).
   **Loyalty-card prices (founder's decision 2026-10-07):** when the page also shows a lower price with the shop's card (Tesco Clubcard Price, Sainsbury's
   Nectar Price, Co-op member price, Morrisons More Card, Asda Rewards, Iceland Bonus Card, M&S Sparks, myWaitrose, Lidl Plus), record BOTH: the regular
   price in `price_gbp`, the card price in `member_price_gbp`, the card's name as the page prints it in `member_scheme` ("Clubcard Price") and, if the
   page says when it ends, that text in `member_offer_ends` ("until 13 Oct"). The card price must be lower than the regular price; never put it in
   `price_gbp`. Still leave out multi-buy deals ("2 for £3"), "was £x" prices, delivery fees and prices for another pack size.
   If the site asks you to pick a store or enter a postcode, use the online/delivery price for the founder's area (or the default shown) and say which.
4. Append one row per product to `data/groceries/prices/<retailer>.csv` with the header
   `gtin,price_gbp,unit_price_gbp,unit,page_url,checked_on,member_price_gbp,member_scheme,member_offer_ends` (create the file with the header first; leave the last three blank when there is no card price): `gtin` exactly as in the wanted file,
   `page_url` = the product page's https address, `checked_on` = today (YYYY-MM-DD). Write rows in batches of about 25 as you go so nothing is lost.
5. If the site shows a "verify you are human" check, stop and ask the founder to do it; never try to get round it. If a site refuses to load even in
   Chrome, say so and move on to the next supermarket.
6. After each supermarket: `python3 tools/groceries/build_groceries.py` (it validates every row and lists bad ones in `data/groceries/REPORT.md`),
   open `/app/groceries` locally (`cd web && npm run dev`, or the preview) and look at a few products to confirm the price, size and link are right.
7. Commit (`git add data/groceries web/public/groceries && git commit`) and push to `claude/menumacros-kit` after each supermarket. Do not open a pull request.

## Rules

- Prices only from the supermarket's own website, never from comparison sites, delivery apps or aggregators.
- Never estimate, round, average or copy a price from another size or another supermarket.
- Be polite: normal browsing pace, no more than one page at a time, nothing run in parallel.
- Don't change anything outside `data/groceries/prices/`, `data/groceries/wanted/` and the generated `web/public/groceries/`.
- Report at the end (under 150 words): products priced per supermarket, how many you skipped and why, anything the sites blocked.
