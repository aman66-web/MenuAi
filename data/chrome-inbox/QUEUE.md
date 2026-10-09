# Chrome queue

One line per chain. Claude in Chrome works through the unticked lines in order (see "Batch mode" in docs/CHROME_TO_APP.md),
ticks a line when its `meta.json` and `items.csv` are written to `data/chrome-inbox/<chain-id>/`, and writes a reason instead of a
tick when it has to skip a chain (blocked, allergens only, per-100 g only, robots.txt forbids it, fewer than 3 UK sites).

- [ ] mcdonalds | McDonald's | https://www.mcdonalds.com/gb/en-gb.html | Good to know > Nutrition calculator
- [ ] dominos | Domino's | https://www.dominos.co.uk/nutritional-information | nutrition / allergen guide
- [ ] papa-johns | Papa Johns | https://www.papajohns.co.uk | footer: nutrition / allergen guide
- [ ] costa | Costa Coffee | https://www.costa.co.uk | allergen and nutrition guide
- [ ] tossed | Tossed | https://www.tossed.co.uk | Cloudflare check: the human solves it
- [ ] turtle-bay | Turtle Bay | https://www.turtlebay.co.uk/menu | check whether nutrition is shown at all
- [ ] coffee-republic | Coffee Republic | https://coffeerepublic.co.uk/menu/ | nutrition PDF (September 2023)
- [ ] sushi-shop | Sushi Shop UK | https://www.mysushishop.co.uk/en/delivery/ | calories on each product page (177 products)
- [ ] bettys | Betty's | https://www.bettys.co.uk | allergen / nutrition page
- [ ] john-lewis-cafe | John Lewis restaurants | https://www.johnlewis.com/our-services/restaurants | calories per dish
- [ ] angus-steakhouse | Angus Steakhouse | https://www.angussteakhouse.co.uk/allergens | calorie table in the linked ifoodi menu
