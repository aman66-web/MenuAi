import { ing, type Recipe } from "../recipes";

// Keto meals (founder 2026-11-20: "Give more options like keto or whatever ... if you don't have enough recipes for some options, make new recipes"):
// eggs, cheese, chicken, salmon, bacon and green vegetables, at most a tenth of a serving's calories from carbs (EATING_STYLES in lib/mm/mealPlan.ts),
// with no bread, rice, pasta, potatoes or beans. Each serving is written at about the meal size, its calories from olive oil, cheese, eggs or nuts (fitting
// moves only the protein and carb foods, so the main fat food is given the carb role to move with the meal size). See lib/mm/recipeBook/index.ts for the
// rules every recipe follows.

const FAT = { role: "carb" } as const;

export const KETO_MEALS: readonly Recipe[] = [
  // ---- breakfasts
  {
    id: "bacon-eggs-mushrooms-tomatoes", meal: "breakfast", tags: ["Eggs", "Quick", "Brunch"], name: "Bacon, eggs, mushrooms and tomatoes", blurb: "Grilled bacon and tomatoes with fried mushrooms and eggs topped with melted cheddar.", servings: 2, minutes: 15,
    ingredients: [ing("bacon", 120), ing("eggs", 240), ing("mushrooms", 150), ing("tomatoes", 170), ing("olive-oil", 30, FAT), ing("cheddar", 40), ing("black-pepper", 1)],
    method: [
      "Get ready: Turn the grill on to medium-high. Wipe the mushrooms clean and slice them. Cut the tomatoes in half across the middle. Grate the cheddar.",
      "Grill the bacon: Lay the bacon and the tomato halves, cut side up, on the grill rack. Grill for 8 to 10 minutes, turning the bacon once, until it is golden and cooked through and the tomatoes are soft.",
      "Fry the mushrooms: Meanwhile, heat half the oil in a large non-stick frying pan over a medium-high heat. Fry the mushrooms for 4 to 5 minutes, stirring now and then, until golden and soft. Tip them on to a warm plate.",
      "Fry the eggs: Turn the heat down to medium and add the rest of the oil. Crack in the eggs, picking out any shell, and fry for 3 to 4 minutes, until the whites are completely set. Wash your hands after handling raw eggs.",
      "Melt the cheese: Scatter the cheddar over the eggs, cover the pan with a lid or a large plate and leave for 1 minute, until the cheese has melted.",
      "Serve: Lift the eggs on to warm plates with a fish slice and add the bacon, mushrooms and tomatoes. Finish with a grind of black pepper.",
    ],
  },
  {
    id: "cheesy-baked-eggs-spinach", meal: "breakfast", tags: ["Eggs", "Quick", "Brunch"], name: "Cheesy baked eggs with spinach", blurb: "Eggs baked on garlicky creamy spinach under a bubbling cheddar top.", servings: 2, minutes: 20,
    ingredients: [ing("eggs", 300), ing("spinach", 150), ing("cheddar", 80, FAT), ing("soft-cheese", 60), ing("garlic", 5), ing("olive-oil", 15, FAT), ing("black-pepper", 1)],
    method: [
      "Get ready: Turn the grill on to medium-high. Grate the cheddar. Rinse the spinach unless the bag says it is ready washed, and shake it dry.",
      "Wilt the spinach: Heat the oil in a large non-stick frying pan over a medium heat. Add the garlic and spinach and stir for 2 to 3 minutes, until the spinach has shrunk down and is soft.",
      "Make it creamy: Take the pan off the heat and stir in the soft cheese and a good grind of black pepper, until the spinach is coated. Spread it out evenly.",
      "Add the eggs: Make a small hollow in the spinach for each egg with the back of a spoon, and crack an egg into each one, picking out any shell. Wash your hands after handling raw eggs.",
      "Cook on the hob: Put the pan back on a low to medium heat, cover with a lid and cook for 4 to 5 minutes, until the egg whites start to set at the edges.",
      "Finish under the grill: Scatter the cheddar over and grill for 3 to 4 minutes, until the whites are completely set and the cheese is golden. If the handle can't go under the grill, keep the lid on for 4 to 5 minutes more.",
      "Serve: Leave it for 1 minute, then spoon the eggs and spinach on to warm plates.",
    ],
  },
  {
    id: "cheese-tomato-scrambled-eggs", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Cheese and tomato scrambled eggs", blurb: "Soft scrambled eggs with melted cheddar and warm cherry tomatoes.", servings: 1, minutes: 10,
    ingredients: [ing("eggs", 180), ing("cheddar", 40, FAT), ing("cherry-tomatoes", 80), ing("milk", 20), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Get ready: Grate the cheddar and cut the cherry tomatoes in half.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add the milk and a grind of black pepper and beat with a fork until smooth. Wash your hands after handling raw eggs.",
      "Soften the tomatoes: Heat the oil in a non-stick frying pan over a medium heat. Fry the tomatoes, cut side down, for 2 minutes, until they start to soften. Tip them on to a warm plate.",
      "Cook the eggs: Turn the heat down low and pour the eggs into the pan. Leave them for 20 seconds, then stir slowly with a wooden spoon, pushing the egg from the edges into the middle.",
      "Add the cheese: When the eggs are nearly set, after 2 to 3 minutes, scatter in the cheddar and stir gently for 30 seconds more, until the cheese melts and no runny egg is left.",
      "Serve: Spoon the eggs on to the plate beside the tomatoes and eat straight away.",
    ],
  },
  // ---- lunches
  {
    id: "chicken-bacon-lettuce-salad", meal: "lunch", tags: ["Salad", "Quick"], name: "Chicken, bacon and lettuce salad", blurb: "Crunchy lettuce, tomato and cucumber with warm chicken, bacon, cheddar and a lemony mayonnaise dressing.", servings: 2, minutes: 20,
    ingredients: [ing("chicken-thigh", 300), ing("bacon", 80), ing("lettuce", 200), ing("cherry-tomatoes", 100), ing("cucumber", 100), ing("cheddar", 60), ing("light-mayo", 40), ing("olive-oil", 30, FAT), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Get ready: Cut the chicken and the bacon into thin strips on a separate board. Wash the board, knife and your hands well after handling the raw meat.",
      "Make the dressing: In a small bowl, mix the mayonnaise, lemon juice, half the oil and a grind of black pepper until smooth. Keep it to one side.",
      "Cook the chicken: Heat the rest of the oil in a large frying pan over a medium-high heat. Fry the chicken for 5 minutes, turning often, until it starts to turn golden.",
      "Add the bacon: Add the bacon and fry with the chicken for 4 to 5 minutes more, turning often, until the bacon is golden and the chicken is piping hot with no pink left in the middle.",
      "Prepare the salad: Meanwhile, wash the lettuce, shake it dry and tear it into pieces. Halve the cherry tomatoes, slice the cucumber and grate the cheddar.",
      "Toss the salad: Put the lettuce, tomatoes and cucumber in a large bowl, pour over the dressing and toss gently until everything is coated.",
      "Serve: Pile the salad into bowls, top with the warm chicken and bacon and scatter the cheese over. Eat straight away.",
    ],
  },
  {
    id: "mozzarella-tomato-pesto-salad", meal: "lunch", tags: ["Salad", "No cook", "Quick"], name: "Mozzarella, tomato and pesto salad", blurb: "Sliced tomatoes and mozzarella on salad leaves with a pesto dressing.", servings: 2, minutes: 10,
    // the mozzarella is the dish, so a bigger or smaller meal moves it
    ingredients: [ing("mozzarella", 250, { role: "protein" }), ing("tomatoes", 340), ing("pesto", 40), ing("salad-leaves", 60), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Drain the mozzarella: Tip the mozzarella into a sieve over the sink, let the liquid run away and pat it dry with kitchen paper.",
      "Slice the tomatoes: Wash the tomatoes, cut out the hard core at the top and slice them into rounds about 1 cm thick.",
      "Slice the cheese: Cut the mozzarella into slices about the same thickness as the tomatoes.",
      "Make the dressing: In a small bowl, stir the pesto and oil together until smooth and runny enough to drizzle.",
      "Arrange the salad: Spread the salad leaves over plates. Lay the tomato and mozzarella slices on top, overlapping them in rows.",
      "Serve: Drizzle the pesto dressing over, add a grind of black pepper and serve straight away, at room temperature.",
    ],
  },
  {
    id: "bacon-mushroom-cheddar-frittata", meal: "lunch", tags: ["Eggs", "Make ahead"], name: "Bacon, mushroom and cheddar frittata", blurb: "A thick egg frittata with bacon, mushrooms, spinach and cheddar, good warm or cold.", servings: 4, minutes: 30,
    // one frying pan holds at most half as many eggs again
    ingredients: [ing("eggs", 600, { fit: [0.5, 1.5] }), ing("bacon", 160), ing("mushrooms", 250), ing("spinach", 100), ing("cheddar", 160, FAT), ing("spring-onions", 50), ing("olive-oil", 30, FAT), ing("black-pepper", 1)],
    method: [
      "Get ready: Turn the grill on to medium-high. Wipe and slice the mushrooms, trim and slice the spring onions, and grate the cheddar. Cut the bacon into strips, then wash your hands.",
      "Beat the eggs: Crack the eggs into a large bowl, picking out any shell. Add a good grind of black pepper and beat with a fork until smooth. Wash your hands after handling raw eggs.",
      "Fry the bacon: Heat the oil in a large non-stick frying pan, about 26 cm across, over a medium-high heat. Fry the bacon for 4 to 5 minutes, stirring, until cooked through and golden.",
      "Add the vegetables: Add the mushrooms and fry for 4 to 5 minutes more, until soft and golden. Stir in the spinach and spring onions for 1 to 2 minutes, until the spinach shrinks down.",
      "Add the eggs: Turn the heat down low and spread everything out evenly. Stir half the cheddar into the eggs, pour them into the pan and scatter the rest of the cheddar on top.",
      "Cook the frittata: Cook without stirring for 10 to 12 minutes, until the edges are set and the base is golden. Lift an edge with a fish slice to check.",
      "Finish under the grill: Grill the frittata for 3 to 4 minutes, until the top is completely set and golden, with no runny egg in the middle. If the handle can't go under the grill, cover the pan with a lid for 5 to 6 minutes instead.",
      "Serve: Leave it to stand for 2 minutes, then slide it on to a board and cut it into wedges. Eat it warm, or cold the next day.",
    ],
  },
  {
    id: "chicken-caesar-style-salad", meal: "lunch", tags: ["Salad", "Quick"], name: "Chicken Caesar-style salad", blurb: "Pan-fried chicken on crisp lettuce with a garlic and lemon mayonnaise dressing and grated cheddar.", servings: 2, minutes: 20,
    ingredients: [ing("chicken-thigh", 300), ing("lettuce", 200), ing("cheddar", 60), ing("light-mayo", 60), ing("lemon-juice", 15), ing("garlic", 5), ing("olive-oil", 30, FAT), ing("black-pepper", 1)],
    method: [
      "Get ready: Cut the chicken into thin strips on a separate board. Wash the board, knife and your hands well after handling raw chicken.",
      "Make the dressing: In a small bowl, mix the mayonnaise, lemon juice, garlic, a little of the oil and a good grind of black pepper until smooth. Keep it to one side.",
      "Cook the chicken: Heat the rest of the oil in a large frying pan over a medium-high heat. Fry the chicken for 8 to 10 minutes, turning often, until golden, piping hot and no pink is left in the middle.",
      "Prepare the lettuce: Meanwhile, wash the lettuce, shake it dry and cut or tear it into bite-sized pieces. Grate the cheddar.",
      "Toss the salad: Put the lettuce in a large bowl with half the cheddar, pour over the dressing and toss until every piece is coated.",
      "Serve: Pile the salad into bowls, top with the warm chicken and scatter the rest of the cheese over. Eat straight away.",
    ],
  },
  {
    id: "tuna-cheddar-stuffed-peppers", meal: "lunch", tags: ["Fish", "Bake"], name: "Tuna and cheddar stuffed peppers", blurb: "Roasted peppers filled with tuna, mayonnaise and spring onion under melted cheddar.", servings: 2, minutes: 30,
    ingredients: [ing("peppers", 320), ing("tuna", 200), ing("cheddar", 100, FAT), ing("light-mayo", 60), ing("spring-onions", 30), ing("salad-leaves", 60), ing("olive-oil", 15), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6). Cut the peppers in half from stalk to base and pull out the seeds and white pith, keeping the stalks on.",
      "Roast the peppers: Brush the peppers all over with the oil and lay them cut side up on a baking tray. Roast for 15 minutes, until they start to soften.",
      "Make the filling: Meanwhile, drain the tuna well and break it up in a bowl with a fork. Trim and finely slice the spring onions, then stir them in with the mayonnaise and a grind of black pepper.",
      "Grate the cheese: Grate the cheddar on the coarse side of a grater and keep it beside the oven.",
      "Fill the peppers: Take the tray out carefully. Spoon the tuna filling into the pepper halves, pressing it down, and pile the cheddar on top.",
      "Bake until golden: Put the tray back in the oven for 10 to 12 minutes, until the peppers are soft and the cheese has melted and turned golden.",
      "Serve: Put the salad leaves on plates and sit the peppers on top. Leave them for a minute before eating, as the filling is very hot.",
    ],
  },
  {
    id: "tuna-nicoise-style-salad", meal: "lunch", tags: ["Fish", "Salad", "Quick"], name: "Tuna Niçoise-style salad", blurb: "Tuna, boiled eggs, lettuce, tomato and cucumber with a lemon and olive oil dressing and toasted almonds.", servings: 2, minutes: 20,
    ingredients: [ing("tuna", 200), ing("eggs", 240), ing("lettuce", 150), ing("tomatoes", 170), ing("cucumber", 100), ing("almonds", 40), ing("olive-oil", 40, FAT), ing("lemon-juice", 15), ing("black-pepper", 1)],
    method: [
      "Cook the eggs: Half-fill a saucepan with water from the kettle and bring it to the boil. Lower in the eggs on a spoon and boil for 9 minutes, until the whites and yolks are firmly set. Wash your hands after handling raw eggs.",
      "Cool the eggs: Lift the eggs into a bowl of cold water for 3 minutes, then tap them all over and peel off the shells.",
      "Toast the almonds: Meanwhile, roughly chop the almonds and toast them in a dry frying pan over a medium heat for 2 to 3 minutes, shaking the pan, until golden.",
      "Make the dressing: In a small bowl, mix the oil, lemon juice and a good grind of black pepper with a fork.",
      "Prepare the salad: Wash the lettuce, shake it dry and tear it into pieces. Cut the tomatoes into wedges and slice the cucumber. Drain the tuna well.",
      "Put it together: Arrange the lettuce, tomatoes and cucumber in shallow bowls. Cut the eggs into quarters and add them with chunks of tuna.",
      "Serve: Spoon the dressing over, scatter the almonds on top and serve straight away.",
    ],
  },
  {
    id: "smoked-salmon-egg-spinach-salad", meal: "lunch", tags: ["Fish", "Salad", "Quick"], name: "Smoked salmon, egg and spinach salad", blurb: "Smoked salmon and boiled eggs on spinach and cucumber with a lemon dressing and toasted almonds.", servings: 2, minutes: 15,
    ingredients: [ing("smoked-salmon", 120), ing("eggs", 240), ing("spinach", 100), ing("cucumber", 100), ing("almonds", 40), ing("olive-oil", 30, FAT), ing("lemon-juice", 15), ing("black-pepper", 1)],
    method: [
      "Cook the eggs: Half-fill a saucepan with water from the kettle and bring it to the boil. Lower in the eggs on a spoon and boil for 8 minutes, until the whites are set and the yolks are just firm. Wash your hands after handling raw eggs.",
      "Cool the eggs: Lift the eggs into a bowl of cold water for 3 minutes, then tap them all over and peel off the shells.",
      "Toast the almonds: Meanwhile, roughly chop the almonds and toast them in a dry frying pan over a medium heat for 2 to 3 minutes, shaking the pan, until golden.",
      "Make the dressing: In a small bowl, mix the oil, lemon juice and a good grind of black pepper with a fork.",
      "Prepare the salad: Rinse the spinach unless the bag says it is ready washed, and shake it dry. Slice the cucumber into thin rounds. Tear the smoked salmon into strips.",
      "Put it together: Toss the spinach and cucumber with half the dressing and pile into shallow bowls. Cut the eggs in half and lay them on top with the smoked salmon.",
      "Serve: Spoon over the rest of the dressing, scatter the almonds on top and serve straight away.",
    ],
  },
  // ---- dinners
  {
    id: "creamy-mushroom-chicken-thighs-broccoli", meal: "dinner", tags: ["One pan"], name: "Chicken thighs in a creamy mushroom sauce with broccoli", blurb: "Golden chicken thighs in a creamy mushroom and cheese sauce, with broccoli.", servings: 2, minutes: 30,
    ingredients: [ing("chicken-thigh", 300), ing("mushrooms", 250), ing("soft-cheese", 150), ing("cheddar", 40), ing("garlic", 5), ing("olive-oil", 30, FAT), ing("broccoli", 200), ing("mixed-herbs", 1), ing("black-pepper", 1)],
    method: [
      "Get ready: Wipe the mushrooms clean and slice them. Cut the broccoli into small florets. Grate the cheddar.",
      "Season the chicken: Pat the chicken thighs dry with kitchen paper and season both sides with black pepper. Wash your hands, and anything the raw chicken touched, straight away.",
      "Brown the chicken: Heat half the oil in a large frying pan over a medium-high heat. Fry the chicken for 5 minutes on each side, until golden. Lift it on to a plate.",
      "Fry the mushrooms: Add the rest of the oil and the mushrooms to the pan. Fry for 5 minutes, stirring now and then, until soft and golden. Stir in the garlic and herbs for 30 seconds.",
      "Make the sauce: Turn the heat down to medium. Stir in the soft cheese and 4 tablespoons of water until smooth and creamy, then stir in the cheddar until it melts.",
      "Finish the chicken: Put the chicken back in the pan with any juices and turn it in the sauce. Cover and simmer gently for 8 to 10 minutes, until piping hot all the way through with no pink left in the middle.",
      "Cook the broccoli: Meanwhile, boil the kettle and cook the broccoli in a pan of boiling water for 4 to 5 minutes, until just tender. Drain it well.",
      "Serve: Put the chicken and the mushroom sauce on warm plates with the broccoli beside it, and add a grind of black pepper.",
    ],
  },
  {
    id: "cheesy-chicken-broccoli-bake", meal: "dinner", tags: ["Bake", "Batch cook"], name: "Cheesy chicken and broccoli bake", blurb: "Chicken and broccoli baked in a creamy garlic sauce under a golden cheddar top.", servings: 4, minutes: 40,
    ingredients: [ing("chicken-thigh", 500), ing("broccoli", 400), ing("soft-cheese", 200), ing("cheddar", 160), ing("garlic", 10), ing("olive-oil", 40, FAT), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6). Cut the broccoli into small florets and grate the cheddar.",
      "Cut the chicken: Cut the chicken into bite-sized pieces on a separate board. Wash the board, knife and your hands well after handling raw chicken.",
      "Brown the chicken: Heat the oil in a large frying pan over a medium-high heat. Fry the chicken for 5 to 6 minutes, turning often, until golden all over. It will finish cooking in the oven.",
      "Cook the broccoli: Meanwhile, boil the kettle and cook the broccoli in a pan of boiling water for 3 minutes. Drain it well in a colander.",
      "Make the sauce: Take the frying pan off the heat. Stir in the soft cheese, garlic, half the cheddar, a good grind of black pepper and a splash of water, until the chicken is coated in a creamy sauce.",
      "Fill the dish: Tip the chicken and sauce into a medium baking dish, add the broccoli and stir gently so everything is mixed. Scatter the rest of the cheese over the top.",
      "Bake: Bake for 20 minutes, until bubbling and golden on top and the chicken is piping hot all the way through with no pink left. Cut a large piece open to check.",
      "Serve: Leave it to stand for 2 minutes, as the sauce is very hot, then spoon it on to warm plates.",
    ],
  },
  {
    id: "beef-mushroom-spinach-skillet", meal: "dinner", tags: ["One pan", "Quick"], name: "Beef, mushroom and spinach pan with cheddar", blurb: "Beef mince, mushrooms and spinach in a tomato sauce, topped with melted cheddar.", servings: 2, minutes: 20,
    ingredients: [ing("beef-mince", 300), ing("mushrooms", 200), ing("spinach", 150), ing("onion", 75, { note: "about half an onion" }), ing("garlic", 5), ing("chopped-tomatoes", 200), ing("cheddar", 60), ing("olive-oil", 30, FAT), ing("oregano", 1), ing("black-pepper", 1)],
    method: [
      "Get ready: Peel and finely chop the onion. Wipe the mushrooms clean and slice them. Grate the cheddar.",
      "Soften the onion: Heat the oil in a large frying pan over a medium-high heat. Fry the onion and mushrooms for 4 minutes, stirring often, until soft and starting to turn golden.",
      "Brown the mince: Add the beef mince and break it up with a wooden spoon. Fry for 5 minutes, stirring, until browned all over with no pink left.",
      "Add the flavours: Stir in the garlic and oregano for 30 seconds, then add the chopped tomatoes and a good grind of black pepper.",
      "Simmer: Let it bubble gently for 3 to 4 minutes, stirring now and then, until the sauce has thickened and the mince is piping hot.",
      "Wilt the spinach: Stir in the spinach a handful at a time for 1 to 2 minutes, until it has shrunk down and is dark green.",
      "Melt the cheese: Scatter the cheddar over the top, cover the pan with a lid or a large plate and leave on a low heat for 2 minutes, until the cheese has melted.",
      "Serve: Spoon it into warm bowls straight from the pan and eat while it is hot.",
    ],
  },
  {
    id: "pesto-chicken-tomatoes-broccoli", meal: "dinner", tags: ["One pan"], name: "Pesto chicken with roast tomatoes and broccoli", blurb: "Pesto-topped chicken thighs roasted with cherry tomatoes and broccoli, finished with melted mozzarella.", servings: 2, minutes: 30,
    ingredients: [ing("chicken-thigh", 300), ing("pesto", 60), ing("cherry-tomatoes", 150), ing("broccoli", 200), ing("mozzarella", 125), ing("olive-oil", 30, FAT), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6). Cut the broccoli into small florets. Drain the mozzarella and tear it into small pieces.",
      "Coat the chicken: Lay the chicken thighs in a large roasting tin and spread the pesto over the top of each one. Wash your hands, and anything the raw chicken touched, straight away.",
      "Roast the chicken: Roast for 10 minutes, so the chicken starts to cook before the vegetables go in.",
      "Add the vegetables: Toss the broccoli and cherry tomatoes with the oil and a grind of black pepper. Take the tin out carefully and scatter them around the chicken.",
      "Roast again: Roast for 12 to 15 minutes more, until the broccoli is tender and browned at the edges and the tomatoes have started to burst.",
      "Add the cheese: Scatter the mozzarella over the chicken and roast for 3 minutes more, until it has melted.",
      "Check the chicken: Cut into the thickest piece. It must be piping hot all the way through, with no pink left and clear juices. If not, roast for a few minutes more and check again.",
      "Serve: Lift the chicken on to warm plates with the vegetables and spoon over any juices from the tin.",
    ],
  },
  {
    id: "mozzarella-chicken-tomato-sauce", meal: "dinner", tags: ["One pan"], name: "Mozzarella chicken in tomato sauce with salad", blurb: "Chicken thighs simmered in a garlic and oregano tomato sauce under melted mozzarella, with a side salad.", servings: 2, minutes: 30,
    ingredients: [ing("chicken-thigh", 300), ing("passata", 200), ing("mozzarella", 125), ing("garlic", 5), ing("oregano", 1), ing("olive-oil", 30, FAT), ing("salad-leaves", 80), ing("black-pepper", 1)],
    method: [
      "Get ready: Drain the mozzarella and cut it into thin slices. Pat the chicken thighs dry with kitchen paper, then wash your hands well after handling raw chicken.",
      "Brown the chicken: Heat half the oil in a large frying pan over a medium-high heat. Fry the chicken for 4 to 5 minutes on each side, until golden. Lift it on to a plate.",
      "Make the sauce: Turn the heat down to medium. Stir the garlic and oregano into the pan for 30 seconds, then pour in the passata and add a good grind of black pepper.",
      "Simmer the chicken: Put the chicken back in the sauce, cover the pan and let it bubble gently for 10 minutes, turning the chicken once.",
      "Add the cheese: Lay the mozzarella slices over the chicken, cover again and cook for 3 to 4 minutes, until the cheese has melted.",
      "Check the chicken: Cut into the thickest piece. It must be piping hot all the way through with no pink left. If not, cook for a few minutes more and check again.",
      "Dress the salad: Meanwhile, toss the salad leaves with the rest of the oil in a bowl.",
      "Serve: Put the chicken and sauce on warm plates with the salad beside it.",
    ],
  },
  {
    id: "salmon-creamy-spinach-broccoli", meal: "dinner", tags: ["Fish", "Quick"], name: "Salmon with creamy spinach and broccoli", blurb: "Pan-fried salmon with creamy garlic spinach, broccoli and toasted almonds.", servings: 2, minutes: 20,
    ingredients: [ing("salmon", 260), ing("spinach", 200), ing("soft-cheese", 120), ing("garlic", 5), ing("lemon-juice", 10), ing("olive-oil", 30, FAT), ing("broccoli", 150), ing("almonds", 30), ing("black-pepper", 1)],
    method: [
      "Get ready: Boil the kettle. Roughly chop the almonds and cut the broccoli into small florets. Pat the salmon dry with kitchen paper and season it with black pepper.",
      "Toast the almonds: Toast the almonds in a large dry frying pan over a medium heat for 2 to 3 minutes, shaking the pan, until golden. Tip them on to a plate.",
      "Cook the broccoli: Cook the broccoli in a pan of boiling water from the kettle for 4 to 5 minutes, until just tender. Drain it well.",
      "Fry the salmon: Meanwhile, heat half the oil in the frying pan over a medium-high heat. Fry the salmon for 4 minutes, then turn it over carefully and cook for 3 to 4 minutes more.",
      "Check the fish: The salmon is done when it is opaque all the way through and flakes easily when pressed with a fork. Lift it on to warm plates.",
      "Wilt the spinach: Add the rest of the oil and the garlic to the pan for 30 seconds. Stir in the spinach for 2 minutes, until it has shrunk down.",
      "Make it creamy: Stir in the soft cheese and lemon juice for 1 minute, until the spinach is coated in a smooth, creamy sauce.",
      "Serve: Spoon the spinach beside the salmon with the broccoli, scatter the almonds over the top and add a grind of black pepper.",
    ],
  },
  {
    id: "salmon-garlic-spinach-tomatoes", meal: "dinner", tags: ["Fish", "Quick", "One pan"], name: "Salmon with garlic spinach and cherry tomatoes", blurb: "Pan-fried salmon on garlicky spinach and soft cherry tomatoes, with toasted almonds.", servings: 2, minutes: 20,
    ingredients: [ing("salmon", 260), ing("spinach", 200), ing("cherry-tomatoes", 200), ing("garlic", 10), ing("almonds", 30), ing("olive-oil", 30, FAT), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Get ready: Halve the cherry tomatoes and roughly chop the almonds. Pat the salmon dry with kitchen paper and season it with black pepper.",
      "Toast the almonds: Toast the almonds in a large dry frying pan over a medium heat for 2 to 3 minutes, shaking the pan, until golden. Tip them on to a plate.",
      "Fry the salmon: Heat half the oil in the same pan over a medium-high heat. Fry the salmon for 4 minutes, then turn it over carefully and cook for 3 to 4 minutes more.",
      "Check the fish: The salmon is done when it is opaque all the way through and flakes easily when pressed with a fork. Lift it on to a warm plate.",
      "Soften the tomatoes: Add the rest of the oil and the cherry tomatoes to the pan and fry for 2 to 3 minutes, until they start to soften and split.",
      "Add the garlic: Stir in the garlic for 30 seconds, taking care that it doesn't burn.",
      "Wilt the spinach: Add the spinach a handful at a time and stir for 2 minutes, until it has shrunk down. Stir in the lemon juice.",
      "Serve: Spoon the spinach and tomatoes on to warm plates, sit the salmon on top and scatter the almonds over.",
    ],
  },
  {
    id: "chilli-beef-pepper-broccoli-stir-fry", meal: "dinner", tags: ["Quick", "One pan"], name: "Chilli beef with peppers and broccoli", blurb: "Spiced beef mince stir-fried with peppers, broccoli and spring onions, finished with lemon and almonds.", servings: 2, minutes: 20,
    ingredients: [ing("beef-mince", 300), ing("peppers", 160), ing("broccoli", 200), ing("spring-onions", 50), ing("garlic", 10), ing("chilli-powder", 1), ing("almonds", 40), ing("olive-oil", 30, FAT), ing("lemon-juice", 15), ing("black-pepper", 1)],
    method: [
      "Get ready: Cut the pepper in half, pull out the stalk and seeds and slice it into thin strips. Cut the broccoli into small florets, trim and slice the spring onions, and roughly chop the almonds.",
      "Toast the almonds: Toast the almonds in a large dry frying pan or wok over a medium heat for 2 to 3 minutes, shaking the pan, until golden. Tip them on to a plate.",
      "Brown the mince: Heat half the oil in the pan over a high heat. Add the beef mince and fry for 5 to 6 minutes, breaking it up with a wooden spoon, until browned with no pink left.",
      "Add the spices: Stir in the garlic and chilli powder for 30 seconds, then tip the mince into a bowl.",
      "Stir-fry the vegetables: Add the rest of the oil to the pan. Stir-fry the broccoli and pepper for 4 to 5 minutes, until just tender but still a little crunchy. Add a splash of water if they start to stick.",
      "Bring it together: Put the mince back in the pan with the spring onions and stir-fry for 2 minutes, until everything is piping hot.",
      "Season: Take the pan off the heat and stir in the lemon juice and a good grind of black pepper.",
      "Serve: Spoon into warm bowls and scatter the toasted almonds over the top.",
    ],
  },
];

