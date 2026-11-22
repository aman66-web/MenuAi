import { ing, type Recipe } from "../recipes";

// World lunches, dinners and breakfasts, the kind UK meal-prep and recipe-box companies serve (founder 2026-11-21: "there's too many recipes to do with like
// wraps, sandwiches ... You should have different recipes from around the planet, like ones people actually want to see ... look at all these meal prep
// companies, look at what they're serving"). Only the kinds of dish were noted from their public menus (a katsu curry, a jollof rice, a peri peri chicken):
// every name, amount, method and picture here is our own. Proper plates and bowls (a protein, a carb, vegetables and a sauce), never a wrap, a sandwich or
// anything on toast. Built, like everyShop.ts, from kinds that Sainsbury's, Morrisons, Waitrose, Iceland, Asda and M&S sell with a read label and a price
// (tests/recipeShops.check.test.ts, REPORT=kinds); a stand-in the recipe page names covers the rest (peppers at Iceland, red onion at Asda, bacon at Asda).
// Prawns, white fish, lamb, turkey, tofu and lentils are left out: they are not everyday kinds (lib/mm/pantry.ts EVERYDAY_KINDS, founder 2026-10-15).
// See lib/mm/recipeBook/index.ts for the rules every recipe follows.
// Chef pass, 21 November 2026 (founder, after cooking the sweet chilli chicken: "Nothing should be plain, these should all be chef made meals"): each
// method browns, seasons and finishes its dish the way the picture shows (meat patted dry and left to colour, onions cooked soft and sweet, spices
// fried for 30 seconds, sauces bubbled until they coat). "chef pass" over an ingredient list says what it added. No paprika or turmeric: M&S sells
// neither, nor Aldi ground cumin, so adding them would take these recipes away from those shops. Salt, oil and honey were added only where the dish
// stays in every eating style it was in (Lower salt, Lower sugar, Low fat, Longevity, High protein).
// Photo match, 22 November 2026 (founder 21 Nov: "All Recipes should be accurate exactly to how the photo looks"; "Marinating chicken beef etc other
// meats is a big thing ... they can marinate on the spot"): each method checked against its real picture (cuts, plating, where the spices go), and
// every chicken, beef, salmon and tuna dish marinates while the rest is made ready, from what it already buys. "photo match" over a recipe says what changed.

const RICE = "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre.";
const CHECK_CHICKEN = "Check the chicken: Cut into the thickest piece. It must be piping hot all the way through with no pink left. Cook it a little longer if not.";
const KEEP_RICE = "Cool leftover rice quickly, put it in the fridge within 1 hour and eat it the next day, reheated until steaming hot.";
const KEEP = "Cool any left over quickly, keep it in the fridge and eat it within 2 days.";

