import { tk } from "../i18n";

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
  ...cuisine("british", "cottage-pie", "bean-cottage-pie", "salmon-fish-pie", "ham-egg-potatoes", "easy-macaroni-cheese", "chicken-thigh-potato-traybake", "tuna-fishcakes", "smoked-salmon-kedgeree", "beans-poached-eggs", "turkey-roast-parsnips-sprouts", "chipolatas-red-cabbage-mash", "gammon-parsnips-apple-sauce", "sprout-chestnut-potato-gratin"),
  ...cuisine("chinese", "chicken-chow-mein", "sticky-beef-noodles", "egg-fried-rice", "vegetable-almond-stir-fry", "chicken-sweetcorn-soup", "egg-chow-mein", "egg-tomato-stir-fry", "chicken-mushroom-noodle-soup", "chinese-style-chicken-curry"),
  ...cuisine("indian", "chicken-jalfrezi", "beef-keema-peas", "egg-pea-curry", "kidney-bean-curry", "spiced-chicken-naan", "chickpea-potato-curry", "chicken-curry", "chickpea-curry", "salmon-coconut-curry"),
  ...cuisine("italian", "spaghetti-bolognese", "beef-pasta-bake", "chicken-mozzarella-pasta-bake", "potato-tomato-mozzarella-bake", "bacon-carbonara-spaghetti", "beef-meatballs-spaghetti", "bacon-tomato-linguine", "minestrone-beans-pasta", "tuna-pasta", "mushroom-bean-pasta", "chicken-mushroom-pasta", "pesto-pasta-mozzarella-salad", "mushroom-wrap-pizzas"),
  // chilli and burritos are Tex-Mex rather than strictly Mexican; filed here because that is where a shopper looks for them
  ...cuisine("mexican", "chicken-fajitas", "beef-burrito-bowl", "mexican-chicken-rice", "bean-pepper-fajitas", "beef-chilli", "bean-chilli", "breakfast-burrito", "huevos-rancheros", "mexican-bean-rice-bowl", "cheese-bean-quesadillas", "cheese-bean-quesadilla-wedges"),
  ...cuisine("middle-eastern", "chicken-shawarma-wraps", "moroccan-chickpea-stew", "shakshuka", "chickpea-houmous-wraps", "houmous-veg-sticks", "chickpea-tomato-salad", "spiced-chicken-rice-bowl", "chickpea-spinach-egg-stew"),
];

/** One line per recipe and occasion (a recipe may suit several; the same pair twice is a mistake the tests catch). */
export const OCCASION_LINES: ReadonlyArray<readonly [recipeId: string, occasion: OccasionId]> = [
  ...occasion("bonfire-night", "beef-chilli", "bean-chilli", "bean-tomato-soup", "sweetcorn-potato-soup", "cottage-pie", "bean-cottage-pie"),
  ...occasion("christmas", "turkey-roast-parsnips-sprouts", "turkey-cranberry-cheddar-wraps", "chipolatas-red-cabbage-mash", "gammon-parsnips-apple-sauce", "sprout-chestnut-potato-gratin", "spiced-parsnip-apple-soup", "red-cabbage-chestnut-cranberry-rice", "mince-pie-porridge", "cranberry-cheddar-ham-toasted-wraps"),
  ...occasion("lunchbox", "chicken-wraps", "tuna-sweetcorn-pasta-salad", "smoked-salmon-soft-cheese-wraps", "egg-mayonnaise-wraps", "ham-soft-cheese-wraps", "chickpea-tomato-salad", "pesto-pasta-mozzarella-salad", "tuna-bean-salad", "potato-egg-salad", "curried-rice-salad", "peanut-butter-oat-bites", "houmous-veg-sticks", "ham-soft-cheese-roll-ups", "crispy-spiced-chickpeas"),
  ...occasion("party-food", "houmous-veg-sticks", "ham-soft-cheese-roll-ups", "devilled-eggs", "tuna-chickpea-dip", "smoked-salmon-cucumber-bites", "crispy-spiced-chickpeas", "paprika-roasted-almonds", "cheese-bean-quesadilla-wedges"),
  // eaten cold or carried: the method does not have to be cold, the dish has to be fine away from the kitchen
  ...occasion("picnic", "chicken-wraps", "spanish-omelette", "tuna-sweetcorn-pasta-salad", "smoked-salmon-soft-cheese-wraps", "egg-mayonnaise-wraps", "ham-soft-cheese-wraps", "chickpea-tomato-salad", "pesto-pasta-mozzarella-salad", "tuna-bean-salad", "potato-egg-salad", "curried-rice-salad", "houmous-veg-sticks", "ham-soft-cheese-roll-ups", "devilled-eggs"),
  // cooked on a barbecue or under a grill, or a cold salad that keeps and is served beside it (the same standard for every salad)
  ...occasion("summer-barbecue", "chicken-shawarma-wraps", "chicken-pepper-kebabs", "bbq-chicken-thigh-skewers", "potato-egg-salad", "chickpea-tomato-salad", "pesto-pasta-mozzarella-salad", "curried-rice-salad", "tuna-sweetcorn-pasta-salad"),
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
