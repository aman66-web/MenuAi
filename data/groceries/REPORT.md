# Groceries build report

Patched 2026-10-11 from the files built on 2026-10-11 (python3 tools/groceries/build_groceries.py --patch; no Open Food Facts download).

Pictures come from the supermarkets' own websites (founder 2026-10-10); where no supermarket has one, the Open Food Facts front photo of exactly that barcode is used (founder 2026-10-11): 74 products.

| retailer | products | with the shop's own photo | of those, a stored copy | allergens known | with price |
|---|---|---|---|---|---|
| Tesco | 5163 | 1088 | 0 | 3376 | 1065 |
| Sainsbury's | 4472 | 2591 | 794 | 3373 | 1998 |
| Asda | 6716 | 6707 | 0 | 4796 | 6688 |
| Waitrose | 489 | 487 | 0 | 441 | 487 |
| Lidl | 1 | 0 | 0 | 1 | 0 |
| Aldi | 1 | 1 | 0 | 1 | 1 |
| Morrisons | 1209 | 1209 | 0 | 1042 | 1209 |
| Co-op | 3 | 0 | 0 | 2 | 0 |
| M&S | 2 | 0 | 0 | 1 | 0 |
| Iceland | 1088 | 1086 | 0 | 942 | 1088 |
| Ocado | 0 | 0 | 0 | 0 | 0 |

## Details read from the supermarkets' own pages

- Tesco: 33 products with details; 32 use the shop's own numbers; 1 numbers not per 100 g/ml in our unit (kept Open Food Facts')

## Which supermarket lists a product

Rule: a supermarket's own-brand product is listed only under that supermarket (brand field, a name starting with the shop's name, or a barcode
company prefix the catalogue ties to one shop); a shop whose own website showed the barcode always lists it. Changes this build:

