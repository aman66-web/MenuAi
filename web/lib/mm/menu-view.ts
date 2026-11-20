import { NEW_ITEM_DAYS } from "./config";
import { dietNameList, foodDietProblem, foodSignals, moreDietsOn, namedPescatarian, type MoreDietKey } from "./foodDiet";
import { englishT, tk, type T } from "./i18n";
import { proteinPer100Cal } from "./nutrients";
import { passesPreferences } from "./ranking";
import { normalizeForSearch } from "./search";
import { ALLERGEN_KEYS, type AllergenKey, type Chain, type MenuItem, type Preferences } from "./types";

// SPEC §7.4: sort, filter and tags on the chain page.

export type SortKind = "menu" | "protein" | "calories" | "density";

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKind; label: string }> = [
  { value: "menu", label: tk("Menu order") },
  { value: "protein", label: tk("Most protein") },
  { value: "calories", label: tk("Fewest calories") },
  { value: "density", label: tk("Most protein per 100 kcal") },
];

const byName = (a: MenuItem, b: MenuItem) => a.name.localeCompare(b.name, "en-US");

/** Sorting flattens categories. Ties always break by name so the order is stable. "menu" keeps data order. */
export function sortItems(items: readonly MenuItem[], kind: SortKind): MenuItem[] {
  const list = [...items];
  switch (kind) {
    case "menu":
      return list;
    case "protein":
      return list.sort((a, b) => (b.nutrients.protein ?? 0) - (a.nutrients.protein ?? 0) || byName(a, b));
    case "calories":
      return list.sort((a, b) => a.nutrients.calories - b.nutrients.calories || byName(a, b));
    case "density":
      return list.sort((a, b) => proteinPer100Cal(b.nutrients) - proteinPer100Cal(a.nutrients) || byName(a, b));
  }
}

export function filterItems(items: readonly MenuItem[], prefs: Preferences): MenuItem[] {
  return items.filter((i) => passesDiet(i, prefs));
}

const VEGAN_WORDS = /\bvegan\b|plant[\s-]?based/i;

/**
 * The dish's own name or its menu section says vegan or plant-based (what the restaurant prints; nothing inferred). A section counts only when every part
 * of its name does ("Plant-based burgers"), never when it mixes in other food ("Chicken & plant-based" holds the chicken wraps too).
 */
export function isNamedVegan(item: Pick<MenuItem, "name" | "category">): boolean {
  if (VEGAN_WORDS.test(item.name)) return true;
  const parts = sectionParts(item.category ?? "");
  return parts.length > 0 && parts.every((part) => VEGAN_WORDS.test(part));
}

/** True when an allergen filter is on and the guide lists none of those allergens for this dish ("may contain" counts too). */
export function freeOfAllergens(item: Pick<MenuItem, "allergens">, avoid: readonly string[] | undefined): boolean {
  if (!avoid || avoid.length === 0) return true;
  const a = item.allergens;
  if (!a) return false; // no allergen information: we can't say it's free of anything
  return !avoid.some((k) => (a.contains as readonly string[]).includes(k) || (a.mayContain as readonly string[]).includes(k));
}

/** Every diet and allergy filter the user has on (vegetarian, no pork/beef, vegan, allergens). Halal is chain-level (lib/mm/halal.ts). */
export function passesDiet(item: MenuItem, prefs: Preferences): boolean {
  if (!passesPreferences(item.tags, prefs)) return false;
  if (prefs.veganOnly && !isNamedVegan(item)) return false;
  if (prefs.pescatarianOnly && !isPescatarianDish(item)) return false;
  return freeOfAllergens(item, prefs.avoidAllergens);
}

/**
 * Pescatarian: the restaurant marks the dish vegetarian, or the dish's own name names fish or seafood and no meat (and the restaurant
 * hasn't tagged it as containing pork or beef). Nothing else is guessed, like the vegetarian and vegan filters.
 */
