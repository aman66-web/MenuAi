# Groceries build report

Patched 2026-10-11 from the files built on 2026-10-11 (python3 tools/groceries/build_groceries.py --patch; no Open Food Facts download).

Pictures come only from the supermarkets' own websites (founder 2026-10-10); a product without one shows "no photo".

| retailer | products | with the shop's own photo | of those, a stored copy | allergens known | with price |
|---|---|---|---|---|---|
| Tesco | 5164 | 1088 | 0 | 3377 | 1065 |
| Sainsbury's | 4477 | 2596 | 794 | 3376 | 2003 |
| Asda | 6741 | 6732 | 0 | 4812 | 6713 |
| Waitrose | 489 | 487 | 0 | 441 | 487 |
| Lidl | 1 | 0 | 0 | 1 | 0 |
| Aldi | 1 | 1 | 0 | 1 | 1 |
| Morrisons | 1215 | 1215 | 0 | 1045 | 1215 |
| Co-op | 3 | 0 | 0 | 2 | 0 |
| M&S | 2 | 0 | 0 | 1 | 0 |
| Iceland | 1096 | 1094 | 0 | 948 | 1096 |
| Ocado | 0 | 0 | 0 | 0 | 0 |

## Details read from the supermarkets' own pages

- Tesco: 33 products with details; 32 use the shop's own numbers; 1 numbers not per 100 g/ml in our unit (kept Open Food Facts')

## Which supermarket lists a product

Rule: a supermarket's own-brand product is listed only under that supermarket (brand field, a name starting with the shop's name, or a barcode
company prefix the catalogue ties to one shop); a shop whose own website showed the barcode always lists it. Changes this build:

