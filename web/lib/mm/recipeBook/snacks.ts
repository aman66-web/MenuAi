import { ing, type Recipe } from "../recipes";

// Snacks and sweet things. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const SNACKS: readonly Recipe[] = [
  {
    id: "peanut-butter-oat-bites", meal: "snack", tags: ["Make ahead", "No cook"], name: "Peanut butter oat bites", blurb: "Little no-bake bites for the week.", servings: 6, minutes: 15,
    ingredients: [ing("oats", 120, { role: "carb" }), ing("peanut-butter", 90), ing("honey", 40), ing("raisins", 40)],
    method: ["Mix everything together in a bowl until it sticks.", "Roll into 12 small balls with damp hands.", "Chill for 30 minutes and keep in the fridge for up to five days."],
    extras: ["A pinch of cinnamon"],
  },
  {
    id: "edamame-soy-chilli", meal: "snack", tags: ["Quick", "Savoury"], name: "Edamame with soy and chilli", blurb: "Warm soya beans tossed in soy sauce with a little heat.", servings: 2, minutes: 8,
    ingredients: [ing("edamame", 200), ing("soy", 15)],
    method: ["Cook the frozen edamame in a pan of boiling water for 3 to 4 minutes, then drain well.", "Tip them into a bowl and toss with the soy sauce, chilli flakes and a squeeze of lime.", "Eat warm with a spoon or cocktail sticks."],
    extras: ["A pinch of chilli flakes", "A squeeze of lime", "A crushed garlic clove, if you like"],
  },
  {
    id: "honey-almond-yogurt-pots", meal: "snack", tags: ["No cook", "Sweet"], name: "Honey and almond yogurt pots", blurb: "Thick yogurt with crunchy almonds and a drizzle of honey.", servings: 2, minutes: 5,
    ingredients: [ing("greek-yogurt", 300, { role: "protein" }), ing("almonds", 30), ing("honey", 20)],
    method: ["Spoon the yogurt into two small pots or glasses.", "Roughly chop the almonds.", "Scatter the almonds over the yogurt and drizzle with the honey.", "Eat straight away, or cover and keep in the fridge for up to a day and add the almonds just before eating so they stay crunchy."],
    extras: ["A pinch of cinnamon"],
  },
  {
    id: "frozen-yogurt-berry-bark", meal: "snack", tags: ["Make ahead", "Sweet"], name: "Frozen yogurt and berry bark", blurb: "A tray of frozen yogurt and berries, snapped into pieces.", servings: 4, minutes: 15,
    ingredients: [ing("greek-yogurt", 400, { role: "protein" }), ing("berries", 150), ing("honey", 30)],
    method: ["Line a small baking tray with baking paper.", "Stir the honey into the yogurt and spread it over the paper about 1 cm thick.", "Scatter the berries on top and press them in gently.", "Freeze for at least 3 hours, until firm all the way through.", "Break into pieces and keep in a box in the freezer. Let a piece sit for a minute or two before eating."],
    extras: ["A little grated lemon zest"],
  },
  {
    id: "ham-soft-cheese-roll-ups", meal: "snack", tags: ["No cook", "Savoury"], name: "Ham and soft cheese roll-ups", blurb: "Slices of ham rolled around soft cheese and crunchy cucumber.", servings: 2, minutes: 10,
    ingredients: [ing("ham", 120), ing("soft-cheese", 60)],
    method: ["Lay the ham slices flat on a board.", "Spread each slice with a thin layer of soft cheese.", "Put a stick of cucumber or pepper at one end and roll up tightly.", "Eat straight away or keep in the fridge and eat the same day."],
    extras: ["Cucumber or red pepper, cut into sticks", "Chopped chives", "Black pepper"],
  },
  {
    id: "devilled-eggs", meal: "snack", tags: ["Make ahead", "Savoury"], name: "Devilled eggs", blurb: "Halved boiled eggs with a creamy, peppery filling.", servings: 2, minutes: 20,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("light-mayo", 30)],
    method: ["Lower the eggs into a pan of boiling water and boil for 9 minutes until set.", "Cool them in cold water, then peel and cut each one in half.", "Scoop the yolks into a bowl and mash them with the light mayonnaise, salt and pepper.", "Spoon the mixture back into the egg whites and sprinkle with paprika and chives.", "Keep in the fridge and eat within a day."],
    extras: ["Paprika", "Chopped chives", "Salt and pepper"],
  },
  {
    id: "tuna-butter-bean-dip", meal: "snack", tags: ["No cook", "Savoury"], name: "Tuna and butter bean dip", blurb: "A creamy tuna and bean dip with lemon, for vegetable sticks.", servings: 3, minutes: 10,
    ingredients: [ing("tuna", 110), ing("butter-beans", 120), ing("olive-oil", 10)],
    method: ["Drain the tuna and the butter beans well.", "Mash the beans in a bowl with a fork (or blend them with a hand blender), adding the oil and a squeeze of lemon, until fairly smooth.", "Stir in the tuna, breaking it up with the fork, and season with black pepper.", "Serve with vegetable sticks. Keep covered in the fridge and eat within a day."],
    extras: ["Carrot, cucumber and pepper sticks", "A squeeze of lemon", "Chopped spring onion or parsley", "Black pepper"],
  },
  {
    id: "smoked-salmon-cucumber-bites", meal: "snack", tags: ["No cook", "Savoury"], name: "Smoked salmon cucumber bites", blurb: "Cucumber rounds topped with soft cheese and smoked salmon.", servings: 2, minutes: 10,
    ingredients: [ing("smoked-salmon", 100), ing("soft-cheese", 60)],
    method: ["Cut the cucumber into thick rounds.", "Spread a little soft cheese on each round.", "Tear the smoked salmon into strips and fold a piece on top of each one.", "Finish with black pepper, a little dill and a squeeze of lemon."],
    extras: ["Half a cucumber", "Fresh dill", "A squeeze of lemon", "Black pepper"],
  },
  {
    id: "crispy-spiced-chickpeas", meal: "snack", tags: ["Make ahead", "Savoury"], name: "Crispy spiced chickpeas", blurb: "Oven-roasted chickpeas with smoked paprika and cumin.", servings: 3, minutes: 40,
    ingredients: [ing("chickpeas", 240), ing("olive-oil", 10)],
    method: ["Heat the oven to 200°C (180°C fan).", "Drain and rinse the chickpeas, then pat them dry with a clean tea towel.", "Toss them on a baking tray with the oil, paprika, cumin and a pinch of salt.", "Roast for 25 to 30 minutes, shaking the tray halfway, until golden and crisp.", "Leave to cool on the tray. Keep in a jar with the lid loose and eat within two days."],
    extras: ["Smoked paprika", "Ground cumin", "A pinch of salt"],
  },
  {
    id: "smoky-roasted-almonds", meal: "snack", tags: ["Make ahead", "Savoury"], name: "Smoky roasted almonds", blurb: "Whole almonds roasted with smoked paprika and a pinch of salt.", servings: 6, minutes: 20,
    ingredients: [ing("almonds", 150), ing("olive-oil", 5)],
    method: ["Heat the oven to 180°C (160°C fan).", "Toss the almonds on a baking tray with the oil, smoked paprika and a pinch of salt.", "Roast for 10 to 12 minutes, shaking the tray halfway, until golden and smelling toasty. Watch them closely at the end as they catch quickly.", "Leave to cool on the tray, then keep in a sealed jar for up to two weeks.", "A small handful is one serving."],
    extras: ["Smoked paprika", "A pinch of salt", "A pinch of chilli powder, if you like"],
  },
  {
    id: "cheese-bean-quesadilla-wedges", meal: "snack", tags: ["Quick", "Savoury"], name: "Cheese and bean quesadilla wedges", blurb: "Toasted wraps filled with beans, salsa and melted cheese, cut into wedges.", servings: 4, minutes: 15,
    ingredients: [ing("wraps", 120), ing("black-beans", 120), ing("cheddar", 60), ing("salsa", 60)],
    method: ["Drain the beans and mash them lightly with a fork.", "Spread the beans over half of each wrap, then add the salsa and grated cheese.", "Fold each wrap in half over the filling.", "Cook in a dry non-stick pan over a medium heat for 2 to 3 minutes on each side, until golden and the cheese has melted.", "Cut each one into wedges and eat warm."],
    extras: ["Chopped spring onion or fresh coriander", "A pinch of chilli flakes"],
  },
];