export function isPescatarianDish(item: Pick<MenuItem, "name" | "tags">): boolean {
  if (item.tags.includes("vegetarian")) return true;
  return !item.tags.includes("contains_pork") && !item.tags.includes("contains_beef") && namedPescatarian(item.name);
}

/**
 * Which of the person's choices a restaurant's own data can't check (founder 2026-11-17: "I've clicked on restaurants, but I can't see any of the actual
 * food items"). The vegetarian, pescatarian and vegan filters follow what the restaurant marks; 39 restaurants mark no dish vegetarian and most name no
 * dish vegan, so for them those filters left an empty menu. For such a restaurant (and, likewise, one with no allergen details at all) the menu is shown
 * with only the dishes whose own name or menu section plainly says otherwise left out (lib/mm/foodDiet.ts word rules and NAMED_ALLERGEN below), and the
 * page says the rest aren't checked. Nothing is ever inferred the other way: a dish left in is not promised to suit.
 */
export interface UncheckedDiet {
  /** Vegetarian or pescatarian is on and the restaurant marks no dish vegetarian. */
  vegetarian: boolean;
  /** Vegan is on and the restaurant names no dish vegan or plant-based. */
  vegan: boolean;
  /** An allergy is set and the restaurant publishes no allergen details we can read. */
  allergies: boolean;
  /** The restaurant's vegetarian marks count (at least 1 dish in 20 is marked), so by its own marks an unmarked dish isn't vegetarian, and so isn't vegan. */
  vegetarianMarks: boolean;
}

export function uncheckedDiet(items: readonly Pick<MenuItem, "tags" | "name" | "category" | "allergens">[], prefs: Preferences): UncheckedDiet {
  // fewer than 1 dish in 20 marked vegetarian means the guide doesn't really mark them (Greggs marks 1 of 263): those marks are kept, the rest go by name
  const vegetarianMarks = items.filter((i) => i.tags.includes("vegetarian")).length >= items.length / 20;
  return {
    vegetarian: (prefs.vegetarianOnly || Boolean(prefs.pescatarianOnly)) && !vegetarianMarks,
    vegan: Boolean(prefs.veganOnly) && !items.some(isNamedVegan),
    allergies: Boolean(prefs.avoidAllergens?.length) && !items.some((i) => i.allergens),
    vegetarianMarks,
  };
}

export const anyUnchecked = (u: UncheckedDiet): boolean => u.vegetarian || u.vegan || u.allergies;

