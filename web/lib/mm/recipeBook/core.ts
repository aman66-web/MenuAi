import { ing, type Recipe } from "../recipes";

// The recipe book: our own recipes, built from the pantry (lib/mm/pantry.ts). Each ingredient is a kind of food, not a product: the app
// finds the products at the person's shop (or a substitute when the shop doesn't sell it) and works out every number from their labels.
// Rules for writing one (tests/recipes.test.ts checks them): plain British English anyone can follow; the name and blurb describe the dish
// and never make a health or nutrition claim; say how to tell food is cooked (no pink left, flakes easily, piping hot); fresh vegetables,
// herbs, spices, garlic and onions go in "extras" (not counted, because the shop's pages don't give their numbers yet).

export const CORE: readonly Recipe[] = [
  {
    id: "chicken-rice-bowl", meal: "dinner", name: "Chicken, rice and soy bowl", blurb: "Three ingredients, on the table in 25 minutes.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("soy", 30), ing("stir-fry-veg", 300), ing("oil-spray", 1)],
    method: ["Cook the rice as the pack says.", "Slice the chicken and cook it in a hot non-stick pan for 6 to 8 minutes, until cooked through with no pink inside.", "Add the vegetables and stir-fry for 3 to 4 minutes.", "Stir in the soy sauce and serve on the rice."],
  },
  {
    id: "chicken-curry", meal: "dinner", name: "Chicken curry with rice", blurb: "A creamy curry made with yogurt instead of cream.", servings: 2, minutes: 35,
    ingredients: [ing("chicken", 300), ing("curry-paste", 60), ing("chopped-tomatoes", 400), ing("greek-yogurt", 150), ing("rice", 150), ing("onion", 150, { note: "about 1 onion" })],
    method: ["Cook the rice as the pack says.", "Cut the chicken into chunks and brown it in a non-stick pan, then stir in the curry paste for a minute.", "Add the tomatoes and simmer for 15 minutes, until the chicken is cooked through.", "Take off the heat and stir in the yogurt."],
  },
  {
    id: "beef-chilli", meal: "dinner", name: "Beef chilli and rice", blurb: "A batch-cook classic for four.", servings: 4, minutes: 45,
    ingredients: [ing("beef-mince", 500), ing("kidney-beans", 240, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 300), ing("chilli-powder", 3), ing("cumin", 3), ing("onion", 150, { note: "about 1 onion" })],
    method: ["Brown the mince in a large pan until no pink is left.", "Add the tomatoes, beans and chilli powder or spices to taste; simmer for 25 minutes.", "Cook the rice as the pack says and serve."],
  },
  {
    id: "chicken-mushroom-pasta", meal: "dinner", name: "Creamy chicken and mushroom pasta", blurb: "Chicken and mushrooms in a creamy garlic sauce.", servings: 4, minutes: 30,
    ingredients: [ing("chicken", 480), ing("pasta-shapes", 300), ing("mushrooms", 250), ing("soft-cheese", 200), ing("stock-cube", 10), ing("garlic", 10, { note: "about 2 cloves" }), ing("spinach", 90), ing("oil-spray", 2), ing("black-pepper", 1)],
    method: ["Cook the pasta as the pack says. Keep a mugful of the cooking water before you drain it.", "Cut the chicken into bite-sized pieces and cook in a hot non-stick pan with a little oil spray for 6 to 8 minutes, until cooked through with no pink inside.", "Add the sliced mushrooms and the garlic and cook for 4 to 5 minutes, until the mushrooms are soft.", "Stir in the soft cheese, the crumbled stock cube and a splash of the cooking water until smooth, then add the spinach and let it wilt.", "Toss with the pasta, season with black pepper and serve."],
  },
  {
    id: "salmon-noodles", meal: "dinner", name: "Salmon and soy noodles", blurb: "Ready in 20 minutes.", servings: 2, minutes: 20,
    ingredients: [ing("salmon", 240), ing("noodles", 300), ing("soy", 30), ing("spring-onions", 30)],
    method: ["Bake or pan-fry the salmon for 10 to 12 minutes, until it flakes easily.", "Warm the noodles in a pan with the soy sauce.", "Flake the salmon over the noodles."],
  },
  {
    id: "tuna-pasta", meal: "dinner", name: "Tuna and tomato pasta", blurb: "Store-cupboard dinner for three.", servings: 3, minutes: 20,
    ingredients: [ing("tuna", 204), ing("pasta-shapes", 200), ing("passata", 500), ing("cheddar", 60), ing("mixed-herbs", 1)],
    method: ["Cook the pasta as the pack says.", "Warm the passata in a pan and stir in the drained tuna.", "Mix with the pasta and top with grated cheese."],
  },
  {
    id: "salmon-coconut-curry", meal: "dinner", name: "Coconut salmon curry with rice", blurb: "Salmon and peas in a coconut curry sauce.", servings: 3, minutes: 25,
    ingredients: [ing("salmon", 300), ing("coconut-milk", 400), ing("curry-paste", 50), ing("rice", 150), ing("peas", 150)],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, then add the coconut milk and simmer for 5 minutes.", "Cut the salmon into large chunks, add it with the peas and simmer gently for 6 to 8 minutes, until the fish flakes easily."],
  },
  {
    id: "satay-egg-noodles", meal: "dinner", name: "Satay noodles with egg", blurb: "Peanut sauce, vegetables and strips of omelette, no meat.", servings: 2, minutes: 20,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("noodles", 300), ing("peanut-butter", 40), ing("soy", 30), ing("lemon-juice", 15), ing("chilli-powder", 1), ing("stir-fry-veg", 300), ing("oil-spray", 1)],
    method: ["Beat the eggs and cook them in a non-stick pan with a little oil spray for 2 to 3 minutes, like a thin omelette, until set. Roll it up, slice into strips and lift out.", "Whisk the peanut butter and soy sauce with a splash of hot water.", "Stir-fry the vegetables in the same pan for 3 to 4 minutes.", "Toss the noodles and vegetables in the sauce, add the lemon juice and chilli powder, and top with the egg."],
  },
  {
    id: "overnight-oats", meal: "breakfast", name: "Overnight oats with yogurt", blurb: "Make it the night before, grab it in the morning.", servings: 2, minutes: 5,
    ingredients: [ing("oats", 80), ing("greek-yogurt", 200, { role: "protein" }), ing("milk", 150), ing("peanut-butter", 20), ing("berries", 80)],
    method: ["Mix the oats, yogurt and milk in two jars or bowls.", "Swirl in the peanut butter, cover and chill overnight."],
  },
  {
    id: "cheesy-egg-wraps", meal: "breakfast", name: "Cheesy scrambled egg wraps", blurb: "A filling breakfast in ten minutes.", servings: 2, minutes: 10,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("cheddar", 40), ing("wraps", 120), ing("milk", 30), ing("spinach", 60)],
    method: ["Whisk the eggs with the milk.", "Scramble gently in a non-stick pan until set, then stir in the grated cheese.", "Warm the wraps and fill."],
  },
  {
    id: "chickpea-curry", meal: "dinner", name: "Chickpea and tomato curry", blurb: "A meat-free curry that keeps well.", servings: 3, minutes: 30,
    ingredients: [ing("chickpeas", 240), ing("chopped-tomatoes", 400), ing("curry-paste", 60), ing("coconut-milk", 200), ing("rice", 150), ing("onion", 150, { note: "about 1 onion" }), ing("spinach", 90)],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, add the tomatoes, chickpeas and coconut milk.", "Simmer for 15 minutes and serve."],
  },
  {
    id: "chicken-wraps", meal: "lunch", name: "Chicken and yogurt wraps", blurb: "Easy to pack for lunch.", servings: 3, minutes: 20,
    ingredients: [ing("chicken", 300), ing("wraps", 180), ing("greek-yogurt", 100), ing("cheddar", 40), ing("lettuce", 90), ing("lemon-juice", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: ["Slice the chicken and cook in a hot pan for 6 to 8 minutes, until cooked through with no pink inside.", "Mix the yogurt with a squeeze of lemon and seasoning.", "Fill the wraps with chicken, yogurt and grated cheese."],
  },
  {
    id: "bean-chilli", meal: "dinner", name: "Bean chilli", blurb: "A plant-based chilli with kidney beans and chickpeas.", servings: 4, minutes: 35,
    ingredients: [ing("kidney-beans", 480), ing("chickpeas", 240), ing("chopped-tomatoes", 800), ing("rice", 300), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("cumin", 2), ing("chilli-powder", 2)],
    method: ["Warm the tomatoes in a large pan with chilli powder or spices to taste.", "Add the drained beans and chickpeas and simmer for 20 minutes.", "Cook the rice as the pack says and serve."],
  },
  {
    id: "tuna-fishcakes", meal: "dinner", name: "Tuna fishcakes with peas", blurb: "Golden fishcakes made from tinned tuna and potatoes.", servings: 2, minutes: 30,
    ingredients: [ing("tuna", 200), ing("new-potatoes", 360), ing("eggs", 60, { role: "other", note: "1 egg" }), ing("spring-onions", 30), ing("peas", 160), ing("lemon-juice", 10), ing("oil-spray", 2), ing("black-pepper", 1)],
    method: ["Drain the potatoes and mash them well, then mix in the drained tuna, the chopped spring onions, the beaten egg and a little black pepper.", "Shape into 6 flat cakes and chill for 10 minutes if you have time.", "Cook in a non-stick pan with a little oil spray over a medium heat for 4 to 5 minutes on each side, until golden and piping hot all the way through.", "Cook the peas in boiling water for 3 minutes, drain and serve with the fishcakes and a squeeze of lemon."],
  },
  {
    id: "chickpea-houmous-wraps", meal: "lunch", name: "Chickpea and houmous wraps", blurb: "Warm spiced chickpeas with houmous and salad.", servings: 2, minutes: 10,
    ingredients: [ing("chickpeas", 240), ing("wraps", 120), ing("houmous", 60), ing("lettuce", 60), ing("tomatoes", 80), ing("lemon-juice", 10), ing("cumin", 1), ing("paprika", 1)],
    method: ["Warm the drained chickpeas in a non-stick pan with the cumin and paprika for 3 to 4 minutes, then add a squeeze of lemon.", "Spread the wraps with houmous and fill with the chickpeas, lettuce and sliced tomatoes."],
  },
  {
    id: "mushroom-bean-pasta", meal: "dinner", name: "Mushroom and bean pasta", blurb: "A meat-free ragu with mushrooms and kidney beans.", servings: 3, minutes: 25,
    ingredients: [ing("kidney-beans", 240), ing("mushrooms", 250), ing("passata", 500), ing("pasta-shapes", 225), ing("olive-oil", 10), ing("garlic", 10, { note: "about 2 cloves" }), ing("mixed-herbs", 2), ing("onion", 150, { note: "about 1 onion" })],
    method: ["Cook the pasta as the pack says.", "Fry the chopped onion and sliced mushrooms in the oil for 5 minutes, until soft.", "Add the passata, the drained beans, the garlic and the dried herbs and simmer for 10 minutes.", "Stir the sauce through the pasta."],
  },
  {
    id: "chicken-bean-rice", meal: "dinner", name: "Chicken thigh, bean and tomato rice", blurb: "A one-pot rice with chicken and kidney beans.", servings: 3, minutes: 40,
    ingredients: [ing("chicken-thigh", 400), ing("kidney-beans", 240, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 200), ing("paprika", 3), ing("onion", 150, { note: "about 1 onion" })],
    method: ["Brown the chicken pieces in a large pan.", "Add the rice, tomatoes, drained beans and 400 ml of water; bring to the boil.", "Cover and simmer for 20 minutes, until the rice is tender and the chicken is cooked through."],
  },
];