- Asda: added 2 (on the shop's own website): 5035766052227 Inch’s | Medium Apple Cider; 5060386624271 Beavertown | Beavertown Neck Oil Session IPA
- Iceland: added 5 (on the shop's own website): 5010153812561 Carlsberg | Carlsberg Export; 5020628000317 Thatchers | Thatchers Haze Cloudy Cider; 8410302106300 Campo Viejo | Campo Viejo Rioja tempranillo; 9310297651887 Penfolds | Penfolds Koonunga hill shiraz cabernet; 9421025023620 Yealands | Sauvignon Blanc
- Morrisons: added 3 (on the shop's own website): 5060386624271 Beavertown | Beavertown Neck Oil Session IPA; 5010153812561 Carlsberg | Carlsberg Export; 5014379012897 Stella Artois | Brewed with Saaz Hops Stella Artois Belgium Artois

Barcode company prefixes the catalogue ties to one shop (barcodes naming it):

- Asda: 5050854 (78), 5051413 (81), 5052449 (126), 5054070 (199), 5054781 (352), 5057172 (383), 5063089 (684), 5063717 (63)
- Sainsbury's: 5063334 (442), 8:00 (1350), 8:01 (948), 8:44 (3)
- Tesco: 5000119 (60), 5000358 (26), 5000436 (42), 5000462 (16), 5010204 (28), 5018374 (37), 5031021 (22), 5050179 (24), 5051007 (13), 5051008 (10), 5051140 (17), 5051277 (16), 5051399 (18), 5051622 (9), 5051790 (17), 5051898 (24), 5052003 (21), 5052004 (20), 5052109 (29), 5052319 (15), 5052320 (37), 5052909 (34), 5052910 (62), 5053526 (46), 5053947 (61), 5054268 (49), 5054269 (52), 5054402 (43), 5054775 (40), 5057008 (67), 5057373 (72), 5057545 (158), 5057753 (517), 5057967 (69), 5059316 (4), 5059512 (106), 5059697 (921), 5063250 (198), 5063445 (157), 5063446 (44), 8:03 (364), 8:10 (114), 8:11 (3)

## Own-brand labels (checked against the catalogue)

| shop | label | products | in files | brand field also names the shop | barcode prefix is the shop's |
|---|---|---|---|---|---|
| Asda | just essentials | 2 | Asda 2 | 2 | 2 |
| Iceland | iceland | 4 | Tesco 1, Sainsbury's 1, Waitrose 1, Morrisons 1 | 0 | 0 |
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

- Tesco: 1088 of 5163 products have the shop's own photo, 0 also have a stored copy; 4075 show "no photo"
  - not used because the shop's page names a different product (4): 5038862630962 'Frozen Straberries' vs the shop's 'innocent Kids Smoothies Cherries, Strawberries & Apples 4 x 150ml'; 5057545009598 'Fromage frais' vs the shop's 'Tesco Free From Raspberry Strawberry Soya Alternative 4X90g'; 10024423 'Cataloupe' vs the shop's 'Tesco Cantaloupe Melon Each'; 5038862238854 'Green energy' vs the shop's 'Innocent Super Smoothie Invigorate, Kiwi & Cucumber Juice with Vitamins 300ml'
- Sainsbury's: 2591 of 4472 products have the shop's own photo, 794 also have a stored copy; 1881 show "no photo"
  - not used because the shop's page names a different product (5): 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 5060100601861 'No Sugar Milk' vs the shop's 'Koko Unsweetened Coconut UHT 1L'; 5056053305673 'vegemince' vs the shop's 'Linda Mccartney Vegetarian Mince 500g'; 5060360508771 'Icelandic Style Strained Yoghurt' vs the shop's 'Danone Skyr 450g High Protein 0% Fat Natural Yogurt'; 8720701144538 'Everything Bar' vs the shop's "Tony's Chocolonely Milk Chocolate with Caramel, Pretzel, Almond, Nougat & Sea Salt 180g"
- Asda: 6707 of 6716 products have the shop's own photo, 0 also have a stored copy; 9 show "no photo"
  - not used because the shop's page names a different product (7): 5000237117446 'Original Salted Potato Rings' vs the shop's 'Hula Hoops Original Multipack Crisps 6 Pack'; 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 8720701144538 'Everything Bar' vs the shop's "Tony's Chocolonely Milk Chocolate with Caramel, Pretzel, Almond, Nougat and Sea Salt 180g"; 5000295136793 'Light made with Buttermilk' vs the shop's 'Clover Light Spread 500g'; 5000295141292 'Light made with Buttermilk' vs the shop's 'Clover Light Spread 1kg'; 5060100601885 'Unsweetened Coconut' vs the shop's 'Koko Dairy Free Dairy Free Sugar Free 1L'; 5099337000079 'Billy Bear' vs the shop's 'Character Kids 6 Slices 100g'
- Waitrose: 487 of 489 products have the shop's own photo, 0 also have a stored copy; 2 show "no photo"
- Aldi: 1 of 1 products have the shop's own photo, 0 also have a stored copy; 0 show "no photo"
- Morrisons: 1209 of 1209 products have the shop's own photo, 0 also have a stored copy; 0 show "no photo"
- Iceland: 1086 of 1088 products have the shop's own photo, 0 also have a stored copy; 2 show "no photo"

## Types

- Other 4797, Cupboard 2974, Snacks and sweets 1867, Drinks 1690, Dairy and eggs 1549, Bakery 1522, Ready meals 1244, Fruit and veg 991, Meat 916, Frozen 575, Breakfast 402, Fish and seafood 320, Meat alternatives 297

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
- barcodes from the shops' own lists added with Open Food Facts records: Asda 13, Sainsbury's 2
- barcode records not used: an alcoholic drink (founder 2026-10-11): 10
- barcode records not used: energy doesn't match macros (check): 211
- barcode records not used: energy far below what the protein and fat give (e.g. 0 kcal with 4 g protein): 17
- barcode records not used: implausible numbers: 40
- barcode records not used: its name and the shop's name for the barcode share no word: 217
- barcode records not used: kJ and kcal disagree: 231
- barcode records not used: kcal, protein, carbs or fat missing: 1153
- barcode records not used: no usable name: 401
