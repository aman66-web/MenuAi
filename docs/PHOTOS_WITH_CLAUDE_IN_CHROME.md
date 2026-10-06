# Getting item photos from sites that block us: Claude in Chrome

Some chains' websites refuse automated visits from our scripts (a "blocked" or "verify you are human" page). They don't refuse
a person in a normal browser, so for those chains **Claude in Chrome** (Claude working inside your own Chrome) reads the menu
pages for us. It writes a short list (item name, photo address, page address); our importer then downloads each photo politely
and attaches it only when the name matches one of our items exactly.

Founder's decision, 2026-10-06: item photos are used even where a chain's terms restrict reuse (your accepted risk). Photos
still come only from the chain's own website; never Google Images, delivery apps or other sites.

## 1. Set up Claude in Chrome (once)

1. In Chrome, open the Chrome Web Store and install **Claude** ("Claude in Chrome"), or go to claude.ai/chrome. It needs a
   Claude plan that includes it: if you don't see the option, check your plan at claude.ai.
2. Pin the extension, click it, sign in with the same Claude account, and open the side panel.
3. When it asks for permission to act on a site, allow it for the chain's website only.

## 2. For each chain, paste this into the Claude in Chrome side panel

Replace the two bracketed bits. The menu page is on the chain's own website (for example KFC's "Menu" page).

```
I'm collecting the official photo of each menu item from {CHAIN NAME}'s OWN website, for a nutrition app I run.
Only use {CHAIN NAME}'s own website ({HOME PAGE}). Never use Google Images, delivery apps (Deliveroo, Just Eat, Uber Eats)
or any other site.

1. Open the menu. Go through EVERY category and scroll to the bottom of each so all photos load (open "see more" /
   "load more" buttons, and any tabs). If a page shows a "verify you are human" check, stop and tell me; I will do it.
2. For every menu item that has its own photo, record:
   - name: the item's name EXACTLY as the page prints it (same spelling, including sizes like "Large" if the page names them)
   - image_url: the address of that item's photo file (the real image address, https://..., the largest version if the page
     offers several sizes)
   - page_url: the address of the page where you saw it
3. Skip: banners, hero pictures, logos, offer/promotion images, "coming soon"/placeholder images, photos that show several
   different products, and photos with nutrition numbers written on them. Never guess a name or match a photo to a similar
   item. If unsure, leave the item out.
4. Give me the result as ONE CSV code block with exactly this header and one line per item (quote names that contain commas):
   name,image_url,page_url
   If there are more than about 150 items, give several code blocks, one per category.
5. Finish with the number of items you found and any categories you could not open.
```

## 3. Give the list to the importer

Easiest: copy the CSV code block, then in Terminal (in the MenuAi folder):

```bash
mkdir -p saved-pages
pbpaste > saved-pages/kfc.csv                  # use the chain's id: kfc, nandos, pizza-hut, subway, ...
python3 tools/uk_extract/images_from_saved_page.py kfc --list saved-pages/kfc.csv            # dry run: shows every match
python3 tools/uk_extract/images_from_saved_page.py kfc --list saved-pages/kfc.csv --apply    # downloads and stores
```

Or just paste the CSV to Claude Code in the chat and say which chain it is; it runs these commands and then checks every
stored photo by eye (`python3 tools/uk_extract/photo_sheet.py <chain>` makes a contact sheet).

If a photo's image host refuses the download, the importer skips that photo and says so: it never works round a refusal.

## 4. Chains that need this

Blocked from our scripts: KFC, Nando's, Pizza Hut, Subway, Premier Inn, Gourmet Burger Kitchen, and the pub brands from one
owner: All Bar One, Browns, Ember Inns, Harvester, Miller & Carter, Nicholson's, O'Neill's, Sizzling Pubs, Stonehouse,
Toby Carvery, Vintage Inns. Any other chain whose scripts report "blocked" (see docs/PROGRESS.md) can use the same route.

Chain ids and home pages: `data/source/<id>/chain.csv`. Item names the importer matches against: `data/source/<id>/items.csv`.
