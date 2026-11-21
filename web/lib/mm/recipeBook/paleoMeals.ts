import { ing, type Recipe } from "../recipes";

// Paleo meals (founder 2026-11-20: "as many options as you can think about people would choose ... make new recipes"): only meat, fish, eggs, vegetables,
// fruit, nuts, olive oil, herbs and spices (the style's allowlist of pantry kinds in lib/mm/mealPlan.ts): no grains, beans, peanuts, dairy, potatoes,
// sweeteners, vegetable oils or stock cubes. Most are also keto, gluten-free and dairy-free. Cooked as a home cook would (review 2026-11-21): about a
// tablespoon of oil a pan for one or two, written as it is (it doesn't move with the meal size), and nuts only where a cook would put them; fitting moves the
// meat, fish and eggs, and the coconut milk of the curry. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const PALEO_MEALS: readonly Recipe[] = [
  // ---- breakfasts
  {
    id: "spinach-mushroom-omelette", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Spinach and mushroom omelette", blurb: "A folded omelette filled with golden mushrooms and wilted spinach.", servings: 1, minutes: 15,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of dried herbs fried with the mushrooms (no salt added, so it stays a Lower salt breakfast)
    ingredients: [ing("eggs", 180), ing("mushrooms", 100), ing("spinach", 60), ing("olive-oil", 10), ing("black-pepper", 1), ing("mixed-herbs", 1)],
    method: [
      "Get ready: Wipe the mushrooms clean and slice them about as thick as a pound coin. Rinse the spinach unless the bag says it is ready washed.",
      "Fry the mushrooms: Heat half the oil in a non-stick frying pan on a medium-high heat until hot. Add the mushrooms in one layer and leave them for 2 minutes without stirring, until golden underneath.",
      "Finish the mushrooms: Stir and fry for 2 to 3 minutes more, until golden all over and their liquid has gone. Stir in the dried herbs for the last 30 seconds, until they smell fragrant.",
      "Wilt the spinach: Add the spinach and stir for 1 minute, until soft and dark green. Tip the mushrooms and spinach on to a plate and wipe the pan with kitchen paper.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add a grind of black pepper and beat with a fork until smooth. Wash your hands after handling raw eggs.",
      "Cook the omelette: Heat the rest of the oil in the pan on a medium heat. Pour in the eggs and tilt the pan to spread them. Cook for 2 minutes, pulling the edges into the middle, then leave it alone for 1 minute, until golden underneath.",
      "Fill and fold: Spoon the mushrooms and spinach over one half and cook for 1 minute more, until the egg is completely set with no runny egg left. Fold the omelette in half, so the golden underside is on the outside.",
      "Serve: Slide the omelette on to a warm plate and serve straight away, while the filling is hot.",
    ],
  },
  {
    id: "banana-egg-pancakes-berries", meal: "breakfast", tags: ["Eggs", "Sweet", "Quick"], name: "Banana pancakes with berries and almonds", blurb: "Small pancakes of mashed banana and egg, topped with berries and chopped almonds.", servings: 1, minutes: 15,
    ingredients: [ing("banana", 120), ing("eggs", 120), ing("cinnamon", 1), ing("olive-oil", 5), ing("berries", 80), ing("almonds", 20)],
    method: [
      "Get ready: If the berries are frozen, thaw them in a sieve under the cold tap for about a minute and shake off the water. Roughly chop the almonds on a board.",
      "Make the batter: Peel the banana and mash it in a bowl with a fork until smooth. Crack in the eggs, picking out any shell, add the cinnamon and beat well. Wash your hands after handling raw eggs.",
      "Heat the pan: Heat the oil in a large non-stick frying pan on a medium-low heat for 1 minute, tilting the pan so the oil covers the bottom.",
      "Cook the pancakes: Spoon in the batter in small rounds, about 2 tablespoons each, well apart. Cook for about 2 minutes, until the edges look set and the underside is golden.",
      "Turn them: Turn each pancake carefully with a spatula and cook for 1 to 2 minutes more, until golden and set all the way through, with no wet batter in the middle. Cook them in batches if they don't all fit.",
      "Serve: Stack the pancakes on a warm plate, scatter the berries over and finish with the chopped almonds. Eat straight away.",
    ],
  },
  {
    id: "fruit-almond-breakfast-bowl", meal: "breakfast", tags: ["Quick", "No cook", "Bowl", "Vegan"], name: "Fruit and almond breakfast bowl", blurb: "Chopped apple, banana and berries with lemon and cinnamon, topped with chopped almonds.", servings: 2, minutes: 10,
    // a small handful of almonds each (25 g); a bigger or smaller meal moves them, to a handful (30 g) at most
    ingredients: [ing("apple", 300), ing("banana", 240), ing("berries", 160), ing("almonds", 50, { role: "carb", fit: [0.5, 1.2] }), ing("lemon-juice", 10), ing("cinnamon", 1)],
    method: [
      "Get the berries ready: If they are frozen, thaw them in a sieve under the cold tap for about a minute and shake off the water. If fresh, rinse and pat them dry.",
      "Chop the almonds: Roughly chop the almonds on a board, so each one is in 3 or 4 pieces.",
      "Chop the apples: Wash the apples, cut them into quarters and cut out the cores. Chop them into bite-sized pieces and put them in a bowl.",
      "Add the lemon: Pour the lemon juice over the apple and toss well, so it stays pale. Peel the bananas, slice them into rounds and add them to the bowl.",
      "Mix the fruit: Add the berries and stir gently, so the fruit doesn't break up.",
      "Serve: Share the fruit between bowls, dust the cinnamon over the top and scatter the chopped almonds over. Eat straight away.",
    ],
  },
  {
    id: "mushroom-tomato-spinach-eggs-fry-up", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Mushroom, tomato and spinach fry-up with eggs", blurb: "Golden mushrooms, soft fried tomatoes, wilted spinach and fried eggs, all cooked in olive oil.", servings: 2, minutes: 20,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of salt on the mushrooms and tomatoes once they have browned
    ingredients: [ing("eggs", 300), ing("mushrooms", 200), ing("tomatoes", 170), ing("spinach", 80), ing("olive-oil", 15), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Get ready: Wipe the mushrooms clean and slice them about as thick as a pound coin. Wash the tomatoes and cut them in half. Rinse the spinach unless the bag says it is ready washed.",
      "Fry the mushrooms: Heat half the oil in a large non-stick frying pan on a medium-high heat until hot. Add the mushrooms in one layer and leave them for 3 minutes without stirring, until golden underneath.",
      "Add the tomatoes: Stir the mushrooms and push them to one side. Add the tomatoes cut side down and fry for 3 minutes without moving them, until the mushrooms are golden all over and the tomatoes are soft and browned underneath. Sprinkle the salt over them.",
      "Wilt the spinach: Push everything to one side, add the spinach and stir for 1 to 2 minutes, until soft and dark green. Move it all to a warm plate and cover it with another plate.",
      "Add the eggs: Heat the rest of the oil in the pan on a medium heat. Crack each egg into a cup, then slide it into the pan. Wash your hands after handling raw eggs.",
      "Fry the eggs: Fry for 3 to 4 minutes, until the whites are completely set with no runny white left. If the tops are still clear, cover the pan for 30 to 60 seconds. Fry them in batches if they don't all fit.",
      "Serve: Share the mushrooms, tomatoes, spinach and eggs between warm plates and add a good grind of black pepper. Serve straight away.",
    ],
  },
  {
    id: "pepper-spinach-egg-muffins", meal: "breakfast", tags: ["Eggs", "Bake", "Make ahead"], name: "Pepper and spinach egg muffins", blurb: "Eggs baked in a muffin tin with chopped peppers, spinach and spring onions. Good cold too.", servings: 2, minutes: 25,
    ingredients: [ing("eggs", 300), ing("peppers", 160), ing("spinach", 80), ing("spring-onions", 30), ing("olive-oil", 15), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 190°C (170°C fan, gas 5). Brush the holes of a muffin tin well with a little of the oil, so the muffins don't stick.",
      "Chop the vegetables: Wash the pepper, cut it in half, pull out the seeds and stalk and chop it small. Trim and thinly slice the spring onions. Rinse the spinach and chop it roughly.",
      "Soften the vegetables: Heat the rest of the oil in a frying pan on a medium heat. Fry the pepper and spring onions for 3 to 4 minutes, until soft. Add the spinach and stir for 1 minute, until wilted.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add a good grind of black pepper and beat with a fork until smooth. Wash your hands after handling raw eggs.",
      "Fill the tin: Share the vegetables between the holes of the tin, then pour the egg over them, filling each hole about three-quarters full.",
      "Bake: Bake on the middle shelf for 15 to 18 minutes, until puffed up, golden at the edges and completely set in the middle. A knife pushed into the centre should come out clean, with no runny egg.",
      "Serve: Leave them in the tin for 2 minutes, then loosen the edges with a knife and lift them out. Eat warm, or leave to cool and keep in the fridge for up to 2 days.",
    ],
  },
  {
    id: "spiced-tomato-baked-eggs-spinach", meal: "breakfast", tags: ["Eggs", "Brunch", "One pan"], name: "Spiced tomato baked eggs with spinach", blurb: "Eggs cooked in a cumin and paprika tomato sauce with wilted spinach, all in one pan.", servings: 2, minutes: 25,
    // 2026-11-21 (founder: "Nothing should be plain"): salt in the sauce, which is simmered until thick enough to hold the eggs
    ingredients: [ing("eggs", 300), ing("chopped-tomatoes", 400), ing("spinach", 100), ing("garlic", 5), ing("cumin", 1), ing("paprika", 2), ing("olive-oil", 15), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Warm the spices: Heat the oil in a large, deep frying pan with a lid on a medium heat. Add the garlic purée, cumin and paprika and stir for 30 seconds, until they smell fragrant, without letting the garlic brown.",
      "Simmer the sauce: Pour in the chopped tomatoes and add the salt and a good grind of black pepper. Bring to a bubble, then simmer gently for 8 to 10 minutes, stirring now and then, until thick enough to leave a trail when you drag the spoon through.",
      "Add the spinach: Rinse the spinach unless the bag says it is ready washed. Stir it into the sauce a handful at a time and cook for 1 to 2 minutes, until wilted.",
      "Add the eggs: Make small hollows in the sauce with the back of a spoon. Crack each egg into a cup and slide it into a hollow. Wash your hands after handling raw eggs.",
      "Cook the eggs: Put the lid on and cook on a low heat for 6 to 8 minutes, until the whites are completely set with no runny white left and the yolks are done how you like them.",
      "Serve: Spoon the eggs and sauce into warm shallow bowls and serve straight away.",
    ],
  },
  // ---- lunches
  {
    id: "chicken-apple-almond-salad", meal: "lunch", tags: ["Salad"], name: "Chicken, apple and almond salad", blurb: "Pan-fried chicken thighs sliced over salad leaves with crisp apple, cucumber and toasted almonds.", servings: 2, minutes: 20,
    // 2026-11-21 (founder: "Nothing should be plain"): the chicken salted before it cooks
    ingredients: [ing("chicken-thigh", 300), ing("salad-leaves", 100), ing("apple", 120, { note: "about 1 small apple" }), ing("almonds", 40), ing("cucumber", 100), ing("olive-oil", 25), ing("lemon-juice", 20), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Get the chicken ready: Pat the chicken thigh fillets dry with kitchen paper and trim off any large pieces of fat on a separate board. Sprinkle the salt over both sides. Wash your hands in hot soapy water after handling raw chicken.",
      "Cook the chicken: Heat a little of the oil in a non-stick frying pan on a medium-high heat until hot. Lay the chicken in flat and leave it for 5 to 6 minutes without moving it, until golden underneath.",
      "Turn the chicken: Turn it over and cook for 5 to 6 minutes more, until golden and piping hot all the way through with no pink left.",
      "Toast the almonds: Lift the chicken on to a board to rest. Toast the almonds in the same pan on a medium heat for 2 to 3 minutes, shaking it often, until golden in patches and smelling toasted, then tip them out and chop them roughly.",
      "Make the dressing: In a small bowl, mix the rest of the oil with the lemon juice and a good grind of black pepper, using a fork.",
      "Chop the salad: Wash the apple and cucumber. Quarter and core the apple, then slice it thinly. Cut the cucumber into half-moons. Rinse the salad leaves unless the bag says they are ready washed.",
      "Slice the chicken: Cut the chicken into thin slices. It should be cooked all the way through, with no pink left in the middle.",
      "Serve: Toss the leaves, apple and cucumber with most of the dressing and share between plates. Lay the chicken on top, scatter over the almonds and spoon over the rest of the dressing.",
    ],
  },
  {
    id: "spiced-chicken-vegetable-soup", meal: "lunch", tags: ["Soup", "Batch cook"], name: "Spiced chicken and vegetable soup", blurb: "A chunky soup of chicken, carrots, tomatoes and spinach with cumin and paprika.", servings: 4, minutes: 40,
    // 2026-11-21: oil 15 -> 20 ml so the chicken browns as the picture shows (founder: "has to look exactly as much as you can as the product")
    ingredients: [ing("chicken-thigh", 600), ing("carrots", 300), ing("onion", 150), ing("chopped-tomatoes", 800), ing("spinach", 100), ing("cumin", 3), ing("paprika", 3), ing("garlic", 10), ing("olive-oil", 20), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Get ready: Peel the onion and chop it small. Peel the carrots and cut them into small cubes, about 1 cm. Cut the chicken into bite-sized pieces on a separate board and pat them dry with kitchen paper, then wash your hands in hot soapy water.",
      "Brown the chicken: Heat half the oil in a large saucepan on a high heat until hot. Add half the chicken in one layer and leave it for 2 to 3 minutes without stirring, until golden brown underneath.",
      "Turn the chicken: Turn the pieces and fry for 2 minutes more, until browned on the other side, then lift them on to a plate. Brown the rest of the chicken the same way in the rest of the oil.",
      "Soften the vegetables: Turn the heat down to medium. Add the onion and carrots and cook for 5 minutes, stirring often, until the onion is soft. Stir in the garlic purée, cumin and paprika and cook for 1 minute.",
      "Simmer the soup: Tip the chicken and its juices back in. Add the chopped tomatoes, 600 ml of boiling water from the kettle, the salt and a good grind of black pepper. Bring to the boil, then simmer gently for 20 minutes, until the carrots are tender.",
      "Add the spinach: Stir in the spinach and cook for 2 minutes, until wilted. Cut into a few of the largest chicken pieces: they should be piping hot all the way through with no pink left.",
      "Serve: Taste and add a little more black pepper if it needs it, then ladle the soup into warm bowls. Cool any left over quickly, then keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "salmon-cucumber-tomato-salad", meal: "lunch", tags: ["Salad", "Fish", "Quick"], name: "Salmon, cucumber and tomato salad", blurb: "Pan-fried salmon in large flakes over cucumber, cherry tomatoes and salad leaves with lemon.", servings: 2, minutes: 20,
    // 2026-11-21 (founder: "Nothing should be plain"): the salmon dried and salted, then fried untouched until golden underneath
    ingredients: [ing("salmon", 260), ing("cucumber", 200), ing("cherry-tomatoes", 200), ing("salad-leaves", 60), ing("red-onion", 40), ing("olive-oil", 25), ing("lemon-juice", 15), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Get ready: Peel the red onion and slice it very thinly. Rinse the salad leaves unless the bag says they are ready washed.",
      "Chop the salad: Cut the cucumber into half-moons and the cherry tomatoes in half.",
      "Season the salmon: Pat the salmon dry with kitchen paper and sprinkle the salt over it. Wash your hands after handling raw fish.",
      "Start the salmon: Heat a little of the oil in a non-stick frying pan on a medium-high heat. Put the salmon in, skin side down if it has skin, and fry for 4 minutes without moving it, until golden underneath.",
      "Finish the salmon: Turn the fillets over and cook for 3 to 4 minutes more, until the fish is opaque all the way through and flakes easily when pressed with a fork.",
      "Make the dressing: In a small bowl, mix the rest of the oil with the lemon juice and a good grind of black pepper, using a fork.",
      "Serve: Toss the leaves, cucumber, tomatoes and onion with most of the dressing and share between plates. Break the salmon into large flakes on top and spoon over the rest of the dressing.",
    ],
  },
  {
    id: "chicken-mushroom-spinach-omelette", meal: "lunch", tags: ["Eggs", "Quick"], name: "Chicken, mushroom and spinach omelette", blurb: "A folded omelette filled with browned chicken, golden mushrooms and spinach.", servings: 1, minutes: 15,
    // 2026-11-21 (founder: "Nothing should be plain"): half the pepper on the chicken as it browns (no salt added, so it stays a Lower salt lunch)
    ingredients: [ing("eggs", 180), ing("chicken-thigh", 100), ing("mushrooms", 80), ing("spinach", 50), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Get ready: Cut the chicken into small pieces, about 1 cm, on a separate board, then wash your hands in hot soapy water. Wipe the mushrooms clean and slice them thinly. Rinse the spinach unless the bag says it is ready washed.",
      "Fry the chicken: Heat half the oil in a non-stick frying pan on a medium-high heat until hot. Add the chicken in one layer, sprinkle over half the black pepper and leave it for 2 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the pieces and fry for 3 to 4 minutes more, stirring now and then, until golden all over and piping hot all the way through with no pink left.",
      "Add the mushrooms: Add the mushrooms and leave them for 2 minutes without stirring, then fry for 1 minute more, until golden. Stir in the spinach for 1 minute, until wilted, then tip everything on to a plate and wipe the pan with kitchen paper.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add the rest of the black pepper and beat with a fork until smooth. Wash your hands after handling raw eggs.",
      "Cook the omelette: Heat the rest of the oil in the pan on a medium heat. Pour in the eggs and tilt the pan to spread them. Cook for 2 minutes, pulling the edges into the middle, then leave it alone for 1 minute, until golden underneath.",
      "Fill and fold: Spoon the chicken, mushrooms and spinach over one half and cook for 1 minute more, until the egg is completely set with no runny egg left. Fold the omelette over, so the golden underside is on the outside.",
      "Serve: Slide the omelette on to a warm plate and serve straight away, while the filling is hot.",
    ],
  },
  {
    id: "chicken-roasted-vegetable-salad", meal: "lunch", tags: ["Salad", "Roast"], name: "Chicken and roasted vegetable salad", blurb: "Sliced chicken over salad leaves with roasted peppers, red onion and cherry tomatoes.", servings: 2, minutes: 30,
    // 2026-11-21 (founder: "Nothing should be plain"): salt on the roasting vegetables and on the chicken before it cooks
    ingredients: [ing("chicken", 300), ing("peppers", 240), ing("red-onion", 150), ing("salad-leaves", 80), ing("cherry-tomatoes", 150), ing("olive-oil", 25), ing("lemon-juice", 15), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Wash the peppers, pull out the seeds and stalks and cut them into strips. Peel the red onion and cut it into thin wedges.",
      "Roast the vegetables: Toss the peppers and onion with half the oil and half the salt on a large baking tray and spread them out in one layer. Roast on the middle shelf for 20 to 25 minutes, turning once, until soft and browned at the edges.",
      "Get the chicken ready: Meanwhile, cut any thick chicken fillets in half through the middle, so they cook evenly, on a separate board. Pat them dry and sprinkle with the rest of the salt. Wash your hands in hot soapy water after handling raw chicken.",
      "Cook the chicken: Heat a little of the oil in a non-stick frying pan on a medium-high heat until hot. Lay the chicken in flat and leave it for 5 to 6 minutes without moving it, until golden underneath.",
      "Turn the chicken: Turn it over and cook for 5 to 6 minutes more, until golden and piping hot all the way through with no pink left.",
      "Make the dressing: Lift the chicken on to a board to rest. In a small bowl, mix the rest of the oil with the lemon juice and a good grind of black pepper, using a fork. Cut the cherry tomatoes in half.",
      "Serve: Rinse the salad leaves unless the bag says they are ready washed and share them between plates with the tomatoes and roasted vegetables. Slice the chicken and lay it on top, then spoon over the dressing.",
    ],
  },
  {
    id: "beef-vegetable-soup", meal: "lunch", tags: ["Soup", "Batch cook"], name: "Beef and vegetable soup", blurb: "A thick soup of beef mince, carrots, tomatoes and spinach with paprika and herbs.", servings: 4, minutes: 45,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of salt in the soup
    ingredients: [ing("beef-mince", 500), ing("carrots", 300), ing("onion", 150), ing("chopped-tomatoes", 800), ing("spinach", 100), ing("paprika", 3), ing("mixed-herbs", 2), ing("garlic", 10), ing("olive-oil", 15), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Get ready: Peel the onion and chop it small. Peel the carrots and cut them into small cubes, about 1 cm. Rinse the spinach unless the bag says it is ready washed.",
      "Brown the mince: Heat the oil in a large saucepan on a high heat until hot. Add the mince, press it into a flat layer, then wash your hands in hot soapy water. Leave it for 3 minutes without stirring, until browned underneath.",
      "Break up the mince: Break it up with a wooden spoon and fry for 4 to 5 minutes more, stirring now and then, until browned all over with no pink left. If water pools in the pan, keep frying until it bubbles away.",
      "Soften the vegetables: Turn the heat down to medium. Add the onion and carrots and cook for 5 minutes, stirring often, until the onion is soft. Stir in the garlic purée, paprika and dried herbs and cook for 1 minute.",
      "Add the tomatoes: Pour in the chopped tomatoes and 600 ml of boiling water from the kettle, and add the salt and a good grind of black pepper. Stir well, scraping up anything stuck to the bottom of the pan.",
      "Simmer the soup: Bring to the boil, then turn the heat down and simmer gently with the lid half on for 25 minutes, stirring now and then, until the carrots are tender.",
      "Add the spinach: Stir in the spinach and cook for 2 minutes, until wilted. The soup should be piping hot all the way through.",
      "Serve: Taste and add a little more black pepper if it needs it, then ladle the soup into warm bowls. Cool any left over quickly, then keep it in the fridge and eat it within 2 days.",
    ],
  },
  // ---- dinners
  {
    id: "chicken-thigh-pepper-mushroom-traybake", meal: "dinner", tags: ["One pan", "Roast"], name: "Chicken thigh traybake with peppers, mushrooms and onions", blurb: "Paprika and oregano chicken thighs roasted on a tray of peppers, mushrooms and red onion.", servings: 2, minutes: 40,
    // 2026-11-21 (founder: "Nothing should be plain"): salt in the spice oil
    ingredients: [ing("chicken-thigh", 400), ing("peppers", 160), ing("mushrooms", 250), ing("red-onion", 75, { note: "about half a red onion" }), ing("olive-oil", 15), ing("paprika", 2), ing("oregano", 1), ing("garlic", 5), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and find your largest roasting tin.",
      "Chop the vegetables: Wash the pepper, pull out the seeds and stalk and cut it into thick strips. Peel the red onion and cut it into wedges. Wipe the mushrooms clean and cut any large ones in half.",
      "Mix the spice oil: In a large bowl, mix the oil with the garlic purée, paprika, oregano, the salt and a good grind of black pepper.",
      "Coat the chicken: Pat the chicken dry with kitchen paper, add it to the bowl and turn it in the spice oil until coated all over. Lift it out on to a plate, then wash your hands in hot soapy water.",
      "Coat the vegetables: Add the peppers, onion and mushrooms to the bowl and toss them in the rest of the spice oil.",
      "Fill the tin: Spread the vegetables out in the roasting tin in one layer, with space between them (use two tins if they pile up). Sit the chicken on top, smooth side up and spaced apart, so everything roasts rather than steams.",
      "Roast: Roast on the top shelf for 30 to 35 minutes, turning the vegetables once halfway, until the chicken is golden and the mushrooms and peppers are soft and browned at the edges.",
      "Check the chicken: Cut into the thickest piece. It should be piping hot all the way through with no pink left and the juices running clear. If not, roast for 5 minutes more and check again.",
      "Serve: Share the chicken and vegetables between warm plates and spoon over the juices from the tin.",
    ],
  },
  {
    id: "chicken-spinach-coconut-curry", meal: "dinner", tags: ["One pot", "Batch cook"], name: "Chicken, spinach and tomato coconut curry", blurb: "Chicken thighs simmered in a coconut and tomato curry sauce with plenty of spinach.", servings: 4, minutes: 35,
    // the coconut milk is the sauce's richness, so a bigger or smaller meal moves it
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of salt in the sauce, simmered until it coats the chicken
    ingredients: [ing("chicken-thigh", 600), ing("coconut-milk", 400, { role: "carb" }), ing("chopped-tomatoes", 400), ing("spinach", 200), ing("onion", 150), ing("curry-powder", 6), ing("garlic", 10), ing("olive-oil", 10), ing("salt", 1)],
    method: [
      "Get ready: Peel the onion and chop it small. Cut the chicken into bite-sized pieces on a separate board, then wash your hands in hot soapy water. Rinse the spinach unless the bag says it is ready washed.",
      "Soften the onion: Heat the oil in a large, deep frying pan or saucepan on a medium heat. Add the onion and cook for 6 to 8 minutes, stirring now and then, until soft and golden.",
      "Add the spices: Stir in the garlic purée and curry powder and cook for 1 minute, stirring all the time so the spices don't burn.",
      "Brown the chicken: Turn the heat up to medium-high, add the chicken and cook for 5 minutes, turning the pieces, until browned all over.",
      "Add the sauce: Shake the coconut milk well before opening it. Pour it into the pan with the chopped tomatoes and the salt, stir well, scraping up anything stuck to the pan, and bring to a gentle bubble.",
      "Simmer the curry: Turn the heat down and simmer gently for 15 minutes, stirring now and then, until the sauce is creamy and thick enough to coat the chicken.",
      "Wilt the spinach: Stir in the spinach a handful at a time and cook for 2 minutes, until wilted.",
      "Check the chicken: Cut into the largest piece. It should be piping hot all the way through with no pink left. If not, simmer for a few minutes more and check again.",
      "Serve: Ladle the curry into warm bowls and serve straight away. Cool any left over quickly, then keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "beef-meatballs-tomato-broccoli", meal: "dinner", tags: ["Batch cook"], name: "Beef meatballs in tomato sauce with broccoli", blurb: "Garlic and oregano beef meatballs simmered in passata, with broccoli.", servings: 4, minutes: 40,
    // 2026-11-21 (founder: "Nothing should be plain"): salt in the meatballs
    ingredients: [ing("beef-mince", 500), ing("garlic", 10), ing("oregano", 2), ing("passata", 400), ing("onion", 75, { note: "about half an onion" }), ing("olive-oil", 15), ing("broccoli", 400), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Get ready: Peel the onion and chop it very small. Cut the broccoli into small florets.",
      "Mix the meatballs: Put the mince in a large bowl with half the onion, the garlic purée, half the oregano, the salt and a good grind of black pepper. Mix well with your hands for 1 to 2 minutes, until it sticks together.",
      "Shape the meatballs: Roll the mixture into balls about the size of a walnut, squeezing each one firmly so it holds together, and lay them on a plate. Wash your hands in hot soapy water.",
      "Brown the meatballs: Heat the oil in a large, deep frying pan on a medium-high heat until hot. Add the meatballs in one layer with space between them (fry them in two batches if your pan is small).",
      "Turn the meatballs: Leave them for 2 minutes without moving, until browned underneath, then turn them gently. Keep frying and turning every 2 minutes for 6 to 8 minutes in all, until browned all over. Lift them on to a plate.",
      "Make the sauce: Turn the heat down to medium and add the rest of the onion. Cook for 3 minutes, until soft, then pour in the passata, add the rest of the oregano and stir well.",
      "Simmer: Put the meatballs back in the pan, bring the sauce to a gentle bubble and simmer for 12 to 15 minutes, turning the meatballs now and then, until the sauce thickens.",
      "Cook the broccoli: Meanwhile, boil the kettle and pour the water into a saucepan on a high heat. Cook the broccoli for 3 to 4 minutes, until bright green and just tender, then drain it well. No longer, or it goes dark and soft.",
      "Check the meatballs: Cut one of the biggest meatballs in half. It should be piping hot all the way through with no pink left. If not, simmer for a few minutes more and check again.",
      "Serve: Spoon the meatballs and sauce into warm shallow bowls, with the broccoli on the side. Cool any left over quickly, then keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "beef-tomato-stuffed-peppers", meal: "dinner", tags: ["Bake"], name: "Beef and tomato stuffed peppers with salad", blurb: "Roasted pepper halves filled with spiced beef and tomato, with salad leaves.", servings: 2, minutes: 45,
    // 2026-11-21 (founder: "Nothing should be plain"): the filling seasoned with salt and black pepper
    ingredients: [ing("peppers", 320), ing("beef-mince", 300), ing("onion", 75, { note: "about half an onion" }), ing("chopped-tomatoes", 200), ing("garlic", 5), ing("cumin", 2), ing("paprika", 2), ing("olive-oil", 15), ing("salad-leaves", 60), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Peel the onion and chop it small.",
      "Get the peppers ready: Wash the peppers and cut them in half from top to bottom, through the stalk. Pull out the seeds and white ribs, keeping the halves whole, and sit them cut side up in a roasting tin.",
      "Brown the mince: Heat half the oil in a large frying pan on a high heat until hot. Add the mince, press it into a flat layer, then wash your hands in hot soapy water. Leave it for 3 minutes without stirring, until browned underneath.",
      "Break up the mince: Break it up with a wooden spoon and fry for 3 to 4 minutes more, stirring now and then, until browned all over with no pink left.",
      "Add the spices: Turn the heat down to medium. Add the onion and cook for 4 to 5 minutes, until soft. Stir in the garlic purée, cumin and paprika and cook for 1 minute, stirring all the time.",
      "Simmer the filling: Pour in the chopped tomatoes, add the salt and black pepper and simmer for 5 minutes, stirring now and then, until thick, with little liquid left.",
      "Fill the peppers: Spoon the filling into the pepper halves, pressing it down gently. Drizzle the rest of the oil over the outsides of the peppers.",
      "Bake: Cover the tin with foil and bake on the middle shelf for 15 minutes. Take off the foil and bake for 10 minutes more, until the peppers are soft and the filling is piping hot all the way through.",
      "Serve: Rinse the salad leaves unless the bag says they are ready washed. Put the peppers on warm plates and serve with the salad leaves on the side.",
    ],
  },
  {
    id: "lemon-herb-chicken-carrots-onions", meal: "dinner", tags: ["Roast", "One pan"], name: "Lemon and herb chicken with roast carrots and onions", blurb: "Chicken thighs roasted in lemon, garlic and herbs on carrots and red onion, with broccoli.", servings: 2, minutes: 50,
    // 2026-11-21 (founder: "Nothing should be plain"): salt in the lemon oil
    ingredients: [ing("chicken-thigh", 400), ing("carrots", 300), ing("red-onion", 150), ing("broccoli", 150), ing("olive-oil", 15), ing("lemon-juice", 20), ing("mixed-herbs", 2), ing("garlic", 5), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6) and find your largest roasting tin.",
      "Chop the vegetables: Peel the carrots and cut them into sticks about the size of your little finger. Peel the red onion and cut it into wedges. Cut the broccoli into small florets and keep it to one side.",
      "Make the lemon oil: In a large bowl, mix the oil with the lemon juice, garlic purée, dried herbs, the salt and a good grind of black pepper.",
      "Coat the chicken: Pat the chicken dry with kitchen paper, add it to the bowl and turn it in the lemon oil until coated. Lift it out on to a plate, then wash your hands in hot soapy water.",
      "Start the vegetables: Toss the carrots and onion in the rest of the lemon oil, spread them out in one layer in the roasting tin and roast on the middle shelf for 10 minutes.",
      "Add the chicken: Take the tin out with oven gloves, sit the chicken on top of the vegetables and roast for 20 minutes.",
      "Add the broccoli: Take the tin out again. Tuck the broccoli in round the edges of the tin, turn it in the oil there and leave the tips facing up. Roast for 10 minutes more, until the chicken is golden, the carrots tender and the broccoli tips browned.",
      "Check the chicken: Cut into the thickest piece. It should be piping hot all the way through with no pink left and the juices running clear. If not, roast for 5 minutes more and check again.",
      "Serve: Share the chicken and vegetables between warm plates and spoon over the lemony juices from the tin.",
    ],
  },
  {
    id: "beef-mushroom-tomato-stew-greens", meal: "dinner", tags: ["Batch cook", "One pot"], name: "Beef, mushroom and tomato stew with greens", blurb: "A thick stew of beef mince, mushrooms, carrots and tomatoes with herbs, served with broccoli.", servings: 4, minutes: 50,
    // 2026-11-21: oil 15 -> 20 ml so the mushrooms brown before the mince goes in, as the picture shows (founder: "has to look exactly as much as you can as the product")
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of salt in the stew
    ingredients: [ing("beef-mince", 600), ing("mushrooms", 300), ing("onion", 150), ing("carrots", 200), ing("chopped-tomatoes", 800), ing("broccoli", 300), ing("garlic", 10), ing("mixed-herbs", 2), ing("olive-oil", 20), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Get ready: Peel the onion and chop it small. Peel the carrots and cut them into small cubes, about 1 cm. Wipe the mushrooms clean and cut them into quarters.",
      "Fry the mushrooms: Heat half the oil in a large, heavy saucepan on a high heat until hot. Add the mushrooms in one layer (in two batches if they don't fit) and leave them for 3 minutes without stirring, until golden underneath.",
      "Finish the mushrooms: Stir and fry for 2 to 3 minutes more, until golden all over, then lift them on to a plate.",
      "Brown the mince: Heat the rest of the oil in the pan. Add the mince, press it into a flat layer, then wash your hands in hot soapy water. Leave it for 3 minutes without stirring, until browned underneath.",
      "Break up the mince: Break it up with a wooden spoon and fry for 4 to 5 minutes more, until browned all over with no pink left. If water pools in the pan, keep frying until it bubbles away.",
      "Soften the vegetables: Turn the heat down to medium. Add the onion and carrots and cook for 5 minutes, stirring often, until the onion is soft. Stir in the garlic purée and dried herbs and cook for 1 minute.",
      "Add the tomatoes: Tip the mushrooms back in. Pour in the chopped tomatoes and a splash of water, add the salt and a good grind of black pepper and stir well, scraping up anything stuck to the bottom of the pan.",
      "Simmer the stew: Bring to a gentle bubble, then turn the heat down low, put the lid on and simmer for 25 minutes, stirring now and then, until thick and the carrots are tender.",
      "Cook the broccoli: About 8 minutes before the stew is ready, boil the kettle and pour the water into a saucepan. Cut the broccoli into florets and cook it for 3 to 4 minutes, until bright green and just tender, then drain it well.",
      "Check the stew: Taste and add a little more black pepper if it needs it. The stew should be thick and piping hot all the way through.",
      "Serve: Spoon the stew into warm shallow bowls and serve the broccoli on the side. Cool any left over quickly, then keep it in the fridge and eat it within 2 days.",
    ],
  },
];

// How each looks from directly above, for its picture (docs/RECIPE_IMAGE_PROMPTS.md): one portion, only the recipe's own foods, served as the method says.
export const PALEO_MEALS_LOOKS: Readonly<Record<string, string>> = {
  "spinach-mushroom-omelette": "A folded golden omelette on a round white plate, golden-brown sliced mushrooms and dark green wilted spinach showing at its open edge, flecked with black pepper.",
  "banana-egg-pancakes-berries": "A small stack of round golden-brown banana and egg pancakes on a round white plate, topped with a scatter of deep red and purple mixed berries and roughly chopped pale almonds.",
  "fruit-almond-breakfast-bowl": "A wide white bowl of chopped red-skinned apple, round pale banana slices and deep red and purple mixed berries, dusted with brown cinnamon and topped with a scatter of roughly chopped almonds.",
  "mushroom-tomato-spinach-eggs-fry-up": "A round white plate holding two fried eggs with set whites and golden yolks, golden-brown sliced mushrooms, two soft red fried tomato halves and a heap of dark green wilted spinach, flecked with black pepper.",
  "pepper-spinach-egg-muffins": "Three round golden egg muffins on a round white plate, their puffed, set tops flecked with small pieces of red pepper, dark green spinach and thin green rings of spring onion.",
  "spiced-tomato-baked-eggs-spinach": "A wide shallow white bowl of thick red spiced tomato sauce with dark green wilted spinach through it, two eggs set into it with opaque whites and bright yellow yolks, flecked with black pepper.",
  "chicken-apple-almond-salad": "A wide white plate of green salad leaves with thin slices of red-skinned apple and pale cucumber half-moons, topped with golden sliced chicken thigh and a scatter of roughly chopped toasted almonds, glossy with dressing.",
  "spiced-chicken-vegetable-soup": "A round white bowl of chunky red tomato soup with pieces of browned chicken, small orange carrot cubes, soft onion and dark green wilted spinach.",
  "salmon-cucumber-tomato-salad": "A wide white plate of green salad leaves, pale cucumber half-moons, halved red cherry tomatoes and thin rings of purple red onion, topped with large pink flakes of pan-fried salmon, glossy with lemon dressing.",
  "chicken-mushroom-spinach-omelette": "A large folded golden omelette on a round white plate, with browned pieces of chicken, golden sliced mushrooms and dark green wilted spinach showing at its open edge, flecked with black pepper.",
  "chicken-roasted-vegetable-salad": "A wide white plate of green salad leaves with halved red cherry tomatoes, soft roasted strips of red pepper and red onion wedges browned at the edges, topped with golden sliced chicken, glossy with lemon dressing.",
  "beef-vegetable-soup": "A round white bowl of thick red tomato soup with browned beef mince, small orange carrot cubes, soft onion and dark green wilted spinach, flecked with dried herbs.",
  "chicken-thigh-pepper-mushroom-traybake": "A wide white plate of golden roasted chicken thigh fillets dusted red with paprika on a bed of soft roasted pepper strips, red onion wedges and browned mushrooms, glossy with spiced oil and pan juices.",
  "chicken-spinach-coconut-curry": "A round white bowl of creamy orange-red coconut and tomato curry with tender pieces of chicken thigh, soft onion and dark green wilted spinach stirred through it.",
  "beef-meatballs-tomato-broccoli": "A wide shallow white bowl of browned beef meatballs in thick red tomato sauce, with bright green broccoli florets on one side.",
  "beef-tomato-stuffed-peppers": "Two halves of a soft roasted red pepper on a round white plate, filled with browned beef mince in thick red tomato sauce, beside a small heap of green salad leaves.",
  "lemon-herb-chicken-carrots-onions": "A wide white plate of golden roasted chicken thigh fillets flecked with dried herbs, with roasted orange carrot sticks, soft red onion wedges and bright green broccoli florets browned at the tips, glossy with pan juices.",
  "beef-mushroom-tomato-stew-greens": "A wide shallow white bowl of thick red beef and tomato stew with browned mince, quartered golden mushrooms and small orange carrot cubes, with bright green broccoli florets heaped on one side.",
};
