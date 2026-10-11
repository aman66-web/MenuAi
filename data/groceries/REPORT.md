# Groceries build report

Patched 2026-10-11 from the files built on 2026-10-11 (python3 tools/groceries/build_groceries.py --patch; no Open Food Facts download).

Pictures come only from the supermarkets' own websites (founder 2026-10-10); a product without one shows "no photo".

| retailer | products | with the shop's own photo | of those, a stored copy | allergens known | with price |
|---|---|---|---|---|---|
| Tesco | 4414 | 332 | 0 | 2789 | 162 |
| Sainsbury's | 2667 | 794 | 794 | 2030 | 118 |
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

- none

Barcode company prefixes the catalogue ties to one shop (barcodes naming it):

- Sainsbury's: 5063334 (286), 8:00 (1350), 8:01 (948), 8:44 (3)
- Tesco: 5000119 (58), 5000358 (25), 5000436 (42), 5000462 (16), 5010204 (25), 5018374 (35), 5031021 (21), 5050179 (22), 5051007 (13), 5051008 (10), 5051140 (17), 5051277 (14), 5051399 (17), 5051622 (7), 5051790 (16), 5051898 (23), 5052003 (20), 5052004 (18), 5052109 (28), 5052319 (14), 5052320 (35), 5052909 (33), 5052910 (56), 5053526 (46), 5053947 (56), 5054268 (48), 5054269 (51), 5054402 (40), 5054775 (39), 5057008 (63), 5057373 (67), 5057545 (156), 5057753 (501), 5057967 (68), 5059316 (4), 5059512 (101), 5059697 (874), 5063250 (186), 5063445 (143), 5063446 (38), 8:03 (364), 8:10 (83), 8:11 (3)

## Own-brand labels (checked against the catalogue)

| shop | label | products | in files | brand field also names the shop | barcode prefix is the shop's |
|---|---|---|---|---|---|
| Iceland | iceland | 2 | Tesco 1, Sainsbury's 1 | 0 | 0 |
| Lidl | dulano | 1 | Lidl 1 | 1 | 0 |
| Sainsbury's | be good to yourself | 2 | Sainsbury's 2 | 2 | 2 |
| Sainsbury's | hubbard's foodstore | 1 | Sainsbury's 1 | 1 | 1 |
| Sainsbury's | hubbards foodstore | 1 | Sainsbury's 1 | 1 | 1 |
| Sainsbury's | plant pioneers | 2 | Sainsbury's 2 | 2 | 2 |
| Sainsbury's | so organic | 8 | Sainsbury's 8 | 8 | 8 |
| Sainsbury's | stamford street | 3 | Sainsbury's 3 | 3 | 3 |
| Sainsbury's | stamford street co | 4 | Sainsbury's 4 | 4 | 4 |
| Sainsbury's | taste the difference | 142 | Sainsbury's 142 | 87 | 137 |
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

- Tesco: 332 of 4414 products have the shop's own photo, 0 also have a stored copy; 4082 show "no photo"
  - not used because the shop's page names a different product (3): 5038862630962 'Frozen Straberries' vs the shop's 'innocent Kids Smoothies Cherries, Strawberries & Apples 4 x 150ml'; 5057545009598 'Fromage frais' vs the shop's 'Tesco Free From Raspberry Strawberry Soya Alternative 4X90g'; 10024423 'Cataloupe' vs the shop's 'Tesco Cantaloupe Melon Each'
- Sainsbury's: 794 of 2667 products have the shop's own photo, 794 also have a stored copy; 1873 show "no photo"
  - not used because the shop's page names a different product (2): 5038862236911 'Invigorate' vs the shop's 'Innocent Green Energise, Kiwi, Cucumber, Apple & Matcha Super Smoothie with Vitamins 750ml'; 5060100601861 'No Sugar Milk' vs the shop's 'Koko Unsweetened Coconut UHT 1L'

## Types

- Other 1288, Cupboard 1061, Bakery 796, Ready meals 711, Snacks and sweets 605, Fruit and veg 578, Dairy and eggs 522, Meat 518, Drinks 305, Frozen 231, Fish and seafood 225, Meat alternatives 130, Breakfast 122

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
