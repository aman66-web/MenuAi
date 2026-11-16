import { ing, type Recipe } from "../recipes";

// Gluten-free breakfasts, lunches and dinners (eggs, potatoes, rice, chicken and fish): no ingredient here contains gluten. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const GLUTEN_FREE: readonly Recipe[] = [
  // ---- breakfast
  {
    id: "crispy-potato-cakes-fried-eggs", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Crispy potato cakes with fried eggs", blurb: "Crisp golden potato cakes topped with fried eggs and warm cherry tomatoes.", servings: 2, minutes: 25,
    ingredients: [ing("new-potatoes", 345), ing("eggs", 240, { note: "about 4 eggs" }), ing("spring-onions", 30), ing("cherry-tomatoes", 150), ing("vegetable-oil", 20), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Mash the potatoes: Drain the potatoes, pat them dry with kitchen paper and mash them in a bowl until mostly smooth, with only a few small lumps.",
      "Mix in the spring onions: Slice the spring onions thinly and stir them into the potatoes with a pinch of salt and black pepper.",
      "Shape the cakes: Squeeze the mix into flat round cakes, each about the size of your palm and 2 cm thick, pressing them firmly so they hold together.",
      "Fry the cakes: Heat most of the oil in a large non-stick frying pan over a medium heat. Fry the cakes for 4 to 5 minutes on each side, turning them gently once with a flat spatula, until golden and crisp.",
      "Warm the tomatoes: Cut the cherry tomatoes in half and add them to the edge of the pan for the last 3 minutes, until soft. Move the cakes and tomatoes to a warm plate.",
      "Fry the eggs: Add the rest of the oil to the pan and crack in the eggs, then wash your hands. Fry for 3 to 4 minutes, until the whites are completely set with no clear egg left.",
      "Serve: Put the potato cakes and tomatoes on warm plates and lay the eggs on top. Eat straight away, while the cakes are crisp.",
    ],
  },
  {
    id: "pepper-spinach-cheddar-frittata", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Pepper, spinach and cheddar frittata", blurb: "A thick egg frittata with sweet pepper, spinach and melted cheddar, cut into wedges.", servings: 3, minutes: 25,
    // one frying pan holds at most half as many eggs again
    ingredients: [ing("eggs", 360, { note: "about 6 eggs", fit: [0.5, 1.5] }), ing("peppers", 160, { note: "about 1 pepper" }), ing("spinach", 80), ing("cheddar", 45), ing("olive-oil", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Get ready: Cut the pepper in half, pull out the stalk and seeds, and chop it into small pieces. Grate the cheddar and turn the grill on to medium-high.",
      "Beat the eggs: Crack the eggs into a bowl, add a pinch of salt and black pepper and beat with a fork until smooth. Wash your hands after touching the raw eggs.",
      "Soften the pepper: Heat the oil in a non-stick frying pan, about 24 cm across, over a medium heat. Fry the pepper for 4 to 5 minutes, stirring now and then, until soft.",
      "Wilt the spinach: Add the spinach a handful at a time and stir for 1 to 2 minutes, until it shrinks down. Spread everything out evenly and turn the heat down low.",
      "Cook the frittata: Pour in the eggs and scatter the cheddar over the top. Cook without stirring for 6 to 8 minutes, until the edges are set and the base is golden.",
      "Finish under the grill: Grill the frittata in its pan for 2 to 3 minutes, until the top is completely set and golden. If the pan's handle can't go under the grill, cover the pan with a lid for 5 minutes instead.",
      "Serve: Leave it to stand for 2 minutes, then slide it onto a board and cut it into wedges. Eat it warm or cold.",
    ],
  },
  {
    id: "ham-pepper-egg-cups", meal: "breakfast", tags: ["Eggs", "Make ahead"], name: "Baked egg cups with ham and peppers", blurb: "Little baked egg cups with ham, pepper and spring onion, made in a muffin tin.", servings: 2, minutes: 30,
    ingredients: [ing("eggs", 360, { note: "about 6 eggs" }), ing("ham", 100), ing("peppers", 160, { note: "about 1 pepper" }), ing("spring-onions", 30), ing("oil-spray", 2), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 180°C (160°C fan, gas 4). Spray the holes of a muffin tin with the oil spray, one hole for each egg.",
      "Chop the fillings: Cut the pepper in half, pull out the stalk and seeds, and chop it small. Slice the spring onions thinly and tear the ham into small pieces.",
      "Fill the tin: Share the pepper, spring onions and ham evenly between the oiled holes.",
      "Add the eggs: Beat the eggs in a jug with a pinch of black pepper and pour them over the fillings, filling each hole about three-quarters full. Wash your hands after touching the raw eggs.",
      "Bake the egg cups: Bake on the middle shelf for 15 to 18 minutes, until puffed and completely set in the middle.",
      "Serve: Leave them for 2 minutes, then run a knife round each one and lift it out. Eat them warm or cold.",
    ],
  },
  {
    id: "mushroom-cheddar-omelette", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Mushroom and cheddar omelette", blurb: "A folded omelette filled with golden mushrooms and melting cheddar.", servings: 1, minutes: 15,
    ingredients: [ing("eggs", 180, { note: "about 3 eggs" }), ing("mushrooms", 100), ing("cheddar", 25), ing("oil-spray", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Get ready: Wipe the mushrooms clean and slice them thinly. Grate the cheddar onto a plate.",
      "Fry the mushrooms: Spray a small non-stick frying pan with the oil spray and put it over a medium-high heat. Fry the mushrooms for 4 to 5 minutes, stirring now and then, until golden. Tip them onto the plate.",
      "Beat the eggs: Crack the eggs into a bowl, add a pinch of salt and black pepper and beat with a fork until smooth. Wash your hands after touching the raw eggs.",
      "Cook the omelette: Spray the pan again and turn the heat to medium. Pour in the eggs and cook for 2 to 3 minutes, pulling the set edges into the middle, until almost set.",
      "Add the filling: Scatter the mushrooms and cheddar over one half of the omelette. Cook for 1 minute more, until the cheese starts to melt and the egg is completely set.",
      "Fold and serve: Fold the empty half over the filling and slide the omelette onto a warm plate. Eat it straight away.",
    ],
  },
  // ---- lunch
  {
    id: "tuna-egg-potato-salad", meal: "lunch", tags: ["Salad", "Fish"], name: "Tuna, egg and new potato salad", blurb: "New potatoes, tuna, boiled eggs and tomatoes in a lemon and mustard dressing.", servings: 2, minutes: 25,
    ingredients: [ing("tuna", 200), ing("eggs", 120, { note: "about 2 eggs" }), ing("new-potatoes", 345), ing("cherry-tomatoes", 150), ing("salad-leaves", 40), ing("spring-onions", 30), ing("olive-oil", 15), ing("lemon-juice", 15), ing("mustard", 5), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Boil the eggs: Half-fill a small pan with water and bring it to the boil. Lower in the eggs gently and boil them for 9 to 10 minutes, until the whites and yolks are completely set. Wash your hands after touching the raw eggs.",
      "Prepare the potatoes: Drain the potatoes, cut any large ones in half and put them in a large bowl.",
      "Add the vegetables: Cut the cherry tomatoes in half and slice the spring onions thinly. Add them to the potatoes.",
      "Make the dressing: Mix the oil, lemon juice, mustard and a pinch of salt and black pepper in a mug with a fork until thick.",
      "Cool the eggs: Drain the eggs and run cold water over them for 2 minutes. Peel them and cut them into quarters.",
      "Add the tuna: Drain the tuna and break it into large flakes over the potatoes. Pour over the dressing and turn everything gently until coated.",
      "Serve: Spread the salad leaves on plates, spoon the salad on top and finish with the egg quarters.",
    ],
  },
  {
    id: "chicken-sweetcorn-rice-salad", meal: "lunch", tags: ["Salad", "Make ahead"], name: "Chicken, sweetcorn and rice salad", blurb: "Rice, paprika chicken, sweetcorn and crunchy vegetables in a lemon dressing.", servings: 2, minutes: 30,
    ingredients: [ing("chicken", 250), ing("rice", 120), ing("sweetcorn", 160), ing("peppers", 160, { note: "about 1 pepper" }), ing("cucumber", 100), ing("spring-onions", 30), ing("lemon-juice", 20), ing("olive-oil", 15), ing("paprika", 2), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Cook the rice in a large pan of boiling water for the time on the pack (usually 10 to 12 minutes), until soft. If the sweetcorn is frozen, add it for the last 2 minutes.",
      "Cool the rice: Drain the rice in a sieve and rinse it under the cold tap until it is cold. Leave it in the sieve to drain well.",
      "Coat the chicken: Cut the chicken into bite-sized pieces and mix them with the paprika, a pinch of salt and half the oil. Wash your hands, the knife and the board after handling the raw chicken.",
      "Fry the chicken: Heat a non-stick frying pan over a medium-high heat. Fry the chicken for 8 to 10 minutes, turning it now and then, until golden and piping hot with no pink left. Leave it to cool.",
      "Chop the vegetables: Take the stalk and seeds out of the pepper, then chop it and the cucumber into small pieces. Slice the spring onions thinly and drain the sweetcorn if it is tinned.",
      "Make the dressing: Mix the lemon juice, the rest of the oil and a pinch of black pepper in a large bowl.",
      "Toss it together: Add the rice, chicken, sweetcorn, pepper, cucumber and spring onions to the bowl and stir until everything is coated.",
      "Serve: Eat it straight away, or cover it and put it in the fridge within an hour. Eat it within a day.",
    ],
  },
  {
    id: "broccoli-cheddar-soup", meal: "lunch", tags: ["Soup", "Make ahead"], name: "Broccoli and cheddar soup", blurb: "A smooth, thick broccoli soup with melted cheddar stirred through.", servings: 3, minutes: 35,
    // the potatoes cook in the method's own 700 ml of water: fitting moves them at most half as much again, or the soup turns to mash
    ingredients: [ing("broccoli", 400), ing("new-potatoes", 345, { fit: [0.5, 1.5] }), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("stock-cube", 12), ing("cheddar", 75), ing("milk", 150), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Chop the vegetables: Peel and chop the onion. Cut the broccoli into small florets and slice the stalk thinly. Drain the potatoes and cut any large ones in half.",
      "Soften the onion: Heat the oil in a large saucepan over a medium heat. Fry the onion for 5 to 8 minutes, stirring now and then, until soft but not brown.",
      "Add the garlic: Stir in the garlic purée and cook for 1 minute, stirring so it doesn't burn.",
      "Make the stock: Crumble the stock cubes into a heatproof jug and stir in 700 ml of boiling water until they dissolve.",
      "Simmer the soup: Add the broccoli, potatoes and stock to the pan and bring it to the boil. Turn the heat down and simmer for 10 to 12 minutes, until the broccoli stalks are soft.",
      "Blend the soup: Take the pan off the heat, stir in the milk and blend with a stick blender until smooth. For a chunkier soup, mash it with a potato masher instead.",
      "Melt in the cheese: Grate the cheddar and stir most of it into the soup over a low heat until it melts. Don't let the soup boil.",
      "Serve: Season with black pepper, ladle the soup into warm bowls and scatter the rest of the cheddar on top.",
    ],
  },
  {
    id: "salmon-potato-salad-cucumber-yogurt", meal: "lunch", tags: ["Salad", "Fish"], name: "Salmon and new potato salad with a cucumber yogurt dressing", blurb: "Baked salmon flakes and warm new potatoes with a cool cucumber and yogurt dressing.", servings: 2, minutes: 25,
    ingredients: [ing("salmon", 240), ing("new-potatoes", 345), ing("cucumber", 150), ing("natural-yogurt", 120), ing("lemon-juice", 15), ing("salad-leaves", 40), ing("spring-onions", 30), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and line a baking tray with baking paper.",
      "Bake the salmon: Put the salmon on the tray skin-side down, add a pinch of salt and black pepper, then wash your hands. Bake for 12 to 15 minutes, until it is opaque and flakes easily.",
      "Warm the potatoes: Drain the potatoes and simmer them in a pan of boiling water for 5 minutes, until hot all the way through. Drain them and cut them in half.",
      "Make the dressing: Grate the cucumber, squeeze out the water with your hands and mix it with the yogurt, lemon juice and a pinch of salt.",
      "Slice the spring onions: Trim the spring onions and slice them thinly. Stir half of them into the warm potatoes.",
      "Flake the salmon: Lift the salmon off its skin and break it into large flakes.",
      "Serve: Spread the salad leaves on plates and add the potatoes and salmon. Spoon the dressing over and scatter the rest of the spring onions on top.",
    ],
  },
  // ---- dinner
  {
    id: "lemon-garlic-chicken-potatoes", meal: "dinner", tags: ["One pan", "Roast"], name: "Lemon and garlic chicken with potatoes and broccoli", blurb: "Chicken, potatoes and broccoli roasted together in lemon, garlic and oregano.", servings: 2, minutes: 45,
    ingredients: [ing("chicken", 300), ing("new-potatoes", 345), ing("broccoli", 200), ing("lemon-juice", 30), ing("garlic", 10, { note: "about 2 cloves" }), ing("olive-oil", 15), ing("oregano", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and get out a large roasting tin.",
      "Make the lemon mix: Stir the lemon juice, garlic purée, oil, oregano and a pinch of salt and black pepper together in a large bowl.",
      "Coat the chicken: Cut the chicken into large chunks and turn them in the lemon mix until coated. Wash your hands, the knife and the board after handling the raw chicken.",
      "Coat the potatoes: Drain the potatoes, pat them dry with kitchen paper and cut them in half. Add them to the bowl and stir until coated.",
      "Roast the chicken: Tip everything into the roasting tin in a single layer. Roast on the middle shelf for 15 minutes, until the potatoes start to turn golden.",
      "Prepare the broccoli: While it roasts, cut the broccoli into small florets.",
      "Add the broccoli: Take the tin out using oven gloves, add the broccoli and turn everything over in the juices. Roast for 12 to 15 minutes more, until the broccoli is tender and browned at the edges.",
      "Check the chicken: Cut into the thickest piece to check that it is piping hot with no pink left. If it is not, roast for 5 minutes more and check again.",
      "Serve: Spoon the chicken, potatoes and broccoli onto warm plates and pour over the juices from the tin.",
    ],
  },
  {
    id: "chicken-biryani-style-rice", meal: "dinner", tags: ["Indian", "One pot"], name: "Chicken biryani-style rice", blurb: "Spiced chicken, rice and peas cooked together in one pot, with yogurt on the side.", servings: 3, minutes: 50,
    // the rice cooks in the method's own 450 ml of water, so fitting leaves it as written
    ingredients: [ing("chicken", 400), ing("rice", 220, { role: "other" }), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("curry-powder", 6), ing("cumin", 2), ing("turmeric", 2), ing("peas", 120), ing("vegetable-oil", 15), ing("salt", 1), ing("natural-yogurt", 150)],
    method: [
      "Get ready: Peel the onion and slice it thinly. Cut the chicken into bite-sized pieces, then wash your hands, the knife and the board after handling the raw chicken.",
      "Brown the onion: Heat the oil in a large deep pan with a lid over a medium heat. Fry the onion for 8 to 10 minutes, stirring now and then, until soft and golden brown.",
      "Add the chicken and spices: Add the chicken, garlic purée, curry powder, cumin and turmeric. Cook for 5 minutes, stirring often, until the chicken is white on the outside.",
      "Add the rice: Rinse the rice in a sieve under the cold tap. Stir it into the pan for 1 minute, until every grain is coated in the spices.",
      "Simmer with the lid on: Pour in 450 ml of boiling water, add a pinch of salt and bring it to the boil. Put the lid on, turn the heat down low and cook for 15 minutes without stirring.",
      "Add the peas: Scatter the frozen peas over the top, put the lid back on and cook for 5 minutes more, until the rice is soft and the water has soaked in. If the rice is still hard, add a splash of boiling water.",
      "Check the chicken: Cut into the biggest piece to check that it is piping hot with no pink left. If it is not, cook with the lid on for 3 minutes more.",
      "Rest the rice: Take the pan off the heat and leave it with the lid on for 5 minutes. Fluff up the rice gently with a fork.",
      "Serve: Spoon the biryani into warm bowls and serve the yogurt on the side.",
    ],
  },
  {
    id: "paprika-chicken-peppers-rice", meal: "dinner", tags: ["One pan", "Bowl"], name: "Paprika chicken with peppers and rice", blurb: "Chicken and soft peppers in a rich paprika and tomato sauce, served on rice.", servings: 2, minutes: 40,
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("peppers", 320, { note: "about 2 peppers" }), ing("onion", 150, { note: "about 1 onion" }), ing("chopped-tomatoes", 400), ing("paprika", 6), ing("garlic", 10, { note: "about 2 cloves" }), ing("olive-oil", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Chop the vegetables: Peel the onion and slice it thinly. Cut the peppers in half, pull out the stalks and seeds, and slice them into strips.",
      "Cut up the chicken: Cut the chicken into bite-sized pieces, then wash your hands, the knife and the board after handling the raw chicken.",
      "Brown the chicken: Heat the oil in a large deep frying pan over a medium-high heat. Fry the chicken for 4 to 5 minutes, turning now and then, until golden on the outside. Lift it onto a plate.",
      "Soften the peppers: Add the onion and peppers to the pan and cook for 6 to 8 minutes, stirring now and then, until soft.",
      "Add the garlic and paprika: Stir in the garlic purée and paprika and cook for 1 minute, stirring so they don't burn.",
      "Simmer the sauce: Pour in the chopped tomatoes, put the chicken back and add a pinch of salt and black pepper. Bring it to the boil, then simmer gently for 15 minutes, until thick.",
      "Cook the rice: While the sauce simmers, cook the rice in a pan of boiling water for the time on the pack (usually 10 to 12 minutes), until soft. Drain it well.",
      "Check the chicken: Cut into the thickest piece to check that it is piping hot with no pink left. If it is not, simmer for 3 minutes more.",
      "Serve: Spoon the rice into warm bowls and top it with the paprika chicken and peppers.",
    ],
  },
  {
    id: "salmon-lemon-rice-broccoli", meal: "dinner", tags: ["Fish", "Quick"], name: "Salmon with lemon rice and broccoli", blurb: "Baked salmon with rice tossed in lemon and spring onions, and tender broccoli.", servings: 2, minutes: 30,
    ingredients: [ing("salmon", 240), ing("rice", 150), ing("broccoli", 200), ing("lemon-juice", 30), ing("spring-onions", 30), ing("olive-oil", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and line a baking tray with baking paper.",
      "Bake the salmon: Put the salmon on the tray skin-side down, add a pinch of salt and black pepper, then wash your hands. Bake for 12 to 15 minutes, until it is opaque and flakes easily.",
      "Cook the rice: While the salmon bakes, cook the rice in a large pan of boiling water for the time on the pack (usually 10 to 12 minutes), until soft.",
      "Cook the broccoli: Cut the broccoli into florets and boil it in a small pan of water for 4 to 5 minutes, until a knife slides easily into a stalk. Drain it.",
      "Slice the spring onions: Trim the spring onions and slice them thinly.",
      "Make the lemon rice: Drain the rice well and stir in the lemon juice, oil, spring onions and a pinch of salt and black pepper.",
      "Check the salmon: Press it gently with a fork. It should flake easily and be opaque all the way through, so bake it for 2 to 3 minutes more if not.",
      "Serve: Spoon the lemon rice onto warm plates and add the salmon and broccoli.",
    ],
  },
];

// How each of these recipes looks from directly above (the same rules as looks.ts).
export const GLUTEN_FREE_LOOKS: Readonly<Record<string, string>> = {
  "crispy-potato-cakes-fried-eggs": "Two round, golden-brown potato cakes flecked with green spring onion on a white round plate, each topped with a fried egg with a set white and bright yellow yolk, with soft halved red cherry tomatoes beside them.",
  "pepper-spinach-cheddar-frittata": "A thick round frittata on a white round plate with one wedge cut and eased slightly apart, its golden top spotted with melted orange cheddar, the cut sides showing soft red pepper pieces and dark green spinach set in yellow egg.",
  "ham-pepper-egg-cups": "Three round baked egg cups on a white plate, puffed and golden at the edges, their set yellow tops dotted with small pieces of red pepper, torn pink ham and thin rings of green spring onion.",
  "mushroom-cheddar-omelette": "A folded half-moon omelette on a round white plate, smooth and pale golden on top, with golden-brown sliced mushrooms and melted orange cheddar spilling from the open edge.",
  "tuna-egg-potato-salad": "A shallow white bowl of green salad leaves topped with halved new potatoes, large flakes of pale pink tuna and halved red cherry tomatoes, glossy with a mustard dressing, with boiled egg quarters showing set yellow yolks and thin green spring onion rings.",
  "chicken-sweetcorn-rice-salad": "A wide white bowl of white rice mixed with golden paprika-dusted chicken pieces, bright yellow sweetcorn, small cubes of red pepper and green cucumber, and thin rings of green spring onion, glossy with a lemon dressing.",
  "broccoli-cheddar-soup": "A round white bowl of smooth, thick pale green broccoli soup with darker green flecks, a small heap of grated orange cheddar melting in the centre and a scatter of cracked black pepper.",
  "salmon-potato-salad-cucumber-yogurt": "A wide white plate of green salad leaves topped with warm halved new potatoes and large flakes of pink baked salmon, with a thick white yogurt dressing flecked with pale green grated cucumber spooned over and thin green spring onion rings.",
  "lemon-garlic-chicken-potatoes": "A round white plate of golden roasted chicken chunks, halved new potatoes browned at the edges and roasted broccoli florets with crisp darker tips, all glossy with lemon and garlic juices and flecked with dried oregano and black pepper.",
  "chicken-biryani-style-rice": "A wide white bowl heaped with fluffy golden-yellow spiced rice mixed through with chicken pieces, soft browned onion and green peas, with a small white bowl of thick natural yogurt beside it.",
  "paprika-chicken-peppers-rice": "A wide white bowl of fluffy white rice topped with golden chicken pieces and soft strips of red pepper in a thick, glossy brick-red paprika and tomato sauce with softened onion.",
  "salmon-lemon-rice-broccoli": "A round white plate with a baked salmon fillet, pink and opaque with a golden top, beside a mound of fluffy white rice flecked with green spring onion and glossy with lemon, and bright green broccoli florets.",
};

// Suggested lines for niches.ts (cuisine and occasions), for the lead to add: [id, kind, value]
export const GLUTEN_FREE_NICHE_SUGGESTIONS: ReadonlyArray<[string, "cuisine" | "occasion", string]> = [
  ["crispy-potato-cakes-fried-eggs", "cuisine", "british"],
  ["broccoli-cheddar-soup", "cuisine", "british"],
  ["chicken-biryani-style-rice", "cuisine", "indian"],
  ["pepper-spinach-cheddar-frittata", "occasion", "picnic"],
  ["pepper-spinach-cheddar-frittata", "occasion", "lunchbox"],
  ["ham-pepper-egg-cups", "occasion", "picnic"],
  ["ham-pepper-egg-cups", "occasion", "lunchbox"],
  ["ham-pepper-egg-cups", "occasion", "party-food"],
  ["tuna-egg-potato-salad", "occasion", "picnic"],
  ["tuna-egg-potato-salad", "occasion", "lunchbox"],
  ["tuna-egg-potato-salad", "occasion", "summer-barbecue"],
  ["chicken-sweetcorn-rice-salad", "occasion", "picnic"],
  ["chicken-sweetcorn-rice-salad", "occasion", "lunchbox"],
  ["chicken-sweetcorn-rice-salad", "occasion", "summer-barbecue"],
  ["salmon-potato-salad-cucumber-yogurt", "occasion", "picnic"],
  ["salmon-potato-salad-cucumber-yogurt", "occasion", "summer-barbecue"],
  ["broccoli-cheddar-soup", "occasion", "bonfire-night"],
];
