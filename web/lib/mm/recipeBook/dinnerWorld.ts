import { ing, type Recipe } from "../recipes";

// Dinners from around the world (Asian, Indian, Mexican, Middle Eastern). See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const DINNER_WORLD: readonly Recipe[] = [
  {
    id: "chicken-jalfrezi", meal: "dinner", tags: ["Indian"], name: "Chicken jalfrezi with rice", blurb: "Chicken and peppers in a punchy tomato and chilli sauce.", servings: 3, minutes: 35,
    ingredients: [ing("chicken", 450), ing("curry-paste", 60), ing("chopped-tomatoes", 400), ing("rice", 210), ing("onion", 150, { note: "about 1 onion" }), ing("peppers", 320, { note: "about 2 peppers" }), ing("chilli-powder", 2), ing("vegetable-oil", 8)],
    method: [
      "Cook the rice as the pack says.",
      "Cut the chicken into chunks. Fry the onion and peppers in a large pan with a little oil for 5 minutes.",
      "Add the chicken, curry paste and chilli powder and fry for 3 to 4 minutes, stirring.",
      "Pour in the tomatoes and simmer for 15 minutes, until the chicken is cooked through with no pink left.",
      "Serve with the rice.",
    ],
  },
  {
    id: "beef-keema-peas", meal: "dinner", tags: ["Indian", "Batch cook"], name: "Beef keema with peas and rice", blurb: "Spiced beef mince and peas in a rich tomato sauce.", servings: 4, minutes: 40,
    ingredients: [ing("beef-mince", 500), ing("curry-paste", 60), ing("chopped-tomatoes", 400), ing("peas", 200), ing("rice", 280), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("vegetable-oil", 8)],
    method: [
      "Cook the rice as the pack says.",
      "Fry the onion in a large pan with a little oil for 5 minutes, then add the beef mince and cook, breaking it up, until no pink is left.",
      "Stir in the curry paste and garlic and cook for a minute.",
      "Add the tomatoes and simmer for 15 minutes, then stir in the peas and cook for 5 minutes more, until piping hot.",
      "Serve with the rice.",
    ],
  },
  {
    id: "egg-pea-curry", meal: "dinner", tags: ["Indian"], name: "Egg and pea curry", blurb: "Boiled eggs and sweet peas in a spiced tomato sauce, with rice.", servings: 3, minutes: 30,
    ingredients: [ing("eggs", 360, { note: "about 6 eggs" }), ing("curry-paste", 60), ing("chopped-tomatoes", 400), ing("peas", 300), ing("rice", 210), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("vegetable-oil", 8)],
    method: [
      "Cook the rice as the pack says.",
      "Boil the eggs for 9 to 10 minutes, until the yolks are set, then cool them in cold water, peel and cut in half.",
      "Fry the onion in a large pan with a little oil for 5 minutes, then stir in the curry paste and garlic for a minute.",
      "Add the tomatoes and a splash of water and simmer for 10 minutes.",
      "Add the peas and eggs and cook for 5 minutes more, until the peas are tender. Serve with the rice.",
    ],
  },
  {
    id: "kidney-bean-curry", meal: "dinner", tags: ["Indian", "Batch cook"], name: "Kidney bean curry with rice", blurb: "Kidney beans simmered in a spiced tomato sauce, served with rice.", servings: 4, minutes: 35,
    ingredients: [ing("kidney-beans", 480), ing("chopped-tomatoes", 400), ing("curry-paste", 60), ing("rice", 250), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("lemon-juice", 10), ing("vegetable-oil", 8)],
    method: [
      "Fry the onion in a large pan with a little oil for 5 minutes, then stir in the curry paste and garlic for a minute.",
      "Add the drained beans, the tomatoes and 200 ml of water, and simmer for 20 minutes, stirring now and then.",
      "Cook the rice as the pack says.",
      "Stir a squeeze of lemon into the curry and serve with the rice.",
    ],
  },
  {
    id: "chicken-chow-mein", meal: "dinner", tags: ["Chinese", "Quick"], name: "Chicken chow mein", blurb: "Noodles tossed with chicken, crunchy vegetables and soy sauce.", servings: 2, minutes: 20,
    ingredients: [ing("chicken", 300), ing("noodles", 300), ing("soy", 30), ing("stir-fry-veg", 300), ing("spring-onions", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("vegetable-oil", 5)],
    method: [
      "Slice the chicken into strips and stir-fry in a hot wok or large frying pan with a little oil for 6 to 8 minutes, until cooked through with no pink left.",
      "Add the vegetables and garlic and stir-fry for 3 to 4 minutes.",
      "Add the noodles and soy sauce and toss everything together for 2 minutes, until piping hot. Top with spring onions.",
    ],
  },
  {
    id: "sticky-beef-noodles", meal: "dinner", tags: ["Chinese", "Quick"], name: "Sticky soy beef noodles", blurb: "Beef mince, broccoli and noodles in a sticky soy and honey sauce.", servings: 2, minutes: 20,
    ingredients: [ing("beef-mince", 300), ing("noodles", 300), ing("soy", 30), ing("honey", 15), ing("garlic", 5, { note: "about 1 clove" }), ing("broccoli", 150), ing("peppers", 160, { note: "about 1 pepper" }), ing("spring-onions", 30), ing("vegetable-oil", 5)],
    method: [
      "Brown the mince in a hot wok or large frying pan with a little oil, breaking it up, until no pink is left.",
      "Add the garlic, the sliced pepper and the broccoli and stir-fry for 3 to 4 minutes.",
      "Mix the soy sauce and honey, pour it in with the noodles and toss for 2 minutes, until everything is hot and glossy. Top with spring onions.",
    ],
  },
  {
    id: "sweet-chilli-chicken", meal: "dinner", tags: ["Thai", "Quick"], name: "Sweet chilli chicken stir-fry", blurb: "Chicken and crunchy vegetables in sweet chilli sauce, with rice.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 300), ing("sweet-chilli", 60), ing("rice", 150), ing("peppers", 160, { note: "about 1 pepper" }), ing("broccoli", 100), ing("spring-onions", 30), ing("lemon-juice", 15), ing("vegetable-oil", 5)],
    method: [
      "Cook the rice as the pack says.",
      "Slice the chicken into strips and stir-fry in a hot pan with a little oil for 6 to 8 minutes, until cooked through with no pink left.",
      "Add the pepper, broccoli and spring onions and stir-fry for 2 to 3 minutes.",
      "Stir in the sweet chilli sauce and a squeeze of lemon, toss to coat and serve with the rice.",
    ],
  },
  {
    id: "spiced-chicken-naan", meal: "dinner", tags: ["Indian"], name: "Spiced yogurt chicken with naan", blurb: "Chicken marinated in curry paste and yogurt, roasted with peppers and onion, served with warm naan.", servings: 3, minutes: 40,
    ingredients: [ing("chicken", 450), ing("curry-paste", 45), ing("greek-yogurt", 150), ing("naan", 330), ing("lemon-juice", 15), ing("peppers", 320, { note: "about 2 peppers" }), ing("onion", 150, { note: "about 1 onion" }), ing("vegetable-oil", 8)],
    method: [
      "Heat the oven to 200°C (180°C fan).",
      "Mix the curry paste with the yogurt and a squeeze of lemon, then stir in the chicken, cut into chunks.",
      "Leave for 10 minutes, or longer in the fridge if you have time.",
      "Cut the peppers into chunks and the onion into wedges, and toss them with the oil in a large roasting tin.",
      "Add the chicken in one layer and roast for 20 to 25 minutes, turning once, until golden and cooked through with no pink left.",
      "Warm the naan breads in the oven or a dry pan.",
      "Serve the chicken and vegetables with the naan.",
    ],
  },
  {
    id: "chicken-fajitas", meal: "dinner", tags: ["Mexican", "Quick"], name: "Chicken fajitas with salsa", blurb: "Spiced chicken and peppers in warm wraps with salsa and yogurt.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 300), ing("fajita-seasoning", 15), ing("wraps", 240, { fit: [0.5, 2] }), ing("salsa", 100), ing("greek-yogurt", 100), ing("peppers", 320, { note: "about 2 peppers" }), ing("onion", 150, { note: "about 1 onion" }), ing("vegetable-oil", 5)],
    method: [
      "Slice the chicken, peppers and onion into strips and toss with the fajita seasoning.",
      "Cook in a hot pan with a little oil for 8 to 10 minutes, until the chicken is cooked through with no pink left.",
      "Warm the wraps in a dry pan or the microwave.",
      "Fill the wraps with the chicken and vegetables and top with the salsa and yogurt.",
    ],
  },
  {
    id: "beef-burrito-bowl", meal: "dinner", tags: ["Mexican", "Batch cook"], name: "Beef burrito bowl", blurb: "Spiced beef mince, rice, kidney beans, sweetcorn and salsa in one bowl.", servings: 4, minutes: 30,
    ingredients: [ing("beef-mince", 500), ing("fajita-seasoning", 20), ing("rice", 240), ing("kidney-beans", 240, { role: "other" }), ing("sweetcorn", 160), ing("salsa", 200), ing("lettuce", 90)],
    method: [
      "Cook the rice as the pack says.",
      "Brown the mince in a large pan, breaking it up, until no pink is left.",
      "Stir in the fajita seasoning and a splash of water and cook for 2 minutes.",
      "Warm the kidney beans and sweetcorn in a small pan or the microwave until piping hot.",
      "Share the rice between bowls and top with the shredded lettuce, beef, beans, sweetcorn and salsa.",
    ],
  },
  {
    id: "chicken-shawarma-wraps", meal: "dinner", tags: ["Middle Eastern"], name: "Chicken shawarma-style wraps", blurb: "Warmly spiced chicken thighs in wraps with garlic yogurt and salad.", servings: 3, minutes: 35,
    ingredients: [ing("chicken-thigh", 450), ing("natural-yogurt", 150), ing("wraps", 360, { fit: [0.5, 2] }), ing("cumin", 2), ing("paprika", 2), ing("garlic", 10, { note: "about 2 cloves" }), ing("lemon-juice", 15), ing("lettuce", 90), ing("tomatoes", 120), ing("cucumber", 120), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Mix half the yogurt with the cumin, paprika, a crushed garlic clove and the lemon juice, then stir in the chicken thighs.",
      "Leave for 10 minutes, or longer in the fridge if you have time.",
      "Cook the chicken under a hot grill or in a pan for 12 to 15 minutes, turning, until golden and cooked through with no pink left.",
      "Mix the rest of the yogurt with a pinch of salt, the black pepper and a little crushed garlic.",
      "Warm the wraps, then fill them with the sliced chicken, the lettuce, sliced tomatoes and cucumber, and the garlic yogurt.",
    ],
  },
  {
    id: "chickpea-potato-curry", meal: "dinner", tags: ["Indian", "Batch cook"], name: "Spiced chickpea and potato curry", blurb: "Chickpeas and new potatoes in a coconut and tomato curry sauce.", servings: 4, minutes: 35,
    // the potatoes cook in the curry sauce: fitting moves them at most half as much again (the chickpeas are held the same way by the pantry)
    ingredients: [ing("chickpeas", 480), ing("new-potatoes", 340, { fit: [0.5, 1.5] }), ing("chopped-tomatoes", 400), ing("coconut-milk", 400), ing("curry-paste", 60), ing("rice", 200), ing("onion", 150, { note: "about 1 onion" }), ing("spinach", 120), ing("garlic", 10, { note: "about 2 cloves" }), ing("vegetable-oil", 8)],
    method: [
      "Cook the rice as the pack says.",
      "Fry the onion in a large pan with a little oil for 5 minutes, then stir in the curry paste and garlic for a minute.",
      "Halve the potatoes and add them with the chickpeas, tomatoes and coconut milk.",
      "Simmer for 15 minutes, stirring now and then, until the sauce has thickened. Stir in the spinach until it wilts.",
      "Serve with the rice.",
    ],
  },
  {
    id: "soy-honey-salmon-bowl", meal: "dinner", tags: ["Japanese"], name: "Soy and honey salmon rice bowl", blurb: "Sticky glazed salmon on rice with broccoli.", servings: 2, minutes: 25,
    ingredients: [ing("salmon", 240), ing("soy", 30), ing("honey", 15), ing("rice", 150), ing("broccoli", 150), ing("spring-onions", 30), ing("cucumber", 80)],
    method: [
      "Cook the rice as the pack says.",
      "Mix the soy sauce and honey. Put the salmon on a lined baking tray, spoon over half the glaze and bake at 200°C (fan 180°C) for 12 to 15 minutes, until it flakes easily.",
      "Cook the broccoli in boiling water for 3 to 4 minutes, then drain.",
      "Share the rice between bowls, add the salmon, broccoli, cucumber and spring onions and drizzle over the rest of the glaze.",
    ],
  },
  {
    id: "egg-fried-rice", meal: "dinner", tags: ["Chinese", "Quick"], name: "Egg fried rice with peas", blurb: "Egg, peas and spring onions tossed through rice with soy sauce.", servings: 2, minutes: 20,
    ingredients: [ing("rice", 150), ing("eggs", 240, { note: "about 4 eggs" }), ing("peas", 150), ing("soy", 30), ing("spring-onions", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("vegetable-oil", 10)],
    method: [
      "Cook the rice as the pack says, then spread it on a tray to cool quickly. Leftover rice kept in the fridge works too: use it within a day.",
      "Heat the oil in a wok or large frying pan. Beat the eggs, pour them in and stir until just set, then break them up.",
      "Add the rice, peas and garlic and stir-fry for 4 to 5 minutes, until the rice is piping hot.",
      "Stir in the soy sauce and spring onions and serve.",
    ],
  },
  {
    id: "vegetable-almond-stir-fry", meal: "dinner", tags: ["Chinese"], name: "Vegetable and almond stir-fry with rice", blurb: "Crunchy vegetables and toasted almonds tossed with soy and sweet chilli, on rice.", servings: 2, minutes: 25,
    ingredients: [ing("rice", 150), ing("almonds", 50), ing("soy", 30), ing("sweet-chilli", 40), ing("peppers", 160, { note: "about 1 pepper" }), ing("broccoli", 150), ing("carrots", 100, { note: "about 1 carrot" }), ing("spring-onions", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("vegetable-oil", 5)],
    method: [
      "Cook the rice as the pack says.",
      "Toast the almonds in a dry non-stick pan for 3 to 4 minutes, until golden, then lift out and roughly chop.",
      "Heat the oil in the same pan and stir-fry the sliced pepper and carrot, the broccoli and the garlic for 4 to 5 minutes.",
      "Add the soy sauce and sweet chilli sauce, toss until hot and scatter over the almonds and spring onions. Serve with the rice.",
    ],
  },
  {
    id: "mexican-chicken-rice", meal: "dinner", tags: ["Mexican", "One pot"], name: "Mexican chicken and bean rice", blurb: "Spiced chicken, rice and kidney beans cooked together in one pan.", servings: 4, minutes: 40,
    // the rice cooks in the method's own 600 ml of water and the salsa, so fitting leaves it as written
    ingredients: [ing("chicken", 500), ing("fajita-seasoning", 20), ing("rice", 240, { role: "other" }), ing("kidney-beans", 240, { role: "other" }), ing("salsa", 200), ing("onion", 150, { note: "about 1 onion" }), ing("peppers", 160, { note: "about 1 pepper" }), ing("vegetable-oil", 8)],
    method: [
      "Cut the chicken into chunks and brown it with the onion and pepper in a large pan with a little oil for 5 minutes.",
      "Stir in the fajita seasoning and the rice.",
      "Add the salsa and 600 ml of boiling water, cover and simmer for 15 minutes, stirring now and then. Add a splash more water if it looks dry.",
      "Stir in the kidney beans and cook for 5 minutes more, until the rice is tender and the chicken is cooked through with no pink left.",
      "Leave to stand with the lid on for a few minutes, then serve.",
    ],
  },
  {
    id: "bean-pepper-fajitas", meal: "dinner", tags: ["Mexican", "Quick"], name: "Bean and pepper fajitas", blurb: "Peppers and spiced kidney beans in warm wraps with salsa.", servings: 3, minutes: 20,
    ingredients: [ing("kidney-beans", 480), ing("fajita-seasoning", 15), ing("wraps", 360, { fit: [0.5, 2] }), ing("salsa", 150), ing("peppers", 320, { note: "about 2 peppers" }), ing("onion", 150, { note: "about 1 onion" }), ing("vegetable-oil", 8)],
    method: [
      "Slice the peppers and onion.",
      "Fry the peppers and onion in a little oil with the fajita seasoning for 6 to 8 minutes, until soft. Add the drained kidney beans and warm through.",
      "Warm the wraps, then fill them with the vegetables, beans and salsa.",
    ],
  },
  {
    id: "moroccan-chickpea-stew", meal: "dinner", tags: ["Middle Eastern", "One pot"], name: "Moroccan-style chickpea stew with rice", blurb: "Chickpeas simmered with tomatoes, warm spices and sweet raisins.", servings: 4, minutes: 35,
    ingredients: [ing("chickpeas", 480), ing("chopped-tomatoes", 400), ing("raisins", 40), ing("stock-cube", 6), ing("rice", 240), ing("onion", 150, { note: "about 1 onion" }), ing("carrots", 100, { note: "about 1 carrot" }), ing("cumin", 2), ing("cinnamon", 1), ing("paprika", 2), ing("lemon-juice", 15), ing("vegetable-oil", 8)],
    method: [
      "Cook the rice as the pack says.",
      "Fry the onion and carrot in a large pan with a little oil for 5 minutes, then stir in the cumin, cinnamon and paprika for a minute.",
      "Add the chickpeas, tomatoes, raisins, the crumbled stock cube and 300 ml of water.",
      "Simmer for 20 minutes, stirring now and then, until the sauce has thickened.",
      "Serve with the rice and a squeeze of lemon.",
    ],
  },
];
