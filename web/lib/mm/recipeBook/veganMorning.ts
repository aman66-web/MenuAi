import { ing, type Recipe } from "../recipes";

// Vegan breakfasts and snacks (nothing from an animal: no milk, eggs, yogurt, cheese or honey). See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const VEGAN_MORNING: readonly Recipe[] = [
  {
    id: "apple-cinnamon-baked-oats", meal: "breakfast", tags: ["Vegan", "Bake"], name: "Apple and cinnamon baked oats", blurb: "Oats baked with chopped apple, raisins and cinnamon until golden on top.", servings: 4, minutes: 45,
    // the oat drink and the banana that binds the oats follow the oats, so the bake keeps its texture when it is fitted
    ingredients: [ing("oats", 160), ing("oat-drink", 400, { follows: "oats" }), ing("banana", 120, { follows: "oats" }), ing("apple", 300), ing("raisins", 40), ing("cinnamon", 2), ing("oil-spray", 1)],
    method: [
      "Heat the oven: Turn the oven on to 180°C (160°C fan, gas 4). Spray a baking dish about 20 cm across with a little oil.",
      "Mash the banana: Peel the banana and mash it in a large bowl with a fork until it is smooth.",
      "Chop the apples: Cut the apples into quarters, cut out the cores and chop them into small cubes. Keep a handful of the cubes for the top.",
      "Mix it together: Add the oats, oat drink, raisins, most of the cinnamon and the rest of the apple to the banana. Stir until there are no dry oats left.",
      "Fill the dish: Pour the mixture into the dish, spread it flat and scatter the apple you kept over the top. Dust the rest of the cinnamon over it.",
      "Bake: Bake on the middle shelf for 30 to 35 minutes, until golden on top and firm in the middle when you press it gently.",
      "Serve: Leave it to stand for 5 minutes, then cut it into squares and serve warm.",
    ],
  },
  {
    id: "coconut-rice-pudding-berries", meal: "breakfast", tags: ["Vegan", "Sweet"], name: "Coconut rice pudding with berries", blurb: "Rice simmered in coconut milk with cinnamon and raisins, topped with warm berries.", servings: 4, minutes: 40,
    // the coconut milk follows the rice, so the pudding stays creamy when it is fitted
    ingredients: [ing("rice", 100), ing("coconut-milk", 400, { follows: "rice" }), ing("raisins", 40), ing("cinnamon", 2), ing("berries", 200)],
    method: [
      "Start the pudding: Put the rice, coconut milk, raisins and cinnamon in a medium saucepan. Add 300 ml of cold water and stir well.",
      "Bring to a simmer: Heat over a medium heat for about 5 minutes, stirring, until it starts to bubble gently.",
      "Cook the rice: Turn the heat to low and cook for 25 to 30 minutes, stirring every few minutes so it doesn't stick, until the rice is soft and the pudding is thick. Add a splash of water if it thickens first.",
      "Warm the berries: Put the berries in a small pan with a splash of water. Warm them over a low heat for 3 to 4 minutes, until soft and juicy.",
      "Serve: Spoon the rice pudding into bowls and top with the warm berries and their juice.",
    ],
  },
  {
    id: "crispy-potatoes-garlic-mushrooms", meal: "breakfast", tags: ["Vegan", "Brunch"], name: "Crispy potatoes with garlic mushrooms and tomatoes", blurb: "Oven-crisped potatoes with garlicky mushrooms and soft cherry tomatoes.", servings: 3, minutes: 45,
    ingredients: [ing("new-potatoes", 690), ing("olive-oil", 20), ing("mushrooms", 250), ing("cherry-tomatoes", 200), ing("garlic", 10, { note: "about 2 cloves" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 220°C (200°C fan, gas 7) and put a shelf in the middle.",
      "Get the potatoes ready: Drain the potatoes, cut each one in half and pat them dry with kitchen paper.",
      "Oil the potatoes: Toss the potatoes on a large baking tray with two thirds of the oil, a pinch of salt and some black pepper. Spread them out cut side down in one layer, using two trays if they don't fit.",
      "Roast the potatoes: Roast for 30 to 35 minutes, turning them halfway, until golden and crisp with browned edges.",
      "Slice the mushrooms: While the potatoes roast, wipe the mushrooms clean and cut them into thick slices.",
      "Brown the mushrooms: Heat the rest of the oil in a large frying pan over a high heat. Add the mushrooms in one layer and leave them for 3 minutes without stirring, until golden underneath.",
      "Turn the mushrooms: Stir and fry for 2 to 3 minutes more, until golden all over and glossy, with no juice left in the pan.",
      "Add the garlic and tomatoes: Turn the heat to medium. Stir in the garlic and the cherry tomatoes. Cook for 3 to 4 minutes, until the tomatoes soften and start to split.",
      "Serve: Pile the crispy potatoes onto plates and spoon the garlic mushrooms and tomatoes over the top.",
    ],
  },
  {
    id: "banana-berry-overnight-oats", meal: "breakfast", tags: ["Vegan", "Make ahead"], name: "Banana and berry overnight oats", blurb: "Oats soaked overnight in oat drink with mashed banana, topped with berries.", servings: 2, minutes: 10,
    // the oat drink follows the oats, so they soak to the same thickness when the recipe is fitted
    ingredients: [ing("oats", 80), ing("oat-drink", 250, { follows: "oats" }), ing("banana", 120), ing("berries", 120), ing("cinnamon", 1)],
    method: [
      "Mash half the banana: Peel the banana and cut it in half. Mash one half in a bowl with a fork until smooth, and keep the other half for the morning.",
      "Mix the oats: Add the oats, oat drink and cinnamon to the mashed banana. Stir until there are no dry oats left.",
      "Soak overnight: Cover the bowl and leave it in the fridge overnight, or for at least 4 hours, until the oats are soft and thick.",
      "Thaw the berries: If the berries are frozen, put them in a small covered bowl in the fridge at the same time, so they thaw overnight.",
      "Loosen the oats: In the morning, give the oats a stir. If they are too thick, stir in a splash of water.",
      "Top and serve: Slice the rest of the banana into thin rounds. Spoon the oats into bowls, top with the banana and berries and eat cold.",
    ],
  },
  {
    id: "peanut-butter-banana-wraps", meal: "breakfast", tags: ["Vegan", "Quick"], name: "Peanut butter and banana breakfast wraps", blurb: "Toasted wraps filled with peanut butter, sliced banana and a pinch of cinnamon.", servings: 2, minutes: 10,
    ingredients: [ing("wraps", 120), ing("peanut-butter", 40), ing("banana", 240), ing("cinnamon", 1)],
    method: [
      "Slice the bananas: Peel the bananas and cut them into thin rounds, about as thick as a pound coin.",
      "Spread the wraps: Lay the wraps flat and spread the peanut butter over each one, leaving a gap of about 2 cm round the edge.",
      "Add the filling: Lay the banana slices in a line down the middle of each wrap and sprinkle the cinnamon over them.",
      "Roll them up: Fold the bottom of each wrap over the filling, fold in the sides and roll it up tightly.",
      "Toast the wraps: Heat a dry non-stick frying pan over a medium heat. Toast the wraps join side down for 1 to 2 minutes on each side, until golden.",
      "Serve: Cut each wrap in half and serve warm.",
    ],
  },
  {
    id: "turmeric-chickpea-wraps", meal: "breakfast", tags: ["Vegan", "Wrap"], name: "Turmeric chickpea breakfast wraps", blurb: "Warm wraps filled with crushed spiced chickpeas, spinach and cherry tomatoes.", servings: 2, minutes: 20,
    ingredients: [ing("chickpeas", 240), ing("wraps", 120), ing("spinach", 60), ing("cherry-tomatoes", 120), ing("spring-onions", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("turmeric", 2), ing("cumin", 1), ing("olive-oil", 10), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Get everything ready: Drain and rinse the chickpeas and pat them dry. Slice the spring onions thinly and cut the cherry tomatoes in half.",
      "Warm the wraps: Heat a dry frying pan over a medium heat and warm the wraps for about 20 seconds on each side. Stack them under a clean tea towel.",
      "Soften the spring onions: Heat the oil in the same pan over a medium heat. Add the spring onions and cook for 2 minutes, until soft.",
      "Add the garlic and spices: Stir in the garlic, turmeric and cumin and cook for 30 seconds, until fragrant, stirring so the garlic doesn't burn.",
      "Crush the chickpeas: Add the chickpeas and fry for 2 minutes, stirring, until golden yellow in the spiced oil. Add a splash of water and cook for 2 to 3 minutes more, crushing them roughly with a fork, until hot all the way through.",
      "Wilt the spinach: Stir in the spinach and cook for 1 minute, until it wilts. Stir in the lemon juice, a pinch of salt and some black pepper.",
      "Fill and serve: Spoon the chickpeas down the middle of each wrap and top with the cherry tomatoes. Fold in the sides, roll up tightly and serve warm.",
    ],
  },
  {
    id: "peanut-butter-apple-slices", meal: "snack", tags: ["No cook", "Sweet"], name: "Peanut butter apple slices with raisins", blurb: "Crisp apple slices spread with peanut butter and dotted with raisins.", servings: 2, minutes: 10,
    ingredients: [ing("apple", 300), ing("peanut-butter", 40), ing("raisins", 20), ing("lemon-juice", 5)],
    method: [
      "Slice the apples: Cut each apple into quarters and cut out the core. Cut each quarter into 3 thick slices.",
      "Stop them browning: Put the slices in a bowl with the lemon juice and toss until every slice is coated.",
      "Spread the peanut butter: Pat the slices dry with kitchen paper and spread a thin layer of peanut butter along the top of each one.",
      "Add the raisins and serve: Press a few raisins into the peanut butter on each slice. Arrange them on a plate and eat straight away.",
    ],
  },
  {
    id: "banana-oat-cookies", meal: "snack", tags: ["Make ahead", "Sweet"], name: "Banana and oat cookies", blurb: "Soft, chewy cookies made from ripe bananas, oats and raisins.", servings: 6, minutes: 30,
    // the bananas hold the oats together, so they follow the oats when the recipe is fitted
    ingredients: [ing("oats", 150), ing("banana", 240, { follows: "oats" }), ing("raisins", 50), ing("cinnamon", 1)],
    method: [
      "Heat the oven: Turn the oven on to 180°C (160°C fan, gas 4) and line a large baking tray with baking paper.",
      "Mash the bananas: Peel the bananas and mash them in a large bowl with a fork until smooth.",
      "Mix the dough: Stir in the oats, raisins and cinnamon until everything is evenly mixed and sticky. Leave it for 5 minutes so the oats soften.",
      "Shape the cookies: Scoop heaped tablespoons of the mixture onto the tray, leaving a gap between them. Press each one flat to about 1 cm thick.",
      "Bake: Bake on the middle shelf for 15 to 18 minutes, until golden at the edges and firm on top.",
      "Cool and serve: Leave them on the tray for 10 minutes to firm up, then serve. Keep any left over in a sealed box for up to 3 days.",
    ],
  },
  {
    id: "frozen-banana-berry-ice", meal: "snack", tags: ["Make ahead", "Sweet"], name: "Frozen banana and berry ice", blurb: "Frozen banana and berries blended into a thick, scoopable ice.", servings: 2, minutes: 15,
    ingredients: [ing("banana", 240), ing("berries", 150), ing("oat-drink", 50)],
    method: [
      "Freeze the fruit: Peel the bananas and slice them into rounds. Spread them on a tray lined with baking paper and freeze for at least 4 hours, until solid. Keep the berries in the freezer too.",
      "Fill the blender: Put the frozen banana, the frozen berries and the oat drink into a blender or food processor.",
      "Blend until smooth: Blend for 2 to 3 minutes, stopping to scrape down the sides, until thick and smooth. Add a splash of water if the blades get stuck.",
      "Serve: Spoon it into bowls and eat straight away, or freeze it in a covered box for 1 hour for firmer scoops.",
    ],
  },
  {
    id: "wrap-crisps-tomato-salsa", meal: "snack", tags: ["Savoury", "Bake"], name: "Baked wrap crisps with tomato salsa", blurb: "Crunchy baked wrap triangles with a chunky tomato, cucumber and red onion salsa.", servings: 2, minutes: 25,
    ingredients: [ing("wraps", 120), ing("oil-spray", 2), ing("tomatoes", 240), ing("cucumber", 100), ing("red-onion", 40, { note: "about a quarter of a red onion" }), ing("lemon-juice", 15), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6) and put a shelf in the middle.",
      "Make the salsa: Chop the tomatoes, cucumber and red onion into small cubes. Mix them in a bowl with the lemon juice, a pinch of salt and some black pepper, and leave them while the crisps bake, so the juices come out.",
      "Cut the wraps: Stack the wraps on a board and cut them into 8 triangles, like cutting a pizza.",
      "Bake the crisps: Spread the triangles on a baking tray in a single layer, spray them with oil and sprinkle with a pinch of salt. Bake for 6 to 8 minutes, until golden and crisp at the edges.",
      "Serve: Leave the crisps on the tray for 5 minutes to crisp up, then give the salsa a stir and serve it with the crisps for dipping.",
    ],
  },
  {
    id: "baked-cinnamon-apple-slices", meal: "snack", tags: ["Sweet", "Bake"], name: "Baked cinnamon apple slices", blurb: "Soft, warm apple slices baked with cinnamon until golden at the edges.", servings: 2, minutes: 35,
    ingredients: [ing("apple", 450), ing("cinnamon", 2), ing("lemon-juice", 10), ing("oil-spray", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6) and line a baking tray with baking paper.",
      "Slice the apples: Cut each apple into quarters and cut out the core. Cut each quarter into 3 slices.",
      "Coat the slices: Toss the slices in a bowl with the lemon juice and cinnamon until they are evenly coated.",
      "Bake: Spread the slices on the tray in a single layer and spray them with a little oil. Bake for 20 to 25 minutes, turning them halfway, until soft and golden at the edges.",
      "Serve: Leave them to cool for 5 minutes, then serve warm.",
    ],
  },
  {
    id: "sweetcorn-pepper-lettuce-cups", meal: "snack", tags: ["No cook", "Savoury"], name: "Sweetcorn and pepper salsa in lettuce cups", blurb: "Crisp lettuce leaves filled with a sweetcorn, pepper and tomato salsa.", servings: 2, minutes: 15,
    ingredients: [ing("sweetcorn", 200), ing("peppers", 160, { note: "about 1 pepper" }), ing("cherry-tomatoes", 100), ing("red-onion", 40, { note: "about a quarter of a red onion" }), ing("lemon-juice", 15), ing("olive-oil", 5), ing("chilli-powder", 1), ing("salt", 1), ing("black-pepper", 1), ing("lettuce", 120, { prefer: ["lettuce"] })],
    method: [
      "Get the sweetcorn ready: If it is tinned, drain it well in a sieve. If it is frozen, boil it for 3 minutes, then drain it and cool it under the cold tap.",
      "Chop the pepper and onion: Cut the pepper in half, scoop out the seeds and chop it into small cubes. Peel the red onion and chop it finely.",
      "Mix the salsa: Cut the cherry tomatoes into quarters and put them in a bowl with the sweetcorn, pepper and onion. Stir in the oil, lemon juice, chilli powder, a pinch of salt and some black pepper.",
      "Get the lettuce ready: Cut the core out of the lettuce and gently pull off whole, cup-shaped leaves. Rinse them under the cold tap and pat them dry.",
      "Fill and serve: Spoon the salsa into the lettuce leaves and serve straight away, while the lettuce is crisp.",
    ],
  },
];

// How each of these recipes looks from directly above (the same rules as looks.ts).
export const VEGAN_MORNING_LOOKS: Readonly<Record<string, string>> = {
  "apple-cinnamon-baked-oats": "A square white baking dish of golden-brown baked oats, the top dotted with soft cubes of apple and dark raisins and dusted with cinnamon, one square cut out to show the firm, moist oat inside.",
  "coconut-rice-pudding-berries": "Creamy coconut rice pudding in a round white bowl, soft pale grains flecked with cinnamon and dotted with plump dark raisins, topped in the centre with a heap of warm, glossy red and purple mixed berries in their juice.",
  "crispy-potatoes-garlic-mushrooms": "A round white plate of halved golden potatoes with crisp, browned edges, topped with glossy golden sliced mushrooms flecked with garlic and soft, split red cherry tomatoes, dotted with cracked black pepper.",
  "banana-berry-overnight-oats": "A deep white bowl of thick, creamy soaked oats flecked with cinnamon, topped with overlapping thin rounds of banana on one side and a heap of glossy red and purple mixed berries on the other.",
  "peanut-butter-banana-wraps": "A peanut butter and banana wrap cut in half on a round white plate, the toasted wrap golden with darker patches, the cut ends showing a layer of golden-brown peanut butter and round banana slices dusted with cinnamon.",
  "turmeric-chickpea-wraps": "A tortilla wrap cut in half on a round white plate, the cut ends showing roughly crushed chickpeas stained golden yellow with turmeric, dark green wilted spinach, halved red cherry tomatoes and thin rings of green spring onion.",
  "peanut-butter-apple-slices": "Thick apple slices with their skins on, laid in a fan on a round white plate, each spread with a stripe of golden-brown peanut butter and dotted with dark, wrinkled raisins.",
  "banana-oat-cookies": "Round, flat banana and oat cookies with golden-brown edges, a rough oat texture and dark raisins pressed into their tops, arranged in a loose circle on a round white plate.",
  "frozen-banana-berry-ice": "A small round white bowl holding two scoops of thick, smooth frozen banana and berry ice, a deep pinky-purple colour with a soft, creamy texture and rounded edges.",
  "wrap-crisps-tomato-salsa": "Golden, crisp triangles of baked tortilla wrap fanned around a small white bowl of chunky salsa made from diced red tomato, pale green cucumber and purple red onion, flecked with black pepper, on a round white plate.",
  "baked-cinnamon-apple-slices": "Soft baked apple slices with their skins on, fanned in an overlapping ring on a round white plate, golden at the edges and dusted with warm brown cinnamon.",
  "sweetcorn-pepper-lettuce-cups": "Crisp, cup-shaped pale green lettuce leaves on a round white plate, each filled with a bright salsa of yellow sweetcorn, diced red pepper, quartered cherry tomatoes and finely chopped purple onion, dusted with red chilli powder.",
};

// Suggested lines for niches.ts (cuisine and occasions), for the lead to add: [id, kind, value]
export const VEGAN_MORNING_NICHE_SUGGESTIONS: ReadonlyArray<[string, "cuisine" | "occasion", string]> = [
  ["crispy-potatoes-garlic-mushrooms", "cuisine", "british"],
  ["peanut-butter-apple-slices", "occasion", "lunchbox"],
  ["banana-oat-cookies", "occasion", "lunchbox"],
  ["banana-oat-cookies", "occasion", "picnic"],
  ["wrap-crisps-tomato-salsa", "occasion", "party-food"],
  ["sweetcorn-pepper-lettuce-cups", "occasion", "party-food"],
  ["baked-cinnamon-apple-slices", "occasion", "bonfire-night"],
];
