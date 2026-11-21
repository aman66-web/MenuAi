import type { Recipe } from "./recipes";

// Fruit and veg portions, the way the NHS counts its 5 A Day (founder 2026-11-21: "there's a thing called your 7 a day too, or like 5 a day ... 5 a day, 7 a day
// is also a thing that matters too"). Counted from a recipe's own ingredient weights, never estimated: 80 g of fresh, frozen or tinned fruit or vegetables is
// one portion, and 30 g of dried fruit; beans and pulses count as one portion a day at most, however much is eaten; potatoes, yams and other starchy foods
// never count (nhs.uk "5 A Day portion sizes" and "Why 5 A Day?", read 21 November 2026). Herbs, garlic, ginger, a squeeze of lemon, tomato purée, sauces,
// pickles, nuts and seeds are not counted either (a few grams, or not fruit and veg by the NHS's lists). 5 is the NHS's figure; 7 is the person's own aim.
// Pure; tests/fiveADay.test.ts.

/** How a pantry kind (pantry.ts key) counts: fruit or veg by 80 g, dried fruit by 30 g, a pulse (once a day at most) by 80 g cooked or drained. */
export type FiveKind = "fruitVeg" | "dried" | "pulse" | "dryPulse";

/** The grams that make one portion. A dry pulse (red lentils, weighed dry) is about 80 g once cooked from 30 g. */
export const PORTION_GRAMS: Readonly<Record<FiveKind, number>> = { fruitVeg: 80, dried: 30, pulse: 80, dryPulse: 30 };

/** Every pantry kind that counts. Every other kind is in NOT_FRUIT_VEG (tests/fiveADay.test.ts checks every kind is in one or the other). */
export const FRUIT_VEG: Readonly<Record<string, FiveKind>> = {
  // vegetables (fresh, frozen or tinned)
  "chopped-tomatoes": "fruitVeg", passata: "fruitVeg", "mixed-veg": "fruitVeg", peas: "fruitVeg", sweetcorn: "fruitVeg", onion: "fruitVeg", "red-onion": "fruitVeg",
  "spring-onions": "fruitVeg", carrots: "fruitVeg", peppers: "fruitVeg", "fresh-chilli": "fruitVeg", spinach: "fruitVeg", "cherry-tomatoes": "fruitVeg",
  tomatoes: "fruitVeg", cucumber: "fruitVeg", lettuce: "fruitVeg", "salad-leaves": "fruitVeg", "green-beans": "fruitVeg", broccoli: "fruitVeg",
  mangetout: "fruitVeg", beansprouts: "fruitVeg", mushrooms: "fruitVeg", "stir-fry-veg": "fruitVeg", "brussels-sprouts": "fruitVeg", parsnips: "fruitVeg",
  "red-cabbage": "fruitVeg",
  // fruit
  berries: "fruitVeg", banana: "fruitVeg", apple: "fruitVeg",
  // dried fruit
  raisins: "dried", "dried-cranberries": "dried",
  // beans and pulses
  chickpeas: "pulse", "kidney-beans": "pulse", "black-beans": "pulse", "butter-beans": "pulse", "green-lentils": "pulse", "baked-beans": "pulse", edamame: "pulse",
  "red-lentils": "dryPulse",
};

