import { tk } from "./i18n";
import { normalizeForSearch } from "./search";
import { isProteinFood, proteinValue } from "./truth/proteinValue";
import type { ShopFile, ShopProduct } from "./shopProducts";

// Nutrition leaderboards (founder 2026-11-18: "have something called nutritional leaderboards ... you rank the top 20 products for each thing ... make sure to include
// the logo of the shop that they can buy it from, and also if the same product is sold by multiple shops, include all the logos"). Each board ranks the products
// of every supermarket in the app by one figure from its own nutrition label (per 100 g as sold), or by what 10 g of protein costs. The same product at several
// shops (the same barcode, or exactly the same name) is one row with every shop that sells it. Only a shop's own label or the same product's label read at another
// shop counts: never community numbers, government figures for loose produce, or a label for the food cooked. The boards are worked out when the shop lists are
// rebuilt (tests/leaderboards.test.ts writes public/groceries/all/leaderboards.json), so the phone loads one small file. Numbers only: no board calls a food good
// or bad (CLAUDE.md rule 3).

export const BOARD_SIZE = 20;

/** What the page says is left out (leftOff below). */
export const LEFT_OUT_NOTE = tk("Powders, supplements, herbs, spices and cupboard extras like salt and vinegar are left out, and so are sugar and sweets from Most carbs and Fewest calories: they're used a spoonful at a time.");

export type BoardId = "proteinPerKcal" | "protein" | "meatFreeProtein" | "cheapestProtein" | "fibre" | "carbs" | "fewestKcal";

export const BOARDS: ReadonlyArray<{ id: BoardId; title: string; line: string; unit: string }> = [
  { id: "proteinPerKcal", title: tk("Most protein for the calories"), line: tk("Grams of protein in every 100 calories"), unit: tk("per 100 kcal") },
  { id: "protein", title: tk("Most protein"), line: tk("Grams of protein in 100 g"), unit: tk("per 100 g") },
  { id: "meatFreeProtein", title: tk("Most protein, meat-free"), line: tk("Beans, lentils, tofu, Quorn and more: grams of protein in 100 g"), unit: tk("per 100 g") },
  { id: "cheapestProtein", title: tk("Cheapest protein"), line: tk("What 10 g of protein costs"), unit: tk("for 10 g of protein") },
  { id: "fibre", title: tk("Most fibre"), line: tk("Grams of fibre in 100 g"), unit: tk("per 100 g") },
  { id: "carbs", title: tk("Most carbs"), line: tk("Grams of carbohydrate in 100 g, from starchy foods"), unit: tk("per 100 g") },
  { id: "fewestKcal", title: tk("Fewest calories"), line: tk("Calories in 100 g"), unit: tk("per 100 g") },
];

/** Where one row's product can be bought: the shop, its own product id there and what it costs there. */
export interface BoardShop {
  shop: string;
  id: string;
  photoId: string;
  price: number | null;
}

export interface BoardEntry {
  name: string;
  /** The board's figure: grams (per 100 g, or per 100 kcal), or pence for 10 g of protein. */
  value: number;
  /** Every shop that sells it, the one the figure comes from first. */
  shops: BoardShop[];
  /** The barcode, where a shop's page showed one (the app's every-shop product page). */
  gtin: string;
}

export interface LeaderboardsFile {
  v: 1;
  /** The day the newest of the shop lists was read. */
  checkedOn: string;
  /** What the phone needs to show each shop's own photos. */
  shops: Record<string, { name: string; photoBase: string; photoTemplate?: string }>;
  boards: Record<BoardId, BoardEntry[]>;
}

/** Things eaten a spoonful or a scoop at a time, which would fill a per-100 g board on their own (the first build: twenty protein powders, twenty herbs and
 *  spices, twenty bags of sugar). The page says they are left out. */
