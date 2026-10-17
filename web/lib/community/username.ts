import { BLOCKED_PHRASES, BLOCKED_WHOLE, BLOCKED_WITHIN, INNOCENT, TEXT_INNOCENT, RESERVED_AFFIX, RESERVED_CONTAINS, RESERVED_EXACT, RESERVED_PIECE } from "./blocklist";

// Community usernames (docs/BACKEND.md "Community"). ONE module, used by the API (to decide) and by the app (to tell the person as they type), so the
// two can never disagree. Pure: no browser, Node or database imports.
//
// The rules: 3 to 20 characters of a-z, 0-9, "_" and "."; stored lower case; starts and ends with a letter or digit; never two dots or underscores
// in a row; not a reserved name (anything that could pass for us: "numbite", "admin_sam", "support"); not a blocked word, also when it is disguised
// with look-alikes (0 for o, 1 for l or i, 3 for e, 4 for a, 5 for s, 6 and 9 for g, 7 for t, @ for a, $ for s, rn for m, vv for w, l for i, v for u), separators
// (f.u.c.k) or stretched letters (fuuuck).
// The database repeats the shape rules in its CHECK constraints (supabase/migrations/20261016120000_community.sql); the word rules live only here.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export type UsernameProblem =
  | "empty"
  | "too_short"
  | "too_long"
  /** Something other than a-z, 0-9, "_" or "." (spaces, accents, symbols, emoji). */
  | "characters"
  /** Starts or ends with "." or "_". */
  | "edges"
  /** Two "." or "_" in a row. */
  | "repeats"
  | "reserved"
  | "blocked";

export type UsernameResult = { ok: true; username: string } | { ok: false; reason: UsernameProblem };

/** What the API tells a person: a reserved or blocked name is just "unavailable" (we don't say which, or which word). */
export type PublicUsernameProblem = Exclude<UsernameProblem, "reserved" | "blocked"> | "unavailable";
export const publicUsernameProblem = (p: UsernameProblem): PublicUsernameProblem => (p === "reserved" || p === "blocked" ? "unavailable" : p);

/** What was typed, tidied the way it will be stored: Unicode-normalised, trimmed, one leading "@" dropped, lower case. */
export function normalizeUsername(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input.normalize("NFKC").trim();
  if (s.startsWith("@")) s = s.slice(1);
  return s.toLowerCase();
}

// ---- look-alikes

const LOOK_ALIKE: Record<string, string> = { "0": "o", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "@": "a", $: "s", "!": "i", "+": "t" };

/**
 * The text with look-alike characters turned into the letters they imitate. "1" could be an i or an l, so there is a version for each. Two letters that pass for
 * one ("rn" for m, "vv" for w) and single letters that pass for another (l for i, v for u: "admln", "fvck") are each folded too, alone and all together.
 */
function folds(text: string): string[] {
  const base = [...text].map((c) => LOOK_ALIKE[c] ?? c).join("");
  const rn = base.replace(/rn/g, "m");
  const all = rn.replace(/vv/g, "w").replace(/l/g, "i").replace(/v/g, "u");
  const spellings = new Set([base, rn, base.replace(/vv/g, "w"), base.replace(/l/g, "i"), base.replace(/v/g, "u"), all]);
  return [...new Set([...spellings].flatMap((x) => [x.replace(/1/g, "i"), x.replace(/1/g, "l")]))];
}

const squeeze = (s: string): string => s.replace(/(.)\1+/g, "$1");
const stripDigits = (s: string): string => s.replace(/^[0-9]+|[0-9]+$/g, "");
const SEPARATORS = /[\s._-]+/g;

/** Every spelling of one part of a name worth comparing with a whole word: as typed and each look-alike reading, with and without digits at the ends, and squeezed. */
function forms(piece: string): string[] {
  const out = new Set<string>([stripDigits(piece)]);
  for (const f of folds(piece)) {
    out.add(f);
    out.add(stripDigits(f));
    out.add(squeeze(stripDigits(f)));
  }
  out.delete("");
  return [...out];
}

/** The parts of a name between dots and underscores, in every spelling from forms(). */
const pieceForms = (text: string): string[] => [...new Set(text.split(/[\s._-]+/).filter(Boolean).flatMap(forms))];
/** The name with its separators taken out ("f.u.c.k" is "fuck"), in every spelling from forms(). */
const joinedForms = (text: string): string[] => forms(text.replace(SEPARATORS, ""));

/** The name joined up, look-alikes folded, and also with letters squeezed: what a word is searched for inside. Words that are innocent inside others are taken out first. */
function skeletons(text: string, extraInnocent: readonly string[] = []): string[] {
  const out = new Set<string>();
  for (const f of folds(text.replace(SEPARATORS, ""))) {
    for (const s of [f, squeeze(f)]) {
      let t = s;
      for (const safe of [...INNOCENT, ...extraInnocent]) t = t.split(safe).join("|");
      out.add(t);
    }
  }
  return [...out];
}

