import type { Recipe } from "./recipes";

// What kind of dish a recipe is, for a varied week (founder 2026-11-20, on Meal plan: "a lot of them are to do with wraps ... You want kind of like a varied
// diet ... You can't just do wraps every single day"). Worked out from the recipe's own name and ingredients, never stored on a recipe, so a new recipe gets
// one without anyone remembering to add it. The plan (mealPlan.ts makePlan) and Your plan's example week (exampleWeek.ts) never put the same form twice in a
// day, never the same form in the same meal two days running, and at most MAX_WRAPS_A_WEEK wraps, where the recipes allow it. Pure; tests/dishForm.test.ts
// checks every recipe in the book.

export const DISH_FORMS = [
  "wrap", "sandwich", "toast", "porridge", "cereal", "yogurt", "smoothie", "pancakes", "eggs", "fryUp", "pasta", "noodles", "rice", "curry", "soup", "salad",
  "potatoes", "bake", "stuffed", "traybake", "fish", "meat", "fritters", "dip", "nuts", "fruit", "bites",
] as const;
export type DishForm = (typeof DISH_FORMS)[number];

/** A week has at most this many wraps (tortillas: wraps, burritos, fajitas, quesadillas), where its recipes allow it. */
export const MAX_WRAPS_A_WEEK = 2;

const has = (r: Pick<Recipe, "ingredients">, ...kinds: string[]) => r.ingredients.some((i) => kinds.includes(i.pantry ?? i.key));

/** The name's words, by what the dish is: the first that matches wins. */
const BY_NAME: ReadonlyArray<readonly [RegExp, DishForm]> = [
  [/\bsoups?\b|\bminestrone\b/, "soup"],
  [/\bsmoothie\b/, "smoothie"],
  [/\bcurry\b|\bkorma\b|\bjalfrezi\b|\bbalti\b|\bbiryani\b|\bkeema\b|\bdal\b|\bdhal\b|\bstew\b|\bgoulash\b|\bcacciatore\b|\bstroganoff\b|\bcasserole\b|\btagine\b/, "curry"],
  // a chilli (con carne, bean chilli), never sweet chilli sauce or chilli as a word for a hot dish ("Chilli beef")
  [/(?<!sweet )\bchilli\b(?! (?:beef|chicken|flakes|powder|sauce|prawns?))/, "curry"],
  [/\bfull english\b|\bfry-up\b|\bbacon, eggs\b/, "fryUp"],
  [/\bpancakes?\b|\beggy bread\b|\bfrench toast\b/, "pancakes"],
  [/\bporridge\b|\boats\b|\bbircher\b|\bmuesli\b|\brice pudding\b/, "porridge"],
  [/\bwholewheat biscuits\b|\bwheat biscuits\b|\bcereal\b/, "cereal"],
  [/\bsandwich(?:es)?\b|\btoastie\b|\bbagels?\b|\bpanini\b/, "sandwich"],
  [/\bsalad\b|\bniçoise\b|\bnicoise\b|\bcaesar\b|\bslaw\b/, "salad"],
  [/\bon toast\b|\btoasts?\b|\bbruschetta\b/, "toast"],
  [/\bomelettes?\b|\bfrittata\b|\bscrambled\b|\bshakshuka\b|\bhuevos\b|\begg muffins\b|\begg cups\b|\bbaked eggs\b|\bboiled eggs\b|\bpoached eggs\b|\bfried eggs\b|\bdevilled eggs\b|\bspanish-style eggs\b/, "eggs"],
  [/\bstir-fry\b|\bstir fry\b|\bchow mein\b|\bnoodles?\b/, "noodles"],
  [/\bstuffed\b/, "stuffed"],
  [/\btraybake\b|\btray bake\b|\bsheet pan\b/, "traybake"],
  [/\bfritters?\b|\bpotato cakes\b|\bfishcakes\b|\bfish cakes\b|\bburgers?\b|\bpatties\b/, "fritters"],
  [/\bbake\b|\bpie\b|\bgratin\b|\bmoussaka\b|\blasagne\b/, "bake"],
  [/\byogurt (?:pots?|bowl)\b|\bgranola bowl\b|\bcottage cheese\b/, "yogurt"],
  [/\bapple slices\b|\bberry ice\b|\bfruit\b/, "fruit"],
  [/\brisotto\b|\bkedgeree\b|\bfried rice\b|\bpilaf\b|\bpaella\b|\bbowl\b|\brice$/, "rice"],
  [/\bdip\b|\bhoumous with\b|\bsalsa in\b/, "dip"],
  [/\bcookies?\b|\bbites\b|\bbark\b|\bflapjacks?\b|\bmuffins?\b|\bbars?\b/, "bites"],
  [/\balmonds\b|\bchickpeas\b|\bnuts\b|\bseeds\b/, "nuts"],
  [/\bpotato(?:es)?\b|\bmash\b|\bhash\b|\bchips\b|\bwedges\b/, "potatoes"],
];

