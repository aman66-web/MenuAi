import { ing, type Recipe } from "../recipes";

// More lunches and dinners for vegetarian, fish-eating (pescatarian) and halal diets: meat-free, fish and halal-friendly chicken and beef dishes. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const MORE_MAINS: readonly Recipe[] = [
  // ---- lunches
  {
    id: "cheese-onion-potato-cakes", meal: "lunch", tags: ["British", "Salad"], name: "Cheese and onion potato cakes with salad", blurb: "Golden potato cakes with cheddar and spring onion, served with a crunchy side salad.", servings: 2, minutes: 35,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): grated, rösti-style cakes with lacy edges and melted cheddar on top.
    // the cheese and egg bind the potato, so they move with it when the recipe is fitted
    ingredients: [ing("new-potatoes", 690), ing("cheddar", 80, { follows: "new-potatoes" }), ing("eggs", 60, { follows: "new-potatoes", note: "1 egg" }), ing("spring-onions", 30), ing("oil-spray", 2), ing("salad-leaves", 60), ing("cherry-tomatoes", 150), ing("cucumber", 100), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Grate the potatoes: Drain the potatoes and pat them dry. Grate them on the large holes of the grater into a large bowl.",
      "Add cheese and spring onions: Grate the cheddar and slice the spring onions into thin rings. Stir most of the cheddar and the spring onions into the potato with a pinch of salt and black pepper.",
      "Bind with the egg: Beat the egg in a cup with a fork and stir it into the potato until the mixture holds together. Wash your hands after touching the raw egg.",
      "Shape the cakes: Press the mixture firmly into flat round cakes about the size of your palm and 2 cm thick, leaving the edges ragged so they crisp.",
      "Chill the cakes: Put them on a plate in the fridge for 10 minutes, so they hold together in the pan.",
      "Fry the cakes: Spray a large non-stick frying pan with the oil spray and heat it over a medium heat until hot. Add the cakes with space between them and fry for 4 to 5 minutes without moving them, until golden brown and crisp underneath.",
      "Turn the cakes: Turn them carefully with a fish slice and scatter the rest of the cheddar on top. Cover the pan and fry for 4 to 5 minutes more, until golden brown underneath and the cheese has melted.",
      "Check they are cooked: Break one cake open. It should be steaming hot in the middle, with the egg set and no wet mixture.",
      "Make the salad: Cut the cherry tomatoes in half and slice the cucumber into rounds. Put them on plates with the salad leaves.",
      "Serve: Put the potato cakes next to the salad and serve while they are hot.",
    ],
  },
  {
    id: "spinach-soft-cheese-pasta", meal: "lunch", tags: ["Pasta", "Quick"], name: "Spinach and soft cheese pasta", blurb: "Pasta in a creamy garlic and soft cheese sauce with wilted spinach.", servings: 2, minutes: 20,
    // the sauce follows the pasta, so there is always enough to coat it
    ingredients: [ing("pasta-shapes", 160), ing("soft-cheese", 120, { follows: "pasta-shapes" }), ing("spinach", 120), ing("cheddar", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Boil the water: Fill a large pan with water, add the salt and bring it to the boil over a high heat.",
      "Cook the pasta: Add the pasta and cook it for the time on the pack, usually 10 to 12 minutes, stirring once or twice, until soft with no hard centre.",
      "Prepare the cheese and spinach: While the pasta cooks, grate the cheddar finely and rinse the spinach in a colander.",
      "Save some water: Scoop out a mugful of the pasta water, then drain the pasta in a colander.",
      "Make the sauce: Put the empty pan back on a low heat. Add the garlic and a splash of the pasta water and let it bubble for 30 seconds, until it smells sweet. Stir in the soft cheese for 1 to 2 minutes, until smooth.",
      "Wilt the spinach: Add the spinach a handful at a time and stir for about 2 minutes, until it is soft and dark green.",
      "Mix it together: Tip the pasta back into the pan and stir until every piece is coated. Add a little more pasta water if the sauce is too thick: it should be smooth and glossy, not stiff.",
      "Serve: Spoon the pasta into warm bowls, scatter the cheddar on top and finish with a pinch of black pepper.",
    ],
  },
  {
    id: "tuna-melt-wraps", meal: "lunch", tags: ["Wrap", "Quick"], name: "Tuna melt wraps", blurb: "Toasted wraps filled with tuna, sweetcorn and melted cheddar.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): toasted with dark brown spots (tinned tuna is ready to eat: no marinade).
    ingredients: [ing("tuna", 200), ing("wraps", 120), ing("cheddar", 60), ing("sweetcorn", 100), ing("light-mayo", 30), ing("spring-onions", 20), ing("salad-leaves", 40), ing("black-pepper", 1)],
    method: [
      "Drain the tuna and sweetcorn: Tip the tuna into a sieve and press out the water with the back of a spoon. Drain the sweetcorn if it is tinned, or boil frozen sweetcorn for 3 minutes and drain it.",
      "Make the filling: Put the tuna, sweetcorn and mayonnaise in a bowl. Slice the spring onions thinly, add them with a pinch of black pepper and mix well.",
      "Grate the cheese: Grate the cheddar on the coarse side of the grater.",
      "Fill the wraps: Lay the wraps flat. Spread the tuna filling over one half of each wrap, scatter the cheddar on top and fold the other half over.",
      "Heat the pan: Put a large non-stick frying pan over a medium heat for 2 minutes, with nothing in it.",
      "Toast the wraps: Cook one folded wrap at a time for 2 to 3 minutes on each side, pressing down with a fish slice, until golden with dark brown spots and the cheese has melted.",
      "Serve: Cut each wrap in half and serve hot, with the salad leaves on the side.",
    ],
  },
  {
    id: "mozzarella-tomato-pesto-wraps", meal: "lunch", tags: ["Wrap", "Quick"], name: "Mozzarella, tomato and pesto wraps", blurb: "Soft wraps filled with pesto, sliced tomato, mozzarella and salad leaves.", servings: 2, minutes: 10,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): sliced mozzarella, thick tomato slices, wraps with brown spots.
    ingredients: [ing("wraps", 120), ing("mozzarella", 125, { role: "protein" }), ing("tomatoes", 150), ing("pesto", 30), ing("salad-leaves", 40), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Warm the wraps: Heat a dry frying pan over a medium heat. Warm each wrap for 30 to 40 seconds on each side, until soft with a few brown spots.",
      "Slice the tomatoes: Rinse the tomatoes and cut them into slices about 7 mm thick. Lay them on a plate and sprinkle the salt over them, so they taste sweeter and juicier.",
      "Get the mozzarella ready: Drain the mozzarella, pat it dry with kitchen paper and cut it into slices about 5 mm thick.",
      "Spread the pesto: Lay the wraps flat and spread the pesto down the middle of each one.",
      "Add the filling: Top the pesto with the salad leaves, tomato slices and mozzarella, then add a pinch of black pepper.",
      "Roll them up: Fold the bottom of each wrap up over the filling, fold in the sides and roll it up tightly.",
      "Serve: Cut each wrap in half on the diagonal and serve straight away, or keep it in the fridge and eat it the same day.",
    ],
  },
  {
    id: "smoked-salmon-pea-pasta", meal: "lunch", tags: ["Pasta", "Fish"], name: "Smoked salmon and pea pasta with soft cheese", blurb: "Pasta and sweet peas in a creamy lemon sauce with ribbons of smoked salmon.", servings: 2, minutes: 20,
    // the sauce follows the pasta, so there is always enough to coat it
    ingredients: [ing("pasta-shapes", 160), ing("smoked-salmon", 100), ing("peas", 100), ing("soft-cheese", 100, { follows: "pasta-shapes" }), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Boil the water: Fill a large pan with water, add the salt and bring it to the boil over a high heat.",
      "Cook the pasta: Add the pasta and cook it for the time on the pack, usually 10 to 12 minutes, stirring once or twice, until soft with no hard centre.",
      "Add the peas: Tip the frozen peas into the pan for the last 3 minutes, until they are bright green and hot.",
      "Cut the salmon: While the pasta cooks, tear or cut the smoked salmon into strips about 2 cm wide.",
      "Save some water: Scoop out a mugful of the pasta water, then drain the pasta and peas in a colander.",
      "Make the sauce: Put the empty pan on a low heat. Stir in the soft cheese, lemon juice and a splash of the pasta water for 1 minute, until smooth.",
      "Mix it together: Tip the pasta and peas back in and stir until coated. Take the pan off the heat and gently stir in the smoked salmon.",
      "Serve: Spoon the pasta into warm bowls and finish with a pinch of black pepper.",
    ],
  },
  // ---- dinners
  {
    id: "tuna-sweetcorn-pasta-bake", meal: "dinner", tags: ["Fish", "Bake"], name: "Tuna and sweetcorn pasta bake with cheese", blurb: "Pasta, tuna and sweetcorn in tomato sauce, baked under golden cheddar.", servings: 4, minutes: 45,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): onion in 1.5 cm pieces (tinned tuna is ready to eat: no marinade).
    ingredients: [ing("pasta-shapes", 300), ing("tuna", 300), ing("sweetcorn", 200), ing("passata", 500), ing("cheddar", 80), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("mixed-herbs", 1), ing("oil-spray", 2), ing("salt", 1), ing("black-pepper", 1), ing("chopped-tomato-puree", 15)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and get out a large ovenproof dish.",
      "Boil the water: Fill a large pan with water, add a pinch of the salt and bring it to the boil over a high heat.",
      "Soften the onion: Peel the onion and chop it into pieces about 1.5 cm across. Spray a large frying pan with the oil spray and cook the onion over a medium heat for 8 minutes, stirring now and then, until soft and sweet but not brown.",
      "Make the sauce: Stir in the garlic, mixed herbs and tomato purée for 1 minute, until the purée turns a darker red. Pour in the passata, season with the rest of the salt and some black pepper, and simmer gently for 10 minutes, until slightly thickened.",
      "Cook the pasta: Cook the pasta for 2 minutes less than the time on the pack, because it finishes cooking in the oven. Drain it in a colander.",
      "Add the tuna and sweetcorn: Drain the tuna, and the sweetcorn if it is tinned. Stir them into the sauce with the pasta until everything is coated.",
      "Top with cheese: Tip it into the ovenproof dish, spread it level and grate the cheddar over the top.",
      "Bake the dish: Bake on the top shelf for 20 minutes, until the cheese is golden with browned patches and the sauce is bubbling and piping hot.",
      "Serve: Leave it to stand for 2 minutes, then spoon it onto warm plates.",
    ],
  },
  {
    id: "salmon-broccoli-pasta", meal: "dinner", tags: ["Fish", "Pasta"], name: "Salmon and broccoli pasta with soft cheese", blurb: "Baked salmon and broccoli stirred through pasta in a creamy lemon and garlic sauce.", servings: 2, minutes: 30,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): golden grilled top on the salmon, 4 cm broccoli florets; marinade (founder 21 Nov: "marinating ... makes a big difference"): lemon, salt, black pepper.
    // the sauce follows the pasta, so there is always enough to coat it
    ingredients: [ing("salmon", 240, { note: "about 2 fillets" }), ing("pasta-shapes", 160), ing("broccoli", 200), ing("soft-cheese", 120, { follows: "pasta-shapes" }), ing("lemon-juice", 15), ing("garlic", 5, { note: "about 1 clove" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and line a baking tray with baking paper.",
      "Marinate the salmon: Turn the salmon on the tray in a third of the lemon juice, the salt and a pinch of black pepper. Leave it 10 minutes while the oven heats, or keep it covered in the fridge up to 1 hour. Wash your hands.",
      "Bake the salmon: Bake it for 12 to 15 minutes, then put it under a hot grill for 2 minutes, until golden on top.",
      "Boil the water: Fill a large pan with water and bring it to the boil over a high heat.",
      "Cook the pasta: Add the pasta and cook it for the time on the pack, usually 10 to 12 minutes, stirring once or twice.",
      "Add the broccoli: Cut the broccoli into florets about 4 cm across and add them to the pasta for the last 4 minutes, until bright green and a knife slides in easily.",
      "Check the salmon: It is cooked when it is opaque and flakes easily when pressed with a fork. Take off any skin and break the fish into large flakes.",
      "Save some water: Scoop out a mugful of the pasta water, then drain the pasta and broccoli in a colander.",
      "Make the sauce: Put the empty pan on a low heat. Stir in the soft cheese, garlic, the rest of the lemon juice and a splash of the pasta water for 1 minute, until smooth.",
      "Mix it together: Add the pasta, broccoli and salmon and stir gently for 1 minute, until coated and steaming hot.",
      "Serve: Spoon it into warm bowls and finish with a pinch of black pepper.",
    ],
  },
  {
    id: "chicken-korma-style-curry", meal: "dinner", tags: ["Indian", "Batch cook"], name: "Chicken korma-style curry with almonds and rice", blurb: "A mild, creamy chicken curry made with coconut milk and almonds, served with rice.", servings: 4, minutes: 45,
    // 2026-11-22, marinade (founder 21 Nov: "marinating ... makes a big difference"): curry powder, salt, oil.
    ingredients: [ing("chicken", 480), ing("rice", 300), ing("coconut-milk", 400), ing("almonds", 40), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("curry-powder", 6), ing("turmeric", 2), ing("cumin", 2), ing("vegetable-oil", 10), ing("salt", 2)],
    method: [
      "Marinate the chicken: Cut the chicken into 3 cm chunks and toss with half the curry powder, half the salt and 1 tsp of the oil. Leave it 10 minutes, or keep it covered in the fridge up to a few hours. Wash your hands.",
      "Get everything ready: Peel and finely chop the onion and roughly chop the almonds.",
      "Soften the onion: Heat the rest of the oil in a large, deep frying pan over a medium heat. Cook the onion for 6 to 8 minutes, stirring now and then, until soft and golden.",
      "Add the garlic and spices: Stir in the garlic, the rest of the curry powder, the turmeric and the cumin and cook for 1 minute, stirring so they don't burn, until they smell warm and toasty.",
      "Brown the chicken: Add the chicken and cook for 5 minutes, turning the pieces, until they are white on the outside and coated in the spices.",
      "Simmer the curry: Shake the tin, then pour in the coconut milk, most of the almonds and the rest of the salt. Simmer gently for 20 minutes with no lid, stirring now and then, until the sauce is thick enough to coat the back of a spoon.",
      "Cook the rice: While the curry simmers, cook the rice in a pan of boiling water for the time on the pack, usually 10 to 12 minutes. Drain it well.",
      "Check the chicken: Cut the biggest piece in half. It should be white all the way through, piping hot with no pink left.",
      "Serve: Spoon the rice into one side of each warm bowl and the curry beside it. Scatter the rest of the almonds over the curry.",
    ],
  },
  {
    id: "beef-potato-pepper-hash", meal: "dinner", tags: ["One pan"], name: "Beef, potato and pepper hash", blurb: "Crisp potatoes, beef mince and soft peppers fried together in one pan.", servings: 3, minutes: 40,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): red peppers, onion in petals; marinade (founder 21 Nov: "marinating ... makes a big difference"): paprika, garlic, salt, black pepper.
    // 2026-11-21: oil 15 -> 20 ml so the potatoes crisp in two batches as the picture shows (founder: "has to look exactly as much as you can as the product")
    ingredients: [ing("beef-mince", 400), ing("new-potatoes", 690), ing("peppers", 320, { note: "2 red peppers" }), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("paprika", 2), ing("chopped-tomato-puree", 30), ing("vegetable-oil", 20), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Marinate the mince: Mix the mince with half the paprika, half the garlic, the salt and the black pepper. Leave it while you crisp the potatoes, or keep it covered in the fridge up to a few hours. Wash your hands after touching raw mince.",
      "Get the vegetables ready: Drain the potatoes, cut them into 2 cm chunks and pat them dry with kitchen paper. Peel the onion, cut it into thin wedges and pull the layers apart. Take the seeds out of the peppers and cut them into 2 cm pieces.",
      "Crisp the potatoes: Heat a third of the oil in a large non-stick frying pan over a medium-high heat. Add half the potatoes in one layer and leave them for 3 to 4 minutes without moving, until golden underneath.",
      "Finish the potatoes: Turn them and fry for 4 to 5 minutes more, turning now and then, until golden and crisp, then tip them onto a plate. Crisp the rest of the potatoes the same way in another third of the oil.",
      "Brown the mince: Put the mince in the same pan, press it into a flat layer, then wash your hands. Leave it for 3 minutes without stirring, until browned underneath.",
      "Break up the mince: Break it up with a wooden spoon and fry for 4 to 5 minutes more, until it is brown all over with no pink left.",
      "Soften the onion and peppers: Add the rest of the oil, the onion and the peppers. Cook for 6 to 8 minutes, stirring now and then, until soft.",
      "Add the garlic and paprika: Stir in the rest of the garlic and paprika and the tomato purée and cook for 1 minute, stirring so the garlic doesn't burn.",
      "Add the potatoes: Tip the potatoes back in with a splash of water and stir well.",
      "Crisp the bottom: Press the hash down flat and leave it for 3 to 4 minutes, until the bottom is browned, then turn it over in sections.",
      "Serve: Check the hash is piping hot all the way through, then spoon it onto warm plates.",
    ],
  },
  {
    id: "mushroom-spinach-rice-bake", meal: "dinner", tags: ["Bake", "Batch cook"], name: "Mushroom and spinach rice bake with cheddar", blurb: "Rice, mushrooms and spinach in a creamy sauce, baked under melted cheddar.", servings: 4, minutes: 50,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): thick mushroom slices, some on top.
    ingredients: [ing("rice", 250), ing("mushrooms", 300), ing("spinach", 150), ing("soft-cheese", 150), ing("cheddar", 100), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("stock-cube", 6), ing("mixed-herbs", 1), ing("oil-spray", 2), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and get out a large ovenproof dish.",
      "Cook the rice: Cook the rice in a large pan of boiling water for the time on the pack, usually 10 to 12 minutes, until soft. Drain it well.",
      "Fry the mushrooms: Slice the mushrooms from top to stalk, about 5 mm thick. Spray a large, deep non-stick frying pan with half the oil spray and heat it on a high heat. Add the mushrooms in one layer, in two batches if needed.",
      "Brown the mushrooms: Leave them for 3 minutes without stirring, then fry for 3 to 4 minutes more, until their liquid has gone and they are golden brown. Tip them on to a plate.",
      "Soften the onion: Peel and chop the onion. Turn the heat down to medium, spray the pan with the rest of the oil spray and cook the onion for 5 minutes, until soft. Stir in the garlic and mixed herbs for 1 minute.",
      "Make the sauce: Tip most of the mushrooms back in. Dissolve the stock cube in 200 ml of boiling water and pour it into the pan. Stir in the soft cheese until the sauce is smooth.",
      "Wilt the spinach: Add the spinach a handful at a time, stirring until it is soft and dark green.",
      "Mix in the rice: Grate the cheddar. Stir the rice, half of the cheddar and the black pepper into the pan.",
      "Bake the dish: Spread it level in the ovenproof dish. Lay the rest of the mushrooms on top and scatter the rest of the cheddar over. Bake on the top shelf for 15 to 20 minutes, until bubbling and golden at the edges.",
      "Serve: Leave it to stand for 2 minutes, then spoon it onto warm plates.",
    ],
  },
  {
    id: "broccoli-pepper-cheddar-pasta-bake", meal: "dinner", tags: ["Bake", "Pasta"], name: "Broccoli, pepper and cheddar pasta bake", blurb: "Pasta, broccoli and pepper in a creamy cheese sauce, baked until golden.", servings: 4, minutes: 45,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): a red pepper.
    // the cheese sauce follows the pasta, so a bigger or smaller dish is still coated
    ingredients: [ing("pasta-shapes", 300), ing("broccoli", 300), ing("peppers", 160, { note: "1 red pepper" }), ing("soft-cheese", 200, { follows: "pasta-shapes" }), ing("milk", 200, { follows: "pasta-shapes" }), ing("cheddar", 100), ing("mustard", 5), ing("garlic", 5, { note: "about 1 clove" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and get out a large ovenproof dish.",
      "Boil the water: Fill a large pan with water, add the salt and bring it to the boil over a high heat.",
      "Get the vegetables ready: Cut the broccoli into small florets. Take the seeds out of the pepper and cut it into 2 cm pieces. Grate the cheddar.",
      "Cook the pasta: Cook the pasta for 2 minutes less than the time on the pack. Add the broccoli and pepper for the last 2 minutes only, so the broccoli stays bright green in the oven, then drain everything in a colander.",
      "Make the sauce: Put the empty pan on a low heat. Add the milk, soft cheese and garlic and stir for 3 minutes, until smooth and warm but not boiling.",
      "Add the cheese: Take the pan off the heat. Stir in the mustard, the black pepper and two-thirds of the cheddar until it has melted.",
      "Mix it together: Tip the pasta and vegetables back into the pan and stir until everything is coated in the sauce.",
      "Bake the dish: Spoon it into the ovenproof dish and scatter the rest of the cheddar on top. Bake on the top shelf for 20 minutes, until the cheese is golden brown with crisp darker patches and the sauce is bubbling and piping hot.",
      "Serve: Leave it to stand for 2 minutes, then spoon it onto warm plates.",
    ],
  },
  {
    id: "honey-mustard-chicken-traybake", meal: "dinner", tags: ["One pan", "British"], name: "Honey mustard chicken with potatoes and carrots", blurb: "Chicken in a sticky honey and mustard glaze, roasted with potatoes and carrots.", servings: 3, minutes: 50,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): wholegrain mustard, carrot sticks, potatoes cut-side down; marinade (founder 21 Nov: "marinating ... makes a big difference"): the honey and mustard glaze, now with time to sit.
    ingredients: [ing("chicken", 450), ing("new-potatoes", 690), ing("carrots", 300, { note: "about 3 carrots" }), ing("honey", 30), ing("mustard", 20, { note: "wholegrain if you can" }), ing("olive-oil", 15), ing("garlic", 5, { note: "about 1 clove" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and get out a large roasting tin.",
      "Get the vegetables ready: Drain the potatoes and cut them in half. Peel the carrots and cut them into sticks about 5 cm long, halving thick ones lengthways.",
      "Roast the vegetables: Put them in the tin with the oil, the salt and a pinch of black pepper. Mix well, spread them out in one layer with the potatoes cut-side down and roast for 15 minutes.",
      "Make the glaze: In a bowl, mix the honey, mustard and garlic with a fork until smooth.",
      "Marinate the chicken: Spoon a third of the glaze into a cup for later. Pat the chicken dry with kitchen paper and turn it in the rest of the glaze. Wash your hands after touching the raw chicken.",
      "Let it marinate: Leave the chicken while the vegetables roast, or keep it covered in the fridge up to a few hours.",
      "Roast the chicken: Using oven gloves, take out the tin, stir the vegetables and lay the chicken on top, spaced apart. Roast for 15 minutes.",
      "Glaze the chicken: Take out the tin again and spoon the glaze from the cup over the chicken. Roast for 5 to 10 minutes more, until the glaze is sticky, glossy and browned at the edges and the carrots are browned at the edges too.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, piping hot with no pink left. If not, roast it for 5 more minutes.",
      "Serve: Put the chicken on warm plates with the potatoes and carrots, and spoon the juices from the tin over the top.",
    ],
  },
];

// How each of these recipes looks from directly above (the same rules as looks.ts).
export const MORE_MAINS_LOOKS: Readonly<Record<string, string>> = {
  "cheese-onion-potato-cakes": "Three round grated-potato cakes with lacy, crisp golden-brown edges on a white round plate, topped with melted orange cheddar and flecked with green spring onion rings, beside green salad leaves, halved red cherry tomatoes and cucumber rounds.",
  "spinach-soft-cheese-pasta": "Pasta shapes in a wide white pasta bowl, coated in a smooth, pale creamy sauce with dark green wilted spinach folded through, finely grated orange cheddar scattered over the top and flecks of black pepper.",
  "tuna-melt-wraps": "One tortilla wrap folded into a half-moon and toasted golden brown with darker spots, cut into two wedges on a white round plate, the cut edges showing pale tuna, yellow sweetcorn and melted orange cheddar, with green salad leaves beside it.",
  "mozzarella-tomato-pesto-wraps": "One tortilla wrap rolled up and cut in half on the diagonal, the two halves crossed on a white square plate, the cut ends showing green pesto, red tomato slices, soft white mozzarella and green salad leaves.",
  "smoked-salmon-pea-pasta": "Pasta shapes in a wide white pasta bowl, coated in a pale creamy sauce, with bright green peas and soft pink folds of smoked salmon through it and flecks of black pepper on top.",
  "tuna-sweetcorn-pasta-bake": "A white square plate holding a serving of tuna pasta bake: pasta shapes in red tomato sauce with pale flakes of tuna, yellow sweetcorn and soft onion, under a golden, bubbling layer of melted cheddar with browned patches.",
  "salmon-broccoli-pasta": "Pasta shapes and bright green broccoli florets in a wide white pasta bowl, coated in a smooth pale creamy sauce, with large flakes of pink-orange baked salmon on top and flecks of black pepper.",
  "chicken-korma-style-curry": "A wide white bowl holding a mound of fluffy white rice on one side and chunks of chicken in a smooth, creamy pale golden coconut sauce on the other, with roughly chopped almonds scattered over the curry.",
  "beef-potato-pepper-hash": "A wide white plate of beef hash: golden, crisp-edged chunks of potato mixed with browned beef mince, soft red pepper pieces and onion, all tinted orange-brown with paprika and flecked with black pepper.",
  "mushroom-spinach-rice-bake": "A white square plate holding a serving of rice bake: rice mixed with golden-brown sliced mushrooms, dark green wilted spinach and soft onion in a creamy sauce, under a layer of melted cheddar baked golden at the edges.",
  "broccoli-pepper-cheddar-pasta-bake": "A white square plate holding a serving of pasta bake: pasta shapes, bright green broccoli florets and red pepper pieces in a creamy pale cheese sauce, under grated cheddar baked golden brown with crisp darker patches.",
  "honey-mustard-chicken-traybake": "A white oval plate holding one chicken breast with a sticky, glossy golden honey glaze speckled with mustard seeds and browned at the edges, beside roasted halved new potatoes and orange carrot sticks with caramelised edges.",
};

// Suggested lines for niches.ts (cuisine and occasions), for the lead to add: [id, kind, value]
export const MORE_MAINS_NICHE_SUGGESTIONS: ReadonlyArray<[string, "cuisine" | "occasion", string]> = [
  ["cheese-onion-potato-cakes", "cuisine", "british"],
  ["spinach-soft-cheese-pasta", "cuisine", "italian"],
  ["mozzarella-tomato-pesto-wraps", "cuisine", "italian"],
  ["mozzarella-tomato-pesto-wraps", "occasion", "lunchbox"],
  ["mozzarella-tomato-pesto-wraps", "occasion", "picnic"],
  ["smoked-salmon-pea-pasta", "cuisine", "italian"],
  ["tuna-sweetcorn-pasta-bake", "cuisine", "british"],
  ["salmon-broccoli-pasta", "cuisine", "italian"],
  ["chicken-korma-style-curry", "cuisine", "indian"],
  ["beef-potato-pepper-hash", "cuisine", "british"],
  ["beef-potato-pepper-hash", "occasion", "bonfire-night"],
  ["broccoli-pepper-cheddar-pasta-bake", "cuisine", "british"],
  ["honey-mustard-chicken-traybake", "cuisine", "british"],
];
