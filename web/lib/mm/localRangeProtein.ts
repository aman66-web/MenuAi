// The protein foods a typical small shop stocks (founder 2026-11-26, relayed by the desktop session: "use protein powder, tofu, Quorn, edamame and soy drink ...
// we're basing it on what these supermarkets sell: Tesco, Sainsbury's ... if you can find a Sainsbury's local and a Tesco local, throw it in there ... If it's
// something that would only be available at a massive Sainsbury's and not Sainsbury's local, you'll have to leave it out ... You can ignore corner shops").
// Judged exactly as lib/mm/localRange.ts was: every Sainsbury's product the five protein kinds can match (23 on 26 November 2026) was put to three independent
// reviewers ("would a typical Sainsbury's Local usually stock this exact product in this size?"), and a product passes when at least two said yes. Two cloud
// sessions did this on the same day without knowing of each other (branches claude/recipes-wave-2 and claude/iap-checks), and the two panels did not agree on
// every product; when the branches were merged (claude/iap-merge, 26 November 2026) a product is listed here when either panel passed it.
//
// The recipes-wave-2 panel's votes (yes / no):
//   tofu: Cauldron Vegan Tofu Block 396g 3/0; Sainsbury's SO Organic Super Firm 300g, Cauldron Extra Firm 200g, The Tofoo Co. 280g and 450g 0/3
//   quorn: Quorn Vegetarian Chicken Style Pieces 300g 2/1; Quorn Vegan Pieces 280g, Quorn Meat Free Pieces 200g, Quorn Vegetarian Pieces 630g (frozen) 0/3
//   soya-drink: Alpro Soya Plant-Based Chilled 1L 3/0; Sainsbury's Unsweetened Long Life 1L, Sainsbury's Sweetened Long Life 1L, Alpro Soya No Sugar Long
//     Life 1L 2/1; Alpro Soya No Sugar Chilled 1L 1/2; Sainsbury's Unsweetened chilled 1L, Sainsbury's 1+ Years, Alpro Organic Long Life, Plenish chilled
//     and long life 0/3
//   edamame: Sainsbury's Edamame Beans 175g, Yutaka Shelled Edamame 500g (frozen) 0/3
//   whey-protein: Optimum Nutrition Gold Standard 780g and 775g 0/3
// The iap-checks panel passed The Tofoo Co. tofu 280g, Quorn Vegetarian Chicken Style Pieces 300g, Sainsbury's Unsweetened Long Life Soya Drink 1L, Alpro Soya
// chilled 1L and Alpro Soya No Sugar chilled 1L, and said no (all three) to both edamame products and both whey protein tubs.
// Both panels: tofu, Quorn and soya drink can be bought at a small shop; edamame and protein powder can't, so no recipe uses them (pantry.ts PROTEIN_KINDS).
// Quorn's small-shop pack is named "Chicken Style"; a meat-free recipe takes it because lib/mm/recipes.ts MEAT_STYLE_KINDS lets the Quorn kind (only) skip the
// meat-word check when the products' diet rule reads the name as meat-free (claude/iap-checks). So every protein kind has a small-shop product, and the second
// wave's recipes (lib/mm/recipeBook/wave2*.ts) may use all three (SMALL_SHOP_PROTEIN_KINDS; tests/recipesWave2.test.ts checks).

/** Sainsbury's products (lib/mm/localRange.ts LOCAL_RANGE_SHOP) of the protein kinds that at least two of three reviewers, on either panel, said a Sainsbury's Local stocks. */
export const LOCAL_PROTEIN_PRODUCTS: readonly string[] = [
  "alpro-1l-soya-no-sugar-chilled-dairy-free-drink", // iap-checks panel
  "alpro-1l-soya-no-sugar-long-life-dairy-free-drink", // recipes-wave-2 panel
  "alpro-1l-soya-plant-based-chilled-drink", // both
  "cauldron-vegan-tofu-block-396g", // recipes-wave-2 panel
  "quorn-vegetarian-chicken-style-pieces-300g", // both
  "sainsburys-sweetened-long-life-soya-drink-1l", // recipes-wave-2 panel
  "sainsburys-unsweetened-long-life-soya-drink-1l", // both
  "the-tofoo-co-naked-organic-tofu-280g", // iap-checks panel
];

/** The protein kinds (lib/mm/pantry.ts PROTEIN_KINDS) a recipe buys as one of the products above: the ones a recipe may use on top of the everyday kinds. */
export const SMALL_SHOP_PROTEIN_KINDS: ReadonlySet<string> = new Set(["tofu", "quorn", "soya-drink"]);
