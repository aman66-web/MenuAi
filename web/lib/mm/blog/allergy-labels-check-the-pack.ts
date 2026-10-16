import type { Article } from "./types";

export const allergyLabelsCheckThePack: Article = {
  id: "allergy-labels-check-the-pack",
  title: "Allergy labels: always check the pack",
  summary: "What Numbite shows about allergens, what it cannot promise, and the routine to use every time you order or buy.",
  minutes: 2,
  date: "2026-10-16",
  tags: ["Allergies", "Using Numbite"],
  blocks: [
    { h: "What Numbite shows" },
    {
      p: "For many restaurants, a dish's page lists allergens taken from that restaurant's own allergen guide. They cover the fourteen main allergens, split into Contains and May contain, and the page names the guide and the date we checked it. Where a restaurant has no guide we can read completely, we show only a link to the guide itself. For supermarket products, allergens are shown where they have been recorded.",
    },
    { h: "What it cannot do" },
    {
      p: "Numbite shows what a restaurant or a shop publishes. It cannot promise that any dish or product is free of anything. When the page says Not listed, that means the guide does not list it, which is different from the item being free of it. Guides can be out of date, kitchens can share equipment, and May contain is a warning that cross-contact cannot be ruled out.",
    },
    {
      p: "The Allergies to avoid setting hides dishes that the guide lists under Contains or May contain for the allergens you chose. It also hides dishes that have no allergen information, because having no information is not the same as having none of the allergen. A restaurant without readable allergen information says so on its page.",
    },
    { h: "Check every time" },
    {
      p: "Recipes change, suppliers change, and menus can differ from one site to another. A product you have bought for years may have a new recipe, and the app may not have caught up yet. If a product page says allergens are not shown yet, take that literally: it means we have no information, not that the product contains none.",
    },
    {
      ul: [
        "Use the filter to narrow your choices, not to make the final decision.",
        "Open the dish and read both the Contains and May contain lists.",
        "Follow the link to the restaurant's own allergen guide.",
        "Tell the staff about your allergy when you order, and ask them to check.",
        "With a product, read the pack in your hand before you buy and again before you eat.",
      ],
    },
    { h: "Recipes and your choices" },
    {
      p: "Recipes are filtered by their ingredients, not by the allergen label of each product you might buy. When you choose allergies to avoid, Numbite leaves out recipes that contain them, but it says plainly that the products' own labels have not been read. Check each pack you pick up, because different brands of the same ingredient can differ.",
    },
  ],
};
