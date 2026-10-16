# Item photos: what each chain's own terms say (read on 2026-10-06)

Quoted by agents from each chain's terms page, so the founder can decide chain by chain (CLAUDE.md rule 2). Prepared photo sets
for several chains exist outside the repo and install in one step if the founder says so. Nothing here is legal advice.

## pizza-hut - NOT banked (held in scratchpad/uk/held-photos/pizza-hut): 107 of 237 items; commit was blocked by the auto-mode classifier after the agent reported the site's terms (clause 3.1: images protected by copyright, must not be copied or used without express written permission). Founder decision needed.
## burger-king - 0 photos: JavaScript-only site, private GraphQL feed (rbictg.com) = treated as a block; Chromium here can't trust the egress proxy CA (a flag ignoring TLS errors was denied: correct).
## kfc - 44 of 108 items, 640 KB. robots allows all but /wingzapp/. No image terms seen (terms page not read).
## subway - 63 of 145 items, 392 KB. robots blocks only /sitecore/ and delivery locators. Tile text "Image for illustrative purposes only"; ~20 photos carry the chain's own "NEW" pill; 5 subs dropped because the photo prints "FOOTLONG nn g OF PROTEIN". Terms page not read.
## nandos - 128 of 138 items, 3.5 MB (115 files). From the menu feed's own image field (images.menu.nandos.dev). robots disallows only /order/*. No image terms seen.
## pret - 322 of 329 items, 6.9 MB (209 files). Source: category JSON pret.co.uk loads; product pages as source_url; Contentful host images.ctfassets.net. robots only disallows other locales. No image terms seen.
## starbucks - HELD (scratchpad/uk/held-photos/starbucks): 117 of 347 items, 61 files, 911 KB. Source starbucks.co.uk/menu product pages; media host www.digitalassets.starbucks.eu. robots allows /menu. Terms (starbucks.co.uk/terms-of-use): may not "use, frame or utilize framing techniques to enclose any Starbucks trademark, logo or other proprietary information, including the images found at the Sites… without our express written consent"; Site Materials incl. pictures protected by copyright, "All rights not expressly granted are reserved." => FOUNDER decision.
## greggs - 96 of 263 items, 2.4 MB (96 files): UNBANKED in tree, waiting for terms audit. Source: product feed behind greggs.com/menu (imageUri on articles.greggs.co.uk); robots disallows only /404, /app-content/*, /click-and-collect/*. Terms not read by the agent.
## TERMS AUDIT (2026-10-06): every chain checked has an express restriction. => photos withdrawn/held; founder decides.
- kfc https://www.kfc.co.uk/terms-conditions: "The graphic images, buttons and text contained in the Sites ... are the exclusive property of KFC and, except for personal use, may not be copied, distributed, or reproduced or transmitted in any form ... without the prior written permission of KFC."
- subway https://www.subway.com/en-gb/legal/terms-of-use: "The Site's content is prohibited from being copied, reproduced, downloaded, distributed, modified, republished, uploaded, licensed, adopted, adapted, posted or transmitted in any way, except as may be otherwise explicitly permitted by us in writing." (lists "photographs" as the Subway Group's property)
- nandos https://www.nandos.co.uk/nandos-terms-and-conditions: "No part of the Website or Nando's App, including ... photographs and images contained in them, may be copied, reproduced, republished, ... or otherwise used in any way for any non-personal, public or commercial purpose without our prior written consent."
- pret https://www.pret.co.uk/en-GB/legal: "you will access the content solely for your personal, non-commercial use. None of the content may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without our prior written consent."
- greggs https://www.greggs.com/legals/terms-and-conditions: "you will access the content for your personal non-commercial use only. None of the content may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without our consent." ("content" generally)
- five-guys /legal/ 3.1.4: not allowed "to use or pass to any other party ... any of the materials on this Website ... for commercial purposes without obtaining a licence"; 3.1.1 photographs are copyright Five Guys UK; 3.2 forbids storing/reproducing content in any other website or system without prior written permission. (25 of 69 items prepared, 600 KB, held)
- pizza-express https://www.pizzaexpress.com/terms-of-use cl. 7.2: materials only for "your own personal, non-commercial use"; must not "reproduce, modify, display ... or exploit this Website and/or the Materials for any commercial purpose, without our prior written consent". No photos downloaded; no per-item photo page found.
- prezzo https://www.prezzo.co.uk/about/website-terms-of-use/: "you must not use any illustrations, photographs, video or audio sequences or any graphics separately from any accompanying text"; "must not use any part of the content on our site for commercial purposes without obtaining a licence". No photos downloaded.
- wagamama https://www.wagamama.com/terms-and-conditions: forbids "text or data mining or web scraping"; content "may not be ... reproduced or stored in any other website ... without our express written permission"; no commercial use without a licence. images.tenkites.com robots: Disallow: /. No photos downloaded.
- pizza-hut, starbucks: see above (express written permission).

