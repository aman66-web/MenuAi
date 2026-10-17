# Recipe picture prompts (Midjourney, bird's-eye view)

One Midjourney prompt per recipe in the app's recipe book. Founder's decisions: 2026-10-10 (CLAUDE.md rule 2) our own recipes may show an illustration made with AI, which the app captions
"Illustration made with AI, not a photo of the products below." and never uses for a restaurant's or a supermarket's item; 2026-10-16 the pictures are made with Midjourney and every one is a bird's-eye view.

Pictures that have been added are ticked. This file is rewritten from the recipe book by `WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts` (run in `web/`), so don't edit it by hand;
each recipe's description of how it looks from above is in `web/lib/mm/recipeBook/looks.ts`, the shared style and settings are at the top of `web/tests/recipeImages.test.ts`.

## Read first: Midjourney's rules

Midjourney's Community Guidelines say it has no API and that **automating interactions with Midjourney is prohibited; accounts that do not comply may be blocked**
(https://docs.midjourney.com/docs/community-guidelines). Letting Claude in Chrome paste the prompts and click through the site is automation of that kind, so it could put the founder's account at risk: read the current terms and decide.
The safe way is for a person to paste each prompt (117 of them) and download the pictures; the hand-over below also works for a person following it. Images made on a paid plan can be used commercially under Midjourney's terms (check the
current plan rules: a company above a revenue threshold needs the Pro plan). If Midjourney is not wanted, the same descriptions work in Nano Banana: drop the `--` settings at the end of each prompt.

## Hand-over for Claude in Chrome (or for a person)

You are making one picture per recipe with Midjourney for Numbite, a UK calories and protein app. The founder is logged in to Midjourney in this browser with a paid plan. Work in the Midjourney tab only, one recipe at a time, one job at a time.

1. Open https://www.midjourney.com/imagine. The prompts already say `--v 7 --ar 4:3 --style raw`.
2. Take the recipes below in order. Paste each prompt **exactly as written** (do not edit, shorten or add words; the only addition allowed is the `--sref` in step 5), submit it, and wait until the four pictures have finished.
3. Choose the best of the four that passes **every** point: (a) taken straight down from above, not tilted, the plate or bowl fully in view and centred with space around it; (b) it shows the dish described and no other food (no lemon wedge, herbs, sauce pot or side dish that the prompt does not mention);
   (c) no writing, letters, numbers, logos, brand names, packaging, jars, tins or bottles anywhere; (d) no hands, people, cutlery or steam; (e) natural food colours, appetising, nothing that looks plastic, burnt or half-raw; (f) one portion, on a light wooden table; (g) not nearly the same picture as another recipe's.
4. Open the chosen picture, upscale it (Upscale Subtle) if offered, and download the PNG. Save it as **`<recipe id>.png`** (the id is the code in the heading, for example `overnight-oats.png`) in one folder, `numbite-recipe-images`, in Downloads.
   If none of the four passes, run the same prompt again (or Vary Subtle on the closest), at most three tries; if it still fails, write the id on a NEEDS ATTENTION list and move on.
5. **One look for the whole set:** when the first picture (`overnight-oats`) has been chosen, copy its image link and add ` --sref <that link>` to the end of every later prompt. If the pictures start to look too alike, stop adding it.
6. Pace: send the next prompt only after the previous one is finished; never several at once; if Midjourney asks you to slow down or wait, wait.
7. **Stop and tell the founder** if Midjourney shows a CAPTCHA or human-verification step, a login or payment page, an error about too many jobs, or any warning about the account. Do not try to get past it.
8. Keep a running list in your replies: done, and NEEDS ATTENTION. When finished, say which ids are done, which need attention, and where the files are. Do not upload other images, change the prompts, or add text or branding to any picture.

Then, on the founder's computer: copy the PNG files into `data/recipe-images/` (named `<recipe id>.png`), run `python3 tools/recipes/import_recipe_images.py` (it crops to 4:3, resizes to 800 x 600, writes WebP copies into `web/public/recipe-images/`
and lists them in `web/lib/mm/recipeImages.ts`), then commit and push. Or send the files to Claude and it does this.

117 recipes, 0 with a picture.

## Breakfast

### Overnight oats with yogurt · `overnight-oats`

