import { ing, type Recipe } from "../recipes";

// Everyday lunches and dinners that nearly every supermarket in the app can make (founder 2026-11-21: "all the shops, like, they should have recipes ... why
// does the ones that have ingredients not have recipes"; the pictures "have to be recipes that universally used between different supermarkets"). Aldi and
// M&S had plenty of breakfasts but few lunches and dinners, so their Meal plan weeks ran short. Every recipe here is built only from kinds that Sainsbury's,
// Morrisons, Waitrose, Iceland, Asda and M&S all sell with a read label and a price (tests/recipeShops.check.test.ts, REPORT=kinds), so there are no stock
// cubes, peppers, carrots, sweetcorn, tinned pulses or spring onions; the one exception is the tuna melt, which M&S makes with its tinned salmon. See
// lib/mm/recipeBook/index.ts for the rules every recipe follows.
// Chef pass, 21 November 2026 (founder, after cooking the sweet chilli chicken: "Nothing should be plain, these should all be chef made meals"): each
// method browns, seasons and finishes its dish the way the picture shows (meat patted dry and left to colour, onions cooked soft and sweet, spices
// fried for 30 seconds, sauces bubbled until they coat). "chef pass" over an ingredient list says what it added. No paprika or turmeric: M&S sells
// neither, nor Aldi ground cumin, so adding them would take these recipes away from those shops. Salt, oil and honey were added only where the dish
// stays in every eating style it was in (Lower salt, Lower sugar, Low fat, Longevity, High protein).
// Photo match, 22 November 2026 (founder 21 Nov: "All Recipes should be accurate exactly to how the photo looks"; "Marinating chicken beef etc other
// meats is a big thing ... they can marinate on the spot"): each method checked against its real picture (cuts, plating, where the spices go), and
// every chicken, beef, salmon and tuna dish marinates while the rest is made ready, from what it already buys. "photo match" over a recipe says what changed.

