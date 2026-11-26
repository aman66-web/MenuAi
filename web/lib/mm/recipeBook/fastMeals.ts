import { ing, type Recipe } from "../recipes";

// Dinners ready in 15 minutes, lunches for the cuisines that had the fewest, and keto and paleo meals (founder 2026-11-26: "make more recipes so that my app caters
// for multiple inputs a user would need as they all have different diet plans that may vary a lot"; docs/RECIPE_COVERAGE_2026-11-26.md). Someone who has 15
// minutes to cook on a weekday had three dinners to choose from, Indian lunches none, and a paleo week one or two dinners. See lib/mm/recipeBook/index.ts
// for the rules every recipe follows.

export const FAST_MEALS: readonly Recipe[] = [
  // ---- dinners in 15 minutes
  {
    id: "paprika-chicken-pepper-wraps", meal: "dinner", tags: ["Quick", "Wrap"], name: "Paprika chicken and pepper wraps", blurb: "Strips of paprika chicken and soft peppers in warm wraps with lemony yogurt and leaves.", servings: 2, minutes: 15,
    ingredients: [ing("chicken", 300), ing("peppers", 160, { note: "about 1 pepper" }), ing("paprika", 2), ing("cumin", 1), ing("olive-oil", 10), ing("greek-yogurt", 80), ing("lemon-juice", 10), ing("salad-leaves", 40), ing("wraps", 240, { note: "about 4 wraps" }), ing("salt", 1)],
    method: [
      "Slice the chicken: Cut the chicken into thin strips about 1 cm wide, so it cooks quickly. Wash your hands and the board after touching raw chicken.",
      "Season it: Toss the chicken with the paprika, cumin and a pinch of salt in a bowl.",
      "Slice the pepper: Cut the pepper in half, scoop out the seeds and white inside and slice it into thin strips.",
      "Fry: Heat the oil in a large frying pan over a high heat. Add the chicken and pepper and fry for 6 to 8 minutes, stirring, until the chicken is golden.",
      "Check the chicken: Cut into the thickest strip: it must be piping hot all the way through, with no pink left. If not, fry for a minute or two more.",
      "Make the yogurt: Stir the lemon juice into the yogurt in a small bowl.",
      "Warm the wraps: Warm the wraps one at a time in a dry pan for about 20 seconds a side, so they fold without cracking.",
      "Fill and serve: Spread some yogurt down each wrap, add the leaves, then the chicken and pepper. Fold in the sides, roll up and serve straight away.",
    ],
  },
  {
    id: "chicken-vegetable-soy-noodles", meal: "dinner", tags: ["Quick", "Chinese"], name: "Chicken and vegetable soy noodles", blurb: "Quick noodles stir-fried with chicken strips, crunchy vegetables, garlic, soy and honey.", servings: 2, minutes: 15,
    ingredients: [ing("chicken", 250), ing("noodles", 300), ing("stir-fry-veg", 300), ing("garlic", 5, { note: "about 1 clove" }), ing("soy", 30), ing("honey", 10), ing("vegetable-oil", 10)],
    method: [
      "Slice the chicken: Cut the chicken into thin strips about 1 cm wide. Wash your hands and the board after touching raw chicken.",
      "Make the sauce: Stir the soy sauce, honey, garlic and 2 tablespoons of water together in a cup.",
      "Fry the chicken: Heat the oil in a large frying pan or wok over a high heat. Fry the chicken for 5 to 6 minutes, stirring, until golden.",
      "Add the vegetables: Tip in the stir-fry vegetables and stir-fry for 2 to 3 minutes, until they start to soften but still have some crunch.",
      "Add the noodles: Add the noodles, loosening them with your fingers as you drop them in, and stir-fry for 2 minutes, until hot.",
      "Add the sauce: Pour over the sauce and toss for 1 minute, until everything is coated and glossy.",
      "Check the chicken: Cut into the thickest strip: it must be piping hot all the way through, with no pink left.",
      "Serve: Twist the noodles into bowls with tongs or a fork and spoon the chicken and vegetables over the top.",
    ],
  },
  {
    id: "egg-spinach-pea-soy-noodles", meal: "dinner", tags: ["Quick", "Eggs", "Chinese"], name: "Egg, spinach and pea soy noodles", blurb: "Noodles stir-fried with scrambled egg, peas, spinach, spring onions and soy sauce.", servings: 2, minutes: 10,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("noodles", 300), ing("peas", 100), ing("spinach", 100), ing("spring-onions", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("soy", 30), ing("vegetable-oil", 15)],
    method: [
      "Get ready: Trim the spring onions and slice them thinly. Beat the eggs in a jug with a fork. Wash your hands after touching raw eggs.",
      "Scramble the eggs: Heat half the oil in a large frying pan or wok over a medium-high heat. Pour in the eggs and stir for 1 to 2 minutes, until just set in soft pieces. Tip them onto a plate.",
      "Fry the peas: Add the rest of the oil, the peas, garlic and most of the spring onions to the pan and stir-fry for 2 minutes.",
      "Add the noodles: Add the noodles, loosening them with your fingers as you drop them in, and stir-fry for 2 minutes, until hot.",
      "Wilt the spinach: Add the spinach and toss for 1 minute, until it wilts.",
      "Add the soy: Pour over the soy sauce, put the eggs back in and toss everything together for 30 seconds.",
      "Check it: The eggs should be fully set and everything hot. Taste and add a splash more soy if you like.",
      "Serve: Twist the noodles into bowls and scatter the rest of the spring onions on top.",
    ],
  },
  {
    id: "smoked-salmon-pea-spinach-omelette", meal: "dinner", tags: ["Quick", "Eggs", "Fish"], name: "Smoked salmon, pea and spinach omelette with salad", blurb: "A soft, folded omelette filled with smoked salmon, peas, spinach and soft cheese, with a tomato and leaf salad.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 360, { note: "about 6 eggs" }), ing("smoked-salmon", 100), ing("peas", 80), ing("spinach", 60), ing("soft-cheese", 40), ing("olive-oil", 10), ing("salad-leaves", 60), ing("cherry-tomatoes", 150), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Get the filling ready: Cook the peas in a mug of boiling water for 2 minutes, then drain. Tear the smoked salmon into strips.",
      "Make the salad: Halve the cherry tomatoes and toss them with the leaves, the lemon juice and a pinch of black pepper. Share it between plates.",
      "Beat the eggs: Beat half the eggs in a jug with some black pepper, for the first omelette. Wash your hands after touching raw eggs.",
      "Cook the first omelette: Heat half the oil in a non-stick frying pan over a medium heat. Pour in the eggs and tilt the pan to spread them. Cook for 2 minutes, pulling the edges in with a spatula, until nearly set.",
      "Fill it: Scatter half the spinach, peas and salmon over one half and dot with half the soft cheese. Cook for 1 minute more, until the egg is set underneath and just set on top.",
      "Fold and serve: Fold the empty half over the filling, slide the omelette onto a plate beside the salad.",
      "Cook the second: Make the second omelette the same way with the rest of the eggs, oil and filling.",
      "Serve: Eat straight away, while the omelettes are hot and soft.",
    ],
  },
  {
    id: "chickpea-spinach-curry-naan-quick", meal: "dinner", tags: ["Quick", "Indian"], name: "Quick chickpea and spinach curry with naan", blurb: "Chickpeas and spinach simmered in curry paste and tomatoes, with a spoonful of yogurt and warm naan.", servings: 2, minutes: 15,
    ingredients: [ing("chickpeas", 240), ing("chopped-tomatoes", 400), ing("curry-paste", 30), ing("spinach", 100), ing("vegetable-oil", 5), ing("greek-yogurt", 60), ing("naan", 260)],
    method: [
      "Drain the chickpeas: Tip the chickpeas into a sieve, rinse them under the cold tap and leave them to drain.",
      "Fry the paste: Heat the oil in a medium saucepan over a medium heat. Add the curry paste and stir for 1 minute, until it smells fragrant.",
      "Simmer: Add the chopped tomatoes and chickpeas and stir well. Bring to a bubble and simmer for 8 minutes, stirring now and then, until thick.",
      "Add the spinach: Stir in the spinach a handful at a time, until it wilts.",
      "Warm the naan: While the curry simmers, warm the naans in a toaster or a dry frying pan for 1 to 2 minutes, until soft and hot.",
      "Check it: Taste the curry. If it is too thick, stir in a splash of water.",
      "Serve the curry: Spoon the curry into bowls and top each with a spoonful of yogurt.",
      "Serve the naan: Tear the naans and serve them alongside, to scoop up the curry.",
    ],
  },
  {
    id: "warm-spiced-chickpea-spinach-wraps", meal: "dinner", tags: ["Vegan", "Quick", "Wrap"], name: "Warm spiced chickpea and spinach wraps", blurb: "Wraps filled with warm cumin and paprika chickpeas, spinach, tomatoes and houmous.", servings: 2, minutes: 15,
    ingredients: [ing("chickpeas", 240), ing("spinach", 80), ing("cherry-tomatoes", 150), ing("cumin", 2), ing("paprika", 2), ing("olive-oil", 10), ing("lemon-juice", 10), ing("houmous", 80), ing("wraps", 240, { note: "about 4 wraps" }), ing("salt", 1)],
    method: [
      "Drain the chickpeas: Tip the chickpeas into a sieve, rinse them under the cold tap and shake them dry.",
      "Fry the chickpeas: Heat the oil in a large frying pan over a medium-high heat. Add the chickpeas, cumin, paprika and a pinch of salt and fry for 5 minutes, stirring, until hot and starting to crisp.",
      "Add the tomatoes: Halve the cherry tomatoes, add them to the pan and cook for 2 minutes, until they soften.",
      "Wilt the spinach: Stir in the spinach until it wilts, then take the pan off the heat and stir in the lemon juice.",
      "Warm the wraps: Warm the wraps one at a time in a dry pan for about 20 seconds a side, so they fold without cracking.",
      "Spread the houmous: Spread the houmous down the middle of each wrap.",
      "Fill and roll: Spoon the warm chickpea mixture on top, fold in the sides and roll each wrap up tightly.",
      "Serve: Cut each wrap in half on the diagonal and serve straight away.",
    ],
  },
  {
    id: "tuna-sweetcorn-cheddar-quesadillas", meal: "dinner", tags: ["Quick", "Fish"], name: "Tuna, sweetcorn and cheddar quesadillas with salad", blurb: "Toasted wraps filled with tuna, sweetcorn, spring onion and melted cheddar, with a crunchy salad.", servings: 2, minutes: 15,
    ingredients: [ing("wraps", 240, { note: "about 4 wraps" }), ing("tuna", 102), ing("sweetcorn", 100), ing("cheddar", 60), ing("spring-onions", 30), ing("cherry-tomatoes", 150), ing("cucumber", 150), ing("lemon-juice", 10), ing("olive-oil", 5)],
    method: [
      "Drain the tuna: Tip the tuna into a sieve and press it with a spoon to squeeze out the water. Drain the sweetcorn too if it is tinned.",
      "Make the filling: Grate the cheddar and slice the spring onions thinly. Mix them in a bowl with the tuna and sweetcorn.",
      "Fill the wraps: Lay two wraps flat, spread the filling over them leaving about 2 cm clear at the edge, and put the other two wraps on top. Press down gently.",
      "Toast the first side: Heat a large dry non-stick frying pan over a medium heat. Cook one quesadilla for 2 to 3 minutes, until golden brown underneath.",
      "Toast the second side: Slide it onto a plate, put the pan over it, flip it back into the pan and cook for 2 to 3 minutes more, until golden and the cheese has melted.",
      "Cook the second: Cook the other quesadilla the same way.",
      "Make the salad: Halve the cherry tomatoes and slice the cucumber. Toss them with the lemon juice and oil.",
      "Serve: Leave the quesadillas for 1 minute, as the cheese is very hot, then cut each into quarters and serve with the salad.",
    ],
  },
  // ---- lunches for the cuisines with the fewest
  {
    id: "curried-chicken-wraps-cucumber-yogurt", meal: "lunch", tags: ["Indian", "Wrap"], name: "Curried chicken wraps with cucumber yogurt", blurb: "Curry-spiced chicken in warm wraps with a cool cucumber and yogurt sauce, lettuce and red onion.", servings: 2, minutes: 20,
    ingredients: [ing("chicken", 250), ing("curry-powder", 6), ing("greek-yogurt", 120), ing("lemon-juice", 10), ing("vegetable-oil", 10), ing("cucumber", 100), ing("lettuce", 60), ing("red-onion", 40), ing("wraps", 120, { note: "about 2 wraps" }), ing("salt", 1)],
    method: [
      "Marinate the chicken: Cut the chicken into thin strips. Mix it in a bowl with the curry powder, a third of the yogurt and a pinch of salt. Wash your hands and the board after touching raw chicken.",
      "Make the cucumber yogurt: Grate the cucumber, squeeze out the water in your hands and stir it into the rest of the yogurt with the lemon juice.",
      "Prepare the salad: Shred the lettuce. Peel the onion and slice it very thinly.",
      "Fry the chicken: Heat the oil in a large frying pan over a medium-high heat. Fry the chicken for 6 to 8 minutes, turning it, until golden and piping hot all the way through with no pink left.",
      "Warm the wraps: Warm the wraps one at a time in a dry pan for about 20 seconds a side.",
      "Fill and serve: Spread the cucumber yogurt over each wrap, add the lettuce, onion and chicken, fold in the sides and roll up. Cut in half and serve.",
    ],
  },
  {
    id: "curried-chickpea-salad-wraps", meal: "lunch", tags: ["Indian", "Wrap", "No cook"], name: "Curried chickpea salad wraps", blurb: "Crushed chickpeas in a curried yogurt dressing with cucumber and lettuce, rolled in wraps.", servings: 2, minutes: 10,
    ingredients: [ing("chickpeas", 240), ing("greek-yogurt", 80), ing("curry-powder", 4), ing("lemon-juice", 10), ing("cucumber", 100), ing("lettuce", 60), ing("raisins", 20), ing("wraps", 120, { note: "about 2 wraps" }), ing("salt", 1)],
    method: [
      "Crush the chickpeas: Rinse and drain the chickpeas, then crush them roughly in a bowl with a fork, leaving some whole.",
      "Make the dressing: Stir the yogurt, curry powder, lemon juice and a pinch of salt together, then mix it into the chickpeas with the raisins.",
      "Prepare the salad: Cut the cucumber into thin sticks and shred the lettuce.",
      "Fill the wraps: Spread the chickpea mixture down the middle of each wrap and top with the lettuce and cucumber.",
      "Roll up: Fold in the sides and roll each wrap up tightly.",
      "Serve: Cut in half on the diagonal and serve, or wrap them up and keep them in the fridge for up to a day.",
    ],
  },
  {
    id: "chicken-shawarma-style-salad-houmous", meal: "lunch", tags: ["Salad"], name: "Chicken shawarma-style salad with houmous", blurb: "Warm spiced chicken on leaves, cucumber and tomatoes, with a spoonful of houmous and lemon.", servings: 2, minutes: 20,
    ingredients: [ing("chicken", 300), ing("cumin", 2), ing("paprika", 2), ing("turmeric", 1), ing("cinnamon", 1), ing("garlic", 5, { note: "about 1 clove" }), ing("lemon-juice", 20), ing("olive-oil", 15), ing("salad-leaves", 80), ing("cucumber", 150), ing("cherry-tomatoes", 150), ing("houmous", 80), ing("salt", 1)],
    method: [
      "Spice the chicken: Cut the chicken into thin strips. Mix it in a bowl with the cumin, paprika, turmeric, cinnamon, garlic, half the lemon juice, half the oil and a pinch of salt. Wash your hands after touching raw chicken.",
      "Fry the chicken: Heat a large frying pan over a medium-high heat. Fry the chicken for 6 to 8 minutes, turning it, until golden and piping hot all the way through with no pink left.",
      "Prepare the salad: Rinse the cucumber and cut it into half-moons. Halve the cherry tomatoes.",
      "Dress the salad: Toss the leaves, cucumber and tomatoes with the rest of the lemon juice and oil.",
      "Plate up: Share the salad between plates or boxes and lay the warm chicken on top.",
      "Serve: Add a spoonful of houmous to each and serve straight away.",
    ],
  },
  // ---- paleo dinners (no grains, beans or dairy; low in carbs too) and a lunch
  {
    id: "paprika-chicken-pepper-broccoli-traybake", meal: "dinner", tags: ["One pan", "Bake"], name: "Paprika chicken traybake with peppers and broccoli", blurb: "Chicken thighs roasted with paprika, peppers, red onion and broccoli in olive oil and lemon.", servings: 2, minutes: 45,
    ingredients: [ing("chicken-thigh", 400), ing("peppers", 320, { note: "about 2 peppers" }), ing("red-onion", 150, { note: "about 1 onion" }), ing("broccoli", 200), ing("paprika", 3), ing("cumin", 1), ing("olive-oil", 20), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6).",
      "Cut the vegetables: Cut the peppers in half, scoop out the seeds and cut them into chunks. Peel the onion and cut it into wedges.",
      "Season the chicken: Toss the chicken thighs on a large roasting tray with the paprika, cumin, a pinch of salt, black pepper and half the oil. Wash your hands after touching raw chicken.",
      "Add the vegetables: Add the peppers and onion to the tray with the rest of the oil and toss. Spread everything out in one layer, with the chicken on top.",
      "Roast: Roast on the middle shelf for 20 minutes, until the peppers start to soften and brown at the edges.",
      "Add the broccoli: Cut the broccoli into florets, add them to the tray, turn everything in the juices and roast for 12 to 15 minutes more, until the chicken is golden.",
      "Check the chicken: Cut into the thickest thigh: it must be piping hot all the way through, with no pink left. If not, roast for a few minutes more.",
      "Serve: Squeeze over the lemon juice and serve straight from the tray.",
    ],
  },
  {
    id: "roast-salmon-peppers-tomatoes-spinach", meal: "dinner", tags: ["Fish", "One pan"], name: "Roast salmon with peppers, tomatoes and spinach", blurb: "Salmon roasted on a tray of soft peppers and cherry tomatoes, with garlicky spinach.", servings: 2, minutes: 35,
    ingredients: [ing("salmon", 240, { note: "about 2 fillets" }), ing("peppers", 320, { note: "about 2 peppers" }), ing("cherry-tomatoes", 200), ing("spinach", 100), ing("garlic", 5, { note: "about 1 clove" }), ing("paprika", 1), ing("olive-oil", 15), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6).",
      "Roast the peppers: Cut the peppers in half, scoop out the seeds and cut them into strips. Toss them on a roasting tray with most of the oil and the paprika, and roast for 12 minutes.",
      "Add the tomatoes: Add the cherry tomatoes to the tray and stir.",
      "Add the salmon: Season the salmon with a pinch of salt and black pepper and lay it on top of the vegetables, skin side down.",
      "Roast: Roast for 12 to 15 minutes, until the salmon is cooked through and flakes easily, and the tomatoes have split.",
      "Wilt the spinach: While it roasts, heat the rest of the oil in a pan over a medium heat, add the garlic and spinach and stir for 1 to 2 minutes, until wilted.",
      "Add the lemon: Squeeze the lemon juice over the salmon and vegetables.",
      "Serve: Share the spinach between plates and spoon the peppers, tomatoes and salmon on top with the tray juices.",
    ],
  },
  {
    id: "tuna-egg-cucumber-lemon-salad", meal: "lunch", tags: ["Salad", "Eggs", "Fish"], name: "Tuna, egg and cucumber salad with lemon", blurb: "Tuna, boiled eggs, cucumber, cherry tomatoes and leaves with a lemon and olive oil dressing.", servings: 2, minutes: 20,
    ingredients: [ing("tuna", 102), ing("eggs", 240, { note: "about 4 eggs" }), ing("cucumber", 150), ing("cherry-tomatoes", 150), ing("salad-leaves", 60), ing("olive-oil", 15), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Boil the eggs: Lower the eggs into a pan of boiling water on a spoon and boil for 9 minutes, until the whites and yolks are completely set. Wash your hands after touching raw eggs.",
      "Cool the eggs: Move the eggs into a bowl of cold water for 5 minutes, then peel them and cut them into quarters.",
      "Drain the tuna: Tip the tuna into a sieve and press it with a spoon to squeeze out the water.",
      "Make the dressing: Whisk the oil, lemon juice and some black pepper together in a large bowl.",
      "Toss the salad: Halve the cherry tomatoes and slice the cucumber. Add them to the dressing with the leaves and toss gently.",
      "Serve: Share the salad between plates or boxes, flake the tuna on top and add the eggs.",
    ],
  },
];

