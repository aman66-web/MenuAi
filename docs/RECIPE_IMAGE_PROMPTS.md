# Recipe picture prompts

One prompt per recipe in the app's recipe book, for making its picture with an AI image tool (Nano Banana).
Founder's decision 2026-10-10 (CLAUDE.md rule 2): our own recipes may show an illustration made with AI; the app captions it
"Illustration made with AI" and never uses one for a restaurant's or a supermarket's item.

How to add the pictures:

1. Paste a prompt into Nano Banana. Check the picture shows the dish described, with no writing, packaging or logos in it.
2. Save it as `data/recipe-images/<recipe id>.png` (the id is the code after each heading, e.g. `chicken-rice-bowl.png`).
3. Run `python3 tools/recipes/import_recipe_images.py`. It crops to 4:3, resizes to 800 x 600, saves WebP copies in
   `web/public/recipe-images/` and lists them in `web/lib/mm/recipeImages.ts`. Then commit and push.

Pictures that have been added are ticked. This file is rewritten from the recipe book by
`WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts` (run in `web/`), so don't edit it by hand.

100 recipes, 0 with a picture.

## Breakfast

### Overnight oats with yogurt · `overnight-oats`

A realistic, appetising food photograph of overnight oats with yogurt: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, fat-free greek-style yogurt, semi-skimmed milk, peanut butter. Also in the dish: fruit on top. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cheesy scrambled egg wraps · `cheesy-egg-wraps`

A realistic, appetising food photograph of cheesy scrambled egg wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, mature cheddar, tortilla wraps, semi-skimmed milk. Also in the dish: spinach or tomatoes. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Berry porridge with skyr · `berry-skyr-porridge`

A realistic, appetising food photograph of berry porridge with skyr: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, semi-skimmed milk, skyr or high-protein yogurt, mixed berries. Also in the dish: a pinch of cinnamon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Peanut butter and banana porridge · `peanut-banana-porridge`

A realistic, appetising food photograph of peanut butter and banana porridge: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, oat drink, peanut butter. Also in the dish: a banana, sliced, a pinch of cinnamon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked salmon and scrambled eggs · `smoked-salmon-eggs`

A realistic, appetising food photograph of smoked salmon and scrambled eggs: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, smoked salmon. Also in the dish: fresh chives, snipped, black pepper, a little oil spray. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Spanish-style omelette with potatoes and peas · `spanish-omelette`

A realistic, appetising food photograph of spanish-style omelette with potatoes and peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, tinned new potatoes, frozen peas or petits pois, olive oil. Also in the dish: an onion, thinly sliced, fresh parsley, salt and black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Black bean breakfast burritos · `breakfast-burrito`

A realistic, appetising food photograph of black bean breakfast burritos: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, black beans in water, tortilla wraps, mature cheddar, tomato salsa. Also in the dish: a pinch of ground cumin, fresh coriander, a handful of spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bacon and egg breakfast wraps · `bacon-egg-wraps`

A realistic, appetising food photograph of bacon and egg breakfast wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from bacon medallions, free-range eggs, tortilla wraps. Also in the dish: a tomato, sliced, a handful of spinach, black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Greek yogurt granola bowl · `greek-yogurt-granola`

A realistic, appetising food photograph of greek yogurt granola bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from fat-free greek-style yogurt, granola, mixed berries, clear honey. Also in the dish: a few fresh mint leaves. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cottage cheese, berries, honey and seeds · `cottage-cheese-berries`

A realistic, appetising food photograph of cottage cheese, berries, honey and seeds: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cottage cheese, mixed berries, clear honey, mixed seeds. Also in the dish: a pinch of cinnamon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Wholewheat biscuits with milk and berries · `wheat-biscuits-berries`

A realistic, appetising food photograph of wholewheat biscuits with milk and berries: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from wholewheat breakfast biscuits, semi-skimmed milk, mixed berries. Also in the dish: a sliced banana. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Shakshuka with feta · `shakshuka`