export const EVERY_SHOP: readonly Recipe[] = [
  // ---- lunches
  {
    id: "pea-ham-soup-toast", meal: "lunch", tags: ["Soup", "Make ahead", "British"], name: "Pea and ham soup with toast", blurb: "A thick, smooth pea soup with pieces of ham, onion and garlic, with wholemeal toast on the side.", servings: 4, minutes: 30,
    // chef pass 2026-11-21: salt 1 g in the soup (the ham goes in after blending)
    ingredients: [ing("peas", 600), ing("ham", 200), ing("onion", 150), ing("garlic", 10), ing("olive-oil", 15), ing("salt", 1), ing("milk", 200), ing("black-pepper", 1), ing("bread", 320)],
    method: [
      "Get ready: Peel and chop the onion. Tear the ham into small pieces, about 1 cm across, and set a quarter of it aside for the top.",
      "Soften the onion: Heat the oil in a large saucepan on a medium heat. Fry the onion with the salt for 6 to 8 minutes, stirring now and then, until soft and sweet but not brown.",
      "Add the garlic: Stir in the garlic purée and cook for 30 seconds, stirring so it doesn't burn.",
      "Simmer the peas: Add the frozen peas and 700 ml of boiling water from the kettle. Bring it back to the boil, then simmer for 4 to 5 minutes, until the peas are soft but still bright green.",
      "Blend the soup: Take the pan off the heat, pour in the milk and blend with a stick blender until smooth and velvety.",
      "Add the ham: Stir in most of the ham and warm the soup on a low heat for 3 to 4 minutes, without letting it boil, until hot all the way through. Add black pepper.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Ladle the soup into warm bowls, scatter the rest of the ham on top and serve the toast on the side. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "mulligatawny-chicken-rice-soup", meal: "lunch", tags: ["Soup", "Make ahead"], name: "Mulligatawny-style chicken and rice soup", blurb: "A gently spiced tomato soup with chicken thigh, onion and a little rice, finished with yogurt and lemon.", servings: 4, minutes: 40,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in cumin, garlic and salt; the onion in thin half rings
    ingredients: [ing("chicken-thigh", 400), ing("onion", 150), ing("garlic", 10), ing("cumin", 2), ing("chilli-powder", 1), ing("cinnamon", 1), ing("chopped-tomatoes", 400), ing("rice", 80), ing("olive-oil", 15), ing("lemon-juice", 15), ing("natural-yogurt", 80), ing("salt", 1)],
    method: [
      "Get ready: Peel the onion and slice it into thin half rings. Cut the chicken into small pieces, about 2 cm across, and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with half the cumin and garlic purée, the salt and 1 teaspoon of the oil. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Brown the chicken: Heat the rest of the oil in a large saucepan on a medium-high heat. Add the chicken in one layer and leave it for 3 minutes without stirring, until golden underneath. Turn and fry for 2 minutes more, then lift it on to a plate.",
      "Soften the onion: Turn the heat to medium and fry the onion in the same pan for 5 to 6 minutes, stirring now and then, until soft and golden.",
      "Add the spices: Stir in the chilli powder, the cinnamon and the rest of the garlic purée and cumin and cook for 30 seconds, stirring, until they smell fragrant.",
      "Add the tomatoes and rice: Rinse the rice in a sieve. Add it to the pan with the chopped tomatoes, the chicken and its juices and 900 ml of boiling water from the kettle. Scrape up the brown bits from the bottom.",
      "Simmer the soup: Bring it to the boil, then turn the heat down, cover and simmer for 15 minutes, stirring now and then, until the rice is soft.",
      "Check the chicken: Cut into a few of the biggest pieces. They must be piping hot all the way through with no pink left. Simmer a little longer if not.",
      "Serve: Stir in the lemon juice, ladle the soup into warm bowls and add a spoonful of yogurt to each. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "tomato-egg-noodle-soup", meal: "lunch", tags: ["Soup", "Quick", "Eggs", "Chinese"], name: "Chinese-style tomato and egg noodle soup", blurb: "Soft ribbons of egg in a garlicky tomato and soy broth with noodles and spinach.", servings: 2, minutes: 20,
    // chef pass 2026-11-21: salt 1 g in the eggs
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): the egg sets in large soft pieces
    ingredients: [ing("tomatoes", 340), ing("eggs", 180), ing("noodles", 300), ing("spinach", 80), ing("garlic", 10), ing("soy", 20), ing("salt", 1), ing("olive-oil", 15), ing("black-pepper", 1)],
    method: [
      "Get ready: Wash the tomatoes and cut each one into 8 wedges. Rinse the spinach unless the bag says it is ready washed.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell, and beat them with the salt until smooth. Wash your hands after touching raw eggs.",
      "Soften the tomatoes: Heat the oil in a large saucepan on a medium heat. Add the tomatoes and the garlic purée and cook for 5 to 6 minutes, stirring and pressing them with the spoon, until they collapse and turn the oil red.",
      "Make the broth: Pour in 700 ml of boiling water from the kettle and add the soy sauce. Bring it to the boil, then simmer for 3 minutes.",
      "Add the noodles: Loosen the noodles with your fingers and add them to the pan with the spinach. Simmer for 2 minutes, until the noodles are hot and the spinach is soft.",
      "Add the eggs: Keep the soup at a gentle bubble and pour in the eggs in a slow stream, without stirring. Leave them for 1 minute, until set, then break them gently into large soft pieces with a spoon.",
      "Serve: Add a good grind of black pepper and ladle the soup into warm bowls. Eat it straight away.",
    ],
  },
  {
    id: "creamy-chicken-mushroom-soup", meal: "lunch", tags: ["Soup", "Make ahead"], name: "Creamy chicken and mushroom soup with toast", blurb: "Chicken, mushrooms and onion in a creamy garlic soup, with wholemeal toast on the side.", servings: 4, minutes: 35,
    // chef pass 2026-11-21: salt 1 -> 3 g
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): whole breasts marinated, poached in the soup and shredded; thick mushroom slices
    ingredients: [ing("chicken", 300), ing("mushrooms", 400), ing("onion", 150), ing("garlic", 10), ing("olive-oil", 15), ing("milk", 400), ing("soft-cheese", 100), ing("salt", 3), ing("black-pepper", 1), ing("bread", 320)],
    method: [
      "Marinate the chicken: Rub the whole chicken breasts with a third of the salt and half the garlic purée. Leave them for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Get ready: Peel and chop the onion. Wipe the mushrooms clean and slice them thickly.",
      "Brown the chicken: Heat half the oil in a large saucepan on a medium-high heat. Brown the chicken for 3 minutes on each side, without moving it, until golden. Lift it out on to a plate.",
      "Brown the mushrooms: Heat the rest of the oil on a high heat. Fry the mushrooms in two batches, leaving each for 3 minutes without stirring until golden, then stirring for 1 minute. Keep a handful of the browned slices for the top.",
      "Soften the onion: Turn the heat to medium. Put the rest of the mushrooms back with the onion and cook for 5 minutes, stirring, until the onion is soft. Stir in the rest of the garlic purée for 30 seconds.",
      "Simmer the soup: Pour in 400 ml of boiling water from the kettle, add the rest of the salt and scrape up the brown bits. Put the chicken back, cover and simmer gently for 15 minutes.",
      "Shred the chicken: Lift the chicken on to a board and pull it into shreds with two forks. It must be piping hot all the way through with no pink left. Simmer it a little longer if not.",
      "Blend half: Take the pan off the heat. Ladle half the soup into a jug, blend it with a stick blender until smooth and stir it back into the pan.",
      "Add the chicken and milk: Put the shredded chicken back in the pan with the milk and soft cheese. Simmer gently for 5 minutes, stirring, until the soft cheese melts into the soup and it is piping hot. Add black pepper.",
      "Toast the bread: Toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Ladle the soup into warm bowls, scatter the mushrooms you kept on top and serve the toast on the side. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "welsh-rarebit-tomatoes", meal: "lunch", tags: ["Quick", "British"], name: "Welsh rarebit with tomatoes", blurb: "Wholemeal toast under a bubbling mustard and cheddar topping, with grilled tomatoes on the side.", servings: 2, minutes: 15,
    // chef pass 2026-11-21: salt 1 g on the tomatoes
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): the tomatoes grilled as thick rounds
    ingredients: [ing("bread", 160), ing("cheddar", 100), ing("eggs", 60), ing("milk", 30), ing("mustard", 5), ing("black-pepper", 1), ing("tomatoes", 170), ing("olive-oil", 5), ing("salt", 1)],
    method: [
      "Heat the grill: Turn the grill on to medium-high and line a baking tray with foil.",
      "Make the topping: Grate the cheddar into a bowl. Crack in the egg, picking out any shell, add the mustard, milk and a grind of black pepper and mix to a thick paste. Wash your hands after touching raw egg.",
      "Grill the tomatoes: Cut the tomatoes into thick slices, about 1.5 cm, lay them on the tray, brush them with the oil and sprinkle with the salt. Grill for 4 to 5 minutes, until soft and charred at the edges, then push them to one side.",
      "Toast the bread: Lay the bread on the tray and grill for 1 to 2 minutes, until golden on top. Turn the slices over.",
      "Spread the cheese: Spread the cheese mixture over the untoasted sides of the bread, right to the edges, so no bread shows.",
      "Grill the rarebit: Grill for 3 to 4 minutes, until the topping is bubbling, golden brown in patches and set, with no runny egg left.",
      "Serve: Leave it for 1 minute, as the cheese is very hot, then cut each slice in half and serve with the grilled tomatoes.",
    ],
  },
  {
    id: "tuna-melt-toastie", meal: "lunch", tags: ["Quick", "Fish"], name: "Tuna melt toastie", blurb: "Wholemeal bread toasted in a pan around tuna, finely chopped onion and melting cheddar.", servings: 2, minutes: 15,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): red onion, as in the picture (was onion); the tuna sits in its dressing for 10 minutes
    ingredients: [ing("bread", 160), ing("tuna", 160), ing("cheddar", 60), ing("greek-yogurt", 40), ing("red-onion", 40), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Drain the tuna: Open the tins and press the lids down firmly over the sink to squeeze out all the liquid. Tip the tuna into a bowl and break it into flakes with a fork.",
      "Make the filling: Peel the red onion and chop it very finely. Add it to the tuna with the yogurt and a good grind of black pepper and mix until creamy. Leave it for 10 minutes while you grate the cheese, so the flavours soak into the tuna.",
      "Grate the cheese: Grate the cheddar on the coarse side of a grater.",
      "Fill the sandwiches: Lay half the bread on a board. Spread the tuna filling over it, scatter the cheese on top and cover with the rest of the bread.",
      "Toast the first side: Heat half the oil in a large non-stick frying pan on a medium heat. Add the sandwiches, press down with a spatula and cook for 3 to 4 minutes, until deep golden and crisp underneath. Lower the heat if they brown too fast.",
      "Toast the second side: Lift the sandwiches out, add the rest of the oil and turn them over into the pan. Cook for 3 to 4 minutes more, pressing down, until golden and the cheese has melted.",
      "Serve: Cut each toastie in half on the diagonal and leave it for 1 minute before eating, as the filling is very hot.",
    ],
  },
  {
    id: "baked-bean-cheese-toastie", meal: "lunch", tags: ["Quick", "British"], name: "Baked bean and cheese toastie", blurb: "Hot baked beans and melting cheddar toasted between slices of wholemeal bread, with tomato on the side.", servings: 2, minutes: 15,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): cut on the diagonal
    ingredients: [ing("bread", 160), ing("baked-beans", 200), ing("cheddar", 60), ing("olive-oil", 10), ing("black-pepper", 1), ing("tomatoes", 170)],
    method: [
      "Thicken the beans: Tip the beans into a small saucepan and simmer on a medium heat for 4 to 5 minutes, stirring often, until hot and thick enough not to run. Add black pepper.",
      "Grate the cheese: Meanwhile, grate the cheddar on the coarse side of a grater.",
      "Fill the sandwiches: Lay half the bread on a board. Spoon the beans over it, keeping a small gap at the edges, and scatter the cheese on top. Cover with the rest of the bread.",
      "Toast the first side: Heat half the oil in a large non-stick frying pan on a medium heat. Add the sandwiches, press down with a spatula and cook for 3 minutes, until deep golden and crisp underneath.",
      "Toast the second side: Lift the sandwiches out, add the rest of the oil and turn them over into the pan. Cook for 3 minutes more, pressing down, until golden and the cheese has melted.",
      "Slice the tomatoes: While the toasties cook, wash the tomatoes and cut them into wedges.",
      "Serve: Cut each toastie in half on the diagonal and serve with the tomatoes on the side. Leave it for 1 minute before eating, as the beans are very hot.",
    ],
  },
  {
    id: "garlic-mushroom-mozzarella-toastie", meal: "lunch", tags: ["Quick"], name: "Garlic mushroom and mozzarella toastie", blurb: "Garlicky fried mushrooms and spinach with melting mozzarella, toasted in wholemeal bread.", servings: 2, minutes: 20,
    // chef pass 2026-11-21: salt 1 g on the mushrooms
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): cut on the diagonal
    ingredients: [ing("bread", 160), ing("mushrooms", 200), ing("spinach", 60), ing("mozzarella", 125), ing("garlic", 5), ing("salt", 1), ing("olive-oil", 15), ing("black-pepper", 1)],
    method: [
      "Get ready: Wipe the mushrooms clean and slice them thinly. Tear or chop the mozzarella into small pieces and pat it dry with kitchen paper.",
      "Fry the mushrooms: Heat half the oil in a large non-stick frying pan on a high heat. Spread out the mushrooms and leave them for 3 minutes, until golden underneath, then stir and fry for 2 minutes more, until their liquid has gone.",
      "Add the garlic and spinach: Stir in the garlic purée and the salt for 30 seconds, then add the spinach and stir until it wilts. Add black pepper, tip it all into a sieve, press out the juice so the toastie stays crisp, and wipe the pan.",
      "Fill the sandwiches: Lay half the bread on a board. Spread the mushroom mixture over it, scatter the mozzarella on top and cover with the rest of the bread.",
      "Toast the first side: Heat the rest of the oil in the pan on a medium heat. Add the sandwiches, press down with a spatula and cook for 3 minutes, until deep golden and crisp underneath.",
      "Toast the second side: Turn the sandwiches over carefully and cook for 3 minutes more, pressing down, until golden and the cheese has melted.",
      "Serve: Cut each toastie in half on the diagonal and leave it for 1 minute before eating, as the filling is very hot.",
    ],
  },
  {
    id: "ploughmans-salad-cheddar-ham", meal: "lunch", tags: ["No cook", "Salad", "British"], name: "Ploughman's-style salad with cheddar and ham", blurb: "Crisp lettuce, tomato, cucumber and onion with cheddar, ham, a mustard dressing and wholemeal bread.", servings: 2, minutes: 15,
    // chef pass 2026-11-21: salt 1 g in the dressing
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): cucumber in rounds
    ingredients: [ing("lettuce", 120), ing("tomatoes", 170), ing("cucumber", 150), ing("onion", 40), ing("cheddar", 80), ing("ham", 100), ing("mustard", 5), ing("olive-oil", 15), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1), ing("bread", 160)],
    method: [
      "Get the salad ready: Wash the lettuce, tomatoes and cucumber and shake them dry. Tear the lettuce into bite-sized pieces.",
      "Slice the vegetables: Cut the tomatoes into wedges and the cucumber into rounds. Peel the onion, slice it very thinly into rings and soak them in cold water for 5 minutes to soften their bite. Drain them well.",
      "Make the dressing: Stir the mustard, oil, lemon juice, salt and a grind of black pepper together in a mug until smooth.",
      "Cut the cheese: Cut the cheddar into small chunks, about 1 cm across. Fold the ham slices in half.",
      "Dress the salad: Put the lettuce, tomatoes, cucumber and onion in a large bowl, pour over the dressing and toss gently until coated.",
      "Serve: Pile the salad on plates with the cheese and ham beside it and the bread on the side. Eat straight away, or keep it covered in the fridge and eat it the same day.",
    ],
  },
  {
    id: "honey-mustard-chicken-salad", meal: "lunch", tags: ["Salad"], name: "Warm honey mustard chicken salad", blurb: "Sliced golden chicken on crisp lettuce, cucumber and tomato with a honey and mustard dressing.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in its own honey mustard dressing; cucumber in rounds
    ingredients: [ing("chicken", 300), ing("lettuce", 120), ing("cucumber", 150), ing("tomatoes", 170), ing("honey", 15), ing("mustard", 10), ing("olive-oil", 15), ing("lemon-juice", 15), ing("black-pepper", 1)],
    method: [
      "Make the dressing: Stir the honey, mustard, half the oil, the lemon juice and a grind of black pepper together in a mug until smooth.",
      "Thin the chicken: Lay the chicken on a board and slice each fillet in half sideways so it cooks evenly. Pat it dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Turn it in 1 tablespoon of the dressing with a little black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Fry the chicken: Heat the rest of the oil in a non-stick frying pan on a medium-high heat until it shimmers. Lay in the chicken and leave it, without moving, for 4 to 5 minutes, until golden underneath.",
      "Turn the chicken: Turn it over and cook for 4 to 5 minutes more, until golden on the other side too.",
      "Check the chicken: Cut into the thickest piece. It must be piping hot all the way through with no pink left. Cook it a little longer if not.",
      "Glaze the chicken: Take the pan off the heat, spoon 1 tablespoon of the dressing over the chicken and turn it to coat. Leave it to rest for 2 minutes, then slice it.",
      "Get the salad ready: Wash the lettuce, cucumber and tomatoes. Tear the lettuce, slice the cucumber into rounds and cut the tomatoes into wedges.",
      "Serve: Pile the salad on plates, lay the warm chicken on top and spoon over the rest of the dressing. Eat straight away.",
    ],
  },
  {
    id: "cold-peanut-noodles-cucumber-egg", meal: "lunch", tags: ["Quick", "Eggs", "Chinese"], name: "Chinese-style cold peanut noodles with cucumber and egg", blurb: "Noodles in a peanut, soy and garlic sauce with crisp cucumber and halved boiled eggs.", servings: 2, minutes: 20,
    ingredients: [ing("noodles", 300), ing("peanut-butter", 40), ing("soy", 20), ing("honey", 10), ing("lemon-juice", 10), ing("garlic", 5), ing("cucumber", 150), ing("eggs", 240)],
    method: [
      "Boil the eggs: Half-fill a saucepan with water and bring it to the boil. Lower the eggs in gently on a spoon and boil them for 9 to 10 minutes, until the whites and yolks are set. Wash your hands after touching raw eggs.",
      "Cool the eggs: Drain the eggs and run cold water over them for 2 to 3 minutes. Peel them and cut each one in half.",
      "Make the sauce: Meanwhile, stir the peanut butter, soy sauce, honey, lemon juice and garlic purée together in a large bowl with 3 tablespoons of hot water until smooth, glossy and about as thick as double cream.",
      "Loosen the noodles: Put the noodles in a sieve and pour a kettle of just-boiled water over them, separating them with a fork. Rinse them under the cold tap and drain well.",
      "Cut the cucumber: Cut the cucumber into thin sticks, about the size of a matchstick.",
      "Mix the noodles: Add the noodles to the sauce and toss until every strand is coated. Add a splash of cold water if it is too thick.",
      "Serve: Pile the noodles into bowls and top with the cucumber and eggs. Eat straight away, or keep them covered in the fridge and eat them the same day.",
    ],
  },
  {
    id: "ham-cheddar-pea-pasta-salad", meal: "lunch", tags: ["Pasta", "Salad"], name: "Ham, cheddar and pea pasta salad", blurb: "Pasta shapes, ham, peas and cheddar in a creamy mustard yogurt dressing with crisp lettuce.", servings: 2, minutes: 20,
    // chef pass 2026-11-21: lemon juice 10 ml in the dressing (the mustard already brings sulphites)
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): the ham cut into 1 cm squares
    ingredients: [ing("pasta-shapes", 160), ing("ham", 100), ing("peas", 120), ing("cheddar", 40), ing("greek-yogurt", 100), ing("mustard", 5), ing("lemon-juice", 10), ing("lettuce", 60), ing("black-pepper", 1)],
    method: [
      "Cook the pasta: Bring a large pan of water to the boil. Add the pasta and cook it for the time on the pack, usually 10 to 12 minutes, until soft with no hard centre.",
      "Add the peas: For the last 3 minutes, add the peas to the pasta pan.",
      "Cool the pasta: Drain the pasta and peas in a colander and run cold water over them for 1 to 2 minutes, until cool. Shake them well.",
      "Make the dressing: Stir the yogurt, mustard, lemon juice and a good grind of black pepper together in a large bowl until smooth.",
      "Chop the rest: Stack the ham slices and cut them into 1 cm squares, and grate the cheddar. Wash the lettuce, shake it dry and shred it.",
      "Mix the salad: Add the pasta, peas, ham and most of the cheese to the dressing and stir until everything is coated.",
      "Serve: Spread the lettuce on plates, pile the salad on top and scatter the rest of the cheese over. Keep any for later covered in the fridge and eat it within a day.",
    ],
  },
  {
    id: "salmon-pea-lemon-pasta-salad", meal: "lunch", tags: ["Pasta", "Salad", "Fish"], name: "Salmon, pea and lemon pasta salad", blurb: "Flaked salmon, peas and spinach with pasta shapes in a lemon and yogurt dressing.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates in lemon and pepper
    ingredients: [ing("pasta-shapes", 160), ing("salmon", 240), ing("peas", 120), ing("spinach", 60), ing("greek-yogurt", 100), ing("lemon-juice", 20), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Cook the pasta: Bring a large pan of water to the boil. Add the pasta and cook it for the time on the pack, usually 10 to 12 minutes, until soft with no hard centre.",
      "Marinate the salmon: Pat the salmon dry, spoon over a third of the lemon juice and add plenty of black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Cook the salmon: Heat the oil in a non-stick frying pan on a medium heat. Fry the salmon skin side down for 4 minutes, without moving it, then turn it and cook for 3 to 4 minutes more.",
      "Check the salmon: Press the thickest part with a fork. It is done when it is pale pink all the way through and flakes easily. Leave it to cool on a plate, then flake it, leaving out any skin.",
      "Add the peas: For the last 3 minutes of the pasta's time, add the peas to the pan.",
      "Cool the pasta: Drain the pasta and peas in a colander and run cold water over them for 1 to 2 minutes, until cool. Shake them well.",
      "Make the dressing: Stir the yogurt, the rest of the lemon juice and a good grind of black pepper together in a large bowl.",
      "Mix the salad: Rinse the spinach unless the bag says it is ready washed. Add the pasta, peas and spinach to the dressing and stir, then fold in the salmon gently.",
      "Serve: Pile the salad into bowls. Keep any for later covered in the fridge and eat it within a day.",
    ],
  },
  {
    id: "greek-style-chicken-pasta-salad", meal: "lunch", tags: ["Pasta", "Salad"], name: "Greek-style chicken pasta salad", blurb: "Oregano and lemon chicken with pasta, cucumber, tomato and onion, in a garlic yogurt dressing.", servings: 2, minutes: 25,
    // chef pass 2026-11-21: salt 1 g on the chicken
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): red onion, as in the picture (was onion); grilled strips marinated in lemon, oregano and salt; oregano in the dressing too
    ingredients: [ing("pasta-shapes", 140), ing("chicken", 240), ing("salt", 1), ing("cucumber", 150), ing("tomatoes", 170), ing("red-onion", 40), ing("oregano", 1), ing("lemon-juice", 20), ing("olive-oil", 15), ing("greek-yogurt", 80), ing("garlic", 5), ing("black-pepper", 1)],
    method: [
      "Cook the pasta: Bring a large pan of water to the boil. Add the pasta and cook it for the time on the pack, usually 10 to 12 minutes, until soft with no hard centre.",
      "Cut the chicken: Meanwhile, cut the chicken into strips, about 2 cm wide, and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with the salt, half the oregano, half the lemon juice and 1 teaspoon of the oil. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Brown the chicken: Heat the rest of the oil in a non-stick frying pan on a high heat until it shimmers. Add the chicken in one layer with space between the strips and leave it for 2 to 3 minutes, without stirring, until golden and charred underneath.",
      "Turn the chicken: Turn the strips and fry for 3 to 4 minutes more, turning now and then, until golden and charred in places.",
      "Check the chicken: Cut into the biggest piece. It must be piping hot all the way through with no pink left. Leave it to cool.",
      "Cool the pasta: Drain the pasta in a colander and run cold water over it for 1 to 2 minutes, until cool. Shake it well.",
      "Chop the salad: Cut the cucumber into small cubes and the tomatoes into small wedges. Peel the red onion and slice it very thinly.",
      "Make the dressing: Stir the yogurt, garlic purée, the rest of the lemon juice and oregano and a grind of black pepper together in a large bowl.",
      "Mix and serve: Add the pasta, chicken, cucumber, tomatoes and onion to the dressing and turn until coated. Keep any for later covered in the fridge and eat it within a day.",
    ],
  },
  {
    id: "bbq-chicken-rice-bowl", meal: "lunch", tags: ["Bowl"], name: "Barbecue chicken rice bowl", blurb: "Sticky barbecue chicken thighs on rice with cucumber, tomato, lettuce and a spoonful of yogurt.", servings: 2, minutes: 30,
    // chef pass 2026-11-21: black pepper 1 g on the chicken
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in barbecue sauce and pepper
    ingredients: [ing("chicken-thigh", 300), ing("black-pepper", 1), ing("bbq-sauce", 40), ing("rice", 140), ing("cucumber", 100), ing("tomatoes", 170), ing("lettuce", 60), ing("natural-yogurt", 60), ing("olive-oil", 10)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Cut the chicken: Meanwhile, cut the chicken into strips, about 2 cm wide, and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with the black pepper and a third of the barbecue sauce. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Brown the chicken: Heat the oil in a large non-stick frying pan on a medium heat, as the sauce catches easily. Lay the chicken in one layer and leave it for 3 minutes, without stirring, until golden underneath.",
      "Turn the chicken: Fry for 5 to 7 minutes more, turning now and then, until golden on all sides.",
      "Check the chicken: Cut into the thickest piece. It must be piping hot all the way through with no pink left. Cook it a little longer if not.",
      "Add the sauce: Turn the heat down to low, stir in the rest of the barbecue sauce and 2 tablespoons of water and turn the chicken for 1 minute, until sticky and glossy. Add a splash more water if it starts to catch.",
      "Chop the salad: Wash the cucumber, tomatoes and lettuce. Cut the cucumber and tomatoes into small cubes and shred the lettuce.",
      "Serve: Drain the rice well and spoon it into bowls. Top with the chicken, lettuce, cucumber and tomatoes and add a spoonful of yogurt. Eat straight away.",
    ],
  },
  {
    id: "egg-mushroom-spinach-rice-bowl", meal: "lunch", tags: ["Bowl", "Eggs"], name: "Egg, mushroom and spinach rice bowl with soy", blurb: "Garlic mushrooms and spinach on rice with fried eggs on top and a splash of soy sauce.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): fried eggs with golden, crisp edges
    ingredients: [ing("rice", 140), ing("eggs", 240), ing("mushrooms", 250), ing("spinach", 120), ing("garlic", 10), ing("soy", 20), ing("olive-oil", 15)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Get ready: Meanwhile, wipe the mushrooms clean and slice them. Rinse the spinach unless the bag says it is ready washed.",
      "Fry the mushrooms: Heat half the oil in a large non-stick frying pan on a high heat. Spread out the mushrooms and leave them for 3 minutes, until golden underneath. Stir and fry 2 to 3 minutes more, until golden all over.",
      "Add the garlic and spinach: Stir in the garlic purée for 1 minute, then add the spinach a handful at a time and stir until soft. Stir in half the soy sauce and tip it all into a bowl.",
      "Fry the eggs: Wipe the pan, heat the rest of the oil on a medium heat and crack in the eggs, picking out any shell. Fry for 3 to 4 minutes, until the whites are set and the edges crisp. Wash your hands after touching raw eggs.",
      "Serve: Drain the rice well and spoon it into bowls. Top with the mushrooms and spinach, then the eggs, and drizzle over the rest of the soy sauce.",
    ],
  },
  {
    id: "sweet-chilli-salmon-rice-bowl", meal: "lunch", tags: ["Bowl", "Fish"], name: "Sweet chilli salmon rice bowl", blurb: "Sweet chilli glazed salmon on rice with broccoli and crisp cucumber, finished with soy and lemon.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates under its sweet chilli glaze
    ingredients: [ing("salmon", 240), ing("sweet-chilli", 30), ing("rice", 140), ing("broccoli", 200), ing("cucumber", 100), ing("soy", 10), ing("lemon-juice", 10)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and line a baking tray with foil.",
      "Glaze the salmon: Put the salmon on the tray, skin side down, pat the top dry with kitchen paper and spread a third of the sweet chilli sauce over it. Wash your hands after touching raw fish.",
      "Marinate the salmon: Leave it for 10 minutes while the oven heats, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Bake the salmon: Bake for 8 minutes, spread over another third of the sauce and bake for 4 to 6 minutes more, until the glaze is glossy and sticky and the fish is pale pink all the way through and flakes easily.",
      "Cook the rice: Meanwhile, rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Add the broccoli: Cut the broccoli into small florets. For the last 4 minutes, add them to the rice pan, then drain the rice and broccoli together well.",
      "Make the dressing: Stir the rest of the sweet chilli sauce with the soy sauce and lemon juice in a cup. Cut the cucumber into small cubes.",
      "Serve: Spoon the rice and broccoli into bowls, add the salmon in large flakes and the cucumber, and drizzle over the dressing.",
    ],
  },
  {
    id: "tomato-mozzarella-naan-pizzas", meal: "lunch", tags: ["Quick", "Italian"], name: "Tomato and mozzarella naan pizzas", blurb: "Warm naans spread with a garlic and oregano tomato sauce, topped with sliced tomato and melted mozzarella.", servings: 2, minutes: 20,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): oregano over the cheese as well as in the sauce
    ingredients: [ing("naan", 260), ing("passata", 120), ing("garlic", 5), ing("oregano", 1), ing("mozzarella", 125), ing("tomatoes", 170), ing("lettuce", 60), ing("cucumber", 100)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7).",
      "Make the sauce: Put the passata, garlic purée and half the oregano in a small pan and simmer for 5 minutes, stirring now and then, until thick enough to hold its shape on a spoon, so the naans don't go soggy.",
      "Get the toppings ready: Slice the tomatoes thinly. Tear the mozzarella into small pieces and pat it dry with kitchen paper.",
      "Top the naans: Lay the naans on a large baking tray. Spread the sauce over them, almost to the edges, then add the tomato slices and the mozzarella and scatter over the rest of the oregano.",
      "Bake the pizzas: Bake for 8 to 10 minutes, until the cheese is bubbling and browned in spots and the edges of the naans are crisp and golden.",
      "Make the salad: Meanwhile, wash the lettuce and cucumber. Shred the lettuce and slice the cucumber thinly.",
      "Serve: Cut each pizza into quarters and serve with the salad on the side. Leave it for a minute first, as the cheese is very hot.",
    ],
  },
  {
    id: "cheese-onion-omelette-salad", meal: "lunch", tags: ["Eggs", "Quick"], name: "Cheese and onion omelette with salad", blurb: "A folded omelette filled with soft fried onion and melting cheddar, with lettuce, tomato and cucumber.", servings: 1, minutes: 15,
    // chef pass 2026-11-21: a pinch of salt (1 g) in the eggs
    ingredients: [ing("eggs", 180), ing("salt", 1), ing("cheddar", 30), ing("onion", 75), ing("olive-oil", 10), ing("lettuce", 40), ing("tomatoes", 85), ing("cucumber", 60), ing("black-pepper", 1)],
    method: [
      "Get ready: Peel the onion and slice it thinly. Grate the cheddar on the coarse side of a grater.",
      "Fry the onion: Heat half the oil in a non-stick frying pan, about 20 cm across, on a medium heat. Fry the onion for 7 to 8 minutes, stirring now and then, until soft, sweet and golden. Tip it on to a plate.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add the salt and a grind of black pepper and beat with a fork until smooth. Wash your hands after touching raw eggs.",
      "Start the omelette: Heat the rest of the oil in the pan on a medium heat. Pour in the eggs and tilt the pan so they cover the bottom.",
      "Cook the eggs: Cook for 1 to 2 minutes, pulling the set edges into the middle with a spatula and tipping the runny egg into the gaps.",
      "Add the filling: While the top is still a little runny, scatter the onion and cheese over one half. Cook for 1 to 2 minutes more, until the egg is completely set and golden underneath (lift an edge to check).",
      "Make the salad: Wash the lettuce, tomato and cucumber. Tear the lettuce, cut the tomato into wedges and slice the cucumber.",
      "Serve: Fold the omelette in half over the filling, slide it on to a warm plate and serve the salad beside it.",
    ],
  },
  {
    id: "chinese-style-beef-lettuce-cups", meal: "lunch", tags: ["Chinese"], name: "Chinese-style beef lettuce cups", blurb: "Beef mince fried with mushrooms, garlic, soy and honey, spooned into crisp lettuce leaves over a little rice.", servings: 2, minutes: 25,
    // chef pass 2026-11-21: black pepper 1 g
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in soy, garlic and pepper; mushrooms in 1 cm pieces
    ingredients: [ing("beef-mince", 250), ing("mushrooms", 150), ing("garlic", 10), ing("black-pepper", 1), ing("soy", 20), ing("honey", 10), ing("lettuce", 120), ing("cucumber", 100), ing("rice", 100), ing("olive-oil", 10)],
    method: [
      "Marinate the mince: Mix the beef with half the soy sauce, half the garlic purée and the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Get ready: Meanwhile, wipe the mushrooms clean and chop them into pieces about 1 cm. Cut the cucumber into small cubes.",
      "Get the lettuce ready: Separate the lettuce into whole leaves, wash them gently and shake them dry. Pick out the cup-shaped ones.",
      "Brown the mince: Heat the oil in a large non-stick frying pan on a high heat. Add the beef, press it flat and leave it for 3 minutes, until browned underneath. Break it up and fry for 3 minutes more, until browned all over.",
      "Add the mushrooms: Add the mushrooms and fry for 4 to 5 minutes, stirring now and then, until golden and their liquid has gone. Stir in the rest of the garlic purée for 30 seconds.",
      "Add the sauce: Turn the heat down to medium. Stir in the rest of the soy sauce, the honey and 2 tablespoons of water and cook for 1 to 2 minutes, until glossy. The mince must be piping hot all the way through with no pink left.",
      "Serve: Drain the rice well. Spoon a little rice into each lettuce cup, top with the mince and the cucumber, and eat them with your fingers.",
    ],
  },

  // ---- dinners
  {
    id: "chicken-tikka-masala-style-curry", meal: "dinner", tags: ["Batch cook", "Indian"], name: "Chicken tikka masala-style curry with rice", blurb: "Spiced yogurt chicken, grilled until charred, in a creamy tomato and onion sauce, served with rice.", servings: 4, minutes: 45,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): chilli in the marinade, the fridge line on it, the yogurt swirled on top
    ingredients: [ing("chicken", 600), ing("natural-yogurt", 150), ing("lemon-juice", 15), ing("garlic", 15), ing("cumin", 3), ing("chilli-powder", 2), ing("cinnamon", 1), ing("onion", 150), ing("chopped-tomato-puree", 30), ing("chopped-tomatoes", 400), ing("coconut-milk", 200), ing("olive-oil", 15), ing("salt", 1), ing("rice", 300)],
    method: [
      "Cut the chicken: Cut the chicken into large bite-sized pieces. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Mix it with half the yogurt, chilli powder, garlic purée, cumin and salt, and the lemon juice. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Soften the onion: Peel and chop the onion. Heat the oil in a large saucepan on a medium heat and fry the onion for 8 to 10 minutes, stirring now and then, until soft, sweet and golden.",
      "Add the spices: Stir in the rest of the garlic, cumin and chilli powder, the cinnamon and the tomato purée and cook for 1 minute, stirring all the time, until the purée darkens.",
      "Simmer the sauce: Pour in the chopped tomatoes and the coconut milk, add the rest of the salt and bring to a bubble. Simmer for 10 to 15 minutes, stirring now and then, until thick.",
      "Cook the rice: Meanwhile, rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Grill the chicken: Heat the grill to high and line a baking tray with foil. Spread the chicken out on it with space between the pieces and grill for 8 to 10 minutes, turning once, until charred at the edges.",
      "Add the chicken: Stir the chicken into the sauce and simmer for 5 minutes, until the sauce coats every piece.",
      "Check the chicken: Cut into the biggest piece. It must be piping hot all the way through with no pink left. Simmer a little longer if not.",
      "Serve: Drain the rice well and spoon it beside the curry. Drizzle the rest of the yogurt over the curry in a swirl. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "chicken-mushroom-stroganoff-rice", meal: "dinner", tags: ["One pan"], name: "Chicken and mushroom stroganoff-style with rice", blurb: "Strips of chicken and mushrooms in a creamy mustard and onion sauce, served with rice.", servings: 4, minutes: 35,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken strips marinate in salt, garlic and pepper
    ingredients: [ing("chicken", 500), ing("mushrooms", 300), ing("onion", 150), ing("garlic", 10), ing("mustard", 10), ing("soft-cheese", 150), ing("milk", 150), ing("olive-oil", 15), ing("salt", 1), ing("black-pepper", 1), ing("rice", 280)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Get ready: Meanwhile, peel the onion and slice it thinly. Wipe the mushrooms clean and slice them.",
      "Cut the chicken: Cut the chicken into thin strips, about 1 cm wide, and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with half the salt, half the garlic purée and a grind of the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Brown the chicken: Heat half the oil in a large non-stick frying pan on a high heat until it shimmers. Lay in half the chicken, one layer with space between the strips, and leave it for 2 to 3 minutes, until golden underneath.",
      "Turn the chicken: Turn the strips and fry for 2 minutes more, until golden on the other side. Lift them on to a plate, add the rest of the oil and brown the rest of the chicken the same way.",
      "Brown the mushrooms: Add the mushrooms to the pan in one layer and leave them for 3 minutes without stirring, until golden underneath, then stir for 1 minute.",
      "Add the onion: Turn the heat to medium, add the onion and fry for 5 minutes, stirring now and then, until soft and golden. Stir in the rest of the garlic purée for 30 seconds.",
      "Make the sauce: Turn the heat down to low. Add 3 tablespoons of water and scrape up the brown bits, then stir in the soft cheese, milk and mustard until smooth. Add the rest of the salt and a good grind of black pepper.",
      "Add the chicken: Put the chicken and its juices back in the pan and simmer gently for 4 to 5 minutes, stirring, without letting it boil hard, until the sauce coats the back of a spoon.",
      "Check the chicken: Cut into the thickest piece. It must be piping hot all the way through with no pink left. Simmer a little longer if not.",
      "Serve: Drain the rice well, spoon it on to warm plates and spoon the stroganoff beside it.",
    ],
  },
  {
    id: "hunters-style-chicken-rice-peas", meal: "dinner", tags: ["British"], name: "Hunter's-style chicken with rice and peas", blurb: "Chicken breasts wrapped in ham, topped with barbecue sauce and melted cheddar, with rice and peas.", servings: 2, minutes: 35,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in barbecue sauce and pepper before it is wrapped
    ingredients: [ing("chicken", 300), ing("ham", 50), ing("bbq-sauce", 40), ing("cheddar", 40), ing("olive-oil", 5), ing("black-pepper", 1), ing("rice", 140), ing("peas", 160)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Brush a small roasting tin with the oil.",
      "Marinate the chicken: Brush the chicken with a third of the barbecue sauce and add a grind of black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Wrap the chicken: Lay the chicken in the tin and wrap each fillet in a slice of ham, tucking the ends underneath. Wash your hands after touching raw chicken.",
      "Bake the chicken: Bake for 15 minutes, until the ham starts to crisp. Meanwhile, grate the cheddar.",
      "Cook the rice: While the chicken bakes, rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Add the topping: Spoon the rest of the barbecue sauce over the chicken, scatter the cheese on top and bake for 8 to 10 minutes more, until the cheese is bubbling and golden.",
      "Add the peas: For the last 3 minutes of the rice's time, add the peas to the pan. Drain the rice and peas together well.",
      "Check the chicken: Cut into the thickest fillet. It must be piping hot all the way through with no pink left and clear juices. Bake it a little longer if not.",
      "Serve: Spoon the rice and peas on to warm plates, add the chicken and spoon over any sauce from the tin.",
    ],
  },
  {
    id: "crispy-chicken-goujons-peas", meal: "dinner", tags: ["British"], name: "Crispy chicken goujons with peas and tomatoes", blurb: "Strips of chicken in a crisp wholemeal crumb, baked until golden, with peas, tomato and a garlic yogurt dip.", servings: 2, minutes: 35,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the strips marinate in salt and pepper before they are crumbed
    ingredients: [ing("chicken", 300), ing("bread", 80), ing("eggs", 60), ing("olive-oil", 15), ing("salt", 1), ing("black-pepper", 1), ing("peas", 200), ing("tomatoes", 170), ing("greek-yogurt", 80), ing("garlic", 5)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7) and brush a baking tray with a little of the oil.",
      "Cut the chicken: Cut the chicken into strips, about 2 cm wide. Wash the knife and the board in hot soapy water straight after.",
      "Marinate the chicken: Toss it with half the salt and half the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Make the crumbs: Grate the bread on the coarse side of a grater, or whizz it in a food processor.",
      "Toast the crumbs: Heat the rest of the oil in a large frying pan on a medium heat. Stir the crumbs for 3 to 4 minutes, until golden and crisp. Tip them into a wide bowl and stir in the rest of the salt and black pepper.",
      "Beat the egg: Crack the egg into a second wide bowl, picking out any shell, and beat it with a fork.",
      "Coat the chicken: Dip each strip in the egg, then roll it in the crumbs, pressing them on, and lay it on the tray with space between the strips so they crisp. Wash your hands after touching raw chicken and egg.",
      "Bake the goujons: Bake for 15 to 18 minutes, turning them halfway, until golden brown and crisp.",
      "Check the chicken: Cut into the thickest strip. It must be piping hot all the way through with no pink left. Bake a little longer if not.",
      "Make the dip and peas: Meanwhile, stir the garlic purée into the yogurt. Cook the peas in a small pan of boiling water for 3 minutes and drain them. Cut the tomatoes into wedges.",
      "Serve: Pile the goujons on to warm plates with the peas and tomatoes and the garlic yogurt for dipping.",
    ],
  },
  {
    id: "cheeseburger-pasta", meal: "dinner", tags: ["Pasta", "Batch cook"], name: "Cheeseburger pasta", blurb: "Pasta shapes in a beef, onion and tomato sauce with a little mustard, topped with melted cheddar.", servings: 4, minutes: 30,
    // chef pass 2026-11-21: salt 1 -> 3 g
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in mustard, salt and garlic; the cheese grilled golden
    ingredients: [ing("beef-mince", 500), ing("onion", 150), ing("garlic", 10), ing("pasta-shapes", 320), ing("mustard", 10), ing("chopped-tomatoes", 400), ing("cheddar", 100), ing("olive-oil", 10), ing("salt", 3), ing("black-pepper", 1)],
    method: [
      "Marinate the mince: Mix the beef with the mustard, half the salt and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands after touching raw meat.",
      "Boil the water: Boil the kettle, pour the water into a large saucepan and bring it back to the boil on a high heat.",
      "Get ready: Peel and chop the onion. Grate the cheddar on the coarse side of a grater.",
      "Brown the mince: Heat the oil in a large deep frying pan on a high heat. Add the beef, press it flat and leave it for 3 minutes without stirring, until browned underneath. Break it up and fry for 3 minutes more.",
      "Add the onion: Turn the heat to medium-high, add the onion and fry for 5 minutes, stirring now and then, until the onion is soft and the mince is browned all over.",
      "Cook the pasta: Meanwhile, add the pasta to the boiling water, stir once and cook for 10 to 12 minutes, or as the pack says, until soft with no hard centre.",
      "Make the sauce: Stir the rest of the garlic purée into the mince for 30 seconds. Add the chopped tomatoes and the rest of the salt and simmer for 8 to 10 minutes, stirring now and then, until thick and rich.",
      "Check the mince: The mince must be piping hot all the way through with no pink left. Simmer it a little longer if not.",
      "Mix it together: Scoop out a mugful of the pasta water, then drain the pasta. Stir it into the sauce with a splash of the water and half the cheese.",
      "Melt the cheese: Scatter the rest of the cheese over the top. If your pan can go under a hot grill, grill it for 2 to 3 minutes, until golden in patches; if not, cover it and leave it on a low heat for 2 minutes, until melted.",
      "Serve: Add a grind of black pepper and spoon into warm bowls. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "beef-koftas-cucumber-yogurt-naan", meal: "dinner", tags: ["Barbecue"], name: "Beef koftas with cucumber yogurt and naan", blurb: "Grilled beef koftas spiced with garlic, cinnamon and chilli, with a cucumber yogurt, a tomato and onion salad and warm naan.", servings: 4, minutes: 35,
    // chef pass 2026-11-21: salt 1 -> 3 g, most in the koftas and the rest in the cucumber yogurt
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the kofta mix marinates before shaping; cubed cucumber in the yogurt
    ingredients: [ing("beef-mince", 500), ing("onion", 150), ing("garlic", 10), ing("cinnamon", 1), ing("chilli-powder", 1), ing("salt", 3), ing("olive-oil", 5), ing("greek-yogurt", 200), ing("cucumber", 150), ing("lemon-juice", 10), ing("tomatoes", 255), ing("lettuce", 100), ing("naan", 520)],
    method: [
      "Heat the grill: Turn the grill on to high and line a baking tray with foil. Brush the foil with the oil.",
      "Get the onion ready: Peel the onion. Grate half of it on the coarse side of a grater and slice the other half very thinly.",
      "Mix the koftas: Put the beef in a bowl with the grated onion, half the garlic purée, the cinnamon, chilli powder and most of the salt. Mix well with your hands for 1 minute, then wash them.",
      "Marinate the mince: Leave the mixture for 10 minutes so the spices soak in, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Shape the koftas: Divide the mixture into 12 pieces and roll each one into a sausage shape, about 8 cm long. Lay them on the tray.",
      "Grill the koftas: Grill close to the heat for 10 to 12 minutes, turning every 3 minutes, until browned all over and a little charred.",
      "Check the koftas: Cut one open. It must be piping hot all the way through with no pink left. Grill them a little longer if not.",
      "Make the cucumber yogurt: Meanwhile, cut the cucumber into small cubes, about 1 cm, and stir them into the yogurt with the rest of the garlic, the lemon juice and the rest of the salt.",
      "Make the salad: Wash the tomatoes and lettuce. Cut the tomatoes into wedges, shred the lettuce and mix them with the sliced onion.",
      "Warm the naans: When the koftas come out, warm the naans under the grill for 1 minute on each side.",
      "Serve: Lay a naan on each plate, add the salad and the koftas and spoon the cucumber yogurt on top.",
    ],
  },
  {
    id: "korean-style-beef-rice-bowl", meal: "dinner", tags: ["Bowl", "Eggs"], name: "Korean-style beef and rice bowl", blurb: "Beef mince in a sticky garlic, soy, honey and chilli sauce on rice with spinach, cucumber and a fried egg.", servings: 2, minutes: 25,
    // chef pass 2026-11-21: black pepper 1 g in the sauce
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in soy and garlic
    ingredients: [ing("beef-mince", 250), ing("garlic", 10), ing("soy", 30), ing("honey", 15), ing("chilli-powder", 1), ing("black-pepper", 1), ing("rice", 140), ing("spinach", 100), ing("cucumber", 100), ing("eggs", 120), ing("olive-oil", 15)],
    method: [
      "Marinate the mince: Mix the beef with 1 tablespoon of the soy sauce and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Mix the sauce: Meanwhile, stir the rest of the soy sauce and garlic purée with the honey, chilli powder, black pepper and 2 tablespoons of water in a cup.",
      "Get the vegetables ready: Cut the cucumber into thin sticks. Rinse the spinach unless the bag says it is ready washed.",
      "Brown the mince: Heat half the oil in a large non-stick frying pan on a high heat. Add the beef, press it flat and leave it for 3 minutes to brown underneath. Break it up and fry 3 to 5 minutes more, until a little crisp.",
      "Add the sauce: Turn the heat down to medium, pour in the sauce and stir for 1 to 2 minutes, until sticky and glossy and clinging to the mince. Add a splash of water if it catches.",
      "Check the mince: It must be piping hot all the way through with no pink left. Tip it into a bowl.",
      "Wilt the spinach: Put the spinach in the hot pan for 1 minute, stirring, until just soft. Lift it out on to a plate.",
      "Fry the eggs: Heat the rest of the oil in the pan on a medium heat and crack in the eggs, picking out any shell. Fry for 3 to 4 minutes, until the whites are completely set. Wash your hands after touching raw eggs.",
      "Serve: Drain the rice well and spoon it into bowls. Arrange the mince, spinach and cucumber on top and finish each bowl with an egg.",
    ],
  },
  {
    id: "salmon-spinach-mozzarella-pasta-bake", meal: "dinner", tags: ["Bake", "Fish", "Pasta"], name: "Salmon, spinach and mozzarella pasta bake", blurb: "Pasta and chunks of salmon in a garlic tomato sauce with spinach, baked under bubbling mozzarella.", servings: 4, minutes: 45,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon chunks marinate in oil, garlic and pepper
    ingredients: [ing("pasta-shapes", 300), ing("salmon", 360), ing("passata", 500), ing("spinach", 150), ing("garlic", 10), ing("oregano", 1), ing("mozzarella", 125), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6).",
      "Cut the salmon: Take the skin off the salmon and cut the fish into chunks, about 3 cm across. Wash your hands after touching raw fish.",
      "Marinate the salmon: Toss it with 1 teaspoon of the oil, a third of the garlic purée and the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Cook the pasta: Bring a large pan of water to the boil. Add the pasta and cook it for 2 minutes less than the pack says, then drain it in a colander.",
      "Make the sauce: Meanwhile, heat the rest of the oil in a large saucepan on a medium heat. Stir in the rest of the garlic purée and the oregano for 30 seconds, then add the passata and simmer for 10 minutes, until thick.",
      "Add the spinach: Stir the spinach into the sauce a handful at a time, until soft, and bubble for 2 minutes more so it isn't watery.",
      "Fill the dish: Stir the pasta into the sauce, then fold in the salmon gently. Tip it all into an ovenproof dish, about 20 by 30 cm.",
      "Add the cheese: Tear the mozzarella into small pieces, pat them dry with kitchen paper and scatter them over the top.",
      "Bake: Bake for 20 to 25 minutes, until the cheese is bubbling and golden brown in patches and a piece of salmon from the middle flakes easily.",
      "Serve: Leave it to stand for 5 minutes, then spoon it on to warm plates. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "mushroom-carbonara-pasta", meal: "dinner", tags: ["Quick", "Pasta", "Eggs", "Italian"], name: "Mushroom carbonara-style pasta", blurb: "Pasta with golden garlic mushrooms in a silky egg and cheddar sauce with plenty of black pepper.", servings: 2, minutes: 20,
    ingredients: [ing("pasta-shapes", 180), ing("mushrooms", 250), ing("eggs", 120), ing("cheddar", 50), ing("garlic", 5), ing("olive-oil", 15), ing("black-pepper", 2)],
    method: [
      "Cook the pasta: Bring a large pan of water to the boil. Add the pasta and cook it for the time on the pack, usually 10 to 12 minutes, stirring once or twice, until soft with no hard centre.",
      "Fry the mushrooms: Meanwhile, wipe the mushrooms clean and slice them. Heat the oil in a large frying pan on a high heat. Spread out the mushrooms and leave them for 3 minutes, until golden underneath.",
      "Brown the mushrooms: Stir and fry for 3 to 4 minutes more, until golden all over and their liquid has gone.",
      "Add the garlic: Stir the garlic purée into the mushrooms for 30 seconds, then take the pan off the heat.",
      "Make the egg mixture: Grate the cheddar finely. Crack the eggs into a bowl, picking out any shell, add most of the cheese and plenty of black pepper and beat with a fork. Wash your hands after touching raw eggs.",
      "Save some water: Scoop out a mugful of the pasta water, then drain the pasta in a colander.",
      "Mix it together: Tip the pasta into the mushroom pan with a splash of the pasta water and toss well. Keep the rest of the water to hand.",
      "Cook the sauce: Put the pan on a low heat, pour in the egg mixture and stir all the time for 2 to 3 minutes, until it thickens into a creamy sauce and is cooked through, with no runny egg left.",
      "Serve: Loosen it with a little more pasta water if it is too thick. Spoon into warm bowls, scatter the rest of the cheese over and add another grind of black pepper.",
    ],
  },
  {
    id: "mushroom-pea-coconut-curry", meal: "dinner", tags: ["Vegan", "Batch cook"], name: "Mushroom and pea coconut curry with rice", blurb: "Mushrooms and peas in a gently spiced tomato and coconut sauce with spinach, served with rice.", servings: 4, minutes: 35,
    // chef pass 2026-11-21: salt 1 -> 3 g; oil 15 -> 20 ml so the mushrooms brown in two batches
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): mushrooms halved or thickly sliced
    ingredients: [ing("mushrooms", 500), ing("onion", 150), ing("garlic", 10), ing("cumin", 3), ing("chilli-powder", 2), ing("cinnamon", 1), ing("chopped-tomatoes", 400), ing("coconut-milk", 400), ing("peas", 300), ing("spinach", 100), ing("olive-oil", 20), ing("salt", 3), ing("rice", 300)],
    method: [
      "Get ready: Peel and chop the onion. Wipe the mushrooms clean and cut them in half, or into thick slices if large.",
      "Brown the mushrooms: Heat a third of the oil in a large saucepan on a high heat. Add half the mushrooms and leave them for 3 minutes without stirring, until golden underneath, then stir for 2 minutes. Lift them on to a plate.",
      "Brown the rest: Add another third of the oil and brown the rest of the mushrooms the same way. Lift them on to the plate.",
      "Soften the onion: Turn the heat to medium, add the rest of the oil and fry the onion for 6 to 8 minutes, stirring now and then, until soft and golden.",
      "Add the spices: Stir in the garlic purée, cumin, chilli powder and cinnamon and cook for 30 seconds, stirring, until they smell fragrant.",
      "Simmer the curry: Pour in the chopped tomatoes and the coconut milk, add the salt and the mushrooms and bring to a bubble. Simmer for 12 to 15 minutes, stirring now and then, until thick enough to coat the back of a spoon.",
      "Cook the rice: Meanwhile, rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Add the peas and spinach: Stir the peas into the curry and simmer for 3 minutes, until hot. Add the spinach a handful at a time and stir until soft.",
      "Serve: Drain the rice well and serve it with the curry. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "egg-foo-young-rice", meal: "dinner", tags: ["Eggs", "Chinese"], name: "Egg foo young with rice", blurb: "A golden Chinese-style omelette filled with mushrooms, peas and onion, with a soy and honey sauce and rice.", servings: 2, minutes: 25,
    // chef pass 2026-11-21: garlic 5 g in the sauce
    ingredients: [ing("eggs", 300), ing("mushrooms", 150), ing("peas", 100), ing("onion", 75), ing("soy", 20), ing("honey", 5), ing("garlic", 5), ing("olive-oil", 15), ing("black-pepper", 1), ing("rice", 140)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Get ready: Meanwhile, peel the onion and slice it thinly. Wipe the mushrooms clean and slice them.",
      "Brown the mushrooms: Heat half the oil in a non-stick frying pan, about 24 cm across, on a high heat. Fry the mushrooms for 3 minutes, without stirring, until golden underneath.",
      "Add the onion and peas: Add the onion and fry for 3 minutes more, stirring, until soft. Stir in the peas for 2 minutes.",
      "Beat the eggs: Crack the eggs into a large bowl, picking out any shell, add a grind of black pepper and beat with a fork. Stir in the cooked vegetables. Wash your hands after touching raw eggs.",
      "Cook the omelette: Heat the rest of the oil in the pan on a medium heat. Pour in the egg mixture, spread it out and cook for 4 to 5 minutes, without stirring, until golden underneath and almost set on top.",
      "Turn it over: Cut the omelette into quarters with the edge of a spatula and turn each piece over. Cook for 2 to 3 minutes more, until the egg is completely set.",
      "Make the sauce: Put the soy sauce, honey, garlic purée and 4 tablespoons of water in a small pan and let it bubble for 2 minutes, until it thickens a little and turns glossy.",
      "Serve: Drain the rice well and spoon it on to warm plates. Add the omelette and spoon the sauce over it.",
    ],
  },
  {
    id: "baked-bean-spinach-curry-naan", meal: "dinner", tags: ["Batch cook", "Indian"], name: "Spiced baked bean and spinach curry with naan", blurb: "Baked beans simmered with onion, garlic, cumin, chilli and tomatoes, with spinach, yogurt and warm naan.", servings: 4, minutes: 30,
    ingredients: [ing("baked-beans", 800), ing("chopped-tomatoes", 400), ing("onion", 150), ing("garlic", 10), ing("cumin", 3), ing("chilli-powder", 2), ing("spinach", 150), ing("olive-oil", 15), ing("natural-yogurt", 120), ing("naan", 520)],
    method: [
      "Get ready: Peel and chop the onion. Rinse the spinach unless the bag says it is ready washed.",
      "Soften the onion: Heat the oil in a large saucepan on a medium heat. Fry the onion for 8 minutes, stirring now and then, until soft, sweet and golden.",
      "Add the spices: Stir in the garlic purée, cumin and chilli powder and cook for 30 seconds, stirring, until they smell fragrant.",
      "Add the beans and tomatoes: Tip in the baked beans and the chopped tomatoes, stir well and bring to a bubble.",
      "Simmer the curry: Turn the heat down and simmer for 10 to 12 minutes, stirring now and then, until thick and a deep orange-red.",
      "Add the spinach: Stir in the spinach a handful at a time for 2 minutes, until soft and dark green.",
      "Warm the naans: Meanwhile, warm the naans in a toaster or under a medium grill for 1 to 2 minutes on each side, until soft and hot.",
      "Serve: Spoon the curry into warm bowls, add a spoonful of yogurt to each and serve the naans on the side. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "chicken-arrabbiata-pasta", meal: "dinner", tags: ["Pasta", "Italian"], name: "Chicken arrabbiata-style pasta", blurb: "Pasta and golden chicken in a garlicky tomato sauce with a kick of chilli, spinach and a little cheddar.", servings: 4, minutes: 30,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in oregano, garlic, salt and oil
    ingredients: [ing("pasta-shapes", 300), ing("chicken", 400), ing("passata", 500), ing("garlic", 15), ing("chilli-powder", 2), ing("oregano", 1), ing("olive-oil", 15), ing("salt", 1), ing("spinach", 100), ing("cheddar", 40), ing("black-pepper", 1)],
    method: [
      "Boil the water: Boil the kettle, pour the water into a large saucepan and bring it back to the boil on a high heat.",
      "Cut the chicken: Cut the chicken into bite-sized pieces, about 2 cm across, and pat them dry with kitchen paper. Wash your hands, the knife and the board in hot soapy water straight after.",
      "Marinate the chicken: Toss it with half the salt, the oregano, a third of the garlic purée and 1 teaspoon of the oil. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Brown the chicken: Heat the rest of the oil in a large deep frying pan on a high heat. Add the chicken in one layer with space between the pieces (two batches if your pan is small). Leave it for 2 to 3 minutes, until golden underneath.",
      "Turn the chicken: Turn the pieces and fry for 3 to 4 minutes more, turning now and then, until golden on all sides.",
      "Cook the pasta: Meanwhile, add the pasta to the boiling water, stir once and cook for 10 to 12 minutes, or as the pack says, until soft with no hard centre.",
      "Make the sauce: Turn the heat down to medium. Stir the rest of the garlic purée and the chilli powder into the chicken for 30 seconds, then pour in the passata and the rest of the salt and simmer for 8 to 10 minutes, until thick.",
      "Check the chicken: Cut into the biggest piece. It must be piping hot all the way through with no pink left. Simmer a little longer if not.",
      "Add the spinach: Stir in the spinach a handful at a time, until soft. Grate the cheddar finely.",
      "Mix it together: Scoop out a mugful of the pasta water, then drain the pasta. Stir it into the sauce with a splash of the water until every piece is coated.",
      "Serve: Spoon into warm bowls, scatter the cheese over and add a grind of black pepper. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "chicken-satay-skewers-rice", meal: "dinner", tags: ["Barbecue"], name: "Chicken satay skewers with rice and cucumber", blurb: "Grilled chicken skewers with a warm peanut, soy and honey sauce, served with rice and crisp cucumber.", servings: 2, minutes: 35,
    // chef pass 2026-11-21: cumin 1 g in the marinade; chilli powder 1 g in the satay sauce
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the fridge line on the marinade
    ingredients: [ing("chicken", 300), ing("soy", 30), ing("honey", 15), ing("garlic", 5), ing("cumin", 1), ing("olive-oil", 5), ing("peanut-butter", 50), ing("chilli-powder", 1), ing("lemon-juice", 10), ing("rice", 140), ing("cucumber", 150)],
    method: [
      "Soak the skewers: Put 4 wooden skewers in a dish of cold water to soak for 10 minutes, so they don't burn.",
      "Cut the chicken: Cut the chicken into chunks, about 3 cm across. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Mix it with half the soy sauce, half the honey, the garlic purée and cumin. Leave it for 10 minutes while the skewers soak, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Thread the skewers: Heat the grill to high and line a baking tray with foil brushed with the oil. Thread the chicken on to the skewers and lay them on the tray.",
      "Grill the chicken: Grill close to the heat for 10 to 12 minutes, turning every few minutes, until golden and charred at the edges.",
      "Check the chicken: Cut into the thickest piece. It must be piping hot all the way through with no pink left. Grill a little longer if not.",
      "Make the satay sauce: Meanwhile, put the peanut butter, the rest of the soy sauce and honey, the chilli powder, the lemon juice and 4 tablespoons of water in a small pan. Warm it on a low heat, stirring, until smooth and glossy.",
      "Cut the cucumber: Cut the cucumber into thin half-moons.",
      "Serve: Drain the rice well and spoon it on to warm plates. Add the skewers and the cucumber and spoon the satay sauce over the chicken.",
    ],
  },
  {
    id: "chicken-almond-stir-fry-rice", meal: "dinner", tags: ["Chinese"], name: "Chicken and almond stir-fry with rice", blurb: "Chicken, broccoli, mushrooms and onion stir-fried with garlic and soy, scattered with toasted almonds, on rice.", servings: 2, minutes: 25,
    // chef pass 2026-11-21: black pepper 1 g on the chicken
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in soy, garlic and pepper
    ingredients: [ing("chicken", 300), ing("black-pepper", 1), ing("almonds", 30), ing("broccoli", 200), ing("mushrooms", 150), ing("onion", 75), ing("garlic", 10), ing("soy", 30), ing("honey", 5), ing("olive-oil", 15), ing("rice", 140)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Cut the chicken: Meanwhile, cut the chicken into thin strips, about 1 cm wide. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with 1 tablespoon of the soy sauce, half the garlic purée and the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Get ready: Cut the broccoli into small florets. Peel the onion and cut it into chunks. Wipe the mushrooms clean and slice them.",
      "Toast the almonds: Chop the almonds roughly. Toast them in a dry wok or large frying pan on a medium heat for 2 to 3 minutes, stirring, until golden and they smell toasty. Tip them on to a plate.",
      "Brown the chicken: Heat the oil in the wok on a high heat until it shimmers. Lay in the chicken in one layer with space between the strips (two batches if your wok is small). Leave it for 2 to 3 minutes, without stirring, until golden underneath.",
      "Turn the chicken: Turn the strips and fry for 2 to 3 minutes more, until golden on the other side too. Lift them on to a clean plate.",
      "Add the vegetables: Add the onion, broccoli and mushrooms with 2 tablespoons of water and stir-fry for 3 to 4 minutes, until the broccoli is bright green and just tender. No longer, or it goes dark.",
      "Add the sauce: Turn the heat down to medium. Tip the chicken and its juices back in, add the rest of the garlic purée and soy sauce, the honey and 2 tablespoons of water and toss for 1 to 2 minutes, until glossy and coating everything.",
      "Check the chicken: Cut into the thickest piece of chicken: it must be piping hot all the way through with no pink left. If not, cook for 1 to 2 minutes more.",
      "Serve: Drain the rice well and spoon it on to warm plates. Pile the stir-fry on top and scatter over the almonds.",
    ],
  },
  {
    id: "spiced-yogurt-salmon-rice", meal: "dinner", tags: ["Fish"], name: "Spiced yogurt salmon with rice and cucumber salad", blurb: "Salmon baked under a cumin, chilli and garlic yogurt, with rice and a tomato, cucumber and onion salad.", servings: 2, minutes: 30,
    // chef pass 2026-11-21: salt 1 g, half in the topping and half on the salad
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): red onion (was onion) and dried oregano in the topping, as in the picture; the salmon marinates under it
    ingredients: [ing("salmon", 240), ing("greek-yogurt", 60), ing("cumin", 1), ing("chilli-powder", 1), ing("oregano", 1), ing("garlic", 5), ing("salt", 1), ing("lemon-juice", 15), ing("rice", 140), ing("cucumber", 150), ing("tomatoes", 170), ing("red-onion", 40), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7) and line a baking tray with foil.",
      "Mix the spiced yogurt: Stir the yogurt, cumin, chilli powder, oregano, garlic purée, half the salt and half the lemon juice together until smooth.",
      "Coat the salmon: Pat the salmon dry, put it on the tray, skin side down, and spread the yogurt thickly over the tops. Wash your hands after touching raw fish.",
      "Marinate the salmon: Leave it for 10 minutes while you rinse the rice, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Bake the salmon: Meanwhile, bake the salmon on the top shelf for 12 to 14 minutes, until the topping is golden at the edges.",
      "Check the salmon: Press the thickest part with a fork. It is done when it is pale pink all the way through and flakes easily. Bake it a little longer if not.",
      "Make the salad: Wash the cucumber and tomatoes and cut them into small cubes. Peel the red onion and chop it finely.",
      "Dress the salad: Mix the cucumber, tomatoes and onion with the rest of the lemon juice, the rest of the salt and a grind of black pepper.",
      "Serve: Drain the rice well and spoon it on to warm plates with the salmon and the salad beside it.",
    ],
  },
  {
    id: "chicken-egg-rice-bowl", meal: "dinner", tags: ["Bowl", "Eggs"], name: "Chicken and egg rice bowl with soy and onion", blurb: "Chicken and soft onion simmered in a sweet soy sauce, set with beaten egg and spooned over rice.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in soy
    ingredients: [ing("chicken-thigh", 300), ing("onion", 150), ing("soy", 30), ing("honey", 15), ing("spinach", 80), ing("eggs", 180), ing("rice", 140)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Get ready: Meanwhile, peel the onion and slice it thinly. Cut the chicken into bite-sized pieces. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with 1 tablespoon of the soy sauce. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Make the sauce: Put the rest of the soy sauce, the honey and 150 ml of water in a large frying pan and bring it to a bubble on a medium heat.",
      "Simmer the chicken: Add the onion and chicken, spread them out and simmer for 8 to 10 minutes, turning now and then, until the onion is soft and golden and the sauce has bubbled down by about half and looks glossy.",
      "Check the chicken: Cut into the biggest piece. It must be piping hot all the way through with no pink left. Simmer a little longer if not.",
      "Add the spinach: Stir in the spinach for 1 minute, until just soft.",
      "Add the eggs: Crack the eggs into a jug, picking out any shell, and beat them lightly. Pour them over the chicken, cover the pan and cook on a low heat for 3 to 4 minutes, until the egg is set. Wash your hands after touching raw eggs.",
      "Serve: Drain the rice well and spoon it into bowls. Slide the chicken and egg on top with the sauce.",
    ],
  },
  {
    id: "cheese-tomato-bread-bake", meal: "dinner", tags: ["Bake", "Eggs", "British"], name: "Cheese and tomato bread bake", blurb: "Wholemeal bread layered with tomato, spinach and cheddar in a mustard egg custard, baked until puffed and golden.", servings: 4, minutes: 55,
    // chef pass 2026-11-21: a pinch of salt (1 g) in the custard
    ingredients: [ing("bread", 320), ing("eggs", 300), ing("milk", 400), ing("cheddar", 120), ing("tomatoes", 255), ing("spinach", 100), ing("mustard", 5), ing("salt", 1), ing("olive-oil", 5), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 180°C (160°C fan, gas 4). Brush an ovenproof dish, about 20 by 30 cm, with the oil.",
      "Get ready: Grate the cheddar. Slice the tomatoes thinly. Rinse the spinach unless the bag says it is ready washed.",
      "Cut the bread: Cut each slice of bread into 4 triangles.",
      "Layer the dish: Lay half the bread in the dish, cover it with the spinach, half the tomatoes and half the cheese, then add the rest of the bread, overlapping.",
      "Make the custard: Crack the eggs into a large jug, picking out any shell. Add the milk, mustard, salt and a grind of black pepper and beat with a fork until smooth. Wash your hands after touching raw eggs.",
      "Soak the bread: Pour the egg mixture slowly over the bread and press it down gently with a spatula. Leave it for 10 minutes to soak in.",
      "Top the bake: Lay the rest of the tomatoes on top and scatter over the rest of the cheese.",
      "Bake: Bake for 30 to 35 minutes, until puffed and golden brown, crisp at the edges and set in the middle, with no runny egg when you press it.",
      "Serve: Leave it to stand for 5 minutes, then cut it into squares. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "mushroom-tomato-houmous-traybake", meal: "dinner", tags: ["One pan"], name: "Roasted mushroom and tomato traybake with houmous and naan", blurb: "Mushrooms, tomatoes, onion and broccoli roasted with garlic and oregano, piled on houmous with warm naan.", servings: 2, minutes: 40,
    ingredients: [ing("mushrooms", 300), ing("tomatoes", 255), ing("onion", 150), ing("broccoli", 200), ing("garlic", 10), ing("oregano", 1), ing("olive-oil", 15), ing("black-pepper", 1), ing("lemon-juice", 10), ing("houmous", 120), ing("naan", 260)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7).",
      "Get the vegetables ready: Wipe the mushrooms clean and cut them in half. Cut the tomatoes into quarters. Peel the onion and cut it into thin wedges. Cut the broccoli into small florets.",
      "Season the vegetables: Tip them into a large bowl with the oil and a grind of black pepper and toss with your hands until coated. Spread them on your largest roasting tray, or two trays, in one layer with space between them.",
      "Roast the vegetables: Roast for 15 minutes. Turn them over, stir in the garlic purée and oregano and spread them out again.",
      "Finish roasting: Roast for 10 to 12 minutes more, until the mushrooms are golden, the onion is soft and sweet and the broccoli is charred at the tips.",
      "Warm the naans: For the last 3 minutes, put the naans on the oven shelf to warm through.",
      "Spread the houmous: Meanwhile, spread the houmous over warm plates.",
      "Finish the vegetables: Take the tray out of the oven and stir the lemon juice through the hot vegetables.",
      "Serve: Pile the roasted vegetables on top of the houmous and serve with the warm naans, torn into pieces.",
    ],
  },
  {
    id: "savoury-mince-rice-peas", meal: "dinner", tags: ["Batch cook", "British"], name: "Savoury mince with rice and peas", blurb: "Beef mince simmered with onion, mushrooms and tomato in a rich gravy, with rice and peas.", servings: 4, minutes: 40,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in soy and garlic; mushrooms in thick slices
    ingredients: [ing("beef-mince", 500), ing("onion", 150), ing("mushrooms", 200), ing("garlic", 10), ing("chopped-tomato-puree", 30), ing("soy", 20), ing("oregano", 1), ing("olive-oil", 10), ing("black-pepper", 1), ing("rice", 280), ing("peas", 300)],
    method: [
      "Marinate the mince: Mix the beef with half the soy sauce and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands after touching raw meat.",
      "Get ready: Peel and chop the onion. Wipe the mushrooms clean and slice them thickly.",
      "Brown the mince: Heat the oil in a large saucepan on a high heat. Add the beef, press it flat and leave it for 3 minutes, until browned underneath. Break it up and fry for 3 to 4 minutes more, until browned all over.",
      "Add the onion and mushrooms: Turn the heat down to medium. Add the onion and mushrooms and fry for 6 to 8 minutes, stirring now and then, until soft and golden.",
      "Make the gravy: Stir in the rest of the garlic purée and soy sauce, the tomato purée and the oregano for 1 minute, until the purée darkens. Pour in 400 ml of boiling water from the kettle and scrape up the brown bits.",
      "Simmer the mince: Bring it to the boil, then turn the heat down, cover and simmer for 10 minutes. Take the lid off and simmer for 5 to 10 minutes more, stirring now and then, until the gravy is thick and glossy.",
      "Cook the rice: Meanwhile, rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.",
      "Add the peas: For the last 3 minutes, add the peas to the rice pan, then drain the rice and peas together well.",
      "Check the mince: The mince must be piping hot all the way through with no pink left. Add a grind of black pepper.",
      "Serve: Spoon the rice and peas on to warm plates with the mince beside them. Cool any left over quickly, keep it in the fridge and eat it within 2 days.",
    ],
  },
];

