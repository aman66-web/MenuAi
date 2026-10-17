import { describe, expect, it } from "vitest";
import {
  checkUsernameShape, looksAbusive, looksAbusiveText, looksReserved, normalizeUsername, publicUsernameProblem, USERNAME_MAX, USERNAME_MIN, validateUsername,
} from "../lib/community/username";
import {
  codeFromPasted, formatFriendCode, FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH, generateFriendCode, inviteUrl, isFriendCode, normalizeFriendCode, parseFriendCode,
  secureRandomInt,
} from "../lib/community/friendCode";

// Usernames and friend codes (lib/community/username.ts, friendCode.ts): one set of rules for the API and the app.

const ok = (s: string) => validateUsername(s);
const reason = (s: string) => {
  const r = validateUsername(s);
  return r.ok ? "ok" : r.reason;
};

describe("username shape", () => {
  it("accepts ordinary names and stores them lower case", () => {
    for (const name of ["sam", "Sam", "SAM", "alice", "bob.b", "carol_3", "a1.b2_c3", "007", "abc", "a".repeat(USERNAME_MAX), "pasta.lover99", "x_y"]) {
      const r = ok(name);
      expect(r.ok, name).toBe(true);
      if (r.ok) expect(r.username).toBe(name.toLowerCase());
    }
  });

  it("tidies what was typed: spaces around it, one leading @, capitals, full-width letters", () => {
    expect(normalizeUsername("  @Sam.Cook ")).toBe("sam.cook");
    expect(normalizeUsername("ＳＡＭ")).toBe("sam");
    expect(normalizeUsername(42)).toBe("");
    expect(normalizeUsername(null)).toBe("");
    expect(ok("@sam.cook")).toEqual({ ok: true, username: "sam.cook" });
    expect(reason("@@sam")).toBe("characters");
  });

  it("length is 3 to 20 after tidying", () => {
    expect(USERNAME_MIN).toBe(3);
    expect(USERNAME_MAX).toBe(20);
    expect(reason("")).toBe("empty");
    expect(reason("   ")).toBe("empty");
    expect(reason("ab")).toBe("too_short");
    expect(reason("abc")).toBe("ok");
    expect(reason("a".repeat(20))).toBe("ok");
    expect(reason("a".repeat(21))).toBe("too_long");
  });

  it("only a-z, 0-9, dot and underscore", () => {
    for (const bad of ["sam cook", "sam-cook", "sam!", "sam@cook", "élise", "sam😀", "sam/cook", "sam,cook", "sam\ncook", "sam​cook"]) expect(reason(bad), bad).toBe("characters");
  });

  it("starts and ends with a letter or digit", () => {
    for (const bad of [".sam", "_sam", "sam.", "sam_", "..sam"]) expect(reason(bad), bad).toBe("edges");
  });

  it("never two dots or underscores in a row", () => {
    for (const bad of ["sa..m", "sa__m", "sa._m", "sa_.m", "a...b"]) expect(reason(bad), bad).toBe("repeats");
    expect(reason("sa.m_y")).toBe("ok");
  });

  it("checkUsernameShape applies the shape rules only (no word lists)", () => {
    expect(checkUsernameShape("admin")).toEqual({ ok: true, username: "admin" });
    expect(checkUsernameShape("fuck")).toEqual({ ok: true, username: "fuck" });
    expect(checkUsernameShape("a b")).toEqual({ ok: false, reason: "characters" });
  });

  it("a name is not a string: anything else is empty", () => {
    for (const v of [undefined, null, 5, {}, [], true]) expect(validateUsername(v)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("reserved names", () => {
  it("refuses anything that could pass for us", () => {
    for (const bad of ["numbite", "Numbite", "numbite.team", "numbite_support", "mynumbite", "numbite99", "admin", "Admin_Sam", "sam.admin", "administrator", "moderator", "support", "sam.support",
      "staff", "staff7", "official", "official_sam", "mod", "helpdesk", "team", "info", "noreply"]) {
      expect(reason(bad), bad).toBe("reserved");
    }
  });

  it("sees through look-alikes and separators", () => {
    // 1 could be an i or an l: numb1te reads as numbite
    for (const bad of ["numb1te", "num.bite", "nu_mbite", "adm1n", "4dmin", "supp0rt", "5taff", "0fficial", "n0reply"]) expect(reason(bad), bad).toBe("reserved");
  });

  it("leaves ordinary names that merely resemble them alone", () => {
    for (const fine of ["badminton", "supportive_chef", "teamwork", "team_sam", "helpful_sam", "information", "modern_cook", "modest", "stafford", "snug_blanket9", "numbers", "numb"]) {
      expect(reason(fine), fine).toBe("ok");
    }
  });

  it("looksReserved works on any text", () => {
    expect(looksReserved("Admin")).toBe(true);
    expect(looksReserved("salmon")).toBe(false);
    expect(looksReserved("")).toBe(false);
  });
});

describe("blocked words", () => {
  const BAD_WORDS = ["fuck", "shit", "cunt", "bitch", "whore", "slut", "twat", "wank", "nigger", "faggot", "retard", "rapist", "hitler", "porn", "penis"];

  it("refuses obvious words, anywhere in the name", () => {
    for (const w of BAD_WORDS) {
      expect(reason(`${w}`), w).toBe("blocked");
      expect(reason(`big${w}99`), w).toBe("blocked");
      expect(reason(`${w}_lover`), w).toBe("blocked");
    }
  });

  it("refuses short words only when a whole part of the name is the word", () => {
    for (const bad of ["ass", "ass_man", "sex.fan", "sex99", "big.dick", "tits", "cock", "rape", "nazi", "cum_lover", "anus", "kys"]) expect(reason(bad), bad).toBe("blocked");
  });

  it("sees through look-alike characters", () => {
    for (const bad of ["sh1t", "5hit", "b1tch", "8itch", "c0ck", "d1ck", "a55", "tw4t", "w4nk", "wh0re", "s1ut", "t1ts", "p0rn", "n1gger", "f4ggot", "fuck_you"]) {
      expect(reason(bad), bad).toBe("blocked");
    }
  });

  it("sees through separators and stretched letters", () => {
    for (const bad of ["f.u.c.k", "f_u_c_k", "fu.ck", "fuuuuck", "shiiiit", "biiitch", "s.h.i.t", "a.s.s", "c_u_n_t", "fuuck_off"]) expect(reason(bad), bad).toBe("blocked");
  });

  it("does not trip on ordinary words that contain a bad one (the Scunthorpe problem), food words especially", () => {
    for (const fine of [
      "class", "classic_cook", "grape", "grapes.and.cheese", "cumin_seed", "cocktail", "peacock", "cockles", "sussex", "essex_girl", "assam_tea", "bass", "assassin", "title", "titan",
      "dickens", "dickson", "rapeseed", "analyst", "nazia", "nazir", "pakora_king", "raccoon", "scunthorpe_fan", "peninsula", "therapist_jo", "swanky_chef",
      "shiitake_lover", "shitake", "snigger", "arsenal", "cumbria", "sexton", "isiskitchen", "popcorn", "ballot", "hancock", "sexta", "slot", "wonderful",
    ]) {
      expect(reason(fine), fine).toBe("ok");
    }
  });

  it("looksAbusive works on any text", () => {
    expect(looksAbusive("what the f.u.c.k")).toBe(true);
    expect(looksAbusive("Lovely lunch")).toBe(false);
    expect(looksAbusive("")).toBe(false);
  });

  it("the API tells a person only 'unavailable' for a reserved or blocked name, never which", () => {
    expect(publicUsernameProblem("reserved")).toBe("unavailable");
    expect(publicUsernameProblem("blocked")).toBe("unavailable");
    expect(publicUsernameProblem("too_short")).toBe("too_short");
    expect(publicUsernameProblem("characters")).toBe("characters");
  });
});

describe("look-alikes and the words a review found missing", () => {
  it("refuses names that pass for us or for a blocked word with look-alike letters: rn for m, l for i, v for u, 6 and 9 for g", () => {
    for (const bad of ["nurnbite", "numb1te", "admln", "adrnin", "adm1n", "rnoderator", "supp0rt", "ni99er", "n1gg3r", "nigg3r", "fvck", "fvuck", "tr4nny", "trann1e", "vvank", "dlck", "p0rn"]) {
      expect(ok(bad).ok, bad).toBe(false);
    }
  });

  it("refuses the slurs and words a reviewer tried first", () => {
    for (const bad of ["dyke", "pussy", "chinky", "spic", "wetback", "negro", "bastard", "dickhead", "anal", "jew.hater", "jewhater", "kill_yourself", "killyourself", "slag", "tranny"]) {
      expect(ok(bad).ok, bad).toBe(false);
    }
  });

  it("still allows ordinary names that contain pieces of them", () => {
    for (const fine of ["analyst", "canal", "bastardo", "negroni", "ellie", "hillary", "oliver", "vivian", "marnie", "barnaby", "learn", "modern", "sussex", "cumin", "class.act", "grapes", "peacock", "essex", "nazia", "raccoon", "slaggy_not", "pasta.lover", "mia.rnaw".replace("rnaw", "claw")]) {
      expect(ok(fine).ok, fine).toBe(true);
    }
  });
});

describe("words typed into a shopping list", () => {
  it("refuses strong words, also spread out, split by separators, with hidden characters, accents or look-alikes", () => {
    for (const bad of [
      "fuck", "sh1t", "ｆｕｃｋ", "f.u.c.k", "f-u-c-k", "f u c k", "fu\u200cck", "fu\u200dck", "fu\u200bck", "fu\ufeffck", "s h i t", "sh_it", "fu_ck", "c.u.n.t", "n i g g e r",
      "ni99er", "fúck", "pussy", "tranny", "ＮＩＧＧＥＲ", "f\u0075\u0301ck",
    ]) {
      expect(looksAbusiveText(bad), JSON.stringify(bad)).toBe(true);
    }
  });

  it("refuses a few whole phrases of harm or hate", () => {
    for (const bad of ["kill yourself", "Kill  Yourself!", "k1ll yourself", "go and die", "go die", "kys", "hang yourself", "jews are"]) expect(looksAbusiveText(bad), bad).toBe(true);
  });

  it("allows food: words next to each other are never joined, and British dishes with rude-looking names are fine", () => {
    for (const fine of [
      "milk", "fish items", "frozen fish items", "spotted dick", "cock-a-leekie", "faggots and peas", "shiitake mushrooms", "5 a day", "vitamin d", "t-bone steak",
      "stir-fry sauce", "grapes", "class", "Scunthorpe sausage", "swanking", "à la carte", "pass it on", "go dine", "kill the lights", "x-tra mature cheddar", "7 up", "a b",
    ]) {
      expect(looksAbusiveText(fine), fine).toBe(false);
    }
  });
});

describe("friend codes", () => {
  it("the alphabet has no look-alikes and 31 characters", () => {
    expect(FRIEND_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(FRIEND_CODE_ALPHABET).size).toBe(31);
    for (const c of "01OIL") expect(FRIEND_CODE_ALPHABET).not.toContain(c);
    expect(FRIEND_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
  });

  it("a generated code has 8 characters, all from the alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateFriendCode();
      expect(code).toHaveLength(FRIEND_CODE_LENGTH);
      expect(isFriendCode(code)).toBe(true);
      for (const c of code) expect(FRIEND_CODE_ALPHABET).toContain(c);
    }
  });

  it("uses every character of the alphabet and is not biased towards the start", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 4000; i++) for (const c of generateFriendCode()) seen.set(c, (seen.get(c) ?? 0) + 1);
    expect(seen.size).toBe(31);
    const counts = [...seen.values()];
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length; // 1032 each on average
    for (const n of counts) expect(Math.abs(n - mean) / mean).toBeLessThan(0.2);
  });

  it("codes do not repeat (31^8 is about 8.5e11)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(generateFriendCode());
    expect(seen.size).toBe(20000);
  });

  it("takes its randomness from the generator it is given (so tests are deterministic) and rejects a generator out of range", () => {
    let i = 0;
    expect(generateFriendCode(() => i++ % 31)).toBe("ABCDEFGH");
    expect(() => secureRandomInt(0)).toThrow();
    expect(() => secureRandomInt(257)).toThrow();
    for (let n = 0; n < 200; n++) expect(secureRandomInt(7)).toBeLessThan(7);
  });

  it("tidies typed codes: case, spaces, hyphens, dots", () => {
    expect(normalizeFriendCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeFriendCode(" ABCD EFGH ")).toBe("ABCDEFGH");
    expect(normalizeFriendCode("a.b.c.d.e.f.g.h")).toBe("ABCDEFGH");
    expect(normalizeFriendCode(5)).toBe("");
    expect(parseFriendCode("abcd-efgh")).toBe("ABCDEFGH");
  });

  it("refuses what is not a code: wrong length, look-alike letters, symbols", () => {
    for (const bad of ["", "ABCDEFG", "ABCDEFGHJ", "ABCDEFG0", "ABCDEFGO", "ABCDEFG1", "ABCDEFGI", "ABCDEFGL", "ABCDEFG!", "ABCDEFGé"]) expect(parseFriendCode(bad), bad).toBeNull();
    expect(parseFriendCode(undefined)).toBeNull();
  });

  it("shows a code as ABCD-EFGH and builds the invite link with the code after the #", () => {
    expect(formatFriendCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(inviteUrl("https://numbite.com/", "ABCDEFGH")).toBe("https://numbite.com/f#ABCDEFGH");
  });

  it("finds the code in a pasted link or the code itself", () => {
    expect(codeFromPasted("https://numbite.com/f#ABCDEFGH")).toBe("ABCDEFGH");
    expect(codeFromPasted("numbite://f#abcd-efgh")).toBe("ABCDEFGH");
    expect(codeFromPasted("Add me! https://numbite.com/f#JKMNPQRS thanks")).toBe("JKMNPQRS");
    expect(codeFromPasted("ABCD-EFGH")).toBe("ABCDEFGH");
    expect(codeFromPasted("hello there")).toBeNull();
    expect(codeFromPasted("https://numbite.com/f#nope")).toBeNull();
  });
});
