# Groceries build report

Patched 2026-10-11 from the files built on 2026-10-11 (python3 tools/groceries/build_groceries.py --patch; no Open Food Facts download).

Pictures come only from the supermarkets' own websites (founder 2026-10-10); a product without one shows "no photo".

| retailer | products | with the shop's own photo | of those, a stored copy | allergens known | with price |
|---|---|---|---|---|---|
| Tesco | 4915 | 834 | 0 | 3163 | 814 |
| Sainsbury's | 3839 | 1964 | 794 | 2816 | 1366 |
| Asda | 6740 | 6731 | 0 | 4810 | 6712 |
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

- Asda: added 2 (brand says another shop but a shop's own website lists it): 5088722225449 Sainsbury's | Apple soreen; 5000326011624 golden yolker | Tesco golden yoker
- Asda: added 570 (on the shop's own website): 3023290001349 Tesco | Milky bar; 5000157024671 H J Heinz Foods UK Ltd | Beanz in a rich tomato sauce; 5025125000037 Jasons | Sourdough grain and seeds; 7622210584724 Green & Black's Organic | Intense Dark 85% Cocoa; 5010029000016 Weetabix | Weetabix; 5010265002911 Ryvita | Dark Rye Crispbread ...
- Asda: added 1 (own brand): 5054781971801 Tesco | Wholewheat spaghetti
- Sainsbury's: added 173 (on the shop's own website): 54051256 alpro | Dessert Chocolate Flavour; 54051294 alpro | Dessert Vanilla Flavour; 0813636021932 Califia Farms | Oat Milk; 0813636022953 Califia Farms | Oat Barista Blend; 0850004207390 Beyond Meat | Beyond Burger; 0898999000503 Vita Coco | Coconut Water ...
- Tesco: added 1 (on the shop's own website): 5038862238854 Innocent | Green energy
- Tesco: removed 1 (held back: its brand and barcode name different supermarkets): 5052449637984 Tesco | Cheesy Balls
- Tesco: removed 1 (own brand): 5054781971801 Tesco | Wholewheat spaghetti

Barcode company prefixes the catalogue ties to one shop (barcodes naming it):

- Asda: 5050854 (76), 5051413 (81), 5052449 (125), 5054070 (191), 5054781 (345), 5057172 (371), 5063089 (673)
- Sainsbury's: 5063334 (434), 8:00 (1350), 8:01 (948), 8:44 (3)
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

- Tesco: 834 of 4915 products have the shop's own photo, 0 also have a stored copy; 4081 show "no photo"
  - not used because the shop's page names a different product (4): 5038862630962 'Frozen Straberries' vs the shop's 'innocent Kids Smoothies Cherries, Strawberries & Apples 4 x 150ml'; 5057545009598 'Fromage frais' vs the shop's 'Tesco Free From Raspberry Strawberry Soya Alternative 4X90g'; 10024423 'Cataloupe' vs the shop's 'Tesco Cantaloupe Melon Each'; 5038862238854 'Green energy' vs the shop's 'Innocent Super Smoothie Invigorate, Kiwi & Cucumber Juice with Vitamins 300ml'
- Sainsbury's: 1964 of 3839 products have the shop's own photo, 794 also have a stored copy; 1875 show "no photo"
  - not used because the shop's page names a different product (4): 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 5060100601861 'No Sugar Milk' vs the shop's 'Koko Unsweetened Coconut UHT 1L'; 5056053305673 'vegemince' vs the shop's 'Linda Mccartney Vegetarian Mince 500g'; 5060360508771 'Icelandic Style Strained Yoghurt' vs the shop's 'Danone Skyr 450g High Protein 0% Fat Natural Yogurt'
- Asda: 6731 of 6740 products have the shop's own photo, 0 also have a stored copy; 9 show "no photo"
  - not used because the shop's page names a different product (7): 5000237117446 'Original Salted Potato Rings' vs the shop's 'Hula Hoops Original Multipack Crisps 6 Pack'; 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 8720701144538 'Everything Bar' vs the shop's "Tony's Chocolonely Milk Chocolate with Caramel, Pretzel, Almond, Nougat and Sea Salt 180g"; 5000295136793 'Light made with Buttermilk' vs the shop's 'Clover Light Spread 500g'; 5000295141292 'Light made with Buttermilk' vs the shop's 'Clover Light Spread 1kg'; 5060100601885 'Unsweetened Coconut' vs the shop's 'Koko Dairy Free Dairy Free Sugar Free 1L'; 5099337000079 'Billy Bear' vs the shop's 'Character Kids 6 Slices 100g'

## Types

- Other 4105, Cupboard 2207, Snacks and sweets 1376, Bakery 1312, Drinks 1249, Dairy and eggs 1224, Ready meals 1099, Fruit and veg 867, Meat 805, Frozen 429, Fish and seafood 298, Meat alternatives 267, Breakfast 264

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
- barcodes from the shops' own lists added with Open Food Facts records: Tesco 502, Asda 6164, Sainsbury's 999
- barcode records not used: energy doesn't match macros (check): 211
- barcode records not used: energy far below what the protein and fat give (e.g. 0 kcal with 4 g protein): 17
- barcode records not used: implausible numbers: 40
- barcode records not used: its name and the shop's name for the barcode share no word: 217
- barcode records not used: kJ and kcal disagree: 231
- barcode records not used: kcal, protein, carbs or fat missing: 1153
- barcode records not used: no usable name: 401
