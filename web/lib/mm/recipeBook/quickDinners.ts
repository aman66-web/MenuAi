import { ing, type Recipe } from "../recipes";

// Weeknight dinners in 20 minutes or less (founder 2026-11-20: "as many options as you can think about people would choose"; and "You want kind of like a
// varied diet"): pasta, rice, noodles and new potatoes with chicken, beef, tuna or eggs, each ready in QUICK_MINUTES (lib/mm/recipes.ts) with nothing left
// to soak or chill, so the Quick style has dinners for every night. The new potatoes are the pantry's tinned ones (already cooked), the noodles
// ready-to-wok, and the rice cooks while the rest is made. See lib/mm/recipeBook/index.ts for the rules every
// recipe follows.

export const QUICK_DINNERS: readonly Recipe[] = [
  {
    id: "pan-chicken-peas-spinach-potatoes", meal: "dinner", tags: ["Quick", "One pan"], name: "Pan-fried chicken with peas, spinach and new potatoes", blurb: "Golden chicken and new potatoes fried in one pan with peas, wilted spinach, garlic and lemon.", servings: 2, minutes: 20,
    // 2026-11-22, marinade (founder 21 Nov: "marinating ... makes a big difference"): salt, garlic, lemon, black pepper.
    // 2026-11-21: oil 10 -> 15 ml so the potatoes and the chicken both brown as the picture shows (founder: "has to look exactly as much as you can as the product")
    ingredients: [ing("chicken", 300), ing("new-potatoes", 400), ing("peas", 240), ing("spinach", 80), ing("garlic", 5), ing("olive-oil", 15), ing("lemon-juice", 10), ing("black-pepper", 1), ing("salt", 1)],
    method: [
      "Get ready: Drain the potatoes in a colander, shake them dry and cut any big ones in half. Rinse the spinach unless the bag says it is ready washed.",
      "Marinate the chicken: Cut the chicken into 3 cm pieces. Toss with the salt, black pepper, half the garlic purée and half the lemon juice. Leave it while the potatoes fry, or keep it covered in the fridge up to a few hours. Wash your hands.",
      "Fry the potatoes: Heat half the oil in a large non-stick frying pan on a medium-high heat. Lay the potatoes in, cut side down, and leave them for 5 to 6 minutes without moving them, until golden brown underneath. Lift them on to a plate.",
      "Brown the chicken: Turn the heat up to high and add the rest of the oil. Lay the chicken in one layer with space between the pieces (if they don't all fit, fry them in two batches). Leave for 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the pieces and fry for 3 to 4 minutes more, until golden brown on all sides.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, fry for 1 to 2 minutes more and check again.",
      "Add the peas and garlic: Put the potatoes back in. Stir in the frozen peas and the rest of the garlic purée and cook for 3 minutes, stirring, until the peas are tender and hot. Add a splash of water if the pan gets dry.",
      "Wilt the spinach: Add the spinach a handful at a time and stir for 1 to 2 minutes, until soft and dark green.",
      "Season and serve: Take the pan off the heat and stir in the rest of the lemon juice and plenty of black pepper. Taste: it should be fresh and lemony. Share between warm plates and serve straight away.",
    ],
  },
  {
    id: "chicken-broccoli-garlic-pasta", meal: "dinner", tags: ["Quick", "Pasta"], name: "Chicken and broccoli pasta with garlic", blurb: "Pasta shapes tossed with golden chicken, tender broccoli, garlic, lemon and a little grated cheddar.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): chicken in slices 1 cm thick and 4 cm long; marinade (founder 21 Nov: "marinating ... makes a big difference"): oil, lemon, garlic, black pepper.
    ingredients: [ing("pasta-shapes", 160), ing("chicken", 240), ing("broccoli", 200), ing("garlic", 10), ing("olive-oil", 15), ing("lemon-juice", 15), ing("cheddar", 30), ing("black-pepper", 1)],
    method: [
      "Boil the water: Boil the kettle, pour the water into a large saucepan and bring it back to the boil on a high heat.",
      "Get ready: Cut the broccoli into small florets, about the size of a walnut. Grate the cheddar on the fine side of a grater on to a plate.",
      "Cut the chicken: Cut the chicken into slices about 1 cm thick and 4 cm long and pat them dry.",
      "Marinate the chicken: Toss with the black pepper, 1 tsp of the oil, a third of the lemon juice and a quarter of the garlic purée. Leave them while the water boils, or keep them covered in the fridge up to a few hours. Wash your hands.",
      "Cook the pasta: Add the pasta to the boiling water, stir once and cook for 10 to 12 minutes, or as the pack says, until tender.",
      "Brown the chicken: Meanwhile, heat the rest of the oil in a large non-stick frying pan on a high heat. Lay the chicken in one layer with space between the pieces and leave for 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the pieces and fry for 3 to 4 minutes more, until golden brown all over.",
      "Add the broccoli: For the last 3 minutes of the pasta's time, add the broccoli to the pasta pan, so they finish cooking together and the broccoli stays bright green.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. Turn the heat down low, stir in the rest of the garlic purée and cook for 1 minute, until it smells sweet, not brown.",
      "Drain and mix: Scoop out a mugful of the cooking water, then drain the pasta and broccoli. Tip them into the frying pan with the rest of the lemon juice and a splash of the cooking water and toss well.",
      "Serve: Share between warm bowls, scatter the cheese over and add a good grind of black pepper. Serve straight away.",
    ],
  },
  {
    id: "quick-chicken-spinach-curry-rice", meal: "dinner", tags: ["Quick"], name: "Quick chicken and spinach curry with rice", blurb: "Chicken simmered in a tomato curry sauce with spinach, topped with yogurt and served with rice.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): the chicken browned golden before the sauce; marinade (founder 21 Nov: "marinating ... makes a big difference"): curry paste and yogurt.
    ingredients: [ing("chicken", 300), ing("curry-paste", 40), ing("chopped-tomatoes", 400), ing("spinach", 100), ing("greek-yogurt", 60), ing("rice", 150), ing("olive-oil", 5), ing("garlic", 5)],
    method: [
      "Cook the rice: Boil the kettle. Put the rice in a medium saucepan, pour over plenty of the boiling water and simmer for 10 to 12 minutes, or as the pack says, until soft with no hard bit in the middle.",
      "Marinate the chicken: Cut the chicken into 2 cm pieces and stir them into a third of the curry paste and a third of the yogurt. Leave them while the rice starts, or keep them covered in the fridge up to a few hours. Wash your hands.",
      "Brown the chicken: Heat the oil in a large saucepan or deep frying pan on a medium-high heat. Add the chicken and fry for 2 to 3 minutes a side, until golden in places.",
      "Fry the paste: Turn the heat down to medium. Stir in the garlic purée and the rest of the curry paste and cook for 1 minute, stirring all the time, until it smells fragrant.",
      "Simmer the sauce: Pour in the chopped tomatoes, stir well and bring to a bubble. Turn the heat down and simmer for 10 to 12 minutes with no lid, stirring now and then, until the sauce is thick enough to coat the back of a spoon.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, simmer for 2 minutes more and check again.",
      "Wilt the spinach: Add the spinach a handful at a time and stir for 1 to 2 minutes, until soft and dark green. Take the pan off the heat.",
      "Drain the rice: Drain the rice well in a sieve and leave it to stand for a minute, so it isn't wet.",
      "Serve: Spoon the rice into warm bowls with the curry beside it and spoon the rest of the yogurt on top. Serve straight away.",
    ],
  },
  {
    id: "beef-broccoli-soy-stir-fry-rice", meal: "dinner", tags: ["Quick", "Bowl"], name: "Beef and broccoli stir-fry with rice", blurb: "Browned beef mince and broccoli stir-fried with garlic, soy sauce and spring onions, over rice.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): broccoli florets about 4 cm; marinade (founder 21 Nov: "marinating ... makes a big difference"): soy, garlic, black pepper.
    ingredients: [ing("beef-mince", 300), ing("broccoli", 250), ing("soy", 20), ing("garlic", 10), ing("spring-onions", 50, { note: "about 5 spring onions" }), ing("vegetable-oil", 10), ing("rice", 150), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Boil the kettle. Put the rice in a medium saucepan, pour over plenty of the boiling water and simmer for 10 to 12 minutes, or as the pack says, until soft with no hard bit in the middle.",
      "Marinate the mince: Mix the mince in a bowl with half the soy sauce, half the garlic purée and the black pepper. Leave it while you prepare the broccoli, or keep it covered in the fridge up to a few hours. Wash your hands after touching raw mince.",
      "Get ready: Cut the broccoli into florets about 4 cm across. Trim the spring onions and slice them thinly, keeping the green tops apart from the white parts.",
      "Heat the wok: Heat the oil in a wok or large non-stick frying pan on a high heat for 1 minute, until it runs easily when you tilt the pan.",
      "Brown the mince: Add the beef mince, press it out flat and leave it for 3 minutes without stirring, until browned underneath. Wash your hands after touching raw mince.",
      "Break it up: Break the mince into small crumbles with a wooden spoon and fry for 3 to 4 minutes more, until browned all over.",
      "Add the broccoli: Add the broccoli, the white parts of the spring onions and a splash of water. Stir-fry for 4 to 5 minutes, until the broccoli is bright green and just tender. No longer, or it goes dark.",
      "Add the garlic and soy: Stir in the rest of the garlic purée for 30 seconds, then pour in the rest of the soy sauce and toss everything together for 1 minute, until the mince and broccoli look glossy.",
      "Check the mince: Break open a few pieces. The mince should be piping hot, with no pink left anywhere. If not, stir-fry for 1 to 2 minutes more and check again.",
      "Drain the rice: Drain the rice well in a sieve and leave it to stand for a minute, so it isn't wet.",
      "Serve: Spoon the rice into warm bowls, top with the beef and broccoli and scatter the green spring onion tops over. Serve straight away.",
    ],
  },
  {
    id: "chicken-satay-noodles", meal: "dinner", tags: ["Quick"], name: "Chicken satay noodles", blurb: "Noodles, chicken and crunchy vegetables tossed in a peanut butter, soy and lemon sauce.", servings: 2, minutes: 20,
    // 2026-11-22, marinade (founder 21 Nov: "marinating ... makes a big difference"): soy, garlic.
    ingredients: [ing("noodles", 300), ing("chicken", 240), ing("peanut-butter", 40), ing("soy", 15), ing("stir-fry-veg", 300), ing("lemon-juice", 10), ing("vegetable-oil", 10), ing("garlic", 5), ing("chilli-powder", 1)],
    method: [
      "Slice the chicken: Slice the chicken into thin strips, about as wide as your little finger, and pat them dry with kitchen paper.",
      "Marinate the chicken: Toss the strips with a third of the soy sauce and half the garlic purée. Leave them while you make the sauce, or keep them covered in the fridge up to a few hours. Wash your hands, the knife and the board.",
      "Make the satay sauce: In a small bowl, mix the peanut butter, the rest of the soy sauce, the lemon juice and the chilli powder with 3 tablespoons of hot water. Stir with a fork until smooth and thin enough to pour. It should taste nutty, salty and sharp.",
      "Loosen the noodles: Pull the noodles apart with your fingers so they don't clump together in the pan.",
      "Heat the wok: Heat the oil in a wok or large non-stick frying pan on a high heat for 2 minutes, until very hot and the oil looks thin and shimmery.",
      "Brown the chicken: Lay the chicken in the pan in one layer with space between the strips (if they don't all fit, fry them in two batches). Leave for 2 to 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the strips and fry for 2 to 3 minutes more, until golden on the other side too.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, fry for 1 to 2 minutes more and check again. Lift the chicken on to a clean plate.",
      "Add the vegetables: Add the stir-fry vegetables and keep them moving for 3 to 4 minutes, until hot but still a little crunchy. Stir in the rest of the garlic purée for the last 30 seconds, until you can smell it.",
      "Add the noodles: Turn the heat down to medium. Add the noodles and put the chicken back in with any juices.",
      "Add the sauce: Stir the sauce and pour it in. Toss for 2 to 3 minutes, until everything is coated in a glossy sauce and steaming hot. Add a splash of water if it gets too thick.",
      "Serve: Share the noodles between warm bowls and serve straight away, while they are hot.",
    ],
  },
  {
    id: "bacon-pea-soft-cheese-pasta", meal: "dinner", tags: ["Quick", "Pasta"], name: "Bacon, pea and soft cheese pasta", blurb: "Pasta in a creamy soft cheese sauce with crisp bacon, sweet peas and spinach.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): bacon in 2 cm pieces (bacon is cured: no marinade).
    ingredients: [ing("pasta-shapes", 160), ing("bacon", 140), ing("peas", 160), ing("soft-cheese", 80), ing("spinach", 60), ing("black-pepper", 1)],
    method: [
      "Boil the water: Boil the kettle, pour the water into a large saucepan and bring it back to the boil on a high heat.",
      "Cut the bacon: Cut the bacon into pieces about 2 cm wide with clean kitchen scissors. Wash your hands, the scissors and the board in hot soapy water straight after.",
      "Cook the pasta: Add the pasta to the boiling water, stir once and cook for 10 to 12 minutes, or as the pack says, until tender.",
      "Fry the bacon: Meanwhile, heat a large non-stick frying pan on a medium-high heat. Spread the bacon out in one layer and fry for 5 to 6 minutes, turning now and then, until browned and crisp at the edges.",
      "Check the bacon: Cut into the thickest piece. It should be cooked through, firm and piping hot in the middle. Lift it on to a plate and turn the heat down low.",
      "Add the peas: For the last 3 minutes of the pasta's time, add the frozen peas to the pasta pan, so they cook together.",
      "Drain the pasta: Scoop out a mugful of the cooking water, then drain the pasta and peas in a colander.",
      "Make the sauce: Add the soft cheese and 4 tablespoons of the cooking water to the frying pan and stir on a low heat for 1 minute, until smooth and creamy.",
      "Add the spinach: Tip in the pasta, peas and spinach and toss for 1 to 2 minutes, until the spinach has wilted and everything is coated. Add more cooking water if it looks dry.",
      "Serve: Stir the bacon back in, so it stays crisp. Share between warm bowls and add a good grind of black pepper. Serve straight away.",
    ],
  },
  {
    id: "spicy-chicken-sweetcorn-rice", meal: "dinner", tags: ["Quick", "Bowl"], name: "Spicy chicken and sweetcorn rice", blurb: "Rice tossed with paprika chicken, sweetcorn, pepper and spring onions, with a little heat from chilli.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): paprika 2 -> 4 g so all the rice turns orange-red; marinade (founder 21 Nov: "marinating ... makes a big difference"): paprika, salt, oil, garlic.
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("sweetcorn", 140), ing("peppers", 160), ing("spring-onions", 30, { note: "about 3 spring onions" }), ing("paprika", 4), ing("chilli-powder", 1), ing("olive-oil", 10), ing("salt", 1), ing("garlic", 5)],
    method: [
      "Cook the rice: Boil the kettle. Put the rice in a medium saucepan, pour over plenty of the boiling water and simmer for 10 to 12 minutes, or as the pack says, until soft with no hard bit in the middle.",
      "Cut the chicken: Cut the chicken into bite-sized pieces, about 2 cm across, and pat them dry with kitchen paper.",
      "Marinate the chicken: Toss the pieces with half the paprika, the salt, 1 tsp of the oil and half the garlic purée. Leave them while you get the vegetables ready, or keep them covered in the fridge up to a few hours. Wash your hands and the board.",
      "Get ready: Cut the pepper in half, take out the seeds and white core and cut it into small pieces. Trim the spring onions and slice them into thin rings. Drain the sweetcorn if it is tinned.",
      "Brown the chicken: Heat the rest of the oil in a large non-stick frying pan on a medium-high heat. Lay the chicken in one layer with space between the pieces and leave for 3 minutes without stirring, until browned underneath. Turn and fry for 2 minutes more.",
      "Add the pepper and spices: Turn the heat down to medium-high. Add the pepper and fry for 3 minutes, stirring, until it softens. Stir in the rest of the garlic purée and paprika and the chilli powder for 30 seconds, until they smell toasty.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, fry for 1 to 2 minutes more and check again.",
      "Add the sweetcorn and rice: Drain the rice well in a sieve. Add it to the pan with the sweetcorn and stir-fry for 3 minutes, until every grain is orange-red and the sweetcorn is steaming hot.",
      "Serve: Stir in the spring onions, then share between warm bowls and serve straight away.",
    ],
  },
  {
    id: "beef-pepper-quick-chilli-rice", meal: "dinner", tags: ["Quick"], name: "Quick beef and pepper chilli with rice", blurb: "Beef mince, pepper and kidney beans in a cumin and chilli tomato sauce, with rice.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): pepper in 2 cm chunks; marinade (founder 21 Nov: "marinating ... makes a big difference"): cumin, chilli powder, garlic.
    ingredients: [ing("beef-mince", 250), ing("peppers", 160), ing("kidney-beans", 240, { role: "other" }), ing("chopped-tomatoes", 400), ing("chilli-powder", 2), ing("cumin", 2), ing("rice", 150), ing("olive-oil", 5), ing("onion", 75), ing("garlic", 5), ing("chopped-tomato-puree", 15)],
    method: [
      "Cook the rice: Boil the kettle. Put the rice in a medium saucepan, pour over plenty of the boiling water and simmer for 10 to 12 minutes, or as the pack says, until soft with no hard bit in the middle.",
      "Marinate the mince: Mix the mince with the cumin, half the chilli powder and half the garlic purée. Leave it while you get the vegetables ready, or keep it covered in the fridge up to a few hours. Wash your hands after touching raw mince.",
      "Get ready: Peel the onion and chop the amount you need small. Cut the pepper in half, take out the seeds and white core and cut it into chunks about 2 cm across. Drain the kidney beans in a sieve and rinse them under the cold tap.",
      "Brown the mince: Heat the oil in a large saucepan on a medium-high heat. Add the beef mince, press it out flat and leave it for 3 minutes, until browned underneath. Break it up with a wooden spoon and fry for 2 minutes more, until browned all over.",
      "Soften the onion: Turn the heat down to medium. Add the onion and pepper and fry for 4 to 5 minutes, stirring now and then, until soft and sweet.",
      "Add the spices: Stir in the rest of the garlic purée and chilli powder with the tomato purée and fry for 1 minute, stirring, until the spices smell toasty and the purée turns a darker red.",
      "Simmer the chilli: Stir in the chopped tomatoes and the beans and bring to a bubble. Turn the heat down and simmer for 8 to 10 minutes, stirring now and then, until thick and no longer watery.",
      "Check the mince: Break open a few pieces. The mince should be piping hot, with no pink left anywhere. If not, simmer for 2 minutes more and check again.",
      "Drain the rice: Drain the rice well in a sieve and leave it to stand for a minute, so it isn't wet.",
      "Serve: Spoon the rice into a neat mound on one side of each warm bowl and ladle the chilli beside it. Serve straight away.",
    ],
  },
  {
    id: "chicken-mushroom-soy-noodles", meal: "dinner", tags: ["Quick"], name: "Chicken, mushroom and spring onion noodles", blurb: "Noodles stir-fried with chicken, golden mushrooms, garlic, soy sauce and spring onions.", servings: 2, minutes: 15,
    // 2026-11-22, marinade (founder 21 Nov: "marinating ... makes a big difference"): soy, black pepper, garlic.
    // 2026-11-21: oil 10 -> 15 ml so the chicken and the mushrooms both brown as the picture shows (founder: "has to look exactly as much as you can as the product")
    ingredients: [ing("noodles", 300), ing("chicken", 240), ing("mushrooms", 200), ing("spring-onions", 50, { note: "about 5 spring onions" }), ing("soy", 15), ing("garlic", 5), ing("vegetable-oil", 15), ing("black-pepper", 1)],
    method: [
      "Slice the chicken: Slice the chicken into thin strips, about as wide as your little finger, and pat them dry with kitchen paper.",
      "Marinate the chicken: Toss the strips with a third of the soy sauce, the black pepper and half the garlic purée. Leave them while you get ready, or keep them covered in the fridge up to a few hours. Wash your hands and the board.",
      "Get ready: Wipe the mushrooms clean and slice them about 5 mm thick. Trim the spring onions and cut them into 3 cm lengths. Pull the noodles apart with your fingers so they don't clump together.",
      "Heat the wok: Heat half the oil in a wok or large non-stick frying pan on a high heat for 2 minutes, until very hot and the oil looks thin and shimmery.",
      "Brown the chicken: Lay the chicken in the pan in one layer with space between the strips (if they don't all fit, fry them in two batches). Leave for 2 to 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the strips and fry for 2 to 3 minutes more, until golden on the other side too.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, fry for 1 to 2 minutes more and check again. Lift the chicken on to a clean plate.",
      "Brown the mushrooms: Add the rest of the oil and spread the mushrooms out in the pan. Leave them for 2 to 3 minutes without stirring, until golden underneath, then stir-fry for 1 to 2 minutes more, until browned and their liquid has gone.",
      "Add the spring onions: Put the chicken back in. Add the spring onions and the rest of the garlic purée and stir-fry for 1 minute, until the spring onions turn bright green.",
      "Add the noodles: Add the noodles and the rest of the soy sauce and toss for 2 to 3 minutes, until the noodles are glossy and steaming hot. Add a splash of water if they stick.",
      "Serve: Pile the noodles high in the middle of warm bowls and serve straight away, while they are hot.",
    ],
  },
  {
    // not the book's egg chow mein (egg scrambled through the noodles): here each bowl is topped with whole fried eggs
    // ready-to-wok noodles, like the other noodle dinners here: Sainsbury's lists no dried egg noodles with a label we can use, so egg-noodles became its
    // Pad Thai rice noodles, which a small shop doesn't sell (tests/localRange.test.ts)
    id: "egg-vegetable-noodle-stir-fry", meal: "dinner", tags: ["Quick", "Eggs"], name: "Vegetable noodles with fried eggs", blurb: "Noodles stir-fried with crunchy vegetables, garlic and soy sauce, topped with fried eggs.", servings: 2, minutes: 15,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): fried eggs with golden, lacy edges.
    ingredients: [ing("noodles", 300), ing("eggs", 240), ing("stir-fry-veg", 300), ing("soy", 15), ing("garlic", 5), ing("spring-onions", 30, { note: "about 3 spring onions" }), ing("vegetable-oil", 10), ing("black-pepper", 1)],
    method: [
      "Get ready: Trim the spring onions and slice them thinly. Tip the stir-fry vegetables into a bowl and cut any big pieces down to about the same size.",
      "Loosen the noodles: Open the noodles and pull them apart gently with your fingers, so they don't stick together in one lump in the pan.",
      "Start the eggs: Heat half the oil in a non-stick frying pan on a medium-high heat. Crack each egg into a cup, then slide it into the pan. Wash your hands after handling raw eggs.",
      "Fry the vegetables: Meanwhile, heat the rest of the oil in a wok or large frying pan on a high heat. Stir-fry the vegetables for 3 to 4 minutes, until hot but still a little crunchy.",
      "Check the eggs: Fry the eggs for 3 to 4 minutes in all, until the whites are completely set, with golden, lacy edges and no runny white left. If the tops are still clear, cover the pan for 30 to 60 seconds.",
      "Add the garlic: Stir the garlic purée into the vegetables and stir-fry for 30 seconds, until you can smell it.",
      "Add the noodles: Add the noodles and soy sauce to the vegetables and toss for 2 to 3 minutes, until the noodles are coated and steaming hot. Add a splash of water if they stick.",
      "Serve: Share the noodles between warm bowls. Lift the eggs on top with a fish slice, grind the black pepper over the yolks, scatter the spring onions over and serve straight away.",
    ],
  },
  {
    id: "chicken-fajita-rice-pan", meal: "dinner", tags: ["Quick", "One pan"], name: "Chicken fajita rice", blurb: "Chicken, peppers and onion fried with fajita seasoning, tossed through rice and topped with salsa.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): wide chicken strips with a spice crust, red and yellow peppers; marinade (founder 21 Nov: "marinating ... makes a big difference"): fajita seasoning, oil.
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("peppers", 240, { note: "about 1½ peppers, red and yellow" }), ing("onion", 75, { note: "about half an onion" }), ing("fajita-seasoning", 10), ing("salsa", 80), ing("olive-oil", 10), ing("garlic", 5)],
    method: [
      "Cook the rice: Boil the kettle. Put the rice in a medium saucepan, pour over plenty of the boiling water and simmer for 10 to 12 minutes, or as the pack says, until soft with no hard bit in the middle.",
      "Marinate the chicken: Cut the chicken into 2 cm strips. Toss them with half the fajita seasoning and 1 tsp of the oil. Leave them while you slice the vegetables, or keep them covered in the fridge up to a few hours. Wash your hands and the board.",
      "Get ready: Cut the peppers in half, take out the seeds and white core and slice them into thin strips. Peel the onion and slice it thinly.",
      "Brown the chicken: Heat the rest of the oil in a large non-stick pan on a medium-high heat. Lay the chicken in one layer with space between the strips (two batches if your pan is small). Leave for 2 to 3 minutes without stirring, until browned underneath.",
      "Turn the chicken: Turn the strips and fry for 2 to 3 minutes more, until browned on the other side too.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, fry for 1 to 2 minutes more and check again. Lift the chicken on to a clean plate.",
      "Add the vegetables: Turn the heat down to medium-high. Add the peppers and onion and fry for 4 to 5 minutes, stirring now and then, until soft and starting to brown at the edges. Stir in the garlic purée for the last 30 seconds.",
      "Add the fajita seasoning: Put the chicken back in with any juices. Sprinkle over the rest of the fajita seasoning with a splash of water and stir for 1 minute, until everything is coated.",
      "Add the rice: Drain the rice well in a sieve, tip it into the pan and toss for 2 minutes, until it is evenly coloured and steaming hot.",
      "Serve: Share between warm bowls and spoon the salsa on top. Serve straight away.",
    ],
  },
  {
    id: "tuna-tomato-new-potatoes-spinach", meal: "dinner", tags: ["Quick", "Fish", "One pan"], name: "Tuna and tomato new potatoes with spinach", blurb: "New potatoes simmered in a garlic and oregano tomato sauce with spinach and chunks of tuna.", servings: 2, minutes: 20,
    ingredients: [ing("new-potatoes", 500), ing("tuna", 160), ing("chopped-tomatoes", 400), ing("spinach", 80), ing("garlic", 5), ing("olive-oil", 10), ing("oregano", 1), ing("black-pepper", 1), ing("onion", 75)],
    method: [
      "Get ready: Drain the potatoes in a colander, shake them dry and cut them in half. Peel the onion and chop the amount you need small. Drain the tuna and break it into large flakes with a fork.",
      "Fry the potatoes: Heat the oil in a large, deep frying pan on a medium-high heat. Fry the potatoes for 5 minutes, turning now and then, until they start to turn golden.",
      "Soften the onion: Add the onion and fry for 4 to 5 minutes more, stirring now and then, until soft and sweet.",
      "Add the garlic: Turn the heat down to medium, stir in the garlic purée and the oregano and cook for 30 seconds, stirring all the time so the garlic doesn't burn.",
      "Add the tomatoes: Pour in the chopped tomatoes, stir well and bring to a bubble. Turn the heat down and simmer for 8 minutes, stirring now and then, until the sauce thickens.",
      "Wilt the spinach: Add the spinach a handful at a time and stir for 1 to 2 minutes, until soft and dark green.",
      "Add the tuna: Gently stir in the tuna and cook for 2 minutes, until it is piping hot. Stir carefully, so the flakes stay in chunks.",
      "Check the potatoes: Cut a potato in half. It should be hot all the way through. If not, simmer for 2 minutes more. Season with a good grind of black pepper and taste: the sauce should be rich and tomatoey.",
      "Serve: Share between warm bowls, with plenty of the sauce, and serve straight away.",
    ],
  },
  {
    id: "chicken-pea-egg-fried-rice", meal: "dinner", tags: ["Quick", "Bowl"], name: "Chicken and pea egg fried rice", blurb: "Rice stir-fried with chicken, peas, egg, soy sauce and spring onions.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): chicken in 2 cm golden pieces; marinade (founder 21 Nov: "marinating ... makes a big difference"): soy, garlic.
    ingredients: [ing("rice", 150), ing("chicken", 200), ing("eggs", 120), ing("peas", 160), ing("soy", 15), ing("spring-onions", 30, { note: "about 3 spring onions" }), ing("vegetable-oil", 10), ing("garlic", 5)],
    method: [
      "Cook the rice: Boil the kettle. Put the rice in a medium saucepan, pour over plenty of the boiling water and simmer for 10 to 12 minutes, or as the pack says, until soft with no hard bit in the middle.",
      "Marinate the chicken: Cut the chicken into 2 cm pieces. Toss them with a third of the soy sauce and half the garlic purée. Leave them while you get ready, or keep them covered in the fridge up to a few hours. Wash your hands and the board.",
      "Get ready: Trim the spring onions and slice them thinly. Crack the eggs into a bowl and beat them with a fork until mixed. Wash your hands after touching raw eggs.",
      "Dry the rice: Drain the rice well and spread it out on a large plate or tray for 5 minutes, so it steams dry and doesn't go sticky in the pan.",
      "Fry the chicken: Meanwhile, heat the oil in a wok or large non-stick frying pan on a high heat. Spread the chicken out in one layer and leave it for 2 minutes, until golden underneath, then stir-fry for 4 to 5 minutes, until golden all over.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, fry for 1 to 2 minutes more and check again.",
      "Scramble the eggs: Push the chicken to one side and pour the eggs into the space. Leave them for 20 seconds, then stir for about 1 minute, until set with no runny egg left.",
      "Fry the rice: Stir in the rest of the garlic purée for 30 seconds, then add the rice and frozen peas. Stir-fry for 4 to 5 minutes, breaking up any lumps, until the peas are tender and the rice is steaming hot all the way through.",
      "Finish and serve: Turn off the heat, toss in the rest of the soy sauce and the spring onions and share between warm bowls. Serve straight away.",
    ],
  },
  {
    id: "creamy-tomato-chicken-spaghetti", meal: "dinner", tags: ["Quick", "Pasta"], name: "Creamy tomato chicken spaghetti", blurb: "Spaghetti in a creamy tomato and garlic sauce with chicken and spinach.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): herbs 1 -> 2 g so they coat the chicken and fleck the sauce; marinade (founder 21 Nov: "marinating ... makes a big difference"): herbs, garlic, oil, salt, black pepper.
    // 2026-11-21: oil 5 -> 10 ml so the chicken browns as the picture shows (founder: "has to look exactly as much as you can as the product")
    ingredients: [ing("pasta-long", 160), ing("chicken", 240), ing("passata", 300), ing("soft-cheese", 60), ing("spinach", 60), ing("garlic", 5), ing("mixed-herbs", 2), ing("olive-oil", 10), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Boil the water: Boil the kettle, pour the water into a large saucepan and bring it back to the boil on a high heat.",
      "Cut the chicken: Cut the chicken into bite-sized pieces, about 2 cm across, and pat them dry with kitchen paper.",
      "Marinate the chicken: Toss them with the salt and black pepper, half the herbs, half the garlic purée and 1 tsp of the oil. Leave them while the water boils, or keep them covered in the fridge up to a few hours. Wash your hands.",
      "Cook the spaghetti: Add the spaghetti to the boiling water, pushing it under as it softens. Stir once and cook for 10 to 12 minutes, or as the pack says, until tender.",
      "Brown the chicken: Meanwhile, heat the rest of the oil in a large non-stick pan on a high heat. Lay the chicken in one layer and leave for 3 minutes without stirring, until golden underneath. Turn and fry for 2 to 3 minutes more.",
      "Make the sauce: Turn the heat down to medium. Stir in the rest of the garlic purée and dried herbs for 30 seconds, until they smell fragrant, then pour in the passata. Bring to a bubble and simmer for 5 minutes, stirring now and then, until slightly thickened.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, simmer for 2 minutes more and check again.",
      "Add the soft cheese: Turn the heat down low. Stir in the soft cheese and the spinach for 1 to 2 minutes, until the sauce is smooth and creamy and the spinach has wilted.",
      "Drain and mix: Scoop out a mugful of the cooking water, then drain the spaghetti. Add it to the sauce with a splash of the cooking water and toss until coated.",
      "Serve: Share between warm bowls and serve straight away, while the sauce is hot.",
    ],
  },
  {
    id: "garlic-soy-chicken-greens-rice", meal: "dinner", tags: ["Quick", "Bowl"], name: "Garlic and soy chicken with greens and rice", blurb: "Golden chicken stir-fried with broccoli, spinach, plenty of garlic and soy sauce, over rice.", servings: 2, minutes: 20,
    // 2026-11-22, to match its photo (founder 21 Nov: "accurate exactly to how the photo looks"): broccoli florets about 5 cm with stalk; marinade (founder 21 Nov: "marinating ... makes a big difference"): soy, black pepper, garlic.
    ingredients: [ing("chicken", 300), ing("broccoli", 200), ing("spinach", 80), ing("soy", 15), ing("garlic", 10), ing("vegetable-oil", 10), ing("rice", 150), ing("black-pepper", 1)],
    method: [
      "Cook the rice: Boil the kettle. Put the rice in a medium saucepan, pour over plenty of the boiling water and simmer for 10 to 12 minutes, or as the pack says, until soft with no hard bit in the middle.",
      "Get ready: Cut the broccoli into florets about 5 cm long, keeping some stalk. Rinse the spinach unless the bag says it is ready washed.",
      "Slice the chicken: Slice the chicken into thin strips, about as wide as your little finger, and pat them dry with kitchen paper.",
      "Marinate the chicken: Toss the strips with a third of the soy sauce, the black pepper and a quarter of the garlic purée. Leave them while the rice cooks, or keep them covered in the fridge up to a few hours. Wash your hands and the board.",
      "Heat the wok: Heat the oil in a wok or large non-stick frying pan on a high heat for 2 minutes, until very hot.",
      "Brown the chicken: Lay the chicken in the pan in one layer with space between the strips (if they don't all fit, fry them in two batches). Leave for 2 to 3 minutes without stirring, until golden underneath.",
      "Turn the chicken: Turn the strips and fry for 2 to 3 minutes more, until golden brown on the other side too.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through, with no pink left, and piping hot. If not, fry for 1 to 2 minutes more and check again. Lift the chicken on to a clean plate.",
      "Add the broccoli: Add the broccoli and a splash of water and stir-fry for 4 to 5 minutes, until bright green and just tender. No longer, or it goes dark.",
      "Add the garlic and soy: Stir in the rest of the garlic over a medium heat for 30 seconds. Add the chicken, spinach, the rest of the soy sauce and 2 tbsp water. Toss for 1 to 2 minutes, until the spinach wilts and the chicken is glossy.",
      "Drain the rice: Drain the rice well in a sieve and leave it to stand for a minute, so it isn't wet.",
      "Serve: Spoon the rice into warm bowls and top with the chicken and greens and any juices from the pan. Serve straight away.",
    ],
  },
];

