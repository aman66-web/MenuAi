import { ing, type Recipe } from "../recipes";

// The recipe book: our own recipes, built from the pantry (lib/mm/pantry.ts). The rules for writing one are at the top of index.ts
// (tests/recipeBook.test.ts checks them): every ingredient listed and counted (no extras), each one of EVERYDAY_KINDS, and the method uses everything bought.

export const CORE: readonly Recipe[] = [
  {
    id: "chicken-rice-bowl", meal: "dinner", name: "Chicken, rice and soy bowl", blurb: "Chicken and stir-fried vegetables in soy sauce, served on rice.", servings: 2, minutes: 25,
    // 2026-11-21 (founder: "Nothing should be plain, these should all be chef made meals"): a teaspoon of oil instead of the spray, so the chicken browns;
    // half the soy soaks into the chicken first, and the rest bubbles down with garlic and a splash of water to the glossy glaze the picture shows
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the photo shows long strips of red, green and orange pepper and no beansprouts or cabbage, so
    // peppers replace the stir-fry pack; the chicken soaks in soy and garlic first, and the rice sits beside it, not under it
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("soy", 30), ing("peppers", 320), ing("vegetable-oil", 5), ing("garlic", 10, { note: "about 2 cloves" })],
    method: [
      "Boil the water: Fill a medium saucepan three-quarters full with water, put the lid on and bring it to the boil over a high heat. This is for the rice.",
      "Marinate the chicken: Cut the chicken into thin strips, about as wide as your finger, and pat them dry with kitchen paper. Toss them in a bowl with half the soy sauce and half the garlic. Wash your hands, the knife and the board in hot soapy water.",
      "Let it soak: Leave it for 10 minutes, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Cook the rice: Add the rice to the boiling water, stir and turn the heat down a little so it doesn't boil over. Cook as the pack says, usually 10 to 15 minutes, stirring once or twice.",
      "Cut the peppers: Cut the peppers in half, pull out the stalks and seeds and slice them into long strips about 1 cm wide. Red, green and orange ones look like the picture.",
      "Heat the pan: Heat a large non-stick frying pan or wok on a high heat for 2 minutes, until very hot. Add the oil and swirl it round until it looks thin and shimmery.",
      "Brown the chicken: Lift the strips out of the bowl, letting any extra soy drip off, and lay them in the pan in one layer with space between them (two batches if your pan is small). Leave for 2 to 3 minutes without stirring, until golden brown underneath.",
      "Turn the chicken: Turn the strips over and fry for 2 to 3 minutes more, until golden on the other side too.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot with no pink left. If not, fry for 1 to 2 minutes more and check again. Lift the chicken onto a clean plate.",
      "Drain the rice: Take the frying pan off the heat. Drain the rice well in a sieve, fluff it with a fork and put it back in its pan with the lid on to keep warm.",
      "Add the peppers: Put the frying pan back on a high heat and add the pepper strips. Toss for 4 to 5 minutes, until soft at the edges, a little crunchy and browned in places. Stir in the rest of the garlic for the last 30 seconds.",
      "Glaze it: Tip the chicken and its juices back in. Pour over the rest of the soy sauce and 2 tablespoons of water and let it bubble for 1 to 2 minutes, tossing, until it cooks down to a glossy dark glaze.",
      "Serve: Spoon the rice into one side of each warm bowl and pile the chicken and peppers beside it. Scrape any glaze left in the pan over the chicken and serve hot.",
    ],
  },
  {
    id: "chicken-curry", meal: "dinner", name: "Chicken curry with rice", blurb: "A creamy curry made with yogurt instead of cream.", servings: 2, minutes: 35,
    // 2026-11-21 (founder: "these should all be chef made meals"): a teaspoon of oil so the chicken browns before the onion goes in, and garlic with the paste
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): onion in soft slices as in the photo, and the chicken marinates in curry paste and yogurt
    ingredients: [ing("chicken", 300), ing("curry-paste", 60), ing("chopped-tomatoes", 400), ing("greek-yogurt", 150), ing("rice", 150), ing("onion", 150, { note: "about 1 onion" }), ing("vegetable-oil", 5), ing("garlic", 5, { note: "about 1 clove" })],
    method: [
      "Prepare the onion and chicken: Peel the onion, halve it and slice it into thin half-moons. Cut the chicken into bite-sized chunks, about 3 cm across, and pat them dry with kitchen paper. Wash your hands, the knife and the board in hot soapy water afterwards.",
      "Marinate the chicken: Toss the chicken with a heaped spoonful of the curry paste and a big spoonful of the yogurt. Leave it for 10 minutes, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Brown the chicken: Heat the oil in a large, deep non-stick frying pan on a medium-high heat. Add the chicken in one layer and leave it for 2 to 3 minutes without stirring, until golden underneath. Turn and fry 2 minutes more, then lift onto a plate.",
      "Soften the onion: Turn the heat down to medium. Add the onion and a splash of water, scraping up the brown bits, and cook for 6 to 8 minutes, stirring now and then, until soft, sweet and golden at the edges.",
      "Boil the water: Fill a medium saucepan three-quarters full with water, put the lid on and bring it to the boil over a high heat. This is for the rice.",
      "Add the curry paste: Stir in the garlic and the rest of the curry paste and cook for 1 minute, until you can smell the spices. Add a small splash of water if it catches.",
      "Add the tomatoes: Pour in the chopped tomatoes and put the chicken and its juices back in. Stir, scraping up anything stuck to the bottom of the pan, and bring it to the boil, which takes 2 to 3 minutes.",
      "Simmer the curry: Turn the heat down low and simmer gently for 15 minutes, with just a few small bubbles, until thick enough to coat the chicken. Stir now and then, and add a splash of water if it gets too thick.",
      "Cook the rice: Add the rice to the boiling water and stir. Cook as the pack says, usually 10 to 15 minutes, then drain it in a sieve, fluff it with a fork and cover to keep warm.",
      "Check the chicken: Cut into the thickest part of the biggest piece. It should be white all the way through and piping hot with no pink left. If not, simmer for 2 to 3 minutes more and check again.",
      "Stir in the yogurt: Take the pan off the heat and wait 1 minute for the bubbling to stop. Stir in the rest of the yogurt a spoonful at a time until smooth. Don't let it boil again, or the yogurt can split.",
      "Serve: Spoon the rice into a neat mound on one side of each warm plate and ladle the curry beside it. Serve straight away while it's hot.",
    ],
  },
  {
    id: "beef-chilli", meal: "dinner", name: "Beef chilli and rice", blurb: "A batch-cook classic that keeps well for the week.", servings: 4, minutes: 45,
    // 2026-11-21 (founder: "these should all be chef made meals"): garlic and tomato purée fried with the spices for a deep red-brown sauce, and a pinch of salt
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the mince is seasoned before it browns, and the onion is in 1 cm squares as in the photo
    ingredients: [ing("beef-mince", 500), ing("kidney-beans", 240, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 300), ing("chilli-powder", 3), ing("cumin", 3), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("chopped-tomato-puree", 15), ing("salt", 1)],
    method: [
      "Season the mince: Put the mince in a bowl with half the chilli powder, half the cumin, half the garlic and the salt. Mix it with your hands, then wash them in hot soapy water.",
      "Let it sit: Leave the mince for 10 minutes while you chop the onion and rinse the beans, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Chop the onion: Peel the onion, cut it in half and chop it into small squares, about 1 cm.",
      "Rinse the beans: Tip the kidney beans into a sieve, drain them and rinse them under cold water until the water runs clear. Leave them to drain.",
      "Brown the mince: Put a large, deep non-stick pan on a high heat for 2 minutes. Add the mince, press it out flat and leave it for 3 minutes without stirring, until browned underneath.",
      "Break up the mince: Break it into small crumbles, turn it over and fry for 3 to 4 minutes more, until browned all over with no pink left. If water pools in the pan, keep frying until it bubbles away.",
      "Soften the onion: Turn the heat down to medium, add the onion and fry for 5 to 6 minutes, stirring now and then, until soft and sweet.",
      "Add the spices: Stir in the rest of the garlic, chilli powder and cumin with the tomato purée and cook for 1 minute, stirring all the time, until the purée darkens and you can smell the spices.",
      "Add the tomatoes and beans: Pour in the chopped tomatoes, add the drained beans and stir well, scraping up anything stuck to the pan. Bring it to the boil, which takes 2 to 3 minutes.",
      "Simmer the chilli: Turn the heat down low and simmer gently for 25 minutes, with just a few small bubbles, until thick and deep red-brown. Stir every 5 minutes or so, and add a splash of water if it gets too thick.",
      "Boil the water: Meanwhile, fill a large saucepan three-quarters full with water, put the lid on and bring it to the boil over a high heat. This is for the rice.",
      "Cook the rice: Add the rice to the boiling water and stir. Cook as the pack says, usually 10 to 15 minutes, stirring once or twice, then drain it in a sieve and fluff it with a fork.",
      "Check the chilli: It's ready when it's thick enough to leave a trail when you drag the spoon through, and piping hot all the way through. If it's still runny, simmer it a few minutes more.",
      "Serve: Ladle the chilli into warm bowls and spoon the rice in a half-moon against one side. Serve straight away while it's hot.",
    ],
  },
  {
    id: "chicken-mushroom-pasta", meal: "dinner", name: "Creamy chicken and mushroom pasta", blurb: "Chicken and mushrooms in a creamy garlic sauce.", servings: 4, minutes: 30,
    // 2026-11-21 (founder: "these should all be chef made meals"): a teaspoon of oil instead of the spray so both batches of chicken and the mushrooms brown,
    // and the chicken seasoned with pepper before it cooks
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): bows and thick mushroom slices as in the photo; the chicken marinates in garlic, pepper and oil
    ingredients: [ing("chicken", 480), ing("pasta-shapes", 300, { note: "uncooked: bows (farfalle) look like the picture" }), ing("mushrooms", 250), ing("soft-cheese", 200), ing("stock-cube", 6), ing("garlic", 10, { note: "about 2 cloves" }), ing("spinach", 90), ing("vegetable-oil", 5), ing("black-pepper", 1)],
    method: [
      "Boil the water: Fill a large saucepan three-quarters full with water, put the lid on and bring it to the boil over a high heat. This is for the pasta.",
      "Prepare the chicken and mushrooms: Cut the chicken into bite-sized pieces, about 2 cm across, and pat them dry with kitchen paper. Wash your hands, the knife and the board in hot soapy water. Wipe the mushrooms clean and slice them thickly, about 1 cm.",
      "Marinate the chicken: Toss the chicken in a bowl with a third of the oil, half the garlic and half the black pepper. Leave it for 10 minutes, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Heat the pan: Heat a large, deep non-stick frying pan on a high heat for 2 minutes, until very hot. The oil on the chicken is enough for the first batch.",
      "Brown the chicken: Add half the chicken in one layer with space between the pieces. Leave it for 2 to 3 minutes without stirring, until golden brown underneath, then turn and fry for 2 to 3 minutes more, until golden all over.",
      "Brown the second batch: Lift the browned chicken onto a clean plate. Add another third of the oil and brown the rest of the chicken the same way.",
      "Cook the pasta: Meanwhile, add the pasta to the boiling water and stir. Cook for the time on the pack, usually 10 to 12 minutes, stirring once or twice so it doesn't stick.",
      "Check the chicken: Cut into the thickest piece of each batch. It should be white all the way through and piping hot with no pink left. If not, fry it for 1 to 2 minutes more and check again. Keep it all on the plate.",
      "Brown the mushrooms: Add the rest of the oil and the mushrooms on a high heat. Leave them for 2 minutes without stirring, then fry for 3 to 4 minutes more, stirring now and then, until golden brown and their liquid has cooked away.",
      "Add the garlic: Stir in the rest of the garlic and cook for 30 seconds, stirring all the time so it doesn't burn.",
      "Make the sauce: Turn the heat down to low and scoop out a mugful of the hot pasta water. Add the soft cheese, crumble in the stock cube and stir, adding the water a splash at a time, until smooth and creamy.",
      "Add the chicken and spinach: Tip the chicken and any juices back in. Add the spinach a handful at a time and stir it into the sauce for 1 to 2 minutes, until soft, dark green and much smaller.",
      "Mix in the pasta: Drain the pasta in a colander and tip it into the sauce. Stir so every piece is coated, adding a splash more pasta water if it's too thick. Heat for 1 to 2 minutes, until piping hot all the way through.",
      "Season and serve: Stir in the rest of the black pepper, tasting a little of the sauce to see if it needs more. Share the pasta between warm bowls and spoon over any sauce left in the pan.",
    ],
  },
  {
    id: "salmon-noodles", meal: "dinner", name: "Salmon and soy noodles", blurb: "Ready in 20 minutes.", servings: 2, minutes: 20,
    // 2026-11-21 (founder: "these should all be chef made meals"): a teaspoon of oil so the salmon browns at the edges, pepper on the fish, garlic in the noodles
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the salmon soaks in soy and garlic, so its edges brown and glaze as in the photo; spring onions cut on a slant
    ingredients: [ing("salmon", 240), ing("noodles", 300), ing("soy", 30), ing("spring-onions", 30), ing("vegetable-oil", 5), ing("garlic", 5, { note: "about 1 clove" }), ing("black-pepper", 1)],
    method: [
      "Slice the spring onions: Trim the roots and the very tops off the spring onions. Slice them on a slant into pieces about 1 cm long and put them to one side.",
      "Marinate the salmon: Turn the salmon in a shallow dish with a third of the soy sauce, half the garlic and the black pepper. Leave it for 10 minutes, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Loosen the noodles: Tip the noodles into a bowl and gently pull the strands apart with your fingers so they aren't stuck together.",
      "Heat the pan: Heat the oil in a large non-stick frying pan on a medium-high heat for 1 to 2 minutes, until it looks thin and shimmery.",
      "Cook the first side: Lift the salmon out of the dish and lay it in the pan, skin side down if it has skin. Cook for 4 to 5 minutes without moving it, until golden underneath. Wash your hands after handling raw fish.",
      "Turn the salmon: Turn it over carefully with a fish slice and cook for 3 to 4 minutes more, until golden brown underneath. Turn the heat down a little if it browns too fast.",
      "Check the fish: It's cooked when it's opaque all the way through and flakes easily when you press it with a fork. If the middle still looks see-through, cook for 1 to 2 minutes more.",
      "Keep the salmon warm: Lift the salmon onto a plate and cover it with another plate. Leave the pan on the heat for the noodles.",
      "Heat the noodles: Stir the rest of the garlic into the pan for 30 seconds. Add the noodles and the rest of the soy sauce and toss for 2 to 3 minutes, until piping hot and glossy. Add a splash of water if they stick.",
      "Serve: Share the noodles between warm bowls. Flake the salmon into large pieces on top, leaving the skin behind if you like, and scatter over the spring onions.",
    ],
  },
  {
    id: "tuna-pasta", meal: "dinner", name: "Tuna and tomato pasta", blurb: "Store-cupboard dinner for three.", servings: 3, minutes: 20,
    // 2026-11-21 (founder: "these should all be chef made meals"): the herbs warmed in a teaspoon of olive oil first, the sauce simmered until it coats, and pepper
    ingredients: [ing("tuna", 204), ing("pasta-shapes", 200), ing("passata", 500), ing("cheddar", 60), ing("mixed-herbs", 1), ing("olive-oil", 5), ing("black-pepper", 1)],
    method: [
      "Boil the water: Fill a large saucepan three-quarters full with water, put the lid on and bring it to the boil over a high heat. This is for the pasta.",
      "Drain the tuna: Tip the tuna into a sieve over the sink and press it gently with the back of a spoon to squeeze out the liquid.",
      "Grate the cheese: Grate the cheddar onto a plate on the coarse side of the grater and put it to one side for serving.",
      "Cook the pasta: When the water is boiling hard, add the pasta and stir. Cook for the time on the pack, usually 10 to 12 minutes, stirring once or twice so it doesn't stick.",
      "Warm the herbs: Meanwhile, heat the oil in a large saucepan on a medium heat. Add the dried herbs and stir for 30 seconds, until they smell fragrant, without letting them burn.",
      "Simmer the sauce: Pour in the passata carefully, as it can spit, and bring it to a bubble. Turn the heat down low and simmer for 8 to 10 minutes, stirring now and then, until thick enough to coat the back of the spoon.",
      "Add the tuna: Stir in the tuna and the black pepper, breaking up any very big chunks with a fork. Stir gently for 1 to 2 minutes, just until hot, so it doesn't turn to mush.",
      "Drain the pasta: Drain the pasta in a colander over the sink and give it a good shake to get rid of the extra water.",
      "Mix it together: Tip the pasta into the sauce and stir gently over a low heat for 1 minute, until coated and piping hot. Add a splash of water if the sauce is too thick.",
      "Serve: Share the pasta between warm bowls and sprinkle the grated cheese over the top. Serve straight away, while the cheese starts to melt.",
    ],
  },
  {
    id: "salmon-coconut-curry", meal: "dinner", name: "Coconut salmon curry with rice", blurb: "Salmon and peas in a coconut curry sauce.", servings: 3, minutes: 25,
    // 2026-11-21 (founder: "these should all be chef made meals"): garlic fried with the curry paste
    // 2026-11-22 (founder 21 Nov: "marinating ... makes a big difference"): the salmon chunks sit in a little of the curry paste while the sauce cooks
    ingredients: [ing("salmon", 300), ing("coconut-milk", 400), ing("curry-paste", 50), ing("rice", 150), ing("peas", 150), ing("garlic", 5, { note: "about 1 clove" })],
    method: [
      "Boil the water: Fill a medium saucepan with water, put the lid on and bring it to the boil over a high heat. This is for the rice.",
      "Prepare the salmon: Take off any skin and cut the fish into large chunks, about 3 cm across. Feel the chunks with your fingertips for small bones and pull out any you find. Wash your hands after handling raw fish.",
      "Marinate the salmon: Turn the chunks gently in a bowl with a heaped spoonful of the curry paste. Leave them for 10 minutes while the sauce cooks, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Cook the curry paste: Put a large, deep non-stick frying pan on a medium heat. Add the rest of the curry paste and the garlic and stir for 1 minute, until it sizzles and smells fragrant. Add a splash of water if it sticks.",
      "Add the coconut milk: Shake the tin of coconut milk well before opening it, as the thick part sits on top. Pour it into the pan and stir until the sauce is smooth and an even colour.",
      "Cook the rice: When the water is boiling hard, add the rice and stir once. Cook as the pack says, usually 10 to 15 minutes, until the grains are soft with no hard centre.",
      "Simmer the sauce: Stir the sauce on the medium heat for about 2 minutes, until it just bubbles. Turn the heat down low and simmer gently for 5 minutes, until it thickens a little and clings to the spoon.",
      "Add the salmon and peas: Add the salmon chunks and the peas straight from the freezer. Push the fish gently under the sauce with the back of the spoon so most of it is covered.",
      "Cook the salmon: Let it come back to a gentle simmer and cook for 6 to 8 minutes, turning the salmon once, very gently, so it doesn't break up. Add a splash of water if it gets too thick.",
      "Drain the rice: Drain the rice well in a colander and fluff it with a fork. Put it back in its pan with the lid on to keep warm.",
      "Check the fish: It's cooked when it's opaque and flakes easily when you press it with a fork, and the curry is piping hot. If a chunk still looks see-through, cook for 1 to 2 minutes more.",
      "Serve: Spoon the rice onto one side of each warm plate and ladle the salmon curry beside it. Serve straight away.",
    ],
  },
  {
    id: "satay-egg-noodles", meal: "dinner", name: "Satay noodles with egg", blurb: "Peanut sauce, vegetables and strips of omelette, no meat.", servings: 2, minutes: 20,
    // 2026-11-21 (founder: "these should all be chef made meals"): garlic with the vegetables, and the sauce tossed until it clings
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): wide ribbons of omelette laid loosely on top, as in the photo
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("noodles", 300), ing("peanut-butter", 40), ing("soy", 30), ing("lemon-juice", 15), ing("chilli-powder", 1), ing("stir-fry-veg", 300), ing("oil-spray", 1), ing("garlic", 5, { note: "about 1 clove" })],
    method: [
      "Beat the eggs: Crack the eggs into a large bowl and beat them with a fork until there are no streaks of clear white left. Put the bowl next to the cooker.",
      "Make the peanut sauce: In a small bowl, mix the peanut butter, soy sauce and chilli powder with a splash of hot water from the kettle. Stir with a fork until smooth and thin enough to pour, adding more hot water if it's stiff.",
      "Start the first omelette: Spray a large non-stick frying pan with the oil spray and put it on a medium heat. Pour in half the egg and tilt the pan so it spreads into a thin, even layer.",
      "Cook the omelette: Cook for 2 to 3 minutes, until the egg is completely set with no runny egg on top. If any is left, turn it over carefully with a fish slice and cook for 30 seconds more.",
      "Slice the omelette: Slide it onto a chopping board and roll it up loosely. Slice it across into ribbons about 2 cm wide and put them on a plate.",
      "Make the second omelette: Spray the pan again and cook the rest of the egg the same way, until completely set. Roll it up, slice it and add the strips to the plate.",
      "Fry the vegetables: Turn the heat up to high and spray the pan again. Add the stir-fry vegetables and keep them moving for 3 to 4 minutes, until hot, a little crunchy and browned in places. Stir in the garlic for the last 30 seconds.",
      "Add the noodles and sauce: Add the noodles, pulling apart any that are stuck together. Stir the peanut sauce and pour it in, then toss for 1 to 2 minutes, until piping hot and glossy, with the sauce clinging to every strand. Add a splash of water if it's dry.",
      "Add the lemon: Take the pan off the heat, stir in the lemon juice and give everything a final toss.",
      "Serve: Share the noodles between warm bowls and lay the omelette ribbons loosely across the top. Serve straight away while it's hot.",
    ],
  },
  {
    id: "overnight-oats", meal: "breakfast", name: "Overnight oats with yogurt", blurb: "Make it the night before, grab it in the morning.", servings: 2, minutes: 5,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of cinnamon through the oats
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): in the photo the bowl is unstirred, with a peanut-butter spiral and fresh berries heaped on one side, so both go on in the morning
    ingredients: [ing("oats", 80), ing("greek-yogurt", 200, { role: "protein" }), ing("milk", 150, { follows: "oats" }), ing("peanut-butter", 20), ing("berries", 80), ing("cinnamon", 1)],
    method: [
      "Get the jars ready: Get a jar or bowl for each person, ideally with a lid, big enough to hold the oats, yogurt and berries with a little room to spare.",
      "Mix the oats: Tip the oats into a mixing bowl with the cinnamon, add the yogurt and pour in the milk. Stir until there are no dry patches and it looks like thick, even porridge.",
      "Fill the jars: Spoon the mixture evenly into the jars or bowls and level the tops with the back of the spoon.",
      "Chill overnight: Cover each one with its lid, a plate or cling film. Leave in the fridge overnight, or for at least 6 hours, until the oats are soft and creamy.",
      "Add the peanut butter: In the morning, loosen the peanut butter with a teaspoon of hot water. Drizzle it over each one in a spiral, from the centre outwards. Don't stir it in.",
      "Add the berries: Heap the berries on one side of each. Thaw frozen ones in a sieve under the cold tap for a minute first and shake them dry, so they don't stain the oats.",
      "Serve: Eat it cold as it is, or stir it all together first, with a splash of milk if it's too thick.",
    ],
  },
  {
    id: "cheesy-egg-wraps", meal: "breakfast", name: "Cheesy scrambled egg wraps", blurb: "A filling breakfast in ten minutes.", servings: 2, minutes: 10,
    // 2026-11-21 (founder: "Nothing should be plain"): the eggs seasoned with salt and pepper
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): the wraps are toasted to brown spots and cut in half, as in the photo
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("cheddar", 40), ing("wraps", 120), ing("milk", 30), ing("spinach", 60), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Prepare the cheese and spinach: Grate the cheese on the coarse side of the grater. Rinse the spinach under cold water and shake it dry, unless the bag says it's ready washed.",
      "Beat the eggs: Crack the eggs into a bowl, add the milk, salt and black pepper and beat with a fork for about 30 seconds, until there are no streaks of clear white left. Wash your hands after handling raw eggs.",
      "Warm the wraps: Put a large non-stick frying pan on a medium heat. Warm the wraps in the dry pan one at a time, about 20 seconds a side, then stack them under a clean tea towel.",
      "Wilt the spinach: Add the spinach to the same pan and stir for 1 to 2 minutes, until soft and dark green and most of its water has bubbled away.",
      "Start the eggs: Turn the heat down to medium-low and pour in the egg. Leave it for about 20 seconds until the edges start to set, then gently push the egg from the edges to the middle.",
      "Scramble the eggs: Keep stirring gently for 2 to 3 minutes, until the egg is just set but still soft, with no runny egg left. Take the pan off the heat while it still looks a little soft.",
      "Melt in the cheese: Scatter the grated cheese over the egg and stir for about 30 seconds, until it has melted in.",
      "Fill and roll: Spoon the egg in a line across the middle of each warm wrap. Fold in the bottom and sides and roll it up tightly.",
      "Toast the wraps: Put them join side down in the dry pan on a medium heat for 1 to 2 minutes a side, until golden brown in spots. Cut each in half and serve straight away.",
    ],
  },
  {
    id: "chickpea-curry", meal: "dinner", name: "Chickpea and tomato curry", blurb: "A meat-free curry that keeps well.", servings: 3, minutes: 30,
    // 2026-11-21 (founder: "these should all be chef made meals"): the onion fried soft and sweet in a teaspoon of oil, the chickpeas fried until golden as the
    // picture shows, garlic with the paste, and a squeeze of lemon at the end
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): the onion is in soft slices in the photo
    ingredients: [ing("chickpeas", 240), ing("chopped-tomatoes", 400), ing("curry-paste", 60), ing("coconut-milk", 200), ing("rice", 150), ing("onion", 150, { note: "about 1 onion" }), ing("spinach", 90), ing("vegetable-oil", 5), ing("garlic", 5, { note: "about 1 clove" }), ing("lemon-juice", 10)],
    method: [
      "Prepare the onion and spinach: Peel the onion, cut it in half and slice it into thin half-moons. Rinse the spinach and shake it dry, unless the bag says it's ready washed.",
      "Rinse the chickpeas: Drain the chickpeas in a sieve over the sink, rinse them under cold water and pat them dry with kitchen paper.",
      "Soften the onion: Heat the oil in a large, deep frying pan on a medium heat. Add the onion and cook for 6 to 8 minutes, stirring now and then, until soft, sweet and just golden at the edges.",
      "Fry the chickpeas: Add the chickpeas and fry for 3 minutes, stirring now and then, until they start to turn golden.",
      "Add the curry paste: Stir in the garlic and curry paste for 1 minute, scraping the bottom of the pan, until it smells fragrant. Don't let it burn.",
      "Make the sauce: Shake the tin of coconut milk, then pour in the amount in your ingredients list (it may be less than a whole tin). Add the chopped tomatoes, stir well and bring to the boil.",
      "Simmer the curry: Turn the heat down low and simmer gently for 15 minutes, stirring every few minutes, until thick enough to leave a trail when you drag the spoon through. Add a splash of water if it gets too thick.",
      "Boil the water: Meanwhile, fill a medium saucepan with water, put the lid on and bring it to the boil over a high heat. This is for the rice.",
      "Cook the rice: Add the rice to the boiling water and stir once. Cook as the pack says, usually 10 to 15 minutes, until the grains are soft with no hard centre.",
      "Add the spinach: Stir the spinach into the curry a handful at a time. Cook for 1 to 2 minutes, until it wilts and turns dark green. Take it off the heat and stir in the lemon juice.",
      "Drain the rice: Drain the rice well in a colander and fluff it with a fork. If it's ready before the curry, put it back in its pan with the lid on.",
      "Serve: Check the curry is piping hot all the way through. Spoon the rice into a round mound in the middle of each warm bowl and ladle the curry around it.",
    ],
  },
  {
    id: "chicken-wraps", meal: "lunch", name: "Chicken and yogurt wraps", blurb: "Easy to pack for lunch.", servings: 3, minutes: 20,
    // 2026-11-21 (founder: "these should all be chef made meals"): a teaspoon of oil so the strips brown, and the chicken seasoned before it cooks
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): the chicken marinates in lemon, oil, salt and pepper and browns dark at the edges; whole lettuce pieces,
    // the sauce drizzled over the chicken, toasted wraps cut on a slant, as in the photo
    ingredients: [ing("chicken", 300), ing("wraps", 180), ing("greek-yogurt", 100), ing("cheddar", 40), ing("lettuce", 90), ing("lemon-juice", 15), ing("salt", 1), ing("black-pepper", 1), ing("vegetable-oil", 5)],
    method: [
      "Cut the chicken: Cut the chicken into thin strips, about as thick as a pound coin, and pat them dry with kitchen paper. Wash your hands, the knife and the board in hot soapy water.",
      "Marinate the chicken: Toss the strips with the oil, a third of the lemon juice, half the salt and half the black pepper. Leave them for 10 minutes, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Prepare the salad: Wash the lettuce, shake it dry and tear it into large pieces. Grate the cheese on the coarse side of the grater.",
      "Make the yogurt sauce: Mix the yogurt with the rest of the lemon juice, salt and pepper in a small bowl until smooth. Taste it and add a grind more black pepper if it needs it.",
      "Brown the chicken: Heat a large non-stick frying pan on a high heat for 2 minutes. Lay the strips in one layer with space between them (two batches if your pan is small). Leave for 2 to 3 minutes without moving, until well browned underneath.",
      "Turn the chicken: Turn the strips and cook for 2 to 3 minutes more, until browned on the other side and darker at the edges. Turn the heat down a little if they catch.",
      "Check the chicken: Cut into the thickest piece. It should be white all the way through and piping hot with no pink left. If not, cook for 1 to 2 minutes more. Tip it onto a plate, and let it cool if packing for later.",
      "Warm the wraps: Put the pan back on a medium heat and warm each wrap in the dry pan for 30 to 40 seconds a side, until it has a few golden-brown spots.",
      "Fill the wraps: Lay a wrap flat and cover the middle with lettuce, leaving a 2 to 3 cm gap at the edge. Add the chicken, drizzle the yogurt sauce over it and scatter the cheese on top.",
      "Roll and serve: Fold in the bottom and sides, then roll it up tightly with the join underneath. Cut it in half on a slant and eat while warm, or keep it in the fridge if packing for later.",
    ],
  },
  {
    id: "bean-chilli", meal: "dinner", name: "Bean chilli", blurb: "A plant-based chilli with kidney beans and chickpeas.", servings: 4, minutes: 35,
    // 2026-11-21 (founder: "these should all be chef made meals"): the onion fried soft and sweet in a teaspoon of olive oil, and salt
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): the onion is in 1 cm squares in the photo
    ingredients: [ing("kidney-beans", 480), ing("chickpeas", 240), ing("chopped-tomatoes", 800), ing("rice", 300), ing("onion", 150, { note: "about 1 onion" }), ing("garlic", 10, { note: "about 2 cloves" }), ing("cumin", 2), ing("chilli-powder", 2), ing("olive-oil", 5), ing("salt", 2)],
    method: [
      "Chop the onion: Peel the onion, cut it in half and lay each half flat side down so it doesn't slip. Chop it into small squares, about 1 cm.",
      "Rinse the beans: Drain the kidney beans and chickpeas in a sieve over the sink and rinse them under cold water. Leave them to drain.",
      "Soften the onion: Heat the oil in a large, deep non-stick saucepan on a medium heat. Add the onion and cook for 6 to 8 minutes, stirring now and then, until soft, sweet and just golden at the edges.",
      "Add the garlic and spices: Stir in the garlic purée, cumin and chilli powder and cook for 1 minute, stirring all the time, until you can smell the spices. Add a small splash of water if they stick.",
      "Add the tomatoes and beans: Pour in the chopped tomatoes, add the kidney beans, chickpeas and salt, and stir well, scraping the bottom of the pan. Turn the heat up and bring it to the boil, which takes about 3 minutes.",
      "Simmer the chilli: Turn the heat down low and simmer gently for 20 minutes, with just a few small bubbles, until thick and deep red. Stir every few minutes, and add a splash of water if it gets too thick.",
      "Boil the water: Meanwhile, fill a large saucepan three-quarters full with water, put the lid on and bring it to the boil over a high heat. This is for the rice.",
      "Cook the rice: Add the rice, stir and turn the heat down a little so it doesn't boil over. Cook as the pack says, usually 10 to 15 minutes, stirring once or twice.",
      "Drain the rice: Taste a few grains to check they're soft with no hard centre. Drain the rice in a sieve, fluff it with a fork and put it back in its pan with the lid on.",
      "Check the chilli: It should be thick enough to leave a trail when you drag the spoon through, and piping hot all the way through. If it's still runny, simmer for 3 to 5 minutes more.",
      "Serve: Spoon the rice into one side of each warm bowl and ladle the chilli beside it. Serve straight away while it's hot.",
    ],
  },
  {
    id: "tuna-fishcakes", meal: "dinner", name: "Tuna fishcakes with peas", blurb: "Golden fishcakes made from tinned tuna and potatoes.", servings: 2, minutes: 30,
    // 2026-11-21 (founder: the recipe "has to look exactly as much as you can as the product"): a teaspoon of oil instead of the spray, for the golden, crisp
    // fishcakes the picture shows
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): a fork's criss-cross on top, and the lemon in the mixture (the photo has no drizzle)
    ingredients: [ing("tuna", 200), ing("new-potatoes", 340), ing("eggs", 60, { follows: "new-potatoes", note: "1 egg" }), ing("spring-onions", 30), ing("peas", 160), ing("lemon-juice", 10), ing("vegetable-oil", 5), ing("black-pepper", 1)],
    method: [
      "Slice the spring onions: Trim the roots and any tough dark green tips off the spring onions. Slice the rest into thin rounds and put them in a large mixing bowl.",
      "Add the tuna: Tip the tuna into a sieve and press out as much water as you can with the back of a spoon. Add it to the bowl and break it up with a fork.",
      "Mash the potatoes: Drain the potatoes well in a colander. They're already cooked, so add them to the bowl and mash with a fork or potato masher until there are no big lumps.",
      "Mix in the egg: Beat the egg in a cup with a fork, then pour it into the bowl with the lemon juice and a good pinch of black pepper. Mix until it holds together in a thick, slightly sticky mixture.",
      "Shape the fishcakes: With wet hands, shape the mixture into flat cakes the size of your palm, 2 cm thick, and press a criss-cross on top with a fork. Wash your hands, as it has raw egg in it. Chill them for 10 minutes if you have time.",
      "Heat the pan: Heat most of the oil in a large non-stick frying pan on a medium heat for 1 to 2 minutes, tilting the pan so it covers the bottom, until it looks shimmery.",
      "Fry the first side: Add the fishcakes with a little space between them. Fry for 4 to 5 minutes without moving them, until golden brown, crisp and firm underneath.",
      "Fry the other side: Add the rest of the oil to the gaps, turn the fishcakes carefully with a fish slice and fry for 4 to 5 minutes more, until golden and crisp. Fry any left the same way.",
      "Cook the peas: Pour boiling water from the kettle into a small saucepan until half full and bring it back to the boil. Cook the frozen peas for 3 minutes, until bright green and piping hot, then drain.",
      "Check the fishcakes: Break one open with a fork. It should be firm and piping hot in the middle, with the egg set. If not, return them to the pan on a low heat for 1 to 2 minutes.",
      "Serve: Spoon the peas onto warm plates and put the fishcakes beside them, criss-cross side up. Serve straight away while it's hot.",
    ],
  },
  {
    id: "chickpea-houmous-wraps", meal: "lunch", name: "Chickpea and houmous wraps", blurb: "Warm spiced chickpeas with houmous and salad.", servings: 2, minutes: 10,
    // 2026-11-21 (founder: "these should all be chef made meals"): the chickpeas fried in a teaspoon of olive oil until golden, then the spices and a pinch of salt
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): whole spiced chickpeas, large lettuce pieces and lightly toasted wraps, as in the photo
    ingredients: [ing("chickpeas", 240), ing("wraps", 120), ing("houmous", 60), ing("lettuce", 60), ing("tomatoes", 80), ing("lemon-juice", 10), ing("cumin", 1), ing("paprika", 1), ing("olive-oil", 5), ing("salt", 1)],
    method: [
      "Rinse the chickpeas: Drain the chickpeas in a sieve over the sink, rinse them under cold water and pat them dry with kitchen paper.",
      "Prepare the salad: Rinse the lettuce and tomatoes and pat them dry. Halve the tomatoes, cut out the hard core and slice them thinly. Tear the lettuce into large pieces.",
      "Warm the wraps: Heat a large dry frying pan on a medium heat for 1 minute. Warm the wraps one at a time for 30 to 40 seconds a side, until they have a few golden spots, then stack them under a clean tea towel.",
      "Fry the chickpeas: Turn the heat up to medium-high and add the oil to the same pan. Fry the chickpeas for 3 to 4 minutes, shaking the pan now and then, until they start to turn golden and crisp.",
      "Spice the chickpeas: Stir in the cumin, paprika and salt for 30 seconds, until the chickpeas are coated and smell toasty. Don't let the spices burn.",
      "Add the lemon: Take the pan off the heat, sprinkle over the lemon juice and stir gently, keeping the chickpeas whole.",
      "Fill the wraps: Lay a wrap flat and spread some houmous over the middle, leaving a 2 to 3 cm gap at the edge. Top with the chickpeas, lettuce and tomatoes, without overfilling it.",
      "Roll them up: Fold the bottom edge over the filling, fold in the sides and roll it up tightly with the join underneath. Fill and roll the rest the same way.",
      "Serve: Cut each wrap in half and eat straight away, while the chickpeas are still warm.",
    ],
  },
  {
    id: "mushroom-bean-pasta", meal: "dinner", name: "Mushroom and bean pasta", blurb: "A meat-free ragu with mushrooms and kidney beans.", servings: 3, minutes: 40,
    // 2026-11-21 (founder: "these should all be chef made meals"): 5 ml more olive oil so the mushrooms brown on their own before the onion goes in, and salt and
    // pepper in the sauce
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): the photo's sauce has pieces of tomato, so chopped tomatoes replace the passata; shells, thick mushroom slices, 1 cm onion
    ingredients: [ing("kidney-beans", 240), ing("mushrooms", 250), ing("chopped-tomatoes", 400), ing("pasta-shapes", 225, { note: "uncooked: shells look like the picture" }), ing("olive-oil", 15), ing("garlic", 10, { note: "about 2 cloves" }), ing("mixed-herbs", 2), ing("onion", 150, { note: "about 1 onion" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Prepare the onion and mushrooms: Peel the onion, cut it in half and chop it into small squares, about 1 cm. Wipe the mushrooms clean if they need it and slice them thickly, about 1 cm, or halve small ones.",
      "Rinse the beans: Drain the kidney beans in a sieve over the sink, rinse them under cold water and leave them to drain.",
      "Brown the mushrooms: Heat half the oil in a large, deep non-stick frying pan on a high heat. Spread the mushrooms out, leave them for 3 minutes without stirring, then fry for 2 to 3 minutes more, until browned. Lift them onto a plate.",
      "Soften the onion: Turn the heat down to medium and add the rest of the oil and the onion. Fry for 6 to 8 minutes, stirring now and then, until soft, sweet and just golden at the edges.",
      "Boil the water: Meanwhile, fill a large saucepan three-quarters full with water, put the lid on and bring it to the boil over a high heat. This is for the pasta.",
      "Add the garlic and herbs: Stir in the garlic purée and the dried herbs and cook for 1 minute, stirring all the time so the garlic doesn't catch.",
      "Simmer the sauce: Pour in the chopped tomatoes and stir in the beans, mushrooms and salt. Bring it to the boil, then turn the heat down low and simmer for 12 to 15 minutes, until thick and chunky. Add a splash of water if it gets too thick.",
      "Cook the pasta: As soon as the sauce is simmering, add the pasta to the boiling water. Cook for the time on the pack, usually 10 to 12 minutes, stirring once or twice so it doesn't stick.",
      "Drain the pasta: Scoop out a small mug of the cooking water and set it aside, then drain the pasta in a colander over the sink.",
      "Mix it together: Check the sauce is thick enough to leave a trail and is piping hot. Tip the pasta back into its pan, add the sauce and stir over a low heat for 1 minute, adding a splash of the cooking water if it's too thick.",
      "Serve: Stir in the black pepper, then share the pasta between warm bowls and serve straight away while it's hot.",
    ],
  },
  {
    id: "chicken-bean-rice", meal: "dinner", name: "Chicken thigh, bean and tomato rice", blurb: "A one-pot rice with chicken and kidney beans.", servings: 3, minutes: 40,
    // the rice cooks in the method's own 400 ml of water, so fitting leaves it as written
    // 2026-11-21 (founder: "these should all be chef made meals"): the chicken seasoned with paprika, salt and pepper before it browns in its own fat, and garlic
    // with the rest of the paprika
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"; "marinating ... makes a big difference"): half-thigh pieces marinated in oil, paprika and garlic and browned dark, as in the photo; 1 cm onion
    ingredients: [ing("chicken-thigh", 400), ing("kidney-beans", 240, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 200, { role: "other" }), ing("paprika", 3), ing("onion", 150, { note: "about 1 onion" }), ing("olive-oil", 5), ing("garlic", 10, { note: "about 2 cloves" }), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Cut the chicken: Cut each chicken thigh in half and pat the pieces dry with kitchen paper. Wash your hands, the knife and the board in hot soapy water.",
      "Marinate the chicken: Toss the chicken in a bowl with the oil, half the paprika, half the garlic, the salt and the black pepper. Leave it for 10 minutes, or for more flavour up to a few hours, covered in the fridge if longer than 30 minutes.",
      "Chop the onion: Peel the onion, cut it in half and lay each half flat side down so it doesn't slip. Chop it into pieces about 1 cm.",
      "Rinse the beans: Drain the kidney beans in a sieve over the sink, rinse them under cold water and leave them to drain.",
      "Brown the chicken: Heat a large, deep non-stick pan with a lid on a medium-high heat for 2 minutes. Add the chicken in one layer, spaced apart (two batches if your pan is small). Leave for 3 to 4 minutes without stirring, until dark golden underneath.",
      "Turn the chicken: Turn the pieces and cook for 2 to 3 minutes more, until dark golden and charred in places. Lift them onto a clean plate: they finish cooking with the rice.",
      "Soften the onion: Add the onion and a splash of water to the pan, scraping up the brown bits, and cook for 5 minutes, stirring now and then, until soft and sweet.",
      "Add the paprika: Stir in the rest of the garlic and paprika and cook for 1 minute, stirring all the time, until you can smell them. Add a splash of water if it catches.",
      "Add the rice and liquid: Add the rice, chopped tomatoes, drained beans and 400 ml of water. Stir well, scraping the bottom of the pan, and bring it to the boil over a high heat, which takes about 4 minutes.",
      "Simmer with the lid on: Sit the chicken and any juices on top of the rice. Turn the heat down low, put the lid on and simmer gently for 20 minutes. After 10 minutes, run a spoon round the edge so the rice doesn't stick.",
      "Check the chicken: Cut into the thickest part of the biggest piece. It should be white all the way through and piping hot with no pink left. If not, simmer with the lid on for 3 to 5 minutes more.",
      "Check the rice: Taste a few grains with a clean spoon to check they're soft and most of the liquid is soaked up. If hard, add a splash of boiling water and cover for 3 to 5 minutes more. If too wet, cook uncovered for a few minutes.",
      "Serve: Take the pan off the heat. Spoon the rice and beans into warm bowls and put the chicken on top. Serve straight away while it's hot.",
    ],
  },
];
