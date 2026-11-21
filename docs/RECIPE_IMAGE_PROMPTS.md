# Recipe picture prompts (Midjourney, bird's-eye view)

One Midjourney prompt per recipe in the app's recipe book. Founder's decisions: 2026-10-10 (CLAUDE.md rule 2) our own recipes may show an illustration made with AI, never for a restaurant's or a
supermarket's item (since 2026-11-17 it has no visible caption; screen readers hear "An illustration of …"); 2026-10-16 the pictures are made with Midjourney and every one is a bird's-eye view.

Pictures that have been added are ticked. This file is rewritten from the recipe book by `WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts` (run in `web/`), so don't edit it by hand;
each recipe's description of how it looks from above is in `web/lib/mm/recipeBook/looks.ts`, the shared style and settings are at the top of `web/tests/recipeImages.test.ts`.

## Read first: Midjourney's rules

Midjourney's Community Guidelines say it has no API and that **automating interactions with Midjourney is prohibited; accounts that do not comply may be blocked**
(https://docs.midjourney.com/docs/community-guidelines). Letting Claude in Chrome paste the prompts and click through the site is automation of that kind, so it could put the founder's account at risk: read the current terms and decide.
The safe way is for a person to paste each prompt (293 of them) and download the pictures; the hand-over below also works for a person following it. Images made on a paid plan can be used commercially under Midjourney's terms (check the
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

293 recipes, 190 with a picture.

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
A folded half-moon omelette on a white square plate, pale golden and smooth on top, with melted orange cheddar and torn pieces of pink ham just showing at the open edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Two round, golden-brown potato cakes flecked with green spring onion on a white round plate, each topped with a fried egg with a set white and bright yellow yolk, with soft halved red cherry tomatoes beside them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Two slices of golden wholemeal toast on a round white plate, covered with glossy orange-red baked beans in tomato sauce and topped with a scatter of finely grated orange cheddar just starting to melt, with flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Two slices of golden wholemeal toast on a round white plate, piled with roughly crushed golden chickpeas, soft halved red cherry tomatoes and dark green wilted spinach, glistening with olive oil and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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

### Bacon, eggs, mushrooms and tomatoes · `bacon-eggs-mushrooms-tomatoes`

```
A round white plate with two fried eggs, their whites set and yolks golden, under melted orange cheddar, beside browned bacon medallions, golden sliced mushrooms and two soft grilled tomato halves, with flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy baked eggs with spinach · `cheesy-baked-eggs-spinach`

```
A round white plate of creamy dark green spinach topped with two baked eggs with set whites and soft yellow yolks, under patches of bubbling golden melted cheddar, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheese and tomato scrambled eggs · `cheese-tomato-scrambled-eggs`

```
A round white plate of soft, glossy yellow scrambled eggs with strands of melted orange cheddar, beside a small heap of softened halved cherry tomatoes, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spinach and mushroom omelette · `spinach-mushroom-omelette`

```
A folded golden omelette on a round white plate, golden-brown sliced mushrooms and dark green wilted spinach showing at its open edge, with a small heap of toasted whole almonds beside it and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Banana pancakes with berries and almonds · `banana-egg-pancakes-berries`

```
A small stack of round golden-brown banana and egg pancakes on a round white plate, topped with a scatter of deep red and purple mixed berries and roughly chopped pale almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Fruit and almond breakfast bowl · `fruit-almond-breakfast-bowl`

```
A wide white bowl of chopped red-skinned apple, round pale banana slices and deep red and purple mixed berries, dusted with brown cinnamon and covered with a thick scatter of roughly chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mushroom, tomato and spinach fry-up with eggs · `mushroom-tomato-spinach-eggs-fry-up`

```
A round white plate holding two fried eggs with set whites and golden yolks, golden-brown sliced mushrooms, two soft red fried tomato halves and a heap of dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pepper and spinach egg muffins · `pepper-spinach-egg-muffins`

```
Three round golden egg muffins on a round white plate, their puffed, set tops flecked with small pieces of red pepper, dark green spinach and thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced tomato baked eggs with spinach · `spiced-tomato-baked-eggs-spinach`

```
A wide shallow white bowl of thick red spiced tomato sauce with dark green wilted spinach through it, two eggs set into it with opaque whites and bright yellow yolks, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spinach and mushroom scrambled eggs on toast · `spinach-mushroom-eggs-toast`

```
Two slices of golden wholemeal toast on a round white plate, heaped with soft pale yellow scrambled eggs folded through golden sliced mushrooms and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Houmous, tomato and spinach on toast · `houmous-tomato-spinach-toast`

```
Two slices of golden wholemeal toast on a round white plate, spread thickly with pale beige houmous and topped with a small heap of glossy dark green spinach leaves and overlapping red tomato slices, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spanish-style eggs with peppers and tomatoes · `spanish-style-pepper-eggs-toast`

```
Two slices of golden wholemeal toast on a round white plate, topped with soft red and yellow pepper strips, sliced onion and chopped tomato in a thick paprika-red sauce, stirred through with soft set folds of yellow egg. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mozzarella, tomato and spinach omelette · `mozzarella-tomato-spinach-omelette`

```
A golden folded half-moon omelette on a round white plate, its open edge showing melted white mozzarella, halved red cherry tomatoes and dark green wilted spinach, with a few flecks of black pepper on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A single thick wedge of Spanish-style omelette on a round white plate, its pale yellow set top meeting cut sides that show golden potato slices, green peas and softened onion held in firm egg. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Huevos rancheros · `huevos-rancheros`

```
A flat round tortilla wrap on a round white plate, spread with reddish-brown crushed kidney beans and topped with two fried eggs, white with bright yellow yolks, with red tomato salsa spooned over and around them. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Smoked salmon kedgeree · `smoked-salmon-kedgeree`

```
Smoked salmon kedgeree in a shallow white bowl: golden curry-tinted rice dotted with green peas and softened onion, torn strips of pink smoked salmon folded through, and boiled egg quarters with set yellow yolks arranged on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
One ham and soft cheese wrap cut in half, the halves set side by side and slightly staggered on a white oval plate, the cut ends showing pink ham, white soft cheese, red tomato slices and green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea, cucumber and tomato salad · `chickpea-tomato-salad`

```
Chickpea, cucumber and tomato salad in a shallow white bowl: pale golden chickpeas mixed with small chunks of green-edged cucumber and red tomato and tiny pieces of purple red onion, glistening with a thin olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Chunky sweetcorn and potato soup in a deep round white bowl: a golden-yellow surface tinted orange by paprika, with whole yellow sweetcorn kernels and small pieces of pale potato showing through, a faint sheen of oil and black pepper specks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken and sweetcorn soup · `chicken-sweetcorn-soup`

```
Chicken and sweetcorn soup in a shallow white bowl: a pale golden broth holding small pieces of cooked white chicken, yellow sweetcorn kernels and thin ribbons of set egg, topped with rings of green spring onion and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A round white plate spread with green salad leaves, topped with halved small new potatoes and green peas coated in a pale creamy mustard dressing, and boiled egg quarters scattered over the top with their set yellow yolks showing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide white soup bowl filled with clear golden-brown broth, its surface covered with tangled noodles, thin strips of cooked chicken and sliced brown mushrooms, finished with a scatter of thin spring onion slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A shallow white bowl of green salad leaves topped with halved new potatoes, large flakes of pale pink tuna and halved red cherry tomatoes, glossy with a mustard dressing, with boiled egg quarters showing set yellow yolks and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide white plate of green salad leaves topped with warm halved new potatoes and large flakes of pink baked salmon, with a thick white yogurt dressing flecked with pale green grated cucumber spooned over and thin green spring onion rings. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheese and onion potato cakes with salad · `cheese-onion-potato-cakes`

```
Three round golden-brown potato cakes with crisp edges on a white round plate, flecks of green spring onion and melted orange cheddar showing in them, beside green salad leaves, halved red cherry tomatoes and cucumber slices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A round white plate of dark green spinach leaves tossed with golden chickpeas, halved red cherry tomatoes and thin slices of purple red onion, topped with quartered boiled eggs with set yellow yolks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Roasted pepper and houmous open sandwiches · `roasted-pepper-houmous-sandwiches`

```
Two slices of golden wholemeal toast on a round white plate, spread with pale houmous and topped with a few dark green spinach leaves and soft, browned strips of roasted red and yellow pepper and red onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and vegetable chilli soup with toast · `bean-vegetable-chilli-soup`

```
A round white bowl of chunky deep red soup with kidney beans, small cubes of orange carrot and pieces of red pepper and onion in a thick tomato broth, beside two slices of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Warm broccoli, chickpea and almond salad · `warm-broccoli-chickpea-almond-salad`

```
A round white plate of roasted broccoli florets browned at the edges, golden roasted chickpeas, toasted chopped almonds and thin slices of purple red onion, glistening with a lemon and garlic olive oil dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean, sweetcorn and pepper rice salad · `bean-sweetcorn-pepper-rice-salad`

```
A round white bowl of cold fluffy white rice mixed with deep red kidney beans, bright yellow sweetcorn, small pieces of red pepper and finely chopped red onion, glistening with a lemon dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smashed chickpea and carrot sandwiches · `smashed-chickpea-carrot-sandwiches`

```
A wholemeal sandwich cut in half on a round white plate, the two halves set slightly apart, the cut edges showing a thick layer of pale mashed chickpeas, grated orange carrot and dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon and cucumber sandwiches · `salmon-cucumber-soft-cheese-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the two halves set slightly apart, the cut edges showing a creamy pale pink salmon filling and thin slices of green cucumber. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, bacon and lettuce salad · `chicken-bacon-lettuce-salad`

```
A wide white bowl of torn pale green lettuce, halved cherry tomatoes and cucumber slices in a creamy dressing, topped with golden strips of chicken and browned bacon and a scatter of grated orange cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mozzarella, tomato and pesto salad · `mozzarella-tomato-pesto-salad`

```
A round white plate of overlapping red tomato slices and white mozzarella slices on a bed of green salad leaves, drizzled with bright green pesto and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bacon, mushroom and cheddar frittata · `bacon-mushroom-cheddar-frittata`

```
A thick wedge of golden frittata on a round white plate, its cut side showing set egg studded with browned bacon pieces, sliced mushrooms, dark green spinach and spring onion, under a golden cheddar top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken Caesar-style salad · `chicken-caesar-style-salad`

```
A wide white bowl of crisp pale green lettuce pieces in a creamy white dressing, topped with golden pan-fried chicken strips and a scatter of finely grated orange cheddar, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and cheddar stuffed peppers · `tuna-cheddar-stuffed-peppers`

```
Two roasted red pepper halves on a round white plate, filled with a creamy tuna and spring onion filling under melted golden cheddar, beside a small heap of green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna Niçoise-style salad · `tuna-nicoise-style-salad`

```
A shallow white bowl of torn lettuce, red tomato wedges and cucumber slices topped with chunks of tuna and quartered hard-boiled eggs with firm yellow yolks, scattered with toasted chopped almonds and glistening with dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Smoked salmon, egg and spinach salad · `smoked-salmon-egg-spinach-salad`

```
A shallow white bowl of dark green spinach leaves and thin cucumber rounds topped with folds of pink smoked salmon and halved boiled eggs with set yolks, scattered with toasted chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, apple and almond salad · `chicken-apple-almond-salad`

```
A wide white plate of green salad leaves with thin slices of red-skinned apple and pale cucumber half-moons, topped with golden sliced chicken breast and a scatter of roughly chopped toasted almonds, glossy with dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced chicken and vegetable soup · `spiced-chicken-vegetable-soup`

```
A round white bowl of chunky red tomato soup with pieces of browned chicken, small orange carrot cubes, soft onion and dark green spinach, topped with a scatter of roughly chopped toasted almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon, cucumber and tomato salad · `salmon-cucumber-tomato-salad`

```
A wide white plate of green salad leaves, pale cucumber half-moons, halved red cherry tomatoes and thin rings of purple red onion, topped with large pink flakes of pan-fried salmon and chopped toasted almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, mushroom and spinach omelette · `chicken-mushroom-spinach-omelette`

```
A large folded golden omelette on a round white plate, with browned pieces of chicken, golden sliced mushrooms and dark green wilted spinach showing at its open edge, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and roasted vegetable salad · `chicken-roasted-vegetable-salad`

```
A wide white plate of green salad leaves with halved red cherry tomatoes, soft roasted strips of red pepper and red onion wedges browned at the edges, topped with golden sliced chicken and chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef and vegetable soup · `beef-vegetable-soup`

```
A round white bowl of thick red tomato soup with browned beef mince, small orange carrot cubes, soft onion and dark green wilted spinach, flecked with dried herbs and finished with a thin drizzle of golden olive oil. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, chickpea and tomato salad with oregano · `chicken-chickpea-tomato-oregano-salad`

```
A wide white bowl of golden chickpeas, cubed green cucumber, halved red cherry tomatoes and thin purple red onion slices glossy with lemon dressing, topped with golden strips of chicken flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tomato and mozzarella toasts · `tomato-mozzarella-toasts-spinach`

```
Two slices of golden wholemeal toast on a round white plate, topped with shredded dark green spinach, small pieces of red tomato flecked with dried oregano and torn white mozzarella melted and bubbling golden at the edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Greek-style lemon chicken and rice soup · `greek-style-lemon-chicken-rice-soup`

```
A wide white bowl of pale creamy yellow lemon and egg soup, thick with soft white rice, shreds of chicken, small orange carrot cubes and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and roasted pepper pesto pasta salad · `chicken-pepper-pesto-pasta-salad`

```
A wide white bowl of pasta shapes coated in green pesto, mixed with golden roasted chicken strips, soft red and yellow roasted pepper strips browned at the edges, halved red cherry tomatoes and dark green spinach leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken souvlaki-style rice salad with garlic yogurt · `chicken-souvlaki-style-salad`

```
A wide white bowl with a mound of fluffy white rice beside shredded pale green lettuce, cubed cucumber and tomato and thin purple red onion slices, topped with golden oregano chicken chunks and a dollop of thick white garlic yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, sweetcorn and cucumber sandwiches · `tuna-sweetcorn-cucumber-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the two halves side by side, the cut edges showing a creamy tuna and yellow sweetcorn filling under thin green-edged cucumber rounds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken salad sandwiches · `chicken-salad-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the cut edges showing golden slices of pan-fried chicken, crisp shredded green lettuce, red tomato slices and a thin layer of mayonnaise. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Egg mayonnaise and lettuce sandwiches · `egg-mayo-lettuce-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the two halves side by side, the cut edges showing a thick pale yellow egg mayonnaise filling with shredded green lettuce, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheddar, apple and spinach sandwiches · `cheddar-apple-spinach-sandwiches`

```
A wholemeal sandwich cut in half on the diagonal on a round white plate, the cut edges showing layers of dark green spinach leaves, thin red-skinned apple slices and pale orange mature cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mushroom soup with toast · `mushroom-soup-toast`

```
A round white bowl of smooth, creamy pale brown mushroom soup flecked with tiny dark specks of herbs and black pepper, beside two slices of golden wholemeal toast on a small white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and vegetable soup with toast · `chicken-vegetable-soup`

```
A round white bowl of golden broth filled with small cubes of orange carrot, soft onion, bright green peas and pale chunks of chicken, flecked with dried herbs, beside two slices of golden wholemeal toast. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Crushed new potatoes with tuna and sweetcorn · `crushed-potatoes-tuna-sweetcorn`

```
Warm crushed new potatoes with bright yellow sweetcorn on a bed of green salad leaves on a round white plate, topped with flaked tuna in thick white yogurt and thin green spring onion slices, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy beans with crushed new potatoes · `cheesy-beans-crushed-potatoes`

```
Crushed new potatoes on a round white plate under glossy orange-red baked beans and dark green wilted spinach, topped with a scatter of grated orange cheddar just starting to melt and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, cucumber and sweetcorn rice bowl · `tuna-cucumber-rice-bowl`

```
A round white bowl of white rice topped in neat sections with flaked tuna, small green-edged cubes of cucumber and bright yellow sweetcorn, scattered with thin green spring onion slices and a glossy brown dressing. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Ham, pea and cheddar omelette · `ham-pea-cheddar-omelette`

```
A golden folded omelette on a round white plate, its open edge showing pink pieces of ham, bright green peas and melted orange cheddar, with a few flecks of black pepper on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon chicken, rice and spinach bowl · `chicken-rice-spinach-lemon-bowl`

```
A round white bowl of white rice topped with golden pieces of pan-fried chicken, bright green peas and dark green wilted spinach, glistening with pan juices and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tomato soup with cheese on toast · `tomato-soup-cheese-on-toast`

```
A round white bowl of smooth, deep orange-red tomato soup flecked with dried herbs and black pepper, beside two slices of wholemeal toast covered with bubbling, golden-brown melted cheddar on a small white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### New potato, ham and pea salad · `pea-ham-potato-salad`

```
Halved new potatoes, pink pieces of ham, bright green peas and thin spring onion slices coated in a creamy pale mustard yogurt dressing, piled on shredded green lettuce on a round white plate. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spinach, tomato and cheddar pasta · `spinach-tomato-cheddar-pasta`

```
A round white bowl of pasta shapes in a creamy pale sauce with dark green wilted spinach and halved red cherry tomatoes, topped with finely grated orange cheddar and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Sweetcorn and pepper fritters with salad · `sweetcorn-pepper-fritters-salad`

```
Four round golden-brown fritters dotted with yellow sweetcorn, red pepper and green spring onion on a round white plate, beside a heap of mixed green salad leaves and a small pile of red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

## Dinner

### ✓ Chicken, rice and soy bowl · `chicken-rice-bowl`

```
A wide shallow white bowl of white rice covered by browned chicken strips and stir-fried vegetable strips in orange, red and green, all coated in a glossy dark soy glaze, with a crescent of rice showing at the rim. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide white bowl of noodles and stir-fried vegetable strips glossy with a tan-brown peanut sauce, topped with ribbons of rolled pale yellow omelette laid across the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A shallow round white bowl of pasta shapes tossed in a rich red tomato sauce, sliced brown mushrooms and dark red kidney beans showing on top among small pieces of onion, speckled with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken thigh, bean and tomato rice · `chicken-bean-rice`

```
A wide round white bowl heaped with sticky orange-red tomato and paprika rice, browned pieces of chicken thigh and dark red kidney beans sitting on the surface among soft pieces of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken jalfrezi with rice · `chicken-jalfrezi`

```
Chicken jalfrezi with rice on a wide white plate: a neat mound of white rice beside a glossy orange-red tomato sauce holding browned chicken chunks, large pieces of red and yellow pepper and soft pieces of onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Sticky soy beef noodles in a deep white bowl: a loose swirl of glossy dark-brown noodles with a heap of crumbled browned beef mince in the centre, small broccoli florets and red pepper strips around it, and sliced green spring onion on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Chicken fajitas with salsa on a pale wooden board: two rolled tortilla wraps side by side, the filling just showing at one end of each: browned chicken strips, strips of red and yellow pepper and onion, red tomato salsa and white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Beef burrito bowl · `beef-burrito-bowl`

```
Beef burrito bowl in a wide shallow white bowl: a base of white rice with crumbled spiced beef mince in the centre under a spoonful of red tomato salsa, beside a pile of dark red kidney beans mixed with yellow sweetcorn and a heap of shredded green lettuce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken shawarma-style wraps · `chicken-shawarma-wraps`

```
Chicken shawarma-style wraps on a long white platter: two rolled tortilla wraps lying side by side, their open top ends showing golden-brown sliced chicken, green lettuce, tomato slices, cucumber half-moons and white garlic yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Spiced chickpea and potato curry · `chickpea-potato-curry`

```
Chickpea and potato curry in a wide shallow white bowl: pale golden chickpeas and halved new potatoes in a creamy orange coconut and tomato sauce, dark green wilted spinach folded through, with a mound of white rice at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Soy and honey salmon rice bowl · `soy-honey-salmon-bowl`

```
Soy and honey salmon rice bowl in a shallow white bowl: large flaked pieces of salmon with a glossy dark glaze and pink-orange flesh on a bed of white rice, with broccoli florets and cucumber half-moons alongside and sliced spring onion on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide white plate with a straight band of white rice along one side and, beside it, a thick golden-yellow curry holding bite-sized pieces of chicken, softened onion and bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide round white plate holding a nest of spaghetti topped with a mound of thick red-brown beef and tomato sauce flecked with orange carrot, finely grated cheddar over the centre and a few spaghetti strands curling out at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cheesy beef pasta bake · `beef-pasta-bake`

```
A round white plate holding a spooned serving of cheesy beef pasta bake: pasta shapes in red beef sauce under a golden, bubbling layer of melted mozzarella and creamy cheese sauce with browned patches. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Cottage pie with cheesy mash · `cottage-pie`

```
A white square plate holding a spooned serving of cottage pie: a golden-browned ridged mashed potato top with melted cheddar patches, and the savoury beef mince filling flecked with green peas and orange carrot showing at one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chicken, tomato and mozzarella pasta bake · `chicken-mozzarella-pasta-bake`

```
A small white rectangular baking dish of pasta shapes and bite-sized chicken pieces in red tomato sauce with dark green wilted spinach, under a golden bubbling layer of melted mozzarella with a few browned spots. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Salmon with new potatoes and peas · `salmon-new-potatoes-peas`

```
A white oval plate with one baked salmon fillet in pink-orange with paler flaking lines, beside a pile of small pale new potatoes and a heap of bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Pesto salmon with crushed potatoes · `pesto-salmon-crushed-potatoes`

```
A wide round white plate with one salmon fillet under a spread of green pesto, a few roasted red cherry tomatoes beside it, roughly crushed pale potatoes with a glossy sheen of olive oil, and a few broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A small white oval baking dish of halved soft potatoes in a red tomato sauce, covered by melted mozzarella that is golden and bubbling in places, with the red sauce showing between the patches of cheese. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Easy macaroni cheese · `easy-macaroni-cheese`

```
A small round white baking dish of macaroni cheese, its surface a golden-brown grilled layer of melted cheddar with darker toasted patches and slices of red tomato laid across the top, creamy pasta shapes visible at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Chicken and chickpea stew in a wide white pasta bowl: browned chicken chunks, round chickpeas and soft onion pieces in an orange-red paprika and tomato sauce, with dark green wilted spinach stirred through the surface. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Bacon and tomato linguine · `bacon-tomato-linguine`

```
Bacon and tomato linguine in a wide white pasta bowl: a loose nest of linguine coated in glossy red tomato sauce, golden bacon strips mixed through it and showing at the surface, with a speckling of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Chickpea, potato and pepper traybake · `chickpea-potato-traybake`

```
A roasted traybake on a wide white oval plate: golden halved potatoes, browned chickpeas, chunks of red and yellow pepper with softened edges, red onion wedges and a few split cherry tomatoes, all coloured orange-red with paprika and cumin. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### ✓ Minestrone with beans and pasta · `minestrone-beans-pasta`

```
A shallow white bowl of thick minestrone, its round surface an orange-red tomato broth crowded with small pasta shapes, red kidney beans, green peas, diced orange carrot and onion, flecked with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide white round plate with a mound of smooth pale mash on one side, a pile of soft, glossy deep purple-red cabbage beside it, and a row of browned golden chipolata sausages laid across the top, with a small spoonful of yellow mustard at the edge. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide shallow white bowl of fluffy rice tinted pink-purple by red cabbage ribbons, studded with pale brown chestnut pieces, small chunks of apple and glossy deep red dried cranberries. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A round white plate with fluffy white rice on one side and a golden-orange potato and pea curry on the other, the halved new potatoes coated in thick spiced tomato sauce and dotted with bright green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A wide white bowl heaped with fluffy golden-yellow spiced rice mixed through with chicken pieces, soft browned onion and green peas, with a small white bowl of thick natural yogurt beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
A white oval plate holding one chicken breast with a sticky, glossy golden honey and mustard glaze browned at the edges, beside roasted halved new potatoes and orange carrot chunks with caramelised edges. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon, pepper and chickpea traybake · `salmon-pepper-chickpea-traybake`

```
A round white plate with a roasted salmon fillet on a heap of soft red and yellow pepper strips, red onion wedges, golden roasted chickpeas and split cherry tomatoes, all glossy with oil and dusted with red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and mushroom bolognese · `bean-mushroom-bolognese`

```
A wide white bowl of spaghetti topped with a thick, rich red tomato sauce full of dark red kidney beans, small pieces of brown mushroom and orange flecks of grated carrot, with specks of dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon with garlic spinach, peas and rice · `salmon-garlic-spinach-peas-rice`

```
A round white plate with a bed of white rice studded with bright green peas, a heap of dark green wilted spinach with halved red cherry tomatoes, and a pan-fried salmon fillet with crisp golden skin on top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chickpea, spinach and tomato pasta · `chickpea-spinach-tomato-pasta`

```
A wide white bowl of pasta shapes in a glossy red tomato sauce with plump golden chickpeas and soft ribbons of dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon salmon with crushed chickpeas and broccoli · `lemon-salmon-crushed-chickpeas`

```
A round white plate with a baked salmon fillet, its pink flesh just flaking, on a mound of roughly crushed golden chickpeas glossy with oil, beside a pile of bright green broccoli florets. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mushroom and chickpea stroganoff-style with rice · `mushroom-chickpea-stroganoff`

```
A round white plate with a bed of white rice topped with golden sliced mushrooms, soft onion and chickpeas in a creamy pale orange paprika and yogurt sauce, dusted with a little red paprika. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon, broccoli and pea stir-fry with rice · `salmon-broccoli-pea-stir-fry-rice`

```
A wide white bowl of white rice topped with chunks of pink salmon, bright green broccoli florets, peas and strips of mixed stir-fry vegetables glossy with soy sauce, scattered with sliced green spring onions. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced bean and pepper baked eggs · `spiced-bean-pepper-baked-eggs`

```
A wide white plate of thick red tomato sauce with kidney beans, soft pepper strips and onion, holding two eggs with set whites and soft golden yolks, with two slices of golden wholemeal toast beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Vegetable and chickpea balti with rice · `vegetable-chickpea-balti`

```
A wide white bowl with fluffy white rice on one side and a thick red-brown balti curry on the other, full of chickpeas, chunks of red pepper, mushroom quarters and wilted dark green spinach. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, bean and tomato spaghetti · `tuna-bean-tomato-spaghetti`

```
A wide white bowl of spaghetti tossed in a red tomato sauce with pale pink flakes of tuna, dark red kidney beans and soft chopped onion, flecked with dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon and broccoli fishcakes with peas and salad · `salmon-broccoli-fishcakes-salad`

```
A round white plate with two golden pan-fried salmon fishcakes flecked with green broccoli and spring onion, a heap of bright green peas and a small pile of mixed salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced chickpea and vegetable rice with almonds · `spiced-chickpea-vegetable-rice-almonds`

```
A wide white bowl of golden yellow spiced rice with chickpeas, small orange carrot cubes and bright green peas, scattered with toasted chopped almonds and a few flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon baked in tomatoes with chickpeas and spinach · `salmon-tomato-chickpeas-spinach`

```
A round white plate with a baked salmon fillet on a thick red tomato sauce with chickpeas and dark green wilted spinach, beside a few golden, crispy roasted new potatoes. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bean and vegetable stew with toast · `bean-vegetable-stew-toast`

```
A wide white bowl of thick red bean stew with kidney beans, chickpeas, orange carrot rounds, red pepper chunks and dark green spinach, with two slices of golden wholemeal toast on the side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken thighs in a creamy mushroom sauce with broccoli · `creamy-mushroom-chicken-thighs-broccoli`

```
A golden pan-fried chicken thigh on a round white plate in a creamy pale sauce with sliced browned mushrooms and flecks of dried herbs, with bright green broccoli florets beside it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Cheesy chicken and broccoli bake · `cheesy-chicken-broccoli-bake`

```
A portion of chicken and broccoli bake on a round white plate, pieces of chicken and bright green broccoli florets in a creamy sauce under a bubbling, golden-brown cheddar top. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef, mushroom and spinach pan with cheddar · `beef-mushroom-spinach-skillet`

```
A wide white bowl of browned beef mince in a thick tomato sauce with sliced mushrooms, wilted dark green spinach and soft onion, topped with patches of melted orange cheddar. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pesto chicken with roast tomatoes and broccoli · `pesto-chicken-tomatoes-broccoli`

```
A roast chicken thigh spread with green pesto and melted white mozzarella on a round white plate, beside roasted broccoli florets browned at the edges and blistered red cherry tomatoes in their juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Mozzarella chicken in tomato sauce with salad · `mozzarella-chicken-tomato-sauce`

```
A golden chicken thigh covered with melted white mozzarella in a glossy red tomato sauce flecked with oregano on a round white plate, beside a small heap of green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon with creamy spinach and broccoli · `salmon-creamy-spinach-broccoli`

```
A pan-fried salmon fillet with a golden top on a round white plate, beside creamy dark green spinach and bright green broccoli florets, scattered with toasted chopped almonds and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon with garlic spinach and cherry tomatoes · `salmon-garlic-spinach-tomatoes`

```
A golden pan-fried salmon fillet on a bed of wilted dark green spinach and soft, split red cherry tomatoes on a round white plate, scattered with toasted chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chilli beef with peppers and broccoli · `chilli-beef-pepper-broccoli-stir-fry`

```
A wide white bowl of browned spiced beef mince with strips of red pepper, bright green broccoli florets and sliced spring onion, scattered with toasted chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken thigh traybake with peppers, mushrooms and onions · `chicken-thigh-pepper-mushroom-traybake`

```
A wide white plate of golden roasted chicken thigh fillets dusted red with paprika on a bed of soft roasted pepper strips, red onion wedges and browned mushrooms, glossy with spiced oil and pan juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, spinach and tomato coconut curry · `chicken-spinach-coconut-curry`

```
A round white bowl of creamy orange-red coconut and tomato curry with tender pieces of chicken thigh, soft onion and dark green wilted spinach stirred through it. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef meatballs in tomato sauce with broccoli · `beef-meatballs-tomato-broccoli`

```
A wide shallow white bowl of browned beef meatballs in thick red tomato sauce, with bright green broccoli florets on one side scattered with golden chopped almonds. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef and tomato stuffed peppers with salad · `beef-tomato-stuffed-peppers`

```
Two halves of a soft roasted red pepper on a round white plate, filled with browned beef mince in thick red tomato sauce and scattered with chopped toasted almonds, beside a small heap of green salad leaves. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Lemon and herb chicken with roast carrots and onions · `lemon-herb-chicken-carrots-onions`

```
A wide white plate of golden roasted chicken thigh fillets flecked with dried herbs, with roasted orange carrot sticks, soft red onion wedges and bright green broccoli florets browned at the tips, glossy with pan juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef, mushroom and tomato stew with greens · `beef-mushroom-tomato-stew-greens`

```
A wide shallow white bowl of thick red beef and tomato stew with browned mince, quartered golden mushrooms and small orange carrot cubes, with bright green broccoli florets heaped on one side. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Greek-style lemon chicken traybake · `greek-style-lemon-chicken-traybake`

```
Golden roasted chicken thighs on a round white plate beside golden new potatoes, soft purple red onion wedges and blistered red cherry tomatoes, glistening with lemony juices and flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken cacciatore-style stew with pasta · `chicken-cacciatore-style-pasta`

```
A wide white bowl of pasta shapes topped with a rich red tomato stew of browned chicken thigh chunks, soft red and yellow pepper strips, sliced mushrooms and onion, flecked with dried oregano. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pesto chicken and broccoli pasta · `pesto-chicken-broccoli-pasta`

```
A wide white bowl of pasta shapes coated in glossy green pesto, mixed with golden chicken strips, bright green broccoli florets and halved red cherry tomatoes, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Greek-style chicken with rice and cucumber yogurt · `greek-style-chicken-rice-tzatziki`

```
A round white plate with a bed of fluffy white rice, thick slices of golden roast chicken flecked with oregano, a few soft blistered red cherry tomatoes and a big spoonful of white cucumber yogurt flecked with pale green. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Salmon in tomato sauce with broccoli, peas and new potatoes · `salmon-tomato-sauce-broccoli-potatoes`

```
A round white plate with a pink salmon fillet in a glossy red tomato sauce flecked with dried oregano, beside halved new potatoes, bright green broccoli florets and a small heap of green peas. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, spinach and tomato spaghetti · `chicken-spinach-tomato-spaghetti`

```
A wide white bowl of spaghetti twirled in a rich red tomato sauce, mixed with golden chicken strips and dark green wilted spinach, flecked with dried oregano and black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna, pea and spinach spaghetti with lemon · `tuna-pea-spinach-lemon-spaghetti`

```
A wide white bowl of glossy spaghetti twirled with pale pink flakes of tuna, bright green peas and dark green wilted spinach, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Pan-fried chicken with peas, spinach and new potatoes · `pan-chicken-peas-spinach-potatoes`

```
A round white plate of golden pan-fried chicken pieces and halved new potatoes browned on their cut sides, mixed with bright green peas and dark green wilted spinach, glossy with oil and flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and broccoli pasta with garlic · `chicken-broccoli-garlic-pasta`

```
A round white bowl of pasta shapes tossed with golden pieces of chicken and small bright green broccoli florets, glossy with oil, scattered with finely grated pale yellow cheddar and flecks of black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Quick chicken and spinach curry with rice · `quick-chicken-spinach-curry-rice`

```
A round white bowl holding a mound of fluffy white rice beside an orange-red tomato curry with chunks of chicken and dark green wilted spinach, topped with a spoonful of thick white yogurt. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Beef and broccoli stir-fry with rice · `beef-broccoli-soy-stir-fry-rice`

```
A round white bowl of fluffy white rice topped with browned crumbles of beef mince and bright green broccoli florets glossy with dark soy sauce, scattered with thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken satay noodles · `chicken-satay-noodles`

```
A wide white bowl of thick noodles tossed with golden strips of chicken and crunchy stir-fried vegetable strips in orange, green and cream, all coated in a glossy tan-brown peanut sauce. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Bacon, pea and soft cheese pasta · `bacon-pea-soft-cheese-pasta`

```
A round white bowl of pasta shapes in a smooth, creamy pale sauce, with crisp pink-brown pieces of bacon, bright green peas and dark green wilted spinach through it, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spicy chicken and sweetcorn rice · `spicy-chicken-sweetcorn-rice`

```
A round white bowl of rice tinted pale orange by paprika, mixed with browned pieces of chicken, golden sweetcorn, small pieces of red pepper and thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Quick beef and pepper chilli with rice · `beef-pepper-quick-chilli-rice`

```
A deep round white bowl of thick red-brown chilli with crumbled beef mince, dark red kidney beans and soft pieces of red pepper in tomato sauce, beside a neat mound of fluffy white rice. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken, mushroom and spring onion noodles · `chicken-mushroom-soy-noodles`

```
A wide white bowl of glossy soy-brown noodles tangled with golden strips of chicken, sliced browned mushrooms and short green lengths of spring onion, piled high in the middle of the bowl. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Vegetable noodles with fried eggs · `egg-vegetable-noodle-stir-fry`

```
A wide white bowl of glossy soy-brown noodles tangled with stir-fried vegetable strips in orange, green and cream, topped with two fried eggs with set white edges and golden yolks, and thin rings of green spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken fajita rice · `chicken-fajita-rice-pan`

```
A round white bowl of rice tinted red-orange by fajita spices, mixed with browned strips of chicken and soft strips of red and yellow pepper and onion, topped with a spoonful of chunky red tomato salsa. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Tuna and tomato new potatoes with spinach · `tuna-tomato-new-potatoes-spinach`

```
A shallow round white bowl of halved new potatoes in a thick red tomato sauce speckled with dried oregano, with pale chunks of tuna and dark green wilted spinach through it, flecked with black pepper. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Chicken and pea egg fried rice · `chicken-pea-egg-fried-rice`

```
A round white bowl of fried rice tinted pale brown by soy, mixed with small golden pieces of chicken, bright green peas and soft pieces of yellow scrambled egg, flecked with thin green rings of spring onion. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Creamy tomato chicken spaghetti · `creamy-tomato-chicken-spaghetti`

```
A wide white pasta bowl of spaghetti twirled in a creamy pale orange tomato sauce, with golden pieces of chicken and dark green wilted spinach through it, speckled with dried herbs. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Garlic and soy chicken with greens and rice · `garlic-soy-chicken-greens-rice`

```
A round white bowl of fluffy white rice topped with golden strips of chicken glossy with soy sauce, bright green broccoli florets and dark green wilted spinach, with a little of the pan juices. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
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
Crisp, cup-shaped pale green lettuce leaves on a round white plate, each filled with a bright salsa of yellow sweetcorn, diced red pepper, quartered cherry tomatoes and finely chopped purple onion, dusted with red chilli powder. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Apple, cinnamon and almond yogurt pot · `apple-almond-yogurt-pot`

```
A small white bowl of thick white yogurt topped with small chunks of red-skinned apple and roughly chopped almonds, finished with a fine dusting of brown cinnamon. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```

### Spiced bean dip with vegetable sticks · `spiced-bean-dip-vegetable-sticks`

```
A small white bowl of smooth, thick red-brown kidney bean dip flecked with cumin, on a white plate surrounded by orange carrot sticks and pale green cucumber sticks. Overhead food photograph, bird's-eye view shot straight down from directly above (90 degrees, flat lay), the dish centred with space around it, on a light oak wooden table, soft natural window daylight, natural appetising colours, crisp sharp detail, simple home-cooked styling. --ar 4:3 --v 7 --style raw --no text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam
```
