import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ALLERGEN_LABEL } from "./mm/allergens";
import { DIET_WORDS, type AskPipRequest, type DishCardItem, type PipCard, type PipEvent, type ProductCardItem, type RecipeCardItem } from "./mm/askPip";
import { foodDietProblem } from "./mm/foodDiet";
import { passesMenuDiet, searchItems, uncheckedDiet } from "./mm/menu-view";
import { EATING_STYLES } from "./mm/mealPlan";
import { AIMS, BREADS, BREAKFASTS, COOK_TIMES, SPICES, TRAINING, sanitizeAnswers } from "./mm/planAi";
import { RECIPES } from "./mm/recipeBook";
import { CUISINES } from "./mm/recipeBook/niches";
import { recipeForDiet, recipeTotals, resolveRecipe, type Recipe } from "./mm/recipes";
import { normalizeForSearch } from "./mm/search";
import { recipeShopSet, searchShopProducts, type ShopManifest, type ShopProduct } from "./mm/shopProducts";
import { NO_PREFERENCES, type AllergenKey, type Chain, type MenuItem, type Preferences } from "./mm/types";

// Ask Pip's tools (lib/mm/askPip.ts has the rules): what the AI may look up, each answered from the app's own data and nothing else. Restaurant dishes come from
// the published menu files (public/menus, the files the app reads), supermarket products from the shops' published lists (public/groceries/all), and a recipe's
// figures are worked out by the recipe code itself (resolveRecipe and recipeTotals: the person's shop's labels, plain arithmetic). The person's own food diary,
// saved recipes and meal plan come with their request and reach the AI only through get_my_day, get_my_saved_recipes and get_my_meal_plan. Each show_* tool
// turns ids from an earlier search into a card, drawn on the phone from these figures, never from the AI's words. Pure apart from the injected data loaders,
// so the tools are tested with small fixtures (tests/askPip.test.ts).

/** Where the data comes from: on the server, this website's own published files (lib/askPipData.ts); in tests, fixtures. */
export interface PipData {
  /** Every restaurant in the app: id, name, cuisine (the menus manifest; sample chains left out). */
  chains(): Promise<Array<{ id: string; name: string; cuisine: string }>>;
  chain(id: string): Promise<Chain | null>;
  /** The supermarkets with full lists (the all-manifest). */
  shops(): Promise<ShopManifest | null>;
  products(shopId: string): Promise<ShopProduct[] | null>;
}

type Json = Record<string, unknown>;
export interface ToolOutcome {
  /** What the AI is told (JSON). */
  result: Json;
  /** A card for the phone, for the show_* tools. */
  card?: PipCard;
  isError?: boolean;
}

const MAX_SEARCH = 10;
const RECIPE_BY_ID = new Map(RECIPES.filter((r) => !r.ai).map((r) => [r.id, r]));
const round1 = (n: number) => Math.round(n * 10) / 10;
const norm = (s: string) => normalizeForSearch(s).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const squash = (s: string) => norm(s).replace(/ /g, "");

// ----------------------------------------------------------------------------------------------------------------------- the person

/** The person's diet and allergies as the app's own preference object (the filters they set and what they told us at sign-up, together). */
export function prefsOf(req: Pick<AskPipRequest, "me">): Preferences {
  const p: Preferences = { ...NO_PREFERENCES };
  for (const d of req.me.diet) (p as unknown as Record<string, boolean>)[d] = true;
  if (req.me.avoid.length) p.avoidAllergens = [...req.me.avoid];
  return p;
}

const allergenWords = (keys: readonly AllergenKey[]) => keys.map((k) => ALLERGEN_LABEL[k].toLowerCase()).join(", ");

// ----------------------------------------------------------------------------------------------------------------------- tool definitions