// Fish and roe named as a sushi menu names them ("Maguro Nigiri", "Hiramasa Ceviche", "Inari Ikura Nigiri"); "shake" and "sake" are salmon only before a
// sushi word ("Shake Nigiri", "Shake Yaki Nigiri"), never a drink ("Vanilla Shake", "Tims® Shake Brownie"). Seafood words are in crustaceans and molluscs below.
const JAPANESE_FISH = String.raw`\b(?:maguro|akami|toro|hamachi|hiramasa|unagi|anago|saba|ikura|tobiko|masago)\b|\b(?:shake|sake)(?=\s+(?:yaki|new york|nigiri|sashimi|tataki|maki|hosomaki|uramaki|futomaki|temaki|aburi|a[iï]oli|teriyaki|carpaccio|tartare|ceviche|poke|don|donburi|kaburi)\b)`;
// A dish whose own name names a food from that allergen group (used only where the restaurant publishes no allergen details, and only to leave dishes out).
const NAMED_ALLERGEN: Partial<Record<AllergenKey, RegExp>> = {
  fish: new RegExp(String.raw`\b(?:fish|fishcakes?|salmon|tuna|cod|haddock|pollock|hake|plaice|sole|sea ?bass|bream|mackerel|sardines?|anchov(?:y|ies)|trout|kippers?|basa|swordfish|halibut|kedgeree|eels?|yellowtail|surimi|crabsticks?)\b|${JAPANESE_FISH}`, "i"),
  crustaceans: /\b(?:prawns?|shrimps?|crabs?|crabsticks?|lobsters?|langoustines?|crayfish|scampi|ebi|kani)\b/i,
  molluscs: /\b(?:mussels?|squid|calamari|octopus|clams?|scallops?|cockles?|whelks?|hotate|ika|tako|takoyaki)\b|\boysters?\b(?!\s+mushrooms?)/i,
  milk: /\b(?:milk|milkshakes?|cheese|cheesy|cheeseburgers?|cheesecakes?|cream|creamy|creamed|butter|buttery|buttered|buttermilk|yogh?urts?|mozzarella|cheddar|parmesan|halloumi|feta|paneer|lattes?|cappuccinos?|flat whites?|mochas?|custard|brie|camembert|mascarpone|ricotta|gouda|raita|macchiato)\b/i,
  eggs: /\b(?:eggs?|omelett?es?|mayo|mayonnaise|meringues?|frittatas?|benedict|aioli|carbonara|tamago)\b/i,
  peanuts: /\b(?:peanuts?|satay)\b/i,
  nuts: /\b(?:almonds?|cashews?|hazelnuts?|walnuts?|pecans?|pistachios?|macadamias?|nuts?|praline|frangipane|marzipan|nutella|pesto)\b/i,
  sesame: /\b(?:sesame|tahini|houmous|hummus|humous)\b/i,
  soya: /\b(?:soya|soy|tofu|edamame|miso|teriyaki|tempeh)\b/i,
  mustard: /\bmustard\b/i,
  celery: /\b(?:celery|celeriac)\b/i,
  lupin: /\blupin\b/i,
  gluten: /\b(?:bread|breaded|buns?|baguettes?|paninis?|toasties?|toast|sandwich(?:es)?|wraps?|pasta|spaghetti|penne|lasagne|pizzas?|noodles?|ramen|udon|pies?|pastry|pastries|croissants?|muffins?|cakes?|cheesecakes?|cookies?|biscuits?|brownies?|doughnuts?|donuts?|bagels?|crumpets?|scones?|waffles?|pancakes?|batter|battered|tempura|croutons?|wheat|barley|rye|couscous|naan|pittas?|flatbreads?|crackers?|wafers?|crumble|subs?|burgers?|nuggets?|katsu|gyoza|dumplings?|churros?|tarts?|rolls?|oats?|oaty|oatmeal|porridge|flapjacks?|granola|muesli)\b/i,
};
// The name says it is the free-from version of a food from ONE allergen group ("Vegan mayo" for eggs, "Gluten-free bun" for gluten).
// Each word clears only its own group: an almond is still a nut in a "Vegan Almond Croissant", and oats are a gluten cereal.
const FREE_FROM: Partial<Record<AllergenKey, RegExp>> = {
  milk: /\b(?:vegan|plant[\s-]?based|dairy[\s-]?free|milk[\s-]?free)\b/i,
  eggs: /\b(?:vegan|plant[\s-]?based|egg[\s-]?free)\b/i,
  gluten: /\bgluten[\s-]?free\b/i,
  nuts: /\bnut[\s-]?free\b/i,
};
// A plant milk named as the milk ("Oat milk latte", "Soya latte", "Coconut milk curry"). Hazelnut, almond or coconut before "latte" or "mocha" is a flavour,
// so only oat and soya are read that way; "Hazelnut milk chocolate" is milk chocolate. Such a drink's milk words are then the plant milk's, but any other
// dairy word in the name still counts ("Oat Milk Hot Chocolate with Whipped Cream").
const PLANT_MILK = /\b(?:oat|soya|soy|almond|coconut|rice|cashew|hazelnut|pea)[\s-]?(?:milk|drink)\b(?!\s+choc)/gi;
const MILK_DRINKS = "(?:chai lattes?|lattes?|flat whites?|cappuccinos?|mochas?|macchiatos?|hot chocolates?)";
const PLANT_DRINK = new RegExp(`\\b(?:oat|soya|soy)\\s+${MILK_DRINKS}\\b`, "i");
const MILK_DRINK_WORDS = new RegExp(`\\b${MILK_DRINKS}\\b`, "gi");
const namesPlantMilk = (name: string): boolean => PLANT_DRINK.test(name) || new RegExp(PLANT_MILK.source, "i").test(name);
const milkLeft = (text: string): string => text.replace(PLANT_MILK, " ").replace(MILK_DRINK_WORDS, " ");

