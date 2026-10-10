import { PANTRY, kindExcluded, kindForDiet, type DietPrefs, type IngredientMatch, type IngredientRole, type PantryKind } from "./pantry";
import { normalizeForSearch } from "./search";
import type { ShopProduct } from "./shopProducts";

export type { IngredientMatch } from "./pantry";

// Recipes from the shop you use (founder 2026-10-10: "craft recipes based on where you shop"). Each recipe is ours (the dish, the
// amounts and the method) or written by Pip with AI from the same pantry, but every number shown comes from the supermarket's own listing:
// the price, the price per kg or litre, and the nutrition its product page prints per 100 g or ml. Nothing is estimated: an ingredient is
// matched only to products whose label numbers are for the food as sold, in the recipe's unit, and inside a plausible range for that form
// (dry pasta is not cooked pasta), and totals are plain arithmetic on those labels for the amounts in the recipe. Fitting a recipe to
// someone's calories and protein changes only the amounts (protein and carb ingredients, rounded to 5 g); the numbers are then worked out
// again from the labels. Blurbs describe the dish, never make a nutrition or health claim (CLAUDE.md rule 3). Pure and unit-tested.

export interface IngredientSpec {
  key: string;
  label: string;
  amount: number;
  unit: "g" | "ml";
  /** Shown after the amount ("uncooked", "about 4 eggs"). */
  note?: string;
  /** The amount is the drained weight: only products whose label is per 100 g drained (or that are sold ready-drained) count. */
  drained?: boolean;
  match: IngredientMatch;
  /** What it does when the recipe is fitted to someone's numbers (default "other": stays as written). */
  role?: IngredientRole;
  /** The pantry kind it comes from (diet checks and halal products use it). */
  pantry?: string;
}

export interface Recipe {
  id: string;
  name: string;
  blurb: string;
  servings: number;
  minutes: number;
  ingredients: IngredientSpec[];
  method: string[];
  /** Things the recipe uses that are not counted (store-cupboard bits, any vegetables you add). */
  extras: string[];
  /** Written by Pip with AI (shown with its own caution). */
  ai?: boolean;
}

/** An ingredient from the pantry: amount in the kind's unit; role and note can be changed for this recipe. */
export function ing(key: string, amount: number, opts: { role?: IngredientRole; note?: string; label?: string } = {}): IngredientSpec {
  const k = PANTRY.get(key);
  if (!k) throw new Error(`unknown pantry kind ${key}`);
  return specFromKind(k, amount, opts);
}

export function specFromKind(k: PantryKind, amount: number, opts: { role?: IngredientRole; note?: string; label?: string } = {}): IngredientSpec {
  return {
    key: k.key, pantry: k.key, label: opts.label ?? k.label, amount, unit: k.unit, match: k.match, role: opts.role ?? k.role,
    ...(k.drained ? { drained: true } : {}),
    ...(opts.note ?? (k.drained ? "drained" : k.note) ? { note: opts.note ?? (k.drained ? "drained" : k.note) } : {}),
  };
}

const GLOBAL_NONE = ["meal", "sandwich", "kit", "gift", "hamper", "selection"];
const MEAT_WORDS = ["chicken", "beef", "pork", "lamb", "turkey", "bacon", "ham", "sausage", "salmon", "tuna", "prawn", "fish", "anchov", "chorizo", "pepperoni", "cod"];

