import { ing, type Recipe } from "../recipes";

// Home-style dinners (British, Italian, batch cooking, one-pan, fish). See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const DINNER_HOME: readonly Recipe[] = [
  {
    id: "spaghetti-bolognese", meal: "dinner", tags: ["Italian", "Batch cook"], name: "Spaghetti bolognese", blurb: "The family classic with a rich tomato sauce.", servings: 4, minutes: 40,
    ingredients: [ing("beef-mince", 500), ing("passata", 500), ing("chopped-tomato-puree", 30), ing("pasta-long", 320), ing("cheddar", 30), ing("onion", 150, { note: "about 1 onion" }), ing("carrots", 100, { note: "about 1 carrot" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("oregano", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Brown the mince in a large pan, breaking it up with a spoon, until no pink is left.",
      "Stir in the tomato purée and passata and simmer for 20 minutes.",
      "Cook the spaghetti as the pack says.",
      "Serve the sauce on the spaghetti with the cheese grated over.",
    ],
  },
  {
    id: "beef-pasta-bake", meal: "dinner", tags: ["Italian", "Bake"], name: "Cheesy beef pasta bake", blurb: "Pasta in a rich beef and tomato sauce, baked under a creamy cheese topping.", servings: 4, minutes: 50,
    ingredients: [ing("beef-mince", 500), ing("passata", 500), ing("chopped-tomato-puree", 30), ing("pasta-shapes", 250), ing("soft-cheese", 200), ing("milk", 100), ing("mozzarella", 125), ing("onion", 150, { note: "about 1 onion" }), ing("carrots", 100, { note: "about 1 carrot" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("oregano", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Brown the mince in a large pan until no pink is left, then stir in the passata and tomato purée and simmer for 10 minutes.",
      "Cook the pasta for 2 minutes less than the pack says, then drain and stir it into the sauce.",
      "Beat the soft cheese with the milk until smooth.",
      "Tip the pasta into an ovenproof dish, spoon the cheese sauce over and tear the mozzarella on top.",
      "Bake for 20 to 25 minutes, until golden and bubbling.",
    ],
  },
  {
    id: "cottage-pie", meal: "dinner", tags: ["British", "Bake"], name: "Cottage pie with cheesy mash", blurb: "Savoury beef mince under a mashed potato top with melted cheddar.", servings: 4, minutes: 60,
    ingredients: [ing("beef-mince", 500), ing("peas", 150), ing("chopped-tomato-puree", 30), ing("stock-cube", 10), ing("new-potatoes", 800), ing("cheddar", 40), ing("onion", 150, { note: "about 1 onion" }), ing("carrots", 100, { note: "about 1 carrot" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Brown the mince in a large pan until no pink is left.",
      "Stir in the tomato purée, the peas and the stock cube or pot dissolved in 300 ml of boiling water. Simmer for 15 minutes until thick.",
      "Meanwhile, warm the drained potatoes in a pan of boiling water for 5 minutes, then drain and mash them.",
      "Spoon the mince into an ovenproof dish, spread the mash on top and grate the cheese over.",
      "Bake for 20 to 25 minutes, until golden on top and piping hot.",
    ],
  },
  {
    id: "chicken-mozzarella-pasta-bake", meal: "dinner", tags: ["Italian", "Bake"], name: "Chicken, tomato and mozzarella pasta bake", blurb: "Pasta, chicken and tomato sauce under bubbling mozzarella.", servings: 4, minutes: 40,
    ingredients: [ing("chicken", 480), ing("pasta-shapes", 300), ing("passata", 500), ing("mozzarella", 125), ing("garlic", 10, { note: "about 2 cloves" }), ing("oregano", 1), ing("spinach", 45), ing("oil-spray", 2)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6). Cook the pasta for 2 minutes less than the pack says, then drain.",
      "Cut the chicken into bite-sized pieces and cook in a hot non-stick pan for 6 to 8 minutes, until cooked through with no pink inside.",
      "Stir in the passata and the pasta, then tip everything into an ovenproof dish.",
      "Tear the mozzarella over the top and bake for 20 minutes, until golden and bubbling.",
    ],
  },
  {
    id: "salmon-new-potatoes-peas", meal: "dinner", tags: ["Fish", "Quick"], name: "Salmon with new potatoes and peas", blurb: "Oven-baked salmon with buttery-soft potatoes and sweet peas.", servings: 2, minutes: 25,
    ingredients: [ing("salmon", 280), ing("new-potatoes", 400), ing("peas", 160), ing("lemon-juice", 15), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6). Put the salmon on a lined baking tray and season it.",
      "Bake for 12 to 15 minutes, until the fish flakes easily.",
      "Meanwhile, warm the drained potatoes in a pan of boiling water for 5 minutes, adding the peas for the last 3 minutes, then drain.",
      "Serve the salmon with the potatoes and peas and a squeeze of lemon.",
    ],
  },
  {
    id: "pesto-salmon-crushed-potatoes", meal: "dinner", tags: ["Fish", "Quick"], name: "Pesto salmon with crushed potatoes", blurb: "Salmon baked under green pesto with roasted cherry tomatoes.", servings: 2, minutes: 25,
    ingredients: [ing("salmon", 240), ing("pesto", 30), ing("new-potatoes", 400), ing("olive-oil", 10), ing("cherry-tomatoes", 100), ing("broccoli", 150), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Put the salmon on a lined baking tray, spread the pesto over the top and scatter the cherry tomatoes around it.",
      "Bake for 12 to 15 minutes, until the fish flakes easily.",
      "Meanwhile, warm the drained potatoes in boiling water for 5 minutes, drain, then gently crush them with a fork and the olive oil.",
      "Cook the broccoli in boiling water for 3 to 4 minutes and serve it with the salmon, tomatoes and potatoes.",
    ],
  },
  {
    id: "ham-egg-potatoes", meal: "dinner", tags: ["British", "Quick"], name: "Ham, egg and crispy potatoes with peas", blurb: "A pub-style dinner made at home.", servings: 2, minutes: 25,
    ingredients: [ing("ham", 200), ing("eggs", 240, { note: "about 4 eggs" }), ing("new-potatoes", 400), ing("peas", 160), ing("olive-oil", 15), ing("mustard", 5), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Halve the drained potatoes and fry them in most of the oil in a non-stick pan for 10 to 12 minutes, turning, until golden, then season with salt and pepper.",
      "Cook the peas in boiling water for 3 minutes and drain.",
      "Fry the eggs in the rest of the oil until the whites are set.",
      "Serve the eggs with the ham, potatoes and peas, and a little mustard on the side.",
    ],
  },
  {
    id: "chicken-thigh-potato-traybake", meal: "dinner", tags: ["One pan", "British"], name: "Chicken thigh and potato traybake", blurb: "Everything roasts together in one tin.", servings: 4, minutes: 50,
    ingredients: [ing("chicken-thigh", 600), ing("new-potatoes", 800), ing("olive-oil", 15), ing("red-onion", 150, { note: "about 1 red onion" }), ing("peppers", 320, { note: "about 2 peppers" }), ing("paprika", 2), ing("garlic", 10, { note: "about 2 cloves" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Put the chicken thighs, the drained potatoes and the sliced onion and peppers in a large roasting tin.",
      "Toss with the oil, paprika, salt and pepper and spread out in one layer.",
      "Roast for 35 to 40 minutes, turning once, until the potatoes are golden and the chicken is cooked through with no pink inside.",
    ],
  },
  {
    id: "potato-tomato-mozzarella-bake", meal: "dinner", tags: ["Italian", "Bake"], name: "Potato, tomato and mozzarella bake", blurb: "Soft potatoes in tomato sauce under melted mozzarella, no meat.", servings: 3, minutes: 35,
    ingredients: [ing("new-potatoes", 720), ing("chopped-tomatoes", 400), ing("mozzarella", 125), ing("garlic", 10, { note: "about 2 cloves" }), ing("oregano", 1), ing("oil-spray", 2), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Fry the garlic in a pan with a little oil spray for a minute, add the chopped tomatoes and oregano and simmer for 10 minutes.",
      "Halve the drained potatoes and stir them into the sauce with a little salt and pepper.",
      "Tip into an ovenproof dish, tear the mozzarella over and bake for 15 to 20 minutes, until golden and bubbling.",
    ],
  },
  {
    id: "easy-macaroni-cheese", meal: "dinner", tags: ["British", "Quick"], name: "Easy macaroni cheese", blurb: "A creamy cheese sauce made in the pasta pan, finished under the grill.", servings: 4, minutes: 25,
    ingredients: [ing("pasta-shapes", 300), ing("soft-cheese", 200), ing("cheddar", 100), ing("milk", 200), ing("mustard", 5), ing("black-pepper", 1), ing("tomatoes", 180)],
    method: [
      "Cook the macaroni or other pasta shapes as the pack says, then drain.",
      "In the same pan, warm the milk and soft cheese over a low heat, stirring until smooth.",
      "Take off the heat and stir in most of the grated cheddar, then the pasta.",
      "Tip into an ovenproof dish, scatter over the rest of the cheese and grill for 3 to 5 minutes, until golden.",
    ],
  },
  {
    id: "bacon-carbonara-spaghetti", meal: "dinner", tags: ["Italian", "Quick"], name: "Bacon carbonara-style spaghetti", blurb: "Spaghetti in a silky egg and cheese sauce with crispy bacon.", servings: 2, minutes: 20,
    ingredients: [ing("pasta-long", 180), ing("bacon", 150), ing("eggs", 120, { note: "about 2 eggs" }), ing("cheddar", 30), ing("black-pepper", 1), ing("garlic", 5, { note: "about 1 clove" })],
    method: [
      "Cook the spaghetti as the pack says. Keep a mugful of the cooking water before you drain it.",
      "Meanwhile, cut the bacon into strips and fry in a non-stick pan until golden.",
      "Beat the eggs with most of the grated cheese and plenty of black pepper.",
      "Tip the drained spaghetti into the bacon pan on a low heat, pour in the egg mix and a splash of the cooking water, and keep stirring for 1 to 2 minutes until the egg is cooked into a thick, creamy sauce.",
      "Serve with the rest of the cheese on top.",
    ],
  },
  {
    id: "beef-meatballs-spaghetti", meal: "dinner", tags: ["Italian", "Batch cook"], name: "Beef meatballs with spaghetti", blurb: "Herby meatballs simmered in tomato sauce.", servings: 4, minutes: 40,
    ingredients: [ing("beef-mince", 500), ing("passata", 500), ing("pasta-long", 320), ing("garlic", 10, { note: "about 2 cloves" }), ing("mixed-herbs", 1), ing("oil-spray", 2), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Mix the beef mince with the garlic, herbs, salt and pepper, and roll into about 16 small balls.",
      "Brown the meatballs in a non-stick pan for 5 minutes, turning them often.",
      "Pour in the passata, cover and simmer for 15 minutes, until the meatballs are cooked through with no pink inside.",
      "Cook the spaghetti as the pack says and serve with the meatballs and sauce.",
    ],
  },
  {
    id: "salmon-fish-pie", meal: "dinner", tags: ["British", "Bake"], name: "Salmon and pea fish pie", blurb: "Chunks of salmon and peas in a creamy sauce under a mashed potato top.", servings: 4, minutes: 55,
    ingredients: [ing("salmon", 480), ing("peas", 200), ing("soft-cheese", 200), ing("milk", 150), ing("new-potatoes", 800), ing("cheddar", 40), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Beat the soft cheese with the milk, a squeeze of lemon and a little salt until smooth.",
      "Cut the salmon into large chunks and put it in an ovenproof dish with the peas, then pour the sauce over.",
      "Meanwhile, warm the drained potatoes in boiling water for 5 minutes, drain and mash them with a splash of the cooking water and black pepper.",
      "Spread the mash over the fish, grate the cheese on top and bake for 25 to 30 minutes, until golden and the fish flakes easily.",
    ],
  },
  {
    id: "bean-cottage-pie", meal: "dinner", tags: ["British", "Bake"], name: "Bean and mushroom cottage pie", blurb: "A meat-free cottage pie with beans, mushrooms and a mashed potato top.", servings: 4, minutes: 55,
    ingredients: [ing("kidney-beans", 480), ing("mushrooms", 250), ing("peas", 150), ing("chopped-tomatoes", 400), ing("chopped-tomato-puree", 30), ing("stock-cube", 10), ing("new-potatoes", 800), ing("olive-oil", 10), ing("onion", 150, { note: "about 1 onion" }), ing("carrots", 100, { note: "about 1 carrot" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("mixed-herbs", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Soften the chopped onion, carrot and mushrooms in half the oil in a large pan for 5 minutes.",
      "Add the drained beans, the peas, the chopped tomatoes, the tomato purée, the dried herbs and the stock cube or pot with 150 ml of boiling water. Simmer for 15 minutes until thick.",
      "Meanwhile, warm the drained potatoes in boiling water for 5 minutes, then drain and mash them with the rest of the oil.",
      "Spoon the filling into an ovenproof dish, cover with the mash and bake for 20 to 25 minutes, until golden on top.",
    ],
  },
  {
    id: "chicken-chickpea-stew", meal: "dinner", tags: ["One pan", "Batch cook"], name: "Chicken and chickpea stew", blurb: "Chicken and chickpeas in a paprika and tomato sauce.", servings: 4, minutes: 40,
    ingredients: [ing("chicken", 480), ing("chickpeas", 480, { role: "carb" }), ing("chopped-tomatoes", 400), ing("stock-cube", 10), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("paprika", 2), ing("spinach", 90), ing("oil-spray", 2)],
    method: [
      "Cut the chicken into chunks and brown it in a large non-stick pan for 5 minutes.",
      "Add the chopped onion, garlic and paprika and cook for 2 minutes.",
      "Stir in the chopped tomatoes, the drained chickpeas and the stock cube or pot with 200 ml of boiling water.",
      "Cover and simmer for 20 minutes, until the chicken is cooked through with no pink inside.",
      "Stir in the spinach until it wilts, then serve.",
    ],
  },
  {
    id: "bacon-tomato-linguine", meal: "dinner", tags: ["Italian"], name: "Bacon and tomato linguine", blurb: "Crispy bacon in a garlicky tomato sauce with a little chilli.", servings: 3, minutes: 25,
    ingredients: [ing("bacon", 180), ing("pasta-long", 240), ing("chopped-tomatoes", 400), ing("olive-oil", 10), ing("garlic", 10, { note: "about 2 cloves" }), ing("chilli-powder", 1), ing("black-pepper", 1)],
    method: [
      "Cook the linguine as the pack says.",
      "Meanwhile, cut the bacon into strips and fry it in the oil in a large pan until golden and cooked through.",
      "Add the garlic and chilli powder and fry for a minute, then add the chopped tomatoes and simmer for 8 minutes.",
      "Toss the drained linguine in the sauce, season with black pepper and serve.",
    ],
  },
  {
    id: "chickpea-potato-traybake", meal: "dinner", tags: ["One pan", "Bake"], name: "Chickpea, potato and pepper traybake", blurb: "Roasted potatoes, chickpeas and peppers with warm spices.", servings: 3, minutes: 45,
    ingredients: [ing("chickpeas", 480), ing("new-potatoes", 600), ing("olive-oil", 15), ing("red-onion", 150, { note: "about 1 red onion" }), ing("peppers", 320, { note: "about 2 peppers" }), ing("cherry-tomatoes", 150), ing("cumin", 2), ing("paprika", 2), ing("lemon-juice", 15)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Put the halved drained potatoes, the drained chickpeas and the sliced peppers and onion in a large roasting tin. Toss with the oil and spices and roast for 20 minutes.",
      "Add the cherry tomatoes and roast for another 15 minutes, until the potatoes are golden.",
      "Serve with a squeeze of lemon.",
    ],
  },
  {
    id: "minestrone-beans-pasta", meal: "dinner", tags: ["Italian", "Batch cook"], name: "Minestrone with beans and pasta", blurb: "A thick Italian vegetable soup with kidney beans and pasta.", servings: 3, minutes: 35,
    ingredients: [ing("pasta-shapes", 120), ing("kidney-beans", 240), ing("peas", 100), ing("chopped-tomatoes", 400), ing("stock-cube", 10), ing("olive-oil", 10), ing("onion", 150, { note: "about 1 onion" }), ing("carrots", 100, { note: "about 1 carrot" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("mixed-herbs", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Warm the oil in a large pan and soften the chopped onion and carrot for 5 minutes.",
      "Add the chopped tomatoes and the stock cube or pot with 750 ml of boiling water. Simmer for 10 minutes.",
      "Add the pasta, the peas and the drained kidney beans and simmer for 10 to 12 minutes, until the pasta is soft.",
      "Season and serve in bowls.",
    ],
  },
];