/** True when the dish's own name or section names a food from one of these allergen groups (never a promise the dish is free of anything). */
export function namesAllergen(item: { name: string; category?: string | null }, avoid: readonly AllergenKey[]): boolean {
  const text = `${item.name} ${item.category ?? ""}`;
  return avoid.some((k) => {
    const re = NAMED_ALLERGEN[k];
    if (!re || !re.test(text)) return false;
    if (FREE_FROM[k]?.test(item.name)) return false;
    if (k === "milk" && namesPlantMilk(item.name)) return re.test(milkLeft(text));
    return true;
  });
}

/**
 * The restaurant page's menu rule: passesDiet, except that a choice the restaurant's own data can't check (uncheckedDiet) leaves out only the dishes whose
 * own name or menu section, or its own pork and beef tags, plainly say otherwise. Best for you never ranks such a restaurant's dishes for that choice
 * (app/app/chain/ChainScreen.tsx shows "can't pick" instead): it recommends, so it never suggests a dish it can't check.
 */
export function passesMenuDiet(item: MenuItem, prefs: Preferences, unchecked: UncheckedDiet): boolean {
  // the menu section ("Chicken", "Beef burgers") is read like a product type: its words count, "Vegetarian" or "Vegan" sections mark a meat-free dish
  // ("Chicken & plant-based" still says chicken: a meat-free word in a section clears its dishes only when the whole section is meat-free, and the
  // section's meat words don't count against a dish whose own name says it is meat-free, the "Spicy Bean Burger" in that section)
  const section = MEAT_FREE_DISH.test(item.name) ? "" : sectionForDiet(item.category ?? "");
  const named = { name: nameForMeat(item.name), ...(section ? { type: section } : {}) };
  const strict: Preferences = {
    ...prefs,
    vegetarianOnly: prefs.vegetarianOnly && !unchecked.vegetarian,
    pescatarianOnly: Boolean(prefs.pescatarianOnly) && !unchecked.vegetarian,
    veganOnly: Boolean(prefs.veganOnly) && !unchecked.vegan,
    avoidAllergens: unchecked.allergies ? [] : prefs.avoidAllergens,
  };
  if (!passesDiet(item, strict)) return false;
  // a restaurant that marks its vegetarian dishes but names none vegan: by its own marks an unmarked dish isn't vegetarian, so it isn't vegan either
  if (unchecked.vegan && unchecked.vegetarianMarks && !item.tags.includes("vegetarian")) return false;
  if (unchecked.vegetarian && prefs.vegetarianOnly && foodDietProblem(named, { ...NO_DIET, vegetarianOnly: true })) return false;
  if (unchecked.vegetarian && prefs.pescatarianOnly && foodDietProblem(named, { ...NO_DIET, pescatarianOnly: true })) return false;
  if (unchecked.vegetarian || unchecked.vegan) {
    // the restaurant's own data says pork or beef: never shown as fitting a vegetarian, pescatarian or vegan, whatever the name
    if (item.tags.includes("contains_pork") || item.tags.includes("contains_beef")) return false;
    // a dish the restaurant itself marks vegetarian has no meat, whatever its section or name ("Korean Fried Chick+n" in "Burgers"); not for a vegan at a
    // menu that names no dish vegan: a vegetarian mark says nothing about dairy or eggs, so there the burger, wings or chick'n name still counts
    const markedVegetarian = item.tags.includes("vegetarian") && !unchecked.vegan;
    const category = item.category ?? "";
    if (!markedVegetarian && (RESTAURANT_MEAT.test(nameForMeat(item.name)) || (meatSection(category) && !SECTION_EXTRAS.test(item.name)))) {
      const sig = foodSignals({ name: item.name });
      // "Veggie Burger", "Plant-based Whopper", "Spicy Bean" (in a "Burgers" section) stay; for a pescatarian, so does a fish burger
      const meatFree = sig.vegNamed || isNamedVegan(item) || MEAT_FREE_DISH.test(item.name) || MEAT_FREE_NAME.test(item.name) || (!unchecked.vegan && VEGETARIAN_MARK.test(item.name))
        || meatFreeSection(category) || (prefs.pescatarianOnly && sig.fish)
        // "Chick'n" is how many menus spell a plant-based one: kept when the only meat word is that spelling and the section says vegan or plant-based
        || (chicknOnly(item.name) && !meatSection(category) && VEGAN_SECTION_WORD.test(category));
      if (!meatFree) return false;
    }
    // fish or seafood named in other words: a vegetarian (where the restaurant doesn't mark dishes) and a vegan leave it out; a pescatarian keeps it
    const fishOut = (unchecked.vegetarian && prefs.vegetarianOnly) || unchecked.vegan;
    if (fishOut && !markedVegetarian && RESTAURANT_FISH.test(item.name) && !(foodSignals({ name: item.name }).vegNamed || isNamedVegan(item) || MEAT_FREE_DISH.test(item.name))) return false;
    if (unchecked.vegan && RESTAURANT_EGG.test(item.name) && !isNamedVegan(item)) return false;
  }
  if (unchecked.vegan && foodDietProblem(named, { ...NO_DIET, veganOnly: true })) return false;
  if (unchecked.allergies && namesAllergen(item, prefs.avoidAllergens ?? [])) return false;
  return true;
}