export const RECIPES: readonly Recipe[] = [
  {
    id: "chicken-rice-bowl", name: "Chicken, rice and soy bowl", blurb: "Three ingredients, on the table in 25 minutes.", servings: 2, minutes: 25,
    ingredients: [ing("chicken", 300), ing("rice", 150), ing("soy", 30)],
    method: ["Cook the rice as the pack says.", "Slice the chicken and cook it in a hot non-stick pan for 6 to 8 minutes, until cooked through with no pink inside.", "Stir in the soy sauce and serve on the rice."],
    extras: ["Any vegetables you like (not counted)", "A little oil spray (not counted)"],
  },
  {
    id: "chicken-curry", name: "Chicken curry with rice", blurb: "A creamy curry made with yogurt instead of cream.", servings: 2, minutes: 35,
    ingredients: [ing("chicken", 300), ing("curry-paste", 60), ing("chopped-tomatoes", 400), ing("greek-yogurt", 150), ing("rice", 150)],
    method: ["Cook the rice as the pack says.", "Cut the chicken into chunks and brown it in a non-stick pan, then stir in the curry paste for a minute.", "Add the tomatoes and simmer for 15 minutes, until the chicken is cooked through.", "Take off the heat and stir in the yogurt."],
    extras: ["An onion or any vegetables you like (not counted)"],
  },
  {
    id: "beef-chilli", name: "Beef chilli and rice", blurb: "A batch-cook classic for four.", servings: 4, minutes: 45,
    ingredients: [ing("beef-mince", 500), ing("kidney-beans", 240, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 300)],
    method: ["Brown the mince in a large pan until no pink is left.", "Add the tomatoes, beans and chilli powder or spices to taste; simmer for 25 minutes.", "Cook the rice as the pack says and serve."],
    extras: ["Chilli powder, cumin and an onion (not counted)"],
  },
  {
    id: "turkey-bolognese", name: "Turkey bolognese", blurb: "Spaghetti bolognese made with turkey mince.", servings: 4, minutes: 35,
    ingredients: [ing("turkey-mince", 500), ing("passata", 500), ing("pasta-long", 300), ing("cheddar", 40)],
    method: ["Brown the turkey mince in a large pan until no pink is left.", "Add the passata and simmer for 15 minutes.", "Cook the spaghetti as the pack says, then serve with the sauce and the cheese grated on top."],
    extras: ["Garlic, dried herbs and any vegetables you like (not counted)"],
  },
  {
    id: "salmon-noodles", name: "Salmon and soy noodles", blurb: "Ready in 20 minutes.", servings: 2, minutes: 20,
    ingredients: [ing("salmon", 240), ing("noodles", 300), ing("soy", 30)],
    method: ["Bake or pan-fry the salmon for 10 to 12 minutes, until it flakes easily.", "Warm the noodles in a pan with the soy sauce.", "Flake the salmon over the noodles."],
    extras: ["Spring onions or any vegetables you like (not counted)"],
  },
  {
    id: "tuna-pasta", name: "Tuna and tomato pasta", blurb: "Store-cupboard dinner for three.", servings: 3, minutes: 20,
    ingredients: [ing("tuna", 204), ing("pasta-shapes", 200), ing("passata", 500), ing("cheddar", 60)],
    method: ["Cook the pasta as the pack says.", "Warm the passata in a pan and stir in the drained tuna.", "Mix with the pasta and top with grated cheese."],
    extras: ["Dried herbs or sweetcorn (not counted)"],
  },
  {
    id: "prawn-curry", name: "Thai prawn curry", blurb: "A coconut curry with rice, made with light coconut milk.", servings: 3, minutes: 25,
    ingredients: [ing("prawns", 300), ing("coconut-light", 400), ing("thai-curry-paste", 50), ing("rice", 150)],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, then add the coconut milk and simmer for 5 minutes.", "Add the prawns and cook until piping hot (raw prawns: until pink all the way through)."],
    extras: ["Any vegetables you like (not counted)"],
  },
  {
    id: "tofu-satay", name: "Tofu satay noodles", blurb: "Peanut sauce, crispy tofu, no meat.", servings: 2, minutes: 25,
    ingredients: [ing("tofu", 300), ing("noodles", 300), ing("peanut-butter", 40), ing("soy", 30)],
    method: ["Press and cube the tofu, then fry in a non-stick pan until golden.", "Whisk the peanut butter and soy sauce with a splash of hot water.", "Toss the noodles in the sauce and top with the tofu."],
    extras: ["Lime, chilli and any vegetables you like (not counted)"],
  },
  {
    id: "overnight-oats", name: "Overnight oats with yogurt", blurb: "Make it the night before, grab it in the morning.", servings: 2, minutes: 5,
    ingredients: [ing("oats", 80), ing("greek-yogurt", 200, { role: "protein" }), ing("milk", 150), ing("peanut-butter", 20)],
    method: ["Mix the oats, yogurt and milk in two jars or bowls.", "Swirl in the peanut butter, cover and chill overnight."],
    extras: ["Fruit on top (not counted)"],
  },
  {
    id: "cheesy-egg-wraps", name: "Cheesy scrambled egg wraps", blurb: "A filling breakfast in ten minutes.", servings: 2, minutes: 10,
    ingredients: [ing("eggs", 240, { note: "about 4 eggs" }), ing("cheddar", 40), ing("wraps", 120), ing("milk", 30)],
    method: ["Whisk the eggs with the milk.", "Scramble gently in a non-stick pan until set, then stir in the grated cheese.", "Warm the wraps and fill."],
    extras: ["Spinach or tomatoes (not counted)"],
  },
  {
    id: "chickpea-curry", name: "Chickpea and tomato curry", blurb: "A meat-free curry that keeps well.", servings: 3, minutes: 30,
    ingredients: [ing("chickpeas", 240), ing("chopped-tomatoes", 400), ing("curry-paste", 60), ing("coconut-light", 200), ing("rice", 150)],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, add the tomatoes, chickpeas and coconut milk.", "Simmer for 15 minutes and serve."],
    extras: ["An onion and spinach (not counted)"],
  },
  {
    id: "chicken-wraps", name: "Chicken and yogurt wraps", blurb: "Easy to pack for lunch.", servings: 3, minutes: 20,
    ingredients: [ing("chicken", 300), ing("wraps", 180), ing("greek-yogurt", 100), ing("cheddar", 40)],
    method: ["Slice the chicken and cook in a hot pan for 6 to 8 minutes, until cooked through with no pink inside.", "Mix the yogurt with a squeeze of lemon and seasoning.", "Fill the wraps with chicken, yogurt and grated cheese."],
    extras: ["Lettuce, lemon and seasoning (not counted)"],
  },
  {
    id: "black-bean-chilli", name: "Black bean chilli", blurb: "A plant-based chilli with two kinds of beans.", servings: 4, minutes: 35,
    ingredients: [ing("black-beans", 470), ing("kidney-beans", 240), ing("chopped-tomatoes", 800), ing("rice", 300)],
    method: ["Warm the tomatoes in a large pan with chilli powder or spices to taste.", "Add the drained beans and simmer for 20 minutes.", "Cook the rice as the pack says and serve."],
    extras: ["An onion, garlic, cumin and chilli powder (not counted)"],
  },
  {
    id: "cod-butter-beans", name: "Cod with butter beans and tomatoes", blurb: "One pan, simple and quick.", servings: 2, minutes: 25,
    ingredients: [ing("cod", 250), ing("butter-beans", 235), ing("chopped-tomatoes", 400)],
    method: ["Simmer the tomatoes and drained beans in a wide pan for 10 minutes.", "Sit the cod on top, cover and cook for 8 to 10 minutes, until it flakes easily and is white all the way through."],
    extras: ["Garlic, a pinch of paprika and parsley (not counted)"],
  },
  {
    id: "halloumi-wraps", name: "Halloumi and chickpea wraps", blurb: "Golden halloumi with warm chickpeas.", servings: 2, minutes: 15,
    ingredients: [ing("halloumi", 150), ing("chickpeas", 240), ing("wraps", 120), ing("houmous", 60)],
    method: ["Slice the halloumi and fry in a dry non-stick pan until golden on both sides.", "Warm the drained chickpeas in the same pan.", "Spread the wraps with houmous and fill with the halloumi and chickpeas."],
    extras: ["Lettuce, tomato and a squeeze of lemon (not counted)"],
  },
  {
    id: "lentil-pasta", name: "Lentil and tomato pasta", blurb: "A meat-free ragu from the store cupboard.", servings: 3, minutes: 25,
    ingredients: [ing("green-lentils", 265), ing("passata", 500), ing("pasta-shapes", 225)],
    method: ["Cook the pasta as the pack says.", "Simmer the passata and drained lentils for 10 minutes.", "Stir the sauce through the pasta."],
    extras: ["Garlic, dried herbs and an onion (not counted)"],
  },
  {
    id: "chicken-bean-rice", name: "Chicken thigh, bean and tomato rice", blurb: "A one-pot rice with chicken and black beans.", servings: 3, minutes: 40,
    ingredients: [ing("chicken-thigh", 400), ing("black-beans", 235, { role: "other" }), ing("chopped-tomatoes", 400), ing("rice", 200)],
    method: ["Brown the chicken pieces in a large pan.", "Add the rice, tomatoes, drained beans and 400 ml of water; bring to the boil.", "Cover and simmer for 20 minutes, until the rice is tender and the chicken is cooked through."],
    extras: ["Smoked paprika and an onion (not counted)"],
  },
];

