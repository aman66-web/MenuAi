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

A realistic, appetising food photograph of overnight oats with yogurt: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, fat-free greek-style yogurt, semi-skimmed milk, peanut butter, mixed berries. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cheesy scrambled egg wraps · `cheesy-egg-wraps`

A realistic, appetising food photograph of cheesy scrambled egg wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, mature cheddar, tortilla wraps, semi-skimmed milk, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Berry porridge with yogurt · `berry-yogurt-porridge`

A realistic, appetising food photograph of berry porridge with yogurt: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, semi-skimmed milk, fat-free greek-style yogurt, mixed berries. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Peanut butter and banana porridge · `peanut-banana-porridge`

A realistic, appetising food photograph of peanut butter and banana porridge: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, oat drink, peanut butter, bananas. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked salmon and scrambled eggs · `smoked-salmon-eggs`

A realistic, appetising food photograph of smoked salmon and scrambled eggs: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, smoked salmon. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Spanish-style omelette with potatoes and peas · `spanish-omelette`

A realistic, appetising food photograph of spanish-style omelette with potatoes and peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, tinned new potatoes, frozen peas or petits pois, olive oil, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bean breakfast burritos · `breakfast-burrito`

A realistic, appetising food photograph of bean breakfast burritos: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, red kidney beans in water, tortilla wraps, mature cheddar, tomato salsa, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bacon and egg breakfast wraps · `bacon-egg-wraps`

A realistic, appetising food photograph of bacon and egg breakfast wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from bacon medallions, free-range eggs, tortilla wraps, tomatoes, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Greek yogurt granola bowl · `greek-yogurt-granola`

A realistic, appetising food photograph of greek yogurt granola bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from fat-free greek-style yogurt, granola, mixed berries, clear honey. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cottage cheese, berries, honey and almonds · `cottage-cheese-berries`

A realistic, appetising food photograph of cottage cheese, berries, honey and almonds: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cottage cheese, mixed berries, clear honey, whole almonds. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Wholewheat biscuits with milk and berries · `wheat-biscuits-berries`

A realistic, appetising food photograph of wholewheat biscuits with milk and berries: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from wholewheat breakfast biscuits, semi-skimmed milk, mixed berries. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Shakshuka · `shakshuka`

A realistic, appetising food photograph of shakshuka: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, chopped tomatoes, onion, peppers, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Baked beans with poached eggs · `beans-poached-eggs`

A realistic, appetising food photograph of baked beans with poached eggs: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from baked beans in tomato sauce, free-range eggs, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Ham and cheese omelette · `ham-cheese-omelette`

A realistic, appetising food photograph of ham and cheese omelette: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, cooked ham slices, mature cheddar. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Mushroom and bean breakfast wraps · `mushroom-bean-breakfast-wraps`

A realistic, appetising food photograph of mushroom and bean breakfast wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from baked beans in tomato sauce, mushrooms, tortilla wraps, spinach, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Oat pancakes with yogurt and berries · `oat-pancakes`

A realistic, appetising food photograph of oat pancakes with yogurt and berries: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, free-range eggs, semi-skimmed milk, fat-free greek-style yogurt, mixed berries. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Huevos rancheros · `huevos-rancheros`

A realistic, appetising food photograph of huevos rancheros: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, red kidney beans in water, tomato salsa, tortilla wraps. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Apple Bircher muesli · `bircher-muesli`

A realistic, appetising food photograph of apple bircher muesli: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, oat drink, whole almonds, raisins or sultanas, apples, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked salmon kedgeree · `smoked-salmon-kedgeree`

A realistic, appetising food photograph of smoked salmon kedgeree: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from rice, smoked salmon, free-range eggs, frozen peas or petits pois, onion, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bean and potato hash · `bean-potato-hash`

A realistic, appetising food photograph of bean and potato hash: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tinned new potatoes, red kidney beans in water, tomato salsa, olive oil, peppers, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

## Lunch

### Chicken and yogurt wraps · `chicken-wraps`

A realistic, appetising food photograph of chicken and yogurt wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, tortilla wraps, fat-free greek-style yogurt, mature cheddar, lettuce, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chickpea and houmous wraps · `chickpea-houmous-wraps`

A realistic, appetising food photograph of chickpea and houmous wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, tortilla wraps, houmous, lettuce, tomatoes, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and sweetcorn pasta salad · `tuna-sweetcorn-pasta-salad`

