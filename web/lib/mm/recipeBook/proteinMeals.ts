import { ing, type Recipe } from "../recipes";

// Vegan and vegetarian lunches and dinners that carry a meal's protein (founder 2026-11-26: "if my app hasn't good foods suitable for every possible input please
// make more recipes in my app"; docs/RECIPE_COVERAGE_2026-11-26.md): with the everyday kinds alone a vegan plan for losing fat or building muscle had no lunch or
// dinner that reached the meal's protein, and a vegetarian high-protein plan none. These are built on tofu, Quorn, eggs and cottage cheese (tofu and Quorn are
// protein kinds, lib/mm/pantry.ts PROTEIN_KINDS), with the carbs kept to a side the plan can shrink. See lib/mm/recipeBook/index.ts for the rules.

export const PROTEIN_MEALS: readonly Recipe[] = [
  // ---- vegan
  {
    id: "crispy-tofu-broccoli-stir-fry-rice", meal: "dinner", tags: ["Vegan", "Chinese"], name: "Crispy tofu and broccoli stir-fry with rice", blurb: "Golden fried tofu with broccoli, peppers and a garlicky soy glaze, over rice.", servings: 2, minutes: 30,
    ingredients: [ing("tofu", 280), ing("rice", 120), ing("broccoli", 160), ing("peppers", 160, { note: "about 1 pepper" }), ing("spring-onions", 30), ing("garlic", 10, { note: "about 2 cloves" }), ing("soy", 30), ing("vegetable-oil", 15)],
    method: [
      "Press the tofu: Drain the tofu, wrap it in a clean tea towel and put something heavy, like a pan, on top for 10 minutes to squeeze out the water.",
      "Cook the rice: Rinse the rice in a sieve under the cold tap. Put it in a saucepan with twice its volume of boiling water, cover and simmer on a low heat for 10 to 12 minutes, until tender. Turn off the heat and leave it covered.",
      "Prepare the vegetables: Cut the broccoli into small florets. Cut the pepper in half, scoop out the seeds and white inside, and slice it into strips. Trim the spring onions and slice them thinly.",
      "Make the sauce: Stir the soy sauce, garlic and 3 tablespoons of water together in a cup.",
      "Cut the tofu: Unwrap the tofu and cut it into cubes about 2 cm across.",
      "Fry the tofu: Heat two thirds of the oil in a large non-stick frying pan or wok over a high heat. Fry the tofu for 6 to 8 minutes, turning it, until golden and crisp on most sides. Lift it onto a plate.",
      "Cook the vegetables: Add the rest of the oil, the broccoli and the pepper to the pan. Stir-fry for 4 to 5 minutes, adding a splash of water to help the broccoli steam, until bright green and just tender.",
      "Glaze it: Put the tofu back in, pour in the sauce and toss for 1 to 2 minutes, until it bubbles, coats everything and the tofu is hot right through.",
      "Serve: Fluff up the rice with a fork and spoon it into bowls. Top with the tofu and vegetables and scatter the spring onions over.",
    ],
  },
  {
    id: "tofu-spinach-tomato-curry-rice", meal: "dinner", tags: ["Vegan", "Indian"], name: "Tofu, spinach and tomato curry with rice", blurb: "Golden tofu simmered in a spiced tomato sauce with spinach, served with rice.", servings: 2, minutes: 35,
    ingredients: [ing("tofu", 280), ing("rice", 120), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("curry-powder", 6), ing("cumin", 2), ing("chopped-tomatoes", 400), ing("spinach", 100), ing("vegetable-oil", 15), ing("salt", 1)],
    method: [
      "Get the tofu ready: Drain the tofu, pat it dry with kitchen paper and cut it into 2 cm cubes.",
      "Brown the tofu: Heat half the oil in a large non-stick frying pan over a medium-high heat. Fry the tofu for 6 to 8 minutes, turning it, until golden on most sides. Lift it onto a plate.",
      "Soften the onion: Peel and finely chop the onion. Add the rest of the oil and the onion to the pan, turn the heat to medium and cook for 6 to 8 minutes, stirring, until soft and golden.",
      "Add the spices: Stir in the garlic, curry powder and cumin and cook for 1 minute, until it smells fragrant. Keep stirring so the spices don't burn.",
      "Simmer the sauce: Pour in the chopped tomatoes with half a tin of water and a pinch of salt. Bring to a bubble, then simmer gently for 10 minutes, stirring now and then, until thick.",
      "Cook the rice: While the sauce simmers, rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender.",
      "Add the tofu and spinach: Put the tofu back in the sauce and stir in the spinach a handful at a time. Cook for 3 minutes, until the spinach has wilted and the tofu is hot right through.",
      "Serve: Taste the curry and add a little more salt if you like. Serve it over the rice.",
    ],
  },
  {
    id: "tofu-kidney-bean-chilli-rice", meal: "dinner", tags: ["Vegan", "Batch cook"], name: "Tofu and kidney bean chilli with rice", blurb: "A smoky chilli of crumbled tofu, kidney beans and peppers in tomato sauce, with rice.", servings: 3, minutes: 40,
    ingredients: [ing("tofu", 280), ing("kidney-beans", 240), ing("onion", 150, { note: "about 1 onion" }), ing("peppers", 160, { note: "about 1 pepper" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("chilli-powder", 3), ing("cumin", 2), ing("paprika", 2), ing("chopped-tomatoes", 400), ing("vegetable-oil", 15), ing("rice", 180), ing("salt", 1)],
    method: [
      "Get ready: Drain the tofu, pat it dry and crumble it with your fingers into small pieces, like mince. Peel and chop the onion. Cut the pepper in half, scoop out the seeds and chop it into small pieces.",
      "Brown the tofu: Heat the oil in a large saucepan over a medium-high heat. Fry the tofu for 6 to 8 minutes, stirring now and then, until golden and a little crisp.",
      "Add the vegetables: Add the onion and pepper and cook for 6 to 8 minutes, stirring, until soft.",
      "Add the spices: Stir in the garlic, chilli powder, cumin and paprika and cook for 1 minute, until fragrant.",
      "Simmer: Add the chopped tomatoes, half a tin of water and a pinch of salt. Rinse and drain the kidney beans and stir them in. Bring to a bubble, then simmer gently for 15 minutes, stirring now and then, until thick.",
      "Cook the rice: While the chilli simmers, rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender.",
      "Check the chilli: Taste it and add a little more salt if you like. If it is too thick, stir in a splash of water.",
      "Serve: Spoon the rice into bowls and ladle the chilli over it. Keep leftovers covered in the fridge for up to 2 days and reheat until piping hot.",
    ],
  },
  {
    id: "tofu-pea-sweetcorn-fried-rice", meal: "dinner", tags: ["Vegan", "Quick", "Chinese"], name: "Tofu, pea and sweetcorn fried rice", blurb: "Quick fried rice with golden crumbled tofu, peas, sweetcorn and soy sauce.", servings: 2, minutes: 15,
    ingredients: [ing("rice", 120), ing("tofu", 280), ing("peas", 100), ing("sweetcorn", 80), ing("spring-onions", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("soy", 30), ing("vegetable-oil", 15)],
    method: [
      "Boil the kettle: Boil a full kettle and rinse the rice in a sieve under the cold tap until the water runs clearer.",
      "Cook the rice: Put the rice in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 minutes, until just tender, then drain off any water left.",
      "Get the tofu ready: While the rice cooks, drain the tofu and pat it dry with kitchen paper. Crumble it into small pieces with your fingers, about the size of peas.",
      "Slice the spring onions: Trim the spring onions and slice them thinly, keeping the green tops apart for the end.",
      "Fry the tofu: Heat the oil in a large non-stick frying pan or wok over a high heat. Fry the tofu for 5 minutes, stirring now and then, until golden in places.",
      "Add the vegetables: Add the peas, sweetcorn, garlic and the white parts of the spring onions and stir-fry for 2 minutes, until the peas are hot.",
      "Fry the rice: Tip in the rice and pour the soy sauce over. Stir-fry for 2 to 3 minutes, tossing everything together, until the rice is hot and coated.",
      "Serve: Spoon into bowls and scatter the green spring onion tops over. Keep any left over covered in the fridge for a day and reheat it until piping hot.",
    ],
  },
  {
    id: "soy-tofu-pea-rice-bowl", meal: "lunch", tags: ["Vegan", "Bowl"], name: "Soy tofu and pea rice bowl with cucumber", blurb: "Rice topped with soy-glazed tofu, green peas and crunchy cucumber.", servings: 2, minutes: 25,
    ingredients: [ing("rice", 100), ing("tofu", 280), ing("peas", 120), ing("cucumber", 150), ing("spring-onions", 30), ing("soy", 30), ing("garlic", 5, { note: "about 1 clove" }), ing("vegetable-oil", 10)],
    method: [
      "Cook the rice: Rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender. Turn off the heat and leave it covered.",
      "Cook the peas: Put the frozen peas in a small pan of boiling water. When it bubbles again, cook for 3 minutes, then drain.",
      "Fry the tofu: Drain the tofu, pat it dry and cut it into 2 cm cubes. Heat the oil in a non-stick frying pan over a medium-high heat and fry the tofu for 6 to 8 minutes, turning it, until golden.",
      "Glaze the tofu: Stir the soy sauce and garlic together, pour it over the tofu and toss for 1 minute, until it is sticky and coats the cubes.",
      "Cut the cucumber: Rinse the cucumber, cut it in half lengthways and slice it into half-moons. Trim the spring onions and slice them thinly.",
      "Serve: Spoon the rice into bowls. Arrange the tofu, peas and cucumber on top in separate piles and scatter the spring onions over.",
    ],
  },
  {
    id: "smoky-tofu-pepper-wraps", meal: "lunch", tags: ["Vegan", "Wrap"], name: "Smoky tofu and pepper wraps with houmous", blurb: "Wraps filled with paprika-fried tofu, soft peppers, houmous and crisp leaves.", servings: 2, minutes: 20,
    ingredients: [ing("tofu", 280), ing("peppers", 160, { note: "about 1 pepper" }), ing("paprika", 2), ing("cumin", 1), ing("olive-oil", 10), ing("houmous", 60), ing("salad-leaves", 40), ing("wraps", 120, { note: "about 2 wraps" }), ing("salt", 1)],
    method: [
      "Get ready: Drain the tofu, pat it dry and cut it into strips about 1 cm thick. Cut the pepper in half, scoop out the seeds and white inside, and slice it into strips.",
      "Fry the pepper: Heat half the oil in a large non-stick frying pan over a medium heat. Fry the pepper for 5 minutes, stirring, until soft. Lift it onto a plate.",
      "Fry the tofu: Add the rest of the oil and the tofu strips. Sprinkle over the paprika, cumin and a pinch of salt and fry for 6 to 8 minutes, turning gently, until golden on both sides.",
      "Warm the wraps: Warm the wraps one at a time in a dry pan for about 20 seconds a side, so they fold without cracking.",
      "Fill the wraps: Spread the houmous down the middle of each wrap. Add a line of salad leaves, then the pepper and tofu.",
      "Roll and serve: Fold in the sides and roll each wrap up tightly. Cut in half on the diagonal and serve warm.",
    ],
  },
  // ---- vegetarian
  {
    id: "quorn-tikka-style-curry-rice", meal: "dinner", tags: ["Indian"], name: "Quorn tikka-style curry with rice", blurb: "Quorn pieces in a creamy spiced tomato and yogurt sauce with spinach, served with rice.", servings: 2, minutes: 35,
    ingredients: [ing("quorn", 300), ing("rice", 120), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("curry-paste", 40), ing("chopped-tomatoes", 400), ing("greek-yogurt", 150), ing("spinach", 80), ing("vegetable-oil", 10)],
    method: [
      "Soften the onion: Peel and finely chop the onion. Heat the oil in a large frying pan over a medium heat and cook the onion for 6 to 8 minutes, stirring, until soft and golden.",
      "Add the paste: Stir in the garlic and curry paste and cook for 1 minute, until fragrant.",
      "Add the Quorn: Add the Quorn pieces and stir for 2 minutes, until coated in the paste.",
      "Simmer: Pour in the chopped tomatoes with a splash of water. Bring to a bubble, then simmer gently for 12 to 15 minutes, stirring now and then, until the sauce is thick and the Quorn is piping hot.",
      "Cook the rice: While it simmers, rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender.",
      "Add the spinach: Stir the spinach into the curry a handful at a time, until it wilts.",
      "Stir in the yogurt: Take the pan off the heat and stir in the yogurt until the sauce is creamy. Don't let it boil again, or the yogurt may split.",
      "Serve: Spoon the rice into bowls and the curry alongside.",
    ],
  },
  {
    id: "quorn-pepper-fajitas", meal: "dinner", tags: ["Mexican", "Quick"], name: "Quorn and pepper fajitas", blurb: "Quorn pieces and peppers fried with fajita spices, in wraps with salsa and yogurt.", servings: 2, minutes: 20,
    ingredients: [ing("quorn", 300), ing("peppers", 320, { note: "about 2 peppers" }), ing("red-onion", 150, { note: "about 1 onion" }), ing("fajita-seasoning", 15), ing("vegetable-oil", 10), ing("wraps", 120, { note: "about 2 wraps" }), ing("salsa", 80), ing("greek-yogurt", 100)],
    method: [
      "Slice the vegetables: Cut the peppers in half, scoop out the seeds and white inside, and slice them into strips. Peel the onion and slice it into thin wedges.",
      "Fry the vegetables: Heat the oil in a large frying pan over a high heat. Add the peppers and onion and fry for 5 to 6 minutes, stirring, until soft and charred in places.",
      "Add the Quorn: Add the Quorn pieces and fajita seasoning with a splash of water. Fry for 6 to 8 minutes, stirring, until the Quorn is golden and piping hot.",
      "Warm the wraps: Warm the wraps one at a time in a dry pan for about 20 seconds a side, so they fold without cracking.",
      "Get the toppings ready: Spoon the salsa and yogurt into small bowls.",
      "Fill the wraps: Pile the Quorn and peppers down the middle of each wrap and add a spoonful each of salsa and yogurt.",
      "Fold and eat: Fold up the bottom of each wrap, then fold in the sides. Serve straight away, with the rest of the filling and toppings on the side.",
      "Keep the rest: Keep any leftover filling covered in the fridge for up to 2 days and reheat it until piping hot.",
    ],
  },
  {
    id: "quorn-broccoli-soy-stir-fry-rice", meal: "dinner", tags: ["Chinese"], name: "Quorn and broccoli soy stir-fry with rice", blurb: "Quorn pieces, broccoli and peppers stir-fried with garlic and soy, over rice.", servings: 2, minutes: 25,
    ingredients: [ing("quorn", 300), ing("rice", 120), ing("broccoli", 200), ing("peppers", 160, { note: "about 1 pepper" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("soy", 30), ing("honey", 10), ing("vegetable-oil", 10), ing("spring-onions", 30)],
    method: [
      "Cook the rice: Rinse the rice and put it in a saucepan with twice its volume of boiling water. Cover and simmer on a low heat for 10 to 12 minutes, until tender. Turn off the heat and leave it covered.",
      "Prepare the vegetables: Cut the broccoli into small florets. Cut the pepper in half, scoop out the seeds and slice it into strips. Trim and thinly slice the spring onions.",
      "Make the sauce: Stir the soy sauce, honey, garlic and 3 tablespoons of water together in a cup.",
      "Fry the Quorn: Heat the oil in a large frying pan or wok over a high heat. Fry the Quorn pieces for 5 minutes, stirring, until golden.",
      "Add the vegetables: Add the broccoli and pepper with a splash of water and stir-fry for 4 to 5 minutes, until the broccoli is bright green and just tender.",
      "Add the sauce: Pour in the sauce and toss for 2 minutes, until it bubbles, coats everything and the Quorn is piping hot.",
      "Check the rice: Fluff up the rice with a fork. If any water is left in the pan, drain it off.",
      "Serve: Spoon the rice into bowls, top with the stir-fry and scatter over the spring onions.",
    ],
  },
  {
    id: "creamy-cottage-cheese-tomato-pasta-spinach", meal: "dinner", tags: ["Pasta", "Italian"], name: "Creamy cottage cheese and tomato pasta with spinach", blurb: "Pasta in a smooth, creamy tomato sauce made with blended cottage cheese, with spinach and melted mozzarella.", servings: 2, minutes: 25,
    ingredients: [ing("pasta-shapes", 140), ing("cottage-cheese", 300), ing("passata", 300), ing("garlic", 10, { note: "about 2 cloves" }), ing("oregano", 1), ing("spinach", 100), ing("mozzarella", 60), ing("olive-oil", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Boil the water: Fill a large saucepan two-thirds full with boiling water from the kettle, add a pinch of salt and bring it back to the boil on a high heat.",
      "Cook the pasta: Add the pasta and stir. Boil for as long as the pack says, usually 10 to 12 minutes, until tender, stirring now and then.",
      "Blend the cottage cheese: Put the cottage cheese in a tall jug and blend it with a stick blender for about 1 minute, until smooth.",
      "Make the tomato sauce: Heat the oil in a large frying pan over a medium heat. Add the garlic and oregano and stir for 30 seconds, then pour in the passata and simmer for 5 minutes.",
      "Add the spinach: Stir the spinach into the sauce a handful at a time, until it wilts.",
      "Make it creamy: Turn the heat to low and stir in the blended cottage cheese until the sauce is smooth and pink. Warm it through for 2 minutes without letting it boil. Season with black pepper.",
      "Toss the pasta: Drain the pasta, saving a splash of the cooking water, and tip it into the sauce. Toss well, adding the water if it is too thick.",
      "Melt the mozzarella: Tear the mozzarella into small pieces, scatter it over the pasta and cover the pan for 2 minutes, until it melts. Serve straight away.",
    ],
  },
  {
    id: "cottage-cheese-spinach-pepper-frittata-salad", meal: "lunch", tags: ["Eggs"], name: "Cottage cheese, spinach and pepper frittata with salad", blurb: "A thick frittata of eggs, cottage cheese, spinach and peppers, with a crisp leaf salad.", servings: 3, minutes: 30,
    ingredients: [ing("eggs", 360, { note: "about 6 eggs" }), ing("cottage-cheese", 200), ing("spinach", 80), ing("peppers", 160, { note: "about 1 pepper" }), ing("cheddar", 30), ing("olive-oil", 10), ing("salad-leaves", 80), ing("cucumber", 150), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Heat the grill: Turn the grill on to medium-high.",
      "Prepare the vegetables: Cut the pepper in half, scoop out the seeds and white inside and chop it into small pieces. Chop the spinach roughly. Grate the cheddar.",
      "Whisk the eggs: Crack the eggs into a large bowl, add the cottage cheese and plenty of black pepper and whisk with a fork until well mixed. Wash your hands after touching raw eggs.",
      "Soften the pepper: Heat half the oil in a medium non-stick frying pan that can go under the grill. Fry the pepper over a medium heat for 4 minutes, then stir in the spinach until it wilts.",
      "Cook the frittata: Pour in the eggs and spread everything out evenly. Cook over a low heat for 8 to 10 minutes, without stirring, until the edges and base are set.",
      "Grill the top: Scatter the cheddar over and put the pan under the grill for 3 to 4 minutes, until golden and set in the middle. Use an oven glove: the handle gets hot.",
      "Make the salad: Rinse the cucumber and slice it. Toss the leaves and cucumber with the lemon juice, the rest of the oil and a pinch of black pepper.",
      "Serve: Leave the frittata for 2 minutes, then slide it onto a board, cut it into wedges and serve with the salad. It is good cold the next day too.",
    ],
  },
  {
    id: "cottage-cheese-chickpea-tomato-salad", meal: "lunch", tags: ["Salad", "No cook", "Quick"], name: "Cottage cheese, chickpea and tomato salad", blurb: "Chickpeas, cherry tomatoes, cucumber and leaves with cottage cheese and a lemon dressing.", servings: 2, minutes: 10,
    ingredients: [ing("chickpeas", 240), ing("cottage-cheese", 200), ing("cherry-tomatoes", 200), ing("cucumber", 150), ing("salad-leaves", 60), ing("lemon-juice", 15), ing("olive-oil", 10), ing("cumin", 1), ing("black-pepper", 1)],
    method: [
      "Drain the chickpeas: Tip the chickpeas into a sieve, rinse them under the cold tap and leave them to drain well.",
      "Make the dressing: Whisk the lemon juice, oil, cumin and a pinch of black pepper together in a large bowl with a fork.",
      "Cut the vegetables: Cut the cherry tomatoes in half. Rinse the cucumber, cut it in half lengthways and slice it into half-moons.",
      "Toss the salad: Add the chickpeas, tomatoes and cucumber to the dressing and toss until coated.",
      "Add the leaves: Share the salad leaves between plates or lunch boxes and spoon the chickpea salad on top.",
      "Add the cottage cheese: Spoon the cottage cheese on top, grind over a little more black pepper and serve. Keep it covered in the fridge for up to a day if packing it for later.",
    ],
  },
  {
    id: "egg-chickpea-spinach-curry-naan", meal: "lunch", tags: ["Indian", "Eggs"], name: "Egg, chickpea and spinach curry with naan", blurb: "Boiled eggs and chickpeas in a quick spiced tomato sauce with spinach, with warm naan.", servings: 2, minutes: 25,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("chickpeas", 240), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 5, { note: "about 1 clove" }), ing("curry-powder", 6), ing("chopped-tomatoes", 400), ing("spinach", 80), ing("vegetable-oil", 10), ing("naan", 260)],
    method: [
      "Boil the eggs: Lower the eggs into a pan of boiling water on a spoon. Boil for 9 minutes, until the whites and yolks are completely set, then cool them in cold water. Wash your hands after touching raw eggs.",
      "Soften the onion: Peel and chop the onion. Heat the oil in a large frying pan over a medium heat and cook the onion for 6 to 8 minutes, until soft.",
      "Add the spices: Stir in the garlic and curry powder for 1 minute, until fragrant.",
      "Simmer the sauce: Rinse and drain the chickpeas. Add them to the pan with the chopped tomatoes and simmer for 8 minutes, stirring, until thick. Stir in the spinach until it wilts.",
      "Add the eggs: Peel the eggs, cut them in half and nestle them into the sauce, yolks up. Warm through for 2 minutes.",
      "Warm the naan: Warm the naans in a toaster or a dry pan for 1 to 2 minutes, until soft and hot. Serve with the curry.",
    ],
  },
];

export const PROTEIN_MEALS_LOOKS: Readonly<Record<string, string>> = {
  "crispy-tofu-broccoli-stir-fry-rice": "A wide white bowl of fluffy white rice topped with golden, crisp cubes of tofu, bright green broccoli florets and red pepper strips in a glossy dark soy glaze, scattered with thin green spring onion rings.",
  "tofu-spinach-tomato-curry-rice": "A white plate with a mound of fluffy white rice beside a rich red tomato curry full of golden cubes of tofu and dark green wilted spinach, the sauce speckled with spices.",
  "tofu-kidney-bean-chilli-rice": "A deep white bowl with white rice on one side and a thick, dark red chilli on the other, full of crumbled golden tofu, glossy kidney beans and soft red pepper pieces.",
  "tofu-pea-sweetcorn-fried-rice": "A wide white bowl of golden fried rice studded with crumbled golden tofu, bright green peas and yellow sweetcorn kernels, glossy with soy and scattered with thin green spring onion rings.",
  "soy-tofu-pea-rice-bowl": "A wide white bowl of white rice topped in separate piles with glossy soy-glazed golden tofu cubes, bright green peas and pale green cucumber half-moons, scattered with spring onion rings.",
  "smoky-tofu-pepper-wraps": "A tortilla wrap cut in half on the diagonal on a round white plate, the cut ends showing golden paprika-dusted tofu strips, soft red pepper strips, creamy beige houmous and green salad leaves.",
  "quorn-tikka-style-curry-rice": "A white plate with a mound of fluffy white rice beside a creamy orange curry full of golden meat-free pieces and dark green wilted spinach.",
  "quorn-pepper-fajitas": "A round white plate with two folded tortilla wraps filled with golden spiced meat-free pieces, charred red and yellow pepper strips and soft red onion, with small bowls of red tomato salsa and white yogurt beside them.",
  "quorn-broccoli-soy-stir-fry-rice": "A wide white bowl of fluffy white rice topped with golden meat-free pieces, bright green broccoli florets and red pepper strips in a glossy dark soy glaze, scattered with thin spring onion rings.",
  "creamy-cottage-cheese-tomato-pasta-spinach": "A wide white bowl of short pasta in a smooth, creamy pale pink tomato sauce with dark green wilted spinach, topped with soft melted patches of white mozzarella.",
  "cottage-cheese-spinach-pepper-frittata-salad": "A thick golden wedge of frittata on a white plate, its cut side showing set egg dotted with white curds of cottage cheese, red pepper and dark green spinach, beside a salad of green leaves and cucumber slices.",
  "cottage-cheese-chickpea-tomato-salad": "A wide white bowl of green salad leaves topped with golden chickpeas, halved red cherry tomatoes and cucumber half-moons, with a generous spoonful of creamy white cottage cheese in the middle.",
  "egg-chickpea-spinach-curry-naan": "A shallow white bowl of thick red tomato and chickpea curry with dark green wilted spinach, topped with four boiled egg halves showing bright yellow yolks, beside a golden warm naan.",
};
