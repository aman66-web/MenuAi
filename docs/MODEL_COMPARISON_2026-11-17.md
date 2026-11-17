# Haiku 5.5 vs Sonnet 5.5 for Make it at home (17 Nov 2026)

Same input for both models: the same 10 dish photos (1024 px JPEG, as the app sends), the same dish name and description, Sainsbury's 142 ingredient kinds, 2 servings, a 600 kcal meal target, no diet, the app's own system prompt and structured output, **high effort** for both. Every answer was then put through the app's own checks and products. Total cost of the test: **$0.48**.

## Verdict

- **Both are good and safe:** 10 of 10 recipes from each passed every app check, matched the dish, and landed within about 30 kcal of the 600 kcal target.
- **Sonnet cooks more like a cook:** fuller spice sets (jalfrezi with cumin, turmeric and ginger; chickpea curry with ginger and turmeric), better order of work (oven on first, rice timed to finish with the curry), more classic choices (cottage pie with stock and passata rather than soy sauce). Once it added something not described (bacon in the caesar wrap).
- **Haiku is solid but plainer:** fewer ingredients, some awkward timing (rice cooked first and kept warm; oven not heated before the pie goes in), but it sticks closely to what the person wrote.
- **Speed:** Haiku about 15 s, Sonnet about 25 s; both well inside the minute allowed.
- **Cost:** Haiku about $0.003 a recipe, Sonnet about $0.045 (about 14 times more). Most of Sonnet's cost is the 14,700 input tokens (the shop's ingredient list), which prompt caching could cut to about $0.02 a recipe.

## The numbers

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Passed the app's checks | 10 of 10 | 10 of 10 |
| Average time | 15 s | 25 s |
| Average cost a recipe | $0.0031 | $0.0448 |
| Input tokens a recipe | 14,717 | 14,717 |
| Output tokens a recipe (incl. thinking) | 3,354 | 1,540 |
| Average ingredients | 11.4 | 13.2 |

## Dish by dish (per serving, as written, from Sainsbury's labels)

| Dish | Haiku: name · kcal · protein · price · time | Sonnet: name · kcal · protein · price · time |
|---|---|---|
| Chicken fajitas | Smoky chicken fajitas with peppers · 600 kcal · 65 g · £3.50 · 16 s | Chicken fajita wraps · 616 kcal · 53 g · £3.01 · 13 s |
| Spaghetti bolognese | Spaghetti bolognese with grated cheddar · 614 kcal · 52 g · £2.21 · 14 s | Spaghetti bolognese with cheddar · 616 kcal · 49 g · £2.17 · 24 s |
| Chicken jalfrezi | Chicken jalfrezi with rice · 607 kcal · 58 g · £3.07 · 14 s | Chicken jalfrezi with rice · 614 kcal · 59 g · £3.04 · 26 s |
| Teriyaki-style salmon noodles | Teriyaki salmon noodles with vegetables · 631 kcal · 37 g · £4.02 · 15 s | Teriyaki-style salmon noodles · 636 kcal · 33 g · £3.43 · 26 s |
| Shakshuka | Shakshuka with eggs and naan · 610 kcal · 33 g · £2.71 · 13 s | Shakshuka with warm naan · 620 kcal · 38 g · £2.78 · 26 s |
| Chickpea curry | Creamy coconut chickpea curry with spinach · 610 kcal · 24 g · £1.82 · 14 s | Creamy coconut chickpea curry with rice · 614 kcal · 24 g · £1.70 · 25 s |
| Cottage pie | Cottage pie with cheesy mash · 607 kcal · 61 g · £3.12 · 19 s | Cottage pie · 595 kcal · 52 g · £3.02 · 32 s |
| Chicken caesar wrap | Chicken caesar wrap · 597 kcal · 57 g · £2.77 · 16 s | Chicken caesar wrap · 610 kcal · 68 g · £2.75 · 27 s |
| Huevos rancheros | Huevos rancheros with spiced beans · 573 kcal · 33 g · £1.85 · 15 s | Huevos rancheros with kidney beans · 591 kcal · 34 g · £2.22 · 31 s |
| Sweet chilli chicken | Sweet chilli chicken with rice · 603 kcal · 57 g · £2.78 · 13 s | Sweet chilli chicken with rice · 618 kcal · 56 g · £2.58 · 23 s |