## SUPERMARKETS (groceries), read 2026-10-08 (Tesco, Sainsbury's)

**2026-10-11 founder decisions:** Tesco photos yes (accepted risk); full product lists with the shop's own photos for Asda, Aldi and Lidl (accepted risk),
then "all the grocery stores, all the items": Tesco, Waitrose, Morrisons, Iceland and M&S lists published the same day, each the founder's accepted risk against
the clause quoted below (Co-op has no list: it blocks even from a UK VPN; Ocado's crawl stays quarantined and unused). What each terms check found
(`data/groceries/listing/raw/<shop>_terms.txt`):
- **aldi** https://www.aldi.co.uk/corporate/terms-and-conditions: forbids "any systematic or automated data collection activities on or in relation to our
  Site ... without our express written consent (such as scraping, data mining, data extraction and data harvesting)" and "You must not use any part of the
  content on our Site or our App for commercial purposes without obtaining a licence to do so". The founder was told this and chose to publish (2026-10-11).
  Photos load from Aldi's own image host dm.emea.cms.aldi.cx (no robots.txt). Product page addresses from its sitemap_products.xml (robots.txt allows it).
- **asda** terms NOT read: robots.txt disallows /terms* and www.asda.com answers 403 to this environment. The founder chose to publish anyway (2026-10-11).
  Photos load from asdagroceries.scene7.com (no robots.txt); the app links to Asda's own search for a product (no page addresses).
- **lidl**: no website terms of use; its Legal Information page has no clause on copying, scraping or automated access. Photos: the og:image of each
  product's own page (imgproxy-retcat.assets.schwarz), read one page a second (robots.txt allows /p/).
- **tesco**: its image host answers 403 to this environment for the photos themselves, so no Tesco copies are stored; the 332 hotlinked Tesco photos stay.
  The founder's yes lets a Chrome run on their Mac read Tesco product pages for barcodes and photo addresses (docs/NEXT_GROCERIES_IMAGES_PROMPT.md).
  Its full list (6,086 groceries from the crawl, which Tesco's bot check stopped part-way) shows Tesco's own photo addresses from the listing tiles, loaded
  from Tesco by the visitor's browser (never stored; this environment can't load them, so they were not looked at on a contact sheet). Terms: see below
  ("bots, crawlers, scrapers, or AI tools ... without our prior written consent").
- **waitrose** (terms "Last updated: 22 January 2026"): "No part of this website may be reproduced in any material forms (including storing in any medium by
  electronic means) without the prior written permission of Waitrose Limited." No clause on bots or scraping. robots.txt allows the browse pages. Photos load from
  ecom-su-static-prod.wtrecom.com (its robots.txt answers a missing-file error); links open Waitrose's own search for the product name.
- **morrisons** ("Terms and Conditions of Use" 2.1-2.2): extracts may be printed and downloaded "for your own use" if unmodified, and "any use of extracts from
  the Website other than in accordance with paragraph 2.1 ... " is not permitted. No clause on bots or scraping; robots.txt allows category and product pages.
  Photos load from groceries.morrisons.com/images-v3 (robots.txt allows it); links open Morrisons' own search.
