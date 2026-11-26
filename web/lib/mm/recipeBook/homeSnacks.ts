import { ing, type Recipe } from "../recipes";

// Snacks and bakes to make at home (founder 2026-11-26: "also have like protein flapjack etc recipes ones that people may just want to cook at home also"), and
// snacks for Meal plan's snack slots, which had only four recipes that fitted a snack's size and protein (docs/RECIPE_COVERAGE_2026-11-26.md). Most are built on
// yogurt, cottage cheese, eggs or tofu, so a snack can carry a share of the day's protein, and several are vegan, nut-free or milk-free. The protein powder
// bakes and the edamame snacks first written here were left out the same day: no small shop in the judges' view stocks either (lib/mm/localRange.ts); the
// cottage cheese pancakes and the yogurt bark in snacks.ts are the powder-free ones. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const HOME_SNACKS: readonly Recipe[] = [
  {
    id: "cottage-cheese-spinach-egg-muffins", meal: "snack", tags: ["Bake", "Make ahead", "Savoury"], name: "Cottage cheese and spinach egg muffins", blurb: "Little baked egg muffins with cottage cheese, spinach, pepper and cheddar.", servings: 6, minutes: 35,
    ingredients: [ing("eggs", 360, { note: "about 6 eggs" }), ing("cottage-cheese", 200), ing("spinach", 80), ing("peppers", 80, { note: "about ½ a pepper" }), ing("cheddar", 40), ing("oil-spray", 1), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 180°C (160°C fan, gas 4). Spray the holes of a 12-hole muffin tin well with oil, or line them with paper cases.",
      "Chop the vegetables: Chop the spinach roughly. Scoop the seeds and white inside out of the pepper and chop it into small dice. Grate the cheddar.",
      "Whisk the eggs: Crack the eggs into a large jug, add the cottage cheese and some black pepper, and whisk with a fork until well mixed. Wash your hands after touching raw eggs.",
      "Fill the tin: Share the spinach and pepper between the holes, then pour in the egg mix until each is about three quarters full. Scatter the cheddar on top.",
      "Bake: Bake on the middle shelf for 18 to 22 minutes, until risen, golden on top and set in the middle. A knife pushed into the centre should come out with no runny egg.",
      "Cool and serve: Leave them in the tin for 5 minutes, then run a knife round each one and lift it out. Eat warm or cold. Keep them covered in the fridge for up to 3 days.",
    ],
  },
  {
    id: "whipped-cottage-cheese-dip-sticks", meal: "snack", tags: ["No cook", "Savoury"], name: "Whipped cottage cheese dip with cucumber and pepper sticks", blurb: "Smooth, creamy cottage cheese with lemon and paprika, for crunchy vegetable sticks.", servings: 3, minutes: 10,
    ingredients: [ing("cottage-cheese", 250), ing("lemon-juice", 10), ing("olive-oil", 5), ing("paprika", 1), ing("black-pepper", 1), ing("cucumber", 200), ing("peppers", 240, { note: "about 1½ peppers" })],
    method: [
      "Whip the cottage cheese: Put the cottage cheese, lemon juice and some black pepper in a tall jug and blend with a stick blender for about 1 minute, until smooth. No blender? Mash it hard with a fork instead.",
      "Finish the dip: Spoon it into a small bowl, swirl the top with the back of the spoon, drizzle over the oil and dust with a pinch of paprika.",
      "Cut the cucumber: Rinse the cucumber, cut off the ends and cut it into pieces about 7 cm long. Halve each piece lengthways, then cut it into sticks about as thick as your finger.",
      "Cut the peppers: Rinse the peppers, cut them in half and scoop out the seeds and white inside. Slice each half into strips about as wide as your finger.",
      "Serve: Put the bowl on a large plate, arrange the sticks around it and serve straight away. Keep any leftover dip covered in the fridge and eat it within 2 days.",
    ],
  },
  {
    id: "cucumber-garlic-yogurt-dip-carrots", meal: "snack", tags: ["No cook", "Savoury"], name: "Cucumber and garlic yogurt dip with carrot sticks", blurb: "A thick, cool yogurt dip with grated cucumber, garlic and lemon, for carrot and pepper sticks.", servings: 3, minutes: 15,
    ingredients: [ing("greek-yogurt", 300, { role: "protein" }), ing("cucumber", 150), ing("garlic", 5, { note: "about 1 clove" }), ing("lemon-juice", 10), ing("olive-oil", 5), ing("salt", 1), ing("black-pepper", 1), ing("carrots", 200, { note: "about 2 carrots" }), ing("peppers", 160, { note: "about 1 pepper" })],
    method: [
      "Grate the cucumber: Rinse the cucumber and grate half of it on the large holes of a grater. Squeeze the grated cucumber hard in your hands over the sink to get rid of the water.",
      "Make the dip: Stir the grated cucumber, garlic, lemon juice and a pinch of salt and black pepper into the yogurt. Taste it and add a little more lemon if you like.",
      "Cut the carrots: Peel the carrots and cut off the tops. Cut them into pieces about 7 cm long, halve them lengthways, then cut them into sticks about as thick as your finger.",
      "Cut the rest: Cut the rest of the cucumber into sticks the same size. Cut the pepper in half, scoop out the seeds and white inside, and slice it into strips.",
      "Serve: Spoon the dip into a bowl, drizzle with the oil and serve with the sticks around it. Keep any leftover dip covered in the fridge for up to 2 days.",
    ],
  },
  {
    id: "tuna-sweetcorn-cucumber-boats", meal: "snack", tags: ["No cook", "Savoury"], name: "Tuna and sweetcorn cucumber boats", blurb: "Cucumber halves filled with tuna, sweetcorn, lemon and black pepper.", servings: 2, minutes: 10,
    ingredients: [ing("tuna", 102), ing("sweetcorn", 60), ing("lemon-juice", 10), ing("olive-oil", 5), ing("black-pepper", 1), ing("cucumber", 300, { note: "about 1 cucumber" })],
    method: [
      "Drain the tuna: Tip the tuna into a sieve and press it with a spoon to squeeze out as much water as you can. Drain the sweetcorn too if it is tinned.",
      "Mix the filling: Flake the tuna into a bowl with a fork. Stir in the sweetcorn, lemon juice, oil and a good pinch of black pepper.",
      "Hollow the cucumber: Rinse the cucumber, cut off the ends and cut it in half lengthways. Run a teaspoon down the middle of each half to scoop out the seeds, making two long boats.",
      "Fill and cut: Pile the tuna filling into the boats and press it down lightly. Cut each boat across into pieces about 5 cm long.",
      "Serve: Serve straight away, while the cucumber is crisp. If you are taking them out, keep the filling and cucumber apart and fill them just before eating.",
    ],
  },
  {
    id: "crispy-soy-paprika-tofu-bites", meal: "snack", tags: ["Vegan", "Savoury", "Make ahead"], name: "Crispy soy and paprika tofu bites", blurb: "Cubes of tofu baked until crisp and golden with soy sauce and smoky paprika.", servings: 3, minutes: 40,
    ingredients: [ing("tofu", 280), ing("soy", 15), ing("paprika", 2), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Heat the oven: Turn the oven on to 200°C (180°C fan, gas 6). Line a baking tray with baking paper.",
      "Press the tofu: Drain the tofu, wrap it in a clean tea towel and put something heavy, like a pan, on top for 10 minutes to squeeze out the water.",
      "Cut the tofu: Unwrap the tofu and cut it into cubes about 2 cm across.",
      "Coat the cubes: Put the soy sauce, oil, paprika and a pinch of black pepper in a bowl. Add the tofu and turn the cubes gently until they are coated all over.",
      "Bake: Spread the cubes out on the tray with a gap between them. Bake for 25 minutes, turning them halfway, until golden and crisp at the edges.",
      "Serve: Leave them on the tray for 5 minutes to crisp up more, then serve warm or cold. Keep any left over covered in the fridge for up to 3 days.",
    ],
  },
  {
    id: "peanut-butter-yogurt-dip-apple", meal: "snack", tags: ["No cook", "Sweet", "Quick"], name: "Peanut butter yogurt dip with apple slices", blurb: "Creamy yogurt swirled with peanut butter and cinnamon, for crisp apple slices.", servings: 2, minutes: 5,
    ingredients: [ing("greek-yogurt", 200, { role: "protein" }), ing("peanut-butter", 30), ing("cinnamon", 1), ing("apple", 300, { note: "about 2 apples" })],
    method: [
      "Make the dip: Stir the peanut butter and cinnamon into the yogurt in a small bowl until smooth. If the peanut butter is stiff, warm it in a cup of hot water first.",
      "Slice the apples: Rinse the apples, cut them into quarters and cut out the cores. Cut each quarter into thin slices, skin and all.",
      "Stop them browning: If you aren't eating them straight away, toss the slices in a bowl of cold water for a minute, then drain them.",
      "Serve: Fan the apple slices around the bowl of dip and serve straight away.",
    ],
  },
  {
    id: "banana-raisin-baked-oat-cups", meal: "snack", tags: ["Bake", "Make ahead", "Sweet"], name: "Banana and raisin baked oat cups", blurb: "Soft baked cups of oats, banana, yogurt, egg and raisins.", servings: 6, minutes: 35,
    // the yogurt, egg and banana hold the oats together, so they follow the oats when the cups are fitted
    ingredients: [ing("oats", 150, { role: "carb" }), ing("greek-yogurt", 150, { follows: "oats" }), ing("eggs", 180, { note: "about 3 eggs", follows: "oats" }), ing("banana", 240, { note: "about 2 bananas", follows: "oats" }), ing("raisins", 40), ing("honey", 20), ing("cinnamon", 2), ing("oil-spray", 1)],
    method: [
      "Heat the oven: Turn the oven on to 180°C (160°C fan, gas 4). Spray the holes of a 12-hole muffin tin well with oil, or line them with paper cases.",
      "Mash the bananas: Peel the bananas and mash them in a large bowl with a fork until smooth.",
      "Mix the wet things: Crack in the eggs, then add the yogurt, honey and cinnamon. Whisk with the fork until well mixed. Wash your hands after touching raw eggs.",
      "Add the oats: Stir in the oats and most of the raisins until there are no dry oats left.",
      "Fill the tin: Spoon the mixture into the holes, filling each almost to the top, and press the rest of the raisins into the tops.",
      "Bake: Bake on the middle shelf for 20 minutes, until golden on top, firm to touch and set in the middle. A knife pushed into one should come out clean.",
      "Cool and serve: Leave them in the tin for 10 minutes, then lift them out. Eat warm or cold. Keep them in a box with a lid in the fridge for up to 3 days.",
    ],
  },
  {
    id: "cottage-cheese-tomato-toast", meal: "snack", tags: ["Quick", "Savoury"], name: "Cottage cheese and tomato on toast", blurb: "Wholemeal toast piled with cottage cheese, sliced tomato and black pepper.", servings: 2, minutes: 5,
    ingredients: [ing("bread", 80, { note: "about 2 slices" }), ing("cottage-cheese", 150), ing("tomatoes", 170, { note: "about 2 tomatoes" }), ing("olive-oil", 5), ing("black-pepper", 1)],
    method: [
      "Toast the bread: Toast the bread until golden brown on both sides.",
      "Slice the tomatoes: Rinse the tomatoes, cut out the hard core at the top and cut them into thin slices.",
      "Top the toast: Spread the cottage cheese thickly over the hot toast and lay the tomato slices on top, overlapping them a little.",
      "Finish and serve: Drizzle over the oil, grind over plenty of black pepper and serve straight away.",
    ],
  },
  {
    id: "mixed-berry-soya-smoothie", meal: "snack", tags: ["Quick", "Vegan", "Sweet"], name: "Mixed berry and soya smoothie", blurb: "A thick purple smoothie of berries, banana, oats and soya drink.", servings: 2, minutes: 5,
    ingredients: [ing("soya-drink", 300), ing("berries", 150), ing("banana", 60, { note: "about ½ a banana" }), ing("oats", 20, { role: "carb" })],
    method: [
      "Get the fruit ready: Peel the banana and break it into chunks. Use the berries straight from the freezer for a thick, cold smoothie.",
      "Blend: Put the berries, banana, oats and soya drink in a blender or a tall jug. Blend for about 1 minute with the blender or a stick blender, until completely smooth.",
      "Check it: If it is too thick, add a splash more soya drink and blend again for a few seconds.",
      "Serve: Pour into glasses and drink straight away, before the oats thicken it.",
    ],
  },
  {
    id: "ham-cottage-cheese-pepper-cups", meal: "snack", tags: ["No cook", "Savoury", "Quick"], name: "Ham and cottage cheese pepper cups", blurb: "Crunchy pepper pieces filled with cottage cheese and topped with ham.", servings: 2, minutes: 10,
    ingredients: [ing("peppers", 320, { note: "about 2 peppers" }), ing("cottage-cheese", 150), ing("ham", 60), ing("black-pepper", 1)],
    method: [
      "Cut the peppers: Rinse the peppers, cut them into quarters from top to bottom and cut away the stalk, seeds and white inside, leaving little boat-shaped cups.",
      "Chop the ham: Cut the ham into thin strips about as wide as a pencil.",
      "Fill the cups: Spoon the cottage cheese into the pepper cups and spread it out to the edges.",
      "Serve: Lay the ham strips over the cheese, grind over some black pepper and serve straight away, while the peppers are crisp.",
    ],
  },
];

