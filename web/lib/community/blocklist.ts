// Words a Community username may not contain or be (docs/BACKEND.md "Community"). This is a SMALL blocklist, not a promise: it stops the obvious,
// and everything else is handled by the person being able to report and block. Matching works on forms of the name (lib/community/username.ts):
// look-alike digits and symbols turned into the letters they imitate, dots and underscores removed, repeated letters squeezed.
//
// Two kinds of entry, because words hide inside innocent words (cumin, class, grape, peacock, Essex, Nazia, raccoon):
//   * WITHIN: refused anywhere inside the name (long, unmistakable words that rarely occur inside ordinary ones; the few that do are in INNOCENT);
//   * WHOLE:  refused only when a whole part of the name is the word ("sex_fan", "sex.fan", "sex99" but not "sussex" or "cumin").
// Keep it small and add to it from the reports table, not from a list of every bad word.

export const BLOCKED_WITHIN: readonly string[] = [
  "fuck", "shit", "cunt", "bitch", "whore", "slut", "wank", "twat", "bollock", "arsehole", "asshole", "faggot", "nigger", "nigga", "retard", "spastic",
  "rapist", "pedophile", "paedophile", "hitler", "porn", "penis", "vagina", "dildo", "blowjob", "handjob", "jizz", "molest", "terrorist", "kkk",
  "tranny", "trannie", "pussy", "wetback", "killyourself", "jewhater",
];

/** Ordinary words that contain a WITHIN word (shiitake, swank, Scunthorpe, peninsula, therapist...): taken out of the name before it is checked. Also in their squeezed spelling. */
export const INNOCENT: readonly string[] = ["shiitake", "shitake", "swank", "scunthorpe", "peninsula", "snigger", "sniger", "therapist"];

/** More ordinary words, for free text only (a shopping-list item, not a name): "faggots" is a traditional British dish. */
export const TEXT_INNOCENT: readonly string[] = ["faggots"];

export const BLOCKED_WHOLE: readonly string[] = [
  "ass", "arse", "cock", "dick", "tit", "tits", "cum", "anus", "sex", "rape", "nazi", "paki", "kike", "chink", "coon", "pedo", "isis", "kys",
  "dyke", "spic", "spick", "chinky", "negro", "slag", "bastard", "dickhead", "anal",
];

/** Whole phrases that are never a shopping-list item (free text only, matched on whole words, with look-alike digits folded): wishes of harm and hate. */
export const BLOCKED_PHRASES: readonly string[] = ["kill yourself", "kill urself", "kill your self", "hang yourself", "go and die", "go die", "kys", "jews are"];

// Names that look official or that someone could use to pretend to be us or to speak for the app.
/** Refused when the name contains this anywhere (a coined word: nobody has an innocent reason to contain it). */
export const RESERVED_CONTAINS: readonly string[] = ["numbite"];
/** Refused when the whole name (separators removed) starts or ends with this ("admin_sam", "sammoderator"; "badminton" is fine). */
export const RESERVED_AFFIX: readonly string[] = ["admin", "moderator", "helpdesk"];
/** Refused when any part of the name (between dots and underscores, digits at the ends ignored) is this ("sam.support", "staff7", "official_sam"). */
export const RESERVED_PIECE: readonly string[] = ["administrator", "support", "staff", "official", "security", "mod", "mods"];
/** Refused when the whole name is exactly this ("team", but "team_sam" is fine). */
export const RESERVED_EXACT: readonly string[] = [
  "team", "help", "info", "contact", "abuse", "report", "system", "service", "community", "founder", "owner", "root", "me", "you", "user", "username",
  "friend", "friends", "everyone", "anonymous", "deleted", "null", "undefined", "none", "unknown", "noreply",
];
