import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BarcodeFile, BarcodeHit } from "../lib/mm/barcodes";
import { RECIPES } from "../lib/mm/recipeBook";
import { resolveRecipe } from "../lib/mm/recipes";
import { decodeShopProducts, tagShopProducts, type ShopFile, type ShopManifest } from "../lib/mm/shopProducts";

// The groceries findings the 30-person meeting's first chair didn't reach (the second pass, 21 November 2026): numbers the build left out on purpose stay out,
// a loaded shop list lets its raw rows go, and a recipe's "can this shop make it" needs no copy of the list. The screens have no DOM in the unit tests, so the
// pieces that fix each finding there are read from the code (as homeTodayToasts.test.ts does).

// The app's "@/..." imports aren't resolved under vitest: point them at the real modules (as groceryFixes.test.ts does).
vi.mock("@/lib/mm/addFood", () => import("../lib/mm/addFood"));
vi.mock("@/lib/mm/barcodes", () => import("../lib/mm/barcodes"));
vi.mock("@/lib/mm/config", () => import("../lib/mm/config"));
vi.mock("@/lib/mm/groceries", () => import("../lib/mm/groceries"));
vi.mock("@/lib/mm/shopProducts", () => import("../lib/mm/shopProducts"));
vi.mock("@/lib/mm/i18n", () => import("../lib/mm/i18n"));
const { labelHeldBack, lookupBarcodeEverywhere, shopRowFor } = await import("../app/app/_components/addfood/findByBarcode");
const { findBarcode, loadShopFile } = await import("../app/app/_lib/shopProducts");

const read = (p: string) => readFileSync(p, "utf8");

// Nesquik milkshake powder as the published files hold it (21 November 2026): rows at Sainsbury's, Asda and Morrisons with no label, and the older catalogue's
// record at all three (community numbers: 64.1 kcal, which the build rejected on purpose)
const NESQUIK = "7613031513031";
const NESQUIK_NAME = "Nesquik Chocolate Flavoured Milkshake Powder 500g Tub";
const BARCODES: BarcodeFile = {
  v: 1,
  shops: ["sainsburys", "tesco", "asda", "aldi", "lidl", "morrisons"],
  codes: { [NESQUIK]: [[0, "nesquik-chocolate-flavoured-milkshake-powder-500g-tub", 0], [2, "7591646", 0], [5, "112577656", 0]] },
  catalogue: { shops: ["tesco", "sainsburys", "asda", "waitrose", "lidl", "aldi", "morrisons"], codes: { [NESQUIK]: [1, 2, 6] } },
};
const shopFile = (retailer: string, name: string, id: string): ShopFile => ({
  v: 1, retailer, name, checkedOn: "2026-11-20", pageBase: "https://example.org/", photoBase: "https://example.org/", categories: ["Drinks"], schemes: [],
  products: [[id, NESQUIK_NAME, 3.5, 7, "per kg", null, null, 0, "", NESQUIK]],
});
const FILES: Record<string, unknown> = {
  "/groceries/all/barcodes.json": BARCODES,
  "/groceries/all/all-manifest.json": { v: 1, retailers: [["sainsburys", "Sainsbury's"], ["asda", "Asda"], ["morrisons", "Morrisons"]].map(([id, name]) => ({ id: id!, name: name!, file: `${id}.json`, count: 1, checkedOn: "2026-11-20", sha256: "" })) } satisfies ShopManifest,
  "/groceries/all/sainsburys.json": shopFile("sainsburys", "Sainsbury's", "nesquik-chocolate-flavoured-milkshake-powder-500g-tub"),
  "/groceries/all/asda.json": shopFile("asda", "Asda", "7591646"),
  "/groceries/all/morrisons.json": shopFile("morrisons", "Morrisons", "112577656"),
};
/** Our own files from memory; anything else (Open Food Facts through /api/v1/barcode) answers with the very figures the build held back, so asking it shows. */
const serve = () => vi.fn(async (url: string | URL | Request) => {
  const u = String(url);
  const body = FILES[u];
  if (body !== undefined) return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ found: true, product: { name: "Nesquik", per: "g", label: { kcal: 64.1, protein: 1, carbs: 15, fat: 0.3 } } }), { status: 200, headers: { "Content-Type": "application/json" } });
});

afterEach(() => vi.unstubAllGlobals());

const hit = (shops: BarcodeHit["shops"], catalogue: string[]): BarcodeHit => ({ code: "5000168001142", shops, catalogue });
const none = (shop: string, id = `${shop}-1`) => ({ shop, id, label: "none" as const });
const own = (shop: string, id = `${shop}-1`) => ({ shop, id, label: "own" as const });

