# Groceries build report

Patched 2026-10-10 from the files built on 2026-10-09 (python3 tools/groceries/build_groceries.py --patch; no Open Food Facts download).

Pictures come only from the supermarkets' own websites (founder 2026-10-10); a product without one shows "no photo".

| retailer | products | with the shop's own photo | of those, a stored copy | allergens known | with price |
|---|---|---|---|---|---|
| Tesco | 4475 | 339 | 0 | 2830 | 165 |
| Sainsbury's | 2736 | 809 | 809 | 2080 | 123 |
| Asda | 3 | 0 | 0 | 3 | 0 |
| Waitrose | 2 | 0 | 0 | 2 | 0 |
| Lidl | 1 | 0 | 0 | 1 | 0 |
| Aldi | 0 | 0 | 0 | 0 | 0 |
| Morrisons | 0 | 0 | 0 | 0 | 0 |
| Co-op | 3 | 0 | 0 | 2 | 0 |
| M&S | 2 | 0 | 0 | 1 | 0 |
| Iceland | 0 | 0 | 0 | 0 | 0 |
| Ocado | 0 | 0 | 0 | 0 | 0 |

## Details read from the supermarkets' own pages

- Tesco: 33 products with details; 32 use the shop's own numbers; 1 numbers not per 100 g/ml in our unit (kept Open Food Facts')

## Which supermarket lists a product

Rule: a supermarket's own-brand product is listed only under that supermarket (brand field, a name starting with the shop's name, or a barcode
company prefix the catalogue ties to one shop); a shop whose own website showed the barcode always lists it. Changes this build:

- Asda: added 3 (own brand): 5050854977459 Asda | Vegetable Stock Cubes (12 x); 5051413862018 Asda | 4 Greek Style Yogurts with honey; 5052449782448 Asda, Asda Extra Special | Black cherry luxury yougart
- Co-op: added 3 (own brand): 5000128503679 Co Op, Tesco | Co-op Cherryade; 5000128962575 Coop | Greek style Natural yogurt 0% fat; 5000129334869 Coop | rich and creamy tiramisu
- Lidl: added 1 (own brand): 4056489737551 Dulano, Lidl | Italian Antipasto Selection
- M&S: added 2 (own brand): 29229109 M&S Food | Whole Oat Plant Based Vegan Drink; 29157235 Marks & Spencer | Walnut Pieces
- Sainsbury's: added 1 (brand says another shop but a shop's own website lists it): 5010084103332 Iceland, Jus-Rol | Puff Pastry Block
- Sainsbury's: added 38 (on the shop's own website): 3023290001349 Tesco | Milky bar; 7290104507045 Sabra | Sabra Houmous Extra; 5036589253273 Yeo Valley | Kefir; 5060678710583 This | This isn't pork sausages; 5038862233996 innocent | Super Smoothie Energise; 5000181024043 Arla Cravendale | Semi-Skimmed Milk ...
- Sainsbury's: added 1 (own brand): 00383127 Sainsbury's, Tesco | Chocolate brownie bite
- Sainsbury's: removed 5 (held back: its brand and barcode name different supermarkets): 5000128841924 Coop, Sainsbury's, Cano | Chicken breast slices roasted with brown sugar.; 5010251733911 Sainsbury's, Eurospin | cucumber; 5000128431156 Sainsbury's, Co Op | Orange juice; 5010251746546 Sainsbury's, Morrisons | Cranberry, Fruit And Nut Medley; 5052910123589 Taste The Difference | Finest Scotch Eggs
- Tesco: removed 8 (held back: its brand and barcode name different supermarkets): 5063334007874 Tesco | Salted Caramel Nut Mix; 00007573 Tesco finest | Camembert d'Isigny Sainte Mère; 00453059 Tesco Finest | Triple chocolate hot cross buns; 00511070 Tesco Finest | Raw Tail On king prawns; 01277661 Tesco | dried wholemeal Spaghetti; 01741650 Tesco | Rich tea biscuits ...
- Tesco: removed 18 (own brand): 01830958 Sainsbury's, Tesco | Pitted Green Olives; 00113168 Sainsbury's, Tesco | British Petit Pois; 5000128503679 Co Op, Tesco | Co-op Cherryade; 00383127 Sainsbury's, Tesco | Chocolate brownie bite; 01810295 Sainsbury's | 8 Plain Tortilla Wraps; 5088722225449 Sainsbury's | Apple soreen ...
- Waitrose: added 2 (own brand): 5000169154496 Waitrose | Triple Malt Sourdough Bread with Seeds; 5000169187333 Waitrose | Taramasalata

