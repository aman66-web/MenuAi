import type { Article } from "./types";

export const caloriesOnlyRestaurants: Article = {
  id: "calories-only-restaurants",
  title: "What ‘calories only’ means on a restaurant",
  summary: "Some restaurants publish only calories: how those menus appear, what is switched off, and what you can still do.",
  minutes: 2,
  date: "2026-10-16",
  tags: ["Eating out", "Numbers"],
  blocks: [
    { h: "Some restaurants publish less" },
    {
      p: "Not every restaurant publishes the same set of figures. Some give calories, protein, carbs and fat for every dish. Others print only calories. Numbite marks those restaurants with a calories only badge in the lists, and the restaurant's own page explains what that means. A few restaurants sit in between: they publish all four figures for their food but only calories for drinks, desserts or sides.",
    },
    { h: "What you will see" },
    {
      p: "On a calories-only menu, every dish shows its calories and no figures for protein, carbs or fat, because that is exactly what has happened: the restaurant did not publish them. Numbite does not work them out from the calories, from similar dishes or from anything else. If we showed a number there, it would be a guess dressed up as a fact, and you could not tell the difference.",
    },
    { h: "What is switched off, and why" },
    {
      p: "Some tools need protein, carbs and fat to do their job. Where those figures do not exist, the tools are not offered for that restaurant.",
    },
    {
      ul: [
        "Best for you, because it sorts dishes by protein for their calories.",
        "The order builder, because its totals would be incomplete.",
        "Saving, sharing and logging a dish from the menu, because the log counts protein, carbs and fat.",
        "The Your numbers finder, but only when you ask for protein, carbs or fat. With a calorie limit alone the restaurant stays in.",
      ],
    },
    { h: "What you can still do" },
    {
      p: "You can search the menu, read the calories of each dish and look at its allergens where the restaurant publishes them. You can use the finder with only a calorie limit to see which restaurants have a dish that fits.",
    },
    {
      p: "If you want a dish from a calories-only menu in your day, tap the plus beside Breakfast, Lunch or Dinner on Home and choose Type in your numbers. Enter the calories and leave the other boxes empty. An empty box is recorded as no figure, never as zero, and Home reminds you that some meals have no protein, carbs or fat entered, so those totals count only the rest.",
    },
    { h: "Why we keep these restaurants in" },
    {
      p: "A published calorie figure is still useful, and leaving a restaurant out would only hide it. We would rather show a smaller set of published figures than a fuller set that is partly invented.",
    },
  ],
};
