import { normalizeForSearch } from "./search";
import type { ShopProduct } from "./shopProducts";

// Recipes from the shop you use (founder 2026-10-10: "craft recipes based on where you shop"). Each recipe is ours (the dish, the
// amounts and the method), but every number shown comes from the supermarket's own listing: the price, the price per kg or litre,
// and the nutrition its product page prints per 100 g or ml. Nothing is estimated: an ingredient is matched only to products whose
// label numbers are for the food as sold, in the recipe's unit, and inside a plausible range for that form (dry pasta is not cooked
// pasta), and totals are plain arithmetic on those labels for the amounts written in the recipe. Blurbs describe the dish, never make a
// nutrition or health claim (CLAUDE.md rule 3): the numbers speak for themselves. Pure and unit-tested.

export interface IngredientMatch {
  /** Every one of these words must be in the product name. */
  all: string[];
  /** At least one of these, if given. */
  any?: string[];
  /** None of these. */
  none?: string[];
  /** kcal per 100 g/ml must be inside this range: it fixes the form (dry rice, drained beans, light coconut milk). */
  kcal?: [number, number];
  minProtein?: number;
  maxFat?: number;
}

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
}

export interface Recipe {
  id: string;
  name: string;
  blurb: string;
  servings: number;
  minutes: number;
  /** The recipe itself has no meat or fish in it (the products picked are checked against the same words). */
  meatFree?: boolean;
  ingredients: IngredientSpec[];
  method: string[];
  /** Things the recipe uses that are not counted (store-cupboard bits, any vegetables you add). */
  extras: string[];
}

const GLOBAL_NONE = ["meal", "sandwich", "kit", "gift", "hamper", "selection"];
const MEAT_WORDS = ["chicken", "beef", "pork", "lamb", "turkey", "bacon", "ham", "sausage", "salmon", "tuna", "prawn", "fish", "anchov", "chorizo", "pepperoni"];

