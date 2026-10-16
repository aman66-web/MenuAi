// Numbite's own short articles (Community › Food blogs). Written by us, bundled in the app, English only (like restaurant notes), so they work
// offline and need no account. Text only: no nutrition figure for any named food (CLAUDE.md rule 1), no pictures of food (rule 2), no claims
// about health and nothing called good or bad (rule 3). The author line shown is simply "Numbite".

/** One block of an article: a section heading, a paragraph, or a short bulleted list. */
export type Block = { h: string } | { p: string } | { ul: string[] };

export interface Article {
  /** Short kebab-case id; also the file name (lib/mm/blog/<id>.ts) and the address (?id=). */
  id: string;
  title: string;
  /** One sentence, under 140 characters. */
  summary: string;
  /** Honest reading time in whole minutes (about 200 words a minute, rounded up). */
  minutes: number;
  /** YYYY-MM-DD */
  date: string;
  tags: string[];
  blocks: Block[];
}