const POWDER_OR_SUPPLEMENT = /\b(?:powders?|whey|isolate|protein shakes?|shake mix|gainer|pro v gain|superblend|protein boost|fibre boost|impact|supplements?|capsules?|tablets?|vitamins?|collagen|gummies|jelly|sachets?)\b/i;
const SEASONING = /\b(?:herbs?|spices?|seasonings?|cinnamon|cumin|paprika|oregano|basil|rosemary|thyme|sage|sumac|masala|curry powder|chilli flakes|chilli powder|coriander seeds|turmeric|nutmeg|cloves|mulling|bay leaves|parsley|dill|pods|matcha|teas?|coffee|cocoa|stock cubes?|stock pots?|gravy granules|yeast|bouillon|salt|vinegar|baking powder|bicarbonate|cream of tartar|gelatine|food colou?rings?|flavourings?|extract|essence|ice cubes?|water)\b/i;
const SUGARS = /\b(?:sugars?|sweeteners?|syrups?|honey|icing|glucose|dextrose|mints?|peppermints?|imperials|sweets|candy|lolly|lollies|lollipops?|pops?|marshmallows?|fudge|toffees?|jelly beans|jelly babies|gums?|pastilles|sherbet|nips|drops|jam|marmalade|treacle|molasses|sprinkles|decorations?|dusting|vermicelli|hundreds|1000's|sippers?|clear fruits)\b/i;

/** Meat-free protein foods, by name (founder 2026-11-18: "instead do like the best vegetarian foods"): what the product is made of, and never a name that also
 *  names meat or fish ("Beans with Sausages"). Picked by the shop's own product name, so the page says so; it is not a vegetarian or vegan marking. */
const PLANT_PROTEIN = /\b(?:tofu|tempeh|seitan|edamame|lentils?|chickpeas?|beans?|houmous|hummus|falafel|quorn|soya|soy chunks|soya chunks|split peas|dhal|dal|mycoprotein|textured vegetable protein|tvp)\b/i;
const MEAT_OR_FISH = /\b(?:chicken|beef|pork|lamb|turkey|duck|ham|bacon|sausages?|chorizo|salami|pepperoni|meat|mince|steak|fish|salmon|tuna|cod|haddock|prawns?|mackerel|anchov\w*|crab|lobster|mussels|gelatine)\b/i;
const SAYS_MEAT_FREE = /\b(?:meat[- ]free|plant[- ]based|vegan|vegetarian|quorn)\b/i;
export const isMeatFreeProteinName = (name: string): boolean => PLANT_PROTEIN.test(name) && (!MEAT_OR_FISH.test(name) || SAYS_MEAT_FREE.test(name));

/** Whether a product is left off a board whatever its label says: powders, supplements, herbs, spices and cupboard extras (salt, vinegar, baking powder) on every
 *  board but Cheapest protein; sugar, sweeteners and sweets on Most carbs and Fewest calories. */
export function leftOff(board: BoardId, name: string): boolean {
  if (board === "cheapestProtein") return false;
  if (POWDER_OR_SUPPLEMENT.test(name) || SEASONING.test(name)) return true;
  return (board === "carbs" || board === "fewestKcal") && SUGARS.test(name);
}

/** The figure a product has on a board, or null when it isn't on it. */
export function boardValue(board: BoardId, p: ShopProduct): number | null {
  const n = p.nutrition;
  if (!n || n.state !== "" || n.community || n.govFood || leftOff(board, p.name)) return null;
  if (board === "cheapestProtein") {
    const v = proteinValue(p);
    return v && isProteinFood(v) ? v.pence10g : null;
  }
  if (board === "proteinPerKcal") {
    const v = proteinValue({ ...p, price: 1, unitPrice: 1, unit: n.per === "ml" ? "per litre" : "per kg" });
    if (!v || !isProteinFood(v) || n.kcal < 20) return null;
    return Math.round((n.protein * 100 / n.kcal) * 10) / 10;
  }
  if (n.per !== "g") return null; // the per-100 g boards compare foods by weight, not drinks by volume
  if (n.protein + n.carbs + n.fat > 105) return null;
  // a food with almost no calories at all is a cupboard extra or a zero-calorie spray, not a food that fills you up
  if (board === "fewestKcal") return Number.isFinite(n.kcal) && n.kcal >= 5 && n.kcal < 900 ? Math.round(n.kcal) : null;
  if (board === "meatFreeProtein" && !isMeatFreeProteinName(p.name)) return null;
  // Most carbs counts starchy foods (rice, pasta, oats): sugar at most a quarter of the carbs, so sweets and meringues don't fill it
  if (board === "carbs" && (n.sugars === null || n.sugars > 0.25 * n.carbs)) return null;
  const g = board === "protein" || board === "meatFreeProtein" ? n.protein : board === "fibre" ? n.fibre : n.carbs;
  // a label whose figures can't all be true (more than 100 g in 100 g) is left out
  if (g === null || !Number.isFinite(g) || g <= 0 || g > 100 || n.protein + n.carbs + n.fat > 105) return null;
  return g;
}

/** The same product at several shops: the same barcode, or exactly the same name (own-brand names carry the shop's name, so they never meet another shop's). */
export const sameProductKey = (p: ShopProduct): string => (p.gtin ? `b:${p.gtin}` : `n:${normalizeForSearch(p.name)}`);

// The rule the shop lists use to lend one shop's label or photo to another's same product (tools/groceries/build_groceries.py OWN_BRAND, SIZED, name_key):
// a branded name with its pack size, never a shop's own brand, whose recipe differs from shop to shop.
const OWN_BRAND = /\b(?:tesco|sainsbury s?|sainsburys|asda|waitrose|morrisons|iceland|m and s|marks and spencer|aldi|lidl|co op|ocado|stamford street|hearty food co|ms molly|plant chef|by sainsbury s|taste the difference|so organic|just essentials|extra special|essential waitrose|no 1|the best|savers|market street|nutmeg|specially selected|everyday essentials|natures? pick|nature s pick|harvest morn|brooklea|mamia|milbona|deluxe|vemondo|chef select|crownfield|cien|snack day|nightingale farms|world deli|plant kitchen|collection|irresistible|honest value|luxury|finest|exceptional)\b/;
const SIZED = /\b\d+(?:\.\d+)?(?:kg|g|ml|cl|l)\b|\b\d+x\d/;
const UNIT: Record<string, string> = { kgs: "kg", gm: "g", gram: "g", grams: "g", millilitre: "ml", millilitres: "ml", ltr: "l", litre: "l", litres: "l", liter: "l", liters: "l" };

/** A branded product's name and pack size as one comparable key, or null (no size, or a shop's own brand): build_groceries.py name_key. */
export function brandedNameKey(name: string): string | null {
  let n = (name ?? "").toLowerCase().replace(/&/g, " and ").replace(/\u2019/g, "'").replace(/'/g, "");
  n = n.replace(/(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|grams?|ml|millilitres?|cl|l|ltr|litres?|liters?)\b/g, (_, num: string, unit: string) => num + (UNIT[unit] ?? unit));
  n = n.replace(/(\d)\s*[x×]\s*(\d)/g, "$1x$2");
  n = n.replace(/[^a-z0-9. ]+/g, " ").replace(/ \./g, " ").split(/\s+/).filter(Boolean).join(" ");
  return !SIZED.test(n) || OWN_BRAND.test(n) ? null : n;
}

/** The same branded name and size whatever the order of its words, a plural s or a full stop ("The Chia Co Black Chia Seed 453g" = "The Chia Co Black Chia Seeds 453G", "Mr. Porky" = "Mr Porky"). */
const looseKey = (key: string): string => `w:${[...new Set(key.split(" ").map((w) => w.replace(/\.+$/, "")).filter(Boolean).map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)))].sort().join(" ")}`;

/** Shops whose own range is listed without the shop's name ("Chia Seeds 200 g" at M&S): a name there proves nothing, so only a barcode joins them up. */
const NAME_PROVES_NOTHING = new Set(["marks-and-spencer"]);

/**
 * Which products at different shops are the same one (founder 2026-11-18: "If some of these products are sold by multiple stores, like have the logo of the
 * other store that also sells them"): joined by the same barcode, or by the same branded name and pack size (brandedNameKey, any word order, a plural s
 * aside), never by a shop's own brand or a name that proves nothing, and never by a name that two different barcodes share. Gives each "<shop>|<id>" a group.
 */
export function sameProductGroups(lists: ReadonlyArray<{ shop: string; products: readonly ShopProduct[] }>): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
    let y = x;
    while ((parent.get(y) ?? y) !== r) { const next = parent.get(y)!; parent.set(y, r); y = next; }
    return r;
  };
  const join = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const names = new Map<string, string | null>();
  const nameOf = (shop: string, p: ShopProduct) => {
    if (NAME_PROVES_NOTHING.has(shop)) return null;
    if (!names.has(p.name)) { const k = brandedNameKey(p.name); names.set(p.name, k ? looseKey(k) : null); }
    return names.get(p.name)!;
  };
  const codes = new Map<string, Set<string>>();
  for (const { shop, products } of lists) for (const p of products) {
    const k = nameOf(shop, p);
    if (k && p.gtin) codes.set(k, (codes.get(k) ?? new Set()).add(p.gtin));
  }
  const out = new Map<string, string>();
  for (const { shop, products } of lists) for (const p of products) {
    const node = `p:${shop}|${p.id}`;
    if (p.gtin) join(node, `b:${p.gtin}`);
    const k = nameOf(shop, p);
    if (k && (codes.get(k)?.size ?? 0) <= 1) join(node, k);
  }
  for (const { shop, products } of lists) for (const p of products) out.set(`${shop}|${p.id}`, find(`p:${shop}|${p.id}`));
  return out;
}