const nullableNum = { type: "number" } as const;
export const PIP_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_restaurants",
    description: "Find restaurants in the app by name or by kind of food (\"pizza\", \"chicken\", \"coffee\"). Returns their ids and names. Use it when the person names a place you can't find with search_menu, or asks where they could eat.",
    input_schema: { type: "object", properties: { words: { type: "string", description: "A restaurant's name, or a kind of food" } }, required: ["words"], additionalProperties: false },
  },
  {
    name: "search_menu",
    description: "Search one restaurant's menu in the app, with each dish's published figures (calories, protein, carbs, fat, sugar, salt) and what in it the person can't have (from the restaurant's own allergen guide and labels). Returns dishes that fit the person's diet and, separately, dishes that clash with it and why. Use it before you recommend anything at a restaurant.",
    input_schema: {
      type: "object",
      properties: {
        restaurant: { type: "string", description: "The restaurant's name as the person said it, or its id" },
        words: { type: "string", description: "Optional words to look for in dish names (\"chicken wrap\", \"breakfast\")" },
        max_kcal: { ...nullableNum, description: "Optional: only dishes at or under this many kcal" },
        min_protein: { ...nullableNum, description: "Optional: only dishes with at least this many grams of protein" },
        sort: { type: "string", enum: ["protein", "fewest_kcal", "protein_per_kcal", "menu"], description: "Order: most protein, fewest calories, most protein for the calories (default), or menu order" },
      },
      required: ["restaurant"],
      additionalProperties: false,
    },
  },
  {
    name: "search_recipes",
    description: "Search the app's own recipe book, already filtered to the person's diet and allergies. Each recipe comes with one serving's figures as written, worked out from the labels of the person's own supermarket's products, its price a serving and minutes to make.",
    input_schema: {
      type: "object",
      properties: {
        words: { type: "string", description: "Optional words (a dish, an ingredient or a cuisine: \"chicken\", \"curry\", \"porridge\")" },
        meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        max_kcal: nullableNum,
        min_protein: nullableNum,
        max_minutes: nullableNum,
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_products",
    description: "Search a supermarket's products in the app, with each product's label figures per 100 g or 100 ml and its price. Uses the person's first supermarket unless another is named.",
    input_schema: {
      type: "object",
      properties: {
        words: { type: "string", description: "What to look for (\"greek yogurt\", \"protein bar\")" },
        shop: { type: "string", description: "Optional supermarket id or name" },
        sort: { type: "string", enum: ["protein", "fewest_kcal", "price", "protein_per_kcal"] },
      },
      required: ["words"],
      additionalProperties: false,
    },
  },
  {
    name: "get_my_day",
    description: "The person's food diary for today: what they logged, the day's totals, and the calories and protein they have left.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_saved_recipes",
    description: "The recipes the person saved in My recipes.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_meal_plan",
    description: "The person's current meal plan: each day's recipes.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "show_dishes",
    description: "Show the person cards for restaurant dishes you recommend (ids from search_menu), with their real figures. Set one_meal when the dishes are eaten together: the card then adds them up, and the total comes back to you.",
    input_schema: {
      type: "object",
      properties: {
        restaurant_id: { type: "string" },
        dish_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        one_meal: { type: "boolean" },
      },
      required: ["restaurant_id", "dish_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "show_recipes",
    description: "Show the person cards for recipes you recommend (ids from search_recipes, get_my_saved_recipes or get_my_meal_plan), with their real figures and a Save button.",
    input_schema: { type: "object", properties: { recipe_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 } }, required: ["recipe_ids"], additionalProperties: false },
  },
  {
    name: "show_products",
    description: "Show the person cards for supermarket products you recommend (ids from search_products), with their label figures and price.",
    input_schema: {
      type: "object",
      properties: { shop: { type: "string" }, product_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 } },
      required: ["shop", "product_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "make_meal_plan",
    description: "Set up a week's meal plan from our recipes with the app's Meal plan with Pip, using what the person told you. Shows a View meal plan button that opens the Meal plan screen, which makes the week. Leave out anything they didn't say.",
    input_schema: {
      type: "object",
      properties: {
        aim: { type: "string", enum: [...AIMS], description: "muscle: build muscle; loseFat: lose fat; steady: keep steady; eatWell: just eat well" },
        fruit_veg: { type: "string", enum: ["5", "7", "none"], description: "Fruit and veg portions a day they aim for" },
        training: { type: "string", enum: [...TRAINING], description: "Days a week they train" },
        cook_weekday: { type: "number", enum: [...COOK_TIMES], description: "Most minutes to cook on a weekday" },
        cook_weekend: { type: "number", enum: [...COOK_TIMES], description: "Most minutes to cook at the weekend" },
        leftovers: { type: "boolean", description: "Happy to cook once and eat twice" },
        skip_cuisines: { type: "array", items: { type: "string", enum: CUISINES.map((c) => c.id) } },
        spice: { type: "string", enum: [...SPICES] },
        breakfast: { type: "array", items: { type: "string", enum: [...BREAKFASTS] } },
        bread: { type: "string", enum: [...BREADS] },
        style: { type: "string", enum: [...EATING_STYLES], description: "How they like to eat (balanced if not said)" },
        notes: { type: "string", description: "Anything else about food they said, in their own words (foods they dislike, late nights), at most 300 characters" },
      },
      additionalProperties: false,
    },
  },
];

/** What the phone shows while a tool runs ("Pip is looking at Nando's menu…"). */
export function doingFor(name: string, input: Json, chainName?: string): Extract<PipEvent, { t: "doing" }> | null {
  switch (name) {
    case "find_restaurants": return { t: "doing", what: "places" };
    case "search_menu": return { t: "doing", what: "menu", ...(chainName ? { name: chainName } : typeof input.restaurant === "string" ? { name: input.restaurant.slice(0, 40) } : {}) };
    case "search_recipes": return { t: "doing", what: "recipes" };
    case "search_products": return { t: "doing", what: "products" };
    case "get_my_day": return { t: "doing", what: "day" };
    case "get_my_meal_plan": return { t: "doing", what: "plan" };
    case "get_my_saved_recipes": return { t: "doing", what: "saved" };
    default: return null;
  }
}

// ----------------------------------------------------------------------------------------------------------------------- restaurants

/** The restaurant a name means: its id, its name squashed ("Nando's" = "nandos"), then a name that starts with or holds the words. */
export async function findChain(data: PipData, asked: string): Promise<{ id: string; name: string } | { candidates: string[] }> {
  const list = await data.chains();
  const q = squash(asked);
  if (!q) return { candidates: [] };
  const exact = list.find((c) => c.id === asked || squash(c.name) === q || c.id.replace(/-/g, "") === q);
  if (exact) return exact;
  const starts = list.filter((c) => squash(c.name).startsWith(q) || q.startsWith(squash(c.name)));
  if (starts.length === 1) return starts[0]!;
  const holds = list.filter((c) => squash(c.name).includes(q));
  if (holds.length === 1 && !starts.length) return holds[0]!;
  return { candidates: [...starts, ...holds].slice(0, 6).map((c) => `${c.name} [${c.id}]`) };
}

/** Why a dish doesn't suit the person, in words, from the restaurant's own allergen guide and labels; empty when nothing says so. */
export function dishClash(item: MenuItem, prefs: Preferences, unchecked: ReturnType<typeof uncheckedDiet>): string[] {
  const out: string[] = [];
  const avoid = prefs.avoidAllergens ?? [];
  if (avoid.length) {
    const a = item.allergens;
    if (!a) out.push("No allergen information published for this dish");
    else {
      const has = avoid.filter((k) => a.contains.includes(k));
      const may = avoid.filter((k) => !a.contains.includes(k) && a.mayContain.includes(k));
      if (has.length) out.push(`Contains ${allergenWords(has)}`);
      if (may.length) out.push(`May contain ${allergenWords(may)}`);
    }
  }
  // the diet alone (allergens said above), as the restaurant page's own menu rule reads it
  const dietOnly: Preferences = { ...prefs, avoidAllergens: [] };
  if (!passesMenuDiet(item, dietOnly, { ...unchecked, allergies: false })) out.push("Doesn't suit your diet, by the restaurant's own labels or the dish's name");
  return out;
}

const dishLine = (i: MenuItem, clash: string[]) => ({
  id: i.id, name: i.name, section: i.category, serving: i.serving,
  kcal: i.nutrients.calories, protein: i.nutrients.protein ?? null, carbs: i.nutrients.carbs ?? null, fat: i.nutrients.fat ?? null,
  sugar: i.nutrients.sugar ?? null, salt: i.nutrients.salt ?? null,
  ...(clash.length ? { clash } : {}),
});

async function searchMenu(data: PipData, req: AskPipRequest, input: Json): Promise<ToolOutcome> {
  const parsed = z.object({
    restaurant: z.string().min(1).max(80), words: z.string().max(80).optional(), max_kcal: z.number().positive().max(5000).optional(),
    min_protein: z.number().min(0).max(300).optional(), sort: z.enum(["protein", "fewest_kcal", "protein_per_kcal", "menu"]).optional(),
  }).safeParse(input);
  if (!parsed.success) return { result: { error: "Those search words couldn't be read." }, isError: true };
  const q = parsed.data;
  const found = await findChain(data, q.restaurant);
  if ("candidates" in found) return { result: { not_found: q.restaurant, did_you_mean: found.candidates, note: found.candidates.length ? "Ask which one, or search again with its id." : "That restaurant isn't in the app." } };
  const chain = await data.chain(found.id);
  if (!chain) return { result: { error: "That menu couldn't be loaded just now." }, isError: true };
  const prefs = prefsOf(req);
  const unchecked = uncheckedDiet(chain.items, prefs, chain.id);
  let items = q.words ? searchItems(chain.items, q.words) : [...chain.items];
  // no dish has all the words: any of them
  if (q.words && !items.length) {
    const words = norm(q.words).split(" ").filter((w) => w.length > 2);
    items = chain.items.filter((i) => words.some((w) => ` ${norm(`${i.name} ${i.category}`)}`.includes(` ${w}`)));
  }
  items = items.filter((i) => (q.max_kcal === undefined || i.nutrients.calories <= q.max_kcal) && (q.min_protein === undefined || (i.nutrients.protein ?? -1) >= q.min_protein));
  const sort = q.sort ?? (chain.nutritionLevel === "calories" ? "fewest_kcal" : "protein_per_kcal");
  const key = (i: MenuItem): number => {
    const p = i.nutrients.protein ?? -1;
    if (sort === "protein") return -p;
    if (sort === "fewest_kcal") return i.nutrients.calories;
    if (sort === "protein_per_kcal") return i.nutrients.calories > 0 && p >= 0 ? -(p / i.nutrients.calories) : 1;
    return 0;
  };
  if (sort !== "menu") items = [...items].sort((a, b) => key(a) - key(b));
  const withClash = items.map((i) => ({ i, clash: dishClash(i, prefs, unchecked) }));
  const fits = withClash.filter((x) => !x.clash.length);
  const clashes = withClash.filter((x) => x.clash.length);
  const cannot = [
    ...(unchecked.vegetarian ? ["vegetarian (this restaurant doesn't mark its dishes)"] : []),
    ...(unchecked.vegan ? ["vegan (this restaurant names no dish vegan)"] : []),
    ...(unchecked.allergies ? ["allergies (this restaurant publishes no allergen details the app can read)"] : []),
    ...unchecked.others.map((k) => k),
  ];
  return {
    result: {
      restaurant: { id: chain.id, name: chain.name, figures: chain.nutritionLevel === "calories" ? "calories only (protein, carbs and fat not published)" : "full" },
      asked: { words: q.words ?? null, max_kcal: q.max_kcal ?? null, min_protein: q.min_protein ?? null, sort },
      fits_diet: fits.slice(0, MAX_SEARCH).map((x) => dishLine(x.i, [])),
      clash_with_diet: clashes.slice(0, 4).map((x) => dishLine(x.i, x.clash)),
      matching: items.length,
      ...(cannot.length ? { cannot_check: cannot } : {}),
      note: "Figures are per serving as the restaurant publishes them. Show your picks with show_dishes.",
    },
  };
}

async function findRestaurants(data: PipData, input: Json): Promise<ToolOutcome> {
  const words = typeof input.words === "string" ? norm(input.words) : "";
  if (!words) return { result: { error: "Say a name or a kind of food." }, isError: true };
  const list = await data.chains();
  const ws = words.split(" ").filter(Boolean);
  const hits = list.filter((c) => ws.every((w) => ` ${norm(`${c.name} ${c.cuisine}`)}`.includes(` ${w}`)) || squash(c.name).includes(squash(words)));
  return { result: { restaurants: hits.slice(0, 12).map((c) => ({ id: c.id, name: c.name, kind: c.cuisine })), found: hits.length } };
}

async function showDishes(data: PipData, req: AskPipRequest, input: Json): Promise<ToolOutcome> {
  const parsed = z.object({ restaurant_id: z.string().min(1).max(80), dish_ids: z.array(z.string().max(160)).min(1).max(6), one_meal: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return { result: { error: "Give a restaurant id and one to six dish ids from search_menu." }, isError: true };
  const found = await findChain(data, parsed.data.restaurant_id);
  if ("candidates" in found) return { result: { error: "Unknown restaurant id. Use the id search_menu returned." }, isError: true };
  const chain = await data.chain(found.id);
  if (!chain) return { result: { error: "That menu couldn't be loaded just now." }, isError: true };
  const prefs = prefsOf(req);
  const unchecked = uncheckedDiet(chain.items, prefs, chain.id);
  const byId = new Map(chain.items.map((i) => [i.id, i]));
  const picked = [...new Set(parsed.data.dish_ids)].map((id) => byId.get(id)).filter((i): i is MenuItem => !!i);
  if (!picked.length) return { result: { error: "None of those dish ids are on this menu. Use ids from search_menu." }, isError: true };
  const items: DishCardItem[] = picked.map((i) => {
    const clash = dishClash(i, prefs, unchecked);
    return { id: i.id, name: i.name, serving: i.serving, kcal: i.nutrients.calories, protein: i.nutrients.protein ?? null, carbs: i.nutrients.carbs ?? null, fat: i.nutrients.fat ?? null, ...(i.image ? { image: i.image } : {}), clash };
  });
  // a meal's total: plain sums of the published figures; a figure the restaurant doesn't print for every dish has no total
  const sum = (k: "protein" | "carbs" | "fat") => (items.every((i) => i[k] !== null) ? round1(items.reduce((n, i) => n + (i[k] ?? 0), 0)) : null);
  const total = parsed.data.one_meal && items.length > 1 ? { kcal: Math.round(items.reduce((n, i) => n + i.kcal, 0)), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat") } : null;
  return {
    result: { shown: items.map((i) => i.name), ...(total ? { together: total } : {}), missing: parsed.data.dish_ids.length - picked.length },
    card: { kind: "dishes", chain: { id: chain.id, name: chain.name }, items, total },
  };
}

// ----------------------------------------------------------------------------------------------------------------------- recipes

/** The person's recipe shop (the first of their own whose labels the app has read, else the first ready one: recipeShopSet) and its products. */
async function recipeShop(data: PipData, req: AskPipRequest): Promise<{ id: string; name: string; products: ShopProduct[] } | null> {
  const manifest = await data.shops();
  const id = recipeShopSet(manifest, null, req.me.shops)[0];
  const entry = id ? manifest?.retailers.find((r) => r.id === id) : undefined;
  if (!id || !entry) return null;
  const products = await data.products(id);
  return products ? { id, name: entry.name, products } : null;
}

/** One serving of a recipe as written, for the person's diet, from the shop's labels (resolveRecipe, recipeTotals); null when the shop can't make all of it. */
const figuresCache = new Map<string, RecipeCardItem | null>();
export function recipeFigures(recipe: Recipe, prefs: Preferences, shopId: string, products: readonly ShopProduct[]): RecipeCardItem | null {
  const key = `${shopId}|${recipe.id}|${JSON.stringify(prefs)}|${products.length}`;
  if (figuresCache.has(key)) return figuresCache.get(key)!;
  const fitted = recipeForDiet(recipe, prefs);
  const totals = fitted ? recipeTotals(resolveRecipe(fitted, products)) : null;
  const out = totals
    ? { id: recipe.id, name: recipe.name, meal: recipe.meal ?? "", minutes: recipe.minutes, kcal: Math.round(totals.perServing.kcal), protein: round1(totals.perServing.protein), carbs: round1(totals.perServing.carbs), fat: round1(totals.perServing.fat), cost: totals.costPerServing === null ? null : Math.round(totals.costPerServing * 100) / 100 }
    : null;
  figuresCache.set(key, out);
  if (figuresCache.size > 5000) figuresCache.delete(figuresCache.keys().next().value as string);
  return out;
}

const recipeHay = (r: Recipe) => ` ${norm(`${r.name} ${r.meal ?? ""} ${(r.tags ?? []).join(" ")} ${r.ingredients.map((i) => i.label).join(" ")}`)}`;

async function searchRecipes(data: PipData, req: AskPipRequest, input: Json): Promise<ToolOutcome> {
  const parsed = z.object({
    words: z.string().max(80).optional(), meal: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
    max_kcal: z.number().positive().max(5000).optional(), min_protein: z.number().min(0).max(300).optional(), max_minutes: z.number().positive().max(1440).optional(),
  }).safeParse(input);
  if (!parsed.success) return { result: { error: "Those search words couldn't be read." }, isError: true };
  const q = parsed.data;
  const shop = await recipeShop(data, req);
  if (!shop) return { result: { error: "The supermarket lists couldn't be loaded just now." }, isError: true };
  const prefs = prefsOf(req);
  const words = q.words ? norm(q.words).split(" ").filter((w) => w.length > 1) : [];
  const scored = [...RECIPE_BY_ID.values()]
    .filter((r) => (!q.meal || r.meal === q.meal) && (q.max_minutes === undefined || r.minutes <= q.max_minutes) && recipeForDiet(r, prefs) !== null)
    .map((r) => ({ r, hits: words.filter((w) => recipeHay(r).includes(` ${w}`)).length }))
    .filter((x) => !words.length || x.hits >= Math.ceil(words.length / 2))
    .sort((a, b) => b.hits - a.hits);
  // figures for the best-matching first (each is worked out from the labels, so at most a few dozen a question)
  const out: RecipeCardItem[] = [];
  for (const { r } of scored.slice(0, 60)) {
    const f = recipeFigures(r, prefs, shop.id, shop.products);
    if (!f) continue;
    if (q.max_kcal !== undefined && f.kcal > q.max_kcal) continue;
    if (q.min_protein !== undefined && f.protein < q.min_protein) continue;
    out.push(f);
  }
  const ranked = out.sort((a, b) => (q.min_protein !== undefined || q.max_kcal !== undefined ? b.protein / Math.max(1, b.kcal) - a.protein / Math.max(1, a.kcal) : 0)).slice(0, 8);
  return {
    result: {
      shop: shop.name, asked: { words: q.words ?? null, meal: q.meal ?? null, max_kcal: q.max_kcal ?? null, min_protein: q.min_protein ?? null, max_minutes: q.max_minutes ?? null },
      recipes: ranked.map((f) => ({ id: f.id, name: f.name, meal: f.meal, minutes: f.minutes, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, cost_per_serving: f.cost })),
      note: `One serving as written, from ${shop.name} labels. The recipe page can fit it to the person's meal size. Show your picks with show_recipes.`,
    },
  };
}

async function showRecipes(data: PipData, req: AskPipRequest, input: Json): Promise<ToolOutcome> {
  const parsed = z.object({ recipe_ids: z.array(z.string().max(80)).min(1).max(4) }).safeParse(input);
  if (!parsed.success) return { result: { error: "Give one to four recipe ids from search_recipes." }, isError: true };
  const shop = await recipeShop(data, req);
  if (!shop) return { result: { error: "The supermarket lists couldn't be loaded just now." }, isError: true };
  const prefs = prefsOf(req);
  const items = [...new Set(parsed.data.recipe_ids)].map((id) => RECIPE_BY_ID.get(id)).filter((r): r is Recipe => !!r).map((r) => recipeFigures(r, prefs, shop.id, shop.products)).filter((f): f is RecipeCardItem => !!f);
  if (!items.length) return { result: { error: "None of those recipes can be made for this person. Use ids from search_recipes." }, isError: true };
  return { result: { shown: items.map((i) => i.name), note: "Each card has a Save button." }, card: { kind: "recipes", shop: { id: shop.id, name: shop.name }, items } };
}

// ----------------------------------------------------------------------------------------------------------------------- supermarket products

async function shopFor(data: PipData, req: AskPipRequest, asked: string | undefined): Promise<{ id: string; name: string } | null> {
  const manifest = await data.shops();
  if (!manifest) return null;
  const list = manifest.retailers;
  if (asked) {
    const q = squash(asked);
    const hit = list.find((r) => r.id === asked || squash(r.name) === q || squash(r.name).startsWith(q));
    if (hit) return { id: hit.id, name: hit.name };
  }
  const mine = req.me.shops.map((id) => list.find((r) => r.id === id)).find((r) => r && (r.nutrition ?? 0) > 0);
  const first = mine ?? list.find((r) => (r.nutrition ?? 0) > 0);
  return first ? { id: first.id, name: first.name } : null;
}

function productClash(p: ShopProduct, prefs: Preferences): string[] {
  const out: string[] = [];
  const problem = foodDietProblem({ name: p.name, category: p.category }, { ...prefs, avoidAllergens: [] });
  if (problem) out.push("Doesn't suit your diet, by its name or aisle");
  if (prefs.avoidAllergens?.length) out.push(`Check the pack for ${allergenWords(prefs.avoidAllergens)}`);
  return out;
}

const productLine = (p: ShopProduct, prefs: Preferences) => {
  const n = p.nutrition!;
  const clash = productClash(p, prefs);
  return { id: p.id, name: p.name, price: p.price, per: `100${n.per}`, kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat, sugar: n.sugars, salt: n.salt, ...(clash.length ? { clash } : {}) };
};

async function searchProducts(data: PipData, req: AskPipRequest, input: Json): Promise<ToolOutcome> {
  const parsed = z.object({ words: z.string().min(1).max(80), shop: z.string().max(40).optional(), sort: z.enum(["protein", "fewest_kcal", "price", "protein_per_kcal"]).optional() }).safeParse(input);
  if (!parsed.success) return { result: { error: "Say what to look for." }, isError: true };
  const shop = await shopFor(data, req, parsed.data.shop);
  const products = shop ? await data.products(shop.id) : null;
  if (!shop || !products) return { result: { error: "That supermarket's list couldn't be loaded just now." }, isError: true };
  const sort = parsed.data.sort === "protein" ? "protein" : parsed.data.sort === "price" ? "price" : parsed.data.sort === "protein_per_kcal" ? "density" : "name";
  let list = searchShopProducts(products, { query: parsed.data.words, nutrition: true, sort }).filter((p) => p.nutrition && !p.nutrition.state);
  if (parsed.data.sort === "fewest_kcal") list = [...list].sort((a, b) => a.nutrition!.kcal - b.nutrition!.kcal);
  const prefs = prefsOf(req);
  return {
    result: {
      shop: { id: shop.id, name: shop.name }, asked: { words: parsed.data.words, sort: parsed.data.sort ?? null },
      products: list.slice(0, MAX_SEARCH).map((p) => productLine(p, prefs)), matching: list.length,
      note: "Figures are per 100 g or 100 ml from the product's label; price is the shop's shelf price. Show your picks with show_products.",
    },
  };
}

async function showProducts(data: PipData, req: AskPipRequest, input: Json): Promise<ToolOutcome> {
  const parsed = z.object({ shop: z.string().min(1).max(40), product_ids: z.array(z.string().max(120)).min(1).max(6) }).safeParse(input);
  if (!parsed.success) return { result: { error: "Give a shop and one to six product ids from search_products." }, isError: true };
  const shop = await shopFor(data, req, parsed.data.shop);
  const products = shop ? await data.products(shop.id) : null;
  if (!shop || !products) return { result: { error: "That supermarket's list couldn't be loaded just now." }, isError: true };
  const byId = new Map(products.map((p) => [p.id, p]));
  const prefs = prefsOf(req);
  const items: ProductCardItem[] = [...new Set(parsed.data.product_ids)].map((id) => byId.get(id)).filter((p): p is ShopProduct => !!p?.nutrition && !p.nutrition.state)
    .map((p) => ({ id: p.id, name: p.name, price: p.price, per: p.nutrition!.per, kcal: p.nutrition!.kcal, protein: p.nutrition!.protein, carbs: p.nutrition!.carbs, fat: p.nutrition!.fat, clash: productClash(p, prefs) }));
  if (!items.length) return { result: { error: "None of those products are in that list. Use ids from search_products." }, isError: true };
  return { result: { shown: items.map((i) => i.name) }, card: { kind: "products", shop, items } };
}

// ----------------------------------------------------------------------------------------------------------------------- the person's own day, recipes and plan

function myDay(req: AskPipRequest): ToolOutcome {
  if (!req.day || !req.day.entries.length) return { result: { logged: [], note: "Nothing is logged today yet.", targets: { kcal: req.me.kcal, protein: req.me.protein } } };
  return { result: { logged: req.day.entries, total: req.day.total, left: req.day.left, targets: { kcal: req.me.kcal, protein: req.me.protein }, note: "Entries marked estimate are photo estimates (Scan your food), not labels." } };
}

function mySaved(req: AskPipRequest): ToolOutcome {
  const list = req.saved.map((id) => RECIPE_BY_ID.get(id)).filter((r): r is Recipe => !!r).map((r) => ({ id: r.id, name: r.name, meal: r.meal ?? null }));
  return { result: { saved: list, note: list.length ? "Use show_recipes to show any with their figures." : "No recipes saved yet." } };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function myPlan(req: AskPipRequest): ToolOutcome {
  const plan = req.plan;
  if (!plan) return { result: { plan: null, note: "No meal plan yet. make_meal_plan can set one up." } };
  const start = new Date(`${plan.start}T12:00:00Z`);
  const days = plan.days.map((ids, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    return { day: Number.isNaN(d.getTime()) ? `Day ${i + 1}` : DAY_NAMES[d.getUTCDay()], meals: ids.map((id, j) => ({ slot: plan.slots[j] ?? "meal", recipe: id ? RECIPE_BY_ID.get(id)?.name ?? null : null, id })) };
  });
  return { result: { starts: plan.start, days, note: "Use show_recipes for any recipe's figures." } };
}

function makeMealPlan(input: Json): ToolOutcome {
  const parsed = z.object({
    aim: z.enum(AIMS).optional(), fruit_veg: z.enum(["5", "7", "none"]).optional(), training: z.enum(TRAINING).optional(),
    cook_weekday: z.number().optional(), cook_weekend: z.number().optional(), leftovers: z.boolean().optional(),
    skip_cuisines: z.array(z.string()).max(CUISINES.length).optional(), spice: z.enum(SPICES).optional(),
    breakfast: z.array(z.enum(BREAKFASTS)).max(3).optional(), bread: z.enum(BREADS).optional(), style: z.enum(EATING_STYLES).optional(), notes: z.string().max(600).optional(),
  }).safeParse(input);
  if (!parsed.success) return { result: { error: "Those plan answers couldn't be read. Use the listed values only." }, isError: true };
  const a = parsed.data;
  const answers = sanitizeAnswers({
    aim: a.aim, fruitVeg: a.fruit_veg === "none" ? "none" : a.fruit_veg ? Number(a.fruit_veg) : undefined, training: a.training, cookWeekday: a.cook_weekday,
    cookWeekend: a.cook_weekend, leftovers: a.leftovers, skipCuisines: a.skip_cuisines, spice: a.spice, breakfast: a.breakfast, bread: a.bread, notes: a.notes,
  });
  return {
    result: { ready: true, note: "The person taps View meal plan; the Meal plan screen makes the week from these answers and shows it. Tell them to tap it." },
    card: { kind: "plan", handoff: { answers, ...(a.style ? { style: a.style } : {}) }, lines: [] },
  };
}

// ----------------------------------------------------------------------------------------------------------------------- running a tool

export async function runTool(name: string, input: unknown, data: PipData, req: AskPipRequest): Promise<ToolOutcome> {
  const i = (typeof input === "object" && input !== null ? input : {}) as Json;
  try {
    switch (name) {
      case "find_restaurants": return await findRestaurants(data, i);
      case "search_menu": return await searchMenu(data, req, i);
      case "search_recipes": return await searchRecipes(data, req, i);
      case "search_products": return await searchProducts(data, req, i);
      case "get_my_day": return myDay(req);
      case "get_my_saved_recipes": return mySaved(req);
      case "get_my_meal_plan": return myPlan(req);
      case "show_dishes": return await showDishes(data, req, i);
      case "show_recipes": return await showRecipes(data, req, i);
      case "show_products": return await showProducts(data, req, i);
      case "make_meal_plan": return makeMealPlan(i);
      default: return { result: { error: `There is no tool called ${name}.` }, isError: true };
    }
  } catch (error) {
    console.error(`ask pip tool ${name}:`, error);
    return { result: { error: "That couldn't be looked up just now." }, isError: true };
  }
}

/** The diet words as the AI reads them. */
export const DIET_LABELS: Record<(typeof DIET_WORDS)[number], string> = {
  vegetarianOnly: "vegetarian", veganOnly: "vegan", pescatarianOnly: "pescatarian (fish, no meat)", halalOnly: "halal", noPork: "no pork", noBeef: "no beef",
  noRedMeat: "no red meat", noOnionGarlic: "no onion or garlic", jain: "Jain", kosherStyle: "kosher style", noAlcohol: "no alcohol", noHalalKosherMeat: "no halal or kosher meat",
};
