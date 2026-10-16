import type { Article } from "./types";

export const cookingFromYourShop: Article = {
  id: "cooking-from-your-shop",
  title: "Cooking from your shop",
  summary: "How our recipes use real products with real prices and labels, and what to do when a shop does not sell something.",
  minutes: 2,
  date: "2026-10-16",
  tags: ["Recipes", "Groceries"],
  blocks: [
    { h: "Real products, real prices" },
    {
      p: "Every recipe in the Recipes tab is built from products in a supermarket's own list, and the page names the shop. Each ingredient row shows the product, the amount the recipe needs and the shop's price. The calories, protein, carbs and fat for each serving are added up from those products' own labels. The recipes are written around everyday ingredients that most shops sell, but ranges differ from shop to shop.",
    },
    { h: "Change how many it serves" },
    {
      p: "The Serves buttons change the number of people from one to twelve. The amounts, the packs and the price to buy it all change with them, while the figures per serving stay the same. A serving's price counts only the share of each product you use. The price to buy it all adds up whole packs at the prices the shop's own list showed. Prices change, so check in store.",
    },
    { h: "When a shop does not sell something" },
    {
      p: "Not every shop stocks every ingredient. If a shop has nothing that fits, the recipe says so and uses a substitute that the shop does sell, naming both. Tap Swap on any ingredient to pick a different product, or choose Use something else instead to see other ingredients that work, each with its own amount. Your diet settings are respected, so a vegan will not be offered a dairy swap. The numbers and the price are worked out again from the new product's label.",
    },
    { h: "What you already have" },
    {
      p: "Salt, oil and spices usually live in the cupboard. Those rows say You may have this already, with an I have this button. Press it and that item is left off your shopping list and off the price to buy it all. The price of a serving and the figures still include it, because it is part of the dish.",
    },
    {
      p: "When you are ready to shop, Add all to my shopping list sends every product to your list, and Save to My meals keeps the recipe for next time. Recipes are filtered for your diet by ingredient, so read each pack you buy.",
    },
    {
      ul: [
        "Check the shop's name at the top of the recipe.",
        "Use Swap if your shop is out of something.",
        "Mark the cupboard items you already have.",
        "Add the rest to your list and tick them off as you shop.",
      ],
    },
  ],
};