const lowerIsBetter = (board: BoardId) => board === "cheapestProtein" || board === "fewestKcal";

/**
 * One board from every shop's list: the products grouped across shops (sameProductGroups), best first (ties by name so the order never changes between
 * rebuilds). Every shop that sells a row's product is on it: those whose own label gives the figure first, best first, then those that sell it with no label.
 */
export function buildBoard(board: BoardId, lists: ReadonlyArray<{ shop: string; products: readonly ShopProduct[] }>, size = BOARD_SIZE, groupsOf: Map<string, string> = sameProductGroups(lists)): BoardEntry[] {
  const groups = new Map<string, { best: number; name: string; gtin: string; shops: Array<BoardShop & { value: number }> }>();
  for (const { shop, products } of lists) {
    for (const p of products) {
      const value = boardValue(board, p);
      if (value === null) continue;
      const key = groupsOf.get(`${shop}|${p.id}`) ?? sameProductKey(p);
      const g = groups.get(key) ?? { best: value, name: p.name, gtin: p.gtin, shops: [] };
      if (g.shops.some((s) => s.shop === shop)) continue; // one row a shop
      g.shops.push({ shop, id: p.id, photoId: p.photoId, price: p.price, value });
      const better = lowerIsBetter(board) ? value < g.best : value > g.best;
      if (better || g.shops.length === 1) { g.best = value; g.name = p.name; }
      if (!g.gtin && p.gtin) g.gtin = p.gtin;
      groups.set(key, g);
    }
  }
  const sign = lowerIsBetter(board) ? 1 : -1;
  const top = [...groups.entries()].sort(([, a], [, b]) => sign * (a.best - b.best) || a.name.localeCompare(b.name, "en-GB")).slice(0, size);
  // the shops that sell a top row's product without a label of their own (or with one the board can't use)
  const wanted = new Set(top.map(([key]) => key));
  const more = new Map<string, Array<BoardShop & { gtin: string }>>();
  for (const { shop, products } of lists) for (const p of products) {
    const key = groupsOf.get(`${shop}|${p.id}`);
    if (!key || !wanted.has(key)) continue;
    const list = more.get(key) ?? [];
    if (!list.some((s) => s.shop === shop)) list.push({ shop, id: p.id, photoId: p.photoId, price: p.price, gtin: p.gtin });
    more.set(key, list);
  }
  return top.map(([key, g]) => {
    const labelled = [...g.shops].sort((a, b) => sign * (a.value - b.value) || a.shop.localeCompare(b.shop)).map(({ shop, id, photoId, price }) => ({ shop, id, photoId, price }));
    const unlabelled = (more.get(key) ?? []).filter((s) => !labelled.some((x) => x.shop === s.shop)).sort((a, b) => a.shop.localeCompare(b.shop));
    return {
      name: g.name,
      value: g.best,
      gtin: g.gtin || unlabelled.find((s) => s.gtin)?.gtin || "",
      // the shop the figure comes from first, then the others best first, then the shops that sell it with no label
      shops: [...labelled, ...unlabelled.map(({ shop, id, photoId, price }) => ({ shop, id, photoId, price }))],
    };
  });
}

