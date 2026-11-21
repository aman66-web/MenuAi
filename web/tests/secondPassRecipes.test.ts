import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PANTRY, kindExcluded } from "../lib/mm/pantry";
import { candidates, ing, resolveRecipe, type IngredientSpec } from "../lib/mm/recipes";
import { RECIPES } from "../lib/mm/recipeBook";
import { decodeShopProducts, type PricedProduct, type ShopNutrition } from "../lib/mm/shopProducts";

// The second sort of the 30-person meeting of 21 November 2026 (fixer 4: Recipes, the products they pick and their pages): each finding with a check that would
// have caught it. The screens can't be loaded in a test (their "@/" imports), so their code is checked to do what the fix says.

const nut = (kcal: number, protein: number, carbs: number, fat: number, per: "g" | "ml" = "g", state = ""): ShopNutrition =>
  ({ kcal, protein, carbs, fat, saturates: null, sugars: null, fibre: null, salt: null, kj: null, per, state }) as ShopNutrition;
const product = (id: string, name: string, price: number, unitPrice: number | null, nutrition: ShopNutrition | null = nut(300, 10, 50, 5)): PricedProduct =>
  ({ id, name, price, unitPrice, unit: "per kg", member: null, category: "Food cupboard", photoId: "", gtin: "", nutrition });
const ids = (spec: IngredientSpec, list: PricedProduct[], meatFree = false) => candidates(list, spec, meatFree).map((c) => c.product.id);
const source = (path: string) => readFileSync(path, "utf8");

describe("a dried herb or spice is the herb, never a food that names it (Zara #48)", () => {
  it("M&S's dried oregano is the jar, never the feta with oregano (29 recipes picked it)", () => {
    const list = [
      product("feta", "Diced Greek Feta Cheese with Olive Oil and Oregano 150 g", 2, 13.33, nut(280, 14, 1, 24)),
      product("olives", "Green Olives with Oregano 180 g", 1.5, 8.33, nut(220, 1, 2, 22)),
      product("jar", "Dried Oregano 12 g", 1.75, 145.83, nut(306, 9, 26, 4.3)),
    ];
    expect(ids(ing("oregano", 2), list)).toEqual(["jar"]);
  });

  it("the other herbs and paprika leave out the foods every shop's list showed that night", () => {
    const cases: Array<[string, string[], string]> = [
      ["chives", ["ASDA British Double Gloucester with Onion & Chives 200g"], "Sainsbury's Chives 5g"],
      ["mint", ["Exceptional by ASDA Whipped Feta & Mint 170g", "ASDA Mint Jelly 220g", "Minton & Donello Rice Flour Rolled Chopped Dates 6 x 500g"], "Sainsbury's Mint 12g"],
      ["rosemary", ["Mixed Olives with Cheddar and Rosemary Pot 60 g", "Salchichón and Rosemary Cheese Rollitos 110 g", "Waitrose 8 Honey & Rosemary Pork Chipolatas 324g", "SAVOUR BAKES Rosemary & Sea Salt Flatbread Thins 125 g"], "Sainsbury's Rosemary 22g"],
      ["dill", ["Exceptional by ASDA Exceptional by Brisling Sardines with Lemon, Dill and Black Pepper 105g", "Schwartz Lemon & Dill Fish Seasoning 55g"], "Sainsbury's Dill 13g"],
      ["paprika", ["SPECIALLY SELECTED Black Pepper & Paprika Mini Roule Cheese 100 g", "Tesco Finest Sardines In Paprika & Tomato Sauce 105G", "ROOSTERS Paprika Chicken Shakerz 300 g", "Morrisons The Best Houmous Chickpea and Paprika 170g"], "Sainsbury's Paprika 44g"],
      ["thyme", ["Soffle's Rosemary & Thyme Pitta Chips 165g"], "Sainsbury's Thyme 12g"],
    ];
    for (const [key, foods, jar] of cases) {
      // the foods are cheaper, so only the rule keeps them out
      const list = [...foods.map((name, i) => product(`food${i}`, name, 0.5, 5, nut(300, 10, 40, 10))), product("jar", jar, 1.5, 120, nut(300, 10, 40, 5))];
      expect(ids(ing(key, 2), list), key).toEqual(["jar"]);
    }
  });

  it("a meat-free recipe never takes a product whose name says meat or fish by the products' diet rule, beyond the recipes' own few words", () => {
    // mackerel isn't one of MEAT_WORDS nor a dill none word: the diet rule (foodSignals) says fish
    const list = [product("mackerel", "Smoked Mackerel with Dill 200g", 0.5, 2.5, nut(300, 18, 1, 25)), product("jar", "Sainsbury's Dill 13g", 1.5, 115, nut(253, 20, 42, 4))];
    expect(ids(ing("dill", 2), list, true)).toEqual(["jar"]);
    expect(ids(ing("dill", 2), list, false)).toEqual(["mackerel", "jar"]);
  });

  it("the kind's own words never make a product meat: lasagne sheets are sheets, oyster mushrooms are mushrooms", () => {
    const sheets = [product("ms", "Lasagne Pasta Sheets 500 g", 1.2, 2.4, nut(350, 12, 70, 1.5)), product("ragu", "Ragu Lasagne Wheat Pasta Sheets 500g", 1, 2, nut(355, 12, 71, 1.6))];
    expect(ids(ing("lasagne-sheets", 250), sheets, true).sort()).toEqual(["ms", "ragu"]);
    const mushrooms = [product("oyster", "Waitrose British Oyster Mushrooms 150g", 2, 13.33, nut(18, 2.5, 0.5, 0.3))];
    expect(ids(ing("mushrooms", 150), mushrooms, true)).toEqual(ids(ing("mushrooms", 150), mushrooms, false));
  });

  it("on M&S's real list every recipe's dried oregano is a jar of oregano", () => {
    const ms = decodeShopProducts(JSON.parse(readFileSync("public/groceries/all/marks-and-spencer.json", "utf8")));
    const picks = RECIPES.flatMap((r) => resolveRecipe(r, ms).picks).filter((p) => p?.spec.pantry === "oregano");
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) expect(p!.product.name).toMatch(/^(?:Dried )?Oregano \d+ g$/);
  });
});

