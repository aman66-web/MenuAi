import { ing, type Recipe } from "../recipes";

// Christmas recipes (founder 2026-10-17: "christmas recipies can have festive ingreidents"). The only recipes allowed to use FESTIVE_KINDS (lib/mm/pantry.ts), on top of
// the everyday ones; niches.ts files each of them under the Christmas occasion, which the Recipes screen offers only from 1 November to 6 January. Every figure is
// worked out by the app from the labels of the products we have read, like every other recipe. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const CHRISTMAS: readonly Recipe[] = [
  {
    id: "turkey-roast-parsnips-sprouts", meal: "dinner", tags: ["Christmas", "Roast"], name: "Roast turkey with parsnips, sprouts and cranberry", blurb: "A tray of roast turkey, honey parsnips and crisp potatoes, with sprouts and cranberry sauce on the side.", servings: 4, minutes: 55,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): chunky roast potatoes with rough edges; marinade (founder 21 Nov: "marinating ... makes a big difference"): oil, paprika, salt, black pepper, now while the potatoes roast.
    ingredients: [ing("turkey-breast", 800), ing("parsnips", 600, { note: "about 4 parsnips" }), ing("brussels-sprouts", 400), ing("new-potatoes", 800), ing("cranberry-sauce", 120), ing("vegetable-oil", 30), ing("honey", 20), ing("salt", 2), ing("black-pepper", 2), ing("paprika", 2)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) with two large roasting trays inside, so the food sizzles when it goes on.",
      "Marinate the turkey: Pat the turkey dry, then rub it with 1 tsp of the oil, the paprika and a pinch of salt and black pepper. Leave it while the potatoes roast, or keep it covered in the fridge up to a few hours. Wash your hands.",
      "Cut the parsnips: Peel the parsnips and trim both ends. Halve them across, then cut each piece lengthways into fingers about as wide as your thumb, cutting out any woody core.",
      "Coat the potatoes and parsnips: Cut the drained potatoes into quarters and pat them very dry. Shake them in a large bowl with the parsnips, 20 ml of the oil and a pinch of salt and black pepper until the edges look rough.",
      "Roast the potatoes and parsnips: Using oven gloves, take out one hot tray. Spread the potatoes, a flat side down, and parsnips on it in one layer with space between them (use another tin if they don't fit). Roast on the top shelf for 15 minutes.",
      "Roast the turkey: Lay the turkey on the second hot tray with a gap between the fillets and roast on the shelf below for 20 to 25 minutes. Wash your hands, the bowl and the spoon in hot soapy water.",
      "Prepare the sprouts: Meanwhile, trim the base off each sprout, pull away any tired outer layers and cut each one in half. Bring a medium pan of water from the kettle to the boil.",
      "Add the honey: When the timer for the parsnips goes off, drizzle the honey over them and turn the pieces. Roast for 10 to 15 minutes more, until the parsnips are soft and golden at the edges and the potatoes are golden and crisp.",
      "Cook the sprouts: Boil the sprouts for 4 to 5 minutes, until a knife slides in easily but they are still bright green. No longer, or they go dull and soft.",
      "Dress the sprouts: Drain them and toss them in the warm pan with the last 5 ml of oil and a pinch of salt and pepper.",
      "Check the turkey: Cut into the thickest fillet: it should be piping hot and white all the way through, with no pink left. If not, roast for 5 minutes more. Rest it on the tray for 3 minutes.",
      "Serve: Share the turkey, parsnips, potatoes and sprouts between warm plates and serve straight away, with the cranberry sauce in a small bowl beside them.",
    ],
  },
  {
    id: "turkey-cranberry-cheddar-wraps", meal: "lunch", tags: ["Christmas", "Wrap", "Quick"], name: "Turkey, cranberry and cheddar wraps", blurb: "Strips of pan-fried turkey with cranberry sauce and melted cheddar in a warm wrap.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): whole lettuce leaves; marinade (founder 21 Nov: "marinating ... makes a big difference"): paprika, oil, salt, black pepper.
    ingredients: [ing("turkey-breast", 300), ing("wraps", 240, { fit: [0.5, 2] }), ing("cranberry-sauce", 60), ing("cheddar", 60), ing("lettuce", 60), ing("vegetable-oil", 10), ing("salt", 1), ing("black-pepper", 1), ing("paprika", 2)],
    method: [
      "Slice the turkey: Pat the turkey dry and cut it into strips about 1 cm thick.",
      "Marinate the turkey: Mix the strips with the paprika, 1 tsp of the oil and a pinch of salt and pepper. Leave them while you prepare the cheese and lettuce, or keep them covered in the fridge up to a few hours. Wash your hands and the board.",
      "Prepare the cheese and lettuce: Grate the cheddar on the coarse side of a grater. Rinse the lettuce and shake it dry, keeping the leaves whole and tearing only very big ones in half.",
      "Heat the oil: Heat the rest of the oil in a large non-stick frying pan over a medium-high heat for about 1 minute, until a strip of turkey sizzles when it touches the pan.",
      "Brown the turkey: Add the turkey in a single layer and cook for 3 minutes without moving it, until golden underneath. Turn the strips over.",
      "Finish the turkey: Cook for 3 to 4 minutes more, turning now and then, until piping hot and white all the way through, with no pink left. Cut the biggest strip to check, then move the turkey to a plate.",
      "Warm the wraps: Wipe the pan, put it on a low heat and warm each wrap for 20 seconds on each side, until soft and bendy.",
      "Fill the wraps: Spread the cranberry sauce down the middle of each wrap, leaving about 4 cm clear at the sides and bottom. Top with the turkey, cheddar and lettuce.",
      "Roll and serve: Fold up the bottom, fold in the sides and roll up away from you. Cut each wrap in half on the diagonal and let it cool for a minute before eating.",
    ],
  },
  {
    id: "chipolatas-red-cabbage-mash", meal: "dinner", tags: ["Christmas", "British"], name: "Chipolatas with spiced red cabbage and mash", blurb: "Browned pork chipolatas with sweet spiced red cabbage and apple, and a mound of creamy mash.", servings: 4, minutes: 55,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): glossy, sticky honey-glazed chipolatas (sausages are seasoned already, so a glaze instead of a marinade).
    ingredients: [ing("pork-chipolatas", 480), ing("red-cabbage", 450), ing("apple", 300, { note: "about 2 apples" }), ing("onion", 150, { note: "about 1 onion" }), ing("new-potatoes", 1000), ing("milk", 80), ing("honey", 15), ing("mixed-spice", 2), ing("mustard", 20), ing("vegetable-oil", 15), ing("salt", 2), ing("black-pepper", 2), ing("lemon-juice", 15)],
    method: [
      "Prepare the vegetables: Peel the onion, halve it and slice it thinly. Quarter the red cabbage, cut out the hard core and slice it into thin strips. Peel and core the apples and cut them into 1 cm chunks.",
      "Soften the onion: Heat 10 ml of the oil in a large saucepan over a medium heat. Add the onion and cook for 4 to 5 minutes, stirring now and then, until soft but not brown.",
      "Add the cabbage: Stir in the cabbage, apple, two thirds of the honey, mixed spice and a pinch of salt and pepper. Pour in 100 ml of water, put the lid on and turn the heat down low.",
      "Cook the cabbage: Cook gently for 30 to 35 minutes, stirring every 10 minutes and adding a splash of water if it looks dry, until very soft and a deep purple-red.",
      "Coat the chipolatas: Meanwhile, heat the oven to 200°C (180°C fan, gas 6). Turn the chipolatas on a roasting tray with the last 5 ml of oil. Wash your hands in hot soapy water straight after.",
      "Roast the chipolatas: Roast on the middle shelf for 15 to 20 minutes, turning halfway, until golden brown.",
      "Glaze the chipolatas: Brush them with the rest of the honey and roast for 5 minutes more, until glossy and sticky. Cut the thickest one in half: it should be piping hot with no pink left. If not, roast for 5 minutes more.",
      "Boil the potatoes: Meanwhile, put the drained potatoes in a pan, cover them with water from the kettle and boil for 6 to 8 minutes, until soft when pressed with a fork.",
      "Mash the potatoes: Drain the potatoes and put them back in the warm pan with the milk and a pinch of salt and pepper. Mash until smooth, adding a splash of hot water if it is too stiff.",
      "Finish the cabbage: Take the lid off for the last 2 minutes to let any extra liquid bubble away. Stir in the lemon juice: it keeps the cabbage a bright purple-red and balances the sweetness. Taste and add a little more salt and pepper if needed.",
      "Serve: Spoon the mash onto warm plates with the red cabbage beside it. Lay the chipolatas on top and add a spoonful of mustard on the side.",
    ],
  },
  {
    id: "gammon-parsnips-apple-sauce", meal: "dinner", tags: ["Christmas", "British"], name: "Gammon steaks with honey parsnips and apple sauce", blurb: "Pan-fried gammon steaks with roasted honey parsnips, buttery peas and a spoonful of apple sauce.", servings: 2, minutes: 40,
    // 2026-11-22, marinade (founder 21 Nov: "marinating ... makes a big difference"): a mustard and black pepper rub (gammon is cured, so no salt).
    ingredients: [ing("gammon-steaks", 400), ing("parsnips", 400, { note: "about 3 parsnips" }), ing("peas", 200), ing("apple-sauce", 80), ing("mustard", 10), ing("honey", 15), ing("vegetable-oil", 20), ing("black-pepper", 2)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6), with a shelf near the top.",
      "Cut the parsnips: Peel the parsnips and trim both ends. Halve them across, then cut each piece lengthways into fingers about as wide as your thumb, cutting out any woody core.",
      "Coat the parsnips: Toss the parsnips on a roasting tray with 10 ml of the oil and a good grind of black pepper. Spread them out in a single layer.",
      "Roast the parsnips: Roast the parsnips on the top shelf for 15 minutes.",
      "Add the honey: Using oven gloves, take out the tray, drizzle the honey over the parsnips and turn them. Roast for 10 to 15 minutes more, until soft when pressed with a fork and golden at the edges.",
      "Prepare the gammon: Meanwhile, pat the gammon dry. Snip the fat at the edge in a few places with scissors to stop it curling.",
      "Marinate the gammon: Rub both sides with half the mustard and a grind of black pepper. It is already salty, so it needs nothing else. Leave it while the parsnips roast, or keep it covered in the fridge up to a few hours. Wash your hands.",
      "Fry the first side: Heat the last 10 ml of oil in a large non-stick frying pan over a medium-high heat for 1 minute, until shimmering. Lay in the steaks and leave them, without moving, for 4 to 5 minutes, until golden brown underneath.",
      "Fry the second side: Turn the steaks and fry for 4 to 5 minutes more. Cut into the thickest: it should be pale pink-white and piping hot all the way through, with no raw pink left. If not, cook for 2 minutes more.",
      "Rest the gammon: Put the steaks on a warm plate and cover them with another plate while you cook the peas.",
      "Cook the peas: Bring the peas to the boil in a small pan with a splash of boiling water from the kettle. Cook for 3 minutes, until hot all the way through, then drain.",
      "Serve: Put the gammon on warm plates with the peas and parsnips. Serve with the apple sauce and the rest of the mustard on the side.",
    ],
  },
  {
    id: "sprout-chestnut-potato-gratin", meal: "dinner", tags: ["Christmas", "Bake"], name: "Sprout, chestnut and potato gratin", blurb: "Sliced potatoes, sprouts and chestnuts in a creamy nutmeg sauce, baked under cheddar.", servings: 4, minutes: 65,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): some chestnuts left whole.
    ingredients: [ing("new-potatoes", 800), ing("brussels-sprouts", 300), ing("cooked-chestnuts", 180), ing("soft-cheese", 200), ing("milk", 150), ing("cheddar", 80), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("nutmeg", 1), ing("salt", 1), ing("black-pepper", 2)],
    method: [
      "Get ready: Heat the oven to 190°C (170°C fan, gas 5). Peel the onion, cut it in half and slice it thinly.",
      "Prepare the sprouts and chestnuts: Trim the base off each sprout, pull away any tired outer layers and cut it in half, or into quarters if large. Cut half the chestnuts in half and leave the rest whole.",
      "Slice the potatoes: Pat the drained potatoes dry on a clean tea towel and cut them into slices about as thick as a pound coin.",
      "Make the sauce: Whisk the soft cheese, milk, garlic purée, nutmeg, a pinch of salt and the black pepper in a large bowl for 1 to 2 minutes, until smooth with no lumps.",
      "Coat everything: Add the onion, sprouts, chestnuts and potatoes to the bowl and fold them together until every piece is coated in the sauce.",
      "Fill the dish: Tip it all into a large ovenproof dish, spread it level and pour over any sauce left in the bowl.",
      "Bake covered: Cover the dish tightly with foil and bake on the middle shelf for 25 minutes, until the sauce bubbles at the edges.",
      "Add the cheese: Grate the cheddar on the coarse side of a grater. Using oven gloves, take off the foil, keeping your face away from the steam, and scatter the cheddar over the top.",
      "Bake until golden: Bake uncovered for 20 to 25 minutes more, until the top is golden and bubbling, a knife slides easily through the potatoes and the gratin is piping hot all the way through.",
      "Rest and serve: Leave the gratin to stand for 5 minutes so the sauce thickens a little, then spoon it onto warm plates.",
    ],
  },
  {
    id: "spiced-parsnip-apple-soup", meal: "lunch", tags: ["Christmas", "Soup", "Vegan"], name: "Spiced parsnip and apple soup", blurb: "A smooth, gently sweet soup of roasted parsnips and apple with a pinch of nutmeg.", servings: 4, minutes: 50,
    ingredients: [ing("parsnips", 600, { note: "about 4 parsnips" }), ing("apple", 300, { note: "about 2 apples" }), ing("onion", 150, { note: "about 1 onion" }), ing("stock-cube", 12, { note: "about 2 stock cubes" }), ing("nutmeg", 1), ing("vegetable-oil", 20), ing("salt", 1), ing("black-pepper", 1), ing("cumin", 2)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6), with a shelf in the middle.",
      "Chop the vegetables: Peel and trim the parsnips and cut them into 3 cm chunks, cutting out any woody core. Peel, core and chop the apples the same size. Peel, halve and thickly slice the onion.",
      "Coat the vegetables: Toss the parsnips, apple and onion on a large roasting tray with 15 ml of the oil and a pinch of salt and pepper. Spread them out in a single layer.",
      "Roast: Roast on the middle shelf for 30 to 35 minutes, turning everything over halfway, until the parsnips are soft when pressed with a fork and golden at the edges.",
      "Make the stock: Meanwhile, put the stock cubes in a jug, pour in 800 ml of boiling water from the kettle and stir until they dissolve.",
      "Add the spices: Heat the last 5 ml of oil in a large saucepan over a low heat. Tip in the roasted parsnips, apple and onion, scraping up the golden bits, add the nutmeg and cumin and stir for 1 minute, until it smells warm and spicy.",
      "Simmer: Pour in the stock, put the lid on and bring to the boil over a high heat. Turn the heat down low and simmer gently for 10 minutes.",
      "Blend: Turn off the heat and let the soup cool for 5 minutes. Blend with a stick blender until completely smooth. In a jug blender, blend it in batches, half full at most, holding the lid down with a folded tea towel.",
      "Reheat and serve: Warm the soup over a low heat for 2 to 3 minutes, until steaming hot, adding a splash of boiling water if it is too thick. Season with salt and pepper to taste and ladle into warm bowls.",
    ],
  },
  {
    id: "red-cabbage-chestnut-cranberry-rice", meal: "dinner", tags: ["Christmas", "Vegan", "One pan"], name: "Red cabbage, chestnut and cranberry rice", blurb: "Spiced rice with soft red cabbage, chestnuts, apple and sweet dried cranberries.", servings: 4, minutes: 45,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): red-skinned apple chunks, whole chestnuts.
    ingredients: [ing("rice", 240, { role: "carb" }), ing("red-cabbage", 400), ing("cooked-chestnuts", 180), ing("apple", 150, { note: "about 1 red apple" }), ing("dried-cranberries", 40), ing("onion", 150, { note: "about 1 onion" }), ing("stock-cube", 6), ing("mixed-spice", 2), ing("vegetable-oil", 20), ing("salt", 1), ing("black-pepper", 2), ing("garlic", 5)],
    method: [
      "Make the stock: Boil the kettle. Put the stock cube in a jug, pour in 600 ml of boiling water and stir until it dissolves.",
      "Chop the onion and apple: Peel the onion and chop it small, about the size of a pea. Core the apple, leave the skin on and cut it into chunks about 2 cm across.",
      "Prepare the cabbage and chestnuts: Quarter the red cabbage, cut out the hard white core and slice it into thin strips. Leave the chestnuts whole, or halve any big ones.",
      "Soften the onion: Heat the oil in a large, deep frying pan with a lid over a medium heat. Add the onion and cook for 6 to 8 minutes, stirring now and then, until soft and sweet. Stir in the garlic for 30 seconds.",
      "Cook the cabbage: Add the cabbage and apple and cook for 5 minutes, stirring often, until the cabbage has shrunk to about half its size and turned a deeper purple.",
      "Add the rice: Stir in the mixed spice and the rice and cook for 1 minute, stirring all the time, until every grain is coated in the spiced oil.",
      "Add the stock: Pour in the hot stock and add the chestnuts, dried cranberries, a pinch of salt and the black pepper. Stir once and bring to the boil.",
      "Steam the rice: Turn the heat down as low as it goes, put the lid on and cook for 15 minutes without lifting the lid.",
      "Rest the rice: Turn off the heat and leave the lid on for 5 minutes. The rice should be soft and the liquid gone. If it is still hard, add a splash of boiling water and give it 5 minutes more.",
      "Serve: Fluff up the rice with a fork. Taste, add a little more salt and pepper if needed, and spoon it onto warm plates.",
    ],
  },
  {
    id: "mince-pie-porridge", meal: "breakfast", tags: ["Christmas", "Sweet"], name: "Mince pie porridge", blurb: "Creamy oat porridge swirled with fruity mincemeat and topped with yogurt and almonds.", servings: 2, minutes: 15,
    ingredients: [ing("oats", 80, { role: "carb" }), ing("milk", 300), ing("mincemeat", 60), ing("natural-yogurt", 100), ing("almonds", 20), ing("mixed-spice", 1)],
    method: [
      "Chop the almonds: Put a damp cloth under your chopping board so it can't slip. Chop the almonds roughly into small pieces and set them aside.",
      "Mix the oats: Stir the oats, milk and mixed spice together in a medium saucepan.",
      "Heat the porridge: Heat over a medium heat for about 3 minutes, stirring all the time, until it bubbles gently.",
      "Cook the porridge: Turn the heat down low and cook for 4 to 5 minutes, stirring often, until thick and creamy and the spoon drags a clear line through it. Add a splash of milk or water if it gets too thick.",
      "Stir in the mincemeat: Stir in two thirds of the mincemeat for 1 minute, until it has melted in and the porridge is steaming hot.",
      "Serve: Spoon the porridge into warm bowls. Top each with a spoonful of yogurt, the rest of the mincemeat and the chopped almonds.",
    ],
  },
  {
    id: "cranberry-cheddar-ham-toasted-wraps", meal: "lunch", tags: ["Christmas", "Wrap", "Quick"], name: "Cranberry, cheddar and ham toasted wraps", blurb: "Crisp toasted wraps filled with melted cheddar, ham and a sweet layer of cranberry sauce.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): folded ham slices, deep golden toasting with dark spots (the ham is ready-cooked: no marinade).
    ingredients: [ing("wraps", 240, { fit: [0.5, 2] }), ing("ham", 100), ing("cheddar", 100), ing("cranberry-sauce", 60), ing("spring-onions", 30)],
    method: [
      "Prepare the filling: Grate the cheddar on the coarse side of a grater. Slice the spring onions into thin rings. Fold each ham slice in half.",
      "Fill the wraps: Spread the cranberry sauce almost to the edge of half the wraps. Lay the folded ham over it in one layer, then scatter over the spring onions and cheddar.",
      "Top the wraps: Put a second wrap on top of each one and press down firmly with your hand, so the filling is held in.",
      "Heat the pan: Heat a large non-stick frying pan, with nothing in it, over a medium heat for about 2 minutes, until hot.",
      "Cook the first side: Lift one filled wrap into the pan with a fish slice. Cook for 2 to 3 minutes, pressing down gently, until golden with dark brown spots underneath. Turn the heat down if it browns too fast.",
      "Cook the second side: Turn it over, or slide it onto a plate and flip it back in. Cook for 2 to 3 minutes more, until golden and the cheese has melted. Cook the rest the same way.",
      "Serve: Leave each one for 1 minute, then cut it into wedges. The filling is very hot, so let it cool a little before eating.",
    ],
  },
];
