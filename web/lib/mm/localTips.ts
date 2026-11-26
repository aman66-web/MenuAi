import { tk } from "./i18n";
import { LOCAL_SHOP_PRODUCTS } from "./localRange";

// What to look for in a small shop (a Sainsbury's Local, a Tesco Express, a Co-op) when the product a recipe shows is one a typical small shop doesn't stock
// (founder 2026-11-17: "all the ingredients should be able to be found there"). For these ingredients the small shops' everyday packs either aren't on the
// Sainsbury's list or carry a label we can't use (Sainsbury's own rice, pasta and eggs print cooked figures), so the recipe's numbers come from the product
// shown and this line says what to buy instead. Plain words only: no numbers, nothing about health. tests/localRange.test.ts checks every recipe ingredient
// is either a small-shop product or has a tip here.
export const LOCAL_TIPS: Readonly<Record<string, string>> = {
  rice: tk("any bag of basmati or long-grain rice"),
  cinnamon: tk("any jar of ground cinnamon"),
  "pasta-long": tk("any bag of spaghetti"),
  "pasta-shapes": tk("any bag of penne or fusilli"),
  eggs: tk("a box of free-range eggs"),
  "lemon-juice": tk("Jif lemon juice, or a fresh lemon"),
  "oil-spray": tk("any sunflower or olive oil spray"),
  berries: tk("fresh berries, or a small bag of frozen mixed berries"),
  broccoli: tk("a head of broccoli"),
  "chicken-thigh": tk("any pack of boneless chicken thighs"),
  bacon: tk("any pack of back bacon or bacon medallions"),
  granola: tk("any granola"),
  "cottage-cheese": tk("any tub of cottage cheese"),
  almonds: tk("any small bag of almonds"),
  "light-mayo": tk("any light mayonnaise"),
  naan: tk("any pack of plain naan"),
  bread: tk("any medium sliced wholemeal loaf"),
  lettuce: tk("an iceberg lettuce or a bag of shredded lettuce"),
  turmeric: tk("a jar of ground turmeric"),
  nutmeg: tk("a jar of ground nutmeg"),
  "mixed-spice": tk("a jar of ground mixed spice"),
  // Christmas recipes (shown 1 November to 6 January): small shops stock these mainly in that season
  "turkey-breast": tk("turkey breast steaks or fillets, in the weeks before Christmas"),
  "cranberry-sauce": tk("any small jar of cranberry sauce, from November"),
  "pork-chipolatas": tk("any pack of pork chipolatas, in the weeks before Christmas"),
  "red-cabbage": tk("a red cabbage, in the weeks before Christmas"),
  "gammon-steaks": tk("any pack of gammon steaks"),
  "apple-sauce": tk("any small jar of apple sauce"),
  "cooked-chestnuts": tk("a small pack of cooked chestnuts, in December"),
  "dried-cranberries": tk("any small bag of dried cranberries"),
  mincemeat: tk("a jar of mincemeat, in November and December"),
};

/** The small-shop tip for an ingredient whose shown product a typical small shop doesn't stock; null when the product is a small-shop one or there's no tip. */
export function localTipFor(kind: string | undefined, productId: string): string | null {
  if (LOCAL_SHOP_PRODUCTS.has(productId)) return null;
  return (kind && LOCAL_TIPS[kind]) || null;
}