const CHICKEN: IngredientMatch = {
  all: ["chicken", "breast"],
  none: ["sliced", "cooked", "roast", "bites", "goujon", "cured", "hunters", "just cook", "sizzlers", "kyiv", "italian", "cajun", "steaks", "battered", "tempura", "buttermilk", "firecracker", "chunks", "thigh", "escalope", "burger", "sauce", "with", "marinated", "coated", "breaded", "kiev", "smoked", "chargrill", "tikka", "piri", "fajita", "slices", "pieces", "strips", "skewer", "wrapped", "stuffed", "southern", "katsu", "bbq", "spiced", "lemon", "garlic", "herb"],
  kcal: [90, 170], minProtein: 20, maxFat: 5,
};
// Many rice and pasta labels at the shop are per 100 g cooked: those are left out (an uncooked amount needs uncooked figures), and the kcal range
// catches a label whose heading doesn't say which.
const RICE: IngredientMatch = {
  all: ["rice"], any: ["basmati", "jasmine", "long grain", "fragrant", "hom mali", "easy cook"],
  none: ["microwave", "pouch", "ready", "pilau", "with", "flavour", "express", "steam", "golden", "egg fried", "mushroom", "lemon", "coconut", "wild", "noodles", "flour", "cakes", "pots", "heat", "mix", "boil in"],
  kcal: [320, 400],
};
const PASTA_LONG: IngredientMatch = { any: ["spaghetti", "linguine", "tagliatelle"], all: [], none: ["hoops", "rings", "sauce", "bolognese", "carbonara", "meatballs", "sausages", "fresh", "squash", "recipe mix"], kcal: [300, 400] };
const PASTA_SHAPES: IngredientMatch = { any: ["penne", "fusilli", "tortiglioni", "casareccia", "rigatoni", "farfalle", "macaroni", "conchiglie"], all: [], none: ["sauce", "bake", "salad", "chicken", "cheese", "bolognese", "fresh", "lentil", "pea", "meal"], kcal: [300, 400] };
const SOY: IngredientMatch = { all: ["soy", "sauce"], none: ["sweet", "noodle", "chicken", "dark", "mushroom", "teriyaki", "garlic", "chilli", "vinegar", "pack"], kcal: [20, 120] };
const CHOPPED_TOMATOES: IngredientMatch = { all: ["chopped", "tomatoes"], none: ["garlic", "herb", "chilli", "basil", "onion", "olive", "pepper", "oregano"], kcal: [10, 45] };
const PASSATA: IngredientMatch = { all: ["passata"], none: ["garlic", "basil", "herb", "onion", "chilli", "pepper"], kcal: [15, 45] };
const GREEK_FAT_FREE: IngredientMatch = {
  all: ["greek", "yogurt"], any: ["fat free", "0%", "0 %"],
  none: ["honey", "strawberry", "raspberry", "cherry", "mango", "lemon", "coconut", "vanilla", "peach", "blueberry", "fruit", "pot", "x4", "4x", "kids"], maxFat: 1, kcal: [40, 75],
};
const CHEDDAR: IngredientMatch = { all: ["mature", "cheddar"], none: ["crackers", "sauce", "bake", "pie", "sandwich", "pasta", "snack", "bites", "sticks", "mini", "cubes", "lunchbox", "mozzarella", "spread", "lighter", "reduced", "onion", "chutney", "pickle", "jalapeno", "chilli", "cranberr", "tomato"], kcal: [380, 450] };
const NOODLES: IngredientMatch = { all: ["noodles"], any: ["udon", "medium", "thick", "thin", "straight to wok", "ready to wok"], none: ["pot", "chicken", "beef", "prawn", "soup", "instant", "cup", "sauce", "flavour", "rice noodles", "egg", "glass", "soba", "ramen", "curry", "spicy"], kcal: [90, 200] };
const CURRY_PASTE_INDIAN: IngredientMatch = { all: ["curry", "paste"], any: ["tikka", "korma", "madras", "balti", "jalfrezi", "rogan josh", "tandoori"], none: ["sauce", "marinade"] };
const CURRY_PASTE_THAI: IngredientMatch = { all: ["thai", "curry", "paste"], none: ["sauce"] };
const COCONUT_LIGHT: IngredientMatch = { all: ["coconut", "milk"], any: ["light", "reduced"], none: ["drink", "yogurt", "powder"], kcal: [30, 110] };
const WRAPS: IngredientMatch = { all: ["wraps"], any: ["tortilla", "wholewheat", "plain", "white", "soft"], none: ["chicken", "salad", "falafel", "lettuce", "egg"], kcal: [240, 350] };
const PEANUT_BUTTER: IngredientMatch = { all: ["peanut", "butter"], none: ["cups", "chocolate", "cookies", "bar", "biscuit", "bites", "powder", "jelly", "protein", "honey", "spread with"], kcal: [550, 700] };
const MILK: IngredientMatch = { all: ["semi", "skimmed", "milk"], none: ["chocolate", "strawberry", "banana", "powder", "evaporated", "condensed", "milkshake", "coffee", "protein", "drink"], kcal: [40, 55] };