A realistic, appetising food photograph of tuna and sweetcorn pasta salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, tuna chunks in brine or spring water, sweetcorn, light mayonnaise, spring onions. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### BBQ chicken and pepper wraps · `chicken-caesar-wraps`

A realistic, appetising food photograph of bbq chicken and pepper wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, tortilla wraps, barbecue sauce, peppers, mature cheddar, lettuce. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Mushroom and mozzarella wrap pizzas · `mushroom-wrap-pizzas`

A realistic, appetising food photograph of mushroom and mozzarella wrap pizzas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tortilla wraps, passata, mozzarella, mushrooms. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Mexican bean and rice bowl · `mexican-bean-rice-bowl`

A realistic, appetising food photograph of mexican bean and rice bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red kidney beans in water, rice, sweetcorn, tomato salsa, mature cheddar, lemon juice, lettuce. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked salmon and soft cheese wraps · `smoked-salmon-soft-cheese-wraps`

A realistic, appetising food photograph of smoked salmon and soft cheese wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from smoked salmon, light soft cheese, tortilla wraps, cucumber, salad leaves, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Egg mayonnaise wraps · `egg-mayonnaise-wraps`

A realistic, appetising food photograph of egg mayonnaise wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, light mayonnaise, tortilla wraps, spring onions, salad leaves. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Ham and soft cheese wraps · `ham-soft-cheese-wraps`

A realistic, appetising food photograph of ham and soft cheese wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cooked ham slices, light soft cheese, tortilla wraps, tomatoes, salad leaves. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chickpea, cucumber and tomato salad · `chickpea-tomato-salad`

A realistic, appetising food photograph of chickpea, cucumber and tomato salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, olive oil, cucumber, tomatoes, red onion, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Pesto pasta salad with mozzarella · `pesto-pasta-mozzarella-salad`

A realistic, appetising food photograph of pesto pasta salad with mozzarella: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, green pesto, mozzarella, cherry tomatoes, salad leaves. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Sweet chilli chicken noodle salad · `sweet-chilli-chicken-noodle-salad`

A realistic, appetising food photograph of sweet chilli chicken noodle salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, ready-to-wok noodles, sweet chilli sauce, carrots, cucumber, spring onions, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Sweet chilli chickpea rice bowl · `chickpea-rice-bowl`

A realistic, appetising food photograph of sweet chilli chickpea rice bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, rice, soy sauce, sweet chilli sauce, frozen peas or petits pois, spring onions, cucumber. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Sweetcorn and potato soup · `sweetcorn-potato-soup`

A realistic, appetising food photograph of sweetcorn and potato soup: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from sweetcorn, tinned new potatoes, vegetable stock cube, olive oil, onion, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken and sweetcorn soup · `chicken-sweetcorn-soup`

A realistic, appetising food photograph of chicken and sweetcorn soup: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, sweetcorn, vegetable stock cube, free-range eggs, spring onions. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bean and tomato soup · `bean-tomato-soup`

A realistic, appetising food photograph of bean and tomato soup: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red kidney beans in water, chopped tomatoes, tomato purée, vegetable stock cube, olive oil, onion, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and bean salad · `tuna-bean-salad`

A realistic, appetising food photograph of tuna and bean salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tuna chunks in brine or spring water, red kidney beans in water, olive oil, red onion, cherry tomatoes, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### New potato, egg and pea salad · `potato-egg-salad`

A realistic, appetising food photograph of new potato, egg and pea salad: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, tinned new potatoes, frozen peas or petits pois, light mayonnaise, lemon juice, salad leaves. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cheese and bean quesadillas · `cheese-bean-quesadillas`

A realistic, appetising food photograph of cheese and bean quesadillas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tortilla wraps, red kidney beans in water, mature cheddar, tomato salsa, spring onions, salad leaves. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Curried rice salad with raisins and almonds · `curried-rice-salad`

A realistic, appetising food photograph of curried rice salad with raisins and almonds: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from rice, whole almonds, raisins or sultanas, peppers, spring onions, olive oil, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

## Dinner

### Chicken, rice and soy bowl · `chicken-rice-bowl`

A realistic, appetising food photograph of chicken, rice and soy bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, rice, soy sauce, fresh vegetable stir fry. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken curry with rice · `chicken-curry`

A realistic, appetising food photograph of chicken curry with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, curry paste, chopped tomatoes, fat-free greek-style yogurt, rice, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef chilli and rice · `beef-chilli`

