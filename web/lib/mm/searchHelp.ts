// Pip's search help (founder 2026-11-21: "use AI to find and figure out what they're trying to search ... one little spelling mistake will mean that they won't
// be able to get the right thing"). Only when the phone finds nothing, not even a close match (lib/mm/search.ts closeRank), the typed words go to our server,
// which asks the AI for up to three things the person most likely meant (a UK restaurant chain, a dish as chains name it, or both). Those come back as words
// only: each is searched on the phone in the app's own menus, and only one that finds something is offered as "Did you mean". No figure ever comes from the AI.

/** On unless NEXT_PUBLIC_SEARCH_HELP=0 (the route answers 404 then, and the screen asks nothing). */
export const SEARCH_HELP_ENABLED = process.env.NEXT_PUBLIC_SEARCH_HELP !== "0";

/** The longest search sent, and the most suggestions kept. */
export const MAX_HELP_QUERY = 80;
export const MAX_HELP_PHRASES = 3;

/** A suggestion as it may be shown and searched: words, numbers and a few marks, 2 to 60 characters. */
const PHRASE = /^[\p{L}\p{N}][\p{L}\p{N} '’&.,-]{1,59}$/u;

/** The suggestions from the server, cleaned: strings that look like a search, trimmed, without repeats or the typed words themselves, at most three. */
export function cleanPhrases(raw: unknown, typed = ""): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([typed.trim().toLowerCase()]);
  const out: string[] = [];
  for (const p of raw) {
    if (typeof p !== "string") continue;
    const v = p.trim().replace(/\s+/g, " ");
    const key = v.toLowerCase();
    if (!PHRASE.test(v) || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= MAX_HELP_PHRASES) break;
  }
  return out;
}

/** What may be sent: the typed words, 2 to MAX_HELP_QUERY characters after trimming; null otherwise. */
export function helpQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim().replace(/\s+/g, " ");
  return q.length >= 2 && q.length <= MAX_HELP_QUERY ? q : null;
}