export const HOME_SNACKS_LOOKS: Readonly<Record<string, string>> = {
  "cottage-cheese-spinach-egg-muffins": "Six golden baked egg muffins on a white plate, their puffed tops flecked with dark green spinach and small red pepper pieces under melted orange cheddar, one broken open to show soft white curds of cottage cheese in the set egg.",
  "whipped-cottage-cheese-dip-sticks": "A small white bowl of smooth, creamy white dip swirled on top with a thin pool of golden olive oil and a dusting of red paprika, surrounded on a large plate by pale green cucumber sticks and bright red and yellow pepper strips.",
  "cucumber-garlic-yogurt-dip-carrots": "A white bowl of thick white yogurt dip speckled with pale green grated cucumber and drizzled with golden olive oil, beside neat piles of bright orange carrot sticks, cucumber sticks and red pepper strips on a white plate.",
  "tuna-sweetcorn-cucumber-boats": "Short pieces of cucumber halved lengthways and hollowed out, laid in two rows on a white plate, each heaped with flaked pale pink tuna and bright yellow sweetcorn kernels, speckled with cracked black pepper.",
  "crispy-soy-paprika-tofu-bites": "Golden-brown cubes of crisp baked tofu with darker toasted edges, dusted with red paprika and glazed with soy, piled in a shallow white bowl.",
  "peanut-butter-yogurt-dip-apple": "A small white bowl of thick pale yogurt swirled with golden-brown peanut butter and dusted with cinnamon, surrounded by a fan of thin red and green apple slices with their skins on, on a round white plate.",
  "banana-raisin-baked-oat-cups": "Six round baked oat cups on a white plate, golden-brown and domed, with dark raisins pressed into their tops and one broken open to show a soft, moist banana and oat inside.",
  "cottage-cheese-tomato-toast": "Two slices of wholemeal toast on a white plate, each covered with creamy white cottage cheese and overlapping thin slices of red tomato, drizzled with olive oil and scattered with cracked black pepper.",
  "mixed-berry-soya-smoothie": "Two tall glasses of thick, deep purple berry smoothie seen from straight above, the creamy round tops filling each glass, with a few whole red and purple mixed berries resting on the surface.",
  "ham-cottage-cheese-pepper-cups": "Quartered red and yellow pepper cups on a white plate, each filled with creamy white cottage cheese and topped with thin pink strips of ham and cracked black pepper.",
};