export const FAST_MEALS_LOOKS: Readonly<Record<string, string>> = {
  "paprika-chicken-pepper-wraps": "Two tortilla wraps cut in half on a round white plate, the cut ends showing golden paprika-dusted chicken strips, soft red pepper strips, green leaves and a white yogurt sauce inside.",
  "chicken-vegetable-soy-noodles": "A wide white bowl of glossy brown soy noodles tangled with golden chicken strips and a colourful mix of crunchy stir-fried vegetables in thin strips, red, orange, green and pale yellow.",
  "egg-spinach-pea-soy-noodles": "A wide white bowl of glossy soy noodles tossed with soft yellow pieces of scrambled egg, bright green peas and dark wilted spinach, topped with thin green spring onion rings.",
  "smoked-salmon-pea-spinach-omelette": "A soft golden folded omelette on a white plate, pink-orange smoked salmon, green peas and dark spinach peeking out of the fold, beside a small salad of green leaves and halved red cherry tomatoes.",
  "chickpea-spinach-curry-naan-quick": "A round white bowl of thick red chickpea curry with dark green wilted spinach, topped with a swirl of white yogurt, beside a warm golden naan torn into pieces.",
  "warm-spiced-chickpea-spinach-wraps": "A tortilla wrap cut in half on the diagonal on a round white plate, the cut ends showing warm golden spiced chickpeas, soft red cherry tomatoes, dark green spinach and a layer of creamy beige houmous.",
  "tuna-sweetcorn-cheddar-quesadillas": "Golden toasted quesadilla quarters on a white plate, the cut edges showing melted orange cheddar, flaked pale pink tuna, yellow sweetcorn and green spring onion, beside halved cherry tomatoes and cucumber slices.",
  "curried-chicken-wraps-cucumber-yogurt": "A tortilla wrap cut in half on a round white plate, the cut ends showing golden-orange curry-spiced chicken, shredded green lettuce, thin purple onion slices and a pale green cucumber yogurt sauce.",
  "curried-chickpea-salad-wraps": "A tortilla wrap cut in half on the diagonal on a white plate, the cut ends showing a pale golden curried chickpea filling with dark raisins, crisp green lettuce and cucumber sticks.",
  "chicken-shawarma-style-salad-houmous": "A wide white bowl of green leaves, cucumber half-moons and halved red cherry tomatoes topped with golden spiced chicken strips and a generous spoonful of creamy beige houmous.",
  "paprika-chicken-pepper-broccoli-traybake": "A roasting tray of golden paprika-red chicken thighs on charred red and yellow pepper chunks, soft red onion wedges and roasted bright green broccoli florets.",
  "roast-salmon-peppers-tomatoes-spinach": "Two roasted salmon fillets resting on soft red and yellow pepper strips and split cherry tomatoes in a roasting tray, beside dark green wilted spinach, glossy with olive oil.",
  "tuna-egg-cucumber-lemon-salad": "A wide white bowl of green salad leaves, cucumber slices and halved red cherry tomatoes topped with flaked pale pink tuna and quartered boiled eggs with bright yellow yolks.",
};
