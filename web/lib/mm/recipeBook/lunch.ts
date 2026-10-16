import { ing, type Recipe } from "../recipes";

// Lunches. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const LUNCH: readonly Recipe[] = [
  {
    id: "tuna-sweetcorn-pasta-salad", meal: "lunch", tags: ["Pasta", "Make ahead"], name: "Tuna and sweetcorn pasta salad", blurb: "A packed-lunch favourite.", servings: 2, minutes: 15,
    ingredients: [ing("pasta-shapes", 150), ing("tuna", 102), ing("sweetcorn", 100), ing("light-mayo", 40), ing("spring-onions", 30), ing("black-pepper", 1)],
    method: ["Cook the pasta as the pack says, then rinse under cold water and drain.", "Mix with the drained tuna, sweetcorn, mayonnaise, sliced spring onions and a little black pepper.", "Keep in the fridge and eat within two days."],
  },
  {
    id: "chicken-caesar-wraps", meal: "lunch", tags: ["Wrap"], name: "BBQ chicken and pepper wraps", blurb: "Chicken and peppers in barbecue sauce with crisp lettuce and grated cheese, rolled up.", servings: 2, minutes: 20,
    ingredients: [ing("chicken", 280), ing("wraps", 120), ing("bbq-sauce", 40), ing("peppers", 160, { note: "about 1 pepper" }), ing("cheddar", 25), ing("lettuce", 60), ing("oil-spray", 1)],
    method: [
      "Slice the chicken and the pepper into strips.",
      "Cook the chicken in a hot non-stick pan with a little oil spray for 6 to 8 minutes, adding the pepper after 2 minutes, until the chicken is cooked through with no pink left inside.",
      "Stir in the barbecue sauce and let it bubble for a minute so it coats the chicken.",
      "Lay the lettuce on the wraps, add the chicken and peppers, grate the cheese on top, roll up tightly and cut in half.",
    ],
  },
  {
    id: "mushroom-wrap-pizzas", meal: "lunch", tags: ["Wrap", "Quick"], name: "Mushroom and mozzarella wrap pizzas", blurb: "Crisp wraps topped with passata, mushrooms and melted mozzarella.", servings: 2, minutes: 20,
    ingredients: [ing("wraps", 120), ing("passata", 100), ing("mozzarella", 125, { role: "protein" }), ing("mushrooms", 100), ing("oregano", 1)],
    method: [
      "Heat the oven to 200°C (180°C fan, gas 6).",
      "Lay the wraps on a baking tray and spread each one with passata.",
      "Scatter over the sliced mushrooms, tear the mozzarella over the top and sprinkle with the oregano.",
      "Bake for 8 to 10 minutes, until the cheese has melted and the edges are crisp.",
    ],
  },
  {
    id: "mexican-bean-rice-bowl", meal: "lunch", tags: ["Bowl"], name: "Mexican bean and rice bowl", blurb: "Kidney beans, rice, sweetcorn and salsa with grated cheese.", servings: 2, minutes: 20,
    ingredients: [ing("kidney-beans", 240), ing("rice", 140), ing("sweetcorn", 100), ing("salsa", 100), ing("cheddar", 40), ing("cumin", 2), ing("lemon-juice", 15), ing("lettuce", 60)],
    method: [
      "Cook the rice as the pack says.",
      "Warm the drained kidney beans and sweetcorn in a small pan with the cumin and a splash of water.",
      "Share the shredded lettuce and the rice between bowls and top with the beans and sweetcorn.",
      "Spoon over the salsa, grate the cheese on top and finish with a squeeze of lemon.",
    ],
  },
  {
    id: "smoked-salmon-soft-cheese-wraps", meal: "lunch", tags: ["Wrap", "Quick"], name: "Smoked salmon and soft cheese wraps", blurb: "No cooking: spread, fill and roll.", servings: 2, minutes: 5,
    ingredients: [ing("smoked-salmon", 100), ing("soft-cheese", 60), ing("wraps", 120), ing("cucumber", 80), ing("salad-leaves", 40), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Spread the soft cheese over the wraps.",
      "Lay the smoked salmon, cucumber and a few salad leaves on top, then add lemon and black pepper.",
      "Roll up tightly and cut in half.",
    ],
  },
  {
    id: "egg-mayonnaise-wraps", meal: "lunch", tags: ["Wrap"], name: "Egg mayonnaise wraps", blurb: "A classic egg mayo filling in a soft wrap.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("light-mayo", 40), ing("wraps", 120), ing("spring-onions", 20), ing("salad-leaves", 30), ing("black-pepper", 1)],
    method: [
      "Lower the eggs into a pan of boiling water and boil for 9 to 10 minutes, until the yolks are set.",
      "Cool the eggs in cold water, then peel them.",
      "Mash the eggs with the mayonnaise, chopped spring onions and black pepper.",
      "Spread over the wraps with a few salad leaves, roll up and cut in half.",
    ],
  },
  {
    id: "ham-soft-cheese-wraps", meal: "lunch", tags: ["Wrap", "Quick"], name: "Ham and soft cheese wraps", blurb: "Ham, soft cheese, tomato and salad leaves, ready in five minutes.", servings: 2, minutes: 5,
    ingredients: [ing("ham", 120), ing("soft-cheese", 60), ing("wraps", 120), ing("tomatoes", 120), ing("salad-leaves", 40), ing("mustard", 5)],
    method: [
      "Spread the soft cheese over the wraps, then a thin layer of mustard.",
      "Add the ham, sliced tomato and a handful of salad leaves.",
      "Roll up tightly and cut in half.",
    ],
  },
  {
    id: "chickpea-tomato-salad", meal: "lunch", tags: ["Salad", "Quick"], name: "Chickpea, cucumber and tomato salad", blurb: "Chickpeas, cucumber, tomato and red onion with a lemon dressing.", servings: 2, minutes: 10,
    ingredients: [ing("chickpeas", 240), ing("olive-oil", 10), ing("cucumber", 80), ing("tomatoes", 120), ing("red-onion", 75, { note: "about half a red onion" }), ing("lemon-juice", 20), ing("salt", 1)],
    method: [
      "Rinse and drain the chickpeas and tip them into a bowl.",
      "Add the chopped cucumber, tomatoes and red onion.",
      "Whisk the olive oil with the lemon juice and a pinch of salt, then stir it through.",
    ],
  },
  {
    id: "pesto-pasta-mozzarella-salad", meal: "lunch", tags: ["Pasta", "Make ahead"], name: "Pesto pasta salad with mozzarella", blurb: "Pasta, pesto, tomatoes and torn mozzarella.", servings: 2, minutes: 15,
    ingredients: [ing("pasta-shapes", 150), ing("pesto", 40), ing("mozzarella", 125, { role: "protein" }), ing("cherry-tomatoes", 100), ing("salad-leaves", 30)],
    method: [
      "Cook the pasta as the pack says, then rinse under cold water and drain.",
      "Stir the pesto through the pasta.",
      "Add the halved cherry tomatoes, then tear the mozzarella over the top.",
      "Keep in the fridge and eat within two days.",
      "Add a handful of salad leaves just before you eat it.",
    ],
  },
  {
    id: "sweet-chilli-chicken-noodle-salad", meal: "lunch", tags: ["Salad"], name: "Sweet chilli chicken noodle salad", blurb: "Noodles, chicken and crunchy vegetables in sweet chilli.", servings: 2, minutes: 20,
    ingredients: [ing("chicken", 250), ing("noodles", 300), ing("sweet-chilli", 50), ing("carrots", 100, { note: "about 1 carrot" }), ing("cucumber", 80), ing("spring-onions", 30), ing("lemon-juice", 15), ing("oil-spray", 1)],
    method: [
      "Cook the noodles as the pack says, then rinse under cold water and drain.",
      "Slice the chicken and cook it in a hot non-stick pan with a little oil spray for 6 to 8 minutes, until cooked through with no pink inside.",
      "Peel and grate the carrot and cut the cucumber into thin sticks, then toss them with the noodles, sweet chilli sauce and lemon juice.",
      "Top with the chicken and the sliced spring onions.",
    ],
  },
  {
    id: "chickpea-rice-bowl", meal: "lunch", tags: ["Bowl"], name: "Sweet chilli chickpea rice bowl", blurb: "Golden chickpeas in a sticky soy and sweet chilli glaze, with rice and peas.", servings: 2, minutes: 25,
    ingredients: [ing("chickpeas", 240), ing("rice", 140), ing("soy", 20), ing("sweet-chilli", 40), ing("peas", 100), ing("spring-onions", 30), ing("cucumber", 80), ing("vegetable-oil", 5)],
    method: [
      "Cook the rice as the pack says.",
      "Pat the drained chickpeas dry with kitchen paper.",
      "Fry the chickpeas in a non-stick pan with the oil for 8 to 10 minutes, shaking the pan, until golden.",
      "Cook the peas in boiling water for 3 minutes and drain.",
      "Stir the soy sauce and sweet chilli sauce into the chickpeas and let them bubble for a minute, then serve on the rice with the peas, cucumber and spring onions.",
    ],
  },
  {
    id: "sweetcorn-potato-soup", meal: "lunch", tags: ["Soup", "Make ahead"], name: "Sweetcorn and potato soup", blurb: "A thick, warming soup from store-cupboard staples.", servings: 3, minutes: 30,
    // the potatoes cook in the method's own 700 ml of water: fitting moves them at most half as much again, or the soup turns to mash
    ingredients: [ing("sweetcorn", 395), ing("new-potatoes", 340, { fit: [0.5, 1.5] }), ing("stock-cube", 12), ing("olive-oil", 15), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("paprika", 1), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Soften the chopped onion and garlic in the olive oil for 5 minutes.",
      "Add the drained potatoes, the sweetcorn, the paprika, the crumbled stock cubes and 700 ml of water.",
      "Bring to the boil, then simmer for 15 minutes, stirring now and then.",
      "Blend until smooth, or leave it chunky, and season to taste.",
    ],
  },
  {
    id: "chicken-sweetcorn-soup", meal: "lunch", tags: ["Soup"], name: "Chicken and sweetcorn soup", blurb: "A takeaway-style soup with ribbons of egg.", servings: 2, minutes: 25,
    // the chicken cooks in the method's own 800 ml of stock: at most half as much again when fitted
    ingredients: [ing("chicken", 250, { fit: [0.5, 1.5] }), ing("sweetcorn", 195), ing("stock-cube", 12), ing("eggs", 60, { role: "other", note: "1 egg" }), ing("spring-onions", 30), ing("black-pepper", 1)],
    method: [
      "Dissolve the stock cubes in 800 ml of boiling water in a large pan.",
      "Cut the chicken into small pieces, add it to the pan and simmer for 10 to 12 minutes, until cooked through with no pink left.",
      "Add the sweetcorn and simmer for 3 more minutes.",
      "Beat the egg, then pour it slowly into the soup while stirring, and cook for a minute until set.",
      "Serve topped with spring onions and a little black pepper.",
    ],
  },
  {
    id: "bean-tomato-soup", meal: "lunch", tags: ["Soup", "Make ahead"], name: "Bean and tomato soup", blurb: "Kidney beans blended with tomatoes and a little paprika.", servings: 3, minutes: 30,
    ingredients: [ing("kidney-beans", 480), ing("chopped-tomatoes", 400), ing("chopped-tomato-puree", 30), ing("stock-cube", 6), ing("olive-oil", 15), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("paprika", 2), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Soften the chopped onion and garlic in the olive oil for 5 minutes.",
      "Stir in the tomato purée and paprika for a minute.",
      "Add the drained kidney beans, the tomatoes, the crumbled stock cube and 500 ml of water.",
      "Simmer for 15 minutes, then blend until smooth and season to taste.",
    ],
  },
  {
    id: "tuna-bean-salad", meal: "lunch", tags: ["Salad", "Quick"], name: "Tuna and bean salad", blurb: "Store-cupboard salad with red onion and a lemon dressing.", servings: 2, minutes: 10,
    ingredients: [ing("tuna", 200), ing("kidney-beans", 240, { role: "carb" }), ing("olive-oil", 10), ing("red-onion", 75, { note: "about half a red onion" }), ing("cherry-tomatoes", 100), ing("lemon-juice", 20), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Rinse and drain the kidney beans and tip them into a bowl.",
      "Add the drained tuna, finely sliced red onion and tomatoes.",
      "Whisk the olive oil with the lemon juice, salt and pepper, then stir it through.",
    ],
  },
  {
    id: "potato-egg-salad", meal: "lunch", tags: ["Salad"], name: "New potato, egg and pea salad", blurb: "Boiled eggs, potatoes and peas with a mustard dressing.", servings: 2, minutes: 20,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("new-potatoes", 340), ing("peas", 100), ing("light-mayo", 30), ing("mustard", 5), ing("lemon-juice", 10), ing("salad-leaves", 30)],
    method: [
      "Lower the eggs into a pan of boiling water and boil for 9 to 10 minutes, until the yolks are set, then cool them in cold water and peel.",
      "Drain the potatoes and cut any large ones in half.",
      "Cook the peas as the pack says, then cool them under cold water.",
      "Mix the mayonnaise with the mustard and a squeeze of lemon.",
      "Toss the potatoes and peas in the dressing, add the eggs cut into quarters and serve on the salad leaves.",
    ],
  },
  {
    id: "cheese-bean-quesadillas", meal: "lunch", tags: ["Wrap", "Quick"], name: "Cheese and bean quesadillas", blurb: "Crisp toasted wraps filled with beans, salsa and melted cheese.", servings: 2, minutes: 15,
    ingredients: [ing("wraps", 240, { fit: [0.5, 2] }), ing("kidney-beans", 240), ing("cheddar", 60), ing("salsa", 60), ing("cumin", 2), ing("spring-onions", 30), ing("salad-leaves", 40)],
    method: [
      "Rinse and drain the beans, then roughly mash them with the salsa and cumin.",
      "Spread the beans over half of the wraps, scatter over the grated cheese and sliced spring onions, and cover with the rest of the wraps.",
      "Cook one at a time in a dry frying pan over a medium heat for 2 to 3 minutes each side, until golden and the cheese has melted.",
      "Cut into wedges and serve with the salad leaves.",
    ],
  },
  {
    id: "curried-rice-salad", meal: "lunch", tags: ["Salad", "Make ahead"], name: "Curried rice salad with raisins and almonds", blurb: "A curried rice salad with peppers, raisins and almonds.", servings: 2, minutes: 20,
    ingredients: [ing("rice", 140), ing("almonds", 30), ing("raisins", 30), ing("peppers", 160, { note: "about 1 pepper" }), ing("spring-onions", 30), ing("curry-powder", 3), ing("olive-oil", 10), ing("lemon-juice", 15), ing("salt", 1)],
    method: [
      "Cook the rice as the pack says, then rinse under cold water and drain well.",
      "Warm the olive oil in a small pan, stir in the curry powder for 30 seconds, then take it off the heat and whisk in the lemon juice and a pinch of salt.",
      "Stir the dressing through the rice with the chopped pepper, spring onions and raisins.",
      "Scatter over the roughly chopped almonds. Keep in the fridge and eat within a day.",
    ],
  },
  {
    id: "chicken-mushroom-noodle-soup", meal: "lunch", tags: ["Soup"], name: "Chicken and mushroom noodle soup", blurb: "Chicken, mushrooms and noodles in a savoury stock.", servings: 2, minutes: 25,
    // the chicken cooks in the method's own 800 ml of stock: at most half as much again when fitted
    ingredients: [ing("chicken", 250, { fit: [0.5, 1.5] }), ing("mushrooms", 200), ing("noodles", 200, { subs: [] }), ing("stock-cube", 12), ing("soy", 20), ing("spring-onions", 30), ing("garlic", 5)],
    method: [
      "Dissolve the stock cubes in 800 ml of boiling water in a large pan.",
      "Slice the chicken into thin strips and add it to the pan with the sliced mushrooms and the garlic. Simmer for 10 minutes, until the chicken is cooked through with no pink left.",
      "Add the noodles and the soy sauce and simmer for 2 to 3 minutes, until the noodles are piping hot.",
      "Ladle into bowls and top with sliced spring onions.",
    ],
  },
];
