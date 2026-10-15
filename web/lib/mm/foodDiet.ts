import { englishT, type T } from "./i18n";
import type { AllergenKey, Preferences } from "./types";

// Diet settings for supermarket products (founder 2026-10-11: "I put in vegetarian and it's suggesting meat items, fix all of this").
// Products carry no vegetarian or halal mark we could read, so the rule is the recipes' rule (lib/mm/pantry.ts): a product is left out when its
// own name, brand, type, ingredients or allergens PLAINLY say it doesn't suit (chicken, tuna, pork gelatine, milk for a vegan...). Nothing is
// inferred the other way: a product that stays is not promised to suit, and the screen says so. Restaurant dishes use the restaurants' own
// tags instead (lib/mm/menu-view.ts passesDiet); the dish-name pork/beef rule for menus lives in tools/build_menus.py (name_tags).

export interface FoodFacts {
  name: string;
  brand?: string;
  /** Our catalogue's category id ("meat", "fish", "meat-alternatives"...) or a shop's own category name ("Meat & fish"). */
  category?: string;
  /** Open Food Facts' most specific category ("chicken-breasts"). */
  type?: string;
  /** The ingredients as the shop's page printed them. */
  ingredients?: string;
  /** null = this product's allergens are unknown (hidden by an allergy filter); undefined = this list never carries allergens. */
  allergens?: { contains: readonly AllergenKey[]; mayContain: readonly AllergenKey[] } | null;
}

export type DietProblem = "meat" | "fish" | "pork" | "beef" | "animal" | "alcohol" | "notHalal" | "allergen";

const words = (list: string) => list.trim().split(/\s*\|\s*/).join("|");
/** Whole words, singular or plural ("ham" finds "Ham" and "hams", never "Hamburger"). */
const wordRe = (list: string, guard = "") => new RegExp(`${guard}\\b(?:${words(list)})(?:s|es)?\\b`, "i");

// The product says it is a meat-free version: its meat or fish words describe the style, not the contents ("Quorn Chicken Pieces").
const VEG_NAMED = /\b(?:vegan|vegetarian|veggie|plant[\s-]?based|meat[\s-]?free|meatless|no[\s-]meat|meat[\s-]alternatives?|quorn|tofu|seitan|tempeh|this isn'?t|beyond meat|moving mountains|linda mccartney'?s?|richmond meat free|plant chef|plant pioneers|v-?bites)\b/i;
const VEG_TYPE = /\b(?:meat analogues?|meat substitutes?|vegetarian|vegan|plant based|meat free)\b/i;
const VEGAN_NAMED = /\b(?:vegan|plant[\s-]?based|dairy[\s-]?free|milk[\s-]?free|egg[\s-]?free)\b/i;

const NOT_AFTER_VEG = "(?<!\\b(?:vegan|vegetarian|veggie|plant[\\s-]based|meat[\\s-]free|meatless|mock|faux|no)[\\s-])";
const MEAT = wordRe(`chicken | beef | pork | ham | bacon | gammon | lamb | mutton | turkey | duck | goose | venison | veal | rabbit | pheasant | partridge | chorizo |
  pepperoni | salami | prosciutto | pancetta | n'?duja | lardon | sausage | steak | brisket | meatball | meat | hot dog | frankfurter | bratwurst | black pudding |
  haggis | corned | pastrami | bresaola | biltong | jerky | gelatine | gelatin | lard | suet | animal rennet | chicken liver | oxtail | poultry | pate de foie | foie gras`, NOT_AFTER_VEG);
// Dishes that are meat by their own name ("Chilli con carne", "Spaghetti carbonara"), unless the word before says otherwise ("Lentil bolognese").
const MEAT_DISH = wordRe(`con carne | bolognese | bolognaise | carbonara | blt | scotch egg | scotch broth | cottage pie | shepherd'?s pie | moussaka | lasagne | lasagna |
  salsiccia | luncheon meat | spag bol | hamburger | meat feast | toad in the hole | quiche lorraine | lorraine quiche`,
  "(?<!\\b(?:vegan|vegetarian|veggie|veg|vegetable|vegetables|plant[\\s-]based|meat[\\s-]free|meatless|mock|faux|no|non|lentil|lentils|bean|mushroom|quorn|cheese|spinach|ricotta|squash|aubergine|tomato|pumpkin|courgette|halloumi|cauliflower|chickpea|root)[\\s-])");
