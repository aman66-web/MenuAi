import { dishFormOf, MAX_WRAPS_A_WEEK, varietyFaults, type DishForm } from "./dishForm";
import { balanceFaults, mealBalanceOf, type MealBalance } from "./mealBalance";
import { tk } from "./i18n";
import { ADULT_REFERENCE_KCAL, ALL_HOME_DIETS, platesFor, sanitizeHousehold, yourPortionDistance, type HomeDiet, type HomePerson } from "./household";
import { ALLERGEN_KEYS, type AllergenKey } from "./types";
import type { DietPrefs, MeatKind } from "./pantry";
import { PANTRY } from "./pantry";
import { candidates as productCandidates, fitDistance, fitRecipe, isMeatFree, isQuick, pickFor, PLAIN_SALT, recipeForDiet, recipeTotals, resolveRecipe, type IngredientPick, type IngredientSpec, type MealTarget, type MealType, type Recipe, type RecipeTotals } from "./recipes";
import { CUISINES, nicheOf, type CuisineId } from "./recipeBook/niches";
import { matchesNiche } from "./recipeNiche";
import { normalizeForSearch } from "./search";
import { productKey, type PricedProduct, type ShopProduct } from "./shopProducts";

// A week's meal plan (founder 2026-11-18: "they type all of this in, and then my app will make them a diet plan for a week. It'll tell them what they need to buy
// for the week for their shopping list ... how much the price is for each meal of each day ... the full cost ... Budget, amount of money per week"; "you should
// only use the pre-made recipes ... just filter it to that, and make the best plan for them"). No AI: only our own recipes, each fitted to the person's meal
// size exactly as the Recipes tab fits it (lib/mm/recipes.ts fitRecipe), left out when the diet, an allergy or a food they don't eat rules it out, and only
// when the chosen shop sells every ingredient with a read label and a price. A meal's price is what the amounts it uses cost at the shop's price per kg or
// litre (a serving's price on the recipe page); the shopping bill is the whole packs the week needs, every meal's amounts added up per product first, so a
// pack shared by two meals is bought once. Pure and unit-tested (tests/mealPlan.test.ts); the screen is app/app/plan.

export const PLAN_DAYS = 7;
export const PLAN_MEALS: readonly MealType[] = ["breakfast", "lunch", "dinner"];
/** How many different recipes each meal of the day rotates through in a week: four, so each comes round at most twice (variety, and packs shared). */
export const PER_MEAL_RECIPES = 4;
/**
 * How often a meal may come round (founder 2026-11-18: "they can choose if they want any foods repeated"): seven recipes for each meal (a different one every
 * day), four (each twice at most: the default) or two (meal prep: cooked in batches, the least left in the packs).
 */
export const VARIETIES = [7, 4, 2] as const;
export type Variety = (typeof VARIETIES)[number];

/**
 * Kinds whose leftovers keep well past the week (founder 2026-11-18: "by the end of the week, all the ingredients shall be basically almost complete. Except for
 * like the oil and the herb ... which can be spread out over a long time"): store-cupboard seasonings and oils, dry goods, jars and bottles, and frozen food.
 * Everything else is fresh food, and the plan is made so as little of it as possible is left in the packs.
 */
export const KEEPS_WELL: ReadonlySet<string> = new Set([
  "rice", "pasta-long", "pasta-shapes", "oats", "egg-noodles", "rice-noodles", "lasagne-sheets", "granola", "wheat-biscuits", "red-lentils", "raisins", "dried-cranberries", "almonds", "mixed-seeds",
  "olive-oil", "honey", "stock-cube", "fajita-seasoning", "soy", "peanut-butter", "sweet-chilli", "bbq-sauce", "teriyaki", "light-mayo", "pesto", "curry-paste", "thai-curry-paste", "chopped-tomato-puree", "cranberry-sauce", "apple-sauce", "mincemeat",
  "peas", "edamame", "berries",
]);
/** Whether what's left of this product after the week keeps (KEEPS_WELL, a cupboard item, or a product sold frozen). */
export const keepsWell = (spec: IngredientSpec, product: { name: string }): boolean => !!spec.cupboard || KEEPS_WELL.has(spec.pantry ?? spec.key) || /\bfrozen\b/i.test(product.name);
/**
 * What a day of the plan is made of (founder 2026-11-18: "should also specify how many meals and how many snacks they want a day ... full personalization"):
 * any of breakfast, lunch and dinner, and up to three snacks. The slots are the day's meals in that order, then the snacks.
 */
export interface DayShape { meals: MealType[]; snacks: number }
export const MAX_SNACKS = 3;
export const DEFAULT_SHAPE: DayShape = { meals: ["breakfast", "lunch", "dinner"], snacks: 0 };
export const planSlots = (shape: DayShape): MealType[] => [...PLAN_MEALS.filter((m) => shape.meals.includes(m)), ...Array.from({ length: shape.snacks }, () => "snack" as const)];
export const shapeOf = (slots: readonly MealType[]): DayShape => ({ meals: PLAN_MEALS.filter((m) => slots.includes(m)), snacks: slots.filter((m) => m === "snack").length });

/**
 * Each slot's size from the person's own daily numbers, so the day adds up to them: a snack is a tenth of the day (100-250 kcal), and the meals share the rest
 * equally (founder 2026-11-20: "clearly they all have to be the amount of calories that I wanted, 3,400 divided by 3"; until then a smaller breakfast and a
 * bigger dinner, each kept under 1,200 kcal, so a 3,400 kcal day came to 3,240). Each meal is at least 200 kcal, and under the GLP-1 meal cap when the person
 * has one: then the day can't add up, and the plan says so (capShortfall). Protein follows each slot's share of the day. Recipes are then fitted to these
 * sizes exactly as the Recipes tab fits them.
 */
export function slotTargets(shape: DayShape, daily: { kcal: number; protein: number }, cap?: number | null): Partial<Record<MealType, MealTarget>> {
  const out: Partial<Record<MealType, MealTarget>> = {};
  const round10 = (v: number) => Math.round(v / 10) * 10;
  const snackKcal = shape.snacks ? Math.min(250, Math.max(100, round10(daily.kcal * 0.1))) : 0;
  const meals = PLAN_MEALS.filter((m) => shape.meals.includes(m));
  const rest = daily.kcal - shape.snacks * snackKcal;
  const share = (kcal: number) => Math.max(5, Math.round((daily.protein * kcal) / Math.max(1, daily.kcal)));
  for (const m of meals) {
    let kcal = Math.max(200, round10(rest / Math.max(1, meals.length)));
    if (cap) kcal = Math.min(kcal, cap);
    out[m] = { kcal, protein: share(kcal) };
  }
  if (shape.snacks) out.snack = { kcal: snackKcal, protein: share(snackKcal) };
  return out;
}

/** How far the day's slots fall short of the daily calories (0 when they add up, within rounding): only a GLP-1 meal cap makes them fall short. */
export function capShortfall(shape: DayShape, targets: Partial<Record<MealType, MealTarget>>, dailyKcal: number): number {
  const total = shape.meals.reduce((t, m) => t + (targets[m]?.kcal ?? 0), 0) + shape.snacks * (targets.snack?.kcal ?? 0);
  const gap = dailyKcal - total;
  return gap > 30 * (shape.meals.length + shape.snacks) ? gap : 0;
}

/** A budget never swaps a meal for one this far from the meal size (fitDistance; 0.3 is about 30% off on calories): a cheap 200 kcal soup doesn't make a lunch. */
export const MAX_SWAP_DISTANCE = 0.3;

/** Foods people commonly leave out that a diet or an allergy doesn't already cover, as plain choices; each matches these words in a recipe's ingredients. */
export const LEAVE_OUT: ReadonlyArray<{ id: string; label: string; words: readonly string[] }> = [
  { id: "mushrooms", label: tk("Mushrooms"), words: ["mushroom"] },
  { id: "fish", label: tk("Fish and seafood"), words: ["fish", "salmon", "tuna", "cod", "haddock", "mackerel", "prawn", "seafood", "sardine", "anchov"] },
  { id: "eggs", label: tk("Eggs"), words: ["egg"] },
  { id: "onions", label: tk("Onions"), words: ["onion"] },
  { id: "peppers", label: tk("Peppers"), words: ["peppers", "red pepper", "green pepper", "yellow pepper"] },
  // a hot dish by its name too ("Crispy spiced chickpeas", "Devilled eggs"; usability test 2026-11-19: Irene left spicy food out and still got both), and its
  // dried spices count here (leavesOut): chilli flakes and cayenne are what make a dish hot
  { id: "spicy", label: tk("Spicy food"), words: ["chilli", "chili", "jalapeno", "jalapeño", "cayenne", "curry paste", "hot sauce", "sriracha", "spicy", "spiced",
    "devilled", "harissa", "peri peri", "piri piri", "gochujang", "chipotle", "cajun", "jerk", "vindaloo", "madras", "tabasco", "wasabi"] },
  { id: "tomatoes", label: tk("Tomatoes"), words: ["tomato", "passata"] },
  { id: "beans", label: tk("Beans and lentils"), words: ["bean", "lentil", "chickpea"] },
  // pesto is made with cheese (hard cheese in every jar we list), and paneer, ricotta and mascarpone are cheeses whose names don't say so
  { id: "cheese", label: tk("Cheese"), words: ["cheese", "cheddar", "mozzarella", "feta", "halloumi", "parmesan", "pesto", "paneer", "ricotta", "mascarpone"] },
  { id: "coconut", label: tk("Coconut"), words: ["coconut"] },
  { id: "rice", label: tk("Rice"), words: ["rice"] },
  { id: "pasta", label: tk("Pasta"), words: ["pasta", "spaghetti", "penne", "fusilli", "noodle"] },
];

/** The words a recipe is checked against for a food left out: its name and each ingredient's label and kind (never a seasoning's: "black pepper" is not peppers). */
function recipeWords(recipe: Recipe, seasonings = false): string {
  const parts = [recipe.name];
  for (const i of recipe.ingredients) {
    const kind = i.pantry ? PANTRY.get(i.pantry) : undefined;
    if (kind?.labelOptional && !seasonings) continue; // salt, pepper and dried spices
    parts.push(i.label, kind?.label ?? "");
  }
  return ` ${normalizeForSearch(parts.join(" "))} `;
}

/**
 * Typed words that name an allergen or a meat, and the pantry's own flags they leave out too (the 21 November meeting, Kemi: "nuts" left out nothing, as no
 * ingredient is called that, and "pork" missed the bacon and the ham): nuts are tree nuts and peanuts, as people mean them.
 */
const TYPED_KINDS: Readonly<Record<string, { contains?: readonly AllergenKey[]; meat?: MeatKind }>> = {
  nut: { contains: ["nuts", "peanuts"] }, nuts: { contains: ["nuts", "peanuts"] },
  peanut: { contains: ["peanuts"] }, peanuts: { contains: ["peanuts"] },
  sesame: { contains: ["sesame"] },
  soy: { contains: ["soya"] }, soya: { contains: ["soya"] },
  pork: { meat: "pork" },
};

/** Whether any of the recipe's ingredients is of a kind a typed word names by its flags (TYPED_KINDS). */
function hasTypedKind(recipe: Recipe, typed: string): boolean {
  const want = TYPED_KINDS[normalizeForSearch(typed).trim()];
  if (!want) return false;
  return recipe.ingredients.some((i) => {
    const k = i.pantry ? PANTRY.get(i.pantry) : undefined;
    return !!k && (!!want.contains?.some((a) => k.contains.includes(a)) || (!!want.meat && k.meat === want.meat));
  });
}

/** Whether a recipe has any of the foods left out (the choices above by id, or words the person typed). */
export function leavesOut(recipe: Recipe, leaveOut: readonly string[]): boolean {
  if (!leaveOut.length) return false;
  const hay = recipeWords(recipe);
  return leaveOut.some((x) => {
    const choice = LEAVE_OUT.find((c) => c.id === x);
    if (!choice && hasTypedKind(recipe, x)) return true;
    const words = choice ? choice.words : [x];
    const where = x === "spicy" ? recipeWords(recipe, true) : hay;
    return words.some((w) => {
      const n = normalizeForSearch(w);
      return n.length >= 3 && where.includes(` ${n}`);
    });
  });
}

/** Fewer than this many lunches (or dinners) of the kinds of food chosen, for the person's diet, and that meal takes any kind (cuisineRecipes). */
export const CUISINE_MIN = 3;

/**
 * Our recipes for the kinds of food chosen (founder 2026-11-19: "they should also be able to choose the cuisine or have the option to do any cuisine"): lunches
 * and dinners of those cuisines, by the recipe book's own cuisine lines; breakfasts and snacks whatever theirs (few have one); all of them when none is chosen.
 * A meal with fewer than CUISINE_MIN of them that suit the diet and the foods left out takes any kind instead, and is named in `widened`, so a choice never
 * leaves a meal with nothing (usability test 2026-11-19: vegetarian Indian at Asda had no lunches, and the plan couldn't go on).
 */
