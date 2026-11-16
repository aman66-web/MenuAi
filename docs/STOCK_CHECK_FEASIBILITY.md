# Stock check: can Numbite say whether a recipe's ingredients are in stock at a place the person chooses?

1. **Best approach:** don't fetch stock ourselves. Give each ingredient a "Check stock at {shop}" link that opens the shop's own stock page in the person's own browser or app (approach D), and label the recipes as "everyday ingredients" (approach E).
2. **Ship first:** on a recipe's Ingredients tab and on the Shopping list: one "Check your local Sainsbury's" button that opens Sainsbury's own Store Stock Checker, a "Check on {shop}'s website" link on each product, and one sentence saying we can't see any shop's shelves.
3. **Biggest risk:** a screen that sounds certain ("in stock near you"), so a person makes a trip for something that isn't there. A close second: any attempt to fetch live stock ourselves, which runs into bot blocks, terms that forbid automated access (Tesco, Aldi, B&M, Amazon, M&S) and rule 4 (the server would learn where the person shops).
4. **Not verified:**
   - What each shop shows once a store or postcode is chosen, and whether its stock pages accept a link that names the store and product ("needs the founder's Chrome").
   - Labels inside the Tesco, Waitrose and Asda apps.
   - Whether the Lidl Plus app's "reservation function" (per selected store, in its terms) is live in Great Britain.
5. **Founder decides:**
   - Whether opening the shop's own page is enough, given that no permitted route gives Numbite live per-store stock today.
   - Whether to write to Sainsbury's and Snappy Shopper asking for a stock feed.
   - The new on-screen wording (CLAUDE.md rule 8).
6. **Rough effort:**
   - First version (links and wording): about 1 day.
   - A store picker that runs only on the phone, from an open store list: 3 to 5 days more.
   - Live stock through a partner: weeks to months, and only if a partner says yes.

Desk research done 16 November 2026. Nothing was built and nothing in the app changed.

How it was done:
- One robots.txt request per shop from this cloud computer, with curl's ordinary user agent (no disguise).
- Four researchers working from web search, the shops' help pages on other hosts, developer documentation and trade news.
- No postcode, store choice or personal data was typed or sent anywhere. Nothing was logged into, no challenge was solved, no block was worked round.
- Wording marked "(snippet)" was seen only in a search engine's copy of the page, because the shop's own site refused automated visits.
- Wording marked "(founder's Chrome, Oct 2026)" was read by earlier sessions in the founder's own browser, signed out with no store chosen. It is kept in `data/groceries/listing/raw/`.
- The shared web-search allowance (about 200 searches) ran out near the end. Some cells say "not found" for that reason; they are listed under "Not verified" at the end.

## The short answer

**No shop gives an outside app a way to read its shelf stock.** What exists:

- **The shops' own tools, for their own shoppers:**
  - **Sainsbury's:** a public **Store Stock Checker** website. You pick a store, then see one of four labels: "In Stock", "Awaiting Delivery", "Not Available" or "Not Tracked".
  - **Tesco:** **Stock Check** for any local store, inside the Tesco Grocery & Clubcard app.
  - **Waitrose:** an app "In-store Mode" that is reported to check a shopping list's availability at a chosen store.
  - **M&S:** food pages that say "See stock and price in your local store" with "Select your store". Its help page calls its stock locators "an indication of where stock might be available".
  - **Lidl:** the Lidl Plus app's terms describe a "reservation function" that will "show you the products that are available in your selected store". Whether it is live in Great Britain is unconfirmed.
  - **Everyone else:**
    - Online availability for a delivery postcode or slot: Asda, Morrisons, Iceland, Ocado, Waitrose, Co-op online, Amazon.
    - A national message: Lidl's "Available in store now" / "In store from 15.10"; Aldi's "the availability displayed is just an estimate"; Home Bargains' "OUT OF STOCK".
    - Nothing at all: Farmfoods, B&M, and the Spar, Nisa, Costcutter, Londis and Budgens websites.
  - **Morrisons says outright that it can't tell you:** "we are unable to advise on specific stock levels in your local stores". Its app's Product Finder gives the aisle but says "Product stock is not currently displayed".
- **Delivery apps for convenience shops:** Snappy Shopper, Deliveroo, Uber Eats, Just Eat and Booker's Scoot show each shop's own items after the shopper types a postcode. The shop's till system sends the stock in.
- **Systems that only take data in, or only serve suppliers:**
  - The delivery apps' interfaces let shops **write** their stock in; none offers an outsider a way to read it.
  - Supplier portals (dunnhumby for Tesco, Circana's supplier portal for Sainsbury's, Asda's "ADR", Morrisons' SKUtrak) hold store-level availability, but only suppliers with a trading contract can use them.
  - Google's local inventory feeds are sent in by retailers; Google offers no way for another app to read them.
- **Paid data firms:** Profitero/Circana, NIQ Digital Shelf, Flywheel and DataWeave sell "availability" to brands under enterprise contracts. It is mostly online availability, almost certainly collected by watching the shops' websites. Scraping services (Apify, Bright Data, SerpApi) sell the same by getting round the shops' bot protection, which our rules forbid.

So the honest thing Numbite can do today is **send the person to the shop's own stock page** and **say plainly what our recipes were designed for** (ingredients most small shops usually sell).

## Retailer by retailer

"Refuses automated access" is what happened when this environment fetched the shop's robots.txt once on 16 November 2026 (RFC 9309: a 4xx answer would mean "no rules", but an Access Denied or challenge page is a block, so nothing more was fetched from that host). Terms clauses are quoted exactly, under 15 words, one per shop. Source codes refer to the list at the end.

