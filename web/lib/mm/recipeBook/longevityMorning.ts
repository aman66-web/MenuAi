import { ing, type Recipe } from "../recipes";

// Longevity breakfasts and lunches (founder 2026-11-20: "make the most longevity-backed diet ... one of the screens they can choose is the most
// longevity-backed diet ... that's the one that I want to see"): no meat; beans and chickpeas, nuts, oily fish or whole grains; plenty of vegetables and
// fruit; olive oil as the only oil; nothing sweetened. The style's exact rule and its studies are with EATING_STYLES in lib/mm/mealPlan.ts. Names and blurbs
// say what is in the dish, never that it does anything for anyone's health (CLAUDE.md rule 3). See lib/mm/recipeBook/index.ts for the rules every recipe follows.
// Measured at Sainsbury's and Morrisons, fitted to a 600 kcal meal: the bread is the pantry's wholemeal loaf (40 g a slice, 2 slices each), and no recipe adds
// salt or a stock cube where the bread, houmous or soft cheese already bring a serving close to the style's salt line; two salads with no bread take a pinch
// of salt (2026-11-21, founder: "Nothing should be plain") and stay under the line at both shops.

export const LONGEVITY_MORNING: readonly Recipe[] = [
  // ---- breakfasts
  {
    id: "crushed-chickpeas-tomatoes-toast", meal: "breakfast", tags: ["Vegan", "Quick", "Savoury"], name: "Crushed chickpeas and tomatoes on toast", blurb: "Warm chickpeas crushed with garlic, lemon and cumin, with soft cherry tomatoes and spinach on wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("bread", 160), ing("chickpeas", 240, { role: "protein" }), ing("cherry-tomatoes", 200), ing("spinach", 60), ing("olive-oil", 15), ing("garlic", 5), ing("lemon-juice", 10), ing("cumin", 1), ing("black-pepper", 1)],
    method: [
      "Get ready: Drain the chickpeas in a sieve, rinse them under the cold tap and pat them dry with kitchen paper. Cut the cherry tomatoes in half. Rinse the spinach unless the bag says it is ready washed.",
      "Soften the tomatoes: Heat half the oil in a large frying pan on a medium heat. Add the tomatoes, cut side down, and cook for 3 to 4 minutes, until soft and starting to brown.",
      "Brown the chickpeas: Push the tomatoes to one side and turn the heat up to medium-high. Add the rest of the oil and the chickpeas and fry for 4 to 5 minutes, stirring now and then, until golden. Stir in the garlic and cumin for 30 seconds.",
      "Crush the chickpeas: Take the pan off the heat and crush the chickpeas roughly with a fork, leaving some whole. Stir in the lemon juice and a good grind of black pepper.",
      "Wilt the spinach: Put the pan back on a low heat, add the spinach and stir for 1 minute, until soft and dark green.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Put the toast on warm plates and pile the chickpeas, tomatoes and spinach on top, with any juices from the pan. Eat straight away.",
    ],
  },
  {
    id: "berry-almond-porridge", meal: "breakfast", tags: ["Vegan", "Porridge", "Quick", "Sweet"], name: "Berry and almond porridge", blurb: "Creamy oats cooked in oat drink with cinnamon, topped with warm berries and chopped almonds.", servings: 2, minutes: 10,
    ingredients: [ing("oats", 100), ing("oat-drink", 400, { follows: "oats" }), ing("berries", 160), ing("almonds", 30), ing("cinnamon", 1)],
    method: [
      "Chop the almonds: Roughly chop the almonds on a board with a large knife and keep them to one side.",
      "Mix the porridge: Put the oats, oat drink and cinnamon into a medium saucepan and stir well, so no dry oats are left at the bottom.",
      "Bring to a bubble: Put the pan on a medium heat and stir often, scraping the bottom so nothing sticks. After 2 to 3 minutes it will start to bubble gently.",
      "Cook until creamy: Turn the heat down a little and keep stirring for 3 to 4 minutes, until thick and creamy. Stir in a splash of hot water if it gets too thick.",
      "Warm the berries: Meanwhile, put the berries in a small saucepan on a low heat for 3 to 4 minutes, stirring now and then, until soft and juicy. Frozen ones take a minute or two longer.",
      "Serve: Spoon the porridge into bowls, top with the warm berries and their juice, and scatter the almonds over. Eat it straight away, while it is hot.",
    ],
  },
  {
    id: "tomato-olive-oil-toast-eggs", meal: "breakfast", tags: ["Eggs", "Quick", "Savoury"], name: "Tomato toast with olive oil and boiled eggs", blurb: "Wholemeal toast piled with chopped tomatoes in garlic and olive oil, with boiled eggs on the side.", servings: 2, minutes: 15,
    ingredients: [ing("bread", 160), ing("tomatoes", 250), ing("olive-oil", 15), ing("garlic", 5), ing("eggs", 240), ing("black-pepper", 1)],
    method: [
      "Boil the water: Half-fill a saucepan with hot water from the kettle and bring it to a gentle boil on a medium-high heat.",
      "Cook the eggs: Lower the eggs in gently one at a time on a spoon. Boil them for 8 minutes, until the whites and yolks are firm and set. Wash your hands after handling raw eggs.",
      "Make the tomato topping: Meanwhile, wash the tomatoes and chop them into small pieces. Put them in a bowl with the oil, garlic and a good grind of black pepper and stir well.",
      "Toast the bread: Toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Peel the eggs: Lift the eggs into a bowl of cold water for 2 minutes, until cool enough to handle. Tap them all over and peel off the shells.",
      "Serve: Put the toast on plates and spoon the tomatoes and their juices on top, so the toast soaks some up. Cut the eggs in half and put them beside the toast.",
    ],
  },
  {
    id: "smoky-tomato-beans-toast", meal: "breakfast", tags: ["Vegan", "Quick", "Savoury"], name: "Tomato and paprika beans on toast", blurb: "Kidney beans simmered in chopped tomatoes with onion and paprika, spooned over wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("kidney-beans", 240), ing("chopped-tomatoes", 200), ing("onion", 75), ing("olive-oil", 10), ing("paprika", 2), ing("garlic", 5), ing("bread", 160), ing("black-pepper", 1)],
    method: [
      "Get ready: Peel and finely chop the onion. Drain the beans in a sieve and rinse them under the cold tap.",
      "Soften the onion: Heat the oil in a medium saucepan on a medium heat. Add the onion and cook for 4 to 5 minutes, stirring now and then, until soft and see-through.",
      "Add the spices: Stir in the garlic and paprika and cook for 30 seconds, stirring all the time so they don't burn.",
      "Simmer the beans: Add the chopped tomatoes and the beans and stir well. Bring to a bubble, then turn the heat down and simmer for 5 minutes, stirring now and then, until thick and piping hot.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Stir a good grind of black pepper into the beans. Put the toast on warm plates and spoon the beans over the top. Eat straight away.",
    ],
  },
  {
    id: "berry-almond-oat-yogurt-bowl", meal: "breakfast", tags: ["Quick", "Sweet"], name: "Berry, almond and oat yogurt bowl", blurb: "Thick Greek-style yogurt topped with berries, toasted oats, chopped almonds and cinnamon.", servings: 1, minutes: 5,
    ingredients: [ing("greek-yogurt", 200, { role: "protein" }), ing("berries", 120), ing("oats", 40), ing("almonds", 20), ing("cinnamon", 1)],
    method: [
      "Toast the oats: Put the oats in a dry frying pan on a medium heat and stir for 3 to 4 minutes, until they are golden and smell nutty. Tip them on to a plate to cool, so they stay crisp.",
      "Chop the almonds: Roughly chop the almonds on a board with a large knife.",
      "Get the berries ready: If they are frozen, thaw them in a sieve under the cold tap for about a minute and shake off the water. If fresh, rinse and pat them dry.",
      "Fill the bowl: Spoon the yogurt into a bowl and smooth the top with the back of the spoon.",
      "Add the toppings: Scatter the berries, oats and almonds over the yogurt, then dust the cinnamon over the top. Eat straight away, so the oats stay crisp.",
    ],
  },
  {
    id: "carrot-raisin-porridge", meal: "breakfast", tags: ["Porridge", "Sweet"], name: "Carrot and raisin porridge with almonds", blurb: "Oats cooked in milk with grated carrot, raisins and cinnamon, like a carrot cake, with chopped almonds on top.", servings: 2, minutes: 12,
    ingredients: [ing("oats", 100), ing("milk", 400, { follows: "oats" }), ing("carrots", 150), ing("raisins", 30), ing("cinnamon", 1), ing("almonds", 20)],
    method: [
      "Grate the carrots: Peel the carrots, trim the ends and grate them on the fine side of a grater. Roughly chop the almonds on a board with a large knife.",
      "Mix the porridge: Put the oats, milk, carrots, raisins and cinnamon into a medium saucepan and stir well, so no dry oats are left at the bottom.",
      "Bring to a bubble: Put the pan on a medium heat and stir often, scraping the bottom so nothing sticks. After 2 to 3 minutes it will start to bubble gently.",
      "Cook until creamy: Turn the heat down a little and keep stirring for 5 to 6 minutes, until thick and creamy and the carrot is soft. Stir in a splash of hot water if it gets too thick.",
      "Serve: Spoon the porridge into bowls and scatter the almonds over. Eat it straight away, while it is hot.",
    ],
  },
  {
    id: "peanut-butter-banana-oat-smoothie", meal: "breakfast", tags: ["Vegan", "Quick", "No cook"], name: "Peanut butter, banana and oat smoothie", blurb: "A thick, cold smoothie of banana, oats and peanut butter blended with oat drink and cinnamon.", servings: 1, minutes: 5,
    ingredients: [ing("oat-drink", 300), ing("banana", 120), ing("oats", 50), ing("peanut-butter", 25), ing("cinnamon", 1)],
    method: [
      "Get the banana ready: Peel the banana and break it into 3 or 4 pieces. A banana kept in the freezer, peeled and sliced, makes the smoothie thicker and colder.",
      "Fill the blender: Put the oats in the blender first, then the banana, peanut butter and cinnamon, and pour the oat drink over the top.",
      "Blend: Put the lid on firmly and blend for 1 to 2 minutes, until completely smooth, with no lumps of banana or whole oats left.",
      "Check how thick it is: If it is too thick to pour, add a splash of water and blend for a few seconds more.",
      "Serve: Pour into a glass and drink straight away, or cover it and keep it in the fridge to drink the same day. Stir it before drinking.",
    ],
  },
  {
    id: "wheat-biscuits-banana-almonds", meal: "breakfast", tags: ["Quick", "No cook", "Sweet"], name: "Wholewheat biscuits with banana, yogurt and almonds", blurb: "Wholewheat breakfast biscuits in cold milk, topped with sliced banana, Greek-style yogurt, almonds and cinnamon.", servings: 1, minutes: 5,
    ingredients: [ing("wheat-biscuits", 57), ing("milk", 200, { follows: "wheat-biscuits" }), ing("greek-yogurt", 100, { role: "protein" }), ing("banana", 120), ing("almonds", 20), ing("cinnamon", 1)],
    method: [
      "Chop the almonds: Roughly chop the almonds on a board with a large knife.",
      "Slice the banana: Peel the banana and cut it into thin rounds, about as thick as a pound coin.",
      "Add the biscuits: Put the wholewheat biscuits in a bowl and break them up a little with the back of a spoon if you like.",
      "Pour the milk: Pour the cold milk over the biscuits and leave them for 1 minute to soften a little.",
      "Add the toppings: Spoon the yogurt on top, then add the banana and scatter the almonds over. Dust with the cinnamon and eat straight away, before the biscuits go too soft.",
    ],
  },
  // ---- lunches
  {
    id: "spiced-carrot-chickpea-soup", meal: "lunch", tags: ["Soup", "Vegan", "Batch cook"], name: "Spiced carrot and chickpea soup with toast", blurb: "A smooth carrot and chickpea soup with cumin and lemon, served with wholemeal toast.", servings: 4, minutes: 35,
    ingredients: [ing("carrots", 500), ing("onion", 150), ing("chickpeas", 240), ing("olive-oil", 20), ing("cumin", 3), ing("garlic", 10), ing("lemon-juice", 15), ing("black-pepper", 1), ing("bread", 320)],
    method: [
      "Get ready: Peel and roughly chop the onion. Peel the carrots, trim the ends and cut them into rounds about 1 cm thick. Drain the chickpeas in a sieve and rinse them under the cold tap.",
      "Soften the onion: Heat the oil in a large saucepan on a medium heat. Add the onion and cook for 5 minutes, stirring now and then, until soft and see-through.",
      "Add the spices: Stir in the garlic and cumin and cook for 1 minute, stirring all the time so they don't burn.",
      "Simmer the soup: Add the carrots, chickpeas and 1 litre of hot water from the kettle. Bring to the boil, then turn the heat down, cover and simmer for 20 minutes, until the carrots are very soft when pierced with a knife.",
      "Blend the soup: Take the pan off the heat. Blend with a stick blender until smooth, or let it cool a little and blend it in batches in a blender, holding the lid down with a tea towel.",
      "Season: Stir in the lemon juice and a good grind of black pepper. Add a splash more hot water if the soup is too thick, and warm it through until piping hot.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Ladle the soup into warm bowls and serve with the toast. Cool any left over quickly, keep it covered in the fridge for up to 2 days and reheat until piping hot.",
    ],
  },
  {
    id: "salmon-chickpea-lemon-salad", meal: "lunch", tags: ["Fish", "Salad"], name: "Salmon and chickpea salad with lemon", blurb: "Baked salmon flaked over chickpeas, cucumber, cherry tomatoes and salad leaves, with a lemon and olive oil dressing.", servings: 2, minutes: 25,
    // 2026-11-21: no salt added (a pinch took it over the Longevity salt line at Morrisons); the pepper goes on the salmon before it bakes
    ingredients: [ing("salmon", 240), ing("chickpeas", 240, { role: "carb" }), ing("cucumber", 150), ing("cherry-tomatoes", 200), ing("salad-leaves", 60), ing("olive-oil", 20), ing("lemon-juice", 20), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Line a small baking tray with foil or baking paper.",
      "Bake the salmon: Lay the salmon on the tray skin side down, brush it with a little of the oil and sprinkle over half the black pepper. Bake for 12 to 15 minutes, until the fish is opaque and flakes easily. Wash your hands after handling raw fish.",
      "Make the dressing: Meanwhile, whisk the rest of the oil with the lemon juice and the rest of the black pepper in a small bowl.",
      "Get the salad ready: Drain the chickpeas in a sieve and rinse them under the cold tap. Cut the cucumber into small chunks and the cherry tomatoes in half. Rinse the leaves unless the bag says they are ready washed.",
      "Mix the salad: Put the chickpeas, cucumber and tomatoes in a large bowl, pour over most of the dressing and toss gently.",
      "Flake the salmon: Leave the salmon to cool for 2 to 3 minutes, then lift it off its skin with a fish slice and break it into large flakes with a fork.",
      "Serve: Share the leaves between plates, spoon the chickpea salad on top and scatter the salmon over. Drizzle with the rest of the dressing and eat warm or cold.",
    ],
  },
  {
    id: "egg-chickpea-spinach-salad", meal: "lunch", tags: ["Eggs", "Salad", "Quick"], name: "Egg, chickpea and spinach salad", blurb: "Boiled eggs on spinach with chickpeas, cherry tomatoes and red onion in a lemon and cumin dressing.", servings: 2, minutes: 20,
    ingredients: [ing("eggs", 180), ing("chickpeas", 240, { role: "carb" }), ing("spinach", 100), ing("cherry-tomatoes", 160), ing("red-onion", 40), ing("olive-oil", 15), ing("lemon-juice", 15), ing("cumin", 1), ing("black-pepper", 1)],
    method: [
      "Boil the water: Half-fill a saucepan with hot water from the kettle and bring it to a gentle boil on a medium-high heat.",
      "Cook the eggs: Lower the eggs in gently one at a time on a spoon. Boil them for 9 minutes, until the whites and yolks are firm and set. Wash your hands after handling raw eggs.",
      "Make the dressing: Meanwhile, whisk the oil, lemon juice, cumin and a good grind of black pepper together in a large bowl.",
      "Get the salad ready: Peel the red onion and slice it very thinly. Cut the cherry tomatoes in half. Drain the chickpeas in a sieve and rinse them. Rinse the spinach unless the bag says it is ready washed.",
      "Peel the eggs: Lift the eggs into a bowl of cold water for 2 minutes, until cool enough to handle. Tap them all over, peel off the shells and cut each egg into quarters.",
      "Mix the salad: Add the chickpeas, tomatoes, onion and spinach to the dressing in the bowl and toss gently until everything is coated.",
      "Serve: Pile the salad on to plates and put the eggs on top. Eat straight away, or keep it covered in the fridge and eat it the same day.",
    ],
  },
  {
    id: "roasted-pepper-houmous-sandwiches", meal: "lunch", tags: ["Vegan"], name: "Roasted pepper and houmous open sandwiches", blurb: "Oven-roasted peppers and red onion piled on wholemeal toast spread with houmous, with spinach.", servings: 2, minutes: 25,
    ingredients: [ing("bread", 160), ing("houmous", 70), ing("peppers", 240), ing("red-onion", 75), ing("olive-oil", 15), ing("spinach", 40), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7). Line a baking tray with baking paper.",
      "Get the vegetables ready: Cut the peppers in half, pull out the stalks and seeds, and cut them into strips about 2 cm wide. Peel the red onion and cut it into thin wedges.",
      "Roast the vegetables: Spread the peppers and onion on the tray in one layer, drizzle with the oil, add a grind of black pepper and toss well. Roast for 18 to 20 minutes, turning once, until soft and browned at the edges.",
      "Get the spinach ready: Meanwhile, rinse the spinach unless the bag says it is ready washed, and shake it dry.",
      "Toast the bread: Near the end, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Spread the houmous: Spread the houmous thinly over the warm toast, right to the edges.",
      "Serve: Lay the spinach over the houmous, pile the hot peppers and onion on top and eat straight away, with a knife and fork.",
    ],
  },
  {
    id: "bean-vegetable-chilli-soup", meal: "lunch", tags: ["Soup", "Vegan", "Batch cook"], name: "Bean and vegetable chilli soup with toast", blurb: "A chunky soup of kidney beans, peppers, carrots and tomatoes with cumin and chilli, with wholemeal toast.", servings: 4, minutes: 35,
    ingredients: [ing("kidney-beans", 480), ing("peppers", 240), ing("onion", 150), ing("carrots", 150), ing("chopped-tomatoes", 800), ing("olive-oil", 15), ing("cumin", 3), ing("chilli-powder", 2), ing("paprika", 3), ing("garlic", 10), ing("black-pepper", 1), ing("bread", 320)],
    method: [
      "Get ready: Peel and finely chop the onion. Peel the carrots and cut them into small cubes. Cut the peppers in half, pull out the stalks and seeds, and chop them. Drain the beans in a sieve and rinse them.",
      "Soften the vegetables: Heat the oil in a large saucepan on a medium heat. Add the onion, carrots and peppers and cook for 8 minutes, stirring now and then, until the onion is soft.",
      "Add the spices: Stir in the garlic, cumin, chilli powder and paprika and cook for 1 minute, stirring all the time so they don't burn.",
      "Simmer the soup: Add the chopped tomatoes, the beans and 500 ml of hot water from the kettle. Bring to the boil, then turn the heat down, cover and simmer for 15 minutes, until the carrots are soft.",
      "Season: Stir in a good grind of black pepper. Add a splash more hot water if the soup is too thick, and check it is piping hot all the way through.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Ladle the soup into warm bowls and serve with the toast. Cool any left over quickly, keep it covered in the fridge for up to 2 days and reheat until piping hot.",
    ],
  },
  {
    id: "warm-broccoli-chickpea-almond-salad", meal: "lunch", tags: ["Vegan", "Salad"], name: "Warm broccoli, chickpea and almond salad", blurb: "Roasted broccoli and chickpeas with toasted almonds and red onion in a lemon and garlic dressing.", servings: 2, minutes: 25,
    // 2026-11-21: oil 20 -> 25 ml so the broccoli browns and the chickpeas turn golden on the tray as the picture shows (founder: "has to look exactly as much as you can as the product")
    // 2026-11-21 (founder: "Nothing should be plain"): salt on the tray before roasting
    ingredients: [ing("broccoli", 300), ing("chickpeas", 240, { role: "carb" }), ing("almonds", 40), ing("red-onion", 75), ing("olive-oil", 25), ing("lemon-juice", 20), ing("garlic", 5), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Line a large baking tray with baking paper.",
      "Get ready: Cut the broccoli into small florets and slice the stalk thinly. Drain the chickpeas in a sieve, rinse them and pat them dry with kitchen paper. Peel the red onion and slice it very thinly.",
      "Roast the broccoli: Toss the broccoli and chickpeas with half the oil and the salt on the tray and spread them out in one layer. Roast for 18 to 20 minutes, until the broccoli is browned at the edges and the chickpeas are golden.",
      "Add the almonds: Roughly chop the almonds, scatter them over the tray and roast for 3 to 4 minutes more, until golden. Watch them closely, as they burn quickly.",
      "Make the dressing: Meanwhile, whisk the rest of the oil with the lemon juice, garlic and a good grind of black pepper in a large bowl.",
      "Mix the salad: Tip the hot broccoli, chickpeas and almonds into the bowl, add the onion and toss gently until everything is coated in the dressing.",
      "Serve: Pile the salad on to plates and eat it warm. Any left over can be eaten cold the same day, kept covered in the fridge.",
    ],
  },
  {
    id: "bean-sweetcorn-pepper-rice-salad", meal: "lunch", tags: ["Vegan", "Salad", "Make ahead"], name: "Bean, sweetcorn and pepper rice salad", blurb: "Cold rice with kidney beans, sweetcorn, pepper and red onion in a lemon and cumin dressing.", servings: 2, minutes: 25,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of salt in the dressing
    ingredients: [ing("rice", 140), ing("kidney-beans", 240), ing("sweetcorn", 140), ing("peppers", 160), ing("red-onion", 40), ing("olive-oil", 15), ing("lemon-juice", 15), ing("cumin", 1), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Cook it in a large pan of boiling water for 10 to 12 minutes, or as the packet says, until tender. If the sweetcorn is frozen, add it for the last 2 minutes.",
      "Cool the rice: Drain the rice in the sieve and rinse it under the cold tap until cold, so it cools quickly. Leave it to drain well.",
      "Get the vegetables ready: Meanwhile, cut the pepper in half, pull out the stalk and seeds, and chop it into small pieces. Peel the red onion and chop it finely. Drain the beans and rinse them.",
      "Make the dressing: Whisk the oil, lemon juice, cumin, the salt and a good grind of black pepper together in a large bowl.",
      "Mix the salad: Add the rice, beans, sweetcorn, pepper and onion to the bowl and stir gently until everything is coated in the dressing.",
      "Serve or keep: Eat straight away, or put it in a box with a lid in the fridge and eat it the next day at the latest. Keep cooked rice cold and never leave it out for long.",
    ],
  },
  {
    id: "smashed-chickpea-carrot-sandwiches", meal: "lunch", tags: ["Vegan", "Quick", "No cook"], name: "Smashed chickpea and carrot sandwiches", blurb: "Wholemeal sandwiches of chickpeas mashed with lemon and cumin, with grated carrot and spinach.", servings: 2, minutes: 10,
    ingredients: [ing("bread", 160), ing("chickpeas", 240, { role: "protein" }), ing("carrots", 150), ing("spinach", 40), ing("olive-oil", 15), ing("lemon-juice", 15), ing("cumin", 1), ing("black-pepper", 1)],
    method: [
      "Drain the chickpeas: Drain the chickpeas in a sieve, rinse them under the cold tap and shake them dry.",
      "Mash the chickpeas: Tip them into a bowl with the oil, lemon juice, cumin and a good grind of black pepper. Mash with a fork until mostly smooth, with a few pieces left.",
      "Grate the carrots: Peel the carrots, trim the ends and grate them on the coarse side of a grater.",
      "Get the spinach ready: Rinse the spinach unless the bag says it is ready washed, and shake it dry.",
      "Fill the sandwiches: Lay half the bread on a board. Spread the chickpea mash over it, right to the edges, then add the carrot and spinach. Put the rest of the bread on top and press down gently.",
      "Serve: Cut each sandwich in half and eat straight away, or cover them and keep them in the fridge to eat the same day.",
    ],
  },
  {
    id: "salmon-cucumber-soft-cheese-sandwiches", meal: "lunch", tags: ["Fish", "Quick"], name: "Salmon and cucumber sandwiches", blurb: "Baked salmon mixed with soft cheese and lemon in wholemeal sandwiches with sliced cucumber.", servings: 2, minutes: 20,
    ingredients: [ing("salmon", 200), ing("bread", 160), ing("soft-cheese", 50), ing("cucumber", 160), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Line a small baking tray with baking paper.",
      "Bake the salmon: Lay the salmon on the tray skin side down and bake for 12 to 15 minutes, until the fish is opaque all the way through and flakes easily. Wash your hands after handling raw fish.",
      "Cool the salmon: Lift the salmon off its skin on to a plate with a fish slice and leave it for 5 minutes to cool. Slice the cucumber thinly while you wait.",
      "Make the filling: Flake the salmon into a bowl with a fork. Add the soft cheese, lemon juice and a good grind of black pepper and mix gently.",
      "Fill the sandwiches: Lay half the bread on a board. Spread the salmon filling over it, right to the edges, and cover with the cucumber slices. Put the rest of the bread on top and press down gently.",
      "Serve: Cut each sandwich in half and eat straight away, or cover them and keep them in the fridge to eat the same day.",
    ],
  },
];