export function cuisineRecipes(recipes: readonly Recipe[], cuisines: readonly CuisineId[], diet: DietPrefs, leaveOut: readonly string[]): { recipes: Recipe[]; widened: MealType[] } {
  if (!cuisines.length) return { recipes: [...recipes], widened: [] };
  const fits = (r: Recipe) => { const d = recipeForDiet(r, diet); return !!d && !leavesOut(d, leaveOut); };
  const widened = (["lunch", "dinner"] as const).filter((meal) => recipes.filter((r) => r.meal === meal && matchesNiche(r.id, cuisines, []) && fits(r)).length < CUISINE_MIN);
  return { recipes: recipes.filter((r) => (r.meal !== "lunch" && r.meal !== "dinner") || widened.includes(r.meal) || matchesNiche(r.id, cuisines, [])), widened };
}

/** A recipe that can go in the plan: fitted to the meal, every ingredient at the shop with a price, and what one serving costs. */
export interface PlanCandidate {
  /** The shop every ingredient comes from (several shops: the one where this recipe fits best and costs least). */
  shop: string;
  recipe: Recipe;
  /** The recipe for the person's diet before it was fitted to the meal (a better version is fitted again from it). */
  base: Recipe;
  /** Made with the shop's better products (betterCandidate). */
  better?: boolean;
  meal: MealType;
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
  /** The rest of one serving's label (recipeTotals' label: null where any product doesn't print that figure), so a meal logged from the plan keeps its sugar,
   *  salt and fibre (Home's third page). Sized with perServing for a household. */
  label?: RecipeTotals["label"];
  /** What one serving's amounts cost (the recipe page's price a serving). */
  cost: number;
  /** The fitted recipe's products for its written servings. */
  picks: IngredientPick[];
  servings: number;
  /** How far one serving is from the meal size (0 = spot on). */
  distance: number;
  /** A plan cooked for a household (forHousehold): each person's amount in the recipe's written servings, the app user first. */
  plates?: number[];
  /** The candidate as written, before forHousehold sized it for everyone (its better version is made from this). */
  plain?: PlanCandidate;
}