export const RECIPES: readonly Recipe[] = [
  {
    id: "chicken-rice-bowl", name: "Chicken, rice and soy bowl", blurb: "Three ingredients, on the table in 25 minutes.", servings: 2, minutes: 25,
    ingredients: [
      { key: "chicken", label: "Chicken breast fillets", amount: 300, unit: "g", match: CHICKEN },
      { key: "rice", label: "Rice", amount: 150, unit: "g", note: "uncooked", match: RICE },
      { key: "soy", label: "Soy sauce", amount: 30, unit: "ml", match: SOY },
    ],
    method: ["Cook the rice as the pack says.", "Slice the chicken and cook it in a hot non-stick pan for 6 to 8 minutes, until cooked through.", "Stir in the soy sauce and serve on the rice."],
    extras: ["Any vegetables you like (not counted)", "A little oil spray (not counted)"],
  },
  {
    id: "chicken-curry", name: "Chicken curry with rice", blurb: "A creamy curry made with yogurt instead of cream.", servings: 2, minutes: 35,
    ingredients: [
      { key: "chicken", label: "Chicken breast fillets", amount: 300, unit: "g", match: CHICKEN },
      { key: "paste", label: "Curry paste", amount: 60, unit: "g", match: CURRY_PASTE_INDIAN },
      { key: "tomatoes", label: "Chopped tomatoes", amount: 400, unit: "g", match: CHOPPED_TOMATOES },
      { key: "yogurt", label: "Fat-free Greek-style yogurt", amount: 150, unit: "g", match: GREEK_FAT_FREE },
      { key: "rice", label: "Rice", amount: 150, unit: "g", note: "uncooked", match: RICE },
    ],
    method: ["Cook the rice as the pack says.", "Cut the chicken into chunks and brown it in a non-stick pan, then stir in the curry paste for a minute.", "Add the tomatoes and simmer for 15 minutes.", "Take off the heat and stir in the yogurt."],
    extras: ["An onion or any vegetables you like (not counted)"],
  },
  {
    id: "beef-chilli", name: "Beef chilli and rice", blurb: "A batch-cook classic for four.", servings: 4, minutes: 45,
    ingredients: [
      { key: "beef", label: "5% fat beef mince", amount: 500, unit: "g", match: { all: ["beef", "mince"], none: ["pie", "burger", "meatball", "chilli", "steak mince with", "lasagne", "cottage"], kcal: [100, 190], minProtein: 18, maxFat: 6 } },
      { key: "beans", label: "Red kidney beans in water", amount: 240, unit: "g", note: "drained", drained: true, match: { all: ["kidney", "beans"], none: ["chilli", "sauce", "mixed", "spicy", "lentils", "tuna", "salad"], kcal: [70, 140] } },
      { key: "tomatoes", label: "Chopped tomatoes", amount: 400, unit: "g", match: CHOPPED_TOMATOES },
      { key: "rice", label: "Rice", amount: 300, unit: "g", note: "uncooked", match: RICE },
    ],
    method: ["Brown the mince in a large pan.", "Add the tomatoes, beans and chilli powder or spices to taste; simmer for 25 minutes.", "Cook the rice as the pack says and serve."],
    extras: ["Chilli powder, cumin and an onion (not counted)"],
  },
  {
    id: "turkey-bolognese", name: "Turkey bolognese", blurb: "Spaghetti bolognese made with turkey mince.", servings: 4, minutes: 35,
    ingredients: [
      { key: "turkey", label: "Turkey mince", amount: 500, unit: "g", match: { all: ["turkey", "mince"], none: ["meatball", "burger"], kcal: [90, 190], minProtein: 18, maxFat: 8 } },
      { key: "passata", label: "Passata", amount: 500, unit: "g", match: PASSATA },
      { key: "spaghetti", label: "Spaghetti or linguine", amount: 300, unit: "g", note: "uncooked", match: PASTA_LONG },
      { key: "cheese", label: "Mature cheddar", amount: 40, unit: "g", match: CHEDDAR },
    ],
    method: ["Brown the turkey mince in a large pan.", "Add the passata and simmer for 15 minutes.", "Cook the spaghetti as the pack says, then serve with the sauce and the cheese grated on top."],
    extras: ["Garlic, dried herbs and any vegetables you like (not counted)"],
  },
  {
    id: "salmon-noodles", name: "Salmon and soy noodles", blurb: "Ready in 20 minutes.", servings: 2, minutes: 20,
    ingredients: [
      { key: "salmon", label: "Salmon fillets", amount: 240, unit: "g", match: { all: ["salmon", "fillets"], none: ["smoked", "sauce", "with", "coated", "breaded", "fishcake", "thai", "chilli", "teriyaki", "honey", "lemon", "garlic", "herb", "marinated", "hot", "flakes", "parcels"], kcal: [110, 250], minProtein: 18 } },
      { key: "noodles", label: "Ready-to-wok noodles", amount: 300, unit: "g", match: NOODLES },
      { key: "soy", label: "Soy sauce", amount: 30, unit: "ml", match: SOY },
    ],
    method: ["Bake or pan-fry the salmon for 10 to 12 minutes, until cooked through.", "Warm the noodles in a pan with the soy sauce.", "Flake the salmon over the noodles."],
    extras: ["Spring onions or any vegetables you like (not counted)"],
  },
  {
    id: "tuna-pasta", name: "Tuna and tomato pasta", blurb: "Store-cupboard dinner for three.", servings: 3, minutes: 20,
    ingredients: [
      { key: "tuna", label: "Tuna chunks in brine or spring water", amount: 204, unit: "g", note: "drained", drained: true, match: { all: ["tuna"], any: ["brine", "spring water"], none: ["mayo", "sweetcorn", "pasta", "salad", "paste", "pate", "steak", "oil", "lemon", "chilli", "pepper", "flavour"], kcal: [80, 140], minProtein: 18 } },
      { key: "pasta", label: "Pasta shapes (penne, fusilli)", amount: 200, unit: "g", note: "uncooked", match: PASTA_SHAPES },
      { key: "passata", label: "Passata", amount: 500, unit: "g", match: PASSATA },
      { key: "cheese", label: "Mature cheddar", amount: 60, unit: "g", match: CHEDDAR },
    ],
    method: ["Cook the pasta as the pack says.", "Warm the passata in a pan and stir in the drained tuna.", "Mix with the pasta and top with grated cheese."],
    extras: ["Dried herbs or sweetcorn (not counted)"],
  },
  {
    id: "prawn-curry", name: "Thai prawn curry", blurb: "A coconut curry with rice, made with light coconut milk.", servings: 3, minutes: 25,
    ingredients: [
      { key: "prawns", label: "King prawns", amount: 300, unit: "g", match: { all: ["prawns"], none: ["cocktail", "crackers", "tempura", "breaded", "sauce", "toast", "garlic", "chilli", "sweet", "katsu", "salt", "pepper", "spicy", "skewers", "ring"], kcal: [45, 110], minProtein: 10 } },
      { key: "coconut", label: "Light coconut milk", amount: 400, unit: "ml", match: COCONUT_LIGHT },
      { key: "paste", label: "Thai curry paste", amount: 50, unit: "g", match: CURRY_PASTE_THAI },
      { key: "rice", label: "Rice", amount: 150, unit: "g", note: "uncooked", match: RICE },
    ],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, then add the coconut milk and simmer for 5 minutes.", "Add the prawns and cook until hot through (raw prawns: until pink)."],
    extras: ["Any vegetables you like (not counted)"],
  },
  {
    id: "tofu-satay", name: "Tofu satay noodles", blurb: "Peanut sauce, crispy tofu, no meat.", servings: 2, minutes: 25, meatFree: true,
    ingredients: [
      { key: "tofu", label: "Firm tofu", amount: 300, unit: "g", match: { all: ["tofu"], any: ["firm", "block"], none: ["silken", "marinated", "smoked", "pieces", "stir fry"], kcal: [80, 180], minProtein: 10 } },
      { key: "noodles", label: "Ready-to-wok noodles", amount: 300, unit: "g", match: NOODLES },
      { key: "peanut", label: "Peanut butter", amount: 40, unit: "g", match: PEANUT_BUTTER },
      { key: "soy", label: "Soy sauce", amount: 30, unit: "ml", match: SOY },
    ],
    method: ["Press and cube the tofu, then fry in a non-stick pan until golden.", "Whisk the peanut butter and soy sauce with a splash of hot water.", "Toss the noodles in the sauce and top with the tofu."],
    extras: ["Lime, chilli and any vegetables you like (not counted)"],
  },
  {
    id: "overnight-oats", name: "Overnight oats with yogurt", blurb: "Make it the night before, grab it in the morning.", servings: 2, minutes: 5, meatFree: true,
    ingredients: [
      { key: "oats", label: "Porridge oats", amount: 80, unit: "g", match: { all: ["porridge", "oats"], none: ["sachet", "pot", "syrup", "apple", "berry", "chocolate", "golden", "flavour", "instant", "banana", "honey"], kcal: [330, 420] } },
      { key: "yogurt", label: "Fat-free Greek-style yogurt", amount: 200, unit: "g", match: GREEK_FAT_FREE },
      { key: "milk", label: "Semi-skimmed milk", amount: 150, unit: "ml", match: MILK },
      { key: "peanut", label: "Peanut butter", amount: 20, unit: "g", match: PEANUT_BUTTER },
    ],
    method: ["Mix the oats, yogurt and milk in two jars or bowls.", "Swirl in the peanut butter, cover and chill overnight."],
    extras: ["Fruit on top (not counted)"],
  },
  {
    id: "cheesy-egg-wraps", name: "Cheesy scrambled egg wraps", blurb: "A filling breakfast in ten minutes.", servings: 2, minutes: 10, meatFree: true,
    ingredients: [
      { key: "eggs", label: "Free-range eggs", amount: 240, unit: "g", note: "about 4 eggs", match: { all: ["eggs"], any: ["free range", "large", "medium", "mixed"], none: ["boiled", "chocolate", "scotch", "mayo", "fried", "noodle", "custard", "quail", "pasta", "liquid", "white", "duck"], kcal: [120, 160], minProtein: 11 } },
      { key: "cheese", label: "Mature cheddar", amount: 40, unit: "g", match: CHEDDAR },
      { key: "wraps", label: "Tortilla wraps", amount: 120, unit: "g", note: "2 to 3 wraps", match: WRAPS },
      { key: "milk", label: "Semi-skimmed milk", amount: 30, unit: "ml", match: MILK },
    ],
    method: ["Whisk the eggs with the milk.", "Scramble gently in a non-stick pan, then stir in the grated cheese.", "Warm the wraps and fill."],
    extras: ["Spinach or tomatoes (not counted)"],
  },
  {
    id: "chickpea-curry", name: "Chickpea and tomato curry", blurb: "A meat-free curry that keeps well.", servings: 3, minutes: 30, meatFree: true,
    ingredients: [
      { key: "chickpeas", label: "Chickpeas in water", amount: 240, unit: "g", note: "drained", drained: true, match: { all: ["chickpeas"], none: ["falafel", "houmous", "hummus", "curry", "smoked", "paprika", "spicy", "roasted", "crunchy", "snack", "flour", "bulgur", "rice", "tagine", "dhal", "soup", "salad", "couscous", "lentil", "tuna", "pizza"], kcal: [90, 180] } },
      { key: "tomatoes", label: "Chopped tomatoes", amount: 400, unit: "g", match: CHOPPED_TOMATOES },
      { key: "paste", label: "Curry paste", amount: 60, unit: "g", match: CURRY_PASTE_INDIAN },
      { key: "coconut", label: "Light coconut milk", amount: 200, unit: "ml", match: COCONUT_LIGHT },
      { key: "rice", label: "Rice", amount: 150, unit: "g", note: "uncooked", match: RICE },
    ],
    method: ["Cook the rice as the pack says.", "Fry the curry paste for a minute, add the tomatoes, chickpeas and coconut milk.", "Simmer for 15 minutes and serve."],
    extras: ["An onion and spinach (not counted)"],
  },
  {
    id: "chicken-wraps", name: "Chicken and yogurt wraps", blurb: "Easy to pack for lunch.", servings: 3, minutes: 20,
    ingredients: [
      { key: "chicken", label: "Chicken breast fillets", amount: 300, unit: "g", match: CHICKEN },
      { key: "wraps", label: "Tortilla wraps", amount: 180, unit: "g", note: "about 3 to 4 wraps", match: WRAPS },
      { key: "yogurt", label: "Fat-free Greek-style yogurt", amount: 100, unit: "g", match: GREEK_FAT_FREE },
      { key: "cheese", label: "Mature cheddar", amount: 40, unit: "g", match: CHEDDAR },
    ],
    method: ["Slice the chicken and cook in a hot pan for 6 to 8 minutes, until cooked through.", "Mix the yogurt with a squeeze of lemon and seasoning.", "Fill the wraps with chicken, yogurt and grated cheese."],
    extras: ["Lettuce, lemon and seasoning (not counted)"],
  },
];

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
    const list = candidates(products, spec, recipe.meatFree);
    return list.find((c) => c.product.id === chosen[spec.key]) ?? list[0] ?? null;
  });
  return { recipe, picks, complete: picks.every(Boolean) };
}

export interface RecipeTotals {
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
  /** The amounts used, at the shop's price per kg or litre, per serving (null if any ingredient has no such price). */
  costPerServing: number | null;
  /** Whole packs to buy. */
  basket: number;
}

/** Plain arithmetic on the labels: per-100 figure × amount / 100, summed, divided by servings. Only for a complete recipe. */
export function recipeTotals(r: ResolvedRecipe): RecipeTotals | null {
  if (!r.complete) return null;
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
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
    if (p.usedCost === null) usedKnown = false;
    else used += p.usedCost;
    basket += p.basketCost;
  }
  const s = r.recipe.servings;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    perServing: { kcal: Math.round(sum.kcal / s), protein: round1(sum.protein / s), carbs: round1(sum.carbs / s), fat: round1(sum.fat / s) },
    costPerServing: usedKnown ? Math.round((used / s) * 100) / 100 : null,
    basket: Math.round(basket * 100) / 100,
  };
}
