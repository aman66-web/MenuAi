import { ing, type Recipe } from "../recipes";
import type { CuisineId, OccasionId } from "./niches";

// Wave 2 (founder 2026-11-26: "it needs to suit literally everyone ... a professional footballer ... someone who does rugby might need more ... make the best
// diet plan for like each individual"; docs/RECIPE_PERSONAS_2026-11-26.md): snacks before and after training, and small protein snacks for every diet.
// Every ingredient is an everyday kind or one of the protein kinds a small shop stocks (tofu, Quorn, soya drink: lib/mm/localRangeProtein.ts); see
// lib/mm/recipeBook/index.ts for the rules every recipe follows.
// A snack slot is a tenth of the day, 100 to 250 kcal (lib/mm/mealPlan.ts slotTargets), so each snack has a protein ingredient and a carb ingredient that
// Meal plan can move apart: up to 250 kcal with carbs before or after training, down to 120 to 140 kcal that keep their protein on a small day.

export const WAVE2_SNACKS: readonly Recipe[] = [
  // ---- before training: carbs at least half the calories
  {
    id: "banana-honey-toast-cinnamon-yogurt", meal: "snack", tags: ["Quick", "Sweet"], name: "Banana and honey toast with cinnamon yogurt", blurb: "Warm toast spread with cinnamon yogurt, topped with sliced banana and a drizzle of honey.", servings: 2, minutes: 5,
    // the banana goes on the toast, so it moves with the bread
    ingredients: [ing("bread", 80, { note: "about 2 slices" }), ing("greek-yogurt", 150, { role: "protein", fit: [0.5, 1.5] }), ing("cinnamon", 1), ing("banana", 120, { note: "about 1 banana", follows: "bread" }), ing("honey", 15)],
    method: [
      "Toast the bread: Toast the bread until golden brown on both sides.",
      "Mix the yogurt: Stir the cinnamon into the yogurt in a small bowl until there are no streaks left.",
      "Slice the banana: Peel the banana and cut it into thin rounds, about as thick as a pound coin.",
      "Top the toast: Spread the cinnamon yogurt thickly over the warm toast and lay the banana slices on top, overlapping them a little.",
      "Finish and serve: Drizzle the honey over in a thin stream, cut each slice into three fingers and eat straight away.",
    ],
  },
  {
    id: "cinnamon-raisin-rice-pudding-pots", meal: "snack", tags: ["Make ahead", "Sweet", "British"], name: "Cinnamon and raisin rice pudding pots", blurb: "Creamy rice pudding cooked slowly in milk with raisins and cinnamon, to eat warm or cold.", servings: 4, minutes: 45,
    // the rice cooks in the milk, so the milk moves with it and the pudding keeps its thickness
    ingredients: [ing("rice", 120), ing("milk", 800, { follows: "rice" }), ing("cinnamon", 2), ing("raisins", 60)],
    method: [
      "Rinse the rice: Put the rice in a sieve and rinse it under the cold tap for a few seconds, then drain it well.",
      "Heat the milk: Pour the milk into a large non-stick saucepan, add the rice and cinnamon and bring it just to the boil over a medium heat, stirring.",
      "Simmer: Turn the heat down to low and cook, uncovered, for 30 to 35 minutes, stirring every few minutes so it doesn't catch, until the rice is very soft and creamy.",
      "Add the raisins: Stir in the raisins for the last 5 minutes. If it gets too thick before the rice is soft, stir in a splash of water.",
      "Serve: Spoon it into small bowls or pots and eat warm, or leave it to cool, cover and keep in the fridge for up to 3 days. It thickens as it cools.",
    ],
  },
  {
    id: "banana-cinnamon-soya-overnight-oat-pots", meal: "snack", tags: ["Make ahead", "No cook", "Vegan", "Sweet"], name: "Banana and cinnamon overnight oat pots", blurb: "Small pots of oats soaked overnight in soya drink with mashed banana and cinnamon.", servings: 2, minutes: 10,
    // the oats soak up the soya drink, so it moves with them and the pots keep their thickness
    ingredients: [ing("banana", 120, { note: "about 1 banana", follows: "oats" }), ing("oats", 70), ing("cinnamon", 1), ing("soya-drink", 300, { follows: "oats" })],
    method: [
      "Mash the banana: Peel the banana and mash it on a plate with a fork until smooth.",
      "Mix it together: Stir the mashed banana, oats and cinnamon together in a bowl, then pour in the soya drink and stir well.",
      "Fill the pots: Spoon the mixture into small jars, glasses or pots with lids, or cover them with cling film.",
      "Soak: Put them in the fridge for at least 4 hours, or overnight, until the oats are soft and thick.",
      "Serve: Stir each pot, adding a splash more soya drink if it is too thick, and eat cold. They keep in the fridge for up to 2 days.",
    ],
  },
  {
    id: "banana-oat-cinnamon-milkshake", meal: "snack", tags: ["Quick", "No cook", "Sweet"], name: "Banana, oat and cinnamon milkshake", blurb: "A thick, cold milkshake of banana, milk, oats and a pinch of cinnamon.", servings: 2, minutes: 5,
    ingredients: [ing("banana", 240, { note: "about 2 bananas", role: "carb" }), ing("oats", 30, { follows: "banana" }), ing("cinnamon", 1), ing("milk", 400, { role: "protein" })],
    method: [
      "Get the bananas ready: Peel the bananas and break them into chunks. For a thicker, colder shake, use bananas you have sliced and frozen.",
      "Blend: Put the bananas, oats, cinnamon and milk in a blender or a tall jug. Blend with the blender or a stick blender for about 1 minute, until completely smooth.",
      "Check it: If it is too thick, add a splash more milk and blend again for a few seconds.",
      "Serve: Pour into glasses and drink straight away, before the oats thicken it.",
    ],
  },
  {
    id: "warm-cinnamon-apple-toast-yogurt", meal: "snack", tags: ["Quick", "Sweet"], name: "Warm cinnamon apple toast with yogurt", blurb: "Toast spread with thick yogurt and topped with soft apple slices warmed with cinnamon.", servings: 2, minutes: 12,
    // one slice of toast each, held there (a whole slice can't shrink): the warm apple on it is what Meal plan moves
    ingredients: [ing("apple", 150, { note: "about 1 apple", role: "carb" }), ing("oil-spray", 1), ing("cinnamon", 1), ing("bread", 80, { note: "about 2 slices", fit: [1, 1] }), ing("greek-yogurt", 150, { role: "protein", fit: [0.5, 1.5] })],
    method: [
      "Slice the apple: Rinse the apple, cut it into quarters and cut out the core. Cut each quarter into thin slices, skin and all.",
      "Warm the apple: Spray a non-stick frying pan with oil and set it over a medium heat. Add the apple slices and cinnamon with a splash of water and cook for 4 to 5 minutes, turning, until soft.",
      "Toast the bread: While the apple cooks, toast the bread until golden brown on both sides.",
      "Top and serve: Spread the yogurt thickly over the toast, pile the warm apple on top and eat straight away.",
    ],
  },
  {
    id: "banana-berry-soya-rice-pudding", meal: "snack", tags: ["Make ahead", "Vegan", "Sweet"], name: "Banana and berry soya rice pudding", blurb: "Rice cooked slowly in soya drink with mashed banana and cinnamon, topped with warm berries.", servings: 4, minutes: 45,
    // the rice cooks in the soya drink, so the drink (and the banana stirred in) move with it and the pudding keeps its thickness
    ingredients: [ing("rice", 120), ing("soya-drink", 800, { follows: "rice" }), ing("cinnamon", 2), ing("banana", 120, { note: "about 1 banana", follows: "rice" }), ing("berries", 150)],
    method: [
      "Rinse the rice: Put the rice in a sieve and rinse it under the cold tap for a few seconds, then drain it well.",
      "Start the pudding: Pour the soya drink into a large non-stick saucepan, add the rice and cinnamon and bring it just to the boil over a medium heat, stirring.",
      "Simmer: Turn the heat down to low and cook, uncovered, for 30 to 35 minutes, stirring every few minutes so it doesn't catch, until the rice is very soft and creamy.",
      "Add the banana: Peel the banana, mash it with a fork and stir it in for the last 5 minutes. Stir in a splash of water if it gets too thick.",
      "Warm the berries: Warm the berries in a small pan over a low heat for 3 to 4 minutes, stirring now and then, until soft and juicy.",
      "Serve: Spoon the pudding into small bowls and top with the berries. Eat warm or cold; it keeps covered in the fridge for up to 3 days.",
    ],
  },

  // ---- after training: carbs and protein
  {
    id: "banana-granola-yogurt-pots", meal: "snack", tags: ["Quick", "No cook", "Sweet"], name: "Banana and granola yogurt pots", blurb: "Layers of thick cinnamon yogurt, sliced banana and crunchy granola.", servings: 2, minutes: 5,
    // the banana is layered with the granola, so it moves with it
    ingredients: [ing("greek-yogurt", 300, { role: "protein" }), ing("cinnamon", 1), ing("banana", 120, { note: "about 1 banana", follows: "granola" }), ing("granola", 60)],
    method: [
      "Mix the yogurt: Stir the cinnamon into the yogurt in a bowl until there are no streaks left.",
      "Slice the banana: Peel the banana and cut it into thin rounds.",
      "Layer the pots: Spoon half the yogurt into small glasses or bowls, add half the banana and half the granola, then the rest of the yogurt and banana.",
      "Serve: Scatter the rest of the granola on top just before eating, so it stays crunchy, and eat straight away.",
    ],
  },
  {
    id: "cottage-cheese-berry-honey-toast", meal: "snack", tags: ["Quick", "Sweet"], name: "Cottage cheese, berry and honey toast", blurb: "Toast piled with cottage cheese and berries, finished with a drizzle of honey.", servings: 4, minutes: 5,
    // three slices cut into fingers for four, so Meal plan can add or take away part of a slice
    ingredients: [ing("berries", 240), ing("bread", 120, { note: "about 3 slices" }), ing("cottage-cheese", 320), ing("honey", 30)],
    method: [
      "Get the berries ready: If the berries are frozen, thaw them in a bowl in the microwave for 1 minute, then drain off any juice.",
      "Toast the bread: Toast the bread until golden brown on both sides.",
      "Top the toast: Spread the cottage cheese thickly over the warm toast and scatter the berries on top, pressing them in gently.",
      "Finish and serve: Drizzle over the honey, cut each slice into three fingers and serve straight away.",
    ],
  },
  {
    id: "crushed-egg-spring-onion-toast-fingers", meal: "snack", tags: ["Quick", "Eggs", "Savoury"], name: "Crushed egg and spring onion toast fingers", blurb: "Boiled eggs crushed with yogurt, spring onion and black pepper on toast fingers, with a drizzle of olive oil and a dusting of paprika.", servings: 4, minutes: 15,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("spring-onions", 30), ing("greek-yogurt", 60, { follows: "eggs" }), ing("salt", 1), ing("black-pepper", 1), ing("bread", 120, { note: "about 3 slices" }), ing("olive-oil", 10), ing("paprika", 1)],
    method: [
      "Boil the eggs: Lower the eggs into a pan of boiling water on a spoon. Boil them for 9 minutes, until the whites and yolks are set. Wash your hands after touching raw eggs.",
      "Cool and peel: Move the eggs into a bowl of cold water for 3 minutes, then crack and peel them.",
      "Make the topping: Trim and thinly slice the spring onions. Mash the eggs in a bowl with a fork and stir in the spring onions, yogurt and a pinch of salt and black pepper.",
      "Toast the bread: Toast the bread until golden brown on both sides.",
      "Serve: Spread the egg over the toast, drizzle with the oil, dust with the paprika and cut each slice into three fingers. Eat straight away.",
    ],
  },
  {
    id: "tuna-sweetcorn-lemon-toast-fingers", meal: "snack", tags: ["Quick", "Fish", "Savoury"], name: "Tuna, sweetcorn and lemon toast fingers", blurb: "Tuna and sweetcorn stirred with yogurt, lemon and black pepper, piled on toast fingers.", servings: 2, minutes: 8,
    ingredients: [ing("tuna", 100, { note: "about 1 small tin, drained" }), ing("sweetcorn", 60, { role: "carb" }), ing("greek-yogurt", 40), ing("lemon-juice", 5), ing("black-pepper", 1), ing("bread", 80, { note: "about 2 slices" })],
    method: [
      "Drain the tuna: Tip the tuna into a sieve and press it with a spoon to squeeze out the water. Drain the sweetcorn too if it is tinned.",
      "Mix the filling: Flake the tuna into a bowl with a fork and stir in the sweetcorn, yogurt, lemon juice and a good pinch of black pepper.",
      "Toast the bread: Toast the bread until golden brown on both sides.",
      "Serve: Spread the tuna mix thickly over the toast, right to the edges, cut each slice into three fingers and eat straight away.",
    ],
  },
  {
    id: "berry-lassi", meal: "snack", tags: ["Quick", "No cook", "Sweet", "Indian"], name: "Berry lassi", blurb: "A cold, thick Indian-style yogurt drink blended with berries, milk and a little honey.", servings: 2, minutes: 5,
    // the milk thins the yogurt and the honey sweetens the berries, so each moves with the one it goes with
    ingredients: [ing("berries", 150, { role: "carb" }), ing("greek-yogurt", 200, { role: "protein" }), ing("milk", 200, { follows: "greek-yogurt" }), ing("honey", 20, { follows: "berries" })],
    method: [
      "Get the berries ready: Use the berries straight from the freezer for a thick, cold lassi, or add a few ice cubes if they are fresh.",
      "Blend: Put the berries, yogurt, milk and honey in a blender or a tall jug and blend for about 1 minute, until completely smooth.",
      "Check it: If it is too thick, add a splash of cold water and blend again for a few seconds.",
      "Serve: Pour into glasses and drink straight away, while it is cold.",
    ],
  },
  {
    id: "peanut-butter-banana-soya-shake", meal: "snack", tags: ["Quick", "No cook", "Vegan", "Sweet"], name: "Peanut butter and banana soya shake", blurb: "A thick, cold shake of banana, peanut butter and soya drink with a pinch of cinnamon.", servings: 2, minutes: 5,
    ingredients: [ing("banana", 240, { note: "about 2 bananas", role: "carb" }), ing("peanut-butter", 30), ing("cinnamon", 1), ing("soya-drink", 400, { role: "protein" })],
    method: [
      "Get the bananas ready: Peel the bananas and break them into chunks. For a thicker, colder shake, use bananas you have sliced and frozen.",
      "Blend: Put the bananas, peanut butter, cinnamon and soya drink in a blender or a tall jug. Blend for about 1 minute, until completely smooth.",
      "Check it: If it is too thick, add a splash more soya drink and blend again for a few seconds.",
      "Serve: Pour into glasses and drink straight away.",
    ],
  },
  {
    id: "smoked-salmon-cottage-cheese-cucumber-toast", meal: "snack", tags: ["Quick", "Fish", "Savoury"], name: "Smoked salmon and cottage cheese toast with cucumber", blurb: "Toast topped with cottage cheese, thin cucumber slices and smoked salmon, with lemon and black pepper.", servings: 4, minutes: 5,
    ingredients: [ing("cucumber", 120), ing("bread", 120, { note: "about 3 slices" }), ing("cottage-cheese", 200), ing("smoked-salmon", 120), ing("lemon-juice", 5), ing("black-pepper", 1)],
    method: [
      "Slice the cucumber: Rinse the cucumber, cut it into thin rounds and pat them dry with kitchen paper.",
      "Toast the bread: Toast the bread until golden brown on both sides and leave it to cool for a minute.",
      "Top the toast: Spread the cottage cheese over the toast, lay the cucumber on top and fold the smoked salmon over it in loose ruffles.",
      "Finish and serve: Sprinkle over a few drops of lemon juice, add a pinch of black pepper and cut each slice into three fingers. Eat straight away.",
    ],
  },
  {
    id: "mini-banana-oat-pancakes-yogurt", meal: "snack", tags: ["Pancakes", "Sweet"], name: "Mini banana and oat pancakes with yogurt", blurb: "Little pancakes of blended oats, banana, egg and milk, with yogurt to dip.", servings: 2, minutes: 20,
    // the banana and milk make the batter with the oats, and the dip goes with the eggs
    ingredients: [ing("oats", 60), ing("banana", 120, { note: "about 1 banana", follows: "oats" }), ing("eggs", 120, { note: "about 2 eggs" }), ing("milk", 60, { follows: "oats" }), ing("cinnamon", 1), ing("oil-spray", 1), ing("greek-yogurt", 60, { follows: "eggs" })],
    method: [
      "Blend the batter: Peel the banana. Blend the oats, banana, eggs, milk and cinnamon in a blender, or in a jug with a stick blender, for 1 minute until smooth. Wash your hands after touching raw eggs.",
      "Rest the batter: Leave the batter for 5 minutes, so the oats soak up the milk and it thickens a little.",
      "Heat the pan: Spray a large non-stick frying pan with oil and heat it over a medium-low heat for 1 minute.",
      "Cook the pancakes: Drop in tablespoons of batter with space between them. Cook for 2 minutes, until bubbles appear and the edges are set, then flip and cook for 1 to 2 minutes more, until golden.",
      "Serve: Keep them warm on a plate while you cook the rest, spraying the pan again if needed. Serve with the yogurt for dipping.",
    ],
  },
  {
    id: "tuna-spring-onion-rice-balls", meal: "snack", tags: ["Fish", "Savoury", "Make ahead"], name: "Tuna and spring onion rice balls", blurb: "Soft rice pressed into balls round a lemony tuna and spring onion filling, with cucumber sticks.", servings: 3, minutes: 35,
    ingredients: [ing("rice", 150), ing("salt", 1), ing("tuna", 100, { note: "about 1 small tin, drained" }), ing("spring-onions", 20), ing("lemon-juice", 10), ing("black-pepper", 1), ing("cucumber", 150)],
    method: [
      "Start the rice: Rinse the rice and put it in a saucepan with a pinch of salt and enough cold water to cover it by about 2 cm.",
      "Cook the rice: Bring it to the boil, then cover and cook on a low heat for 15 to 18 minutes, until the water has gone and the rice is very soft and sticky.",
      "Cool the rice: Spread the rice out on a large plate and leave it for 10 minutes, until cool enough to handle.",
      "Make the filling: Drain the tuna well. Trim and finely slice the spring onions and mix them into the tuna with the lemon juice and a pinch of black pepper.",
      "Shape the balls: Wet your hands. Flatten a small handful of rice in your palm, put a spoonful of tuna in the middle and press the rice round it into a firm ball.",
      "Cut the cucumber: Rinse the cucumber and cut it into sticks about as thick as your finger.",
      "Serve: Serve the rice balls with the cucumber sticks. Keep any left over covered in the fridge and eat them the next day.",
    ],
  },
  {
    id: "tomato-mozzarella-pizza-toasts", meal: "snack", tags: ["Quick", "Savoury", "Italian"], name: "Tomato and mozzarella pizza toasts", blurb: "Toast spread with passata and oregano, topped with torn mozzarella and grilled until bubbling.", servings: 2, minutes: 12,
    // one slice each, held there (a whole slice can't shrink): the mozzarella is what Meal plan moves
    ingredients: [ing("bread", 80, { note: "about 2 slices", fit: [1, 1] }), ing("passata", 60), ing("oregano", 1), ing("mozzarella", 100, { role: "protein" })],
    method: [
      "Toast one side: Turn the grill on to medium-high. Toast the bread under it on one side only, until golden.",
      "Add the sauce: Turn the bread over and spread the passata over the untoasted side, right to the edges. Sprinkle over the oregano.",
      "Add the cheese: Drain the mozzarella, pat it dry with kitchen paper and tear it into small pieces. Scatter it over the passata.",
      "Grill: Grill for 3 to 4 minutes, until the cheese has melted and is bubbling with golden patches.",
      "Serve: Leave them for 1 minute, as the cheese is very hot, then cut each toast into fingers or triangles.",
    ],
  },

  // ---- small snacks that keep their protein (small days, cutting, smaller protein-first plans)
  {
    id: "cottage-cheese-apple-cinnamon-pots", meal: "snack", tags: ["Quick", "No cook", "Sweet"], name: "Cottage cheese with apple and cinnamon", blurb: "Cottage cheese topped with crisp chopped apple and a dusting of cinnamon.", servings: 2, minutes: 5,
    ingredients: [ing("apple", 150, { note: "about 1 apple", role: "carb" }), ing("cottage-cheese", 200), ing("cinnamon", 1)],
    method: [
      "Chop the apple: Rinse the apple, cut it into quarters and cut out the core. Chop it into small pieces, skin and all.",
      "Fill the pots: Spoon the cottage cheese into small bowls or pots.",
      "Top them: Pile the apple on top and dust with the cinnamon.",
      "Serve: Eat straight away, while the apple is crisp. If you are taking it with you, keep the apple separate and add it just before eating.",
    ],
  },
  {
    id: "coronation-tuna-lettuce-cups", meal: "snack", tags: ["Quick", "No cook", "Fish", "British"], name: "Coronation-style tuna lettuce cups", blurb: "Tuna in a mildly spiced yogurt with raisins, spooned into crisp lettuce cups.", servings: 2, minutes: 10,
    ingredients: [ing("tuna", 100, { note: "about 1 small tin, drained" }), ing("greek-yogurt", 50), ing("turmeric", 1), ing("cumin", 1), ing("lemon-juice", 5), ing("black-pepper", 1), ing("raisins", 30, { role: "carb" }), ing("lettuce", 100, { note: "about 1 small lettuce" })],
    method: [
      "Drain the tuna: Tip the tuna into a sieve and press it with a spoon to squeeze out as much water as you can.",
      "Make the sauce: Stir the yogurt, turmeric, cumin, lemon juice and a pinch of black pepper together in a bowl until smooth and pale yellow.",
      "Mix the filling: Flake in the tuna with a fork and stir in the raisins.",
      "Get the lettuce ready: Separate the lettuce into leaves, rinse them and pat them dry, choosing the cup-shaped ones.",
      "Fill and serve: Spoon the tuna into the lettuce cups and serve straight away, while the lettuce is crisp.",
    ],
  },
  {
    id: "tandoori-tofu-bites-cucumber-yogurt-naan", meal: "snack", tags: ["Bake", "Savoury", "Indian"], name: "Tandoori-style tofu bites with cucumber yogurt and naan", blurb: "Tofu cubes in a spiced yogurt coating, baked until golden, with cucumber yogurt and warm naan strips.", servings: 4, minutes: 40,
    // the yogurt coats the tofu and makes its dip, so it moves with the tofu
    ingredients: [ing("tofu", 280), ing("greek-yogurt", 160, { follows: "tofu" }), ing("turmeric", 1), ing("cumin", 2), ing("paprika", 2), ing("lemon-juice", 10), ing("salt", 1), ing("oil-spray", 1), ing("cucumber", 100), ing("naan", 100, { note: "about 2 naans", subs: [] })],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6). Line a baking tray with baking paper.",
      "Press the tofu: Drain the tofu, wrap it in a clean tea towel and press it under a heavy pan for 10 minutes. Cut it into cubes about 2 cm across.",
      "Coat the tofu: Mix half the yogurt with the turmeric, cumin, paprika, half the lemon juice and a pinch of salt. Turn the tofu in it until coated all over.",
      "Bake: Spread the cubes on the tray with gaps between them, spray them with oil and bake for 20 to 25 minutes, turning halfway, until golden and firm at the edges.",
      "Make the cucumber yogurt: Grate the cucumber, squeeze out the water and stir it into the rest of the yogurt with the rest of the lemon juice.",
      "Warm the naan: Warm the naans in the oven for the last 3 minutes, then cut them into strips.",
      "Serve: Serve the tofu bites warm, with the cucumber yogurt for dipping and the naan strips on the side.",
    ],
  },
  {
    id: "warm-berry-yogurt-toasted-oat-pots", meal: "snack", tags: ["Quick", "Sweet"], name: "Warm berry yogurt pots with toasted oats", blurb: "Thick cold yogurt topped with berries warmed with cinnamon and crunchy toasted oats.", servings: 2, minutes: 10,
    ingredients: [ing("oats", 30), ing("berries", 150), ing("cinnamon", 1), ing("greek-yogurt", 250, { role: "protein" })],
    method: [
      "Toast the oats: Put the oats in a dry frying pan over a medium heat and toast them for 3 to 4 minutes, stirring, until golden and smelling toasty. Tip them on to a plate.",
      "Warm the berries: Put the berries and cinnamon in a small pan over a low heat for 3 to 4 minutes, stirring now and then, until soft and juicy.",
      "Fill the pots: Spoon the yogurt into small bowls or glasses.",
      "Serve: Spoon the warm berries and their juice over the yogurt and scatter the toasted oats on top. Eat straight away.",
    ],
  },
  {
    id: "pea-sweetcorn-cheddar-frittata-fingers", meal: "snack", tags: ["Eggs", "Savoury", "Make ahead"], name: "Pea, sweetcorn and cheddar frittata fingers", blurb: "A thick frittata of eggs, peas, sweetcorn, spring onion and cheddar, cut into fingers to eat warm or cold.", servings: 4, minutes: 25,
    ingredients: [ing("spring-onions", 30), ing("cheddar", 40), ing("peas", 100), ing("sweetcorn", 100, { role: "carb" }), ing("eggs", 360, { note: "about 6 eggs" }), ing("black-pepper", 1), ing("olive-oil", 5)],
    method: [
      "Get ready: Trim and thinly slice the spring onions and grate the cheddar. Thaw the peas in a sieve under the hot tap and drain the sweetcorn if it is tinned.",
      "Whisk the eggs: Whisk the eggs in a large jug with a pinch of black pepper. Stir in the peas, sweetcorn, spring onions and most of the cheese. Wash your hands after touching raw eggs.",
      "Cook the bottom: Heat the oil in a non-stick frying pan about 20 cm across, with a heatproof handle, over a medium-low heat. Pour in the egg mix and cook for 8 to 10 minutes, without stirring, until the edges are set.",
      "Grill the top: Heat the grill to medium. Scatter the rest of the cheese on top and grill for 3 to 4 minutes, until golden and set in the middle.",
      "Cool and cut: Leave it for 5 minutes, then slide it on to a board and cut it into fingers. Eat warm or cold, and keep any left over covered in the fridge for up to 2 days.",
    ],
  },
  {
    id: "sweet-chilli-chicken-rice-lettuce-cups", meal: "snack", tags: ["Savoury"], name: "Sweet chilli chicken and rice lettuce cups", blurb: "Little lettuce cups filled with rice, sweet chilli chicken, cucumber and spring onion.", servings: 3, minutes: 25,
    ingredients: [ing("rice", 90), ing("chicken", 150), ing("olive-oil", 5), ing("sweet-chilli", 45), ing("cucumber", 100), ing("spring-onions", 20), ing("lettuce", 100, { note: "about 1 small lettuce" })],
    method: [
      "Cook the rice: Rinse the rice and cook it in a pan of boiling water for 10 to 12 minutes, until tender. Drain it well and spread it on a plate to cool a little.",
      "Cut the chicken: Cut the chicken into small pieces about 1 cm across. Wash your hands and the board after touching raw chicken.",
      "Cook the chicken: Heat the oil in a frying pan over a medium-high heat. Fry the chicken for 6 to 8 minutes, stirring, until golden, piping hot and no pink is left inside.",
      "Add the sauce: Take the pan off the heat and stir in the sweet chilli sauce until the chicken is coated.",
      "Get the rest ready: Rinse the cucumber and cut it into small dice. Trim and thinly slice the spring onions. Separate the lettuce into leaves, rinse and pat them dry.",
      "Fill and serve: Spoon a little rice into each lettuce cup, top with the chicken, cucumber and spring onions, and eat straight away.",
    ],
  },
  {
    id: "cottage-cheese-sweetcorn-tomato-pots", meal: "snack", tags: ["Quick", "No cook", "Savoury"], name: "Cottage cheese, sweetcorn and tomato pots", blurb: "Cottage cheese topped with sweetcorn, cherry tomatoes and cucumber, with olive oil, oregano and black pepper.", servings: 2, minutes: 10,
    ingredients: [ing("sweetcorn", 100, { role: "carb" }), ing("cherry-tomatoes", 100), ing("cucumber", 100), ing("cottage-cheese", 200), ing("olive-oil", 5), ing("oregano", 1), ing("black-pepper", 1)],
    method: [
      "Drain the sweetcorn: Drain the sweetcorn if it is tinned. If it is frozen, thaw it in a sieve under the hot tap for 1 minute and shake it dry.",
      "Chop the salad: Rinse the cherry tomatoes and cucumber. Cut the tomatoes into quarters and the cucumber into small dice, then mix them with the sweetcorn.",
      "Fill the pots: Spoon the cottage cheese into small bowls and pile the sweetcorn salad on top.",
      "Finish and serve: Drizzle over the oil, sprinkle with the oregano and a pinch of black pepper, and eat straight away.",
    ],
  },
  {
    id: "frozen-yogurt-banana-bites", meal: "snack", tags: ["Make ahead", "Sweet"], name: "Frozen yogurt-dipped banana bites", blurb: "Banana slices coated in cinnamon yogurt and frozen into cold, creamy bites.", servings: 2, minutes: 15,
    ingredients: [ing("banana", 240, { note: "about 2 bananas", role: "carb" }), ing("cinnamon", 1), ing("greek-yogurt", 150, { role: "protein" })],
    method: [
      "Line a tray: Line a small tray or plate that fits in your freezer with baking paper.",
      "Slice the bananas: Peel the bananas and cut them into rounds about 1 cm thick.",
      "Coat them: Stir the cinnamon into the yogurt. Dip each banana slice in the yogurt with a fork until coated, let the extra drip off and put it on the paper.",
      "Freeze: Spoon any yogurt left over on top of the slices, then freeze for at least 2 hours, until firm.",
      "Serve: Leave them for 2 to 3 minutes before eating, so they soften a little. Keep the rest in a box with a lid in the freezer for up to a month.",
    ],
  },

  // ---- vegan (four without soya, four without gluten; the overnight oat pots, the soya rice pudding and the peanut butter shake above are vegan too)
  {
    id: "smashed-chickpea-sweetcorn-lettuce-cups", meal: "snack", tags: ["Quick", "No cook", "Vegan", "Savoury"], name: "Smashed chickpea and sweetcorn lettuce cups", blurb: "Chickpeas crushed with lemon, cumin and olive oil, mixed with sweetcorn and cucumber in crisp lettuce cups.", servings: 2, minutes: 10,
    ingredients: [ing("chickpeas", 240, { note: "about 1 tin, drained" }), ing("sweetcorn", 100, { role: "carb" }), ing("olive-oil", 5), ing("lemon-juice", 10), ing("cumin", 1), ing("salt", 1), ing("cucumber", 100), ing("lettuce", 100, { note: "about 1 small lettuce" }), ing("paprika", 1)],
    method: [
      "Drain the chickpeas: Rinse the chickpeas in a sieve and shake off the water. Drain the sweetcorn too if it is tinned.",
      "Smash them: Put the chickpeas in a bowl with the oil, lemon juice, cumin and a pinch of salt. Crush them roughly with a fork or potato masher, leaving some whole.",
      "Add the crunch: Rinse the cucumber, cut it into small dice and stir it into the chickpeas with the sweetcorn.",
      "Get the lettuce ready: Separate the lettuce into leaves, rinse them and pat them dry, choosing the cup-shaped ones.",
      "Fill and serve: Spoon the chickpea mix into the lettuce cups, dust with the paprika and eat straight away.",
    ],
  },
  {
    id: "mexican-style-bean-sweetcorn-salsa-pots", meal: "snack", tags: ["Quick", "No cook", "Vegan", "Savoury", "Mexican"], name: "Mexican-style bean and sweetcorn salsa pots", blurb: "Kidney beans and sweetcorn tossed with salsa, cherry tomatoes, lemon, cumin and paprika.", servings: 2, minutes: 10,
    ingredients: [ing("kidney-beans", 240, { note: "about 1 tin, drained" }), ing("sweetcorn", 100, { role: "carb" }), ing("cherry-tomatoes", 100), ing("salsa", 60), ing("lemon-juice", 10), ing("cumin", 1), ing("paprika", 1), ing("salt", 1)],
    method: [
      "Drain the beans: Rinse the beans in a sieve under the cold tap and shake off the water. Drain the sweetcorn too if it is tinned.",
      "Chop the tomatoes: Rinse the cherry tomatoes and cut them into quarters.",
      "Mix it together: Put the beans, sweetcorn and tomatoes in a bowl with the salsa, lemon juice, cumin, paprika and a pinch of salt. Stir gently until everything is coated.",
      "Serve: Spoon into small bowls or pots and eat straight away, or cover and keep in the fridge for up to 2 days. Stir again before eating.",
    ],
  },
  {
    id: "crispy-tofu-nuggets-sweet-chilli", meal: "snack", tags: ["Bake", "Vegan", "Savoury"], name: "Crispy tofu nuggets with sweet chilli dip", blurb: "Bite-sized tofu coated in paprika breadcrumbs, baked until crisp, with sweet chilli sauce to dip.", servings: 3, minutes: 40,
    ingredients: [ing("tofu", 280), ing("bread", 80, { note: "about 2 slices" }), ing("paprika", 2), ing("salt", 1), ing("soya-drink", 60), ing("oil-spray", 1), ing("sweet-chilli", 45)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6). Line a baking tray with baking paper.",
      "Press the tofu: Drain the tofu, wrap it in a clean tea towel and press it under a heavy pan for 10 minutes. Cut it into bite-sized pieces.",
      "Make the crumbs: Tear the bread into a blender and blitz it into fine crumbs, or grate it on a coarse grater. Mix in the paprika and a pinch of salt.",
      "Coat the tofu: Pour the soya drink into a bowl. Dip each piece of tofu in it, then roll it in the crumbs, pressing them on all over, and put it on the tray.",
      "Bake: Spray the pieces with oil and bake for 20 minutes, turning halfway, until golden and crisp.",
      "Serve: Serve hot, with the sweet chilli sauce in a small bowl for dipping.",
    ],
  },
  {
    id: "chickpea-apple-chaat", meal: "snack", tags: ["Quick", "No cook", "Vegan", "Savoury", "Indian"], name: "Chickpea and apple chaat", blurb: "A tangy street-food-style salad of chickpeas, crisp apple, cherry tomatoes and cucumber with lemon, cumin and paprika.", servings: 2, minutes: 10,
    ingredients: [ing("chickpeas", 240, { note: "about 1 tin, drained" }), ing("apple", 150, { note: "about 1 apple", role: "carb" }), ing("cherry-tomatoes", 150), ing("cucumber", 100), ing("lemon-juice", 15), ing("cumin", 2), ing("paprika", 1), ing("salt", 1)],
    method: [
      "Drain the chickpeas: Rinse the chickpeas in a sieve under the cold tap and shake off the water.",
      "Chop the fruit and salad: Rinse the apple, cherry tomatoes and cucumber. Core the apple and cut it into small dice, skin and all. Quarter the tomatoes and dice the cucumber.",
      "Mix the chaat: Toss the chickpeas, apple, tomatoes and cucumber in a bowl with the lemon juice, cumin, paprika and a pinch of salt.",
      "Serve: Spoon into small bowls and eat straight away, or cover and keep in the fridge for up to a day. The lemon stops the apple going brown.",
    ],
  },
  {
    id: "houmous-toast-crispy-paprika-chickpeas", meal: "snack", tags: ["Quick", "Vegan", "Savoury"], name: "Houmous toast with crispy paprika chickpeas", blurb: "Toast spread with houmous and topped with cucumber and chickpeas fried until crisp with paprika.", servings: 2, minutes: 15,
    // one slice each, held there (a whole slice can't shrink): the crispy chickpeas are what Meal plan moves
    ingredients: [ing("chickpeas", 120), ing("olive-oil", 5), ing("paprika", 1), ing("salt", 1), ing("bread", 80, { note: "about 2 slices", fit: [1, 1] }), ing("cucumber", 60), ing("houmous", 40)],
    method: [
      "Dry the chickpeas: Rinse and drain the chickpeas, then pat them dry on kitchen paper.",
      "Fry them: Heat the oil in a frying pan over a medium-high heat. Fry the chickpeas for 5 to 6 minutes, shaking the pan, until golden and starting to crisp. Stir in the paprika and a pinch of salt.",
      "Toast the bread: Toast the bread until golden brown on both sides.",
      "Slice the cucumber: Rinse the cucumber and cut it into thin rounds.",
      "Top and serve: Spread the houmous over the toast, lay the cucumber on top and pile on the warm chickpeas. Eat straight away.",
    ],
  },
  {
    id: "peanut-butter-chickpea-cookie-dough-banana", meal: "snack", tags: ["Quick", "No cook", "Vegan", "Sweet"], name: "Peanut butter chickpea cookie dough with banana", blurb: "A thick, sweet dip of chickpeas blended with peanut butter, cinnamon and raisins, with banana to scoop.", servings: 4, minutes: 15,
    ingredients: [ing("chickpeas", 240, { note: "about 1 tin, drained" }), ing("peanut-butter", 60, { role: "protein" }), ing("cinnamon", 2), ing("raisins", 30), ing("banana", 240, { note: "about 2 bananas", role: "carb" })],
    method: [
      "Drain the chickpeas: Rinse the chickpeas in a sieve, shake off the water and pat them dry with kitchen paper.",
      "Blend: Put the chickpeas, peanut butter, cinnamon and half the raisins in a blender or tall jug with 2 tablespoons of cold water. Blend for 1 to 2 minutes, scraping down the sides, until thick and smooth.",
      "Add the raisins: Stir in the rest of the raisins and spoon the cookie dough into small bowls.",
      "Slice the bananas: Peel the bananas and cut them into thick rounds just before eating, so they don't go brown.",
      "Serve: Serve the cookie dough with the banana for scooping. Keep any left over covered in the fridge for up to 3 days.",
    ],
  },

  // ---- made ahead: muffins for a lunchbox or picnic, cheesecake pots for the fridge
  {
    id: "cheese-sweetcorn-oat-muffins", meal: "snack", tags: ["Bake", "Make ahead", "Savoury"], name: "Cheese and sweetcorn oat muffins", blurb: "Savoury baked muffins of blended oats, eggs, milk, cheddar, sweetcorn and spring onion.", servings: 6, minutes: 35,
    // the milk makes the batter with the oats, so it moves with them
    ingredients: [ing("oil-spray", 1), ing("oats", 150), ing("eggs", 240, { note: "about 4 eggs" }), ing("milk", 150, { follows: "oats" }), ing("black-pepper", 1), ing("spring-onions", 30), ing("cheddar", 60), ing("sweetcorn", 100)],
    method: [
      "Heat the oven: Turn the oven on to 190°C (170°C fan, gas 5). Spray the holes of a 12-hole muffin tin well with oil.",
      "Blend the oats: Blitz the oats in a blender until they look like coarse flour.",
      "Mix the batter: Whisk the eggs and milk in a large bowl, then stir in the blended oats and a pinch of black pepper. Wash your hands after touching raw eggs.",
      "Add the filling: Trim and thinly slice the spring onions and grate the cheddar. Stir them into the batter with the sweetcorn, keeping a little cheese back.",
      "Fill the tin: Spoon the batter into the holes and scatter the cheese you kept on top.",
      "Bake: Bake for 18 to 20 minutes, until risen, golden and set in the middle. A knife pushed into one should come out clean.",
      "Cool and serve: Leave them in the tin for 5 minutes, then lift them out. Eat warm or cold, and keep them covered in the fridge for up to 3 days.",
    ],
  },
  {
    id: "berry-cheesecake-pots", meal: "snack", tags: ["Quick", "No cook", "Sweet"], name: "Berry cheesecake pots", blurb: "Smooth cottage cheese whipped with honey and lemon over a crushed wholewheat biscuit base, topped with berries.", servings: 2, minutes: 10,
    ingredients: [ing("cottage-cheese", 200), ing("honey", 15), ing("lemon-juice", 5), ing("wheat-biscuits", 38, { note: "about 2 biscuits" }), ing("berries", 100)],
    method: [
      "Whip the cheese: Put the cottage cheese, honey and lemon juice in a tall jug and blend with a stick blender for about 1 minute, until smooth. No blender? Mash it hard with a fork.",
      "Make the base: Crumble the biscuits into the bottom of small glasses or pots and press them down lightly.",
      "Add the filling: Spoon the whipped cottage cheese over the biscuit base and smooth the top.",
      "Top and serve: Spoon the berries on top. Eat straight away, or cover and chill for up to a day; the base softens as it sits.",
    ],
  },

  // ---- vegan snacks that keep their protein on a small day (tofu carries it; a carb Meal plan can halve or double)
  {
    id: "berry-banana-tofu-pudding-pots", meal: "snack", tags: ["Quick", "No cook", "Vegan", "Sweet"], name: "Berry and banana tofu pudding pots", blurb: "A thick, smooth pudding of tofu blended with banana, berries and cinnamon, topped with more berries.", servings: 2, minutes: 10,
    // the soya drink loosens the tofu, and the berries are blended with the banana, so each moves with the one it goes with
    ingredients: [ing("tofu", 200), ing("banana", 120, { note: "about 1 banana", role: "carb" }), ing("berries", 150, { follows: "banana" }), ing("soya-drink", 60, { follows: "tofu" }), ing("lemon-juice", 5), ing("cinnamon", 1)],
    method: [
      "Drain the tofu: Pour the water off the tofu, pat it dry with kitchen paper and break it into chunks.",
      "Get the fruit ready: Peel the banana and break it into pieces. If the berries are frozen, thaw them in a bowl in the microwave for 1 minute.",
      "Blend: Put the tofu, banana, half the berries, the soya drink, lemon juice and cinnamon in a blender or tall jug. Blend for 1 to 2 minutes, scraping down the sides, until completely smooth and thick.",
      "Fill the pots: Spoon the pudding into small glasses or pots and pile the rest of the berries on top.",
      "Serve: Eat straight away, or cover and keep in the fridge for up to a day. It thickens a little more as it chills.",
    ],
  },
  {
    id: "sweetcorn-chickpea-tofu-fritters", meal: "snack", tags: ["Vegan", "Savoury"], name: "Sweetcorn, chickpea and tofu fritters with sweet chilli", blurb: "Little golden fritters of mashed tofu and chickpeas with sweetcorn, spring onion and cumin, with sweet chilli sauce to dip.", servings: 4, minutes: 25,
    // the chickpeas hold the fritters together with the sweetcorn, so they move as the carb while the tofu carries the protein
    ingredients: [ing("tofu", 200), ing("chickpeas", 240, { note: "about 1 tin, drained", role: "carb" }), ing("sweetcorn", 160, { role: "carb" }), ing("spring-onions", 30), ing("cumin", 2), ing("paprika", 1), ing("salt", 1), ing("oil-spray", 1), ing("sweet-chilli", 40)],
    method: [
      "Get ready: Drain the tofu and pat it dry with kitchen paper. Rinse the chickpeas in a sieve and shake them dry. Drain the sweetcorn if it is tinned, or thaw it if frozen.",
      "Mash: Put the tofu and chickpeas in a large bowl and mash them with a potato masher or fork for 2 to 3 minutes, until mostly smooth and sticky.",
      "Mix in the rest: Trim and thinly slice the spring onions. Stir them into the mash with the sweetcorn, cumin, paprika and a pinch of salt.",
      "Shape the fritters: With damp hands, squeeze the mixture into walnut-sized balls and flatten each one into a patty about 1 cm thick, pressing firmly so it holds together.",
      "Fry the fritters: Spray a large non-stick frying pan well with oil and set it over a medium heat. Fry the fritters in batches for 3 to 4 minutes a side, until golden and crisp.",
      "Serve: Serve warm, with the sweet chilli sauce in a small bowl for dipping. Keep any left over covered in the fridge for up to 2 days.",
    ],
  },
  {
    id: "mushroom-tofu-pate-toast-fingers", meal: "snack", tags: ["Quick", "Vegan", "Savoury"], name: "Mushroom and tofu pâté with toast fingers", blurb: "A smooth, savoury spread of fried mushrooms, garlic and herbs blended with tofu, with warm toast fingers to spread it on.", servings: 5, minutes: 15,
    // four slices cut into fingers for five, so Meal plan can add or take away part of a slice
    ingredients: [ing("mushrooms", 250), ing("olive-oil", 10), ing("garlic", 5, { note: "about 1 clove" }), ing("mixed-herbs", 1), ing("tofu", 280), ing("soy", 10), ing("lemon-juice", 10), ing("black-pepper", 1), ing("bread", 160, { note: "about 4 slices" })],
    method: [
      "Slice the mushrooms: Wipe the mushrooms clean with kitchen paper and slice them thinly, if they aren't sliced already.",
      "Fry the mushrooms: Heat the oil in a large frying pan over a medium-high heat. Fry the mushrooms for 6 to 8 minutes, stirring, until golden and all their juice has cooked away.",
      "Add the flavour: Stir in the garlic and herbs and cook for 1 minute more, then take the pan off the heat.",
      "Blend the pâté: Drain the tofu, pat it dry and break it into a tall jug or blender. Add the mushrooms, soy sauce, lemon juice and a pinch of black pepper, and blend until smooth and thick.",
      "Toast the bread: Toast the bread until golden brown on both sides and cut each slice into fingers.",
      "Serve: Spoon the pâté into a small bowl and serve with the warm toast fingers for spreading. Keep any left over covered in the fridge for up to 3 days.",
    ],
  },

  // ---- small protein snacks with no milk (eggs, chicken, fish), for cutting, GLP-1 and small days
  {
    id: "korean-style-soy-marinated-eggs-rice", meal: "snack", tags: ["Eggs", "Savoury", "Make ahead"], name: "Korean-style soy-marinated eggs with rice", blurb: "Boiled eggs soaked in a sweet soy, garlic and spring onion marinade, halved over warm rice with cucumber.", servings: 6, minutes: 25,
    ingredients: [ing("eggs", 360, { note: "about 6 eggs" }), ing("spring-onions", 30), ing("soy", 60), ing("honey", 15), ing("garlic", 5, { note: "about 1 clove" }), ing("chilli-powder", 1), ing("rice", 120), ing("cucumber", 150)],
    method: [
      "Boil the eggs: Lower the eggs into a pan of boiling water on a spoon and boil them for 8 minutes, until the whites are set and the yolks are just firm. Wash your hands after touching raw eggs.",
      "Cool and peel: Move the eggs into a bowl of cold water for 5 minutes, then crack and peel them carefully.",
      "Make the marinade: Trim and thinly slice the spring onions. In a small box with a lid, stir the soy sauce, honey, garlic and chilli powder with the same amount of cold water as soy sauce, then add the spring onions.",
      "Marinate: Put the peeled eggs in the marinade and turn them so they are coated. Cover and keep in the fridge for at least 2 hours, or overnight, turning them once.",
      "Cook the rice: Rinse the rice and cook it in a pan of boiling water for 10 to 12 minutes, until tender, then drain it well.",
      "Slice the cucumber: Rinse the cucumber and cut it into thin rounds.",
      "Serve: Spoon the warm rice into small bowls, halve the eggs and lay them on top with the cucumber. Spoon over a little of the marinade and spring onions. Eat the eggs within 3 days.",
    ],
  },
  {
    id: "paprika-chicken-bites-sweetcorn-salsa", meal: "snack", tags: ["Quick", "Savoury"], name: "Paprika chicken bites with sweetcorn salsa", blurb: "Bite-sized pieces of chicken fried with paprika and cumin, with a sweetcorn, cherry tomato and red onion salsa sharpened with lemon.", servings: 4, minutes: 15,
    // the sweetcorn is the filling part of the salsa, so Meal plan moves it as the carb
    ingredients: [ing("chicken", 160), ing("paprika", 2), ing("cumin", 1), ing("salt", 1), ing("black-pepper", 1), ing("oil-spray", 1), ing("sweetcorn", 240, { role: "carb" }), ing("cherry-tomatoes", 150), ing("red-onion", 40), ing("lemon-juice", 15)],
    method: [
      "Cut the chicken: Cut the chicken into bite-sized pieces about 2 cm across. Wash your hands and the board after touching raw chicken.",
      "Season it: Toss the chicken in a bowl with the paprika, cumin and a pinch of salt and black pepper until coated all over.",
      "Cook the chicken: Spray a large non-stick frying pan with oil and set it over a medium-high heat. Fry the chicken for 6 to 8 minutes, turning, until golden, piping hot and no pink is left inside.",
      "Get the salsa ready: While the chicken cooks, drain the sweetcorn if it is tinned. Rinse and quarter the cherry tomatoes, and peel and finely chop the red onion.",
      "Mix the salsa: Stir the sweetcorn, tomatoes and onion together in a bowl with the lemon juice.",
      "Serve: Pile the warm chicken on a plate with cocktail sticks and serve the salsa alongside. Keep any left over covered in the fridge for up to 2 days.",
    ],
  },

  // ---- vegan with no soya and no gluten (beans and chickpeas carry the protein, rice the carbs)
  {
    id: "smoky-bean-rice-cakes-salsa", meal: "snack", tags: ["Vegan", "Savoury"], name: "Smoky bean and rice cakes with salsa", blurb: "Crisp little cakes of mashed kidney beans and soft rice with spring onion, paprika and cumin, topped with tomato salsa.", servings: 4, minutes: 35,
    ingredients: [ing("rice", 100), ing("kidney-beans", 240, { note: "about 1 tin, drained" }), ing("spring-onions", 30), ing("paprika", 2), ing("cumin", 2), ing("salt", 1), ing("oil-spray", 1), ing("salsa", 100)],
    method: [
      "Cook the rice: Rinse the rice and cook it in a pan of boiling water for 12 to 15 minutes, until very soft. Drain it well and spread it on a plate to cool for 5 minutes.",
      "Mash the beans: Rinse the beans in a sieve and shake them dry. Mash them in a large bowl with a potato masher or fork until mostly smooth.",
      "Mix: Trim and thinly slice the spring onions. Stir them into the beans with the rice, paprika, cumin and a pinch of salt, pressing the rice down so the mixture sticks together.",
      "Shape the cakes: With damp hands, shape the mixture into small flat cakes about 1.5 cm thick, squeezing each one firmly.",
      "Fry the cakes: Spray a large non-stick frying pan well with oil and set it over a medium heat. Fry the cakes for 4 to 5 minutes a side, turning them gently, until golden and crisp.",
      "Serve: Serve warm, with the salsa spooned on top. Keep any left over covered in the fridge for up to 2 days and warm them through in the pan.",
    ],
  },
];

