import { ing, type Recipe } from "../recipes";

// Mediterranean-style meals (founder 2026-11-20: "Give more options like keto or whatever, like as many options as you can think about people would
// choose"): Greek, Italian and Spanish-style home dishes of chicken, fish, beans and vegetables cooked in olive oil, no red or processed meat (the style's
// rule is with EATING_STYLES in lib/mm/mealPlan.ts; each dish's cuisine gets its line in niches.ts). No wraps or pittas, so a week of them isn't wraps every
// day (founder 2026-11-20). Cheese is at most 40 g a serving. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const MEDITERRANEAN: readonly Recipe[] = [
  // ---- breakfasts
  {
    id: "spinach-mushroom-eggs-toast", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Spinach and mushroom scrambled eggs on toast", blurb: "Soft scrambled eggs with golden mushrooms and spinach, on wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("mushrooms", 150), ing("spinach", 80), ing("olive-oil", 10), ing("bread", 160), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks").
    method: [
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add the salt and a grind of black pepper and beat with a fork until no streaks of white are left. Wash your hands after handling raw eggs.",
      "Heat the pan: Wipe the mushrooms clean and cut them into thick slices, about 5 mm. Heat most of the oil in a large non-stick frying pan on a high heat for 1 minute, until it shimmers.",
      "Brown the mushrooms: Add the mushrooms in one layer and leave them for 2 minutes without stirring, until golden underneath. Then fry for 2 to 3 minutes more, stirring now and then, until golden all over and any liquid has gone.",
      "Wilt the spinach: Rinse the spinach unless the bag says it is ready washed. Add it to the pan and stir for 1 minute, until soft and dark green. Turn the heat down low.",
      "Scramble the eggs: Push the vegetables to one side and add the rest of the oil. Pour in the eggs, leave them for 20 seconds, then stir slowly with a wooden spoon for 3 to 4 minutes, folding in the vegetables, until just set in soft folds.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Check there is no runny egg left, then take the pan off the heat. Put the toast on warm plates, spoon the eggs on top and lift a few mushroom slices and spinach leaves on to the eggs. Serve straight away.",
    ],
  },
  {
    id: "houmous-tomato-spinach-toast", meal: "breakfast", tags: ["Quick", "Vegan"], name: "Houmous, tomato and spinach on toast", blurb: "Wholemeal toast spread thickly with houmous, topped with lemony spinach and sliced tomato.", servings: 1, minutes: 8,
    ingredients: [ing("bread", 80), ing("houmous", 50), ing("tomatoes", 120), ing("spinach", 30), ing("lemon-juice", 5), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Salt the tomatoes: Wash the tomatoes and cut them into slices about as thick as a pound coin. Lay them on a plate and sprinkle them with the salt, so they turn juicy and full of flavour while you get the rest ready.",
      "Dress the spinach: Rinse the spinach unless the bag says it is ready washed and shake it dry. Toss it in a small bowl with the lemon juice and a grind of black pepper, until the leaves look glossy.",
      "Toast the bread: Toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Spread the houmous: Stir the houmous, then spread it thickly over the warm toast, right to the edges.",
      "Top and serve: Pile the spinach on the houmous and lay the tomato slices over the top, with any juice from the plate. Add another grind of black pepper and eat straight away, while the toast is warm.",
    ],
  },
  {
    id: "spanish-style-pepper-eggs-toast", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Spanish-style eggs with peppers and tomatoes", blurb: "Soft peppers, onion and tomato with paprika, topped with soft folds of egg, on wholemeal toast.", servings: 2, minutes: 25,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("peppers", 240), ing("tomatoes", 170, { note: "about 2 tomatoes" }), ing("onion", 75), ing("garlic", 5, { note: "about 1 clove" }), ing("paprika", 2), ing("olive-oil", 20), ing("bread", 160), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks").
    method: [
      "Chop the vegetables: Peel the onion, halve it and slice it into thin half rings. Halve the peppers (red and yellow look best), pull out the stalks and seeds and cut them into strips about 1.5 cm wide. Wash the tomatoes and chop them into 2 cm pieces.",
      "Soften the peppers: Heat the oil in a large non-stick frying pan on a medium heat. Add the onion and peppers and cook for 10 to 12 minutes, stirring now and then, until soft, sweet and golden at the edges.",
      "Add the garlic and paprika: Stir in the garlic purée and paprika for 30 seconds, until they smell warm and toasty. Don't let them burn.",
      "Make the sauce: Add the tomatoes and a grind of black pepper. Cook for 6 to 8 minutes, stirring now and then, until the tomatoes collapse into a thick, paprika-red sauce that holds a line when you drag a spoon through it.",
      "Beat the eggs: Meanwhile, crack the eggs into a jug, picking out any shell, and beat them with a fork. Wash your hands after handling raw eggs.",
      "Cook the eggs: Turn the heat down low and pour the eggs into the middle of the pan. Leave them for 30 seconds, then fold them over gently just 3 or 4 times in 3 to 4 minutes, until set in big yellow folds.",
      "Toast the bread: While the eggs cook, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Put the toast on warm plates and spoon the eggs and peppers on top. Serve straight away.",
    ],
  },
  {
    id: "mozzarella-tomato-spinach-omelette", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Mozzarella, tomato and spinach omelette", blurb: "A folded omelette filled with melting mozzarella, cherry tomatoes and spinach.", servings: 1, minutes: 10,
    // the oil moves with the meal's size (5 to 15 ml), so a bigger breakfast is not only more eggs; the cheese stays at 40 g
    ingredients: [ing("eggs", 180, { note: "about 3 eggs" }), ing("mozzarella", 40), ing("cherry-tomatoes", 80), ing("spinach", 40), ing("olive-oil", 10, { role: "carb", fit: [0.5, 1.5] }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Get the filling ready: Rinse the cherry tomatoes and cut them in half. Rinse the spinach unless the bag says it is ready washed. Tear the mozzarella into small pieces and pat it dry on kitchen paper, so it melts without making the omelette watery.",
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add the salt and a grind of black pepper and beat with a fork until smooth. Wash your hands after handling raw eggs.",
      "Soften the filling: Heat the oil in a non-stick frying pan, about 20 cm across, on a medium heat. Add the spinach and tomatoes and stir for 1 to 2 minutes, until the spinach wilts and the tomatoes start to soften. Spread them out evenly.",
      "Add the eggs: Pour in the eggs and leave them for 30 seconds. Then draw the set edges into the middle with a spatula and tilt the pan so the runny egg fills the gaps.",
      "Add the cheese: After 2 to 3 minutes, when the omelette is nearly set, scatter the mozzarella over one half. Cook for 1 minute more without stirring, until the underside is golden when you lift an edge and the top is set, with no runny egg left.",
      "Fold and serve: Fold the empty half over the cheese with the spatula and slide the omelette on to a warm plate. Leave it for a minute before eating, as the cheese is very hot.",
    ],
  },
  // ---- lunches
  {
    id: "chicken-chickpea-tomato-oregano-salad", meal: "lunch", tags: ["Salad"], name: "Chicken, chickpea and tomato salad with oregano", blurb: "Golden oregano chicken on chickpeas, cucumber, tomatoes and red onion in a lemon dressing.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 240), ing("chickpeas", 240, { role: "carb" }), ing("cucumber", 150), ing("cherry-tomatoes", 200), ing("red-onion", 40), ing("olive-oil", 30), ing("lemon-juice", 20), ing("oregano", 1), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Slice the chicken: Lay each chicken breast flat and cut it in half through the middle, to make two thin fillets that cook evenly. Pat them dry with kitchen paper. Wash your hands, the knife and the board in hot soapy water.",
      "Marinate the chicken: Toss the fillets with a third of the oil, a teaspoon of the lemon juice, half the oregano, half the salt and some black pepper. Leave them for 10 minutes. If marinating longer than 30 minutes, cover and keep in the fridge.",
      "Soak the onion: Peel the red onion and slice it as thinly as you can. Put it in a large bowl with the rest of the lemon juice, so it turns softer and milder.",
      "Add the chickpeas: Drain and rinse the chickpeas, shake them dry and add them to the onion.",
      "Brown the chicken: Heat a large non-stick frying pan on a medium-high heat for 2 minutes. Lay in the fillets and leave them for 3 to 4 minutes without moving them, until golden brown underneath.",
      "Turn the chicken: Turn the fillets and fry for 3 to 4 minutes more, until golden brown on the other side too.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot, with no pink left. If not, cook for 2 minutes more. Lift it on to a clean board to rest for 2 minutes.",
      "Make the dressing: Add the rest of the oil, the rest of the salt and a grind of black pepper to the bowl, and stir well.",
      "Mix the salad: Cut the cucumber into cubes about 1 cm across and halve the cherry tomatoes. Add them to the bowl and turn everything over gently until glossy with the dressing.",
      "Serve: Cut the chicken into slices about 1 cm thick. Share the salad between bowls, lay the chicken slices down the middle and scatter the rest of the oregano over them. Or keep the salad and chicken covered in the fridge to eat the next day.",
    ],
  },
  {
    id: "tomato-mozzarella-toasts-spinach", meal: "lunch", tags: ["Quick"], name: "Tomato and mozzarella toasts", blurb: "Toast topped with garlic spinach, halved cherry tomatoes and melted mozzarella.", servings: 2, minutes: 12,
    ingredients: [ing("bread", 160), ing("cherry-tomatoes", 200), ing("mozzarella", 80), ing("olive-oil", 15), ing("garlic", 5, { note: "about 1 clove" }), ing("oregano", 1), ing("spinach", 40), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks").
    method: [
      "Heat the grill: Turn the grill on to a medium-high heat. Rinse the cherry tomatoes, cut them in half and sprinkle them with the salt and a grind of black pepper.",
      "Wilt the spinach: Rinse the spinach unless the bag says it is ready washed. Heat half the oil in a frying pan on a medium heat, add the garlic purée and the spinach and stir for 1 to 2 minutes, until soft and dark green.",
      "Drain the spinach: Tip the spinach into a sieve and press it with a spoon to squeeze out the liquid, so the toast stays crisp.",
      "Toast the bread: Lay the bread on the grill rack and toast it for 1 to 2 minutes on each side, until golden. Watch it closely, as it can burn quickly.",
      "Add the topping: Brush the rest of the oil over the toast. Spread the spinach over, set the tomatoes on top, cut side up, tear the mozzarella into pieces over everything and sprinkle with the oregano.",
      "Grill until melted: Grill for 2 to 3 minutes more, until the mozzarella has melted and is bubbling, with golden brown patches. Lower the grill a little if it browns too fast.",
      "Serve: Lift the toasts on to plates with a fish slice. Leave them for a minute before eating, as the cheese is very hot.",
    ],
  },
  {
    id: "greek-style-lemon-chicken-rice-soup", meal: "lunch", tags: ["Soup", "Batch cook"], name: "Greek-style lemon chicken and rice soup", blurb: "Chicken, rice, carrots and spinach in a silky lemon and egg broth.", servings: 4, minutes: 35,
    ingredients: [ing("chicken", 400), ing("rice", 120), ing("eggs", 120, { note: "about 2 eggs" }), ing("lemon-juice", 40), ing("stock-cube", 12, { note: "about 2 stock cubes" }), ing("onion", 150, { note: "about 1 onion" }), ing("carrots", 150), ing("spinach", 100), ing("olive-oil", 10), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Chop the vegetables: Peel the onion and chop it finely. Peel the carrots and cut them into small cubes about 1 cm across. Boil a full kettle.",
      "Marinate the chicken: Toss the chicken in a bowl with a quarter of the lemon juice and a grind of black pepper, and leave it while the vegetables soften. If marinating longer than 30 minutes, cover and keep in the fridge. Wash your hands.",
      "Soften the vegetables: Heat the oil in a large saucepan on a medium heat. Add the onion and carrots and cook for 8 minutes, stirring now and then, until the onion is soft, sweet and see-through.",
      "Add the stock: Crumble in the stock cubes, pour in 1000 ml of boiling water from the kettle and stir until they dissolve.",
      "Cook the chicken and rice: Add the chicken with its lemony juices and the rice, and bring to the boil. Cover and simmer gently for 15 to 18 minutes, until the rice is soft.",
      "Shred the chicken: Lift the chicken on to a board and cut into the thickest piece. It should be white all the way through, with no pink left. Pull it into shreds with two forks and put it back in the pan.",
      "Add the spinach: Rinse the spinach unless the bag says it is ready washed. Stir it in for 1 minute, until soft, then take the pan off the heat for 1 minute so it stops bubbling.",
      "Mix the egg and lemon: Crack the eggs into a bowl, picking out any shell, and beat them with the rest of the lemon juice. Slowly whisk in a ladleful of the hot soup, so the eggs warm up without scrambling.",
      "Thicken the soup: Pour the egg mixture into the pan, stirring all the time. Stir on a low heat for 2 to 3 minutes, until the soup turns silky, coats the back of the spoon and is piping hot. Don't let it boil.",
      "Serve: Stir in a good grind of black pepper and ladle the soup into warm bowls. Cool any left over quickly, then keep it in the fridge and eat it the same day or the next, reheated gently until piping hot.",
    ],
  },
  {
    id: "chicken-pepper-pesto-pasta-salad", meal: "lunch", tags: ["Salad", "Pasta"], name: "Chicken and roasted pepper pesto pasta salad", blurb: "Pasta in green pesto with roasted chicken and peppers, cherry tomatoes and spinach.", servings: 2, minutes: 25,
    ingredients: [ing("pasta-shapes", 160), ing("chicken", 200), ing("peppers", 240), ing("cherry-tomatoes", 150), ing("pesto", 40), ing("olive-oil", 10), ing("spinach", 40), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7). Halve the peppers, pull out the stalks and seeds and cut them into strips about 2 cm wide.",
      "Marinate the chicken: Cut the chicken into 2 cm strips and pat them dry. Toss them with a tablespoon of the pesto, half the salt and some black pepper. Leave them while the oven heats. If marinating longer than 30 minutes, cover and keep in the fridge.",
      "Fill the tray: Wash your hands, the knife and the board in hot soapy water. Toss the peppers on a large baking tray with the oil and the rest of the salt, add the chicken and spread everything out in one layer, with space around each piece.",
      "Roast: Roast on the top shelf for 15 to 18 minutes, turning once, until the chicken is golden and the peppers are soft and browned at the edges.",
      "Cook the pasta: Meanwhile, bring a large pan of water to the boil. Add the pasta, stir and cook as the pack says (usually 10 to 12 minutes), until soft with no hard bit in the middle.",
      "Cool the pasta: Drain the pasta in a colander and rinse it under the cold tap for 30 seconds, so it stops cooking and doesn't stick. Shake it well.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot, with no pink left. If not, roast for 3 to 4 minutes more.",
      "Dress the pasta: In a large bowl, stir the rest of the pesto through the pasta with a splash of cold water, until every piece is glossy and green.",
      "Mix the salad: Halve the cherry tomatoes and rinse the spinach unless the bag says it is ready washed. Add them to the pasta with the chicken, peppers and any juices from the tray, and turn everything over gently.",
      "Serve: Eat it warm straight away, or let it cool, cover it and keep it in the fridge to eat the next day.",
    ],
  },
  {
    id: "chicken-souvlaki-style-salad", meal: "lunch", tags: ["Salad", "Bowl"], name: "Chicken souvlaki-style rice salad with garlic yogurt", blurb: "Oregano and lemon chicken over rice and crunchy salad, with a cool garlic yogurt.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 300), ing("rice", 140), ing("lettuce", 150), ing("cucumber", 150), ing("tomatoes", 170, { note: "about 2 tomatoes" }), ing("red-onion", 40), ing("greek-yogurt", 120), ing("garlic", 5, { note: "about 1 clove" }), ing("olive-oil", 10), ing("oregano", 1), ing("lemon-juice", 15), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Cut the chicken: Cut the chicken into chunks about 3 cm across and pat them dry with kitchen paper. Wash your hands, the knife and the board in hot soapy water.",
      "Marinate the chicken: Toss the chicken with the oil, oregano, half the lemon juice, half the garlic purée, half the salt and a grind of black pepper. Leave it for 10 minutes. If marinating longer than 30 minutes, cover and keep in the fridge.",
      "Cook the rice: While the chicken sits, bring a large pan of water to the boil. Add the rice, stir once and cook as the pack says (usually 10 to 12 minutes), until soft with no hard bit in the middle.",
      "Brown the chicken: Heat a large non-stick frying pan on a high heat for 2 minutes. Add the chicken in one layer with space between the pieces and leave it for 3 minutes without stirring, until golden brown underneath.",
      "Turn the chicken: Turn the pieces and fry for 4 to 5 minutes more, turning now and then, until golden brown all over.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot, with no pink left. If not, cook for 2 minutes more and check again.",
      "Make the garlic yogurt: Mix the yogurt with the rest of the garlic purée, the rest of the lemon juice and the rest of the salt in a small bowl until smooth.",
      "Chop the salad: Shred the lettuce. Cut the cucumber and tomatoes into cubes about 1 cm across. Peel the red onion and slice it as thinly as you can.",
      "Drain the rice: Drain the rice well in a colander and fluff it up with a fork.",
      "Serve: Share the rice between bowls, pile the salad beside it and add the chicken with its juices. Spoon the garlic yogurt over the top.",
    ],
  },
  // ---- dinners
  {
    id: "greek-style-lemon-chicken-traybake", meal: "dinner", tags: ["One pan"], name: "Greek-style lemon chicken traybake", blurb: "Chicken thighs roasted with potatoes, red onion and cherry tomatoes in lemon, garlic and oregano.", servings: 2, minutes: 45,
    ingredients: [ing("chicken-thigh", 360), ing("new-potatoes", 400), ing("cherry-tomatoes", 200), ing("red-onion", 150, { note: "about 1 red onion" }), ing("olive-oil", 20), ing("lemon-juice", 20), ing("oregano", 2), ing("garlic", 5, { note: "about 1 clove" }), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Heat the oven: Heat the oven to 220°C (200°C fan, gas 7). Get out a roasting tin big enough to hold everything in a single layer, with space between the pieces.",
      "Marinate the chicken: In a large bowl, mix the oil, garlic purée, oregano, half the lemon juice, the salt and a grind of black pepper. Pat the chicken thighs dry with kitchen paper and turn them in it until coated.",
      "Leave it to soak in: Leave the chicken while the oven heats and you get the vegetables ready (10 minutes). If marinating longer than 30 minutes, cover and keep in the fridge. Wash your hands, the knife and the board in hot soapy water.",
      "Prepare the vegetables: Drain the potatoes, pat them very dry with kitchen paper and cut them all in half. Peel the red onion, halve it from top to bottom and cut each half into wedges about 2 cm wide.",
      "Fill the tin: Turn the potatoes and onion in the bowl with the chicken until shiny, then spread everything out in the tin, the potatoes cut side down.",
      "Start roasting: Roast on the top shelf for 20 minutes, without stirring, until the chicken and potatoes are golden underneath.",
      "Add the tomatoes: Rinse the cherry tomatoes. Take the tin out with oven gloves, turn the chicken and potatoes and scatter in the tomatoes. Roast for 15 to 20 minutes more, until the potatoes are golden and crisp and the tomatoes have blistered.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot, with no pink left and clear juices. If not, roast for 5 more minutes and check again.",
      "Add the lemon: Spoon the rest of the lemon juice over everything in the hot tin and stir it into the pan juices, scraping up the sticky brown bits from the bottom.",
      "Serve: Share everything between warm plates and spoon the lemony juices from the tin over the top.",
    ],
  },
  {
    id: "chicken-cacciatore-style-pasta", meal: "dinner", tags: ["Pasta", "Batch cook"], name: "Chicken cacciatore-style stew with pasta", blurb: "Chicken thighs simmered with peppers, mushrooms and tomatoes, served with pasta.", servings: 4, minutes: 45,
    // 2026-11-21: oil 10 -> 15 ml so the chicken browns in two batches as the picture shows (founder: "has to look exactly as much as you can as the product")
    ingredients: [ing("chicken-thigh", 600), ing("peppers", 240), ing("mushrooms", 200), ing("onion", 150, { note: "about 1 onion" }), ing("chopped-tomatoes", 800), ing("garlic", 10, { note: "about 2 cloves" }), ing("oregano", 2), ing("olive-oil", 15), ing("pasta-shapes", 300), ing("salt", 2), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Marinate the chicken: Cut the chicken thighs into 4 cm chunks, trimming off any large pieces of fat. Toss them with half the garlic purée, half the oregano, half the salt and a grind of black pepper. Wash your hands, the knife and the board.",
      "Chop the vegetables: While the chicken sits (10 minutes), peel the onion and slice it into thin wedges, cut the peppers into strips about 2 cm wide and cut the mushrooms into thick slices. If marinating longer than 30 minutes, cover and keep in the fridge.",
      "Brown the chicken: Heat the oil in a large, deep pan on a medium-high heat until it shimmers. Add half the chicken in one layer and leave it for 3 minutes without stirring, until deep golden brown underneath.",
      "Finish browning: Turn the pieces and brown the other sides for 2 to 3 minutes. Lift them on to a clean plate and brown the rest of the chicken the same way.",
      "Soften the vegetables: Add the onion, peppers and mushrooms and cook for 8 to 10 minutes, stirring now and then, until soft and the mushrooms are golden. Stir in the rest of the garlic purée and most of the rest of the oregano for 30 seconds.",
      "Add the tomatoes: Tip in the tomatoes, scraping up the brown bits from the bottom of the pan. Add the rest of the salt and a grind of black pepper, bring to the boil and bubble for 5 minutes.",
      "Add the chicken: Sit the chicken on top of the sauce, browned side up, with any juices. Turn the heat down and simmer gently, uncovered and without stirring, for 15 minutes, until the sauce is thick, rich and red.",
      "Cook the pasta: Meanwhile, bring a large pan of water to the boil. Add the pasta and cook as the pack says (usually 10 to 12 minutes), until soft with no hard bit in the middle.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot, with no pink left. If not, simmer for 5 minutes more and check again.",
      "Serve: Drain the pasta and share it between warm bowls. Spoon the sauce over, set the chicken on top and scatter over the last pinch of oregano. Cool any left over quickly, then keep it in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "pesto-chicken-broccoli-pasta", meal: "dinner", tags: ["Pasta", "Quick"], name: "Pesto chicken and broccoli pasta", blurb: "Pasta tossed with golden chicken, broccoli, cherry tomatoes and green pesto.", servings: 2, minutes: 20,
    // 2026-11-21: oil 5 -> 10 ml so the chicken browns as the picture shows (founder: "has to look exactly as much as you can as the product")
    ingredients: [ing("pasta-shapes", 160), ing("chicken", 240), ing("broccoli", 200), ing("pesto", 50), ing("cherry-tomatoes", 150), ing("olive-oil", 10), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Boil the water: Put a large pan of water on a high heat to come to the boil. Wash the broccoli and cut it into florets about the size of a walnut.",
      "Marinate the chicken: Cut the chicken into 2 cm strips and pat them dry. Toss them with a tablespoon of the pesto, the salt and some black pepper, and leave them while the water boils. If marinating longer than 30 minutes, cover and keep in the fridge.",
      "Cook the pasta: Wash your hands, the knife and the board in hot soapy water. Add the pasta to the boiling water, stir and cook as the pack says (usually 10 to 12 minutes), until soft with no hard bit in the middle.",
      "Brown the chicken: Meanwhile, heat the oil in a large non-stick frying pan on a medium-high heat. Lay the chicken in one layer and leave it for 2 to 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the strips and fry for 2 to 3 minutes more, until golden on the other side too.",
      "Add the broccoli: For the last 4 minutes of the pasta's time, add the broccoli to the pasta pan and cook until bright green and tender.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot, with no pink left. If not, cook for 2 minutes more.",
      "Warm the tomatoes: Halve the cherry tomatoes, add them to the chicken pan and stir for 1 minute, until just warm. Turn off the heat.",
      "Stir in the pesto: Scoop out a mugful of the cooking water, then drain the pasta and broccoli. Tip them into the chicken pan with the rest of the pesto and a splash of the cooking water, and stir until glossy and green.",
      "Serve: Share between warm bowls and serve straight away.",
    ],
  },
  {
    id: "greek-style-chicken-rice-tzatziki", meal: "dinner", tags: ["Bowl"], name: "Greek-style chicken with rice and cucumber yogurt", blurb: "Roast oregano chicken with rice, soft cherry tomatoes and a cool garlic and cucumber yogurt.", servings: 2, minutes: 30,
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("cucumber", 150), ing("greek-yogurt", 150), ing("garlic", 5, { note: "about 1 clove" }), ing("lemon-juice", 15), ing("oregano", 1), ing("olive-oil", 10), ing("cherry-tomatoes", 150), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Heat the oven: Heat the oven to 200°C (180°C fan, gas 6). Line a small roasting tin with baking paper.",
      "Marinate the chicken: Pat the chicken dry and rub it with the oil, oregano, half the lemon juice, half the salt and some black pepper. Leave it while the oven heats. If marinating longer than 30 minutes, cover and keep in the fridge. Wash your hands.",
      "Brown the chicken: Heat a frying pan on a medium-high heat for 1 minute. Fry the chicken for 3 minutes on each side without moving it, until golden brown, then lift it into the tin.",
      "Roast the chicken: Roast on the middle shelf for 12 to 15 minutes. Rinse the cherry tomatoes and add them to the tin for the last 10 minutes, so they blister and soften.",
      "Cook the rice: Meanwhile, bring a large pan of water to the boil. Add the rice, stir once and cook as the pack says (usually 10 to 12 minutes), until soft with no hard bit in the middle.",
      "Dice the cucumber: Cut the cucumber into small cubes about 5 mm across, pat them dry with kitchen paper and mix them with the rest of the salt.",
      "Make the cucumber yogurt: Mix the cucumber with the yogurt, garlic purée and the rest of the lemon juice in a small bowl.",
      "Check the chicken: Cut into the thickest part. It should be white all the way through and piping hot, with no pink left and clear juices. If not, roast for 5 minutes more and check again.",
      "Slice the chicken: Leave the chicken on a board for 3 minutes, then cut it into thick slices. Drain the rice well in a colander and fluff it up with a fork.",
      "Serve: Share the rice between warm plates, lay the chicken on top with the soft tomatoes, and add a big spoonful of the cucumber yogurt.",
    ],
  },
  {
    id: "salmon-tomato-sauce-broccoli-potatoes", meal: "dinner", tags: ["Fish", "One pan"], name: "Salmon in tomato sauce with broccoli, peas and new potatoes", blurb: "Salmon cooked gently in a garlic and oregano tomato sauce, with potatoes, broccoli and peas.", servings: 2, minutes: 30,
    ingredients: [ing("salmon", 240), ing("chopped-tomatoes", 400), ing("broccoli", 200), ing("peas", 120), ing("new-potatoes", 400), ing("garlic", 5, { note: "about 1 clove" }), ing("oregano", 1), ing("olive-oil", 10), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Get ready: Boil the kettle. Wash the broccoli and cut it into florets, about the size of a walnut. Drain the potatoes and cut them in half.",
      "Marinate the salmon: Rub the salmon with a teaspoon of the oil, half the oregano and a grind of black pepper. Leave it while you make the sauce. If marinating longer than 30 minutes, cover and keep in the fridge. Wash your hands after touching raw fish.",
      "Start the sauce: Heat the rest of the oil in a large frying pan with a lid, on a medium-low heat. Stir in the garlic purée for 30 seconds, until it smells sweet, then add the tomatoes, the rest of the oregano and a grind of black pepper.",
      "Simmer the sauce: Bring it to a gentle bubble and cook for 6 to 8 minutes, stirring now and then, until thick and chunky.",
      "Add the salmon: Lay the salmon in the sauce, skin-side down if it has skin, and spoon a little sauce over the top. Wash your hands in hot soapy water after touching the raw fish.",
      "Cook the salmon: Put the lid on, turn the heat down low and cook for 10 to 12 minutes, without stirring.",
      "Cook the vegetables: Meanwhile, put the potatoes in a saucepan, cover them with boiling water from the kettle and boil for 2 minutes. Add the broccoli and frozen peas, bring back to the boil and cook for 3 to 4 minutes, until tender.",
      "Check the salmon: The salmon is cooked when it is opaque all the way through and flakes easily when you press it with a fork. If not, cook for 2 to 3 minutes more.",
      "Drain the vegetables: Drain the potatoes, broccoli and peas in a colander and shake them well.",
      "Serve: Share the potatoes and vegetables between warm plates. Lift the salmon beside them and spoon the chunky tomato sauce around it.",
    ],
  },
  {
    id: "chicken-spinach-tomato-spaghetti", meal: "dinner", tags: ["Pasta"], name: "Chicken, spinach and tomato spaghetti", blurb: "Spaghetti in a garlic tomato sauce with golden chicken and wilted spinach.", servings: 2, minutes: 25,
    ingredients: [ing("pasta-long", 160), ing("chicken", 240), ing("chopped-tomatoes", 400), ing("spinach", 100), ing("onion", 75), ing("garlic", 5, { note: "about 1 clove" }), ing("olive-oil", 10), ing("oregano", 1), ing("salt", 1), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Marinate the chicken: Cut the chicken into 2 cm strips and pat them dry. Toss them with half the oil, half the oregano, half the salt and a grind of black pepper. Wash your hands, the knife and the board.",
      "Chop the onion: While the chicken sits for 10 minutes, peel the onion and chop it finely. If marinating longer than 30 minutes, cover and keep in the fridge.",
      "Brown the chicken: Heat a large frying pan on a high heat until hot. Lay the chicken in one layer and leave it for 2 to 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the strips and fry for 2 to 3 minutes more, until golden on the other side too. Lift them on to a clean plate.",
      "Soften the onion: Turn the heat down to medium, add the rest of the oil and the onion and cook for 5 to 6 minutes, stirring, until soft and sweet. Stir in the garlic purée and the rest of the oregano for 30 seconds.",
      "Simmer the sauce: Tip in the tomatoes, scraping up the brown bits from the pan, and add the rest of the salt and a grind of black pepper. Simmer for 10 minutes, stirring now and then, until thick.",
      "Cook the spaghetti: Meanwhile, bring a large pan of water to the boil. Add the spaghetti and cook as the pack says (usually 10 to 12 minutes), until soft with no hard bit in the middle.",
      "Finish the sauce: Rinse the spinach unless the bag says it is ready washed and stir it into the sauce. Lay the chicken on top with any juices, cover and heat for 2 minutes, until the spinach is soft and dark green.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot, with no pink left. If not, heat for 2 minutes more. Lift the chicken back on to the plate.",
      "Mix and serve: Drain the spaghetti, tip it into the sauce and toss with tongs until every strand is coated. Share between warm bowls and lay the chicken on top.",
    ],
  },
  {
    id: "tuna-pea-spinach-lemon-spaghetti", meal: "dinner", tags: ["Pasta", "Fish", "Quick"], name: "Tuna, pea and spinach spaghetti with lemon", blurb: "Spaghetti tossed with tuna, sweet peas, spinach, garlic and lemon.", servings: 2, minutes: 15,
    ingredients: [ing("pasta-long", 160), ing("tuna", 160), ing("peas", 150), ing("spinach", 80), ing("garlic", 5, { note: "about 1 clove" }), ing("olive-oil", 10), ing("lemon-juice", 15), ing("black-pepper", 1)],
    // 2026-11-22: cooked to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"; marinated, "marinating ... makes a big difference").
    method: [
      "Boil the water: Bring a large pan of water to the boil on a high heat.",
      "Cook the spaghetti: Add the spaghetti, stir and cook as the pack says (usually 10 to 12 minutes), until soft with no hard bit in the middle.",
      "Dress the tuna: Meanwhile, drain the tuna and break it into large flakes with a fork. Toss it gently with the lemon juice and a good grind of black pepper, and leave it while the spaghetti cooks. Rinse the spinach unless it is ready washed.",
      "Add the peas: For the last 3 minutes of the spaghetti's time, add the frozen peas to the pan and bring it back to the boil.",
      "Save some water: Scoop out a mugful of the cooking water, then drain the spaghetti and peas in a colander.",
      "Warm the garlic: Put the empty pan back on a low heat with the oil and garlic purée and stir for 30 seconds to 1 minute, until it smells sweet and nutty but hasn't browned.",
      "Wilt the spinach: Add the spinach and a splash of the cooking water and stir for 1 minute, until soft.",
      "Toss it together: Tip the spaghetti and peas back in with the tuna and its lemony juices. Toss for 1 minute, adding splashes of cooking water, until the spaghetti is glossy and piping hot.",
      "Serve: Share between warm bowls and serve straight away.",
    ],
  },
];

