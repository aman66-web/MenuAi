import type { Article } from "./types";

export const comparingSideBySide: Article = {
  id: "comparing-side-by-side",
  title: "Comparing two products or dishes side by side",
  summary: "How the Compare tool lines up labels and menus, what Highest and Lowest mean, and how to compare like with like.",
  minutes: 3,
  date: "2026-10-16",
  tags: ["Numbers", "Groceries", "Eating out"],
  blocks: [
    { h: "Choose what to compare" },
    {
      p: "Compare has two tabs, one for Groceries and one for Restaurant dishes. You can add up to six items to each. Type a name into the box on the page, or tap Compare on a product or dish page. The two tabs are kept apart on purpose, because a label that gives numbers per 100 g and a restaurant dish that gives numbers per serving are different kinds of measure. What you pick is kept on your device, and in your account too if you have chosen to sign in. Clear data removes it from this device only.",
    },
    { h: "Reading the table" },
    {
      p: "Your items are the columns, and the nutrients are the rows: calories, protein, carbohydrate with sugars underneath, fat with saturates underneath, fibre and salt. For groceries the table can also show the shop's own price per kilogram or litre, and Protein for £1, which works out how many grams of protein £1 buys at that price.",
    },
    {
      p: "Under some figures you will see the word Highest or Lowest. These are labels, nothing more. They tell you which number is larger or smaller in that row, not which choice is better, and they carry no colour. If two figures are equal, neither is marked. When a label does not print a figure, the table says not on the label, or not published for a dish. That means unknown, not zero.",
    },
    { h: "Compare like with like" },
    {
      p: "A table will happily put two numbers next to each other even when they describe different things. Grocery figures are per 100 g or per 100 ml, exactly as each label prints them. A per 100 ml drink and a per 100 g food are not directly comparable. A label for the cooked food and a label for the dry food also describe different states, which is why Numbite adds a line suggesting you compare those with care.",
    },
    {
      p: "With restaurant dishes the figures are per serving, and servings differ. A large and a small version of the same dish will not match, and a share-sized plate cannot fairly be set against a single portion.",
    },
    {
      ul: [
        "Same basis: per 100 g with per 100 g, per 100 ml with per 100 ml.",
        "Same state: as sold with as sold, cooked with cooked.",
        "Similar serving sizes when you compare dishes.",
        "A figure that is missing is unknown, so do not read it as zero.",
      ],
    },
    { h: "Use it for your own question" },
    {
      p: "The tool does not choose for you. If you care about protein for the price, look at the Protein for £1 row (groceries only). If you care about salt, look at the Salt row instead. The table only puts the published figures side by side, and the decision stays with you.",
    },
  ],
};
