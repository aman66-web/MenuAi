// "Cheapest protein": what 10 g of protein costs at a supermarket, worked out only from two figures the shop prints for the product itself:
// its price per kg (or per litre) and the protein per 100 g (or 100 ml) on its own nutrition label, as sold.
//   pence for 10 g of protein = (price per kg in pence) / (grams of protein per 100 g)        (10 g of protein is 1/10 of a kg's 100-g blocks)
// Nothing is estimated: a product without a read label, without a price per kg or litre on the same basis as its label (per kg with per 100 g, per litre with
// per 100 ml), or whose label is for the cooked or prepared food is left out. Prices are the shop's shelf prices on the day the list was read and they change.
// Dried foods (lentils, flour, powders) are measured as sold, and cook up heavier: the screen says so, and never calls one product better than another.

import type { ShopProduct } from "../shopProducts";

export interface ProteinValue {
  product: ShopProduct;
  /** Pence for 10 g of protein, to 0.1 p. */
  pence10g: number;
  /** Grams of protein per 100 g (or 100 ml), from the label. */
  proteinPer100: number;
  kcalPer100: number;
  per: "g" | "ml";
}

/** A product counts as "a protein food" on the leaderboard only above these (so flour, bread and instant noodles don't top a list of protein). */
export const MIN_PROTEIN_PER_100 = 12;
export const MIN_PROTEIN_ENERGY_SHARE = 0.25;

export function proteinValue(p: ShopProduct): ProteinValue | null {
  const n = p.nutrition;
  if (!n || n.state !== "" || p.price === null || p.price <= 0 || p.unitPrice === null || p.unitPrice <= 0) return null;
  const basisMatches = (p.unit === "per kg" && n.per === "g") || (p.unit === "per litre" && n.per === "ml");
  if (!basisMatches || !Number.isFinite(n.protein) || n.protein <= 0 || n.protein > 100 || !Number.isFinite(n.kcal)) return null;
  return { product: p, pence10g: Math.round(((p.unitPrice * 100) / n.protein) * 10) / 10, proteinPer100: n.protein, kcalPer100: n.kcal, per: n.per };
}

export function isProteinFood(v: ProteinValue): boolean {
  return v.proteinPer100 >= MIN_PROTEIN_PER_100 && v.kcalPer100 > 0 && (v.proteinPer100 * 4) / v.kcalPer100 >= MIN_PROTEIN_ENERGY_SHARE;
}

/** The cheapest protein foods, cheapest first (ties by name so the order never changes between visits). */
export function cheapestProtein(products: readonly ShopProduct[], limit = 20): ProteinValue[] {
  const rows: ProteinValue[] = [];
  for (const p of products) {
    const v = proteinValue(p);
    if (v && isProteinFood(v)) rows.push(v);
  }
  rows.sort((a, b) => a.pence10g - b.pence10g || (a.product.name < b.product.name ? -1 : 1));
  return rows.slice(0, limit);
}

/** What 100 g of protein costs, in pounds. */
export const costOf100gProtein = (v: ProteinValue): number => Math.round(v.pence10g * 10) / 100;

export interface PairResult {
  cheaper: ProteinValue;
  dearer: ProteinValue;
  /** Pounds saved on every 100 g of protein by choosing the cheaper one. 0 when they cost the same. */
  saving: number;
}

export function comparePair(a: ProteinValue, b: ProteinValue): PairResult {
  const [cheaper, dearer] = a.pence10g <= b.pence10g ? [a, b] : [b, a];
  return { cheaper, dearer, saving: Math.round((costOf100gProtein(dearer) - costOf100gProtein(cheaper)) * 100) / 100 };
}

/**
 * Curated pairs for the "Everyday or branded?" cards: a product sold on its protein, and an everyday staple. Product ids from Sainsbury's full list (the only shop
 * whose labels we have read). tests/truthProteinValue.test.ts fails if a product leaves the list, so a refresh of the data never silently drops a card. The
 * words under a pair are only its numbers.
 */
export const CURATED_PAIRS: ReadonlyArray<{ id: string; title: string; branded: string; everyday: string }> = [
  { id: "skyr-yogurt", title: "High protein skyr or natural yogurt", branded: "danone-800g-skyr-high-protein-0-fat-natural-yoghurt", everyday: "sainsburys-fat-free-natural-yogurt-500g" },
  { id: "protein-milk", title: "High protein milk or semi skimmed milk", branded: "supernutrio-high-protein-semi-skimmed-cow-s-milk-1l", everyday: "sainsburys-british-semi-skimmed-milk-2-27l-4-pint" },
  { id: "flapjack", title: "Protein flapjack or chicken breast", branded: "muscle-moose-big-protein-flapjack-golden-syrup-100g", everyday: "sainsburys-2kg-british-fresh-skinless-boneless-chicken-breast-fillets" },
  { id: "whey", title: "Whey protein powder or chicken breast", branded: "phd-diet-whey-protein-powder-vanilla-cr-me-1kg", everyday: "sainsburys-2kg-british-fresh-skinless-boneless-chicken-breast-fillets" },
  { id: "bar", title: "Protein bar or red lentils", branded: "tribe-protein-flapjack-caramel-50g", everyday: "laila-red-split-lentils-1kg" },
];