A realistic, appetising food photograph of shakshuka with feta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, chopped tomatoes, feta. Also in the dish: an onion, sliced, a red pepper, sliced, a clove of garlic, ground cumin and smoked paprika, fresh coriander or parsley, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Baked beans with poached eggs · `beans-poached-eggs`

A realistic, appetising food photograph of baked beans with poached eggs: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from baked beans in tomato sauce, free-range eggs. Also in the dish: black pepper, a handful of spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Ham and cheese omelette · `ham-cheese-omelette`

A realistic, appetising food photograph of ham and cheese omelette: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, cooked ham slices, mature cheddar. Also in the dish: black pepper, fresh chives, a little oil spray. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tofu scramble with baked beans · `tofu-scramble`

A realistic, appetising food photograph of tofu scramble with baked beans: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from firm tofu, baked beans in tomato sauce. Also in the dish: a pinch of ground turmeric, a clove of garlic, crushed, a handful of spinach, black pepper, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Oat pancakes with yogurt and berries · `oat-pancakes`

A realistic, appetising food photograph of oat pancakes with yogurt and berries: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, free-range eggs, semi-skimmed milk, fat-free greek-style yogurt, mixed berries. Also in the dish: a pinch of cinnamon, a little oil spray. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Huevos rancheros · `huevos-rancheros`

A realistic, appetising food photograph of huevos rancheros: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, red kidney beans in water, tomato salsa, tortilla wraps. Also in the dish: a pinch of ground cumin, fresh coriander, a squeeze of lime, a little oil spray. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Apple Bircher muesli · `bircher-muesli`

A realistic, appetising food photograph of apple bircher muesli: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, oat drink, whole almonds, raisins or sultanas. Also in the dish: an apple, a squeeze of lemon, a pinch of cinnamon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked mackerel kedgeree · `mackerel-kedgeree`

A realistic, appetising food photograph of smoked mackerel kedgeree: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from rice, smoked mackerel fillets, free-range eggs, frozen peas or petits pois. Also in the dish: an onion, chopped, a teaspoon of curry powder, fresh parsley, a squeeze of lemon, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Black bean and potato hash · `black-bean-potato-hash`

A realistic, appetising food photograph of black bean and potato hash: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tinned new potatoes, black beans in water, tomato salsa, olive oil. Also in the dish: a red pepper, chopped, an onion, chopped, smoked paprika and ground cumin, fresh coriander. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

## Lunch

### Chicken and yogurt wraps · `chicken-wraps`

A realistic, appetising food photograph of chicken and yogurt wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, tortilla wraps, fat-free greek-style yogurt, mature cheddar. Also in the dish: lettuce, lemon and seasoning. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Halloumi and chickpea wraps · `halloumi-wraps`

A realistic, appetising food photograph of halloumi and chickpea wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from halloumi, chickpeas in water, tortilla wraps, houmous. Also in the dish: lettuce, tomato and a squeeze of lemon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and sweetcorn pasta salad · `tuna-sweetcorn-pasta-salad`

A realistic, appetising food photograph of tuna and sweetcorn pasta salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, tuna chunks in brine or spring water, sweetcorn, light mayonnaise. Also in the dish: spring onions, black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken Caesar-style wraps · `chicken-caesar-wraps`

A realistic, appetising food photograph of chicken caesar-style wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, tortilla wraps, italian hard cheese, light mayonnaise. Also in the dish: cos or romaine lettuce, a squeeze of lemon, black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Halloumi, chickpea and rice salad · `halloumi-chickpea-rice-salad`

A realistic, appetising food photograph of halloumi, chickpea and rice salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from halloumi, chickpeas in water, rice. Also in the dish: cucumber, cherry tomatoes, fresh mint or parsley, a squeeze of lemon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Mexican bean and rice bowl · `mexican-bean-rice-bowl`

A realistic, appetising food photograph of mexican bean and rice bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from black beans in water, rice, sweetcorn, tomato salsa, mature cheddar. Also in the dish: ground cumin, a lime, fresh coriander, shredded lettuce. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked salmon and soft cheese wraps · `smoked-salmon-soft-cheese-wraps`

