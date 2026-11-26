import { tk } from "../i18n";
import { WAVE2_CUISINE_LINES, WAVE2_OCCASION_LINES } from "./wave2";

// The recipe book's niches (founder 2026-10-16: "a way to customise by niche, for example for Christmas, or like Chinese cuisine or Indian"): the cuisine
// a recipe belongs to, and the occasions it suits, kept here in one typed place rather than as free words on each recipe. A recipe has at most one
// cuisine and any number of occasions. Nothing about a niche is shown on a recipe card (founder 2026-10-16: no label on the cards); the Recipes screen offers
// the niches as two choices and the search finds recipes by their words.
//
// What is offered (lib/mm/recipeNiche.ts): a niche that fewer than 3 recipes belong to is hidden, and a seasonal occasion only inside its dates, so a choice
// never leads to an empty list. To add a niche: one entry in CUISINES or OCCASIONS (with its words and, for a seasonal one, its dates) and one line per
// recipe in NICHES; its name is a translation key (tk), so it is translated like every other word on screen.
//
// Judgement, not data: no restaurant or shop says which cuisine a home recipe is, so these are our own editorial calls, made from the dish's name and what
// is in it (a dish whose old tag in the book already named its cuisine keeps it; tests/recipeNiche.test.ts checks). A dish is labelled only where its name or
// ingredients make it plainly that cuisine's kind of food ("-style" in the name where it is a home version); anything else stays unlabelled.

/** A date in the year: month 1 to 12, day 1 to 31. */
export interface SeasonDay { month: number; day: number }
/** The dates an occasion is offered, both ends included, by the local calendar; `from` later in the year than `to` means the window runs over New Year. */
export interface Season { from: SeasonDay; to: SeasonDay }

export interface CuisineEntry {
  readonly id: string;
  /** The name shown (a translation key). */
  readonly label: string;
  /** Other English words that find these recipes in the search box (never shown, lower case). */
  readonly words: readonly string[];
}

export interface OccasionEntry extends CuisineEntry {
  /** Offered only inside these dates (absent: all year). */
  readonly season?: Season;
}

// Alphabetical by their English names, so the list is easy to scan.
export const CUISINES = [
  { id: "british", label: tk("British"), words: [] },
  { id: "chinese", label: tk("Chinese"), words: [] },
  { id: "indian", label: tk("Indian"), words: [] },
  { id: "italian", label: tk("Italian"), words: [] },
  { id: "mexican", label: tk("Mexican"), words: ["tex-mex"] },
  { id: "middle-eastern", label: tk("Middle Eastern"), words: [] },
] as const satisfies readonly CuisineEntry[];

export const OCCASIONS = [
  // Bonfire Night is 5 November: offered from the middle of October to the 10th
  { id: "bonfire-night", label: tk("Bonfire Night"), words: ["guy fawkes", "fireworks"], season: { from: { month: 10, day: 15 }, to: { month: 11, day: 10 } } },
  // Christmas recipes may use festive ingredients (pantry.ts FESTIVE_KINDS); offered from 1 November to 6 January, over New Year
  { id: "christmas", label: tk("Christmas"), words: ["christmas", "festive", "xmas", "boxing day"], season: { from: { month: 11, day: 1 }, to: { month: 1, day: 6 } } },
  { id: "lunchbox", label: tk("Lunchbox"), words: ["packed lunch"] },
  { id: "party-food", label: tk("Party food"), words: ["party", "buffet", "nibbles", "finger food"] },
  { id: "picnic", label: tk("Picnic"), words: [] },
  { id: "summer-barbecue", label: tk("Summer barbecue"), words: ["bbq", "barbeque", "barbecue"] },
] as const satisfies readonly OccasionEntry[];

export type CuisineId = (typeof CUISINES)[number]["id"];
export type OccasionId = (typeof OCCASIONS)[number]["id"];

export interface Niche {
  readonly cuisine?: CuisineId;
  readonly occasions?: readonly OccasionId[];
}

const cuisine = (id: CuisineId, ...recipes: string[]): Array<readonly [string, CuisineId]> => recipes.map((r) => [r, id] as const);
const occasion = (id: OccasionId, ...recipes: string[]): Array<readonly [string, OccasionId]> => recipes.map((r) => [r, id] as const);