const NO_DIET: Preferences = { vegetarianOnly: false, noPork: false, noBeef: false };
// On a restaurant menu these dishes (or a menu section named after them: a Whopper sits in "Burgers") are meat unless their name says otherwise
// ("Cheeseburger", "Kids Nuggets", "Hot Dog", "8oz Sirloin", "Tenders x 3"): used only to leave dishes out. A sweet "Mince Pie" is not mince.
// "Boneless Bites", "Pretzel Dog", "Chicken Gyros", "Scotch Pie" and "Kids Meal – Strips" too; strips of a vegetable or bread ("Pepper & Cucumber Strips")
// aren't, nor is a "Rock dog" (dogfish, a chip shop's rock salmon).
// A burger or kebab inside a longer word ("Yumburger", "Burgersteak", "Just Kebabin'"), a bites dish named by its flavour ("BBQ Bites Meal Box"; "Garlic
// Dough Bites" and "Spicy Cauliflower Bites" aren't), and chicken or pork as a Japanese or Chinese menu names it ("Karaage", "Yakitori", "Char siu"; a
// "Tonkatsu BBQ" sauce or dressing isn't).
// "Chick'n", "Chick n Rice", "Thic Chick", "Chickadee" are chicken; a chickpea, "No Chick'n", "Chickisn't" and an "Easter Chick" biscuit aren't.
const CHICK_SPELLING = String.raw`(?<!\b(?:no|easter)[\s-])\bchick(?!en|pea|isn|less)(?![\s-]+peas?\b)\w*`;
const RESTAURANT_MEAT_WORDS = String.raw`\b(?:\w*burgers?\w*|nuggets?|mcnuggets|hot ?dogs?|(?<!\brock\s)dogs?|\w*kebabs?\w*|(?:bbq|spicy|southern[\s-]fried)\s+bites|karaage|kara-age|yakitori|chashu|char siu|gyudon|tonkatsu(?!\s+(?:bbq|sauce|dressing))|meatballs?|wings?|pepperoni|tenders?(?!\s+stems?\b)|boneless|gyros?|scotch pies?|sirloin|rump|rib[\s-]?eye|(?<!\bcorn\s)ribs?|wagyu|t[\s-]?bone|tomahawk|chateaubriand|porterhouse|picanha|savoury mince|pigs?|pig's|cheesesteaks?|mixed grill|\w+chicken\w*|chi?kn|(?:traditional|cornish|christmas|dinner)\s+past(?:y|ies)|(?<!\b(?:onion|potato|veg|vegetable|sage|stuffing)\s)patt(?:y|ies)|(?<!\b(?:pepper|peppers|cucumber|carrot|potato|courgette|tomato|tortilla|pitta|onion|celery|apple|mango|fruit|liquorice|pastry)\s)strips?)\b|\bmince\b(?!\s+pies?\b)|\bmeat(?![\s-]?free|less)\w*|\bchicken(?!less)\w+`;
const RESTAURANT_MEAT = new RegExp(`${RESTAURANT_MEAT_WORDS}|${CHICK_SPELLING}`, "i");
const RESTAURANT_MEAT_BUT_CHICK = new RegExp(RESTAURANT_MEAT_WORDS, "i");
const CHICK_RE = new RegExp(CHICK_SPELLING, "i");
// the name's only meat word is a "Chick'n" spelling
const chicknOnly = (name: string): boolean => CHICK_RE.test(name) && !RESTAURANT_MEAT_BUT_CHICK.test(name) && !foodSignals({ name }).meat;
// "Tomato chutney (burger add-on)", "Curry Topping for Hot Dog", "Hot Dog Bun": the burger or hot dog is what the extra goes on, not the dish (read this way
// by the name rule below and by the vegetarian word rules, foodDietProblem)
const EXTRA_FOR = /\b(?:burger|hot ?dog)\s+(?:add[\s-]?ons?|toppings?|relish|sauces?|buns?|rolls?)\b|\btoppings?\s+for\s+(?:a\s+)?(?:burgers?|hot ?dogs?)\b/gi;
const nameForMeat = (name: string): string => name.replace(EXTRA_FOR, " ");
const VEGAN_SECTION_WORD = /\b(?:vegan|plant[\s-]?based|meat[\s-]?free|cluckless|vegetarian|veggie)\b/i;
// A section is read as meat only when every part of its name is ("Burgers", "Wings and strips", "Hot dog combinations"), never when it lists other foods
// too ("Pretzels, nuggets & stix", "Ciabattas, wraps & lunch burger") or holds the extras ("Burger add-ons").
const SECTION_MEAT = /\b(?:\w*burgers?\w*|hot ?dogs?|\w*kebabs?\w*|wings?|tenders?|strips)\b/i;
const SECTION_EXTRAS = /\b(?:add[\s-]?ons?|extras?|toppings?|sides?|sauces?|dips?|drinks?|parts)\b/i;
const sectionParts = (category: string): string[] => category.split(/\s*(?:,|&|\band\b|\/)\s*/i).filter(Boolean);
const meatSection = (category: string): boolean =>
  !SECTION_EXTRAS.test(category) && sectionParts(category).every((part) => SECTION_MEAT.test(part));