/** Every recipe that can go in the plan, for each meal, closest to the meal size first (then cheapest, then name). */
export function planCandidates(
  recipes: readonly Recipe[],
  products: readonly ShopProduct[],
  diet: DietPrefs,
  targets: MealTarget | Partial<Record<MealType, MealTarget>> | null,
  leaveOut: readonly string[],
  shop = "",
  /** A household plan (forHousehold): the recipes as written, not fitted to the user's meal, for every slot `targets` names. */
  asWritten = false,
): Map<MealType, PlanCandidate[]> {
  // one size for breakfast, lunch and dinner (the Recipes tab's), or a size for each slot the day has (slotTargets)
  const single = !targets || "kcal" in targets;
  const wanted: MealType[] = single ? [...PLAN_MEALS] : (Object.keys(targets) as MealType[]);
  const targetFor = (m: MealType): MealTarget | null => (single ? ((targets as MealTarget | null) ?? null) : ((targets as Partial<Record<MealType, MealTarget>>)[m] ?? null));
  const out = new Map<MealType, PlanCandidate[]>(wanted.map((m) => [m, []]));
  for (const base of recipes) {
    if (!base.meal || !wanted.includes(base.meal)) continue;
    const target = targetFor(base.meal);
    const recipe = recipeForDiet(base, diet);
    if (!recipe || leavesOut(recipe, leaveOut)) continue;
    const fitted = target && !asWritten ? fitRecipe(recipe, products, {}, target) : null;
    const resolved = fitted ? fitted.resolved : resolveRecipe(recipe, products);
    const totals = fitted ? fitted.totals : recipeTotals(resolved);
    if (!totals || !resolved.complete || totals.costPerServing === null) continue;
    out.get(base.meal)!.push({
      shop,
      recipe: fitted ? fitted.recipe : recipe,
      base: recipe,
      meal: base.meal,
      perServing: totals.perServing,
      label: totals.label,
      cost: totals.costPerServing,
      picks: resolved.picks as IngredientPick[],
      servings: (fitted ? fitted.recipe : recipe).servings,
      distance: target && !asWritten ? fitDistance(totals.perServing, target) : 0,
    });
  }
  for (const list of out.values()) list.sort((a, b) => a.distance - b.distance || a.cost - b.cost || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
  return out;
}

/** How much further from the meal size another shop's version of a recipe may be and still be chosen for being cheaper (fitDistance units). */
export const SHOP_FIT_SLACK = 0.05;

/**
 * Every recipe that can go in the plan from any of the person's shops (founder 2026-11-18: "they're able to select multiple supermarkets ... it'll combine
 * everything and then choose the best meal plan overall"): each recipe is fitted at every shop, and the plan uses the shop where it comes closest to the meal
 * size, or a cheaper one that is as close (within SHOP_FIT_SLACK). All of one recipe's ingredients come from one shop, so a meal is bought in one place.
 */
export function planCandidatesAcross(
  recipes: readonly Recipe[],
  shops: ReadonlyArray<{ id: string; products: readonly ShopProduct[] }>,
  diet: DietPrefs,
  target: MealTarget | Partial<Record<MealType, MealTarget>> | null,
  leaveOut: readonly string[],
): Map<MealType, PlanCandidate[]> {
  return mergeCandidates(shops.map((sh) => planCandidates(recipes, sh.products, diet, target, leaveOut, sh.id)));
}

/** planCandidatesAcross's second half, for a screen that works out one shop at a time: each recipe from the shop where it fits best (see above). */
export function mergeCandidates(each: ReadonlyArray<Map<MealType, PlanCandidate[]>>): Map<MealType, PlanCandidate[]> {
  const meals = [...new Set(each.flatMap((m) => [...m.keys()]))];
  const out = new Map<MealType, PlanCandidate[]>(meals.map((m) => [m, []]));
  for (const meal of meals) {
    const byRecipe = new Map<string, PlanCandidate[]>();
    for (const cands of each) for (const c of cands.get(meal) ?? []) byRecipe.set(c.recipe.id, [...(byRecipe.get(c.recipe.id) ?? []), c]);
    for (const options of byRecipe.values()) {
      const closest = Math.min(...options.map((o) => o.distance));
      const best = options.filter((o) => o.distance <= closest + SHOP_FIT_SLACK).sort((a, b) => a.cost - b.cost || a.distance - b.distance || a.shop.localeCompare(b.shop))[0]!;
      out.get(meal)!.push(best);
    }
    out.get(meal)!.sort((a, b) => a.distance - b.distance || a.cost - b.cost || a.recipe.name.localeCompare(b.recipe.name, "en-GB"));
  }
  return out;
}

/**
 * Better produce (founder 2026-11-18: "higher than the green part is a higher budget to afford better produce"): the shops' own better ranges, organic and
 * free range, as their product names say.
 */
export const BETTER = /\b(taste the difference|finest|extra special|exceptional|the best|no\.? ?1|duchy|specially selected|deluxe|luxury|organic|free range)\b/i;

/**
 * The same recipe with each ingredient's better product where the shop sells one (the first such product the recipe page would offer for it), fitted to the
 * meal the same way. Cupboard things (oil, salt, stock) stay as they are. Null when the shop has no better product for any ingredient.
 */
export function betterCandidate(c: PlanCandidate, products: readonly ShopProduct[], target: MealTarget | null): PlanCandidate | null {
  const meatFree = isMeatFree(c.base);
  const chosen: Record<string, string> = {};
  for (const pick of c.picks) {
    if (pick.spec.cupboard || BETTER.test(pick.product.name)) continue;
    const alt = productCandidates(products, pick.spec, meatFree).find((a) => BETTER.test(a.product.name));
    if (alt) chosen[pick.spec.key] = productKey(alt.product);
  }
  if (!Object.keys(chosen).length) return null;
  const fitted = target ? fitRecipe(c.base, products, chosen, target) : null;
  const resolved = fitted ? fitted.resolved : resolveRecipe(c.base, products, chosen);
  const totals = fitted ? fitted.totals : recipeTotals(resolved);
  if (!totals || !resolved.complete || totals.costPerServing === null || totals.costPerServing <= c.cost) return null;
  const recipe = fitted ? fitted.recipe : c.base;
  return { ...c, recipe, perServing: totals.perServing, label: totals.label, cost: totals.costPerServing, picks: resolved.picks as IngredientPick[], servings: recipe.servings, distance: target ? fitDistance(totals.perServing, target) : 0, better: true };
}

/** The candidates with some recipes (by "meal:id") made with better products. */
export function withBetter(cands: Map<MealType, PlanCandidate[]>, better: ReadonlyMap<string, PlanCandidate>): Map<MealType, PlanCandidate[]> {
  if (!better.size) return cands;
  return new Map([...cands].map(([meal, list]) => [meal, list.map((c) => better.get(`${meal}:${c.recipe.id}`) ?? c)]));
}

// ---------- how the person likes to eat ----------

/**
 * How the person likes to eat (founder 2026-11-20, 12:48: a step "How do you like to eat?" with picture tiles; 22:00: "Give more options like keto or whatever,
 * like as many options as you can think about people would choose"; 22:25: "make the most longevity-backed diet ... that's the one that I want to see"). Each
 * style is a plain rule judged on each meal as the plan makes it: the shop's own labels for the recipe fitted to the meal (as written, for a household), never
 * a figure of ours (CLAUDE.md rule 1); its tile says only that rule (rule 3). In the order the step shows them: Balanced, Longevity (the founder's own pick),
 * the kinds most people choose, then the rest. A style is offered only while our recipes give at least STYLE_MIN_RECIPES breakfasts, lunches and dinners of
 * it at Sainsbury's (tests/eatingStyle.test.ts measures every style per meal there and at Morrisons). Not offered: dairy-free and gluten-free, which the
 * allergy step's Milk and Gluten already do (milk 36/43/91 and gluten 20/31/54 at Sainsbury's would have been enough).
 */
export const EATING_STYLES = [
  "balanced", "longevity", "highProtein", "lowerCarb", "keto", "mediterranean", "vegetarian", "vegan", "pescatarian", "paleo", "quick", "lowFat", "highFibre", "lowerSugar", "lowerSalt",
] as const;
export type EatingStyle = (typeof EATING_STYLES)[number];
/** A style is offered only with at least this many breakfasts, lunches and dinners of it at Sainsbury's (tests/eatingStyle.test.ts). */
export const STYLE_MIN_RECIPES = 6;
/** At the person's own shops, for their diet: a style with fewer than this many of one of their day's meals is shown greyed, with the reason (styleTooFew). */
export const STYLE_MIN_AT_SHOP = 3;

/** High protein: at least this share of a serving's calories from protein (4 kcal a gram). */
export const HIGH_PROTEIN_MIN = 0.3;
/** Lower carb: at most this share of a serving's calories from carbs (4 kcal a gram). */
export const LOWER_CARB_MAX = 0.25;
/** Keto: at most this share of a serving's calories from carbs (4 kcal a gram). A fat-of-at-least-half rule was tried as well: it changed nothing on our recipes. */
export const KETO_CARBS_MAX = 0.1;
/** Low fat: at most this share of a serving's calories from fat (9 kcal a gram). No UK per-meal claim to follow; UK advice caps fat at 35% of food energy. */
export const LOW_FAT_MAX = 0.2;
/**
 * High protein and Lower carb fit each meal to at least this share of its calories from protein (the person's own protein for the meal when that is more), a
 * little over the line so a fitted serving lands over it; carbs make way. Measured at Sainsbury's for a 2,000 kcal day: high-protein dinners go from 7 to 44 of
 * 79, lower-carb dinners from 1 to 9 (tests/eatingStyle.test.ts).
 */
export const STYLE_PROTEIN_FIT = 0.32;

/**
 * Longevity (founder 2026-11-20, 22:25: "the most longevity-backed diet ... scientifically proven for longevity"): the pattern the long-term studies of how
 * people eat and how long they live agree on, as plain rules on each meal; never on screen as a claim (the tile says what is in the meals). Basis: PREDIMED
 * (Estruch et al., NEJM 2013, re-analysed 2018); Trichopoulou et al., NEJM 2003 (Mediterranean diet adherence and mortality); the Blue Zones (Buettner & Skemp,
 * Am J Lifestyle Med 2016); Adventist Health Study-2 (Orlich et al., JAMA Intern Med 2013: vegetarian and pesco-vegetarian patterns); the EAT-Lancet Commission
 * (Willett et al., Lancet 2019); GBD 2017 Diet Collaborators (Lancet 2019: high sodium, low whole grains, fruit, nuts and seeds, vegetables and omega-3 seafood
 * among the leading diet risks); SACN Carbohydrates and Health 2015; SACN Saturated fats and health 2019; the NHS salt and 5 A Day pages. A meal is of it when
 * ALL of these hold:
 *   1. no meat (no kind with `meat`: beef, lamb, pork, bacon, ham, chicken or turkey); fish, eggs and dairy are in;
 *   2. at least one of the foods those studies share: pulses, nuts and seeds, oily fish or whole grains (LONGEVITY_FOODS);
 *   3. a meal (not a snack) has at least VEG_FRUIT_MIN_G of vegetables and fruit a serving by the recipe's own amounts (VEG_FRUIT; potatoes and pulses don't count);
 *   4. nothing sweetened (SWEETENED);
 *   5. olive oil is the only oil (no vegetable oil or oil spray);
 *   6. the fibre its products print adds up to at least LONGEVITY_FIBRE_PER_100KCAL a 100 kcal (SACN/NHS 30 g a day at 2,000 kcal);
 *   7. the saturates they print stay at or under LONGEVITY_SATURATES_MAX of its calories (9 kcal a gram; SACN 2019);
 *   8. the salt they print stays at or under LONGEVITY_SALT_PER_100KCAL a 100 kcal (NHS 6 g a day at 2,000 kcal).
 * 6 to 8 are worked out from the picks themselves (printedPer100), so a household's sizing can't skew them; a figure a label doesn't print counts as none, so
 * fibre is never claimed above what the labels show.
 */
export const LONGEVITY_FIBRE_PER_100KCAL = 1.5;
export const LONGEVITY_SATURATES_MAX = 0.1;
export const LONGEVITY_SALT_PER_100KCAL = 0.3;
/** Vegetables and fruit a meal of Longevity or Mediterranean has at least, a serving, by the recipe's own amounts (an NHS 5 A Day portion). */
export const VEG_FRUIT_MIN_G = 80;
/** Mediterranean: at most this much cheese a serving (keeps out the cheese bakes; a saturated-fat limit was tried instead, and kept out olive-oil and salmon dishes too). */
export const MEDITERRANEAN_CHEESE_MAX_G = 40;
/** High fibre: at least this much fibre printed on a meal's products (a third of the NHS/SACN 30 g a day), or HIGH_FIBRE_SNACK_MIN_G for a snack (the UK "source of fibre" figure). */
export const HIGH_FIBRE_MIN_G = 10;
export const HIGH_FIBRE_SNACK_MIN_G = 3;
/** Lower sugar: at most this much total sugars a meal (labels give no added-sugar figure), or LOWER_SUGAR_SNACK_MAX_G a snack; the NHS: 30 g of free sugars a day at most. */
export const LOWER_SUGAR_MAX_G = 10;
export const LOWER_SUGAR_SNACK_MAX_G = 5;
/** Lower salt: at most this much salt a meal (a sixth of the NHS 6 g a day; the UK front-of-pack red line is 1.8 g a portion), or LOWER_SALT_SNACK_MAX_G a snack. */
export const LOWER_SALT_MAX_G = 1;
export const LOWER_SALT_SNACK_MAX_G = 0.3;

/** Vegetables and fruit, by pantry kind (an NHS 5 A Day portion is 80 g; potatoes and pulses don't count). */
export const VEG_FRUIT: ReadonlySet<string> = new Set([
  "onion", "red-onion", "spring-onions", "carrots", "peppers", "fresh-chilli", "spinach", "cherry-tomatoes", "tomatoes", "cucumber", "lettuce", "salad-leaves", "green-beans", "broccoli",
  "mangetout", "beansprouts", "mushrooms", "stir-fry-veg", "banana", "apple", "berries", "chopped-tomatoes", "passata", "sweetcorn", "peas", "mixed-veg", "brussels-sprouts", "parsnips",
  "red-cabbage", "raisins", "dried-cranberries",
]);
const PULSES = ["chickpeas", "kidney-beans", "black-beans", "butter-beans", "green-lentils", "red-lentils", "baked-beans", "edamame", "houmous"];
const NUTS_SEEDS = ["almonds", "mixed-seeds", "sesame-seeds", "peanut-butter"];
const OILY_FISH = ["salmon", "smoked-salmon", "tinned-salmon", "mackerel"];
/** The foods the longevity studies share: pulses, nuts and seeds, oily fish and whole grains (oats, the wholemeal loaf, wholewheat biscuits). */
export const LONGEVITY_FOODS: ReadonlySet<string> = new Set([...PULSES, ...NUTS_SEEDS, ...OILY_FISH, "oats", "bread", "wheat-biscuits"]);
/** Kinds sweetened with sugar or honey, or dried fruit sugared as sold. */
export const SWEETENED: ReadonlySet<string> = new Set(["honey", "sweet-chilli", "bbq-sauce", "teriyaki", "granola", "cranberry-sauce", "mincemeat", "apple-sauce", "dried-cranberries"]);
const OTHER_OILS: ReadonlySet<string> = new Set(["vegetable-oil", "oil-spray"]);
const CHEESES: ReadonlySet<string> = new Set(["cheddar", "mozzarella", "soft-cheese", "cottage-cheese", "parmesan", "feta", "halloumi", "paneer"]);
/** Mediterranean: at least one of olive oil, fish, pulses or nuts and seeds. */
const MEDITERRANEAN_FOODS: ReadonlySet<string> = new Set(["olive-oil", ...PULSES, ...NUTS_SEEDS]);
/** Cuisines whose dishes aren't Mediterranean, whatever is in them (niches.ts). */
const NOT_MEDITERRANEAN: ReadonlySet<string> = new Set(["chinese", "indian", "mexican"]);
/**
 * Paleo: meat, fish, eggs, vegetables, fruit, nuts and seeds, olive oil and plain seasonings. So no grains, beans or peanuts, no soy, dairy or potatoes, no
 * sweeteners or sauces, no bacon or ham, no vegetable oils and no stock cubes. Every ingredient of a paleo meal is one of these kinds.
 */
export const PALEO_KINDS: ReadonlySet<string> = new Set([
  "chicken", "chicken-thigh", "beef-mince", "turkey-mince", "lamb-mince", "beef-steak", "turkey-breast",
  "salmon", "cod", "tuna", "prawns", "smoked-salmon", "tinned-salmon", "mackerel", "white-fish", "eggs",
  ...[...VEG_FRUIT].filter((k) => !["sweetcorn", "peas", "raisins", "dried-cranberries"].includes(k)),
  "almonds", "mixed-seeds", "sesame-seeds", "olive-oil", "coconut-milk", "chopped-tomato-puree",
  "salt", "black-pepper", "white-pepper", "cumin", "paprika", "smoked-paprika", "chilli-powder", "chilli-flakes", "cinnamon", "turmeric", "curry-powder", "mixed-herbs", "oregano",
  "thyme", "rosemary", "dill", "chives", "mint", "mixed-spice", "nutmeg", "garlic", "ginger", "lemon-juice", "lime-juice", "fresh-coriander", "fresh-parsley", "fresh-basil",
]);

/** The meal sizes each style's recipes are fitted to (styleTargets): the person's own, protein raised, carbs capped (keto) or fat capped (low fat). */
export type StyleFit = "own" | "protein" | "keto" | "lowFat";
export const STYLE_FIT: Record<EatingStyle, StyleFit> = {
  balanced: "own", longevity: "own", highProtein: "protein", lowerCarb: "protein", keto: "keto", mediterranean: "own", vegetarian: "own", vegan: "own", pescatarian: "own",
  paleo: "own", quick: "own", lowFat: "lowFat", highFibre: "own", lowerSugar: "own", lowerSalt: "own",
};

/** A serving's own figures, for a list already of the style: only the figure rules are judged (the rest need the candidate's products and recipe). */
export type StyleServing = { kcal: number; protein: number; carbs: number; fat?: number };

/** The kinds a candidate is made of: what was bought (a substitute in an ingredient's place counts as itself), else the recipe's own. */
const kindsOf = (c: PlanCandidate): string[] => (c.picks.length ? c.picks.map((p) => p.spec.pantry ?? p.spec.key) : c.recipe.ingredients.map((i) => i.pantry ?? i.key));

/** Grams a serving of these kinds, by the recipe's own amounts (as fitted; a household's plan is as written). */
function gramsOf(c: PlanCandidate, kinds: ReadonlySet<string>): number {
  const specs = c.picks.length ? c.picks.map((p) => p.spec) : c.recipe.ingredients;
  return specs.reduce((g, s) => g + (kinds.has(s.pantry ?? s.key) ? s.amount : 0), 0) / Math.max(1, c.recipe.servings);
}

/**
 * What a serving's products print of a nutrient for every 100 kcal they print (a figure a label leaves out counts as 0; salt with no label as table salt, as
 * recipeTotals counts it). From the picks themselves, so the servings cancel out and a household's sizing can't skew it. Null when they print no calories.
 */
export function printedPer100(c: Pick<PlanCandidate, "picks">, k: "fibre" | "saturates" | "salt"): number | null {
  let kcal = 0;
  let v = 0;
  for (const p of c.picks) {
    const n = p.product.nutrition ?? (p.spec.pantry === "salt" ? PLAIN_SALT : null);
    if (!n) continue;
    kcal += n.kcal * p.spec.amount;
    v += (n[k] ?? 0) * p.spec.amount;
  }
  return kcal > 0 ? (100 * v) / kcal : null;
}

/** The fibre printed on a serving's products, for the person's own serving (printedPer100 times its calories). */
const servingFibre = (c: PlanCandidate): number => ((printedPer100(c, "fibre") ?? 0) * c.perServing.kcal) / 100;

/**
 * Whether a meal is of this style (Balanced: every meal). Given a plan candidate, every rule is judged; given only a serving's figures (a list already of the
 * style), only the figure rules, and the rest count as met.
 */
export function fitsStyle(x: PlanCandidate | StyleServing, style: EatingStyle): boolean {
  if (style === "balanced") return true;
  const c = "perServing" in x ? x : null;
  const s: StyleServing = c ? c.perServing : (x as StyleServing);
  const share = (grams: number, kcalPerGram: number) => (s.kcal > 0 ? (kcalPerGram * grams) / s.kcal : NaN);
  switch (style) {
    case "highProtein": return share(s.protein, 4) >= HIGH_PROTEIN_MIN;
    case "lowerCarb": return share(s.carbs, 4) <= LOWER_CARB_MAX;
    case "keto": return share(s.carbs, 4) <= KETO_CARBS_MAX;
    case "lowFat": return s.fat !== undefined && share(s.fat, 9) <= LOW_FAT_MAX;
  }
  if (!c) return true;
  const snack = c.meal === "snack";
  const kinds = kindsOf(c);
  const kind = (k: string) => PANTRY.get(k);
  switch (style) {
    case "longevity": {
      if (kinds.some((k) => kind(k)?.meat || SWEETENED.has(k) || OTHER_OILS.has(k))) return false;
      if (!kinds.some((k) => LONGEVITY_FOODS.has(k))) return false;
      if (!snack && gramsOf(c, VEG_FRUIT) < VEG_FRUIT_MIN_G) return false;
      const fibre = printedPer100(c, "fibre");
      const sat = printedPer100(c, "saturates");
      const salt = printedPer100(c, "salt");
      return fibre !== null && fibre >= LONGEVITY_FIBRE_PER_100KCAL && (9 * (sat ?? 0)) / 100 <= LONGEVITY_SATURATES_MAX && (salt ?? 0) <= LONGEVITY_SALT_PER_100KCAL;
    }
    case "mediterranean": {
      if (kinds.some((k) => { const m = kind(k)?.meat; return m === "beef" || m === "lamb" || m === "pork"; }) || kinds.some((k) => OTHER_OILS.has(k))) return false;
      if (!kinds.some((k) => MEDITERRANEAN_FOODS.has(k) || (kind(k)?.fish && kind(k)?.role === "protein"))) return false;
      if (!snack && gramsOf(c, VEG_FRUIT) < VEG_FRUIT_MIN_G) return false;
      if (gramsOf(c, CHEESES) > MEDITERRANEAN_CHEESE_MAX_G) return false;
      return !NOT_MEDITERRANEAN.has(nicheOf(c.recipe.id).cuisine ?? "");
    }
    // the diets as the person's own diet picker applies them; Vegetarian also never with a cheese usually made with animal rennet, unless the person's own diet
    // already chose the version without it (recipeForDiet's `vegetarian`)
    case "vegetarian": return recipeForDiet(c.base, { vegetarianOnly: true }) !== null && (!!c.base.vegetarian || !kinds.some((k) => kind(k)?.rennet));
    case "vegan": return recipeForDiet(c.base, { veganOnly: true }) !== null;
    case "pescatarian": return recipeForDiet(c.base, { pescatarianOnly: true }) !== null;
    case "paleo": return kinds.every((k) => PALEO_KINDS.has(k));
    case "quick": return isQuick(c.base);
    // a figure no label prints never counts as low: an unknown is no claim of a maximum
    case "highFibre": return servingFibre(c) >= (snack ? HIGH_FIBRE_SNACK_MIN_G : HIGH_FIBRE_MIN_G);
    case "lowerSugar": return c.label?.sugars != null && c.label.sugars <= (snack ? LOWER_SUGAR_SNACK_MAX_G : LOWER_SUGAR_MAX_G);
    case "lowerSalt": return c.label?.salt != null && c.label.salt <= (snack ? LOWER_SALT_SNACK_MAX_G : LOWER_SALT_MAX_G);
  }
  return true;
}

/**
 * The meal sizes the recipes are fitted to for a style (STYLE_FIT): the same calories, with protein raised to STYLE_PROTEIN_FIT of them (High protein, Lower
 * carb), carbs capped at KETO_CARBS_MAX of them (Keto) or fat at LOW_FAT_MAX (Low fat). The person's own sizes come back as the same object.
 */
export function styleTargets(targets: Partial<Record<MealType, MealTarget>>, style: EatingStyle): Partial<Record<MealType, MealTarget>> {
  const fit = STYLE_FIT[style];
  if (fit === "own") return targets;
  const out: Partial<Record<MealType, MealTarget>> = {};
  for (const [m, t] of Object.entries(targets) as Array<[MealType, MealTarget]>) {
    out[m] = fit === "protein" ? { ...t, protein: Math.max(t.protein ?? 0, Math.round((t.kcal * STYLE_PROTEIN_FIT) / 4)) }
      : fit === "keto" ? { ...t, carbsMax: Math.max(1, Math.round((t.kcal * KETO_CARBS_MAX) / 4)) }
      : { ...t, fatMax: Math.max(1, Math.round((t.kcal * LOW_FAT_MAX) / 9)) };
  }
  return out;
}

/** Whether the person's own diet already is this style, so its tile isn't shown: Vegetarian for a vegetarian, vegan or Jain diet, Vegan for a vegan one, Pescatarian for any diet without meat. */
export function styleInDiet(style: EatingStyle, diet: DietPrefs): boolean {
  const noMeat = !!(diet.vegetarianOnly || diet.veganOnly || diet.jain);
  return style === "vegetarian" ? noMeat : style === "vegan" ? !!diet.veganOnly : style === "pescatarian" ? noMeat || !!diet.pescatarianOnly : false;
}

/** How many of a style's own recipes each meal has among these candidates. */
export function styleCount(cands: ReadonlyMap<MealType, readonly PlanCandidate[]>, style: EatingStyle, meal: MealType): number {
  return (cands.get(meal) ?? []).filter((c) => fitsStyle(c, style)).length;
}

/**
 * The meals of the person's day (never the snacks: a short snack takes any) that have fewer than STYLE_MIN_AT_SHOP of the style at their shops for their diet,
 * so its tile is shown greyed with the reason; empty when it can be chosen. Balanced is never short.
 */
export function styleTooFew(cands: ReadonlyMap<MealType, readonly PlanCandidate[]>, style: EatingStyle, slots: readonly MealType[]): MealType[] {
  if (style === "balanced") return [];
  return PLAN_MEALS.filter((m) => slots.includes(m) && styleCount(cands, style, m) < STYLE_MIN_AT_SHOP);
}

const styleMemo = new WeakMap<Map<MealType, PlanCandidate[]>, Map<EatingStyle, Map<MealType, PlanCandidate[]>>>();

/**
 * The candidates of a style: each meal's that fit it, in the same order. A meal with none of them keeps all of its own (styleShortfall names it), so the week
 * never has a gap; a meal with a few rotates through those few, so they repeat. The same map comes back for the same style, so makePlan's memo holds.
 */
export function styleCandidates(cands: Map<MealType, PlanCandidate[]>, style: EatingStyle): Map<MealType, PlanCandidate[]> {
  if (style === "balanced") return cands;
  let byStyle = styleMemo.get(cands);
  if (!byStyle) styleMemo.set(cands, (byStyle = new Map()));
  let out = byStyle.get(style);
  if (!out) {
    out = new Map([...cands].map(([meal, list]) => {
      const fit = list.filter((c) => fitsStyle(c, style));
      return [meal, fit.length ? fit : list];
    }));
    byStyle.set(style, out);
  }
  return out;
}

/** Which of the day's meals have none of a style (they take any recipe) and which only a few (fewer than `variety` for each time a day it comes: they repeat). */
export interface StyleShort { none: MealType[]; few: Array<{ meal: MealType; n: number }> }

export function styleShortfall(cands: Map<MealType, PlanCandidate[]>, style: EatingStyle, slots: readonly MealType[], variety: number = PER_MEAL_RECIPES): StyleShort {
  const out: StyleShort = { none: [], few: [] };
  if (style === "balanced") return out;
  for (const meal of [...new Set(slots)]) {
    const list = cands.get(meal) ?? [];
    if (!list.length) continue; // no recipe at all: the plan says so its own way
    const n = list.filter((c) => fitsStyle(c, style)).length;
    if (n === 0) out.none.push(meal);
    else if (n < variety * slots.filter((x) => x === meal).length) out.few.push({ meal, n });
  }
  return out;
}

/** betterOf for a style: a recipe of the style is never made with products that take it out of the style (its plain version stays instead). */
export function styleBetter(betterOf: (c: PlanCandidate) => PlanCandidate | null, style: EatingStyle): (c: PlanCandidate) => PlanCandidate | null {
  if (style === "balanced") return betterOf;
  return (c) => {
    const b = betterOf(c);
    return b && fitsStyle(c, style) && !fitsStyle(b, style) ? null : b;
  };
}

/**
 * Each style's picture on its tile: one of our own recipes of that style (CLAUDE.md rule 2: our recipes' pictures), the first that suits the person's diet as
 * it is (no ingredient swapped for the diet, so the picture shows what they'd eat): a dish most people can eat first (so the first tiles don't all show
 * salmon), then a vegetarian and a vegan one where the style has them. No recipe is on two styles' lists, so no picture is on two tiles.
 * tests/eatingStyle.test.ts checks each is of its style at Sainsbury's and has a picture. None suits (High protein for a vegan): no picture.
 */
export const STYLE_PICTURES: Record<EatingStyle, readonly string[]> = {
  balanced: ["salmon-new-potatoes-peas", "mexican-bean-rice-bowl", "chickpea-rice-bowl", "coconut-rice-pudding-berries"],
  longevity: ["salmon-chickpea-lemon-salad", "egg-chickpea-spinach-salad", "crushed-chickpeas-tomatoes-toast", "peanut-butter-banana-toast", "bean-potato-hash"],
  highProtein: ["lemon-garlic-chicken-potatoes", "beans-poached-eggs", "bacon-tomato-sandwich"],
  lowerCarb: ["shakshuka", "pesto-salmon-crushed-potatoes", "paprika-roasted-almonds"],
  keto: ["pepper-spinach-cheddar-frittata", "mushroom-cheddar-omelette", "ham-pepper-egg-cups"],
  mediterranean: ["lemony-chickpea-potato-salad", "salmon-lemon-rice-broccoli", "tomato-olive-oil-toast-eggs", "crispy-potatoes-garlic-mushrooms", "bircher-muesli"],
  vegetarian: ["spanish-omelette", "bean-chilli", "apple-cinnamon-baked-oats"],
  vegan: ["coconut-vegetable-curry", "moroccan-chickpea-stew", "berry-almond-porridge", "curried-rice-salad"],
  pescatarian: ["tuna-bean-salad", "salmon-potato-salad-cucumber-yogurt", "apple-cinnamon-porridge"],
  paleo: ["smoked-salmon-eggs"],
  quick: ["scrambled-eggs-on-toast", "garlic-mushrooms-on-toast", "cottage-cheese-berries"],
  lowFat: ["chicken-rice-bowl", "bean-tomato-soup", "wheat-biscuits-berries", "rice-stuffed-peppers"],
  highFibre: ["chickpea-potato-traybake", "smoky-tomato-beans-toast", "wheat-biscuits-banana-almonds"],
  lowerSugar: ["boiled-eggs-toast-soldiers", "chickpea-tomato-salad", "cheese-tomato-on-toast"],
  lowerSalt: ["carrot-raisin-porridge", "banana-berry-overnight-oats", "potato-pea-curry"],
};

export function stylePicture(style: EatingStyle, diet: DietPrefs, recipeById: (id: string) => Recipe | undefined): string | null {
  for (const id of STYLE_PICTURES[style]) {
    const r = recipeById(id);
    const d = r ? recipeForDiet(r, diet) : null;
    if (r && d && d.ingredients.every((i, k) => i.label === r.ingredients[k]?.label)) return id;
  }
  return null;
}

/**
 * How many people the week's shopping is for (usability test 2026-11-19, Raj: a plan "for two"). Every meal is sized to the person's own numbers and the
 * same is bought for each of the others; the day's calories and protein stay one person's.
 */
export const PLAN_PEOPLE = [1, 2, 3, 4, 5, 6] as const;

const forPeopleMemo = new WeakMap<Map<MealType, PlanCandidate[]>, Map<number, Map<MealType, PlanCandidate[]>>>();
const timesPeople = (c: PlanCandidate, people: number): PlanCandidate => ({ ...c, servings: c.servings / people, cost: c.cost * people });

/**
 * The candidates for a week cooked for `people`: each meal's amounts and its price are `people` servings' (buildWeek and the pack search read amount / servings),
 * so the shopping list buys enough for everyone and packs are shared out the same way. The same map comes back for the same people, so makePlan's memo holds.
 */
export function forPeople(cands: Map<MealType, PlanCandidate[]>, people: number): Map<MealType, PlanCandidate[]> {
  if (!(people > 1)) return cands;
  let byPeople = forPeopleMemo.get(cands);
  if (!byPeople) forPeopleMemo.set(cands, (byPeople = new Map()));
  let out = byPeople.get(people);
  if (!out) byPeople.set(people, (out = new Map([...cands].map(([meal, list]) => [meal, list.map((c) => timesPeople(c, people))]))));
  return out;
}

/** betterOf for candidates made for `people` (forPeople): the better version is found from one person's candidate, then made for everyone the same way. */
export function betterForPeople(betterOf: (c: PlanCandidate) => PlanCandidate | null, people: number): (c: PlanCandidate) => PlanCandidate | null {
  if (!(people > 1)) return betterOf;
  return (c) => {
    const b = betterOf(timesPeople(c, 1 / people));
    return b ? timesPeople(b, people) : null;
  };
}

/**
 * A plan cooked for a household (founder 2026-11-19, the 20-agent meeting: "cook recipes as written and measure your portion out"): every recipe as written,
 * scaled to everyone's portions (household.ts platesFor), so the shopping and the price are the home's; the user's own portion matches their meal, and
 * recipes whose written version suits the user's meal come first. Snacks are just for the user. Never fitted to the user's targets for everyone.
 */
export interface HouseholdSizing {
  targets: Partial<Record<MealType, MealTarget>>;
  yourDailyKcal: number;
  others: readonly Pick<HomePerson, "group" | "portion" | "kcal" | "protein">[];
  /**
   * Each meal for a grown-up's 2,000 kcal reference day (householdReference): the others' portions are sized from these, never from the user's own meal, so a
   * GLP-1 meal size (which keeps only the user's meals small) doesn't shrink everyone else's. Absent: from the user's meal scaled to 2,000 kcal, as before.
   */
  referenceTargets?: Partial<Record<MealType, MealTarget>>;
}

/**
 * The meals of a grown-up's reference day (ADULT_REFERENCE_KCAL, the 2,000 kcal on UK labels) for this day's meals, with no snacks (snacks are just for the
 * user) and no meal cap: what the others in a household are sized from (HouseholdSizing.referenceTargets).
 */
export function householdReference(shape: DayShape): Partial<Record<MealType, MealTarget>> {
  return slotTargets({ meals: shape.meals, snacks: 0 }, { kcal: ADULT_REFERENCE_KCAL, protein: 0 }, null);
}

/** A serving's label figures times `k` (null stays null: a figure no label printed is never made up). */
function scaleLabel(l: RecipeTotals["label"], k: number): RecipeTotals["label"] {
  const x = (n: number | null) => (n === null ? null : n * k);
  return { kj: x(l.kj), saturates: x(l.saturates), sugars: x(l.sugars), fibre: x(l.fibre), salt: x(l.salt) };
}

export function householdCandidate(c: PlanCandidate, s: HouseholdSizing): PlanCandidate {
  const target = s.targets[c.meal];
  if (!target) return c;
  const plain = c.plain ?? c;
  const plates = platesFor(c.meal, plain.perServing.kcal, target, s.yourDailyKcal, s.others as HomePerson[], s.referenceTargets?.[c.meal]?.kcal);
  const you = plates.servings[0]!;
  const ps = plain.perServing;
  return {
    ...plain,
    plain,
    plates: plates.servings,
    servings: plain.servings / plates.total,
    cost: plain.cost * plates.total,
    perServing: { kcal: ps.kcal * you, protein: ps.protein * you, carbs: ps.carbs * you, fat: ps.fat * you },
    ...(plain.label ? { label: scaleLabel(plain.label, you) } : {}),
    distance: yourPortionDistance(ps, you, target) + othersProteinGap(c.meal, ps.protein, plates.servings.slice(1), s),
  };
}

/**
 * How far the others' portions fall short of their own protein (founder 2026-11-21: "how many calories and how much protein ... each person's different"),
 * added to the recipe's distance at PROTEIN_GAP_WEIGHT, so for a household with a high-protein eater the recipes that give them more of it come first. Each
 * person's meal share of their day's protein is that meal's share of a 2,000 kcal day (householdReference); a person with no protein typed counts nothing.
 */
const PROTEIN_GAP_WEIGHT = 0.3;
function othersProteinGap(meal: MealType, servingProtein: number, servings: readonly number[], s: HouseholdSizing): number {
  const ref = s.referenceTargets?.[meal]?.kcal;
  if (!ref || meal === "snack") return 0;
  let gap = 0;
  let n = 0;
  s.others.forEach((p, i) => {
    if (!p.protein) return;
    const want = (p.protein * ref) / ADULT_REFERENCE_KCAL;
    const got = servingProtein * (servings[i] ?? 0);
    gap += Math.max(0, want - got) / want;
    n++;
  });
  return n ? (PROTEIN_GAP_WEIGHT * gap) / n : 0;
}

const householdMemo = new WeakMap<Map<MealType, PlanCandidate[]>, Map<string, Map<MealType, PlanCandidate[]>>>();

/** The as-written candidates (planCandidates with asWritten) sized for the household; the same map comes back for the same sizing, so makePlan's memo holds. */
export function forHousehold(cands: Map<MealType, PlanCandidate[]>, s: HouseholdSizing): Map<MealType, PlanCandidate[]> {
  const key = JSON.stringify([s.targets, s.yourDailyKcal, s.others.map((p) => [p.group, p.portion]), s.referenceTargets ?? null]);
  let byKey = householdMemo.get(cands);
  if (!byKey) householdMemo.set(cands, (byKey = new Map()));
  let out = byKey.get(key);
  if (!out) {
    out = new Map([...cands].map(([meal, list]) => [meal, list.map((c) => householdCandidate(c, s)).sort((a, b) => a.distance - b.distance || a.cost - b.cost || a.recipe.name.localeCompare(b.recipe.name, "en-GB"))]));
    byKey.set(key, out);
  }
  return out;
}

/** betterOf for household candidates: the better version is made from the plain (as written) candidate, then sized for the household the same way. */
export function betterForHousehold(betterOf: (c: PlanCandidate) => PlanCandidate | null, s: HouseholdSizing): (c: PlanCandidate) => PlanCandidate | null {
  return (c) => {
    const b = betterOf(c.plain ?? c);
    return b ? householdCandidate({ ...b, plain: undefined }, s) : null;
  };
}

/** The budget slider's three points: the cheapest week the recipes allow, the best fit for the person's goal, and that week with every better product. */
export interface BudgetRange { min: number; best: number; max: number }

/** The plan for a budget, and which of its recipes use better products (by "meal:id"). */
export interface BudgetPlan { ids: PlanIds; week: WeekPlan; better: string[] }

/**
 * The week for a budget (founder 2026-11-18: "lower on the scale is lower value produce but still to fit what they want; they can't go lower than what they
 * want"): under the best fit's bill, makePlan swaps in cheaper recipes (never one far from the meal size); at or over it, the best fit's recipes are made with
 * better products, the one that adds least to the bill first, while the bill stays within the budget. Null budget: the best fit.
 */
export function planForBudget(cands: Map<MealType, PlanCandidate[]>, budget: number | null, betterOf: (c: PlanCandidate) => PlanCandidate | null, slots: readonly MealType[] = PLAN_MEALS, variety: number = PER_MEAL_RECIPES): BudgetPlan | null {
  const best = makePlan(cands, null, slots, variety);
  if (!best) return null;
  if (budget === null) return { ...best, better: [] };
  if (best.week.shoppingCost > budget) {
    const cheaper = makePlan(cands, budget, slots, variety);
    return cheaper ? { ...cheaper, better: [] } : null;
  }
  const byKey = new Map<string, PlanCandidate>();
  for (const [meal, list] of cands) for (const c of list) byKey.set(`${meal}:${c.recipe.id}`, c);
  const inPlan = [...new Set(best.ids.flatMap((d) => d.map((id, i) => `${slots[i]}:${id}`)))];
  const options = inPlan.map((key) => ({ key, b: byKey.get(key) ? betterOf(byKey.get(key)!) : null })).filter((o): o is { key: string; b: PlanCandidate } => !!o.b);
  const chosen = new Map<string, PlanCandidate>();
  let week = best.week;
  // cheapest additions first
  const added = options
    .map((o) => ({ ...o, extra: (buildWeek(best.ids, withBetter(cands, new Map([[o.key, o.b]])), budget, slots)?.shoppingCost ?? Infinity) - best.week.shoppingCost }))
    .sort((a, b) => a.extra - b.extra || a.key.localeCompare(b.key));
  for (const o of added) {
    const trial = new Map(chosen).set(o.key, o.b);
    const w = buildWeek(best.ids, withBetter(cands, trial), budget, slots);
    if (w && w.shoppingCost <= budget + 0.005) {
      chosen.set(o.key, o.b);
      week = w;
    }
  }
  return { ids: best.ids, week, better: [...chosen.keys()] };
}

/** The slider's range for these candidates (see BudgetRange); null when no week can be made. */
export function budgetRange(cands: Map<MealType, PlanCandidate[]>, betterOf: (c: PlanCandidate) => PlanCandidate | null, slots: readonly MealType[] = PLAN_MEALS, variety: number = PER_MEAL_RECIPES): BudgetRange | null {
  const best = makePlan(cands, null, slots, variety);
  const cheapest = makePlan(cands, 0.01, slots, variety);
  if (!best || !cheapest) return null;
  const all = planForBudget(cands, Number.MAX_SAFE_INTEGER, betterOf, slots, variety);
  const min = Math.min(cheapest.week.shoppingCost, best.week.shoppingCost);
  return { min, best: best.week.shoppingCost, max: Math.max(best.week.shoppingCost, all?.week.shoppingCost ?? 0) };
}

/** The plan as recipe ids: days × meals (PLAN_MEALS order). */
export type PlanIds = string[][];

export interface ShopLine {
  /** The shop this product is bought at. */
  shop: string;
  product: PricedProduct;
  /** Whole packs the week needs. */
  packs: number;
  cost: number;
  /** A cupboard item (oil, salt, stock cubes): the person may have it already. */
  cupboard: boolean;
  /** What the week's meals eat of it, at the shop's price (never more than `cost`). */
  used: number;
  /** What's left keeps past the week (keepsWell). */
  keeps: boolean;
  /** The ingredient it is bought for, as the recipe names it ("Olive oil"): what the first shop's line names (lastingThings). */
  label: string;
}

export interface PlanMeal { meal: MealType; candidate: PlanCandidate }
export interface PlanDay { meals: PlanMeal[]; kcal: number; protein: number; cost: number }

export interface WeekPlan {
  days: PlanDay[];
  /** What the 21 meals' amounts cost, added up (each meal's price a serving). */
  mealsCost: number;
  /** The shopping list: every meal's amounts added up per product, as whole packs. */
  shopping: ShopLine[];
  shoppingCost: number;
  /** The shops the week's shopping comes from, the one with the most to buy first. */
  shops: string[];
  /** The fresh food (everything that doesn't keep): what its packs cost, and what of that the week's meals eat. */
  fresh: { bought: number; eaten: number };
  budget: number | null;
  /** The plan's shopping bill is more than the budget (the cheapest plan the recipes allow was made). */
  overBudget: boolean;
}

const money = (v: number) => Math.round(v * 100) / 100;

/** The week from the chosen ids: each day's meals and totals, and the shopping list for all of them. */
export function buildWeek(ids: PlanIds, candidates: Map<MealType, PlanCandidate[]>, budget: number | null, slots: readonly MealType[] = PLAN_MEALS): WeekPlan | null {
  const byId = new Map<string, PlanCandidate>();
  for (const list of candidates.values()) for (const c of list) byId.set(`${c.meal}:${c.recipe.id}`, c);
  const days: PlanDay[] = [];
  const need = new Map<string, { shop: string; product: PricedProduct; spec: IngredientSpec; amount: number }>();
  for (const dayIds of ids) {
    const meals: PlanMeal[] = [];
    dayIds.forEach((id, i) => {
      const meal = slots[i]!;
      const c = byId.get(`${meal}:${id}`);
      if (!c) return;
      meals.push({ meal, candidate: c });
      for (const p of c.picks) {
        const key = `${c.shop}|${p.product.id}`;
        const amount = p.spec.amount / c.servings; // one serving's amount
        const had = need.get(key);
        if (had) had.amount += amount;
        else need.set(key, { shop: c.shop, product: p.product, spec: p.spec, amount });
      }
    });
    if (meals.length !== slots.length) return null;
    days.push({
      meals,
      kcal: Math.round(meals.reduce((s, m) => s + m.candidate.perServing.kcal, 0)),
      protein: Math.round(meals.reduce((s, m) => s + m.candidate.perServing.protein, 0)),
      cost: money(meals.reduce((s, m) => s + m.candidate.cost, 0)),
    });
  }
  const lines: ShopLine[] = [...need.values()].map(({ shop, product, spec, amount }) => {
    const pick = pickFor({ ...spec, amount: Math.ceil(amount) }, product);
    const cost = money(pick.basketCost);
    return { shop, product, packs: pick.packs, cost, cupboard: !!spec.cupboard, used: Math.min(cost, money(pick.usedCost ?? pick.basketCost)), keeps: keepsWell(spec, product), label: spec.label };
  });
  const perShop = new Map<string, number>();
  for (const l of lines) perShop.set(l.shop, (perShop.get(l.shop) ?? 0) + l.cost);
  const shops = [...perShop.keys()].sort((a, b) => perShop.get(b)! - perShop.get(a)! || a.localeCompare(b));
  const shopping = lines.sort((a, b) => shops.indexOf(a.shop) - shops.indexOf(b.shop) || Number(a.cupboard) - Number(b.cupboard) || b.cost - a.cost || a.product.name.localeCompare(b.product.name, "en-GB"));
  const shoppingCost = money(shopping.reduce((s, l) => s + l.cost, 0));
  const fresh = shopping.filter((l) => !l.keeps);
  return {
    days, mealsCost: money(days.reduce((s, d) => s + d.cost, 0)), shopping, shoppingCost, shops, budget, overBudget: budget !== null && shoppingCost > budget,
    fresh: { bought: money(fresh.reduce((s, l) => s + l.cost, 0)), eaten: money(fresh.reduce((s, l) => s + l.used, 0)) },
  };
}

/** What the shopping comes to in the plan's first week, and in each week after it. */
export interface WeekCosts { first: number; after: number }

/**
 * The first week's shopping and each later week's (founder 2026-11-20: "week one cost and then the week afterwards costs ... we are helping them save a lot of
 * money"). Week 1 buys every pack (shoppingCost). Each week after buys the fresh food again in whole packs, but of what keeps (oil, rice, spices, frozen food:
 * keepsWell) only the share the week's meals eat, as those packs last for weeks. Rounded to pence; `after` is never more than `first`.
 */
export function weekCosts(week: Pick<WeekPlan, "shopping" | "shoppingCost">): WeekCosts {
  const after = money(week.shopping.reduce((s, l) => s + (l.keeps ? Math.min(l.used, l.cost) : l.cost), 0));
  return { first: week.shoppingCost, after: Math.min(after, week.shoppingCost) };
}

/** The two weeks are said apart only when later weeks cost at least this much less (pounds); otherwise the one cost, as before. */
export const WEEK_AFTER_SAVING = 1;
export const showsWeekAfter = (c: WeekCosts): boolean => Math.round((c.first - c.after) * 100) >= WEEK_AFTER_SAVING * 100;

/**
 * Why the first shop costs more, in the week's own things (founder 2026-11-20: "it's higher because they're having to buy salts and stuff this week, which they
 * won't need to buy again"): the ingredients bought in packs that keep past the week, the most left over first, each named once, at most `n`; `more` when other
 * such packs are bought too.
 */
export function lastingThings(week: Pick<WeekPlan, "shopping">, n = 3): { names: string[]; more: boolean } {
  const left = week.shopping.filter((l) => l.keeps && Math.round((l.cost - l.used) * 100) > 0).sort((a, b) => b.cost - b.used - (a.cost - a.used) || a.label.localeCompare(b.label, "en-GB"));
  const all = [...new Set(left.map((l) => l.label))];
  return { names: all.slice(0, n), more: all.length > n };
}

/** Each meal's recipes for the week: the first `n` of its list in turn (A, B, C, D, A, B, C), so each comes round at most twice. */
function rotate(list: readonly PlanCandidate[], n: number, offset = 0): string[] {
  const pool = list.slice(0, Math.max(1, Math.min(n, list.length)));
  return Array.from({ length: PLAN_DAYS }, (_, d) => pool[(d + offset) % pool.length]!.recipe.id);
}

const idsFrom = (cols: string[][]): PlanIds => Array.from({ length: PLAN_DAYS }, (_, d) => cols.map((col) => col[d]!));

/** How far from the meal size a recipe may be and still come in to use up packs (fitDistance units), unless the plan's own recipes are already further. */
export const PACK_FIT_LIMIT = 0.1;
/** How many of a meal's closest recipes are tried for each place while using up packs. */
const PACK_SHORTLIST = 30;
/** The search weighs, in pounds: fresh food left in the packs at 1, the shopping bill at this, and how far each meal is from its size at FIT_WEIGHT a meal. */
const COST_WEIGHT = 0.3;
const FIT_WEIGHT = 3;

/** buildWeek's sums without the days, for the search: the bill, the fresh food left in the packs, and how far the meals are from their sizes, added up. */
function packScore(ids: PlanIds, byId: ReadonlyMap<string, PlanCandidate>, slots: readonly MealType[], memo: Map<string, { cost: number; left: number }>): { cost: number; left: number; fit: number } {
  const need = new Map<string, { pick: IngredientPick; amount: number }>();
  let fit = 0;
  for (const dayIds of ids) {
    for (let i = 0; i < dayIds.length; i++) {
      const c = byId.get(`${slots[i]}:${dayIds[i]}`);
      if (!c) continue;
      fit += c.distance;
      for (const p of c.picks) {
        const key = `${c.shop}|${p.product.id}`;
        const had = need.get(key);
        if (had) had.amount += p.spec.amount / c.servings;
        else need.set(key, { pick: p, amount: p.spec.amount / c.servings });
      }
    }
  }
  let cost = 0;
  let left = 0;
  for (const [key, { pick, amount }] of need) {
    const a = Math.ceil(amount);
    const mk = `${key}|${a}|${pick.spec.pantry ?? pick.spec.key}|${pick.spec.drained ? 1 : 0}`;
    let r = memo.get(mk);
    if (!r) {
      const p = pickFor({ ...pick.spec, amount: a }, pick.product);
      r = { cost: p.basketCost, left: keepsWell(pick.spec, pick.product) ? 0 : Math.max(0, p.basketCost - (p.usedCost ?? p.basketCost)) };
      memo.set(mk, r);
    }
    cost += r.cost;
    left += r.left;
  }
  return { cost, left, fit };
}

/**
 * A varied week (founder 2026-11-20: "a lot of them are to do with wraps ... You want kind of like a varied diet ... You can't just do wraps every single day"):
 * each meal's recipes are chosen from those this much further from the meal size than the plan's own (fitDistance units, about a tenth more off the meal size)
 * so its dish forms differ (dishForm.ts), and the search counts each variety fault (dishForm.ts varietyFaults: a form twice in a day, a form in the same meal
 * two days running, a third wrap) as VARIETY_WEIGHT pounds, so it gives up packs, price and fit before variety, never the budget.
 */
export const VARIETY_FIT_SLACK = 0.1;
/** Where that still leaves the week with faults, a second look goes this much further (a quarter more off the meal size or its protein, at most). */
export const VARIETY_WIDE_SLACK = 0.25;
const VARIETY_WEIGHT = 100;
/** How many of a meal's closest recipes are looked through for variety. */
const VARIETY_SHORTLIST = 60;

/** Each candidate's dish form, by "meal:id". */
function formsOf(candidates: ReadonlyMap<MealType, readonly PlanCandidate[]>): Map<string, DishForm> {
  const out = new Map<string, DishForm>();
  for (const [m, list] of candidates) for (const c of list) out.set(`${m}:${c.recipe.id}`, dishFormOf(c.recipe));
  return out;
}

/** A week's dish forms, days × slots (dishForm.ts), from its ids and the candidates it was made from (undefined: a recipe not among them). */
export function weekForms(ids: PlanIds, candidates: ReadonlyMap<MealType, readonly PlanCandidate[]>, slots: readonly MealType[] = PLAN_MEALS): Array<Array<DishForm | undefined>> {
  const formOf = formsOf(candidates);
  return ids.map((d) => d.map((id, i) => formOf.get(`${slots[i]}:${id}`)));
}

/** Each candidate's main and cheese (mealBalance.ts), by "meal:id". */
function balancesOf(candidates: ReadonlyMap<MealType, readonly PlanCandidate[]>): Map<string, MealBalance> {
  const out = new Map<string, MealBalance>();
  for (const [m, list] of candidates) for (const c of list) out.set(`${m}:${c.recipe.id}`, mealBalanceOf(c.recipe));
  return out;
}

/** A week's mains and cheese, days × slots (mealBalance.ts), from its ids and the candidates it was made from. */
export function weekBalance(ids: PlanIds, candidates: ReadonlyMap<MealType, readonly PlanCandidate[]>, slots: readonly MealType[] = PLAN_MEALS): Array<Array<MealBalance | undefined>> {
  const balOf = balancesOf(candidates);
  return ids.map((d) => d.map((id, i) => balOf.get(`${slots[i]}:${id}`)));
}

// A week's faults: its dish forms (dishForm.ts) and, with `balOf`, its balance (mealBalance.ts: the same main day after day, cheese at every meal; founder
// 2026-11-21), a dish-form fault weighing FORM_FAULT balance faults, so where the recipes can't give both (a style with few recipes) the dish forms stay varied.
const FORM_FAULT = 10;
const faultsWith = (formOf: ReadonlyMap<string, DishForm>, slots: readonly MealType[], balOf?: ReadonlyMap<string, MealBalance>) => (ids: PlanIds): number =>
  (balOf ? FORM_FAULT : 1) * varietyFaults(ids.map((d) => d.map((id, i) => formOf.get(`${slots[i]}:${id}`)))) + (balOf ? balanceFaults(ids.map((d) => d.map((id, i) => balOf.get(`${slots[i]}:${id}`))), slots) : 0);

/** The recipes a meal's choice for variety is made from: the closest VARIETY_SHORTLIST within `slack` of the `n` closest (PACK_FIT_LIMIT at least). */
function varietyWindow(list: readonly PlanCandidate[], n: number, slack = VARIETY_FIT_SLACK): PlanCandidate[] {
  if (!list.length) return [];
  const limit = Math.max(PACK_FIT_LIMIT, list[Math.min(n, list.length) - 1]!.distance) + slack;
  return list.filter((c) => c.distance <= limit).slice(0, VARIETY_SHORTLIST);
}

/**
 * Each meal's first choice of recipes: the closest ones whose dish forms differ, from the variety window, and a wrap only while the week's wraps stay within
 * MAX_WRAPS_A_WEEK (a recipe in a pool of n comes round about 7 ÷ n times); then the closest of the rest, if the window runs short.
 */
function varietyPools(candidates: Map<MealType, PlanCandidate[]>, types: readonly MealType[], per: ReadonlyMap<MealType, number>, each: number, formOf: ReadonlyMap<string, DishForm>): Map<MealType, PlanCandidate[]> {
  const out = new Map<MealType, PlanCandidate[]>();
  let wraps = 0;
  for (const m of types) {
    const list = candidates.get(m)!;
    const n = each * per.get(m)!;
    const comes = Math.ceil((PLAN_DAYS * per.get(m)!) / Math.max(1, Math.min(n, list.length)));
    const pool: PlanCandidate[] = [];
    const forms = new Set<DishForm>();
    for (const c of varietyWindow(list, n)) {
      if (pool.length >= n) break;
      const f = formOf.get(`${m}:${c.recipe.id}`)!;
      if (forms.has(f) || (f === "wrap" && wraps + comes > MAX_WRAPS_A_WEEK)) continue;
      pool.push(c);
      forms.add(f);
      if (f === "wrap") wraps += comes;
    }
    for (const c of list) {
      if (pool.length >= n) break;
      if (!pool.includes(c)) pool.push(c);
    }
    out.set(m, pool);
  }
  return out;
}

/**
 * Makes the week as varied as the recipes allow, one move at a time, the move that removes most faults first (ties: the one the pack search likes best, its
 * fresh food left, bill and fit; `tieBreak`): two of a meal's recipes swap turns, or one is changed for another from the variety window, or, when neither
 * helps, one is changed and two then swap turns. First within VARIETY_FIT_SLACK, then, if faults are left, within VARIETY_WIDE_SLACK. Changes `chosen` in place.
 */
function varietyRepair(candidates: Map<MealType, PlanCandidate[]>, chosen: Map<MealType, PlanCandidate[]>, counts: ReadonlyMap<MealType, number>, types: readonly MealType[], faults: () => number, tieBreak: () => number, maxRounds = 40, slacks: readonly number[] = [VARIETY_FIT_SLACK, VARIETY_WIDE_SLACK]): void {
  const size = (m: MealType) => Math.min(counts.get(m)!, chosen.get(m)!.length);
  const flip = (pool: PlanCandidate[], a: number, b: number) => { [pool[a], pool[b]] = [pool[b]!, pool[a]!]; };
  let current = faults();
  for (const slack of slacks) {
    const windows = new Map(types.map((m) => [m, varietyWindow(candidates.get(m)!, size(m), slack)]));
    for (let round = 0; current > 0 && round < maxRounds; round++) {
      let best: { f: number; t: number; redo: () => void } | null = null;
      // called with the move made; `redo` makes it again
      const look = (redo: () => void) => {
        const f = faults();
        if (f >= current || (best && f > best.f)) return;
        const t = tieBreak();
        if (!best || f < best.f || t < best.t) best = { f, t, redo };
      };
      for (const m of types) {
        const pool = chosen.get(m)!;
        const n = size(m);
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { flip(pool, a, b); look(() => flip(pool, a, b)); flip(pool, a, b); }
      }
      for (const compound of [false, true]) {
        if (best) break;
        for (const m of types) {
          const pool = chosen.get(m)!;
          const n = size(m);
          const inPool = new Set(pool.slice(0, n).map((c) => c.recipe.id));
          for (let i = 0; i < n; i++) {
            const was = pool[i]!;
            for (const x of windows.get(m)!) {
              if (inPool.has(x.recipe.id)) continue;
              pool[i] = x;
              if (!compound) look(() => { pool[i] = x; });
              else for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { flip(pool, a, b); look(() => { pool[i] = x; flip(pool, a, b); }); flip(pool, a, b); }
            }
            pool[i] = was;
          }
        }
      }
      if (!best) break;
      const move = best as { f: number; redo: () => void };
      move.redo();
      current = move.f;
    }
  }
}

// makePlan's answers for one set of candidates (the budget step asks for the same week several times)
const planMemo = new WeakMap<Map<MealType, PlanCandidate[]>, Map<string, { ids: PlanIds; week: WeekPlan } | null>>();

/**
 * The best week the recipes allow: for each meal, the recipes closest to the meal size, `variety` of them in turn (VARIETIES), chosen and ordered so the week is
 * varied (founder 2026-11-20: never the same dish form twice in a day, never the same form in the same meal two days running, at most MAX_WRAPS_A_WEEK wraps,
 * as far as the recipes allow: varietyPools, varietyRepair). With a budget, while the shopping bill is over it the dearest recipe still in the plan is swapped
 * for the cheapest one of that meal not yet used that keeps the week as varied (else the cheapest), and, failing that, a meal rotates through fewer recipes, so
 * more packs are shared; it stops when the bill fits or nothing makes it cheaper. Then the packs are used up (founder 2026-11-18: "by the end of the week, all
 * the ingredients shall be basically almost complete"): a recipe is changed for another close to the meal size, or two swap which comes round more often,
 * whenever that leaves less fresh food in the packs (weighed with the bill and the fit, after variety), never making the bill more than the budget or, with no
 * budget, more than it was. Null when a meal has no recipe at all for these choices.
 */
export function makePlan(candidates: Map<MealType, PlanCandidate[]>, budget: number | null, slots: readonly MealType[] = PLAN_MEALS, variety: number = PER_MEAL_RECIPES): { ids: PlanIds; week: WeekPlan } | null {
  const memoKey = `${budget}|${slots.join(",")}|${variety}`;
  const known = planMemo.get(candidates)?.get(memoKey);
  if (known !== undefined) return known;
  const result = makePlanFresh(candidates, budget, slots, variety);
  if (!planMemo.has(candidates)) planMemo.set(candidates, new Map());
  planMemo.get(candidates)!.set(memoKey, result);
  return result;
}

function makePlanFresh(candidates: Map<MealType, PlanCandidate[]>, budget: number | null, slots: readonly MealType[], variety: number): { ids: PlanIds; week: WeekPlan } | null {
  const types = [...new Set(slots)];
  if (!slots.length || types.some((m) => !(candidates.get(m)?.length))) return null;
  // a budget the week with no budget already fits: that week (so a budget never changes a week it doesn't have to)
  if (budget !== null) {
    const free = makePlan(candidates, null, slots, variety);
    if (free && free.week.shoppingCost <= budget) return { ids: free.ids, week: buildWeek(free.ids, candidates, budget, slots)! };
  }
  const each = Math.max(1, Math.min(PLAN_DAYS, Math.round(variety)));
  // a meal that comes more than once a day (two snacks) rotates through more recipes, so the day's two are different
  const per = new Map<MealType, number>(types.map((m) => [m, slots.filter((x) => x === m).length]));
  // varied from the start (VARIETY_FIT_SLACK): each meal's closest recipes whose dish forms differ
  const formOf = formsOf(candidates);
  const faultsOf = faultsWith(formOf, slots);
  // with no budget the week is balanced as it is made (founder 2026-11-21: "salmon every day, or chicken every day ... balanced diets"; "everything on it is
  // cheesy stuff"); with a budget the budget's steps run as before and the balance comes last (balanceRepair)
  const balancedOf = faultsWith(formOf, slots, balancesOf(candidates));
  const chosen = varietyPools(candidates, types, per, each, formOf);
  const counts = new Map<MealType, number>(types.map((m) => [m, each * per.get(m)!]));
  const nth = slots.map((m, i) => slots.slice(0, i).filter((x) => x === m).length);
  const ids = () => idsFrom(slots.map((m, i) => {
    const pool = Math.max(1, Math.min(counts.get(m)!, chosen.get(m)!.length));
    return rotate(chosen.get(m)!, counts.get(m)!, nth[i]! * Math.floor(pool / per.get(m)!));
  }));
  const packOf = packScorer(candidates, slots);
  varietyRepair(candidates, chosen, counts, types, () => faultsOf(ids()), () => packOf(ids()));
  if (budget === null) {
    // then the balance, never taking a meal further from its size than the week already is (PACK_FIT_LIMIT at least), and never at the dish forms' cost
    const distanceOf = new Map<string, number>();
    for (const [m, list] of candidates) for (const c of list) distanceOf.set(`${m}:${c.recipe.id}`, c.distance);
    const farthest = (now: PlanIds) => Math.max(0, ...now.flatMap((d) => d.map((id, i) => distanceOf.get(`${slots[i]}:${id}`) ?? 0)));
    const fitCap = Math.max(PACK_FIT_LIMIT, farthest(ids())) + 1e-9;
    varietyRepair(candidates, chosen, counts, types, () => { const now = ids(); return balancedOf(now) + (farthest(now) > fitCap ? 1000 : 0); }, () => packOf(ids()));
  }
  let best = buildWeek(ids(), candidates, budget, slots)!;
  for (let round = 0; budget !== null && best.shoppingCost > budget && round < 40; round++) {
    let improved = false;
    // the dearest recipe in use, across the day's meals
    const inUse = types.flatMap((m) => chosen.get(m)!.slice(0, counts.get(m)!).map((c, i) => ({ m, c, i }))).sort((a, b) => b.c.cost - a.c.cost);
    for (const { m, c, i } of inUse) {
      const used = new Set(chosen.get(m)!.map((x) => x.recipe.id));
      const options = candidates.get(m)!.filter((x) => !used.has(x.recipe.id) && x.cost < c.cost && x.distance <= Math.max(MAX_SWAP_DISTANCE, c.distance)).sort((a, b) => a.cost - b.cost || a.distance - b.distance);
      if (!options.length) continue;
      const before = chosen.get(m)!;
      // the cheapest that keeps the week as varied as it is, else the cheapest
      const was = faultsOf(ids());
      const cheaper = options.find((x) => { const t = before.slice(); t[i] = x; chosen.set(m, t); const f = faultsOf(ids()); chosen.set(m, before); return f <= was; }) ?? options[0]!;
      const trial = before.slice();
      trial[i] = cheaper;
      chosen.set(m, trial);
      const week = buildWeek(ids(), candidates, budget, slots)!;
      if (week.shoppingCost < best.shoppingCost) { best = week; improved = true; break; }
      chosen.set(m, before);
    }
    if (improved) continue;
    // fewer recipes for the meal whose recipes cost most, so packs are shared
    const m = types.filter((x) => counts.get(x)! > 2 * per.get(x)!).sort((a, b) => chosen.get(b)![0]!.cost - chosen.get(a)![0]!.cost)[0];
    if (!m) break;
    const list = chosen.get(m)!.slice(0, counts.get(m)!).sort((a, b) => a.cost - b.cost);
    chosen.set(m, list);
    counts.set(m, counts.get(m)! - 1);
    const week = buildWeek(ids(), candidates, budget, slots)!;
    if (week.shoppingCost < best.shoppingCost) best = week;
    else { counts.set(m, counts.get(m)! + 1); break; }
  }
  fillPacks(candidates, chosen, counts, types, slots, ids, budget, budget === null ? balancedOf : faultsOf);
  if (budget !== null) balanceRepair(candidates, chosen, counts, types, slots, ids, budget, faultsOf, balancedOf, () => packOf(ids()));
  const finalIds = ids();
  return { ids: finalIds, week: buildWeek(finalIds, candidates, budget, slots)! };
}

/**
 * makePlan's last step for a week a budget has changed (founder 2026-11-21: a tight budget made it tuna or cheese at nearly every meal): the week is made as
 * balanced as the recipes allow (mealBalance.ts), a few varietyRepair moves at most, never adding a dish-form fault, never taking a meal further from its size
 * than the week already is (PACK_FIT_LIMIT at least), and never over the budget it meets (5% over the bill at most), and a bill already over its budget 5% more at most.
 * Changes `chosen` in place.
 */
function balanceRepair(candidates: Map<MealType, PlanCandidate[]>, chosen: Map<MealType, PlanCandidate[]>, counts: ReadonlyMap<MealType, number>, types: readonly MealType[], slots: readonly MealType[], ids: () => PlanIds, budget: number, formFaultsOf: (ids: PlanIds) => number, balancedOf: (ids: PlanIds) => number, tieBreak: () => number): void {
  const byId = new Map<string, PlanCandidate>();
  for (const list of candidates.values()) for (const c of list) byId.set(`${c.meal}:${c.recipe.id}`, c);
  const memo = new Map<string, { cost: number; left: number }>();
  const billOf = (now: PlanIds) => packScore(now, byId, slots, memo).cost;
  const farthest = (now: PlanIds) => Math.max(0, ...now.flatMap((d) => d.map((id, i) => byId.get(`${slots[i]}:${id}`)?.distance ?? 0)));
  const start = ids();
  const forms = formFaultsOf(start);
  if (balancedOf(start) - FORM_FAULT * forms < 1e-9) return; // already balanced
  const bill = billOf(start);
  // within the budget, never over it; already over it (the cheapest week the choices allow), up to 5% more for a balanced week
  const billCap = (bill <= budget ? Math.min(budget, bill * 1.05) : bill * 1.05) + 0.005;
  const fitCap = Math.max(PACK_FIT_LIMIT, farthest(start)) + 1e-9;
  varietyRepair(candidates, chosen, counts, types, () => {
    const now = ids();
    const f = formFaultsOf(now);
    return (f > forms ? 1000 : 0) + (balancedOf(now) - FORM_FAULT * f) + (billOf(now) > billCap ? 1000 : 0) + (farthest(now) > fitCap ? 1000 : 0);
  }, tieBreak, 20, [VARIETY_FIT_SLACK]);
}

/** The pack search's score for a week (packScore weighed: fresh food left, the bill at COST_WEIGHT, the fit at FIT_WEIGHT), with its own memo. */
function packScorer(candidates: Map<MealType, PlanCandidate[]>, slots: readonly MealType[]): (ids: PlanIds) => number {
  const byId = new Map<string, PlanCandidate>();
  for (const list of candidates.values()) for (const c of list) byId.set(`${c.meal}:${c.recipe.id}`, c);
  const memo = new Map<string, { cost: number; left: number }>();
  return (ids) => { const s = packScore(ids, byId, slots, memo); return s.left + COST_WEIGHT * s.cost + FIT_WEIGHT * s.fit; };
}

/** makePlan's last step (see there): changes `chosen` in place, one move at a time, the move that helps most first, until no move helps. */
function fillPacks(candidates: Map<MealType, PlanCandidate[]>, chosen: Map<MealType, PlanCandidate[]>, counts: ReadonlyMap<MealType, number>, types: readonly MealType[], slots: readonly MealType[], ids: () => PlanIds, budget: number | null, faultsOf: (ids: PlanIds) => number): void {
  const byId = new Map<string, PlanCandidate>();
  for (const list of candidates.values()) for (const c of list) byId.set(`${c.meal}:${c.recipe.id}`, c);
  const memo = new Map<string, { cost: number; left: number }>();
  // variety first (VARIETY_WEIGHT a fault), then the packs, the bill and the fit
  const score = (s: { cost: number; left: number; fit: number; faults: number }) => VARIETY_WEIGHT * s.faults + s.left + COST_WEIGHT * s.cost + FIT_WEIGHT * s.fit;
  const measure = () => { const now = ids(); return { ...packScore(now, byId, slots, memo), faults: faultsOf(now) }; };
  for (const m of types) chosen.set(m, chosen.get(m)!.slice());
  const size = (m: MealType) => Math.min(counts.get(m)!, chosen.get(m)!.length);
  const limit = new Map(types.map((m) => [m, Math.max(PACK_FIT_LIMIT, ...chosen.get(m)!.slice(0, size(m)).map((c) => c.distance))]));
  const start = measure();
  const cap = (budget !== null ? Math.max(budget, start.cost) : start.cost) + 0.005;
  let current = score(start);
  for (let round = 0; round < 40; round++) {
    let move: { m: MealType; i: number; j?: number; x?: PlanCandidate } | null = null;
    let bestScore = current - 0.01;
    const tryIt = (m: MealType, i: number, j?: number, x?: PlanCandidate) => {
      const s = measure();
      if (s.cost <= cap && score(s) < bestScore) { bestScore = score(s); move = { m, i, j, x }; }
    };
    for (const m of types) {
      const pool = chosen.get(m)!;
      const n = size(m);
      const inPool = new Set(pool.slice(0, n).map((c) => c.recipe.id));
      const shortlist = candidates.get(m)!.filter((x) => x.distance <= limit.get(m)! && !inPool.has(x.recipe.id)).slice(0, PACK_SHORTLIST);
      for (let i = 0; i < n; i++) {
        const was = pool[i]!;
        for (const x of shortlist) { pool[i] = x; tryIt(m, i, undefined, x); }
        pool[i] = was;
        // which of two recipes comes round more often
        for (let j = i + 1; j < n; j++) {
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
          tryIt(m, i, j);
          [pool[i], pool[j]] = [pool[j]!, pool[i]!];
        }
      }
    }
    if (!move) break;
    const { m, i, j, x } = move as { m: MealType; i: number; j?: number; x?: PlanCandidate };
    const pool = chosen.get(m)!;
    if (x) pool[i] = x;
    else if (j !== undefined) [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    current = bestScore;
  }
}

/**
 * The recipes a meal could be swapped for (founder 2026-11-18: "if they don't like any of the options, they're able to swap them out for other meals"): that
 * meal's recipes closest to the meal size first, leaving out the one there now and any already used twice that week. At most `limit`.
 */
export function swapChoices(ids: PlanIds, day: number, mealIndex: number, candidates: Map<MealType, PlanCandidate[]>, limit = 10, slots: readonly MealType[] = PLAN_MEALS): PlanCandidate[] {
  const meal = slots[mealIndex]!;
  const today = new Set(ids[day] ?? []);
  const uses = (id: string) => ids.reduce((n, d) => n + d.filter((x, i) => slots[i] === meal && x === id).length, 0);
  // never one already on that day (two snacks stay different), and none used twice a week in that kind of meal
  return (candidates.get(meal) ?? []).filter((c) => !today.has(c.recipe.id) && uses(c.recipe.id) < 2 * slots.filter((x) => x === meal).length).slice(0, limit);
}

/** The plan with one meal set to a chosen recipe. */
export function setMeal(ids: PlanIds, day: number, mealIndex: number, recipeId: string): PlanIds {
  return ids.map((d, i) => (i === day ? d.map((x, j) => (j === mealIndex ? recipeId : x)) : d.slice()));
}

/** One meal swapped for the next recipe of that meal (closest first) that isn't already on that day or used twice in the week. */
export function swapMeal(ids: PlanIds, day: number, mealIndex: number, candidates: Map<MealType, PlanCandidate[]>, slots: readonly MealType[] = PLAN_MEALS): PlanIds {
  const meal = slots[mealIndex]!;
  const list = candidates.get(meal) ?? [];
  const current = ids[day]![mealIndex]!;
  const uses = (id: string) => ids.reduce((n, d) => n + (d[mealIndex] === id ? 1 : 0), 0);
  const start = list.findIndex((c) => c.recipe.id === current);
  for (let k = 1; k <= list.length; k++) {
    const c = list[(start + k) % list.length]!;
    if (c.recipe.id === current || uses(c.recipe.id) >= 2) continue;
    return ids.map((d, i) => (i === day ? d.map((x, j) => (j === mealIndex ? c.recipe.id : x)) : d.slice()));
  }
  return ids;
}

/** The plan kept on the phone (mm.v1.mealPlan; never synced): the answers and the recipe ids, worked out again from the shop's list when it is opened. */
export interface SavedPlan {
  /** The shops chosen (a plan from before 18 November had one: `shop`). */
  shops: string[];
  /** The day's meals and snacks in order (planSlots); absent = breakfast, lunch and dinner, as plans were before 18 November. */
  slots?: MealType[];
  ids: PlanIds;
  leaveOut: string[];
  budget: number | null;
  /** The day the plan starts (yyyy-mm-dd): its days are named from it. */
  start: string;
  /** The recipes made with better products, by "meal:id" (planForBudget). */
  better?: string[];
  /** How often a meal may come round (VARIETIES); absent = PER_MEAL_RECIPES, as plans were before 19 November. */
  variety?: Variety;
  /** The cuisines for lunch and dinner (founder 2026-11-19); absent = any. */
  cuisines?: CuisineId[];
  /** A meal was swapped since the plan was made (the budget line then says the swaps, not the choices, took it over). */
  swapped?: boolean;
  /** How many people the shopping is for (PLAN_PEOPLE); absent = one, as plans were before 19 November. */
  people?: number;
  /** A plan cooked for a household (founder 2026-11-19): the others' age groups and portion sizes (never names) and the home's allergies and diets
   *  as they were when the plan was made, so the week is rebuilt the same way. Absent = the user alone (or `people` copies of them, before 19 November).
   *  A plan from before 20 November kept a meat answer instead of the diets: it is read as the diet it meant (household.ts sanitizeHomeDiets). */
  home?: { others: Array<Pick<HomePerson, "group" | "portion">>; allergies: AllergenKey[]; diets: HomeDiet[] };
  /**
   * The person's own diet and allergies when the plan was made (cleanDiet), so the week is rebuilt from the same recipes after they change their diet in
   * Settings (the plan then says the diet has changed, and hides any meal that no longer fits). Absent (plans from before 20 November): today's diet.
   */
  diet?: DietPrefs;
  /** The plan's shopping went on the shopping list (planListKey of the plan then): "Add all" isn't offered twice for the same week. */
  addedToList?: string;
  /** How the person likes to eat (EATING_STYLES), so the week is rebuilt from the same recipes; absent = Balanced, as plans were before 20 November. */
  style?: Exclude<EatingStyle, "balanced">;
}

/** A diet as kept with a plan: only what is on, in a fixed order, the allergies once each (known keys only). */
export function cleanDiet(raw: unknown): DietPrefs {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: DietPrefs = {};
  for (const k of ALL_HOME_DIETS) if (r[k] === true) out[k] = true;
  const allergies = Array.isArray(r.avoidAllergens) ? ALLERGEN_KEYS.filter((a) => (r.avoidAllergens as unknown[]).includes(a)) : [];
  if (allergies.length) out.avoidAllergens = allergies;
  return out;
}

/** Whether two diets mean the same to the recipes (false and absent alike, allergies in any order). */
export const sameDiet = (a: DietPrefs, b: DietPrefs): boolean => JSON.stringify(cleanDiet(a)) === JSON.stringify(cleanDiet(b));

/**
 * Whether a recipe planned for one diet still fits another (the diet changed since the plan was made): the new diet keeps it, made the same way, every
 * ingredient matched to products by the same rules (the 21 November meeting, Kemi: a meal kept with the products of the diet it was made for, such as halal
 * chicken or Shazans for "No halal or kosher meat", was shown as fitting).
 */
export function fitsDietNow(recipe: Recipe, then: DietPrefs, now: DietPrefs): boolean {
  const a = recipeForDiet(recipe, then);
  const b = recipeForDiet(recipe, now);
  const made = (r: Recipe) => JSON.stringify(r.ingredients.map((i) => [i.label, i.match]));
  return !!a && !!b && made(a) === made(b);
}

/**
 * What the plan's shopping depends on (the recipes, each day's meals, the better products, the shops and who it is for), as a short key: "Add all to my
 * shopping list" is done once for a plan with this key, and offered again only once a meal is swapped or the plan changes.
 */
export function planListKey(p: Pick<SavedPlan, "ids" | "better" | "shops" | "slots" | "people" | "home">): string {
  const text = JSON.stringify([p.ids, p.better ?? [], p.shops, p.slots ?? null, p.people ?? 1, p.home?.others ?? []]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}${text.length.toString(36)}`;
}

/** Which of the plan's days `today` is (both yyyy-mm-dd, local dates): 0 on the day it starts, 6 on its last; below 0 before it starts, above 6 once it's over. */
export function planDayIndex(start: string, today: string): number {
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((day(today) - day(start)) / 86_400_000);
}

/** A week comes in this far under the daily calories (a share of them) before the plan says why (planShortfall). */
export const SHORTFALL_NOTE = 0.05;

/**
 * Why a week comes in under the person's calories when no meal cap explains it (a 3,400 kcal day, with our recipes going up to about 900 kcal a meal): the
 * average day and the largest meal the week's recipes reach, or null when the days come within SHORTFALL_NOTE of the target.
 */
export function planShortfall(week: Pick<WeekPlan, "days">, dailyKcal: number): { avg: number; max: number } | null {
  if (!week.days.length || !(dailyKcal > 0)) return null;
  const avg = Math.round(week.days.reduce((s, d) => s + d.kcal, 0) / week.days.length);
  if (avg >= dailyKcal * (1 - SHORTFALL_NOTE)) return null;
  const meals = week.days.flatMap((d) => d.meals.filter((m) => m.meal !== "snack").map((m) => m.candidate.perServing.kcal));
  return { avg, max: Math.round(Math.max(0, ...meals) / 10) * 10 };
}

/** A kept style: one of EATING_STYLES, anything else Balanced. */
export const sanitizeStyle = (x: unknown): EatingStyle => ((EATING_STYLES as readonly unknown[]).includes(x) ? (x as EatingStyle) : "balanced");

export function sanitizePlan(raw: unknown): SavedPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slotsOk = Array.isArray(r.slots) && r.slots.length >= 1 && r.slots.length <= 6 && r.slots.every((x) => x === "breakfast" || x === "lunch" || x === "dinner" || x === "snack")
    && JSON.stringify(r.slots) === JSON.stringify(planSlots(shapeOf(r.slots as MealType[]))) && (r.slots as MealType[]).filter((x) => x === "snack").length <= MAX_SNACKS;
  const slots: MealType[] = slotsOk ? [...(r.slots as MealType[])] : [...PLAN_MEALS];
  const ids = Array.isArray(r.ids) && r.ids.length === PLAN_DAYS && r.ids.every((d) => Array.isArray(d) && d.length === slots.length && d.every((x) => typeof x === "string" && /^[a-z0-9-]{1,80}$/.test(x))) ? (r.ids as PlanIds) : null;
  const shopId = (x: unknown): x is string => typeof x === "string" && /^[a-z0-9-]{2,40}$/.test(x);
  const shops = Array.isArray(r.shops) ? [...new Set((r.shops as unknown[]).filter(shopId))].slice(0, 12) : shopId(r.shop) ? [r.shop] : [];
  if (!ids || !shops.length || typeof r.start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.start)) return null;
  const leaveOut = Array.isArray(r.leaveOut) ? (r.leaveOut as unknown[]).filter((x): x is string => typeof x === "string" && x.length <= 40).slice(0, 30) : [];
  const budget = typeof r.budget === "number" && Number.isFinite(r.budget) && r.budget > 0 && r.budget < 10000 ? r.budget : null;
  const better = Array.isArray(r.better) ? (r.better as unknown[]).filter((x): x is string => typeof x === "string" && /^(breakfast|lunch|dinner|snack):[a-z0-9-]{1,80}$/.test(x)).slice(0, 42) : [];
  const variety = (VARIETIES as readonly unknown[]).includes(r.variety) ? (r.variety as Variety) : null;
  const cuisines = Array.isArray(r.cuisines) ? [...new Set((r.cuisines as unknown[]).filter((c): c is CuisineId => CUISINES.some((x) => x.id === c)))] : [];
  // the home, checked like the household itself (its people get placeholder ids: a plan keeps no ids or names)
  const homeRaw = r.home && typeof r.home === "object" ? (r.home as Record<string, unknown>) : null;
  const homeOk = homeRaw && Array.isArray(homeRaw.others) && homeRaw.others.length >= 1
    ? sanitizeHousehold({ ...homeRaw, others: (homeRaw.others as unknown[]).map((o, i) => (o && typeof o === "object" ? { ...(o as object), id: `p${i}`, name: undefined } : o)) })
    : null;
  const home = homeOk && homeOk.others.length ? { others: homeOk.others.map((o) => ({ group: o.group, portion: o.portion })), allergies: homeOk.allergies, diets: homeOk.diets } : null;
  const diet = r.diet && typeof r.diet === "object" ? cleanDiet(r.diet) : null;
  const addedToList = typeof r.addedToList === "string" && /^[a-z0-9]{1,24}$/.test(r.addedToList) ? r.addedToList : null;
  const style = sanitizeStyle(r.style);
  return {
    shops, ids, leaveOut, budget, start: r.start, ...(slotsOk ? { slots } : {}), ...(better.length ? { better } : {}), ...(variety ? { variety } : {}), ...(cuisines.length ? { cuisines } : {}), ...(r.swapped === true ? { swapped: true } : {}),
    ...(home ? { home } : typeof r.people === "number" && (PLAN_PEOPLE as readonly number[]).includes(r.people) && r.people > 1 ? { people: r.people } : {}),
    ...(diet ? { diet } : {}), ...(addedToList ? { addedToList } : {}), ...(style !== "balanced" ? { style } : {}),
  };
}

/**
 * Earlier plans (founder 2026-11-19: "if they've done their meal plan, they can start another meal plan ... or they can create multiple meal plans, whatever you
 * think could be the best"): one plan is the one being followed; making a new one keeps the old one among the last MAX_EARLIER_PLANS, newest first, so it can
 * be opened again. On this phone only, like the plan itself.
 */
export const MAX_EARLIER_PLANS = 5;

const samePlan = (a: SavedPlan, b: SavedPlan) => a.start === b.start && JSON.stringify(a.ids) === JSON.stringify(b.ids);

/** The earlier plans once `old` is set aside (a new plan made, or an earlier one opened): `old` first, without a copy of it, at most MAX_EARLIER_PLANS. */
export function keepEarlier(earlier: readonly SavedPlan[], old: SavedPlan | null): SavedPlan[] {
  if (!old) return earlier.slice(0, MAX_EARLIER_PLANS);
  return [old, ...earlier.filter((p) => !samePlan(p, old))].slice(0, MAX_EARLIER_PLANS);
}

/** Opening an earlier plan: it becomes the plan, and the one it replaces goes to the top of the earlier ones. */
export function openEarlier(current: SavedPlan | null, earlier: readonly SavedPlan[], index: number): { current: SavedPlan | null; earlier: SavedPlan[] } {
  const chosen = earlier[index];
  if (!chosen) return { current, earlier: [...earlier] };
  const rest = earlier.filter((_, i) => i !== index);
  return { current: chosen, earlier: keepEarlier(rest, current) };
}

export function sanitizePlans(raw: unknown): SavedPlan[] {
  return Array.isArray(raw) ? raw.map(sanitizePlan).filter((p): p is SavedPlan => !!p).slice(0, MAX_EARLIER_PLANS) : [];
}
