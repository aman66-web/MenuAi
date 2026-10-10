import { ing, type Recipe } from "../recipes";

// Breakfasts. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const BREAKFAST: readonly Recipe[] = [
  {
    id: "berry-skyr-porridge", meal: "breakfast", tags: ["Porridge"], name: "Berry porridge with skyr", blurb: "Creamy oats topped with cool skyr and berries.", servings: 1, minutes: 8,
    ingredients: [ing("oats", 50), ing("milk", 200), ing("skyr", 100, { role: "protein" }), ing("berries", 80)],
    method: ["Heat the oats and milk in a pan, stirring, for 4 to 5 minutes until thick and creamy.", "Spoon into a bowl and top with the skyr and berries."],
    extras: ["A pinch of cinnamon"],
  },
  {
    id: "peanut-banana-porridge", meal: "breakfast", tags: ["Porridge", "Vegan"], name: "Peanut butter and banana porridge", blurb: "Oats cooked in oat drink with a swirl of peanut butter and sliced banana.", servings: 2, minutes: 10,
    ingredients: [ing("oats", 100), ing("oat-drink", 400), ing("peanut-butter", 30)],
    method: ["Heat the oats and oat drink in a pan, stirring, for 4 to 5 minutes until thick and creamy.", "Divide between two bowls.", "Swirl the peanut butter through and top with the sliced banana."],
    extras: ["A banana, sliced", "A pinch of cinnamon"],
  },
  {
    id: "smoked-salmon-eggs", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Smoked salmon and scrambled eggs", blurb: "Soft scrambled eggs with ribbons of smoked salmon.", servings: 2, minutes: 10,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("smoked-salmon", 100)],
    method: ["Beat the eggs in a jug with a little black pepper.", "Pour into a non-stick pan over a low heat and stir slowly for 3 to 4 minutes, until the eggs are just set.", "Take off the heat, fold in the smoked salmon torn into strips and serve straight away."],
    extras: ["Fresh chives, snipped", "Black pepper", "A little oil spray"],
  },
  {
    id: "spanish-omelette", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Spanish-style omelette with potatoes and peas", blurb: "A thick, golden omelette to cut into wedges.", servings: 3, minutes: 25,
    ingredients: [ing("eggs", 360, { note: "about 6 eggs" }), ing("new-potatoes", 300), ing("peas", 120), ing("olive-oil", 10)],
    method: ["Drain the potatoes and cut them into thick slices.", "Heat the oil in a non-stick frying pan and fry the potatoes and onion for 5 minutes until golden.", "Stir in the peas, then pour in the beaten eggs.", "Cook over a low heat for 8 to 10 minutes, until the edges are set.", "Put the pan under a hot grill for 2 to 3 minutes, until the top is set and golden, then cut into wedges."],
    extras: ["An onion, thinly sliced", "Fresh parsley", "Salt and black pepper"],
  },
  {
    id: "breakfast-burrito", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Black bean breakfast burritos", blurb: "Scrambled eggs, beans, cheese and salsa rolled up in a warm wrap.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("black-beans", 235), ing("wraps", 120), ing("cheddar", 40), ing("salsa", 60)],
    method: ["Warm the drained beans in a small pan with the cumin, then lightly crush them with a fork.", "Beat the eggs and scramble them gently in a non-stick pan until set.", "Warm the wraps, then fill each with beans, egg, grated cheese and salsa.", "Fold in the sides, roll up and cut in half."],
    extras: ["A pinch of ground cumin", "Fresh coriander", "A handful of spinach"],
  },
  {
    id: "bacon-egg-wraps", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Bacon and egg breakfast wraps", blurb: "Grilled bacon and scrambled egg in a warm wrap.", servings: 2, minutes: 15,
    ingredients: [ing("bacon", 120), ing("eggs", 240, { note: "about 4 eggs" }), ing("wraps", 120)],
    method: ["Grill the bacon for 4 to 5 minutes on each side, until cooked through.", "Beat the eggs and scramble them gently in a non-stick pan until set.", "Warm the wraps and fill with the bacon, eggs and tomato slices, then roll up."],
    extras: ["A tomato, sliced", "A handful of spinach", "Black pepper"],
  },
  {
    id: "greek-yogurt-granola", meal: "breakfast", tags: ["Quick"], name: "Greek yogurt granola bowl", blurb: "Thick yogurt with crunchy granola, berries and a drizzle of honey.", servings: 1, minutes: 5,
    ingredients: [ing("greek-yogurt", 200, { role: "protein" }), ing("granola", 45), ing("berries", 80), ing("honey", 10)],
    method: ["Spoon the yogurt into a bowl.", "Top with the granola and berries, then drizzle with the honey."],
    extras: ["A few fresh mint leaves"],
  },
  {
    id: "cottage-cheese-berries", meal: "breakfast", tags: ["Quick"], name: "Cottage cheese, berries, honey and seeds", blurb: "A no-cook bowl with sweet berries and crunchy seeds.", servings: 1, minutes: 5,
    ingredients: [ing("cottage-cheese", 200), ing("berries", 100), ing("honey", 10), ing("mixed-seeds", 15)],
    method: ["Spoon the cottage cheese into a bowl.", "Top with the berries, drizzle with the honey and scatter over the seeds."],
    extras: ["A pinch of cinnamon"],
  },
  {
    id: "wheat-biscuits-berries", meal: "breakfast", tags: ["Quick"], name: "Wholewheat biscuits with milk and berries", blurb: "A classic bowl of cereal with fruit on top.", servings: 1, minutes: 3,
    ingredients: [ing("wheat-biscuits", 40), ing("milk", 200), ing("berries", 80)],
    method: ["Put the biscuits in a bowl and pour over the milk.", "Top with the berries and eat straight away, or leave for a minute to soften."],
    extras: ["A sliced banana"],
  },
  {
    id: "shakshuka", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Shakshuka with feta", blurb: "Eggs baked in a spiced tomato and pepper sauce.", servings: 2, minutes: 25,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("chopped-tomatoes", 400), ing("feta", 50)],
    method: ["Soften the onion, pepper and garlic in a wide pan with a little oil for 5 minutes.", "Stir in the cumin, paprika and tomatoes and simmer for 10 minutes until thick.", "Make four hollows in the sauce and crack an egg into each.", "Cover and cook gently for 6 to 8 minutes, until the whites are set.", "Crumble the feta over the top and scatter with herbs."],
    extras: ["An onion, sliced", "A red pepper, sliced", "A clove of garlic", "Ground cumin and smoked paprika", "Fresh coriander or parsley", "A little oil"],
  },
  {
    id: "beans-poached-eggs", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Baked beans with poached eggs", blurb: "Warm beans topped with soft poached eggs.", servings: 2, minutes: 12,
    ingredients: [ing("baked-beans", 415), ing("eggs", 240, { note: "about 4 eggs" })],
    method: ["Heat the beans in a small pan, stirring now and then, until piping hot.", "Bring a pan of water to a gentle simmer, crack in the eggs one at a time and poach for 3 to 4 minutes, until the whites are set.", "Spoon the beans into two bowls and lift the eggs on top with a slotted spoon."],
    extras: ["Black pepper", "A handful of spinach"],
  },
  {
    id: "ham-cheese-omelette", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Ham and cheese omelette", blurb: "A folded omelette with ham and melting cheddar.", servings: 1, minutes: 10,
    ingredients: [ing("eggs", 180, { note: "about 3 eggs" }), ing("ham", 50), ing("cheddar", 25)],
    method: ["Beat the eggs with a little black pepper.", "Pour into a hot non-stick pan and cook for 2 to 3 minutes, pulling the edges into the middle, until almost set.", "Scatter the torn ham and grated cheese over one half.", "Fold the omelette over and cook for another minute, until set and the cheese has melted."],
    extras: ["Black pepper", "Fresh chives", "A little oil spray"],
  },
  {
    id: "tofu-scramble", meal: "breakfast", tags: ["Vegan", "Brunch"], name: "Tofu scramble with baked beans", blurb: "Crumbled tofu fried with turmeric and spinach, with beans on the side.", servings: 2, minutes: 15,
    ingredients: [ing("tofu", 300), ing("baked-beans", 415)],
    method: ["Pat the tofu dry with kitchen paper and crumble it with your fingers.", "Fry in a non-stick pan with a little oil, the turmeric and garlic for 5 to 6 minutes until lightly golden.", "Stir in the spinach until it wilts.", "Meanwhile heat the beans in a small pan until piping hot, and serve alongside."],
    extras: ["A pinch of ground turmeric", "A clove of garlic, crushed", "A handful of spinach", "Black pepper", "A little oil"],
  },
  {
    id: "oat-pancakes", meal: "breakfast", tags: ["Brunch"], name: "Oat pancakes with yogurt and berries", blurb: "Fluffy pancakes made from blended oats, eggs and milk.", servings: 2, minutes: 20,
    ingredients: [ing("oats", 100), ing("eggs", 120, { note: "about 2 eggs" }), ing("milk", 100), ing("greek-yogurt", 150), ing("berries", 120)],
    method: ["Blend the oats, eggs and milk until smooth, then leave for 5 minutes to thicken.", "Heat a non-stick frying pan with a little oil spray and add small ladles of batter.", "Cook for about 2 minutes until bubbles appear and the underside is golden.", "Flip and cook for 1 to 2 minutes more, until golden and cooked through.", "Serve topped with the yogurt and berries."],
    extras: ["A pinch of cinnamon", "A little oil spray"],
  },
  {
    id: "huevos-rancheros", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Huevos rancheros", blurb: "Fried eggs on warm wraps with crushed beans and salsa.", servings: 2, minutes: 20,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("kidney-beans", 240), ing("salsa", 100), ing("wraps", 120)],
    method: ["Warm the drained beans in a small pan with the cumin and a splash of water, then crush them with a fork.", "Fry the eggs in a non-stick pan with a little oil spray until the whites are set.", "Warm the wraps and lay one flat on each plate.", "Spread with the beans, top with the eggs and spoon over the salsa."],
    extras: ["A pinch of ground cumin", "Fresh coriander", "A squeeze of lime", "A little oil spray"],
  },
  {
    id: "bircher-muesli", meal: "breakfast", tags: ["Make ahead", "Vegan"], name: "Apple Bircher muesli", blurb: "Oats soaked overnight in oat drink with grated apple and almonds.", servings: 2, minutes: 10,
    ingredients: [ing("oats", 100), ing("oat-drink", 250), ing("almonds", 20), ing("raisins", 20)],
    method: ["Grate the apple and stir it into the oats, oat drink, raisins and a squeeze of lemon in a bowl.", "Cover and leave in the fridge overnight.", "In the morning, stir well, add a splash more oat drink if it is too thick, and top with the chopped almonds."],
    extras: ["An apple", "A squeeze of lemon", "A pinch of cinnamon"],
  },
  {
    id: "mackerel-kedgeree", meal: "breakfast", tags: ["Brunch"], name: "Smoked mackerel kedgeree", blurb: "Curried rice with flaked smoked mackerel, peas and boiled eggs.", servings: 2, minutes: 30,
    ingredients: [ing("rice", 150), ing("mackerel", 160), ing("eggs", 120, { note: "about 2 eggs" }), ing("peas", 100)],
    method: ["Cook the rice as the pack says, adding the peas for the last 3 minutes, then drain.", "Boil the eggs for 8 to 9 minutes, until the yolks are set, then cool, peel and cut into quarters.", "Soften the onion in a large pan with a little oil, then stir in the curry powder.", "Add the rice and peas and the mackerel flaked into pieces, and stir over the heat until piping hot.", "Serve topped with the eggs and parsley."],
    extras: ["An onion, chopped", "A teaspoon of curry powder", "Fresh parsley", "A squeeze of lemon", "A little oil"],
  },
  {
    id: "black-bean-potato-hash", meal: "breakfast", tags: ["Vegan", "Brunch"], name: "Black bean and potato hash", blurb: "Crispy potatoes, peppers and black beans with tomato salsa.", servings: 2, minutes: 20,
    ingredients: [ing("new-potatoes", 300), ing("black-beans", 235), ing("salsa", 100), ing("olive-oil", 10)],
    method: ["Drain the potatoes and cut them in half.", "Heat the oil in a large non-stick pan and fry the potatoes for 8 to 10 minutes, turning, until golden.", "Add the pepper, onion and spices and cook for 3 minutes more.", "Stir in the drained beans and cook until piping hot, then spoon the salsa over."],
    extras: ["A red pepper, chopped", "An onion, chopped", "Smoked paprika and ground cumin", "Fresh coriander"],
  },
];