/** Whether the text contains a blocked word (also disguised). Works on any text, not just usernames. */
export function looksAbusive(text: string): boolean {
  const lower = normalizeUsername(text);
  if (!lower) return false;
  if (skeletons(lower).some((s) => BLOCKED_WITHIN.some((w) => s.includes(w)))) return true;
  const wholes = new Set(BLOCKED_WHOLE);
  return [...pieceForms(lower), ...joinedForms(lower)].some((p) => wholes.has(p));
}

/** Whether a single word (or run of letters) contains a strong blocked word, in any spelling. */
function hasStrongWord(word: string): boolean {
  return skeletons(word, TEXT_INNOCENT).some((s) => BLOCKED_WITHIN.some((w) => s.includes(w)));
}

/** Characters that print as nothing (zero-width joiners and spaces, soft hyphens, variation selectors, direction marks) and accents: taken out before text is checked. */
const HIDDEN = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]|\p{M}/gu;
const NOT_WORD = /[^\p{L}\p{N}@$!+]+/u;

/**
 * For free text (a word typed into a shopping list): only the strong words (BLOCKED_WITHIN), checked word by word, so British food names such as
 * "spotted dick", "cock-a-leekie" and "faggots and peas" are fine. A shorter list than looksAbusive, because a list item is not a name.
 * A word is also checked when its letters are spread out ("f u c k", "f.u.c.k": three or more single characters in a row) or split by a short separator inside one
 * word ("fu_ck", "sh-it": every piece up to 3 characters). Words on either side of a space are never joined ("fish items" is fine), accents and invisible characters
 * are ignored, and a few whole phrases of hate or harm are refused. It is a filter, not a promise: arbitrary text can still get through, which is why a list can
 * be reported and its sender blocked.
 */
export function looksAbusiveText(text: string): boolean {
  const lower = text.normalize("NFKC").toLowerCase().normalize("NFD").replace(HIDDEN, "");
  const tokens = lower.split(NOT_WORD).filter(Boolean);
  if (tokens.some(hasStrongWord)) return true;
  // letters spread out: a run of at least three single characters
  for (let i = 0; i < tokens.length; i++) {
    let j = i;
    while (j < tokens.length && tokens[j]!.length === 1) j++;
    if (j - i >= 3 && hasStrongWord(tokens.slice(i, j).join(""))) return true;
    i = Math.max(i, j);
  }
  // short pieces joined by a separator inside one word (no space between them)
  for (const chunk of lower.split(/\s+/)) {
    const parts = chunk.split(NOT_WORD).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => p.length <= 3) && hasStrongWord(parts.join(""))) return true;
  }
  return ["i", "l"].some((one) => {
    // digits only (a "!" or "$" at the end of a sentence is punctuation here, not a letter)
    const folded = [...lower].map((c) => (c === "1" ? one : c >= "0" && c <= "9" ? LOOK_ALIKE[c] ?? c : c)).join("");
    const words = ` ${folded.replace(/[^a-z]+/g, " ").trim()} `;
    return BLOCKED_PHRASES.some((p) => words.includes(` ${p} `));
  });
}

/** Whether the name could pass for the app, its staff or a system name. */
export function looksReserved(text: string): boolean {
  const lower = normalizeUsername(text);
  if (!lower) return false;
  const joinedAll = lower.replace(SEPARATORS, "");
  if (folds(joinedAll).some((s) => [s, squeeze(s)].some((x) => RESERVED_CONTAINS.some((w) => x.includes(w))))) return true;
  const joined = joinedForms(lower);
  if (joined.some((j) => RESERVED_AFFIX.some((w) => j.startsWith(w) || j.endsWith(w)) || RESERVED_EXACT.includes(j))) return true;
  return [...pieceForms(lower), ...joined].some((p) => RESERVED_PIECE.includes(p));
}

// ---- the check

/** Only the shape rules (no word lists): cheap enough to run on every keystroke. */
export function checkUsernameShape(input: unknown): UsernameResult {
  const username = normalizeUsername(input);
  if (username.length === 0) return { ok: false, reason: "empty" };
  if (/[^a-z0-9_.]/.test(username)) return { ok: false, reason: "characters" };
  if (username.length < USERNAME_MIN) return { ok: false, reason: "too_short" };
  if (username.length > USERNAME_MAX) return { ok: false, reason: "too_long" };
  if (/^[._]|[._]$/.test(username)) return { ok: false, reason: "edges" };
  if (/[._]{2}/.test(username)) return { ok: false, reason: "repeats" };
  return { ok: true, username };
}

/** Every rule. On success `username` is exactly what the database stores. */
export function validateUsername(input: unknown): UsernameResult {
  const shape = checkUsernameShape(input);
  if (!shape.ok) return shape;
  if (looksReserved(shape.username)) return { ok: false, reason: "reserved" };
  if (looksAbusive(shape.username)) return { ok: false, reason: "blocked" };
  return shape;
}