A realistic, appetising food photograph of beef chilli and rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, red kidney beans in water, chopped tomatoes, rice, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Creamy chicken and mushroom pasta · `chicken-mushroom-pasta`

A realistic, appetising food photograph of creamy chicken and mushroom pasta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, pasta shapes, mushrooms, light soft cheese, vegetable stock cube, garlic purée or paste, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Salmon and soy noodles · `salmon-noodles`

A realistic, appetising food photograph of salmon and soy noodles: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, ready-to-wok noodles, soy sauce, spring onions. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and tomato pasta · `tuna-pasta`

A realistic, appetising food photograph of tuna and tomato pasta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tuna chunks in brine or spring water, pasta shapes, passata, mature cheddar. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Coconut salmon curry with rice · `salmon-coconut-curry`

A realistic, appetising food photograph of coconut salmon curry with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, coconut milk, curry paste, rice, frozen peas or petits pois. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Satay noodles with egg · `satay-egg-noodles`

A realistic, appetising food photograph of satay noodles with egg: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, ready-to-wok noodles, peanut butter, soy sauce, lemon juice, fresh vegetable stir fry. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chickpea and tomato curry · `chickpea-curry`

A realistic, appetising food photograph of chickpea and tomato curry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, chopped tomatoes, curry paste, coconut milk, rice, onion, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bean chilli · `bean-chilli`

A realistic, appetising food photograph of bean chilli: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red kidney beans in water, chickpeas in water, chopped tomatoes, rice, onion, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna fishcakes with peas · `tuna-fishcakes`

A realistic, appetising food photograph of tuna fishcakes with peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tuna chunks in brine or spring water, tinned new potatoes, free-range eggs, spring onions, frozen peas or petits pois, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Mushroom and bean pasta · `mushroom-bean-pasta`

A realistic, appetising food photograph of mushroom and bean pasta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red kidney beans in water, mushrooms, passata, pasta shapes, olive oil, garlic purée or paste, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken thigh, bean and tomato rice · `chicken-bean-rice`

A realistic, appetising food photograph of chicken thigh, bean and tomato rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken thigh fillets, red kidney beans in water, chopped tomatoes, rice, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken jalfrezi with rice · `chicken-jalfrezi`

A realistic, appetising food photograph of chicken jalfrezi with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, curry paste, chopped tomatoes, rice, onion, peppers. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef keema with peas and rice · `beef-keema-peas`

A realistic, appetising food photograph of beef keema with peas and rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, curry paste, chopped tomatoes, frozen peas or petits pois, rice, onion, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Egg and pea curry · `egg-pea-curry`

A realistic, appetising food photograph of egg and pea curry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, curry paste, chopped tomatoes, frozen peas or petits pois, rice, onion, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Kidney bean curry with rice · `kidney-bean-curry`

A realistic, appetising food photograph of kidney bean curry with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red kidney beans in water, chopped tomatoes, curry paste, rice, onion, garlic purée or paste, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken chow mein · `chicken-chow-mein`

A realistic, appetising food photograph of chicken chow mein: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, ready-to-wok noodles, soy sauce, fresh vegetable stir fry, spring onions, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Sticky soy beef noodles · `sticky-beef-noodles`

A realistic, appetising food photograph of sticky soy beef noodles: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, ready-to-wok noodles, soy sauce, clear honey, garlic purée or paste, broccoli, peppers, spring onions. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Sweet chilli chicken stir-fry · `sweet-chilli-chicken`

A realistic, appetising food photograph of sweet chilli chicken stir-fry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, sweet chilli sauce, rice, peppers, broccoli, spring onions, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Spiced yogurt chicken with naan · `spiced-chicken-naan`

A realistic, appetising food photograph of spiced yogurt chicken with naan: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, curry paste, fat-free greek-style yogurt, plain naan breads, lemon juice, peppers, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken fajitas with salsa · `chicken-fajitas`

A realistic, appetising food photograph of chicken fajitas with salsa: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, fajita seasoning, tortilla wraps, tomato salsa, fat-free greek-style yogurt, peppers, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef burrito bowl · `beef-burrito-bowl`

A realistic, appetising food photograph of beef burrito bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, fajita seasoning, rice, red kidney beans in water, sweetcorn, tomato salsa, lettuce. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken shawarma-style wraps · `chicken-shawarma-wraps`