Barcode company prefixes the catalogue ties to one shop (barcodes naming it):

- Sainsbury's: 5063334 (290), 8:00 (1383), 8:01 (977), 8:44 (3)
- Tesco: 5000119 (61), 5000358 (26), 5000436 (42), 5000462 (16), 5010204 (25), 5018374 (37), 5031021 (23), 5050179 (22), 5051007 (13), 5051008 (10), 5051140 (17), 5051277 (14), 5051399 (19), 5051622 (7), 5051790 (17), 5051898 (24), 5052003 (20), 5052004 (19), 5052109 (28), 5052319 (15), 5052320 (35), 5052909 (34), 5052910 (56), 5053526 (48), 5053947 (59), 5054268 (48), 5054269 (51), 5054402 (40), 5054775 (40), 5057008 (64), 5057373 (67), 5057545 (157), 5057753 (508), 5057967 (70), 5059316 (4), 5059512 (102), 5059697 (881), 5063250 (186), 5063445 (145), 5063446 (39), 8:03 (369), 8:10 (84)

## Own-brand labels (checked against the catalogue)

| shop | label | products | in files | brand field also names the shop | barcode prefix is the shop's |
|---|---|---|---|---|---|
| Iceland | iceland | 1 | Tesco 1 | 0 | 0 |
| Lidl | dulano | 1 | Tesco 1 | 1 | 0 |
| Sainsbury's | be good to yourself | 2 | Sainsbury's 2 | 2 | 2 |
| Sainsbury's | hubbard's foodstore | 1 | Sainsbury's 1 | 1 | 1 |
| Sainsbury's | hubbards foodstore | 1 | Sainsbury's 1 | 1 | 1 |
| Sainsbury's | plant pioneers | 2 | Sainsbury's 2 | 2 | 2 |
| Sainsbury's | so organic | 8 | Sainsbury's 8 | 8 | 8 |
| Sainsbury's | stamford street | 3 | Sainsbury's 3 | 3 | 3 |
| Sainsbury's | stamford street co | 4 | Sainsbury's 4 | 4 | 4 |
| Sainsbury's | taste the difference | 144 | Sainsbury's 144 | 88 | 138 |
| Sainsbury's | taste-the-difference | 1 | Sainsbury's 1 | 1 | 1 |
| Tesco | bay fishmongers | 2 | Tesco 2 | 0 | 2 |
| Tesco | creamfields | 18 | Tesco 18 | 2 | 14 |
| Tesco | eastman's | 1 | Tesco 1 | 0 | 1 |
| Tesco | eastman's deli foods | 9 | Tesco 9 | 1 | 9 |
| Tesco | everyday value | 1 | Tesco 1 | 1 | 1 |
| Tesco | finest | 1 | Tesco 1 | 0 | 1 |
| Tesco | fire pit | 4 | Tesco 4 | 1 | 4 |
| Tesco | growers harvest | 1 | Tesco 1 | 0 | 0 |
| Tesco | h.w. nevill | 1 | Tesco 1 | 0 | 1 |
| Tesco | h.w. nevill's | 1 | Tesco 1 | 0 | 1 |
| Tesco | hearty food | 1 | Tesco 1 | 0 | 1 |
| Tesco | hearty food co | 9 | Tesco 9 | 3 | 9 |
| Tesco | ms molly's | 4 | Tesco 4 | 1 | 4 |
| Tesco | nevill's | 4 | Tesco 4 | 0 | 4 |
| Tesco | nightingale farms | 2 | Tesco 2 | 1 | 2 |
| Tesco | plant chef | 12 | Tesco 12 | 6 | 12 |
| Tesco | redmere farms | 1 | Tesco 1 | 1 | 1 |
| Tesco | root & soul | 1 | Tesco 1 | 0 | 1 |
| Tesco | rosedene farms | 3 | Tesco 3 | 0 | 3 |
| Tesco | stockwell | 6 | Tesco 6 | 0 | 5 |
| Tesco | stockwell & co | 11 | Tesco 11 | 6 | 11 |
| Tesco | t. e. stockwell | 1 | Tesco 1 | 0 | 1 |
| Tesco | the growers harvest | 4 | Tesco 4 | 2 | 4 |
| Tesco | wicked kitchen | 14 | Tesco 14 | 2 | 14 |
| Tesco | willow farms | 1 | Tesco 1 | 0 | 0 |
| Tesco | woodside farms | 1 | Tesco 1 | 0 | 1 |

