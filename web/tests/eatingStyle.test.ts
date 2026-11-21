import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_WRAPS_A_WEEK, varietyReport } from "../lib/mm/dishForm";
import {
  EATING_STYLES, HIGH_FIBRE_MIN_G, HIGH_PROTEIN_MIN, KETO_CARBS_MAX, LONGEVITY_FIBRE_PER_100KCAL, LONGEVITY_FOODS, LONGEVITY_SALT_PER_100KCAL, LONGEVITY_SATURATES_MAX, LOW_FAT_MAX,
  LOWER_CARB_MAX, LOWER_SALT_MAX_G, LOWER_SUGAR_MAX_G, MEDITERRANEAN_CHEESE_MAX_G, PALEO_KINDS, PER_MEAL_RECIPES, PLAN_DAYS, STYLE_FIT, STYLE_MIN_AT_SHOP, STYLE_MIN_RECIPES,
  STYLE_PICTURES, STYLE_PROTEIN_FIT, SWEETENED, VEG_FRUIT, VEG_FRUIT_MIN_G, fitsStyle, makePlan, planCandidates, planForBudget, planSlots, printedPer100, sanitizePlan, slotTargets,
  styleBetter, styleCandidates, styleCount, styleInDiet, styleShortfall, stylePicture, styleTargets, styleTooFew, weekForms, type EatingStyle, type PlanCandidate,
} from "../lib/mm/mealPlan";
import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { nicheOf } from "../lib/mm/recipeBook/niches";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { RECIPE_THUMBS } from "../lib/mm/recipeThumbs";
import { isQuick, recipeForDiet, type MealType } from "../lib/mm/recipes";
import { decodeShopProducts, type ShopProduct } from "../lib/mm/shopProducts";
import { macroTargets } from "../lib/mm/targets";

// How the person likes to eat (founder 2026-11-20, 12:48: Balanced, High protein, Lower carb; 22:00: "Give more options like keto or whatever, like as many
// options as you can think about people would choose"; 22:25: "the most longevity-backed diet"). Measured on Sainsbury's and Morrisons' real lists.