```
Overnight oats in a wide shallow white bowl: a thick, pale oat and yogurt surface with a golden-brown spiral of peanut butter from the centre outwards, and a tight cluster of glossy deep red and purple mixed berries heaped on one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy scrambled egg wraps · `cheesy-egg-wraps`

```
Two halves of a tortilla wrap rolled around soft yellow scrambled egg, dark green wilted spinach and melted orange cheddar, laid side by side on a pale wooden board with the cut ends showing the filling. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Berry porridge with yogurt · `berry-yogurt-porridge`

```
A round white bowl of thick, pale oat porridge, its surface topped with a dollop of thick white yogurt in the centre and a scatter of deep red and purple mixed berries around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter and banana porridge · `peanut-banana-porridge`

```
A shallow white bowl of thick, pale oat porridge with a swirl of golden-brown peanut butter through the middle, topped with overlapping round slices of banana arranged in a ring. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon and scrambled eggs · `smoked-salmon-eggs`

```
A round white plate holding a soft, glossy mound of pale yellow scrambled eggs with torn ribbons of pink-orange smoked salmon folded through, flecked with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spanish-style omelette with potatoes and peas · `spanish-omelette`

```
A single thick wedge of Spanish-style omelette on a round white plate, its pale yellow set top meeting cut sides that show golden potato slices, green peas and softened onion held in firm egg. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean breakfast burritos · `breakfast-burrito`

```
A burrito cut in half on a round white plate, the two halves side by side, the cut ends showing yellow scrambled egg, reddish-brown crushed kidney beans, green spinach, orange cheddar and red tomato salsa inside the wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bacon and egg breakfast wraps · `bacon-egg-wraps`

```
One bacon and egg wrap cut in half on the diagonal, the two pieces laid as an angled pair on a white rectangular plate, the cut ends showing browned grilled bacon, yellow scrambled egg, dark green spinach and red tomato slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Greek yogurt granola bowl · `greek-yogurt-granola`

```
A wide shallow white bowl of thick white yogurt, one half covered with golden-brown granola clusters and the other half with a heap of deep red and purple mixed berries, thin golden threads of honey crossing between them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese, berries, honey and almonds · `cottage-cheese-berries`

```
A small deep white bowl of white, lumpy cottage cheese curds with a cluster of deep red and purple mixed berries in the centre, a golden spiral of honey over them and roughly chopped almonds scattered over the curds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Wholewheat biscuits with milk and berries · `wheat-biscuits-berries`

```
Two oblong wheat biscuits, pale golden-beige with a fine shredded texture, sit in a round white bowl in pale milk that shows around them, topped with a scatter of deep red and purple mixed berries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Shakshuka · `shakshuka`

```
A white oval dish of thick orange-red tomato sauce speckled with pieces of softened onion and red pepper, with two eggs set into it, the whites opaque and the yolks bright yellow. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Baked beans with poached eggs · `beans-poached-eggs`

```
A round white soup plate of baked beans in glossy orange-red tomato sauce with wilted dark green spinach through it, two poached eggs with set whites and bright yellow yolks resting on top, and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ham and cheese omelette · `ham-cheese-omelette`

```
A folded half-moon omelette on a white square plate, pale golden and smooth on top, with melted orange cheddar and torn pieces of pink ham just showing at the open edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mushroom and bean breakfast wraps · `mushroom-bean-breakfast-wraps`

```
Two halves of a rolled tortilla wrap laid side by side on a white oval plate, the cut ends showing orange-red baked beans, golden-brown sliced mushrooms and dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Oat pancakes with yogurt and berries · `oat-pancakes`

```
Several small round, golden-brown oat pancakes overlapping on a round white plate, with a dollop of thick white yogurt in the middle and deep red and purple mixed berries scattered over and beside them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Huevos rancheros · `huevos-rancheros`

```
A flat round tortilla wrap on a round white plate, spread with reddish-brown crushed kidney beans and topped with two fried eggs, white with bright yellow yolks, and red tomato salsa laid between them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Apple Bircher muesli · `bircher-muesli`

```
Bircher muesli in a deep round pale grey bowl: creamy pale soaked oats flecked with fine grated apple and dark raisins, with a heap of roughly chopped almonds in the centre and a few raisins dotted around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon kedgeree · `smoked-salmon-kedgeree`

