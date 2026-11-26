import { ing, type Recipe } from "../recipes";
import type { CuisineId, OccasionId } from "./niches";

// Wave 2 (founder 2026-11-26: "it needs to suit literally everyone ... a professional footballer ... someone who does rugby might need more ... make the best
// diet plan for like each individual"; docs/RECIPE_PERSONAS_2026-11-26.md): big breakfasts that scale for athletes, pre-training breakfasts, and breakfasts for the diets with the fewest.
// Every ingredient is an everyday kind or one of the protein kinds a small shop stocks (tofu, Quorn, soya drink: lib/mm/localRangeProtein.ts); see
// lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const WAVE2_BREAKFASTS: readonly Recipe[] = [
  // ---- big breakfasts for athletes' days: most of the calories in the protein and carb ingredients, so they double to a rugby player's meal
  {
    id: "full-english-fried-rice", meal: "breakfast", tags: ["Savoury", "One pan", "Eggs"], name: "Full English fried rice", blurb: "Rice fried with bacon, mushrooms, cherry tomatoes and scrambled egg, finished with spring onions.", servings: 2, minutes: 25,
    ingredients: [ing("rice", 200, { note: "uncooked" }), ing("bacon", 160), ing("eggs", 240, { note: "about 4 eggs" }), ing("mushrooms", 150), ing("cherry-tomatoes", 150), ing("spring-onions", 40), ing("paprika", 2), ing("vegetable-oil", 15), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Simmer it in a large pan of boiling water for 10 to 12 minutes, until tender, then drain it well and spread it out on a plate to dry.",
      "Get ready: Slice the mushrooms, halve the cherry tomatoes and trim and slice the spring onions. Cut the bacon into strips about 1 cm wide. Wash your hands after touching raw bacon.",
      "Fry the bacon: Heat half the oil in a large frying pan or wok over a medium-high heat. Fry the bacon for 4 to 5 minutes, stirring, until golden and cooked through.",
      "Add the mushrooms: Add the mushrooms and paprika and fry for 3 minutes, until the mushrooms are soft and golden.",
      "Fry the rice: Add the rest of the oil and the rice and stir-fry for 3 to 4 minutes, until the rice is piping hot all the way through.",
      "Add the eggs: Push the rice to one side and crack the eggs into the space. Stir them for 1 to 2 minutes until set, then mix them through the rice. Wash your hands after touching raw eggs.",
      "Finish and serve: Stir in the tomatoes and most of the spring onions for 1 minute. Season with black pepper, spoon into bowls and scatter over the rest of the spring onions.",
    ],
  },
  {
    id: "banana-raisin-porridge-yogurt", meal: "breakfast", tags: ["Sweet", "Porridge", "Quick"], name: "Banana and raisin porridge with yogurt", blurb: "Big bowls of oats cooked in milk with mashed banana and raisins, topped with thick yogurt and sliced banana.", servings: 2, minutes: 10,
    // the milk and banana cook into the oats, so they follow the oats when the porridge is fitted; the yogurt on top carries the protein
    ingredients: [ing("oats", 180), ing("milk", 600, { follows: "oats" }), ing("banana", 240, { note: "about 2 bananas", follows: "oats" }), ing("raisins", 40), ing("cinnamon", 2), ing("greek-yogurt", 300, { role: "protein" })],
    method: [
      "Prepare the bananas: Peel the bananas. Mash one in a bowl with a fork and slice the other into rounds for the top.",
      "Start the porridge: Put the oats, milk, mashed banana, raisins and most of the cinnamon in a medium saucepan and stir well.",
      "Cook: Bring to a gentle bubble over a medium heat, then turn the heat down and cook for 4 to 5 minutes, stirring often, until thick and creamy. Add a splash of water if it gets too thick.",
      "Add the yogurt: Spoon the porridge into bowls and top each with a big spoonful of yogurt.",
      "Serve: Lay the banana slices on top, dust with the rest of the cinnamon and eat straight away.",
    ],
  },
  {
    id: "ham-egg-cheese-breakfast-bake", meal: "breakfast", tags: ["Savoury", "Bake", "Eggs", "Make ahead"], name: "Ham, egg and cheese breakfast bake", blurb: "Cubes of wholemeal bread soaked in a mustardy egg custard with ham, cherry tomatoes and cheddar, baked until puffed and golden.", servings: 4, minutes: 60,
    // the milk makes the custard with the eggs, so it follows them when the bake is fitted
    ingredients: [ing("bread", 600, { note: "about 15 slices" }), ing("ham", 160), ing("eggs", 360, { note: "about 6 eggs" }), ing("milk", 400, { follows: "eggs" }), ing("cheddar", 80), ing("cherry-tomatoes", 150), ing("spring-onions", 40), ing("mustard", 5), ing("oil-spray", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 190°C (170°C fan, gas 5). Spray a baking dish about 20 by 30 cm with oil.",
      "Cut the bread: Cut the bread into cubes about 3 cm across, crusts and all. Spread half of them over the dish.",
      "Add the filling: Tear the ham into pieces, halve the cherry tomatoes and slice the spring onions. Scatter them over the bread with half the cheddar, then cover with the rest of the bread.",
      "Make the custard: Whisk the eggs, milk, mustard and some black pepper in a large jug until smooth. Wash your hands after touching raw eggs.",
      "Soak the bread: Pour the egg mixture slowly over the bread, pressing it down with the back of a spoon so every piece soaks some up. Leave it for 10 minutes.",
      "Bake: Scatter the rest of the cheddar over the top. Bake on the middle shelf for 30 to 35 minutes, until puffed, golden and set in the middle.",
      "Check and serve: Push a knife into the middle: it should come out with no runny egg. Leave the bake for 5 minutes, then cut it into squares and serve warm.",
    ],
  },
  {
    id: "smoked-salmon-poached-eggs-soft-cheese-toast", meal: "breakfast", tags: ["Savoury", "Eggs", "Fish", "Brunch", "Quick"], name: "Smoked salmon and poached eggs on soft cheese toast", blurb: "Thick wholemeal toast spread with soft cheese, topped with smoked salmon, lemon and soft poached eggs.", servings: 2, minutes: 15,
    ingredients: [ing("bread", 320, { note: "about 8 slices" }), ing("soft-cheese", 60), ing("smoked-salmon", 100), ing("eggs", 240, { note: "about 4 eggs" }), ing("lemon-juice", 5), ing("black-pepper", 1)],
    method: [
      "Heat the water: Half fill a wide saucepan with water from the kettle and bring it to a gentle simmer over a medium heat, with small bubbles just rising.",
      "Poach the eggs: Crack each egg into a cup and slide it gently into the water. Cook for 3 to 4 minutes, until the whites are set and the yolks still soft. Wash your hands after touching raw eggs.",
      "Toast the bread: While the eggs cook, toast the bread until golden on both sides.",
      "Spread the toast: Spread the soft cheese over the hot toast.",
      "Add the salmon: Lay the smoked salmon over the toast and sprinkle over the lemon juice.",
      "Serve: Lift the eggs out with a slotted spoon, let them drain for a moment and sit them on the salmon. Finish with black pepper and serve straight away.",
    ],
  },
  {
    id: "bacon-egg-mushroom-breakfast-sandwiches", meal: "breakfast", tags: ["Savoury", "Eggs", "Quick", "British"], name: "Bacon, egg and mushroom breakfast sandwiches", blurb: "Grilled bacon, golden mushrooms and a fried egg between slices of wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("bread", 320, { note: "about 8 slices" }), ing("bacon", 120), ing("mushrooms", 150), ing("eggs", 240, { note: "about 4 eggs" }), ing("oil-spray", 1), ing("black-pepper", 1)],
    method: [
      "Heat the grill: Turn the grill on to high and line the grill pan with foil.",
      "Grill the bacon: Lay the bacon on the rack and grill for 3 to 4 minutes a side, until golden and cooked through. Wash your hands after touching raw bacon.",
      "Fry the mushrooms: While the bacon cooks, spray a large non-stick frying pan with oil and fry the mushrooms over a medium-high heat for 4 to 5 minutes, until golden. Tip them onto a plate.",
      "Fry the eggs: Spray the pan again and turn the heat to medium. Crack in the eggs and fry for 3 to 4 minutes, until the whites are set. Wash your hands after touching raw eggs.",
      "Toast the bread: Toast the bread until golden on both sides.",
      "Build the sandwiches: Lay the bacon, mushrooms and a fried egg on half the toast, add black pepper and top with the rest of the toast. Cut in half and serve hot.",
    ],
  },
  {
    id: "tofu-bean-mushroom-fry-up", meal: "breakfast", tags: ["Vegan", "Savoury", "Quick"], name: "Tofu, bean and mushroom fry-up with toast", blurb: "Golden slices of paprika tofu with mushrooms, cherry tomatoes, baked beans and wholemeal toast.", servings: 2, minutes: 20,
    // the beans are the plate's second carb: they move with the toast, no more than half as much again
    ingredients: [ing("tofu", 280), ing("soy", 10), ing("paprika", 2), ing("turmeric", 1), ing("olive-oil", 15), ing("mushrooms", 150), ing("cherry-tomatoes", 150), ing("baked-beans", 400, { role: "carb", fit: [0.5, 1.5] }), ing("bread", 240, { note: "about 6 slices" }), ing("black-pepper", 1)],
    method: [
      "Slice the tofu: Drain the tofu, pat it dry with kitchen paper and cut it into slices about 1 cm thick.",
      "Season the tofu: Mix the soy sauce, paprika and turmeric on a plate and turn the tofu slices in it to coat both sides.",
      "Fry the tofu: Heat half the oil in a large frying pan over a medium-high heat. Fry the tofu for 3 to 4 minutes a side, until golden and crisp at the edges, then move it to a warm plate.",
      "Fry the mushrooms: Halve the cherry tomatoes. Add the rest of the oil, the mushrooms and the tomatoes to the pan and fry for 4 to 5 minutes, until the mushrooms are golden.",
      "Warm the beans: Meanwhile, warm the beans in a small saucepan over a low heat for 3 to 4 minutes, stirring, until bubbling.",
      "Toast the bread: Toast the bread until golden on both sides.",
      "Serve: Share the tofu, mushrooms, tomatoes, beans and toast between plates, add black pepper and serve hot.",
    ],
  },
  {
    id: "breakfast-burrito-bowl-eggs-beans", meal: "breakfast", tags: ["Savoury", "Eggs", "Bowl", "Mexican"], name: "Breakfast burrito bowl with eggs and beans", blurb: "Cumin rice with soft scrambled eggs, warm kidney beans, peppers, salsa and spring onions.", servings: 2, minutes: 30,
    ingredients: [ing("rice", 200, { note: "uncooked" }), ing("eggs", 360, { note: "about 6 eggs" }), ing("kidney-beans", 240), ing("peppers", 160, { note: "about 1 pepper" }), ing("salsa", 120), ing("spring-onions", 30), ing("cumin", 2), ing("olive-oil", 10), ing("salt", 1)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Simmer it in a large pan of boiling water for 10 to 12 minutes, until tender, then drain it and stir in half the cumin and a pinch of salt.",
      "Get ready: Rinse and drain the beans. Cut the pepper in half, scoop out the seeds and white inside and cut it into small pieces. Trim and slice the spring onions.",
      "Cook the pepper and beans: Heat half the oil in a large frying pan over a medium heat. Fry the pepper for 4 minutes, then add the beans and the rest of the cumin and cook for 2 minutes, until hot. Tip onto a plate.",
      "Beat the eggs: Crack the eggs into a jug and beat them with a fork. Wash your hands after touching raw eggs.",
      "Scramble the eggs: Add the rest of the oil to the pan and turn the heat to medium-low. Pour in the eggs and stir slowly for 3 to 4 minutes, until softly set with no runny egg left.",
      "Serve: Spoon the rice into bowls and top with the beans and pepper, the eggs, a spoonful of salsa and the spring onions.",
    ],
  },

  // ---- before training: carbs at least half the calories (endurance athletes, footballers on match days)
  {
    id: "apple-berry-breakfast-crumble-yogurt", meal: "breakfast", tags: ["Sweet", "Bake", "British"], name: "Apple and berry breakfast crumble with yogurt", blurb: "Soft baked apples and berries under a crunchy honey and cinnamon oat topping, with cold yogurt.", servings: 2, minutes: 35,
    // the fruit goes with the oat topping, so the crumble keeps its balance when it is fitted
    ingredients: [ing("apple", 300, { note: "about 2 apples", follows: "oats" }), ing("berries", 200), ing("oats", 120), ing("honey", 30), ing("vegetable-oil", 20), ing("cinnamon", 2), ing("greek-yogurt", 400, { role: "protein" })],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6).",
      "Prepare the fruit: Cut the apples into quarters, cut out the cores and chop them into small pieces. Mix them with the berries and half the cinnamon in a small baking dish.",
      "Make the topping: Stir the oats, honey, oil and the rest of the cinnamon together in a bowl until every oat is coated.",
      "Top the fruit: Scatter the oat mixture evenly over the fruit and press it down lightly.",
      "Bake: Bake on the middle shelf for 20 to 25 minutes, until the topping is golden and crisp and the fruit is bubbling at the edges.",
      "Serve: Leave it for 5 minutes, as the fruit is very hot, then spoon it into bowls with the yogurt.",
    ],
  },
  {
    id: "banana-oat-tofu-pancakes-cinnamon-apple", meal: "breakfast", tags: ["Vegan", "Sweet", "Pancakes"], name: "Banana, oat and tofu pancakes with cinnamon apple", blurb: "Egg-free pancakes of blended oats, banana, tofu and soya drink, topped with soft cinnamon apple.", servings: 2, minutes: 25,
    // the banana and soya drink make the batter with the oats, so they follow the oats when the recipe is fitted; the tofu binds it in place of egg
    ingredients: [ing("oats", 160), ing("banana", 240, { note: "about 2 bananas", follows: "oats" }), ing("soya-drink", 200, { follows: "oats" }), ing("tofu", 150), ing("cinnamon", 2), ing("vegetable-oil", 10), ing("apple", 150, { note: "about 1 apple" })],
    method: [
      "Make the batter: Peel the bananas. Drain the tofu and break it into pieces. Blend the bananas, tofu, oats, soya drink and half the cinnamon in a blender or tall jug for about 1 minute, until smooth.",
      "Rest the batter: Leave it for 10 minutes, so the oats soak up the soya drink and the batter thickens.",
      "Cook the apple: Core and thinly slice the apple. Fry it in a little of the oil in a large non-stick frying pan over a medium heat for 3 to 4 minutes, until soft. Dust with the rest of the cinnamon and set aside.",
      "Cook the pancakes: Wipe the pan, add a little more oil and pour in small rounds of batter, about 2 tablespoons each. Cook for 2 to 3 minutes, until bubbles appear and the edges look dry.",
      "Flip them: Turn them over carefully and cook for 2 minutes more, until golden and cooked through. Keep them warm while you cook the rest, adding the last of the oil.",
      "Serve: Stack the pancakes on plates and spoon the warm cinnamon apple over the top.",
    ],
  },
  {
    id: "peanut-butter-banana-stuffed-french-toast", meal: "breakfast", tags: ["Sweet", "Pancakes", "Eggs", "Quick"], name: "Peanut butter and banana stuffed French toast", blurb: "Peanut butter and banana sandwiches dipped in cinnamon egg and fried until golden, with honey and yogurt.", servings: 2, minutes: 20,
    // the banana fills the bread and the milk makes the batter with the eggs, so each follows its partner when the recipe is fitted
    ingredients: [ing("bread", 320, { note: "about 8 slices" }), ing("peanut-butter", 40), ing("banana", 120, { note: "about 1 banana", follows: "bread" }), ing("eggs", 120, { note: "about 2 eggs" }), ing("milk", 100, { follows: "eggs" }), ing("cinnamon", 1), ing("oil-spray", 1), ing("honey", 30), ing("greek-yogurt", 150, { role: "protein" })],
    method: [
      "Make the sandwiches: Peel and slice the banana. Spread the peanut butter over half the bread, lay the banana on top and close each with another slice, pressing down gently.",
      "Make the egg mix: Beat the eggs, milk and cinnamon in a wide, shallow dish with a fork. Wash your hands after touching raw eggs.",
      "Dip the sandwiches: Dip each sandwich into the egg mix for about 10 seconds a side, until soaked but not falling apart.",
      "Fry: Spray a large non-stick frying pan with oil and heat it over a medium heat. Fry the sandwiches for 2 to 3 minutes a side, in batches, until golden and the egg is set.",
      "Serve: Cut each sandwich in half, drizzle with the honey and serve with a spoonful of yogurt.",
    ],
  },

  // ---- vegan breakfasts (two with no soya, two cheap ones)
  {
    id: "bombay-potato-chickpea-breakfast-hash", meal: "breakfast", tags: ["Vegan", "Savoury", "One pan", "Indian"], name: "Bombay potato and chickpea breakfast hash", blurb: "Crisp new potatoes and chickpeas fried with onion, cumin and turmeric, with tomatoes, spinach and lemon.", servings: 2, minutes: 25,
    ingredients: [ing("new-potatoes", 600), ing("chickpeas", 480), ing("onion", 150, { note: "about 1 onion" }), ing("cherry-tomatoes", 150), ing("spinach", 100), ing("cumin", 2), ing("turmeric", 1), ing("paprika", 2), ing("vegetable-oil", 20), ing("lemon-juice", 10), ing("salt", 1)],
    method: [
      "Drain the tins: Tip the potatoes and chickpeas into a colander, rinse them under the cold tap and shake them dry. Cut the potatoes into quarters.",
      "Prepare the onion: Peel the onion, cut it in half and slice it thinly. Halve the cherry tomatoes.",
      "Fry the potatoes: Heat the oil in a large frying pan over a medium-high heat. Fry the potatoes and onion for 10 minutes, turning now and then, until the potatoes are golden and crisp at the edges.",
      "Add the spices: Stir in the cumin, turmeric, paprika and a pinch of salt and cook for 1 minute, until they smell toasty.",
      "Add the chickpeas: Add the chickpeas and tomatoes and fry for 4 to 5 minutes, stirring, until the chickpeas are hot and the tomatoes soft.",
      "Wilt the spinach: Stir in the spinach a handful at a time until it wilts, then take the pan off the heat and stir in the lemon juice.",
      "Serve: Spoon the hash into warm bowls and serve straight away.",
    ],
  },
  {
    id: "bean-sweetcorn-pepper-breakfast-burritos", meal: "breakfast", tags: ["Vegan", "Savoury", "Quick", "Mexican"], name: "Bean, sweetcorn and pepper breakfast burritos", blurb: "Warm wraps rolled around cumin kidney beans, sweetcorn, soft peppers, spinach and salsa.", servings: 2, minutes: 15,
    ingredients: [ing("wraps", 240, { note: "about 4 wraps" }), ing("kidney-beans", 360), ing("sweetcorn", 100), ing("peppers", 160, { note: "about 1 pepper" }), ing("spinach", 60), ing("salsa", 100), ing("cumin", 2), ing("paprika", 2), ing("olive-oil", 10)],
    method: [
      "Get ready: Rinse and drain the beans. Cut the pepper in half, scoop out the seeds and white inside and slice it into thin strips. Drain the sweetcorn if it is tinned.",
      "Soften the pepper: Heat the oil in a large frying pan over a medium heat and fry the pepper for 4 to 5 minutes, until soft.",
      "Add the beans: Add the beans, sweetcorn, cumin and paprika and cook for 3 to 4 minutes, stirring and crushing some of the beans with the back of a spoon, until hot.",
      "Wilt the spinach: Stir in the spinach and half the salsa for 1 minute, until the spinach wilts.",
      "Warm the wraps: Warm the wraps one at a time in a dry pan for about 20 seconds a side, so they fold without cracking.",
      "Fill and roll: Spoon the filling down the middle of each wrap and top with the rest of the salsa. Fold in the sides, roll up tightly, cut in half and serve.",
    ],
  },
  {
    id: "masala-beans-on-toast", meal: "breakfast", tags: ["Vegan", "Savoury", "Quick", "Indian"], name: "Masala beans on toast", blurb: "Baked beans simmered with spring onions, tomato, cumin, turmeric and paprika, spooned over wholemeal toast.", servings: 2, minutes: 10,
    // the beans carry the protein here: they move with it, no more than half as much again
    ingredients: [ing("baked-beans", 400, { role: "protein", fit: [0.5, 1.5] }), ing("bread", 240, { note: "about 6 slices" }), ing("tomatoes", 85, { note: "about 1 tomato" }), ing("spring-onions", 40), ing("cumin", 1), ing("turmeric", 1), ing("paprika", 1), ing("vegetable-oil", 10)],
    method: [
      "Get ready: Trim and thinly slice the spring onions. Chop the tomato into small pieces.",
      "Fry the spices: Heat the oil in a small saucepan over a medium heat. Add the spring onions, cumin, turmeric and paprika and stir for 1 minute, until they smell toasty.",
      "Add the tomato: Add the tomato and cook for 2 minutes, stirring, until it starts to soften.",
      "Add the beans: Tip in the beans, stir well and simmer for 3 to 4 minutes, stirring now and then, until bubbling and thick.",
      "Toast the bread: While the beans cook, toast the bread until golden on both sides.",
      "Serve: Put the toast on plates and spoon the masala beans over the top. Serve straight away.",
    ],
  },
  {
    id: "spinach-banana-tofu-green-smoothie", meal: "breakfast", tags: ["Vegan", "Sweet", "No cook", "Quick"], name: "Spinach, banana and tofu green smoothie", blurb: "A thick, bright green smoothie of tofu, spinach, banana and a spoonful of peanut butter blended with soya drink.", servings: 2, minutes: 5,
    // the soya drink goes with the tofu, so the smoothie keeps its thickness when it is fitted
    ingredients: [ing("tofu", 240), ing("soya-drink", 500, { follows: "tofu" }), ing("spinach", 60), ing("banana", 240, { note: "about 2 bananas", role: "carb" }), ing("peanut-butter", 20), ing("cinnamon", 1)],
    method: [
      "Get ready: Drain the tofu and break it into rough pieces. Peel the bananas and break them into chunks. Rinse the spinach.",
      "Blend the greens: Put the spinach and half the soya drink in a blender or tall jug and blend for about 30 seconds, until there are no leaves left.",
      "Add the rest: Add the tofu, banana, peanut butter, cinnamon and the rest of the soya drink and blend for about 1 minute, until completely smooth with no bits of tofu left.",
      "Check it: If it is too thick, add a splash of water and blend again.",
      "Serve: Pour into glasses and drink straight away, or cover it and keep it in the fridge until the next day, shaking it before drinking.",
    ],
  },
  {
    id: "tofu-chickpea-shakshuka-toast", meal: "breakfast", tags: ["Vegan", "Savoury", "One pan", "Middle Eastern"], name: "Tofu and chickpea shakshuka with toast", blurb: "Crumbled tofu and chickpeas in a thick spiced tomato and pepper sauce with spinach, with toast for dipping.", servings: 2, minutes: 25,
    ingredients: [ing("tofu", 280), ing("chickpeas", 240), ing("chopped-tomatoes", 400), ing("peppers", 160, { note: "about 1 pepper" }), ing("spinach", 60), ing("cumin", 2), ing("paprika", 2), ing("olive-oil", 15), ing("salt", 1), ing("black-pepper", 1), ing("bread", 160, { note: "about 4 slices" })],
    method: [
      "Get ready: Drain the tofu, pat it dry with kitchen paper and crumble it into large pieces. Rinse and drain the chickpeas. Cut the pepper in half, scoop out the seeds and slice it thinly.",
      "Soften the pepper: Heat the oil in a large frying pan over a medium heat. Fry the pepper for 5 minutes, stirring, until soft.",
      "Add the spices: Stir in the cumin and paprika and cook for 30 seconds, until they smell toasty.",
      "Make the sauce: Add the chopped tomatoes, chickpeas, a pinch of salt and some black pepper. Simmer for 8 to 10 minutes, stirring now and then, until thick.",
      "Add the tofu: Stir in the spinach until it wilts. Make hollows in the sauce, spoon the tofu into them, cover and cook for 5 minutes, until the tofu is hot through.",
      "Toast the bread: Toast the bread until golden on both sides.",
      "Serve: Spoon the shakshuka into bowls and serve with the toast for dipping.",
    ],
  },
  {
    id: "tofu-bhurji-peas-tomatoes-toast", meal: "breakfast", tags: ["Vegan", "Savoury", "Quick", "Indian"], name: "Tofu bhurji with peas and tomatoes on toast", blurb: "Indian-style scrambled tofu with cumin, turmeric, tomatoes and peas, on a slice of wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("tofu", 300), ing("tomatoes", 170, { note: "about 2 tomatoes" }), ing("peas", 100), ing("cumin", 2), ing("turmeric", 1), ing("paprika", 1), ing("olive-oil", 10), ing("lemon-juice", 5), ing("salt", 1), ing("bread", 80, { note: "about 2 slices" })],
    method: [
      "Get ready: Drain the tofu, pat it dry with kitchen paper and crumble it into small pieces with your fingers. Chop the tomatoes into small pieces.",
      "Fry the spices: Heat the oil in a large non-stick frying pan over a medium heat. Add the cumin and cook for 30 seconds, until it smells toasty.",
      "Cook the tomatoes: Add the tomatoes, turmeric, paprika and a pinch of salt and cook for 3 minutes, stirring, until soft.",
      "Add the tofu: Add the tofu and peas and cook for 5 minutes, stirring now and then, until the peas are tender and the tofu is hot and yellow all over.",
      "Toast the bread: While the tofu cooks, toast the bread until golden.",
      "Serve: Stir the lemon juice into the bhurji and spoon it over the toast. Serve straight away.",
    ],
  },

  {
    id: "spiced-tofu-chickpea-breakfast-kedgeree", meal: "breakfast", tags: ["Vegan", "Savoury", "One pan", "British"], name: "Spiced tofu and chickpea breakfast kedgeree", blurb: "Turmeric rice and peas tossed with golden fried tofu, cumin chickpeas, spinach and lemon.", servings: 2, minutes: 30,
    ingredients: [ing("rice", 200, { note: "uncooked" }), ing("turmeric", 2), ing("peas", 100), ing("tofu", 280), ing("chickpeas", 240), ing("vegetable-oil", 15), ing("cumin", 2), ing("paprika", 1), ing("salt", 1), ing("spinach", 80), ing("lemon-juice", 15), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Rinse the rice in a sieve. Simmer it in a large pan of boiling water with half the turmeric for 10 to 12 minutes, until tender, adding the peas for the last 2 minutes. Drain well.",
      "Get ready: Drain the tofu, pat it dry with kitchen paper and cut it into cubes about 2 cm across. Rinse and drain the chickpeas.",
      "Fry the tofu: Heat the oil in a large frying pan over a medium-high heat. Fry the tofu for 6 to 8 minutes, turning it, until golden on most sides.",
      "Add the spices: Add the cumin, paprika, the rest of the turmeric, the chickpeas and a pinch of salt and cook for 2 minutes, stirring, until the chickpeas are hot.",
      "Mix it together: Tip in the rice and peas and stir gently over the heat for 2 to 3 minutes, until everything is hot and yellow.",
      "Wilt the spinach: Stir in the spinach until it wilts, then take the pan off the heat and stir in the lemon juice and some black pepper.",
      "Serve: Spoon the kedgeree into warm bowls and serve straight away.",
    ],
  },
  // ---- no gluten: eggs, rice, potatoes, yogurt, fruit
  {
    id: "potato-pepper-spinach-hash-fried-eggs", meal: "breakfast", tags: ["Savoury", "Eggs", "One pan"], name: "Potato, pepper and spinach hash with fried eggs", blurb: "Crisp new potatoes fried with red pepper, red onion and paprika, with wilted spinach and fried eggs on top.", servings: 2, minutes: 25,
    ingredients: [ing("new-potatoes", 600), ing("eggs", 240, { note: "about 4 eggs" }), ing("peppers", 160, { note: "about 1 pepper" }), ing("red-onion", 150, { note: "about 1 red onion" }), ing("spinach", 80), ing("paprika", 2), ing("olive-oil", 20), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Drain the potatoes: Tip the potatoes into a colander, rinse them and shake them dry. Cut them into quarters.",
      "Prepare the vegetables: Cut the pepper in half, scoop out the seeds and white inside and cut it into small pieces. Peel the onion and cut it into thin wedges.",
      "Fry the potatoes: Heat most of the oil in a large frying pan over a medium-high heat. Fry the potatoes for 10 minutes, turning now and then, until golden and crisp at the edges.",
      "Add the pepper: Add the pepper, onion, paprika and a pinch of salt and black pepper and fry for 5 to 6 minutes, until the pepper and onion are soft.",
      "Wilt the spinach: Stir in the spinach until it wilts. Spoon the hash onto plates and keep it warm.",
      "Fry the eggs: Add the rest of the oil to the pan, crack in the eggs and fry for 3 to 4 minutes, until the whites are set and the edges golden. Wash your hands after touching raw eggs.",
      "Serve: Sit the eggs on top of the hash and serve straight away.",
    ],
  },
  {
    id: "yogurt-bowl-warm-cinnamon-apples-almonds", meal: "breakfast", tags: ["Sweet", "Quick"], name: "Yogurt bowl with warm cinnamon apples and almonds", blurb: "Apple slices softened with raisins and cinnamon, spooned warm over thick yogurt with chopped almonds.", servings: 2, minutes: 10,
    ingredients: [ing("apple", 300, { note: "about 2 apples", role: "carb" }), ing("raisins", 30), ing("cinnamon", 2), ing("greek-yogurt", 500, { role: "protein" }), ing("almonds", 30)],
    method: [
      "Slice the apples: Rinse the apples, cut them into quarters, cut out the cores and slice each quarter into thin wedges.",
      "Cook the apples: Put the apples, raisins, most of the cinnamon and 3 tablespoons of water in a small saucepan. Cover and cook over a medium heat for 5 to 6 minutes, stirring once or twice, until soft but still holding their shape.",
      "Chop the almonds: While the apples cook, chop the almonds roughly, cutting each one into three or four bits.",
      "Fill the bowls: Spoon the yogurt into bowls and make a dip in the middle of each with the back of the spoon.",
      "Serve: Spoon the warm apples and their juice over the yogurt, scatter over the almonds and dust with the rest of the cinnamon.",
    ],
  },
  {
    id: "chinese-style-rice-porridge-egg", meal: "breakfast", tags: ["Savoury", "Eggs", "Porridge", "Chinese"], name: "Chinese-style rice porridge with egg and spring onions", blurb: "Rice simmered slowly until soft and silky, with ribbons of egg, spinach and spring onions.", servings: 2, minutes: 45,
    ingredients: [ing("rice", 120), ing("salt", 1), ing("spring-onions", 40), ing("eggs", 240, { note: "about 4 eggs" }), ing("spinach", 80), ing("vegetable-oil", 5), ing("black-pepper", 1)],
    method: [
      "Rinse the rice: Rinse the rice in a sieve under the cold tap until the water runs almost clear.",
      "Simmer the rice: Put the rice in a large saucepan with 1500 ml of water and a pinch of salt. Bring to the boil, then turn the heat to low, half cover and simmer for 35 to 40 minutes, stirring now and then, until thick and creamy.",
      "Get ready: Trim and thinly slice the spring onions. Beat the eggs in a jug with a fork. Wash your hands after touching raw eggs.",
      "Add the spinach: Stir the spinach into the porridge until it wilts. Add a splash of water if it is too thick.",
      "Add the eggs: Pour the eggs into the porridge in a thin stream, stirring gently, and cook for 1 to 2 minutes, until they set in soft ribbons.",
      "Serve: Season with black pepper, spoon into bowls and scatter over the spring onions and a few drops of oil.",
    ],
  },

  // ---- Jain (no eggs, onion, garlic, roots, mushrooms or honey) and more for small days
  {
    id: "banana-cinnamon-lassi-smoothie", meal: "breakfast", tags: ["Sweet", "No cook", "Quick", "Indian"], name: "Banana and cinnamon lassi-style smoothie", blurb: "Thick yogurt and cold milk blended with ripe banana and cinnamon into a smooth, frothy drink.", servings: 2, minutes: 5,
    // the milk thins the yogurt, so it follows it when the smoothie is fitted
    ingredients: [ing("greek-yogurt", 400, { role: "protein" }), ing("milk", 300, { follows: "greek-yogurt" }), ing("banana", 240, { note: "about 2 bananas", role: "carb" }), ing("cinnamon", 1)],
    method: [
      "Prepare the bananas: Peel the bananas and break them into chunks. The riper they are, the sweeter the drink.",
      "Blend: Put the banana, yogurt, milk and most of the cinnamon in a blender or tall jug and blend for about 1 minute, until smooth and frothy.",
      "Check it: If it is too thick, add a splash of cold water and blend again.",
      "Make it colder: For a colder drink, add two or three ice cubes and blend for 10 seconds more.",
      "Serve: Pour into glasses, dust with the rest of the cinnamon and drink straight away.",
    ],
  },
  {
    id: "spiced-oat-spinach-pancakes-cucumber-yogurt", meal: "breakfast", tags: ["Savoury", "Pancakes", "Indian"], name: "Spiced oat and spinach pancakes with cucumber yogurt", blurb: "Thin savoury pancakes of blended oats, cumin, turmeric, spinach and tomato, with a cool cucumber yogurt.", servings: 2, minutes: 30,
    ingredients: [ing("oats", 160), ing("cumin", 2), ing("turmeric", 1), ing("salt", 1), ing("spinach", 80), ing("tomatoes", 85, { note: "about 1 tomato" }), ing("vegetable-oil", 15), ing("cucumber", 100), ing("greek-yogurt", 200, { role: "protein" })],
    method: [
      "Make the oat flour: Blend the oats in a blender for about 1 minute, until they look like coarse flour.",
      "Make the batter: Tip the oat flour into a bowl with most of the cumin, the turmeric and a pinch of salt. Whisk in about 250 ml of water until smooth and pourable, then leave it for 10 minutes to thicken.",
      "Add the vegetables: Chop the spinach and tomato finely and stir them into the batter.",
      "Make the cucumber yogurt: Grate the cucumber, squeeze out the water in your hands and stir it into the yogurt with the rest of the cumin.",
      "Cook the pancakes: Heat a little of the oil in a large non-stick frying pan over a medium heat. Pour in a ladle of batter and spread it into a thin round. Cook for 2 to 3 minutes, until golden underneath.",
      "Flip and finish: Turn it over and cook for 2 minutes more, until golden and cooked through. Keep it warm and cook the rest the same way, adding a little oil each time.",
      "Serve: Serve the pancakes warm with the cucumber yogurt.",
    ],
  },
  {
    id: "middle-eastern-breakfast-plate-eggs-houmous", meal: "breakfast", tags: ["Savoury", "Eggs", "Quick", "Middle Eastern"], name: "Middle Eastern-style breakfast plate with eggs and houmous", blurb: "Halved boiled eggs, houmous with paprika and olive oil, a lemony cucumber and tomato salad and warm toast.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("houmous", 120), ing("cucumber", 150), ing("cherry-tomatoes", 150), ing("olive-oil", 10), ing("lemon-juice", 5), ing("paprika", 1), ing("salt", 1), ing("bread", 160, { note: "about 4 slices" })],
    method: [
      "Boil the eggs: Lower the eggs gently into a pan of boiling water and cook for 8 minutes, until the whites are set and the yolks just firm. Cool them in cold water for 2 minutes.",
      "Make the salad: Cut the cucumber into chunks and halve the cherry tomatoes. Toss them with half the oil, the lemon juice and a pinch of salt.",
      "Toast the bread: Toast the bread until golden, then cut each slice into triangles.",
      "Peel the eggs: Tap the eggs all over, peel off the shells and cut them in half.",
      "Plate the houmous: Spoon the houmous onto plates and swirl it with the back of a spoon. Drizzle with the rest of the oil and dust with the paprika.",
      "Serve: Add the eggs, salad and toast to each plate, to eat together.",
    ],
  },
  {
    id: "overnight-wheat-biscuits-berries-yogurt", meal: "breakfast", tags: ["Sweet", "No cook", "Make ahead"], name: "Overnight wheat biscuits with berries and yogurt", blurb: "Wheat biscuits soaked in milk until soft, layered with honey yogurt and berries and left to set overnight.", servings: 2, minutes: 10,
    // the milk softens the biscuits, so it follows them when the recipe is fitted
    ingredients: [ing("wheat-biscuits", 76, { note: "about 4 biscuits" }), ing("milk", 150, { follows: "wheat-biscuits" }), ing("greek-yogurt", 400, { role: "protein" }), ing("honey", 20), ing("berries", 200)],
    method: [
      "Soak the biscuits: Crumble the biscuits into a bowl and pour over the milk. Mash them with a fork into a thick, smooth paste.",
      "Sweeten the yogurt: Stir the honey into the yogurt.",
      "Layer the pots: Spoon the biscuit mixture into glasses or small bowls and press it down. Spoon the yogurt on top and scatter over the berries.",
      "Chill overnight: Cover and leave in the fridge overnight, or for at least 2 hours, so the layers set and frozen berries thaw.",
      "Serve: Eat cold, straight from the glass. They keep covered in the fridge for up to 2 days.",
    ],
  },
  {
    id: "crunchy-honey-almond-oat-cereal-yogurt", meal: "breakfast", tags: ["Sweet", "Bake", "Make ahead"], name: "Crunchy honey and almond oat cereal with yogurt", blurb: "Oats toasted in the oven with honey, almonds and cinnamon, mixed with raisins and served with cold milk and yogurt.", servings: 4, minutes: 30,
    // the milk is poured over the oats, so it follows them when the recipe is fitted
    ingredients: [ing("oats", 240), ing("almonds", 40), ing("honey", 40), ing("vegetable-oil", 20), ing("cinnamon", 2), ing("raisins", 60), ing("milk", 600, { follows: "oats" }), ing("greek-yogurt", 600, { role: "protein" })],
    method: [
      "Heat the oven: Turn the oven on to 180°C (160°C fan, gas 4) and line a large baking tray with baking paper.",
      "Mix the oats: Chop the almonds roughly. Stir the oats, almonds, honey, oil and cinnamon together in a large bowl until every oat is coated.",
      "Bake: Spread the mixture thinly over the tray and bake for 15 to 20 minutes, stirring halfway, until golden and toasted.",
      "Add the raisins: Stir in the raisins and leave it to cool on the tray, where it turns crisp. Keep it in a box with a lid for up to 2 weeks.",
      "Serve: Spoon the cereal into bowls, pour over the milk and top with a spoonful of yogurt.",
    ],
  },
  {
    id: "peanut-butter-banana-soya-rice-pudding", meal: "breakfast", tags: ["Vegan", "Sweet", "Make ahead"], name: "Peanut butter and banana rice pudding with soya", blurb: "Rice simmered slowly in soya drink with cinnamon and mashed banana, swirled with peanut butter.", servings: 4, minutes: 45,
    // the soya drink and banana go with the rice, so the pudding keeps its texture when it is fitted; the peanut butter carries the protein
    ingredients: [ing("rice", 240), ing("soya-drink", 1400, { follows: "rice" }), ing("cinnamon", 3), ing("banana", 240, { note: "about 2 bananas", follows: "rice" }), ing("peanut-butter", 80, { role: "protein" })],
    method: [
      "Rinse the rice: Rinse the rice in a sieve under the cold tap and drain it well.",
      "Start the pudding: Put the rice, soya drink and most of the cinnamon in a large saucepan and bring to a gentle bubble over a medium heat, stirring.",
      "Simmer: Turn the heat to low and cook for 30 to 35 minutes, stirring every few minutes so it doesn't catch, until the rice is soft and the pudding thick and creamy.",
      "Add the banana: Peel the bananas. Mash one into the pudding for the last 2 minutes and slice the other into rounds.",
      "Serve: Spoon the pudding into bowls, swirl in the peanut butter and top with the banana slices and the rest of the cinnamon.",
      "Keep the rest: It thickens as it cools. Keep any left over covered in the fridge for up to 2 days and warm it with a splash of water.",
    ],
  },
  {
    id: "sweetcorn-cheddar-fritters-tomatoes", meal: "breakfast", tags: ["Savoury", "Eggs", "Brunch"], name: "Sweetcorn and cheddar fritters with tomatoes", blurb: "Golden fritters of sweetcorn, spring onion and cheddar in an oat and egg batter, with pan-fried cherry tomatoes.", servings: 2, minutes: 25,
    ingredients: [ing("oats", 80), ing("eggs", 180, { note: "about 3 eggs" }), ing("paprika", 1), ing("black-pepper", 1), ing("sweetcorn", 200), ing("spring-onions", 30), ing("cheddar", 40), ing("vegetable-oil", 15), ing("cherry-tomatoes", 200)],
    method: [
      "Make the oat flour: Blend the oats in a blender for about 1 minute, until they look like coarse flour.",
      "Make the batter: Beat the eggs in a bowl with a fork, then stir in the oat flour, paprika and some black pepper until smooth. Wash your hands after touching raw eggs.",
      "Add the filling: Drain the sweetcorn if it is tinned and trim and slice the spring onions. Stir them into the batter with the cheddar.",
      "Fry the fritters: Heat half the oil in a large non-stick frying pan over a medium heat. Drop in heaped tablespoons of batter, flatten them a little and cook for 2 to 3 minutes a side, until golden and set in the middle.",
      "Cook the rest: Keep them warm on a plate and cook the rest of the batter the same way with the rest of the oil.",
      "Fry the tomatoes: Halve the cherry tomatoes and fry them in the pan for 2 minutes, until they soften. Serve them with the fritters.",
    ],
  },

  // ---- more big breakfasts for the diets with the fewest at a rugby player's size: no gluten (rice, eggs, fish, tofu), vegetarian, Jain, vegan
  {
    id: "salmon-soft-boiled-egg-breakfast-rice-bowl", meal: "breakfast", tags: ["Savoury", "Fish", "Eggs", "Bowl"], name: "Salmon and soft-boiled egg breakfast rice bowl", blurb: "A Japanese-style breakfast of salted pan-fried salmon on warm rice with soft-boiled eggs, spinach, cucumber and spring onions.", servings: 2, minutes: 30,
    ingredients: [ing("rice", 200, { note: "uncooked" }), ing("eggs", 240, { note: "about 4 eggs" }), ing("cucumber", 150), ing("spring-onions", 30), ing("salmon", 240, { note: "about 2 fillets" }), ing("salt", 1), ing("vegetable-oil", 10), ing("spinach", 100), ing("lemon-juice", 10)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Simmer it in a large pan of boiling water for 10 to 12 minutes, until tender, then drain it, put it back in the pan and cover it to keep warm.",
      "Boil the eggs: Lower the eggs gently into a small pan of boiling water and cook for 7 minutes, until the whites are set and the yolks still soft in the middle. Cool them in cold water for 2 minutes.",
      "Get ready: Cut the cucumber into thin sticks and trim and slice the spring onions.",
      "Salt the salmon: Pat the salmon dry with kitchen paper and sprinkle the salt over both sides. Wash your hands after touching raw fish.",
      "Fry the salmon: Heat the oil in a non-stick frying pan over a medium heat. Fry the salmon skin side down for 4 minutes, then turn it and cook for 3 to 4 minutes more, until it is opaque and flakes easily.",
      "Wilt the spinach: Lift the salmon onto a plate. Add the spinach to the pan and stir it for 1 to 2 minutes, until it wilts.",
      "Peel the eggs: Tap the eggs all over, peel off the shells and cut them in half.",
      "Serve: Spoon the rice into bowls. Pull the skin off the salmon, break it into large flakes and lay it on the rice with the spinach, cucumber and eggs. Sprinkle over the lemon juice and spring onions.",
    ],
  },
  {
    id: "pea-spinach-cottage-cheese-rice-frittata", meal: "breakfast", tags: ["Savoury", "Eggs", "Make ahead"], name: "Pea, spinach and cottage cheese rice frittata", blurb: "A thick, golden frittata of rice, peas and spinach set in eggs with cottage cheese and cheddar, eaten warm or cold.", servings: 2, minutes: 45,
    ingredients: [ing("rice", 160, { note: "uncooked" }), ing("peas", 80), ing("spring-onions", 30), ing("spinach", 60), ing("cheddar", 30), ing("eggs", 360, { note: "about 6 eggs" }), ing("cottage-cheese", 150), ing("salt", 1), ing("black-pepper", 1), ing("olive-oil", 10)],
    method: [
      "Cook the rice: Rinse the rice in a sieve. Simmer it in a large pan of boiling water for 10 to 12 minutes, until tender, adding the peas for the last 2 minutes. Drain well and leave to steam dry for 5 minutes.",
      "Get ready: Trim and slice the spring onions, chop the spinach roughly and grate the cheddar.",
      "Mix the eggs: Crack the eggs into a large bowl and beat them with a fork. Stir in the cottage cheese, most of the cheddar, a pinch of salt and some black pepper. Wash your hands after touching raw eggs.",
      "Add the rice: Stir the rice, peas, spinach and spring onions into the eggs until everything is coated.",
      "Cook on the hob: Heat the oil in a non-stick frying pan about 24 cm across over a medium-low heat. Tip in the mixture, level it and cook for 10 to 12 minutes, until the edges are set and the underneath is golden.",
      "Heat the grill: While it cooks, turn the grill on to medium-high.",
      "Finish under the grill: Scatter over the rest of the cheddar. Slide the pan under the grill, keeping the handle away from the heat, for 4 to 5 minutes, until puffed, golden and set in the middle.",
      "Serve: Leave it for 5 minutes, then loosen the edges with a spatula, slide it onto a board and cut it into wedges. It keeps in the fridge for up to 2 days and is good cold.",
    ],
  },
  {
    id: "gallo-pinto-rice-beans-scrambled-tofu", meal: "breakfast", tags: ["Vegan", "Savoury", "Bowl"], name: "Gallo pinto rice and beans with scrambled tofu", blurb: "The Central American breakfast of rice and red beans fried with onion, pepper and cumin, with turmeric scrambled tofu.", servings: 2, minutes: 35,
    ingredients: [ing("rice", 200, { note: "uncooked" }), ing("onion", 150, { note: "about 1 onion" }), ing("peppers", 160, { note: "about 1 pepper" }), ing("kidney-beans", 240), ing("vegetable-oil", 20), ing("garlic", 5, { note: "about 1 clove" }), ing("cumin", 2), ing("salt", 1), ing("tofu", 300), ing("turmeric", 1), ing("paprika", 1), ing("black-pepper", 1), ing("tomatoes", 170, { note: "about 2 tomatoes" })],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Simmer it in a large pan of boiling water for 10 to 12 minutes, until tender, then drain it well and spread it on a plate to dry.",
      "Get ready: Peel the onion and chop it finely. Cut the pepper in half, scoop out the seeds and white inside and chop it into small pieces. Rinse and drain the beans.",
      "Soften the onion: Heat half the oil in a large frying pan over a medium heat. Fry the onion and pepper for 6 to 8 minutes, stirring, until soft and lightly golden. Stir in the garlic and cumin for 1 minute.",
      "Add the beans: Add the beans and a splash of water and cook for 3 minutes, crushing a few with the back of a spoon so their juices colour the rice later.",
      "Fry the rice: Tip in the rice with a pinch of salt and stir-fry for 4 to 5 minutes, until it is piping hot and speckled red-brown all through. Cover and keep it warm.",
      "Scramble the tofu: Drain the tofu, pat it dry with kitchen paper and crumble it into a second frying pan with the rest of the oil, the turmeric, paprika and some black pepper.",
      "Cook the tofu: Cook it over a medium heat for 5 minutes, stirring, until hot and golden yellow all over.",
      "Serve: Slice the tomatoes. Spoon the rice and beans onto plates with the scrambled tofu and tomatoes beside it.",
    ],
  },
  {
    id: "cheesy-savoury-porridge-fried-eggs-spinach", meal: "breakfast", tags: ["Savoury", "Porridge", "Eggs", "Quick"], name: "Cheesy savoury porridge with fried eggs and spinach", blurb: "Oats cooked in milk with spinach, cheddar and spring onions, topped with fried eggs, soft cherry tomatoes and black pepper.", servings: 2, minutes: 15,
    // the milk cooks into the oats, so it follows them when the porridge is fitted; the eggs on top carry most of the protein
    ingredients: [ing("spring-onions", 30), ing("cherry-tomatoes", 150), ing("cheddar", 40), ing("oats", 180), ing("milk", 400, { follows: "oats" }), ing("salt", 1), ing("spinach", 100), ing("olive-oil", 10), ing("eggs", 240, { note: "about 4 eggs" }), ing("black-pepper", 1)],
    method: [
      "Get ready: Trim and slice the spring onions, halve the cherry tomatoes and grate the cheddar.",
      "Start the porridge: Put the oats, milk and 300 ml of water in a medium saucepan with a pinch of salt and stir well.",
      "Cook: Bring to a gentle bubble over a medium heat, then turn the heat down and cook for 4 to 5 minutes, stirring often, until thick and creamy.",
      "Add the spinach: Stir in the spinach, most of the cheddar and most of the spring onions for 1 minute, until the spinach wilts and the cheese melts. Take the pan off the heat and cover it.",
      "Fry the tomatoes: Heat the oil in a large non-stick frying pan over a medium heat. Fry the tomatoes cut side down for 2 minutes, until soft, then push them to one side.",
      "Fry the eggs: Crack the eggs into the pan and fry for 3 to 4 minutes, until the whites are set and the edges golden. Wash your hands after touching raw eggs.",
      "Serve: Spoon the porridge into bowls and top with the fried eggs, tomatoes and the rest of the cheddar and spring onions. Finish with plenty of black pepper.",
    ],
  },
  {
    id: "korean-style-egg-toast-sandwiches", meal: "breakfast", tags: ["Savoury", "Eggs", "Quick"], name: "Korean-style egg toast sandwiches", blurb: "Korean street-style breakfast toast: a carrot and spring onion omelette with melted cheddar and a little honey in golden toast.", servings: 2, minutes: 20,
    ingredients: [ing("carrots", 100, { note: "about 1 carrot" }), ing("spring-onions", 30), ing("cheddar", 40), ing("eggs", 360, { note: "about 6 eggs" }), ing("black-pepper", 1), ing("bread", 320, { note: "about 8 slices" }), ing("vegetable-oil", 10), ing("honey", 10)],
    method: [
      "Get ready: Peel and coarsely grate the carrot, trim and thinly slice the spring onions and grate the cheddar.",
      "Mix the eggs: Crack the eggs into a bowl, add the carrot, spring onions and some black pepper and beat well with a fork. Wash your hands after touching raw eggs.",
      "Toast the bread: Heat a large non-stick frying pan over a medium heat and toast the bread in it, in batches, for 1 to 2 minutes a side, until golden. Keep it warm on a plate.",
      "Start the omelettes: Add a little of the oil to the pan and pour in enough egg mixture to make a square about the size of a slice of bread.",
      "Cook the omelettes: Cook for 2 minutes, until set underneath, then fold in the edges and turn it over. Scatter over some of the cheese and cook for 1 minute more, until set all the way through. Cook the rest the same way.",
      "Build the sandwiches: Lay each omelette on a slice of toast, drizzle with a little honey and top with a second slice.",
      "Serve: Press each sandwich down gently, cut it in half and eat warm.",
    ],
  },
  {
    id: "molletes-refried-beans-cheese-tomato-salsa", meal: "breakfast", tags: ["Savoury", "Quick", "Mexican"], name: "Molletes with refried beans, cheese and tomato salsa", blurb: "The Mexican breakfast of grilled bread spread with cumin refried beans and melted cheddar, topped with a tomato and cucumber salsa.", servings: 2, minutes: 20,
    ingredients: [ing("tomatoes", 170, { note: "about 2 tomatoes" }), ing("cucumber", 100), ing("lemon-juice", 10), ing("salt", 1), ing("kidney-beans", 480), ing("olive-oil", 15), ing("cumin", 2), ing("paprika", 2), ing("bread", 320, { note: "about 8 slices" }), ing("cheddar", 60)],
    method: [
      "Make the salsa: Chop the tomatoes and cucumber into small pieces and mix them with the lemon juice and a pinch of salt. Set aside.",
      "Fry the beans: Rinse and drain the beans. Heat the oil in a frying pan over a medium heat, add the beans, cumin and paprika and fry for 2 minutes, stirring.",
      "Mash the beans: Add a splash of water and mash the beans in the pan with a masher or fork for 3 to 4 minutes, until thick and mostly smooth. Take the pan off the heat.",
      "Toast the bread: Turn the grill on to high. Toast the bread on one side under the grill for 1 to 2 minutes, until golden.",
      "Top the toast: Turn the bread over and spread the beans thickly over the untoasted side, right to the edges. Grate the cheddar and scatter it over the beans.",
      "Grill: Grill for 2 to 3 minutes, until the cheese has melted and is bubbling and golden in places.",
      "Serve: Spoon the salsa over the top and eat straight away.",
    ],
  },
  {
    id: "tofu-french-toast-banana-cream-berries", meal: "breakfast", tags: ["Vegan", "Sweet", "Quick"], name: "Tofu French toast with banana cream and berries", blurb: "Egg-free French toast dipped in a blended tofu and cinnamon batter, fried until golden, with a thick banana tofu cream and berries.", servings: 2, minutes: 20,
    // the tofu makes both the batter and the cream on top, so the soya drink in the batter follows it when the recipe is fitted; the bread is the carb that halves
    ingredients: [ing("tofu", 280), ing("soya-drink", 150, { follows: "tofu" }), ing("cinnamon", 2), ing("banana", 120, { note: "about 1 banana" }), ing("bread", 160, { note: "about 4 slices" }), ing("oil-spray", 1), ing("berries", 200)],
    method: [
      "Make the batter: Drain the tofu and pat it dry. Blend half of it with the soya drink and half the cinnamon in a blender or tall jug for about 1 minute, until smooth, then pour it into a wide, shallow dish.",
      "Make the cream: Peel the banana and blend it with the rest of the tofu and cinnamon for about 1 minute, until smooth and thick, like yogurt, adding a splash of water if it needs help. Spoon it into a bowl.",
      "Soak the bread: Lay the bread in the batter for about 30 seconds a side, until coated all over.",
      "Fry: Spray a large non-stick frying pan with oil and heat it over a medium heat. Fry the bread for 3 to 4 minutes a side, until golden and crisp, in batches, spraying the pan again each time.",
      "Serve: Cut the French toast in half, spoon the banana cream over the top and scatter over the berries. If the berries are frozen, let them thaw in the fridge first.",
    ],
  },
  {
    id: "herby-tofu-breakfast-patties-tomatoes-toast", meal: "breakfast", tags: ["Vegan", "Savoury"], name: "Herby tofu breakfast patties with tomatoes and toast", blurb: "Golden patties of mashed tofu, oats, paprika and herbs, like breakfast sausage patties, with soft cherry tomatoes, spinach and toast.", servings: 2, minutes: 30,
    // the oats bind the tofu, so they follow it when the recipe is fitted; the toast is the carb that halves on a small day
    ingredients: [ing("oats", 40, { follows: "tofu" }), ing("tofu", 360), ing("soy", 10), ing("garlic", 5, { note: "about 1 clove" }), ing("paprika", 2), ing("mixed-herbs", 2), ing("black-pepper", 1), ing("vegetable-oil", 10), ing("cherry-tomatoes", 200), ing("spinach", 80), ing("bread", 160, { note: "about 4 slices" })],
    method: [
      "Make the oat flour: Blend the oats in a blender for about 1 minute, until they look like coarse flour.",
      "Mix the patties: Drain the tofu, pat it dry and crumble it into a bowl. Add the oat flour, soy sauce, garlic, paprika, herbs and plenty of black pepper and mash with your hands for 2 minutes, until it holds together when squeezed.",
      "Shape the patties: With wet hands, shape the mixture into small flat patties about 1 cm thick, pressing them firmly together.",
      "Fry the patties: Heat most of the oil in a large non-stick frying pan over a medium heat. Fry the patties for 3 to 4 minutes a side, turning them carefully with a spatula, until golden and crisp. Keep them warm.",
      "Cook the tomatoes: Halve the cherry tomatoes. Add the rest of the oil to the pan and fry the tomatoes for 2 minutes, then add the spinach and stir until it wilts.",
      "Toast the bread: Toast the bread until golden on both sides.",
      "Serve: Share the patties, tomatoes, spinach and toast between plates and eat hot.",
    ],
  },
  // ---- big vegan breakfasts that are also Jain (no onion, garlic, roots or mushrooms)
  {
    id: "tofu-chilaquiles-beans-spiced-tomato-sauce", meal: "breakfast", tags: ["Vegan", "Savoury", "Bake", "Mexican"], name: "Tofu chilaquiles with beans and spiced tomato sauce", blurb: "The Mexican breakfast of crisp baked tortilla chips tossed in a cumin tomato and bean sauce, topped with golden paprika tofu.", servings: 2, minutes: 35,
    ingredients: [ing("wraps", 240, { note: "about 4 wraps" }), ing("vegetable-oil", 20), ing("peppers", 160, { note: "about 1 pepper" }), ing("cumin", 2), ing("paprika", 2), ing("oregano", 1), ing("chopped-tomatoes", 400), ing("kidney-beans", 240), ing("salt", 1), ing("tofu", 300), ing("lemon-juice", 10)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6).",
      "Make the chips: Brush the wraps lightly on both sides with a third of the oil, cut each one into 8 triangles and spread them over baking trays in one layer.",
      "Bake the chips: Bake for 8 to 10 minutes, turning once, until golden and crisp. Watch them closely at the end, as they brown quickly.",
      "Soften the pepper: Cut the pepper in half, scoop out the seeds and chop it small. Heat another third of the oil in a large frying pan over a medium heat and fry the pepper for 5 minutes, until soft.",
      "Simmer the sauce: Stir in the cumin, half the paprika and the oregano for 30 seconds. Add the tomatoes, the rinsed and drained beans and a pinch of salt and simmer for 8 to 10 minutes, until thick.",
      "Fry the tofu: Drain the tofu, pat it dry and cut it into 2 cm cubes. Fry them in the rest of the oil in a non-stick pan over a medium-high heat for 6 to 8 minutes, turning, until golden. Toss with the rest of the paprika.",
      "Coat the chips: Stir the lemon juice into the sauce, then add the tortilla chips and turn them gently for 1 minute, so they soak up some sauce but keep a little crunch.",
      "Serve: Spoon onto plates straight away and scatter the tofu over the top.",
    ],
  },
  {
    id: "berry-cheesecake-overnight-oats-tofu", meal: "breakfast", tags: ["Vegan", "Sweet", "No cook", "Make ahead"], name: "Berry cheesecake overnight oats with tofu", blurb: "Oats soaked overnight in soya drink, layered with a smooth lemon, banana and tofu cheesecake cream and berries, with almonds on top.", servings: 2, minutes: 10,
    // the soya drink soaks the oats, so it follows them when the recipe is fitted; the tofu cream carries the protein
    ingredients: [ing("oats", 160), ing("soya-drink", 360, { follows: "oats" }), ing("cinnamon", 1), ing("tofu", 300), ing("banana", 120, { note: "about 1 banana" }), ing("lemon-juice", 10), ing("berries", 200), ing("almonds", 20)],
    method: [
      "Soak the oats: Stir the oats, soya drink and cinnamon together in a bowl.",
      "Make the cheesecake cream: Drain the tofu and break it into pieces. Peel the banana. Blend the tofu, banana and lemon juice in a blender or tall jug for 1 to 2 minutes, scraping down the sides, until completely smooth and thick.",
      "Layer the pots: Spoon half the oats into glasses or small bowls, add half the tofu cream and half the berries, then repeat the layers.",
      "Chill overnight: Cover and leave in the fridge overnight, or for at least 4 hours, so the oats soften and frozen berries thaw.",
      "Serve: Chop the almonds roughly and scatter them over the top just before eating. The pots keep covered in the fridge for up to 2 days.",
    ],
  },
];