/** One line per recipe and cuisine (a recipe has at most one: tests/recipeNiche.test.ts checks). */
export const CUISINE_LINES: ReadonlyArray<readonly [recipeId: string, cuisine: CuisineId]> = [
  // the second wave (wave2.ts, 26 November 2026): each file keeps its own lines next to its recipes
  ...WAVE2_CUISINE_LINES,
  ...cuisine("british", "cottage-pie", "bean-cottage-pie", "salmon-fish-pie", "ham-egg-potatoes", "easy-macaroni-cheese", "chicken-thigh-potato-traybake", "tuna-fishcakes", "smoked-salmon-kedgeree", "beans-poached-eggs", "turkey-roast-parsnips-sprouts", "chipolatas-red-cabbage-mash", "gammon-parsnips-apple-sauce", "sprout-chestnut-potato-gratin"),
  ...cuisine("chinese", "chicken-chow-mein", "sticky-beef-noodles", "egg-fried-rice", "vegetable-almond-stir-fry", "chicken-sweetcorn-soup", "egg-chow-mein", "egg-tomato-stir-fry", "chicken-mushroom-noodle-soup", "chinese-style-chicken-curry"),
  ...cuisine("indian", "chicken-jalfrezi", "beef-keema-peas", "egg-pea-curry", "kidney-bean-curry", "spiced-chicken-naan", "chickpea-potato-curry", "chicken-curry", "chickpea-curry", "salmon-coconut-curry"),
  ...cuisine("italian", "spaghetti-bolognese", "beef-pasta-bake", "chicken-mozzarella-pasta-bake", "potato-tomato-mozzarella-bake", "bacon-carbonara-spaghetti", "beef-meatballs-spaghetti", "bacon-tomato-linguine", "minestrone-beans-pasta", "tuna-pasta", "mushroom-bean-pasta", "chicken-mushroom-pasta", "pesto-pasta-mozzarella-salad", "mushroom-wrap-pizzas"),
  // chilli and burritos are Tex-Mex rather than strictly Mexican; filed here because that is where a shopper looks for them
  ...cuisine("mexican", "chicken-fajitas", "beef-burrito-bowl", "mexican-chicken-rice", "bean-pepper-fajitas", "beef-chilli", "bean-chilli", "breakfast-burrito", "huevos-rancheros", "mexican-bean-rice-bowl", "cheese-bean-quesadillas", "cheese-bean-quesadilla-wedges"),
  ...cuisine("middle-eastern", "chicken-shawarma-wraps", "moroccan-chickpea-stew", "shakshuka", "chickpea-houmous-wraps", "houmous-veg-sticks", "chickpea-tomato-salad", "spiced-chicken-rice-bowl", "chickpea-spinach-egg-stew"),
  // the recipes added 2026-11-16 (veganMorning, veganMains, glutenFree, moreMains)
  ...cuisine("british", "crispy-potatoes-garlic-mushrooms", "crispy-potato-cakes-fried-eggs", "broccoli-cheddar-soup", "cheese-onion-potato-cakes", "tuna-sweetcorn-pasta-bake", "beef-potato-pepper-hash", "broccoli-pepper-cheddar-pasta-bake", "honey-mustard-chicken-traybake"),
  ...cuisine("indian", "coconut-vegetable-curry", "potato-pea-curry", "chicken-biryani-style-rice", "chicken-korma-style-curry"),
  // the everyday breakfasts added 2026-11-20 (everydayBreakfast.ts): the ones that are plainly British breakfasts
  ...cuisine("british", "cheesy-beans-on-toast", "boiled-eggs-toast-soldiers", "cheese-tomato-on-toast", "bacon-tomato-sandwich", "grilled-full-english", "eggy-bread-berries"),
  ...cuisine("italian", "mushroom-pea-risotto-rice", "garlic-mushroom-spinach-spaghetti", "spinach-soft-cheese-pasta", "mozzarella-tomato-pesto-wraps", "smoked-salmon-pea-pasta", "salmon-broccoli-pasta"),
  // the recipes added 2026-11-20 for the eating styles (longevityMorning, longevityDinners, ketoMeals, paleoMeals, mediterranean, everydayLunches,
  // quickDinners). The Greek- and Spanish-style dishes stay unlabelled (no such cuisine on offer), and so do the chilli soup and the bean rice salad, which
  // are not Mexican dishes by their name or what is in them
  ...cuisine("british", "salmon-broccoli-fishcakes-salad", "bacon-eggs-mushrooms-tomatoes", "beef-vegetable-soup", "lemon-herb-chicken-carrots-onions", "beef-mushroom-tomato-stew-greens", "tuna-sweetcorn-cucumber-sandwiches", "chicken-salad-sandwiches", "egg-mayo-lettuce-sandwiches", "cheddar-apple-spinach-sandwiches", "chicken-vegetable-soup", "cheesy-beans-crushed-potatoes", "tomato-soup-cheese-on-toast"),
  ...cuisine("chinese", "salmon-broccoli-pea-stir-fry-rice", "beef-broccoli-soy-stir-fry-rice", "chicken-mushroom-soy-noodles", "egg-vegetable-noodle-stir-fry", "chicken-pea-egg-fried-rice"),
  ...cuisine("indian", "vegetable-chickpea-balti", "chicken-spinach-coconut-curry", "quick-chicken-spinach-curry-rice"),
  ...cuisine("italian", "bean-mushroom-bolognese", "chickpea-spinach-tomato-pasta", "tuna-bean-tomato-spaghetti", "mozzarella-tomato-pesto-salad", "pesto-chicken-tomatoes-broccoli", "mozzarella-chicken-tomato-sauce", "beef-meatballs-tomato-broccoli", "mozzarella-tomato-spinach-omelette", "tomato-mozzarella-toasts-spinach", "chicken-pepper-pesto-pasta-salad", "chicken-cacciatore-style-pasta", "pesto-chicken-broccoli-pasta", "chicken-spinach-tomato-spaghetti", "tuna-pea-spinach-lemon-spaghetti", "spinach-tomato-cheddar-pasta", "bacon-pea-soft-cheese-pasta", "creamy-tomato-chicken-spaghetti"),
  ...cuisine("mexican", "beef-pepper-quick-chilli-rice", "chicken-fajita-rice-pan"),
  // eggs baked in a cumin and paprika tomato sauce are shakshuka's kind of dish, like shakshuka and chickpea-spinach-egg-stew above
  ...cuisine("middle-eastern", "roasted-pepper-houmous-sandwiches", "houmous-tomato-spinach-toast", "spiced-bean-pepper-baked-eggs", "spiced-tomato-baked-eggs-spinach"),
  // the recipes added 2026-11-21 that nearly every shop can make (everyShop.ts). Mulligatawny is an Anglo-Indian soup and the bean curry an Indian-spiced one;
  // the Greek-, Korean-style and stroganoff dishes, the satay and the chicken and egg rice bowl stay unlabelled (no such cuisine on offer), and so do the bowls,
  // salads and pasta dishes that are no one cuisine's kind of food. The naan pizzas go where the wrap pizzas went
  ...cuisine("british", "pea-ham-soup-toast", "welsh-rarebit-tomatoes", "baked-bean-cheese-toastie", "ploughmans-salad-cheddar-ham", "hunters-style-chicken-rice-peas", "crispy-chicken-goujons-peas", "cheese-tomato-bread-bake", "savoury-mince-rice-peas"),
  ...cuisine("chinese", "tomato-egg-noodle-soup", "cold-peanut-noodles-cucumber-egg", "chinese-style-beef-lettuce-cups", "egg-foo-young-rice", "chicken-almond-stir-fry-rice"),
  ...cuisine("indian", "mulligatawny-chicken-rice-soup", "chicken-tikka-masala-style-curry", "mushroom-pea-coconut-curry", "baked-bean-spinach-curry-naan"),
  ...cuisine("italian", "tomato-mozzarella-naan-pizzas", "mushroom-carbonara-pasta", "chicken-arrabbiata-pasta"),
  ...cuisine("middle-eastern", "beef-koftas-cucumber-yogurt-naan", "mushroom-tomato-houmous-traybake"),
  // the world recipes added 2026-11-21 (worldMeals.ts). The Moroccan-style dishes go where the Moroccan chickpea stew went, the spiced beef on houmous is a
  // Levantine dish, the tinga a Mexican one and the masala omelette and masala oats Indian breakfasts. The Japanese, Korean, Thai, Vietnamese, Malaysian, Turkish, Greek,
  // Spanish, Portuguese, Swedish, Caribbean, West African and Cajun dishes stay unlabelled (no such cuisine on offer)
  ...cuisine("chinese", "dan-dan-beef-noodles-spinach", "hot-sour-noodle-soup-ham-egg", "sweet-sour-chicken-rice", "sichuan-chilli-garlic-mushrooms-rice"),
  ...cuisine("indian", "masala-omelette-spinach-tomato", "masala-oats-peas-tomato", "mushroom-pea-pilau-almonds", "tandoori-chicken-rice-raita", "egg-biryani-rice-raita", "mushroom-pea-keema-naan"),
  ...cuisine("italian", "italian-rice-salad-tuna-egg", "chicken-parmigiana-spaghetti", "salmon-pea-lemon-risotto", "arancini-tomato-mozzarella-rice-bake"),
  ...cuisine("mexican", "chicken-tinga-rice-bowl", "fajita-salmon-rice-bowl-salsa", "beef-enchilada-rice-bake"),
  ...cuisine("middle-eastern", "spiced-beef-houmous-naan", "moroccan-chicken-tagine-rice", "moroccan-meatballs-tomato-baked-eggs"),
  // the protein recipes added 2026-11-26 (proteinMeals.ts): the tofu and Quorn stir-fries and fried rice are Chinese-style dishes, the curries Indian, the
  // fajitas Mexican and the wraps with houmous go where houmous goes; the bowls, salads and the frittata stay unlabelled
  ...cuisine("chinese", "crispy-tofu-broccoli-stir-fry-rice", "tofu-pea-sweetcorn-fried-rice", "quorn-broccoli-soy-stir-fry-rice"),
  ...cuisine("indian", "tofu-spinach-tomato-curry-rice", "quorn-tikka-style-curry-rice", "egg-chickpea-spinach-curry-naan"),
  ...cuisine("italian", "creamy-cottage-cheese-tomato-pasta-spinach"),
  ...cuisine("mexican", "quorn-pepper-fajitas"),
  ...cuisine("middle-eastern", "smoky-tofu-pepper-wraps"),
  // the recipes added 2026-11-26 for diets with no onion or garlic (onionFreeMeals.ts) and for 15-minute dinners and the cuisines with the fewest lunches
  // (fastMeals.ts): the curries are Indian, the curried wraps an Indian-spiced lunch, the noodles Chinese-style, the quesadillas Mexican, the bake Italian, and
  // the shawarma-style salad and the wraps with houmous Middle Eastern; the rest are no one cuisine's kind of food
  ...cuisine("indian", "chickpea-spinach-tomato-curry-rice", "tofu-pea-tomato-curry-rice", "kidney-bean-tomato-curry-rice", "chickpea-spinach-curry-naan-quick", "curried-chicken-wraps-cucumber-yogurt", "curried-chickpea-salad-wraps"),
  ...cuisine("chinese", "chicken-vegetable-soy-noodles", "egg-spinach-pea-soy-noodles"),
  ...cuisine("italian", "pepper-spinach-mozzarella-pasta-bake"),
  ...cuisine("mexican", "cheese-sweetcorn-pepper-quesadillas", "tuna-sweetcorn-cheddar-quesadillas"),
  ...cuisine("middle-eastern", "chicken-shawarma-style-salad-houmous", "warm-spiced-chickpea-spinach-wraps"),
];