```
Smoked salmon kedgeree in a shallow white bowl: golden curry-tinted rice dotted with green peas and softened onion, torn strips of pink smoked salmon folded through, and boiled egg quarters with set yellow yolks arranged on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and potato hash · `bean-potato-hash`

```
Bean and potato hash on a wide white round plate: golden, crisp-edged halved new potatoes, pieces of red pepper and softened onion dusted orange-brown with spices, dark red kidney beans mixed through, and chunky red tomato salsa spread over the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mince pie porridge · `mince-pie-porridge`

```
A round white bowl of thick, creamy pale oat porridge with a dollop of white yogurt in the middle, a spoonful of dark glossy mincemeat on top of the yogurt and roughly chopped almonds scattered over and around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

## Lunch

### Chicken and yogurt wraps · `chicken-wraps`

```
One chicken and yogurt wrap cut in half, the two halves leaning together in a V on a round white plate, the cut ends facing outwards and showing browned chicken slices, green lettuce, white yogurt and orange grated cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea and houmous wraps · `chickpea-houmous-wraps`

```
One chickpea and houmous wrap cut in half on the diagonal on a pale wooden board, one half resting across the other, the cut ends showing beige houmous, spice-dusted chickpeas, green lettuce and red tomato slices inside a soft pale wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and sweetcorn pasta salad · `tuna-sweetcorn-pasta-salad`

```
Tuna and sweetcorn pasta salad heaped in a shallow round white bowl: pasta shapes coated in creamy mayonnaise, with flakes of pale pink tuna, yellow sweetcorn kernels, thin rings of green spring onion and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### BBQ chicken and pepper wraps · `chicken-caesar-wraps`

```
One barbecue chicken and red pepper wrap cut in half and laid head to tail on a pale grey round plate, the cut ends showing glossy dark-glazed chicken strips, red pepper strips, green lettuce and orange grated cheddar inside a soft pale wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mushroom and mozzarella wrap pizzas · `mushroom-wrap-pizzas`

```
One round wrap pizza on a pale wooden board, spread with red passata and topped with sliced brown mushrooms and torn white mozzarella melted into creamy white patches, with crisp edges and a sprinkle of dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mexican bean and rice bowl · `mexican-bean-rice-bowl`

```
Mexican bean and rice bowl in a wide white round bowl, filled in sections: white rice, dark kidney beans with yellow sweetcorn, shredded green lettuce, a patch of red salsa, and orange grated cheddar scattered over the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon and soft cheese wraps · `smoked-salmon-soft-cheese-wraps`

```
One smoked salmon and soft cheese wrap cut in half and set side by side on a white square plate, the cut ends showing white soft cheese, pink smoked salmon, green cucumber slices and a few salad leaves inside a soft pale wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg mayonnaise wraps · `egg-mayonnaise-wraps`

```
One egg mayonnaise wrap cut into two halves, one half overlapping the other in a short diagonal row on a pale wooden board, the cut ends showing a creamy mash of yellow and white egg with green spring onion flecks and salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ham and soft cheese wraps · `ham-soft-cheese-wraps`

```
One ham and soft cheese wrap cut in half, the halves set side by side and slightly staggered on a white oval plate, the cut ends showing pink ham, white soft cheese, red tomato slices and green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea, cucumber and tomato salad · `chickpea-tomato-salad`

```
Chickpea, cucumber and tomato salad in a shallow white bowl: pale golden chickpeas mixed with pieces of green-edged cucumber, red tomato and thin purple red onion, glistening with a thin olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pesto pasta salad with mozzarella · `pesto-pasta-mozzarella-salad`

```
Pesto pasta salad in a wide white pasta bowl: pasta shapes coated in green pesto, halved red cherry tomatoes and torn pieces of white mozzarella scattered over, with a few green salad leaves tucked on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweet chilli chicken noodle salad · `sweet-chilli-chicken-noodle-salad`

```
Sweet chilli chicken noodle salad in a wide shallow white bowl: pale noodles tossed with orange grated carrot and cucumber sticks in a glossy red-orange glaze, topped with browned chicken slices fanned across one side and rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweet chilli chickpea rice bowl · `chickpea-rice-bowl`

```
Sweet chilli chickpea rice bowl in a shallow white bowl: a bed of white rice topped in the centre with a heap of golden chickpeas glazed glossy dark with soy and sweet chilli, ringed by green peas, cucumber slices and spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweetcorn and potato soup · `sweetcorn-potato-soup`

