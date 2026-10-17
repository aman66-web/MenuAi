// Friend codes (Community, docs/BACKEND.md). A code is 8 characters from an alphabet with no look-alikes (no 0 O 1 I L: 31 characters, about 8.5e11
// codes), so it can be read out, typed from a screenshot and told apart on a phone. The server makes it with crypto randomness; this file is pure so
// the app can tidy what a person types ("abcd-efgh", with spaces) with exactly the same rules the API uses. No browser or Node imports.

export const FRIEND_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const FRIEND_CODE_LENGTH = 8;

const VALID = /^[A-HJKMNP-Z2-9]{8}$/;

/** What a person typed or pasted, tidied: upper case, with spaces, hyphens and dots taken out ("abcd-efgh" and "ABCD EFGH" are "ABCDEFGH"). */
export function normalizeFriendCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.normalize("NFKC").toUpperCase().replace(/[\s\-._]+/g, "");
}

/** Whether this is a well-formed code (it may still belong to nobody). Pass the tidied text. */
export const isFriendCode = (code: string): boolean => VALID.test(code);

/** The tidied code if it is well-formed, else null. */
export function parseFriendCode(input: unknown): string | null {
  const code = normalizeFriendCode(input);
  return isFriendCode(code) ? code : null;
}

/** How a code is shown: "ABCD-EFGH". */
export const formatFriendCode = (code: string): string => (code.length === FRIEND_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/** A random whole number from 0 up to (not including) `n`. */
export type RandomInt = (n: number) => number;

/** Unbiased random numbers from the platform's secure generator (Web Crypto: browsers, Node and the edge): bytes that would favour low numbers are thrown away. */
export const secureRandomInt: RandomInt = (n) => {
  if (!Number.isInteger(n) || n < 1 || n > 256) throw new RangeError("secureRandomInt takes 1 to 256");
  const limit = 256 - (256 % n);
  const byte = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(byte);
    if (byte[0]! < limit) return byte[0]! % n;
  }
};

/** A new friend code. The caller still has to make sure nobody has it (the database's unique constraint is the final word). */
export function generateFriendCode(random: RandomInt = secureRandomInt): string {
  let code = "";
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) code += FRIEND_CODE_ALPHABET[random(FRIEND_CODE_ALPHABET.length)]!;
  return code;
}

/** The invite link: the code sits after the "#", which no server ever receives from the link itself. */
export const INVITE_PATH = "/f";
/** Where a friend's invite lands inside the app (the code rides after the "#"). */
export const FRIENDS_APP_PATH = "/app/community/friends";
export const inviteUrl = (base: string, code: string): string => `${base.replace(/\/+$/, "")}${INVITE_PATH}#${code}`;

/** The code in whatever was pasted: an invite link (https://numbite.com/f#CODE, numbite://f#CODE) or the code itself, with or without a hyphen; null if neither. */
export function codeFromPasted(pasted: string): string | null {
  const text = pasted.trim();
  const link = [...text.matchAll(/(?:https?:\/\/|numbite:\/\/)[^\s#]*#([A-Za-z0-9\-_.]{6,20})/g)].pop();
  if (link) return parseFriendCode(link[1]);
  return parseFriendCode(text);
}