// ---- diet

/** The recipe has no meat or fish in it, by its pantry kinds (an ingredient without one can't be known, so the answer is no). */
export function isMeatFree(recipe: Recipe): boolean {
  return recipe.ingredients.every((i) => {
    const k = i.pantry ? PANTRY.get(i.pantry) : undefined;
    return !!k && !k.meat && !k.fish;
  });
}

/** The recipe as these preferences need it (halal meat products), or null when one of its ingredients is left out for them. */
export function recipeForDiet(recipe: Recipe, prefs: DietPrefs): Recipe | null {
  const out: IngredientSpec[] = [];
  for (const i of recipe.ingredients) {
    const k = i.pantry ? PANTRY.get(i.pantry) : undefined;
    if (!k) { out.push(i); continue; }
    if (kindExcluded(k, prefs) !== null) return null;
    const d = kindForDiet(k, prefs);
    out.push(d === k ? i : { ...i, label: d.label, match: d.match });
  }
  return { ...recipe, ingredients: out };
}

// ---- matching ----

const hayCache = new WeakMap<object, string>();
const hay = (p: ShopProduct): string => {
  let h = hayCache.get(p);
  if (h === undefined) {
    h = ` ${normalizeForSearch(p.name)} `;
    hayCache.set(p, h);
  }
  return h;
};
/** A word (or phrase) that starts a word in the name: "ham" is not in "graham", "pea" is in "peas". */
const has = (h: string, word: string) => h.includes(` ${normalizeForSearch(word)}`);