| Retailer | Stock shown to shoppers, and where | Per store or per postcode | Login needed | Official API | Refuses automated access | Terms clause | Sources |
|---|---|---|---|---|---|---|---|
| **Tesco** | App: **Stock Check** "in any of your local stores" (help page and App Store listing, snippet). Website: "This product's currently out of stock" with "Rest of shelf" (indexed page, snippet). Whoosh and the Uber Eats / Deliveroo listings (from Aug 2026) are picked from a local store. Stock Check's own labels: needs the founder's Chrome (phone) | App: per store, chosen by the shopper. Online: per delivery or collection store and slot (inference) | Store choice for Stock Check; sign-in not known. Account for slots | **None.** Tesco Labs (Grocery Search, Product Data, Store Location) no longer issues keys and never returned stock; its host doesn't resolve from here. Supplier-only: dunnhumby shelf-availability reports | **Yes** (Akamai "Access Denied") | "any automated system, software, or process (including bots, crawlers, scrapers, or AI tools)" (tesco.com general terms, read 2026-10-09) | T1–T13 |
| **Sainsbury's** | **Store Stock Checker** (stockchecker.sainsburys.co.uk): "In Stock", "Awaiting Delivery", "Not Available", "Not Tracked" (official help page, read). Online: "Currently out of stock" (founder's Chrome, Oct 2026). "Each store has its own range" online | Checker: per store. Online: per delivering store for the postcode | Checker: "Search for your local store by name"; no login mentioned. Online: postcode/slot | **None public.** Supplier-only portal (Circana) with depot- and paid store-level data; Nectar360 for brands | **Yes** (Akamai on www; the checker answered 403 to a fetch) | No clause on copying or automated access found (keyword scan of the groceries terms, 2026-10-08) | S1–S10 |
| **Asda** | Website: "Out of stock" button on tiles (founder's Chrome, Oct 2026); "Out of stock" / "See alternatives" on an indexed product page (snippet). No in-store stock checker found. Asda Express on Uber Eats, Just Eat and Deliveroo: availability "aligned with Asda's internal systems" per Express store (trade press) | Online: per delivery store/slot (inference). Delivery apps: per Express store | Not known: needs the founder's Chrome | **None.** Supplier-only "ADR" (replaced Walmart's Retail Link, 2025). Ocado's platform runs Asda online from 2027 | **Yes** (Cloudflare "Attention Required!") | Not read: robots.txt disallows `/terms*` and the site refuses this environment | A1–A7 |
| **Morrisons** | Help: "we are unable to advise on specific stock levels in your local stores" (snippet). App Product Finder gives the aisle for a chosen store; "Product stock is not currently displayed" (snippet). Online: booking a slot first gives accurate availability (FAQ, snippet); product-page wording needs the founder's Chrome. Also sold through Amazon, Deliveroo (since 2020) and, for Morrisons Daily franchise shops, live local feeds into Uber Eats, Deliveroo and Just Eat (NearSt, 2024) | Online: per delivery/collection slot. App: per store, aisle only, no stock | A booked slot (account) for accurate online stock | **None.** Supplier-only SKUtrak (since 2020). Affiliate listings on Awin, Tradedoubler, FlexOffers (one marked paused; feed and stock fields unknown) | No (robots.txt allows category and product pages, disallows `/api/`); morrisons.com help pages answered 404 | "for your own use" (Terms and Conditions of Use 2.1, read 2026-10-08) | M1–M9 |
| **Waitrose** | Website: "Temporarily unavailable", "Sold out online", "View alternatives" (indexed pages, snippet, may be old). App "In-store Mode": a list that "checks product availability at specific stores" (The Grocer, snippet; date not shown). Per-branch listings on Deliveroo and Uber Eats | Online: per branch/slot. App: per store (reported) | Not known | **None** for groceries (Waitrose Cellar wine affiliate feed only) | **Yes** (connection dropped, HTTP/2 error) | "No part of this website may be reproduced in any material forms" (terms, 22 Jan 2026) | W1–W7 |
| **Aldi** | Product pages: "the availability displayed is just an estimate", "To see exactly what's on offer head to the middle aisle!" (fetched). Terms 1.2: "our Click & Collect service has been discontinued" (end date not confirmed). Deliveroo ended Jan 2022. No store choice anywhere | **National** estimate | No | **None** | No (robots.txt allows product pages and names ClaudeBot "Allow: /") | "any systematic or automated data collection activities" (corporate terms, still there 16 Nov 2026) | AL1–AL5 |
| **Lidl** | Product pages: "Available in store now" (1,577 pages) and "In store from 15.10" (Lidl's own pages, read 11 Oct 2026); availability types IN_STORE, IN_STORE_FROM_FUTURE_DATE_RANGE etc., none tied to a store. No online grocery shopping in GB. **Lidl Plus app** terms (v2.2, May 2026): a "reservation function" that will "show you the products that are available in your selected store"; whether it runs in GB: needs the founder's phone | Website: **national**. Lidl Plus reservation: per selected store | Website: no. Lidl Plus: account and a selected store | **None** for products (Lidl's "API Access Request" form is for electric car charging data only) | No | No clause found (Legal Information page; Lidl Plus terms have none either) | L1–L5 |
| **Co-op** | Co-op Delivery is picked and packed in your local store, and click and collect is "from the local store"; "Delivery and items are subject to availability and in participating stores only." (coop.co.uk/ways-to-shop, fetched). The shop's own wording is behind its block: needs the founder's Chrome. Also on Uber Eats (1,300+ stores, 2025), Deliveroo, Just Eat, Amazon ("Co-op on Amazon") and a Snappy Shopper trial (2 stores, 2024) | Per local store, in its own shop and every delivery app | Postcode or store | **None** found. Supplier-only SKUtrak (2018). Peckish (a Co-op-built delivery app) reads independent shops' tills, not Co-op's own stock | **Yes** for the shop (Imperva challenge); www.coop.co.uk answered normally | "to reproduce, duplicate, copy or re-sell any part of our site" (website terms, Prohibited uses) | C1–C7 |
| **M&S Food** | Food pages: "See stock and price in your local store", "Select your store" (founder's Chrome, Oct 2026) and "Prices, promotions and availability may vary in selected stores and online at Ocado." (fetched). Help: "we are not able to reserve items in-store" and its stock locators are "an indication of where stock might be available". The aisle pages' data has a `stockLevelIndicator` field, `null` on all 2,011 tiles read with no store chosen. What shows after a store is chosen: needs the founder's Chrome. Grocery delivery is through Ocado; some stores on Deliveroo | Per store, once chosen on M&S's site (the page's own words; inference that a stock signal then appears) | Store choice on M&S's site | **None** | No (robots.txt allows plain pages; disallows `/*MSHomeStoreOption`) | "copy, reproduce, crawl, frame, republish" (Website Terms, Part B) | MS1–MS5 |
| **Iceland** | Website tiles: "This product is unavailable / Out of Stock" (founder's Chrome, Oct 2026). Help: a postcode, then "you will be prompted to create an online account" (snippet). Rapid delivery from Oct 2026: "Participating Iceland stores pick and pack the orders" (17 London stores, 200+ planned). Also Deliveroo (from Sep 2024), Amazon (nationwide, Feb 2026) and Uber Eats | Online: per postcode/slot; rapid orders and delivery apps: per store | Postcode, then an account | **None.** Awin affiliate 7868 (no feed mentioned; "Direct linking is also NOT permitted") | No (pages are drawn by script, so fetches returned no text) | "must not otherwise copy, reproduce, transmit, publish" (terms 3.2) | I1–I6 |
| **Ocado** | No shops. "The products you see as in stock will depend on when your order is being delivered to you." (Ocado blog, 2020). Zoom pages: "Out of stock" (snippet) | Per delivery date/slot from the warehouse serving the postcode | Postcode/slot | **None.** Affiliate through CJ (Ocado's own page, snippet); feed and stock unknown | **Yes** (AWS WAF challenge, empty answer) | Not read (blocked) | O1–O5 |
| **Booths** | No general online grocery shop found. "Food to Order" (orders.booths.co.uk): "Select a collection store", "Please check the availability for each product ordered." (fetched). Booths says: "We have a limited range of Booths brand products available for home delivery on Amazon Fresh." Its 2020 click and collect and Deliveroo: status unknown | Food to Order: per collection store and date | A collection store | **None** | No (robots.txt allows everything) | "Any other use of intellectual property contained on this website requires permission from Booths." (website terms, © 2018) | B1–B3 |
| **Spar** | No product stock on spar.co.uk. Store pages list each shop's services ("Deliveroo", "Uber Eats", "Home Delivery"). Stock only inside Deliveroo (all SPAR stores, 2022), Uber Eats (2025), Snappy Shopper (SPAR Delivered, SPAR Dash) and Just Eat | Per shop, inside each delivery app, after a postcode | Postcode/address in the delivery app | **None.** The delivery apps' interfaces are for shops and their till suppliers | robots.txt answered; a page fetch got 403 | "for your own personal use and not for any commercial activities" (SPAR Rewards terms, snippet) | SP1–SP6 |
| **Nisa** | No stock and no product pages on nisalocally.co.uk. Stock inside Snappy Shopper, Deliveroo, Uber Eats, Just Eat ("participating Nisa stores") and Nisa To You | Per shop, after a postcode | Postcode/address | **None** | No | "must not use any part of the content on our site for commercial purposes" | N1–N4 |
| **Costcutter** (Bestway) | No stock on the site, which says a shop "has no obligation to stock the products" shown. Stock inside Snappy Shopper, Uber Eats, Deliveroo and Just Eat | Per shop, after a postcode | Postcode/address | **None** | No, but robots.txt disallows `/api/getlocalstore` and hundreds of store pages | No terms-of-use page found | CC1–CC4 |
| **Londis** (Booker) | No stock and no ordering on the site ("please contact your local Londis"). Stock inside Booker's Scoot app (about 300 shops by Feb 2026), Snappy Shopper and Just Eat | Per shop | Postcode/address | **None** | No | "may not reproduce, modify or in any way commercially exploit any of the Content" | LB1–LB4 |
| **Budgens** (Booker) | As Londis (same owner, same site and terms) | Per shop | Postcode/address | **None** | No | As Londis (budgens.co.uk/terms) | LB1–LB4 |
| **Farmfoods** | None: in-store only; no online shopping or delivery-app listing found | — | — | **None** | No (robots.txt 404 = no rules) | No clause found (footer has only a privacy policy) | F1 |
| **Amazon Fresh** | Amazon.co.uk shows availability for the delivery postcode (wording needs the founder's Chrome). The 19 UK Amazon Fresh stores' closure was announced 23 Sep 2025. Same-day fresh delivery in selected London postcodes since June 2026. Amazon's grocery postcode checker also lists Co-op, Morrisons, Iceland and Gopuff | Per postcode/slot | Postcode/address; Prime affects only the fee | **Creators API** (replaced PA-API 5.0 in 2026): has availability fields, but needs 10 qualifying sales in 30 days; no evidence it covers Fresh; Associates help says "Supermarkets on Amazon" items aren't reachable through the API (snippet) | Not a block, but robots.txt names ClaudeBot, Claude-User and Claude-SearchBot with "Disallow: /", and disallows `/dp/product-availability/` for everyone | "any use of data mining, robots, or similar data gathering and extraction tools" (Conditions of Use, snippet) | AZ1–AZ7 |
| **Home Bargains** | Website moved to home.bargains: "OUT OF STOCK" and "Notify me" on product pages (online stock only). Page data carries `homeDelivery`, `clickCollect` and `inStore` flags; click and collect and in store were `"enabled":false` on the home page we saw. Help: "Click+Collect service has been temporarily removed"; in-store stock: contact the local shop (snippets) | **National** online stock; no per-store stock | No | **None** | No (home.bargains robots.txt disallows only checkout, basket, account); the help site answered 403 | Not captured (the terms sit on the help site, which refused) | HB1–HB4 |
| **B&M** | None. Products are "not available to purchase through our Website / App" (terms); the app has a price checker, store finder and lists; a developer reply reportedly says there is no store stock facility. Home delivery trial June 2022 to early 2023 | — | — | **None** | **Yes** (CloudFront "Request blocked") | "any text or data mining or web scraping" (terms of use, snippet) | BM1–BM4 |

### Notes that matter for the design

- **Sainsbury's is the one shop with a per-store stock page anyone can open in a browser**, and it is also the only shop whose labels and prices Numbite's recipes already use. Its four labels are Sainsbury's own words; Numbite would never repeat them as its own.
- **Tesco's per-store stock is app-only.** Whether a link can open the Tesco app on a product's Stock Check is unknown (needs the founder's phone).
- **M&S food pages ask for a store**, so a link to an M&S product page should let the person see their own store's stock there. The page data's `stockLevelIndicator` is empty until a store is chosen. The same M&S terms sentence quoted above also lists linking and deep-linking among the things needing M&S's consent. Numbite already deep-links M&S product pages under the founder's accepted risk of 2026-10-16, so this adds nothing new.
- **Morrisons and Aldi say plainly that they can't tell you** ("unable to advise on specific stock levels", "just an estimate"). For them, a "check stock" button would promise more than the shop itself does.
- **"Online out of stock" is not "not on the shelf".** Sainsbury's own help says "Each store has its own range" and that "your local store isn't the delivery store for your area". A shopper on MoneySavingExpert reports Asda's site saying out of stock while the shelf had it (anecdotal).
- **Even the shops don't promise:** Deliveroo's interface documentation says a listing "does not guarantee the item's availability or stock status in the store". Shoppers on HotUKDeals treat Tesco's app stock checks as unreliable for confirming deals.
- **The repo already links every list product to its shop's own page** (`web/lib/mm/shopProducts.ts` `shopPageUrl`, pageBase per shop):
  - Product pages: Sainsbury's, Tesco, Aldi, Lidl, Iceland, M&S everyday range.
  - The shop's own search for the name: Asda, Morrisons, Waitrose, the 194 priced M&S rows.

  Approach D reuses these links.

## The five approaches compared

| | A. Numbite fetches stock itself | B. Official API or licensed feed | C. Licensed third-party provider | D. "Check stock at {shop}" links | E. "Everyday ingredients" label |
|---|---|---|---|---|---|
| **What it can honestly promise** | Nothing reliable. Tesco, Sainsbury's, Asda, Waitrose, Ocado, B&M and Co-op's shop block automated requests. The per-store pages need a chosen store or slot in a session. The result would be a snapshot at best | Nothing today: no retailer offers stock to outside apps. Affiliate feeds carry at most a national online "in stock" flag | Online availability for a postcode, per retailer, at the refresh time the vendor sells. Not shelf stock in a named store, except where a vendor claims it | "Opens {shop}'s own page, where you can check your store." The stock is the shop's word, seen live by the person | "We chose ingredients most small shops usually sell." A design fact (84 everyday kinds, a judgement), not a stock claim |
| **Legal and terms risk** | High. Tesco, Aldi, B&M and Amazon forbid automated data collection; M&S forbids crawling; Asda's terms are unreadable to us; database right in the data. Against CLAUDE.md's "never work round a block" | Low if a route existed; contracts would set display rules (Iceland's affiliate profile already restricts linking and stale prices) | Medium to high. The data is almost certainly collected by scraping, so the shops' terms risk passes to us. Consumer display is usually not licensed. Google sued SerpApi in Dec 2025 | Low. Ordinary links to public pages; the person does the checking. M&S's "deep-link" clause is already the founder's accepted risk | None |
| **Privacy (rule 4)** | Poor from our server: each check sends a store id and so reveals where the person shops. From the phone, the same automated access happens under the person's own internet address, which is worse for them and still breaks the terms | Depends on the contract. A store id (never a location) would have to reach the partner, and only when the person taps | As B, plus a vendor sees which stores our users check | Good: Numbite sends nothing. The person's own browser opens the shop's page, exactly as if they had gone there themselves | Good: nothing leaves the phone |
| **Cost** | Server time plus constant repairs | Free if offered; a partnership costs the founder's time | Enterprise contracts (no public prices; brand-facing) or per-request scraping fees ($25 for 1,000 searches at SerpApi; "from $5.00 / 1,000" results on an Apify Tesco scraper) | None | None |
| **Effort** | Weeks per shop, forever | Weeks to months of talks, outside our control | Weeks of talks and integration | About 1 day | Under a day (with D) |
| **How often it breaks** | Constantly (bot rules, page changes, sessions) | Rarely | When the vendor's own collection breaks | Only if a shop changes its page addresses (checkable by a monthly link test) | Never |

**Recommendation: D plus E now; a phone-only store picker later if wanted; B through a partner only if someone says yes.** A and C are ruled out by the project's own rules (robots.txt and blocks honoured, never worked round; location stays on the device) and by the shops' terms.

## Recommended design

### First version: "check it at the shop" (about 1 day)

Where:
- the recipe page's Ingredients tab, under the shop line;
- the Shopping list, one per shop card;
- each product row that already has its "Open it on {shop}'s website" link.

What changes:
1. **One button per shop card or recipe**, worded by what the shop actually offers:
   - **Sainsbury's:** "Check your local Sainsbury's". It opens Sainsbury's Store Stock Checker (`https://stockchecker.sainsburys.co.uk/`), where the person picks their store and searches the product. Under it: "Opens Sainsbury's own stock checker. Stock changes during the day."
   - **Tesco:** "Check in the Tesco app". It opens the product's Tesco page, which on a phone with the app installed may open the app (unverified). Under it: "Tesco shows stock for your local store in its app (Stock Check)."
   - **M&S:** "Check at your M&S". It opens the product's own M&S page, which offers "Select your store".
   - **Asda, Waitrose, Iceland:** "Check on {shop}'s website". It opens the product page or the shop's search. Under it: "{shop} shows what it can deliver to your postcode, which may differ from the shelves in your local shop."
   - **Morrisons:** the existing "Open it on Morrisons' website" link only, with: "Morrisons shows what it can deliver to your postcode. It says it can't tell you what's on the shelves in a store."
   - **Lidl:** no button. Show Lidl's own words already read from its product page ("Available in store now", "In store from 15.10"), credited as "Lidl's website says" with the date read. These are national, so no store is named. If the founder's phone shows the Lidl Plus reservation function working in GB, add: "The Lidl Plus app can show what your selected store has."
   - **Aldi:** no button. The existing product link, with: "Aldi says the availability on its website is just an estimate."
   - **Co-op:** "Check on Co-op's website" (Co-op delivers from a local store), plus the same postcode sentence.
   - **Shops with nothing to check** (Farmfoods, B&M, Spar, Nisa, Costcutter, Londis, Budgens, Booths): no button. The recipes don't use them today.
2. **One sentence, always shown with the buttons:** "We can't see any shop's shelves, so we can't tell you what's in stock today. These links open the shop's own page so you can check before you go."
3. **"Everyday ingredients" (E)**, on recipes where every kind is in `EVERYDAY_KINDS` (all 108 non-Christmas recipes). A small label "Everyday ingredients" with: "Chosen so that most small supermarkets usually have them. Shops differ, so check before a special trip." Christmas recipes, which use festive kinds, don't get the label.

Rules for the wording:
- Never "in stock", "available near you" or "guaranteed" in our own voice.
- Never a store name we didn't get from the person.
- No good/bad words.
- Every new sentence is new copy for the founder to approve (rule 8).

Privacy: Numbite sends nothing new. The privacy page's existing sentence about links opening a shop's website covers it; check the wording once.

### Second version, after checks in the founder's Chrome (3 to 5 days)

- **A phone-only store picker,** only if the checks show a shop's page accepts a store in its address.
  - The store list comes bundled with the app: Geolytix Supermarket Retail Points (free, "unrestricted use", credit appreciated), cross-checked against OpenStreetMap (ODbL) or the FSA's food hygiene open data. It is searched on the phone by town name.
  - Nothing is sent anywhere. The chosen store is kept on the phone like `mm.v1.mapArea`, cleared by "Clear data" and never synced.
  - The link would then open the shop's page for that store. If no shop accepts a store in the address, skip this: the shops' own sites already remember their own store choice.
- **A deep link into the Sainsbury's checker with the product filled in**, if its address accepts one.

### Only with a partner's permission (weeks to months, not in Numbite's control)

- **Snappy Shopper's per-shop availability** (fed by each shop's till) is the only network found that holds live per-shop stock for thousands of convenience shops. Its interface only takes data in today, so it would need a written agreement.
- **A Sainsbury's partnership** would suit the recipes best, since every recipe is built from Sainsbury's products.
- How it would work:
  - The phone sends only the chosen store's id, never a location, and only when the person taps "Check stock".
  - The screen names the source and the time: "Sainsbury's said 'In Stock' at Leeds Moortown, checked 10:42. Stock changes during the day."

## What the founder must decide

1. Is "open the shop's own stock page" enough? No permitted route gives Numbite live per-store stock today, and none is likely soon.
2. Should Claude draft a short permission request to Sainsbury's (and Snappy Shopper) for read access to store availability?
3. Approve the new wording above, or ask for changes (rule 8).
4. Is a phone-only store picker wanted at all (the second version)? It only helps if a shop's page accepts a store in its address.

## Checks for the founder's Chrome (the desktop session can run these)

Signed in where the shop asks. Use the founder's own store or postcode. Read only; copy the exact wording.

1. Sainsbury's Store Stock Checker:
   - Does its address change when a store and product are chosen (so a link could carry them)?
   - Which product id does it use?
   - Copy the result screen's exact wording.
2. Tesco app Stock Check: the exact labels, whether sign-in is needed, and whether a tesco.com product link opens the app on that product.
3. M&S food page after "Select your store": the exact wording, and whether the choice is remembered on the next product link.
4. Waitrose app "In-store Mode": is it live, and what are the labels? On waitrose.com, what separates "Temporarily unavailable" from "Sold out online"?
5. Asda, Morrisons, Iceland, Ocado, Co-op online: the out-of-stock wording with a postcode set, and whether a product link remembers the postcode when not signed in.
6. One Snappy Shopper shop and one Deliveroo convenience shop: are unavailable items shown as sold out, or hidden? (Deliveroo's documentation says "sold out", greyed out and struck through.)
7. The Lidl Plus app: is the "reservation function" live in GB, which products does it cover, and what does it say?
8. Aldi Specialbuy pages: do they ever say "sold out"?
9. Booths: is it still on Deliveroo, and does the Food to Order site show stock per product?

## Not verified, and why

- **The Co-op online shop's wording:** the shop refuses automated access. Needs the founder's Chrome.
- **Morrisons' help wording:** its help pages answered 404, so the quotes come from search snippets.
- **When Aldi ended click and collect, and whether Booths and Lidl are on delivery apps today:** no information found (search allowance ran out).
- **Iceland, M&S and Co-op affiliate programmes:** not checked (search allowance ran out).
- **The Lidl Plus reservation function in GB:** stated in Lidl's terms, which may be a pan-European template. Needs the founder's phone.
- **Every label behind a chosen store, postcode or slot** (Tesco, Sainsbury's, Asda, Waitrose, Ocado, M&S, Iceland, Morrisons, Co-op, Amazon): refused automated access or needs a chosen store. Needs the founder's Chrome.
- **Tesco Labs' exact closing date:** its host doesn't resolve from here; only community notes and a cached snippet were seen.
- **Affiliate feed fields** (Iceland on Awin, Ocado on CJ, Morrisons on Tradedoubler): need a logged-in publisher account.
- **Amazon:** none of Amazon's own pages was opened (its robots.txt names Claude's agents with "Disallow: /"); everything comes from search snippets and outside reports.
- **Paid data vendors:** coverage, price and collection method need a sales call.
- **Spar's site-wide terms and Home Bargains' terms:** both refused automated access.

## Sources

Own checks, 16 November 2026 (one robots.txt request each, curl default user agent):
- R1 https://www.tesco.com/robots.txt (403 Akamai "Access Denied")
- R2 https://www.sainsburys.co.uk/robots.txt (403 Akamai)
- R3 https://www.asda.com/robots.txt (403 Cloudflare "Attention Required!")
- R4 https://groceries.morrisons.com/robots.txt
- R5 https://www.waitrose.com/robots.txt (connection dropped)
- R6 https://www.aldi.co.uk/robots.txt
- R7 https://www.lidl.co.uk/robots.txt
- R8 https://www.coop.co.uk/robots.txt and https://shop.coop.co.uk/robots.txt (403 Imperva)
- R9 https://www.marksandspencer.com/robots.txt
- R10 https://www.iceland.co.uk/robots.txt
- R11 https://www.ocado.com/robots.txt (202, empty: AWS WAF challenge)
- R12 https://www.booths.co.uk/robots.txt
- R13 https://www.spar.co.uk/robots.txt
- R14 https://www.nisalocally.co.uk/robots.txt
- R15 https://www.costcutter.co.uk/robots.txt
- R16 https://www.londis.co.uk/robots.txt and https://www.budgens.co.uk/robots.txt
- R17 https://www.farmfoods.co.uk/robots.txt (404)
- R18 https://www.amazon.co.uk/robots.txt
- R19 https://www.homebargains.co.uk/robots.txt (redirects to https://home.bargains/), https://home.bargains/robots.txt
- R20 https://www.bmstores.co.uk/robots.txt (403 CloudFront)

Earlier reads kept in this repo (founder's Chrome, signed out, October 2026):
- E1 `data/groceries/listing/raw/tesco_terms.txt`
- E2 `data/groceries/listing/raw/pilot_listing.txt` (Sainsbury's "Currently out of stock"), `sainsburys_terms.txt`
- E3 `asda_listing.txt`, `asda_terms.txt`
- E4 `iceland_coverage.txt`, `iceland_terms.txt`
- E5 `marks-and-spencer_coverage.txt`, `marks-and-spencer_progress.txt`, `marks-and-spencer_terms.txt`
- E6 `lidl_pages.jsonl`, `lidl_range_summary.txt`, `lidl_terms.txt`
- E7 `aldi_terms.txt`, `morrisons_terms.txt`, `waitrose_terms.txt`, `waitrose_listing.txt`, `coop_terms.txt`
- E8 `docs/IMAGE_TERMS.md`, `web/lib/mm/shopProducts.ts`, `web/public/groceries/all/*.json` (page link patterns), `web/lib/mm/pantry.ts` (`EVERYDAY_KINDS`)

Tesco:
- T1 https://www.tesco.com/help/articles/10865938729497-Availability-of-products (snippet)
- T2 https://apps.apple.com/gb/app/id389581236 (snippet)
- T3 https://www.tesco.com/store-locator/tavistock/tesco (snippet)
- T4 https://www.hotukdeals.com/discussions/tesco-online-store-checker-3845384 (snippet)
- T5 https://help.hotukdeals.com/help/offlineinstore-deals-without-store-confirmation-being-moved-to-discussions (snippet)
- T6 https://retailtechinnovationhub.com/home/2025/10/26/tesco-adds-new-feature-to-scan-as-you-shop-solution-as-retailers-store-shopping-trip-evolves
- T7 https://www.tesco.com/groceries/en-GB/products/312559265 (snippet)
- T8 https://www.tesco.com/help/pages/online-grocery-faqs/whoosh/about-tesco-whoosh (snippet)
- T9 https://retail-systems.com/rs/Tesco_Launches_On_Uber_Eats_And_Deliveroo_To_Expand_Rapid_Grocery_Delivery.php
- T10 https://www.spscommerce.com/community/articles/tesco-uber-eats-and-deliveroo-what-every-tesco-supplier-needs-to-know
- T11 https://github.com/ImClarky/tesco-api-node, https://github.com/ImClarky/tesco-api-php, https://security.snyk.io/package/npm/tesco-store-location-sdk
- T12 https://devportal.tescolabs.com/ (snippet; does not resolve from here)
- T13 https://dunnhumby.com/tesco-media-insight-platform/, https://www.dunnhumby.com/wp-content/uploads/2025/10/TM_IP_Planogram_Publisher_One_Pager.pdf

Sainsbury's:
- S1 https://help.sainsburys.co.uk/help/ordering/store-stock-checker (read)
- S2 https://help.sainsburys.co.uk/help/products/in-stock
- S3 https://help.sainsburys.co.uk/help/products/in-store-not-online
- S4 https://stockchecker.sainsburys.co.uk/ (403 to a fetch)
- S5 https://help.sainsburys.co.uk/help/terms-and-conditions/Substitution-promise-T-Cs (snippet)
- S6 https://www.retailgazette.co.uk/blog/2026/10/sainsburys-launches-ai-powered-shopping-lists-in-app-overhaul/
- S7 https://retailtechinnovationhub.com/home/2026/2/5/sainsburys-drops-chop-chop-as-uk-grocery-giant-bins-tesco-whoosh-rapid-delivery-rival
- S8 https://www.nectar360.co.uk/what-we-do/data-and-insights/sainsburys-insights-platform/
- S9 https://www.thegrocer.co.uk/analysis-and-features/sainsburys-forecast-data-fees-shades-of-tescos-fulfilment-fee-fiasco/691920.article (snippet)
- S10 https://affi.io/m/sainsburys-grocery-retired, https://linkclicky.com/affiliate-program/sainsburys-online/

Asda:
- A1 https://www.asda.com/groceries/product/stock/cook-by-asda-beef-stock-450g/5964762 (snippet)
- A2 https://apps.apple.com/gb/app/asda/id396089960 (snippet)
- A3 https://www.grocerygazette.co.uk/2026/04/16/asda-deliverect-partner-to-enhance-rapid-delivery/
- A4 https://corporate.asda.com/newsroom/2026/29/05/asda-partners-with-ocado-group-to-enhance-online-grocery-service (snippet)
- A5 https://www.retailgazette.co.uk/blog/2025/08/asda-project-future/
- A6 https://forums.moneysavingexpert.com/discussion/6268605/changing-online-weekly-shopping (snippet)
- A7 https://www.revshare.so/programs/advertiser/asda

Morrisons:
- M1 E7 (`morrisons_terms.txt`)
- M2 https://directory.tradedoubler.com/en/programs/246156-Morrisons-Grocery
- M3 https://www.flexoffers.com/affiliate-programs/morrisons-grocery-affiliate-program
- M4 https://www.logisticsit.com/articles/2020/03/17/atheon-analytics-to-supply-skutrak-platform-to-morrisons-so-it-can-provide-operational-data-to-suppliers (2020)
- M5 https://www.cmo.com.au/article/565563/how-uk-based-morrisons-used-apis-build-its-customer-loyalty-program/
- M6 https://www.morrisons.com/help/products/product-availability--pricing (snippet; 404 when fetched)
- M7 https://morrisons.com/help/morrisons-more/product-finder (snippet), https://www.grocerygazette.co.uk/2026/10/15/morrisons-upgrades-app-with-new-features/
- M8 https://retailtechinnovationhub.com/home/2020/3/13/atheon-analytics-supplies-skutrak-platform-to-morrisons, https://trademagazin.hu/en/uj-technologia-forradalmasithatja-a-kenyelmi-boltok-hazhoz-szallitasat-az-egyesult-kiralysagban (NearSt, 2025)
- M9 https://www.morrisons-corporate.com/media-centre/corporate-news/morrisons-and-deliveroo-join-up-to-offer-grocery-home-delivery/, https://retailtimes.co.uk/?p=170940

Waitrose:
- W1 https://www.waitrose.com/ecom/products/waitrose-baby-romanesco/085253-43339-43340 (snippet)
- W2 https://www.thegrocer.co.uk/news/waitrose-upgrades-app-with-in-store-mode-to-boost-shopping-experience/708396.article (snippet)
- W3 https://www.thegrocer.co.uk/news/waitrose-expands-ai-assistant-app-pilot-to-more-stores/722416.article (snippet)
- W4 https://www.grocerygazette.co.uk/2021/05/11/waitrose-rapid-deliveroo/ (snippet)
- W5 https://www.grocerygazette.co.uk/2023/07/11/waitrose-uber-eats-delivery/ (snippet)
- W6 https://www.waitrose.com/ecom/help-information/customer-service/waitrose-and-deliveroo (snippet)
- W7 https://www.affilitizer.com/programs/waitrosecellar.com, https://Waitrosecellar.com/affiliates (snippet)

Aldi:
- AL1 E7 (`aldi_terms.txt`)
- AL2 R6
- AL3 `data/groceries/listing/raw/aldi_sitemap_products.xml`
- AL4 https://www.aldi.co.uk/product/barissimo-lungo-coffee-pods-000000000000550236 (fetched), https://www.aldi.co.uk/corporate/terms-and-conditions
- AL5 https://www.grocerygazette.co.uk/?p=25947 (Deliveroo ended Jan 2022)

Lidl:
- L1 E6
- L2 R7
- L3 https://www.lidl.co.uk/c/legal-information/s10022935 (read 2026-10-08)
- L4 https://www.lidl.co.uk/c/lidl-plus-terms-of-use/s10025414 (Lidl Plus terms v2.2, section 6)
- L5 https://www.lidl.co.uk/c/privacy-legal/s10023373 (the "API Access Request" form, for charging data)

Co-op:
- C1 E7 (`coop_terms.txt`)
- C2 R8
- C3 https://digitalblog.coop.co.uk/2017/03/27/were-opening-up-data-to-meet-customer-needs/
- C4 https://www.aboutamazon.co.uk/news/retail/amazon-expands-iceland-grocery-partnership-nationwide, https://retailtimes.co.uk/?p=170940 (Amazon's grocery postcode checker naming Co-op, Morrisons, Iceland; as reported)
- C5 https://www.coop.co.uk/ways-to-shop, https://www.coop.co.uk/terms/website-terms (fetched)
- C6 https://www.co-operative.coop/media/news-releases/co-op-and-uber-eats-announce-new-three-year-partnership-renewal-including, https://www.co-operative.coop/media/news-releases/co-op-and-snappy-shopper-launch-northern-ireland-trial-offering-quick-and
- C7 https://retailtechinnovationhub.com/home/2026/4/5/snappy-technologies-develops-order-aggregation-solution-with-southern-co-op-and-heart-of-england-co-operative

M&S:
- MS1 E5, `data/groceries/listing/raw/marks-and-spencer-food_categories.txt` (`stockLevelIndicator` null on 2,011 tiles)
- MS2 R9
- MS3 https://blog.ocado.com/how-ocado-works/ms-your-questions-answered/
- MS4 https://www.marksandspencer.com/food/breaded-chicken-nuggets/p/fdp60854729 (fetched)
- MS5 https://www.marksandspencer.com/c/help/food (fetched)

Iceland:
- I1 E4
- I2 R10
- I3 https://ui.awin.com/merchant-profile/7868
- I4 C4
- I5 https://iceland.co.uk/help (snippet), https://www.retailgazette.co.uk/blog/2026/10/iceland-rolls-out-rapid-grocery-delivery-to-200-stores-ahead-of-christmas/
- I6 https://www.a1retailmagazine.com/?p=51103 (Deliveroo, Sep 2024)

Ocado:
- O1 https://blog.ocado.com/how-ocado-works/ms-your-questions-answered/ (2020)
- O2 https://help.ocado.com/hc/en-us/articles/15885593830428-Why-are-some-of-the-Christmas-items-out-of-stock (snippet)
- O3 https://zoom.ocado.com/ocado-british-cauliflower-65350011, https://zoom.ocado.com/content/help-and-support/faq.html (snippets)
- O4 https://www.ocado.com/content/ocado-affiliate-programme-39129 (snippet), https://affi.io/m/ocado
- O5 https://retailtechinnovationhub.com/home/2026/4/7/ocado-ramps-up-quick-commerce-push-as-it-starts-rolling-out-same-day-delivery-slots-in-uk (snippet)

Booths:
- B1 R12
- B2 https://orders.booths.co.uk/faqs (fetched), https://www.booths.co.uk/website-terms/
- B3 https://www.retailgazette.co.uk/blog/2020/04/coronavirus-prompts-booths-to-launch-click-and-collect-service/ (2020)

Spar:
- SP1 https://thegrocer.co.uk/news/spar-uk-strikes-nationwide-deal-with-deliveroo/668715.article
- SP2 https://theretailbulletin.com/food-and-drink/spar-uk-launches-rapid-delivery-partnership-with-deliveroo-24-06-2022
- SP3 https://scottishgrocer.co.uk/2026/07/09/spar-launches-new-home-delivery-platform-spar-dash/, https://www.thegrocer.co.uk/news/cj-lang-launches-spar-dash-delivery-service-in-snappy-shopper-tie-up/721224.article
- SP4 https://www.thembsgroup.co.uk/external/af-blakemore-launches-spar-delivered-home-delivery-platform-powered-by-snappy-shopper/
- SP5 https://www.spar.co.uk/store-locator/hal30391-spar-doncaster-road-wakefield, https://www.spar.co.uk/news-updates/more-manufacturing-fresh-food-and-on-the-go-options-are-key-takeaways-from-spar-forward/
- SP6 https://www.spar.co.uk/spar-rewards/terms-of-use-and-membership/ (snippet)

Nisa:
- N1 https://www.nisalocally.co.uk/
- N2 https://www.nisalocally.co.uk/corporate/corporate-social-responsibility/terms-conditions/
- N3 https://newsroom.justeattakeaway.com/en-GB/228134-just-eat-partners-with-nisa-to-provide-further-online-delivery-opportunities/
- N4 https://www.grocerygazette.co.uk/2021/12/10/nisa-reaches-5m-sales-through-snappy-shopper-deliveries/, https://betterretailing.com/exclusive-nisa-launches-home-delivery-platform, https://www.grocerygazette.co.uk/2021/05/17/nisa-retail-announces-jisp-partnership/

Costcutter:
- CC1 https://www.costcutter.co.uk/
- CC2 https://www.bestwaygroup.co.uk/bestway-news/bestway-wholesale-acquires-costcutter-supermarkets-group-csg, https://neighbourhoodretailer.com/bestway-extends-co-op-supply-deal-for-costcutter-retailers/
- CC3 https://retailers.snappyshopper.co.uk/costcutter, https://www.retailgazette.co.uk/blog/2019/10/costcutter-bags-delivery-deal-uber-eats/
- CC4 https://ubereats.com/gb/brand/costcutter, https://deliveroo.co.uk/menu/london/ware/costcutter-ware-20a-amwell-end

Londis and Budgens:
- LB1 https://www.londis.co.uk/, https://www.londis.co.uk/index.php/terms
- LB2 https://www.budgens.co.uk/, https://www.budgens.co.uk/terms
- LB3 https://www.thegrocer.co.uk/news/booker-launches-rapid-delivery-service-for-symbol-retailers/700873.article, https://www.conveniencestore.co.uk/news/scoot-app-celebrates-its-first-year-with-300-store-launches/714740.article, https://www.slrmag.co.uk/scoot-just-eat-booker-grocery-delivery/
- LB4 https://slrmag.co.uk/booker-retailers-to-grow-deliveries-with-snappy-partnership, https://theretailbulletin.com/food-and-drink/just-eat-to-begin-deliveries-to-londis-premier-budgens-and-family-shopper-customers-02-09-2022

Farmfoods:
- F1 https://www.farmfoods.co.uk/, https://www.thevirtualmall.co.uk/shops/farmfoods

Amazon (none of Amazon's own pages was opened):
- AZ1 R18
- AZ2 https://www.grocerygazette.co.uk/2025/09/23/amazon-fresh-close-14-stores/, https://www.timeout.com/london/news/amazon-fresh-is-closing-all-all-uk-stores-full-list-of-19-closures-092425
- AZ3 https://www.retailgazette.co.uk/blog/2026/06/amazon-expands-same-day-fresh-grocery-delivery-after-fresh-store-closures/
- AZ4 https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction, https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation, https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/offersV2, https://webservices.amazon.com/paapi5/documentation/offersV2.html (snippets)
- AZ5 https://affiliate-program.amazon.co.uk/help/node/topic/GQTUCVG278RW8XYD (snippet)
- AZ6 https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek, https://pricechecker2.atlassian.net/wiki/spaces/PC2/pages/1656881153, https://conductatlas.com/platform/amazon-associates/amazon-associates-program-policies/provision/CA-P-064551/license-excludes-data-mining-and-robots/
- AZ7 Conditions of Use clause as shown in search results (copy at https://digprjsurvey.amazon.co.uk/csad/help/node/GLSBYFE9MGKKQXXM, snippet)

Home Bargains:
- HB1 R19 (the home page answered the robots.txt redirect; its page data holds the fulfilment flags)
- HB2 https://home.bargains/product/001d6b6f-c3cb-42cf-8c3b-245ab276bba4/giant-surprise-filled-egg, https://home.bargains/product/ff51e317-c49e-4bd9-aadd-60c96797104a/walnut-whip-milk-chocolate-30g-multipack-of-6
- HB3 https://help.homebargains.co.uk/hc/en-gb/articles/360000257498-Can-I-order-items-for-Click-Collect-for-delivery-to-a-store (snippet)
- HB4 https://help.homebargains.co.uk/hc/en-gb/articles/360001382917-Is-this-item-in-stock-in-my-local-store, https://help.homebargains.co.uk/hc/en-gb/articles/200130446-Why-can-t-I-find-your-full-stock-range-online (snippets)

B&M:
- BM1 https://www.bmstores.co.uk/terms-of-use (snippet)
- BM2 https://www.retail-week.com/value/exclusive-bandm-pulls-the-plug-on-ecommerce-home-deliveries/7043549.article, https://www.retailgazette.co.uk/blog/2023/04/bm-scraps-online-home-deliveries/
- BM3 https://www.retailgazette.co.uk/blog/2022/06/bm-finally-launches-online-home-delivery-service/
- BM4 https://apps.apple.com/gb/app/b-m-stores/id1259809378 (snippet)

Delivery apps (for every row that mentions them):
- D1 https://developers.snappyshopper.co.uk/, https://developers.snappyshopper.co.uk/how-it-works, https://developers.snappyshopper.co.uk/api-updates/update-product-availability--added-status-override, https://developers.snappyshopper.co.uk/certification-tests, https://retailers.snappyshopper.co.uk/become-a-partner
- D2 https://www.onestop.co.uk/wp-content/uploads/Snappy-Shopper-FAQs.pdf
- D3 https://api-docs.deliveroo.com/v2.0/docs/introduction, https://api-docs.deliveroo.com/docs/catalogue-api-overview, https://api-docs.deliveroo.com/docs/catalogue-api-integration, https://api-docs.deliveroo.com/docs/getunavailabilities
- D4 https://developer.uber.com/docs/eats/introduction, https://developer.uber.com/docs/eats/guides/getting-started
- D5 https://jentic.com/apis/just-eat.co.uk/just-eat-main, https://help.deliverect.com/en/articles/7979364-just-eat-integration-overview
- D6 https://foodmanufacture.co.uk/Article/2024/04/29/Getir-and-Gorillas-exiting-UK-with-1-500-jobs-at-risk

Feeds, Google, data vendors, law and store lists:
- G1 Awin feeds: https://developer.awin.com/docs/enhanced-feeds-prod-spec, https://cdn.document360.io/ec9ead62-8ecc-46ef-aac7-9b0a9081b40b/Images/Documentation/PM-FeedColumnDescriptions(1).pdf
- G2 Google local inventory: https://support.google.com/merchants/answer/14615117, https://support.google.com/merchants/answer/14869424, https://developers.google.com/merchant/api/guides/inventories/overview, https://developers.google.com/merchant/api/reference/rest/inventories_v1/accounts.products.localInventories, https://developers.google.com/merchant/api/guides/local-feeds-partnership/overview, https://support.google.com/business/answer/13738543
- G3 https://retailtechinnovationhub.com/home/2021/3/31/tesco-tests-out-google-local-inventory-ads-feature (2021)
- G4 https://policies.google.com/terms?hl=en-GB&gl=GB, https://serpapi.com/nearby-results, https://serpapi.com/pricing, https://ipwatchdog.com/2025/12/26/google-sues-serpapi-parasitic-scraping-circumvention-protection-measures/, https://www.seroundtable.com/google-sues-serpapi-40631.html
- G5 Profitero: https://www.marketingdive.com/news/publicis-acquires-profitero-analytics-commerce/623306/, https://www.profitero.com/lp/profitero-circana, https://profitero.com/blog/panic-buying-in-the-u.k.-drives-out-of-stock-rates-higher (2021)
- G6 Edge / Flywheel: https://prnewswire.com/news-releases/edge-by-ascential-expands-ecommerce-features-to-optimize-digital-shelf-performance-300836349.html (2019), https://www.verdict.co.uk/ascential-to-sell-commerce-consumer-units-for-1-7bn/
- G7 https://nielseniq.com/global/en/insights/analysis/2024/data-impact-by-nielseniq-and-unilever-announce-continued-strategic-partnership-in-ecommerce-digital-shelf-analytics/, https://dataweave.com/blog/why-localized-store-specific-pricing-and-availability-insights-is-critical-for-consumer-brands
- G8 https://apify.com/studio-amba/tesco-scraper, https://brightdata.com/products/datasets/sainsburys
- G9 https://trolley.co.uk/grocery-price-index, https://acuitypricing.com/about, https://allsupers.co.uk/about-us, https://thegrocer.co.uk/the-grocer-33/the-grocer-33-links-up-with-new-technology-provider-assosia/655930.article
- G10 Law (background only, not legal advice): https://www.legislation.gov.uk/uksi/1997/3032/note, https://swanturton.com/database-protection-narrowed-british-horseracing-board-v-william-hill/, https://www.bristows.com/viewpoint/articles/linkedins-efforts-to-stop-the-bots, https://www.rocketlawyer.com/gb/en/blog/to-scrape-or-not-to-scrape
- G11 Open data: https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1172288/Open_Letter_to_grocery_retailers_on_the_use_of_unit_pricing.pdf, https://www.mishcon.com/news/uk-retail-pricing-key-changes-to-the-price-marking-order-delayed-until-april-2026, https://www.gov.uk/guidance/access-fuel-price-data, https://thelens.slaughterandmay.com/post/102mqja/5-things-you-need-to-know-from-the-uks-new-smart-data-strategy (no UK open-data scheme for grocery stock exists; the fuel scheme went live 2 Feb 2026)
- G12 Store lists: https://geolytix.com/blog/supermarket-retail-points/, https://www.arcgis.com/home/item.html?id=59cbf86fc1f34421b6bd2cc92f9b711a, https://wiki.openstreetmap.org/wiki/Open_Data_License/Use_Cases, https://osmfoundation.org/wiki/Attribution, https://ratings.food.gov.uk/open-data/, https://overturemaps.org/about/faq/