const MEAT_EXCEPT = /\b(?:vegetable|veg)\s+suet\b|\bbeef\s+tomato(?:es)?\b|\blamb'?s\s+lettuce\b|\b(?:cauliflower|celeriac|halloumi|mushroom|aubergine|squash|cabbage|tofu)\s+steaks?\b|\bchicken\s+eggs?\b|\b(?:hot\s?dog|ham)?burger\s+(?:rolls?|buns?)\b|\bhot\s?dog\s+(?:rolls?|buns?)\b|\bwhite\s+rabbit\b|\blasagn[ea]\s+sheets?\b|\bprepared\s+lasagn[ea]s?\b|\b(?:tuna|salmon|swordfish|cod|fish|halibut|marlin)\s+steaks?\b/i;
const FISH = wordRe(`fish | salmon | tuna | cod | haddock | pollock | pollack | hake | plaice | lemon sole | dover sole | sea ?bass | bream | mackerel | sardine | pilchard |
  anchovy | anchovies | herring | kipper | trout | monkfish | swordfish | prawn | shrimp | crab | lobster | langoustine | scampi | calamari | squid | octopus |
  mussel | clam | oyster | scallop | seafood | shellfish | sashimi | fish ?cake | caviar | roe | crayfish | whitebait | surimi | worcestershire | bonito | cockle | whelk | anchoveta |
  stone ?bass | salmone | gamberi | gamberetti | tonno | branzino | merluzzo | vongole | cozze | frutti di mare`, NOT_AFTER_VEG);
const FISH_EXCEPT = /\boyster\s+mushrooms?\b|\bswedish fish\b|\bcod\s+liver\s+oil\b(?=.*\bcapsule)|\bfish[\s-]?free\b/i;
const PORK = wordRe(`pork | bacon | ham | gammon | prosciutto | pancetta | chorizo | salami | n'?duja | lardon | pigs? in blankets | porchetta | black pudding | lard | pepperoni |
  sausage | gelatine | gelatin | serrano ham | parma ham`, "(?<!\\b(?:turkey|chicken|beef|lamb|venison|halal|vegan|vegetarian|veggie|plant[\\s-]based|meat[\\s-]free|bovine|fish|no)[\\s-])");
const BEEF = wordRe(`beef | brisket | veal | wagyu | sirloin | rib-?eye | rump | bresaola | oxtail | corned | steak | suet | dripping | gelatine | gelatin`,
  "(?<!\\b(?:pork|porcine|fish|salmon|tuna|swordfish|cauliflower|celeriac|halloumi|gammon|lamb|chicken|turkey|vegetable|veg|vegan|vegetarian|veggie|plant[\\s-]based|meat[\\s-]free|no)[\\s-])");
const BEEF_EXCEPT = /\bbeef\s+tomato|\bvegetable\s+suet\b/i;
// For a vegan: plainly from an animal (milk, eggs, honey...), unless it names the plant version ("oat milk", "peanut butter", "butter beans").
const ANIMAL = wordRe(`milk | cheese | cream | butter | buttermilk | yogh?urt | honey | egg | mayonnaise | mayo | ghee | whey | paneer | mozzarella | cheddar | parmesan |
  halloumi | feta | brie | camembert | ricotta | mascarpone | custard | meringue | lactose | casein | kefir | royal jelly | beeswax | carmine | cochineal | shellac`,
  "(?<!\\b(?:oat|oats|soya|soy|almond|coconut|rice|cashew|hazelnut|pea|plant|nut|peanut|cocoa|shea|vegan|dairy[\\s-]free|free[\\s-]from)[\\s-])");
const ANIMAL_EXCEPT = /\bbutter\s?beans?\b|\bcream\s+crackers?\b|\bcream\s+of\s+tartar\b|\bcoconut\s+(?:milk|cream)\b|\begg\s?plant\b|\bmilk\s+thistle\b|\bwater\s+kefir\b/i;
const ALCOHOL = wordRe(`beer | lager | ale | stout | porter | cider | perry | wine | prosecco | champagne | cava | vodka | gin | rum | whisky | whiskey | brandy | cognac |
  tequila | liqueur | sherry | vermouth | mead | alcohol | alcoholic beverage | spirit`, "(?<!\\b(?:ginger|root|non|low)[\\s-])");