A realistic, appetising food photograph of smoked salmon and soft cheese wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from smoked salmon, light soft cheese, tortilla wraps. Also in the dish: cucumber, salad leaves, a squeeze of lemon, black pepper, fresh dill. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Egg mayonnaise wraps · `egg-mayonnaise-wraps`

A realistic, appetising food photograph of egg mayonnaise wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, light mayonnaise, tortilla wraps. Also in the dish: chives or spring onions, cress or salad leaves, black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Ham and soft cheese wraps · `ham-soft-cheese-wraps`

A realistic, appetising food photograph of ham and soft cheese wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cooked ham slices, light soft cheese, tortilla wraps. Also in the dish: tomatoes, salad leaves, a little mustard. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chickpea and feta salad · `chickpea-feta-salad`

A realistic, appetising food photograph of chickpea and feta salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, feta, olive oil. Also in the dish: cucumber, tomatoes, red onion, fresh parsley, juice of half a lemon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Pesto pasta salad with mozzarella · `pesto-pasta-mozzarella-salad`

A realistic, appetising food photograph of pesto pasta salad with mozzarella: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, green pesto, mozzarella. Also in the dish: cherry tomatoes, rocket or spinach, fresh basil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Sweet chilli prawn noodle salad · `sweet-chilli-prawn-noodle-salad`

A realistic, appetising food photograph of sweet chilli prawn noodle salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from king prawns, dried rice noodles, sweet chilli sauce. Also in the dish: carrot, cucumber, spring onions, a lime, fresh coriander. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Teriyaki tofu rice bowl · `teriyaki-tofu-rice-bowl`

A realistic, appetising food photograph of teriyaki tofu rice bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from firm tofu, rice, teriyaki sauce, frozen edamame beans. Also in the dish: spring onions, sesame seeds, sliced cucumber. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tomato and red lentil soup · `tomato-red-lentil-soup`

A realistic, appetising food photograph of tomato and red lentil soup: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red lentils, chopped tomatoes, vegetable stock cube or pot, olive oil. Also in the dish: an onion, two garlic cloves, ground cumin, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken and sweetcorn soup · `chicken-sweetcorn-soup`

A realistic, appetising food photograph of chicken and sweetcorn soup: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, sweetcorn, vegetable stock cube or pot, free-range eggs. Also in the dish: fresh ginger, spring onions, white pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Butter bean and tomato soup · `butter-bean-tomato-soup`

A realistic, appetising food photograph of butter bean and tomato soup: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from butter beans in water, chopped tomatoes, tomato purée, vegetable stock cube or pot, olive oil. Also in the dish: an onion, two garlic cloves, smoked paprika, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and butter bean salad · `tuna-butter-bean-salad`

A realistic, appetising food photograph of tuna and butter bean salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tuna chunks in brine or spring water, butter beans in water, olive oil. Also in the dish: red onion, cherry tomatoes, fresh parsley, juice of half a lemon, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked mackerel and new potato salad · `smoked-mackerel-new-potato-salad`

A realistic, appetising food photograph of smoked mackerel and new potato salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from smoked mackerel fillets, tinned new potatoes, frozen peas or petits pois, light mayonnaise. Also in the dish: a teaspoon of horseradish sauce, a squeeze of lemon, watercress or salad leaves, chives. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cheese and bean quesadillas · `cheese-bean-quesadillas`

A realistic, appetising food photograph of cheese and bean quesadillas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tortilla wraps, red kidney beans in water, mature cheddar, tomato salsa. Also in the dish: ground cumin, spring onions, salad leaves. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Edamame and peanut noodle salad · `edamame-peanut-noodle-salad`

A realistic, appetising food photograph of edamame and peanut noodle salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from frozen edamame beans, dried rice noodles, peanut butter, sweet chilli sauce. Also in the dish: carrot, red cabbage, spring onions, a lime, fresh coriander. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