const shopList = (id: string): ShopProduct[] => decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${id}.json`, "utf8")));
const products = shopList("sainsburys");
const morrisons = shopList("morrisons");
const byId = new Map(RECIPES.map((r) => [r.id, r]));
const share = (c: PlanCandidate, k: "protein" | "carbs") => (4 * c.perServing[k]) / c.perServing.kcal;
const MEALS = ["breakfast", "lunch", "dinner"] as const;

/** A typical person: 2,000 kcal, the suggested protein, breakfast, lunch, dinner and a snack. */
const SHAPE = { meals: ["breakfast", "lunch", "dinner"] as MealType[], snacks: 1 };
const SLOTS = planSlots(SHAPE);
const base = slotTargets(SHAPE, { kcal: 2000, protein: macroTargets({ dailyCalories: 2000 }).protein }, null);

/** Each meal's candidates at a shop for a style, fitted to the style's meal sizes (Just me) or as written (a household). Kept by shop, diet and sizing. */
const memo = new Map<string, Map<MealType, PlanCandidate[]>>();
function candidatesFor(style: EatingStyle, diet = {}, asWritten = false, list = products, shop = "sainsburys"): Map<MealType, PlanCandidate[]> {
  const key = JSON.stringify([shop, diet, asWritten ? "written" : STYLE_FIT[style]]);
  if (!memo.has(key)) memo.set(key, planCandidates(RECIPES, list, diet, styleTargets(base, style), [], shop, asWritten));
  return memo.get(key)!;
}
/** Each meal's count of a style's recipes. */
function counts(style: EatingStyle, diet = {}, asWritten = false, list = products, shop = "sainsburys"): Record<MealType, number> {
  const cands = candidatesFor(style, diet, asWritten, list, shop);
  return Object.fromEntries([...cands].map(([m, l]) => [m, l.filter((c) => fitsStyle(c, style)).length])) as Record<MealType, number>;
}
const ofStyle = (style: EatingStyle, diet = {}) => [...candidatesFor(style, diet).values()].flat().filter((c) => fitsStyle(c, style));
const kindsOf = (c: PlanCandidate) => c.picks.map((p) => p.spec.pantry ?? p.spec.key);
const grams = (c: PlanCandidate, kinds: ReadonlySet<string>) => c.picks.reduce((g, p) => g + (kinds.has(p.spec.pantry ?? p.spec.key) ? p.spec.amount : 0), 0) / c.recipe.servings;

const fake = (meal: MealType, id: string, kcal: number, protein: number, carbs: number): PlanCandidate => ({
  shop: "s", recipe: { ...byId.get(RECIPES[0]!.id)!, id, name: id }, base: byId.get(RECIPES[0]!.id)!, meal, perServing: { kcal, protein, carbs, fat: 10 }, cost: 1, picks: [], servings: 1, distance: 0,
});

describe("what each style lets in", () => {
  it("measures a serving's own figures: protein and carbs at 4 kcal a gram, fat at 9, against its calories", () => {
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 50 }, "highProtein")).toBe(true); // 120 of 400 kcal: 30%
    expect(fitsStyle({ kcal: 400, protein: 29.9, carbs: 50 }, "highProtein")).toBe(false);
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 25 }, "lowerCarb")).toBe(true); // 100 of 400 kcal: 25%
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 25.1 }, "lowerCarb")).toBe(false);
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 10 }, "keto")).toBe(true); // 40 of 400 kcal: 10%
    expect(fitsStyle({ kcal: 400, protein: 30, carbs: 10.1 }, "keto")).toBe(false);
    expect(fitsStyle({ kcal: 450, protein: 30, carbs: 10, fat: 10 }, "lowFat")).toBe(true); // 90 of 450 kcal: 20%
    expect(fitsStyle({ kcal: 450, protein: 30, carbs: 10, fat: 10.1 }, "lowFat")).toBe(false);
    expect(fitsStyle({ kcal: 450, protein: 30, carbs: 10 }, "lowFat")).toBe(false); // no fat figure: no claim
    expect(fitsStyle({ kcal: 400, protein: 0, carbs: 100 }, "balanced")).toBe(true);
    expect(fitsStyle({ kcal: 0, protein: 10, carbs: 0 }, "highProtein")).toBe(false);
    expect([HIGH_PROTEIN_MIN, LOWER_CARB_MAX, KETO_CARBS_MAX, LOW_FAT_MAX]).toEqual([0.3, 0.25, 0.1, 0.2]);
  });

  it("offers Balanced first, Longevity second (the founder's own pick), then the kinds most people choose; never dairy-free or gluten-free (the allergy step does those)", () => {
    expect(EATING_STYLES.slice(0, 6)).toEqual(["balanced", "longevity", "highProtein", "lowerCarb", "keto", "mediterranean"]);
    expect(EATING_STYLES as readonly string[]).not.toContain("dairyFree");
    expect(EATING_STYLES as readonly string[]).not.toContain("glutenFree");
    expect(EATING_STYLES).toHaveLength(15);
  });

  it("fits High protein and Lower carb meals to more protein, Keto to a carbs cap, Low fat to a fat cap (the same calories); the rest exactly as they were", () => {
    for (const style of EATING_STYLES.filter((s) => STYLE_FIT[s] === "own")) expect(styleTargets(base, style), style).toBe(base);
    for (const style of ["highProtein", "lowerCarb"] as const) {
      const t = styleTargets(base, style);
      for (const m of SLOTS) {
        expect(t[m]!.kcal).toBe(base[m]!.kcal);
        expect(t[m]!.protein!).toBe(Math.max(base[m]!.protein!, Math.round((base[m]!.kcal * STYLE_PROTEIN_FIT) / 4)));
      }
    }
    const keto = styleTargets(base, "keto");
    const lowFat = styleTargets(base, "lowFat");
    for (const m of SLOTS) {
      expect(keto[m]).toEqual({ ...base[m], carbsMax: Math.round((base[m]!.kcal * KETO_CARBS_MAX) / 4) });
      expect(lowFat[m]).toEqual({ ...base[m], fatMax: Math.round((base[m]!.kcal * LOW_FAT_MAX) / 9) });
    }
    // a person whose own protein is already higher keeps it
    expect(styleTargets({ dinner: { kcal: 600, protein: 70 } }, "highProtein").dinner).toEqual({ kcal: 600, protein: 70 });
  });

  it("keeps each meal's recipes of the style in order, and a meal with none keeps all of its own; the same map comes back each time", () => {
    const cands = new Map<MealType, PlanCandidate[]>([
      ["breakfast", [fake("breakfast", "a", 400, 10, 60), fake("breakfast", "b", 400, 35, 20), fake("breakfast", "c", 400, 32, 50)]],
      ["lunch", [fake("lunch", "d", 500, 10, 70)]],
    ]);
    expect(styleCandidates(cands, "balanced")).toBe(cands);
    const hp = styleCandidates(cands, "highProtein");
    expect(hp.get("breakfast")!.map((c) => c.recipe.id)).toEqual(["b", "c"]);
    expect(hp.get("lunch")!.map((c) => c.recipe.id)).toEqual(["d"]); // none: any
    expect(styleCandidates(cands, "highProtein")).toBe(hp);
    expect(styleCandidates(cands, "lowerCarb").get("breakfast")!.map((c) => c.recipe.id)).toEqual(["b"]);
  });

  it("names the meals with none of the style and those with too few for the week's variety (each time a day counted)", () => {
    const cands = new Map<MealType, PlanCandidate[]>([
      ["breakfast", [fake("breakfast", "a", 400, 35, 20), fake("breakfast", "b", 400, 35, 20), fake("breakfast", "c", 400, 10, 60)]],
      ["lunch", [fake("lunch", "d", 500, 10, 70)]],
      ["snack", Array.from({ length: 5 }, (_, i) => fake("snack", `s${i}`, 150, 15, 5))],
      ["dinner", []],
    ]);
    expect(styleShortfall(cands, "balanced", ["breakfast", "lunch"])).toEqual({ none: [], few: [] });
    expect(styleShortfall(cands, "highProtein", ["breakfast", "lunch", "dinner", "snack"], 4)).toEqual({ none: ["lunch"], few: [{ meal: "breakfast", n: 2 }] });
    // two snacks a day at "Some repeats" want 8: five are too few
    expect(styleShortfall(cands, "highProtein", ["snack", "snack"], 4)).toEqual({ none: [], few: [{ meal: "snack", n: 5 }] });
    expect(styleShortfall(cands, "highProtein", ["snack"], 4)).toEqual({ none: [], few: [] });
    // meal prep (two recipes a meal): two breakfasts are enough
    expect(styleShortfall(cands, "highProtein", ["breakfast"], 2)).toEqual({ none: [], few: [] });
    // greyed on the step: a meal of the day (never a snack) with fewer than STYLE_MIN_AT_SHOP of it; Balanced never
    expect(styleTooFew(cands, "highProtein", ["breakfast", "lunch", "dinner", "snack"])).toEqual(["breakfast", "lunch", "dinner"]);
    expect(styleTooFew(cands, "highProtein", ["snack"])).toEqual([]);
    expect(styleTooFew(cands, "balanced", ["breakfast", "lunch", "dinner"])).toEqual([]);
    expect(STYLE_MIN_AT_SHOP).toBe(3);
  });

  it("never makes a meal of the style with products that take it out of the style", () => {
    const plain = fake("dinner", "p", 600, 46, 40); // 30.7% protein
    const off = { ...plain, perServing: { ...plain.perServing, protein: 40 }, better: true }; // 26.7%
    const on = { ...plain, perServing: { ...plain.perServing, protein: 50 }, better: true };
    expect(styleBetter(() => off, "highProtein")(plain)).toBeNull();
    expect(styleBetter(() => on, "highProtein")(plain)).toBe(on);
    expect(styleBetter(() => off, "balanced")(plain)).toBe(off);
    // a meal that took any recipe (none of the style) may still be made with pricier products
    const widened = fake("dinner", "w", 600, 20, 80);
    expect(styleBetter(() => off, "highProtein")(widened)).toBe(off);
  });

  it("is kept with the saved plan: a known style other than Balanced, nothing else", () => {
    const raw = { shops: ["sainsburys"], ids: Array.from({ length: PLAN_DAYS }, () => ["a", "b", "c"]), leaveOut: [], budget: null, start: "2026-11-20" };
    for (const style of EATING_STYLES.filter((s) => s !== "balanced")) expect(sanitizePlan({ ...raw, style })!.style).toBe(style);
    expect("style" in sanitizePlan({ ...raw, style: "balanced" })!).toBe(false);
    expect("style" in sanitizePlan({ ...raw, style: "dairyFree" })!).toBe(false);
    expect("style" in sanitizePlan({ ...raw, style: "carnivore" })!).toBe(false);
    expect("style" in sanitizePlan(raw)!).toBe(false);
  });

  it("has no tile for a style the person's own diet already is", () => {
    expect(styleInDiet("vegetarian", { vegetarianOnly: true })).toBe(true);
    expect(styleInDiet("vegetarian", { veganOnly: true })).toBe(true);
    expect(styleInDiet("vegetarian", { jain: true })).toBe(true);
    expect(styleInDiet("vegan", { veganOnly: true })).toBe(true);
    expect(styleInDiet("vegan", { vegetarianOnly: true })).toBe(false);
    for (const d of [{ vegetarianOnly: true }, { veganOnly: true }, { pescatarianOnly: true }, { jain: true }]) expect(styleInDiet("pescatarian", d), JSON.stringify(d)).toBe(true);
    for (const s of EATING_STYLES) expect(styleInDiet(s, {}), s).toBe(false);
    expect(styleInDiet("longevity", { veganOnly: true })).toBe(false);
  });
});

describe("each style's rule, on Sainsbury's real labels", () => {
  it("Longevity: no meat, a pulse, nut, seed, oily fish or whole grain, a meal's 80 g of vegetables and fruit, nothing sweetened, olive oil only, its fibre, saturates and salt", () => {
    const meals = ofStyle("longevity");
    expect(meals.length).toBeGreaterThan(40);
    for (const c of meals) {
      const kinds = kindsOf(c);
      expect(kinds.some((k) => PANTRY.get(k)?.meat), c.recipe.id).toBe(false);
      expect(kinds.some((k) => LONGEVITY_FOODS.has(k)), c.recipe.id).toBe(true);
      expect(kinds.some((k) => SWEETENED.has(k) || k === "vegetable-oil" || k === "oil-spray"), c.recipe.id).toBe(false);
      if (c.meal !== "snack") expect(grams(c, VEG_FRUIT), c.recipe.id).toBeGreaterThanOrEqual(VEG_FRUIT_MIN_G);
      expect(printedPer100(c, "fibre")!, c.recipe.id).toBeGreaterThanOrEqual(LONGEVITY_FIBRE_PER_100KCAL);
      expect((9 * (printedPer100(c, "saturates") ?? 0)) / 100, c.recipe.id).toBeLessThanOrEqual(LONGEVITY_SATURATES_MAX);
      expect(printedPer100(c, "salt") ?? 0, c.recipe.id).toBeLessThanOrEqual(LONGEVITY_SALT_PER_100KCAL);
    }
    const ids = new Set(meals.map((c) => c.recipe.id));
    expect(ids.has("salmon-chickpea-lemon-salad")).toBe(true);
    for (const id of ["beef-chilli", "chicken-curry", "greek-yogurt-granola", "honey-almond-yogurt"]) expect(ids.has(id), id).toBe(false);
    expect([LONGEVITY_FIBRE_PER_100KCAL, LONGEVITY_SALT_PER_100KCAL, LONGEVITY_SATURATES_MAX, VEG_FRUIT_MIN_G]).toEqual([1.5, 0.3, 0.1, 80]);
  });

  it("works its fibre, saturates and salt out from the products themselves, the same for a household's sizing", () => {
    const c = ofStyle("longevity")[0]!;
    const forFour = { ...c, servings: c.servings / 4, perServing: { ...c.perServing, kcal: c.perServing.kcal * 4 } };
    for (const k of ["fibre", "saturates", "salt"] as const) expect(printedPer100(forFour, k)).toBeCloseTo(printedPer100(c, k)!, 9);
    expect(printedPer100({ picks: [] }, "fibre")).toBeNull();
  });

  it("Mediterranean: no red or processed meat, olive oil only, olive oil, fish, beans or nuts in it, a meal's vegetables, little cheese, and not a Chinese, Indian or Mexican dish", () => {
    const meals = ofStyle("mediterranean");
    for (const c of meals) {
      const kinds = kindsOf(c);
      expect(kinds.some((k) => ["beef", "lamb", "pork"].includes(PANTRY.get(k)?.meat ?? "")), c.recipe.id).toBe(false);
      expect(kinds.includes("vegetable-oil") || kinds.includes("oil-spray"), c.recipe.id).toBe(false);
      if (c.meal !== "snack") expect(grams(c, VEG_FRUIT), c.recipe.id).toBeGreaterThanOrEqual(VEG_FRUIT_MIN_G);
      expect(grams(c, new Set(["cheddar", "mozzarella", "soft-cheese", "cottage-cheese", "parmesan", "feta", "halloumi", "paneer"])), c.recipe.id).toBeLessThanOrEqual(MEDITERRANEAN_CHEESE_MAX_G);
      expect(["chinese", "indian", "mexican"], c.recipe.id).not.toContain(nicheOf(c.recipe.id).cuisine);
    }
    const ids = new Set(meals.map((c) => c.recipe.id));
    for (const id of ["spaghetti-bolognese", "chicken-curry", "beef-burrito-bowl", "easy-macaroni-cheese"]) expect(ids.has(id), id).toBe(false);
  });

  it("Vegetarian, Vegan and Pescatarian: as the person's own diet picker applies them; Vegetarian never with a cheese usually made with animal rennet", () => {
    for (const c of ofStyle("vegetarian")) {
      expect(recipeForDiet(c.base, { vegetarianOnly: true }), c.recipe.id).not.toBeNull();
      expect(kindsOf(c).some((k) => PANTRY.get(k)?.rennet), c.recipe.id).toBe(false);
    }
    for (const c of ofStyle("vegan")) expect(recipeForDiet(c.base, { veganOnly: true }), c.recipe.id).not.toBeNull();
    for (const c of ofStyle("pescatarian")) expect(kindsOf(c).some((k) => PANTRY.get(k)?.meat), c.recipe.id).toBe(false);
    // a vegetarian's own plan already has the cheese made without it, so its pesto dishes count
    const veg = ofStyle("vegetarian", { vegetarianOnly: true }).map((c) => c.recipe.id);
    expect(veg.some((id) => byId.get(id)!.ingredients.some((i) => i.pantry === "pesto"))).toBe(true);
    expect(ofStyle("vegetarian").some((c) => byId.get(c.recipe.id)!.ingredients.some((i) => i.pantry === "pesto"))).toBe(false);
  });

  it("Paleo: every ingredient meat, fish, eggs, vegetables, fruit, nuts and seeds, olive oil or a plain seasoning", () => {
    const meals = ofStyle("paleo");
    expect(meals.length).toBeGreaterThan(15);
    for (const c of meals) for (const k of kindsOf(c)) expect(PALEO_KINDS.has(k), `${c.recipe.id}: ${k}`).toBe(true);
    for (const k of ["rice", "oats", "bread", "chickpeas", "peanut-butter", "cheddar", "milk", "new-potatoes", "honey", "soy", "bacon", "ham", "vegetable-oil", "stock-cube"]) expect(PALEO_KINDS.has(k), k).toBe(false);
  });

  it("Quick, High fibre, Lower sugar and Lower salt: the recipe's own time; the fibre its labels print; sugars and salt a label prints (an unknown never counts as low)", () => {
    for (const c of ofStyle("quick")) expect(isQuick(c.base), c.recipe.id).toBe(true);
    for (const c of ofStyle("highFibre")) expect(((printedPer100(c, "fibre") ?? 0) * c.perServing.kcal) / 100, c.recipe.id).toBeGreaterThanOrEqual(c.meal === "snack" ? 3 : HIGH_FIBRE_MIN_G);
    for (const c of ofStyle("lowerSugar")) expect(c.label!.sugars!, c.recipe.id).toBeLessThanOrEqual(c.meal === "snack" ? 5 : LOWER_SUGAR_MAX_G);
    for (const c of ofStyle("lowerSalt")) expect(c.label!.salt!, c.recipe.id).toBeLessThanOrEqual(c.meal === "snack" ? 0.3 : LOWER_SALT_MAX_G);
    const unknown = { ...ofStyle("lowerSalt")[0]!, label: { kj: null, saturates: null, sugars: null, fibre: null, salt: null } };
    expect(fitsStyle(unknown, "lowerSalt")).toBe(false);
    expect(fitsStyle(unknown, "lowerSugar")).toBe(false);
  });
});

// Measured 20 November 2026, a 2,000 kcal day (breakfast, lunch, dinner, a snack), Just me (each style's recipes fitted to its meal sizes), as
// breakfasts / lunches / dinners / snacks. A style is offered only with at least STYLE_MIN_RECIPES of each meal at Sainsbury's; a later change that empties one
// (a recipe taken out, a label read again) fails here. Morrisons prints no salt for most of its fresh vegetables, so Lower salt is short there.
const MEASURED: Record<"sainsburys" | "morrisons", Record<EatingStyle, [number, number, number, number]>> = {
  sainsburys: {
    balanced: [62, 83, 129, 19], longevity: [18, 16, 23, 7], highProtein: [14, 37, 82, 5], lowerCarb: [21, 22, 29, 4], keto: [13, 11, 11, 3], mediterranean: [26, 46, 48, 11],
    vegetarian: [54, 37, 38, 16], vegan: [18, 18, 24, 10], pescatarian: [55, 57, 61, 18], paleo: [7, 8, 8, 1], quick: [47, 44, 34, 10], lowFat: [15, 31, 68, 6],
    highFibre: [35, 34, 41, 12], lowerSugar: [26, 47, 75, 6], lowerSalt: [26, 27, 69, 11],
  },
  morrisons: {
    balanced: [62, 82, 126, 19], longevity: [12, 9, 24, 6], highProtein: [17, 35, 82, 5], lowerCarb: [15, 20, 27, 4], keto: [13, 11, 11, 3], mediterranean: [26, 46, 48, 11],
    vegetarian: [54, 37, 38, 16], vegan: [18, 18, 24, 10], pescatarian: [55, 57, 61, 18], paleo: [7, 8, 8, 1], quick: [47, 43, 34, 10], lowFat: [12, 28, 69, 4],
    highFibre: [27, 32, 51, 10], lowerSugar: [15, 34, 52, 7], lowerSalt: [7, 4, 11, 4],
  },
};

describe("measured at Sainsbury's and Morrisons", () => {
  for (const [shop, list] of [["sainsburys", products], ["morrisons", morrisons]] as const) {
    it(`${shop}: every style keeps most of what it had, per meal`, () => {
      for (const style of EATING_STYLES) {
        const n = counts(style, {}, false, list, shop);
        [...MEALS, "snack" as const].forEach((m, i) => expect(n[m], `${shop} ${style} ${m}`).toBeGreaterThanOrEqual(Math.floor(0.75 * MEASURED[shop][style][i]!)));
      }
    });
  }

  it("every style is offered with at least STYLE_MIN_RECIPES breakfasts, lunches and dinners at Sainsbury's, and none is greyed at either shop with no diet", () => {
    expect(STYLE_MIN_RECIPES).toBe(6);
    for (const style of EATING_STYLES) {
      const n = counts(style);
      for (const m of MEALS) expect(n[m], `${style} ${m}`).toBeGreaterThanOrEqual(STYLE_MIN_RECIPES);
      expect(styleTooFew(candidatesFor(style), style, SLOTS), style).toEqual([]);
      expect(styleTooFew(candidatesFor(style, {}, false, morrisons, "morrisons"), style, SLOTS), `${style} at Morrisons`).toEqual([]);
      expect(styleCount(candidatesFor(style), style, "lunch")).toBe(n.lunch);
    }
  });

  it("greys the styles a diet leaves too few of: a vegan has no High protein, Lower carb, Keto or Paleo meals at Sainsbury's, but has Longevity and Mediterranean", () => {
    const vegan = { veganOnly: true };
    const grey = EATING_STYLES.filter((s) => styleTooFew(candidatesFor(s, vegan), s, SLOTS).length > 0);
    for (const s of ["highProtein", "lowerCarb", "keto", "paleo"] as const) expect(grey, s).toContain(s);
    for (const s of ["balanced", "longevity", "mediterranean", "lowFat", "highFibre"] as const) expect(grey, s).not.toContain(s);
  });

  it("fitting to the style's protein is what gives High protein and Lower carb enough recipes", () => {
    const own = (style: EatingStyle) => Object.fromEntries([...candidatesFor("balanced")].map(([m, l]) => [m, l.filter((c) => fitsStyle(c, style)).length])) as Record<MealType, number>;
    expect(counts("highProtein").dinner).toBeGreaterThan(2 * own("highProtein").dinner);
    expect(counts("lowerCarb").dinner).toBeGreaterThan(own("lowerCarb").dinner);
  });

  it("a household's plan (recipes as written) has every meal of High protein and Lower carb", () => {
    for (const style of ["highProtein", "lowerCarb"] as const) for (const m of SLOTS) expect(counts(style, {}, true)[m], `${style} ${m}`).toBeGreaterThan(0);
  });

  it("a High protein week uses only high-protein recipes, every day filled", () => {
    const cands = styleCandidates(candidatesFor("highProtein"), "highProtein");
    const plan = makePlan(cands, null, SLOTS)!;
    expect(plan.week.days).toHaveLength(PLAN_DAYS);
    for (const d of plan.week.days) {
      expect(d.meals).toHaveLength(SLOTS.length);
      for (const m of d.meals) expect(share(m.candidate, "protein"), m.candidate.recipe.id).toBeGreaterThanOrEqual(HIGH_PROTEIN_MIN);
    }
    expect(styleShortfall(cands, "highProtein", SLOTS)).toEqual({ none: [], few: [] });
  });

  it("a Lower carb week fills every day with lower-carb recipes, and says which meals have few", () => {
    const all = candidatesFor("lowerCarb");
    const cands = styleCandidates(all, "lowerCarb");
    const plan = planForBudget(cands, null, styleBetter(() => null, "lowerCarb"), SLOTS, PER_MEAL_RECIPES)!;
    for (const d of plan.week.days) for (const m of d.meals) expect(share(m.candidate, "carbs"), m.candidate.recipe.id).toBeLessThanOrEqual(LOWER_CARB_MAX);
    const short = styleShortfall(all, "lowerCarb", SLOTS);
    expect(short.none).toEqual([]);
    const lc = counts("lowerCarb");
    for (const f of short.few) expect(f.n).toBe(lc[f.meal]);
  });

  it("every style's week uses only that style's recipes where it has them, every day filled", () => {
    for (const style of EATING_STYLES) {
      const cands = styleCandidates(candidatesFor(style), style);
      const plan = makePlan(cands, null, SLOTS)!;
      expect(plan.week.days, style).toHaveLength(PLAN_DAYS);
      const n = counts(style);
      for (const d of plan.week.days) {
        expect(d.meals, style).toHaveLength(SLOTS.length);
        for (const m of d.meals) if (n[m.meal] > 0) expect(fitsStyle(m.candidate, style), `${style}: ${m.candidate.recipe.id}`).toBe(true);
      }
    }
  });

  it("a vegetarian High protein week has no high-protein lunches or dinners, so those take any recipe and the week is still whole", () => {
    const veg = { vegetarianOnly: true };
    const all = candidatesFor("highProtein", veg);
    const short = styleShortfall(all, "highProtein", SLOTS);
    const v = counts("highProtein", veg);
    for (const m of SLOTS) expect(short.none.includes(m)).toBe(v[m] === 0);
    const plan = makePlan(styleCandidates(all, "highProtein"), null, SLOTS)!;
    expect(plan.week.days).toHaveLength(PLAN_DAYS);
    for (const d of plan.week.days) expect(d.meals).toHaveLength(SLOTS.length);
  });
});

// The founder, 20 November 2026: "a lot of them are to do with wraps ... You want kind of like a varied diet ... You can't just do wraps every single day".
// Measured that night for every style at Sainsbury's (2,000 kcal), before → after: Balanced with a snack had a form twice in a day 2 times, in the same meal two
// days running 4 times and 3 wraps (now 0, 0, 2); High protein 1, 9, 0 (now 0, 0, 1); Vegan 1, 7, 3 (now 0, 0, 2). Keto's breakfasts are all eggs or a fry-up
// and Paleo has one snack, so those repeat as little as their recipes allow.
describe("a varied week for every style at Sainsbury's", () => {
  const report = (style: EatingStyle, slots: readonly MealType[], variety: number) => {
    const cands = styleCandidates(candidatesFor(style), style);
    const plan = makePlan(cands, null, slots, variety)!;
    return varietyReport(weekForms(plan.ids, cands, slots));
  };
  const THREE = planSlots({ meals: ["breakfast", "lunch", "dinner"], snacks: 0 });

  it("never the same dish form twice in a day, never in the same meal two days running, at most two wraps (breakfast, lunch and dinner; each way of repeating)", () => {
    for (const style of EATING_STYLES) {
      for (const variety of [2, 4, 7]) {
        const r = report(style, THREE, variety);
        // "as varied as the recipes allow": a vegan meal-prep week (2 recipes a meal) has one vegan breakfast that is neither toast nor a wrap near the meal size
        // since the fruit bowl's almonds were cut to a cook's amount (21 Nov 2026), so it comes to 3 wraps; never every day
        const wrapsAllowed = style === "vegan" && variety === 2 ? MAX_WRAPS_A_WEEK + 1 : MAX_WRAPS_A_WEEK;
        expect(r.wraps, `${style} ${variety}`).toBeLessThanOrEqual(wrapsAllowed);
        expect(r.sameDay, `${style} ${variety}`).toBe(0);
        // a different dish every day uses all 7 of Paleo's breakfasts, and Keto's are eggs but for two fry-ups (and its lunches eggs or salads): some eggs two days running
        expect(r.dayAfter, `${style} ${variety}`).toBeLessThanOrEqual(variety === 7 ? ({ keto: 3, paleo: 1 } as Partial<Record<EatingStyle, number>>)[style] ?? 0 : 0);
      }
    }
    // 33 weeks planned: about 3 s alone with the 382 recipes of 21 November 2026, over the 5 s default when the whole suite runs at once
  }, 30_000);

  it("with a snack too, as varied as the style's recipes allow", () => {
    for (const style of EATING_STYLES) {
      const r = report(style, SLOTS, PER_MEAL_RECIPES);
      expect(r.wraps, style).toBeLessThanOrEqual(MAX_WRAPS_A_WEEK);
      // Keto's snacks and breakfasts are eggs; Paleo has the one snack, every day
      expect(r.sameDay, style).toBeLessThanOrEqual(style === "keto" ? 1 : 0);
      expect(r.dayAfter, style).toBeLessThanOrEqual(style === "paleo" ? PLAN_DAYS - 1 : 0);
    }
  });

  it("with a budget, keeps the week varied while the shops' prices allow", () => {
    for (const style of ["balanced", "mediterranean", "quick"] as const) {
      const cands = styleCandidates(candidatesFor(style), style);
      const best = makePlan(cands, null, THREE)!;
      const plan = makePlan(cands, Math.round(best.week.shoppingCost * 0.85), THREE)!;
      const r = varietyReport(weekForms(plan.ids, cands, THREE));
      expect(r, style).toEqual({ sameDay: 0, dayAfter: 0, wraps: expect.any(Number) });
      expect(r.wraps).toBeLessThanOrEqual(MAX_WRAPS_A_WEEK);
    }
  });
});

describe("each tile's picture", () => {
  const written = [...planCandidates(RECIPES, products, {}, base, [], "sainsburys", true).values()].flat();

  it("is one of our recipes of that style at Sainsbury's (as written), with its own picture on disk, and no recipe is on two tiles", () => {
    const seen = new Set<string>();
    for (const style of EATING_STYLES) {
      expect(STYLE_PICTURES[style].length, style).toBeGreaterThan(0);
      for (const id of STYLE_PICTURES[style]) {
        expect(seen.has(id), `${id} on two tiles`).toBe(false);
        seen.add(id);
        expect(byId.has(id), id).toBe(true);
        const c = written.find((x) => x.recipe.id === id);
        expect(c, `${id} at Sainsbury's`).toBeTruthy();
        expect(fitsStyle(c!, style), `${id} is ${style}`).toBe(true);
        for (const src of [RECIPE_IMAGES[id], RECIPE_THUMBS[id]]) {
          expect(src, id).toBeTruthy();
          expect(existsSync(`public${src}`), src).toBe(true);
        }
      }
    }
  });

  it("suits the person's diet as it is, or there is none", () => {
    const get = (id: string) => byId.get(id);
    expect(stylePicture("balanced", {}, get)).toBe("salmon-new-potatoes-peas");
    expect(stylePicture("balanced", { vegetarianOnly: true }, get)).toBe("mexican-bean-rice-bowl");
    expect(stylePicture("balanced", { veganOnly: true }, get)).toBe("chickpea-rice-bowl");
    expect(stylePicture("longevity", {}, get)).toBe("salmon-chickpea-lemon-salad");
    expect(stylePicture("longevity", { veganOnly: true }, get)).toBe("crushed-chickpeas-tomatoes-toast");
    expect(stylePicture("highProtein", { vegetarianOnly: true }, get)).toBe("beans-poached-eggs");
    expect(stylePicture("highProtein", { veganOnly: true }, get)).toBeNull();
    expect(stylePicture("lowerCarb", { avoidAllergens: ["eggs"] }, get)).toBe("paprika-roasted-almonds");
    expect(stylePicture("keto", { avoidAllergens: ["eggs"] }, get)).toBeNull();
  });
});