- Aldi: added 1 (on the shop's own website): 5010478882140 Swizzels | Swizzels Sweet Shop Favourites Tub 650g
- Asda: added 3 (on the shop's own website): 0898999000503 Vita Coco | Vita Coco Original Coconut Water 1 Litre; 5038862102506 Innocent | Innocent Smooth Orange Juice 900ml; 5060504310116 holy moly | Holy Moly Smashed Avocado 150g
- Asda: removed 2 (own brand): 50457366 Heinz, Morrisons | Heinz Tomato Ketchup Glass Bottle 342g; 5000221609568 Tesco | Mr Kipling Cherry Bakewell Mini Cake Bites 220g
- Iceland: added 2 (brand says another shop but a shop's own website lists it): 5000149029493 M&S | Aunt Bessie's Duck Fat Roast Potatoes 700g; 5012035957025 Haribo, Tesco | Haribo Starmix Fruit & Cola Flavour Jelly & Foam Sweets Gift Box 380g
- Iceland: added 1094 (on the shop's own website): 3023290001349 Tesco | Milky bar; 5000157024671 H J Heinz Foods UK Ltd | Beanz in a rich tomato sauce; 5000426171518 After Eight, Nestlé, Nestle UK Limited | After Eight Mint; 5000157062673 Heinz | Cream of Tomato Soup; 5010044000121 Warburtons | Original Toastie Soft & Sliced White Loaf; 5014213001049 Meridian | Crunchy Peanut Butter ...
- Morrisons: added 2 (brand says another shop but a shop's own website lists it): 5010084103332 Iceland, Jus-Rol | Puff Pastry Block; 5000149029493 M&S | Aunt Bessie's Duck Fat Roast Potatoes 700g
- Morrisons: added 1212 (on the shop's own website): 3023290001349 Tesco | Milky bar; 5000426171518 After Eight, Nestlé, Nestle UK Limited | After Eight Mint; 5000157062673 Heinz | Cream of Tomato Soup; 3415581101928 Häagen-Dazs | Vanilla Ice Cream; 5060367181274 pip & nut | Smooth Peanut Butter; 5000354800931 Ambrosia | Rice Pudding ...
- Morrisons: added 1 (own brand): 50457366 Heinz, Morrisons | Heinz Tomato Ketchup Glass Bottle 342g
- Sainsbury's: added 1 (brand says another shop but a shop's own website lists it): 5060108451673 Coop, Fever Tree | Fever-Tree Refreshingly Light Elderflower Tonic Water 500ml
- Sainsbury's: added 637 (on the shop's own website): 5000426171518 After Eight, Nestlé, Nestle UK Limited | After Eight Mint; 5000157062673 Heinz | Cream of Tomato Soup; 5060367181274 pip & nut | Smooth Peanut Butter; 5000108030904 Quaker | Jumbo Oats; 5036589254874 Yeo Valley | Kefir Mango & Passion Fruit; 5020411121151 Nutella, Ferrero | Nutella ...
- Tesco: added 1 (brand says another shop but a shop's own website lists it): 5000149029493 M&S | Aunt Bessie's Duck Fat Roast Potatoes 700g
- Tesco: added 247 (on the shop's own website): 50513024 Saint Agur | Saint Agur Blue Creme Cheese 150g; 3045320518283 Bonne Maman | Bonne Maman Creme Caramel Dessert 4x100g; 3073780400862 Babybel, Bel | Mini Babybel Original Cheese Snacks 6x20g; 3341502000110 Saint Agur | Saint Agur Blue Cheese 150g; 3608580081562 Bonne Maman | Bonne Maman Clementine & Lemon Mousse Dessert 2x70g; 4016241030573 Arla | Arla Skyr Natural Icelandic Style Yogurt 450g ...
- Tesco: added 1 (own brand): 5000221609568 Tesco | Mr Kipling Cherry Bakewell Mini Cake Bites 220g
- Waitrose: added 1 (brand says another shop but a shop's own website lists it): 5010084103332 Iceland, Jus-Rol | Puff Pastry Block
- Waitrose: added 486 (on the shop's own website): 5000157024671 H J Heinz Foods UK Ltd | Beanz in a rich tomato sauce; 5070000126579 Bio&Me | Granola Super Nutty; 5060367181274 pip & nut | Smooth Peanut Butter; 7290104507045 Sabra | Sabra Houmous Extra; 5000108030904 Quaker | Jumbo Oats; 5036589253273 Yeo Valley | Kefir ...

Barcode company prefixes the catalogue ties to one shop (barcodes naming it):

- Asda: 5050854 (78), 5051413 (81), 5052449 (126), 5054070 (199), 5054781 (352), 5057172 (384), 5063089 (684), 5063717 (63)
- Sainsbury's: 5063334 (442), 8:00 (1350), 8:01 (948), 8:44 (3)
- Tesco: 5000119 (60), 5000358 (26), 5000436 (42), 5000462 (16), 5010204 (28), 5018374 (37), 5031021 (22), 5050179 (24), 5051007 (13), 5051008 (10), 5051140 (17), 5051277 (16), 5051399 (18), 5051622 (9), 5051790 (17), 5051898 (24), 5052003 (21), 5052004 (20), 5052109 (29), 5052319 (15), 5052320 (37), 5052909 (34), 5052910 (62), 5053526 (46), 5053947 (61), 5054268 (49), 5054269 (52), 5054402 (43), 5054775 (40), 5057008 (67), 5057373 (72), 5057545 (158), 5057753 (517), 5057967 (69), 5059316 (4), 5059512 (106), 5059697 (921), 5063250 (198), 5063445 (157), 5063446 (44), 8:03 (364), 8:10 (114), 8:11 (3)

## Own-brand labels (checked against the catalogue)

| shop | label | products | in files | brand field also names the shop | barcode prefix is the shop's |
|---|---|---|---|---|---|
| Asda | just essentials | 2 | Asda 2 | 2 | 2 |
| Iceland | iceland | 2 | Tesco 1, Sainsbury's 1 | 0 | 0 |
| Lidl | dulano | 1 | Lidl 1 | 1 | 0 |
| Sainsbury's | be good to yourself | 2 | Sainsbury's 2 | 2 | 2 |
| Sainsbury's | hubbard's foodstore | 1 | Sainsbury's 1 | 1 | 1 |
| Sainsbury's | hubbards foodstore | 1 | Sainsbury's 1 | 1 | 1 |
| Sainsbury's | plant pioneers | 2 | Sainsbury's 2 | 2 | 2 |
| Sainsbury's | so organic | 8 | Sainsbury's 8 | 8 | 8 |
| Sainsbury's | stamford street | 4 | Sainsbury's 4 | 3 | 4 |
| Sainsbury's | stamford street co | 9 | Sainsbury's 9 | 4 | 9 |
| Sainsbury's | taste the difference | 145 | Sainsbury's 145 | 87 | 140 |
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
| Tesco | nevill's | 3 | Tesco 3 | 0 | 3 |
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

- Tesco: 1088 of 5164 products have the shop's own photo, 0 also have a stored copy; 4076 show "no photo"
  - not used because the shop's page names a different product (4): 5038862630962 'Frozen Straberries' vs the shop's 'innocent Kids Smoothies Cherries, Strawberries & Apples 4 x 150ml'; 5057545009598 'Fromage frais' vs the shop's 'Tesco Free From Raspberry Strawberry Soya Alternative 4X90g'; 10024423 'Cataloupe' vs the shop's 'Tesco Cantaloupe Melon Each'; 5038862238854 'Green energy' vs the shop's 'Innocent Super Smoothie Invigorate, Kiwi & Cucumber Juice with Vitamins 300ml'
- Sainsbury's: 2596 of 4477 products have the shop's own photo, 794 also have a stored copy; 1881 show "no photo"
  - not used because the shop's page names a different product (5): 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 5060100601861 'No Sugar Milk' vs the shop's 'Koko Unsweetened Coconut UHT 1L'; 5056053305673 'vegemince' vs the shop's 'Linda Mccartney Vegetarian Mince 500g'; 5060360508771 'Icelandic Style Strained Yoghurt' vs the shop's 'Danone Skyr 450g High Protein 0% Fat Natural Yogurt'; 8720701144538 'Everything Bar' vs the shop's "Tony's Chocolonely Milk Chocolate with Caramel, Pretzel, Almond, Nougat & Sea Salt 180g"
- Asda: 6732 of 6741 products have the shop's own photo, 0 also have a stored copy; 9 show "no photo"
  - not used because the shop's page names a different product (7): 5000237117446 'Original Salted Potato Rings' vs the shop's 'Hula Hoops Original Multipack Crisps 6 Pack'; 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 8720701144538 'Everything Bar' vs the shop's "Tony's Chocolonely Milk Chocolate with Caramel, Pretzel, Almond, Nougat and Sea Salt 180g"; 5000295136793 'Light made with Buttermilk' vs the shop's 'Clover Light Spread 500g'; 5000295141292 'Light made with Buttermilk' vs the shop's 'Clover Light Spread 1kg'; 5060100601885 'Unsweetened Coconut' vs the shop's 'Koko Dairy Free Dairy Free Sugar Free 1L'; 5099337000079 'Billy Bear' vs the shop's 'Character Kids 6 Slices 100g'
- Waitrose: 487 of 489 products have the shop's own photo, 0 also have a stored copy; 2 show "no photo"
- Aldi: 1 of 1 products have the shop's own photo, 0 also have a stored copy; 0 show "no photo"
- Morrisons: 1215 of 1215 products have the shop's own photo, 0 also have a stored copy; 0 show "no photo"
- Iceland: 1094 of 1096 products have the shop's own photo, 0 also have a stored copy; 2 show "no photo"

## Types

- Other 4814, Cupboard 2974, Snacks and sweets 1867, Drinks 1718, Dairy and eggs 1549, Bakery 1522, Ready meals 1244, Fruit and veg 991, Meat 916, Frozen 575, Breakfast 402, Fish and seafood 320, Meat alternatives 297

Moved to another type by the rules (from -> to: products):

- Drinks -> Cupboard: 1 (cocoa-powders)

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
- barcodes from the shops' own lists added with Open Food Facts records: 
- barcode records not used: energy doesn't match macros (check): 211
- barcode records not used: energy far below what the protein and fat give (e.g. 0 kcal with 4 g protein): 17
- barcode records not used: implausible numbers: 40
- barcode records not used: its name and the shop's name for the barcode share no word: 217
- barcode records not used: kJ and kcal disagree: 231
- barcode records not used: kcal, protein, carbs or fat missing: 1153
- barcode records not used: no usable name: 401