```
Chunky sweetcorn and potato soup in a deep round white bowl: a golden-yellow surface tinted orange by paprika, with whole yellow sweetcorn kernels and small pieces of pale potato showing through, glistening drops of olive oil and black pepper specks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and sweetcorn soup · `chicken-sweetcorn-soup`

```
Chicken and sweetcorn soup in a shallow white bowl: a pale golden broth holding small pieces of cooked white chicken, yellow sweetcorn kernels and thin ribbons of set egg, topped with rings of green spring onion and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and tomato soup · `bean-tomato-soup`

```
Bean and tomato soup in a wide white rimmed soup plate: a smooth, deep red-orange surface with golden beads of olive oil floating in a loose swirl and a scatter of black pepper specks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and bean salad · `tuna-bean-salad`

```
Tuna and bean salad heaped in a shallow white bowl: dark red kidney beans mixed with large pale flakes of tuna, thin purple red onion slices and halved cherry tomatoes, all glossy with a thin dressing and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### New potato, egg and pea salad · `potato-egg-salad`

```
A round white plate spread with green salad leaves, topped with halved small new potatoes and green peas coated in a pale creamy mustard dressing, and boiled egg quarters scattered over the top with their set yellow yolks showing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheese and bean quesadillas · `cheese-bean-quesadillas`

```
A pale wooden board holding one quesadilla cut into wedges, the toasted wrap golden brown with darker spots and the cut edges showing melted yellow cheese, red-brown mashed beans and green spring onion, with a small heap of salad leaves beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Curried rice salad with raisins and almonds · `curried-rice-salad`

```
Curried rice salad in a shallow white bowl: separate yellow-tinged rice grains dotted with diced red pepper, thin green spring onion slices and dark raisins, with roughly chopped almonds scattered across the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and mushroom noodle soup · `chicken-mushroom-noodle-soup`

```
A wide white soup bowl filled with clear golden-brown broth, its surface covered with tangled noodles, thin strips of cooked chicken and sliced brown mushrooms, finished with a scatter of thin spring onion slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Turkey, cranberry and cheddar wraps · `turkey-cranberry-cheddar-wraps`

```
Two tortilla wraps each cut in half on the diagonal and leaning together on a pale wooden board, the cut ends showing pale golden turkey strips, a ribbon of deep red cranberry sauce, melted orange cheddar and green lettuce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced parsnip and apple soup · `spiced-parsnip-apple-soup`

```
A round white shallow bowl of smooth, pale cream-beige parsnip soup with a swirl of golden oil in the centre and a dusting of dark pepper, with a few thin slices of apple beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cranberry, cheddar and ham toasted wraps · `cranberry-cheddar-ham-toasted-wraps`

```
Two golden-brown toasted filled wraps each cut into wedges and fanned out on a pale wooden board, the cut edges showing melted orange cheddar, pink ham, thin green spring onion rings and a streak of deep red cranberry sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

## Dinner

### Chicken, rice and soy bowl · `chicken-rice-bowl`

```
A wide shallow white bowl of white rice covered by browned chicken strips and stir-fried vegetable strips in orange, red and green, all coated in a glossy dark soy glaze, with a crescent of rice showing at the rim. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken curry with rice · `chicken-curry`

```
A white oval plate holding a creamy orange curry with golden chunks of chicken and soft pieces of onion on one side, and a neat mound of white rice on the other. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef chilli and rice · `beef-chilli`

```
A deep round white bowl filled with thick deep red-brown chilli of crumbled beef mince, dark red kidney beans and soft pieces of onion in tomato sauce, with a half-moon of fluffy white rice tucked against one side of the rim. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy chicken and mushroom pasta · `chicken-mushroom-pasta`

```
A wide white pasta bowl heaped with pasta shapes in a pale creamy sauce, with bite-sized pieces of golden chicken, sliced brown mushrooms and wilted dark green spinach through it, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon and soy noodles · `salmon-noodles`

```
A shallow white bowl of soy-darkened noodles in a loose nest, topped with large flakes of pink-orange salmon with browned edges and a scatter of thin green spring onion slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and tomato pasta · `tuna-pasta`