## Ingredients side by side

**Chicken fajitas**

- Haiku: Chicken breast fillets 350g; Tortilla wraps 122g; Peppers 300g; Onion 150g; Olive oil 10ml; Lime juice 15ml; Fajita seasoning 10g; Tomato salsa 150g; Fat-free Greek-style yogurt 100g
- Sonnet: Chicken breast fillets 260g; Tortilla wraps 200g; Fajita seasoning 10g; Smoked paprika 2g; Peppers 240g; Onion 120g; Vegetable or sunflower oil 5ml; Lime juice 10ml; Salt 1g; Fat-free Greek-style yogurt 80g; Tomato salsa 80g

**Spaghetti bolognese**

- Haiku: 5% fat beef mince 225g; Spaghetti or linguine 140g; Mature cheddar 30g; Chopped tomatoes 400g; Carrots 80g; Onion 100g; Garlic purée or paste 5g; Tomato purée 15g; Olive oil 5ml; Dried oregano 2g; Salt 2g; Ground black pepper 1g
- Sonnet: 5% fat beef mince 200g; Spaghetti or linguine 150g; Mature cheddar 30g; Chopped tomatoes 400g; Tomato purée 20g; Onion 100g; Carrots 80g; Garlic purée or paste 10g; Olive oil 5ml; Dried oregano 2g; Salt 3g; Ground black pepper 1g

**Chicken jalfrezi**

- Haiku: Chicken breast fillets 320g; Rice 120g; Onion 200g; Peppers 200g; Garlic purée or paste 10g; Fresh chillies 10g; Curry paste 30g; Chopped tomatoes 200g; Olive oil 10ml; Chopped coriander (fresh or frozen) 5g; Salt 2g
- Sonnet: Chicken breast fillets 320g; Rice 120g; Vegetable or sunflower oil 10ml; Onion 150g; Peppers 240g; Garlic purée or paste 10g; Ginger purée or paste 10g; Ground cumin 4g; Ground turmeric 2g; Chilli powder 2g; Curry paste 20g; Chopped tomatoes 200g; Tomato purée 15g; Fresh chillies 10g; Salt 2g; Chopped coriander (fresh or frozen) 10g

**Teriyaki-style salmon noodles**

- Haiku: Salmon fillets 240g; Ready-to-wok noodles 200g; Fresh vegetable stir fry 300g; Teriyaki sauce 30ml; Clear honey 10g; Vegetable or sunflower oil 5ml; Garlic purée or paste 5g; Ginger purée or paste 3g; Spring onions 20g; Sesame seeds 2g
- Sonnet: Salmon fillets 180g; Ready-to-wok noodles 300g; Teriyaki sauce 50ml; Soy sauce 10ml; Fresh vegetable stir fry 200g; Spring onions 30g; Garlic purée or paste 5g; Ginger purée or paste 5g; Vegetable or sunflower oil 5ml; Sesame seeds 5g

**Shakshuka**

- Haiku: Olive oil 10ml; Onion 150g; Peppers 200g; Garlic purée or paste 10g; Ground cumin 2g; Paprika 4g; Crushed chilli flakes 1g; Chopped tomatoes 400g; Salt 3g; Ground black pepper 1g; Free-range eggs 300g; Plain naan breads 160g; Fresh parsley 10g
- Sonnet: Free-range eggs 360g; Plain naan breads 100g; Feta 30g; Olive oil 10ml; Onion 150g; Peppers 200g; Garlic purée or paste 10g; Ground cumin 4g; Smoked paprika 4g; Crushed chilli flakes 1g; Chopped tomatoes 400g; Tomato purée 20g; Salt 1g; Ground black pepper 1g; Fresh parsley 10g

**Chickpea curry**

- Haiku: Chickpeas in water 360g; Rice 100g; Light coconut milk 200ml; Chopped tomatoes 400g; Spinach 120g; Onion 150g; Garlic purée or paste 10g; Curry powder 8g; Olive oil 10ml; Salt 1g
- Sonnet: Chickpeas in water 360g; Rice 120g; Light coconut milk 150ml; Chopped tomatoes 200g; Spinach 100g; Onion 150g; Garlic purée or paste 10g; Ginger purée or paste 5g; Curry paste 25g; Ground cumin 2g; Ground turmeric 2g; Vegetable or sunflower oil 5ml; Salt 2g

