import { ing, type Recipe } from "../recipes";

// Lunches. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const LUNCH: readonly Recipe[] = [
  {
    id: "tuna-sweetcorn-pasta-salad", meal: "lunch", tags: ["Pasta", "Make ahead"], name: "Tuna and sweetcorn pasta salad", blurb: "A packed-lunch favourite.", servings: 2, minutes: 15,
    ingredients: [ing("pasta-shapes", 150), ing("tuna", 145), ing("sweetcorn", 100), ing("light-mayo", 40)],
    method: ["Cook the pasta as the pack says, then rinse under cold water and drain.", "Mix with the drained tuna, sweetcorn and mayonnaise.", "Keep in the fridge and eat within two days."],
    extras: ["Spring onions", "Black pepper"],
  },
  {
    id: "chicken-caesar-wraps", meal: "lunch", tags: ["Wrap"], name: "Chicken Caesar-style wraps", blurb: "Warm chicken, crisp lettuce and a cheesy dressing, rolled up.", servings: 2, minutes: 20,
    ingredients: [ing("chicken", 280), ing("wraps", 120), ing("parmesan", 20), ing("light-mayo", 30)],
    method: [
      "Slice the chicken into strips and cook in a hot non-stick pan for 6 to 8 minutes, until cooked through with no pink left inside.",
      "Grate most of the cheese and mix it into the mayonnaise with a squeeze of lemon and plenty of black pepper.",
      "Lay the lettuce on the wraps, add the chicken and spoon over the dressing.",
      "Grate the rest of the cheese on top, roll up tightly and cut in half.",
    ],
    extras: ["Cos or romaine lettuce", "A squeeze of lemon", "Black pepper"],
  },
  {
    id: "halloumi-chickpea-rice-salad", meal: "lunch", tags: ["Salad", "Make ahead"], name: "Halloumi, chickpea and rice salad", blurb: "Golden halloumi on a herby rice and chickpea salad.", servings: 2, minutes: 25,
    ingredients: [ing("halloumi", 120), ing("chickpeas", 200), ing("rice", 120)],
    method: [
      "Cook the rice as the pack says, then rinse under cold water and drain well.",
      "Mix the rice with the drained chickpeas, chopped cucumber, tomatoes, herbs and a squeeze of lemon.",
      "Slice the halloumi and fry in a dry non-stick pan for 2 minutes each side, until golden.",
      "Put the halloumi on top of the salad and eat straight away, or pack the halloumi separately.",
    ],
    extras: ["Cucumber", "Cherry tomatoes", "Fresh mint or parsley", "A squeeze of lemon"],
  },
  {
    id: "mexican-bean-rice-bowl", meal: "lunch", tags: ["Bowl"], name: "Mexican bean and rice bowl", blurb: "Black beans, rice, sweetcorn and salsa with grated cheese.", servings: 2, minutes: 20,
    ingredients: [ing("black-beans", 240), ing("rice", 140), ing("sweetcorn", 100), ing("salsa", 100), ing("cheddar", 40)],
    method: [
      "Cook the rice as the pack says.",
      "Warm the drained black beans and sweetcorn in a small pan with the cumin and a splash of water.",
      "Share the rice between two bowls and top with the beans and sweetcorn.",
      "Spoon over the salsa, grate the cheese on top and finish with lime and coriander.",
    ],
    extras: ["Ground cumin", "A lime", "Fresh coriander", "Shredded lettuce"],
  },
  {
    id: "smoked-salmon-soft-cheese-wraps", meal: "lunch", tags: ["Wrap", "Quick"], name: "Smoked salmon and soft cheese wraps", blurb: "No cooking: spread, fill and roll.", servings: 2, minutes: 5,
    ingredients: [ing("smoked-salmon", 120), ing("soft-cheese", 60), ing("wraps", 120)],
    method: [
      "Spread the soft cheese over the wraps.",
      "Lay the smoked salmon, cucumber and a few salad leaves on top, then add lemon and black pepper.",
      "Roll up tightly and cut in half.",
    ],
    extras: ["Cucumber", "Salad leaves", "A squeeze of lemon", "Black pepper", "Fresh dill"],
  },
  {
    id: "egg-mayonnaise-wraps", meal: "lunch", tags: ["Wrap"], name: "Egg mayonnaise wraps", blurb: "A classic egg mayo filling in a soft wrap.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("light-mayo", 40), ing("wraps", 120)],
    method: [
      "Lower the eggs into a pan of boiling water and boil for 9 to 10 minutes, until the yolks are set.",
      "Cool the eggs in cold water, then peel them.",
      "Mash the eggs with the mayonnaise, chives and black pepper.",
      "Spread over the wraps with some cress or salad leaves, roll up and cut in half.",
    ],
    extras: ["Chives or spring onions", "Cress or salad leaves", "Black pepper"],
  },
  {
    id: "ham-soft-cheese-wraps", meal: "lunch", tags: ["Wrap", "Quick"], name: "Ham and soft cheese wraps", blurb: "Ham, soft cheese and crunchy salad, ready in five minutes.", servings: 2, minutes: 5,
    ingredients: [ing("ham", 120), ing("soft-cheese", 60), ing("wraps", 120)],
    method: [
      "Spread the soft cheese over the wraps.",
      "Add the ham, sliced tomato and a handful of salad leaves.",
      "Roll up tightly and cut in half.",
    ],
    extras: ["Tomatoes", "Salad leaves", "A little mustard"],
  },
  {
    id: "chickpea-feta-salad", meal: "lunch", tags: ["Salad", "Quick"], name: "Chickpea and feta salad", blurb: "Chickpeas, crumbled feta, cucumber and tomato with a lemon dressing.", servings: 2, minutes: 10,
    ingredients: [ing("chickpeas", 240), ing("feta", 80), ing("olive-oil", 10)],
    method: [
      "Rinse and drain the chickpeas and tip them into a bowl.",
      "Add the chopped cucumber, tomatoes, red onion and parsley.",
      "Whisk the olive oil with the lemon juice and a pinch of salt, then stir it through.",
      "Crumble the feta over the top.",
    ],
    extras: ["Cucumber", "Tomatoes", "Red onion", "Fresh parsley", "Juice of half a lemon"],
  },
  {
    id: "pesto-pasta-mozzarella-salad", meal: "lunch", tags: ["Pasta", "Make ahead"], name: "Pesto pasta salad with mozzarella", blurb: "Pasta, pesto, tomatoes and torn mozzarella.", servings: 2, minutes: 15,
    ingredients: [ing("pasta-shapes", 150), ing("pesto", 40), ing("mozzarella", 125, { role: "protein" })],
    method: [
      "Cook the pasta as the pack says, then rinse under cold water and drain.",
      "Stir the pesto through the pasta.",
      "Add the halved cherry tomatoes and a handful of rocket, then tear the mozzarella over the top.",
      "Keep in the fridge and eat within two days.",
    ],
    extras: ["Cherry tomatoes", "Rocket or spinach", "Fresh basil"],
  },
  {
    id: "sweet-chilli-prawn-noodle-salad", meal: "lunch", tags: ["Salad"], name: "Sweet chilli prawn noodle salad", blurb: "Rice noodles, king prawns and crunchy vegetables in sweet chilli.", servings: 2, minutes: 20,
    ingredients: [ing("prawns", 250), ing("rice-noodles", 120), ing("sweet-chilli", 50)],
    method: [
      "Soak or cook the noodles as the pack says, then rinse under cold water and drain.",
      "Cook the prawns in a hot non-stick pan for 3 to 4 minutes, until pink all the way through and piping hot.",
      "Toss the noodles with the shredded vegetables, sweet chilli sauce and lime juice.",
      "Top with the prawns and fresh coriander.",
    ],
    extras: ["Carrot", "Cucumber", "Spring onions", "A lime", "Fresh coriander"],
  },
  {
    id: "teriyaki-tofu-rice-bowl", meal: "lunch", tags: ["Bowl"], name: "Teriyaki tofu rice bowl", blurb: "Sticky glazed tofu with rice and edamame beans.", servings: 2, minutes: 25,
    ingredients: [ing("tofu", 280), ing("rice", 140), ing("teriyaki", 50), ing("edamame", 100, { role: "other" })],
    method: [
      "Cook the rice as the pack says.",
      "Pat the tofu dry with kitchen paper and cut it into cubes.",
      "Fry the tofu in a hot non-stick pan for 8 to 10 minutes, turning, until golden on all sides.",
      "Cook the edamame beans in boiling water for 3 minutes and drain.",
      "Pour the teriyaki sauce over the tofu and let it bubble for a minute, then serve on the rice with the beans.",
    ],
    extras: ["Spring onions", "Sesame seeds", "Sliced cucumber"],
  },
  {
    id: "tomato-red-lentil-soup", meal: "lunch", tags: ["Soup", "Make ahead"], name: "Tomato and red lentil soup", blurb: "A thick, warming soup from store-cupboard staples.", servings: 3, minutes: 35,
    ingredients: [ing("red-lentils", 180), ing("chopped-tomatoes", 800), ing("stock-cube", 10), ing("olive-oil", 15)],
    method: [
      "Soften the chopped onion and garlic in the olive oil for 5 minutes.",
      "Rinse the lentils in a sieve, then add them to the pan with the tomatoes, the crumbled stock cube and 700 ml of water.",
      "Bring to the boil, then simmer for 20 to 25 minutes, stirring now and then, until the lentils are soft.",
      "Blend until smooth, or leave it chunky, and season to taste.",
    ],
    extras: ["An onion", "Two garlic cloves", "Ground cumin", "Salt and pepper"],
  },
  {
    id: "chicken-sweetcorn-soup", meal: "lunch", tags: ["Soup"], name: "Chicken and sweetcorn soup", blurb: "A takeaway-style soup with ribbons of egg.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 250), ing("sweetcorn", 200), ing("stock-cube", 10), ing("eggs", 60, { role: "other", note: "1 egg" })],
    method: [
      "Dissolve the stock cube in 800 ml of boiling water in a large pan and add the grated ginger.",
      "Cut the chicken into small pieces, add it to the pan and simmer for 10 to 12 minutes, until cooked through with no pink left.",
      "Add the sweetcorn and simmer for 3 more minutes.",
      "Beat the egg, then pour it slowly into the soup while stirring, and cook for a minute until set.",
      "Serve topped with spring onions.",
    ],
    extras: ["Fresh ginger", "Spring onions", "White pepper"],
  },
  {
    id: "butter-bean-tomato-soup", meal: "lunch", tags: ["Soup", "Make ahead"], name: "Butter bean and tomato soup", blurb: "Creamy butter beans blended with tomatoes.", servings: 3, minutes: 30,
    ingredients: [ing("butter-beans", 470), ing("chopped-tomatoes", 400), ing("chopped-tomato-puree", 30), ing("stock-cube", 10), ing("olive-oil", 15)],
    method: [
      "Soften the chopped onion and garlic in the olive oil for 5 minutes.",
      "Stir in the tomato purée and smoked paprika for a minute.",
      "Add the drained butter beans, the tomatoes, the crumbled stock cube and 500 ml of water.",
      "Simmer for 15 minutes, then blend until smooth and season to taste.",
    ],
    extras: ["An onion", "Two garlic cloves", "Smoked paprika", "Salt and pepper"],
  },
  {
    id: "tuna-butter-bean-salad", meal: "lunch", tags: ["Salad", "Quick"], name: "Tuna and butter bean salad", blurb: "Store-cupboard salad with red onion and a lemon dressing.", servings: 2, minutes: 10,
    ingredients: [ing("tuna", 200), ing("butter-beans", 235, { role: "carb" }), ing("olive-oil", 10)],
    method: [
      "Rinse and drain the butter beans and tip them into a bowl.",
      "Add the drained tuna, finely sliced red onion, tomatoes and parsley.",
      "Whisk the olive oil with the lemon juice, salt and pepper, then stir it through.",
    ],
    extras: ["Red onion", "Cherry tomatoes", "Fresh parsley", "Juice of half a lemon", "Salt and pepper"],
  },
  {
    id: "smoked-mackerel-new-potato-salad", meal: "lunch", tags: ["Salad"], name: "Smoked mackerel and new potato salad", blurb: "Flaked smoked mackerel, potatoes and peas with a horseradish dressing.", servings: 2, minutes: 15,
    ingredients: [ing("mackerel", 160), ing("new-potatoes", 340), ing("peas", 100), ing("light-mayo", 30)],
    method: [
      "Drain the potatoes and cut any large ones in half.",
      "Cook the peas as the pack says, then cool them under cold water.",
      "Mix the mayonnaise with the horseradish and a squeeze of lemon.",
      "Peel the skin off the mackerel and break it into large flakes.",
      "Toss the potatoes and peas in the dressing, then fold in the mackerel and watercress.",
    ],
    extras: ["A teaspoon of horseradish sauce", "A squeeze of lemon", "Watercress or salad leaves", "Chives"],
  },
  {
    id: "cheese-bean-quesadillas", meal: "lunch", tags: ["Wrap", "Quick"], name: "Cheese and bean quesadillas", blurb: "Crisp toasted wraps filled with beans, salsa and melted cheese.", servings: 2, minutes: 15,
    ingredients: [ing("wraps", 240), ing("kidney-beans", 200), ing("cheddar", 60), ing("salsa", 60)],
    method: [
      "Rinse and drain the beans, then roughly mash them with the salsa and cumin.",
      "Spread the beans over two of the wraps, scatter the grated cheese on top and cover with the other two wraps.",
      "Cook one at a time in a dry frying pan over a medium heat for 2 to 3 minutes each side, until golden and the cheese has melted.",
      "Cut into wedges and serve.",
    ],
    extras: ["Ground cumin", "Spring onions", "Salad leaves"],
  },
  {
    id: "edamame-peanut-noodle-salad", meal: "lunch", tags: ["Salad", "Make ahead"], name: "Edamame and peanut noodle salad", blurb: "Rice noodles and edamame beans in a peanut and lime dressing.", servings: 2, minutes: 20,
    ingredients: [ing("edamame", 200), ing("rice-noodles", 120), ing("peanut-butter", 30), ing("sweet-chilli", 30)],
    method: [
      "Soak or cook the noodles as the pack says, then rinse under cold water and drain.",
      "Cook the edamame beans in boiling water for 3 minutes, then cool under cold water.",
      "Whisk the peanut butter, sweet chilli sauce and lime juice with a splash of hot water until smooth.",
      "Toss the noodles, beans and shredded vegetables in the dressing and top with coriander.",
    ],
    extras: ["Carrot", "Red cabbage", "Spring onions", "A lime", "Fresh coriander"],
  },
];