A realistic, appetising food photograph of chicken shawarma-style wraps: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken thigh fillets, natural yogurt, tortilla wraps, garlic purée or paste, lemon juice, lettuce, tomatoes, cucumber. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Spiced chickpea and potato curry · `chickpea-potato-curry`

A realistic, appetising food photograph of spiced chickpea and potato curry: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, tinned new potatoes, chopped tomatoes, coconut milk, curry paste, rice, onion, spinach, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Soy and honey salmon rice bowl · `soy-honey-salmon-bowl`

A realistic, appetising food photograph of soy and honey salmon rice bowl: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, soy sauce, clear honey, rice, broccoli, spring onions, cucumber. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Egg fried rice with peas · `egg-fried-rice`

A realistic, appetising food photograph of egg fried rice with peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from rice, free-range eggs, frozen peas or petits pois, soy sauce, spring onions, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Vegetable and almond stir-fry with rice · `vegetable-almond-stir-fry`

A realistic, appetising food photograph of vegetable and almond stir-fry with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from rice, whole almonds, soy sauce, sweet chilli sauce, peppers, broccoli, carrots, spring onions, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Mexican chicken and bean rice · `mexican-chicken-rice`

A realistic, appetising food photograph of mexican chicken and bean rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, fajita seasoning, rice, red kidney beans in water, tomato salsa, onion, peppers. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bean and pepper fajitas · `bean-pepper-fajitas`

A realistic, appetising food photograph of bean and pepper fajitas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red kidney beans in water, fajita seasoning, tortilla wraps, tomato salsa, peppers, onion. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Moroccan-style chickpea stew with rice · `moroccan-chickpea-stew`

A realistic, appetising food photograph of moroccan-style chickpea stew with rice: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, chopped tomatoes, raisins or sultanas, vegetable stock cube, rice, onion, carrots, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Spaghetti bolognese · `spaghetti-bolognese`

A realistic, appetising food photograph of spaghetti bolognese: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, passata, tomato purée, spaghetti or linguine, mature cheddar, onion, carrots, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cheesy beef pasta bake · `beef-pasta-bake`

A realistic, appetising food photograph of cheesy beef pasta bake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, passata, tomato purée, pasta shapes, light soft cheese, semi-skimmed milk, mozzarella, onion, carrots, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cottage pie with cheesy mash · `cottage-pie`

A realistic, appetising food photograph of cottage pie with cheesy mash: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, frozen peas or petits pois, tomato purée, vegetable stock cube, tinned new potatoes, mature cheddar, onion, carrots. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken, tomato and mozzarella pasta bake · `chicken-mozzarella-pasta-bake`

A realistic, appetising food photograph of chicken, tomato and mozzarella pasta bake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, pasta shapes, passata, mozzarella, garlic purée or paste, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Salmon with new potatoes and peas · `salmon-new-potatoes-peas`

A realistic, appetising food photograph of salmon with new potatoes and peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, tinned new potatoes, frozen peas or petits pois, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Pesto salmon with crushed potatoes · `pesto-salmon-crushed-potatoes`

A realistic, appetising food photograph of pesto salmon with crushed potatoes: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, green pesto, tinned new potatoes, olive oil, cherry tomatoes, broccoli. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Ham, egg and crispy potatoes with peas · `ham-egg-potatoes`

A realistic, appetising food photograph of ham, egg and crispy potatoes with peas: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cooked ham slices, free-range eggs, tinned new potatoes, frozen peas or petits pois, olive oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken thigh and potato traybake · `chicken-thigh-potato-traybake`

A realistic, appetising food photograph of chicken thigh and potato traybake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken thigh fillets, tinned new potatoes, olive oil, red onion, peppers, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Potato, tomato and mozzarella bake · `potato-tomato-mozzarella-bake`

A realistic, appetising food photograph of potato, tomato and mozzarella bake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tinned new potatoes, chopped tomatoes, mozzarella, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Easy macaroni cheese · `easy-macaroni-cheese`

A realistic, appetising food photograph of easy macaroni cheese: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, light soft cheese, mature cheddar, semi-skimmed milk, tomatoes. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bacon carbonara-style spaghetti · `bacon-carbonara-spaghetti`

A realistic, appetising food photograph of bacon carbonara-style spaghetti: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from spaghetti or linguine, bacon medallions, free-range eggs, mature cheddar, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Beef meatballs with spaghetti · `beef-meatballs-spaghetti`