describe("numbers the build held back on purpose stay out (Yusuf #38, with Xena #37 and Yusuf #41)", () => {
  it("knows a held-back barcode: shop rows with no label and a catalogue record", () => {
    expect(labelHeldBack(hit([none("asda"), none("tesco")], ["asda"]))).toBe(true);
    expect(labelHeldBack(hit([none("asda"), own("tesco")], ["asda"]))).toBe(false); // a shop's own label is there
    expect(labelHeldBack(hit([none("asda")], []))).toBe(false); // nothing to hold back: Open Food Facts may still know it
    expect(labelHeldBack(hit([], ["asda"]))).toBe(false); // only the catalogue holds it: its page
  });

  it("a scan of one opens the person's own shop's page for it (else the first shop's), never the catalogue's page", () => {
    const h = hit([none("asda"), none("morrisons")], ["asda", "morrisons"]);
    expect(shopRowFor(h, { scan: true, hint: null, mine: ["morrisons"] })).toEqual(none("morrisons"));
    expect(shopRowFor(h, { scan: true, hint: null, mine: [] })).toEqual(none("asda"));
    // a link opens the shop it names
    expect(shopRowFor(h, { scan: false, hint: "morrisons", mine: [] })).toEqual(none("morrisons"));
    expect(shopRowFor(h, { scan: false, hint: null, mine: [] })).toEqual(none("asda"));
  });

  it("keeps the other routes as they were", () => {
    // a scan opens the first row with numbers
    expect(shopRowFor(hit([none("asda"), own("tesco")], ["asda"]), { scan: true, hint: null, mine: [] })).toEqual(own("tesco"));
    // a scan with no numbers anywhere and no catalogue record goes on to Open Food Facts
    expect(shopRowFor(hit([none("asda")], []), { scan: true, hint: null, mine: [] })).toBeUndefined();
    // a link to a barcode only the shop lists hold opens one of them; one with a label and a catalogue record shows the catalogue's page (with the label's numbers)
    expect(shopRowFor(hit([none("asda"), none("tesco")], []), { scan: false, hint: "tesco", mine: [] })).toEqual(none("tesco"));
    expect(shopRowFor(hit([own("asda")], ["asda"]), { scan: false, hint: null, mine: [] })).toBeUndefined();
    expect(shopRowFor(hit([], ["asda"]), { scan: true, hint: null, mine: [] })).toBeUndefined();
  });

  it("Add food's lookup of Nesquik powder: no figures, the shop list's name, and Open Food Facts never asked", async () => {
    const fetch = serve();
    vi.stubGlobal("fetch", fetch);
    expect(await findBarcode(NESQUIK)).toMatchObject({ code: NESQUIK, catalogue: ["sainsburys", "asda", "morrisons"] });
    expect(await lookupBarcodeEverywhere(NESQUIK, [], "Barcode")).toEqual({ status: "missing", name: NESQUIK_NAME });
    expect(fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/api/v1/barcode"))).toEqual([]);
  });

  it("the product page hands such a scan or link to the shop's page, which offers typing the numbers and no catalogue numbers", () => {
    const product = read("app/app/groceries/product/ProductScreen.tsx");
    expect(product).toContain("const target = shopRowFor(found, { scan, hint: retailerHint, mine });");
    const item = read("app/app/groceries/shop/item/ShopItemScreen.tsx");
    expect(item).not.toContain('t("See the nutrition")');
    expect(item).not.toContain('t("We have calories');
    expect(item).not.toContain("needHere");
    // the allergen lookup stays, only while the person avoids an allergen
    expect(item).toContain("if (!gtin || !avoidKey) return;");
    // "Type the numbers from the pack" in the diary button's place, starting with the product's name, and its sheet on the page
    expect(item).toContain("const typed = useTypedDiary(diaryAdded);");
    expect(item).toContain("onClick={() => typed.type(product.name)}");
    expect(item).toContain(': typeIt(true, "mt-3.5 min-h-[3.25rem] text-base"))}');
    expect(item).toContain(': typeIt(false, "min-h-12"))}');
    expect(item).toContain("{typed.sheet}");
    // reached by a scan, "Add to my list" is the white button whatever the numbers (the typed entry or the diary is the ink one above it)
    expect(item).toMatch(/\{scan \? \(\s*<Button variant="secondary" full/);
  });
});

describe("the line for a product we have no numbers for (Yusuf #40)", () => {
  it("no longer says the shop's page has them: it is untrue for Lidl and the pages read with no table", () => {
    const item = read("app/app/groceries/shop/item/ShopItemScreen.tsx");
    expect(item).toContain('t("We don\'t have the nutrition for this product. The label on the pack has it.")');
    expect(item).not.toContain('t("We haven\'t read the nutrition for this product yet.');
  });
});

describe("a loaded shop list lets its raw rows go (Xena #35)", () => {
  it("keeps the decoded products and the file's own details, with no rows", async () => {
    vi.stubGlobal("fetch", serve());
    const { file, products } = await loadShopFile("asda");
    expect(file.products).toEqual([]);
    expect(file).toMatchObject({ retailer: "asda", name: "Asda", pageBase: "https://example.org/", categories: ["Drinks"] });
    expect(products).toEqual(decodeShopProducts(FILES["/groceries/all/asda.json"] as ShopFile));
    expect(products[0]).toMatchObject({ id: "7591646", name: NESQUIK_NAME, gtin: NESQUIK });
  });

  it("a recipe page asks whether each shop can make the recipe from the shop's own list, not a tagged copy: the same answer", () => {
    expect(read("app/app/recipes/view/RecipeScreen.tsx")).toContain("out.set(f.retailer, resolveRecipe(recipe, state.lists[i]!).complete)");
    // Asda's published list: some recipes it can make and some it can't, and each answer is the same both ways
    const list = decodeShopProducts(JSON.parse(read("public/groceries/all/asda.json")) as ShopFile);
    const tagged = tagShopProducts([{ shop: "asda", products: list }]);
    const answers = RECIPES.map((r) => [r.id, resolveRecipe(r, list).complete] as const);
    expect(answers.some(([, ok]) => ok)).toBe(true);
    expect(answers.some(([, ok]) => !ok)).toBe(true);
    for (const [id, ok] of answers) expect(resolveRecipe(RECIPES.find((r) => r.id === id)!, tagged).complete, id).toBe(ok);
  });
});

describe("Search every shop loads All shops only once something is typed (Xena #36)", () => {
  it("asks for no list, and shows none, before two letters", () => {
    const src = read("app/app/groceries/search/SearchScreen.tsx");
    expect(src).toContain('const wantLists = scope !== "all" || !!code || deferred.trim().length >= 2;');
    expect(src).toContain("const lists = useShopLists(manifest && wantLists ? ids : [], retry);");
    expect(src).toContain("if (code || !wantLists) return [];");
    expect(src).toContain(") : !wantLists ? null : !manifest || lists.status === \"loading\" ? (");
  });
});

describe("the diet lines say what is read (Zara #52, #53)", () => {
  it("Search every shop and the selected shops say 'name and aisle'", () => {
    for (const p of ["app/app/groceries/search/SearchScreen.tsx", "app/app/groceries/shops/MultiShopScreen.tsx"]) {
      expect(read(p), p).toContain("groceryDietLine(prefs, diet, t, { byName: true })");
    }
    expect(read("app/app/groceries/shop/ShopListScreen.tsx")).toContain("groceryDietLine(prefs, diet, t);");
  });
  it("the product page still gives the diet line when an allergy is set and the record has none", () => {
    const src = read("app/app/groceries/product/ProductScreen.tsx");
    expect(src).toContain('const dietOnly = dietProblem === "allergen" ? foodDietProblem(listedFacts(listed), { ...prefs, avoidAllergens: [] }) : dietProblem;');
    expect(src).toMatch(/\{dietOnly && <InfoLine heading=\{null\} className=\{dietProblem === "allergen" \? "mt-3" : "mt-4"\}>\{t\("This product doesn't fit your diet settings, going by its name, type and label\."\)\}<\/InfoLine>\}/);
  });
});

describe("'At other supermarkets' (Sam #2)", () => {
  it("shop names and prices are 44-point underlined links", () => {
    const src = read("app/app/groceries/product/ProductScreen.tsx");
    expect(src).toContain('replace prefetch={false} className="inline-flex min-h-11 items-center text-[0.9375rem] font-bold underline underline-offset-4">{retailerName(r)}</Link>');
    expect(src).not.toContain("hover:underline");
    expect(src).toContain('<a className="inline-flex min-h-11 items-center gap-1 text-base font-bold text-foreground underline underline-offset-4" href={price.url}');
  });
});

describe("Compare's overview says why there is none (Yusuf #42)", () => {
  it("names a g and ml mix and a cooked and as-sold mix apart", () => {
    expect(read("app/app/compare/CompareScreen.tsx")).toContain('{mixed === "basis" ? t("Some are per 100 g and some per 100 ml, so there\'s no overview.") : t("Some labels are for the cooked food, so there\'s no overview.")}');
  });
});