export const WORLD_MEALS: readonly Recipe[] = [
  // ---- breakfasts
  {
    id: "menemen-turkish-eggs-peppers", meal: "breakfast", tags: ["Eggs", "Quick", "Turkish"], name: "Menemen-style Turkish eggs with tomatoes and peppers", blurb: "Soft scrambled eggs cooked into a pan of sweet pepper, onion and tomato with a little chilli and melted cheese.", servings: 2, minutes: 20,
    // chef pass 2026-11-21: salt 1 -> 2 g
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): chunky peppers and tomato wedges that keep their shape, large curds, chilli on top
    ingredients: [ing("eggs", 240), ing("tomatoes", 340), ing("peppers", 160), ing("onion", 150), ing("chilli-powder", 1), ing("olive-oil", 15), ing("salt", 2), ing("cheddar", 30), ing("black-pepper", 1)],
    method: [
      "Get ready: Peel the onion and chop it into 1 cm pieces. Wash the pepper and the tomatoes. Take the seeds out of the pepper and cut it into 2 cm squares, then cut the tomatoes into thick wedges.",
      "Soften the vegetables: Heat the oil in a large frying pan on a medium heat. Add the onion, the pepper and half the salt and fry for 8 to 10 minutes, stirring now and then, until very soft and sweet.",
      "Add the chilli: Stir in most of the chilli powder for 30 seconds, until it smells warm and toasty. Keep a pinch back for the top.",
      "Cook the tomatoes: Add the tomatoes and the rest of the salt and cook for 3 to 4 minutes, stirring gently, until just soft but still holding their shape and the juice has bubbled away, so the dish isn't watery.",
      "Beat the eggs: Crack the eggs into a bowl, picking out any shell, and beat them lightly with a fork. Wash your hands after touching raw eggs.",
      "Scramble the eggs: Turn the heat to low and pour in the eggs. Leave them for 30 seconds, then fold them gently through the vegetables for 2 to 3 minutes, in large soft curds, until set and glossy, with no runny egg left.",
      "Melt the cheese: Grate the cheddar, scatter it over the eggs and take the pan off the heat. Leave it for 1 minute to melt.",
      "Serve: Spoon the eggs on to warm plates, dust over the pinch of chilli powder and add a grind of black pepper. Eat straight away.",
    ],
  },
  {
    id: "turkish-poached-eggs-garlic-yogurt", meal: "breakfast", tags: ["Eggs", "Turkish"], name: "Turkish-style poached eggs with garlic yogurt and spinach", blurb: "Poached eggs on cool garlic yogurt with wilted spinach and a warm chilli oil spooned over.", servings: 2, minutes: 20,
    ingredients: [ing("eggs", 240), ing("greek-yogurt", 200), ing("garlic", 5), ing("spinach", 160), ing("chilli-powder", 1), ing("olive-oil", 15), ing("salt", 1)],
    method: [
      "Make the garlic yogurt: Stir the garlic purée and half the salt into the yogurt and leave it out of the fridge while you cook, so it isn't too cold.",
      "Wilt the spinach: Rinse the spinach unless the bag says it is ready washed. Put it in a large pan on a medium heat with a splash of water and stir for 2 minutes, until soft.",
      "Drain the spinach: Tip it into a sieve and press out the water with a spoon, so the yogurt doesn't turn watery. Stir in the rest of the salt.",
      "Make the chilli oil: Warm the oil in a small pan on a low heat for 1 minute. Take it off the heat and stir in the chilli powder. The oil turns a glossy orange-red and smells toasty.",
      "Poach the eggs: Bring a wide pan of water to a gentle simmer. Crack in the eggs one at a time, picking out any shell, and cook for 3 to 4 minutes, until the whites are completely set. Wash your hands after touching raw eggs.",
      "Serve: Spread the garlic yogurt over plates and add the spinach. Lift the eggs out with a slotted spoon, drain them on kitchen paper, put them on top and spoon over the chilli oil.",
    ],
  },
  {
    id: "masala-omelette-spinach-tomato", meal: "breakfast", tags: ["Eggs", "Quick", "Indian"], name: "Masala omelette with spinach and tomato", blurb: "A spiced Indian-style omelette folded around soft onion, tomato and spinach.", servings: 1, minutes: 15,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): sliced onion, cubed tomato and whole spinach leaves showing at the open edge
    ingredients: [ing("eggs", 180), ing("milk", 15), ing("onion", 40), ing("tomatoes", 85), ing("spinach", 40), ing("chilli-powder", 1), ing("olive-oil", 10), ing("salt", 1)],
    method: [
      "Get ready: Peel the onion and slice it thinly. Wash the tomato and cut it into small cubes. Rinse the spinach unless the bag says it is ready washed, and leave the leaves whole.",
      "Beat the eggs: Crack the eggs into a bowl, picking out any shell. Beat them with the milk, salt and half the chilli powder until smooth. Wash your hands after touching raw eggs.",
      "Soften the vegetables: Heat the oil in a non-stick frying pan, about 20 cm across, on a medium heat. Fry the onion for 4 minutes, until soft and sweet, then add the tomato and spinach and stir for 1 to 2 minutes, until the spinach wilts.",
      "Cook the omelette: Pour the eggs over the vegetables and tilt the pan so they spread evenly. Cook for 3 to 4 minutes, lifting the edges now and then, until the underside is golden and the top is just set.",
      "Fold and serve: Fold the omelette in half so the filling shows at the open edge, and cook for 30 seconds more, until set all the way through. Slide it on to a warm plate and dust over the rest of the chilli powder.",
    ],
  },
  {
    id: "bacon-spinach-tomato-egg-muffins", meal: "breakfast", tags: ["Eggs", "Make ahead"], name: "Bacon, spinach and tomato egg muffins", blurb: "Baked egg muffins with crisp bacon, spinach, tomato and a little cheddar, good warm or cold.", servings: 4, minutes: 30,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): bacon in pink 1 cm squares, some bacon and tomato dotted on the cheese
    ingredients: [ing("eggs", 480), ing("bacon", 120), ing("spinach", 80), ing("tomatoes", 170), ing("cheddar", 40), ing("milk", 40), ing("olive-oil", 5), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Brush the holes of a 12-hole muffin tin with the oil.",
      "Cook the bacon: Lay the bacon flat in a dry non-stick frying pan on a medium-high heat and fry for 3 to 4 minutes, turning once, until cooked through and just golden at the edges. Lift it on to kitchen paper and cut it into 1 cm squares.",
      "Wilt the spinach: Rinse the spinach unless the bag says it is ready washed. Stir it in the hot bacon pan for 1 minute, until just soft. Tip it into a sieve, press out the water with a spoon and chop it.",
      "Get the tomatoes ready: Wash the tomatoes, cut them in half and scoop out the wet seeds with a teaspoon, so the muffins don't turn watery. Chop them into small pieces. Grate the cheddar.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Beat them with the milk and a grind of black pepper. Wash your hands after touching raw eggs.",
      "Fill the tin: Share the spinach and two thirds of the bacon and tomato between the holes of the tin. Pour the egg over them, scatter the cheese on top, then dot the rest of the bacon and tomato over the cheese.",
      "Bake: Bake for 15 to 18 minutes, until puffed and golden on top and set all the way through, with no runny egg in the middle.",
      "Serve: Leave them for 2 minutes, then ease them out with a knife. Cool any left over quickly, keep them in the fridge and eat them within 2 days.",
    ],
  },
  {
    id: "peanut-butter-banana-baked-oats", meal: "breakfast", tags: ["Oats", "Make ahead"], name: "Peanut butter and banana baked oats", blurb: "Oats baked with mashed banana, egg, milk and cinnamon under a swirl of peanut butter.", servings: 2, minutes: 35,
    ingredients: [ing("oats", 100), ing("banana", 120), ing("eggs", 60), ing("milk", 200, { follows: "oats" }), ing("peanut-butter", 30), ing("cinnamon", 1)],
    method: [
      "Heat the oven: Heat the oven to 180°C (160°C fan, gas 4).",
      "Mash the banana: Peel the banana and cut a few thin slices for the top. Mash the rest well with a fork in a mixing bowl.",
      "Mix the oats: Crack in the egg, picking out any shell, and beat it into the banana. Stir in the oats, milk and cinnamon until evenly mixed. Wash your hands after touching raw egg.",
      "Fill the dish: Pour the mixture into a small ovenproof dish and spread it level. Dot the peanut butter over the top, swirl it in with the tip of a knife and press the banana slices into the top.",
      "Bake: Bake for 22 to 25 minutes, until risen, golden at the edges and set in the middle, with no wet mixture when you press it.",
      "Serve: Leave it for 5 minutes, then spoon it into bowls. Keep any left over covered in the fridge and eat it the next day.",
    ],
  },
  {
    id: "cottage-cheese-pancakes-banana", meal: "breakfast", tags: ["Pancakes"], name: "Cottage cheese pancakes with banana and honey", blurb: "Soft, thick pancakes made from blended cottage cheese, oats and eggs, with sliced banana and honey.", servings: 2, minutes: 25,
    // chef pass 2026-11-21: cinnamon 1 g
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): larger pancakes, about 10 cm, stacked
    ingredients: [ing("cottage-cheese", 200), ing("eggs", 120), ing("oats", 60), ing("cinnamon", 1), ing("banana", 240), ing("honey", 10), ing("vegetable-oil", 10)],
    method: [
      "Make the batter: Crack the eggs into a blender, picking out any shell. Add the cottage cheese, oats and cinnamon and blend for 1 minute, until smooth. Leave it for 5 minutes to thicken. Wash your hands after touching raw eggs.",
      "Heat the pan: Heat a little of the oil in a large non-stick frying pan on a medium heat for 1 minute, until a drop of batter sizzles.",
      "Cook the pancakes: Spoon in about 3 tablespoons of batter for each pancake and spread it into a round about 10 cm across, leaving space between them. Cook for 2 to 3 minutes, without moving them, until bubbles show on top and the underside is golden brown.",
      "Turn them over: Flip the pancakes and cook for 2 minutes more, until golden and set all the way through. Keep them warm while you cook the rest, adding a little oil each time.",
      "Serve: Peel the bananas and slice them into rounds. Stack the pancakes high on warm plates, top with the banana and drizzle over the honey.",
    ],
  },
  {
    id: "masala-oats-peas-tomato", meal: "breakfast", tags: ["Oats", "Quick", "Indian"], name: "Masala oats with peas and tomato", blurb: "Savoury Indian-style porridge oats cooked with onion, tomato, peas, garlic and chilli, topped with yogurt.", servings: 2, minutes: 15,
    // chef pass 2026-11-21: turmeric 1 g for the golden porridge
    ingredients: [ing("oats", 80), ing("onion", 75), ing("tomatoes", 170), ing("peas", 80), ing("garlic", 5), ing("turmeric", 1), ing("chilli-powder", 1), ing("salt", 1), ing("olive-oil", 10), ing("natural-yogurt", 60)],
    method: [
      "Get ready: Peel and finely chop the onion. Wash the tomatoes and chop them into small pieces.",
      "Soften the onion: Heat the oil in a saucepan on a medium heat. Fry the onion with the salt for 5 minutes, stirring, until soft and sweet.",
      "Add the spices: Stir in the garlic purée, turmeric and half the chilli powder for 30 seconds, until they smell toasty. Add the tomatoes and cook for 3 minutes, until soft and jammy.",
      "Cook the oats: Stir in the oats, the frozen peas and 400 ml of boiling water from the kettle. Simmer for 4 to 5 minutes, stirring often, until thick, creamy and golden and the peas are hot.",
      "Serve: Spoon the oats into bowls, top each with a spoonful of yogurt and dust over the rest of the chilli powder. Add a splash of hot water if they have thickened too much.",
    ],
  },
  {
    id: "berry-banana-smoothie-bowl-granola", meal: "breakfast", tags: ["No cook", "Quick"], name: "Berry and banana smoothie bowl with granola", blurb: "A thick blended bowl of frozen berries, banana and Greek-style yogurt, topped with granola.", servings: 2, minutes: 10,
    ingredients: [ing("berries", 250), ing("banana", 120), ing("greek-yogurt", 250), ing("milk", 60), ing("granola", 50)],
    method: [
      "Get ready: Peel the banana. Cut off a few thin slices for the top and break the rest into chunks.",
      "Blend the bowl: Put the frozen berries, the banana chunks, the yogurt and the milk in a blender. Blend for 1 to 2 minutes, stopping to scrape down the sides, until thick and smooth.",
      "Check the thickness: It should be thick enough to hold a spoon. Add a splash more milk if the blender struggles, or a few more berries if it is too thin.",
      "Spoon it out: Spoon it into bowls and smooth the top.",
      "Serve: Scatter the granola and the banana slices over the top and eat straight away.",
    ],
  },

  // ---- lunches
  {
    id: "chicken-tinga-rice-bowl", meal: "lunch", tags: ["Bowl", "Mexican"], name: "Chicken tinga-style rice bowl", blurb: "Shredded chicken in a smoky chilli, tomato and onion sauce on rice, with lettuce and lemon yogurt.", servings: 2, minutes: 40,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in garlic, cumin, chilli and salt
    ingredients: [ing("chicken-thigh", 300), ing("onion", 150), ing("garlic", 10), ing("chilli-powder", 2), ing("cumin", 2), ing("oregano", 1), ing("chopped-tomatoes", 400), ing("salt", 1), ing("olive-oil", 15), ing("rice", 140), ing("lettuce", 80), ing("natural-yogurt", 60), ing("lemon-juice", 10)],
    method: [
      "Marinate the chicken: Toss the chicken thighs with half the garlic purée, cumin, chilli powder and salt. Leave them for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands after touching raw chicken.",
      "Brown the chicken: Heat the oil in a large saucepan on a medium-high heat until it shimmers. Lay in the chicken and leave it for 3 to 4 minutes, without moving it, until golden underneath. Turn it and brown the other side for 3 minutes.",
      "Soften the onion: Lift the chicken on to a plate. Peel the onion and slice it thinly. Fry it in the same pan for 6 to 8 minutes, stirring now and then, until soft, sweet and golden.",
      "Add the spices: Stir in the oregano and the rest of the garlic purée, chilli powder and cumin for 30 seconds, until they smell toasty.",
      "Simmer the sauce: Pour in the chopped tomatoes with the rest of the salt and scrape up the brown bits from the bottom of the pan. Put the chicken back, cover and simmer gently for 15 minutes, turning the chicken once.",
      RICE,
      "Shred the chicken: Lift the chicken on to a board and pull it into shreds with two forks. It must be piping hot all the way through with no pink left.",
      "Thicken the sauce: Meanwhile, let the sauce bubble without the lid for 3 to 5 minutes, stirring now and then, until thick and glossy. Stir the chicken back in so every shred is coated.",
      "Get the toppings ready: Wash the lettuce, shake it dry and shred it finely. Stir the lemon juice into the yogurt.",
      "Serve: Drain the rice well and spoon it into bowls. Top with the chicken and its sauce, the lettuce and a spoonful of lemon yogurt.",
    ],
  },
  {
    id: "fajita-salmon-rice-bowl-salsa", meal: "lunch", tags: ["Bowl", "Fish", "Mexican"], name: "Fajita-spiced salmon rice bowl with salsa", blurb: "Baked fajita-spiced salmon flaked over rice with tomato salsa, crisp lettuce, cucumber and lemon yogurt.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates in its fajita paste; large chunks on top
    ingredients: [ing("salmon", 240), ing("fajita-seasoning", 8), ing("olive-oil", 10), ing("rice", 140), ing("salsa", 100), ing("lettuce", 80), ing("cucumber", 150), ing("natural-yogurt", 60), ing("lemon-juice", 10)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7) and line a baking tray with foil.",
      "Get the salmon ready: Pat the salmon dry with kitchen paper and put it on the tray, skin side down. Wash your hands after touching raw fish.",
      "Marinate the salmon: Mix the fajita seasoning, oil and a third of the lemon juice and spread it thickly over the salmon. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Bake the salmon: Bake for 10 to 12 minutes, until the crust is a deep red-brown and the fish is opaque and flakes easily with a fork.",
      RICE,
      "Get the salad ready: Meanwhile, wash the lettuce and cucumber. Shred the lettuce, cut the cucumber into small cubes and toss it with a third of the lemon juice.",
      "Mix the yogurt: Stir the rest of the lemon juice into the yogurt in a small bowl.",
      "Serve: Drain the rice well and spoon it into bowls. Break the salmon into large chunks, leaving the skin behind, and lay it on top with the lettuce, cucumber, salsa and lemon yogurt.",
    ],
  },
  {
    id: "japchae-noodles-mushrooms-egg", meal: "lunch", tags: ["Eggs", "Korean"], name: "Japchae-style noodles with mushrooms, spinach and egg", blurb: "Korean-style noodles tossed with garlic mushrooms, onion and spinach in a sweet soy sauce, topped with strips of omelette.", servings: 2, minutes: 20,
    ingredients: [ing("noodles", 300), ing("mushrooms", 200), ing("spinach", 100), ing("onion", 150), ing("eggs", 120), ing("garlic", 10), ing("soy", 30), ing("honey", 10), ing("olive-oil", 15), ing("black-pepper", 1)],
    method: [
      "Get ready: Peel the onion and slice it thinly. Wipe the mushrooms clean and slice them. Rinse the spinach unless the bag says it is ready washed.",
      "Mix the sauce: Stir the soy sauce, honey and garlic purée together in a cup.",
      "Beat the eggs: Crack the eggs into a bowl, picking out any shell, and beat them with a fork. Wash your hands after touching raw eggs.",
      "Cook the omelette: Heat a little of the oil in a large non-stick frying pan on a medium-low heat. Pour in the eggs and tilt the pan so they spread thinly. Cook for 2 minutes, without stirring, until set but still yellow.",
      "Slice the omelette: Slide it on to a board, roll it up and slice it into thin ribbons.",
      "Brown the mushrooms: Heat the rest of the oil in the pan on a high heat. Add the mushrooms in one layer and leave them for 2 to 3 minutes without stirring, until golden underneath.",
      "Add the onion: Stir the mushrooms, add the onion and fry for 4 minutes more, stirring now and then, until the onion is soft and the mushrooms are golden all over.",
      "Add the noodles: Loosen the noodles with your fingers and add them to the pan with the spinach and the sauce. Toss for 2 to 3 minutes, until the noodles are hot, glossy and coated and the spinach has wilted.",
      "Serve: Add a grind of black pepper, pile the noodles into bowls and scatter the ribbons of omelette on top.",
    ],
  },
  {
    id: "thai-coconut-noodle-soup-mushrooms", meal: "lunch", tags: ["Soup", "Vegan", "Thai"], name: "Thai-style coconut noodle soup with mushrooms and spinach", blurb: "Noodles, mushrooms and spinach in a creamy coconut broth with garlic, chilli, soy and lemon.", servings: 2, minutes: 20,
    ingredients: [ing("coconut-milk", 200), ing("noodles", 300), ing("mushrooms", 200), ing("spinach", 80), ing("onion", 150), ing("garlic", 10), ing("chilli-powder", 1), ing("soy", 20), ing("lemon-juice", 15), ing("olive-oil", 15)],
    method: [
      "Get ready: Peel the onion and slice it thinly. Wipe the mushrooms clean and slice them. Rinse the spinach unless the bag says it is ready washed.",
      "Brown the mushrooms: Heat the oil in a large saucepan on a high heat. Spread out the mushrooms and leave them for 2 to 3 minutes without stirring, until golden underneath. Stir and fry for 2 minutes more, then lift a spoonful out for the top.",
      "Add the onion: Turn the heat to medium, add the onion and fry for 4 to 5 minutes, stirring now and then, until soft and sweet.",
      "Add the spices: Stir in the garlic purée and half the chilli powder and cook for 30 seconds, until they smell fragrant.",
      "Make the broth: Pour in the coconut milk, 500 ml of boiling water from the kettle and the soy sauce. Bring it to the boil, then simmer gently for 5 minutes.",
      "Add the noodles: Loosen the noodles with your fingers and add them to the pan with the spinach. Simmer for 2 to 3 minutes, until the noodles are hot and the spinach is soft.",
      "Serve: Take the pan off the heat and stir in the lemon juice. Ladle the soup into warm bowls, top with the mushrooms you kept and sprinkle over the rest of the chilli powder.",
    ],
  },
  {
    id: "pho-chicken-noodle-soup", meal: "lunch", tags: ["Soup", "Vietnamese"], name: "Pho-style chicken noodle soup", blurb: "A clear, gently spiced broth with charred onion, cinnamon and soy, noodles, shredded chicken and spinach.", servings: 2, minutes: 35,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in soy, garlic and pepper; the charred onion stays in wedges
    ingredients: [ing("chicken", 250), ing("onion", 150), ing("garlic", 10), ing("cinnamon", 1), ing("soy", 30), ing("black-pepper", 1), ing("noodles", 300), ing("spinach", 100), ing("lemon-juice", 15), ing("chilli-powder", 1)],
    method: [
      "Marinate the chicken: Toss the chicken with 1 tablespoon of the soy sauce, half the garlic purée and the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Char the onion: Peel the onion and cut it into quarters through the root. Put them cut side down in a dry large saucepan on a high heat for 5 minutes, until blackened underneath. Add the cinnamon for the last 30 seconds, until it smells toasty.",
      "Make the broth: Pour in 900 ml of boiling water from the kettle. Add the rest of the garlic purée and soy sauce and bring it to the boil.",
      "Poach the chicken: Add the chicken breasts with their marinade, turn the heat down so the broth barely bubbles, cover and cook for 15 minutes. Gentle bubbles keep the broth clear. Wash your hands after touching raw chicken.",
      CHECK_CHICKEN,
      "Shred the chicken: Lift the chicken on to a board and pull it into thin shreds with two forks. Leave the charred onion wedges in the broth.",
      "Add the noodles: Loosen the noodles with your fingers and add them to the broth with the spinach. Simmer for 2 minutes, until the noodles are hot.",
      "Serve: Stir in the lemon juice and the chicken and ladle the soup into deep bowls. Sprinkle a pinch of chilli powder over each one.",
    ],
  },
  {
    id: "banh-mi-chicken-rice-bowl", meal: "lunch", tags: ["Bowl", "Vietnamese"], name: "Banh mi-style chicken rice bowl with quick pickles", blurb: "Sticky soy and honey chicken on rice with quick-pickled cucumber and red onion, lettuce and a spicy mayo.", servings: 2, minutes: 30,
    // chef pass 2026-11-21: black pepper 1 g in the marinade
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): bite-sized pieces, the fridge line on the marinade, the mayo drizzled in lines
    ingredients: [ing("chicken-thigh", 300), ing("soy", 20), ing("honey", 10), ing("garlic", 10), ing("black-pepper", 1), ing("olive-oil", 15), ing("rice", 140), ing("cucumber", 150), ing("red-onion", 75), ing("lemon-juice", 30), ing("salt", 1), ing("light-mayo", 30), ing("chilli-powder", 1), ing("lettuce", 60)],
    method: [
      "Make the pickles: Peel the red onion and slice it very thinly. Cut the cucumber into thin sticks. Toss them in a bowl with the lemon juice and salt and leave for 15 minutes, until the onion turns pink.",
      RICE,
      "Cut the chicken: Cut the chicken into bite-sized pieces and put them in a bowl. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Mix in the soy sauce, honey, garlic purée and black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Brown the chicken: Heat the oil in a large non-stick frying pan on a high heat until very hot. Lift the chicken out of the bowl, keeping the marinade, and lay it in one layer with space between the pieces (two batches if your pan is small).",
      "Turn the chicken: Leave the pieces for 2 to 3 minutes without stirring, until golden underneath, then turn them and fry for 2 to 3 minutes more, until golden on the other side.",
      "Glaze the chicken: Turn the heat to medium. Pour in the marinade and 2 tablespoons of water and bubble for 1 to 2 minutes, tossing, until the chicken is coated in a sticky glaze. Add a splash of water if it gets too thick.",
      CHECK_CHICKEN,
      "Make the spicy mayo: Stir the chilli powder into the mayonnaise until smooth and evenly coloured. Wash the lettuce and tear it into pieces.",
      "Serve: Drain the rice well and spoon it into bowls. Top with the lettuce, the chicken and the drained pickles, and drizzle the spicy mayo over the top in thin lines from a teaspoon.",
    ],
  },
  {
    id: "dan-dan-beef-noodles-spinach", meal: "lunch", tags: ["Quick", "Chinese"], name: "Dan dan-style beef noodles with spinach", blurb: "Noodles in a peanut, soy and chilli sauce, topped with crispy garlic beef mince and wilted spinach.", servings: 2, minutes: 20,
    // chef pass 2026-11-21: black pepper 1 g with the chilli
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in soy, garlic and pepper; chilli in the peanut sauce too
    ingredients: [ing("beef-mince", 250), ing("noodles", 300), ing("peanut-butter", 30), ing("soy", 30), ing("honey", 10), ing("lemon-juice", 10), ing("garlic", 10), ing("chilli-powder", 2), ing("black-pepper", 1), ing("spinach", 160), ing("olive-oil", 15)],
    method: [
      "Marinate the mince: Mix the beef with 1 teaspoon of the soy sauce, half the garlic purée and the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Mix the sauce: Stir the peanut butter, half the soy sauce, half the chilli powder, the honey, the lemon juice and 3 tablespoons of hot water from the kettle together in a bowl until smooth and glossy.",
      "Brown the mince: Heat the oil in a large non-stick frying pan on a high heat. Add the beef, press it flat and leave it for 3 minutes without stirring, until browned underneath.",
      "Crisp the mince: Break it up and fry for 4 to 5 minutes more, stirring only now and then, until the liquid has gone and the mince is browned all over and crisp in places.",
      "Add the flavours: Stir in the rest of the garlic purée, chilli powder and soy sauce and cook for 2 minutes. The mince must be piping hot with no pink left. Tip it into a bowl.",
      "Wilt the spinach: Put the spinach in the hot pan for 1 to 2 minutes, stirring, until just soft. Lift it out on to a plate.",
      "Heat the noodles: Loosen the noodles with your fingers, add them to the pan with a splash of water and toss for 2 minutes, until hot.",
      "Serve: Toss the noodles with the peanut sauce until every strand is glossy and coated, and pile them into bowls. Top with the spinach and the crispy mince.",
    ],
  },
  {
    id: "mushroom-pea-pilau-almonds", meal: "lunch", tags: ["Vegan", "Indian"], name: "Mushroom and pea pilau with toasted almonds", blurb: "Rice tossed with spiced fried mushrooms, onion and peas, scattered with toasted almonds, with a tomato and cucumber salad.", servings: 2, minutes: 30,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): sliced onion, sliced almonds, chunky tomato and cucumber beside the pilau
    ingredients: [ing("rice", 140), ing("mushrooms", 250), ing("peas", 120), ing("onion", 150), ing("garlic", 10), ing("cumin", 2), ing("cinnamon", 1), ing("chilli-powder", 1), ing("salt", 1), ing("almonds", 30), ing("olive-oil", 15), ing("tomatoes", 170), ing("cucumber", 100), ing("lemon-juice", 10)],
    method: [
      "Get ready: Peel the onion and slice it thinly. Wipe the mushrooms clean and slice them. Wash the tomatoes and cucumber and cut them into 1.5 cm cubes.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water with half the salt and simmer for 10 to 12 minutes, until soft with no hard centre. Add the peas for the last 3 minutes.",
      "Toast the almonds: Heat a large frying pan on a medium heat and toast the almonds for 3 to 4 minutes, shaking the pan, until golden and they smell toasty. Tip them on to a board and, once cool enough to touch, slice them thinly.",
      "Brown the mushrooms: Heat the oil in the pan on a high heat. Add the mushrooms in one layer and leave them for 3 minutes without stirring, until golden underneath.",
      "Add the onion: Stir the mushrooms, add the onion, turn the heat to medium and fry for 5 to 6 minutes, stirring now and then, until the onion is soft and the mushrooms are golden all over.",
      "Add the spices: Stir in the garlic purée, cumin, cinnamon, chilli powder and the rest of the salt and cook for 30 seconds, stirring, until they smell toasty.",
      "Mix the pilau: Drain the rice and peas well and tip them into the pan. Stir gently for 2 minutes, until every grain is coated in the spices and hot.",
      "Serve: Spoon the pilau into bowls and scatter the almonds on top. Toss the tomatoes and cucumber with the lemon juice and pile them beside the pilau in the bowl.",
    ],
  },
  {
    id: "omurice-ham-rice-omelette", meal: "lunch", tags: ["Eggs", "Japanese"], name: "Omurice-style ham fried rice omelette", blurb: "Tomato fried rice with ham, peas and onion, folded inside a soft omelette, Japanese style.", servings: 2, minutes: 30,
    // chef pass 2026-11-21: a pinch of salt (1 g) in the eggs
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the ham soaks in the soy and pepper while the rice cooks
    ingredients: [ing("rice", 140), ing("ham", 100), ing("onion", 150), ing("peas", 120), ing("chopped-tomato-puree", 30), ing("honey", 5), ing("soy", 10), ing("eggs", 240), ing("milk", 30), ing("salt", 1), ing("olive-oil", 15), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre. Drain it well and spread it on a plate to steam dry.",
      "Get ready: Meanwhile, peel and finely chop the onion. Cut the ham into small squares and toss them with the soy sauce and the black pepper, so they soak up the flavour while the rice cooks.",
      "Fry the filling: Heat half the oil in a large non-stick frying pan on a medium heat. Fry the onion for 5 minutes, until soft and sweet. Add the ham with its soy and the peas and stir for 2 minutes.",
      "Fry the tomato: Stir in the tomato purée and honey and fry for 1 minute, until the purée turns a deeper red.",
      "Fry the rice: Tip in the rice and stir for 3 to 4 minutes, until every grain is orange-red and the peas are hot. Spoon it into a bowl and cover it to keep warm.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell, and beat them with the milk and the salt. Wash your hands after touching raw eggs.",
      "Cook an omelette: Wipe the pan, heat a little of the rest of the oil on a medium-low heat and pour in enough egg to cover the base. Cook for 2 to 3 minutes, tilting the pan, until just set, smooth and yellow, not browned.",
      "Fill and fold: Spoon some rice on to one half, fold the omelette over it and slide it on to a warm plate. Repeat with the rest of the egg and rice, and serve straight away.",
    ],
  },
  {
    id: "spiced-beef-houmous-naan", meal: "lunch", tags: ["Quick", "Middle Eastern"], name: "Spiced beef with houmous, naan and tomato salad", blurb: "Houmous spread on a plate and topped with hot cinnamon and chilli beef mince, with warm naan and a tomato salad.", servings: 2, minutes: 20,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in its spices; the onion in thin slices
    ingredients: [ing("houmous", 120), ing("beef-mince", 250), ing("onion", 150), ing("garlic", 10), ing("cinnamon", 1), ing("chilli-powder", 1), ing("salt", 1), ing("black-pepper", 1), ing("olive-oil", 15), ing("naan", 260), ing("tomatoes", 170), ing("lettuce", 60), ing("lemon-juice", 10)],
    method: [
      "Marinate the mince: Mix the beef with the cinnamon, chilli powder, salt, black pepper and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Get ready: Peel the onion and slice it thinly. Wash the tomatoes and lettuce, cut the tomatoes into wedges and shred the lettuce.",
      "Brown the mince: Heat the oil in a large non-stick frying pan on a high heat. Add the beef, press it flat and leave it for 3 minutes without stirring, until browned underneath.",
      "Add the onion: Break up the mince, add the onion and fry for 5 to 6 minutes, stirring now and then, until the beef is browned all over and the onion is soft and golden.",
      "Add the garlic: Stir in the rest of the garlic purée and cook for 2 minutes, until it smells toasty. The mince must be piping hot with no pink left.",
      "Warm the naans: Meanwhile, warm the naans under a hot grill or in a dry pan for 1 to 2 minutes on each side.",
      "Dress the salad: Toss the tomatoes and lettuce with the lemon juice.",
      "Serve: Spread the houmous over plates, spoon the hot beef into the middle and serve with the salad and the naans, torn into pieces.",
    ],
  },
  {
    id: "pad-thai-egg-noodles-broccoli", meal: "lunch", tags: ["Eggs", "Quick", "Thai"], name: "Pad thai-style noodles with egg and broccoli", blurb: "Noodles stir-fried with egg, broccoli and onion in a sweet, sour and salty sauce, scattered with chopped almonds.", servings: 2, minutes: 20,
    ingredients: [ing("noodles", 300), ing("eggs", 180), ing("broccoli", 200), ing("onion", 150), ing("garlic", 10), ing("soy", 30), ing("honey", 15), ing("lemon-juice", 20), ing("chilli-powder", 1), ing("almonds", 20), ing("olive-oil", 15)],
    method: [
      "Mix the sauce: Stir the soy sauce, honey, lemon juice and chilli powder together in a cup.",
      "Toast the almonds: Toast the almonds in a dry large frying pan or wok on a medium heat for 3 minutes, shaking the pan, until golden and they smell toasty. Tip them on to a board and chop them roughly.",
      "Get ready: Peel the onion and slice it thinly. Cut the broccoli into small florets.",
      "Fry the vegetables: Heat the oil in the pan on a high heat. Stir-fry the onion and broccoli for 3 to 4 minutes, until the broccoli is bright green and just tender. Stir in the garlic purée for 30 seconds.",
      "Scramble the eggs: Push the vegetables to one side. Crack the eggs into the space, picking out any shell, and stir for 1 to 2 minutes, until set. Wash your hands after touching raw eggs.",
      "Add the noodles: Loosen the noodles with your fingers and add them with the sauce. Toss everything together for 2 to 3 minutes, until the noodles are hot, glossy and brown.",
      "Serve: Pile the noodles into bowls and scatter the almonds on top.",
    ],
  },
  {
    id: "hot-sour-noodle-soup-ham-egg", meal: "lunch", tags: ["Soup", "Quick", "Chinese"], name: "Hot and sour noodle soup with ham, mushrooms and egg", blurb: "A peppery, tangy soy broth with mushrooms, strips of ham, noodles, spinach and soft ribbons of egg.", servings: 2, minutes: 20,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the ham soaks in soy and pepper; the egg sets in large soft pieces
    ingredients: [ing("ham", 100), ing("mushrooms", 200), ing("noodles", 300), ing("eggs", 120), ing("spinach", 60), ing("garlic", 5), ing("soy", 30), ing("honey", 5), ing("chilli-powder", 1), ing("black-pepper", 2), ing("lemon-juice", 20), ing("olive-oil", 10)],
    method: [
      "Get ready: Wipe the mushrooms clean and slice them thinly. Cut the ham into thin strips and toss them with 1 teaspoon of the soy sauce and half the black pepper. Rinse the spinach unless the bag says it is ready washed.",
      "Brown the mushrooms: Heat the oil in a large saucepan on a high heat. Spread out the mushrooms and leave them for 2 to 3 minutes, until golden underneath, then stir for 1 minute. Stir in the garlic purée for 30 seconds.",
      "Make the broth: Pour in 800 ml of boiling water from the kettle and scrape up the brown bits. Add the rest of the soy sauce and black pepper, the honey and the chilli powder, bring it to the boil and simmer for 3 minutes.",
      "Add the noodles: Loosen the noodles with your fingers and add them with the ham and spinach. Simmer for 2 minutes, until the noodles are hot.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell, and beat them with a fork. Wash your hands after touching raw eggs.",
      "Add the eggs: Keep the soup at a gentle bubble and pour in the eggs in a slow stream, without stirring. Leave them for 1 minute, until set, then break them gently into large soft pieces with a spoon.",
      "Serve: Take the pan off the heat and stir in the lemon juice, so the broth is tangy as well as peppery. Ladle the soup into warm bowls.",
    ],
  },
  {
    id: "smoked-salmon-poke-rice-bowl", meal: "lunch", tags: ["Bowl", "Fish", "No cook"], name: "Smoked salmon poke-style rice bowl", blurb: "Cool rice and peas topped with strips of smoked salmon, cucumber, lettuce and red onion, with a soy, honey and lemon dressing.", servings: 2, minutes: 20,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates in the dressing, poke style; raw red onion rings; dressing in lines
    ingredients: [ing("smoked-salmon", 120), ing("rice", 140), ing("peas", 100), ing("cucumber", 150), ing("lettuce", 60), ing("red-onion", 40), ing("soy", 20), ing("honey", 5), ing("lemon-juice", 15)],
    method: [
      "Make the dressing: Stir the soy sauce, honey and lemon juice together in a cup until the honey dissolves.",
      "Marinate the salmon: Cut the smoked salmon into strips about 2 cm wide and turn them in a third of the dressing. Leave them for 10 minutes, covered in the fridge, or for up to a few hours.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre. Add the peas for the last 3 minutes.",
      "Cool the rice: Drain the rice and peas in the sieve and rinse them under the cold tap until cold, so they cool quickly. Leave them to drain well.",
      "Get the vegetables ready: Wash the cucumber and lettuce. Cut the cucumber into small cubes and shred the lettuce. Peel the red onion and slice it into very thin rings.",
      "Serve: Toss the rice and peas with half the rest of the dressing and spoon them into bowls. Arrange the salmon, cucumber, lettuce and onion on top in neat piles and drizzle the last of the dressing over in thin lines. Eat it the same day.",
    ],
  },
  {
    id: "italian-rice-salad-tuna-egg", meal: "lunch", tags: ["Salad", "Fish", "Italian"], name: "Italian-style rice salad with tuna, egg and peas", blurb: "A summery rice salad with flaked tuna, peas, tomato, cucumber and boiled egg in a lemon and olive oil dressing.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the tuna soaks in the dressing; egg halves and tuna on top
    ingredients: [ing("rice", 140), ing("tuna", 160), ing("eggs", 120), ing("peas", 100), ing("tomatoes", 170), ing("cucumber", 100), ing("lemon-juice", 20), ing("olive-oil", 15), ing("oregano", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre. Add the peas for the last 3 minutes.",
      "Boil the eggs: Meanwhile, lower the eggs into a small pan of boiling water and simmer for 9 minutes, until the yolks are set. Cool them in cold water, then peel them and cut them in half lengthwise.",
      "Cool the rice: Drain the rice and peas in the sieve and rinse them under the cold tap until cold. Leave them to drain well.",
      "Get the salad ready: Wash the tomatoes and cucumber and cut them into small cubes.",
      "Make the dressing: Whisk the lemon juice, oil, oregano, salt and black pepper together in a large bowl, rubbing the oregano between your fingers as it goes in to bring out its smell.",
      "Marinate the tuna: Drain the tuna well, break it into large flakes and toss it gently in a small bowl with a third of the dressing. Leave it for 10 minutes while the rice soaks.",
      "Mix the salad: Add the rice, peas, tomatoes and cucumber to the rest of the dressing and toss gently until coated. Leave it for 10 minutes so the rice soaks up the dressing.",
      "Serve: Spoon the salad into bowls and lay the tuna and the egg halves on top. Keep any left over covered in the fridge and eat it the same day.",
    ],
  },
  {
    id: "nigerian-egg-stew-rice", meal: "lunch", tags: ["Eggs", "West African"], name: "Nigerian-style egg stew with rice", blurb: "Eggs scrambled into a rich tomato, pepper and onion stew with chilli and herbs, served with rice.", servings: 2, minutes: 30,
    // chef pass 2026-11-21: salt 1 -> 2 g
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): onion in half rings, pepper in strips, the egg in large soft pieces
    ingredients: [ing("eggs", 240), ing("chopped-tomatoes", 400), ing("peppers", 160), ing("onion", 150), ing("garlic", 10), ing("chilli-powder", 2), ing("mixed-herbs", 1), ing("salt", 2), ing("olive-oil", 15), ing("rice", 140)],
    method: [
      RICE,
      "Get ready: Meanwhile, peel the onion and slice it into half rings. Wash the pepper, take out the seeds and cut it into strips.",
      "Fry the base: Heat the oil in a large frying pan on a medium heat. Fry the onion and pepper with half the salt for 8 minutes, stirring now and then, until soft and sweet.",
      "Add the spices: Stir in the garlic purée, chilli powder and dried herbs and cook for 30 seconds, until they smell toasty.",
      "Simmer the stew: Add the chopped tomatoes, bring to a bubble and simmer without a lid for 12 to 15 minutes, stirring now and then, until thick and deep red, with a little oil showing at the edges.",
      "Beat the eggs: Crack the eggs into a bowl, picking out any shell, and beat them with the rest of the salt. Wash your hands after touching raw eggs.",
      "Cook the eggs: Pour the eggs into the stew and leave for 1 minute, then stir gently just 2 or 3 times over 2 to 3 minutes, until the egg is set in large soft pieces.",
      "Serve: Drain the rice well and spoon it on to plates with the egg stew beside it.",
    ],
  },
  {
    id: "vietnamese-salmon-noodle-salad", meal: "lunch", tags: ["Salad", "Fish", "Vietnamese"], name: "Vietnamese-style salmon noodle salad", blurb: "Cool noodles with lettuce and cucumber, topped with soy and honey salmon and a sweet, sour and spicy dressing.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates in its soy and honey glaze
    ingredients: [ing("salmon", 240), ing("soy", 20), ing("honey", 15), ing("noodles", 300), ing("cucumber", 150), ing("lettuce", 80), ing("lemon-juice", 30), ing("garlic", 5), ing("chilli-powder", 1), ing("olive-oil", 5)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and line a baking tray with foil.",
      "Get the salmon ready: Put the salmon on the tray, skin side down, and pat the top dry with kitchen paper. Wash your hands after touching raw fish.",
      "Marinate the salmon: Stir half the soy sauce with half the honey and brush half of this glaze over the fish. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Bake the salmon: Bake for 8 minutes, brush over the rest of the glaze and bake for 4 to 6 minutes more, until glossy and the fish is opaque and flakes easily with a fork. Leave it to cool for 5 minutes.",
      "Make the dressing: Stir the rest of the soy sauce and honey with the lemon juice, garlic purée, chilli powder and oil.",
      "Loosen the noodles: Put the noodles in a bowl, pour over boiling water from the kettle to cover and leave for 1 minute. Drain them and rinse under the cold tap until cool.",
      "Get the salad ready: Wash the cucumber and lettuce. Cut the cucumber into thin sticks and shred the lettuce.",
      "Serve: Toss the noodles with half the dressing and pile them into bowls with the lettuce and cucumber. Flake the salmon on top, leaving the skin behind, and spoon over the rest of the dressing.",
    ],
  },

  // ---- dinners
  {
    id: "chicken-katsu-style-curry-rice", meal: "dinner", tags: ["Japanese"], name: "Chicken katsu-style curry with rice", blurb: "Crisp breadcrumbed chicken, baked until golden, with a smooth, mildly spiced coconut curry sauce, rice and cucumber.", servings: 2, minutes: 45,
    // chef pass 2026-11-21: salt 1 g and black pepper 1 g on the chicken
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in salt, pepper and garlic before it is crumbed
    ingredients: [ing("chicken", 300), ing("salt", 1), ing("black-pepper", 1), ing("bread", 80), ing("eggs", 60), ing("olive-oil", 20), ing("onion", 150), ing("garlic", 10), ing("cumin", 2), ing("chilli-powder", 1), ing("cinnamon", 1), ing("chopped-tomato-puree", 15), ing("coconut-milk", 200), ing("honey", 10), ing("soy", 15), ing("rice", 140), ing("cucumber", 100)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7) and line a baking tray with foil.",
      "Prepare the chicken: Slice each chicken breast in half sideways, so it is thin and cooks evenly. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Rub both sides with the salt, black pepper and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Make the crumbs: Tear the bread into a food processor and blitz it to fine crumbs, or grate it on the coarse side of a grater.",
      "Toast the crumbs: Heat half the oil in a large frying pan on a medium heat. Add the crumbs and stir for 3 to 4 minutes, until golden, crisp and toasty. Tip them on to a plate to cool: toasted crumbs bake to a deep golden crust.",
      "Coat the chicken: Beat the egg in a shallow bowl, picking out any shell. Dip each piece of chicken in the egg, then press it firmly into the crumbs on both sides and lay it on the tray. Wash your hands after touching raw chicken and egg.",
      "Bake the chicken: Bake for 18 to 20 minutes, turning once, until crisp and deep golden on both sides.",
      RICE,
      "Soften the onion: Peel and chop the onion. Heat the rest of the oil in a saucepan on a medium heat and fry the onion for 8 minutes, stirring now and then, until soft, sweet and golden.",
      "Add the spices: Stir in the rest of the garlic purée, the cumin, chilli powder, cinnamon and tomato purée and cook for 1 minute, stirring, until they smell toasty.",
      "Make the sauce: Add the coconut milk, honey, soy sauce and 100 ml of water. Simmer for 8 to 10 minutes, until it coats the back of a spoon, then blend with a stick blender until smooth and glossy.",
      CHECK_CHICKEN,
      "Serve: Drain the rice well. Slice the chicken, lay it beside the rice and pour the curry sauce over one side. Serve with the cucumber, cut into sticks.",
    ],
  },
  {
    id: "korean-sticky-chicken-rice-broccoli", meal: "dinner", tags: ["Quick", "Korean"], name: "Korean-style sticky chicken with rice and broccoli", blurb: "Chicken thighs in a glossy garlic, soy, honey and chilli glaze, with rice, broccoli and cucumber.", servings: 2, minutes: 30,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in soy and garlic while the rice cooks
    ingredients: [ing("chicken-thigh", 300), ing("soy", 30), ing("honey", 20), ing("garlic", 10), ing("chilli-powder", 2), ing("chopped-tomato-puree", 15), ing("olive-oil", 15), ing("rice", 140), ing("broccoli", 200), ing("cucumber", 100)],
    method: [
      "Cut the chicken: Cut the chicken into bite-sized pieces and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with 1 tablespoon of the soy sauce and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      RICE,
      "Mix the sauce: Meanwhile, stir the rest of the soy sauce and garlic purée with the honey, chilli powder and tomato purée in a cup with 2 tablespoons of water.",
      "Brown the chicken: Heat the oil in a large non-stick frying pan on a high heat. Lay the chicken in one layer with space between the pieces (two batches if your pan is small) and leave it for 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the pieces and fry for 4 to 5 minutes more, turning now and then, until golden on all sides. If you fried two batches, put it all back in the pan.",
      "Cook the broccoli: Cut the broccoli into florets and boil it in a pan of water for 3 to 4 minutes, until bright green and just tender, no longer, or it goes dark and soft. Drain it.",
      "Glaze the chicken: Turn the heat to medium and pour the sauce over the chicken. Let it bubble for 1 to 2 minutes, tossing, until thick, glossy, deep red-brown and sticky on every piece. Add a splash of water if it gets too thick.",
      CHECK_CHICKEN,
      "Serve: Drain the rice well and spoon it into bowls with the chicken and broccoli. Slice the cucumber thinly and add it to the side.",
    ],
  },
  {
    id: "sweet-sour-chicken-rice", meal: "dinner", tags: ["Chinese"], name: "Sweet and sour chicken with rice", blurb: "Golden chicken, pepper and onion in a glossy sweet and sour tomato sauce, served with rice.", servings: 2, minutes: 30,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in soy and garlic; onion wedges and pepper squares; a brighter sauce
    ingredients: [ing("chicken", 300), ing("peppers", 160), ing("onion", 150), ing("garlic", 5), ing("chopped-tomato-puree", 30), ing("honey", 20), ing("soy", 20), ing("lemon-juice", 20), ing("olive-oil", 15), ing("rice", 140)],
    method: [
      "Cut the chicken: Cut the chicken into bite-sized pieces and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with 2 teaspoons of the soy sauce and the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      RICE,
      "Get ready: Meanwhile, peel the onion and cut it into wedges. Wash the pepper, take out the seeds and cut it into 2.5 cm squares.",
      "Mix the sauce: Stir the tomato purée, honey, the rest of the soy sauce, the lemon juice and 4 tablespoons of water together in a jug until smooth.",
      "Brown the chicken: Heat the oil in a large non-stick frying pan or wok on a high heat. Lay the chicken in one layer with space between the pieces (two batches if your pan is small). Leave it for 2 to 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the pieces and fry for 2 to 3 minutes more, until golden all over. Lift the chicken on to a clean plate.",
      "Add the vegetables: Add the onion and pepper to the pan and stir-fry for 3 to 4 minutes, until just tender and catching at the edges. Add a splash of water if the pan gets dry.",
      "Add the sauce: Turn the heat to medium. Tip the chicken and any juices back in and pour in the sauce. Let it bubble for 1 to 2 minutes, stirring, until thick, glossy and orange-red and coating everything. Add a splash of water if it gets sticky.",
      CHECK_CHICKEN,
      "Serve: Drain the rice well, spoon it on to warm plates and spoon the sweet and sour chicken beside it.",
    ],
  },
  {
    id: "tandoori-chicken-rice-raita", meal: "dinner", tags: ["Indian"], name: "Tandoori-style chicken with rice and cucumber raita", blurb: "Chicken thighs roasted in a spiced yogurt marinade until charred, with rice, cucumber raita and red onion.", servings: 2, minutes: 45,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the fridge line on the marinade; the raita with cubed cucumber
    ingredients: [ing("chicken-thigh", 300), ing("natural-yogurt", 150), ing("lemon-juice", 15), ing("garlic", 10), ing("cumin", 2), ing("chilli-powder", 2), ing("cinnamon", 1), ing("chopped-tomato-puree", 15), ing("salt", 1), ing("olive-oil", 10), ing("rice", 140), ing("cucumber", 150), ing("red-onion", 40)],
    method: [
      "Mix the marinade: Stir half the yogurt with the lemon juice, garlic purée, cumin, chilli powder, cinnamon, tomato purée and half the salt until smooth and evenly coloured.",
      "Marinate the chicken: Slash the chicken and coat it, working the marinade into the cuts. Leave it for 15 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands after touching raw chicken.",
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7). Line a baking tray with foil and brush it with the oil.",
      "Roast the chicken: Lift the chicken out of the bowl, letting the extra marinade drip off, and lay it on the tray with space between the pieces. Roast on the top shelf for 20 to 25 minutes, turning once, until charred at the edges.",
      "Char the edges: For deeper colour, put the tray under a hot grill for 2 to 3 minutes at the end, until the edges blacken in spots.",
      RICE,
      "Make the raita: Cut the cucumber into small cubes, about 1 cm, and stir them into the rest of the yogurt with the rest of the salt.",
      "Slice the onion: Peel the red onion and slice it into very thin rings.",
      CHECK_CHICKEN,
      "Serve: Drain the rice well and serve it with the chicken, the raita and the onion rings on the side.",
    ],
  },
  {
    id: "moroccan-chicken-tagine-rice", meal: "dinner", tags: ["Batch cook", "Moroccan"], name: "Moroccan-style chicken tagine with rice", blurb: "Chicken thighs simmered with onion, cumin, cinnamon, tomato and honey, finished with spinach and lemon, with rice and toasted almonds.", servings: 4, minutes: 50,
    // chef pass 2026-11-21: oil 15 -> 20 ml to brown 600 g of chicken in two batches
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in its spices, garlic and lemon
    ingredients: [ing("chicken-thigh", 600), ing("onion", 300), ing("garlic", 15), ing("cumin", 3), ing("cinnamon", 2), ing("chilli-powder", 1), ing("chopped-tomatoes", 400), ing("honey", 15), ing("salt", 1), ing("spinach", 120), ing("lemon-juice", 20), ing("almonds", 40), ing("olive-oil", 20), ing("rice", 280)],
    method: [
      "Cut the chicken: Cut the chicken into large chunks and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with half the salt, cumin, cinnamon and garlic purée and 1 tablespoon of the lemon juice. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Slice the onions: Meanwhile, peel the onions and slice them.",
      "Brown the chicken: Heat the oil in a large saucepan or casserole dish on a medium-high heat. Brown the chicken in two batches, leaving each for 3 minutes a side without stirring, until golden. Lift it out on to a plate.",
      "Soften the onions: Fry the onions in the same pan for 10 minutes, stirring now and then and scraping up the brown bits, until soft, sweet and golden.",
      "Add the spices: Stir in the chilli powder and the rest of the garlic purée, cinnamon and cumin for 30 seconds, until fragrant.",
      "Simmer the tagine: Put the chicken back with its juices, the chopped tomatoes, honey, the rest of the salt and 200 ml of water. Cover and simmer gently for 20 minutes, stirring now and then.",
      "Thicken the sauce: Take the lid off and simmer for 5 to 10 minutes more, stirring now and then, until the sauce is thick, rich and orange-red and coats the chicken.",
      RICE,
      "Toast the almonds: Toast the almonds in a dry frying pan on a medium heat for 3 to 4 minutes, until golden and they smell toasty, then chop them roughly.",
      "Finish the sauce: Stir the spinach and the rest of the lemon juice into the tagine and cook for 2 minutes, until the spinach wilts.",
      CHECK_CHICKEN,
      `Serve: Drain the rice well, spoon the tagine over it and scatter the almonds on top. ${KEEP_RICE}`,
    ],
  },
  {
    id: "jollof-rice-chicken", meal: "dinner", tags: ["Batch cook", "One pot", "West African"], name: "Jollof rice with chicken", blurb: "Rice cooked in a rich, spiced tomato, pepper and onion sauce with browned chicken thighs, West African style.", servings: 4, minutes: 60,
    // the rice cooks in the method's own 500 ml of water and the sauce, so fitting leaves it as written
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in salt, pepper, garlic, chilli and herbs; herbs over the top
    ingredients: [ing("chicken-thigh", 500), ing("rice", 280, { fit: [1, 1] }), ing("chopped-tomatoes", 400), ing("chopped-tomato-puree", 30), ing("peppers", 160), ing("onion", 300), ing("garlic", 15), ing("chilli-powder", 2), ing("mixed-herbs", 2), ing("salt", 2), ing("black-pepper", 1), ing("olive-oil", 15)],
    method: [
      "Cut the chicken: Cut the chicken into large chunks and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with half the salt, garlic purée, chilli powder and dried herbs, and the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Blend the base: Peel the onions and roughly chop one of them. Wash the pepper, take out the seeds and chop it. Blend the chopped onion and pepper with the chopped tomatoes until smooth.",
      "Brown the chicken: Heat the oil in a large heavy saucepan with a lid on a high heat. Lay in half the chicken with space between the pieces and leave it for 3 minutes without stirring, until golden brown underneath.",
      "Turn the chicken: Turn the pieces and fry for 2 to 3 minutes more, until golden on the other side. Lift them on to a plate and brown the rest the same way.",
      "Fry the onion: Slice the other onion and fry it on a medium heat for 6 minutes, until soft and golden. Stir in the tomato purée, the rest of the garlic purée and chilli powder, and most of the rest of the herbs for 2 minutes.",
      "Cook the sauce: Pour in the blended tomato mix and the rest of the salt. Simmer for 10 to 15 minutes, stirring often, until thick and a deep red, with a little oil showing at the edges.",
      "Add the rice: Rinse the rice in a sieve under the cold tap. Stir it into the sauce with 500 ml of boiling water from the kettle. Lay the chicken and any juices on top, browned side up.",
      "Cook the rice: Bring it to a bubble, cover tightly and cook on a very low heat for 25 minutes, without stirring, until the rice is soft and the liquid has been absorbed.",
      CHECK_CHICKEN,
      "Serve: Lift off the chicken, fluff up the rice with a fork and spoon it into bowls. Put the chicken on top and scatter the last pinch of dried herbs over it.",
      `Keep leftovers: ${KEEP_RICE}`,
    ],
  },
  {
    id: "chicken-peanut-stew-rice", meal: "dinner", tags: ["Batch cook", "West African"], name: "Chicken and peanut stew with rice", blurb: "A West African-style stew of chicken thighs in a rich peanut, tomato and chilli sauce with spinach, served with rice.", servings: 4, minutes: 50,
    // chef pass 2026-11-21: oil 15 -> 20 ml to brown the chicken in two batches
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in salt, cumin and garlic
    ingredients: [ing("chicken-thigh", 500), ing("peanut-butter", 80), ing("chopped-tomatoes", 400), ing("onion", 300), ing("garlic", 15), ing("chilli-powder", 2), ing("cumin", 2), ing("spinach", 160), ing("salt", 1), ing("olive-oil", 20), ing("rice", 280)],
    method: [
      "Cut the chicken: Cut the chicken into bite-sized pieces and pat them dry with kitchen paper. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Toss it with half the salt, cumin and garlic purée and 1 teaspoon of the oil. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Get ready: Meanwhile, peel and chop the onions.",
      "Brown the chicken: Heat the rest of the oil in a large saucepan on a medium-high heat. Brown the chicken in two batches, leaving each for 3 minutes without stirring, then turning it, until golden all over. Lift it out on to a plate.",
      "Soften the onions: Fry the onions in the same pan for 8 to 10 minutes, stirring now and then and scraping up the brown bits, until soft and golden.",
      "Add the spices: Stir in the chilli powder and the rest of the garlic purée and cumin for 30 seconds, until fragrant.",
      "Make the sauce: Stir in the chopped tomatoes, the peanut butter, the rest of the salt and 300 ml of water until the peanut butter melts into the sauce.",
      "Simmer the stew: Put the chicken back, cover and simmer gently for 15 minutes, stirring now and then so it doesn't stick. Then take the lid off and simmer for 5 minutes more, until the sauce is thick and creamy.",
      RICE,
      "Add the spinach: Stir the spinach into the stew and cook for 2 minutes, until wilted and the sauce coats the back of a spoon.",
      CHECK_CHICKEN,
      `Serve: Drain the rice well and serve the stew spooned over it. ${KEEP_RICE}`,
    ],
  },
  {
    id: "jamaican-brown-stew-chicken-rice", meal: "dinner", tags: ["Batch cook", "Caribbean"], name: "Jamaican-style brown stew chicken with rice", blurb: "Chicken thighs browned in dark honey and soy, then stewed with pepper, onion, tomato, garlic and herbs into a rich gravy, with rice.", servings: 4, minutes: 55,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): whole thighs, as in the picture; the fridge line on the marinade
    ingredients: [ing("chicken-thigh", 600), ing("soy", 30), ing("garlic", 15), ing("mixed-herbs", 2), ing("chilli-powder", 1), ing("black-pepper", 2), ing("honey", 20), ing("onion", 150), ing("peppers", 160), ing("tomatoes", 170), ing("chopped-tomato-puree", 15), ing("olive-oil", 15), ing("rice", 280)],
    method: [
      "Marinate the chicken: Keep the thighs whole. Mix them with the soy sauce, garlic purée, dried herbs, chilli powder and black pepper. Leave them for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Get ready: Peel the onion and slice it. Wash the pepper and the tomatoes. Take the seeds out of the pepper and cut it into strips, then cut the tomatoes into chunks.",
      "Darken the honey: Heat the oil in a large saucepan on a medium heat. Add the honey and let it bubble for about 1 minute, until it turns a deep amber, without letting it burn.",
      "Brown the chicken: Lift half the chicken out of its marinade into the pan, keeping the marinade; it will spit, so stand back. Fry for 4 minutes a side, without moving it, until dark golden brown. Lift it out and brown the rest.",
      "Add the vegetables: Put all the chicken back. Add the onion, pepper and tomatoes and fry for 3 minutes. Stir in the tomato purée, the rest of the marinade and 300 ml of water, scraping up the brown bits.",
      "Simmer the stew: Cover and simmer gently for 25 minutes, turning the chicken now and then. Then take the lid off and simmer for 5 minutes more, until the chicken is tender and the gravy is thick, glossy and dark brown.",
      RICE,
      CHECK_CHICKEN,
      `Serve: Drain the rice well, spoon it into wide bowls and spoon the stew and its gravy beside it. ${KEEP_RICE}`,
    ],
  },
  {
    id: "chicken-parmigiana-spaghetti", meal: "dinner", tags: ["Pasta", "Italian"], name: "Chicken parmigiana-style with spaghetti", blurb: "Crumbed chicken baked under a garlic tomato sauce and melted mozzarella, with spaghetti in the same sauce.", servings: 2, minutes: 40,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): one opened-out escalope, marinated in egg, garlic and pepper; oregano over the cheese
    ingredients: [ing("chicken", 300), ing("bread", 40), ing("oregano", 1), ing("eggs", 60), ing("olive-oil", 15), ing("garlic", 10), ing("passata", 300), ing("black-pepper", 1), ing("mozzarella", 125), ing("pasta-long", 160)],
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7) and line a baking tray with foil.",
      "Prepare the chicken: Cut each chicken breast almost in half sideways and open it out like a book, so it is thin and even. Wash your hands, the board and the knife after touching raw chicken.",
      "Marinate the chicken: Beat the egg in a shallow dish with half the garlic purée and the black pepper, and turn the chicken in it. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Make the crumbs: Blitz or grate the bread into fine crumbs.",
      "Toast the crumbs: Heat half the oil in a frying pan on a medium heat and stir the crumbs for 3 minutes, until golden and crisp. Tip them on to a plate and mix in half the oregano.",
      "Coat the chicken: Lift each piece out of the egg and press it firmly into the crumbs on both sides. Wash your hands after touching raw chicken and egg.",
      "Bake the chicken: Lay the chicken on the tray with space between the pieces and bake for 15 minutes, until crisp and golden.",
      "Make the sauce: Heat the rest of the oil in a saucepan on a medium heat. Stir in the rest of the garlic purée for 30 seconds, until fragrant, then add the passata and most of the rest of the oregano. Simmer for 10 minutes, until thick.",
      "Cook the spaghetti: Meanwhile, cook the spaghetti in a large pan of boiling water for 10 to 12 minutes, until tender.",
      "Top the chicken: Spoon a little sauce over each piece of chicken. Pat the mozzarella dry with kitchen paper, tear it over the top, scatter over the last pinch of oregano and bake for 8 to 10 minutes more, until bubbling and browned in spots.",
      CHECK_CHICKEN,
      "Serve: Drain the spaghetti, toss it with the rest of the sauce and serve it with the chicken on top.",
    ],
  },
  {
    id: "peri-peri-chicken-spicy-rice", meal: "dinner", tags: ["Portuguese"], name: "Peri peri-style chicken with spicy rice and salad", blurb: "Grilled chicken in a hot lemon, garlic and chilli marinade, with tomato and pea rice and a crisp salad.", servings: 2, minutes: 40,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the fridge line on the marinade
    ingredients: [ing("chicken", 300), ing("lemon-juice", 30), ing("garlic", 10), ing("chilli-powder", 3), ing("oregano", 1), ing("salt", 1), ing("olive-oil", 15), ing("rice", 140), ing("peas", 100), ing("onion", 75), ing("chopped-tomato-puree", 15), ing("lettuce", 80), ing("tomatoes", 170), ing("cucumber", 100)],
    method: [
      "Mix the marinade: Stir most of the lemon juice with the garlic purée, most of the chilli powder, the oregano, half the salt and half the oil.",
      "Marinate the chicken: Slice each chicken breast in half sideways and coat it well in the marinade. Leave it for 15 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands, the board and the knife.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre. Add the peas for the last 3 minutes.",
      "Grill the chicken: Heat the grill to high and line a tray with foil. Grill the chicken for 6 to 7 minutes on each side, until charred at the edges and speckled red.",
      CHECK_CHICKEN,
      "Fry the onion: Peel and finely chop the onion. Heat the rest of the oil in a frying pan and fry it for 5 minutes, until soft and sweet.",
      "Add the purée: Stir in the tomato purée, the rest of the chilli powder and the rest of the salt for 1 minute, until the purée darkens.",
      "Make the spicy rice: Drain the rice and peas well, tip them into the pan and stir for 2 minutes, until orange-red, coated and hot.",
      "Make the salad: Wash the lettuce, tomatoes and cucumber. Shred the lettuce, cut the tomatoes into wedges, slice the cucumber and toss them with the rest of the lemon juice.",
      "Serve: Spoon the spicy rice on to plates with the chicken and the salad beside it.",
    ],
  },
  {
    id: "rendang-beef-curry-rice", meal: "dinner", tags: ["Batch cook", "Malaysian"], name: "Rendang-style beef curry with rice", blurb: "Beef mince slowly cooked down in coconut milk with onion, garlic, chilli and cinnamon until rich and dark, with rice and broccoli.", servings: 4, minutes: 55,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in the soy and cinnamon
    ingredients: [ing("beef-mince", 500), ing("coconut-milk", 400), ing("onion", 300), ing("garlic", 15), ing("chilli-powder", 3), ing("cinnamon", 2), ing("cumin", 2), ing("honey", 10), ing("soy", 15), ing("salt", 1), ing("lemon-juice", 20), ing("olive-oil", 15), ing("rice", 280), ing("broccoli", 300)],
    method: [
      "Marinate the mince: Mix the beef with the soy sauce and half the cinnamon. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands after touching raw meat.",
      "Make the paste: Peel and roughly chop the onions. Blend them with the garlic purée to a rough paste, or chop them very finely.",
      "Brown the mince: Heat the oil in a large saucepan on a high heat. Add the beef, press it flat and leave it for 3 to 4 minutes without stirring, until browned underneath.",
      "Crisp the mince: Break it up and fry for 3 to 4 minutes more, until the liquid has gone and it is browned all over. Lift it out with a slotted spoon, leaving the fat behind.",
      "Fry the paste: Turn the heat to medium. Fry the onion paste in the fat for 8 minutes, stirring often, until soft and golden.",
      "Add the spices: Stir in the chilli powder, the cumin and the rest of the cinnamon for 30 seconds, until fragrant.",
      "Simmer the curry: Put the mince back, pour in the coconut milk and add the honey and salt. Simmer without a lid for 25 minutes, stirring often, until thick and nearly dry.",
      "Darken the curry: Keep cooking for 5 minutes more, stirring all the time so it doesn't catch, until the oil comes out and the curry fries in it and turns a deep, glossy brown.",
      RICE,
      "Cook the broccoli: Cut the broccoli into florets and boil it for 3 to 4 minutes, until bright green and just tender. Drain it.",
      "Finish the curry: Stir in the lemon juice. The mince must be piping hot all the way through with no pink left.",
      `Serve: Drain the rice well and serve it with the curry and the broccoli. ${KEEP_RICE}`,
    ],
  },
  {
    id: "moroccan-meatballs-tomato-baked-eggs", meal: "dinner", tags: ["Eggs", "One pan", "Moroccan"], name: "Moroccan-style meatballs in tomato sauce with baked eggs", blurb: "Cinnamon and chilli beef meatballs simmered in tomato sauce with eggs baked on top, with warm naan.", servings: 4, minutes: 45,
    // chef pass 2026-11-21: salt 1 -> 3 g, half in the meatballs
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the meatball mix marinates before rolling
    ingredients: [ing("beef-mince", 500), ing("onion", 150), ing("garlic", 15), ing("cinnamon", 1), ing("chilli-powder", 2), ing("salt", 3), ing("black-pepper", 1), ing("olive-oil", 15), ing("chopped-tomatoes", 800), ing("eggs", 240), ing("naan", 520)],
    method: [
      "Get ready: Peel the onion and grate it or chop it very finely.",
      "Mix the meatballs: Put the beef in a bowl with half the onion, half the garlic purée, the cinnamon, half the salt and the black pepper. Mix well with your hands for 1 minute, until it holds together.",
      "Marinate the mince: Wash your hands. Leave the mixture for 10 minutes so the spices soak in, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Roll the meatballs: Roll the mixture into small balls, about the size of a walnut. Wash your hands after touching raw meat.",
      "Brown the meatballs: Heat the oil in a large deep frying pan with a lid on a medium-high heat. Fry the meatballs in one layer (two batches if your pan is small) for 5 minutes, turning only when they come away easily, until browned all over.",
      "Make the sauce: Lift the meatballs out on to a plate. Fry the rest of the onion in the pan for 4 to 5 minutes, until soft and sweet. Stir in the rest of the garlic purée and the chilli powder for 30 seconds.",
      "Simmer the sauce: Add the chopped tomatoes and the rest of the salt, bring to a bubble and simmer for 10 to 12 minutes, until thick.",
      "Cook the meatballs: Put the meatballs back in the sauce, cover and simmer for 10 minutes, turning them once.",
      "Add the eggs: Make small hollows in the sauce and crack an egg into each one, picking out any shell. Wash your hands after touching raw eggs.",
      "Cook the eggs: Cover and cook on a low heat for 6 to 8 minutes, until the egg whites are completely set and the meatballs are piping hot with no pink inside.",
      "Warm the naans: Meanwhile, warm the naans under a hot grill or in a dry pan for 1 to 2 minutes on each side.",
      "Serve: Spoon the meatballs, eggs and sauce on to plates and serve with the naans, torn into pieces.",
    ],
  },
  {
    id: "pastitsio-beef-pasta-bake", meal: "dinner", tags: ["Bake", "Batch cook", "Greek"], name: "Pastitsio-style beef and pasta bake", blurb: "A Greek-style bake of pasta and cinnamon beef in tomato sauce under a golden egg, milk and cheese topping.", servings: 4, minutes: 70,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in cinnamon, salt and garlic
    ingredients: [ing("beef-mince", 500), ing("onion", 150), ing("garlic", 10), ing("cinnamon", 2), ing("oregano", 1), ing("chopped-tomato-puree", 30), ing("chopped-tomatoes", 400), ing("salt", 1), ing("olive-oil", 15), ing("pasta-shapes", 300), ing("eggs", 120), ing("milk", 400), ing("cheddar", 60), ing("black-pepper", 1), ing("spinach", 160)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6).",
      "Marinate the mince: Mix the beef with the cinnamon, the salt and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands after touching raw meat.",
      "Brown the mince: Peel and chop the onion. Heat the oil in a large saucepan on a high heat. Add the beef, press it flat and leave it for 3 minutes without stirring, until browned underneath.",
      "Add the onion: Break up the mince, add the onion and fry for 5 minutes, stirring now and then, until the beef is browned all over and the onion is soft and golden.",
      "Make the sauce: Stir in the rest of the garlic purée, the oregano and the tomato purée for 1 minute, until the purée darkens, then add the chopped tomatoes. Simmer for 15 minutes, until thick and rich.",
      "Cook the pasta: Meanwhile, cook the pasta in a large pan of boiling water for 8 minutes, until nearly tender. Drain it well.",
      "Make the topping: Grate the cheddar. Crack the eggs into a jug, picking out any shell, and beat them with the milk, half the cheese and a grind of black pepper. Wash your hands after touching raw eggs.",
      "Layer the bake: Spread the pasta in a large ovenproof dish and spoon the meat sauce over it. Pour the egg topping evenly over the top and scatter with the rest of the cheese.",
      "Bake: Bake for 30 to 35 minutes, until the topping is puffed, set and golden brown. The middle must be piping hot all the way through.",
      "Wilt the spinach: Just before serving, put the spinach in a large pan with a splash of water and stir for 2 minutes, until soft. Drain it well.",
      `Serve: Leave the bake for 10 minutes, then cut it into squares and serve with the spinach. ${KEEP}`,
    ],
  },
  {
    id: "beef-enchilada-rice-bake", meal: "dinner", tags: ["Bake", "Batch cook", "Mexican"], name: "Beef enchilada-style rice bake", blurb: "Fajita-spiced beef and tomato baked with rice and sweetcorn under salsa and melted cheddar, with cool yogurt.", servings: 4, minutes: 50,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince marinates in fajita seasoning and garlic
    ingredients: [ing("beef-mince", 400), ing("onion", 150), ing("garlic", 10), ing("fajita-seasoning", 20), ing("chopped-tomatoes", 400), ing("olive-oil", 15), ing("rice", 240), ing("sweetcorn", 150), ing("salsa", 200), ing("cheddar", 80), ing("natural-yogurt", 100), ing("lettuce", 100)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6).",
      "Marinate the mince: Mix the beef with half the fajita seasoning and half the garlic purée. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands after touching raw meat.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre. Add the sweetcorn for the last 3 minutes.",
      "Brown the mince: Meanwhile, peel and chop the onion. Heat the oil in a large frying pan on a high heat. Add the beef, press it flat and leave it for 3 minutes without stirring, until browned underneath.",
      "Add the onion: Break up the mince, add the onion and fry for 5 minutes, stirring now and then, until the beef is browned all over and the onion is soft.",
      "Make the sauce: Stir in the rest of the garlic purée and fajita seasoning for 30 seconds, until they smell toasty, then add the chopped tomatoes. Simmer for 10 minutes, until thick. The mince must be piping hot with no pink left.",
      "Mix the bake: Drain the rice and sweetcorn well and stir them into the beef sauce. Spread it in a large ovenproof dish.",
      "Top with cheese: Grate the cheddar. Spoon the salsa over the rice and scatter the cheese on top.",
      "Bake: Bake for 20 minutes, until the cheese has melted and is bubbling and golden in patches.",
      "Get the lettuce ready: Wash the lettuce, shake it dry and shred it.",
      `Serve: Serve the bake with the lettuce and a spoonful of yogurt on top. ${KEEP_RICE}`,
    ],
  },
  {
    id: "swedish-meatballs-pasta-peas", meal: "dinner", tags: ["Batch cook", "Swedish"], name: "Swedish-style meatballs in creamy gravy with pasta and peas", blurb: "Small beef meatballs in a creamy mustard and soy gravy, with pasta shapes and peas.", servings: 4, minutes: 45,
    // chef pass 2026-11-21: salt 1 -> 3 g in the meatballs
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the meatball mix marinates before rolling
    ingredients: [ing("beef-mince", 500), ing("onion", 150), ing("salt", 3), ing("black-pepper", 1), ing("olive-oil", 15), ing("pasta-shapes", 300), ing("peas", 320), ing("soft-cheese", 100), ing("milk", 300), ing("soy", 15), ing("mustard", 10)],
    method: [
      "Get ready: Peel the onion and grate it or chop it very finely.",
      "Mix the meatballs: Put the beef and onion in a bowl, add the salt and black pepper and mix well with your hands for 1 minute, until it holds together.",
      "Marinate the mince: Wash your hands. Leave the mixture for 10 minutes so the seasoning soaks in, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Roll the meatballs: Roll the mixture into small balls, about the size of a walnut, pressing them firmly. Wash your hands after touching raw meat.",
      "Brown the meatballs: Heat the oil in a large deep frying pan on a medium-high heat. Fry the meatballs in one layer for 8 to 10 minutes, turning every 2 minutes, until deep brown all over. If they don't all fit, brown them in two batches.",
      "Cook the pasta: Meanwhile, cook the pasta in a large pan of boiling water for 10 to 12 minutes, until tender. Add the peas for the last 3 minutes.",
      "Make the gravy: Put all the meatballs back in the pan and turn the heat down to low. Add 3 tablespoons of water and scrape up the brown bits, then stir in the soft cheese, milk, soy sauce and mustard until smooth and pale brown.",
      "Simmer: Simmer gently for 5 to 8 minutes, turning the meatballs now and then, until the gravy is creamy and coats the back of a spoon.",
      "Check the meatballs: Cut one of the biggest open. It must be piping hot all the way through with no pink left. Simmer a little longer if not.",
      `Serve: Drain the pasta and peas and serve them with the meatballs and gravy. ${KEEP}`,
    ],
  },
  {
    id: "jerk-salmon-coconut-rice", meal: "dinner", tags: ["Fish", "Caribbean"], name: "Jerk-style salmon with coconut rice", blurb: "Salmon baked under a hot, sweet jerk-style paste of herbs, cinnamon, chilli and garlic, with coconut rice and broccoli.", servings: 2, minutes: 35,
    // the rice cooks in the coconut milk and the method's own 160 ml of water, so fitting leaves it as written
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates under its jerk paste
    ingredients: [ing("salmon", 240), ing("mixed-herbs", 1), ing("cinnamon", 1), ing("chilli-powder", 2), ing("garlic", 5), ing("honey", 10), ing("soy", 10), ing("lemon-juice", 15), ing("black-pepper", 1), ing("olive-oil", 5), ing("rice", 140, { fit: [1, 1] }), ing("coconut-milk", 160), ing("salt", 1), ing("broccoli", 200)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and line a baking tray with foil.",
      "Make the jerk paste: Stir the dried herbs, cinnamon, chilli powder, garlic purée, honey, soy sauce, half the lemon juice and the black pepper together in a bowl to a thick paste.",
      "Coat the salmon: Pat the salmon dry with kitchen paper and put it on the tray, skin side down. Spread the jerk paste thickly over the top. Wash your hands after touching raw fish.",
      "Marinate the salmon: Leave it for 10 minutes while you start the rice, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Start the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan with the coconut milk, the salt and 160 ml of water and bring it to the boil.",
      "Cook the rice: Cover, turn the heat to very low and cook for 12 to 15 minutes, until the liquid has been absorbed and the rice is soft. Leave it covered off the heat.",
      "Bake the salmon: Meanwhile, drizzle the salmon with the oil and bake for 12 to 15 minutes, until the crust is dark red-brown and glossy and the fish is opaque and flakes easily with a fork.",
      "Cook the broccoli: Cut the broccoli into florets and boil it for 3 to 4 minutes, until bright green and just tender, no longer, or it goes dark and soft. Drain it.",
      "Serve: Fluff up the rice with a fork and spoon it on to plates with the salmon and broccoli. Drizzle the rest of the lemon juice over the fish.",
    ],
  },
  {
    id: "creamy-cajun-salmon-pasta", meal: "dinner", tags: ["Pasta", "Fish", "Cajun"], name: "Creamy Cajun-style salmon pasta", blurb: "Pasta and flakes of spiced salmon in a creamy garlic and tomato sauce with spinach and a kick of chilli.", servings: 2, minutes: 25,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates in its spice rub; large chunks
    ingredients: [ing("salmon", 240), ing("pasta-shapes", 160), ing("chilli-powder", 2), ing("oregano", 1), ing("black-pepper", 1), ing("olive-oil", 15), ing("garlic", 10), ing("tomatoes", 170), ing("soft-cheese", 100), ing("milk", 150), ing("salt", 1), ing("spinach", 100)],
    method: [
      "Spice the salmon: Pat the salmon dry with kitchen paper. Mix half the chilli powder with the oregano, half the salt, a good grind of black pepper and 1 teaspoon of the oil, and rub it over the top. Wash your hands after touching raw fish.",
      "Marinate the salmon: Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Cook the pasta: Meanwhile, cook the pasta in a large pan of boiling water for 10 to 12 minutes, until tender.",
      "Fry the salmon: Heat the rest of the oil in a large non-stick frying pan on a medium-high heat. Fry the salmon spiced side down for 3 minutes, until a dark crust forms. Turn it and cook for 3 to 4 minutes more, until it flakes easily.",
      "Break up the salmon: Lift the salmon on to a plate, peel off the skin and break the fish into large chunks.",
      "Start the sauce: Wash the tomatoes and chop them. Fry them in the pan with the garlic purée and the rest of the chilli powder for 3 to 4 minutes, until soft and jammy.",
      "Make it creamy: Stir in the soft cheese, milk and the rest of the salt until smooth and pale orange and simmer for 2 minutes, until it coats the back of a spoon. Add the spinach and stir until it wilts.",
      "Mix together: Drain the pasta, keeping a cup of its water. Stir the pasta into the sauce, loosening it with a splash of the pasta water if it is too thick.",
      "Serve: Fold in the salmon gently and spoon the pasta into warm bowls.",
    ],
  },
  {
    id: "salmon-pea-paella-rice", meal: "dinner", tags: ["Fish", "One pan", "Spanish"], name: "Salmon and pea paella-style rice", blurb: "Rice cooked with pepper, onion, garlic and tomato, with chunks of salmon and peas steamed on top and a squeeze of lemon.", servings: 2, minutes: 40,
    // the rice cooks in the method's own 400 ml of water, so fitting leaves it as written
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates in lemon, salt and pepper; the onion in thin half rings
    ingredients: [ing("salmon", 240), ing("rice", 140, { fit: [1, 1] }), ing("onion", 150), ing("peppers", 160), ing("garlic", 10), ing("chilli-powder", 1), ing("chopped-tomatoes", 200), ing("peas", 120), ing("salt", 1), ing("black-pepper", 1), ing("lemon-juice", 15), ing("olive-oil", 15)],
    method: [
      "Get ready: Peel the onion and slice it into thin half rings. Wash the pepper, take out the seeds and slice it. Cut the salmon into large chunks, leaving the skin behind. Wash your hands after touching raw fish.",
      "Marinate the salmon: Toss it with half the lemon juice, half the salt and the black pepper. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes).",
      "Fry the vegetables: Heat the oil in a large deep frying pan on a medium heat. Fry the onion and pepper with the rest of the salt for 8 minutes, until soft and sweet. Stir in the garlic purée and chilli powder for 30 seconds.",
      "Add the tomatoes: Stir in the chopped tomatoes and cook for 3 to 4 minutes, until thick and a deeper red.",
      "Add the rice: Rinse the rice in a sieve under the cold tap. Stir it into the pan with 400 ml of boiling water from the kettle, until every grain is coated.",
      "Cook the rice: Simmer gently for 12 minutes, without stirring, until most of the liquid has been absorbed.",
      "Add the fish and peas: Scatter the peas over the rice and press the salmon chunks into it. Cover with a lid or foil and cook for 6 to 8 minutes more.",
      "Check the fish: The salmon must be opaque and flake easily, and the rice soft. Cook for a few minutes longer if not.",
      "Serve: Drizzle over the rest of the lemon juice and serve straight from the pan.",
    ],
  },
  {
    id: "salmon-pea-lemon-risotto", meal: "dinner", tags: ["Fish", "Italian"], name: "Salmon, pea and lemon risotto-style rice", blurb: "Creamy lemon rice with peas and spinach, topped with large flakes of baked salmon.", servings: 2, minutes: 40,
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon marinates in lemon and salt
    ingredients: [ing("salmon", 240), ing("rice", 140), ing("onion", 150), ing("garlic", 10), ing("olive-oil", 15), ing("salt", 1), ing("peas", 150), ing("spinach", 80), ing("soft-cheese", 60), ing("lemon-juice", 20), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and line a baking tray with foil.",
      "Marinate the salmon: Put the salmon on the tray and spoon over a third of the lemon juice and half the salt. Leave it for 10 minutes, or covered for up to a few hours in the fridge (always in the fridge after 30 minutes). Wash your hands.",
      "Soften the onion: Peel and finely chop the onion. Heat the oil in a large saucepan on a medium heat and fry the onion for 5 to 6 minutes, until soft and sweet but not brown. Stir in the garlic purée for 30 seconds.",
      "Toast the rice: Rinse the rice in a sieve, shake it dry and stir it into the onion for 1 minute, until the grains look shiny.",
      "Add the water: Add the rest of the salt and a ladle of hot water from the kettle. Stir until it is absorbed, then keep adding a ladle at a time, stirring often, for 18 to 20 minutes, until the rice is soft and creamy.",
      "Bake the salmon: Meanwhile, turn the salmon skin side down on the tray and bake it for 12 to 15 minutes, until it is opaque and flakes easily.",
      "Add the greens: Stir the peas and spinach into the rice for the last 4 minutes, until the peas are hot and the spinach has wilted.",
      "Make it creamy: Take the pan off the heat and stir in the soft cheese, the rest of the lemon juice and a good grind of black pepper. It should spread slowly on a plate: add a splash of hot water if it is too thick.",
      "Serve: Spoon the risotto into warm bowls. Peel the skin off the salmon, break the fish into large flakes and lay them on top.",
    ],
  },
  {
    id: "arancini-tomato-mozzarella-rice-bake", meal: "dinner", tags: ["Bake", "Batch cook", "Italian"], name: "Arancini-style tomato and mozzarella rice bake", blurb: "Rice, peas and spinach baked in a garlic tomato sauce around a melting mozzarella middle, under golden cheddar.", servings: 4, minutes: 55,
    // chef pass 2026-11-21: salt 1 -> 3 g, half in the rice water
    ingredients: [ing("rice", 280), ing("peas", 200), ing("onion", 150), ing("garlic", 10), ing("oregano", 2), ing("passata", 500), ing("salt", 3), ing("black-pepper", 1), ing("olive-oil", 15), ing("eggs", 120), ing("cheddar", 60), ing("mozzarella", 250), ing("spinach", 120)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6).",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water with half the salt and simmer for 10 to 12 minutes, until soft with no hard centre. Add the peas for the last 3 minutes.",
      "Soften the onion: Peel and chop the onion. Heat the oil in a saucepan and fry the onion for 6 minutes, until soft and sweet. Stir in the garlic purée and oregano for 30 seconds.",
      "Make the sauce: Add the passata, the rest of the salt and the black pepper and simmer for 10 minutes, until thick.",
      "Add the spinach: Stir the spinach into the sauce for 1 minute, until wilted.",
      "Mix the rice: Grate the cheddar and drain the rice and peas well. Beat the eggs in a large bowl, picking out any shell, then stir in the rice, half the sauce and half the cheddar. Wash your hands after touching raw eggs.",
      "Layer the bake: Spread half the rice in a large ovenproof dish. Pat the mozzarella dry with kitchen paper and tear it over the rice. Cover with the rest of the rice, then the rest of the sauce.",
      "Top with cheese: Scatter the rest of the cheddar over the top.",
      "Bake: Bake for 25 minutes, until golden and bubbling on top, the egg has set and the middle is piping hot.",
      `Serve: Leave it for 5 minutes, then cut it into squares. ${KEEP_RICE}`,
    ],
  },
  {
    id: "egg-biryani-rice-raita", meal: "dinner", tags: ["Eggs", "Indian"], name: "Egg biryani-style rice with cucumber raita", blurb: "Boiled eggs in a spiced tomato and golden onion masala, folded through rice and peas, with a cool cucumber raita.", servings: 2, minutes: 40,
    // chef pass 2026-11-21: salt 1 -> 2 g; oil 15 -> 20 ml so 300 g of onion fries deep golden
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): egg halves laid on top, cut side up; the raita with cubed cucumber
    ingredients: [ing("eggs", 240), ing("rice", 140), ing("peas", 100), ing("onion", 300), ing("olive-oil", 20), ing("garlic", 10), ing("cumin", 2), ing("cinnamon", 1), ing("chilli-powder", 1), ing("salt", 2), ing("chopped-tomatoes", 200), ing("natural-yogurt", 150), ing("cucumber", 100)],
    method: [
      "Boil the eggs: Lower the eggs into a pan of boiling water and simmer for 9 minutes, until the yolks are set. Cool them in cold water, then peel them and cut them in half.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan of boiling water and simmer for 10 to 12 minutes, until soft with no hard centre. Add the peas for the last 3 minutes.",
      "Fry the onions: Peel the onions and slice them thinly. Heat the oil in a large frying pan on a medium heat and fry them with half the salt for 12 to 15 minutes, stirring often, until deep golden brown. Turn the heat down if they catch.",
      "Add the spices: Lift out a spoonful of the onions for the top. Stir the garlic purée, cumin, cinnamon and chilli powder into the pan for 30 seconds, until fragrant.",
      "Make the masala: Add the chopped tomatoes and the rest of the salt and cook for 5 minutes, stirring, until thick and deep red. Stir in a third of the yogurt.",
      "Add the eggs: Nestle the egg halves into the sauce and spoon some over them. Warm them through for 2 minutes, then lift them out on to a plate.",
      "Mix in the rice: Drain the rice and peas well and fold them through the masala until every grain is orange.",
      "Make the raita: Cut the cucumber into small cubes, about 1 cm, and stir them into the rest of the yogurt.",
      "Serve: Spoon the biryani on to plates and lay the egg halves on top, cut side up, with a little masala spooned over each. Scatter the fried onions in the middle and serve with the raita.",
    ],
  },
  {
    id: "greek-spinach-rice-fried-eggs", meal: "dinner", tags: ["Eggs", "Greek"], name: "Greek-style spinach rice with fried eggs", blurb: "Lemony rice cooked down with plenty of spinach, onion, garlic and oregano, topped with fried eggs and a spoonful of yogurt.", servings: 2, minutes: 30,
    // chef pass 2026-11-21: salt 1 -> 2 g, some on the eggs
    ingredients: [ing("rice", 140), ing("spinach", 250), ing("onion", 150), ing("garlic", 10), ing("oregano", 1), ing("lemon-juice", 20), ing("olive-oil", 15), ing("salt", 2), ing("black-pepper", 1), ing("eggs", 240), ing("greek-yogurt", 100)],
    method: [
      RICE,
      "Get ready: Meanwhile, peel and chop the onion. Rinse the spinach unless the bag says it is ready washed and chop it roughly.",
      "Soften the onion: Heat half the oil in a large frying pan on a medium heat. Fry the onion with half the salt for 6 to 8 minutes, stirring, until soft and sweet. Stir in the garlic purée and oregano for 30 seconds.",
      "Wilt the spinach: Add the spinach a handful at a time, stirring until each lot wilts, then cook for 2 minutes more until the liquid has nearly gone.",
      "Mix in the rice: Drain the rice well and stir it into the pan with the lemon juice and black pepper. Spoon it on to warm plates and keep it warm.",
      "Fry the eggs: Wipe the pan, heat the rest of the oil on a medium heat and crack in the eggs, picking out any shell. Wash your hands after touching raw eggs.",
      "Cook the eggs: Sprinkle the rest of the salt over the eggs and fry them for 3 to 4 minutes, until the whites are completely set and the edges are lightly golden.",
      "Serve: Lay the eggs on the spinach rice and add a spoonful of yogurt to each plate.",
    ],
  },
  {
    id: "sichuan-chilli-garlic-mushrooms-rice", meal: "dinner", tags: ["Vegan", "Quick", "Chinese"], name: "Sichuan-style chilli garlic mushrooms with rice", blurb: "Mushrooms, broccoli and peas stir-fried in a hot garlic, chilli and soy sauce with plenty of black pepper, on rice.", servings: 2, minutes: 25,
    ingredients: [ing("mushrooms", 400), ing("broccoli", 200), ing("peas", 120), ing("onion", 150), ing("garlic", 15), ing("chilli-powder", 2), ing("soy", 30), ing("sweet-chilli", 20), ing("black-pepper", 1), ing("vegetable-oil", 15), ing("rice", 140)],
    method: [
      RICE,
      "Mix the sauce: Meanwhile, stir the soy sauce, sweet chilli sauce, chilli powder, plenty of black pepper and 3 tablespoons of water together in a cup.",
      "Get ready: Peel the onion and cut it into thin wedges. Wipe the mushrooms clean and cut them into thick slices. Cut the broccoli into small florets.",
      "Brown the mushrooms: Heat half the oil in a large non-stick frying pan or wok on a high heat. Add half the mushrooms in one layer and leave them for 3 minutes without stirring, until golden underneath.",
      "Turn the mushrooms: Stir and fry for 2 minutes more, until golden all over. Tip them on to a plate and brown the rest of the mushrooms in the rest of the oil the same way.",
      "Add the vegetables: Add the onion and broccoli to the pan and stir-fry for 3 to 4 minutes, until the broccoli is bright green and just tender. Add a splash of water if the pan gets dry. Stir in the garlic purée for 30 seconds.",
      "Add the peas: Tip in the frozen peas and stir for 2 minutes, until hot.",
      "Add the sauce: Turn the heat to medium. Tip the mushrooms back in, pour in the sauce and let it bubble for 1 to 2 minutes, stirring, until glossy, dark red-brown and coating everything. Add a splash of water if it gets sticky.",
      "Serve: Drain the rice well, spoon it into bowls and pile the mushrooms and vegetables on top.",
    ],
  },
  {
    id: "mushroom-pea-keema-naan", meal: "dinner", tags: ["Indian"], name: "Mushroom and pea masala curry with naan", blurb: "Thick slices of mushroom and peas in a spiced onion, garlic, chilli, cinnamon and tomato masala, with yogurt and warm naan.", servings: 2, minutes: 35,
    // chef pass 2026-11-21: salt 1 -> 2 g, half on the mushrooms to draw out their water
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"): thick slices of mushroom, as in the picture, so it is named a masala curry, not a keema (id kept)
    ingredients: [ing("mushrooms", 400), ing("peas", 150), ing("onion", 150), ing("garlic", 10), ing("chilli-powder", 2), ing("cinnamon", 1), ing("chopped-tomatoes", 400), ing("salt", 2), ing("olive-oil", 15), ing("natural-yogurt", 100), ing("naan", 260)],
    method: [
      "Get ready: Peel and finely chop the onion. Wipe the mushrooms clean and cut them into thick slices, or in half if small.",
      "Soften the onion: Heat the oil in a large frying pan on a medium heat. Fry the onion for 6 to 8 minutes, stirring, until soft, sweet and golden.",
      "Cook the mushrooms: Turn up the heat, add the mushrooms and half the salt and fry for 6 to 8 minutes, stirring only every couple of minutes, until their liquid has gone and they are browned.",
      "Add the spices: Stir in the garlic purée, chilli powder and cinnamon and cook for 30 seconds, until they smell toasty.",
      "Simmer the masala: Add the chopped tomatoes and the rest of the salt and simmer for 8 to 10 minutes, stirring now and then, until thick and the sauce clings to the mushrooms.",
      "Add the peas: Stir in the frozen peas and cook for 3 minutes, until hot.",
      "Warm the naans: Meanwhile, warm the naans under a hot grill or in a dry pan for 1 to 2 minutes on each side.",
      "Serve: Spoon the masala on to plates, add a spoonful of yogurt and serve with the naans, torn into pieces.",
    ],
  },
  {
    id: "bacon-pepper-jambalaya-rice", meal: "dinner", tags: ["One pot", "Cajun"], name: "Jambalaya-style rice with bacon and peppers", blurb: "A Cajun-style one-pot rice of crisp bacon, pepper, onion and tomato with chilli, garlic and herbs.", servings: 2, minutes: 40,
    // the rice cooks in the method's own 400 ml of water and the tomatoes, so fitting leaves it as written
    // photo match 2026-11-22 (founder: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the bacon is tossed in pepper and chilli; dried herbs over the top
    ingredients: [ing("bacon", 200), ing("rice", 140, { fit: [1, 1] }), ing("onion", 150), ing("peppers", 160), ing("garlic", 10), ing("chilli-powder", 2), ing("oregano", 1), ing("mixed-herbs", 1), ing("chopped-tomatoes", 200), ing("salt", 1), ing("black-pepper", 1), ing("olive-oil", 10), ing("spinach", 80)],
    method: [
      "Get ready: Peel and chop the onion. Wash the pepper, take out the seeds and chop it. Cut the bacon into strips and toss them with the black pepper and a pinch of the chilli powder. Wash your hands after touching raw bacon.",
      "Fry the bacon: Heat the oil in a large deep frying pan with a lid on a medium-high heat. Spread out the bacon and fry it for 6 to 8 minutes, stirring now and then, until golden and crisp. Lift half out on to kitchen paper.",
      "Soften the vegetables: Add the onion and pepper to the pan and fry for 6 to 8 minutes, until soft and sweet. Stir in the garlic purée, oregano, dried herbs and the rest of the chilli powder for 30 seconds, keeping a pinch of herbs back.",
      "Add the rice: Rinse the rice in a sieve under the cold tap. Stir it into the pan with the chopped tomatoes, the salt and 400 ml of boiling water from the kettle.",
      "Cook the rice: Bring it to a bubble, cover and cook on a low heat for 15 to 18 minutes, stirring once or twice, until the rice is soft and the liquid has been absorbed.",
      "Add the spinach: Stir in the spinach and cook for 2 minutes, until it wilts and everything is piping hot.",
      "Rest the rice: Take the pan off the heat and leave it covered for 3 minutes.",
      "Serve: Spoon the jambalaya into warm bowls and scatter the crisp bacon you kept and the last pinch of dried herbs on top.",
    ],
  },
];