export const WAVE2_BREAKFASTS_LOOKS: Readonly<Record<string, string>> = {
  "full-english-fried-rice": "A wide white bowl of golden fried rice studded with crisp strips of bacon, browned mushroom slices, soft yellow pieces of scrambled egg and split red cherry tomatoes, scattered with thin green spring onion rings.",
  "banana-raisin-porridge-yogurt": "A wide shallow white bowl of thick, creamy oat porridge flecked with dark raisins, topped with a big swirl of thick white yogurt, a fan of pale banana slices and a dusting of brown cinnamon.",
  "ham-egg-cheese-breakfast-bake": "A rectangular baking dish of puffed, golden bread cubes set in baked egg custard, with melted orange cheddar on top and pink pieces of ham and soft red cherry tomato halves showing between the crisp brown edges.",
  "smoked-salmon-poached-eggs-soft-cheese-toast": "Two slices of golden wholemeal toast on a round white plate, spread with white soft cheese and draped with folds of pink-orange smoked salmon, each topped with a round poached egg, the white set and the yolk bright yellow.",
  "bacon-egg-mushroom-breakfast-sandwiches": "Two wholemeal toast sandwiches cut in half on a white plate, the cut sides showing crisp golden bacon, browned mushroom slices and a fried egg with a set white and a yellow yolk, cracked black pepper on top.",
  "tofu-bean-mushroom-fry-up": "A round white plate with golden paprika-coloured slices of fried tofu, a pool of orange baked beans, browned mushrooms, soft split red cherry tomatoes and two triangles of golden wholemeal toast.",
  "breakfast-burrito-bowl-eggs-beans": "A wide white bowl of pale cumin rice topped with soft yellow scrambled eggs, glossy dark red kidney beans with small pieces of red pepper, a dollop of chunky red salsa and sliced green spring onions.",
  "apple-berry-breakfast-crumble-yogurt": "A small white baking dish of golden, crisp oat crumble with bubbling purple berry juice and soft apple pieces showing at the edges, beside a small bowl of thick white yogurt.",
  "banana-oat-tofu-pancakes-cinnamon-apple": "A stack of thick, golden banana and oat pancakes on a round white plate, topped with soft, glossy slices of cinnamon-dusted cooked apple tumbling down the sides.",
  "peanut-butter-banana-stuffed-french-toast": "Golden-brown French toast sandwiches cut in half on a white plate, the cut sides showing a layer of peanut butter and pale banana slices, drizzled with honey, with a dollop of thick white yogurt on the side.",
  "bombay-potato-chickpea-breakfast-hash": "A wide white bowl of crisp golden new potato quarters and chickpeas tinted yellow with turmeric, mixed with soft onion, split red cherry tomatoes and dark green wilted spinach.",
  "bean-sweetcorn-pepper-breakfast-burritos": "Two tortilla burritos cut in half on a round white plate, the cut ends showing crushed dark red kidney beans, yellow sweetcorn, soft red pepper strips, green spinach and chunky red salsa.",
  "masala-beans-on-toast": "Two slices of golden wholemeal toast on a white plate, covered with thick orange baked beans speckled with yellow turmeric, soft tomato pieces and thin green spring onion rings.",
  "spinach-banana-tofu-green-smoothie": "Two tall glasses of thick, smooth, bright green smoothie with a fine dusting of brown cinnamon on top, beside a few banana rounds and a small heap of spinach leaves on a white plate.",
  "tofu-chickpea-shakshuka-toast": "A black frying pan of thick red tomato and pepper sauce with chickpeas and dark green spinach, white crumbled tofu nestled in hollows across the top, beside triangles of golden wholemeal toast.",
  "spiced-tofu-chickpea-breakfast-kedgeree": "A wide white bowl of golden-yellow spiced rice with green peas, golden cubes of fried tofu, chickpeas and dark green wilted spinach mixed through it.",
  "tofu-bhurji-peas-tomatoes-toast": "Slices of golden wholemeal toast on a white plate heaped with bright yellow crumbled scrambled tofu studded with green peas and soft red tomato pieces.",
  "potato-pepper-spinach-hash-fried-eggs": "A round white plate of crisp golden new potato quarters fried with soft red pepper, red onion wedges and dark green spinach, topped with two fried eggs with set whites and bright yellow yolks, dusted with paprika.",
  "yogurt-bowl-warm-cinnamon-apples-almonds": "A wide white bowl of thick white yogurt topped with soft, glossy, warm apple wedges and plump raisins in cinnamon juices, scattered with roughly chopped pale almonds and a dusting of brown cinnamon.",
  "chinese-style-rice-porridge-egg": "A deep white bowl of thick, silky white rice porridge with soft yellow ribbons of egg and dark green wilted spinach swirled through it, scattered with thin green spring onion rings and a few drops of oil.",
  "banana-cinnamon-lassi-smoothie": "Two tall glasses filled with a thick, frothy, pale cream banana and yogurt drink, the tops dusted with brown cinnamon, beside a small white plate holding a few banana slices.",
  "spiced-oat-spinach-pancakes-cucumber-yogurt": "A stack of thin, golden-yellow savoury oat pancakes flecked with dark green spinach and red tomato pieces on a white plate, beside a small bowl of thick white yogurt speckled with pale green grated cucumber.",
  "middle-eastern-breakfast-plate-eggs-houmous": "A round white plate with a swirl of creamy beige houmous dusted with red paprika and pooled with olive oil, halved boiled eggs with yellow yolks, cucumber chunks, halved cherry tomatoes and triangles of golden toast.",
  "overnight-wheat-biscuits-berries-yogurt": "Two clear glasses layered with soft, pale brown soaked wheat biscuit at the bottom, thick white honey yogurt in the middle and deep red and purple mixed berries on top.",
  "crunchy-honey-almond-oat-cereal-yogurt": "A white bowl of golden toasted oat clusters with pieces of pale almond and dark raisins, cold milk around them and a dollop of thick white yogurt on top.",
  "peanut-butter-banana-soya-rice-pudding": "A wide white bowl of thick, creamy rice pudding with a swirl of golden-brown peanut butter through the top, pale banana rounds and a dusting of brown cinnamon.",
  "sweetcorn-cheddar-fritters-tomatoes": "A stack of round golden fritters on a white plate, studded with bright yellow sweetcorn kernels, green spring onion and melted cheddar, beside soft, blistered red cherry tomato halves.",
  "salmon-soft-boiled-egg-breakfast-rice-bowl": "A wide white bowl of white rice topped with large golden-edged pink flakes of pan-fried salmon, halved soft-boiled eggs with glossy orange yolks, dark green wilted spinach, pale cucumber sticks and thin green spring onion rings.",
  "pea-spinach-cottage-cheese-rice-frittata": "A thick round golden frittata on a wooden board with one wedge cut away, the cut side showing set yellow egg packed with white rice, bright green peas, dark green spinach and white curds of cottage cheese under a browned cheddar top.",
  "gallo-pinto-rice-beans-scrambled-tofu": "A round white plate with a mound of rice speckled red-brown with kidney beans, soft onion and small pieces of red pepper, beside a heap of golden-yellow scrambled tofu and overlapping slices of red tomato.",
  "cheesy-savoury-porridge-fried-eggs-spinach": "A wide white bowl of thick, creamy pale oat porridge streaked with dark green spinach and melted cheddar, topped with two fried eggs with set whites and bright yellow yolks, soft red cherry tomato halves and green spring onion rings.",
  "korean-style-egg-toast-sandwiches": "Halved toasted sandwiches on a white plate, the golden wholemeal bread showing thick folded omelette layers flecked with orange grated carrot and green spring onion, with melted cheddar at the edges.",
  "molletes-refried-beans-cheese-tomato-salsa": "Slices of golden grilled bread on a white plate, spread thickly with dark red-brown refried beans under bubbling melted orange cheddar, topped with spoonfuls of chopped red tomato and pale green cucumber salsa.",
  "tofu-french-toast-banana-cream-berries": "Golden fried French toast halves on a round white plate, topped with a thick swirl of pale creamy banana tofu cream, a scattering of deep red and purple berries and a dusting of brown cinnamon.",
  "herby-tofu-breakfast-patties-tomatoes-toast": "A white plate of round golden-brown tofu patties flecked with green herbs and red paprika, beside soft blistered red cherry tomato halves, dark green wilted spinach and two triangles of golden wholemeal toast.",
  "tofu-chilaquiles-beans-spiced-tomato-sauce": "A wide white plate of golden tortilla chips coated in thick red tomato sauce with dark red kidney beans and soft pieces of red pepper, topped with crisp golden cubes of paprika tofu.",
  "berry-cheesecake-overnight-oats-tofu": "Two clear glasses layered with soft pale soaked oats, thick smooth white tofu cheesecake cream and deep red and purple berries, finished with roughly chopped pale almonds on top.",
};

