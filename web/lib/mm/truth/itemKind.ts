// What kind of thing a menu item is, worked out only from its own name, its menu section and (for two small rules) its calories.
// Used by the "truth" screens (lib/mm/truth/*) so a score, a swap or a "best protein" list never mixes a dish with a dip, a drink or an add-on.
// Nothing here changes the ranking (lib/mm/ranking.ts) or any figure: it only decides which items a screen may compare with each other.

export const ITEM_KINDS = ["main", "kids", "side", "dessert", "sauce", "drink", "addon"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export interface KindInput {
  name: string;
  category: string;
  /** kcal; used only by the two name rules that need a size guess ("Extra …", "… sauce"). */
  calories?: number;
}

// ---- menu sections (lower-cased, whole string). Checked against what the 241 chains really call their sections: tests/truthItemKind.test.ts.

const ADDON_SECTION = /\b(?:add[- ]?ons?|extras?|toppings?|upgrades?|modifiers?|make it a|build your own extras)\b/;
const DRINK_SECTION =
  /\b(?:drinks?|beverages?|coffees?|teas?|lattes?|cappuccinos?|espressos?|americanos?|mochas?|matcha|chai|smoothies?|milk ?shakes?|shakes?|frapp[eé]s?|juices?|sodas?|colas?|lemonades?|refreshers?|fizz|mocktails?|cocktails?|spirits?|liqueurs?|wines?|beers?|lagers?|ciders?|ales?|stouts?|gins?|rums?|whisk(?:e)?ys?|vodkas?|prosecco|champagne|squash|kombucha|cold brew|hot chocolates?|iced|frozen drinks?|freestyle)\b/;
const SAUCE_SECTION = /\b(?:sauces?|dips?|dressings?|condiments?|marinades?|spreads?)\b/;
const KIDS_SECTION = /\b(?:kids?|children'?s?|childrens?|junior|little ones|mini meals?|small people|young ones)\b/;
const DESSERT_SECTION =
  /\b(?:desserts?|puddings?|cakes?|sweets?|sweet treats?|ice[- ]?creams?|sundaes?|cookies?|brownies?|donuts?|doughnuts?|muffins?|pastries|treats|bakery sweets?|waffles?|crepes?|cheesecakes?|gelato|sorbets?|pies? & crumbles?)\b/;
const SAVOURY_SECTION = /\bsavou?ry|savouries\b/;
const SIDE_SECTION = /\b(?:sides?|side orders?|accompaniments?|nibbles|fries|chips|sharing sides?|extra sides?)\b/;

// ---- names (lower-cased)

const ADD_NAME = /^add\b/;
const EXTRA_NAME = /^(?:extra|upgrade to|make it a|swap (?:to|for))\b/;
// A whole-name drink: the drink word, then only a size, a temperature or a bracketed/dashed note ("Latte (oat milk)", "Cappuccino - large", "Latte with oat milk").
// "Mocha brownie" and "Coffee cake" are not drinks: anything else after the drink word makes it a dish.
const DRINK_WORD =
  "(?:latte|cappuccino|flat white|americano|espresso|macchiato|mocha|hot chocolate|smoothie|milk ?shake|lemonade|coca[- ]cola|coke|diet coke|coke zero|pepsi|fanta|sprite|7 ?up|dr pepper|irn[- ]bru|fruit shoot|still water|sparkling water|mineral water|orange juice|apple juice)";
const DRINK_TAIL = "(?:\\s*(?:[(,:\\-–].*|\\d.*|(?:regular|large|small|medium|grande|tall|venti|iced|hot|decaf|cold|double|single)(?:\\s+(?:regular|large|small|medium|iced|hot|decaf))*|(?:made )?with .*))?$";
const DRINK_NAME = new RegExp(`^(?:(?:iced|hot|large|regular|small|medium|decaf|double|single|skinny|mini|cold)\\s+)*${DRINK_WORD}${DRINK_TAIL}`);
const SAUCE_NAME = /\b(?:sauce|dip|dressing|mayo|mayonnaise|ketchup|chutney|relish|gravy)$/;
const SIDE_NAME = /^(?:side\b|(?:skinny |large |regular |small |chunky |curly |sweet potato |cajun |loaded )*(?:fries|chips)$|onion rings$|coleslaw$|garlic bread$|corn on the cob$)/;

/** Largest "Extra …" / "… sauce" that is still an add-on or a sauce by size (kcal): a 500 kcal "Extra Crispy Fillet Burger" is a main. */
const SMALL_KCAL = 350;
const SAUCE_KCAL = 300;

const clean = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The kind of an item. Order matters: an add-on is never a main whatever its section says; a drink is a drink even in "Kids: drinks";
 * kids' dishes stay kids' (so they aren't swapped for adult dishes). Everything that none of the rules names is a main (starters,
 * small plates, sandwiches, pizzas, salads, soups…): a screen that needs "a meal" also checks calories (lib/mm/truth/proteinScore.ts MIN_SCORED_KCAL).
 */
export function itemKind(item: KindInput): ItemKind {
  const name = clean(item.name);
  const cat = clean(item.category);
  const kcal = item.calories;

  if (ADD_NAME.test(name) || (EXTRA_NAME.test(name) && (kcal === undefined || kcal <= SMALL_KCAL))) return "addon";
  if (ADDON_SECTION.test(cat) && !SIDE_SECTION.test(cat)) return "addon";
  if (DRINK_SECTION.test(cat) && !SAVOURY_SECTION.test(cat)) return "drink";
  if (SAUCE_SECTION.test(cat)) return "sauce";
  if (KIDS_SECTION.test(cat) || /^(?:kids?|children'?s?|junior)\b/.test(name)) return "kids";
  if (DESSERT_SECTION.test(cat) && !SAVOURY_SECTION.test(cat)) return "dessert";
  if (SIDE_SECTION.test(cat)) return "side";

  if (DRINK_NAME.test(name)) return "drink";
  if (SAUCE_NAME.test(name) && kcal !== undefined && kcal <= SAUCE_KCAL) return "sauce";
  if (SIDE_NAME.test(name) && (kcal === undefined || kcal <= 650)) return "side";
  return "main";
}

/** True for the kinds a person orders as the meal itself (so a score or a swap may compare them with each other). */
export const isMealKind = (k: ItemKind): boolean => k === "main" || k === "kids";
