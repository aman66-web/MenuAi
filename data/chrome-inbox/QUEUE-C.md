# Chrome queue C (priority: food and drink chains our server cannot reach)

Same rules as QUEUE.md and docs/CHROME_TO_APP.md (Batch mode). Use this file in a THIRD session, or after queue A or B is finished.
For each chain: open its own site, find out whether it shows calories or nutrition per dish (a menu page, a nutrition page, a PDF or an
ordering app), and if it does, write `data/chrome-inbox/<chain-id>/meta.json` + `items.csv` and tick the line. If it shows allergens only,
per 100 g only, fewer than 3 UK sites, a closed site, or its robots.txt forbids the page: write the reason on the line and go on.
Many of these sites were unreadable for our scripts, so nobody knows yet whether they publish nutrition: "no data" is a normal answer.

- [ ] honest-burgers | Honest Burgers | https://www.honestburgers.co.uk/allergy-information/ | blocked from our server: HTML page and PDFs (not opened)
- [ ] shake-shack | Shake Shack | https://shakeshack.co.uk/ | blocked from our server: unknown (site not readable)
- [ ] tonkotsu | Tonkotsu | https://tonkotsu.co.uk/wp-content/uploads/2025/11/Tonkotsu-Nutritional-Information.pdf | blocked from our server: PDF (not opened; known only from a search-engine listing)
- [ ] busaba | Busaba | https://www.busaba.com/allergens | blocked from our server: unknown (menu PDFs plus an allergens page; not opened)
- [ ] krispy-kreme | Krispy Kreme | https://www.krispykreme.co.uk/nutritionals | blocked from our server: HTML page (not readable here)
- [ ] joe-and-the-juice | Joe & The Juice | https://www.joejuice.com/ | blocked from our server: n/a (not read)
- [ ] ben-and-jerrys | Ben & Jerry's | https://www.benjerry.co.uk/scoop-shops/menu | blocked from our server: unknown (HTML product pages)
- [ ] millies-cookies | Millie's Cookies | https://www.milliescookies.com/giant-cookies/plain-giant-cookie | blocked from our server: unknown (HTML product pages)
- [ ] west-cornwall-pasty-co | West Cornwall Pasty Co. | https://westcornwallpasty.co.uk/products/ | blocked from our server: unknown (HTML product pages)
- [ ] crussh | Crussh | https://crussh.com/ | blocked from our server: HTML (site currently down)
- [ ] wok-to-walk | Wok to Walk | https://www.woktowalk.com/uk/ | blocked from our server: unknown (SiteGround captcha / 403)
- [ ] bubbleology | Bubbleology | https://bubbleology.co.uk/drinks/ | blocked from our server: unknown (allergen booklet, per web search result)
- [ ] cinnabon | Cinnabon | https://www.cinnabon.co.uk/ | blocked from our server: unknown
- [ ] brewhouse-and-kitchen | Brewhouse & Kitchen | https://cdn.prod.website-files.com/69fc8888bc4a8228cb790cfd/6a72028c8e8f2b17788ba3c6_brewhouse_kitchen_core_menu_allergen_matrix_2026_08_04.pdf | blocked from our server: PDF with text layer (1 page A4, exported from Google Sheets)
- [ ] byron | Byron | https://www.byron.co.uk/_files/ugd/55efb4_2d4da94f87cd4a4aa1f34e67c89dd2b8.pdf | blocked from our server: web app (harlo.app, JavaScript-only) + sample menu PDF
- [ ] the-alchemist | The Alchemist | https://thealchemistbars.com/ | blocked from our server: official site Cloudflare-challenged (403 'Attention Required'); menus 
- [ ] iro-sushi | IRO Sushi | https://irosushi.com/ | blocked from our server: unknown (site behind Cloudflare 'Attention Required' challenge)
- [ ] zia-lucia | Zia Lucia | https://zialucia.com/ | blocked from our server: unknown (site behind SiteGround captcha challenge)
- [ ] maki-and-ramen | Maki & Ramen | https://www.makiramen.com/our-menu/healthy-options/ | blocked from our server: unknown (Cloudflare managed challenge 'Just a moment...')
- [ ] caprinos-pizza | Caprinos Pizza | https://www.caprinospizza.co.uk/ | blocked from our server: unknown (site not readable)
- [ ] apache-pizza | Apache Pizza | https://nutrition.apache.ie/ | blocked from our server: HTML nutrition tool (HealthPro) on nutrition.apache.ie; PDFs for ingre
- [ ] fireaway-pizza | Fireaway Pizza | https://www.fireaway.co.uk/allergen-information | blocked from our server: PDF allergen matrix (no nutrition) + JS ordering SPA (calories per sto
- [ ] kaspas | Kaspa's | https://kaspas.co.uk/wp-content/uploads/2025/11/Allergen-Pack_031125-Winter-Launch_Web.pdf | blocked from our server: PDF allergen pack (not opened)
- [ ] snowflake | Snowflake | https://snowflakegelato.co.uk | blocked from our server: unknown (site not readable)
- [ ] crosstown | Crosstown | https://www.crosstown.co.uk/allergen-information/ | blocked from our server: HTML site; allergen page expected at /allergen-information/ (not opene
- [ ] phat-pasty-co | Phat Pasty Co | https://phatpasty-my.sharepoint.com/:b:/p/laura/Eez6S7qJXcZPlRWOrlwhDPUBFXRoRiTSS9FQJyc75tnybg?e=HcF7tp | blocked from our server: PDF on SharePoint (not opened)
- [ ] hotel-chocolat | Hotel Chocolat | https://www.hotelchocolat.com/uk/i/allergens-nutritional-information.html | blocked from our server: JS-rendered content page (café allergen page); retail product pages HT
- [ ] cojean | Cojean | https://www.cojean.co.uk/ | blocked from our server: html (one page per item)
- [ ] asda-cafe | Asda Café | https://www.asda.com/instore/cafe | blocked from our server: unknown (page not readable)
- [ ] waitrose-cafe | Waitrose Café | https://www.waitrose.com/ecom/help-information/customer-service/waitrose-cafe | blocked from our server: unknown (page not readable)
- [ ] pesto | Pesto | https://www.pestorestaurants.co.uk/restaurants/north-west/chester/dietary-requirements | blocked from our server: M&B allergen guide (HTML) probably on allergens.mbplc.io, not reachabl
- [ ] fullers | Fuller's | https://www.fullers.co.uk/pubs | blocked from our server: unknown (Cloudflare challenge)
- [ ] yates | Yates | https://www.yates.co.uk/ | blocked from our server: unknown (site down)
- [ ] robinsons | Robinsons Pubs | https://www.robinsonsbrewery.com/pubs/rising-moon-matley/ | blocked from our server: unknown (pub pages and PDFs unreadable)
- [ ] hydes | Hydes | https://www.hydesbrewery.com/wp-content/uploads/2026/07/SS26-07-JULY-Main-Menu.pdf | blocked from our server: PDF menus (calories in brackets per dish, per web-search snippet only)
- [ ] brakspear | Brakspear | https://brakspear.co.uk/ | blocked from our server: unknown (site not readable)
- [ ] arkells | Arkell's | https://www.arkells.com/ | blocked from our server: unknown (site not readable)
- [ ] house-of-daniel-thwaites | House of Daniel Thwaites | https://www.houseofdanielthwaites.co.uk/ | blocked from our server: unknown (site not readable)
- [ ] belhaven-pubs | Belhaven Pubs | https://www.belhaven.co.uk/allergens | blocked from our server: filterable allergen menus per pub (Greene King platform)
- [ ] farmhouse-inns | Farmhouse Inns | https://www.farmhouseinns.co.uk/pubs/south-yorkshire/woodfield-farm/allergens | blocked from our server: Per-pub Smart Chef allergen guide (HTML) + JS-only menu pages
- [ ] booths | Booths Cafe | https://www.booths.co.uk/dining-by-booths/booths-cafe/ | blocked from our server: FlippingBook flipbooks (JS viewer; page content not in the HTML, publi
- [ ] mother-hubbards | Mother Hubbard's | https://www.mother-hubbards.co.uk/wp-content/uploads/2026/04/2026_food_and_drink.pdf | blocked from our server: PDF menu (not opened)
- [ ] manjaros | Manjaros | https://manjaros.co.uk/wp-content/themes/manjaros/assets/1-Master-A3-Allergy-Sheet.pdf | blocked from our server: PDF (allergy sheet, not opened)
- [ ] cabana | Cabana | https://menus.tenkites.com/cabana/everything02 | blocked from our server: JavaScript-only allergen widget (third party, Tenkites)
- [ ] dishoom | Dishoom | https://app.served-app.com/website/dishoom | blocked from our server: JavaScript-only allergen app (third party, Served)
- [ ] spar | SPAR | https://www.spar.co.uk/deals-and-groceries/drinks/carbonated-drinks/other-flavoured-carbonated-drinks/coca-cola-zero-sugar-peach-500ml | blocked from our server: HTML product pages (grocery range); food-to-go has no nutrition
- [ ] odeon | Odeon Cinemas | https://www.odeon.co.uk/media/c1mbbkls/allergens-matrix-october-2025-edition-v12-24_09_2025-uk-version.pdf | blocked from our server: PDF allergen matrices (not opened)
- [ ] cineworld | Cineworld | https://www.cineworld.ie/magnoliaPublic/dam/jcr:3bfbe003-5658-4ca0-add4-3918c1cb6bee/26-07-22%20Cineworld%20Allergen%20and%20Nutritional%20Information.pdf | blocked from our server: PDF (Allergen and Nutritional Information) + help page
- [ ] curzon | Curzon Cinemas | https://www.curzon.com/media/u53o0rk2/menu-5_oct2025_updated.pdf | blocked from our server: PDF menus per cinema (not opened)
- [ ] dobbies | Dobbies Garden Centres | https://www.dobbies.com/restaurant | blocked from our server: HTML (restaurant pages + online allergens guide via QR code)
- [ ] parkdean-resorts | Parkdean Resorts | https://www.parkdeanresorts.co.uk/discover-more/food-and-drinks-brands/ | blocked from our server: HTML pages + seasonal menu PDFs + QR-linked allergen info (none opened