/** The pack's own weight or volume from its name ("320g", "1kg", "1.13L", "4x125g", "1 Pint"), in g or ml; null when the name doesn't say.
 *  A drained weight in brackets ("400g (240g*)", "4x125g (102g Drained)") is skipped here: see drainedSize. */
export function packSize(name: string, unit: "g" | "ml"): number | null {
  const n = name.toLowerCase().replace(/\([^)]*(?:\*|drained)[^)]*\)/g, " ");
  const toBase = (v: number, u: string): number | null => {
    if (unit === "g") return u === "kg" ? v * 1000 : u === "g" ? v : null;
    if (u.startsWith("pint")) return v * 568;
    return u === "l" || u.startsWith("litre") ? v * 1000 : u === "ml" ? v : null;
  };
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres)\b/.exec(n);
  if (multi) {
    const each = toBase(Number(multi[2]), multi[3]!);
    if (each) return Number(multi[1]) * each;
  }
  for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|litres|pints?)\b/g)) {
    const v = toBase(Number(m[1]), m[2]!);
    if (v && v > 0) return v;
  }
  return null;
}

/** The drained weight of a can or carton in grams: printed in its name ("(240g*)", "(102g Drained)" per can, "(4x102g Drained)"),
 *  else the quantity the shop's own price per kg is for (the shop prices canned food by drained weight), else the name's pack weight. */