## Dinner

### Chicken, rice and soy bowl · `chicken-rice-bowl`

A realistic, appetising food photograph of chicken, rice and soy bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, rice, soy sauce. Also in the dish: any vegetables you like, a little oil spray. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken curry with rice · `chicken-curry`

A realistic, appetising food photograph of chicken curry with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, curry paste, chopped tomatoes, fat-free greek-style yogurt, rice. Also in the dish: an onion or any vegetables you like. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef chilli and rice · `beef-chilli`

A realistic, appetising food photograph of beef chilli and rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, red kidney beans in water, chopped tomatoes, rice. Also in the dish: chilli powder, cumin and an onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Turkey bolognese · `turkey-bolognese`

A realistic, appetising food photograph of turkey bolognese: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from turkey mince, passata, spaghetti or linguine, mature cheddar. Also in the dish: garlic, dried herbs and any vegetables you like. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Salmon and soy noodles · `salmon-noodles`

A realistic, appetising food photograph of salmon and soy noodles: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, ready-to-wok noodles, soy sauce. Also in the dish: spring onions or any vegetables you like. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and tomato pasta · `tuna-pasta`

A realistic, appetising food photograph of tuna and tomato pasta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tuna chunks in brine or spring water, pasta shapes, passata, mature cheddar. Also in the dish: dried herbs or sweetcorn. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Thai prawn curry · `prawn-curry`

A realistic, appetising food photograph of thai prawn curry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from king prawns, light coconut milk, thai curry paste, rice. Also in the dish: any vegetables you like. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tofu satay noodles · `tofu-satay`

A realistic, appetising food photograph of tofu satay noodles: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from firm tofu, ready-to-wok noodles, peanut butter, soy sauce. Also in the dish: lime, chilli and any vegetables you like. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chickpea and tomato curry · `chickpea-curry`

A realistic, appetising food photograph of chickpea and tomato curry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, chopped tomatoes, curry paste, light coconut milk, rice. Also in the dish: an onion and spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Black bean chilli · `black-bean-chilli`

A realistic, appetising food photograph of black bean chilli: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from black beans in water, red kidney beans in water, chopped tomatoes, rice. Also in the dish: an onion, garlic, cumin and chilli powder. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cod with butter beans and tomatoes · `cod-butter-beans`

A realistic, appetising food photograph of cod with butter beans and tomatoes: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cod fillets, butter beans in water, chopped tomatoes. Also in the dish: garlic, a pinch of paprika and parsley. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Lentil and tomato pasta · `lentil-pasta`

A realistic, appetising food photograph of lentil and tomato pasta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from green lentils in water, passata, pasta shapes. Also in the dish: garlic, dried herbs and an onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken thigh, bean and tomato rice · `chicken-bean-rice`

A realistic, appetising food photograph of chicken thigh, bean and tomato rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken thigh fillets, black beans in water, chopped tomatoes, rice. Also in the dish: smoked paprika and an onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken jalfrezi with rice · `chicken-jalfrezi`

A realistic, appetising food photograph of chicken jalfrezi with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, curry paste, chopped tomatoes, rice. Also in the dish: an onion, two peppers, a green chilli, fresh coriander, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Lamb keema with peas and rice · `lamb-keema-peas`

A realistic, appetising food photograph of lamb keema with peas and rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from lamb mince, curry paste, chopped tomatoes, frozen peas or petits pois, rice. Also in the dish: an onion, garlic and ginger, fresh coriander, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Paneer and pea curry · `paneer-pea-curry`

A realistic, appetising food photograph of paneer and pea curry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from paneer, curry paste, chopped tomatoes, frozen peas or petits pois, rice. Also in the dish: an onion, garlic and ginger, fresh coriander, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Coconut red lentil dhal · `coconut-lentil-dhal`

A realistic, appetising food photograph of coconut red lentil dhal: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red lentils, light coconut milk, chopped tomatoes, curry paste, rice. Also in the dish: an onion, garlic and ginger, fresh coriander, a squeeze of lemon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Prawn pad thai-style noodles · `prawn-pad-thai`