```
A round white plate with a wide rim holding pasta shapes in a smooth red tomato sauce speckled with dried herbs, pale flakes of tuna through it and a mound of finely grated yellow cheddar melting in the centre. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Coconut salmon curry with rice · `salmon-coconut-curry`

```
A round white plate with a raised rim: white rice on one side, and on the other a creamy pale orange coconut curry sauce holding large chunks of pink salmon and bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Satay noodles with egg · `satay-egg-noodles`

```
A wide white bowl of noodles and stir-fried vegetable strips glossy with a tan-brown peanut sauce, topped with ribbons of rolled pale yellow omelette laid across the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea and tomato curry · `chickpea-curry`

```
A wide white pasta bowl with a round dome of white rice in the centre, ringed by thick orange-red tomato and coconut curry full of golden chickpeas, dark green wilted spinach and soft pieces of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean chilli · `bean-chilli`

```
A wide shallow white bowl divided on the diagonal: white rice on one side and, on the other, a deep red chunky chilli of dark red kidney beans, pale golden chickpeas and soft pieces of onion in thick tomato sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna fishcakes with peas · `tuna-fishcakes`

```
A round white plate with two flat, round, golden-brown fishcakes side by side, crisp on top and flecked with green spring onion, and a small heap of bright green peas on the other side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mushroom and bean pasta · `mushroom-bean-pasta`

```
A shallow round white bowl of pasta shapes tossed in a rich red tomato sauce, sliced brown mushrooms and dark red kidney beans showing on top among small pieces of onion, speckled with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken thigh, bean and tomato rice · `chicken-bean-rice`

```
A wide round white bowl heaped with sticky orange-red tomato and paprika rice, browned pieces of chicken thigh and dark red kidney beans sitting on the surface among soft pieces of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken jalfrezi with rice · `chicken-jalfrezi`

```
Chicken jalfrezi with rice on a wide white plate: a neat mound of white rice beside a glossy orange-red tomato sauce holding browned chicken chunks, strips of red and yellow pepper and soft pieces of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef keema with peas and rice · `beef-keema-peas`

```
Beef keema with peas and rice on a white square plate: a neat dome of white rice in the centre ringed by rich red-brown tomato sauce full of finely crumbled spiced beef mince, bright green peas and small pieces of soft onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg and pea curry · `egg-pea-curry`

```
Egg and pea curry in a wide shallow white bowl: halved boiled eggs with set yellow yolks lie cut side up in an orange-red tomato sauce dotted with green peas, with a mound of white rice at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Kidney bean curry with rice · `kidney-bean-curry`

```
A wide white soup plate with a bed of white rice covered by glossy dark red kidney beans and soft pieces of onion in a thick, spiced orange-red tomato sauce, a white crescent of rice showing along one edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken chow mein · `chicken-chow-mein`

```
Chicken chow mein in a wide white pasta bowl: a tangled heap of glossy soy-brown noodles mixed with browned chicken strips and colourful strips of stir-fried vegetables, with sliced green spring onion scattered across the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sticky soy beef noodles · `sticky-beef-noodles`

```
Sticky soy beef noodles in a deep white bowl: a loose swirl of glossy dark-brown noodles with a heap of crumbled browned beef mince in the centre, small broccoli florets and red pepper strips around it, and sliced green spring onion on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweet chilli chicken stir-fry · `sweet-chilli-chicken`

```
Sweet chilli chicken stir-fry on a round white plate: a neat mound of white rice beside strips of chicken glazed in glossy red-orange sweet chilli sauce, mixed with red pepper strips, broccoli florets and pieces of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced yogurt chicken with naan · `spiced-chicken-naan`

```
Spiced yogurt chicken with naan on a large round white platter: golden-orange chicken chunks with browned edges, roasted red and yellow pepper pieces and onion wedges in a single layer, and one soft naan bread with pale blistered spots alongside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken fajitas with salsa · `chicken-fajitas`

```
Chicken fajitas with salsa on a pale wooden board: two tortilla wraps side by side, each open and filled with browned chicken strips and strips of red and yellow pepper and onion, topped with red tomato salsa and a dollop of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef burrito bowl · `beef-burrito-bowl`

```
Beef burrito bowl in a wide shallow white bowl: a base of white rice with crumbled spiced beef mince heaped in the centre under red tomato salsa, ringed by neat piles of dark red kidney beans, yellow sweetcorn and shredded green lettuce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken shawarma-style wraps · `chicken-shawarma-wraps`

