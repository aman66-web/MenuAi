import { ing, type Recipe } from "../recipes";

// Everyday British breakfasts (founder 2026-11-20: "you can't give someone ... smoked salmon ... kedgeree ... for, like, breakfast. That doesn't make any sense.
// No, maybe add some more breakfast items"): toast and what goes on it, a grilled full English, a toastie, eggy bread, a smoothie and a porridge, the breakfasts
// most people in the UK actually make. The toast is the pantry's wholemeal sliced bread, counted by the slice (40 g; "about 4 slices"), the same number of
// slices for each person. See lib/mm/recipeBook/index.ts for the rules every recipe follows.

export const EVERYDAY_BREAKFAST: readonly Recipe[] = [
  {
    id: "cheesy-beans-on-toast", meal: "breakfast", tags: ["Quick", "British"], name: "Cheesy beans on toast", blurb: "Hot baked beans on wholemeal toast with grated cheddar melting on top.", servings: 2, minutes: 10,
    // the beans are the dish, so a bigger or smaller meal moves them with the toast (at most half as many again: a tin and a half)
    ingredients: [ing("baked-beans", 400, { role: "protein", fit: [0.5, 1.5] }), ing("bread", 160), ing("cheddar", 40), ing("black-pepper", 1)],
    method: [
      "Grate the cheese: Grate the cheddar on the fine side of a grater on to a plate and keep it beside the hob.",
      "Warm the beans: Tip the beans into a small saucepan and warm them on a medium heat for 4 to 5 minutes, stirring now and then, until bubbling and steaming hot.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, turning it once under the grill, until golden and crisp.",
      "Season the beans: Take the beans off the heat and stir in a good grind of black pepper.",
      "Serve: Put the hot toast on warm plates, spoon the beans over and scatter the cheese on top so it starts to melt. Eat straight away.",
    ],
  },
  {
    id: "scrambled-eggs-on-toast", meal: "breakfast", tags: ["Eggs", "Quick"], name: "Scrambled eggs on toast", blurb: "Soft, creamy scrambled eggs piled on wholemeal toast.", servings: 2, minutes: 10,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("milk", 30), ing("bread", 160), ing("black-pepper", 1)],
    method: [
      "Beat the eggs: Crack the eggs into a jug, picking out any shell. Add the milk and black pepper and beat with a fork for 30 seconds, until no streaks of white are left. Wash your hands after handling raw eggs.",
      "Warm the pan: Put a non-stick saucepan on a low heat for 1 minute. Keep the heat low the whole time, so the eggs stay soft and don't turn rubbery.",
      "Start the eggs: Pour in the eggs and leave them for about 20 seconds, until the edges start to set. Then stir slowly with a wooden spoon, pushing the egg from the edges into the middle.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Finish the eggs: Keep stirring the eggs slowly for 3 to 4 minutes, until just set but still soft, with no runny egg white left. Take the pan off the heat straight away.",
      "Serve: Put the toast on warm plates and spoon the eggs on top. Serve straight away, before the eggs go dry.",
    ],
  },
  {
    id: "poached-eggs-spinach-toast", meal: "breakfast", tags: ["Eggs", "Brunch"], name: "Poached eggs and spinach on toast", blurb: "Soft poached eggs on wilted spinach and wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("spinach", 100), ing("bread", 160), ing("black-pepper", 1)],
    method: [
      "Get ready: Boil the kettle. Rinse the spinach unless the bag says it is ready washed, pull off any tough stalks and shake it dry.",
      "Heat the water: Pour hot water from the kettle into a wide, deep frying pan to about 3 cm deep and put it on a medium heat. When small bubbles rise, turn it down low so it simmers gently, never boiling hard.",
      "Add the eggs: Crack each egg into a cup, hold it close to the water and slide it in gently, spacing them well apart. Wash your hands after handling raw eggs.",
      "Poach the eggs: Poach for 3 to 4 minutes without stirring, until the whites are completely set with no runny white left and the yolks are still soft. Cook 1 to 2 minutes more for firmer yolks.",
      "Wilt the spinach: Meanwhile, put the spinach in a saucepan with a splash of water and stir on a medium heat for 1 to 2 minutes, until soft and dark green. Drain off the water.",
      "Toast the bread: At the same time, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Put the toast on warm plates and pile the spinach on top. Lift each egg out with a slotted spoon, rest it on kitchen paper for a few seconds, lay it on the spinach and add a grind of black pepper.",
    ],
  },
  {
    id: "boiled-eggs-toast-soldiers", meal: "breakfast", tags: ["Eggs", "Quick", "British"], name: "Boiled eggs with toast soldiers", blurb: "Soft-boiled eggs with strips of wholemeal toast for dipping.", servings: 2, minutes: 12,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("bread", 160), ing("salt", 1)],
    method: [
      "Boil the water: Half-fill a small saucepan with hot water from the kettle and bring it to a gentle boil on a medium-high heat.",
      "Cook the eggs: Lower the eggs in gently one at a time on a spoon. Boil them for 6 minutes for set whites and soft, runny yolks, or 8 minutes for firm yolks. Wash your hands after handling raw eggs.",
      "Toast the bread: While the eggs cook, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Cut the soldiers: Cut each slice of toast into 4 or 5 long strips, about 2 cm wide, for dipping.",
      "Put the eggs in cups: Lift the eggs out with a spoon and stand each one in an egg cup. Take care, as the shells are very hot.",
      "Serve: Crack the top of each egg with a teaspoon, peel away a little shell and slice off the top. Sprinkle a pinch of salt on the yolk and dip in the soldiers.",
    ],
  },
  {
    id: "cheese-tomato-on-toast", meal: "breakfast", tags: ["Quick", "British"], name: "Cheese and tomato on toast", blurb: "Wholemeal toast topped with sliced tomato and bubbling grilled cheddar.", servings: 2, minutes: 10,
    ingredients: [ing("bread", 160), ing("cheddar", 60), ing("tomatoes", 160, { note: "about 2 tomatoes" }), ing("black-pepper", 1)],
    method: [
      "Heat the grill: Turn the grill on to a medium-high heat. Grate the cheddar on the coarse side of a grater. Wash the tomatoes and cut them into thin slices.",
      "Toast one side: Lay the bread on the grill rack and toast it for 1 to 2 minutes, until golden. Watch it closely, as it can burn quickly.",
      "Add the topping: Turn the slices over. Lay the tomato slices on the untoasted side, then scatter the cheese evenly over the top, right to the edges, so the crusts don't burn.",
      "Grill until bubbling: Grill for 2 to 3 minutes more, until the cheese has melted and is bubbling and golden in places. Lower the grill a little if it browns too fast.",
      "Serve: Lift the toast on to plates with a fish slice and add a grind of black pepper. Leave it for a minute before eating, as the cheese is very hot.",
    ],
  },
  {
    id: "peanut-butter-banana-toast", meal: "breakfast", tags: ["Quick", "Vegan", "Sweet"], name: "Peanut butter and banana on toast", blurb: "Warm wholemeal toast spread with peanut butter and topped with sliced banana.", servings: 1, minutes: 5,
    ingredients: [ing("bread", 80), ing("peanut-butter", 30), ing("banana", 120, { note: "about 1 banana" }), ing("cinnamon", 1)],
    method: [
      "Toast the bread: Toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Slice the banana: Meanwhile, peel the banana and cut it into thin rounds, about as thick as a pound coin.",
      "Spread the peanut butter: Stir the peanut butter well if it has separated in the jar. Spread it thinly over the warm toast, right to the edges.",
      "Add the banana: Lay the banana slices over the peanut butter in overlapping rows, pressing them down gently so they stay put.",
      "Finish and serve: Dust the cinnamon over the banana and eat straight away, while the toast is still warm.",
    ],
  },
  {
    id: "bacon-tomato-sandwich", meal: "breakfast", tags: ["Quick", "British"], name: "Bacon and tomato sandwich", blurb: "Grilled bacon and sliced tomato between slices of wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("bacon", 120), ing("bread", 160), ing("tomatoes", 160, { note: "about 2 tomatoes" }), ing("black-pepper", 1)],
    method: [
      "Heat the grill: Turn the grill on to a medium-high heat. Wash the tomatoes and cut them into slices about as thick as a pound coin.",
      "Grill the first side: Lay the bacon in a single layer on the grill rack and grill for 4 to 5 minutes, until it starts to brown. Wash your hands after handling raw bacon.",
      "Grill the second side: Turn the bacon over and grill for 4 to 5 minutes more, until browned. Lower the grill a little if it browns too fast.",
      "Check the bacon: Cut into the thickest piece. It should be cooked through, firm and piping hot in the middle. Move the bacon to a plate lined with kitchen paper.",
      "Toast the bread: Toast the bread in a toaster, or under the grill once the bacon is out, for 2 to 3 minutes, until golden on both sides. Switch the grill off.",
      "Fill the sandwiches: Lay half the toast on a board. Cover it with the bacon, then the tomato slices, and add a grind of black pepper.",
      "Serve: Put the rest of the toast on top, press down gently and cut each sandwich in half. Serve straight away, while the bacon is hot.",
    ],
  },
  {
    id: "grilled-full-english", meal: "breakfast", tags: ["Eggs", "Brunch", "British"], name: "Grilled full English breakfast", blurb: "Grilled bacon and tomatoes, fried eggs, mushrooms, baked beans and toast.", servings: 2, minutes: 25,
    ingredients: [ing("bacon", 120), ing("eggs", 120, { note: "about 2 eggs" }), ing("baked-beans", 400), ing("mushrooms", 200), ing("tomatoes", 160, { note: "about 2 tomatoes" }), ing("bread", 80), ing("oil-spray", 1), ing("black-pepper", 1)],
    method: [
      "Heat the grill: Turn the grill on to a medium-high heat. Wipe the mushrooms clean and slice them about as thick as a pound coin. Wash the tomatoes and cut them in half.",
      "Grill the bacon and tomatoes: Lay the bacon and the tomato halves, cut side up, in a single layer on the grill rack. Grill for 4 to 5 minutes, until the bacon starts to brown. Wash your hands after handling raw bacon.",
      "Turn the bacon: Turn the bacon over, leaving the tomatoes as they are, and grill for 4 to 5 minutes more, until the bacon is browned and the tomatoes are soft. Lower the grill if they brown too fast.",
      "Fry the mushrooms: Meanwhile, spray a large non-stick frying pan with the oil spray, away from any flame, and heat it on a medium-high heat. Fry the mushrooms for 5 minutes, stirring now and then, until golden and their liquid has gone.",
      "Warm the beans: At the same time, warm the beans in a small saucepan on a medium heat for 4 to 5 minutes, stirring now and then, until bubbling and steaming hot. Turn the heat down low.",
      "Add the eggs: Push the mushrooms to one side of the pan and turn the heat to medium. Crack each egg into a cup, then slide it into the pan. Wash your hands after handling raw eggs.",
      "Fry the eggs: Fry for 3 to 4 minutes, until the whites are completely set with no runny white left. If the tops are still clear, cover the pan for 30 to 60 seconds.",
      "Check the bacon: Take the bacon out and cut into the thickest piece. It should be cooked through and piping hot in the middle. Keep it warm on a plate with the tomatoes.",
      "Toast the bread: Toast the bread in a toaster, or under the grill once the bacon is out, for 2 to 3 minutes, until golden. Switch the grill off.",
      "Serve: Add a grind of black pepper to the eggs. Share the bacon, tomatoes, mushrooms, beans, eggs and toast between warm plates and serve straight away.",
    ],
  },
  {
    id: "ham-cheese-toastie", meal: "breakfast", tags: ["Quick"], name: "Ham and cheese toastie", blurb: "Wholemeal bread filled with ham and cheddar, toasted golden in a pan.", servings: 2, minutes: 12,
    ingredients: [ing("bread", 160), ing("ham", 80), ing("cheddar", 60), ing("oil-spray", 1)],
    method: [
      "Get the filling ready: Grate the cheddar on the coarse side of a grater. Tear the ham into pieces about 3 cm across.",
      "Fill the sandwiches: Lay half the bread on a board. Scatter over half the cheese, add the ham, then the rest of the cheese, leaving a small gap round the edges. Put the rest of the bread on top and press down firmly.",
      "Heat the pan: Spray a large non-stick frying pan with the oil spray, away from any flame, and heat it on a medium-low heat for 1 minute.",
      "Cook the first side: Put the sandwiches in the pan and press them down with a fish slice. Cook for 3 to 4 minutes, until the underside is golden brown.",
      "Cook the second side: Turn them over carefully with the fish slice and cook for 3 to 4 minutes more, pressing down, until golden brown and the cheese has melted. Turn the heat down if they brown too fast.",
      "Check and serve: Cut each toastie in half. The cheese should be melted all the way through and the ham piping hot. Leave it for a minute before eating, as the cheese is very hot.",
    ],
  },
  {
    id: "garlic-mushrooms-on-toast", meal: "breakfast", tags: ["Vegan", "Quick"], name: "Garlic mushrooms on toast", blurb: "Golden garlic mushrooms and spinach piled on wholemeal toast.", servings: 2, minutes: 15,
    ingredients: [ing("mushrooms", 300), ing("bread", 160), ing("spinach", 60), ing("garlic", 5, { note: "about 1 clove" }), ing("olive-oil", 10), ing("black-pepper", 1)],
    method: [
      "Get ready: Wipe the mushrooms clean, trim the dry stalk ends and slice them about as thick as a pound coin. Rinse the spinach unless the bag says it is ready washed.",
      "Fry the mushrooms: Heat the oil in a large non-stick frying pan on a medium-high heat. Add the mushrooms and fry for 5 to 6 minutes, stirring now and then, until their liquid has gone and they are golden brown.",
      "Add the garlic: Turn the heat down to medium, stir in the garlic purée and cook for 30 seconds, stirring all the time so it doesn't burn.",
      "Wilt the spinach: Add the spinach and stir for 1 to 2 minutes, until soft and dark green. Stir in a good grind of black pepper and take the pan off the heat.",
      "Toast the bread: Meanwhile, toast the bread in a toaster or under a hot grill for 2 to 3 minutes, until golden and crisp on both sides.",
      "Serve: Put the toast on warm plates and spoon the mushrooms and spinach on top, with any juices from the pan. Serve straight away.",
    ],
  },
  {
    id: "berry-banana-smoothie", meal: "breakfast", tags: ["Quick", "No cook", "Sweet"], name: "Berry and banana smoothie", blurb: "A thick, cold smoothie of berries, banana, yogurt, milk and oats.", servings: 2, minutes: 5,
    ingredients: [ing("berries", 160), ing("banana", 120, { note: "about 1 banana" }), ing("greek-yogurt", 150, { role: "protein" }), ing("milk", 250), ing("oats", 30)],
    method: [
      "Get the fruit ready: Peel the banana and break it into 3 or 4 pieces. Use frozen berries straight from the freezer, as they make the smoothie thick and cold. Rinse fresh ones.",
      "Fill the blender: Put the oats in the blender first, then the banana, berries and yogurt, and pour the milk over the top.",
      "Blend: Put the lid on firmly and blend for 1 to 2 minutes, until completely smooth, with no lumps of fruit or whole oats left.",
      "Check how thick it is: If it is too thick to pour, add a splash of water and blend for a few seconds more.",
      "Serve: Pour into glasses and drink straight away, or cover it and keep it in the fridge to drink the same day. Stir it before drinking.",
    ],
  },
  {
    id: "apple-cinnamon-porridge", meal: "breakfast", tags: ["Porridge"], name: "Apple and cinnamon porridge", blurb: "Creamy oats cooked with grated apple and cinnamon, with a drizzle of honey.", servings: 2, minutes: 12,
    ingredients: [ing("oats", 100), ing("milk", 400, { follows: "oats" }), ing("apple", 150, { note: "about 1 apple" }), ing("cinnamon", 2), ing("honey", 10)],
    method: [
      "Grate the apple: Wash the apple and grate it on the coarse side of a grater, skin and all, stopping at the core.",
      "Mix the porridge: Put the oats, milk, cinnamon and half the apple into a medium saucepan and stir well, so no dry oats are left at the bottom.",
      "Bring to a bubble: Put the pan on a medium heat and stir often, scraping the bottom so nothing sticks. After 2 to 3 minutes it will start to bubble gently.",
      "Cook until creamy: Turn the heat down a little and keep stirring for 4 to 5 minutes, until thick and creamy and the apple is soft. Stir in a splash of hot water if it gets too thick.",
      "Serve: Spoon the porridge into bowls, top with the rest of the apple and drizzle the honey over. Eat it straight away, while it is hot.",
    ],
  },
  {
    id: "eggy-bread-berries", meal: "breakfast", tags: ["Eggs", "Brunch", "Sweet", "British"], name: "Eggy bread with berries and yogurt", blurb: "Wholemeal bread soaked in cinnamon egg and fried golden, with yogurt and berries.", servings: 2, minutes: 15,
    ingredients: [ing("eggs", 120, { note: "about 2 eggs" }), ing("milk", 50), ing("bread", 160), ing("cinnamon", 1), ing("oil-spray", 1), ing("berries", 120), ing("greek-yogurt", 100)],
    method: [
      "Get the berries ready: If they are frozen, thaw them in a sieve under the cold tap for about a minute and shake off the water. If fresh, rinse and pat them dry.",
      "Beat the eggs: Crack the eggs into a wide, shallow dish, picking out any shell. Add the milk and cinnamon and beat with a fork until smooth. Wash your hands after handling raw eggs.",
      "Soak the bread: Dip the bread into the egg one slice at a time, about 10 seconds on each side, until soaked but not falling apart. Lay the slices on a plate.",
      "Heat the pan: Spray a large non-stick frying pan with the oil spray, away from any flame, and heat it on a medium heat for 1 minute.",
      "Fry the eggy bread: Fry the slices for 2 to 3 minutes on each side, until golden brown and the egg is completely set, with no wet egg left in the middle. Cook them in batches if they don't all fit.",
      "Serve: Put the eggy bread on warm plates, spoon the yogurt on top and scatter the berries over. Serve straight away.",
    ],
  },
];

