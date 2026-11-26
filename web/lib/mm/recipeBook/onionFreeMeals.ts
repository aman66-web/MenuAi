import { ing, type Recipe } from "../recipes";

// Lunches and dinners with no onion, garlic or their kin and nothing grown underground (founder 2026-11-26: "make more recipes so that my app caters for
// multiple inputs a user would need as they all have different diet plans that may vary a lot"; docs/RECIPE_COVERAGE_2026-11-26.md). The Jain diet had no lunch
// or dinner at all, and "No onion or garlic" only a handful of dinners. So none of these uses onion, garlic, spring onions, potatoes, carrots, mushrooms, honey,
// eggs or meat, nor the shop-bought pastes, powders, stock cubes, houmous, salsa or pesto that print onion or garlic (lib/mm/pantry.ts `allium`): the flavour
// comes from cumin, turmeric, paprika, oregano, lemon and black pepper. Most are vegan too. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const ONION_FREE_MEALS: readonly Recipe[] = [
  {
    id: "chickpea-spinach-tomato-curry-rice", meal: "dinner", tags: ["Vegan", "Indian", "One pot"], name: "Chickpea, spinach and tomato curry with rice", blurb: "Chickpeas simmered with cumin, turmeric and paprika in tomatoes and a little coconut milk, with spinach and rice.", servings: 3, minutes: 35,
    ingredients: [ing("chickpeas", 480), ing("chopped-tomatoes", 400), ing("coconut-milk", 100), ing("spinach", 150), ing("cumin", 3), ing("turmeric", 2), ing("paprika", 2), ing("vegetable-oil", 15), ing("lemon-juice", 10), ing("salt", 1), ing("rice", 180)],
    method: [
      "Drain the chickpeas: Tip the chickpeas into a sieve, rinse them under the cold tap and leave them to drain.",
      "Toast the spices: Heat the oil in a large saucepan over a medium heat. Add the cumin, turmeric and paprika and stir for 30 seconds, until they smell fragrant. Don't let them burn.",
      "Add the tomatoes: Pour in the chopped tomatoes, add a pinch of salt and stir. Bring to a bubble and cook for 5 minutes, stirring now and then, until a little thicker.",
      "Simmer the chickpeas: Add the chickpeas, coconut milk and half a tin of water. Simmer gently for 15 minutes, stirring now and then, until the sauce is thick and coats the chickpeas.",
      "Cook the rice: While the curry simmers, rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender.",
      "Add the spinach: Stir the spinach into the curry a handful at a time, until it has all wilted.",
      "Finish the curry: Stir in the lemon juice. Taste it and add a little more salt if you like.",
      "Serve: Spoon the rice into bowls and the curry beside it. Keep leftovers covered in the fridge for up to 2 days and reheat until piping hot.",
    ],
  },
  {
    id: "tofu-pea-tomato-curry-rice", meal: "dinner", tags: ["Vegan", "Indian"], name: "Tofu and pea curry with rice", blurb: "Golden tofu and peas in a gently spiced tomato and coconut sauce, served with rice.", servings: 2, minutes: 35,
    ingredients: [ing("tofu", 280), ing("peas", 150), ing("chopped-tomatoes", 400), ing("coconut-milk", 80), ing("cumin", 2), ing("turmeric", 1), ing("paprika", 2), ing("vegetable-oil", 15), ing("salt", 1), ing("rice", 120)],
    method: [
      "Get the tofu ready: Drain the tofu, pat it dry with kitchen paper and cut it into 2 cm cubes.",
      "Brown the tofu: Heat two thirds of the oil in a large non-stick frying pan over a medium-high heat. Fry the tofu for 6 to 8 minutes, turning it, until golden on most sides. Lift it onto a plate.",
      "Toast the spices: Turn the heat to medium and add the rest of the oil with the cumin, turmeric and paprika. Stir for 30 seconds, until fragrant.",
      "Make the sauce: Pour in the chopped tomatoes and coconut milk with a pinch of salt. Bring to a bubble, then simmer gently for 10 minutes, stirring now and then, until thick.",
      "Cook the rice: While the sauce simmers, rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender.",
      "Add the tofu and peas: Stir the tofu and peas into the sauce and simmer for 4 to 5 minutes, until the peas are tender and the tofu is hot right through.",
      "Check the seasoning: Taste the curry and add a little more salt if you like. Add a splash of water if it is too thick.",
      "Serve: Spoon the rice into bowls and the curry alongside.",
    ],
  },
  {
    id: "kidney-bean-tomato-curry-rice", meal: "dinner", tags: ["Vegan", "Indian", "Batch cook"], name: "Kidney bean and tomato curry with rice", blurb: "A thick home-style kidney bean curry with cumin, turmeric and lemon, served with rice.", servings: 3, minutes: 35,
    ingredients: [ing("kidney-beans", 480), ing("passata", 400), ing("cumin", 3), ing("turmeric", 1), ing("paprika", 3), ing("cinnamon", 1), ing("vegetable-oil", 15), ing("lemon-juice", 10), ing("spinach", 100), ing("salt", 1), ing("rice", 180)],
    method: [
      "Drain the beans: Tip the kidney beans into a sieve, rinse them under the cold tap and leave them to drain.",
      "Toast the spices: Heat the oil in a large saucepan over a medium heat. Add the cumin, turmeric, paprika and cinnamon and stir for 30 seconds, until fragrant.",
      "Add the passata: Pour in the passata with a pinch of salt and half a carton of water and stir well.",
      "Simmer the beans: Add the beans and bring to a bubble. Simmer gently for 15 minutes, stirring now and then. Mash a few beans against the side of the pan to thicken the sauce.",
      "Cook the rice: While the curry simmers, rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender.",
      "Add the spinach: Stir the spinach into the curry until it wilts.",
      "Finish the curry: Stir in the lemon juice, taste and add a little more salt if you like.",
      "Serve: Spoon the rice into bowls and the curry over it. Keep leftovers covered in the fridge for up to 2 days and reheat until piping hot.",
    ],
  },
  {
    id: "pepper-spinach-mozzarella-pasta-bake", meal: "dinner", tags: ["Pasta", "Bake", "Italian"], name: "Pepper, spinach and mozzarella pasta bake", blurb: "Pasta baked in an oregano tomato sauce with peppers and spinach under melted mozzarella and cheddar.", servings: 3, minutes: 45,
    ingredients: [ing("pasta-shapes", 210), ing("passata", 500), ing("peppers", 320, { note: "about 2 peppers" }), ing("spinach", 100), ing("oregano", 2), ing("olive-oil", 10), ing("mozzarella", 125), ing("cheddar", 40), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6).",
      "Boil the water: Fill a large saucepan two-thirds full with boiling water from the kettle, add a pinch of salt and bring it back to the boil on a high heat.",
      "Cook the pasta: Add the pasta and boil for 2 minutes less than the pack says, so it finishes cooking in the oven. Drain it in a colander.",
      "Soften the peppers: While the pasta cooks, cut the peppers in half, scoop out the seeds and chop them into small pieces. Heat the oil in a large frying pan over a medium heat and cook the peppers for 6 minutes, until soft.",
      "Make the sauce: Pour in the passata, add the oregano and some black pepper and simmer for 5 minutes. Stir in the spinach until it wilts.",
      "Mix and fill the dish: Stir the pasta into the sauce, then tip it into a baking dish about 20 by 30 cm and spread it out evenly.",
      "Add the cheese: Tear the mozzarella into small pieces and grate the cheddar. Scatter both over the top.",
      "Bake: Bake for 15 to 20 minutes, until the cheese has melted and is golden and bubbling. Leave it for 5 minutes before serving.",
    ],
  },
  {
    id: "cheese-sweetcorn-pepper-quesadillas", meal: "lunch", tags: ["Mexican", "Quick"], name: "Cheese, sweetcorn and pepper quesadillas with salad", blurb: "Toasted wraps filled with melted cheddar, sweetcorn and pepper, with a cherry tomato and cucumber salad.", servings: 2, minutes: 20,
    ingredients: [ing("wraps", 240, { note: "about 4 wraps" }), ing("cheddar", 80), ing("sweetcorn", 100), ing("peppers", 80, { note: "about ½ a pepper" }), ing("paprika", 1), ing("cherry-tomatoes", 150), ing("cucumber", 150), ing("lemon-juice", 10), ing("olive-oil", 5)],
    method: [
      "Make the filling: Grate the cheddar. Scoop the seeds out of the pepper and chop it into small pieces. Drain the sweetcorn if it is tinned. Mix them in a bowl with the paprika.",
      "Fill the wraps: Lay two wraps flat and spread the filling over them, leaving about 2 cm clear at the edge. Put the other two wraps on top and press down gently.",
      "Toast the first side: Heat a large dry non-stick frying pan over a medium heat. Cook one quesadilla for 2 to 3 minutes, until golden brown underneath.",
      "Toast the second side: Slide it onto a plate, put the pan over it, flip it back into the pan and cook for 2 to 3 minutes more, until golden and the cheese has melted. Cook the other the same way.",
      "Make the salad: Halve the cherry tomatoes and slice the cucumber. Toss them with the lemon juice and oil.",
      "Serve: Leave the quesadillas for 1 minute, as the cheese is very hot, then cut each into quarters and serve with the salad.",
    ],
  },
  {
    id: "lemony-chickpea-cucumber-rice-salad", meal: "lunch", tags: ["Vegan", "Salad", "Make ahead"], name: "Lemony chickpea, cucumber and tomato rice salad", blurb: "Cold rice with chickpeas, cucumber, cherry tomatoes and spinach in a cumin and lemon dressing.", servings: 2, minutes: 25,
    ingredients: [ing("rice", 100), ing("chickpeas", 240), ing("cucumber", 150), ing("cherry-tomatoes", 150), ing("spinach", 40), ing("lemon-juice", 20), ing("olive-oil", 15), ing("cumin", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender.",
      "Cool the rice: Tip it into a sieve, rinse it under the cold tap until cool and leave it to drain well. Cooked rice must be cooled quickly and kept in the fridge.",
      "Make the dressing: Whisk the lemon juice, oil, cumin, a pinch of salt and some black pepper together in a large bowl.",
      "Prepare the vegetables: Rinse and drain the chickpeas. Cut the cucumber into small cubes and the cherry tomatoes in half. Chop the spinach roughly.",
      "Toss it together: Add the rice, chickpeas and vegetables to the dressing and toss until everything is coated.",
      "Serve: Eat straight away or cover and keep it in the fridge for up to a day. Stir again before eating.",
    ],
  },
  {
    id: "spiced-chickpea-tomato-soup-toast", meal: "lunch", tags: ["Vegan", "Soup"], name: "Spiced chickpea and tomato soup with toast", blurb: "A thick tomato soup with chickpeas, spinach, cumin and paprika, with wholemeal toast.", servings: 2, minutes: 25,
    ingredients: [ing("chickpeas", 240), ing("chopped-tomatoes", 400), ing("spinach", 80), ing("cumin", 2), ing("paprika", 2), ing("olive-oil", 10), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1), ing("bread", 80, { note: "about 2 slices" })],
    method: [
      "Drain the chickpeas: Tip the chickpeas into a sieve, rinse them under the cold tap and leave them to drain.",
      "Toast the spices: Heat the oil in a medium saucepan over a medium heat. Add the cumin and paprika and stir for 30 seconds, until fragrant.",
      "Simmer the soup: Add the chopped tomatoes, the chickpeas, a tin of water and a pinch of salt. Bring to the boil, then simmer gently for 12 minutes.",
      "Thicken it: Mash about a third of the chickpeas against the side of the pan with a potato masher or fork, so the soup thickens.",
      "Add the spinach: Stir in the spinach until it wilts, then add the lemon juice and some black pepper. Taste and add more salt if you like.",
      "Serve: Toast the bread and serve it with the soup, ladled into bowls.",
    ],
  },
  {
    id: "broccoli-pea-soft-cheese-pasta", meal: "dinner", tags: ["Pasta", "Quick"], name: "Creamy broccoli and pea pasta", blurb: "Pasta with broccoli and peas in a lemony soft cheese sauce, topped with cheddar.", servings: 2, minutes: 15,
    ingredients: [ing("pasta-shapes", 160), ing("broccoli", 160), ing("peas", 100), ing("soft-cheese", 100), ing("cheddar", 30), ing("lemon-juice", 10), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Boil the water: Fill a large saucepan two-thirds full with boiling water from the kettle, add a pinch of salt and bring it back to the boil on a high heat.",
      "Cook the pasta: Add the pasta and stir. Boil for as long as the pack says, usually 10 to 12 minutes, until tender.",
      "Prepare the broccoli: While the pasta cooks, cut the broccoli into small florets. Grate the cheddar.",
      "Add the vegetables: For the last 4 minutes, add the broccoli to the pasta pan, then the peas for the last 2 minutes.",
      "Save some water: Scoop out a mugful of the cooking water, then drain the pasta and vegetables in a colander.",
      "Make the sauce: Put the pan back on a low heat with the soft cheese, lemon juice and a splash of the cooking water. Stir until smooth and creamy.",
      "Toss it together: Tip the pasta and vegetables back in and toss until coated, adding more water if it is too thick. Season with black pepper.",
      "Serve: Spoon into bowls and scatter the cheddar over the top.",
    ],
  },
  {
    id: "bean-sweetcorn-pepper-cumin-rice", meal: "dinner", tags: ["Vegan", "One pan"], name: "Kidney bean, sweetcorn and pepper rice with cumin", blurb: "Rice cooked with kidney beans, sweetcorn, peppers, cumin and smoky paprika, with a squeeze of lemon.", servings: 3, minutes: 35,
    ingredients: [ing("rice", 180), ing("kidney-beans", 240), ing("sweetcorn", 140), ing("peppers", 320, { note: "about 2 peppers" }), ing("chopped-tomatoes", 400), ing("cumin", 2), ing("paprika", 3), ing("olive-oil", 15), ing("lemon-juice", 15), ing("salt", 1)],
    method: [
      "Prepare the peppers: Cut the peppers in half, scoop out the seeds and white inside and chop them into small pieces.",
      "Soften the peppers: Heat the oil in a large, deep frying pan with a lid over a medium heat. Cook the peppers for 5 to 6 minutes, stirring, until soft.",
      "Add the spices and rice: Stir in the cumin and paprika for 30 seconds. Rinse the rice in a sieve, add it to the pan and stir until every grain is coated.",
      "Add the tomatoes: Pour in the chopped tomatoes, a tin and a half of water and a pinch of salt. Stir well and bring to a bubble.",
      "Cook the rice: Turn the heat to low, cover and cook for 15 minutes, without stirring, until the rice is nearly tender and most of the liquid has gone.",
      "Add the beans: Rinse and drain the kidney beans and drain the sweetcorn if it is tinned. Scatter them over the rice, cover again and cook for 5 minutes more, until the rice is tender.",
      "Finish: Take the pan off the heat, squeeze over the lemon juice and fork everything together gently. Taste and add a little more salt if you like.",
      "Serve: Spoon into bowls. Keep leftovers covered in the fridge for up to a day and reheat until piping hot.",
    ],
  },
  {
    id: "lemon-paprika-chicken-rice-peas", meal: "dinner", tags: ["One pan"], name: "Lemon and paprika chicken with rice and peas", blurb: "Paprika chicken browned and cooked with rice, peas and lemon in one pan.", servings: 2, minutes: 35,
    ingredients: [ing("chicken", 300), ing("rice", 120), ing("peas", 120), ing("paprika", 3), ing("cumin", 1), ing("turmeric", 1), ing("olive-oil", 15), ing("lemon-juice", 20), ing("spinach", 60), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Get the chicken ready: Cut the chicken into pieces about 3 cm across. Toss them with the paprika, a pinch of salt and some black pepper. Wash your hands and the board after touching raw chicken.",
      "Brown the chicken: Heat the oil in a large, deep frying pan with a lid over a medium-high heat. Fry the chicken for 5 minutes, turning it, until golden on all sides.",
      "Add the rice: Rinse the rice in a sieve. Add it to the pan with the cumin and turmeric and stir for 1 minute, until every grain is coated and yellow.",
      "Add the water: Pour in twice the rice's volume of boiling water and half the lemon juice. Stir once and bring to a bubble.",
      "Cook: Turn the heat to low, cover and cook for 12 minutes, without stirring, until the rice is nearly tender and most of the water has gone.",
      "Add the peas: Scatter the peas and spinach over the top, cover again and cook for 3 to 4 minutes, until the peas are tender and the spinach has wilted.",
      "Check the chicken: Cut into the largest piece of chicken: it must be piping hot all the way through, with no pink left. If not, cover and cook for a few minutes more.",
      "Serve: Squeeze over the rest of the lemon juice, fork everything together gently and serve.",
    ],
  },
];

