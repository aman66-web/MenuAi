import { ing, type Recipe } from "../recipes";

// Breakfasts with more protein, for Meal plan's aims and diets that had few (founder 2026-11-26: "make more recipes so that my app caters for multiple inputs a
// user would need as they all have different diet plans that may vary a lot"; docs/RECIPE_COVERAGE_2026-11-26.md): vegan breakfasts with tofu or soya drink
// (a vegan aiming to lose fat or build muscle had no breakfast that reached the meal's protein), protein-powder pancakes and oats, and a yogurt bowl with no
// gluten or egg. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const PROTEIN_MORNINGS: readonly Recipe[] = [
  {
    id: "tofu-scramble-spinach-tomato-toast", meal: "breakfast", tags: ["Vegan", "Savoury", "Quick"], name: "Tofu scramble with spinach and tomatoes on toast", blurb: "Crumbled tofu fried golden with turmeric, spinach and cherry tomatoes, on wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("tofu", 280), ing("olive-oil", 10), ing("turmeric", 1), ing("paprika", 1), ing("cherry-tomatoes", 150), ing("spinach", 80), ing("salt", 1), ing("black-pepper", 1), ing("bread", 80, { note: "about 2 slices" })],
    method: [
      "Drain the tofu: Drain the tofu and pat it dry with kitchen paper. Crumble it into a bowl with your fingers into pieces about the size of scrambled egg.",
      "Halve the tomatoes: Cut the cherry tomatoes in half.",
      "Fry the tofu: Heat the oil in a large non-stick frying pan over a medium-high heat. Add the tofu, turmeric and paprika and fry for 5 to 6 minutes, stirring now and then, until hot and golden in places.",
      "Add the tomatoes and spinach: Add the tomatoes and cook for 2 minutes until they soften. Add the spinach and stir for 1 minute, until it wilts. Season with salt and black pepper.",
      "Toast the bread: While the tofu cooks, toast the bread until golden brown on both sides.",
      "Serve: Put the toast on plates and pile the tofu scramble on top. Serve straight away.",
    ],
  },
  {
    id: "tofu-pepper-spinach-breakfast-wraps", meal: "breakfast", tags: ["Vegan", "Savoury", "Quick"], name: "Tofu, pepper and spinach breakfast wraps", blurb: "Warm wraps filled with golden scrambled tofu, soft peppers and spinach.", servings: 2, minutes: 15,
    ingredients: [ing("tofu", 280), ing("peppers", 160, { note: "about 1 pepper" }), ing("spinach", 60), ing("olive-oil", 10), ing("turmeric", 1), ing("cumin", 1), ing("salt", 1), ing("black-pepper", 1), ing("wraps", 120, { note: "about 2 wraps" })],
    method: [
      "Get ready: Drain the tofu, pat it dry with kitchen paper and crumble it into a bowl with your fingers. Cut the pepper in half, scoop out the seeds and white inside and slice it into thin strips.",
      "Soften the pepper: Heat the oil in a large non-stick frying pan over a medium heat. Fry the pepper for 4 to 5 minutes, stirring, until soft.",
      "Add the tofu: Add the tofu, turmeric and cumin and fry for 5 minutes, stirring now and then, until hot and golden in places.",
      "Wilt the spinach: Stir in the spinach for 1 minute, until it wilts. Season with salt and black pepper and take the pan off the heat.",
      "Warm the wraps: Warm the wraps one at a time in a dry pan for about 20 seconds a side, or in the microwave for 10 seconds, so they fold without cracking.",
      "Fill and roll: Spoon the filling down the middle of each wrap, fold in the sides and roll it up tightly. Cut in half and serve straight away.",
    ],
  },
  {
    id: "peanut-butter-berry-soya-porridge", meal: "breakfast", tags: ["Vegan", "Sweet", "Porridge", "Quick"], name: "Peanut butter and berry soya porridge", blurb: "Creamy oats cooked in soya drink, with a swirl of peanut butter and warm berries.", servings: 2, minutes: 10,
    // the soya drink follows the oats, so the porridge keeps its thickness when it is fitted
    ingredients: [ing("oats", 80), ing("soya-drink", 400, { follows: "oats" }), ing("peanut-butter", 30), ing("berries", 120), ing("cinnamon", 1)],
    method: [
      "Start the porridge: Put the oats, soya drink and cinnamon in a medium saucepan and stir.",
      "Cook: Bring it to a gentle bubble over a medium heat, then turn the heat down and cook for 4 to 5 minutes, stirring often, until thick and creamy. Add a splash of water if it gets too thick.",
      "Warm the berries: Put the berries in a small bowl and microwave them for 1 minute, or warm them in a small pan with a splash of water, until soft and juicy.",
      "Serve: Spoon the porridge into bowls. Drop the peanut butter on top in spoonfuls and swirl it in a little, then add the berries and their juice.",
      "Eat it warm: Serve straight away, while the peanut butter is melting into the oats.",
    ],
  },
  {
    id: "apple-almond-soya-overnight-oats", meal: "breakfast", tags: ["Vegan", "Sweet", "Make ahead"], name: "Apple and almond overnight oats with soya", blurb: "Oats soaked overnight in soya drink with grated apple, raisins and cinnamon, topped with almonds.", servings: 2, minutes: 10,
    // the soya drink follows the oats, so they soak to the same thickness when the recipe is fitted
    ingredients: [ing("oats", 90), ing("soya-drink", 300, { follows: "oats" }), ing("apple", 150, { note: "about 1 apple" }), ing("raisins", 30), ing("almonds", 30), ing("cinnamon", 1)],
    method: [
      "Grate the apple: Rinse the apple and grate it on the large holes of a grater, skin and all, turning it as you go and leaving the core behind.",
      "Mix the oats: Put the oats, soya drink, grated apple, raisins and most of the cinnamon in a bowl and stir until there are no dry oats left.",
      "Soak overnight: Cover the bowl and leave it in the fridge overnight, or for at least 4 hours, until the oats are soft and thick.",
      "Chop the almonds: In the morning, chop the almonds roughly, cutting each one into three or four bits.",
      "Serve: Stir the oats, adding a splash of water if they are too thick. Spoon them into bowls, scatter the almonds on top, dust with the rest of the cinnamon and eat cold.",
    ],
  },
  {
    id: "banana-berry-almond-yogurt-bowl", meal: "breakfast", tags: ["Sweet", "No cook", "Quick"], name: "Banana, berry and almond yogurt bowl", blurb: "Thick yogurt with sliced banana, berries, chopped almonds and a little honey.", servings: 1, minutes: 5,
    ingredients: [ing("greek-yogurt", 250, { role: "protein" }), ing("banana", 120, { role: "carb" }), ing("berries", 100), ing("almonds", 20), ing("honey", 10)],
    method: [
      "Chop the almonds: Chop the almonds roughly, cutting each one into three or four bits.",
      "Slice the banana: Peel the banana and cut it into rounds about 1 cm thick.",
      "Fill the bowl: Spoon the yogurt into a wide bowl and smooth the top with the back of the spoon.",
      "Add the fruit: Lay the banana in a row along one side and heap the berries beside it. If the berries are frozen, thaw them in the fridge overnight or microwave them for 1 minute first.",
      "Finish and serve: Scatter the almonds over and drizzle the honey on top in a thin stream. Eat straight away.",
    ],
  },
];

export const PROTEIN_MORNINGS_LOOKS: Readonly<Record<string, string>> = {
  "tofu-scramble-spinach-tomato-toast": "Two slices of wholemeal toast on a white plate piled with golden-yellow crumbled tofu scramble, dark green wilted spinach and soft halved red cherry tomatoes, dotted with cracked black pepper.",
  "tofu-pepper-spinach-breakfast-wraps": "A tortilla wrap cut in half on a round white plate, the cut ends showing golden-yellow scrambled tofu, soft strips of red pepper and dark green wilted spinach inside the rolled wrap.",
  "peanut-butter-berry-soya-porridge": "A round white bowl of thick, creamy oat porridge with spoonfuls of golden-brown peanut butter swirled into the top and a heap of warm, glossy deep red and purple mixed berries in their juice on one side.",
  "apple-almond-soya-overnight-oats": "A deep white bowl of thick soaked oats flecked with grated apple and dark plump raisins, scattered on top with roughly chopped pale almonds and a dusting of cinnamon.",
  "banana-berry-almond-yogurt-bowl": "A wide white bowl of thick white yogurt with a row of banana rounds along one side, a heap of red and purple mixed berries beside them, scattered with chopped pale almonds and thin golden threads of honey.",
};