// Meat-free versions a menu names by their own words or brand ("Cluckless Tenders", "McPlant", "BBQ Beyond", "Spicy Bean", "Halloumi Burger", a "Vegetarian burgers" section).
const MEAT_FREE_DISH = /\b(?:veggie|vegetarian|vegan|plant[\s-]?based|meat[\s-]?free|cluckless|mcplant|beyond|quorn|tofu|bean|vegetable|halloumi|paneer|falafel)\b/i;
// For the burger, wings and chick'n name rule only (the section's own words still count): a "Plant Burger", Nando's "Beanie Patty", cauliflower wings,
// and the restaurant's own "(VE)" or "(VG)" mark; its "(V)" mark too, except for a vegan (like its vegetarian tag, it says nothing about dairy or eggs).
const MEAT_FREE_NAME = /\b(?:plant|beanie|cauliflower\s+(?:wings?|bites?|karaage)|(?:veggie|vegan|bean|plant|tofu|quorn|falafel)burgers?)\b|\((?:ve|vg)\)/i;
// Fish, seafood and roe named in other words (a sushi menu's "Ebi Nigiri", "Kani Korokke"; "Eel", "Yellowtail", "Crabstick"): left out for a vegetarian or
// vegan where the restaurant doesn't mark its dishes, never for a pescatarian. "Tamago" (egg) is left out for a vegan.
const RESTAURANT_FISH = new RegExp(String.raw`\b(?:ebi|kani|hotate|ika|tako|takoyaki|eels?|yellowtail|surimi|crabsticks?)\b|${JAPANESE_FISH}`, "i");
const RESTAURANT_EGG = /\btamago\b/i;
const VEGETARIAN_MARK = /\(v\)/i;
const meatFreeSection = (category: string): boolean => {
  const parts = sectionParts(category);
  return parts.length > 0 && parts.every((part) => MEAT_FREE_DISH.test(part));
};
// The section as the word rules should read it: whole if it is wholly meat-free ("Vegetarian burgers"), otherwise without its meat-free words.
// In a section of extras ("Burger add-ons", "Burger & hot dog parts") the burger or hot dog is what the extras go on, so those two words are dropped too.
const sectionForDiet = (category: string): string => {
  if (meatFreeSection(category)) return category;
  const words = category.replace(new RegExp(MEAT_FREE_DISH.source, "gi"), " ");
  return (SECTION_EXTRAS.test(category) ? words.replace(/\b(?:\w*burgers?|hot ?dogs?)\b/gi, " ") : words).replace(/\s+/g, " ").trim();
};

