import type { Article } from "./types";

export const readingMenuFigures: Article = {
  id: "reading-menu-figures",
  title: "How to read the figures on a menu",
  summary: "What per serving and per 100 g mean, and why the same dish can show different numbers in different places.",
  minutes: 3,
  date: "2026-10-16",
  tags: ["Numbers", "Using Numbite"],
  blocks: [
    { h: "Start with the serving" },
    {
      p: "When you open a dish in Numbite, the big figures at the top are calories and protein. Carbs and fat sit just below them, and a button called More detail opens the rest, such as saturated fat, salt, sugar and fibre. For restaurant food these figures are per serving: the amount of that dish the restaurant describes on its menu, for one portion. Servings differ in size, so a bigger dish will usually show more of everything. A figure means little without the serving that goes with it, so look at the dish name and any size next to it before you compare two dishes.",
    },
    { h: "Per serving and per 100 g answer different questions" },
    {
      p: "Supermarket labels usually give their numbers per 100 g, or per 100 ml for drinks. That does not tell you what is in the whole pack, or in the amount you actually eat. It tells you what is in one fixed amount, so that two products can be set side by side fairly. To turn a per 100 g figure into your own amount, work out how many 100 g portions you are having and multiply. For example, if you have 200 g, that is two portions, so every figure on the label is doubled. If you have 50 g, every figure is halved.",
    },
    {
      p: "Restaurants mostly do the opposite. They publish a figure for the dish as it is served, which is why Numbite labels those numbers per serving. Neither style is better. They are simply different measures, and the trouble starts only when the two are mixed up.",
    },
    { h: "Why the same dish can show different numbers" },
    {
      p: "Two places can print different numbers for what looks like the same dish. A restaurant may change a recipe or a portion size, a particular site may serve a slightly different version, or one guide may be newer than another. Each restaurant's page in Numbite names the guide its figures come from and the date we last checked it, which tells you when we last looked. A restaurant's own guide can be older than that date. If a figure looks wrong to you, open the dish and tap Report a number, and we will look into it.",
    },
    { h: "Four things to check before comparing" },
    {
      ul: [
        "Is it per serving, per 100 g or per 100 ml?",
        "Is the size the same? A small and a large are different servings.",
        "Is it the food as sold, or cooked, drained or made up with milk or water?",
        "Does it come from a similar source and a similar date?",
      ],
    },
    { h: "Missing means missing" },
    {
      p: "If a restaurant does not publish a figure, Numbite says not published. It does not fill the gap with a guess, and a blank is never a zero. Treat a missing figure as unknown, and use the numbers that are there.",
    },
  ],
};
