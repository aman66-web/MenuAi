import type { Article } from "./types";

export const eatingOutCountingProtein: Article = {
  id: "eating-out-counting-protein",
  title: "Eating out when you count protein",
  summary: "Three ways Numbite helps you find dishes by their published numbers: the number finder, Best for you and the order builder.",
  minutes: 3,
  date: "2026-10-16",
  tags: ["Eating out", "Numbers"],
  blocks: [
    { h: "Start with your numbers" },
    {
      p: "If you already know the figures you are working to, the quickest start is on the Eat out tab. On the Eat out tab, tap Find by numbers or allergies. Under Your numbers there are four boxes: calories up to, protein at least, carbs up to and fat up to. Fill in any that you like and leave the rest empty. The list underneath changes to the restaurants with at least one dish that fits every number you typed, together with your diet and allergy choices, and it says how many dishes fit. Use my meal numbers fills the boxes from the meal size you have set.",
    },
    {
      p: "The count includes sides and drinks, as each restaurant publishes them, so open a restaurant to see what the dishes actually are. A restaurant that publishes only calories is left out when you ask for protein, carbs or fat, because it has not published them.",
    },
    { h: "Best for you" },
    {
      p: "On a restaurant's page, Best for you suggests up to five dishes or combinations. It keeps the ones that fit within your meal size, then puts first those with the most protein for their calories, and a line under each pick says why it was chosen. Pick breakfast, lunch or dinner and the suggestions change with it. Your diet choices apply too.",
    },
    {
      p: "It is a way of sorting the published numbers by the target you gave Numbite. It is not a verdict on any food, and it knows nothing beyond what the restaurant publishes. If you prefer a different dish, choose it. The numbers are there to help you decide, not to decide for you.",
    },
    { h: "Build and adjust an order" },
    {
      p: "Few meals are a single dish. The order builder lets you add several items together and watch the total for calories, protein, carbs and fat. Where a menu publishes its separate parts, you can swap or remove a part and see the totals change straight away. You can save an order, log it, or share it with someone.",
    },
    {
      p: "The builder only adds up figures the restaurant has published. It does not guess at extras such as a splash of sauce that is not on the menu, so allow for those yourself.",
    },
    { h: "What Numbite does not do" },
    {
      p: "Numbite does not tell you how much to eat. Your targets are yours to set, and the suggestions in Settings are only starting points that you can change at any time. The app also knows only what a restaurant publishes, so for anything it cannot tell you, such as how a dish is cooked today or whether a recipe has changed, ask the restaurant.",
    },
  ],
};