export function drainedSize(product: Pick<ShopProduct, "name" | "price" | "unitPrice" | "unit">): number | null {
  const n = product.name.toLowerCase();
  const d = /\((?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g)\s*(?:\*|drained)\s*\)/.exec(n);
  if (d) {
    const each = Number(d[2]) * (d[3] === "kg" ? 1000 : 1);
    const count = d[1] ? Number(d[1]) : Number(/(\d+)\s*[x×]\s*\d/.exec(n.slice(0, d.index))?.[1] ?? 1);
    return count * each;
  }
  if (product.unit === "per kg" && product.unitPrice) return Math.round((product.price / product.unitPrice) * 1000);
  return packSize(product.name, "g");
}

export interface IngredientPick {
  spec: IngredientSpec;
  product: ShopProduct;
  /** Packs to buy for the recipe's amount (1 when the pack size isn't printed in its name). */
  packs: number;
  /** What those packs cost at the shelf price. */
  basketCost: number;
  /** What the amount used costs at the shop's own price per kg or litre (null when the shop prints no such price). */
  usedCost: number | null;
}

export function pickFor(spec: IngredientSpec, product: ShopProduct): IngredientPick {
  const size = spec.drained ? drainedSize(product) : packSize(product.name, spec.unit);
  const packs = size ? Math.max(1, Math.ceil(spec.amount / size - 1e-9)) : 1;
  const perKgOrLitre = product.unitPrice !== null && (spec.unit === "g" ? product.unit === "per kg" : product.unit === "per litre");
  const usedCost = perKgOrLitre ? (product.unitPrice! * spec.amount) / 1000 : size ? (product.price * spec.amount) / size : null;
  return { spec, product, packs, basketCost: packs * product.price, usedCost };
}

/** Products at the shop that can stand for this ingredient, cheapest basket first (then price per kg/litre, then name). */
export function candidates(products: readonly ShopProduct[], spec: IngredientSpec, meatFree = false): IngredientPick[] {
  const m = spec.match;
  const out: IngredientPick[] = [];
  for (const p of products) {
    const n = p.nutrition;
    if (!n || n.per !== spec.unit) continue;
    const h = hay(p);
    // the label must be for the food as the recipe weighs it: as sold, or (for a drained amount) per 100 g drained or a product sold ready-drained
    if (!(n.state === "" ? !spec.drained || has(h, "drained") || has(h, "no drain") : spec.drained && n.state === "drained")) continue;
    if (!m.all.every((w) => has(h, w))) continue;
    if (m.any && !m.any.some((w) => has(h, w))) continue;
    if ([...GLOBAL_NONE, ...(m.none ?? [])].some((w) => has(h, w))) continue;
    if (meatFree && MEAT_WORDS.some((w) => has(h, w))) continue;
    if (m.kcal && (n.kcal < m.kcal[0] || n.kcal > m.kcal[1])) continue;
    if (m.minProtein !== undefined && n.protein < m.minProtein) continue;
    if (m.maxFat !== undefined && n.fat > m.maxFat) continue;
    out.push(pickFor(spec, p));
  }
  return out.sort((a, b) => a.basketCost - b.basketCost || (a.product.unitPrice ?? Infinity) - (b.product.unitPrice ?? Infinity) || a.product.name.localeCompare(b.product.name, "en-GB"));
}

export interface ResolvedRecipe {
  recipe: Recipe;
  picks: Array<IngredientPick | null>;
  /** Every ingredient found at this shop. */
  complete: boolean;
}

/** The cheapest match for each ingredient, or a chosen product where the user swapped one (by product id). */
export function resolveRecipe(recipe: Recipe, products: readonly ShopProduct[], chosen: Readonly<Record<string, string>> = {}): ResolvedRecipe {
  const picks = recipe.ingredients.map((spec) => {
    const list = candidates(products, spec, isMeatFree(recipe));
    return list.find((c) => c.product.id === chosen[spec.key]) ?? list[0] ?? null;
  });
  return { recipe, picks, complete: picks.every(Boolean) };
}

export interface RecipeTotals {
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
  /** The rest of the label, per serving: null where any product's label doesn't print that figure (never filled in). */
  label: { kj: number | null; saturates: number | null; sugars: number | null; fibre: number | null; salt: number | null };
  /** The amounts used, at the shop's price per kg or litre, per serving (null if any ingredient has no such price). */
  costPerServing: number | null;
  /** Whole packs to buy. */
  basket: number;
}