A realistic, appetising food photograph of prawn pad thai-style noodles: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from dried rice noodles, king prawns, free-range eggs, peanut butter, soy sauce. Also in the dish: a lime, beansprouts, spring onions, a little chilli, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef teriyaki noodles · `beef-teriyaki-noodles`

A realistic, appetising food photograph of beef teriyaki noodles: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from beef steak, dried egg noodles, teriyaki sauce. Also in the dish: a pepper, broccoli, spring onions, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Sweet chilli chicken stir-fry · `sweet-chilli-chicken`

A realistic, appetising food photograph of sweet chilli chicken stir-fry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, sweet chilli sauce, rice. Also in the dish: a pepper, mangetout or broccoli, spring onions, a lime, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Thai chicken curry with rice · `thai-chicken-curry`

A realistic, appetising food photograph of thai chicken curry with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, thai curry paste, light coconut milk, rice. Also in the dish: green beans, a lime, fresh basil or coriander, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken fajitas with salsa · `chicken-fajitas`

A realistic, appetising food photograph of chicken fajitas with salsa: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, fajita seasoning, tortilla wraps, tomato salsa, fat-free greek-style yogurt. Also in the dish: two peppers, an onion, a lime, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef burrito bowl · `beef-burrito-bowl`

A realistic, appetising food photograph of beef burrito bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, fajita seasoning, rice, black beans in water, sweetcorn, tomato salsa. Also in the dish: lettuce, a lime, fresh coriander. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken shawarma-style wraps · `chicken-shawarma-wraps`

A realistic, appetising food photograph of chicken shawarma-style wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken thigh fillets, natural yogurt, tortilla wraps. Also in the dish: ground cumin and paprika, garlic, a lemon, lettuce, tomato and cucumber, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Spiced chickpea and potato curry · `chickpea-potato-curry`

A realistic, appetising food photograph of spiced chickpea and potato curry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, tinned new potatoes, chopped tomatoes, light coconut milk, curry paste, rice. Also in the dish: an onion, a bag of spinach, garlic and ginger, fresh coriander, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Teriyaki salmon rice bowl · `teriyaki-salmon-bowl`

A realistic, appetising food photograph of teriyaki salmon rice bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, teriyaki sauce, rice, frozen edamame beans. Also in the dish: spring onions, cucumber, a little chilli. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Prawn egg fried rice · `prawn-egg-fried-rice`

A realistic, appetising food photograph of prawn egg fried rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from rice, king prawns, free-range eggs, frozen peas or petits pois, soy sauce. Also in the dish: spring onions, garlic, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tofu and vegetable rice noodles · `tofu-rice-noodle-stir-fry`

A realistic, appetising food photograph of tofu and vegetable rice noodles: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from firm tofu, dried rice noodles, soy sauce, sweet chilli sauce. Also in the dish: a pepper, pak choi or broccoli, a carrot, spring onions, garlic and ginger, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Mexican chicken and bean rice · `mexican-chicken-rice`

A realistic, appetising food photograph of mexican chicken and bean rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, fajita seasoning, rice, red kidney beans in water, tomato salsa. Also in the dish: an onion, a pepper, a lime, fresh coriander, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Halloumi and black bean fajitas · `halloumi-bean-fajitas`

A realistic, appetising food photograph of halloumi and black bean fajitas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from halloumi, black beans in water, fajita seasoning, tortilla wraps, tomato salsa. Also in the dish: two peppers, an onion, a lime, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Moroccan-style chickpea stew with rice · `moroccan-chickpea-stew`

A realistic, appetising food photograph of moroccan-style chickpea stew with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, chopped tomatoes, raisins or sultanas, vegetable stock cube or pot, rice. Also in the dish: an onion, a carrot, ground cumin, cinnamon and paprika, fresh coriander, a lemon, a little oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Spaghetti bolognese · `spaghetti-bolognese`