export const WAVE2_SNACKS_LOOKS: Readonly<Record<string, string>> = {
  "banana-honey-toast-cinnamon-yogurt": "Two slices of golden wholemeal toast on a round white plate, each spread thickly with pale cinnamon-flecked yogurt and covered with overlapping rounds of banana, drizzled with glossy golden honey and cut into fingers.",
  "cinnamon-raisin-rice-pudding-pots": "Four small white ramekins of thick, creamy rice pudding, the soft grains glossy with milk, dotted with plump dark raisins and dusted on top with warm brown cinnamon.",
  "banana-cinnamon-soya-overnight-oat-pots": "Two small clear glass pots filled to the top with thick, creamy soaked oats, pale beige and streaked with mashed banana, the smooth surfaces dusted with brown cinnamon.",
  "banana-oat-cinnamon-milkshake": "Two tall glasses of thick, pale cream-coloured banana milkshake seen from straight above, the smooth frothy tops flecked with tiny bits of oat and dusted with brown cinnamon.",
  "warm-cinnamon-apple-toast-yogurt": "Two slices of golden wholemeal toast on a white plate, spread with thick white yogurt and piled with soft, glossy warm apple slices with their red and green skins on, dusted with brown cinnamon.",
  "banana-berry-soya-rice-pudding": "A wide shallow white bowl of creamy pale rice pudding speckled with cinnamon, topped with soft, juicy warm red and purple berries bleeding deep purple juice into the pudding.",
  "banana-granola-yogurt-pots": "Two clear glass pots seen from above, filled with thick white yogurt dusted with cinnamon, layered with rounds of banana and topped with a generous scatter of golden crunchy granola clusters.",
  "cottage-cheese-berry-honey-toast": "Fingers of wholemeal toast on a round white plate, each piled with creamy white cottage cheese and studded with red and purple berries, drizzled with glossy golden honey.",
  "crushed-egg-spring-onion-toast-fingers": "Fingers of golden wholemeal toast in a neat row on a white plate, each topped with roughly crushed boiled egg, yellow yolk and white flecked with green spring onion rings and dusted with red paprika.",
  "tuna-sweetcorn-lemon-toast-fingers": "Fingers of golden wholemeal toast on a white plate, each piled with a creamy mix of flaked pale tuna and bright yellow sweetcorn kernels, speckled with cracked black pepper.",
  "berry-lassi": "Two tall glasses of thick, smooth pinky-purple berry lassi seen from straight above, the creamy round tops filling each glass, with a few whole red and purple berries resting on the surface.",
  "peanut-butter-banana-soya-shake": "Two tall glasses of thick, smooth pale caramel-coloured banana and peanut butter shake seen from straight above, the creamy round tops dusted with a pinch of brown cinnamon.",
  "smoked-salmon-cottage-cheese-cucumber-toast": "Fingers of wholemeal toast on a white plate, spread with creamy white cottage cheese, topped with thin pale green cucumber rounds and loose pink ruffles of smoked salmon, scattered with cracked black pepper.",
  "mini-banana-oat-pancakes-yogurt": "A stack of small round golden-brown pancakes on a white plate, flecked with oats and banana, beside a little white bowl of thick white yogurt for dipping.",
  "tuna-spring-onion-rice-balls": "Six round white rice balls on a white plate, one broken open to show a filling of flaked pale tuna flecked with green spring onion, beside a neat pile of pale green cucumber sticks.",
  "tomato-mozzarella-pizza-toasts": "Two slices of wholemeal toast on a wooden board spread with deep red passata, covered with melted torn mozzarella bubbling white with golden patches, sprinkled with dried green oregano and cut into fingers.",
  "cottage-cheese-apple-cinnamon-pots": "Two small white bowls of creamy white cottage cheese, each topped with a pile of small chopped apple pieces with red and green skin, dusted with warm brown cinnamon.",
  "coronation-tuna-lettuce-cups": "Crisp pale green lettuce cups on a white plate, each filled with flaked tuna in a creamy pale yellow spiced yogurt sauce, dotted with plump dark raisins and specks of black pepper.",
  "tandoori-tofu-bites-cucumber-yogurt-naan": "Orange-red cubes of spiced baked tofu with darker toasted edges on a white plate, beside a small bowl of white yogurt flecked with grated pale green cucumber and a pile of warm golden naan strips.",
  "warm-berry-yogurt-toasted-oat-pots": "Two small glass bowls of thick white yogurt topped with soft, glossy warm red and purple berries in their deep purple juice and a scatter of golden toasted oats.",
  "pea-sweetcorn-cheddar-frittata-fingers": "Thick fingers of golden frittata on a wooden board, the cut sides showing set yellow egg studded with bright green peas, yellow sweetcorn and spring onion, the tops browned with melted cheddar.",
  "sweet-chilli-chicken-rice-lettuce-cups": "Crisp pale green lettuce cups on a white plate, each filled with white rice, glossy red-orange sweet chilli chicken pieces, small cubes of cucumber and thin rings of green spring onion.",
  "cottage-cheese-sweetcorn-tomato-pots": "Two small white bowls of creamy cottage cheese topped with bright yellow sweetcorn, quartered red cherry tomatoes and small cubes of pale green cucumber, glossy with olive oil and sprinkled with dried oregano and black pepper.",
  "frozen-yogurt-banana-bites": "Rows of round banana slices coated in thick white yogurt flecked with cinnamon, frozen firm and frosty on a sheet of baking paper on a small tray.",
  "smashed-chickpea-sweetcorn-lettuce-cups": "Crisp pale green lettuce cups on a white plate, each filled with roughly crushed golden chickpeas mixed with bright yellow sweetcorn and small cubes of pale green cucumber, dusted with red paprika.",
  "mexican-style-bean-sweetcorn-salsa-pots": "Two small white bowls heaped with glossy dark red kidney beans, bright yellow sweetcorn and quartered red cherry tomatoes, coated in chunky red salsa and dusted with cumin and red paprika.",
  "crispy-tofu-nuggets-sweet-chilli": "Bite-sized golden-brown breadcrumbed tofu nuggets with crisp, crunchy coats piled on a white plate, beside a small white bowl of glossy red-orange sweet chilli sauce for dipping.",
  "chickpea-apple-chaat": "A shallow white bowl of golden chickpeas tossed with small cubes of apple with red and green skin, quartered red cherry tomatoes and diced pale green cucumber, dusted with cumin and red paprika.",
  "houmous-toast-crispy-paprika-chickpeas": "Two slices of golden wholemeal toast on a white plate, spread with creamy beige houmous, layered with thin pale green cucumber rounds and piled with crisp, paprika-red fried chickpeas.",
  "peanut-butter-chickpea-cookie-dough-banana": "A small white bowl of thick, smooth golden-brown peanut butter cookie dough studded with dark raisins and dusted with cinnamon, surrounded on a plate by thick rounds of pale yellow banana.",
  "cheese-sweetcorn-oat-muffins": "Six golden-brown savoury oat muffins on a white plate, their domed tops crusted with melted cheddar, one broken open to show a soft, set inside studded with yellow sweetcorn and green spring onion.",
  "berry-cheesecake-pots": "Two small clear glass pots seen from above, filled with smooth white whipped cottage cheese over a crumbly brown biscuit base, topped with glossy red and purple berries.",
  "berry-banana-tofu-pudding-pots": "Two small clear glass pots filled with thick, smooth pinky-purple tofu pudding flecked with cinnamon, each topped with a heap of glossy whole red and purple berries.",
  "sweetcorn-chickpea-tofu-fritters": "Small round golden-brown fritters with crisp edges on a white plate, flecked with yellow sweetcorn kernels and green spring onion, beside a small white bowl of glossy red-orange sweet chilli sauce.",
  "mushroom-tofu-pate-toast-fingers": "A small white bowl of smooth, speckled pale brown mushroom and tofu pâté with a swirled top, flecked with green herbs, beside a pile of golden wholemeal toast fingers on a white plate.",
  "korean-style-soy-marinated-eggs-rice": "Small white bowls of white rice topped with halved boiled eggs, their whites stained deep amber from the soy marinade and their yolks just set and golden-orange, with thin cucumber rounds and green spring onion rings glistening with dark marinade.",
  "paprika-chicken-bites-sweetcorn-salsa": "Bite-sized pieces of golden, paprika-red fried chicken piled on a white plate beside a small white bowl of salsa made of bright yellow sweetcorn, quartered red cherry tomatoes and finely chopped purple red onion.",
  "smoky-bean-rice-cakes-salsa": "Small round golden-brown bean and rice cakes with crisp edges on a white plate, speckled dark red with kidney beans and green with spring onion, each topped with a spoonful of chunky red tomato salsa.",
};