/** Plain arithmetic on the labels: per-100 figure × amount / 100, summed, divided by servings. Only for a complete recipe. */
export function recipeTotals(r: ResolvedRecipe): RecipeTotals | null {
  if (!r.complete) return null;
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const more: Record<"kj" | "saturates" | "sugars" | "fibre" | "salt", number | null> = { kj: 0, saturates: 0, sugars: 0, fibre: 0, salt: 0 };
  let used = 0;
  let usedKnown = true;
  let basket = 0;
  for (const p of r.picks as IngredientPick[]) {
    const n = p.product.nutrition!;
    const f = p.spec.amount / 100;
    sum.kcal += n.kcal * f;
    sum.protein += n.protein * f;
    sum.carbs += n.carbs * f;
    sum.fat += n.fat * f;
    for (const k of ["kj", "saturates", "sugars", "fibre", "salt"] as const) {
      const v = n[k];
      more[k] = v === null || more[k] === null ? null : more[k]! + v * f;
    }
    if (p.usedCost === null) usedKnown = false;
    else used += p.usedCost;
    basket += p.basketCost;
  }
  const s = r.recipe.servings;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const per = (v: number | null, digits: number) => (v === null ? null : Math.round((v / s) * 10 ** digits) / 10 ** digits);
  return {
    perServing: { kcal: Math.round(sum.kcal / s), protein: round1(sum.protein / s), carbs: round1(sum.carbs / s), fat: round1(sum.fat / s) },
    label: { kj: per(more.kj, 0), saturates: per(more.saturates, 1), sugars: per(more.sugars, 1), fibre: per(more.fibre, 1), salt: per(more.salt, 2) },
    costPerServing: usedKnown ? Math.round((used / s) * 100) / 100 : null,
    basket: Math.round(basket * 100) / 100,
  };
}

// ---- fitting a recipe to someone's numbers

/** What someone wants per serving: calories, and optionally protein (aim) and carbs or fat (no more than). */
export interface MealTarget {
  kcal: number;
  protein?: number;
  carbsMax?: number;
  fatMax?: number;
}

export interface FittedRecipe {
  /** The recipe with the fitted amounts (protein and carb ingredients moved, everything else as written). */
  recipe: Recipe;
  resolved: ResolvedRecipe;
  totals: RecipeTotals;
  /** False when nothing in the recipe can move (no protein or carb ingredient), so it is shown as written. */
  changed: boolean;
}

/** Scales between half and double the written amount, in steps of 5%. */
const SCALES = Array.from({ length: 31 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);
const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);

function pieceNote(spec: IngredientSpec, amount: number): string | undefined {
  const k = spec.pantry ? PANTRY.get(spec.pantry) : undefined;
  if (!k?.pieceGrams || !k.pieceName) return spec.note;
  const n = Math.max(1, Math.round(amount / k.pieceGrams));
  return `about ${n} ${n === 1 ? k.pieceName[0] : k.pieceName[1]}`;
}

/**
 * The amounts that bring one serving closest to the target, worked out from the products' own labels: the protein ingredients move
 * together by one factor and the carb ingredients by another (each between half and double), sauces and the rest stay as written.
 * Calories and protein are aimed at; carbs and fat count only when they go over the limit. Amounts are rounded to 5 g (eggs to whole
 * eggs) and every number is then worked out again from the labels for those rounded amounts. Null when the recipe isn't complete here.
 */
