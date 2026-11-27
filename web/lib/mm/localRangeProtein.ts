// The protein foods a typical small shop stocks (founder 2026-11-26, relayed by the desktop session: "use protein powder, tofu, Quorn, edamame and soy drink ...
// we're basing it on what these supermarkets sell: Tesco, Sainsbury's ... if you can find a Sainsbury's local and a Tesco local, throw it in there ... If it's
// something that would only be available at a massive Sainsbury's and not Sainsbury's local, you'll have to leave it out ... You can ignore corner shops").
// Judged exactly as lib/mm/localRange.ts was: every Sainsbury's product the five protein kinds can match (23 on 26 November 2026) was put to three independent
// reviewers ("would a typical Sainsbury's Local usually stock this exact product in this size?"), and a product is listed only when at least two said yes.
//
// The 23 and the votes (yes / no):
//   tofu: Cauldron Vegan Tofu Block 396g 3/0; Sainsbury's SO Organic Super Firm 300g, Cauldron Extra Firm 200g, The Tofoo Co. 280g and 450g 0/3
//   quorn: Quorn Vegetarian Chicken Style Pieces 300g 2/1; Quorn Vegan Pieces 280g, Quorn Meat Free Pieces 200g, Quorn Vegetarian Pieces 630g (frozen) 0/3
//   soya-drink: Alpro Soya Plant-Based Chilled 1L 3/0; Sainsbury's Unsweetened Long Life 1L, Sainsbury's Sweetened Long Life 1L, Alpro Soya No Sugar Long
//     Life 1L 2/1; Alpro Soya No Sugar Chilled 1L 1/2; Sainsbury's Unsweetened chilled 1L, Sainsbury's 1+ Years, Alpro Organic Long Life, Plenish chilled
//     and long life 0/3
//   edamame: Sainsbury's Edamame Beans 175g, Yutaka Shelled Edamame 500g (frozen) 0/3
//   whey-protein: Optimum Nutrition Gold Standard 780g and 775g 0/3
// So tofu and soya drink can be bought at a small shop; edamame and protein powder can't. Quorn's small-shop pack can't be used either, as things stand: its
// name says "Chicken Style", and a meat-free recipe never takes a product whose name names a meat (lib/mm/recipes.ts namesMeatOrFish, from foodDiet.ts
// foodSignals), so every meat-free recipe with Quorn buys Quorn Vegan Pieces, which no reviewer said a Local stocks. Reading "vegetarian chicken style" as
// meat-free is a change to the shared diet signals (restaurant menus use them too), not made here. Recipes written from 26 November on (wave 2,
// lib/mm/recipeBook/wave2*.ts) therefore use only tofu and soya drink (SMALL_SHOP_PROTEIN_KINDS; tests/recipesWave2.test.ts checks).

/** Sainsbury's products (lib/mm/localRange.ts LOCAL_RANGE_SHOP) of the protein kinds that at least two of three reviewers said a Sainsbury's Local stocks. */
export const LOCAL_PROTEIN_PRODUCTS: readonly string[] = [
  "alpro-1l-soya-no-sugar-long-life-dairy-free-drink",
  "alpro-1l-soya-plant-based-chilled-drink",
  "cauldron-vegan-tofu-block-396g",
  "quorn-vegetarian-chicken-style-pieces-300g",
  "sainsburys-sweetened-long-life-soya-drink-1l",
  "sainsburys-unsweetened-long-life-soya-drink-1l",
];

/** The protein kinds (lib/mm/pantry.ts PROTEIN_KINDS) a recipe buys as one of the products above: the ones a recipe may use on top of the everyday kinds. */
export const SMALL_SHOP_PROTEIN_KINDS: ReadonlySet<string> = new Set(["tofu", "soya-drink"]);
