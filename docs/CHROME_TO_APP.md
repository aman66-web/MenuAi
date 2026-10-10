# Claude in Chrome reads a chain's own pages, the app gets the numbers

This is the "Chrome finds the information, then it is written into the app" route. It is for chains whose own site shows
calories or nutrition to a person in a browser but refuses our cloud scripts (Cloudflare, JavaScript-only order apps, location
checks). It works with the same accuracy rules as every other chain.

## The flow

1. **Chrome (your Mac):** Claude in Chrome opens the chain's own site, reads the nutrition per dish and writes two files into
   `~/MenuAi/data/chrome-inbox/<chain-id>/` (`meta.json` and `items.csv`, formats below). You solve any "verify you are human"
   page yourself; the agent stops and tells you.
2. **You push:** `cd ~/MenuAi && git add data/chrome-inbox && git commit -m "Chrome read: <chain>" && git push`
3. **The cloud session (me) does the rest, automatically:**
   - `python3 tools/uk_extract/chrome_import.py <chain-id>` re-checks every row (own-site page address, per serving only,
     no contradictions, duplicates, allergen words) and writes the normal `data/source/<chain-id>/` folder;
   - `python3 tools/uk_extract/check_chain.py <chain-id> --fail-on-high` is the accuracy gate;
   - an independent helper re-reads a sample of rows against the live page;
   - the chain is committed and the site is republished.

You only do steps 1 and 2. Tell me "inbox: <chain-id>" and I take it from there.

## What Chrome must never do

- Use any site except the chain's own (never Google, delivery apps, calorie-counter apps or aggregators).
- Guess, convert, round or fill in a number. Copy exactly what the page shows, per serving. Per-100 g figures are not accepted.
- Run scripts on the page or send data anywhere (say no if it is asked to). Reading and typing into two files is all it needs.
- Work round a "verify you are human" page, a login or a block: stop and tell you.
- Read a page the chain's `robots.txt` asks automated tools to leave alone (the agent checks `/robots.txt` first and stops if the
  page is disallowed).

## Prompt for Claude in Chrome (paste into the side panel; fill the three bracketed parts)

```
I run a nutrition app for UK restaurant chains. I need the OFFICIAL per-dish nutrition from {CHAIN NAME}'s own website only
({HOME PAGE}). Never use Google, delivery apps (Deliveroo, Just Eat, Uber Eats), calorie-counter apps or any other site.

0. First open {HOME PAGE}/robots.txt. If it forbids the pages you are about to read, stop and tell me.
1. Find the page(s) that show nutrition for every dish: a "nutrition" or "allergens and calories" page, or the menu on the chain's
   own ordering site. If a "verify you are human" check or login appears, stop and tell me; I will do it.
2. Work category by category. Open each dish (or the nutrition table/panel) so its numbers are visible. Read the numbers exactly
   as printed, PER SERVING as sold. If a page shows per-100 g only, or you cannot tell the basis, stop and tell me: do not guess.
3. Create two files in ~/MenuAi/data/chrome-inbox/{CHAIN-ID}/ :

   meta.json  (JSON):
   {"name": "...", "cuisine": "...", "source_title": "what the page is called, with its date or '(read YYYY-MM-DD, no date shown)'",
    "source_url": "the nutrition page address", "checked_on": "YYYY-MM-DD", "nutrition_level": "full or calories",
    "basis": "per serving", "sites": <number of UK sites>, "sites_evidence": "the page that lists the sites",
    "allowed_hosts": ["the chain's own ordering site host, if different"], "note": "any limit (menus differ by site, etc.)"}
   Use "full" only if protein, carbs and fat are printed for EVERY dish; otherwise "calories".

   items.csv  with exactly this header and one line per dish/size (quote names that contain commas):
   name,category,calories,protein_g,carbs_g,fat_g,sat_fat_g,sugar_g,fiber_g,salt_g,energy_kj,weight_g,serving,page_url,contains,may_contain
   - numbers only (no units), blank when the page does not print that number; never 0 for a blank
   - page_url: the chain's own page where you read that row
   - contains / may_contain: allergen words from the page separated by ";" (e.g. gluten;milk), the word NONE if the page lists
     none, blank if the page shows no allergen information for that dish
4. Do not skip dishes that look odd, and do not "fix" odd numbers: copy them. Finish by telling me how many dishes you wrote, which
   categories you could not open, and the sites count and where you found it.
```

## Batch mode: you do NOT need to do this once per chain