**Cottage pie**

- Haiku: 5% fat beef mince 300g; Tinned new potatoes (drained) 360g; Semi-skimmed milk 120ml; Mature cheddar 40g; Onion 100g; Garlic purée or paste 5g; Carrots 100g; Frozen peas or petits pois 80g; Olive oil 5ml; Chopped tomatoes 200g; Tomato purée 20g; Soy sauce 10ml; Dried mixed herbs 2g; Salt 2g; Ground black pepper 1g
- Sonnet: 5% fat beef mince 250g; Tinned new potatoes (drained) 500g; Mature cheddar 30g; Semi-skimmed milk 40ml; Onion 100g; Carrots 120g; Frozen peas or petits pois 80g; Tomato purée 20g; Passata 150g; Vegetable stock cube 5g; Olive oil 10ml; Garlic purée or paste 5g; Dried thyme 1g; Salt 2g; Ground black pepper 2g

**Chicken caesar wrap**

- Haiku: Chicken breast fillets 300g; Tortilla wraps 122g; Lettuce 100g; Light mayonnaise 60g; Italian hard cheese (Parmigiano Reggiano or Grana Padano) 30g; Garlic purée or paste 10g; Mustard (English, Dijon or wholegrain) 5g; Lemon juice 10ml; Olive oil 10ml; Salt 2g; Ground black pepper 2g
- Sonnet: Chicken breast fillets 300g; Bacon medallions 60g; Tortilla wraps 122g; Italian hard cheese (Parmigiano Reggiano or Grana Padano) 20g; Fat-free Greek-style yogurt 80g; Light mayonnaise 30g; Lemon juice 10ml; Garlic purée or paste 5g; Mustard (English, Dijon or wholegrain) 5g; Lettuce 120g; Olive oil 10ml; Salt 1g; Ground black pepper 1g

**Huevos rancheros**

- Haiku: Free-range eggs 230g; Red kidney beans in water 240g; Tortilla wraps 122g; Tomato salsa 150g; Onion 60g; Garlic purée or paste 5g; Vegetable or sunflower oil 10ml; Ground cumin 2g; Smoked paprika 2g; Chilli powder 2g; Salt 2g; Ground black pepper 1g
- Sonnet: Free-range eggs 240g; Tortilla wraps 122g; Red kidney beans in water 240g; Tomato salsa 200g; Onion 80g; Garlic purée or paste 5g; Ground cumin 2g; Smoked paprika 2g; Salt 1g; Ground black pepper 1g; Olive oil 10ml; Chopped coriander (fresh or frozen) 5g; Lime juice 10ml

**Sweet chilli chicken**

- Haiku: Chicken breast fillets 300g; Rice 120g; Sweet chilli sauce 60g; Vegetable or sunflower oil 10ml; Peppers 200g; Broccoli 200g; Spring onions 30g; Garlic purée or paste 5g; Soy sauce 15ml; Salt 1g; Ground black pepper 1g
- Sonnet: Chicken breast fillets 300g; Rice 120g; Sweet chilli sauce 80g; Peppers 150g; Broccoli 150g; Spring onions 30g; Vegetable or sunflower oil 10ml; Garlic purée or paste 10g; Ginger purée or paste 5g; Soy sauce 15ml; Lime juice 10ml; Paprika 2g; Salt 1g; Ground black pepper 1g

## Methods for two dishes

**Chicken jalfrezi · Haiku**

1. Season the chicken: Cut the chicken into bite-sized pieces, about 3 cm. Toss with a pinch of salt.
2. Cook the rice: Cook the basmati rice following the packet instructions, for about 12 minutes, until tender. Drain and keep warm.
3. Heat the oil: Heat the olive oil in a large frying pan over a medium-high heat.
4. Brown the chicken: Fry the chicken for 5 to 6 minutes, stirring, until golden and cooked through with no pink left inside. Lift onto a plate.
5. Soften the onion: Slice the onion and add it to the pan with the chilli. Cook for 5 minutes, until soft.
6. Add the spices: Stir in the garlic and curry paste. Cook for 1 minute, until fragrant.
7. Add the peppers: Slice the peppers into strips and stir them in. Cook for 3 minutes, until just softening.
8. Make the sauce: Add the chopped tomatoes and simmer for 5 minutes, until thickened.
9. Finish the curry: Return the chicken and any juices to the pan. Simmer for 4 minutes, until piping hot with no pink left.
10. Serve: Chop the coriander, scatter it over the curry, and serve with the rice.