export const ONION_FREE_MEALS_LOOKS: Readonly<Record<string, string>> = {
  "chickpea-spinach-tomato-curry-rice": "A white plate with a mound of fluffy white rice beside a thick orange-red curry of golden chickpeas and dark green wilted spinach, glossy with a little coconut milk and speckled with spices.",
  "tofu-pea-tomato-curry-rice": "A wide white bowl of white rice beside a rich orange tomato and coconut curry full of golden cubes of tofu and bright green peas.",
  "kidney-bean-tomato-curry-rice": "A deep white bowl of white rice topped with a thick, deep red kidney bean curry with dark green wilted spinach, the beans glossy and some crushed into the sauce.",
  "pepper-spinach-mozzarella-pasta-bake": "A rectangular white baking dish of short pasta in red tomato sauce with soft red and yellow pepper pieces and green spinach, covered with bubbling golden patches of melted mozzarella and cheddar.",
  "cheese-sweetcorn-pepper-quesadillas": "Golden toasted quesadilla quarters on a white plate, the cut edges showing melted orange cheddar with yellow sweetcorn and red pepper pieces, beside a small salad of halved cherry tomatoes and cucumber slices.",
  "lemony-chickpea-cucumber-rice-salad": "A wide white bowl of cold white rice tossed with golden chickpeas, small green cucumber cubes, halved red cherry tomatoes and chopped dark green spinach, glossy with a lemon and olive oil dressing.",
  "spiced-chickpea-tomato-soup-toast": "A round white bowl of thick red tomato soup with golden chickpeas and dark green spinach, some chickpeas crushed into it, beside two triangles of golden wholemeal toast on a small plate.",
  "broccoli-pea-soft-cheese-pasta": "A white bowl of short pasta in a creamy white sauce with bright green broccoli florets and peas, topped with grated orange cheddar and cracked black pepper.",
  "bean-sweetcorn-pepper-cumin-rice": "A wide shallow pan of reddish spiced rice studded with glossy dark red kidney beans, yellow sweetcorn and soft red and yellow pepper pieces.",
  "lemon-paprika-chicken-rice-peas": "A wide shallow pan of golden yellow rice with bright green peas and dark wilted spinach, topped with browned, paprika-dusted pieces of chicken glistening with lemon and olive oil.",
};