Run it once for the whole queue. On your Mac, in the repo folder:

```bash
cd ~/MenuAi
git pull
claude --chrome
```

Then paste this ONE message:

```
Read docs/CHROME_TO_APP.md and data/chrome-inbox/QUEUE.md. Work through every unticked chain in the queue, one at a time, following
the rules and the prompt in that document exactly. For each chain: check its robots.txt first, read its own pages, write
data/chrome-inbox/<chain-id>/meta.json and items.csv, tick the line in QUEUE.md. If a chain is blocked, shows allergens only or
per-100 g only, has fewer than 3 UK sites, or its robots.txt forbids it, do NOT work round it: write the reason on its line and
go to the next chain. If a 'verify you are human' page appears, stop and tell me; I will solve it and say 'continue'. After every
3 chains run: git add data/chrome-inbox && git commit -m "Chrome read: <chain ids>" && git push. Never run scripts on a page, never
use any site except the chain's own.
```

You only step in for human checks. Each chain takes it roughly 10 to 30 minutes, so a queue of 10 is an afternoon and uses Claude
usage like any long session; add chains to the queue file whenever you like. On my side nothing is per chain either: when new
folders appear in `data/chrome-inbox/` I import, check and publish all of them in one go.

### Running two sessions at once

You can open a second terminal and run a second `claude --chrome`, but give each session its own queue file so they never edit the
same lines: session 1 uses `data/chrome-inbox/QUEUE.md`, session 2 uses `data/chrome-inbox/QUEUE-B.md` (say "QUEUE-B.md" instead
of "QUEUE.md" in the pasted message). Before each push both sessions should run `git pull --rebase` first. When both queues are finished, `QUEUE-C.md` (51 priority chains) and `QUEUE-D.md` (37 long shots) work the same way; the whole
picture is in docs/CHAINS_WORK_LIST.md. Both sessions share the
same Chrome, so ask each to work in its own tab or window; if they start fighting over the same tab, close one. Two sessions use
your Claude usage twice as fast.

## Tips learnt on the first long run (2026-10-10)

- **Cheapest reader:** `get_page_text` on a product page often returns the whole nutrition panel (Starbucks, Burger King); use `find` for text hidden in collapsed panels, then `read_page` with a `ref_id` to confirm a dialog's exact text. `find` is a summariser: check every number (kcal against 4P+4C+9F, kJ against kcal x 4.184) and re-read flagged rows.
- **Look for the site's own feeds** with `read_network_requests` (arm it with a first call, then reload): a JSON feed can verify and extend what the page shows (Sushi Shop's page-data.json, Turtle Bay's menu proxy).
- **Photo addresses:** open the product's own page, then `read_network_requests` with a `urlPattern` for the image host (Burger King: `w=1077` finds only the hero picture; Starbucks: `_next/image`). The browser cache hides pictures you have already loaded: press cmd+shift+r and read again. Use a picture only where the page's heading names the same product; a page that is a meal, bundle or box of several products names a different item. Then `python3 tools/uk_extract/inbox_photos.py <chain> --apply` downloads them politely.
- **Batches:** about 3 pages per `browser_batch` (navigate, wait 8-10 s, read); a longer batch can time out and keep running in the background.
- **Chrome's PDF viewer cannot be read** by these tools, and downloading needs your OK: PDF-only chains are listed in `data/chrome-inbox/PDF_DOWNLOADS.md`.
- **Never** accept a cookie banner, work round a check page, or run a script on a page.

## Chains to pilot first (calories shown on a page our scripts cannot read)

Start with these, in this order, and stop after the first three if the yield is poor. The first four are the ones users look for most.

| Chain | Where to look | Why it is a good pilot |
|---|---|---|
| McDonald's | mcdonalds.com/gb: Good to know, Nutrition calculator | big brand; our cloud address is blocked |
| Domino's | dominos.co.uk/nutritional-information | big brand; "not available in your location" from our server |
| Papa Johns | papajohns.co.uk, footer: nutrition / allergen guide | big brand; blocked from our server |
| Costa | costa.co.uk: allergen and nutrition guide | big brand; its site errored for us |
| Tossed | tossed.co.uk (13 London sites): Cloudflare check | trading chain, Cloudflare blocks our scripts |
| Turtle Bay | turtlebay.co.uk/menu (a Vue app, about 40 sites) | unknown whether nutrition is shown: worth a look |

If a chain shows only allergens (no calories), tell me and we skip it.