export const anyDietFilter = (p: Preferences): boolean =>
  p.vegetarianOnly || p.noPork || p.noBeef || Boolean(p.veganOnly) || Boolean(p.pescatarianOnly) || Boolean(p.avoidAllergens?.length);

/**
 * The chain as Best for you should see it with the extra filters (vegan, allergens) applied: dishes that fail are removed,
 * and so are ready-made combinations built on them (or with no single base dish to check). The ranking itself is unchanged.
 */
export function chainForDiet(chain: Chain, prefs: Preferences): Chain {
  const extra = Boolean(prefs.veganOnly) || Boolean(prefs.pescatarianOnly) || Boolean(prefs.avoidAllergens?.length);
  if (!extra) return chain;
  const items = chain.items.filter((i) => passesDiet(i, prefs));
  const kept = new Set(items.map((i) => i.id));
  return { ...chain, items, combinations: chain.combinations.filter((c) => c.baseItemId !== null && kept.has(c.baseItemId)) };
}

/** "New" for 30 days after addedOn (a date, interpreted at local midnight). */
export function isNewItem(item: Pick<MenuItem, "addedOn">, now: Date, days = NEW_ITEM_DAYS): boolean {
  if (!item.addedOn) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.addedOn);
  if (!m) return false;
  // whole calendar days on the phone's own calendar, so a clock change (an hour shorter or longer day) never moves the cut-off
  const added = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const ageDays = Math.round((today - added) / 86_400_000);
  return ageDays >= 0 && ageDays <= days;
}

export interface MenuSection {
  category: string;
  items: MenuItem[];
}

/** Items grouped by category in the chain's category order (empty categories dropped). */
export function groupByCategory(chain: Pick<Chain, "categories">, items: readonly MenuItem[]): MenuSection[] {
  return chain.categories
    .map((category) => ({ category, items: items.filter((i) => i.category === category) }))
    .filter((s) => s.items.length > 0);
}

/**
 * Search within one menu: every word of the query must start a word of the item's name or category ("chick wrap" finds
 * "Chicken Wrap"; "latte" finds "Iced Latte"). Same normalising as the app-wide search. Keeps the given order.
 */