## Photos from the supermarkets' own websites (a stored copy where we hold one, else hotlinked)

- Tesco: 339 of 4475 products have the shop's own photo, 0 also have a stored copy; 4136 show "no photo"
  - not used because the shop's page names a different product (3): 5038862630962 'Frozen Straberries' vs the shop's 'innocent Kids Smoothies Cherries, Strawberries & Apples 4 x 150ml'; 5057545009598 'Fromage frais' vs the shop's 'Tesco Free From Raspberry Strawberry Soya Alternative 4X90g'; 10024423 'Cataloupe' vs the shop's 'Tesco Cantaloupe Melon Each'
- Sainsbury's: 809 of 2736 products have the shop's own photo, 809 also have a stored copy; 1927 show "no photo"
  - not used because the shop's page names a different product (2): 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 5060100601861 'No Sugar Milk' vs the shop's 'Koko Unsweetened Coconut UHT 1L'

## Types

- Other 1301, Cupboard 1089, Bakery 808, Ready meals 722, Snacks and sweets 613, Fruit and veg 593, Dairy and eggs 532, Meat 531, Drinks 308, Frozen 236, Fish and seafood 230, Meat alternatives 135, Breakfast 124

Moved to another type by the rules (from -> to: products):

- Drinks -> Cupboard: 76 (beans, black-olives, black-olives-in-brine, black-olives-in-oil, black-pitted-olives, bouillon-pots, broths, green-olives ...)
- Other -> Meat alternatives: 65 (bacon-substitutes, breaded-cutlets-substitutes, breaded-fish-substitutes, fish-analogues, kefta-substitutes, meat-alternatives, meat-analogues, meat-analogues-from-pea-proteins ...)
- Meat -> Ready meals: 64 (beef-dishes, beef-ravioli, boeufs-bourguignons-without-side-dishes, bolognese-lasagne, burritos, butter-chicken, butter-chicken-with-side-dishes, canned-raviolis ...)
- Other -> Cupboard: 56 (amber-maple-syrups, baking-mixes, baking-powders, broth-stock, broths, brown-sugars, cane-sugars, caster-sugars ...)
- Ready meals -> Bakery: 39 (apple-pies, apple-turnovers, brioche-filled-with-chocolate-drops, brioches, chocolate-croissant, chocolate-pies, filled-focaccia, focaccia ...)
- Drinks -> Meat alternatives: 36 (bacon-substitutes, meat-analogues, meat-analogues-from-soy-or-wheat-proteins, prepared-meat-cuts-substitutes, tempeh, textured-vegetable-protein, tofu, vegan-patties ...)
- Fruit and veg -> Cupboard: 30 (date-syrups, double-concentrate-tomato-paste, garlic-powders, ginger-preserves, onion-chutneys, pickled-beetroots, pickled-gherkins, pickled-onions ...)
- Dairy and eggs -> Cupboard: 29 (almond-butters, cashew-butters, cereal-butters, creamy-peanut-butters, crunchy-peanut-butters, nut-butters, peanut-butters, pure-peanut-butters ...)
- Bakery -> Snacks and sweets: 23 (prawn-crackers, puffed-corn-cakes, puffed-rice-cakes, puffed-rice-cakes-with-black-chocolate, puffed-rice-cakes-with-milk-chocolate)
- Meat -> Meat alternatives: 21 (chicken-kievs-substitutes, meat-analogues-from-pea-proteins, vegan-sausages, vegetarian-hot-dog-sausages, vegetarian-sausages)
- Breakfast -> Cupboard: 13 (bulgur, corn-starch, durum-wheat-semolinas-for-couscous, wheat-semolinas)
- Other -> Bakery: 12 (crepes-and-pancakes, filled-crepes-with-chocolate, flapjack, pancakes)
- Breakfast -> Bakery: 10 (cooked-pure-butter-puff-pastry, pie-dough, puff-pastry-sheets, pure-butter-puff-pastry, raw-shortcrust-pastry, shortcrust-pastry)
- Fruit and veg -> Breakfast: 9 (cereal-clusters-with-fruits, cereal-flakes-with-fruits, cereals-with-fruits, diet-breakfast-cereals-with-fruits, extruded-flakes)
- Dairy and eggs -> Snacks and sweets: 8 (chocolate-eggs, easter-eggs, hollow-chocolate-eggs)
- Fruit and veg -> Bakery: 7 (jam-doughnuts, raspberry-cheesecakes, shortbread, snack-biscuit-with-fruits-filling, strawberry-cheesecakes)
- Fruit and veg -> Snacks and sweets: 7 (barres-aux-fruits, chocolate-covered-fruits, chocolate-covered-raisins, fruits-cereal-bars)
- Dairy and eggs -> Ready meals: 5 (scotch-eggs)
- Ready meals -> Meat alternatives: 5 (vegetarian-grounds, vegetarian-hamburgers)
- Bakery -> Ready meals: 5 (spring-rolls)
- Fruit and veg -> Ready meals: 4 (pasta-salad-with-tuna, quiches-with-vegetables)
- Meat -> Cupboard: 3 (butter-chicken-sauces, gravy)
- Snacks and sweets -> Bakery: 3 (blinis, pancakes)
- Bakery -> Fish and seafood: 2 (fish-cakes)
- Drinks -> Ready meals: 2 (falafels, refrigerated-falafel)
- Fruit and veg -> Dairy and eggs: 1 (petit-suisse-with-fruits)
- Cupboard -> Snacks and sweets: 1 (rice-puddings)
- Bakery -> Cupboard: 1 (shelf-stable-baking-mixes)
- Other -> Ready meals: 1 (curry)
- Other -> Drinks: 1 (juice)
- Ready meals -> Cupboard: 1 (meal-kits)
- Snacks and sweets -> Meat alternatives: 1 (vegetarian-nuggets)
- Meat -> Bakery: 1 (pancakes)
- Snacks and sweets -> Ready meals: 1 (arancini)

## Left out (and why)

- sainsburys: energy doesn't match macros (check): 75
- sainsburys: implausible numbers: 10
- sainsburys: invalid barcode: 19
- sainsburys: kcal, protein, carbs or fat missing: 170
- sainsburys: no usable name: 47
- tesco: energy doesn't match macros (check): 118
- tesco: implausible numbers: 18
- tesco: invalid barcode: 62
- tesco: kcal, protein, carbs or fat missing: 542
- tesco: no usable name: 158