const ALCOHOL_EXCEPT = /\b(?:wine|cider|malt|rice|sherry|balsamic|spirit)\s+vinegars?\b|\bcider\s+vinaigrettes?\b|\bwine\s+gums?\b|\bspirit\s+of\b/i;
const ALCOHOL_FREE = /\balcohol[\s-]?free\b|\bnon[\s-]?alcoholic\b|\bde-?alcoholi[sz]ed\b|(?:^|\s)0(?:\.0)?\s?%|\bzero\s+alcohol\b/i;
const HALAL = /\bhalal\b/i;

const MEAT_CATEGORIES = new Set(["meat"]);
const FISH_CATEGORIES = new Set(["fish"]);
// A shop's own aisle names: Sainsbury's "Meat & fish", Asda "Meat, Poultry & Fish", Lidl "Meat & Poultry" / "Fish & Seafood",
// "Beer, wine & spirits" / Lidl "Wine, Beer & Spirits" / Aldi "Alcohol".
const MEAT_OR_FISH_CATEGORIES = /^meat\b.*\bfish\b/i;
const MEAT_ONLY_CATEGORIES = /^meat\b/i;
const FISH_ONLY_CATEGORIES = /^fish\b/i;
const ALCOHOL_CATEGORIES = /^(?=.*\b(?:beer|wine|spirits)\b.*\b(?:beer|wine|spirits)\b)|^alcohol/i;

const has = (re: RegExp, except: RegExp | null, ...texts: Array<string | undefined>) =>
  texts.some((t) => !!t && re.test(except ? t.replace(new RegExp(except.source, "gi"), " ") : t));

export interface FoodSignals {
  vegNamed: boolean;
  meat: boolean;
  fish: boolean;
  pork: boolean;
  beef: boolean;
  animal: boolean;
  alcohol: boolean;
  halalNamed: boolean;
}

/** What a product's own name, brand, type, category, ingredients and allergens plainly say. */
export function foodSignals(f: FoodFacts): FoodSignals {
  const type = f.type?.replace(/-/g, " ");
  const label = [f.name, f.brand];
  const vegNamed = has(VEG_NAMED, null, ...label) || has(VEG_TYPE, null, type) || f.category === "meat-alternatives";
  const veganNamed = has(VEGAN_NAMED, null, ...label);
  const contains = f.allergens?.contains ?? [];
  // A meat-free product's name and type describe the style ("Quorn Chicken Style Pieces", type "meat-analogues"), so only its ingredients count.
  const texts = vegNamed ? [f.ingredients] : [...label, type, f.ingredients];
  const meatFishCategory = !vegNamed && !!f.category && MEAT_OR_FISH_CATEGORIES.test(f.category);
  const meatCategory = !vegNamed && !!f.category && !meatFishCategory && MEAT_ONLY_CATEGORIES.test(f.category);
  const fishCategory = !vegNamed && !!f.category && FISH_ONLY_CATEGORIES.test(f.category);
  const fish = (!vegNamed && !!f.category && FISH_CATEGORIES.has(f.category)) || fishCategory || contains.some((a) => a === "fish" || a === "crustaceans" || a === "molluscs") || has(FISH, FISH_EXCEPT, ...texts);
  const meat = (!vegNamed && !!f.category && MEAT_CATEGORIES.has(f.category)) || meatCategory || has(MEAT, MEAT_EXCEPT, ...texts) || has(MEAT_DISH, MEAT_EXCEPT, ...texts) || (meatFishCategory && !fish);
  return {
    vegNamed,
    meat,
    fish: fish || (meatFishCategory && !meat),
    pork: has(PORK, MEAT_EXCEPT, ...texts),
    beef: has(BEEF, BEEF_EXCEPT, ...texts),
    animal: contains.includes("milk") || contains.includes("eggs") || (!veganNamed && has(ANIMAL, ANIMAL_EXCEPT, ...label, type, f.ingredients)),
    alcohol: !has(ALCOHOL_FREE, null, ...label) && ((!!f.category && ALCOHOL_CATEGORIES.test(f.category)) || has(ALCOHOL, ALCOHOL_EXCEPT, ...label, type, f.ingredients)),
    halalNamed: has(HALAL, null, ...label),
  };
}

