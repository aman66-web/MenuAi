import { describe, expect, it } from "vitest";
import { articleDate, filterArticles } from "../lib/mm/articleSearch";
import type { Article } from "../lib/mm/blog/types";

// Community › Food blogs: the search box, the topic chips and the date line (pure helpers).

const make = (id: string, title: string, summary: string, tags: string[]): Article => ({ id, title, summary, minutes: 3, date: "2026-10-01", tags, blocks: [{ p: "Text." }] });
const ARTICLES: Article[] = [
  make("a", "How to read the figures on a menu", "What per serving and per 100 g mean.", ["Numbers", "Using Numbite"]),
  make("b", "Eating out when you count protein", "Spotting protein-rich dishes in a café menu.", ["Eating out", "Protein"]),
  make("c", "A shopping list that works", "Plan the shop around the meals you will cook.", ["Shopping", "Cooking"]),
];

describe("filterArticles", () => {
  it("an empty box and no topic give every article, in the order they came", () => {
    expect(filterArticles(ARTICLES, "", null).map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(filterArticles(ARTICLES, "   ", null).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
  it("finds a word at the start of a word in the title, the summary or the tags", () => {
    expect(filterArticles(ARTICLES, "shop", null).map((a) => a.id)).toEqual(["c"]); // title and tag
    expect(filterArticles(ARTICLES, "serv", null).map((a) => a.id)).toEqual(["a"]); // summary
    expect(filterArticles(ARTICLES, "cook", null).map((a) => a.id)).toEqual(["c"]); // tag and summary
    expect(filterArticles(ARTICLES, "numbite", null).map((a) => a.id)).toEqual(["a"]); // tag
  });
  it("does not match the middle of a word", () => {
    expect(filterArticles(ARTICLES, "tein", null)).toEqual([]);
  });
  it("ignores case, accents and punctuation", () => {
    expect(filterArticles(ARTICLES, "CAFÉ", null).map((a) => a.id)).toEqual(["b"]);
    expect(filterArticles(ARTICLES, "protein-rich", null).map((a) => a.id)).toEqual(["b"]);
  });
  it("every word typed must match", () => {
    expect(filterArticles(ARTICLES, "eating protein", null).map((a) => a.id)).toEqual(["b"]);
    expect(filterArticles(ARTICLES, "eating shopping", null)).toEqual([]);
  });
  it("a topic keeps only articles that carry that exact tag, and works with the box", () => {
    expect(filterArticles(ARTICLES, "", "Protein").map((a) => a.id)).toEqual(["b"]);
    expect(filterArticles(ARTICLES, "", "Protei")).toEqual([]);
    expect(filterArticles(ARTICLES, "menu", "Protein").map((a) => a.id)).toEqual(["b"]);
    expect(filterArticles(ARTICLES, "figures", "Protein")).toEqual([]);
  });
});

describe("articleDate", () => {
  it("writes the calendar date in the reader's language, whatever the time zone", () => {
    expect(articleDate("2026-10-12", "en-GB")).toBe("12 October 2026");
    expect(articleDate("2026-01-01", "en-GB")).toBe("1 January 2026");
    expect(articleDate("2026-10-12", "es")).toBe("12 de octubre de 2026");
  });
  it("returns anything that is not a real date as written", () => {
    expect(articleDate("2026-02-30", "en-GB")).toBe("2026-02-30");
    expect(articleDate("soon", "en-GB")).toBe("soon");
  });
  it("falls back to the written date for a language tag the browser rejects", () => {
    expect(articleDate("2026-10-12", "not a tag")).toBe("2026-10-12");
  });
});