// How each looks from directly above, for its picture (docs/RECIPE_IMAGE_PROMPTS.md): one portion, only the recipe's own foods, served as the method says.
export const KETO_MEALS_LOOKS: Readonly<Record<string, string>> = {
  "bacon-eggs-mushrooms-tomatoes": "A round white plate with two fried eggs, their whites set and yolks golden, under melted orange cheddar, beside browned bacon medallions, golden sliced mushrooms and two soft grilled tomato halves, with flecks of black pepper.",
  "cheesy-baked-eggs-spinach": "A round white plate of creamy dark green spinach topped with two baked eggs with set whites and soft yellow yolks, under patches of bubbling golden melted cheddar, flecked with black pepper.",
  "cheese-tomato-scrambled-eggs": "A round white plate of soft, glossy yellow scrambled eggs with strands of melted orange cheddar, beside a small heap of softened halved cherry tomatoes, flecked with black pepper.",
  "chicken-bacon-lettuce-salad": "A wide white bowl of torn pale green lettuce, halved cherry tomatoes and cucumber slices in a creamy dressing, topped with golden strips of chicken and browned bacon and a scatter of grated orange cheddar.",
  "mozzarella-tomato-pesto-salad": "A round white plate of overlapping red tomato slices and white mozzarella slices on a bed of green salad leaves, drizzled with bright green pesto and flecked with black pepper.",
  "bacon-mushroom-cheddar-frittata": "A thick wedge of golden frittata on a round white plate, its cut side showing set egg studded with browned bacon pieces, sliced mushrooms, dark green spinach and spring onion, under a golden cheddar top.",
  "chicken-caesar-style-salad": "A wide white bowl of crisp pale green lettuce pieces in a creamy white dressing, topped with golden pan-fried chicken strips and a scatter of finely grated orange cheddar, flecked with black pepper.",
  "tuna-cheddar-stuffed-peppers": "Two roasted red pepper halves on a round white plate, filled with a creamy tuna and spring onion filling under melted golden cheddar, beside a small heap of green salad leaves.",
  "tuna-nicoise-style-salad": "A shallow white bowl of torn lettuce, red tomato wedges and cucumber slices topped with chunks of tuna and quartered hard-boiled eggs with firm yellow yolks, scattered with toasted chopped almonds and glistening with dressing.",
  "smoked-salmon-egg-spinach-salad": "A shallow white bowl of dark green spinach leaves and thin cucumber rounds topped with folds of pink smoked salmon and halved boiled eggs with set yolks, scattered with toasted chopped almonds.",
  "creamy-mushroom-chicken-thighs-broccoli": "A golden pan-fried chicken thigh on a round white plate in a creamy pale sauce with sliced browned mushrooms and flecks of dried herbs, with bright green broccoli florets beside it.",
  "cheesy-chicken-broccoli-bake": "A portion of chicken and broccoli bake on a round white plate, pieces of chicken and bright green broccoli florets in a creamy sauce under a bubbling, golden-brown cheddar top.",
  "beef-mushroom-spinach-skillet": "A wide white bowl of browned beef mince in a thick tomato sauce with sliced mushrooms, wilted dark green spinach and soft onion, topped with patches of melted orange cheddar.",
  "pesto-chicken-tomatoes-broccoli": "A roast chicken thigh spread with green pesto and melted white mozzarella on a round white plate, beside roasted broccoli florets browned at the edges and blistered red cherry tomatoes in their juices.",
  "mozzarella-chicken-tomato-sauce": "A golden chicken thigh covered with melted white mozzarella in a glossy red tomato sauce flecked with oregano on a round white plate, beside a small heap of green salad leaves.",
  "salmon-creamy-spinach-broccoli": "A pan-fried salmon fillet with a golden top on a round white plate, beside creamy dark green spinach and bright green broccoli florets, scattered with toasted chopped almonds and black pepper.",
  "salmon-garlic-spinach-tomatoes": "A golden pan-fried salmon fillet on a bed of wilted dark green spinach and soft, split red cherry tomatoes on a round white plate, scattered with toasted chopped almonds.",
  "chilli-beef-pepper-broccoli-stir-fry": "A wide white bowl of browned spiced beef mince with strips of red pepper, bright green broccoli florets and sliced spring onion, scattered with toasted chopped almonds.",
};
