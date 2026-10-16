import type { Article } from "./types";

export const shoppingListThatWorks: Article = {
  id: "shopping-list-that-works",
  title: "A shopping list that works",
  summary: "Add products from a shop, tick things off, share the list as a link and see which recipes your list could make.",
  minutes: 3,
  date: "2026-10-16",
  tags: ["Groceries", "Recipes", "Using Numbite"],
  blocks: [
    { h: "Build the list as you browse" },
    {
      p: "Your list lives on the Shopping list card on Home. To fill it, open Groceries, choose a shop, and tap Add to my list on a product. The product arrives with its picture, and the plus and minus buttons change the quantity. When you want more from the same shop, use Add more from that shop at the foot of its card. For another shop, use Add from another shop. Things that are not tied to a shop, such as milk, can simply be typed in.",
    },
    {
      p: "Where a shop's own website shows a price, your list shows it with the date it was read, and each shop's total counts only the items that have a price. Prices change, so treat the total as a guide and check in store.",
    },
    { h: "Tick things off as you shop" },
    {
      p: "Tap the circle beside an item when it goes into your basket. Ticked items drop to the bottom of the list so the rest stays easy to see, and Remove ticked clears them away when you have finished.",
    },
    { h: "Share it as a link" },
    {
      p: "Share list sends your list as plain words, with a link underneath. A friend who has Numbite can open the link and see the list, then add it to their own. The link holds the list itself, so nothing is stored on a server and nobody needs an account. It also means that anyone who has the link can read the list, so send it to people you trust. Items you have already ticked are left out.",
    },
    {
      p: "Your friend sees today's names and prices from the shops' own lists, not the ones you saw. If they do not have Numbite yet, they can open the link in a browser to read the list. Or they can install the app and either tap the link again or paste the whole message into Got a list from a friend? Open it, on the Shopping list.",
    },
    { h: "Ideas from what you already have" },
    {
      p: "At the top of your list, What can I cook with this? shows recipes that use something on it, with the ones that need the fewest extra items first. Each recipe says how many of its ingredients you already have, and one tap adds the rest. Further down, You might also need suggests what is still missing for the recipe that uses most of your list.",
    },
    {
      ul: [
        "Suggestions come only from our own recipes.",
        "A typed item counts as an ingredient if its name matches.",
        "You can ignore the suggestions and keep the list as it is.",
      ],
    },
  ],
};