describe("vegan and vegetarian never let in egg lasagne sheets or a cider apple sauce (Zara #50)", () => {
  it("every kind that contains milk, eggs, fish, crustaceans or molluscs by its nature comes from an animal", () => {
    const animalAllergens = new Set(["milk", "eggs", "fish", "crustaceans", "molluscs"]);
    const missing = [...PANTRY.values()].filter((k) => k.contains.some((a) => animalAllergens.has(a)) && !k.animal).map((k) => k.key);
    expect(missing).toEqual([]);
  });

  it("lasagne sheets and apple sauce are left out for vegans", () => {
    expect(kindExcluded(PANTRY.get("lasagne-sheets")!, { veganOnly: true })).toBe("vegan");
    expect(kindExcluded(PANTRY.get("apple-sauce")!, { veganOnly: true })).toBe("vegan");
  });

  it("apple sauce is never a cider one (M&S's has chicken stock and cream) nor M&S's jalapeño hot sauce", () => {
    const list = [
      product("cider", "Bramley Apple and Cider Sauce 200 g", 1, 5, nut(120, 0.5, 25, 1)),
      product("kent", "Morrisons The Best Bramley Apple Sauce with Kent Cider 210g", 1, 4.76, nut(130, 0.3, 30, 0.2)),
      product("hot", "Flamin' Fruit Hawwwt Sauce Jalapeño Bramley Apple and Lime 150 ml", 1, 6.67, nut(100, 0.5, 22, 0.2)),
      product("plain", "Morrisons Bramley Apple Sauce 280g", 1.2, 4.29, nut(110, 0.2, 26, 0.1)),
    ];
    expect(ids(ing("apple-sauce", 60), list)).toEqual(["plain"]);
  });
});