export const WAVE2_BREAKFASTS_CUISINES: ReadonlyArray<readonly [string, CuisineId]> = [
  ["bacon-egg-mushroom-breakfast-sandwiches", "british"],
  ["apple-berry-breakfast-crumble-yogurt", "british"], ["spiced-tofu-chickpea-breakfast-kedgeree", "british"],
  ["breakfast-burrito-bowl-eggs-beans", "mexican"], ["bean-sweetcorn-pepper-breakfast-burritos", "mexican"], ["molletes-refried-beans-cheese-tomato-salsa", "mexican"], ["tofu-chilaquiles-beans-spiced-tomato-sauce", "mexican"],
  ["bombay-potato-chickpea-breakfast-hash", "indian"], ["masala-beans-on-toast", "indian"], ["tofu-bhurji-peas-tomatoes-toast", "indian"], ["banana-cinnamon-lassi-smoothie", "indian"],
  ["spiced-oat-spinach-pancakes-cucumber-yogurt", "indian"],
  ["tofu-chickpea-shakshuka-toast", "middle-eastern"], ["middle-eastern-breakfast-plate-eggs-houmous", "middle-eastern"],
  ["chinese-style-rice-porridge-egg", "chinese"],
];

export const WAVE2_BREAKFASTS_OCCASIONS: ReadonlyArray<readonly [string, OccasionId]> = [
  ["pea-spinach-cottage-cheese-rice-frittata", "lunchbox"],
];