// How each looks from directly above, for its picture (docs/RECIPE_IMAGE_PROMPTS.md): one portion, only the recipe's own foods, served as the method says.
export const MEDITERRANEAN_LOOKS: Readonly<Record<string, string>> = {
  "spinach-mushroom-eggs-toast": "Two slices of golden wholemeal toast on a round white plate, heaped with soft pale yellow scrambled eggs folded through golden sliced mushrooms and dark green wilted spinach, flecked with black pepper.",
  "houmous-tomato-spinach-toast": "Two slices of golden wholemeal toast on a round white plate, spread thickly with pale beige houmous and topped with a small heap of glossy dark green spinach leaves and overlapping red tomato slices, flecked with black pepper.",
  "spanish-style-pepper-eggs-toast": "Two slices of golden wholemeal toast on a round white plate, topped with soft red and yellow pepper strips, sliced onion and chopped tomato in a thick paprika-red sauce, with big soft folds of set yellow egg on top.",
  "mozzarella-tomato-spinach-omelette": "A golden folded half-moon omelette on a round white plate, its open edge showing melted white mozzarella, halved red cherry tomatoes and dark green wilted spinach, with a few flecks of black pepper on top.",
  "chicken-chickpea-tomato-oregano-salad": "A wide white bowl of pale chickpeas, cubed green cucumber, halved red cherry tomatoes and thin purple red onion slices glossy with lemon dressing, topped with a row of golden chicken slices flecked with dried oregano.",
  "tomato-mozzarella-toasts-spinach": "Two slices of golden wholemeal toast on a round white plate, topped with wilted dark green spinach, halved red cherry tomatoes and torn white mozzarella melted with golden brown patches, sprinkled with dried oregano.",
  "greek-style-lemon-chicken-rice-soup": "A wide white bowl of pale creamy yellow lemon and egg soup, thick with soft white rice, shreds of chicken, small orange carrot cubes and dark green wilted spinach, flecked with black pepper.",
  "chicken-pepper-pesto-pasta-salad": "A wide white bowl of pasta shapes coated in green pesto, mixed with golden roasted chicken strips, soft red and yellow roasted pepper strips browned at the edges, halved red cherry tomatoes and dark green spinach leaves.",
  "chicken-souvlaki-style-salad": "A wide white bowl with a mound of fluffy white rice beside shredded pale green lettuce, cubed cucumber and tomato and thin purple red onion slices, topped with golden oregano chicken chunks and a dollop of thick white garlic yogurt.",
  "greek-style-lemon-chicken-traybake": "Golden-brown roasted skinless chicken thigh fillets on a round white plate beside halved golden new potatoes, soft purple red onion wedges and blistered red cherry tomatoes, glistening with lemony juices and flecked with dried oregano.",
  "chicken-cacciatore-style-pasta": "A wide white bowl of pasta shapes topped with a rich red tomato sauce of soft red and yellow pepper strips, thick mushroom slices and onion wedges, with browned chicken thigh chunks sitting on top, flecked with dried oregano.",
  "pesto-chicken-broccoli-pasta": "A wide white bowl of pasta shapes coated in glossy green pesto, mixed with golden chicken strips, bright green broccoli florets and halved red cherry tomatoes, flecked with black pepper.",
  "greek-style-chicken-rice-tzatziki": "A round white plate with a bed of fluffy white rice, thick slices of golden roast chicken flecked with oregano, a few soft blistered red cherry tomatoes and a big spoonful of thick white yogurt with small cubes of pale green cucumber.",
  "salmon-tomato-sauce-broccoli-potatoes": "A round white plate with a pink salmon fillet on a chunky red tomato sauce flecked with dried oregano, beside halved new potatoes, bright green broccoli florets and a small heap of green peas.",
  "chicken-spinach-tomato-spaghetti": "A wide white bowl of spaghetti twirled in a rich red tomato sauce, mixed with golden chicken strips and dark green wilted spinach, flecked with dried oregano and black pepper.",
  "tuna-pea-spinach-lemon-spaghetti": "A wide white bowl of glossy spaghetti twirled with pale pink flakes of tuna, bright green peas and dark green wilted spinach, flecked with black pepper.",
};