A realistic, appetising food photograph of spaghetti bolognese: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, passata, tomato purée, spaghetti or linguine, italian hard cheese. Also in the dish: an onion and a carrot, garlic, dried oregano, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef lasagne · `beef-lasagne`

A realistic, appetising food photograph of beef lasagne: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, passata, tomato purée, dried lasagne sheets, light soft cheese, semi-skimmed milk, mozzarella. Also in the dish: an onion, a carrot and garlic, dried oregano or basil, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cottage pie with cheesy mash · `cottage-pie`

A realistic, appetising food photograph of cottage pie with cheesy mash: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, mixed vegetables in water, tomato purée, vegetable stock cube or pot, tinned new potatoes, mature cheddar. Also in the dish: an onion and a carrot, dried thyme, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken, tomato and mozzarella pasta bake · `chicken-mozzarella-pasta-bake`

A realistic, appetising food photograph of chicken, tomato and mozzarella pasta bake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, pasta shapes, passata, mozzarella. Also in the dish: garlic, dried basil or oregano, a handful of spinach, a little oil spray. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Salmon with new potatoes and peas · `salmon-new-potatoes-peas`

A realistic, appetising food photograph of salmon with new potatoes and peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, tinned new potatoes, frozen peas or petits pois. Also in the dish: lemon, fresh dill or parsley, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Pesto cod with crushed potatoes · `pesto-cod-crushed-potatoes`

A realistic, appetising food photograph of pesto cod with crushed potatoes: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cod fillets, green pesto, tinned new potatoes, olive oil. Also in the dish: cherry tomatoes, green beans, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Steak with crispy potatoes and peas · `steak-potatoes-peas`

A realistic, appetising food photograph of steak with crispy potatoes and peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from beef steak, tinned new potatoes, frozen peas or petits pois, olive oil. Also in the dish: garlic, fresh thyme or rosemary, mustard, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken thigh and potato traybake · `chicken-thigh-potato-traybake`

A realistic, appetising food photograph of chicken thigh and potato traybake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken thigh fillets, tinned new potatoes, olive oil. Also in the dish: a red onion and two peppers, smoked paprika, garlic, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Baked gnocchi with tomato and mozzarella · `baked-gnocchi-tomato-mozzarella`

A realistic, appetising food photograph of baked gnocchi with tomato and mozzarella: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from potato gnocchi, chopped tomatoes, mozzarella. Also in the dish: garlic, fresh basil, a little oil spray, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Easy macaroni cheese · `easy-macaroni-cheese`

A realistic, appetising food photograph of easy macaroni cheese: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, light soft cheese, mature cheddar, semi-skimmed milk. Also in the dish: a little mustard, black pepper, sliced tomatoes for the top. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bacon carbonara-style spaghetti · `bacon-carbonara-spaghetti`

A realistic, appetising food photograph of bacon carbonara-style spaghetti: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from spaghetti or linguine, bacon medallions, free-range eggs, italian hard cheese. Also in the dish: black pepper, garlic, fresh parsley. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Turkey meatballs with spaghetti · `turkey-meatballs-spaghetti`

A realistic, appetising food photograph of turkey meatballs with spaghetti: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from turkey mince, passata, spaghetti or linguine. Also in the dish: garlic, dried mixed herbs, fresh basil, a little oil spray, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Shepherd's pie · `shepherds-pie`

A realistic, appetising food photograph of shepherd's pie: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from lamb mince, mixed vegetables in water, tomato purée, vegetable stock cube or pot, tinned new potatoes. Also in the dish: an onion and a carrot, fresh or dried rosemary, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Lentil cottage pie · `lentil-cottage-pie`

A realistic, appetising food photograph of lentil cottage pie: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from green lentils in water, mixed vegetables in water, chopped tomatoes, tomato purée, vegetable stock cube or pot, tinned new potatoes, olive oil. Also in the dish: an onion, a carrot and a stick of celery, garlic, dried thyme, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken and butter bean stew · `chicken-butter-bean-stew`