```
Chicken shawarma-style wraps on a long white platter: two tortilla wraps rolled and cut in half, lying side by side, their cut ends showing golden-brown sliced chicken, green lettuce, tomato and cucumber slices and white garlic yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced chickpea and potato curry · `chickpea-potato-curry`

```
Chickpea and potato curry in a wide shallow white bowl: pale golden chickpeas and halved new potatoes in a creamy orange coconut and tomato sauce, dark green wilted spinach folded through, with a mound of white rice at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Soy and honey salmon rice bowl · `soy-honey-salmon-bowl`

```
Soy and honey salmon rice bowl in a shallow white bowl: a salmon fillet with a glossy dark glaze and pink-orange flaking flesh on a bed of white rice, with broccoli florets and thin cucumber slices alongside and sliced spring onion on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg fried rice with peas · `egg-fried-rice`

```
Egg fried rice with peas in a round white bowl: a heaped surface of rice tinted pale brown by soy, mixed with small pieces of yellow scrambled egg and green peas and flecked with sliced green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Vegetable and almond stir-fry with rice · `vegetable-almond-stir-fry`

```
Vegetable and almond stir-fry in a wide white pasta bowl: white rice as a bed, covered on one half by glossy broccoli florets, red pepper strips and orange carrot slices in a red-orange glaze, with chopped golden almonds and sliced spring onion over them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mexican chicken and bean rice · `mexican-chicken-rice`

```
Mexican chicken and bean rice in a shallow round white dish: orange-red tomato-tinted rice with browned chicken chunks, dark red kidney beans, and pieces of onion and red pepper mixed through, filling the dish edge to edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and pepper fajitas · `bean-pepper-fajitas`

```
Bean and pepper fajitas on a white rectangular plate: two tortilla wraps side by side, each open and filled with soft strips of red and yellow pepper, onion and dark red kidney beans, topped with red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Moroccan-style chickpea stew with rice · `moroccan-chickpea-stew`

```
Moroccan-style chickpea stew on a wide white plate with a rim: thick red-brown stew heaped in the centre, crowded with pale golden chickpeas, orange carrot pieces and plump dark raisins, with a ring of white rice around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg chow mein with vegetables · `egg-chow-mein`

```
A round white plate piled with egg chow mein: glossy soy-browned noodles tangled with shredded stir-fry vegetables in green, orange and cream strands, with pale yellow pieces of scrambled egg showing across the top and sliced spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg and tomato stir-fry with rice · `egg-tomato-stir-fry`

```
A shallow white bowl with a bed of white rice showing at the edge under soft pale yellow scrambled egg folded through glossy red tomato pieces that have broken down into a thick sauce, scattered with sliced spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chinese-style chicken curry with rice and peas · `chinese-style-chicken-curry`

```
A wide white plate with a straight band of white rice along one side and, beside it, a thick golden-yellow curry holding bite-sized pieces of chicken, softened onion and bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced chicken and rice bowl with yogurt · `spiced-chicken-rice-bowl`

```
A wide round white bowl with white rice in the middle, topped with golden chicken chunks coated in orange-red spices, neat piles of diced cucumber and red tomato to one side, and a dollop of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea and spinach stew with eggs · `chickpea-spinach-egg-stew`

```
A wide white bowl of thick red tomato stew crowded with pale chickpeas and dark green wilted spinach, with two eggs, their whites set and their yolks bright yellow, resting side by side on the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spaghetti bolognese · `spaghetti-bolognese`

```
A wide round white plate holding a nest of spaghetti topped with a mound of thick red-brown beef and tomato sauce flecked with orange carrot, finely grated cheddar over the centre and a few spaghetti strands curling out at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy beef pasta bake · `beef-pasta-bake`

```
A round white plate holding a square serving of cheesy beef pasta bake: pasta shapes in red beef sauce under a golden, bubbling layer of melted mozzarella and creamy cheese sauce with browned patches. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage pie with cheesy mash · `cottage-pie`

```
A white square plate holding a serving of cottage pie: a golden-browned mashed potato top with melted cheddar patches, the savoury beef mince filling flecked with green peas and orange carrot showing along one cut edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, tomato and mozzarella pasta bake · `chicken-mozzarella-pasta-bake`