/** One line per recipe and occasion (a recipe may suit several; the same pair twice is a mistake the tests catch). */
export const OCCASION_LINES: ReadonlyArray<readonly [recipeId: string, occasion: OccasionId]> = [
  // the second wave (wave2.ts, 26 November 2026)
  ...WAVE2_OCCASION_LINES,
  ...occasion("bonfire-night", "beef-chilli", "bean-chilli", "bean-tomato-soup", "sweetcorn-potato-soup", "cottage-pie", "bean-cottage-pie"),
  ...occasion("christmas", "turkey-roast-parsnips-sprouts", "turkey-cranberry-cheddar-wraps", "chipolatas-red-cabbage-mash", "gammon-parsnips-apple-sauce", "sprout-chestnut-potato-gratin", "spiced-parsnip-apple-soup", "red-cabbage-chestnut-cranberry-rice", "mince-pie-porridge", "cranberry-cheddar-ham-toasted-wraps"),
  ...occasion("lunchbox", "chicken-wraps", "tuna-sweetcorn-pasta-salad", "smoked-salmon-soft-cheese-wraps", "egg-mayonnaise-wraps", "ham-soft-cheese-wraps", "chickpea-tomato-salad", "pesto-pasta-mozzarella-salad", "tuna-bean-salad", "potato-egg-salad", "curried-rice-salad", "peanut-butter-oat-bites", "houmous-veg-sticks", "ham-soft-cheese-roll-ups", "crispy-spiced-chickpeas"),
  ...occasion("party-food", "houmous-veg-sticks", "ham-soft-cheese-roll-ups", "devilled-eggs", "tuna-chickpea-dip", "smoked-salmon-cucumber-bites", "crispy-spiced-chickpeas", "paprika-roasted-almonds", "cheese-bean-quesadilla-wedges"),
  // eaten cold or carried: the method does not have to be cold, the dish has to be fine away from the kitchen
  ...occasion("picnic", "chicken-wraps", "spanish-omelette", "tuna-sweetcorn-pasta-salad", "smoked-salmon-soft-cheese-wraps", "egg-mayonnaise-wraps", "ham-soft-cheese-wraps", "chickpea-tomato-salad", "pesto-pasta-mozzarella-salad", "tuna-bean-salad", "potato-egg-salad", "curried-rice-salad", "houmous-veg-sticks", "ham-soft-cheese-roll-ups", "devilled-eggs"),
  // cooked on a barbecue or under a grill, or a cold salad that keeps and is served beside it (the same standard for every salad)
  ...occasion("summer-barbecue", "chicken-shawarma-wraps", "chicken-pepper-kebabs", "bbq-chicken-thigh-skewers", "potato-egg-salad", "chickpea-tomato-salad", "pesto-pasta-mozzarella-salad", "curried-rice-salad", "tuna-sweetcorn-pasta-salad"),
  // the recipes added 2026-11-16
  ...occasion("bonfire-night", "carrot-coconut-soup", "tomato-pepper-chickpea-soup", "broccoli-cheddar-soup", "beef-potato-pepper-hash"),
  ...occasion("lunchbox", "peanut-butter-apple-slices", "banana-oat-cookies", "lemony-chickpea-potato-salad", "satay-pasta-salad", "pepper-spinach-cheddar-frittata", "ham-pepper-egg-cups", "tuna-egg-potato-salad", "chicken-sweetcorn-rice-salad", "mozzarella-tomato-pesto-wraps"),
  ...occasion("party-food", "wrap-crisps-tomato-salsa", "sweetcorn-pepper-lettuce-cups", "ham-pepper-egg-cups"),
  ...occasion("picnic", "banana-oat-cookies", "lemony-chickpea-potato-salad", "satay-pasta-salad", "pepper-spinach-cheddar-frittata", "ham-pepper-egg-cups", "tuna-egg-potato-salad", "chicken-sweetcorn-rice-salad", "salmon-potato-salad-cucumber-yogurt", "mozzarella-tomato-pesto-wraps"),
  ...occasion("summer-barbecue", "lemony-chickpea-potato-salad", "satay-pasta-salad", "tuna-egg-potato-salad", "chicken-sweetcorn-rice-salad", "salmon-potato-salad-cucumber-yogurt"),
  // the recipes added 2026-11-20: the closed sandwiches, the cold salads that keep, the frittata and the egg muffins go in a box; the chillis and soups
  // are for Bonfire Night, like the ones above
  ...occasion("bonfire-night", "spiced-carrot-chickpea-soup", "bean-vegetable-chilli-soup", "beef-pepper-quick-chilli-rice", "mushroom-soup-toast", "chicken-vegetable-soup", "tomato-soup-cheese-on-toast", "spiced-chicken-vegetable-soup", "beef-vegetable-soup"),
  ...occasion("lunchbox", "tuna-sweetcorn-cucumber-sandwiches", "chicken-salad-sandwiches", "egg-mayo-lettuce-sandwiches", "cheddar-apple-spinach-sandwiches", "smashed-chickpea-carrot-sandwiches", "salmon-cucumber-soft-cheese-sandwiches", "bean-sweetcorn-pepper-rice-salad", "chicken-pepper-pesto-pasta-salad", "chicken-chickpea-tomato-oregano-salad", "pea-ham-potato-salad", "bacon-mushroom-cheddar-frittata", "pepper-spinach-egg-muffins"),
  ...occasion("picnic", "tuna-sweetcorn-cucumber-sandwiches", "chicken-salad-sandwiches", "egg-mayo-lettuce-sandwiches", "cheddar-apple-spinach-sandwiches", "smashed-chickpea-carrot-sandwiches", "salmon-cucumber-soft-cheese-sandwiches", "bean-sweetcorn-pepper-rice-salad", "chicken-pepper-pesto-pasta-salad", "chicken-chickpea-tomato-oregano-salad", "pea-ham-potato-salad", "bacon-mushroom-cheddar-frittata", "pepper-spinach-egg-muffins"),
  ...occasion("summer-barbecue", "bean-sweetcorn-pepper-rice-salad", "chicken-pepper-pesto-pasta-salad", "pea-ham-potato-salad"),
  // the recipes added 2026-11-21 (everyShop.ts): the soups for Bonfire Night; the pasta salads and the cold noodles go in a box or a picnic; the koftas and
  // the satay skewers are grilled, and the pasta salads keep, so they go beside a barbecue too
  ...occasion("bonfire-night", "pea-ham-soup-toast", "mulligatawny-chicken-rice-soup", "creamy-chicken-mushroom-soup"),
  ...occasion("lunchbox", "ham-cheddar-pea-pasta-salad", "salmon-pea-lemon-pasta-salad", "greek-style-chicken-pasta-salad", "cold-peanut-noodles-cucumber-egg"),
  ...occasion("picnic", "ham-cheddar-pea-pasta-salad", "salmon-pea-lemon-pasta-salad", "greek-style-chicken-pasta-salad", "cold-peanut-noodles-cucumber-egg"),
  ...occasion("summer-barbecue", "beef-koftas-cucumber-yogurt-naan", "chicken-satay-skewers-rice", "ham-cheddar-pea-pasta-salad", "salmon-pea-lemon-pasta-salad", "greek-style-chicken-pasta-salad"),
  // the world recipes added 2026-11-21 (worldMeals.ts): the egg muffins and the cold rice salad go in a box or a picnic; the grilled peri peri chicken and the
  // tandoori-style chicken suit a barbecue, like the koftas and satay above, and so does the rice salad, which keeps; the soups are for Bonfire Night
  ...occasion("lunchbox", "bacon-spinach-tomato-egg-muffins", "italian-rice-salad-tuna-egg"),
  ...occasion("picnic", "bacon-spinach-tomato-egg-muffins", "italian-rice-salad-tuna-egg"),
  ...occasion("summer-barbecue", "peri-peri-chicken-spicy-rice", "tandoori-chicken-rice-raita", "italian-rice-salad-tuna-egg"),
  ...occasion("bonfire-night", "pho-chicken-noodle-soup", "hot-sour-noodle-soup-ham-egg", "thai-coconut-noodle-soup-mushrooms"),
  // the snacks, bakes and meals added 2026-11-26 (homeSnacks.ts, proteinMeals.ts, onionFreeMeals.ts): the bakes, balls, muffins and cold salads keep in a box;
  // the dips, boats and bites are finger food; the chilli and the soup are for Bonfire Night
  ...occasion("lunchbox", "peanut-butter-protein-flapjacks", "oat-raisin-protein-balls", "cottage-cheese-spinach-egg-muffins", "banana-raisin-baked-oat-cups", "crispy-soy-paprika-tofu-bites", "cottage-cheese-chickpea-tomato-salad", "lemony-chickpea-cucumber-rice-salad"),
  ...occasion("picnic", "peanut-butter-protein-flapjacks", "cottage-cheese-spinach-egg-muffins", "cottage-cheese-spinach-pepper-frittata-salad", "lemony-chickpea-cucumber-rice-salad"),
  ...occasion("party-food", "cottage-cheese-spinach-egg-muffins", "whipped-cottage-cheese-dip-sticks", "cucumber-garlic-yogurt-dip-carrots", "tuna-sweetcorn-cucumber-boats", "crispy-soy-paprika-tofu-bites", "warm-edamame-soy-lemon"),
  ...occasion("bonfire-night", "tofu-kidney-bean-chilli-rice", "spiced-chickpea-tomato-soup-toast"),
];

/** Every recipe's niche, by recipe id (a recipe in neither table is not here). Built from the two tables above; whoever writes a recipe adds its lines there. */
export const NICHES: Readonly<Record<string, Niche>> = (() => {
  const out: Record<string, { cuisine?: CuisineId; occasions?: OccasionId[] }> = {};
  for (const [id, c] of CUISINE_LINES) (out[id] ??= {}).cuisine = c;
  for (const [id, o] of OCCASION_LINES) ((out[id] ??= {}).occasions ??= []).push(o);
  return out;
})();

const NONE: Niche = {};
/** The niche of a recipe: empty when it has none. */
export const nicheOf = (recipeId: string): Niche => NICHES[recipeId] ?? NONE;
