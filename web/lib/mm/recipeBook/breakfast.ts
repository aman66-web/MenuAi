import { ing, type Recipe } from "../recipes";

// Breakfasts. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const BREAKFAST: readonly Recipe[] = [
  {
    id: "berry-yogurt-porridge", meal: "breakfast", tags: ["Porridge"], name: "Berry porridge with yogurt", blurb: "Creamy oats topped with cool yogurt and berries.", servings: 1, minutes: 8,
    ingredients: [ing("oats", 50), ing("milk", 200, { follows: "oats" }), ing("greek-yogurt", 100, { role: "protein" }), ing("berries", 80), ing("cinnamon", 1)],
    method: [
      "Mix the porridge: Put the oats, milk and cinnamon into a small saucepan and stir them together.",
      "Heat it up: Put the pan on a medium heat. Stir often with a wooden spoon, scraping the bottom so the porridge doesn't stick or burn.",
      "Cook until creamy: When it starts to bubble gently, turn the heat down a little. Keep stirring for 4 to 5 minutes, until thick and creamy. Stir in a splash of hot water if it gets too thick.",
      "Get the berries ready: While it cooks, thaw frozen berries under the cold tap for about a minute, then shake off the water.",
      "Serve: Spoon the hot porridge into a bowl, put the yogurt on top and scatter the berries over. Eat it straight away.",
    ],
  },
  {
    id: "peanut-banana-porridge", meal: "breakfast", tags: ["Porridge", "Vegan"], name: "Peanut butter and banana porridge", blurb: "Oats cooked in oat drink with a swirl of peanut butter and sliced banana.", servings: 2, minutes: 15,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of salt in the oats, as a cook would add, to bring out the peanut and banana
    ingredients: [ing("oats", 100), ing("oat-drink", 400, { follows: "oats" }), ing("peanut-butter", 30), ing("banana", 120, { note: "about 1 banana" }), ing("cinnamon", 1), ing("salt", 1)],
    method: [
      "Slice the banana: Peel the banana and cut it into thin rounds, about as thick as a pound coin. Leave them on a plate.",
      "Mix the porridge: Put the oats, oat drink, cinnamon and a pinch of salt into a medium saucepan. Stir well so no dry oats are left at the bottom.",
      "Bring to a bubble: Put the pan on a medium heat and stir often, scraping the bottom and corners so nothing sticks. After 2 to 3 minutes it will start to bubble gently.",
      "Cook until thick: Turn the heat down a little and keep stirring for 3 to 4 minutes more, until thick and creamy and the spoon makes a clear trail. Stir in a splash of hot water if it gets too thick.",
      "Swirl in the peanut butter: Take the pan off the heat and spoon the porridge into bowls. Drop the peanut butter on top in spoonfuls and swirl it through with the tip of a spoon.",
      "Serve: Lay the banana slices on top in an overlapping ring and serve straight away, while the porridge is hot.",
    ],
  },
  {
    id: "smoked-salmon-eggs", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Smoked salmon and scrambled eggs", blurb: "Soft scrambled eggs with ribbons of smoked salmon.", servings: 2, minutes: 10,
    // 2026-11-21 (founder: the recipe "has to look exactly as much as you can as the product"): a teaspoon of olive oil in the pan for the soft, glossy eggs the
    // picture shows, and cracked pepper on top as well as in the eggs (the smoked salmon brings the salt)
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("smoked-salmon", 100), ing("black-pepper", 1), ing("olive-oil", 5)],
    method: [
      "Get the salmon ready: Tear the smoked salmon into strips about as wide as your finger and put them on a plate. It is ready to eat, so it needs no cooking.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add half the black pepper and a splash of water and beat with a fork for 30 seconds, until no streaks of white are left. Wash your hands after handling raw eggs.",
      "Warm the pan: Put the oil in a non-stick frying pan on a low heat for 1 minute, tilting it to coat the bottom. Keep the heat low the whole time, so the eggs stay soft and glossy, not rubbery.",
      "Start the eggs: Pour in the eggs and leave them for about 20 seconds, until the edges start to set. Then stir slowly with a wooden spoon, pushing the egg from the edges into the middle.",
      "Scramble gently: Keep stirring slowly for 3 to 4 minutes, until the eggs are just set but still soft, with no runny egg white left. If they stick, lift the pan off the heat for a few seconds.",
      "Add the salmon: Take the pan off the heat straight away and gently fold in the smoked salmon so it warms through.",
      "Serve: Spoon the eggs on to warm plates, sprinkle the rest of the black pepper over the top and serve straight away, before they go dry.",
    ],
  },
  {
    // lunch, not breakfast (founder 2026-11-20: "no one's going to eat that for breakfast", of kedgeree; the same holds for this one)
    id: "spanish-omelette", meal: "lunch", tags: ["Eggs", "Brunch"], name: "Spanish-style omelette with potatoes and peas", blurb: "A thick, golden omelette to cut into wedges.", servings: 3, minutes: 30,
    // the potatoes follow the eggs so the omelette keeps its proportions, and one frying pan holds at most half as many eggs again
    // 2026-11-21 (founder: the recipe "has to look exactly as much as you can as the product"): 5 ml more olive oil, the potatoes fried golden on their own first and
    // the onion cooked slowly until soft and sweet, as in the picture
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): the omelette is turned so its top is golden brown, and the onion is in soft slices, as in the photo
    ingredients: [ing("eggs", 360, { note: "about 6 eggs", fit: [0.5, 1.5] }), ing("new-potatoes", 300, { follows: "eggs" }), ing("peas", 120), ing("olive-oil", 15), ing("onion", 150, { note: "about 1 onion" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Prepare the potatoes and onion: Drain the potatoes, pat them dry with kitchen paper and cut them into slices about 1 cm thick. They are already cooked. Peel the onion, halve it and slice it into thin half-moons.",
      "Beat the eggs: Crack the eggs into a large bowl, add a pinch of salt and black pepper and beat with a fork until fully mixed. Wash your hands after handling raw eggs.",
      "Fry the potatoes: Heat the oil in a non-stick frying pan, about 24 cm across, on a medium-high heat. Add the potatoes in one layer and fry for 4 to 5 minutes, turning once, until golden on both sides.",
      "Soften the onion: Turn the heat down to medium, add the onion and cook for 5 to 6 minutes, stirring gently now and then, until soft, sweet and see-through.",
      "Add the peas: Tip in the frozen peas and stir for 1 to 2 minutes, until they are no longer icy. Turn the heat down low.",
      "Pour in the eggs: Pour the eggs evenly over everything. Gently press the potatoes, onion and peas flat with the back of the spoon so the egg runs between them. Don't stir from now on.",
      "Set the bottom: Cook on a low heat for 8 to 10 minutes, until the edges are set and the underside is golden. Lift an edge with the spoon to check. The top will still look wet.",
      "Cook the top: Cover the pan with a lid or a flat plate and cook on low for 4 to 5 minutes, until the top is nearly set. Lift the lid away from you.",
      "Turn the omelette: Put a plate upside down over the pan and, holding both with oven gloves, turn it over. Slide the omelette back in, browned side up, and cook for 3 to 4 minutes, until golden brown underneath and set all the way through.",
      "Serve: Leave it to stand off the heat for 1 to 2 minutes. Slide it on to a board, golden side up, and cut it into wedges. Serve warm.",
    ],
  },
  {
    id: "breakfast-burrito", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Bean breakfast burritos", blurb: "Scrambled eggs, beans, cheese and salsa rolled up in a warm wrap.", servings: 2, minutes: 15,
    // 2026-11-21 (founder: "Nothing should be plain"): the cumin and garlic warmed in a teaspoon of oil before the beans go in, and pepper in the eggs
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): mostly whole beans, and the burritos toasted to brown spots, as in the photo
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("kidney-beans", 240), ing("wraps", 120), ing("cheddar", 40), ing("salsa", 60), ing("cumin", 1), ing("spinach", 30), ing("vegetable-oil", 5), ing("garlic", 5, { note: "about 1 clove" }), ing("black-pepper", 1)],
    method: [
      "Get ready: Grate the cheddar. Rinse the spinach unless the bag says it is ready washed. Drain the beans in a sieve and rinse them under cold water.",
      "Warm the spices: Heat the oil in a small saucepan on a medium heat. Stir in the garlic and cumin for 30 seconds, until they sizzle and smell fragrant, without letting the garlic brown.",
      "Warm the beans: Add the beans and a splash of water and cook for 3 to 4 minutes, stirring, until steaming hot. Take them off the heat, crush a few with a fork and cover.",
      "Beat the eggs: Crack the eggs into a bowl, add the black pepper and a splash of water and beat with a fork until fully mixed. Wash your hands after handling raw eggs.",
      "Warm the wraps: Warm the wraps in a dry non-stick frying pan for about 20 seconds on each side, so they bend without cracking. Cover them with a clean tea towel.",
      "Scramble the eggs: Turn the heat under the same pan down low and pour in the eggs. Cook for 3 to 4 minutes, leaving them still for the first 20 seconds, then stirring slowly, until just set but still soft, with no runny white left.",
      "Fill the wraps: Lay the wraps flat. Down the middle of each, layer the spinach, beans, eggs and cheese, leaving about 5 cm clear at the top and bottom. Spoon the salsa on top.",
      "Roll them up: Fold the bottom of each wrap up over the filling, fold in the sides, then roll it up tightly.",
      "Toast and serve: Toast the burritos join side down in the dry pan on a medium heat for 1 to 2 minutes a side, until golden brown in spots. Cut each in half and serve straight away.",
    ],
  },
  {
    id: "bacon-egg-wraps", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Bacon and egg breakfast wraps", blurb: "Grilled bacon and scrambled egg in a warm wrap.", servings: 2, minutes: 20,
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): wilted spinach, thick tomato slices, and the wraps toasted to golden stripes and cut on a slant, as in the photo
    ingredients: [ing("bacon", 120), ing("eggs", 240, { note: "about 4 eggs" }), ing("wraps", 120), ing("tomatoes", 80), ing("spinach", 30), ing("black-pepper", 1)],
    method: [
      "Heat the grill: Turn the grill on to a medium-high heat. Rinse the spinach unless the bag says it is ready washed. Wash the tomatoes, cut them in half and slice them about 1 cm thick.",
      "Grill the first side: Lay the bacon in a single layer on the grill rack and grill for 4 to 5 minutes, until the top starts to brown. Wash your hands after handling raw bacon.",
      "Beat the eggs: Meanwhile, crack the eggs into a bowl, add the black pepper and a splash of water and beat with a fork until fully mixed. Wash your hands after handling raw eggs.",
      "Warm the wraps: Heat a non-stick frying pan over a medium heat. Warm the wraps in the dry pan for about 20 seconds on each side, then cover them with a clean tea towel.",
      "Grill the second side: Turn the bacon over and grill for 4 to 5 minutes more, until browned all over. Lower the grill a little if it browns too fast.",
      "Wilt the spinach: Stir the spinach in the frying pan for about 1 minute, until wilted and dark green, then lift it onto a plate.",
      "Scramble the eggs: While the bacon grills, turn the frying pan down low and pour in the eggs. Cook for 3 to 4 minutes, leaving them still for the first 20 seconds, then stirring slowly, until just set with no runny white left.",
      "Check the bacon: Take the bacon out and cut into the thickest piece. It should be brown all the way through, with no pink left, and piping hot. Switch the grill off.",
      "Fill and roll: Lay the wraps flat and line up the spinach, bacon, eggs and tomatoes down the middle, leaving about 5 cm clear at each end. Fold up the bottom, fold in the sides and roll up tightly.",
      "Toast and serve: Toast the wraps join side down in a hot dry griddle or frying pan, pressing with a fish slice, for 1 to 2 minutes a side, until golden brown in stripes or spots. Cut each in half on a slant and serve hot.",
    ],
  },
  {
    id: "greek-yogurt-granola", meal: "breakfast", tags: ["Quick"], name: "Greek yogurt granola bowl", blurb: "Thick yogurt with crunchy granola, berries and a drizzle of honey.", servings: 1, minutes: 5,
    ingredients: [ing("greek-yogurt", 200, { role: "protein" }), ing("granola", 45), ing("berries", 80), ing("honey", 10)],
    method: [
      "Get the berries ready: If they are frozen, thaw them in a sieve under the cold tap for about a minute and shake off the water. If fresh, rinse and pat them dry. Halve any large ones.",
      "Add the yogurt: Stir any liquid on top of the tub back into the yogurt. Spoon it into a cereal bowl and smooth the top flat.",
      "Add the granola: Scatter the granola over one half of the yogurt, just before you eat, so it stays crunchy.",
      "Top with berries and honey: Heap the berries on the other half and drizzle the honey in thin lines across both. If the honey is thick, stand the jar in a mug of hot water for a minute first.",
      "Serve: Eat straight away, digging down so each mouthful has some yogurt, granola and berries.",
    ],
  },
  {
    id: "cottage-cheese-berries", meal: "breakfast", tags: ["Quick"], name: "Cottage cheese, berries, honey and almonds", blurb: "A no-cook bowl with sweet berries and crunchy almonds.", servings: 1, minutes: 5,
    ingredients: [ing("cottage-cheese", 200), ing("berries", 100), ing("honey", 10), ing("almonds", 15)],
    method: [
      "Chop the almonds: Chop the almonds roughly into pieces about the size of a pea, keeping the fingertips of your other hand curled away from the blade.",
      "Get the berries ready: If they are frozen, thaw them in a sieve under the cold tap for about a minute and shake off the water. If fresh, rinse and pat them dry. Halve any large ones.",
      "Add the cottage cheese: Spoon the cottage cheese into a bowl and level the top. Stir in or pour off any watery liquid from the tub, as you prefer.",
      "Add the berries and honey: Heap the berries in the middle of the cottage cheese and drizzle the honey over them in a thin spiral. If the honey is thick, stand the jar in a mug of hot water for a minute first.",
      "Serve: Scatter the almonds over at the last moment, so they stay crunchy, and serve straight away.",
    ],
  },
  {
    id: "wheat-biscuits-berries", meal: "breakfast", tags: ["Quick"], name: "Wholewheat biscuits with milk and berries", blurb: "A classic bowl of cereal with fruit on top.", servings: 1, minutes: 3,
    ingredients: [ing("wheat-biscuits", 38), ing("milk", 200, { follows: "wheat-biscuits" }), ing("berries", 80)],
    method: [
      "Get the berries ready: If they are frozen, thaw them in a sieve under the cold tap for about a minute and shake off the water. If fresh, rinse and pat them dry. Halve any large ones.",
      "Add the biscuits: Put the wheat biscuits side by side in a wide cereal bowl, not on top of each other, so the milk can soak into all of them.",
      "Pour the milk: Pour the cold milk slowly over and around the biscuits, so the tops get wet as well as the bottoms.",
      "Let them soak: Leave for 1 minute, until a biscuit breaks apart easily when you press it with a spoon. Leave them longer if you like them very soft.",
      "Serve: Spoon the berries on top and eat straight away, before the biscuits go soggy.",
    ],
  },
  {
    id: "shakshuka", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Shakshuka", blurb: "Eggs baked in a spiced tomato and pepper sauce.", servings: 2, minutes: 35,
    // 2026-11-21 (founder: "Nothing should be plain, these should all be chef made meals"): 5 ml more oil so the onion and pepper cook soft and sweet, salt in the
    // sauce and black pepper over the eggs
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): the onion is in soft slices in the photo
    ingredients: [ing("eggs", 240, { role: "other", note: "about 4 eggs" }), ing("chopped-tomatoes", 400), ing("onion", 150, { note: "about 1 onion" }), ing("peppers", 160, { note: "about 1 pepper" }), ing("garlic", 5, { note: "about 1 clove" }), ing("cumin", 2), ing("paprika", 2), ing("vegetable-oil", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Cut the onion and pepper: Peel the onion, halve it and slice it into thin half-moons. Cut the pepper in half, scoop out the seeds and white inside, and chop it into pieces about 1 cm across.",
      "Soften the onion and pepper: Heat the oil in a large, deep non-stick frying pan over a medium heat. Add the onion and pepper and fry for 8 to 10 minutes, stirring now and then, until soft and sweet but not brown.",
      "Add the garlic and spices: Stir in the garlic purée, cumin and paprika. Cook for 1 minute, stirring all the time so the spices don't catch, until you can smell them.",
      "Add the tomatoes: Pour in the chopped tomatoes, add the salt and stir well. Cook on a medium heat for 2 to 3 minutes, stirring now and then, until bubbling all over.",
      "Simmer the sauce: Turn the heat down low and simmer gently for 8 to 10 minutes, stirring now and then, until thick enough to leave a trail when you drag the spoon through. Add a splash of water if it sticks.",
      "Add the eggs: Press a small hollow in the sauce for each egg with the back of the spoon. Crack each egg into a cup, then slide it gently into a hollow. Wash your hands after handling raw eggs.",
      "Cook the eggs: Cover with a lid or a flat plate and cook on a low heat for 6 to 8 minutes, until the whites are completely set and the yolks still soft. Cook 2 minutes more for firmer yolks. Lift the lid away from you.",
      "Serve: Take the pan off the heat and sprinkle the black pepper over the eggs. Spoon the eggs and sauce on to warm plates, or stand the pan on a heatproof mat on the table. Serve straight away.",
    ],
  },
  {
    id: "beans-poached-eggs", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Baked beans with poached eggs", blurb: "Warm beans topped with soft poached eggs.", servings: 2, minutes: 12,
    ingredients: [ing("baked-beans", 400, { role: "carb" }), ing("eggs", 240, { note: "about 4 eggs" }), ing("black-pepper", 1), ing("spinach", 30)],
    method: [
      "Get ready: Boil the kettle. Rinse the spinach unless the bag says it is ready washed, pull off any tough stalks and tear very large leaves smaller.",
      "Warm the beans: Tip the beans into a small saucepan and warm them on a medium heat for 3 to 4 minutes, stirring now and then, until bubbling and steaming hot.",
      "Heat the water: Pour hot water from the kettle into a wide, deep frying pan to about 3 cm deep and put it on a medium heat. When small bubbles rise, turn it down low so it simmers gently, never boiling hard.",
      "Add the spinach: Turn the beans down low, stir in the spinach and a pinch of black pepper and cook for 1 to 2 minutes, until wilted. Take them off the heat and cover with a lid.",
      "Add the eggs: Crack each egg into a cup, hold it close to the water and slide it in gently, spacing them well apart. Wash your hands after handling raw eggs.",
      "Poach the eggs: Poach for 3 to 4 minutes without stirring, until the whites are completely set with no runny white left and the yolks are still soft. Cook 1 to 2 minutes more for firmer yolks.",
      "Drain the eggs: Lift each egg out with a slotted spoon and rest the spoon on kitchen paper for a few seconds to soak up the water.",
      "Serve: Spoon the beans and spinach into warm bowls, warming them again first if they have cooled. Lay the eggs on top and serve straight away.",
    ],
  },
  {
    id: "ham-cheese-omelette", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Ham and cheese omelette", blurb: "A folded omelette with ham and melting cheddar.", servings: 1, minutes: 10,
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): golden brown on the outside, as in the photo
    ingredients: [ing("eggs", 180, { note: "about 3 eggs" }), ing("ham", 50), ing("cheddar", 25), ing("black-pepper", 1), ing("oil-spray", 1)],
    method: [
      "Prepare the filling: Grate the cheddar on to a plate. Tear the ham into pieces about 2 cm across and put them beside the cheese.",
      "Beat the eggs: Crack the eggs into a bowl, add a pinch of black pepper and a splash of water and beat with a fork for 30 seconds, until fully mixed. Wash your hands after handling raw eggs.",
      "Heat the pan: Spray a small non-stick frying pan, about 20 cm across, with the oil spray, away from any flame. Heat it on a medium heat for 1 to 2 minutes, until hot.",
      "Cook the omelette: Pour in the eggs. After the first 20 seconds, pull the set edges into the middle and tilt the pan so runny egg fills the gaps. Then leave it alone for 1 to 2 minutes, until almost set on top and golden brown underneath.",
      "Add the filling: Turn the heat down low. Scatter the cheese and ham over one half of the omelette, leaving a gap round the edge.",
      "Fold and finish: Cook for 30 seconds, then fold the empty half over the filling and cook for 1 minute more, until the cheese melts. Cut a small slit in the middle to check: the egg should be completely set and the ham piping hot.",
      "Serve: Slide the omelette on to a warm plate, golden side up, and serve straight away, while the cheese is still melted.",
    ],
  },
  {
    id: "mushroom-bean-breakfast-wraps", meal: "breakfast", tags: ["Vegan", "Brunch"], name: "Mushroom and bean breakfast wraps", blurb: "Garlic mushrooms, spinach and baked beans in a warm wrap.", servings: 2, minutes: 15,
    // 2026-11-21: oil kept at 5 ml (10 ml took it out of Low fat); a hot non-stick pan, one layer and no stirring brown the mushrooms, as the picture shows
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): thick mushroom slices, and the wraps toasted to brown spots, as in the photo
    ingredients: [ing("baked-beans", 400), ing("mushrooms", 250), ing("wraps", 120), ing("spinach", 60), ing("garlic", 5, { note: "about 1 clove" }), ing("black-pepper", 1), ing("vegetable-oil", 5)],
    method: [
      "Get ready: Wipe the mushrooms clean, trim the dry stalk ends and slice them thickly, about 1 cm. Rinse the spinach, shake it dry and tear any big leaves in half.",
      "Fry the mushrooms: Heat a large non-stick frying pan over a high heat, then add the oil. Add the mushrooms in one layer (two batches if your pan is small) and leave them for 2 minutes without stirring.",
      "Brown the mushrooms: Fry for 3 to 4 minutes more, stirring now and then, until their liquid has gone and they are golden brown.",
      "Warm the beans: Meanwhile, warm the beans in a small saucepan on a medium heat for 4 to 5 minutes, stirring now and then, until bubbling and steaming hot. Take them off the heat and cover.",
      "Add the garlic: Stir the garlic purée into the mushrooms and cook for 30 seconds, stirring all the time so it doesn't burn.",
      "Wilt the spinach: Add the spinach a handful at a time and cook for 1 to 2 minutes, until soft and dark green. Season with black pepper, then tip into a bowl and cover to keep hot.",
      "Warm the wraps: Wipe out the frying pan and put it back on a medium heat. Warm the wraps one at a time for about 20 seconds on each side, then cover them with a clean tea towel.",
      "Fill the wraps: Lay the wraps flat. Spoon the beans down the middle, leaving about 3 cm clear at the top and bottom, and pile the mushrooms and spinach on top.",
      "Roll them up: Fold up the bottom of each wrap, fold in the sides and roll it up tightly.",
      "Toast and serve: Toast the wraps join side down in the dry pan on a medium heat for 1 to 2 minutes a side, until golden brown in spots. Cut each in half and serve straight away.",
    ],
  },
  {
    id: "oat-pancakes", meal: "breakfast", tags: ["Brunch"], name: "Oat pancakes with yogurt and berries", blurb: "Fluffy pancakes made from blended oats, eggs and milk.", servings: 2, minutes: 20,
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): whole oats show in the photo's pancakes, about 10 cm across
    ingredients: [ing("oats", 100), ing("eggs", 120, { note: "about 2 eggs", follows: "oats" }), ing("milk", 100, { follows: "oats" }), ing("greek-yogurt", 150, { role: "protein" }), ing("berries", 120), ing("cinnamon", 1), ing("oil-spray", 1)],
    method: [
      "Blend the batter: Keep a small handful of the oats to one side. Blend the eggs, the rest of the oats, the milk and the cinnamon for 30 to 60 seconds, until smooth. Stir in the oats you kept. Wash your hands after handling raw eggs.",
      "Rest the batter: Pour it into a jug and leave it for 5 minutes to thicken. It should fall off a spoon in a slow stream. Stir in a splash of milk if it is too thick.",
      "Get the toppings ready: Stir the yogurt in a small bowl until smooth. Thaw frozen berries in a sieve under the cold tap for a minute, or rinse fresh ones.",
      "Heat the pan: Spray a large non-stick frying pan with the oil spray while it is cold, away from any flame. Heat it on a medium heat for 1 to 2 minutes, until a drop of batter sizzles gently.",
      "Cook the first side: Stir the batter, then pour in spoonfuls to make pancakes about 10 cm across, spaced apart. Cook for about 2 minutes, until bubbles appear, the edges look set and the underside is golden.",
      "Flip the pancakes: Turn them over with a fish slice and cook for 1 to 2 minutes more, until golden and cooked through. The middle should spring back when pressed, with no wet batter. Cut the first one open to check.",
      "Cook the rest: Keep the cooked pancakes warm under a clean tea towel. Take the pan off the heat, spray it again away from any flame, then cook the rest of the batter the same way.",
      "Serve: Stack the pancakes on warm plates, spoon the yogurt on top and scatter the berries over. Serve straight away.",
    ],
  },
  {
    // lunch, not breakfast (founder 2026-11-20, as for kedgeree)
    id: "huevos-rancheros", meal: "lunch", tags: ["Eggs", "Brunch"], name: "Huevos rancheros", blurb: "Fried eggs on warm wraps with crushed beans and salsa.", servings: 2, minutes: 20,
    // 2026-11-21 (founder: "Nothing should be plain"): garlic with the cumin in the beans, and black pepper on the eggs
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): mostly crushed beans, a spotted wrap and fried eggs with crisp golden edges, as in the photo
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("kidney-beans", 240), ing("salsa", 100), ing("wraps", 120), ing("cumin", 1), ing("oil-spray", 1), ing("garlic", 5, { note: "about 1 clove" }), ing("black-pepper", 1)],
    method: [
      "Drain the beans: Drain the kidney beans in a sieve, rinse them under cold water and leave them for a minute to drain well.",
      "Warm the beans: Tip the beans into a small saucepan with the garlic, cumin and a splash of water. Warm them on a medium heat for 3 to 4 minutes, stirring now and then, until steaming hot and smelling of the spices.",
      "Crush the beans: Take the pan off the heat and roughly crush most of the beans with a fork. Add another splash of water if it looks dry, then put a lid on.",
      "Warm the wraps: Warm the wraps one at a time in a large dry non-stick frying pan on a medium heat, for 30 to 40 seconds a side, until they have a few brown spots. Wrap them in a clean tea towel.",
      "Add the eggs: Take the pan off the heat, spray it with the oil spray away from any flame and put it back on a medium-high heat. Crack each egg into a cup, then slide it into the pan. Wash your hands after handling raw eggs.",
      "Fry the eggs: Sprinkle the black pepper over the eggs and fry for 3 to 4 minutes, until the whites are completely set and the edges crisp and golden. If the tops are still clear, cover the pan for 30 to 60 seconds.",
      "Serve: Lay the wraps on warm plates, spread the crushed beans over the middle, slide the eggs on top and spoon the salsa over. Serve straight away.",
    ],
  },
  {
    id: "bircher-muesli", meal: "breakfast", tags: ["Make ahead", "Vegan"], name: "Apple Bircher muesli", blurb: "Oats soaked overnight in oat drink with grated apple and almonds.", servings: 2, minutes: 10,
    ingredients: [ing("oats", 100), ing("oat-drink", 250, { follows: "oats" }), ing("almonds", 20), ing("raisins", 20), ing("apple", 150, { note: "about 1 apple" }), ing("lemon-juice", 10), ing("cinnamon", 1)],
    method: [
      "Grate the apple: Wash the apple and grate it on the coarse side of a grater into a large bowl, skin and all, stopping at the core.",
      "Add the lemon: Stir the lemon juice into the apple straight away, so it doesn't turn brown.",
      "Mix it all together: Add the oats, oat drink, raisins and cinnamon and stir for about 30 seconds, until every oat is wet. It will look runny, but the oats soak up the liquid.",
      "Soak overnight: Cover the bowl and put it in the fridge overnight, or for at least 8 hours, until the oats are soft and the muesli is thick and creamy.",
      "Chop the almonds: In the morning, chop the almonds roughly, cutting each one into 3 or 4 pieces.",
      "Check the texture: Stir the muesli well. If it is too thick, stir in a splash more oat drink. If it is too runny, leave it for 5 minutes and stir again.",
      "Serve: Spoon the muesli into bowls, scatter the almonds over and eat it cold.",
    ],
  },
  {
    // a lunch since 2026-11-20 (founder: "you can't give someone ... kedgeree ... for, like, breakfast"): the recipe is unchanged
    id: "smoked-salmon-kedgeree", meal: "lunch", tags: ["Brunch"], name: "Smoked salmon kedgeree", blurb: "Curried rice with smoked salmon, peas and boiled eggs.", servings: 2, minutes: 30,
    // 2026-11-21 (founder: "Nothing should be plain"): black pepper through the rice, as kedgeree has
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): onion in soft slices, egg halves and ribbons of salmon laid on top, as in the photo
    ingredients: [ing("rice", 150), ing("smoked-salmon", 200), ing("eggs", 120, { note: "about 2 eggs" }), ing("peas", 100), ing("onion", 150, { note: "about 1 onion" }), ing("curry-powder", 3), ing("lemon-juice", 10), ing("vegetable-oil", 5), ing("black-pepper", 1)],
    method: [
      "Get ready: Peel the onion, halve it and slice it into thin half-moons. Tear the smoked salmon into strips about as wide as your finger and keep them in the fridge.",
      "Boil the eggs: Bring a small pan of water to the boil. Lower in the eggs, turn the heat to medium and boil for 8 to 9 minutes, until the whites and yolks are completely set. Wash your hands after handling raw eggs.",
      "Cook the rice: At the same time, half-fill a large saucepan with boiling water from the kettle and bring it back to the boil. Add the rice and cook as the pack says, usually 10 to 15 minutes, stirring now and then.",
      "Fry the onion: Meanwhile, heat the oil in a large frying pan over a medium heat and fry the onion for 5 to 8 minutes, until soft but not brown. Stir in the curry powder for 1 minute, until you can smell it. Take off the heat.",
      "Peel the eggs: Pour off the hot water and run cold water over the eggs for 2 minutes. Crack and peel them, then cut each in half lengthways.",
      "Add the peas: When the rice has 3 minutes left, add the frozen peas and bring back to the boil. Cook until the rice is soft with no hard white middle, then drain and fluff it up with a fork.",
      "Mix and heat: Tip the rice and peas into the onion pan with the black pepper. Stir on a medium heat for 2 to 3 minutes, until piping hot and every grain is tinted golden by the curry powder.",
      "Serve: Take the pan off the heat and stir in the lemon juice. Spoon the rice into warm bowls, lay the smoked salmon ribbons and egg halves on top and serve straight away.",
    ],
  },
  {
    id: "bean-potato-hash", meal: "breakfast", tags: ["Vegan", "Brunch"], name: "Bean and potato hash", blurb: "Crispy potatoes, peppers and kidney beans with tomato salsa.", servings: 2, minutes: 20,
    // 2026-11-21 (founder: "Nothing should be plain"): the spices toasted on their own for 30 seconds and black pepper at the end (no salt or garlic purée: the
    // salsa brings the salt, and the dish stays a Lower salt and Longevity meal)
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): onion wedges and bigger pieces of pepper, as in the photo
    ingredients: [ing("new-potatoes", 300), ing("kidney-beans", 240), ing("salsa", 100), ing("olive-oil", 10), ing("peppers", 160, { note: "about 1 pepper" }), ing("onion", 150, { note: "about 1 onion" }), ing("cumin", 2), ing("paprika", 2), ing("black-pepper", 1)],
    method: [
      "Prepare the potatoes: Drain the potatoes and pat them dry with kitchen paper so they brown well. Cut each in half, or into quarters if large. They are already cooked.",
      "Drain the beans: Drain the kidney beans in a sieve, rinse them under cold water and leave them to drain.",
      "Cut the onion and pepper: Peel the onion and cut it into thin wedges. Cut the pepper in half, scoop out the seeds and white parts, and cut it into pieces about 2 cm across.",
      "Brown the potatoes: Heat the oil in a large non-stick frying pan on a medium-high heat. Add the potatoes cut side down in a single layer and leave them for 4 minutes, until golden underneath.",
      "Crisp the potatoes: Turn them over and fry for 4 to 6 minutes more, turning now and then, until golden brown and crisp at the edges. Turn the heat down a little if they stick.",
      "Add the vegetables: Stir in the onion and pepper and cook for 3 to 4 minutes, stirring often, until the onion softens and the pepper is just tender and browned in places.",
      "Add the spices: Stir in the cumin and paprika for 30 seconds, until everything is dusted orange-brown and smells toasty.",
      "Add the beans: Stir in the beans gently and cook for 2 to 3 minutes, until everything is steaming hot. Add a splash of water if the pan looks dry. Season with the black pepper.",
      "Serve: Take the pan off the heat, spoon the hash on to warm plates and top with the salsa. Serve straight away.",
    ],
  },
];