```
A small white rectangular baking dish of pasta shapes and bite-sized chicken pieces in red tomato sauce with dark green wilted spinach, under a golden bubbling layer of melted mozzarella with a few browned spots. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon with new potatoes and peas · `salmon-new-potatoes-peas`

```
A white oval plate with one baked salmon fillet in pink-orange with paler flaking lines, beside a pile of small pale new potatoes and a heap of bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pesto salmon with crushed potatoes · `pesto-salmon-crushed-potatoes`

```
A wide round white plate with one salmon fillet under a spread of green pesto, a few roasted red cherry tomatoes beside it, roughly crushed pale potatoes with a glossy sheen of olive oil, and a few broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ham, egg and crispy potatoes with peas · `ham-egg-potatoes`

```
A large white plate with two fried eggs, set whites and golden yolks, folded slices of pink ham, halved crispy golden potatoes and a pile of green peas, with a small dab of yellow mustard at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken thigh and potato traybake · `chicken-thigh-potato-traybake`

```
A white oval baking dish holding a portion of traybake: two golden-brown roast chicken thighs, halved roast potatoes with browned edges, red onion wedges and red pepper pieces, all dusted orange-red with paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Potato, tomato and mozzarella bake · `potato-tomato-mozzarella-bake`

```
A small white oval baking dish of halved soft potatoes in a red tomato sauce, covered by melted mozzarella that is golden and bubbling in places, with the red sauce showing between the patches of cheese. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Easy macaroni cheese · `easy-macaroni-cheese`

```
A small round white baking dish of macaroni cheese, its surface a golden-brown grilled layer of melted cheddar with darker toasted patches and slices of red tomato laid across the top, creamy pasta shapes visible at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bacon carbonara-style spaghetti · `bacon-carbonara-spaghetti`

```
A shallow round white bowl holding a nest of spaghetti coated in a creamy pale yellow egg and cheese sauce, with golden-brown bacon strips scattered through, grated cheddar on top and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef meatballs with spaghetti · `beef-meatballs-spaghetti`

```
A deep white plate holding a nest of spaghetti topped with several round browned meatballs, all coated in a thick red tomato sauce that pools around the edges, with dried herb flecks showing in the meatballs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon and pea fish pie · `salmon-fish-pie`

```
A small white square baking dish of salmon fish pie, its top a golden-browned layer of mashed potato with melted cheddar, one corner broken open to show pink salmon chunks and green peas in a creamy sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and mushroom cottage pie · `bean-cottage-pie`

```
A small round white pie dish of bean and mushroom cottage pie, its golden-brown mashed potato top covering the dish, one corner scooped away to show a rich red filling of kidney beans, peas, mushrooms and diced carrot. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and chickpea stew · `chicken-chickpea-stew`

```
Chicken and chickpea stew in a wide white pasta bowl: browned chicken chunks, round chickpeas and soft onion pieces in an orange-red paprika and tomato sauce, with dark green wilted spinach stirred through the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bacon and tomato linguine · `bacon-tomato-linguine`

```
Bacon and tomato linguine in a wide white pasta bowl: a loose nest of linguine coated in glossy red tomato sauce, golden bacon strips mixed through it and showing at the surface, with a speckling of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea, potato and pepper traybake · `chickpea-potato-traybake`

```
A roasted traybake on a wide white oval plate: golden halved potatoes, browned chickpeas, red and yellow pepper strips with softened edges, red onion wedges and a few split cherry tomatoes, all coloured orange-red with paprika and cumin. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Minestrone with beans and pasta · `minestrone-beans-pasta`

```
A shallow white bowl of thick minestrone, its round surface an orange-red tomato broth crowded with small pasta shapes, red kidney beans, green peas, diced orange carrot and onion, flecked with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and pepper kebabs with yogurt dressing · `chicken-pepper-kebabs`

```
One wrap on a pale wooden board, folded round golden grilled chicken chunks, red and yellow pepper pieces and red onion that spill onto the board, finished with a zigzag of thick white yogurt dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Barbecue chicken thigh skewers with corn salad · `bbq-chicken-thigh-skewers`

