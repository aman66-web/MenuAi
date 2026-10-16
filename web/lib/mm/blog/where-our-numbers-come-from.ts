import type { Article } from "./types";

export const whereOurNumbersComeFrom: Article = {
  id: "where-our-numbers-come-from",
  title: "Where our numbers come from",
  summary: "Restaurant guides, supermarket pages and community data: where each figure in Numbite comes from, and what we never do.",
  minutes: 3,
  date: "2026-10-16",
  tags: ["Numbers", "Using Numbite"],
  blocks: [
    { h: "Restaurants: their own published guides" },
    {
      p: "Every restaurant figure in Numbite comes from that restaurant's own published nutrition information, such as a guide, a PDF or a page on its website. We copy the figures in, by script wherever the source allows, and then check them. Each restaurant's page shows its source and the date we last looked, along with a note if there is a limit to the data, such as menus that differ from one site to another.",
    },
    {
      p: "Sometimes a restaurant's own documents disagree with each other. When we find that they do, we leave that dish out instead of choosing between two numbers. If a restaurant's data has a known limit, its page says so.",
    },
    { h: "Supermarkets: the shop's own page first" },
    {
      p: "For groceries, we use the numbers from a shop's own product page wherever we have read it, and the product says so. Where we have not, the numbers come from Open Food Facts, a database kept by volunteers, matched on the barcode. We label those clearly as community data. They can be out of date or wrong, so always read the pack.",
    },
    {
      p: "Prices appear only where we have read them from the supermarket's own website, and they carry the date. A price is what the shop showed on that day, and prices change, so check in store.",
    },
    { h: "Recipes: arithmetic on labels" },
    {
      p: "A recipe's figures are added up from the labels of the products it uses, for the amounts the recipe needs, and shown per serving. If one of those labels does not print a figure, the recipe says not on every label instead of giving a total that would be wrong.",
    },
    { h: "Not published means not published" },
    {
      p: "When a figure is missing, we say so. We do not estimate it, copy it from a similar food or round it into place. A gap in the data is better than a number nobody published.",
    },
    {
      p: "If you spot something that looks wrong, open the dish and tap Report a number. Tell us what you see and, if you can, send a photo of the guide or the pack. We will look into it and correct our copy if it does not match the source.",
    },
    {
      ul: [
        "Restaurant figures are as the restaurant published them, on the date shown.",
        "Supermarket figures come from the shop's page, or are marked as community data.",
        "Prices are what the shop showed on the date we read them.",
        "Numbite is not affiliated with any restaurant or shop. Their names and logos appear only to say which is which.",
      ],
    },
  ],
};