/**
 * A restaurant dish for a pescatarian: its own name names fish or seafood and no meat ("Salmon fillet", "Fish and chips", "Prawn linguine"; never
 * "Chicken and prawn" or "Surf and turf"). Only the name is read, so menus, search and Best for you all give the same answer. Nothing is inferred
 * beyond the words: a dish that doesn't name fish passes only when the restaurant itself marks it vegetarian (menu-view.ts passesDiet).
 */
export function namedPescatarian(name: string): boolean {
  // fish is looked for outside brackets ("Sticky toffee pudding (Seafood Restaurant)"); meat anywhere, so "Salad (add chicken)" never passes
  const main = name.replace(/\([^)]*\)/g, " ");
  return foodSignals({ name: main }).fish && !foodSignals({ name }).meat;
}

/** The first reason the person's diet settings leave this product out, or null when nothing plainly says it doesn't suit. */
export function foodDietProblem(f: FoodFacts, prefs: Preferences): DietProblem | null {
  const avoid = prefs.avoidAllergens ?? [];
  if (avoid.length > 0 && f.allergens !== undefined) {
    if (f.allergens === null) return "allergen";
    const a = f.allergens;
    if (avoid.some((k) => a.contains.includes(k) || a.mayContain.includes(k))) return "allergen";
  }
  if (!prefs.vegetarianOnly && !prefs.veganOnly && !prefs.pescatarianOnly && !prefs.noPork && !prefs.noBeef && !prefs.halalOnly) return null;
  const s = foodSignals(f);
  if (prefs.vegetarianOnly || prefs.veganOnly) {
    if (s.meat) return "meat";
    if (s.fish) return "fish";
  }
  if (prefs.pescatarianOnly && s.meat) return "meat"; // fish and seafood are fine
  if (prefs.veganOnly && s.animal) return "animal";
  if ((prefs.noPork || prefs.halalOnly) && s.pork) return "pork";
  if (prefs.noBeef && s.beef) return "beef";
  if (prefs.halalOnly) {
    if (s.alcohol) return "alcohol";
    if (s.meat && !s.halalNamed) return "notHalal";
  }
  return null;
}

/** Any setting foodDietProblem acts on. */
export const anyFoodDiet = (p: Preferences): boolean =>
  p.vegetarianOnly || p.noPork || p.noBeef || Boolean(p.veganOnly) || Boolean(p.pescatarianOnly) || Boolean(p.halalOnly) || Boolean(p.avoidAllergens?.length);

/** The calm line under a grocery list while the diet filter is on (null when no diet word applies). */
export function foodDietCaution(prefs: Preferences, t: T = englishT): string | null {
  const promises = [prefs.vegetarianOnly && t("vegetarian"), prefs.veganOnly && t("vegan"), prefs.pescatarianOnly && t("pescatarian"), prefs.halalOnly && t("halal"), prefs.noPork && t("pork-free"), prefs.noBeef && t("beef-free")].filter((p): p is string => Boolean(p));
  if (promises.length === 0) return null;
  const what = promises.reduce((a, b) => t("{a} or {b}", { a, b }));
  return t("We go by each product's name, type and label, so this can't promise a product is {what}. Always check the pack.", { what });
}

/** A grocery listing as facts: every shop's own name and ingredients count (they can word the same product differently). */
export function listedFacts(p: Pick<FoodFacts, "name" | "brand" | "category" | "type" | "ingredients" | "allergens"> & { byRetailer?: Record<string, { name: string; ingredients?: string }> }): FoodFacts {
  const own = Object.values(p.byRetailer ?? {});
  const names = [...new Set([p.name, ...own.map((r) => r.name)])].join(" ; ");
  const ingredients = [...new Set([p.ingredients, ...own.map((r) => r.ingredients)].filter((x): x is string => !!x))].join(" ; ");
  return { name: names, brand: p.brand, category: p.category, type: p.type, ingredients: ingredients || undefined, allergens: p.allergens };
}