// How each looks from directly above, for its picture (docs/RECIPE_IMAGE_PROMPTS.md): one portion, only the recipe's own foods, served as the method says.
export const LONGEVITY_MORNING_LOOKS: Readonly<Record<string, string>> = {
  "crushed-chickpeas-tomatoes-toast": "Two slices of golden wholemeal toast on a round white plate, piled with roughly crushed golden chickpeas, soft halved red cherry tomatoes and dark green wilted spinach, glistening with olive oil and flecked with black pepper.",
  "berry-almond-porridge": "A round white bowl of thick, creamy pale oat porridge dusted with brown cinnamon, topped with a heap of glossy warm purple and red mixed berries in their juice and a scatter of roughly chopped almonds.",
  "tomato-olive-oil-toast-eggs": "Two slices of golden wholemeal toast on a round white plate, piled with glossy chopped red tomatoes in olive oil flecked with black pepper, beside four boiled egg halves with firm white edges and set yellow yolks.",
  "smoky-tomato-beans-toast": "Two slices of golden wholemeal toast on a round white plate, covered with deep red kidney beans in a thick chopped tomato and onion sauce tinged orange with paprika, with flecks of black pepper.",
  "berry-almond-oat-yogurt-bowl": "A round white bowl of thick white Greek-style yogurt, topped with a scatter of deep red and purple mixed berries, golden toasted oats and roughly chopped almonds, dusted with a fine sprinkle of brown cinnamon.",
  "carrot-raisin-porridge": "A round white bowl of thick, creamy oat porridge flecked with fine orange grated carrot, plump dark raisins and brown cinnamon, topped with a scatter of roughly chopped almonds.",
  "peanut-butter-banana-oat-smoothie": "A tall clear glass filled to the top with a thick, smooth pale beige banana, oat and peanut butter smoothie, its round surface finished with a fine dusting of brown cinnamon.",
  "wheat-biscuits-banana-almonds": "Three wholewheat breakfast biscuits in a round white bowl of cold milk, topped with a dollop of thick white yogurt, overlapping rounds of sliced banana, roughly chopped almonds and a dusting of brown cinnamon.",
  "spiced-carrot-chickpea-soup": "A round white bowl of smooth, thick bright orange carrot and chickpea soup with a few flecks of black pepper, beside two slices of golden wholemeal toast on a small white plate.",
  "salmon-chickpea-lemon-salad": "A wide white bowl of green salad leaves topped with chickpeas, chunks of cucumber and halved red cherry tomatoes, scattered with large flakes of pink baked salmon and glistening with a lemon and olive oil dressing.",
  "egg-chickpea-spinach-salad": "A round white plate of dark green spinach leaves tossed with golden chickpeas, halved red cherry tomatoes and thin slices of purple red onion, topped with quartered boiled eggs with set yellow yolks.",
  "roasted-pepper-houmous-sandwiches": "Two slices of golden wholemeal toast on a round white plate, spread with pale houmous and topped with a few dark green spinach leaves and soft, browned strips of roasted red and yellow pepper and red onion.",
  "bean-vegetable-chilli-soup": "A round white bowl of chunky deep red soup with kidney beans, small cubes of orange carrot and pieces of red pepper and onion in a thick tomato broth, beside two slices of golden wholemeal toast.",
  "warm-broccoli-chickpea-almond-salad": "A round white plate of roasted broccoli florets browned at the edges, golden roasted chickpeas, toasted chopped almonds and thin slices of purple red onion, glistening with a lemon and garlic olive oil dressing.",
  "bean-sweetcorn-pepper-rice-salad": "A round white bowl of cold fluffy white rice mixed with deep red kidney beans, bright yellow sweetcorn, small pieces of red pepper and finely chopped red onion, glistening with a lemon dressing.",
  "smashed-chickpea-carrot-sandwiches": "A wholemeal sandwich cut in half on a round white plate, the two halves set slightly apart, the cut edges showing a thick layer of pale mashed chickpeas, grated orange carrot and dark green spinach.",
  "salmon-cucumber-soft-cheese-sandwiches": "A wholemeal sandwich cut in half on the diagonal on a round white plate, the two halves set slightly apart, the cut edges showing a creamy pale pink salmon filling and thin slices of green cucumber.",
};