- **iceland** (terms 3.2): "you must not otherwise copy, reproduce, transmit, publish, display, distribute, commercially exploit, use or create derivative works of
  any material data and content on our website without our prior written [permission]". No clause on bots. Photos load from assets.iceland.co.uk (no robots.txt);
  links open the product's own page (/p/x/<id>.html).
- **marks-and-spencer**: "You may not, without our prior written consent, copy, reproduce, crawl, frame, republish, download, print, post, distribute, re-post,
  broadcast, record, transmit, edit, communicate to the public, link to, deep-link into, or distribute in any way the web pages or materials on the Website or the
  computer codes or elements comprising the Website other than solely for your own personal or internal business use." and "You may not use the content of the
  Website for any commercial purposes whatsoever." (Website Terms, Part B, "Your use of this website"; read 2026-10-08 and again 2026-10-16.) The founder's accepted risk
  covers this: 2026-10-11 (all nine shops), 2026-10-14 ("keep") and **2026-10-16 ("M&S definetly has more products add the rest of them please")**.
  *Priced lists (2026-10-11):* the 194 food-to-order, gift and Christmas products that carry a price (the 11 flower-and-treat gifts are left out); their links open M&S's own search.
  *Everyday food range, "M&S Food Catalogue" / Foodhall (2026-10-16):* **5,947 more products** (5,949 read and written, 2 dropped by the builder's rules: a pack of coffee filter
  papers and a rosé-flavoured kombucha), each with its name, its pack size where M&S prints one (not for things sold by the piece, such as a pain aux raisins), M&S's own picture and
  a link to **its own page on marksandspencer.com** (the page names "deep-link into" above; it is part of the accepted risk), shown as **"Price in store"**. M&S's aisle pages list no
  price for these products (every price field of every aisle tile is empty) and its product pages ask the visitor to "Select your store"; what the site shows once a store is chosen
  was not looked at, so the app says only that M&S lists no price. None is shown or estimated, and no barcode, nutrition or allergen is read. Source: each aisle's own page,
  https://www.marksandspencer.com/food/l/<aisle> and ?page=N (96 products a page; robots.txt allows both: it disallows /*pgNumber, /*prefn1, /*prefv1, /*srule=, /*productId=,
  /*quickView=, search paths, colon paths and offers, none of which was used), read by `tools/groceries/mns_food_listing.py` at one request a second, one at a time, the page's
  embedded JSON only (no page copies kept), with a stop on any 401/403/429/5xx, challenge page or page that fails its checks.
  **Complete: all 20 aisles read in full, each "collected X of X" of the total its page printed** (`data/groceries/listing/marks-and-spencer-food-coverage.csv`): Meat Alternatives,
  Fruit & Vegetables, Meat, Poultry, Cured & Ready to Eat Meats, Fish & Seafood, Dairy, Eggs, Deli, Food on the Move, Chilled Desserts, Ready to Cook, Food Cupboard, Bakery & Cakes,
  Frozen Food, Hot Drinks, Soft Drinks, Kids' Food & Snacks, Picky Bits and Halloween Food. (A first run, in the morning, stopped by its own page check on Bakery & Cakes page 3: three
  tiles with no pack size were taken for a change of format. That was a fault in the check, not a refusal by M&S; the check was corrected and the run resumed the same day.)
  *Requests made (aisle pages):* 64 in the first run (63 read, 1 stopped on) and 17 in the resumed run = 81 page requests for 80 pages, plus one robots.txt read per run.
  *Not crawled* (no product kept from them; no alcohol, groceries only): Drinks as a whole, Alcoholic Drinks, Wine, Household, Pet Supplies, Baby Changing, Christmas Groceries In Store,
  New In, Home of Health, Remarksable Value, Food brands, Home of Dine In and the gift lists. *Scouting before the crawler was written* (`data/groceries/listing/raw/marks-and-spencer-food_categories.txt`,
  "47 polite requests" by the scout's own header, one a second, robots.txt checked): the first page of the 14 food aisles, Drinks, Hot Drinks, Soft Drinks, Alcoholic Drinks, Kids and
  Kids' Food & Snacks, Household, Pet Supplies, Picky Bits, Halloween Food and Christmas Groceries In Store was read once each, only for the total each prints and to judge whether the aisle
  belongs (nothing from the alcohol, household, pet or Christmas pages was kept; Wine and Baby Changing were not fetched). The crawler itself fetches no sitemap and no product page. Outside
  the crawler, the planning step read robots.txt and the sitemap index once each, and a handful of single reads (product pages, an aisle page and M&S's own page script, each
  robots.txt-checked, at most one a second) were made while the work was reviewed; that is where the "Select your store" wording was seen again (the 2026-10-08 notes quote it too).
  These reads are not counted above.
  3 alcoholic drinks that sat in the Ready to Cook aisle and 3 cocktails in Picky Bits are left out by hand (`data/groceries/listing/marks-and-spencer-food-exclude.csv`).
  Photos load from assets.digitalcontent.marksandspencer.app at 400 px (resized there, never cropped; its robots.txt has no rules), not stored. Random sets were looked at on contact sheets:
  108 from the first 5,123 rows and 36 from the 824 added after the crawl was finished (Bakery & Cakes, Frozen Food, Hot Drinks, Soft Drinks, Kids' Food & Snacks, Picky Bits); every one showed
  the product named (3 of the 36 are wide, thin pictures of a box of coffee pods, which are the product but small in a square tile).
  **Links:** the 5,947 rows of the everyday range open the product's own page; the 194 priced rows still open M&S's search.
  **Take-down:** add `shop:marks-and-spencer` to `web/public/logos/hidden.json` and deploy: M&S's logo and every M&S picture disappear without an app update (the crawler also
  refuses to run while it is listed). That does **not** hide the product names, prices or links: to take the whole list down the day M&S asks, remove `marks-and-spencer` from
  `PUBLISH` in `tools/groceries/build_all_products.py`, delete `web/public/groceries/all/marks-and-spencer.json` and its entry in `all-manifest.json`, and deploy; the iPhone app
  keeps its packed copy until its next release.

Same use as the restaurant photos (the shop's own photo of the exact product, resized only; founder's go-ahead 2026-10-08). Nothing here is legal advice.
- **tesco** https://www.tesco.com/shop/en-GB/zone/general-terms-and-conditions: "The content of the Site is protected by copyright, trade marks, database and other intellectual property rights. You may retrieve and display the content of the Site on a computer screen, store such content in electronic form on disk (but not any server or other storage device connected to a network) or print one copy of such content for your own personal, non-commercial use ... You may not otherwise reproduce, modify, copy or distribute or use fo[r commercial purposes]" and "Prohibited automated access: you must not use any automated system, software, or process (including bots, crawlers, scrapers, or AI tools) to access, extract, or collect data from this Site for any purpose without our prior written consent." **This also covers the price collection, not only photos.** robots.txt (read in the browser): no rule against product pages or images. Image host digitalcontent.api.tesco.com answers 403 to scripts for /robots.txt (and in a browser): the shared helper treats that as "do not fetch", so Tesco photos are NOT downloaded (the host does serve the photo itself, HTTP 200 with `access-control-allow-origin: *`); the founder decides.
- **sainsburys** https://www.sainsburys.co.uk/terms (the groceries Terms & Conditions, 205 paragraphs, plus help.sainsburys.co.uk/help/terms-and-conditions/buying-online): no clause on copying content or images, or on automated access, found by keyword scan (copyright, image, photograph, reproduce, scrape, crawl, robot, automated, data mining, intellectual property, trade mark, licence). robots.txt (www.sainsburys.co.uk, read in the browser): disallows only account, checkout and search-servlet paths, not product pages. Image host assets.sainsburys-groceries.co.uk: no robots.txt (404 = no rules), serves the photo to a plain polite request.