**Chicken jalfrezi · Sonnet**

1. Prep everything: Cut the chicken into bite-sized chunks. Cut the onion and peppers into chunky pieces about 3 cm wide. Slice the fresh chilli thinly, removing the seeds if you want less heat.
2. Brown the chicken: Heat the oil in a large frying pan over a medium-high heat. Add the chicken and a pinch of the salt. Cook for 4 to 5 minutes, turning, until golden on the outside. Lift out onto a plate.
3. Soften the veg: Add the onion and peppers to the same pan. Cook for 5 minutes, stirring often, until the onion is soft and the edges are lightly browned.
4. Add the spices: Stir in the garlic, ginger, fresh chilli, cumin, turmeric, chilli powder and curry paste. Cook for 1 minute, stirring, until it smells fragrant.
5. Build the sauce: Add the chopped tomatoes and tomato purée with the rest of the salt. Stir well, then bring to a gentle bubble.
6. Simmer: Return the chicken and any juices to the pan. Simmer for 10 to 12 minutes, stirring now and then, until the sauce is thick and the chicken is piping hot with no pink left.
7. Cook the rice: While the curry simmers, boil the rice in a pan of boiling water for 10 to 12 minutes, until tender. Drain well and fluff with a fork.
8. Serve: Spoon the rice onto two plates and the jalfrezi alongside. Scatter over the fresh coriander and serve straight away.

**Cottage pie · Haiku**

1. Soften the onion: Heat the olive oil in a large frying pan over a medium heat. Add the finely chopped onion and crushed garlic and cook for 5 minutes, until soft but not brown.
2. Brown the beef: Add the beef mince and cook for 6 to 8 minutes, breaking it up with a spoon, until browned all over with no pink left.
3. Add the carrots: Stir in the finely diced carrots and cook for 5 minutes, until they start to soften.
4. Make the gravy: Stir in the chopped tomatoes, tomato purée, soy sauce, mixed herbs, salt and pepper. Simmer gently for 10 minutes, until thick and the carrots are tender.
5. Add the peas: Stir in the peas and cook for 2 minutes, until hot all the way through.
6. Warm the milk: Heat the milk in a small pan or in the microwave for 1 minute, until warm but not boiling.
7. Mash the potatoes: Put the drained new potatoes in a bowl, add the warm milk, salt and pepper, and mash until smooth.
8. Top the pie: Spoon the mash over the meat mixture in an ovenproof dish, spread it to the edges, and sprinkle the grated cheddar on top.
9. Bake the pie: Bake at 200°C for 20 minutes, until golden on top and bubbling hot in the middle.
10. Serve: Leave to rest for 5 minutes, then spoon into warm bowls and serve.

**Cottage pie · Sonnet**

1. Heat the oven: Set the oven to 200°C (180°C fan) and get a small ovenproof dish ready.
2. Soften the veg: Finely chop the onion and dice the carrots. Heat the olive oil in a large pan over a medium heat and cook them for 6 to 8 minutes, until the onion is soft.
3. Brown the mince: Add the garlic and beef mince. Cook for 6 to 8 minutes, breaking it up with a spoon, until browned with no pink left.
4. Build the gravy: Stir in the tomato purée, passata, thyme, half the pepper and 1 g of the salt. Crumble in the stock cube with 150 ml boiling water and stir well.
5. Simmer: Cook gently for 12 to 15 minutes, until the sauce is thick and the carrots are tender. Stir in the peas for the last 3 minutes.
6. Mash the potatoes: Drain the potatoes and warm them in a pan for 1 minute. Add the milk, the remaining salt and pepper, then mash until smooth.
7. Assemble: Spoon the mince into the dish and spread the mash over the top. Rough it up with a fork and scatter over the cheddar.
8. Bake: Bake for 20 to 25 minutes, until the filling is bubbling piping hot and the top is golden. Rest for 5 minutes, then serve.