```
Two skewers of dark, sticky, glossy barbecue-glazed chicken thigh chunks beside a mound of corn salad on a wide white oval plate: yellow sweetcorn, halved red cherry tomatoes, diced cucumber and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Roast turkey with parsnips, sprouts and cranberry · `turkey-roast-parsnips-sprouts`

```
A large white oval plate showing sliced and whole white-golden roast turkey fillets on one side, golden-brown honey-glazed parsnip fingers and crisp roast potatoes in the middle, a heap of bright green halved sprouts on the other side and a small bowl of deep red cranberry sauce at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chipolatas with spiced red cabbage and mash · `chipolatas-red-cabbage-mash`

```
A wide white round plate with a mound of smooth pale mash on one side, a pile of glossy deep purple-red cabbage and soft apple pieces beside it, and a row of browned golden chipolata sausages laid across the top, with a small spoonful of yellow mustard at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Gammon steaks with honey parsnips and apple sauce · `gammon-parsnips-apple-sauce`

```
A round white plate with two pink-edged gammon steaks with golden-brown seared surfaces, a row of caramelised honey-roast parsnip fingers beside them, a small heap of bright green peas and a small bowl of pale golden apple sauce at the rim. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sprout, chestnut and potato gratin · `sprout-chestnut-potato-gratin`

```
A rectangular white ovenproof dish seen from above, filled with a bubbling golden-brown cheddar crust, dark green sprout halves and pale brown chestnut pieces showing through at the edges and slices of cream potato layered underneath. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Red cabbage, chestnut and cranberry rice · `red-cabbage-chestnut-cranberry-rice`

```
A wide shallow white bowl of fluffy rice tinted pink-purple by red cabbage ribbons, studded with pale brown chestnut pieces, small chunks of apple and glossy deep red dried cranberries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

## Snacks

### Peanut butter oat bites · `peanut-butter-oat-bites`

```
Two round, matte, golden-tan balls of peanut butter and oats, flecked with oat flakes and dark raisins, sitting side by side on a small plain white round plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Houmous with vegetable sticks · `houmous-veg-sticks`

```
A pale wooden board with a small white bowl of smooth beige houmous at one end and, laid in neat parallel rows beside it, orange carrot sticks, pale green cucumber sticks and red pepper sticks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Honey and almond yogurt pots · `honey-almond-yogurt-pots`

```
A small round white ramekin of thick, creamy white yogurt, a ring of roughly chopped almonds around the edge and a spiral of glossy amber honey winding in from the centre. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Frozen yogurt and berry bark · `frozen-yogurt-berry-bark`

```
Four jagged shards of frozen yogurt bark, creamy off-white with a frosted surface, studded with red, purple and deep blue berries pressed into the top, overlapping loosely on a pale grey round plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ham and soft cheese roll-ups · `ham-soft-cheese-roll-ups`

```
Four tight rolls of pink ham lying side by side on a small white round plate, each rolled end showing a white spiral of soft cheese around a pale green cucumber core. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Devilled eggs · `devilled-eggs`

```
Four boiled egg halves in a tidy row on a white oval plate, each white hollow piled with a creamy pale yellow filling and dusted with orange-red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and chickpea dip · `tuna-chickpea-dip`

```
A round white platter with a shallow white bowl of speckled beige dip showing pale tuna flakes and thin green spring onion rings, and three fanned bundles of orange carrot, pale green cucumber and red pepper sticks at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon cucumber bites · `smoked-salmon-cucumber-bites`

```
Six thick cucumber rounds with green skin edges arranged in a ring on a round white plate, each spread with white soft cheese, topped with a folded pink-orange ribbon of smoked salmon and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crispy spiced chickpeas · `crispy-spiced-chickpeas`

```
A small shallow white bowl heaped with roasted chickpeas, golden-brown and rough-skinned, coated in orange-red paprika and cumin with a faint gloss of oil and a few white salt flecks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Paprika roasted almonds · `paprika-roasted-almonds`

```
A small white square dish with whole roasted almonds spread in a loose single layer, deep golden-brown and coated in orange-red paprika, with a slight oily sheen and a few white salt flecks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheese and salsa quesadilla wedges · `cheese-bean-quesadilla-wedges`

```
Three triangular wedges of toasted folded wrap fanned on a white round plate, golden-brown with darker toasted spots, the cut sides showing melted orange cheddar, red salsa and green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```