A realistic, appetising food photograph of beef meatballs with spaghetti: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from 5% fat beef mince, passata, spaghetti or linguine, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Salmon and pea fish pie · `salmon-fish-pie`

A realistic, appetising food photograph of salmon and pea fish pie: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from salmon fillets, frozen peas or petits pois, light soft cheese, semi-skimmed milk, tinned new potatoes, mature cheddar, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bean and mushroom cottage pie · `bean-cottage-pie`

A realistic, appetising food photograph of bean and mushroom cottage pie: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from red kidney beans in water, mushrooms, frozen peas or petits pois, chopped tomatoes, tomato purée, vegetable stock cube, tinned new potatoes, olive oil, onion, carrots, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chicken and chickpea stew · `chicken-chickpea-stew`

A realistic, appetising food photograph of chicken and chickpea stew: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chicken breast fillets, chickpeas in water, chopped tomatoes, vegetable stock cube, onion, garlic purée or paste, spinach. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Bacon and tomato linguine · `bacon-tomato-linguine`

A realistic, appetising food photograph of bacon and tomato linguine: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from bacon medallions, spaghetti or linguine, chopped tomatoes, olive oil, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Chickpea, potato and pepper traybake · `chickpea-potato-traybake`

A realistic, appetising food photograph of chickpea, potato and pepper traybake: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, tinned new potatoes, olive oil, red onion, peppers, cherry tomatoes, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Minestrone with beans and pasta · `minestrone-beans-pasta`

A realistic, appetising food photograph of minestrone with beans and pasta: one home-made portion on a plain white plate or in a plain white bowl, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from pasta shapes, red kidney beans in water, frozen peas or petits pois, chopped tomatoes, vegetable stock cube, olive oil, onion, carrots, garlic purée or paste. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

## Snacks

### Peanut butter oat bites · `peanut-butter-oat-bites`

A realistic, appetising food photograph of peanut butter oat bites: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from porridge oats, peanut butter, clear honey, raisins or sultanas. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Houmous with vegetable sticks · `houmous-veg-sticks`

A realistic, appetising food photograph of houmous with vegetable sticks: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from houmous, carrots, cucumber, peppers. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Honey and almond yogurt pots · `honey-almond-yogurt-pots`

A realistic, appetising food photograph of honey and almond yogurt pots: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from fat-free greek-style yogurt, whole almonds, clear honey. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Frozen yogurt and berry bark · `frozen-yogurt-berry-bark`

A realistic, appetising food photograph of frozen yogurt and berry bark: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from fat-free greek-style yogurt, mixed berries, clear honey. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Ham and soft cheese roll-ups · `ham-soft-cheese-roll-ups`

A realistic, appetising food photograph of ham and soft cheese roll-ups: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from cooked ham slices, light soft cheese, cucumber. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Devilled eggs · `devilled-eggs`

A realistic, appetising food photograph of devilled eggs: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from free-range eggs, light mayonnaise. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Tuna and chickpea dip · `tuna-chickpea-dip`

A realistic, appetising food photograph of tuna and chickpea dip: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tuna chunks in brine or spring water, chickpeas in water, olive oil, carrots, cucumber, peppers, lemon juice, spring onions. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Smoked salmon cucumber bites · `smoked-salmon-cucumber-bites`

A realistic, appetising food photograph of smoked salmon cucumber bites: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from smoked salmon, light soft cheese, cucumber, lemon juice. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Crispy spiced chickpeas · `crispy-spiced-chickpeas`

A realistic, appetising food photograph of crispy spiced chickpeas: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from chickpeas in water, olive oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Paprika roasted almonds · `paprika-roasted-almonds`

A realistic, appetising food photograph of paprika roasted almonds: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from whole almonds, olive oil. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.

### Cheese and salsa quesadilla wedges · `cheese-bean-quesadilla-wedges`

A realistic, appetising food photograph of cheese and salsa quesadilla wedges: a small snack portion on a plain white plate, on a light wooden kitchen table, seen from a three-quarter angle, soft natural daylight, shallow depth of field, landscape 4:3. It is made from tortilla wraps, mature cheddar, tomato salsa, spring onions. Show only the finished dish as someone would cook it at home, in natural colours. No packaging, jars, tins or bottles; no labels, writing, numbers, logos or brand names anywhere; no people or hands.