describe("the recipe screens work the book out a few recipes at a time (Xena #33)", () => {
  it("Add food's Choose a recipe waits behind its spinner until the chunked book is ready", () => {
    const pick = source("app/app/_components/addfood/RecipePick.tsx");
    expect(pick).toContain("const { cards, ready } = useRecipeCards(null, products, settings.preferences, target, { chunked: true });");
    expect(pick).toContain('(state.status === "ready" && !ready)) return <div className="pt-4"><Spinner label={t("Loading recipes")} /></div>;');
  });

  it("welcome step 4 counts the chunked book as still working, so 'nothing fits' never flashes", () => {
    const choice = source("app/app/welcome/RecipeChoice.tsx");
    expect(choice).toContain("const { cards, ready: cardsReady } = useRecipeCards(null, products, settings.preferences, null, { chunked: true });");
    expect(choice).toContain('const working = manifest === null || (shop !== null && (state.status === "loading" || (state.status === "ready" && !cardsReady)));');
  });
});

describe("the Recipes tab when the list of shops can't load (Violet #26)", () => {
  const page = source("app/app/recipes/page.tsx");
  it("says it couldn't load, with Try again, before the spinner and 'No supermarket list yet.'", () => {
    expect(page).toContain("const manifestState = useShopManifestState(retry);");
    expect(page).toContain('const manifestFailed = manifestState.status === "error";');
    const box = page.indexOf("{manifestFailed ? (");
    expect(box).toBeGreaterThan(-1);
    expect(page.slice(box, box + 300)).toContain('<ErrorBox message={t("Couldn\'t load the recipes. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} />');
    expect(box).toBeLessThan(page.indexOf(") : loadingList ? ("));
    expect(page.indexOf(") : loadingList ? (")).toBeLessThan(page.indexOf('title={t("No supermarket list yet.")}'));
  });

  it("an error is never a spinner: the manifest reads as no shops (not null) when it fails", () => {
    expect(page).toContain('const manifest = manifestState.status === "ready" ? manifestState.manifest : manifestState.status === "error" ? NO_SHOPS : null;');
    expect(page).toContain("const loadingList = !manifest ||");
  });
});

describe("the recipe pages' words and small fixes", () => {
  const photo = source("app/app/recipes/photo/page.tsx");
  const detail = source("app/app/recipes/RecipeDetail.tsx");
  const view = source("app/app/recipes/view/page.tsx");

  it("Make it at home and Pip's note never say every figure is from the products' own labels (Tara #6)", () => {
    expect(photo).toContain('t("Every figure added up from the products\' numbers")');
    expect(photo).toContain("We don't keep it. The numbers come from the products (each one says where).");
    expect(photo).toContain("then works out every figure from their numbers. It can take up to a minute.");
    expect(detail).toContain("Pip wrote this recipe with AI from real products at {shop}; the numbers come from the products (each one says where). Read the steps");
    for (const s of [photo, detail]) expect(s).not.toMatch(/t\("[^"]*(?:numbers come from the products' labels|products' own labels|figure from their labels)[^"]*"/);
  });

  it("Swap names community and government figures and a drained label (Yusuf #46)", () => {
    const row = detail.slice(detail.indexOf("{options.map((o) => {"));
    expect(row).toContain('{t("{n} g protein", { n: Math.round((o.product.nutrition.protein / (o.product.nutrition.byWeight ?? 1)) * 10) / 10 })} {nutritionBasis({ per: o.product.nutrition.byWeight ? "g" : o.product.nutrition.per, state: o.product.nutrition.state }, t)}');
    expect(row).toContain('{o.product.nutrition.community && <span');
    expect(row).toContain('{t("community numbers")}');
    expect(row).toContain('{o.product.nutrition.govFood && <span');
    expect(row).toContain('{t("UK government figures")}');
  });

  it("a recipe link with no id or a bad one has the header and the way back (Arjun #62)", () => {
    expect(view).toContain('<PageHeader back={{ href: "/app/recipes", label: t("Back to recipes") }} />');
    expect(view).toContain('<EmptyState title={t("Choose a recipe first.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} />');
    expect(view).not.toContain("ErrorBox");
  });

  it("the allergies 'show more' points aria-controls at its panel only while it is open (Sam #1)", () => {
    expect(photo).toContain('aria-controls={open ? "exclude-allergies" : undefined}');
    expect(photo).toContain('{open && <div id="exclude-allergies"');
  });
});