// How each looks from directly above, for its picture (docs/RECIPE_IMAGE_PROMPTS.md): one portion, only the recipe's own foods, served as the method says.
export const EVERY_SHOP_LOOKS: Readonly<Record<string, string>> = {
  "pea-ham-soup-toast": "A round white bowl of thick, smooth bright green pea soup topped with a scatter of small pink pieces of ham and flecks of black pepper, beside two slices of golden wholemeal toast on a small white plate.",
  "mulligatawny-chicken-rice-soup": "A round white bowl of orange-red spiced tomato soup filled with tender pieces of chicken, soft onion and grains of rice, with a swirl of white yogurt in the middle.",
  "tomato-egg-noodle-soup": "A wide white bowl of red-tinged broth with soft wedges of tomato, soft pale yellow pieces of set egg, tangles of noodles and dark green wilted spinach, flecked with black pepper.",
  "creamy-chicken-mushroom-soup": "A round white bowl of creamy pale beige soup with shreds of pale chicken and thick slices of brown mushroom on the surface, flecked with black pepper, beside two slices of golden wholemeal toast.",
  "welsh-rarebit-tomatoes": "Two slices of wholemeal toast on a white rectangular plate, each cut in half and covered with a bubbling, golden-brown cheddar topping, beside two thick rounds of grilled tomato with charred edges.",
  "tuna-melt-toastie": "A wholemeal toastie cut in half on the diagonal on a round white plate, golden and crisp outside, the cut edges showing a creamy tuna filling with flecks of red onion and stretchy melted orange cheddar.",
  "baked-bean-cheese-toastie": "A golden, crisp wholemeal toastie cut in half on a round white plate, the two halves side by side, the cut edges showing orange-red baked beans and melted orange cheddar oozing out, beside a few red tomato wedges.",
  "garlic-mushroom-mozzarella-toastie": "A golden wholemeal toastie cut in half on the diagonal on a round white plate, the cut edges showing sliced brown garlic mushrooms, dark green wilted spinach and melted white mozzarella.",
  "ploughmans-salad-cheddar-ham": "A large white plate with a heap of dressed green lettuce, tomato wedges, cucumber rounds and thin onion rings, chunks of orange cheddar and folded pink ham beside it, and two slices of wholemeal bread.",
  "honey-mustard-chicken-salad": "Slices of golden, glazed chicken laid over torn green lettuce, cucumber slices and red tomato wedges on a round white plate, drizzled with a glossy pale yellow honey and mustard dressing.",
  "cold-peanut-noodles-cucumber-egg": "A wide white bowl of noodles coated in a glossy pale brown peanut sauce, topped with a neat pile of thin green-edged cucumber sticks and halved boiled eggs with set yellow yolks.",
  "ham-cheddar-pea-pasta-salad": "Pasta shapes, small pink squares of ham, bright green peas and grated orange cheddar coated in a creamy pale mustard yogurt dressing, piled on shredded green lettuce on a round white plate.",
  "salmon-pea-lemon-pasta-salad": "A round white bowl of pasta shapes in a creamy pale lemon yogurt dressing with large pink flakes of salmon, bright green peas and dark green spinach leaves, flecked with black pepper.",
  "greek-style-chicken-pasta-salad": "A round white bowl of pasta shapes with golden grilled strips of chicken, small cubes of cucumber, red tomato wedges and thin red onion slices in a creamy white garlic yogurt dressing, flecked all over with dried oregano.",
  "bbq-chicken-rice-bowl": "A round white bowl of white rice topped with glossy, sticky dark red-brown barbecue chicken strips, shredded green lettuce, small cubes of cucumber and red tomato, and a spoonful of white yogurt.",
  "egg-mushroom-spinach-rice-bowl": "A round white bowl of white rice topped with golden sliced mushrooms and dark green wilted spinach, two fried eggs with set whites and bright yellow yolks, and a drizzle of dark soy sauce.",
  "sweet-chilli-salmon-rice-bowl": "A round white bowl of white rice with bright green broccoli florets, large flakes of pink salmon with a glossy red sweet chilli glaze, and small cubes of green-edged cucumber, drizzled with a thin dressing.",
  "tomato-mozzarella-naan-pizzas": "A naan pizza cut into quarters on a round white plate, spread with red tomato sauce flecked with dried oregano and topped with thin tomato slices and bubbling melted mozzarella, beside shredded lettuce and cucumber slices.",
  "cheese-onion-omelette-salad": "A golden folded omelette on a round white plate, its open edge showing soft golden fried onion and melted orange cheddar, beside a small salad of green lettuce, red tomato wedges and cucumber slices.",
  "chinese-style-beef-lettuce-cups": "Four crisp green lettuce cups on a white rectangular plate, each holding a little white rice topped with browned, glossy beef mince and pieces of mushroom and a scatter of small green cucumber cubes.",
  "chicken-tikka-masala-style-curry": "A wide white bowl with a mound of white rice on one side and a rich orange-red tomato curry with charred pieces of chicken on the other, finished with a swirl of white yogurt.",
  "chicken-mushroom-stroganoff-rice": "A round white plate with a mound of white rice beside strips of golden chicken, sliced brown mushrooms and soft onion in a creamy pale mustard sauce, flecked with black pepper.",
  "hunters-style-chicken-rice-peas": "A round white plate with a chicken breast wrapped in pink ham, topped with dark glossy barbecue sauce and bubbling golden melted cheddar, beside a heap of white rice mixed with bright green peas.",
  "crispy-chicken-goujons-peas": "Golden-brown crumbed chicken strips piled on a round white plate beside a heap of bright green peas and red tomato wedges, with a small white bowl of thick garlic yogurt dip.",
  "cheeseburger-pasta": "A wide white bowl of pasta shapes in a thick red-brown beef mince and tomato sauce with soft onion, topped with a layer of melted, golden orange cheddar and flecks of black pepper.",
  "beef-koftas-cucumber-yogurt-naan": "A warm naan on a round white plate topped with three browned, finger-shaped beef koftas, a salad of shredded green lettuce, tomato wedges and thin onion slices, and a spoonful of white yogurt with small cubes of cucumber.",
  "korean-style-beef-rice-bowl": "A round white bowl of white rice topped in sections with glossy, sticky browned beef mince, dark green wilted spinach and thin cucumber sticks, with a fried egg in the middle, its yolk bright yellow.",
  "salmon-spinach-mozzarella-pasta-bake": "A rectangular white ovenproof dish of pasta shapes in a red tomato sauce with chunks of pink salmon and dark green spinach, covered with patches of bubbling, golden-brown melted mozzarella.",
  "mushroom-carbonara-pasta": "A round white bowl of pasta shapes coated in a glossy pale yellow egg and cheese sauce with golden slices of mushroom, scattered with grated orange cheddar and plenty of cracked black pepper.",
  "mushroom-pea-coconut-curry": "A wide white bowl with white rice on one side and an orange-gold coconut and tomato curry on the other, filled with halved and thickly sliced brown mushrooms, bright green peas and dark green spinach.",
  "egg-foo-young-rice": "A round white plate with a mound of white rice and a thick golden omelette cut into quarters, studded with sliced mushrooms, green peas and soft onion, with a glossy dark soy sauce spooned over.",
  "baked-bean-spinach-curry-naan": "A round white bowl of thick orange-red spiced baked bean curry with soft onion and dark green spinach, a spoonful of white yogurt on top, and a warm golden naan beside it.",
  "chicken-arrabbiata-pasta": "A wide white bowl of pasta shapes in a rich red tomato sauce with golden pieces of chicken and dark green wilted spinach, flecked with dried oregano, finely grated orange cheddar and black pepper.",
  "chicken-satay-skewers-rice": "Two skewers of golden, charred chicken chunks on a round white plate, coated with a glossy pale brown peanut sauce, beside a mound of white rice and a heap of thin cucumber half-moons.",
  "chicken-almond-stir-fry-rice": "A round white plate of white rice under a stir-fry of golden chicken strips, bright green broccoli florets, sliced mushrooms and onion chunks in a glossy brown sauce, scattered with toasted chopped almonds.",
  "spiced-yogurt-salmon-rice": "A round white plate with a salmon fillet under a golden-edged, herb-flecked spiced yogurt topping, a mound of white rice, and a small heap of diced cucumber, tomato and red onion salad.",
  "chicken-egg-rice-bowl": "A round white bowl of white rice topped with pieces of chicken and soft golden onion in a glossy brown soy sauce, softly set yellow and white egg and dark green wilted spinach.",
  "cheese-tomato-bread-bake": "A rectangular white ovenproof dish of puffed, golden-brown wholemeal bread triangles set in an egg custard, topped with slices of red tomato and melted orange cheddar, with dark green spinach showing between the layers.",
  "mushroom-tomato-houmous-traybake": "A wide white plate spread with pale beige houmous, piled with golden roasted halved mushrooms, soft tomato quarters, onion wedges and charred broccoli florets, with torn pieces of warm naan at the edge.",
  "savoury-mince-rice-peas": "A round white plate with a mound of white rice mixed with bright green peas beside a rich, dark brown beef mince with thick slices of mushroom and soft onion in a thick glossy gravy.",
};