A realistic, appetising food photograph of chicken and butter bean stew: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, butter beans in water, chopped tomatoes, vegetable stock cube or pot. Also in the dish: an onion, garlic, smoked paprika, a big handful of spinach, a little oil spray. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Prawn and tomato linguine · `prawn-tomato-linguine`

A realistic, appetising food photograph of prawn and tomato linguine: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from king prawns, spaghetti or linguine, chopped tomatoes, olive oil. Also in the dish: garlic, chilli flakes, fresh parsley, lemon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Halloumi and chickpea traybake · `halloumi-chickpea-traybake`

A realistic, appetising food photograph of halloumi and chickpea traybake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from halloumi, chickpeas in water, tinned new potatoes, olive oil. Also in the dish: two peppers and a red onion, cherry tomatoes, smoked paprika and cumin, lemon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Minestrone with beans and pasta · `minestrone-beans-pasta`

A realistic, appetising food photograph of minestrone with beans and pasta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, butter beans in water, mixed vegetables in water, chopped tomatoes, vegetable stock cube or pot, olive oil. Also in the dish: an onion, a carrot and a stick of celery, garlic, fresh basil or dried mixed herbs, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

## Snacks

### Peanut butter oat bites · `peanut-butter-oat-bites`

A realistic, appetising food photograph of peanut butter oat bites: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, peanut butter, clear honey, raisins or sultanas. Also in the dish: a pinch of cinnamon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Edamame with soy and chilli · `edamame-soy-chilli`

A realistic, appetising food photograph of edamame with soy and chilli: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from frozen edamame beans, soy sauce. Also in the dish: a pinch of chilli flakes, a squeeze of lime, a crushed garlic clove, if you like. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Honey and almond yogurt pots · `honey-almond-yogurt-pots`

A realistic, appetising food photograph of honey and almond yogurt pots: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from fat-free greek-style yogurt, whole almonds, clear honey. Also in the dish: a pinch of cinnamon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Frozen yogurt and berry bark · `frozen-yogurt-berry-bark`

A realistic, appetising food photograph of frozen yogurt and berry bark: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from fat-free greek-style yogurt, mixed berries, clear honey. Also in the dish: a little grated lemon zest. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Ham and soft cheese roll-ups · `ham-soft-cheese-roll-ups`

A realistic, appetising food photograph of ham and soft cheese roll-ups: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cooked ham slices, light soft cheese. Also in the dish: cucumber or red pepper, cut into sticks, chopped chives, black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Devilled eggs · `devilled-eggs`

A realistic, appetising food photograph of devilled eggs: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, light mayonnaise. Also in the dish: paprika, chopped chives, salt and pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and butter bean dip · `tuna-butter-bean-dip`

A realistic, appetising food photograph of tuna and butter bean dip: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tuna chunks in brine or spring water, butter beans in water, olive oil. Also in the dish: carrot, cucumber and pepper sticks, a squeeze of lemon, chopped spring onion or parsley, black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked salmon cucumber bites · `smoked-salmon-cucumber-bites`

A realistic, appetising food photograph of smoked salmon cucumber bites: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from smoked salmon, light soft cheese. Also in the dish: half a cucumber, fresh dill, a squeeze of lemon, black pepper. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Crispy spiced chickpeas · `crispy-spiced-chickpeas`

A realistic, appetising food photograph of crispy spiced chickpeas: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, olive oil. Also in the dish: smoked paprika, ground cumin, a pinch of salt. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoky roasted almonds · `smoky-roasted-almonds`

A realistic, appetising food photograph of smoky roasted almonds: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from whole almonds, olive oil. Also in the dish: smoked paprika, a pinch of salt, a pinch of chilli powder, if you like. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cheese and bean quesadilla wedges · `cheese-bean-quesadilla-wedges`

A realistic, appetising food photograph of cheese and bean quesadilla wedges: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tortilla wraps, black beans in water, mature cheddar, tomato salsa. Also in the dish: chopped spring onion or fresh coriander, a pinch of chilli flakes. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.