export function searchItems(items: readonly MenuItem[], query: string): MenuItem[] {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const hay = ` ${normalizeForSearch(`${item.name} ${item.category}`)}`;
    return words.every((w) => hay.includes(` ${w}`));
  });
}

/** Menus longer than this open with each section trimmed to its first few items (tap to show the rest). */
export const LARGE_MENU_ITEMS = 120;
export const SECTION_PREVIEW_ITEMS = 6;

/**
 * The six diets added on 20 November 2026 (Jain, No onion or garlic, Kosher style, No red meat, No alcohol, No halal or kosher meat; lib/mm/foodDiet.ts
 * MORE_DIET_KEYS) can't be checked on a restaurant's menu: menus print no ingredients. No dish is hidden or picked for them (passesDiet ignores them, and
 * anyDietFilter doesn't count them), and the restaurant pages and menu filters say so plainly with this line. Null when none of them is on.
 */
export function restaurantDietNote(prefs: Preferences, t: T = englishT): string | null {
  const on = moreDietsOn(prefs);
  return on.length ? t("Restaurant menus don't list ingredients, so dishes aren't checked for {diets}.", { diets: dietNameList(on, t) }) : null;
}

/**
 * The one calm line shown wherever a diet filter is on: the filters only know what each restaurant's guide states, so
 * they can't promise anything (matters for halal and vegetarian users), and the diets a menu can't be checked for are named (restaurantDietNote).
 * Null when no filter is on.
 */
export function filterCaution(prefs: Preferences, t: T = englishT): string | null {
  const promises = [prefs.vegetarianOnly && t("vegetarian"), prefs.veganOnly && t("vegan"), prefs.pescatarianOnly && t("pescatarian"), prefs.noPork && t("pork-free"), prefs.noBeef && t("beef-free")].filter((p): p is string => Boolean(p));
  const allergy = prefs.avoidAllergens?.length
    ? t("Allergy filters use each restaurant's own allergen guide and hide dishes it doesn't cover. If you have an allergy, always check with the restaurant.")
    : null;
  const unchecked = restaurantDietNote(prefs, t);
  const diet = promises.length ? t("We only know what each restaurant publishes, so this can't promise a dish is {what}.", { what: promises.reduce((a, b) => t("{a} or {b}", { a, b })) }) : null;
  const lines = [diet, unchecked, allergy].filter((x): x is string => Boolean(x));
  return lines.length ? lines.join(" ") : null;
}

/** The preferences with one allergen added or taken off, kept in the app's order (none left = the field is dropped, as if it was never set). */
export function toggleAllergen(prefs: Preferences, key: AllergenKey): Preferences {
  const avoid = prefs.avoidAllergens ?? [];
  const next = avoid.includes(key) ? avoid.filter((a) => a !== key) : [...avoid, key];
  const sorted = ALLERGEN_KEYS.filter((a) => next.includes(a));
  const { avoidAllergens: _drop, ...rest } = prefs; // eslint-disable-line @typescript-eslint/no-unused-vars
  return sorted.length ? { ...rest, avoidAllergens: sorted } : rest;
}

export type DietKey = "vegetarianOnly" | "veganOnly" | "pescatarianOnly" | "halalOnly" | "noPork" | "noBeef" | MoreDietKey;

/**
 * One diet choice turned on or off. Pescatarian and Vegetarian/Vegan are alternatives (the vegetarian rule is stricter and wins, so having both on
 * would only look as if fish dishes were allowed): turning one on turns the other off. Vegan and Vegetarian can stay on together.
 */
export function toggleDiet(prefs: Preferences, key: DietKey): Preferences {
  const next: Preferences = { ...prefs, [key]: !prefs[key] };
  if (next[key] && key === "pescatarianOnly") {
    next.vegetarianOnly = false;
    next.veganOnly = false;
  }
  if (next[key] && (key === "vegetarianOnly" || key === "veganOnly")) next.pescatarianOnly = false;
  return next;
}
