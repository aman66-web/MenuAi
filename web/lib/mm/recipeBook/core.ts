import { ing, type Recipe } from "../recipes";

// The recipe book: our own recipes, built from the pantry (lib/mm/pantry.ts). Each ingredient is a kind of food, not a product: the app
// finds the products at the person's shop (or a substitute when the shop doesn't sell it) and works out every number from their labels.
// Rules for writing one (tests/recipes.test.ts checks them): plain British English anyone can follow; the name and blurb describe the dish
// and never make a health or nutrition claim; say how to tell food is cooked (no pink left, flakes easily, piping hot); fresh vegetables,
// herbs, spices, garlic and onions go in "extras" (not counted, because the shop's pages don't give their numbers yet).

export const CORE: readonly Recipe[] = [
  {
    id: "chicken-rice-bowl", meal: "dinner", name: "Chicken, rice and soy bowl", blurb: "Three ingredients, on the table in 25 minutes.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("soy", 30)],
    method: ["Cook the rice as the pack says.", "Slice the chicken and cook it in a hot non-stick pan for 6 to 8 minutes, until cooked through with no pink inside.", "Stir in the soy sauce and serve on the rice."],
    extras: ["Any vegetables you like (not counted)", "A little oil spray (not counted)"],
  },
  {
    id: "chicken-curry", meal: "dinner", name: "Chicken curry with rice", blurb: "A creamy curry made with yogurt instead of cream.", servings: 2, minutes: 35,
    ingredients: [ing("chicken", 300), ing("curry-paste", 60), ing("chopped-tomatoes", 400), ing("greek-yogurt", 150), ing("rice", 150)],
    method: ["Cook the rice as the pack says.", "Cut the chicken into chunks and brown it in a non-stick pan, then stir in the curry paste for a minute.", "Add the tomatoes and simmer for 15 minutes, until the chicken is cooked through.", "Take off the heat and stir in the yogurt."],
    extras: ["An onion or any vegetables you like (not counted)"],
  },
  {
    id: "beef-chilli", meal: "dinner", name: "Beef chilli and rice", blurb: "A batch-cook classic for four.", servings: 4, minutes: 45,
    ingredients: [ing("beef-mince", 500), ing("kidney-beans", 240, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 300)],
    method: ["Brown the mince in a large pan until no pink is left.", "Add the tomatoes, beans and chilli powder or spices to taste; simmer for 25 minutes.", "Cook the rice as the pack says and serve."],
    extras: ["Chilli powder, cumin and an onion (not counted)"],
  },
  {
    id: "turkey-bolognese", meal: "dinner", name: "Turkey bolognese", blurb: "Spaghetti bolognese made with turkey mince.", servings: 4, minutes: 35,
    ingredients: [ing("turkey-mince", 500), ing("passata", 500), ing("pasta-long", 300), ing("cheddar", 40)],
    method: ["Brown the turkey mince in a large pan until no pink is left.", "Add the passata and simmer for 15 minutes.", "Cook the spaghetti as the pack says, then serve with the sauce and the cheese grated on top."],
    extras: ["Garlic, dried herbs and any vegetables you like (not counted)"],
  },
  {
    id: "salmon-noodles", meal: "dinner", name: "Salmon and soy noodles", blurb: "Ready in 20 minutes.", servings: 2, minutes: 20,
    ingredients: [ing("salmon", 240), ing("noodles", 300), ing("soy", 30)],
    method: ["Bake or pan-fry the salmon for 10 to 12 minutes, until it flakes easily.", "Warm the noodles in a pan with the soy sauce.", "Flake the salmon over the noodles."],
    extras: ["Spring onions or any vegetables you like (not counted)"],
  },
  {
    id: "tuna-pasta", meal: "dinner", name: "Tuna and tomato pasta", blurb: "Store-cupboard dinner for three.", servings: 3, minutes: 20,
    ingredients: [ing("tuna", 204), ing("pasta-shapes", 200), ing("passata", 500), ing("cheddar", 60)],
    method: ["Cook the pasta as the pack says.", "Warm the passata in a pan and stir in the drained tuna.", "Mix with the pasta and top with grated cheese."],
    extras: ["Dried herbs or sweetcorn (not counted)"],
  },
  {
    id: "prawn-curry", meal: "dinner", name: "Thai prawn curry", blurb: "A coconut curry with rice, made with light coconut milk.", servings: 3, minutes: 25,
    ingredients: [ing("prawns", 300), ing("coconut-light", 400), ing("thai-curry-paste", 50), ing("rice", 150)],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, then add the coconut milk and simmer for 5 minutes.", "Add the prawns and cook until piping hot (raw prawns: until pink all the way through)."],
    extras: ["Any vegetables you like (not counted)"],
  },
  {
    id: "tofu-satay", meal: "dinner", name: "Tofu satay noodles", blurb: "Peanut sauce, crispy tofu, no meat.", servings: 2, minutes: 25,
    ingredients: [ing("tofu", 300), ing("noodles", 300), ing("peanut-butter", 40), ing("soy", 30)],
    method: ["Press and cube the tofu, then fry in a non-stick pan until golden.", "Whisk the peanut butter and soy sauce with a splash of hot water.", "Toss the noodles in the sauce and top with the tofu."],
    extras: ["Lime, chilli and any vegetables you like (not counted)"],
  },
  {
    id: "overnight-oats", meal: "breakfast", name: "Overnight oats with yogurt", blurb: "Make it the night before, grab it in the morning.", servings: 2, minutes: 5,
    ingredients: [ing("oats", 80), ing("greek-yogurt", 200, { role: "protein" }), ing("milk", 150), ing("peanut-butter", 20)],
    method: ["Mix the oats, yogurt and milk in two jars or bowls.", "Swirl in the peanut butter, cover and chill overnight."],
    extras: ["Fruit on top (not counted)"],
  },
  {
    id: "cheesy-egg-wraps", meal: "breakfast", name: "Cheesy scrambled egg wraps", blurb: "A filling breakfast in ten minutes.", servings: 2, minutes: 10,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("cheddar", 40), ing("wraps", 120), ing("milk", 30)],
    method: ["Whisk the eggs with the milk.", "Scramble gently in a non-stick pan until set, then stir in the grated cheese.", "Warm the wraps and fill."],
    extras: ["Spinach or tomatoes (not counted)"],
  },
  {
    id: "chickpea-curry", meal: "dinner", name: "Chickpea and tomato curry", blurb: "A meat-free curry that keeps well.", servings: 3, minutes: 30,
    ingredients: [ing("chickpeas", 240), ing("chopped-tomatoes", 400), ing("curry-paste", 60), ing("coconut-light", 200), ing("rice", 150)],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, add the tomatoes, chickpeas and coconut milk.", "Simmer for 15 minutes and serve."],
    extras: ["An onion and spinach (not counted)"],
  },
  {
    id: "chicken-wraps", meal: "lunch", name: "Chicken and yogurt wraps", blurb: "Easy to pack for lunch.", servings: 3, minutes: 20,
    ingredients: [ing("chicken", 300), ing("wraps", 180), ing("greek-yogurt", 100), ing("cheddar", 40)],
    method: ["Slice the chicken and cook in a hot pan for 6 to 8 minutes, until cooked through with no pink inside.", "Mix the yogurt with a squeeze of lemon and seasoning.", "Fill the wraps with chicken, yogurt and grated cheese."],
    extras: ["Lettuce, lemon and seasoning (not counted)"],
  },
  {
    id: "black-bean-chilli", meal: "dinner", name: "Black bean chilli", blurb: "A plant-based chilli with two kinds of beans.", servings: 4, minutes: 35,
    ingredients: [ing("black-beans", 470), ing("kidney-beans", 240), ing("chopped-tomatoes", 800), ing("rice", 300)],
    method: ["Warm the tomatoes in a large pan with chilli powder or spices to taste.", "Add the drained beans and simmer for 20 minutes.", "Cook the rice as the pack says and serve."],
    extras: ["An onion, garlic, cumin and chilli powder (not counted)"],
  },
  {
    id: "cod-butter-beans", meal: "dinner", name: "Cod with butter beans and tomatoes", blurb: "One pan, simple and quick.", servings: 2, minutes: 25,
    ingredients: [ing("cod", 250), ing("butter-beans", 235), ing("chopped-tomatoes", 400)],
    method: ["Simmer the tomatoes and drained beans in a wide pan for 10 minutes.", "Sit the cod on top, cover and cook for 8 to 10 minutes, until it flakes easily and is white all the way through."],
    extras: ["Garlic, a pinch of paprika and parsley (not counted)"],
  },
  {
    id: "halloumi-wraps", meal: "lunch", name: "Halloumi and chickpea wraps", blurb: "Golden halloumi with warm chickpeas.", servings: 2, minutes: 15,
    ingredients: [ing("halloumi", 150), ing("chickpeas", 240), ing("wraps", 120), ing("houmous", 60)],
    method: ["Slice the halloumi and fry in a dry non-stick pan until golden on both sides.", "Warm the drained chickpeas in the same pan.", "Spread the wraps with houmous and fill with the halloumi and chickpeas."],
    extras: ["Lettuce, tomato and a squeeze of lemon (not counted)"],
  },
  {
    id: "lentil-pasta", meal: "dinner", name: "Lentil and tomato pasta", blurb: "A meat-free ragu from the store cupboard.", servings: 3, minutes: 25,
    ingredients: [ing("green-lentils", 265), ing("passata", 500), ing("pasta-shapes", 225)],
    method: ["Cook the pasta as the pack says.", "Simmer the passata and drained lentils for 10 minutes.", "Stir the sauce through the pasta."],
    extras: ["Garlic, dried herbs and an onion (not counted)"],
  },
  {
    id: "chicken-bean-rice", meal: "dinner", name: "Chicken thigh, bean and tomato rice", blurb: "A one-pot rice with chicken and black beans.", servings: 3, minutes: 40,
    ingredients: [ing("chicken-thigh", 400), ing("black-beans", 235, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 200)],
    method: ["Brown the chicken pieces in a large pan.", "Add the rice, tomatoes, drained beans and 400 ml of water; bring to the boil.", "Cover and simmer for 20 minutes, until the rice is tender and the chicken is cooked through."],
    extras: ["Smoked paprika and an onion (not counted)"],
  },
];