export function buildLeaderboards(lists: ReadonlyArray<{ file: ShopFile; products: readonly ShopProduct[] }>, size = BOARD_SIZE): LeaderboardsFile {
  const plain = lists.map((l) => ({ shop: l.file.retailer, products: l.products }));
  const groupsOf = sameProductGroups(plain);
  const boards = Object.fromEntries(BOARDS.map((b) => [b.id, buildBoard(b.id, plain, size, groupsOf)])) as Record<BoardId, BoardEntry[]>;
  const shops = Object.fromEntries(lists.map((l) => [l.file.retailer, { name: l.file.name, photoBase: l.file.photoBase, ...(l.file.photoTemplate !== undefined ? { photoTemplate: l.file.photoTemplate } : {}) }]));
  const checkedOn = lists.map((l) => l.file.checkedOn).sort().at(-1) ?? "";
  return { v: 1, checkedOn, shops, boards };
}

/** A leaderboards file as the phone may use it (anything else is "none yet"). */
export function isLeaderboardsFile(x: unknown): x is LeaderboardsFile {
  if (!x || typeof x !== "object") return false;
  const f = x as Partial<LeaderboardsFile>;
  return f.v === 1 && !!f.boards && typeof f.boards === "object" && !!f.shops && BOARDS.every((b) => Array.isArray((f.boards as Record<string, unknown>)[b.id]));
}