// How each looks from directly above, for its picture (docs/RECIPE_IMAGE_PROMPTS.md): one portion, only the recipe's own foods, served as the method says.
export const QUICK_DINNERS_LOOKS: Readonly<Record<string, string>> = {
  "pan-chicken-peas-spinach-potatoes": "A round white plate of golden pan-fried chicken pieces and halved new potatoes browned on their cut sides, mixed with bright green peas and dark green wilted spinach, glossy with oil and flecked with black pepper.",
  "chicken-broccoli-garlic-pasta": "A round white bowl of pasta shapes tossed with golden pieces of chicken and small bright green broccoli florets, glossy with oil, scattered with finely grated pale yellow cheddar and flecks of black pepper.",
  "quick-chicken-spinach-curry-rice": "A round white bowl holding a mound of fluffy white rice beside an orange-red tomato curry with chunks of chicken and dark green wilted spinach, topped with a spoonful of thick white yogurt.",
  "beef-broccoli-soy-stir-fry-rice": "A round white bowl of fluffy white rice topped with browned crumbles of beef mince and bright green broccoli florets glossy with dark soy sauce, scattered with thin green rings of spring onion.",
  "chicken-satay-noodles": "A wide white bowl of thick noodles tossed with golden strips of chicken and crunchy stir-fried vegetable strips in orange, green and cream, all coated in a glossy tan-brown peanut sauce.",
  "bacon-pea-soft-cheese-pasta": "A round white bowl of pasta shapes in a smooth, creamy pale sauce, with crisp pink-brown pieces of bacon, bright green peas and dark green wilted spinach through it, flecked with black pepper.",
  "spicy-chicken-sweetcorn-rice": "A round white bowl of rice coloured an even orange-red by paprika, mixed with browned spiced pieces of chicken, golden sweetcorn, small pieces of red pepper and thin green rings of spring onion.",
  "beef-pepper-quick-chilli-rice": "A deep round white bowl of thick red-brown chilli with crumbled beef mince, dark red kidney beans and soft pieces of red pepper in tomato sauce, beside a neat mound of fluffy white rice.",
  "chicken-mushroom-soy-noodles": "A wide white bowl of glossy soy-brown noodles tangled with golden strips of chicken, sliced browned mushrooms and short green lengths of spring onion, piled high in the middle of the bowl.",
  "egg-vegetable-noodle-stir-fry": "A wide white bowl of glossy soy-brown noodles tangled with stir-fried vegetable strips in orange, green and cream, topped with two fried eggs with golden, lacy white edges and golden yolks, and thin rings of green spring onion.",
  "chicken-fajita-rice-pan": "A round white bowl of rice tinted red-orange by fajita spices, mixed with browned strips of chicken and soft strips of red and yellow pepper and onion, topped with a spoonful of chunky red tomato salsa.",
  "tuna-tomato-new-potatoes-spinach": "A shallow round white bowl of halved new potatoes in a thick red tomato sauce speckled with dried oregano, with pale chunks of tuna and dark green wilted spinach through it, flecked with black pepper.",
  "chicken-pea-egg-fried-rice": "A round white bowl of fried rice tinted pale brown by soy, mixed with small golden pieces of chicken, bright green peas and soft pieces of yellow scrambled egg, flecked with thin green rings of spring onion.",
  "creamy-tomato-chicken-spaghetti": "A wide white pasta bowl of spaghetti twirled in a creamy pale orange tomato sauce, with golden pieces of chicken and dark green wilted spinach through it, speckled with dried herbs.",
  "garlic-soy-chicken-greens-rice": "A round white bowl of fluffy white rice topped with golden strips of chicken glossy with soy sauce, bright green broccoli florets and dark green wilted spinach, with a little of the pan juices.",
};
