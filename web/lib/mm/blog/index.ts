import type { Article } from "./types";
import { allergyLabelsCheckThePack } from "./allergy-labels-check-the-pack";
import { caloriesOnlyRestaurants } from "./calories-only-restaurants";
import { comparingSideBySide } from "./comparing-side-by-side";
import { cookingFromYourShop } from "./cooking-from-your-shop";
import { eatingOutCountingProtein } from "./eating-out-counting-protein";
import { readingMenuFigures } from "./reading-menu-figures";
import { shoppingListThatWorks } from "./shopping-list-that-works";
import { whereOurNumbersComeFrom } from "./where-our-numbers-come-from";

export type { Article, Block } from "./types";

// Numbite's own articles, newest first (then by title), so the Community hub and the blog list can show them in order.
// Adding one: write lib/mm/blog/<id>.ts, import it here, and tests/blog.test.ts checks it.
export const ARTICLES: readonly Article[] = [
  allergyLabelsCheckThePack,
  caloriesOnlyRestaurants,
  comparingSideBySide,
  cookingFromYourShop,
  eatingOutCountingProtein,
  readingMenuFigures,
  shoppingListThatWorks,
  whereOurNumbersComeFrom,
].sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? 1 : -1));

/** The distinct tags used by the articles, sorted. */
export const ARTICLE_TAGS: readonly string[] = [...new Set(ARTICLES.flatMap((a) => a.tags))].sort((a, b) => a.localeCompare(b));

/** One article by its id (as read from ?id=), or undefined. */
export function articleById(id: string | null | undefined): Article | undefined {
  return id ? ARTICLES.find((a) => a.id === id) : undefined;
}
