import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PANTRY } from "../lib/mm/pantry";
import { RECIPES } from "../lib/mm/recipeBook";
import { resolveRecipe } from "../lib/mm/recipes";
import { decodeShopProducts } from "../lib/mm/shopProducts";
import type { AllergenKey } from "../lib/mm/types";

// A recipe's allergens come from its ingredient kinds' `contains` flags (lib/mm/recipeAllergens.ts), never from a product's own label. This checks those flags
// against the shops' own labels (the 30-person audit, 20 November 2026): for every shop that makes recipes, the product each recipe uses by default for each
// ingredient must not declare an allergen (in its bold ingredients, as the shop's page prints them in data/groceries/ingredients/<shop>.csv) that its kind
// doesn't flag. "May contain" is never read: a kind says nothing about traces. A failure means a kind's flags (or its product match) need fixing in pantry.ts.

/** The shops that make recipes, with the file their ingredient lists were saved in (tools/groceries/labels_chrome_ingest.py). */
const SHOPS: Record<string, string> = { sainsburys: "sainsburys-chrome", asda: "asda", morrisons: "morrisons-chrome", waitrose: "waitrose", iceland: "iceland-chrome" };

/** A bold ingredient word as the 14 allergens UK law names (oats count as a cereal containing gluten; pine nuts, coconut and nutmeg aren't tree nuts in law). */
const WORDS: ReadonlyArray<[AllergenKey, RegExp]> = [
  ["gluten", /\b(wheat|wheatflour|barley|rye|oats?|spelt|kamut|gluten)\b/i],
  ["crustaceans", /\b(crustaceans?|prawns?|shrimps?|crab|lobster|crayfish|langoustines?)\b/i],
  ["eggs", /\b(eggs?|egg yolk|egg white)\b/i],
  ["fish", /\b(fish|anchov(?:y|ies)|salmon|cod|tuna|mackerel|haddock|pollock)\b/i],
  ["milk", /\b(milk|cream|butter|cheese|whey|lactose|yogh?urt|casein|buttermilk)\b/i],
  ["molluscs", /\b(molluscs?|mussels?|oysters?|squid|clams?|scallops?)\b/i],
  ["mustard", /\bmustard\b/i],
  ["nuts", /\b(almonds?|hazelnuts?|walnuts?|cashews?|pecans?|brazil nuts?|pistachios?|macadamias?|tree nuts|nuts)\b/i],
  ["peanuts", /\b(peanuts?|groundnuts?)\b/i],
  ["sesame", /\bsesame\b/i],
  ["soya", /\b(soya?|soybeans?|soya beans)\b/i],
  ["sulphites", /\b(sulphites?|sulphur dioxide|metabisulphite|sodium metabisulphite)\b/i],
  ["celery", /\b(celery|celeriac)\b/i],
  ["lupin", /\blupin\b/i],
];
const NOT_AN_ALLERGEN = /^(ingredients:|allergy advice|bold)$|\bpine nuts?\b|coconut|nutmeg/i;

/** The rows of a CSV file, by its header (quoted fields with commas and doubled quotes, as Python's csv module writes them). */
function csvRows(path: string): Array<Record<string, string>> {
  const text = readFileSync(path, "utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows[0] ?? [];
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** The allergens a product's bold ingredient words declare. */
function boldAllergens(bold: string): AllergenKey[] {
  const words = bold.split(";").map((w) => w.trim()).filter((w) => w && !NOT_AN_ALLERGEN.test(w));
  return WORDS.filter(([, re]) => words.some((w) => re.test(w))).map(([a]) => a);
}

describe("bold ingredient words as allergens", () => {
  it("reads the shops' own words, and leaves out what isn't one of the 14", () => {
    expect(boldAllergens("Wheat; Egg; Milk")).toEqual(["gluten", "eggs", "milk"]);
    expect(boldAllergens("INGREDIENTS:; soya; wheat; Allergy Advice")).toEqual(["gluten", "soya"]);
    expect(boldAllergens("Pine Nuts; Coconut")).toEqual([]);
    expect(boldAllergens("Sodium Metabisulphite; Cashew Nuts")).toEqual(["nuts", "sulphites"]);
  });
});

describe("the pantry's allergen flags against the shops' own labels", () => {
  for (const [shop, file] of Object.entries(SHOPS)) {
    const path = `../data/groceries/ingredients/${file}.csv`;
    it.skipIf(!existsSync(path))(`${shop}: no recipe's default product declares an allergen its ingredient kind doesn't flag`, () => {
      const products = decodeShopProducts(JSON.parse(readFileSync(`public/groceries/all/${shop}.json`, "utf8")));
      const labels = new Map(csvRows(path).map((r) => [r.product_id!, r.allergens_bold ?? ""]));
      const problems = new Set<string>();
      let read = 0;
      for (const r of RECIPES) {
        for (const p of resolveRecipe(r, products).picks) {
          if (!p?.spec.pantry) continue;
          const bold = labels.get(p.product.id);
          if (bold === undefined) continue;
          read++;
          const kind = PANTRY.get(p.spec.pantry)!;
          const missing = boldAllergens(bold).filter((a) => !kind.contains.includes(a));
          if (missing.length) problems.add(`${kind.key}: "${p.product.name}" declares ${missing.join(", ")}`);
        }
      }
      expect(read, `${shop}: labels read`).toBeGreaterThan(0);
      expect([...problems]).toEqual([]);
    }, 60_000);
  }
});
