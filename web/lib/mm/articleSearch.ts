import type { Article } from "./blog";
import { normalizeForSearch } from "./search";

// Community › Food blogs: finding an article and showing its date. Pure (no React, no browser), so tests/articleSearch.test.ts can run it.

/** The words an article can be found by: its title, its one-sentence summary and its tags, normalised like every other search in the app. */
function haystack(a: Article): string {
  return ` ${normalizeForSearch([a.title, a.summary, ...a.tags].join(" "))}`;
}

/**
 * The articles that match what was typed and the chosen topic, in the order given. Every word typed must begin a word of the title, summary or
 * tags (case, accents and punctuation ignored, like the restaurant search); an empty box matches everything. `tag` is one of the articles' own
 * tags exactly, or null for all topics.
 */
export function filterArticles(articles: readonly Article[], query: string, tag: string | null): Article[] {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  return articles.filter((a) => (tag === null || a.tags.includes(tag)) && (words.length === 0 || words.every((w) => haystack(a).includes(` ${w}`))));
}

/**
 * An article's date (YYYY-MM-DD) as a long date in the reader's language ("12 October 2026"). The day is read as a calendar date, not a moment, so
 * it never moves with the reader's time zone. Anything that is not a real date is returned as it was written.
 */
export function articleDate(iso: string, htmlLang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d, 12));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return iso;
  try {
    return new Intl.DateTimeFormat(htmlLang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(day);
  } catch {
    return iso;
  }
}
