import { ing, type Recipe } from "../recipes";

// Snacks and sweet things. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const SNACKS: readonly Recipe[] = [
  {
    id: "peanut-butter-oat-bites", meal: "snack", tags: ["Make ahead", "No cook"], name: "Peanut butter oat bites", blurb: "Little no-bake bites for the week.", servings: 6, minutes: 15,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of salt with the oats, to bring out the peanut butter and honey
    ingredients: [ing("oats", 100, { role: "carb" }), ing("peanut-butter", 100), ing("honey", 50), ing("raisins", 40), ing("cinnamon", 1), ing("salt", 1)],
    method: [
      "Get ready: Line a large plate or a small tray with baking paper, so the bites won't stick.",
      "Mix the oats: Stir the oats, cinnamon and a pinch of salt together in a large bowl. Add the peanut butter and honey and stir hard for 2 to 3 minutes, until no dry oats are left and it looks thick and sticky.",
      "Add the raisins: Mix in the raisins. If the mixture is too crumbly, stir in a few drops of water at a time, until it holds together when you squeeze some in your fist.",
      "Roll into balls: With damp hands, roll spoonfuls of the mixture into balls about 3 cm across. Put them on the paper with a small gap between them.",
      "Chill: Put the tray in the fridge for 30 minutes, until the bites feel firm when you press one gently.",
      "Serve: Serve them cold from the fridge. Keep any left over in a covered box in the fridge and eat them within 5 days.",
    ],
  },
  {
    id: "houmous-veg-sticks", meal: "snack", tags: ["No cook", "Savoury"], name: "Houmous with vegetable sticks", blurb: "Crunchy carrot, cucumber and pepper sticks to dip in houmous.", servings: 2, minutes: 10,
    ingredients: [ing("houmous", 100), ing("carrots", 100, { note: "about 1 carrot" }), ing("cucumber", 150), ing("peppers", 160, { note: "about 1 pepper" })],
    method: [
      "Wash the vegetables: Rinse the carrot, cucumber and pepper under the cold tap and pat them dry. Put a damp cloth under your chopping board so it can't slip.",
      "Cut the carrot: Peel the carrot and cut off the top. Cut it into pieces about 7 cm long and halve them lengthways. Lay them flat side down and cut into sticks about as thick as your finger.",
      "Cut the cucumber: Cut off the ends and cut the cucumber into pieces about 7 cm long. Halve each piece lengthways, then cut it into sticks about as thick as your finger.",
      "Cut the pepper: Slice off the top, cut the pepper in half and scoop out the seeds and white inside. Slice each half into strips about as wide as your finger.",
      "Serve: Spoon the houmous into a small bowl on a large plate. Arrange the sticks around it and serve straight away, while they are crisp.",
    ],
  },
  {
    id: "honey-almond-yogurt-pots", meal: "snack", tags: ["No cook", "Sweet"], name: "Honey and almond yogurt pots", blurb: "Thick yogurt with crunchy almonds and a drizzle of honey.", servings: 2, minutes: 5,
    ingredients: [ing("greek-yogurt", 300, { role: "protein" }), ing("almonds", 30), ing("honey", 20)],
    method: [
      "Chop the almonds: Chop the almonds roughly, cutting each one into three or four bits. Keep the fingers of your other hand curled away from the blade.",
      "Fill the pots: Spoon the yogurt into small glasses, jars or bowls and smooth the tops with the back of the spoon.",
      "Add the almonds: Scatter the almonds over the yogurt. If you aren't eating the pots straight away, add them just before you do, so they stay crunchy.",
      "Drizzle the honey: Drizzle the honey over in a thin stream. If it is too thick to pour, stand the jar in a bowl of warm water for a couple of minutes first.",
      "Serve: Eat straight away, or cover the pots and keep them in the fridge for up to a day.",
    ],
  },
  {
    id: "frozen-yogurt-berry-bark", meal: "snack", tags: ["Make ahead", "Sweet"], name: "Frozen yogurt and berry bark", blurb: "A tray of frozen yogurt and berries, snapped into pieces.", servings: 4, minutes: 15,
    ingredients: [ing("greek-yogurt", 400, { role: "protein" }), ing("berries", 150), ing("honey", 30)],
    method: [
      "Line the tray: Clear a flat space in the freezer. Line a small baking tray that fits there with baking paper, pressing it into the corners.",
      "Mix in the honey: Stir the honey into the yogurt in a mixing bowl for about 1 minute, until there are no streaks left. If the honey is thick, warm the jar in a bowl of warm water first.",
      "Spread the yogurt: Spread the yogurt over the paper with the back of the spoon in an even layer about 1 cm thick. It doesn't need to reach the edges.",
      "Add the berries: Scatter the berries over, straight from the freezer if they are frozen. Press each one gently into the yogurt with a fingertip.",
      "Freeze: Keep the tray flat and freeze it for at least 3 hours, until firm all the way through and the middle doesn't dent when pressed.",
      "Break and serve: Lift the bark out, peel off the paper and break it into pieces about the size of a biscuit. Leave a piece for a minute before eating. Keep the rest in a box with a lid in the freezer.",
    ],
  },
  {
    id: "ham-soft-cheese-roll-ups", meal: "snack", tags: ["No cook", "Savoury"], name: "Ham and soft cheese roll-ups", blurb: "Slices of ham rolled around soft cheese and crunchy cucumber.", servings: 2, minutes: 10,
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): one thick cucumber stick in each roll, as in the photo
    ingredients: [ing("ham", 120), ing("soft-cheese", 60), ing("cucumber", 100)],
    method: [
      "Cut the cucumber: Rinse the cucumber, cut off the ends and cut it into pieces as long as the ham slices are wide. Cut each into sticks about 2 cm thick and pat them dry.",
      "Lay out the ham: Lay the ham slices flat on a clean board, side by side, gently peeling apart any that are stuck together.",
      "Spread the cheese: Spread a thin layer of soft cheese over each slice with a teaspoon or butter knife, leaving about 1 cm clear round the edge.",
      "Roll them up: Lay one cucumber stick along one edge of each slice and roll the ham up tightly around it. The cheese holds it closed.",
      "Serve: Put the roll-ups on a plate with the join underneath. Eat straight away, or cover them, keep them in the fridge and eat them the same day.",
    ],
  },
  {
    id: "devilled-eggs", meal: "snack", tags: ["Make ahead", "Savoury"], name: "Devilled eggs", blurb: "Halved boiled eggs with a creamy, peppery filling.", servings: 2, minutes: 30,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("light-mayo", 30), ing("paprika", 2), ing("salt", 1), ing("black-pepper", 1)],
    method: [
      "Boil the water: Pour boiling water from the kettle into a medium saucepan until it is two-thirds full and bring it back to the boil on a high heat. Fill a large bowl with cold water.",
      "Boil the eggs: Lower in the eggs one at a time on a spoon. When the water bubbles again, turn to medium and boil for 9 minutes, until the whites and yolks are completely set. Wash your hands after touching raw eggs.",
      "Cool and peel: Move the eggs into the cold water for 5 minutes. Tap and roll each one to crack the shell all over, then peel it and rinse off any bits.",
      "Halve the eggs: Cut each egg in half lengthways. The whites and yolks should be completely set. If one is runny, boil its halves for 2 to 3 minutes more and cool them.",
      "Make the filling: Scoop the yolks into a bowl and mash them with a fork. Stir in the mayonnaise, a pinch of salt and some black pepper until smooth, adding a few drops of water if it is too stiff.",
      "Fill and serve: Spoon the filling back into the whites with two teaspoons and sprinkle a pinch of paprika on each. Serve straight away, or cover and keep them in the fridge for up to a day.",
    ],
  },
  {
    id: "tuna-chickpea-dip", meal: "snack", tags: ["No cook", "Savoury"], name: "Tuna and chickpea dip", blurb: "A creamy tuna and chickpea dip with lemon, for vegetable sticks.", servings: 3, minutes: 10,
    // 2026-11-21 (founder: "Nothing should be plain"): a pinch of cumin mashed into the chickpeas, as in houmous
    // 2026-11-22 (founder 21 Nov: "accurate exactly to how the photo looks"): green flecks all through the dip, with tuna flakes and spring onion rings on top, as in the photo
    ingredients: [ing("tuna", 102), ing("chickpeas", 130), ing("olive-oil", 10), ing("carrots", 100, { note: "about 1 carrot" }), ing("cucumber", 120), ing("peppers", 160, { note: "about 1 pepper" }), ing("lemon-juice", 10), ing("spring-onions", 30), ing("black-pepper", 1), ing("cumin", 1)],
    method: [
      "Drain the chickpeas and tuna: Rinse the chickpeas in a sieve and leave them to drain. Tip the tuna into a second sieve and press it with a spoon to squeeze out as much water as you can.",
      "Mash the chickpeas: Put the chickpeas in a large bowl with the oil, lemon juice, cumin and a splash of cold water. Mash with a fork for 2 to 3 minutes, until it looks like a thick, rough paste.",
      "Slice the spring onions: Trim the spring onions. Slice the white parts thinly into rings and chop the green tops very finely, keeping your fingers curled away from the blade.",
      "Mix the dip: Stir in the tuna and the chopped green tops, keeping back a few flakes of tuna and the spring onion rings. Break up the tuna until the dip holds its shape on a spoon. Stir in a pinch of black pepper.",
      "Cut the sticks: Rinse the vegetables. Peel the carrot, then cut it and the cucumber into sticks about 7 cm long and as thick as your finger. Cut the pepper in half, scoop out the seeds and slice it into strips.",
      "Serve: Spoon the dip into a small bowl, scatter the tuna flakes and spring onion rings you kept over the top and arrange the sticks around it. Serve straight away. Keep any leftover dip covered in the fridge and eat it within a day.",
    ],
  },
  {
    id: "smoked-salmon-cucumber-bites", meal: "snack", tags: ["No cook", "Savoury"], name: "Smoked salmon cucumber bites", blurb: "Cucumber rounds topped with soft cheese and smoked salmon.", servings: 2, minutes: 10,
    ingredients: [ing("smoked-salmon", 100), ing("soft-cheese", 60), ing("cucumber", 150), ing("lemon-juice", 10), ing("black-pepper", 1)],
    method: [
      "Slice the cucumber: Rinse the cucumber, cut off the ends and cut it into rounds about 1 cm thick. Lay them on a board and pat the tops dry with kitchen paper.",
      "Spread the cheese: Spread a small spoonful of soft cheese over each round, out to the edge, in a thin, even layer.",
      "Cut the salmon: Cut or tear the smoked salmon into pieces about as wide as a cucumber round, gently peeling apart any slices that are stuck together.",
      "Top the bites: Fold a piece of salmon on to the cheese on each round, gathering it into a loose ruffle, and press it down lightly.",
      "Add lemon and black pepper: Sprinkle a few drops of lemon juice over each bite and finish with a tiny pinch of black pepper. Taste one and add more to the rest if you like.",
      "Serve: Put the bites on a plate and serve straight away, while the cucumber is crisp and the salmon is cold.",
    ],
  },
  {
    id: "crispy-spiced-chickpeas", meal: "snack", tags: ["Make ahead", "Savoury"], name: "Crispy spiced chickpeas", blurb: "Oven-roasted chickpeas with paprika and cumin.", servings: 3, minutes: 40,
    ingredients: [ing("chickpeas", 240), ing("olive-oil", 10), ing("paprika", 2), ing("cumin", 2), ing("salt", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6), with a shelf in the middle.",
      "Dry the chickpeas: Rinse the chickpeas in a sieve and leave them to drain. Pat them as dry as you can on a clean tea towel and throw away any loose skins.",
      "Coat with spices: Stir the chickpeas in a bowl with the oil, paprika, cumin and a pinch of salt until evenly coated. Spread them in a single layer on a baking tray, scraping on any spice left in the bowl.",
      "Roast: Roast on the middle shelf for 25 to 30 minutes. Halfway through, take the tray out with oven gloves, shake it and put it back.",
      "Check them: They are ready when they are golden, look dry and rattle on the tray. If they are still pale or soft, roast for 3 to 5 minutes more, watching so they don't burn.",
      "Cool and serve: Turn the oven off and leave them on the tray for 5 minutes, to turn crunchier. Eat warm or cold. Keep cold leftovers in a jar with the lid loose and eat within two days.",
    ],
  },
  {
    id: "paprika-roasted-almonds", meal: "snack", tags: ["Make ahead", "Savoury"], name: "Paprika roasted almonds", blurb: "Whole almonds roasted with paprika and a pinch of salt.", servings: 4, minutes: 20,
    ingredients: [ing("almonds", 100), ing("olive-oil", 5), ing("paprika", 2), ing("salt", 1)],
    method: [
      "Heat the oven: Turn the oven on to 180°C (160°C fan, gas 4), with a shelf in the middle.",
      "Coat the almonds: Stir the almonds with the oil, paprika and a pinch of salt in a bowl for about 1 minute, until evenly coated. Spread them in a single layer on a baking tray, adding any spice left in the bowl.",
      "Roast: Roast on the middle shelf for 10 to 12 minutes. Halfway through, take the tray out with oven gloves, shake it and put it back.",
      "Watch the end: Watch them closely for the last 3 minutes, as they burn quickly. They are ready when they smell toasty and look a shade darker, and a cooled one is light golden inside.",
      "Cool: Take the tray out with oven gloves, turn the oven off and leave the almonds on the tray for 5 minutes, until they turn crunchy.",
      "Serve: Tip them into a bowl and serve. A small handful is a serving. Keep cold leftovers in a sealed jar for up to two weeks.",
    ],
  },
  {
    // The id is kept from the earlier bean version (saved recipes refer to it). The beans were taken out so it isn't lunch's
    // cheese-bean-quesadillas again in a smaller portion.
    id: "cheese-bean-quesadilla-wedges", meal: "snack", tags: ["Quick", "Savoury"], name: "Cheese and salsa quesadilla wedges", blurb: "Toasted wraps filled with salsa and melted cheese, cut into wedges.", servings: 4, minutes: 15,
    ingredients: [ing("wraps", 120), ing("cheddar", 80), ing("salsa", 60), ing("spring-onions", 30), ing("chilli-powder", 1)],
    method: [
      "Prepare the filling: Grate the cheese. Trim the spring onions and slice them thinly into rings, about as thick as a pound coin.",
      "Fill the wraps: Spread the salsa over one half of each wrap, leaving about 2 cm clear at the edge. Scatter the cheese and spring onions over it and add a small pinch of chilli powder.",
      "Fold them: Fold the empty half of each wrap over the filling to make a half-moon and press down gently.",
      "Toast the first side: Heat a large dry non-stick frying pan over a medium heat. Lay in as many wraps as fit flat and cook for 2 to 3 minutes, until golden brown underneath.",
      "Toast the second side: Turn them over with a fish slice and cook for 2 to 3 minutes, pressing gently, until golden and the cheese has melted. Turn the heat down if they brown too fast. Cook the rest the same way.",
      "Cut and serve: Leave them on a board for 1 minute, as the cheese is very hot, then cut each into 3 or 4 wedges. Serve straight away.",
    ],
  },
];