/** Kinds that never count: starchy foods (potatoes, gnocchi), herbs and flavourings, sauces, nuts, and everything that isn't fruit or veg. */
export const NOT_FRUIT_VEG: ReadonlySet<string> = new Set([
  "new-potatoes", "gnocchi", "garlic", "fresh-garlic", "ginger", "fresh-coriander", "fresh-parsley", "fresh-basil", "chives", "lemon-juice", "lime-juice",
  "chopped-tomato-puree", "salsa", "pesto", "houmous", "cranberry-sauce", "apple-sauce", "mincemeat", "cooked-chestnuts", "coconut-light", "coconut-milk",
  "curry-paste", "thai-curry-paste", "sweet-chilli", "bbq-sauce", "teriyaki", "horseradish", "mustard",
  // meat, fish, eggs, tofu and dairy
  "chicken", "chicken-thigh", "beef-mince", "turkey-mince", "lamb-mince", "salmon", "cod", "tuna", "prawns", "eggs", "tofu", "quorn", "halloumi", "cottage-cheese",
  "greek-yogurt", "cheddar", "feta", "milk", "beef-steak", "bacon", "ham", "smoked-salmon", "tinned-salmon", "mackerel", "white-fish", "paneer", "mozzarella",
  "parmesan", "soft-cheese", "natural-yogurt", "skyr", "turkey-breast", "pork-chipolatas", "gammon-steaks",
  // rice, pasta, bread and cereals
  "rice", "pasta-long", "pasta-shapes", "noodles", "wraps", "oats", "egg-noodles", "rice-noodles", "naan", "bread", "white-bread", "granola", "wheat-biscuits",
  "lasagne-sheets",
  // oils, sauces, nuts, seeds, drinks, spices and dried herbs
  "olive-oil", "light-mayo", "honey", "stock-cube", "fajita-seasoning", "oat-drink", "almonds", "mixed-seeds", "soy", "peanut-butter", "salt", "black-pepper",
  "white-pepper", "cumin", "paprika", "smoked-paprika", "chilli-powder", "chilli-flakes", "cinnamon", "turmeric", "curry-powder", "mixed-herbs", "oregano",
  "thyme", "rosemary", "dill", "mint", "sesame-seeds", "vegetable-oil", "oil-spray", "mixed-spice", "nutmeg",
]);

/** How a kind counts, or null. Kinds not in either list (a new pantry kind before it is sorted) don't count. */
export function fiveKindOf(kind: string): FiveKind | null {
  return FRUIT_VEG[kind] ?? null;
}

export interface FivePortions {
  /** Fruit, veg and dried fruit portions in one serving (no cap). */
  fruitVeg: number;
  /** Bean and pulse portions in one serving (a day counts them once at most: dayPortions). */
  pulses: number;
}

/** One serving's fruit and veg portions, from the recipe's own amounts as written. */
export function fivePortions(r: Pick<Recipe, "ingredients" | "servings">): FivePortions {
  const per = Math.max(1, r.servings || 1);
  let fruitVeg = 0;
  let pulses = 0;
  for (const i of r.ingredients) {
    const k = fiveKindOf(i.pantry ?? i.key);
    if (!k) continue;
    const portions = i.amount / per / PORTION_GRAMS[k];
    if (k === "pulse" || k === "dryPulse") pulses += portions;
    else fruitVeg += portions;
  }
  return { fruitVeg, pulses };
}

const memo = new WeakMap<object, FivePortions>();
export function fivePortionsOf(r: Pick<Recipe, "ingredients" | "servings">): FivePortions {
  let p = memo.get(r);
  if (!p) memo.set(r, (p = fivePortions(r)));
  return p;
}

/** A day's portions from its meals: fruit and veg added up, beans and pulses one at most. */
export function dayPortions(meals: ReadonlyArray<FivePortions | undefined>): number {
  let fruitVeg = 0;
  let pulses = 0;
  for (const m of meals) {
    if (!m) continue;
    fruitVeg += m.fruitVeg;
    pulses += m.pulses;
  }
  return fruitVeg + Math.min(1, pulses);
}

/** Portions as shown: down to the half portion, never rounded up (4.9 is "4½"). */
export function shownPortions(n: number): number {
  return Math.floor(Math.max(0, n) * 2 + 1e-9) / 2;
}

/** The aims a person can choose in Meal plan: the NHS's 5, or 7. */
export type FruitVegAim = 5 | 7;
export const FRUIT_VEG_AIMS: readonly FruitVegAim[] = [5, 7];
export function cleanFruitVegAim(v: unknown): FruitVegAim | undefined {
  return v === 5 || v === 7 ? v : undefined;
}