export function fitRecipe(recipe: Recipe, products: readonly ShopProduct[], chosen: Readonly<Record<string, string>>, target: MealTarget): FittedRecipe | null {
  const base = resolveRecipe(recipe, products, chosen);
  if (!base.complete) return null;
  const picks = base.picks as IngredientPick[];
  // the same products after fitting, even if a different pack size would be cheaper for the new amount
  const pinned: Record<string, string> = { ...chosen };
  for (const p of picks) pinned[p.spec.key] = p.product.id;
  const s = recipe.servings;
  const per = picks.map((p) => {
    const n = p.product.nutrition!;
    const g = p.spec.amount / 100 / s;
    return { role: p.spec.role ?? "other", kcal: n.kcal * g, protein: n.protein * g, carbs: n.carbs * g, fat: n.fat * g };
  });
  const hasP = per.some((x) => x.role === "protein");
  const hasC = per.some((x) => x.role === "carb");
  if (!hasP && !hasC) return { recipe, resolved: base, totals: recipeTotals(base)!, changed: false };
  const factor = (role: IngredientRole, a: number, b: number) => (role === "protein" ? a : role === "carb" ? b : 1);
  let best = { a: 1, b: 1, score: Infinity };
  for (const a of hasP ? SCALES : [1]) {
    for (const b of hasC ? SCALES : [1]) {
      const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      for (const x of per) {
        const f = factor(x.role, a, b);
        t.kcal += x.kcal * f; t.protein += x.protein * f; t.carbs += x.carbs * f; t.fat += x.fat * f;
      }
      let score = (t.kcal / target.kcal - 1) ** 2;
      if (target.protein) score += (t.protein / target.protein - 1) ** 2;
      if (target.carbsMax && t.carbs > target.carbsMax) score += 3 * (t.carbs / target.carbsMax - 1) ** 2;
      if (target.fatMax && t.fat > target.fatMax) score += 3 * (t.fat / target.fatMax - 1) ** 2;
      score += 0.01 * ((a - 1) ** 2 + (b - 1) ** 2); // between equal fits, stay nearer the recipe as written
      if (score < best.score - 1e-12) best = { a, b, score };
    }
  }
  const ingredients = recipe.ingredients.map((spec) => {
    const f = factor(spec.role ?? "other", best.a, best.b);
    if (f === 1) return spec;
    const k = spec.pantry ? PANTRY.get(spec.pantry) : undefined;
    const amount = k?.pieceGrams ? Math.max(1, Math.round((spec.amount * f) / k.pieceGrams)) * k.pieceGrams : round5(spec.amount * f);
    const note = pieceNote(spec, amount);
    return { ...spec, amount, ...(note ? { note } : {}) };
  });
  const fitted: Recipe = { ...recipe, ingredients };
  const resolved = resolveRecipe(fitted, products, pinned);
  const totals = recipeTotals(resolved);
  if (!totals) return null;
  return { recipe: fitted, resolved, totals, changed: ingredients.some((x, i) => x.amount !== recipe.ingredients[i]!.amount) };
}

/** How far a serving is from the target (0 = spot on): used to put the closest recipes first. */
export function fitDistance(t: RecipeTotals["perServing"], target: MealTarget): number {
  let d = Math.abs(t.kcal / target.kcal - 1);
  if (target.protein) d += Math.abs(t.protein / target.protein - 1);
  if (target.carbsMax && t.carbs > target.carbsMax) d += t.carbs / target.carbsMax - 1;
  if (target.fatMax && t.fat > target.fatMax) d += t.fat / target.fatMax - 1;
  return d;
}

// ---- simple choices for the meal (Recipes screen and Pip's recipe maker)

export type MealSize = "small" | "normal" | "big";

/** Three meal sizes from the person's daily calories: a normal meal is about 30% of the day (to the nearest 50 kcal, 300-1,200), small and big 200 kcal either side. */
export function mealSizes(dailyCalories: number): Record<MealSize, number> {
  const normal = Math.min(1200, Math.max(300, Math.round((dailyCalories * 0.3) / 50) * 50));
  return { small: Math.max(200, normal - 200), normal, big: normal + 200 };
}

/** "More protein": a protein aim of 30% of the meal's calories, at 4 kcal per gram (the labelling factor), to the nearest 5 g. A target the person picks, never a figure shown as nutrition. */
export const moreProteinGrams = (kcal: number): number => Math.max(10, Math.round((kcal * 0.3) / 4 / 5) * 5);