// How each looks from directly above, for its picture (docs/RECIPE_IMAGE_PROMPTS.md): one portion, only the recipe's own foods, served as the method says.
export const EVERYDAY_BREAKFAST_LOOKS: Readonly<Record<string, string>> = {
  "cheesy-beans-on-toast": "Two slices of golden wholemeal toast on a round white plate, covered with glossy orange-red baked beans in tomato sauce and topped with a scatter of finely grated orange cheddar just starting to melt, with flecks of black pepper.",
  "scrambled-eggs-on-toast": "Two slices of golden wholemeal toast side by side on a round white plate, heaped with soft, glossy pale yellow scrambled eggs in large folds, flecked with cracked black pepper.",
  "poached-eggs-spinach-toast": "Two slices of golden wholemeal toast on a round white plate, each topped with a heap of dark green wilted spinach and a poached egg with a smooth, set white and a soft yellow yolk, with a few flecks of black pepper.",
  "boiled-eggs-toast-soldiers": "Two soft-boiled eggs in white egg cups on a round white plate, their tops sliced off to show set whites and runny bright yellow yolks with a few white salt flecks, beside a neat row of golden wholemeal toast soldiers.",
  "cheese-tomato-on-toast": "Two slices of wholemeal cheese on toast on a round white plate, the melted orange cheddar bubbling and browned in patches over thin red tomato slices that show at the edges, with flecks of black pepper.",
  "peanut-butter-banana-toast": "Two slices of golden wholemeal toast on a round white plate, spread with golden-brown peanut butter and covered with overlapping rows of round banana slices, dusted with a fine sprinkle of brown cinnamon.",
  "bacon-tomato-sandwich": "A bacon and tomato sandwich of golden wholemeal toast cut in half on the diagonal on a round white plate, the two halves side by side, the cut edges showing browned bacon medallions and red tomato slices.",
  "grilled-full-english": "A grilled full English breakfast on a large round white plate: browned bacon medallions, a fried egg with a set white and golden yolk, golden sliced mushrooms, two soft grilled tomato halves, orange-red baked beans and a slice of golden wholemeal toast.",
  "ham-cheese-toastie": "A golden-brown wholemeal ham and cheese toastie cut in half on the diagonal on a pale wooden board, the two halves set slightly apart, the cut edges showing melted orange cheddar and pink ham.",
  "garlic-mushrooms-on-toast": "Two slices of golden wholemeal toast on a round white plate, piled with glossy golden-brown sliced mushrooms and dark green wilted spinach in their pan juices, flecked with black pepper.",
  "berry-banana-smoothie": "A tall clear glass filled to the top with a thick, smooth purple-red berry and banana smoothie, its round surface flecked with tiny dark berry seeds and a few pale specks of blended oat.",
  "apple-cinnamon-porridge": "A round white bowl of thick, creamy pale oat porridge flecked with soft grated apple and brown cinnamon, topped with a small heap of grated apple showing red and green skin and a thin drizzle of golden honey.",
  "eggy-bread-berries": "Two slices of golden-brown eggy bread overlapping on a round white plate, topped with a dollop of thick white yogurt and a scatter of deep red and purple mixed berries.",
};
