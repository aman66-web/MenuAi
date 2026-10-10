# Sushi Shop UK: notes for the importer (read 2026-10-10)

Source: each product's own page on https://www.mysushishop.co.uk/en/delivery/... (the pop-up shows 'Nutritional information': one calories figure). robots.txt allows /en/delivery/ (it disallows /fr/, /es/, /de/, /en/stores/s/* and any URL with a query string; none were used).
Only 4 shops are listed (London). Calories only: no protein, carbs or fat. Serving column is the piece count shown on the page where it was clear.
Allergens: every page has only a 'See the list of allergens' link, so contains/may_contain are blank; the allergen link target was not opened.
Photo addresses were not captured.
Several Maki rolls print the same figure (210 for Kenko Cheese Avocado, Prince Maki and Kenko Cheese Salmon): copied as printed.

## Not written
Spring Fresh: page shows a Nutritional information heading but no calories figure: not written.
Mochi Chocolate Ganache, Mochi Yuzu Cheesecake, Box Duo Mochi: the pop-up shows "Nutritional information" with only a "See the list of allergens" link and no calories: not written (checked visually on Box Duo Mochi).
Veggie Gyozas, Chicken Gyozas, Beef Cheese Yakitori, Chicken Yakitori: the pop-up shows a Nutritional information heading but no calories figure: not written.
Poke Bowl Veggie, Salmon Aburi Poke Bowl, Fried Chicken Poke Bowl: no calories figure found on the page: not written.
Chicken Katsu Curry, Prawn Tempura Curry, Yakisoba Salmon, Yakisoba Prawn Tempura, Yakisoba Chicken Katsu: no product link on the category page, not read.
Poke By You, Box By You: build-your-own items, not read.
Teriyaki Salmon Poke Bowl, Detox Salmon Poke Bowl, Spicy Tuna Poke Bowl: no calories figure on the page: not written. The Marinated chirashi page title reads 'Marinated chirashi - With 2 Extras'.
Salmon Addict: page shows a Nutritional information heading but no calories figure: not written.
Lunch menu offer pages for Amateur Mix, Veggie Box and Super Salmon print the same calories as the Sushi Boxes entries, so they are not repeated.
Wasabi Peas: Nutritional information heading but no calories figure: not written.
Drinks (Coke, Bubble Tea, Kombucha, beers, sake...), sauces, ginger and chopsticks were not read. California Dream (a Sushi Box) had no readable page address and was not read.

## Update (later on 2026-10-10): checked against the site's own data, photos
- The site's own menu data (https://www.mysushishop.co.uk/rollingstart/page-data/en/delivery/maki/page-data.json, the file its pages load; it lists every product) prints the same calories as each product pop-up: all 120 pop-up readings matched with no difference. It also supplied products whose pop-ups I could not open or that I missed (Chicken Katsu Curry, Prawn Tempura Curry, three Yakisoba, Chicken Katsu Roll, Prawn Tempura Spring roll, California Dream, Black Box gourmet, Happy Sushi Box, Spicy Tuna Poke Bowl, Teriyaki Salmon Poke Bowl, a Poke Bowl Veggie, two soy sauces), which are now in items.csv (136 rows).
- Some items still have no calories anywhere: gyozas, yakitori, Salmon Addict, Wasabi Peas, three mochi, the other poke bowls (Fried Chicken, Salmon Aburi, Detox).
- Photos: 133 of the chain's own product photos are in photos/ (`photos.csv` lists each with its source address; the addresses are the site's own image rendition cf.mysushishop.co.uk/img2/<id>/614/614/cover/center/webp/auto/<id>.webp, which the site itself serves as a square). Looked at on contact sheets: they match the dish names. Left out: Sashimi Salmon 5 pieces (a placeholder pictogram, not a photo) and two products without a cover photo (Spring Salmon Guacamole, Sashimi Tuna 5 pieces).
