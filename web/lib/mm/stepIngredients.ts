// Which step of a recipe's method first uses each ingredient, so the Method tab can show that ingredient's amount under the step (founder 2026-11-16: the steps
// should follow the number of servings). A pantry kind -> the ways a step names it: its label's own words, plus "season" for salt and pepper, "oil" for any oil
// (and "spray" for the oil spray), "spices" for a ground spice and "herbs" for dried herbs. tests/recipeBook.test.ts checks that every ingredient of every recipe
// is named this way in its method, so every ingredient lands under a step.

const SPICES = /\bspices?\b/i;
const SEASON = /(?<!fajita )\bseason(?:ing|ed)?\b/i;
const or = (...res: RegExp[]) => new RegExp(res.map((re) => re.source).join("|"), "i");
export const USED_AS: Record<string, RegExp> = {
  // protein and dairy
  chicken: /\bchicken\b/i, "chicken-thigh": /\bchicken\b/i, "beef-mince": /\bmince\b|\bbeef\b/i, salmon: /(?<!smoked )\bsalmon\b|\bfish\b/i,
  "smoked-salmon": /\bsmoked salmon\b/i, tuna: /\btuna\b/i, eggs: /\beggs?\b(?! noodles)/i, cheddar: /\bcheddar\b|(?<!soft |cottage )\bcheese\b(?! sauce)/i,
  mozzarella: /\bmozzarella\b|(?<!soft |cottage )\bcheese\b(?! sauce)/i, milk: /(?<!coconut )\bmilk\b/i, bacon: /\bbacon\b/i, ham: /\bham\b/i,
  "greek-yogurt": /\byogh?urt\b/i, "natural-yogurt": /\byogh?urt\b/i, "soft-cheese": /\bsoft cheese\b/i, "cottage-cheese": /\bcottage cheese\b/i,
  "oat-drink": /\boat drink\b/i,
  // carbs
  rice: /\brice\b(?! noodles)/i, "pasta-long": /\bpasta\b|\bspaghetti\b|\blinguine\b/i, "pasta-shapes": /\bpasta\b|\bpenne\b|\bfusilli\b/i, noodles: /\bnoodles\b/i,
  "egg-noodles": /\bnoodles\b/i, wraps: /\bwraps?\b|\btortillas?\b/i, oats: /\boats\b/i, naan: /\bnaans?\b/i, "new-potatoes": /\bpotato(?:es)?\b/i,
  "wheat-biscuits": /\bbiscuits?\b/i, granola: /\bgranola\b/i, bread: /\bbread\b/i, "white-bread": /\bbread\b/i,
  // tins and frozen
  "baked-beans": /\bbeans\b/i, chickpeas: /\bchickpeas\b/i, "kidney-beans": /\bbeans\b/i, "chopped-tomatoes": /(?<!cherry |sliced )\btomato(?:es)?\b(?! pur)/i,
  passata: /\bpassata\b/i, sweetcorn: /\bsweetcorn\b/i, peas: /\bpeas\b/i, "coconut-milk": /\bcoconut milk\b/i,
  // sauces, pastes and spreads
  "curry-paste": /\bcurry paste\b/i, "chopped-tomato-puree": /\btomato pur[ée]e\b/i, pesto: /\bpesto\b/i, "light-mayo": /\bmayo(?:nnaise)?\b/i,
  "sweet-chilli": /\bsweet chilli\b/i, "bbq-sauce": /\bbarbecue\b|\bbbq\b/i, salsa: /\bsalsa\b/i, soy: /\bsoy\b/i, honey: /\bhoney\b/i,
  "peanut-butter": /\bpeanut butter\b/i, houmous: /\bhoumous\b/i, "stock-cube": /\bstock\b/i, mustard: /\bmustard\b/i, "fajita-seasoning": /\bfajita seasoning\b/i,
  // oils, seasonings and spices
  "olive-oil": /\boil\b/i, "vegetable-oil": /\boil\b/i, "oil-spray": /\boil\b|\bspray\b/i, salt: or(/\bsalt\b/, SEASON),
  "black-pepper": or(/\bblack pepper\b|\bsalt and pepper\b|\bsalt, pepper\b|\bpepper and salt\b/, SEASON), "mixed-herbs": /\bherbs\b/i,
  "chilli-powder": or(/\bchilli powder\b/, SPICES), paprika: or(/\bpaprika\b/, SPICES), "curry-powder": or(/\bcurry powder\b/, SPICES),
  cinnamon: or(/\bcinnamon\b/, SPICES), oregano: or(/\boregano\b/, /\bherbs\b/), cumin: or(/\bcumin\b/, SPICES), turmeric: or(/\bturmeric\b/, SPICES),
  // festive (Christmas recipes only)
  "turkey-breast": /\bturkey\b/i, "pork-chipolatas": /\bchipolatas?\b|\bsausages?\b/i, "gammon-steaks": /\bgammon\b/i, "brussels-sprouts": /\bsprouts\b/i,
  parsnips: /\bparsnips?\b/i, "red-cabbage": /\bcabbage\b/i, "cooked-chestnuts": /\bchestnuts\b/i, "cranberry-sauce": /\bcranberry sauce\b/i,
  "apple-sauce": /\bapple sauce\b/i, mincemeat: /\bmincemeat\b/i, "dried-cranberries": /\bcranberries\b/i, "mixed-spice": or(/\bmixed spice\b/, SPICES),
  nutmeg: or(/\bnutmeg\b/, SPICES),
  // fresh vegetables and fruit
  onion: /(?<!spring |red )\bonions?\b/i, "red-onion": /(?<!spring )\bonions?\b/i, garlic: /\bgarlic\b/i, "lemon-juice": /\blemon\b/i, carrots: /\bcarrots?\b/i,
  peppers: /(?<!black |white |salt and |salt, |cayenne )\bpeppers?\b(?! and salt)/i, tomatoes: /(?<!cherry |chopped )\btomato(?:es)?\b(?! pur)/i,
  "cherry-tomatoes": /\bcherry tomato(?:es)?\b|\btomatoes\b/i, cucumber: /\bcucumbers?\b/i, lettuce: /\blettuce\b/i, "salad-leaves": /\bleaves\b/i,
  spinach: /\bspinach\b/i, mushrooms: /\bmushrooms?\b/i, broccoli: /\bbroccoli\b/i, "spring-onions": /\bspring onions?\b/i, "stir-fry-veg": /\bvegetables\b/i,
  banana: /\bbananas?\b/i, apple: /\bapples?\b(?! sauce)/i, berries: /\bberries\b/i, raisins: /\braisins\b|\bsultanas\b/i, almonds: /\balmonds\b/i,
};

/** Step index -> the keys of the ingredients that step is the first to name, in the ingredients' own order. A substitute is found by the words of the
 *  ingredient it stands in for (`original`), since the step still names that one. */
export function firstMentions(method: readonly string[], ingredients: ReadonlyArray<{ key: string; pantry?: string; original?: { pantry?: string } }>): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const i of ingredients) {
    const words = USED_AS[i.original?.pantry ?? i.pantry ?? ""];
    if (!words) continue;
    const at = method.findIndex((step) => words.test(step));
    if (at < 0) continue;
    out.set(at, [...(out.get(at) ?? []), i.key]);
  }
  return out;
}