export const WAVE2_SNACKS_CUISINES: ReadonlyArray<readonly [string, CuisineId]> = [
  ["cinnamon-raisin-rice-pudding-pots", "british"],
  ["coronation-tuna-lettuce-cups", "british"],
  ["berry-lassi", "indian"],
  ["tandoori-tofu-bites-cucumber-yogurt-naan", "indian"],
  ["chickpea-apple-chaat", "indian"],
  ["tomato-mozzarella-pizza-toasts", "italian"],
  ["mexican-style-bean-sweetcorn-salsa-pots", "mexican"],
  ["houmous-toast-crispy-paprika-chickpeas", "middle-eastern"],
];

export const WAVE2_SNACKS_OCCASIONS: ReadonlyArray<readonly [string, OccasionId]> = [
  ["tuna-spring-onion-rice-balls", "picnic"],
  ["pea-sweetcorn-cheddar-frittata-fingers", "picnic"],
  ["chickpea-apple-chaat", "picnic"],
  ["cheese-sweetcorn-oat-muffins", "picnic"],
  ["tuna-spring-onion-rice-balls", "lunchbox"],
  ["pea-sweetcorn-cheddar-frittata-fingers", "lunchbox"],
  ["cheese-sweetcorn-oat-muffins", "lunchbox"],
  ["pea-sweetcorn-cheddar-frittata-fingers", "party-food"],
  ["crispy-tofu-nuggets-sweet-chilli", "party-food"],
  ["tomato-mozzarella-pizza-toasts", "party-food"],
  ["tandoori-tofu-bites-cucumber-yogurt-naan", "party-food"],
  ["coronation-tuna-lettuce-cups", "party-food"],
  ["sweet-chilli-chicken-rice-lettuce-cups", "party-food"],
  ["smashed-chickpea-sweetcorn-lettuce-cups", "party-food"],
  ["sweetcorn-chickpea-tofu-fritters", "party-food"],
  ["sweetcorn-chickpea-tofu-fritters", "lunchbox"],
  ["korean-style-soy-marinated-eggs-rice", "lunchbox"],
  ["paprika-chicken-bites-sweetcorn-salsa", "party-food"],
  ["paprika-chicken-bites-sweetcorn-salsa", "lunchbox"],
  ["smoky-bean-rice-cakes-salsa", "party-food"],
  ["smoky-bean-rice-cakes-salsa", "lunchbox"],
];