export const WORLD_MEALS_LOOKS: Readonly<Record<string, string>> = {
  "menemen-turkish-eggs-peppers": "A shallow round white pan-style dish of soft, glossy yellow scrambled egg folded through red tomato, soft green and red pepper pieces and onion, with a little melted cheese, black pepper and red chilli.",
  "turkish-poached-eggs-garlic-yogurt": "A wide shallow white bowl with a thick layer of white garlic yogurt, a heap of dark green wilted spinach and two poached eggs with set whites, drizzled with glossy orange-red chilli oil.",
  "masala-omelette-spinach-tomato": "A golden folded omelette on a round white plate, speckled with small pieces of red tomato, soft onion and dark green spinach, its open edge showing the filling and a dusting of red chilli.",
  "bacon-spinach-tomato-egg-muffins": "Three golden, puffed egg muffins on a white plate, with dark green spinach in the egg and melted orange cheddar on top, dotted with small cubes of pink bacon and red tomato.",
  "peanut-butter-banana-baked-oats": "A small white ovenproof dish of baked oats, golden at the edges, with a soft, risen surface swirled with golden-brown peanut butter and pieces of baked banana showing through.",
  "cottage-cheese-pancakes-banana": "A stack of four thick golden-brown pancakes on a round white plate, topped with overlapping rounds of banana and a glossy drizzle of honey running down the sides.",
  "masala-oats-peas-tomato": "A round white bowl of thick, savoury golden oat porridge flecked with soft red tomato, onion and bright green peas, with a spoonful of white yogurt in the middle and a dusting of red chilli.",
  "berry-banana-smoothie-bowl-granola": "A round white bowl of thick, smooth deep purple-pink berry smoothie, topped with a line of golden granola clusters and a few thin rounds of banana.",
  "chicken-tinga-rice-bowl": "A round white bowl of white rice topped with a heap of shredded chicken in a thick, glossy brick-red tomato and onion sauce, a pile of finely shredded green lettuce and a spoonful of white yogurt.",
  "fajita-salmon-rice-bowl-salsa": "A round white bowl of white rice with large flakes of pink salmon coated in a red-brown spice crust, small cubes of cucumber, shredded green lettuce, a spoonful of red tomato salsa and a spoonful of white yogurt.",
  "japchae-noodles-mushrooms-egg": "A wide white bowl of glossy soy-coated noodles tangled with golden sliced mushrooms, soft onion and dark green wilted spinach, topped with thin yellow ribbons of rolled omelette and flecks of black pepper.",
  "thai-coconut-noodle-soup-mushrooms": "A deep round white bowl of creamy pale coconut broth with tangles of noodles, golden sliced mushrooms, soft onion and dark green wilted spinach, flecked with a little red chilli.",
  "pho-chicken-noodle-soup": "A deep round white bowl of clear golden-brown broth with tangles of noodles, shreds of pale chicken, soft wedges of charred onion and dark green wilted spinach, with a dusting of red chilli powder.",
  "banh-mi-chicken-rice-bowl": "A round white bowl of white rice topped with sticky golden-brown chicken pieces, thin pale green cucumber sticks and pink-tinged red onion pickles, torn green lettuce and thin drizzled lines of orange spicy mayonnaise.",
  "dan-dan-beef-noodles-spinach": "A wide white bowl of noodles coated in a glossy pale brown peanut and chilli sauce, topped with a heap of crispy browned beef mince and a pile of dark green wilted spinach.",
  "mushroom-pea-pilau-almonds": "A round white bowl of fluffy spiced rice with golden sliced mushrooms, soft onion slices and bright green peas, scattered with thinly sliced toasted almonds, beside a heap of chunky diced tomato and cucumber in the same bowl.",
  "omurice-ham-rice-omelette": "A smooth golden yellow folded omelette on a round white plate, its open end showing orange-red tomato fried rice with small pink pieces of ham, green peas and soft onion.",
  "spiced-beef-houmous-naan": "A round white plate spread with pale houmous, a mound of browned spiced beef mince and onion in the middle, beside tomato wedges with shredded green lettuce and torn pieces of warm golden naan.",
  "pad-thai-egg-noodles-broccoli": "A wide white bowl of glossy brown noodles tossed with soft scrambled egg, bright green broccoli florets and sliced onion, scattered with roughly chopped almonds.",
  "hot-sour-noodle-soup-ham-egg": "A deep round white bowl of dark amber broth with noodles, sliced mushrooms, thin pink strips of ham, dark green spinach and soft pale yellow pieces of egg, flecked with black pepper.",
  "smoked-salmon-poke-rice-bowl": "A round white bowl of white rice and green peas topped with neat separate piles of folded pink smoked salmon strips, small cucumber cubes, shredded lettuce and thin red onion slices, glossy with a dark dressing.",
  "italian-rice-salad-tuna-egg": "A round white bowl of rice salad with green peas and small cubes of red tomato and cucumber, flecked with dried oregano, topped with large pale flakes of tuna and halved boiled eggs with set yellow yolks.",
  "nigerian-egg-stew-rice": "A round white plate with a mound of white rice beside a rich red stew of tomato, strips of red pepper and onion with large soft yellow pieces of scrambled egg folded through it.",
  "vietnamese-salmon-noodle-salad": "A wide white bowl of cool noodles with shredded green lettuce and thin cucumber sticks, topped with large flakes of glossy soy-glazed pink salmon and a thin, glossy dressing flecked with red chilli.",
  "chicken-katsu-style-curry-rice": "A white plate with slices of crisp golden breadcrumbed chicken beside a neat mound of white rice, a smooth glossy golden-brown curry sauce poured over one side, and thin cucumber sticks.",
  "korean-sticky-chicken-rice-broccoli": "A round white bowl of white rice with glossy, sticky deep red-brown glazed chicken pieces, bright green broccoli florets and thin cucumber slices.",
  "sweet-sour-chicken-rice": "A white plate with a mound of white rice beside golden chicken pieces, chunks of soft pepper and onion in a glossy bright orange-red sweet and sour sauce.",
  "tandoori-chicken-rice-raita": "A white plate with charred, deep orange-red spiced chicken thighs, a mound of white rice, a small white bowl of creamy raita with small cubes of cucumber and a few thin rings of red onion.",
  "moroccan-chicken-tagine-rice": "A wide white bowl of white rice under chunks of chicken in a rich orange-red tomato and onion sauce with dark green spinach, scattered with chopped golden toasted almonds.",
  "jollof-rice-chicken": "A wide white bowl of deep orange-red tomato rice with soft pieces of pepper and onion, topped with golden browned chunks of chicken thigh and flecks of dried herbs.",
  "chicken-peanut-stew-rice": "A wide white bowl of white rice with chicken pieces in a thick, creamy orange-brown peanut and tomato sauce with dark green wilted spinach.",
  "jamaican-brown-stew-chicken-rice": "A wide white bowl of white rice beside glossy dark brown stewed chicken thighs in a rich gravy with soft slices of pepper, onion and tomato, flecked with dried herbs.",
  "chicken-parmigiana-spaghetti": "A white plate of spaghetti in red tomato sauce, topped with a golden crumbed chicken breast covered in red tomato sauce and bubbling, browned melted mozzarella, flecked with dried oregano.",
  "peri-peri-chicken-spicy-rice": "A white plate with charred, red-speckled grilled chicken, a mound of orange-red tomato rice with green peas, and a crisp salad of shredded lettuce, tomato wedges and cucumber slices.",
  "rendang-beef-curry-rice": "A round white plate with a mound of white rice beside a heap of dark, rich brown beef mince curry, glossy and nearly dry, and a few bright green broccoli florets.",
  "moroccan-meatballs-tomato-baked-eggs": "A wide shallow white dish of browned beef meatballs in a thick red tomato sauce with eggs baked on top, their whites set and their yolks bright yellow, beside torn pieces of golden naan.",
  "pastitsio-beef-pasta-bake": "A square portion of pasta bake on a white plate, showing a layer of pasta tubes, a layer of rich red-brown beef sauce and a thick, puffed golden-brown egg and cheese topping, beside a heap of dark green wilted spinach.",
  "beef-enchilada-rice-bake": "A portion of baked rice and beef mince in red tomato sauce with yellow sweetcorn on a white plate, topped with red salsa and bubbling golden melted cheddar, with shredded lettuce and a spoonful of white yogurt.",
  "swedish-meatballs-pasta-peas": "A wide white bowl of pasta shapes and bright green peas with small browned beef meatballs in a smooth, creamy pale brown gravy, flecked with black pepper.",
  "jerk-salmon-coconut-rice": "A white plate with a salmon fillet under a dark red-brown, glossy jerk-style spice crust, a mound of creamy white coconut rice and bright green broccoli florets.",
  "creamy-cajun-salmon-pasta": "A wide white bowl of pasta shapes in a creamy pale orange tomato sauce with large chunks of spiced pink salmon and dark green wilted spinach, flecked with red chilli and black pepper.",
  "salmon-pea-paella-rice": "A wide shallow white pan-style dish of orange-red tomato rice with soft slices of pepper and onion, bright green peas and chunks of pale pink cooked salmon pressed into the top.",
  "salmon-pea-lemon-risotto": "A wide white bowl of creamy pale risotto-style rice with bright green peas and dark green spinach, topped with large flakes of pale pink baked salmon and flecks of black pepper.",
  "arancini-tomato-mozzarella-rice-bake": "A square portion of rice bake on a white plate, showing golden melted cheddar on top, a red tomato sauce layer, green peas and spinach in the rice and a melted white mozzarella middle.",
  "egg-biryani-rice-raita": "A round white plate of spiced orange-tinged rice with green peas, topped with halved boiled eggs, cut side up, with set yellow yolks and a little red masala, deep golden fried onions in the middle, and a small white bowl of raita with cucumber cubes.",
  "greek-spinach-rice-fried-eggs": "A round white plate of green-flecked rice cooked with plenty of dark green spinach, topped with two fried eggs with set whites and bright yellow yolks and a spoonful of thick white yogurt.",
  "sichuan-chilli-garlic-mushrooms-rice": "A round white bowl of white rice topped with glossy, dark red-brown chilli and garlic mushrooms, bright green broccoli florets, green peas and onion, flecked with black pepper.",
  "mushroom-pea-keema-naan": "A round white plate with a heap of thick slices of brown mushroom and bright green peas in a thick red tomato curry sauce, a spoonful of white yogurt and torn pieces of warm golden naan.",
  "bacon-pepper-jambalaya-rice": "A wide white bowl of orange-red tomato rice with pieces of soft pepper and onion, dark green spinach and golden strips of crisp bacon scattered on top, flecked with dried herbs.",
};