const FISH = /\bsalmon\b|\btuna\b|\bcod\b|\bhaddock\b|\bmackerel\b|\bprawns?\b|\bfish\b|\bsardines?\b|\bbasa\b|\bpollock\b/;
const MEAT = /\bchicken\b|\bbeef\b|\bturkey\b|\blamb\b|\bpork\b|\bham\b|\bbacon\b|\bgammon\b|\bsteaks?\b|\bchipolatas\b|\bsausages?\b|\bmeatballs\b|\bkebabs?\b|\bskewers\b/;

/**
 * The recipe's dish form, the first of: a soup (a soup "with toast" is a soup); anything made with tortilla wraps (wraps, burritos, fajitas, quesadillas, a
 * wrap pizza); a curry or stew by name; a pasta or noodle dish by its ingredients; the dish the name says before any "with" or "in" ("Potato cakes with salad"
 * are fritters), or its fish or meat ("Salmon with lemon rice" is a fish plate); rice by its ingredients; then the whole name, its fish, meat or eggs; and last
 * what is in it (oats, yogurt, bread, potatoes, a dip).
 */
export function dishForm(r: Pick<Recipe, "name" | "ingredients">): DishForm {
  const name = r.name.toLowerCase();
  const head = name.split(/\s+(?:with|in)\s+/)[0]!;
  const byName = (text: string): DishForm | null => BY_NAME.find(([re]) => re.test(text))?.[1] ?? null;
  const first = byName(head);
  if (/\bsoups?\b|\bminestrone\b/.test(name)) return "soup";
  if (has(r, "wraps")) return "wrap";
  if (first === "curry") return "curry";
  if (has(r, "pasta-long", "pasta-shapes", "lasagne-sheets", "gnocchi") || /\bspaghetti\b|\blinguine\b|\bpasta\b|\bmacaroni\b|\bpenne\b|\bfusilli\b|\bbolognese\b|\bcarbonara\b/.test(name)) return "pasta";
  if (has(r, "noodles", "egg-noodles", "rice-noodles")) return "noodles";
  if (first) return first;
  if (FISH.test(head)) return "fish";
  if (MEAT.test(head)) return "meat";
  if (has(r, "rice")) return "rice";
  const whole = byName(name);
  if (whole) return whole;
  if (FISH.test(name)) return "fish";
  if (MEAT.test(name)) return "meat";
  if (/\beggs?\b/.test(name)) return "eggs";
  if (has(r, "oats", "granola")) return "porridge";
  if (has(r, "greek-yogurt", "natural-yogurt", "skyr")) return "yogurt";
  if (has(r, "bread", "white-bread")) return "toast";
  if (has(r, "new-potatoes")) return "potatoes";
  return has(r, "houmous", "salsa") ? "dip" : "bites";
}

/** A dish form's memo by recipe object (a fitted recipe is a new object with the same name and kinds, so it is worked out again; it is cheap). */
const memo = new WeakMap<object, DishForm>();
export function dishFormOf(r: Pick<Recipe, "name" | "ingredients">): DishForm {
  let f = memo.get(r);
  if (!f) memo.set(r, (f = dishForm(r)));
  return f;
}

/**
 * How far a week of dish forms (days × slots, in the day's order) is from varied: one for each dish of a form already eaten that day, one for each slot whose
 * form is the same as the day before's in that slot, and one for each wrap over MAX_WRAPS_A_WEEK. 0 is a varied week.
 */
export function varietyFaults(week: ReadonlyArray<ReadonlyArray<DishForm | undefined>>): number {
  let faults = 0;
  let wraps = 0;
  week.forEach((day, d) => {
    const seen = new Set<DishForm>();
    day.forEach((f, i) => {
      if (!f) return;
      if (seen.has(f)) faults++;
      seen.add(f);
      if (d > 0 && week[d - 1]![i] === f) faults++;
      if (f === "wrap") wraps++;
    });
  });
  return faults + Math.max(0, wraps - MAX_WRAPS_A_WEEK);
}

/** The parts of varietyFaults, for tests and the screen's words: repeats in a day, the same form in a slot two days running, and the week's wraps. */
export function varietyReport(week: ReadonlyArray<ReadonlyArray<DishForm | undefined>>): { sameDay: number; dayAfter: number; wraps: number } {
  let sameDay = 0;
  let dayAfter = 0;
  let wraps = 0;
  week.forEach((day, d) => {
    const seen = new Set<DishForm>();
    day.forEach((f, i) => {
      if (!f) return;
      if (seen.has(f)) sameDay++;
      seen.add(f);
      if (d > 0 && week[d - 1]![i] === f) dayAfter++;
      if (f === "wrap") wraps++;
    });
  });
  return { sameDay, dayAfter, wraps };
}
