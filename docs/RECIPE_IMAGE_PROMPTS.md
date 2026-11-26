# Recipe picture prompts (Midjourney, bird's-eye view)

One Midjourney prompt per recipe in the app's recipe book. Founder's decisions: 2026-10-10 (CLAUDE.md rule 2) our own recipes may show an illustration made with AI, never for a restaurant's or a
supermarket's item (since 2026-11-17 it has no visible caption; screen readers hear "An illustration of …"); 2026-10-16 the pictures are made with Midjourney and every one is a bird's-eye view.

Pictures that have been added are ticked. This file is rewritten from the recipe book by `WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts` (run in `web/`), so don't edit it by hand;
each recipe's description of how it looks from above is in `web/lib/mm/recipeBook/looks.ts`, the shared style and settings are at the top of `web/tests/recipeImages.test.ts`.

## Read first: Midjourney's rules

Midjourney's Community Guidelines say it has no API and that **automating interactions with Midjourney is prohibited; accounts that do not comply may be blocked**
(https://docs.midjourney.com/docs/community-guidelines). Letting Claude in Chrome paste the prompts and click through the site is automation of that kind, so it could put the founder's account at risk: read the current terms and decide.
The safe way is for a person to paste each prompt (641 of them) and download the pictures; the hand-over below also works for a person following it. Images made on a paid plan can be used commercially under Midjourney's terms (check the
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

641 recipes, 382 with a picture.

## Breakfast

### ✓ Overnight oats with yogurt · `overnight-oats`

```
Overnight oats in a wide shallow white bowl: a thick, pale oat and yogurt surface with a golden-brown spiral of peanut butter from the centre outwards, and a tight cluster of glossy deep red and purple mixed berries heaped on one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheesy scrambled egg wraps · `cheesy-egg-wraps`

```
Two halves of a tortilla wrap rolled around soft yellow scrambled egg, dark green wilted spinach and melted orange cheddar, laid side by side on a pale wooden board with the cut ends showing the filling. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Berry porridge with yogurt · `berry-yogurt-porridge`

```
A round white bowl of thick, pale oat porridge, its surface topped with a dollop of thick white yogurt in the centre and a scatter of deep red and purple mixed berries around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peanut butter and banana porridge · `peanut-banana-porridge`

```
A shallow white bowl of thick, pale oat porridge with a swirl of golden-brown peanut butter through the middle, topped with overlapping round slices of banana arranged in a ring. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon and scrambled eggs · `smoked-salmon-eggs`

```
A round white plate holding a soft, glossy mound of pale yellow scrambled eggs with torn ribbons of pink-orange smoked salmon folded through, flecked with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean breakfast burritos · `breakfast-burrito`

```
A burrito cut in half on a round white plate, the two halves side by side, the cut ends showing yellow scrambled egg, reddish-brown crushed kidney beans, green spinach, orange cheddar and red tomato salsa inside the wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon and egg breakfast wraps · `bacon-egg-wraps`

```
One bacon and egg wrap cut in half on the diagonal, the two pieces laid as an angled pair on a white rectangular plate, the cut ends showing browned grilled bacon, yellow scrambled egg, dark green spinach and red tomato slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Greek yogurt granola bowl · `greek-yogurt-granola`

```
A wide shallow white bowl of thick white yogurt, one half covered with golden-brown granola clusters and the other half with a heap of deep red and purple mixed berries, thin golden threads of honey crossing between them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cottage cheese, berries, honey and almonds · `cottage-cheese-berries`

```
A small deep white bowl of white, lumpy cottage cheese curds with a cluster of deep red and purple mixed berries in the centre, a golden spiral of honey over them and roughly chopped almonds scattered over the curds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Wholewheat biscuits with milk and berries · `wheat-biscuits-berries`

```
Two oblong wheat biscuits, pale golden-beige with a fine shredded texture, sit in a round white bowl in pale milk that shows around them, topped with a scatter of deep red and purple mixed berries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Shakshuka · `shakshuka`

```
A white oval dish of thick orange-red tomato sauce speckled with pieces of softened onion and red pepper, with two eggs set into it, the whites opaque and the yolks bright yellow. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Baked beans with poached eggs · `beans-poached-eggs`

```
A round white soup plate of baked beans in glossy orange-red tomato sauce with wilted dark green spinach through it, two poached eggs with set whites and bright yellow yolks resting on top, and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ham and cheese omelette · `ham-cheese-omelette`

```
A folded half-moon omelette on a white square plate, golden brown in patches on top, with melted orange cheddar and torn pieces of pink ham just showing at the open edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and bean breakfast wraps · `mushroom-bean-breakfast-wraps`

```
Two halves of a rolled tortilla wrap laid side by side on a white oval plate, the cut ends showing orange-red baked beans, golden-brown sliced mushrooms and dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Oat pancakes with yogurt and berries · `oat-pancakes`

```
A stack of several small round, golden-brown oat pancakes on a round white plate, with a dollop of thick white yogurt on top and deep red and purple mixed berries scattered over and around them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Apple Bircher muesli · `bircher-muesli`

```
Bircher muesli in a deep round pale grey bowl: creamy pale soaked oats flecked with coarsely grated apple and dark raisins, with roughly chopped almonds scattered over the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean and potato hash · `bean-potato-hash`

```
Bean and potato hash on a wide white round plate: golden, crisp-edged halved new potatoes, pieces of red pepper and softened onion dusted orange-brown with spices, dark red kidney beans mixed through, and chunky red tomato salsa spread over the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mince pie porridge · `mince-pie-porridge`

```
A round white bowl of thick, creamy pale oat porridge with a dollop of white yogurt in the middle, a spoonful of dark glossy mincemeat on top of the yogurt and roughly chopped almonds scattered over and around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Apple and cinnamon baked oats · `apple-cinnamon-baked-oats`

```
A square white baking dish of golden-brown baked oats, the top dotted with soft cubes of apple and dark raisins and dusted with cinnamon, one square cut out to show the firm, moist oat inside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Coconut rice pudding with berries · `coconut-rice-pudding-berries`

```
Creamy coconut rice pudding in a round white bowl, soft pale grains flecked with cinnamon and dotted with plump dark raisins, topped in the centre with a heap of warm, glossy red and purple mixed berries in their juice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Crispy potatoes with garlic mushrooms and tomatoes · `crispy-potatoes-garlic-mushrooms`

```
A round white plate of halved golden potatoes with crisp, browned edges, topped with glossy golden sliced mushrooms flecked with garlic and soft, split red cherry tomatoes, dotted with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Banana and berry overnight oats · `banana-berry-overnight-oats`

```
A deep white bowl of thick, creamy soaked oats flecked with cinnamon, topped with overlapping thin rounds of banana on one side and a heap of glossy red and purple mixed berries on the other. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peanut butter and banana breakfast wraps · `peanut-butter-banana-wraps`

```
A peanut butter and banana wrap cut in half on a round white plate, the toasted wrap golden with darker patches, the cut ends showing a layer of golden-brown peanut butter and round banana slices dusted with cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Turmeric chickpea breakfast wraps · `turmeric-chickpea-wraps`

```
A tortilla wrap cut in half on a round white plate, the cut ends showing roughly crushed chickpeas stained golden yellow with turmeric, dark green wilted spinach, halved red cherry tomatoes and thin rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Crispy potato cakes with fried eggs · `crispy-potato-cakes-fried-eggs`

```
Two round, golden-brown grated potato cakes with crisp lacy edges, flecked with green spring onion rings, on a white round plate, each topped with a fried egg with a set white and bright yellow yolk, with raw halved red cherry tomatoes beside them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pepper, spinach and cheddar frittata · `pepper-spinach-cheddar-frittata`

```
A thick round frittata on a white round plate with one wedge cut and eased slightly apart, its golden top spotted with melted orange cheddar, the cut sides showing soft red pepper pieces and dark green spinach set in yellow egg. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Baked egg cups with ham and peppers · `ham-pepper-egg-cups`

```
Three round baked egg cups on a white plate, puffed and golden at the edges, their set yellow tops dotted with small pieces of red pepper, torn pink ham and thin rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and cheddar omelette · `mushroom-cheddar-omelette`

```
A folded half-moon omelette on a round white plate, smooth and pale golden on top, with golden-brown sliced mushrooms and melted orange cheddar spilling from the open edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheesy beans on toast · `cheesy-beans-on-toast`

```
Two slices of golden wholemeal toast on a round white plate, covered with glossy orange-red baked beans in tomato sauce and topped with a scatter of coarsely grated orange cheddar just starting to melt, with flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Scrambled eggs on toast · `scrambled-eggs-on-toast`

```
Two slices of golden wholemeal toast side by side on a round white plate, heaped with soft, glossy pale yellow scrambled eggs in large folds, flecked with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Poached eggs and spinach on toast · `poached-eggs-spinach-toast`

```
Two slices of golden wholemeal toast on a round white plate, each topped with a heap of dark green wilted spinach and a poached egg with a smooth, set white and a soft yellow yolk, with a few flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Boiled eggs with toast soldiers · `boiled-eggs-toast-soldiers`

```
Two soft-boiled eggs in white egg cups on a round white plate, their tops sliced off to show set whites and runny bright yellow yolks with a few white salt flecks, beside a neat row of golden wholemeal toast soldiers. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and tomato on toast · `cheese-tomato-on-toast`

```
Two slices of wholemeal cheese on toast on a round white plate, the melted orange cheddar bubbling and browned in patches over thin red tomato slices that show at the edges, with flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peanut butter and banana on toast · `peanut-butter-banana-toast`

```
Two slices of golden wholemeal toast on a round white plate, spread with golden-brown peanut butter and covered with overlapping rows of round banana slices, dusted with a fine sprinkle of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon and tomato sandwich · `bacon-tomato-sandwich`

```
A bacon and tomato sandwich of golden wholemeal toast cut in half on the diagonal on a round white plate, the two halves side by side, the cut edges showing browned bacon medallions and red tomato slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Grilled full English breakfast · `grilled-full-english`

```
A grilled full English breakfast on a large round white plate: browned bacon medallions, a fried egg with a set white and golden yolk, golden sliced mushrooms, two soft grilled tomato halves, orange-red baked beans and a slice of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ham and cheese toastie · `ham-cheese-toastie`

```
A golden-brown wholemeal ham and cheese toastie cut in half on the diagonal on a pale wooden board, the two halves set slightly apart, the cut edges showing melted orange cheddar and pink ham. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Garlic mushrooms on toast · `garlic-mushrooms-on-toast`

```
Two slices of golden wholemeal toast on a round white plate, piled with glossy golden-brown sliced mushrooms and dark green wilted spinach in their pan juices, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Berry and banana smoothie · `berry-banana-smoothie`

```
A tall clear glass filled to the top with a thick, smooth purple-red berry and banana smoothie, its round surface flecked with tiny dark berry seeds and a few pale specks of blended oat. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Apple and cinnamon porridge · `apple-cinnamon-porridge`

```
A round white bowl of thick, creamy pale oat porridge flecked with soft grated apple and brown cinnamon, topped with a small heap of grated apple showing red and green skin and a thin drizzle of golden honey. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Eggy bread with berries and yogurt · `eggy-bread-berries`

```
Two slices of golden-brown eggy bread overlapping on a round white plate, topped with a dollop of thick white yogurt and a scatter of deep red and purple mixed berries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Crushed chickpeas and tomatoes on toast · `crushed-chickpeas-tomatoes-toast`

```
Two slices of golden wholemeal toast on a round white plate, piled with golden chickpeas, mostly whole with a few crushed, and dark green wilted spinach, topped with glossy halved red cherry tomatoes cut side up, drizzled with olive oil and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Berry and almond porridge · `berry-almond-porridge`

```
A round white bowl of thick, creamy pale oat porridge dusted with brown cinnamon, topped with a heap of glossy warm purple and red mixed berries in their juice and a scatter of roughly chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tomato toast with olive oil and boiled eggs · `tomato-olive-oil-toast-eggs`

```
Two slices of golden wholemeal toast on a round white plate, piled with glossy chopped red tomatoes in olive oil flecked with black pepper, beside four boiled egg halves with firm white edges and set yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tomato and paprika beans on toast · `smoky-tomato-beans-toast`

```
Two slices of golden wholemeal toast on a round white plate, covered with deep red kidney beans in a thick chopped tomato and onion sauce tinged orange with paprika, with flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Berry, almond and oat yogurt bowl · `berry-almond-oat-yogurt-bowl`

```
A round white bowl of thick white Greek-style yogurt, topped with a scatter of deep red and purple mixed berries, golden toasted oats and roughly chopped almonds, dusted with a fine sprinkle of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Carrot and raisin porridge with almonds · `carrot-raisin-porridge`

```
A round white bowl of thick, creamy oat porridge flecked with fine orange grated carrot, plump dark raisins and brown cinnamon, topped with a scatter of roughly chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peanut butter, banana and oat smoothie · `peanut-butter-banana-oat-smoothie`

```
A tall clear glass filled to the top with a thick, smooth pale beige banana, oat and peanut butter smoothie, its round surface finished with a fine dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Wholewheat biscuits with banana, yogurt and almonds · `wheat-biscuits-banana-almonds`

```
Three wholewheat breakfast biscuits in a round white bowl of cold milk, topped with a dollop of thick white yogurt, overlapping rounds of sliced banana, roughly chopped almonds and a dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon, eggs, mushrooms and tomatoes · `bacon-eggs-mushrooms-tomatoes`

```
A round white plate with two fried eggs, their whites set and yolks golden, under melted orange cheddar, beside browned bacon medallions, golden sliced mushrooms and two soft grilled tomato halves, with flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheesy baked eggs with spinach · `cheesy-baked-eggs-spinach`

```
A round white plate of creamy dark green spinach topped with two baked eggs with set whites and soft yellow yolks, under patches of bubbling golden melted cheddar, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and tomato scrambled eggs · `cheese-tomato-scrambled-eggs`

```
A round white plate of soft, glossy yellow scrambled eggs with strands of melted orange cheddar, beside a small heap of softened halved cherry tomatoes, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spinach and mushroom omelette · `spinach-mushroom-omelette`

```
A folded golden omelette on a round white plate, golden-brown sliced mushrooms and dark green wilted spinach showing at its open edge, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Banana pancakes with berries and almonds · `banana-egg-pancakes-berries`

```
A small stack of round golden-brown banana and egg pancakes on a round white plate, topped with a scatter of deep red and purple mixed berries and roughly chopped pale almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Fruit and almond breakfast bowl · `fruit-almond-breakfast-bowl`

```
A wide white bowl of chopped red-skinned apple, round pale banana slices and deep red and purple mixed berries, dusted with brown cinnamon and topped with a scatter of roughly chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom, tomato and spinach fry-up with eggs · `mushroom-tomato-spinach-eggs-fry-up`

```
A round white plate holding two fried eggs with set whites and golden yolks, golden-brown sliced mushrooms, two soft red fried tomato halves and a heap of dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pepper and spinach egg muffins · `pepper-spinach-egg-muffins`

```
Three round golden egg muffins on a round white plate, their puffed, set tops flecked with small pieces of red pepper, dark green spinach and thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced tomato baked eggs with spinach · `spiced-tomato-baked-eggs-spinach`

```
A wide shallow white bowl of thick red spiced tomato sauce with dark green wilted spinach through it, two eggs set into it with opaque whites and bright yellow yolks, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spinach and mushroom scrambled eggs on toast · `spinach-mushroom-eggs-toast`

```
Two slices of golden wholemeal toast on a round white plate, heaped with soft pale yellow scrambled eggs folded through golden sliced mushrooms and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Houmous, tomato and spinach on toast · `houmous-tomato-spinach-toast`

```
Two slices of golden wholemeal toast on a round white plate, spread thickly with pale beige houmous and topped with a small heap of glossy dark green spinach leaves and overlapping red tomato slices, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spanish-style eggs with peppers and tomatoes · `spanish-style-pepper-eggs-toast`

```
Two slices of golden wholemeal toast on a round white plate, topped with soft red and yellow pepper strips, sliced onion and chopped tomato in a thick paprika-red sauce, with big soft folds of set yellow egg on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mozzarella, tomato and spinach omelette · `mozzarella-tomato-spinach-omelette`

```
A golden folded half-moon omelette on a round white plate, its open edge showing melted white mozzarella, halved red cherry tomatoes and dark green wilted spinach, with a few flecks of black pepper on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Menemen-style Turkish eggs with tomatoes and peppers · `menemen-turkish-eggs-peppers`

```
A shallow round white pan-style dish of soft, glossy yellow scrambled egg folded through red tomato, soft green and red pepper pieces and onion, with a little melted cheese, black pepper and red chilli. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Turkish-style poached eggs with garlic yogurt and spinach · `turkish-poached-eggs-garlic-yogurt`

```
A wide shallow white bowl with a thick layer of white garlic yogurt, a heap of dark green wilted spinach and two poached eggs with set whites, drizzled with glossy orange-red chilli oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Masala omelette with spinach and tomato · `masala-omelette-spinach-tomato`

```
A golden folded omelette on a round white plate, speckled with small pieces of red tomato, soft onion and dark green spinach, its open edge showing the filling and a dusting of red chilli. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon, spinach and tomato egg muffins · `bacon-spinach-tomato-egg-muffins`

```
Three golden, puffed egg muffins on a white plate, with dark green spinach in the egg and melted orange cheddar on top, dotted with small cubes of pink bacon and red tomato. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peanut butter and banana baked oats · `peanut-butter-banana-baked-oats`

```
A small white ovenproof dish of baked oats, golden at the edges, with a soft, risen surface swirled with golden-brown peanut butter and pieces of baked banana showing through. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cottage cheese pancakes with banana and honey · `cottage-cheese-pancakes-banana`

```
A stack of four thick golden-brown pancakes on a round white plate, topped with overlapping rounds of banana and a glossy drizzle of honey running down the sides. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Masala oats with peas and tomato · `masala-oats-peas-tomato`

```
A round white bowl of thick, savoury golden oat porridge flecked with soft red tomato, onion and bright green peas, with a spoonful of white yogurt in the middle and a dusting of red chilli. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Berry and banana smoothie bowl with granola · `berry-banana-smoothie-bowl-granola`

```
A round white bowl of thick, smooth deep purple-pink berry smoothie, topped with a line of golden granola clusters and a few thin rounds of banana. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu scramble with spinach and tomatoes on toast · `tofu-scramble-spinach-tomato-toast`

```
Two slices of wholemeal toast on a white plate piled with golden-yellow crumbled tofu scramble, dark green wilted spinach and soft halved red cherry tomatoes, dotted with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu, pepper and spinach breakfast wraps · `tofu-pepper-spinach-breakfast-wraps`

```
A tortilla wrap cut in half on a round white plate, the cut ends showing golden-yellow scrambled tofu, soft strips of red pepper and dark green wilted spinach inside the rolled wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter and berry soya porridge · `peanut-butter-berry-soya-porridge`

```
A round white bowl of thick, creamy oat porridge with spoonfuls of golden-brown peanut butter swirled into the top and a heap of warm, glossy deep red and purple mixed berries in their juice on one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Apple and almond overnight oats with soya · `apple-almond-soya-overnight-oats`

```
A deep white bowl of thick soaked oats flecked with grated apple and dark plump raisins, scattered on top with roughly chopped pale almonds and a dusting of cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Protein pancakes with berries and yogurt · `protein-pancakes-berries-yogurt`

```
A stack of four small golden-brown pancakes on a white plate, topped with a thick dollop of white yogurt and a heap of glossy deep red and purple mixed berries spilling down the sides. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Protein overnight oats with berries · `protein-overnight-oats-berries`

```
A wide glass bowl of thick, creamy soaked oats seen from straight above, the pale surface flecked with cinnamon and topped with a cluster of glossy red and purple mixed berries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana, berry and almond yogurt bowl · `banana-berry-almond-yogurt-bowl`

```
A wide white bowl of thick white yogurt with a row of banana rounds along one side, a heap of red and purple mixed berries beside them, scattered with chopped pale almonds and thin golden threads of honey. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Full English fried rice · `full-english-fried-rice`

```
A wide white bowl of golden fried rice studded with crisp strips of bacon, browned mushroom slices, soft yellow pieces of scrambled egg and split red cherry tomatoes, scattered with thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana and raisin porridge with yogurt · `banana-raisin-porridge-yogurt`

```
A wide shallow white bowl of thick, creamy oat porridge flecked with dark raisins, topped with a big swirl of thick white yogurt, a fan of pale banana slices and a dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ham, egg and cheese breakfast bake · `ham-egg-cheese-breakfast-bake`

```
A rectangular baking dish of puffed, golden bread cubes set in baked egg custard, with melted orange cheddar on top and pink pieces of ham and soft red cherry tomato halves showing between the crisp brown edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon and poached eggs on soft cheese toast · `smoked-salmon-poached-eggs-soft-cheese-toast`

```
Two slices of golden wholemeal toast on a round white plate, spread with white soft cheese and draped with folds of pink-orange smoked salmon, each topped with a round poached egg, the white set and the yolk bright yellow. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bacon, egg and mushroom breakfast sandwiches · `bacon-egg-mushroom-breakfast-sandwiches`

```
Two wholemeal toast sandwiches cut in half on a white plate, the cut sides showing crisp golden bacon, browned mushroom slices and a fried egg with a set white and a yellow yolk, cracked black pepper on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu, bean and mushroom fry-up with toast · `tofu-bean-mushroom-fry-up`

```
A round white plate with golden paprika-coloured slices of fried tofu, a pool of orange baked beans, browned mushrooms, soft split red cherry tomatoes and two triangles of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Breakfast burrito bowl with eggs and beans · `breakfast-burrito-bowl-eggs-beans`

```
A wide white bowl of pale cumin rice topped with soft yellow scrambled eggs, glossy dark red kidney beans with small pieces of red pepper, a dollop of chunky red salsa and sliced green spring onions. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Apple and berry breakfast crumble with yogurt · `apple-berry-breakfast-crumble-yogurt`

```
A small white baking dish of golden, crisp oat crumble with bubbling purple berry juice and soft apple pieces showing at the edges, beside a small bowl of thick white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana, oat and tofu pancakes with cinnamon apple · `banana-oat-tofu-pancakes-cinnamon-apple`

```
A stack of thick, golden banana and oat pancakes on a round white plate, topped with soft, glossy slices of cinnamon-dusted cooked apple tumbling down the sides. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter and banana stuffed French toast · `peanut-butter-banana-stuffed-french-toast`

```
Golden-brown French toast sandwiches cut in half on a white plate, the cut sides showing a layer of peanut butter and pale banana slices, drizzled with honey, with a dollop of thick white yogurt on the side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bombay potato and chickpea breakfast hash · `bombay-potato-chickpea-breakfast-hash`

```
A wide white bowl of crisp golden new potato quarters and chickpeas tinted yellow with turmeric, mixed with soft onion, split red cherry tomatoes and dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean, sweetcorn and pepper breakfast burritos · `bean-sweetcorn-pepper-breakfast-burritos`

```
Two tortilla burritos cut in half on a round white plate, the cut ends showing crushed dark red kidney beans, yellow sweetcorn, soft red pepper strips, green spinach and chunky red salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Masala beans on toast · `masala-beans-on-toast`

```
Two slices of golden wholemeal toast on a white plate, covered with thick orange baked beans speckled with yellow turmeric, soft tomato pieces and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spinach, banana and tofu green smoothie · `spinach-banana-tofu-green-smoothie`

```
Two tall glasses of thick, smooth, bright green smoothie with a fine dusting of brown cinnamon on top, beside a few banana rounds and a small heap of spinach leaves on a white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu and chickpea shakshuka with toast · `tofu-chickpea-shakshuka-toast`

```
A black frying pan of thick red tomato and pepper sauce with chickpeas and dark green spinach, white crumbled tofu nestled in hollows across the top, beside triangles of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu bhurji with peas and tomatoes on toast · `tofu-bhurji-peas-tomatoes-toast`

```
Slices of golden wholemeal toast on a white plate heaped with bright yellow crumbled scrambled tofu studded with green peas and soft red tomato pieces. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced tofu and chickpea breakfast kedgeree · `spiced-tofu-chickpea-breakfast-kedgeree`

```
A wide white bowl of golden-yellow spiced rice with green peas, golden cubes of fried tofu, chickpeas and dark green wilted spinach mixed through it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Potato, pepper and spinach hash with fried eggs · `potato-pepper-spinach-hash-fried-eggs`

```
A round white plate of crisp golden new potato quarters fried with soft red pepper, red onion wedges and dark green spinach, topped with two fried eggs with set whites and bright yellow yolks, dusted with paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Yogurt bowl with warm cinnamon apples and almonds · `yogurt-bowl-warm-cinnamon-apples-almonds`

```
A wide white bowl of thick white yogurt topped with soft, glossy, warm apple wedges and plump raisins in cinnamon juices, scattered with roughly chopped pale almonds and a dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chinese-style rice porridge with egg and spring onions · `chinese-style-rice-porridge-egg`

```
A deep white bowl of thick, silky white rice porridge with soft yellow ribbons of egg and dark green wilted spinach swirled through it, scattered with thin green spring onion rings and a few drops of oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana and cinnamon lassi-style smoothie · `banana-cinnamon-lassi-smoothie`

```
Two tall glasses filled with a thick, frothy, pale cream banana and yogurt drink, the tops dusted with brown cinnamon, beside a small white plate holding a few banana slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced oat and spinach pancakes with cucumber yogurt · `spiced-oat-spinach-pancakes-cucumber-yogurt`

```
A stack of thin, golden-yellow savoury oat pancakes flecked with dark green spinach and red tomato pieces on a white plate, beside a small bowl of thick white yogurt speckled with pale green grated cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Middle Eastern-style breakfast plate with eggs and houmous · `middle-eastern-breakfast-plate-eggs-houmous`

```
A round white plate with a swirl of creamy beige houmous dusted with red paprika and pooled with olive oil, halved boiled eggs with yellow yolks, cucumber chunks, halved cherry tomatoes and triangles of golden toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Overnight wheat biscuits with berries and yogurt · `overnight-wheat-biscuits-berries-yogurt`

```
Two clear glasses layered with soft, pale brown soaked wheat biscuit at the bottom, thick white honey yogurt in the middle and deep red and purple mixed berries on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crunchy honey and almond oat cereal with yogurt · `crunchy-honey-almond-oat-cereal-yogurt`

```
A white bowl of golden toasted oat clusters with pieces of pale almond and dark raisins, cold milk around them and a dollop of thick white yogurt on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter and banana rice pudding with soya · `peanut-butter-banana-soya-rice-pudding`

```
A wide white bowl of thick, creamy rice pudding with a swirl of golden-brown peanut butter through the top, pale banana rounds and a dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweetcorn and cheddar fritters with tomatoes · `sweetcorn-cheddar-fritters-tomatoes`

```
A stack of round golden fritters on a white plate, studded with bright yellow sweetcorn kernels, green spring onion and melted cheddar, beside soft, blistered red cherry tomato halves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon and soft-boiled egg breakfast rice bowl · `salmon-soft-boiled-egg-breakfast-rice-bowl`

```
A wide white bowl of white rice topped with large golden-edged pink flakes of pan-fried salmon, halved soft-boiled eggs with glossy orange yolks, dark green wilted spinach, pale cucumber sticks and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pea, spinach and cottage cheese rice frittata · `pea-spinach-cottage-cheese-rice-frittata`

```
A thick round golden frittata on a wooden board with one wedge cut away, the cut side showing set yellow egg packed with white rice, bright green peas, dark green spinach and white curds of cottage cheese under a browned cheddar top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Gallo pinto rice and beans with scrambled tofu · `gallo-pinto-rice-beans-scrambled-tofu`

```
A round white plate with a mound of rice speckled red-brown with kidney beans, soft onion and small pieces of red pepper, beside a heap of golden-yellow scrambled tofu and overlapping slices of red tomato. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy savoury porridge with fried eggs and spinach · `cheesy-savoury-porridge-fried-eggs-spinach`

```
A wide white bowl of thick, creamy pale oat porridge streaked with dark green spinach and melted cheddar, topped with two fried eggs with set whites and bright yellow yolks, soft red cherry tomato halves and green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Korean-style egg toast sandwiches · `korean-style-egg-toast-sandwiches`

```
Halved toasted sandwiches on a white plate, the golden wholemeal bread showing thick folded omelette layers flecked with orange grated carrot and green spring onion, with melted cheddar at the edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Molletes with refried beans, cheese and tomato salsa · `molletes-refried-beans-cheese-tomato-salsa`

```
Slices of golden grilled bread on a white plate, spread thickly with dark red-brown refried beans under bubbling melted orange cheddar, topped with spoonfuls of chopped red tomato and pale green cucumber salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu French toast with banana cream and berries · `tofu-french-toast-banana-cream-berries`

```
Golden fried French toast halves on a round white plate, topped with a thick swirl of pale creamy banana tofu cream, a scattering of deep red and purple berries and a dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Herby tofu breakfast patties with tomatoes and toast · `herby-tofu-breakfast-patties-tomatoes-toast`

```
A white plate of round golden-brown tofu patties flecked with green herbs and red paprika, beside soft blistered red cherry tomato halves, dark green wilted spinach and two triangles of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu chilaquiles with beans and spiced tomato sauce · `tofu-chilaquiles-beans-spiced-tomato-sauce`

```
A wide white plate of golden tortilla chips coated in thick red tomato sauce with dark red kidney beans and soft pieces of red pepper, topped with crisp golden cubes of paprika tofu. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Berry cheesecake overnight oats with tofu · `berry-cheesecake-overnight-oats-tofu`

```
Two clear glasses layered with soft pale soaked oats, thick smooth white tofu cheesecake cream and deep red and purple berries, finished with roughly chopped pale almonds on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

## Lunch

### ✓ Chicken and yogurt wraps · `chicken-wraps`

```
One chicken and yogurt wrap cut in half, the two halves leaning together in a V on a round white plate, the cut ends facing outwards and showing browned chicken slices, green lettuce, white yogurt and orange grated cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea and houmous wraps · `chickpea-houmous-wraps`

```
One chickpea and houmous wrap cut in half on the diagonal on a pale wooden board, one half resting across the other, the cut ends showing beige houmous, spice-dusted chickpeas, green lettuce and red tomato slices inside a soft pale wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spanish-style omelette with potatoes and peas · `spanish-omelette`

```
A single thick wedge of Spanish-style omelette on a round white plate, its top turned golden brown with potato slices showing through, and cut sides that show golden potato slices, green peas and soft slices of onion held in firm egg. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Huevos rancheros · `huevos-rancheros`

```
A flat round tortilla wrap on a round white plate, spread with reddish-brown crushed kidney beans and topped with two fried eggs, white with bright yellow yolks, with red tomato salsa spooned over and around them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon kedgeree · `smoked-salmon-kedgeree`

```
Smoked salmon kedgeree in a shallow white bowl: golden curry-tinted rice dotted with green peas and soft slices of onion, with ribbons of pink smoked salmon and boiled egg halves with set yellow yolks laid on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna and sweetcorn pasta salad · `tuna-sweetcorn-pasta-salad`

```
Tuna and sweetcorn pasta salad heaped in a shallow round white bowl: pasta shapes coated in creamy mayonnaise, with flakes of pale pink tuna, yellow sweetcorn kernels, thin rings of green spring onion and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ BBQ chicken and pepper wraps · `chicken-caesar-wraps`

```
One barbecue chicken and red pepper wrap cut in half and laid head to tail on a pale grey round plate, the cut ends showing glossy dark-glazed chicken strips, red pepper strips, green lettuce and orange grated cheddar inside a soft pale wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and mozzarella wrap pizzas · `mushroom-wrap-pizzas`

```
One round wrap pizza cut into wedges on a pale wooden board, spread with red passata and topped with sliced brown mushrooms and torn white mozzarella melted into creamy white patches, with crisp edges and a sprinkle of dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mexican bean and rice bowl · `mexican-bean-rice-bowl`

```
Mexican bean and rice bowl in a wide white round bowl, filled in sections: white rice, dark kidney beans with yellow sweetcorn, shredded green lettuce, a patch of red salsa, and orange grated cheddar scattered over the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon and soft cheese wraps · `smoked-salmon-soft-cheese-wraps`

```
One smoked salmon and soft cheese wrap cut in half at a slant and set side by side on a white square plate, the cut ends showing white soft cheese, pink smoked salmon, green cucumber sticks and a few salad leaves inside a soft pale wrap. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg mayonnaise wraps · `egg-mayonnaise-wraps`

```
One egg mayonnaise wrap cut into two halves, one half overlapping the other in a short diagonal row on a pale wooden board, the cut ends showing a creamy mash of yellow and white egg with green spring onion flecks and salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ham and soft cheese wraps · `ham-soft-cheese-wraps`

```
One ham and soft cheese wrap, toasted with brown spots and cut in half, the halves set side by side and slightly staggered on a white oval plate, the cut ends showing pink ham, white soft cheese, red tomato slices and green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea, cucumber and tomato salad · `chickpea-tomato-salad`

```
Chickpea, cucumber and tomato salad in a shallow white bowl: pale golden chickpeas mixed with chunks of green-edged cucumber, red tomato wedges and thin short slivers of purple red onion, glistening with a thin olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pesto pasta salad with mozzarella · `pesto-pasta-mozzarella-salad`

```
Pesto pasta salad in a wide white pasta bowl: pasta shapes coated in green pesto, halved red cherry tomatoes and torn pieces of white mozzarella scattered over, with a few green salad leaves tucked on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweet chilli chicken noodle salad · `sweet-chilli-chicken-noodle-salad`

```
Sweet chilli chicken noodle salad in a wide shallow white bowl: pale noodles tossed with orange grated carrot and cucumber sticks in a glossy red-orange glaze, topped with browned chicken slices fanned across one side and rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweet chilli chickpea rice bowl · `chickpea-rice-bowl`

```
Sweet chilli chickpea rice bowl in a shallow white bowl: a bed of white rice topped in the centre with a heap of golden chickpeas glazed glossy dark with soy and sweet chilli, ringed by green peas, small cucumber chunks and spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweetcorn and potato soup · `sweetcorn-potato-soup`

```
Chunky sweetcorn and potato soup in a deep round white bowl: a golden-yellow surface tinted orange by paprika, with whole yellow sweetcorn kernels and neat cubes of pale potato showing through, a faint sheen of oil and black pepper specks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and sweetcorn soup · `chicken-sweetcorn-soup`

```
Chicken and sweetcorn soup in a shallow white bowl: a pale golden broth holding soft shreds of white chicken, yellow sweetcorn kernels and thin ribbons of set egg, topped with rings of green spring onion and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean and tomato soup · `bean-tomato-soup`

```
Bean and tomato soup in a wide white rimmed soup plate: a smooth, thick, deep red-orange surface blended from kidney beans and tomatoes, with a faint sheen of olive oil and a scatter of black pepper specks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna and bean salad · `tuna-bean-salad`

```
Tuna and bean salad heaped in a shallow white bowl: dark red kidney beans mixed with large pale flakes of tuna, thin purple red onion slices and halved cherry tomatoes, all glossy with a thin dressing and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ New potato, egg and pea salad · `potato-egg-salad`

```
A round white plate spread with green salad leaves, topped with halved small new potatoes and green peas coated in a pale creamy dressing speckled with mustard seeds, and boiled egg halves on top with their set yellow yolks showing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and bean quesadillas · `cheese-bean-quesadillas`

```
A pale wooden board holding one quesadilla cut into wedges, the toasted wrap golden brown with darker spots and the cut edges showing melted yellow cheese, red-brown mashed beans and green spring onion, with a small heap of salad leaves beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Curried rice salad with raisins and almonds · `curried-rice-salad`

```
Curried rice salad in a shallow white bowl: separate yellow-tinged rice grains dotted with diced red pepper, thin green spring onion slices and dark raisins, with roughly chopped almonds scattered across the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and mushroom noodle soup · `chicken-mushroom-noodle-soup`

```
A wide white soup bowl filled with clear golden-brown broth, its surface covered with tangled noodles, soft shreds of chicken and thick slices of browned mushroom, finished with a scatter of slanted spring onion pieces. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Turkey, cranberry and cheddar wraps · `turkey-cranberry-cheddar-wraps`

```
Two tortilla wraps each cut in half on the diagonal and leaning together on a pale wooden board, the cut ends showing pale golden turkey strips, a ribbon of deep red cranberry sauce, grated orange cheddar and green lettuce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced parsnip and apple soup · `spiced-parsnip-apple-soup`

```
A round white shallow bowl of completely smooth, thick, pale cream-beige parsnip and apple soup with a faint golden tinge from the roasted parsnips and a few fine specks of black pepper across the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cranberry, cheddar and ham toasted wraps · `cranberry-cheddar-ham-toasted-wraps`

```
One golden-brown toasted filled wrap cut into wedges and fanned out on a pale wooden board, the cut edges showing melted orange cheddar, pink ham, thin green spring onion rings and a streak of deep red cranberry sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Carrot and coconut soup · `carrot-coconut-soup`

```
A wide white bowl of smooth, thick bright orange carrot soup with a thin swirl of white coconut milk drizzled across the middle and a few specks of black pepper on the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tomato, pepper and chickpea soup · `tomato-pepper-chickpea-soup`

```
A deep white bowl of thick brick-red tomato and pepper soup, half smooth and half chunky, with whole golden chickpeas and soft pieces of red pepper showing on the surface and a few specks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Lemony chickpea and new potato salad · `lemony-chickpea-potato-salad`

```
A wide shallow white bowl of halved pale yellow new potatoes and golden chickpeas glossy with a cloudy mustard dressing, mixed with halved red cherry tomatoes, thin rings of green spring onion and dark green spinach leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Satay pasta salad with crunchy vegetables · `satay-pasta-salad`

```
A wide white bowl of pasta shapes coated in a glossy golden-brown peanut dressing, tossed with green peas, grated orange carrot, thin red pepper strips, small pale green cucumber chunks and rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Broccoli and pea soup · `broccoli-pea-soup`

```
A round white bowl of smooth, thick bright green broccoli and pea soup with a velvety surface and a small sprinkle of ground black pepper in the centre. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna, egg and new potato salad · `tuna-egg-potato-salad`

```
A shallow white bowl of green salad leaves topped with halved new potatoes, large flakes of pale pink tuna and halved red cherry tomatoes, glossy with a mustard dressing, with boiled egg halves showing set yellow yolks and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, sweetcorn and rice salad · `chicken-sweetcorn-rice-salad`

```
A wide white bowl of white rice mixed with golden paprika-dusted chicken pieces, bright yellow sweetcorn, small cubes of red pepper and green cucumber, and thin rings of green spring onion, glossy with a lemon dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Broccoli and cheddar soup · `broccoli-cheddar-soup`

```
A round white bowl of smooth, thick pale green broccoli soup with darker green flecks, a small heap of grated orange cheddar melting in the centre and a scatter of cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and new potato salad with a cucumber yogurt dressing · `salmon-potato-salad-cucumber-yogurt`

```
A wide white plate of green salad leaves topped with halved new potatoes, golden on their cut sides, and large flakes of pink baked salmon, with a thick white yogurt dressing flecked with pale green grated cucumber and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and onion potato cakes with salad · `cheese-onion-potato-cakes`

```
Three round grated-potato cakes with lacy, crisp golden-brown edges on a white round plate, topped with melted orange cheddar and flecked with green spring onion rings, beside green salad leaves, halved red cherry tomatoes and cucumber rounds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spinach and soft cheese pasta · `spinach-soft-cheese-pasta`

```
Pasta shapes in a wide white pasta bowl, coated in a smooth, pale creamy sauce with dark green wilted spinach folded through, finely grated orange cheddar scattered over the top and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna melt wraps · `tuna-melt-wraps`

```
One tortilla wrap folded into a half-moon and toasted golden brown with darker spots, cut into two wedges on a white round plate, the cut edges showing pale tuna, yellow sweetcorn and melted orange cheddar, with green salad leaves beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mozzarella, tomato and pesto wraps · `mozzarella-tomato-pesto-wraps`

```
One tortilla wrap rolled up and cut in half on the diagonal, the two halves crossed on a white square plate, the cut ends showing green pesto, red tomato slices, soft white mozzarella and green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon and pea pasta with soft cheese · `smoked-salmon-pea-pasta`

```
Pasta shapes in a wide white pasta bowl, coated in a pale creamy sauce, with bright green peas and soft pink folds of smoked salmon through it and flecks of black pepper on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced carrot and chickpea soup with toast · `spiced-carrot-chickpea-soup`

```
A round white bowl of smooth, thick bright orange carrot and chickpea soup with a few flecks of black pepper, beside two slices of golden wholemeal toast on a small white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and chickpea salad with lemon · `salmon-chickpea-lemon-salad`

```
A wide white bowl of green salad leaves topped with chickpeas, chunks of cucumber and halved red cherry tomatoes, scattered with large flakes of pink baked salmon and glistening with a lemon and olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg, chickpea and spinach salad · `egg-chickpea-spinach-salad`

```
A round white plate of dark green spinach leaves tossed with golden chickpeas, halved red cherry tomatoes and thin slices of purple red onion, topped with boiled eggs cut in half lengthways, with set yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Roasted pepper and houmous open sandwiches · `roasted-pepper-houmous-sandwiches`

```
Two slices of golden wholemeal toast on a round white plate, spread with pale houmous and topped with a few dark green spinach leaves and soft, browned strips of roasted red and yellow pepper and red onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean and vegetable chilli soup with toast · `bean-vegetable-chilli-soup`

```
A round white bowl of chunky deep red soup with kidney beans, small cubes of orange carrot and pieces of red pepper and onion in a thick tomato broth, beside two slices of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Warm broccoli, chickpea and almond salad · `warm-broccoli-chickpea-almond-salad`

```
A round white plate of roasted broccoli florets browned at the edges, golden roasted chickpeas, toasted chopped almonds and thin slices of purple red onion, glistening with a lemon and garlic olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean, sweetcorn and pepper rice salad · `bean-sweetcorn-pepper-rice-salad`

```
A round white bowl of cold fluffy white rice mixed with deep red kidney beans, bright yellow sweetcorn, small pieces of red pepper and finely chopped red onion, glistening with a lemon dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smashed chickpea and carrot sandwiches · `smashed-chickpea-carrot-sandwiches`

```
A wholemeal sandwich cut in half corner to corner on a round white plate, the two halves set slightly apart, the cut edges showing a thick layer of pale mashed chickpeas, grated orange carrot and dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and cucumber sandwiches · `salmon-cucumber-soft-cheese-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the two halves set slightly apart, the cut edges showing a creamy pale pink salmon filling and thin slices of green cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, bacon and lettuce salad · `chicken-bacon-lettuce-salad`

```
A wide white bowl of torn pale green lettuce, halved cherry tomatoes and cucumber slices in a creamy dressing, topped with golden strips of chicken and browned bacon and a scatter of grated orange cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mozzarella, tomato and pesto salad · `mozzarella-tomato-pesto-salad`

```
A round white plate of overlapping red tomato slices and white mozzarella slices on a bed of green salad leaves, drizzled with bright green pesto and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon, mushroom and cheddar frittata · `bacon-mushroom-cheddar-frittata`

```
A thick wedge of golden frittata on a round white plate, its cut side showing set egg studded with browned bacon pieces, sliced mushrooms, dark green spinach and spring onion, under a golden cheddar top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken Caesar-style salad · `chicken-caesar-style-salad`

```
A wide white bowl of crisp pale green lettuce pieces in a creamy white dressing, topped with golden pan-fried chicken strips and a scatter of finely grated orange cheddar, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna and cheddar stuffed peppers · `tuna-cheddar-stuffed-peppers`

```
Two roasted red pepper halves on a round white plate, filled with a creamy tuna and spring onion filling under melted golden cheddar, beside a small heap of green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna Niçoise-style salad · `tuna-nicoise-style-salad`

```
A shallow white bowl of torn lettuce, red tomato wedges and cucumber slices topped with chunks of tuna and quartered hard-boiled eggs with firm yellow yolks, glistening with a lemon and olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon, egg and spinach salad · `smoked-salmon-egg-spinach-salad`

```
A shallow white bowl of dark green spinach leaves and thin cucumber rounds topped with folds of pink smoked salmon and halved boiled eggs with set yolks, glistening with lemon dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, apple and almond salad · `chicken-apple-almond-salad`

```
A wide white plate of green salad leaves with thin slices of red-skinned apple and pale cucumber rounds, topped with golden sliced chicken thigh and a scatter of roughly chopped toasted almonds, glossy with dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced chicken and vegetable soup · `spiced-chicken-vegetable-soup`

```
A round white bowl of chunky red tomato soup with pieces of browned chicken, small orange carrot cubes, soft onion and dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon, cucumber and tomato salad · `salmon-cucumber-tomato-salad`

```
A wide white plate of green salad leaves, pale cucumber rounds, halved red cherry tomatoes and thin rings of purple red onion, topped with large flakes of pan-fried salmon with a golden peppery crust, glossy with lemon dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, mushroom and spinach omelette · `chicken-mushroom-spinach-omelette`

```
A large folded golden omelette on a round white plate, with browned pieces of chicken, golden sliced mushrooms and dark green wilted spinach showing at its open edge, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and roasted vegetable salad · `chicken-roasted-vegetable-salad`

```
A wide white plate of green salad leaves with halved red cherry tomatoes, soft roasted strips of red pepper and red onion wedges browned at the edges, topped with golden sliced chicken, glossy with lemon dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef and vegetable soup · `beef-vegetable-soup`

```
A round white bowl of thick red tomato soup with browned beef mince, small orange carrot cubes, soft onion and dark green wilted spinach, flecked with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, chickpea and tomato salad with oregano · `chicken-chickpea-tomato-oregano-salad`

```
A wide white bowl of pale chickpeas, cubed green cucumber, halved red cherry tomatoes and thin purple red onion slices glossy with lemon dressing, topped with a row of golden chicken slices flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tomato and mozzarella toasts · `tomato-mozzarella-toasts-spinach`

```
Two slices of golden wholemeal toast on a round white plate, topped with wilted dark green spinach, halved red cherry tomatoes and torn white mozzarella melted with golden brown patches, sprinkled with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Greek-style lemon chicken and rice soup · `greek-style-lemon-chicken-rice-soup`

```
A wide white bowl of pale creamy yellow lemon and egg soup, thick with soft white rice, shreds of chicken, small orange carrot cubes and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and roasted pepper pesto pasta salad · `chicken-pepper-pesto-pasta-salad`

```
A wide white bowl of pasta shapes coated in green pesto, mixed with golden roasted chicken strips, soft red and yellow roasted pepper strips browned at the edges, halved red cherry tomatoes and dark green spinach leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken souvlaki-style rice salad with garlic yogurt · `chicken-souvlaki-style-salad`

```
A wide white bowl with a mound of fluffy white rice beside shredded pale green lettuce, cubed cucumber and tomato and thin purple red onion slices, topped with golden oregano chicken chunks and a dollop of thick white garlic yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna, sweetcorn and cucumber sandwiches · `tuna-sweetcorn-cucumber-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the two halves side by side, the cut edges showing a creamy tuna and yellow sweetcorn filling under thin green-edged cucumber rounds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken salad sandwiches · `chicken-salad-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the cut edges showing golden slices of pan-fried chicken, crisp shredded green lettuce, red tomato slices and a thin layer of mayonnaise. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg mayonnaise and lettuce sandwiches · `egg-mayo-lettuce-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the two halves side by side, the cut edges showing a chunky egg mayonnaise with pieces of white and yolk and shredded green lettuce, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheddar, apple and spinach sandwiches · `cheddar-apple-spinach-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the cut edges showing layers of dark green spinach leaves, thin red-skinned apple slices and pale orange mature cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom soup with toast · `mushroom-soup-toast`

```
A round white bowl of smooth, creamy pale brown mushroom soup flecked with tiny dark specks of herbs and black pepper, beside two slices of golden wholemeal toast on a small white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and vegetable soup with toast · `chicken-vegetable-soup`

```
A round white bowl of golden broth filled with small cubes of orange carrot, soft onion, bright green peas and pale chunks of chicken, flecked with dried herbs, beside two slices of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Crushed new potatoes with tuna and sweetcorn · `crushed-potatoes-tuna-sweetcorn`

```
Warm crushed new potatoes with bright yellow sweetcorn on a bed of green salad leaves on a round white plate, topped with flaked tuna in thick white yogurt and thin green spring onion slices, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheesy beans with crushed new potatoes · `cheesy-beans-crushed-potatoes`

```
Crushed new potatoes on a round white plate under glossy orange-red baked beans and dark green wilted spinach, topped with a scatter of grated orange cheddar just starting to melt and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna, cucumber and sweetcorn rice bowl · `tuna-cucumber-rice-bowl`

```
A round white bowl of white rice topped in neat sections with flaked tuna, small green-edged cubes of cucumber and bright yellow sweetcorn, scattered with thin green spring onion slices and a glossy brown dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ham, pea and cheddar omelette · `ham-pea-cheddar-omelette`

```
A golden folded omelette on a round white plate, its open edge showing pink pieces of ham, bright green peas and melted orange cheddar, with a few flecks of black pepper on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Lemon chicken, rice and spinach bowl · `chicken-rice-spinach-lemon-bowl`

```
A round white bowl of white rice topped with golden pieces of pan-fried chicken, bright green peas and dark green wilted spinach, glistening with pan juices and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tomato soup with cheese on toast · `tomato-soup-cheese-on-toast`

```
A round white bowl of smooth, deep orange-red tomato soup flecked with dried herbs and black pepper, beside two slices of wholemeal toast covered with bubbling, golden-brown melted cheddar on a small white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ New potato, ham and pea salad · `pea-ham-potato-salad`

```
Halved new potatoes, pink pieces of ham, bright green peas and thin spring onion slices coated in a creamy pale mustard yogurt dressing, piled on shredded green lettuce on a round white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spinach, tomato and cheddar pasta · `spinach-tomato-cheddar-pasta`

```
A round white bowl of pasta shapes in a creamy pale sauce with dark green wilted spinach and halved red cherry tomatoes, topped with finely grated orange cheddar and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweetcorn and pepper fritters with salad · `sweetcorn-pepper-fritters-salad`

```
Four round golden-brown fritters dotted with yellow sweetcorn, red pepper and green spring onion on a round white plate, beside a heap of mixed green salad leaves and a small pile of red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pea and ham soup with toast · `pea-ham-soup-toast`

```
A round white bowl of thick, smooth bright green pea soup topped with a scatter of small pink pieces of ham and flecks of black pepper, beside two slices of golden wholemeal toast on a small white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mulligatawny-style chicken and rice soup · `mulligatawny-chicken-rice-soup`

```
A round white bowl of orange-red spiced tomato soup filled with tender pieces of chicken, soft onion and grains of rice, with a swirl of white yogurt in the middle. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chinese-style tomato and egg noodle soup · `tomato-egg-noodle-soup`

```
A wide white bowl of red-tinged broth with soft wedges of tomato, soft pale yellow pieces of set egg, tangles of noodles and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Creamy chicken and mushroom soup with toast · `creamy-chicken-mushroom-soup`

```
A round white bowl of creamy pale beige soup with shreds of pale chicken and thick slices of brown mushroom on the surface, flecked with black pepper, beside two slices of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Welsh rarebit with tomatoes · `welsh-rarebit-tomatoes`

```
Two slices of wholemeal toast on a white rectangular plate, each cut in half and covered with a bubbling, golden-brown cheddar topping, beside two thick rounds of grilled tomato with charred edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna melt toastie · `tuna-melt-toastie`

```
A wholemeal toastie cut in half on the diagonal on a round white plate, golden and crisp outside, the cut edges showing a creamy tuna filling with flecks of red onion and stretchy melted orange cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Baked bean and cheese toastie · `baked-bean-cheese-toastie`

```
A golden, crisp wholemeal toastie cut in half on a round white plate, the two halves side by side, the cut edges showing orange-red baked beans and melted orange cheddar oozing out, beside a few red tomato wedges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Garlic mushroom and mozzarella toastie · `garlic-mushroom-mozzarella-toastie`

```
A golden wholemeal toastie cut in half on the diagonal on a round white plate, the cut edges showing sliced brown garlic mushrooms, dark green wilted spinach and melted white mozzarella. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ploughman's-style salad with cheddar and ham · `ploughmans-salad-cheddar-ham`

```
A large white plate with a heap of dressed green lettuce, tomato wedges, cucumber rounds and thin onion rings, chunks of orange cheddar and folded pink ham beside it, and two slices of wholemeal bread. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Warm honey mustard chicken salad · `honey-mustard-chicken-salad`

```
Slices of golden, glazed chicken laid over torn green lettuce, cucumber slices and red tomato wedges on a round white plate, drizzled with a glossy pale yellow honey and mustard dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chinese-style cold peanut noodles with cucumber and egg · `cold-peanut-noodles-cucumber-egg`

```
A wide white bowl of noodles coated in a glossy pale brown peanut sauce, topped with a neat pile of thin green-edged cucumber sticks and halved boiled eggs with set yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ham, cheddar and pea pasta salad · `ham-cheddar-pea-pasta-salad`

```
Pasta shapes, small pink squares of ham, bright green peas and grated orange cheddar coated in a creamy pale mustard yogurt dressing, piled on shredded green lettuce on a round white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon, pea and lemon pasta salad · `salmon-pea-lemon-pasta-salad`

```
A round white bowl of pasta shapes in a creamy pale lemon yogurt dressing with large pink flakes of salmon, bright green peas and dark green spinach leaves, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Greek-style chicken pasta salad · `greek-style-chicken-pasta-salad`

```
A round white bowl of pasta shapes with golden grilled strips of chicken, small cubes of cucumber, red tomato wedges and thin red onion slices in a creamy white garlic yogurt dressing, flecked all over with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Barbecue chicken rice bowl · `bbq-chicken-rice-bowl`

```
A round white bowl of white rice topped with glossy, sticky dark red-brown barbecue chicken strips, shredded green lettuce, small cubes of cucumber and red tomato, and a spoonful of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg, mushroom and spinach rice bowl with soy · `egg-mushroom-spinach-rice-bowl`

```
A round white bowl of white rice topped with golden sliced mushrooms and dark green wilted spinach, two fried eggs with set whites and bright yellow yolks, and a drizzle of dark soy sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweet chilli salmon rice bowl · `sweet-chilli-salmon-rice-bowl`

```
A round white bowl of white rice with bright green broccoli florets, large flakes of pink salmon with a glossy red sweet chilli glaze, and small cubes of green-edged cucumber, drizzled with a thin dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tomato and mozzarella naan pizzas · `tomato-mozzarella-naan-pizzas`

```
A naan pizza cut into quarters on a round white plate, spread with red tomato sauce flecked with dried oregano and topped with thin tomato slices and bubbling melted mozzarella, beside shredded lettuce and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and onion omelette with salad · `cheese-onion-omelette-salad`

```
A golden folded omelette on a round white plate, its open edge showing soft golden fried onion and melted orange cheddar, beside a small salad of green lettuce, red tomato wedges and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chinese-style beef lettuce cups · `chinese-style-beef-lettuce-cups`

```
Four crisp green lettuce cups on a white rectangular plate, each holding a little white rice topped with browned, glossy beef mince and pieces of mushroom and a scatter of small green cucumber cubes. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken tinga-style rice bowl · `chicken-tinga-rice-bowl`

```
A round white bowl of white rice topped with a heap of shredded chicken in a thick, glossy brick-red tomato and onion sauce, a pile of finely shredded green lettuce and a spoonful of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Fajita-spiced salmon rice bowl with salsa · `fajita-salmon-rice-bowl-salsa`

```
A round white bowl of white rice with large flakes of pink salmon coated in a red-brown spice crust, small cubes of cucumber, shredded green lettuce, a spoonful of red tomato salsa and a spoonful of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Japchae-style noodles with mushrooms, spinach and egg · `japchae-noodles-mushrooms-egg`

```
A wide white bowl of glossy soy-coated noodles tangled with golden sliced mushrooms, soft onion and dark green wilted spinach, topped with thin yellow ribbons of rolled omelette and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Thai-style coconut noodle soup with mushrooms and spinach · `thai-coconut-noodle-soup-mushrooms`

```
A deep round white bowl of creamy pale coconut broth with tangles of noodles, golden sliced mushrooms, soft onion and dark green wilted spinach, flecked with a little red chilli. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pho-style chicken noodle soup · `pho-chicken-noodle-soup`

```
A deep round white bowl of clear golden-brown broth with tangles of noodles, shreds of pale chicken, soft wedges of charred onion and dark green wilted spinach, with a dusting of red chilli powder. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Banh mi-style chicken rice bowl with quick pickles · `banh-mi-chicken-rice-bowl`

```
A round white bowl of white rice topped with sticky golden-brown chicken pieces, thin pale green cucumber sticks and pink-tinged red onion pickles, torn green lettuce and thin drizzled lines of orange spicy mayonnaise. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Dan dan-style beef noodles with spinach · `dan-dan-beef-noodles-spinach`

```
A wide white bowl of noodles coated in a glossy pale brown peanut and chilli sauce, topped with a heap of crispy browned beef mince and a pile of dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and pea pilau with toasted almonds · `mushroom-pea-pilau-almonds`

```
A round white bowl of fluffy spiced rice with golden sliced mushrooms, soft onion slices and bright green peas, scattered with thinly sliced toasted almonds, beside a heap of chunky diced tomato and cucumber in the same bowl. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Omurice-style ham fried rice omelette · `omurice-ham-rice-omelette`

```
A smooth golden yellow folded omelette on a round white plate, its open end showing orange-red tomato fried rice with small pink pieces of ham, green peas and soft onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced beef with houmous, naan and tomato salad · `spiced-beef-houmous-naan`

```
A round white plate spread with pale houmous, a mound of browned spiced beef mince and onion in the middle, beside tomato wedges with shredded green lettuce and torn pieces of warm golden naan. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pad thai-style noodles with egg and broccoli · `pad-thai-egg-noodles-broccoli`

```
A wide white bowl of glossy brown noodles tossed with soft scrambled egg, bright green broccoli florets and sliced onion, scattered with roughly chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Hot and sour noodle soup with ham, mushrooms and egg · `hot-sour-noodle-soup-ham-egg`

```
A deep round white bowl of dark amber broth with noodles, sliced mushrooms, thin pink strips of ham, dark green spinach and soft pale yellow pieces of egg, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon poke-style rice bowl · `smoked-salmon-poke-rice-bowl`

```
A round white bowl of white rice and green peas topped with neat separate piles of folded pink smoked salmon strips, small cucumber cubes, shredded lettuce and thin red onion slices, glossy with a dark dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Italian-style rice salad with tuna, egg and peas · `italian-rice-salad-tuna-egg`

```
A round white bowl of rice salad with green peas and small cubes of red tomato and cucumber, flecked with dried oregano, topped with large pale flakes of tuna and halved boiled eggs with set yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Nigerian-style egg stew with rice · `nigerian-egg-stew-rice`

```
A round white plate with a mound of white rice beside a rich red stew of tomato, strips of red pepper and onion with large soft yellow pieces of scrambled egg folded through it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Vietnamese-style salmon noodle salad · `vietnamese-salmon-noodle-salad`

```
A wide white bowl of cool noodles with shredded green lettuce and thin cucumber sticks, topped with large flakes of glossy soy-glazed pink salmon and a thin, glossy dressing flecked with red chilli. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Soy tofu and edamame rice bowl with cucumber · `soy-tofu-edamame-rice-bowl`

```
A wide white bowl of white rice topped in separate piles with glossy soy-glazed golden tofu cubes, bright green edamame beans and pale green cucumber half-moons, scattered with spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoky tofu and pepper wraps with houmous · `smoky-tofu-pepper-wraps`

```
A tortilla wrap cut in half on the diagonal on a round white plate, the cut ends showing golden paprika-dusted tofu strips, soft red pepper strips, creamy beige houmous and green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Edamame, pea and spinach pasta with lemon · `edamame-pea-spinach-lemon-pasta`

```
A white bowl of short pasta shapes glossy with olive oil, tossed with bright green edamame beans, green peas and dark wilted spinach, dotted with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese, spinach and pepper frittata with salad · `cottage-cheese-spinach-pepper-frittata-salad`

```
A thick golden wedge of frittata on a white plate, its cut side showing set egg dotted with white curds of cottage cheese, red pepper and dark green spinach, beside a salad of green leaves and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese, chickpea and tomato salad · `cottage-cheese-chickpea-tomato-salad`

```
A wide white bowl of green salad leaves topped with golden chickpeas, halved red cherry tomatoes and cucumber half-moons, with a generous spoonful of creamy white cottage cheese in the middle. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg, chickpea and spinach curry with naan · `egg-chickpea-spinach-curry-naan`

```
A shallow white bowl of thick red tomato and chickpea curry with dark green wilted spinach, topped with four boiled egg halves showing bright yellow yolks, beside a golden warm naan. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheese, sweetcorn and pepper quesadillas with salad · `cheese-sweetcorn-pepper-quesadillas`

```
Golden toasted quesadilla quarters on a white plate, the cut edges showing melted orange cheddar with yellow sweetcorn and red pepper pieces, beside a small salad of halved cherry tomatoes and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemony chickpea, cucumber and tomato rice salad · `lemony-chickpea-cucumber-rice-salad`

```
A wide white bowl of cold white rice tossed with golden chickpeas, small green cucumber cubes, halved red cherry tomatoes and chopped dark green spinach, glossy with a lemon and olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced chickpea and tomato soup with toast · `spiced-chickpea-tomato-soup-toast`

```
A round white bowl of thick red tomato soup with golden chickpeas and dark green spinach, some chickpeas crushed into it, beside two triangles of golden wholemeal toast on a small plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Curried chicken wraps with cucumber yogurt · `curried-chicken-wraps-cucumber-yogurt`

```
A tortilla wrap cut in half on a round white plate, the cut ends showing golden-orange curry-spiced chicken, shredded green lettuce, thin purple onion slices and a pale green cucumber yogurt sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Curried chickpea salad wraps · `curried-chickpea-salad-wraps`

```
A tortilla wrap cut in half on the diagonal on a white plate, the cut ends showing a pale golden curried chickpea filling with dark raisins, crisp green lettuce and cucumber sticks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken shawarma-style salad with houmous · `chicken-shawarma-style-salad-houmous`

```
A wide white bowl of green leaves, cucumber half-moons and halved red cherry tomatoes topped with golden spiced chicken strips and a generous spoonful of creamy beige houmous. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, egg and cucumber salad with lemon · `tuna-egg-cucumber-lemon-salad`

```
A wide white bowl of green salad leaves, cucumber slices and halved red cherry tomatoes topped with flaked pale pink tuna and quartered boiled eggs with bright yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Singapore-style noodles with chicken and egg · `singapore-style-chicken-egg-noodles`

```
A wide white bowl of noodles stained golden yellow with turmeric, tangled with golden chicken strips, soft yellow scrambled egg pieces, thin red pepper strips and green spring onion lengths. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken Caesar-style pasta salad · `chicken-caesar-style-pasta-salad`

```
A wide white bowl of pasta and crisp shredded lettuce in a creamy pale dressing, topped with slices of golden chicken, crunchy golden toasted bread squares and grated cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna Niçoise-style pasta salad · `tuna-nicoise-style-pasta-salad`

```
A wide white bowl of pasta tossed with bright green peas, torn crisp lettuce and halved red cherry tomatoes, topped with large flakes of pale pink tuna and quartered boiled eggs with yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Arroz a la cubana with fried eggs and banana · `arroz-a-la-cubana-eggs-banana`

```
A white plate with a neat dome of white rice, a pool of smooth red tomato sauce beside it, two fried eggs with set whites and golden yolks over the rice, and golden fried banana halves alongside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea fatteh with garlic yogurt and toasted bread · `chickpea-fatteh-garlic-yogurt-toasted-bread`

```
A shallow white bowl of crisp golden toasted bread squares and warm chickpeas under a thick layer of white garlic yogurt, drizzled with red paprika oil and scattered with toasted almonds, chopped tomatoes beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Coronation chicken rice salad · `coronation-chicken-rice-salad`

```
A wide white bowl of rice with green salad leaves and cucumber slices, topped with chunks of chicken in a creamy pale yellow curried dressing with plump sultanas and golden toasted almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Greek-style rice salad with cottage cheese and chickpeas · `greek-style-rice-salad-cottage-cheese-chickpeas`

```
A wide white bowl of glossy rice tossed with golden chickpeas, red tomato and green cucumber chunks flecked with dried oregano, topped with a large spoonful of white cottage cheese. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lebanese-style lemon chicken with vermicelli rice · `lebanese-style-lemon-chicken-vermicelli-rice`

```
A white plate with a mound of white rice dotted with short golden-brown strands of toasted spaghetti, topped with golden spiced chicken chunks, beside a chopped salad of red tomato and green cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy pesto pasta with cottage cheese and spinach · `creamy-pesto-cottage-cheese-pasta-spinach`

```
A wide white bowl of pasta coated in a smooth pale green creamy pesto sauce, with dark green wilted spinach and soft, split red cherry tomatoes, finished with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chilli bean loaded new potatoes with cottage cheese · `chilli-bean-loaded-potatoes-cottage-cheese`

```
A white plate of crisp golden roasted halved new potatoes piled with a thick red kidney bean and pepper chilli, white cottage cheese, melted orange cheddar and green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lahmacun-style spiced beef naans with salad · `lahmacun-style-spiced-beef-naans`

```
Two round naans on a wooden board, spread edge to edge with a thin, browned layer of red spiced beef mince, one piled with shredded green lettuce, chopped red tomato and thin purple onion slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Nasi goreng-style tuna fried rice with fried eggs · `tuna-nasi-goreng-fried-eggs`

```
A white plate of dark, glossy soy fried rice with flakes of tuna, red pepper strips and green spring onions, topped with a fried egg, with cucumber slices and tomato wedges on the side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egyptian-style koshari with rice, pasta and chickpeas · `egyptian-style-koshari-rice-pasta-chickpeas`

```
A wide white bowl of rice and small pasta topped with golden chickpeas and a thick red spiced tomato sauce, crowned with a heap of deep golden crisp fried onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Hong Kong-style baked chicken and tomato rice · `hong-kong-style-baked-chicken-tomato-rice`

```
An oval ovenproof dish of golden egg fried rice under golden chicken fillets and a thick red tomato and soft onion sauce, covered in bubbling melted mozzarella browned in patches. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Japanese-style cold noodle salad with chicken and egg · `hiyashi-chuka-cold-noodles-chicken-egg`

```
A wide white bowl of chilled noodles topped with neat rows of shredded white chicken, thin yellow omelette strips, green cucumber sticks, halved red cherry tomatoes and yellow sweetcorn, glossy with a soy dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Baked chickpea falafel wraps with houmous · `baked-chickpea-falafel-houmous-wraps`

```
A round white plate with a rolled tortilla wrap cut in half, showing crisp brown falafel, shredded lettuce, tomato and cucumber slices and creamy houmous, beside a few whole golden falafel and a small dish of houmous. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Moroccan-style harira with chickpeas and beans · `harira-chickpea-bean-tomato-soup`

```
A deep white bowl of thick, rusty red spiced tomato soup full of golden chickpeas, dark red kidney beans, small pasta shapes and dark green wilted spinach, flecked with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chana chaat with yogurt and warm naan · `chana-chaat-yogurt-naan`

```
A shallow white bowl of golden chickpeas tossed with small cubes of red tomato and pale green cucumber, dusted with red paprika and topped with a thick spoonful of white yogurt, beside a warm golden naan torn into pieces. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea, mozzarella and cucumber pasta salad · `chickpea-mozzarella-cucumber-pasta-salad`

```
A wide white bowl of pasta spirals tossed with golden chickpeas, torn white mozzarella, halved red cherry tomatoes, small cucumber cubes and chopped dark green spinach, glossy with a lemon and oregano dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spinach and cottage cheese folded flatbreads · `spinach-cottage-cheese-folded-flatbreads`

```
Crisp golden folded flatbreads cut into wedges on a white plate, the cut edges showing dark green spinach and melted white cheese with soft curds, beside a small salad of halved cherry tomatoes and cucumber cubes. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Roast pepper and chickpea rice bowl with lemon yogurt · `roast-pepper-chickpea-rice-bowl-lemon-yogurt`

```
A wide white bowl of white rice with wilted dark green spinach, topped with charred red and yellow roasted pepper strips and crisp paprika-dusted chickpeas, finished with a big spoonful of white lemon yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu banh mi-style sandwiches · `tofu-banh-mi-style-sandwiches`

```
Two toasted sandwiches cut in half on a wooden board, the cut sides showing crisp golden glazed tofu slices, orange carrot and pale green cucumber matchsticks, crisp lettuce and thin green spring onion slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu larb lettuce cups with rice · `tofu-larb-lettuce-cups-rice`

```
Crisp pale green lettuce leaves on a white platter filled with golden crumbled tofu flecked with red chilli and green spring onion, topped with small cucumber cubes, beside a small bowl of white rice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut, chickpea and crunchy vegetable rice salad · `peanut-chickpea-crunchy-rice-salad`

```
A wide white bowl of cold white rice tossed with golden chickpeas, small cucumber cubes, chopped red pepper and yellow sweetcorn, coated in a creamy tan peanut dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy chickpea and spinach pasta with lemon · `creamy-chickpea-spinach-lemon-pasta`

```
A wide white bowl of pasta spirals in a creamy pale beige sauce with golden chickpeas, dark green wilted spinach and halved red cherry tomatoes, dotted with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chinese-style sweetcorn and tofu soup · `chinese-sweetcorn-tofu-soup`

```
A round white bowl of thick, pale yellow sweetcorn soup with whole golden kernels and soft white cubes of tofu, scattered with thin bright green spring onion rings and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon and oregano tofu with Greek-style salad and rice · `lemon-oregano-tofu-greek-salad-rice`

```
A white plate with a mound of white rice, golden grilled tofu slices flecked with dried oregano and charred at the edges, and a chunky salad of cucumber, red tomato and green pepper glossy with olive oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy tomato and tofu soup with toast · `creamy-tomato-tofu-soup-toast`

```
A round white bowl of smooth, creamy orange-red tomato soup with a sprinkle of paprika and cracked black pepper, beside two triangles of golden wholemeal toast on a small plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Fattoush-style chickpea salad with crispy wraps · `fattoush-chickpea-salad-crispy-wraps`

```
A wide white bowl of chopped crisp lettuce, cucumber, red tomato and green pepper with golden chickpeas, glossy with a lemon dressing and scattered with golden, paprika-dusted crisp squares of baked tortilla. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tawa pulao-style spiced rice with tofu and chickpeas · `tawa-pulao-style-tofu-chickpea-rice`

```
A wide white plate piled with red-orange spiced rice tossed with golden tofu cubes, whole chickpeas, bright green peas and soft pieces of red pepper and tomato, the grains glossy with the masala. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Roast tomato and tofu pasta with crispy chickpeas · `roast-tomato-tofu-pasta-crispy-chickpeas`

```
A rectangular white baking dish of pasta spirals tossed in a chunky sauce of burst red cherry tomatoes and crushed golden tofu, with crisp golden chickpeas, dark green wilted spinach and specks of oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lazy manti-style pasta with spiced tofu and yogurt · `lazy-manti-style-pasta-spiced-tofu-yogurt`

```
A wide shallow white bowl of pasta shapes under a thick layer of white yogurt, topped with crumbled golden tofu in a red spiced tomato coating and drizzled with glossy red paprika oil flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Nasi lemak-style coconut rice with crispy tofu · `nasi-lemak-style-coconut-rice-crispy-tofu`

```
A round white plate with a dome of glossy white coconut rice, golden crisp tofu cubes and crunchy fried chickpeas around it, a fan of pale green cucumber rounds and a small heap of deep red sticky chilli sambal. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ethiopian-style tofu tibs with garlic spinach and rice · `ethiopian-style-tofu-tibs-spinach-rice`

```
A white plate with a mound of white rice and golden tofu cubes tossed with soft red onion, charred pepper strips and tomato in a rusty red spice coating, beside a heap of dark green garlicky wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheese kottu-style chopped wraps with tofu · `cheese-kottu-style-wraps-tofu-peppers`

```
A wide shallow white bowl piled with chopped strips of golden tortilla wrap tossed with small golden tofu cubes, red pepper slices, green peas and wilted spinach in a turmeric-yellow sauce, threaded with strings of melted mozzarella. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Baked pea and tofu samosa parcels with yogurt dip · `baked-pea-tofu-samosa-wraps-yogurt-dip`

```
Crisp golden triangular tortilla parcels on a white plate, one broken open to show crumbled yellow spiced tofu and bright green peas, beside a small bowl of white cucumber yogurt dip and chopped cucumber and red tomato. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken congee with spinach and spring onions · `chicken-congee-spinach-spring-onions`

```
A wide white bowl of thick, silky white rice congee with soft shreds of chicken and dark green wilted spinach, topped with a glossy spoonful of bright green sliced spring onions in oil and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Yogurt rice with cucumber and toasted cumin · `yogurt-rice-cucumber-toasted-cumin`

```
A round white bowl of soft, creamy white yogurt rice, scattered with small cubes of pale green cucumber and drizzled with golden oil speckled with toasted brown cumin and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spinach, tomato and cottage cheese rice bake · `spinach-tomato-cottage-cheese-rice-bake`

```
A square of rice bake on a round white plate, showing layers of soft rice flecked with dark green spinach, a creamy white layer of cottage cheese and red tomato sauce, under bubbling golden melted cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Stracciatella-style egg and spinach soup with pasta · `stracciatella-egg-spinach-pasta-soup`

```
A wide white bowl of clear golden broth with small pasta shapes, dark green wilted spinach and soft pale yellow ribbons of set egg, scattered with finely grated cheese and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Korean-style soft tofu and mushroom stew with rice · `korean-soft-tofu-mushroom-stew`

```
A wide white bowl of red-tinged, gently spicy broth with large soft white chunks of tofu, sliced golden mushrooms and soft onion, scattered with green spring onions, beside a small bowl of white rice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spanish-style chickpea and spinach stew with rice · `spanish-chickpea-spinach-stew-rice`

```
A wide white bowl with a mound of white rice and a thick red-orange paprika and tomato stew of soft, partly crushed chickpeas and dark green wilted spinach spooned over it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Turkish-style poached eggs on garlic yogurt with toast · `turkish-style-eggs-garlic-yogurt-toast`

```
A round white plate spread with thick white garlic yogurt, topped with two poached eggs with set whites and golden yolks and a drizzle of deep red paprika oil, with two slices of golden toast beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chinese-style steamed egg custard with rice and spinach · `chinese-steamed-egg-custard-rice-spinach`

```
A wide shallow white dish of smooth, glossy pale yellow steamed egg custard scattered with thin green spring onion slices, beside a small mound of white rice and a heap of dark green garlicky spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon and sweetcorn chowder · `salmon-sweetcorn-chowder`

```
A wide white bowl of thick, creamy pale chowder with soft potato cubes, yellow sweetcorn and large pink flakes of salmon, finished with a grind of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Green shakshuka with spinach, peas and yogurt · `green-shakshuka-spinach-peas-yogurt`

```
A round white plate of glossy dark green wilted spinach, bright green peas and sliced spring onions holding two eggs with set whites and golden yolks, with a spoonful of thick white yogurt beside them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bang bang-style chicken salad with rice · `bang-bang-chicken-salad-rice`

```
A round white plate with white rice, shredded pale green lettuce and thin cucumber sticks, topped with soft shreds of poached chicken, a drizzle of glossy pale brown peanut sauce and sliced green spring onions. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Paprika tofu, pepper and sweetcorn rice box · `paprika-tofu-pepper-sweetcorn-rice-box`

```
A rectangular food box of white rice mixed with small red pepper pieces and yellow sweetcorn, topped with crisp golden tofu cubes dusted with red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mexican-style bean and sweetcorn pasta salad · `mexican-style-bean-sweetcorn-pasta-salad`

```
A wide white bowl of pasta spirals tossed with dark red kidney beans, yellow sweetcorn, small red pepper pieces and halved cherry tomatoes in a chunky red salsa dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg and pea kedgeree-style rice with spinach · `egg-pea-kedgeree-style-rice-spinach`

```
A wide white bowl of golden yellow spiced rice with green peas and wilted spinach, topped with quartered boiled eggs showing set yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced chicken and chickpea rice box with tomatoes · `spiced-chicken-chickpea-rice-box`

```
A rectangular food box of white rice topped with golden spiced chicken strips and crisp chickpeas, beside halved red cherry tomatoes and green cucumber chunks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, pea and sweetcorn pasta salad with lemon yogurt · `chicken-pea-sweetcorn-pasta-salad-yogurt`

```
A wide white bowl of pasta shapes in a creamy white yogurt dressing with golden paprika chicken strips, bright green peas and yellow sweetcorn. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoky baked beans with crispy tofu on toast · `smoky-baked-beans-crispy-tofu-toast`

```
Two slices of golden wholemeal toast on a round white plate under glossy orange baked beans with dark wilted spinach, scattered with crisp golden tofu cubes dusted with red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Minestrone-style chickpea and tofu soup · `minestrone-style-chickpea-tofu-soup`

```
A wide white bowl of thick red tomato soup with small pasta shapes, chickpeas, small tofu cubes, orange carrot pieces and dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Two-bean, sweetcorn and tofu salad with lemon and cumin · `two-bean-sweetcorn-tofu-salad-lemon`

```
A wide white bowl of chickpeas and dark red kidney beans tossed with yellow sweetcorn, small red pepper pieces and green cucumber cubes, topped with golden crisp tofu cubes. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mexican-style tuna with tomatoes, onion and rice · `mexican-style-tuna-tomatoes-onion-rice`

```
A wide white bowl of white rice topped with pale pink flaked tuna in a chunky red tomato and soft onion sauce, finished with a pile of finely shredded green lettuce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Korean-style rolled omelette with rice and cucumber · `korean-style-rolled-omelette-rice-cucumber`

```
A wide white bowl of white rice beside thick slices of rolled yellow omelette showing swirled layers flecked with green spring onion and red pepper, with thin cucumber slices dusted with red chilli. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoky tofu and pea carbonara-style spaghetti · `smoky-tofu-pea-carbonara-style-spaghetti`

```
A wide white bowl of spaghetti coated in a creamy pale sauce with bright green peas, scattered with crisp, paprika-dusted golden tofu cubes and coarse black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoky tofu, lettuce and tomato toasted sandwiches · `smoky-tofu-lettuce-tomato-toasted-sandwiches`

```
A round white plate with a tall triple-decker toasted sandwich cut in half, showing layers of crisp golden paprika tofu slices, green lettuce leaves, red tomato slices and a thin spread of beige houmous. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

## Dinner

### ✓ Chicken, rice and soy bowl · `chicken-rice-bowl`

```
A wide shallow white bowl with fluffy white rice heaped on one side and, beside it, browned chicken strips tossed with long strips of red, green and orange pepper, all coated in a glossy dark soy glaze. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken curry with rice · `chicken-curry`

```
A white oval plate holding a creamy orange curry with golden chunks of chicken and soft pieces of onion on one side, and a neat mound of white rice on the other. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef chilli and rice · `beef-chilli`

```
A deep round white bowl filled with thick deep red-brown chilli of crumbled beef mince, dark red kidney beans and soft pieces of onion in tomato sauce, with a half-moon of fluffy white rice tucked against one side of the rim. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Creamy chicken and mushroom pasta · `chicken-mushroom-pasta`

```
A wide white pasta bowl heaped with pasta shapes in a pale creamy sauce, with bite-sized pieces of golden chicken, sliced brown mushrooms and wilted dark green spinach through it, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and soy noodles · `salmon-noodles`

```
A shallow white bowl of soy-darkened noodles in a loose nest, topped with large flakes of pink-orange salmon with browned edges and a scatter of thin green spring onion slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna and tomato pasta · `tuna-pasta`

```
A round white plate with a wide rim holding pasta shapes in a smooth red tomato sauce speckled with dried herbs, pale flakes of tuna through it and coarsely grated yellow cheddar sprinkled over the top, just starting to melt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Coconut salmon curry with rice · `salmon-coconut-curry`

```
A round white plate with a raised rim: white rice on one side, and on the other a creamy pale orange coconut curry sauce holding large chunks of pink salmon and bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Satay noodles with egg · `satay-egg-noodles`

```
A wide white bowl of noodles glossy with a tan-brown peanut sauce, tossed with stir-fried beansprouts, shredded cabbage and strips of carrot and pepper, topped with wide ribbons of pale yellow omelette laid loosely across the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea and tomato curry · `chickpea-curry`

```
A wide white pasta bowl with a round dome of white rice in the centre, ringed by thick orange-red tomato and coconut curry full of golden chickpeas, dark green wilted spinach and soft pieces of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean chilli · `bean-chilli`

```
A wide shallow white bowl divided on the diagonal: white rice on one side and, on the other, a deep red chunky chilli of dark red kidney beans, pale golden chickpeas and soft pieces of onion in thick tomato sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna fishcakes with peas · `tuna-fishcakes`

```
A round white plate with two flat, round, golden-brown fishcakes side by side, crisp on top and flecked with green spring onion, and a small heap of bright green peas on the other side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and bean pasta · `mushroom-bean-pasta`

```
A shallow round white bowl of pasta shells in a chunky red tomato sauce with pieces of tomato, thick slices of brown mushroom, dark red kidney beans and small squares of soft onion, speckled with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken thigh, bean and tomato rice · `chicken-bean-rice`

```
A wide round white bowl heaped with sticky orange-red tomato and paprika rice, browned pieces of chicken thigh and dark red kidney beans sitting on the surface among soft pieces of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken jalfrezi with rice · `chicken-jalfrezi`

```
Chicken jalfrezi with rice on a wide white plate: a neat mound of white rice beside a glossy orange-red tomato sauce holding golden-orange spiced chicken chunks, large pieces of red and yellow pepper and soft curved petals of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef keema with peas and rice · `beef-keema-peas`

```
Beef keema with peas and rice on a white square plate: a neat dome of white rice in the centre ringed by rich red-brown tomato sauce full of finely crumbled spiced beef mince, bright green peas and small pieces of soft onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg and pea curry · `egg-pea-curry`

```
Egg and pea curry in a wide shallow white bowl: halved boiled eggs with set yellow yolks lie cut side up in an orange-red tomato sauce dotted with green peas, with a mound of white rice at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Kidney bean curry with rice · `kidney-bean-curry`

```
A wide white soup plate with a bed of white rice covered by glossy dark red kidney beans and soft pieces of onion in a thick, spiced orange-red tomato sauce, a white crescent of rice showing along one edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken chow mein · `chicken-chow-mein`

```
Chicken chow mein in a wide white pasta bowl: a tangled heap of glossy soy-brown noodles mixed with browned chicken strips and colourful strips of stir-fried vegetables, with sliced green spring onion scattered across the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sticky soy beef noodles · `sticky-beef-noodles`

```
Sticky soy beef noodles in a deep white bowl: a loose swirl of glossy dark-brown noodles with a heap of crumbled browned beef mince in the centre, large broccoli florets and wide red pepper strips around it, and sliced green spring onion on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweet chilli chicken stir-fry · `sweet-chilli-chicken`

```
Sweet chilli chicken stir-fry on a round white plate: a neat mound of white rice beside strips of chicken glazed in glossy red-orange sweet chilli sauce, mixed with red pepper strips, broccoli florets and pieces of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced yogurt chicken with naan · `spiced-chicken-naan`

```
Spiced yogurt chicken with naan on a large round white platter: golden-orange chicken chunks with browned edges, roasted red and yellow pepper pieces and onion wedges in a single layer, and one soft naan bread with pale blistered spots alongside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken fajitas with salsa · `chicken-fajitas`

```
Chicken fajitas with salsa on a pale wooden board: two tortilla wraps toasted with brown spots and rolled into cones, the open ends showing browned chicken strips, strips of red and yellow pepper and onion, chunky red tomato salsa and white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef burrito bowl · `beef-burrito-bowl`

```
Beef burrito bowl in a wide shallow white bowl: a base of white rice with crumbled spiced beef mince in the centre under a spoonful of red tomato salsa, beside a pile of dark red kidney beans mixed with yellow sweetcorn and a heap of shredded green lettuce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken shawarma-style wraps · `chicken-shawarma-wraps`

```
Chicken shawarma-style wraps on a long white platter: two tortilla wraps toasted with brown spots, rolled and lying side by side, their open top ends showing charred chicken pieces, torn green lettuce, tomato slices, cucumber half-moons and white garlic yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced chickpea and potato curry · `chickpea-potato-curry`

```
Chickpea and potato curry in a wide shallow white bowl: pale golden chickpeas and halved new potatoes in a creamy orange coconut and tomato sauce, dark green wilted spinach folded through, with a mound of white rice at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Soy and honey salmon rice bowl · `soy-honey-salmon-bowl`

```
Soy and honey salmon rice bowl in a shallow white bowl: large flaked pieces of salmon with a glossy dark glaze caramelised at the edges and pink-orange flesh on a bed of white rice, with broccoli florets and round cucumber slices alongside and slanted spring onion on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg fried rice with peas · `egg-fried-rice`

```
Egg fried rice with peas in a round white bowl: a heaped surface of rice tinted pale brown by soy, mixed with small pieces of yellow scrambled egg and green peas and flecked with sliced green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Vegetable and almond stir-fry with rice · `vegetable-almond-stir-fry`

```
Vegetable and almond stir-fry in a wide white pasta bowl: white rice as a bed, covered on one half by glossy broccoli florets, red pepper strips and orange carrot slices in a red-orange glaze, with chopped golden almonds and sliced spring onion over them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mexican chicken and bean rice · `mexican-chicken-rice`

```
Mexican chicken and bean rice in a shallow round white dish: orange-red tomato-tinted rice with browned chicken chunks, dark red kidney beans, and pieces of onion and red pepper mixed through, filling the dish edge to edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean and pepper fajitas · `bean-pepper-fajitas`

```
Bean and pepper fajitas on a white rectangular plate: two rolled tortilla wraps side by side, the filling just showing at one end of each: soft strips of red and yellow pepper, onion, dark red kidney beans and red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Moroccan-style chickpea stew with rice · `moroccan-chickpea-stew`

```
Moroccan-style chickpea stew on a wide white plate with a rim: thick red-brown stew heaped in the centre, crowded with pale golden chickpeas, orange carrot pieces and plump dark raisins, with a ring of white rice around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg chow mein with vegetables · `egg-chow-mein`

```
A round white plate piled with egg chow mein: glossy soy-browned noodles tangled with shredded stir-fry vegetables in green, orange and cream strands, with pale yellow pieces of scrambled egg showing across the top and sliced spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg and tomato stir-fry with rice · `egg-tomato-stir-fry`

```
A shallow white bowl with a bed of white rice showing at the edge under soft pale yellow scrambled egg folded through glossy red tomato pieces that have broken down into a thick sauce, scattered with sliced spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chinese-style chicken curry with rice and peas · `chinese-style-chicken-curry`

```
A wide white plate with a straight band of white rice along one side and, beside it, a thick golden-yellow curry holding bite-sized pale gold pieces of chicken, soft curved petals of onion and bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced chicken and rice bowl with yogurt · `spiced-chicken-rice-bowl`

```
A wide round white bowl with white rice in the middle, topped with golden chicken chunks coated in orange-red spices, neat piles of diced cucumber and red tomato to one side, and a dollop of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea and spinach stew with eggs · `chickpea-spinach-egg-stew`

```
A wide white bowl of thick red tomato stew crowded with pale chickpeas and dark green wilted spinach, with two eggs, their whites set and their yolks bright yellow, resting side by side on the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spaghetti bolognese · `spaghetti-bolognese`

```
A wide round white plate holding a nest of spaghetti topped with a mound of thick red-brown beef and tomato sauce dotted with small cubes of orange carrot, grated cheddar heaped over the centre and a few spaghetti strands curling out at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheesy beef pasta bake · `beef-pasta-bake`

```
A round white plate holding a spooned serving of cheesy beef pasta bake: pasta shapes in red beef sauce under a golden, bubbling layer of melted mozzarella and creamy cheese sauce with browned patches. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cottage pie with cheesy mash · `cottage-pie`

```
A white square plate holding a spooned serving of cottage pie: a golden-browned ridged mashed potato top with melted cheddar patches, and the savoury beef mince filling with green peas and cubes of orange carrot showing at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, tomato and mozzarella pasta bake · `chicken-mozzarella-pasta-bake`

```
A small white rectangular baking dish of pasta shapes and bite-sized chicken pieces in red tomato sauce with dark green wilted spinach, under a golden bubbling layer of melted mozzarella with a few browned spots. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon with new potatoes and peas · `salmon-new-potatoes-peas`

```
A white oval plate with one baked salmon fillet, its top golden and glossy and its sides pink-orange with paler flaking lines, beside a pile of small new potatoes shining with oil and a heap of bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pesto salmon with crushed potatoes · `pesto-salmon-crushed-potatoes`

```
A wide round white plate with one salmon fillet under a spread of green pesto, a few roasted red cherry tomatoes beside it, roughly crushed skin-on potatoes with a glossy sheen of olive oil, and a few broccoli florets on long stalks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ham, egg and crispy potatoes with peas · `ham-egg-potatoes`

```
A large white plate with two fried eggs, set whites and golden yolks, folded slices of pink ham, halved crispy golden potatoes and a pile of green peas, with a small dab of yellow mustard at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken thigh and potato traybake · `chicken-thigh-potato-traybake`

```
A white oval baking dish holding a portion of traybake: two golden-brown roast chicken thighs, halved roast potatoes with browned edges, red onion wedges and red pepper pieces, all dusted orange-red with paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Potato, tomato and mozzarella bake · `potato-tomato-mozzarella-bake`

```
A small white oval baking dish of halved potatoes, golden on their cut sides, in a red tomato sauce, covered by melted mozzarella that is golden and bubbling in places, with the red sauce showing between the patches of cheese. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Easy macaroni cheese · `easy-macaroni-cheese`

```
A small round white baking dish of macaroni cheese, its surface a golden-brown grilled layer of melted cheddar with darker toasted patches and slices of red tomato laid across the top, creamy elbow macaroni visible at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon carbonara-style spaghetti · `bacon-carbonara-spaghetti`

```
A shallow round white bowl holding a nest of spaghetti coated in a creamy pale yellow egg and cheese sauce, with golden-brown bacon strips scattered through, grated cheddar on top and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef meatballs with spaghetti · `beef-meatballs-spaghetti`

```
A deep white plate holding a nest of spaghetti topped with several round browned meatballs, all coated in a thick red tomato sauce that pools around the edges, with dried herb flecks showing in the meatballs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and pea fish pie · `salmon-fish-pie`

```
A small white square baking dish of salmon fish pie, its top a golden-browned layer of mashed potato with melted cheddar, one corner broken open to show pink salmon chunks and green peas in a creamy sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean and mushroom cottage pie · `bean-cottage-pie`

```
A small round white pie dish of bean and mushroom cottage pie, its golden-brown mashed potato top covering the dish, one corner scooped away to show a rich red filling of kidney beans, peas, mushrooms and diced carrot. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and chickpea stew · `chicken-chickpea-stew`

```
Chicken and chickpea stew in a wide white pasta bowl: browned chicken chunks with a red-brown paprika crust, round chickpeas and soft curved strips of onion in an orange-red paprika and tomato sauce, with dark green wilted spinach stirred through the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon and tomato linguine · `bacon-tomato-linguine`

```
Bacon and tomato linguine in a wide white pasta bowl: a loose nest of linguine coated in glossy red tomato sauce, golden bacon strips mixed through it and showing at the surface, with a speckling of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea, potato and pepper traybake · `chickpea-potato-traybake`

```
A roasted traybake on a wide white oval plate: golden halved potatoes, browned chickpeas, chunks of red and yellow pepper with softened edges, red onion quarters and halved cherry tomatoes roasted cut side up, all coloured orange-red with paprika and cumin. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Minestrone with beans and pasta · `minestrone-beans-pasta`

```
A shallow white bowl of thick minestrone, its round surface an orange-red tomato broth crowded with small elbow macaroni, red kidney beans, green peas, small cubes of orange carrot and onion, flecked with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and pepper kebabs with yogurt dressing · `chicken-pepper-kebabs`

```
One rolled wrap on a pale wooden board, its open end showing golden grilled chicken chunks, squares of red and yellow pepper, pieces of red onion with browned edges and a thick white yogurt dressing inside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Barbecue chicken thigh skewers with corn salad · `bbq-chicken-thigh-skewers`

```
Two skewers of dark, sticky, glossy barbecue-glazed chicken thigh chunks beside a mound of corn salad on a wide white oval plate: yellow sweetcorn, halved red cherry tomatoes, diced cucumber and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Roast turkey with parsnips, sprouts and cranberry · `turkey-roast-parsnips-sprouts`

```
A large white oval plate showing whole white-golden roast turkey fillets on one side, golden-brown honey-glazed parsnip fingers and crisp roast potatoes in the middle, a heap of bright green halved sprouts on the other side and a small bowl of deep red cranberry sauce at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chipolatas with spiced red cabbage and mash · `chipolatas-red-cabbage-mash`

```
A wide white round plate with a mound of smooth pale mash on one side, a pile of soft, glossy deep purple-red cabbage beside it, and a row of glossy, sticky honey-glazed chipolata sausages laid across the top, with a small spoonful of yellow mustard at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Gammon steaks with honey parsnips and apple sauce · `gammon-parsnips-apple-sauce`

```
A round white plate with one pink-edged gammon steak with golden-brown seared surfaces, a row of caramelised honey-roast parsnip fingers beside it, a small heap of bright green peas, and small bowls of pale golden apple sauce and yellow mustard at the rim. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sprout, chestnut and potato gratin · `sprout-chestnut-potato-gratin`

```
A rectangular white ovenproof dish seen from above, filled with a bubbling golden-brown cheddar crust, with dark green sprout halves, pale brown chestnut halves and slices of cream potato in a creamy sauce showing through at the edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Red cabbage, chestnut and cranberry rice · `red-cabbage-chestnut-cranberry-rice`

```
A wide shallow white bowl of fluffy rice tinted pink-purple by red cabbage ribbons, studded with whole pale brown chestnuts, chunks of red-skinned apple and glossy deep red dried cranberries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Coconut vegetable curry with rice · `coconut-vegetable-curry`

```
A wide white bowl with a mound of fluffy white rice on one side and a creamy orange coconut curry on the other, full of red pepper pieces, orange carrot rounds, green peas, golden chickpeas and wilted dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and pea risotto-style rice · `mushroom-pea-risotto-rice`

```
A wide shallow white bowl of soft, creamy rice studded with golden-brown sliced mushrooms and bright green peas, with tiny flecks of dried herbs and black pepper through it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Garlic mushroom and spinach spaghetti · `garlic-mushroom-spinach-spaghetti`

```
A twirled nest of spaghetti in a wide white bowl, glossy with olive oil and tangled with golden-brown sliced mushrooms and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Potato and pea curry with rice · `potato-pea-curry`

```
A round white plate with fluffy white rice on one side and a golden-orange potato and pea curry on the other, the halved new potatoes golden-brown on top, sitting in thick spiced tomato sauce dotted with bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Rice-stuffed peppers with beans and tomatoes · `rice-stuffed-peppers`

```
Two baked pepper halves on a round white plate, one red and one yellow, their skins soft and browned at the edges, each heaped with rice mixed with dark red kidney beans, yellow sweetcorn and chopped tomato. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Paprika bean and vegetable goulash-style stew with rice · `bean-vegetable-goulash`

```
A wide shallow grey bowl with fluffy white rice on one side and a thick, deep brick-red paprika stew on the other, full of dark red kidney beans, red pepper pieces, orange carrot rounds and soft brown mushroom slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peanut and vegetable stew with rice · `peanut-vegetable-stew`

```
A deep white bowl of thick, creamy orange-brown peanut and tomato stew with golden chickpeas, orange carrot rounds, red pepper pieces and wilted dark green spinach, beside a mound of fluffy white rice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Lemon and garlic chicken with potatoes and broccoli · `lemon-garlic-chicken-potatoes`

```
A round white plate of golden roasted chicken chunks, halved new potatoes browned at the edges and roasted broccoli florets with crisp darker tips, all glossy with lemon and garlic juices and flecked with dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken biryani-style rice · `chicken-biryani-style-rice`

```
A wide white bowl heaped with fluffy golden-yellow spiced rice mixed through with golden-browned chicken pieces, soft browned onion and green peas, with a small white bowl of thick natural yogurt beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Paprika chicken with peppers and rice · `paprika-chicken-peppers-rice`

```
A wide white bowl of fluffy white rice topped with golden chicken pieces and soft strips of red pepper in a thick, glossy brick-red paprika and tomato sauce with softened onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon with lemon rice and broccoli · `salmon-lemon-rice-broccoli`

```
A round white plate with a baked salmon fillet, pink and opaque with a golden top, beside a mound of fluffy white rice flecked with green spring onion and glossy with lemon, and bright green broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna and sweetcorn pasta bake with cheese · `tuna-sweetcorn-pasta-bake`

```
A white square plate holding a serving of tuna pasta bake: pasta shapes in red tomato sauce with pale flakes of tuna, yellow sweetcorn and soft onion, under a golden, bubbling layer of melted cheddar with browned patches. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and broccoli pasta with soft cheese · `salmon-broccoli-pasta`

```
Pasta shapes and bright green broccoli florets in a wide white pasta bowl, coated in a smooth pale creamy sauce, with large flakes of pink-orange baked salmon on top and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken korma-style curry with almonds and rice · `chicken-korma-style-curry`

```
A wide white bowl holding a mound of fluffy white rice on one side and chunks of chicken in a smooth, creamy pale golden coconut sauce on the other, with roughly chopped almonds scattered over the curry. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef, potato and pepper hash · `beef-potato-pepper-hash`

```
A wide white plate of beef hash: golden, crisp-edged chunks of potato mixed with browned beef mince, soft red pepper pieces and onion, all tinted orange-brown with paprika and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and spinach rice bake with cheddar · `mushroom-spinach-rice-bake`

```
A white square plate holding a serving of rice bake: rice mixed with golden-brown sliced mushrooms, dark green wilted spinach and soft onion in a creamy sauce, under a layer of melted cheddar baked golden at the edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Broccoli, pepper and cheddar pasta bake · `broccoli-pepper-cheddar-pasta-bake`

```
A white square plate holding a serving of pasta bake: pasta shapes, bright green broccoli florets and red pepper pieces in a creamy pale cheese sauce, under grated cheddar baked golden brown with crisp darker patches. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Honey mustard chicken with potatoes and carrots · `honey-mustard-chicken-traybake`

```
A white oval plate holding one chicken breast with a sticky, glossy golden honey glaze speckled with mustard seeds and browned at the edges, beside roasted halved new potatoes and orange carrot sticks with caramelised edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon, pepper and chickpea traybake · `salmon-pepper-chickpea-traybake`

```
A round white plate with a roasted salmon fillet dusted with red paprika on a heap of soft red and yellow pepper strips, red onion wedges, golden roasted chickpeas and halved roasted cherry tomatoes, all glossy with oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean and mushroom bolognese · `bean-mushroom-bolognese`

```
A wide white bowl of spaghetti topped with a thick, rich red tomato sauce full of dark red kidney beans, sliced brown mushrooms and orange flecks of grated carrot, with specks of dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon with garlic spinach, peas and rice · `salmon-garlic-spinach-peas-rice`

```
A round white plate with a bed of white rice studded with bright green peas, a heap of dark green wilted spinach with halved red cherry tomatoes, and a pan-fried salmon fillet with crisp golden skin on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea, spinach and tomato pasta · `chickpea-spinach-tomato-pasta`

```
A wide white bowl of pasta shapes in a glossy red tomato sauce with plump golden chickpeas and soft ribbons of dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Lemon salmon with crushed chickpeas and broccoli · `lemon-salmon-crushed-chickpeas`

```
A round white plate with a baked salmon fillet, its pink flesh just flaking, on a mound of roughly crushed golden chickpeas glossy with oil, beside a pile of bright green broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and chickpea stroganoff-style with rice · `mushroom-chickpea-stroganoff`

```
A round white plate with a bed of white rice topped with golden sliced mushrooms, soft onion and chickpeas in a creamy pale orange paprika and yogurt sauce, dusted with a little red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon, broccoli and pea stir-fry with rice · `salmon-broccoli-pea-stir-fry-rice`

```
A wide white bowl of white rice topped with chunks of pink salmon, bright green broccoli florets, peas and strips of mixed stir-fry vegetables glossy with soy sauce, scattered with sliced green spring onions. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced bean and pepper baked eggs · `spiced-bean-pepper-baked-eggs`

```
A wide white plate of thick red tomato sauce with kidney beans, soft pepper strips and onion, holding two eggs with set whites and soft golden yolks, with two slices of golden wholemeal toast beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Vegetable and chickpea balti with rice · `vegetable-chickpea-balti`

```
A wide white bowl with fluffy white rice on one side and a thick red-brown balti curry on the other, full of chickpeas, chunks of red pepper, mushroom quarters and wilted dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna, bean and tomato spaghetti · `tuna-bean-tomato-spaghetti`

```
A wide white bowl of spaghetti tossed in a red tomato sauce with pale pink flakes of tuna, dark red kidney beans and soft chopped onion, flecked with dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and broccoli fishcakes with peas and salad · `salmon-broccoli-fishcakes-salad`

```
A round white plate with two golden pan-fried salmon fishcakes flecked with green broccoli and spring onion, a heap of bright green peas and a small pile of mixed salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced chickpea and vegetable rice with almonds · `spiced-chickpea-vegetable-rice-almonds`

```
A wide white bowl of golden yellow spiced rice with golden-brown spice-coated chickpeas, small orange carrot cubes and bright green peas, scattered with toasted sliced almonds and a few flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon baked in tomatoes with chickpeas and spinach · `salmon-tomato-chickpeas-spinach`

```
A round white plate with a baked salmon fillet on a thick red tomato sauce with chickpeas and dark green wilted spinach, beside a few golden, crispy roasted new potatoes. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bean and vegetable stew with toast · `bean-vegetable-stew-toast`

```
A wide white bowl of thick red bean stew with kidney beans, chickpeas, orange carrot rounds, red pepper chunks and dark green spinach, with two slices of golden wholemeal toast on the side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken thighs in a creamy mushroom sauce with broccoli · `creamy-mushroom-chicken-thighs-broccoli`

```
A golden pan-fried chicken thigh on a round white plate in a creamy pale sauce with sliced browned mushrooms and flecks of dried herbs, with bright green broccoli florets beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheesy chicken and broccoli bake · `cheesy-chicken-broccoli-bake`

```
A portion of chicken and broccoli bake on a round white plate, pieces of chicken and bright green broccoli florets in a creamy sauce under a bubbling, golden-brown cheddar top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef, mushroom and spinach pan with cheddar · `beef-mushroom-spinach-skillet`

```
A wide white bowl of browned beef mince in a thick tomato sauce with sliced mushrooms, wilted dark green spinach and soft onion, topped with patches of melted orange cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pesto chicken with roast tomatoes and broccoli · `pesto-chicken-tomatoes-broccoli`

```
A roast chicken thigh spread with green pesto and melted white mozzarella on a round white plate, beside roasted broccoli florets browned at the edges and blistered red cherry tomatoes in their juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mozzarella chicken in tomato sauce with salad · `mozzarella-chicken-tomato-sauce`

```
A golden chicken thigh covered with melted white mozzarella, golden in spots and sprinkled with dried oregano, in a chunky red tomato sauce with pieces of tomato on a round white plate, beside a small heap of green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon with creamy spinach and broccoli · `salmon-creamy-spinach-broccoli`

```
A pan-fried salmon fillet with a golden top on a round white plate, beside creamy dark green spinach and bright green broccoli florets, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon with garlic spinach and cherry tomatoes · `salmon-garlic-spinach-tomatoes`

```
A golden pan-fried salmon fillet on a bed of wilted dark green spinach and warm halved red cherry tomatoes that still hold their shape, on a round white plate, glistening with lemony pan juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chilli beef with peppers, broccoli and a fried egg · `chilli-beef-pepper-broccoli-stir-fry`

```
A wide white bowl of browned spiced beef mince with strips of red pepper, bright green broccoli florets and wilted dark green spinach, topped with a fried egg with a set white and a golden yolk. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken thigh traybake with peppers, mushrooms and onions · `chicken-thigh-pepper-mushroom-traybake`

```
A wide white plate of golden roasted chicken thigh fillets dusted red with paprika on a bed of soft roasted pepper strips, red onion wedges and browned mushrooms, glossy with spiced oil and pan juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, spinach and tomato coconut curry · `chicken-spinach-coconut-curry`

```
A round white bowl of creamy orange-red coconut and tomato curry with tender pieces of chicken thigh, soft onion and dark green wilted spinach stirred through it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef meatballs in tomato sauce with broccoli · `beef-meatballs-tomato-broccoli`

```
A wide shallow white bowl of browned, lightly charred beef meatballs in a thick, chunky red tomato sauce with pieces of tomato, with bright green broccoli florets heaped on one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef and tomato stuffed peppers with salad · `beef-tomato-stuffed-peppers`

```
Two halves of a soft roasted red pepper on a round white plate, filled with browned beef mince in thick red tomato sauce, beside a small heap of green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Lemon and herb chicken with roast carrots and onions · `lemon-herb-chicken-carrots-onions`

```
A wide white plate of golden roasted chicken thigh fillets flecked with dried herbs, with roasted orange carrot sticks, soft red onion wedges and bright green broccoli florets browned at the tips, glossy with pan juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef, mushroom and tomato stew with greens · `beef-mushroom-tomato-stew-greens`

```
A wide shallow white bowl of thick red beef and tomato stew with browned mince, thick slices of golden mushroom and small orange carrot cubes, with bright green broccoli florets heaped on one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Greek-style lemon chicken traybake · `greek-style-lemon-chicken-traybake`

```
Golden-brown roasted skinless chicken thigh fillets on a round white plate beside halved golden new potatoes, soft purple red onion wedges and blistered red cherry tomatoes, glistening with lemony juices and flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken cacciatore-style stew with pasta · `chicken-cacciatore-style-pasta`

```
A wide white bowl of pasta shapes topped with a rich red tomato sauce of soft red and yellow pepper strips, thick mushroom slices and onion wedges, with browned chicken thigh chunks sitting on top, flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pesto chicken and broccoli pasta · `pesto-chicken-broccoli-pasta`

```
A wide white bowl of pasta shapes coated in glossy green pesto, mixed with golden chicken strips, bright green broccoli florets and halved red cherry tomatoes, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Greek-style chicken with rice and cucumber yogurt · `greek-style-chicken-rice-tzatziki`

```
A round white plate with a bed of fluffy white rice, thick slices of golden roast chicken flecked with oregano, a few soft blistered red cherry tomatoes and a big spoonful of thick white yogurt with small cubes of pale green cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon in tomato sauce with broccoli, peas and new potatoes · `salmon-tomato-sauce-broccoli-potatoes`

```
A round white plate with a pink salmon fillet on a chunky red tomato sauce flecked with dried oregano, beside halved new potatoes, bright green broccoli florets and a small heap of green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, spinach and tomato spaghetti · `chicken-spinach-tomato-spaghetti`

```
A wide white bowl of spaghetti twirled in a rich red tomato sauce, mixed with golden chicken strips and dark green wilted spinach, flecked with dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna, pea and spinach spaghetti with lemon · `tuna-pea-spinach-lemon-spaghetti`

```
A wide white bowl of glossy spaghetti twirled with pale pink flakes of tuna, bright green peas and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pan-fried chicken with peas, spinach and new potatoes · `pan-chicken-peas-spinach-potatoes`

```
A round white plate of golden pan-fried chicken pieces and halved new potatoes browned on their cut sides, mixed with bright green peas and dark green wilted spinach, glossy with oil and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and broccoli pasta with garlic · `chicken-broccoli-garlic-pasta`

```
A round white bowl of pasta shapes tossed with golden pieces of chicken and small bright green broccoli florets, glossy with oil, scattered with finely grated pale yellow cheddar and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Quick chicken and spinach curry with rice · `quick-chicken-spinach-curry-rice`

```
A round white bowl holding a mound of fluffy white rice beside an orange-red tomato curry with chunks of chicken and dark green wilted spinach, topped with a spoonful of thick white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef and broccoli stir-fry with rice · `beef-broccoli-soy-stir-fry-rice`

```
A round white bowl of fluffy white rice topped with browned crumbles of beef mince and bright green broccoli florets glossy with dark soy sauce, scattered with thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken satay noodles · `chicken-satay-noodles`

```
A wide white bowl of thick noodles tossed with golden strips of chicken and crunchy stir-fried vegetable strips in orange, green and cream, all coated in a glossy tan-brown peanut sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon, pea and soft cheese pasta · `bacon-pea-soft-cheese-pasta`

```
A round white bowl of pasta shapes in a smooth, creamy pale sauce, with crisp pink-brown pieces of bacon, bright green peas and dark green wilted spinach through it, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spicy chicken and sweetcorn rice · `spicy-chicken-sweetcorn-rice`

```
A round white bowl of rice coloured an even orange-red by paprika, mixed with browned spiced pieces of chicken, golden sweetcorn, small pieces of red pepper and thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Quick beef and pepper chilli with rice · `beef-pepper-quick-chilli-rice`

```
A deep round white bowl of thick red-brown chilli with crumbled beef mince, dark red kidney beans and soft pieces of red pepper in tomato sauce, beside a neat mound of fluffy white rice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, mushroom and spring onion noodles · `chicken-mushroom-soy-noodles`

```
A wide white bowl of glossy soy-brown noodles tangled with golden strips of chicken, sliced browned mushrooms and short green lengths of spring onion, piled high in the middle of the bowl. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Vegetable noodles with fried eggs · `egg-vegetable-noodle-stir-fry`

```
A wide white bowl of glossy soy-brown noodles tangled with stir-fried vegetable strips in orange, green and cream, topped with two fried eggs with golden, lacy white edges and golden yolks, and thin rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken fajita rice · `chicken-fajita-rice-pan`

```
A round white bowl of rice tinted red-orange by fajita spices, mixed with browned strips of chicken and soft strips of red and yellow pepper and onion, topped with a spoonful of chunky red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna and tomato new potatoes with spinach · `tuna-tomato-new-potatoes-spinach`

```
A shallow round white bowl of halved new potatoes in a thick red tomato sauce speckled with dried oregano, with pale chunks of tuna and dark green wilted spinach through it, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and pea egg fried rice · `chicken-pea-egg-fried-rice`

```
A round white bowl of fried rice tinted pale brown by soy, mixed with small golden pieces of chicken, bright green peas and soft pieces of yellow scrambled egg, flecked with thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Creamy tomato chicken spaghetti · `creamy-tomato-chicken-spaghetti`

```
A wide white pasta bowl of spaghetti twirled in a creamy pale orange tomato sauce, with golden pieces of chicken and dark green wilted spinach through it, speckled with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Garlic and soy chicken with greens and rice · `garlic-soy-chicken-greens-rice`

```
A round white bowl of fluffy white rice topped with golden strips of chicken glossy with soy sauce, bright green broccoli florets and dark green wilted spinach, with a little of the pan juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken tikka masala-style curry with rice · `chicken-tikka-masala-style-curry`

```
A wide white bowl with a mound of white rice on one side and a rich orange-red tomato curry with charred pieces of chicken on the other, finished with a swirl of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and mushroom stroganoff-style with rice · `chicken-mushroom-stroganoff-rice`

```
A round white plate with a mound of white rice beside strips of golden chicken, sliced brown mushrooms and soft onion in a creamy pale mustard sauce, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Hunter's-style chicken with rice and peas · `hunters-style-chicken-rice-peas`

```
A round white plate with a chicken breast wrapped in pink ham, topped with dark glossy barbecue sauce and bubbling golden melted cheddar, beside a heap of white rice mixed with bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Crispy chicken goujons with peas and tomatoes · `crispy-chicken-goujons-peas`

```
Golden-brown crumbed chicken strips piled on a round white plate beside a heap of bright green peas and red tomato wedges, with a small white bowl of thick garlic yogurt dip. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheeseburger pasta · `cheeseburger-pasta`

```
A wide white bowl of pasta shapes in a thick red-brown beef mince and tomato sauce with soft onion, topped with a layer of melted, golden orange cheddar and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef koftas with cucumber yogurt and naan · `beef-koftas-cucumber-yogurt-naan`

```
A warm naan on a round white plate topped with three browned, finger-shaped beef koftas, a salad of shredded green lettuce, tomato wedges and thin onion slices, and a spoonful of white yogurt with small cubes of cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Korean-style beef and rice bowl · `korean-style-beef-rice-bowl`

```
A round white bowl of white rice topped in sections with glossy, sticky browned beef mince, dark green wilted spinach and thin cucumber sticks, with a fried egg in the middle, its yolk bright yellow. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon, spinach and mozzarella pasta bake · `salmon-spinach-mozzarella-pasta-bake`

```
A rectangular white ovenproof dish of pasta shapes in a red tomato sauce with chunks of pink salmon and dark green spinach, covered with patches of bubbling, golden-brown melted mozzarella. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom carbonara-style pasta · `mushroom-carbonara-pasta`

```
A round white bowl of pasta shapes coated in a glossy pale yellow egg and cheese sauce with golden slices of mushroom, scattered with grated orange cheddar and plenty of cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and pea coconut curry with rice · `mushroom-pea-coconut-curry`

```
A wide white bowl with white rice on one side and an orange-gold coconut and tomato curry on the other, filled with halved and thickly sliced brown mushrooms, bright green peas and dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg foo young with rice · `egg-foo-young-rice`

```
A round white plate with a mound of white rice and a thick golden omelette cut into quarters, studded with sliced mushrooms, green peas and soft onion, with a glossy dark soy sauce spooned over. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced baked bean and spinach curry with naan · `baked-bean-spinach-curry-naan`

```
A round white bowl of thick orange-red spiced baked bean curry with soft onion and dark green spinach, a spoonful of white yogurt on top, and a warm golden naan beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken arrabbiata-style pasta · `chicken-arrabbiata-pasta`

```
A wide white bowl of pasta shapes in a rich red tomato sauce with golden pieces of chicken and dark green wilted spinach, flecked with dried oregano, finely grated orange cheddar and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken satay skewers with rice and cucumber · `chicken-satay-skewers-rice`

```
Two skewers of golden, charred chicken chunks on a round white plate, coated with a glossy pale brown peanut sauce, beside a mound of white rice and a heap of thin cucumber half-moons. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and almond stir-fry with rice · `chicken-almond-stir-fry-rice`

```
A round white plate of white rice under a stir-fry of golden chicken strips, bright green broccoli florets, sliced mushrooms and onion chunks in a glossy brown sauce, scattered with toasted chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced yogurt salmon with rice and cucumber salad · `spiced-yogurt-salmon-rice`

```
A round white plate with a salmon fillet under a golden-edged, herb-flecked spiced yogurt topping, a mound of white rice, and a small heap of diced cucumber, tomato and red onion salad. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and egg rice bowl with soy and onion · `chicken-egg-rice-bowl`

```
A round white bowl of white rice topped with pieces of chicken and soft golden onion in a glossy brown soy sauce, softly set yellow and white egg and dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and tomato bread bake · `cheese-tomato-bread-bake`

```
A rectangular white ovenproof dish of puffed, golden-brown wholemeal bread triangles set in an egg custard, topped with slices of red tomato and melted orange cheddar, with dark green spinach showing between the layers. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Roasted mushroom and tomato traybake with houmous and naan · `mushroom-tomato-houmous-traybake`

```
A wide white plate spread with pale beige houmous, piled with golden roasted halved mushrooms, soft tomato quarters, onion wedges and charred broccoli florets, with torn pieces of warm naan at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Savoury mince with rice and peas · `savoury-mince-rice-peas`

```
A round white plate with a mound of white rice mixed with bright green peas beside a rich, dark brown beef mince with thick slices of mushroom and soft onion in a thick glossy gravy. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken katsu-style curry with rice · `chicken-katsu-style-curry-rice`

```
A white plate with slices of crisp golden breadcrumbed chicken beside a neat mound of white rice, a smooth glossy golden-brown curry sauce poured over one side, and thin cucumber sticks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Korean-style sticky chicken with rice and broccoli · `korean-sticky-chicken-rice-broccoli`

```
A round white bowl of white rice with glossy, sticky deep red-brown glazed chicken pieces, bright green broccoli florets and thin cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweet and sour chicken with rice · `sweet-sour-chicken-rice`

```
A white plate with a mound of white rice beside golden chicken pieces, chunks of soft pepper and onion in a glossy bright orange-red sweet and sour sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tandoori-style chicken with rice and cucumber raita · `tandoori-chicken-rice-raita`

```
A white plate with charred, deep orange-red spiced chicken thighs, a mound of white rice, a small white bowl of creamy raita with small cubes of cucumber and a few thin rings of red onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Moroccan-style chicken tagine with rice · `moroccan-chicken-tagine-rice`

```
A wide white bowl of white rice under chunks of chicken in a rich orange-red tomato and onion sauce with dark green spinach, scattered with chopped golden toasted almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Jollof rice with chicken · `jollof-rice-chicken`

```
A wide white bowl of deep orange-red tomato rice with soft pieces of pepper and onion, topped with golden browned chunks of chicken thigh and flecks of dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and peanut stew with rice · `chicken-peanut-stew-rice`

```
A wide white bowl of white rice with chicken pieces in a thick, creamy orange-brown peanut and tomato sauce with dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Jamaican-style brown stew chicken with rice · `jamaican-brown-stew-chicken-rice`

```
A wide white bowl of white rice beside glossy dark brown stewed chicken thighs in a rich gravy with soft slices of pepper, onion and tomato, flecked with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken parmigiana-style with spaghetti · `chicken-parmigiana-spaghetti`

```
A white plate of spaghetti in red tomato sauce, topped with a golden crumbed chicken breast covered in red tomato sauce and bubbling, browned melted mozzarella, flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peri peri-style chicken with spicy rice and salad · `peri-peri-chicken-spicy-rice`

```
A white plate with charred, red-speckled grilled chicken, a mound of orange-red tomato rice with green peas, and a crisp salad of shredded lettuce, tomato wedges and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Rendang-style beef curry with rice · `rendang-beef-curry-rice`

```
A round white plate with a mound of white rice beside a heap of dark, rich brown beef mince curry, glossy and nearly dry, and a few bright green broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Moroccan-style meatballs in tomato sauce with baked eggs · `moroccan-meatballs-tomato-baked-eggs`

```
A wide shallow white dish of browned beef meatballs in a thick red tomato sauce with eggs baked on top, their whites set and their yolks bright yellow, beside torn pieces of golden naan. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pastitsio-style beef and pasta bake · `pastitsio-beef-pasta-bake`

```
A square portion of pasta bake on a white plate, showing a layer of pasta tubes, a layer of rich red-brown beef sauce and a thick, puffed golden-brown egg and cheese topping, beside a heap of dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef enchilada-style rice bake · `beef-enchilada-rice-bake`

```
A portion of baked rice and beef mince in red tomato sauce with yellow sweetcorn on a white plate, topped with red salsa and bubbling golden melted cheddar, with shredded lettuce and a spoonful of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Swedish-style meatballs in creamy gravy with pasta and peas · `swedish-meatballs-pasta-peas`

```
A wide white bowl of pasta shapes and bright green peas with small browned beef meatballs in a smooth, creamy pale brown gravy, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Jerk-style salmon with coconut rice · `jerk-salmon-coconut-rice`

```
A white plate with a salmon fillet under a dark red-brown, glossy jerk-style spice crust, a mound of creamy white coconut rice and bright green broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Creamy Cajun-style salmon pasta · `creamy-cajun-salmon-pasta`

```
A wide white bowl of pasta shapes in a creamy pale orange tomato sauce with large chunks of spiced pink salmon and dark green wilted spinach, flecked with red chilli and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon and pea paella-style rice · `salmon-pea-paella-rice`

```
A wide shallow white pan-style dish of orange-red tomato rice with soft slices of pepper and onion, bright green peas and chunks of pale pink cooked salmon pressed into the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon, pea and lemon risotto-style rice · `salmon-pea-lemon-risotto`

```
A wide white bowl of creamy pale risotto-style rice with bright green peas and dark green spinach, topped with large flakes of pale pink baked salmon and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Arancini-style tomato and mozzarella rice bake · `arancini-tomato-mozzarella-rice-bake`

```
A square portion of rice bake on a white plate, showing golden melted cheddar on top, a red tomato sauce layer, green peas and spinach in the rice and a melted white mozzarella middle. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Egg biryani-style rice with cucumber raita · `egg-biryani-rice-raita`

```
A round white plate of spiced orange-tinged rice with green peas, topped with halved boiled eggs, cut side up, with set yellow yolks and a little red masala, deep golden fried onions in the middle, and a small white bowl of raita with cucumber cubes. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Greek-style spinach rice with fried eggs · `greek-spinach-rice-fried-eggs`

```
A round white plate of green-flecked rice cooked with plenty of dark green spinach, topped with two fried eggs with set whites and bright yellow yolks and a spoonful of thick white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sichuan-style chilli garlic mushrooms with rice · `sichuan-chilli-garlic-mushrooms-rice`

```
A round white bowl of white rice topped with glossy, dark red-brown chilli and garlic mushrooms, bright green broccoli florets, green peas and onion, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Mushroom and pea masala curry with naan · `mushroom-pea-keema-naan`

```
A round white plate with a heap of thick slices of brown mushroom and bright green peas in a thick red tomato curry sauce, a spoonful of white yogurt and torn pieces of warm golden naan. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Jambalaya-style rice with bacon and peppers · `bacon-pepper-jambalaya-rice`

```
A wide white bowl of orange-red tomato rice with pieces of soft pepper and onion, dark green spinach and golden strips of crisp bacon scattered on top, flecked with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crispy tofu and broccoli stir-fry with rice · `crispy-tofu-broccoli-stir-fry-rice`

```
A wide white bowl of fluffy white rice topped with golden, crisp cubes of tofu, bright green broccoli florets and red pepper strips in a glossy dark soy glaze, scattered with thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu, spinach and tomato curry with rice · `tofu-spinach-tomato-curry-rice`

```
A white plate with a mound of fluffy white rice beside a rich red tomato curry full of golden cubes of tofu and dark green wilted spinach, the sauce speckled with spices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu and kidney bean chilli with rice · `tofu-kidney-bean-chilli-rice`

```
A deep white bowl with white rice on one side and a thick, dark red chilli on the other, full of crumbled golden tofu, glossy kidney beans and soft red pepper pieces. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu, pea and sweetcorn fried rice · `tofu-pea-sweetcorn-fried-rice`

```
A wide white bowl of golden fried rice studded with crumbled golden tofu, bright green peas and yellow sweetcorn kernels, glossy with soy and scattered with thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Quorn tikka-style curry with rice · `quorn-tikka-style-curry-rice`

```
A white plate with a mound of fluffy white rice beside a creamy orange curry full of golden meat-free pieces and dark green wilted spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Quorn and pepper fajitas · `quorn-pepper-fajitas`

```
A round white plate with two folded tortilla wraps filled with golden spiced meat-free pieces, charred red and yellow pepper strips and soft red onion, with small bowls of red tomato salsa and white yogurt beside them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Quorn and broccoli soy stir-fry with rice · `quorn-broccoli-soy-stir-fry-rice`

```
A wide white bowl of fluffy white rice topped with golden meat-free pieces, bright green broccoli florets and red pepper strips in a glossy dark soy glaze, scattered with thin spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy cottage cheese and tomato pasta with spinach · `creamy-cottage-cheese-tomato-pasta-spinach`

```
A wide white bowl of short pasta in a smooth, creamy pale pink tomato sauce with dark green wilted spinach, topped with soft melted patches of white mozzarella. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea, spinach and tomato curry with rice · `chickpea-spinach-tomato-curry-rice`

```
A white plate with a mound of fluffy white rice beside a thick orange-red curry of golden chickpeas and dark green wilted spinach, glossy with a little coconut milk and speckled with spices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu and pea curry with rice · `tofu-pea-tomato-curry-rice`

```
A wide white bowl of white rice beside a rich orange tomato and coconut curry full of golden cubes of tofu and bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Kidney bean and tomato curry with rice · `kidney-bean-tomato-curry-rice`

```
A deep white bowl of white rice topped with a thick, deep red kidney bean curry with dark green wilted spinach, the beans glossy and some crushed into the sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pepper, spinach and mozzarella pasta bake · `pepper-spinach-mozzarella-pasta-bake`

```
A rectangular white baking dish of short pasta in red tomato sauce with soft red and yellow pepper pieces and green spinach, covered with bubbling golden patches of melted mozzarella and cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy broccoli and pea pasta · `broccoli-pea-soft-cheese-pasta`

```
A white bowl of short pasta in a creamy white sauce with bright green broccoli florets and peas, topped with grated orange cheddar and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Kidney bean, sweetcorn and pepper rice with cumin · `bean-sweetcorn-pepper-cumin-rice`

```
A wide shallow pan of reddish spiced rice studded with glossy dark red kidney beans, yellow sweetcorn and soft red and yellow pepper pieces. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon and paprika chicken with rice and peas · `lemon-paprika-chicken-rice-peas`

```
A wide shallow pan of golden yellow rice with bright green peas and dark wilted spinach, topped with browned, paprika-dusted pieces of chicken glistening with lemon and olive oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Paprika chicken and pepper wraps · `paprika-chicken-pepper-wraps`

```
Two tortilla wraps cut in half on a round white plate, the cut ends showing golden paprika-dusted chicken strips, soft red pepper strips, green leaves and a white yogurt sauce inside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and vegetable soy noodles · `chicken-vegetable-soy-noodles`

```
A wide white bowl of glossy brown soy noodles tangled with golden chicken strips and a colourful mix of crunchy stir-fried vegetables in thin strips, red, orange, green and pale yellow. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg, spinach and pea soy noodles · `egg-spinach-pea-soy-noodles`

```
A wide white bowl of glossy soy noodles tossed with soft yellow pieces of scrambled egg, bright green peas and dark wilted spinach, topped with thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon, pea and spinach omelette with salad · `smoked-salmon-pea-spinach-omelette`

```
A soft golden folded omelette on a white plate, pink-orange smoked salmon, green peas and dark spinach peeking out of the fold, beside a small salad of green leaves and halved red cherry tomatoes. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Quick chickpea and spinach curry with naan · `chickpea-spinach-curry-naan-quick`

```
A round white bowl of thick red chickpea curry with dark green wilted spinach, topped with a swirl of white yogurt, beside a warm golden naan torn into pieces. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Warm spiced chickpea and spinach wraps · `warm-spiced-chickpea-spinach-wraps`

```
A tortilla wrap cut in half on the diagonal on a round white plate, the cut ends showing warm golden spiced chickpeas, soft red cherry tomatoes, dark green spinach and a layer of creamy beige houmous. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, sweetcorn and cheddar quesadillas with salad · `tuna-sweetcorn-cheddar-quesadillas`

```
Golden toasted quesadilla quarters on a white plate, the cut edges showing melted orange cheddar, flaked pale pink tuna, yellow sweetcorn and green spring onion, beside halved cherry tomatoes and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Paprika chicken traybake with peppers and broccoli · `paprika-chicken-pepper-broccoli-traybake`

```
A roasting tray of golden paprika-red chicken thighs on charred red and yellow pepper chunks, soft red onion wedges and roasted bright green broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Roast salmon with peppers, tomatoes and spinach · `roast-salmon-peppers-tomatoes-spinach`

```
Two roasted salmon fillets resting on soft red and yellow pepper strips and split cherry tomatoes in a roasting tray, beside dark green wilted spinach, glossy with olive oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Hainanese-style poached chicken rice · `hainanese-style-chicken-rice`

```
A wide white bowl of glossy pale golden rice topped with neat slices of poached white chicken and thin cucumber rounds, scattered with green spring onion rings, beside a small dish of red-brown soy and sweet chilli dip. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Black pepper beef and onion noodles · `black-pepper-beef-onion-noodles`

```
A wide white bowl of glossy brown noodles tossed with browned beef mince, charred onion wedges and squares of green and red pepper, speckled all over with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lebanese-style spiced beef rice with almonds · `lebanese-style-spiced-beef-rice-almonds`

```
A white plate piled with fluffy rice mixed through with browned, cinnamon-spiced beef mince and soft onion, topped with golden toasted chopped almonds, beside a small salad of diced red tomato and green cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bibimbap-style tofu and egg rice bowls · `bibimbap-style-tofu-egg-rice-bowls`

```
A wide dark bowl of white rice topped with separate piles of glossy golden-brown tofu cubes, dark green garlicky spinach, golden sliced mushrooms and pale green cucumber sticks, a fried egg in the middle and a drizzle of red-brown sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Baked broccoli macaroni cheese with cottage cheese · `broccoli-macaroni-cheese-cottage-cheese`

```
A rectangular ovenproof dish of baked macaroni cheese with green broccoli florets showing through a bubbling, golden-brown cheddar top dusted with red paprika, one corner spooned out to show the creamy sauce inside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cajun-style salmon with spiced beans and rice · `cajun-style-salmon-spiced-beans-rice`

```
A white plate with a red paprika-crusted roasted salmon fillet resting on rice mixed with dark red kidney beans, beside soft roasted red pepper strips and split cherry tomatoes, with a lemon-glossed top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon and black pepper chicken spaghetti with peas · `lemon-black-pepper-chicken-pea-spaghetti`

```
A wide white bowl of glossy spaghetti twisted with bright green peas and dark wilted spinach, topped with slices of golden pan-fried chicken speckled with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy chicken fajita pasta · `creamy-chicken-fajita-pasta`

```
A wide white bowl of pasta in a creamy orange-red tomato sauce with golden spiced chicken strips, charred red and yellow pepper strips and soft slices of red onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cuban-style beef picadillo with rice · `cuban-style-beef-picadillo-rice`

```
A white plate with a mound of fluffy white rice beside a heap of rich red-brown beef mince with soft green pepper pieces, chopped tomato and plump dark raisins, flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Senegalese-style chicken yassa with rice · `senegalese-style-chicken-yassa-rice`

```
A white plate of fluffy white rice topped with golden browned chicken pieces and a generous heap of soft, glossy, caramel-coloured sliced onions in a lemony sauce, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peruvian-style chicken saltado with rice · `peruvian-style-chicken-saltado-rice`

```
A white plate with a neat mound of white rice beside a stir-fry of golden chicken strips, charred red onion wedges, yellow pepper strips and soft red tomato wedges in glossy dark soy juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Hawaiian-style loco moco with rice and fried eggs · `loco-moco-beef-patties-rice-eggs`

```
A wide white bowl of white rice topped with a browned beef patty under a glossy brown onion and mushroom gravy, crowned with a fried egg with a golden yolk and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken nanban with egg tartare and rice · `chicken-nanban-egg-tartare-rice`

```
A white plate with slices of golden egg-coated chicken glossy with a dark sweet soy glaze, topped with creamy white chopped egg tartare flecked with green spring onion, beside white rice, shredded lettuce and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Eggs in purgatory with spaghetti · `eggs-in-purgatory-spaghetti`

```
A wide white bowl of spaghetti in a rich red tomato sauce with dark green wilted spinach, topped with eggs poached in the sauce, their whites set and yolks golden, flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mapo-style tofu with spinach and rice · `mapo-style-tofu-spinach-rice`

```
A wide white bowl of white rice topped with soft white tofu cubes in a glossy deep red chilli and soy sauce with dark green wilted spinach, scattered with thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Katsu-style tofu curry with rice · `katsu-style-tofu-curry-rice`

```
A white plate with a mound of white rice, crisp golden slices of tofu fanned beside it and covered in a smooth, glossy golden-brown curry sauce, with thin cucumber slices on the side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy lemon tofu pasta with peas and spinach · `creamy-lemon-tofu-pasta-peas-spinach`

```
A wide white bowl of pasta spirals in a thick, creamy pale sauce with bright green peas and dark wilted spinach, finished with plenty of cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced bean and rice burritos · `spiced-bean-rice-burritos`

```
Two toasted golden burritos cut in half on a white plate, the cut ends showing spiced mashed kidney beans, white rice, yellow sweetcorn, red tomato salsa and shredded green lettuce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tofu parmigiana-style bake with spaghetti · `tofu-parmigiana-bake-spaghetti`

```
A rectangular white baking dish of golden tofu slices under red tomato sauce and bubbling patches of melted mozzarella and cheddar, beside a white plate of spaghetti with tomato sauce spooned over. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy kidney bean and pepper enchiladas · `cheesy-kidney-bean-pepper-enchiladas`

```
A rectangular white baking dish of rolled tortillas side by side under red tomato sauce and golden melted cheddar, one cut open to show kidney beans, sweetcorn, red pepper and white cottage cheese, with a dollop of white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Paella-style rice with tofu, chickpeas and peas · `paella-style-tofu-chickpea-pea-rice`

```
A wide shallow pan of golden yellow rice studded with red pepper strips, bright green peas, golden chickpeas and crisp browned tofu cubes, glistening with olive oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Kadai tofu with peppers and rice · `kadai-tofu-peppers-rice`

```
A white plate with fluffy white rice beside golden tofu cubes and chunky charred red and green pepper squares in a thick, spiced red tomato sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Barbecue tofu skewers with sweetcorn rice · `barbecue-tofu-skewers-sweetcorn-rice`

```
Two skewers of sticky dark red glazed tofu cubes, charred red pepper squares and red onion wedges laid on a white plate of white rice dotted with yellow sweetcorn. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mild tofu and chickpea korma with rice · `mild-tofu-chickpea-korma-rice`

```
A white plate with a mound of white rice beside a pale golden, creamy coconut and almond curry full of golden tofu cubes, chickpeas and bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Louisiana-style red beans and rice · `red-beans-and-rice-peppers`

```
A deep white bowl of white rice topped with a thick, creamy stew of dark red kidney beans, some crushed into the sauce, with soft red pepper pieces and specks of herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy spinach and pea rice with cottage cheese · `creamy-spinach-pea-cottage-cheese-rice`

```
A wide white bowl of soft, creamy risotto-style rice with bright green peas and dark wilted spinach, flecked with melted cheddar and white curds of cottage cheese and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweet and sour tofu with peppers and rice · `sweet-and-sour-tofu-peppers-rice`

```
A wide white bowl of white rice topped with crisp golden tofu cubes, charred red and green pepper squares and onion chunks in a glossy, bright red-orange sweet and sour sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Maqluba-style upside-down rice with tofu and chickpeas · `maqluba-style-upside-down-tofu-chickpea-rice`

```
A tall round cake of golden turmeric rice studded with chickpeas, turned out onto a round white plate, its top layered with red tomato rounds, golden tofu slices, charred broccoli and pepper strips, beside a small bowl of chopped cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Giouvetsi-style baked pasta with tofu and chickpeas · `giouvetsi-style-baked-pasta-tofu-chickpeas`

```
A rectangular white baking dish of small pasta shapes and golden tofu cubes with chickpeas in a thick, deep red tomato sauce, under a bubbling golden crust of melted cheddar with browned edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon, spinach and tomato pie with a mashed top · `salmon-spinach-tomato-pie-mashed-top`

```
A portion of pie on a round white plate: a golden, roughed-up top of mashed potato over a thick red tomato sauce with chunks of pink salmon and dark green spinach spilling out at the side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mince and tatties · `mince-and-tatties`

```
A round white plate with a mound of soft, smooth mashed potato beside a pool of dark brown savoury beef mince in a thick gravy, flecked with small orange cubes of carrot and soft onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and mushroom casserole with peas and rice · `chicken-mushroom-casserole-peas-rice`

```
A wide white bowl of white rice with a rich, dark red-brown stew ladled over it: tender chunks of chicken, quartered golden mushrooms, soft onion and bright green peas in a thick paprika gravy. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chinese-style steamed salmon with spring onions and rice · `chinese-steamed-salmon-spring-onions-rice`

```
A round white plate with a soft steamed salmon fillet, pale pink and just flaking, glossy with dark soy sauce and topped with thin strips of green spring onion, beside wilted spinach and a mound of white rice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon chicken and spinach risotto-style rice · `lemon-chicken-spinach-risotto-rice`

```
A wide white bowl of soft, creamy pale risotto-style rice with golden pieces of chicken and dark green wilted spinach, flecked with grated cheese and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon and black pepper tofu with broccoli and rice · `lemon-black-pepper-tofu-broccoli-rice`

```
A wide white bowl with a small mound of white rice topped with golden, crisp-edged tofu cubes speckled with black pepper, bright green broccoli florets and peas, glossy with lemony juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese and spinach stuffed peppers · `cottage-cheese-spinach-stuffed-peppers`

```
Two baked red pepper halves on a round white plate, soft and blistered, filled with rice, dark green spinach and white cottage cheese under golden melted cheddar, sitting in a little red tomato sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Jerk-style tofu with rice and peas · `jerk-style-tofu-rice-and-peas`

```
A round white plate with dark golden, sticky spice-crusted tofu slices beside a mound of creamy white coconut rice dotted with dark red kidney beans and scattered with sliced green spring onions. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese and spinach omelette with tomato salad · `cottage-cheese-spinach-omelette-tomato-salad`

```
A soft golden folded omelette on a round white plate with dark green spinach and white cottage cheese peeking out of the fold, beside a small salad of halved red cherry tomatoes and cucumber chunks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken with French-style peas, lettuce and rice · `chicken-french-style-peas-lettuce-rice`

```
A round white plate with slices of golden pan-fried chicken on a heap of bright green peas, soft wilted lettuce wedges and spring onions in glossy pan juices, beside a small mound of white rice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crumbed tofu fingers with lemony mushy peas · `crumbed-tofu-fingers-lemony-mushy-peas`

```
A round white plate with five golden breadcrumbed tofu fingers, crisp and lightly dusted with red paprika, beside a large spoonful of thick, roughly mashed bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chinese-style tomato and tofu with rice and peas · `chinese-style-tomato-tofu-rice-peas`

```
A wide white bowl of white rice with bright green peas, topped with golden cubes of tofu in a glossy red sauce of soft, broken-down tomato wedges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crispy chickpea and tofu tacos with salsa · `crispy-chickpea-tofu-tacos-salsa`

```
Three soft tortilla wraps folded like tacos on a round white plate, each filled with shredded green lettuce, crisp golden chickpeas and small tofu cubes, topped with chunky red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy broccoli and pea rice with fried eggs · `cheesy-broccoli-pea-rice-fried-eggs`

```
A wide white bowl of creamy pale yellow cheesy rice dotted with green peas and small broccoli florets, scattered with grated orange cheddar and topped with a fried egg with a golden yolk and crisp edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg bhurji-style spiced eggs with rice and peas · `egg-bhurji-style-eggs-rice-peas`

```
A wide white bowl of white rice with green peas beside a mound of soft golden-yellow spiced scrambled eggs flecked with red tomato pieces and dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, sweetcorn and pea rice with lemon · `tuna-sweetcorn-pea-lemon-rice`

```
A wide white bowl of warm rice tossed with pale pink flakes of tuna, yellow sweetcorn, bright green peas and halved red cherry tomatoes, glossy with a paprika-flecked dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Taco-style beef rice with lettuce and tomatoes · `taco-style-beef-rice-lettuce`

```
A wide white bowl of white rice topped with a mound of browned paprika beef mince with yellow sweetcorn, then a pile of finely shredded green lettuce and small red tomato pieces. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy paprika chicken with rice and spinach · `creamy-paprika-chicken-rice-spinach`

```
A round white plate with a mound of white rice beside golden strips of chicken in a creamy pale orange paprika tomato sauce, with dark green wilted spinach folded through. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### One-pot cheesy bean and sweetcorn pasta · `one-pot-cheesy-bean-sweetcorn-pasta`

```
A wide white bowl of pasta spirals in a thick red tomato sauce with dark red kidney beans and yellow sweetcorn, under a layer of melted, stringy orange cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chinese-style lemon chicken with rice and peas · `chinese-style-lemon-chicken-rice-peas`

```
A wide white bowl of white rice with green peas topped with golden pieces of chicken in a sticky, glossy amber lemon and honey glaze. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cumin chickpea, pea and spinach rice with lemon · `cumin-chickpea-pea-spinach-rice`

```
A wide white bowl of golden yellow turmeric rice tossed with crisp-edged, cumin-dusted chickpeas, bright green peas and dark wilted spinach leaves, glossy with olive oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Loaded bean and cheese wrap nachos · `loaded-bean-cheese-wrap-nachos`

```
A wide ovenproof dish piled with golden crisp tortilla triangles under dark red spiced kidney beans, yellow sweetcorn and melted orange cheddar, topped with dollops of white yogurt, red salsa and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Huevos rancheros-style rice bowls · `huevos-rancheros-style-rice-bowls`

```
A wide white bowl of white rice with dark red kidney beans in a chunky red salsa, shredded green lettuce and halved cherry tomatoes, topped with two fried eggs with golden yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef and mushroom stroganoff-style rice · `beef-mushroom-stroganoff-style-rice`

```
A wide white bowl of white rice topped with browned beef mince and soft sliced mushrooms in a creamy pale orange paprika sauce, with a grind of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoky beef and baked bean stew with rice · `smoky-beef-baked-bean-stew-rice`

```
A wide white bowl of white rice under a thick, deep orange-red stew of browned beef mince, baked beans, soft red pepper and onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and tofu cassoulet-style bake · `bean-tofu-cassoulet-style-bake`

```
A deep baking dish of thick red tomato stew with kidney beans, chickpeas, tofu cubes and orange carrot pieces, bubbling at the edges under a golden, crunchy breadcrumb crust. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy chicken, pea and sweetcorn stew with rice · `creamy-chicken-pea-sweetcorn-stew-rice`

```
A wide white bowl of white rice topped with golden chicken pieces in a creamy white sauce with bright green peas, yellow sweetcorn and soft onion, flecked with green herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced chickpea and tofu traybake with houmous and rice · `spiced-chickpea-tofu-traybake-houmous-rice`

```
A wide white bowl of white rice with golden turmeric-spiced chickpeas and tofu cubes, charred red pepper chunks, split roasted cherry tomatoes and soft purple onion wedges, drizzled with a pale beige houmous sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy chicken, broccoli and sweetcorn pasta bake · `cheesy-chicken-broccoli-sweetcorn-pasta-bake`

```
A deep baking dish of pasta shapes, golden chicken pieces, green broccoli florets and yellow sweetcorn in a creamy sauce, under a bubbling, browned layer of melted cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Indian-style masala pasta with tofu and peas · `indian-style-masala-pasta-tofu-peas`

```
A wide white bowl of pasta shells coated in a thick, deep orange spiced tomato and onion sauce, with golden cubes of tofu and bright green peas scattered through. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Neapolitan-style baked spaghetti frittata with peas · `neapolitan-baked-spaghetti-frittata-peas`

```
A square of thick baked spaghetti omelette on a round white plate, the strands of pasta and green peas showing at the cut side, with a puffed, golden top of browned melted cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Persian-style spinach kuku with yogurt and rice · `persian-style-spinach-kuku-yogurt-rice`

```
A round white plate with two thick squares of deep green spinach omelette with golden edges, beside a mound of white rice and a spoonful of thick white yogurt flecked with grated pale green cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and tofu balls in tomato sauce with spaghetti · `bean-tofu-balls-tomato-sauce-spaghetti`

```
A wide white bowl of spaghetti under a thick red tomato sauce with five golden-brown baked bean and tofu balls, flecked with green oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Hungarian-style mushroom and tofu paprikash with rice · `hungarian-style-mushroom-tofu-paprikash-rice`

```
A wide white bowl of white rice topped with golden tofu cubes and soft sliced mushrooms and onions in a creamy, rusty orange paprika sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Glamorgan-style cheese and spring onion sausages with beans · `glamorgan-style-cheese-sausages-beans`

```
A round white plate with three crisp, golden-brown breadcrumb and cheese sausages flecked with green spring onion, beside a heap of glossy orange baked beans. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Turkish-style lazy manti pasta with garlic yogurt · `turkish-style-lazy-manti-garlic-yogurt`

```
A wide shallow bowl of pasta shapes under a thick layer of white garlic yogurt, drizzled with a glossy bright red paprika and chilli oil pooling over the top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

## Snacks

### ✓ Peanut butter oat bites · `peanut-butter-oat-bites`

```
Three round, matte, golden-tan balls of peanut butter and oats, flecked with oat flakes and dark raisins, sitting together on a small plain white round plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Houmous with vegetable sticks · `houmous-veg-sticks`

```
A pale wooden board with a small white bowl of smooth beige houmous in the middle, and orange carrot sticks, pale green cucumber sticks and red pepper strips arranged in neat groups around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Honey and almond yogurt pots · `honey-almond-yogurt-pots`

```
A small round white ramekin of thick, creamy white yogurt, with roughly chopped almonds scattered evenly over the top and a thin zigzag of glossy amber honey drizzled across them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Frozen yogurt and berry bark · `frozen-yogurt-berry-bark`

```
Four jagged shards of frozen yogurt bark, creamy off-white with a frosted surface, studded with red, purple and deep blue berries pressed into the top, overlapping loosely on a pale grey round plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Ham and soft cheese roll-ups · `ham-soft-cheese-roll-ups`

```
Three tight rolls of pink ham lying side by side on a small white round plate, each rolled end showing a white spiral of soft cheese around a pale green cucumber core. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Devilled eggs · `devilled-eggs`

```
Four boiled egg halves in a tidy row on a white oval plate, each white hollow piled with a creamy pale yellow filling and dusted with orange-red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Tuna and chickpea dip · `tuna-chickpea-dip`

```
A round white platter with a shallow white bowl of speckled beige dip in the middle, showing pale tuna flakes and thin green spring onion rings, and orange carrot, pale green cucumber and red pepper sticks arranged around it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon cucumber bites · `smoked-salmon-cucumber-bites`

```
Six thick cucumber rounds with green skin edges arranged in a ring on a round white plate, each spread with white soft cheese, topped with a folded pink-orange ribbon of smoked salmon and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Crispy spiced chickpeas · `crispy-spiced-chickpeas`

```
A small shallow white bowl heaped with roasted chickpeas, golden-brown and rough-skinned, coated in orange-red paprika and cumin with a faint gloss of oil and a few white salt flecks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Paprika roasted almonds · `paprika-roasted-almonds`

```
A small white square dish with whole roasted almonds spread in a loose single layer, deep golden-brown and coated in orange-red paprika, with a slight oily sheen and a few white salt flecks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and salsa quesadilla wedges · `cheese-bean-quesadilla-wedges`

```
Two triangular wedges of toasted folded wrap fanned on a white round plate, golden-brown with darker toasted spots, the cut sides showing melted orange cheddar, red salsa and green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Peanut butter apple slices with raisins · `peanut-butter-apple-slices`

```
Thick apple slices with their skins on, laid in a fan on a round white plate, each spread with a stripe of golden-brown peanut butter and dotted with dark, wrinkled raisins. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Banana and oat cookies · `banana-oat-cookies`

```
Round, flat banana and oat cookies with golden-brown edges, a rough oat texture and dark raisins pressed into their tops, arranged in a loose circle on a round white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Frozen banana and berry ice · `frozen-banana-berry-ice`

```
A small round white bowl holding two scoops of thick, smooth frozen banana and berry ice, a deep pinky-purple colour with a soft, creamy texture and rounded edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Baked wrap crisps with tomato salsa · `wrap-crisps-tomato-salsa`

```
Golden, crisp triangles of baked tortilla wrap fanned around a small white bowl of chunky salsa made from diced red tomato, pale green cucumber and purple red onion, flecked with black pepper, on a round white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Baked cinnamon apple slices · `baked-cinnamon-apple-slices`

```
Soft baked apple slices with their skins on, fanned in an overlapping ring on a round white plate, golden at the edges and dusted with warm brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Sweetcorn and pepper salsa in lettuce cups · `sweetcorn-pepper-lettuce-cups`

```
Crisp, cup-shaped pale green lettuce leaves on a round white plate, each filled with a bright salsa of yellow sweetcorn, diced red pepper and finely chopped purple onion, topped with halved cherry tomatoes and dusted with red chilli powder. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Apple, cinnamon and almond yogurt pot · `apple-almond-yogurt-pot`

```
A small white bowl of thick white yogurt topped with small chunks of red-skinned apple and roughly chopped almonds, finished with a fine dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced bean dip with vegetable sticks · `spiced-bean-dip-vegetable-sticks`

```
A small white bowl of smooth, thick red-brown kidney bean dip flecked with cumin, on a white plate surrounded by orange carrot sticks and pale green cucumber sticks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter protein flapjacks · `peanut-butter-protein-flapjacks`

```
A stack of thick golden-brown oat flapjack squares on a white plate, the chewy tops showing whole oats and darker caramelised edges, with one square broken in half to show the dense, moist oat inside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Oat and raisin protein balls · `oat-raisin-protein-balls`

```
A round white plate of a dozen pale golden oat balls, each about the size of a walnut, their rough surfaces showing whole oats and dark wrinkled raisins, with a fine dusting of cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Protein yogurt bark with berries and almonds · `protein-yogurt-berry-almond-bark`

```
Jagged pieces of frozen white yogurt bark on a sheet of baking paper, studded with deep red and purple mixed berries and pale chopped almond pieces, the edges crisp and frosty. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese and spinach egg muffins · `cottage-cheese-spinach-egg-muffins`

```
Six golden baked egg muffins on a white plate, their puffed tops flecked with dark green spinach and small red pepper pieces under melted orange cheddar, one broken open to show soft white curds of cottage cheese in the set egg. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Whipped cottage cheese dip with cucumber and pepper sticks · `whipped-cottage-cheese-dip-sticks`

```
A small white bowl of smooth, creamy white dip swirled on top with a thin pool of golden olive oil and a dusting of red paprika, surrounded on a large plate by pale green cucumber sticks and bright red and yellow pepper strips. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cucumber and garlic yogurt dip with carrot sticks · `cucumber-garlic-yogurt-dip-carrots`

```
A white bowl of thick white yogurt dip speckled with pale green grated cucumber and drizzled with golden olive oil, beside neat piles of bright orange carrot sticks, cucumber sticks and red pepper strips on a white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and sweetcorn cucumber boats · `tuna-sweetcorn-cucumber-boats`

```
Short pieces of cucumber halved lengthways and hollowed out, laid in two rows on a white plate, each heaped with flaked pale pink tuna and bright yellow sweetcorn kernels, speckled with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Warm edamame with soy and lemon · `warm-edamame-soy-lemon`

```
A round white bowl heaped with glossy bright green shelled edamame beans, coated in a thin dark soy glaze and flecked with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crispy soy and paprika tofu bites · `crispy-soy-paprika-tofu-bites`

```
Golden-brown cubes of crisp baked tofu with darker toasted edges, dusted with red paprika and glazed with soy, piled in a shallow white bowl. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Edamame and pea smash on toast · `edamame-pea-smash-toast`

```
Two slices of golden wholemeal toast on a white plate, each spread thickly with a rough bright green smash of crushed edamame and peas with some whole beans showing, glossy with olive oil and dotted with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter yogurt dip with apple slices · `peanut-butter-yogurt-dip-apple`

```
A small white bowl of thick pale yogurt swirled with golden-brown peanut butter and dusted with cinnamon, surrounded by a fan of thin red and green apple slices with their skins on, on a round white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana and raisin baked oat cups · `banana-raisin-baked-oat-cups`

```
Six round baked oat cups on a white plate, golden-brown and domed, with dark raisins pressed into their tops and one broken open to show a soft, moist banana and oat inside. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese and tomato on toast · `cottage-cheese-tomato-toast`

```
Two slices of wholemeal toast on a white plate, each covered with creamy white cottage cheese and overlapping thin slices of red tomato, drizzled with olive oil and scattered with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mixed berry and soya smoothie · `mixed-berry-soya-smoothie`

```
Two tall glasses of thick, deep purple berry smoothie seen from straight above, the creamy round tops filling each glass, with a few whole red and purple mixed berries resting on the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Berry and almond protein yogurt pots · `berry-protein-yogurt-pots`

```
Two clear glass pots seen from above, filled with thick white yogurt topped with glossy deep red and purple mixed berries and a scatter of roughly chopped pale almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ham and cottage cheese pepper cups · `ham-cottage-cheese-pepper-cups`

```
Quartered red and yellow pepper cups on a white plate, each filled with creamy white cottage cheese and topped with thin pink strips of ham and cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana and honey toast with cinnamon yogurt · `banana-honey-toast-cinnamon-yogurt`

```
Two slices of golden wholemeal toast on a round white plate, each spread thickly with pale cinnamon-flecked yogurt and covered with overlapping rounds of banana, drizzled with glossy golden honey and cut into fingers. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cinnamon and raisin rice pudding pots · `cinnamon-raisin-rice-pudding-pots`

```
Four small white ramekins of thick, creamy rice pudding, the soft grains glossy with milk, dotted with plump dark raisins and dusted on top with warm brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana and cinnamon overnight oat pots · `banana-cinnamon-soya-overnight-oat-pots`

```
Two small clear glass pots filled to the top with thick, creamy soaked oats, pale beige and streaked with mashed banana, the smooth surfaces dusted with brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana, oat and cinnamon milkshake · `banana-oat-cinnamon-milkshake`

```
Two tall glasses of thick, pale cream-coloured banana milkshake seen from straight above, the smooth frothy tops flecked with tiny bits of oat and dusted with brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Warm cinnamon apple toast with yogurt · `warm-cinnamon-apple-toast-yogurt`

```
Two slices of golden wholemeal toast on a white plate, spread with thick white yogurt and piled with soft, glossy warm apple slices with their red and green skins on, dusted with brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana and berry soya rice pudding · `banana-berry-soya-rice-pudding`

```
A wide shallow white bowl of creamy pale rice pudding speckled with cinnamon, topped with soft, juicy warm red and purple berries bleeding deep purple juice into the pudding. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana and granola yogurt pots · `banana-granola-yogurt-pots`

```
Two clear glass pots seen from above, filled with thick white yogurt dusted with cinnamon, layered with rounds of banana and topped with a generous scatter of golden crunchy granola clusters. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese, berry and honey toast · `cottage-cheese-berry-honey-toast`

```
Fingers of wholemeal toast on a round white plate, each piled with creamy white cottage cheese and studded with red and purple berries, drizzled with glossy golden honey. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crushed egg and spring onion toast fingers · `crushed-egg-spring-onion-toast-fingers`

```
Fingers of golden wholemeal toast in a neat row on a white plate, each topped with roughly crushed boiled egg, yellow yolk and white flecked with green spring onion rings and dusted with red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, sweetcorn and lemon toast fingers · `tuna-sweetcorn-lemon-toast-fingers`

```
Fingers of golden wholemeal toast on a white plate, each piled with a creamy mix of flaked pale tuna and bright yellow sweetcorn kernels, speckled with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Berry lassi · `berry-lassi`

```
Two tall glasses of thick, smooth pinky-purple berry lassi seen from straight above, the creamy round tops filling each glass, with a few whole red and purple berries resting on the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter and banana soya shake · `peanut-butter-banana-soya-shake`

```
Two tall glasses of thick, smooth pale caramel-coloured banana and peanut butter shake seen from straight above, the creamy round tops dusted with a pinch of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon and cottage cheese toast with cucumber · `smoked-salmon-cottage-cheese-cucumber-toast`

```
Fingers of wholemeal toast on a white plate, spread with creamy white cottage cheese, topped with thin pale green cucumber rounds and loose pink ruffles of smoked salmon, scattered with cracked black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mini banana and oat pancakes with yogurt · `mini-banana-oat-pancakes-yogurt`

```
A stack of small round golden-brown pancakes on a white plate, flecked with oats and banana, beside a little white bowl of thick white yogurt for dipping. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and spring onion rice balls · `tuna-spring-onion-rice-balls`

```
Six round white rice balls on a white plate, one broken open to show a filling of flaked pale tuna flecked with green spring onion, beside a neat pile of pale green cucumber sticks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tomato and mozzarella pizza toasts · `tomato-mozzarella-pizza-toasts`

```
Two slices of wholemeal toast on a wooden board spread with deep red passata, covered with melted torn mozzarella bubbling white with golden patches, sprinkled with dried green oregano and cut into fingers. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese with apple and cinnamon · `cottage-cheese-apple-cinnamon-pots`

```
Two small white bowls of creamy white cottage cheese, each topped with a pile of small chopped apple pieces with red and green skin, dusted with warm brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Coronation-style tuna lettuce cups · `coronation-tuna-lettuce-cups`

```
Crisp pale green lettuce cups on a white plate, each filled with flaked tuna in a creamy pale yellow spiced yogurt sauce, dotted with plump dark raisins and specks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tandoori-style tofu bites with cucumber yogurt and naan · `tandoori-tofu-bites-cucumber-yogurt-naan`

```
Orange-red cubes of spiced baked tofu with darker toasted edges on a white plate, beside a small bowl of white yogurt flecked with grated pale green cucumber and a pile of warm golden naan strips. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Warm berry yogurt pots with toasted oats · `warm-berry-yogurt-toasted-oat-pots`

```
Two small glass bowls of thick white yogurt topped with soft, glossy warm red and purple berries in their deep purple juice and a scatter of golden toasted oats. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pea, sweetcorn and cheddar frittata fingers · `pea-sweetcorn-cheddar-frittata-fingers`

```
Thick fingers of golden frittata on a wooden board, the cut sides showing set yellow egg studded with bright green peas, yellow sweetcorn and spring onion, the tops browned with melted cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweet chilli chicken and rice lettuce cups · `sweet-chilli-chicken-rice-lettuce-cups`

```
Crisp pale green lettuce cups on a white plate, each filled with white rice, glossy red-orange sweet chilli chicken pieces, small cubes of cucumber and thin rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cottage cheese, sweetcorn and tomato pots · `cottage-cheese-sweetcorn-tomato-pots`

```
Two small white bowls of creamy cottage cheese topped with bright yellow sweetcorn, quartered red cherry tomatoes and small cubes of pale green cucumber, glossy with olive oil and sprinkled with dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Frozen yogurt-dipped banana bites · `frozen-yogurt-banana-bites`

```
Rows of round banana slices coated in thick white yogurt flecked with cinnamon, frozen firm and frosty on a sheet of baking paper on a small tray. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smashed chickpea and sweetcorn lettuce cups · `smashed-chickpea-sweetcorn-lettuce-cups`

```
Crisp pale green lettuce cups on a white plate, each filled with roughly crushed golden chickpeas mixed with bright yellow sweetcorn and small cubes of pale green cucumber, dusted with red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mexican-style bean and sweetcorn salsa pots · `mexican-style-bean-sweetcorn-salsa-pots`

```
Two small white bowls heaped with glossy dark red kidney beans, bright yellow sweetcorn and quartered red cherry tomatoes, coated in chunky red salsa and dusted with cumin and red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crispy tofu nuggets with sweet chilli dip · `crispy-tofu-nuggets-sweet-chilli`

```
Bite-sized golden-brown breadcrumbed tofu nuggets with crisp, crunchy coats piled on a white plate, beside a small white bowl of glossy red-orange sweet chilli sauce for dipping. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea and apple chaat · `chickpea-apple-chaat`

```
A shallow white bowl of golden chickpeas tossed with small cubes of apple with red and green skin, quartered red cherry tomatoes and diced pale green cucumber, dusted with cumin and red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Houmous toast with crispy paprika chickpeas · `houmous-toast-crispy-paprika-chickpeas`

```
Two slices of golden wholemeal toast on a white plate, spread with creamy beige houmous, layered with thin pale green cucumber rounds and piled with crisp, paprika-red fried chickpeas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Peanut butter chickpea cookie dough with banana · `peanut-butter-chickpea-cookie-dough-banana`

```
A small white bowl of thick, smooth golden-brown peanut butter cookie dough studded with dark raisins and dusted with cinnamon, surrounded on a plate by thick rounds of pale yellow banana. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheese and sweetcorn oat muffins · `cheese-sweetcorn-oat-muffins`

```
Six golden-brown savoury oat muffins on a white plate, their domed tops crusted with melted cheddar, one broken open to show a soft, set inside studded with yellow sweetcorn and green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Berry cheesecake pots · `berry-cheesecake-pots`

```
Two small clear glass pots seen from above, filled with smooth white whipped cottage cheese over a crumbly brown biscuit base, topped with glossy red and purple berries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Berry and banana tofu pudding pots · `berry-banana-tofu-pudding-pots`

```
Two small clear glass pots filled with thick, smooth pinky-purple tofu pudding flecked with cinnamon, each topped with a heap of glossy whole red and purple berries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweetcorn, chickpea and tofu fritters with sweet chilli · `sweetcorn-chickpea-tofu-fritters`

```
Small round golden-brown fritters with crisp edges on a white plate, flecked with yellow sweetcorn kernels and green spring onion, beside a small white bowl of glossy red-orange sweet chilli sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mushroom and tofu pâté with toast fingers · `mushroom-tofu-pate-toast-fingers`

```
A small white bowl of smooth, speckled pale brown mushroom and tofu pâté with a swirled top, flecked with green herbs, beside a pile of golden wholemeal toast fingers on a white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Korean-style soy-marinated eggs with rice · `korean-style-soy-marinated-eggs-rice`

```
Small white bowls of white rice topped with halved boiled eggs, their whites stained deep amber from the soy marinade and their yolks just set and golden-orange, with thin cucumber rounds and green spring onion rings glistening with dark marinade. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Paprika chicken bites with sweetcorn salsa · `paprika-chicken-bites-sweetcorn-salsa`

```
Bite-sized pieces of golden, paprika-red fried chicken piled on a white plate beside a small white bowl of salsa made of bright yellow sweetcorn, quartered red cherry tomatoes and finely chopped purple red onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoky bean and rice cakes with salsa · `smoky-bean-rice-cakes-salsa`

```
Small round golden-brown bean and rice cakes with crisp edges on a white plate, speckled dark red with kidney beans and green with spring onion, each topped with a spoonful of chunky red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```
