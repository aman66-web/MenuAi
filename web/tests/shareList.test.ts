import { describe, expect, it } from "vitest";
import type { ShoppingItem } from "../lib/mm/groceries";
import { cleanTyped, decodePayload, encodeEntries, MAX_PAYLOAD_LENGTH, MAX_SHARED_ITEMS, payloadFrom, shareUrl, shopsOf, SHARED_APP_PATH, toEntries, type SharedEntry } from "../lib/mm/shareList";

// A shopping list inside a link (founder 2026-10-15): references only, checked on the way in, and a link that was cut short is told apart from one that is wrong.

const item = (over: Partial<ShoppingItem>): ShoppingItem => ({ gtin: "", retailer: "tesco", name: "x", brand: "", size: "", qty: 1, addedAt: "2026-10-15T10:00:00.000Z", ...over });
const pancakes = item({ shopId: "272407558", name: "Abra Ca Debora Sweet Pancakes 6 Pack, 375 G", qty: 2, price: 2.4 });
const loaf = item({ retailer: "sainsburys", shopId: "jason-s-sourdough-grains-seeds-ciabatt-bread", name: "Jason's Sourdough" });
const keema = item({ retailer: "asda", gtin: "5030039010492", name: "Aaila Chicken Tikka Keema" });
const milk = item({ retailer: "own", custom: true, name: "Milk" });

function roundTrip(list: ShoppingItem[]) {
  const entries = toEntries(list);
  const enc = encodeEntries(entries)!;
  return { entries, enc, back: decodePayload(enc.payload) };
}

describe("a list to a link and back", () => {
  it("carries every kind of item, with quantities, and nothing else", () => {
    const { entries, enc, back } = roundTrip([pancakes, loaf, keema, milk]);
    expect(entries).toEqual([
      { retailer: "tesco", kind: "shop", code: "272407558", qty: 2 },
      { retailer: "sainsburys", kind: "shop", code: "jason-s-sourdough-grains-seeds-ciabatt-bread", qty: 1 },
      { retailer: "asda", kind: "barcode", code: "5030039010492", qty: 1 },
      { retailer: "own", kind: "typed", code: "Milk", qty: 1 },
    ]);
    expect(enc.included).toBe(4);
    expect(enc.total).toBe(4);
    expect(back).toEqual({ ok: true, entries });
    // no names of products, no prices, no picture addresses ride along
    expect(enc.payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(enc.payload.slice(7).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).not.toMatch(/Pancakes|2\.4|https/);
  });

  it("leaves ticked items out (they are in the basket), and merges a product listed twice", () => {
    const entries = toEntries([pancakes, item({ ...pancakes, done: true, shopId: "999999999" }), item({ ...pancakes, qty: 3 })]);
    expect(entries).toEqual([{ retailer: "tesco", kind: "shop", code: "272407558", qty: 5 }]);
  });

  it("skips an item it can't point to (no id, no barcode, a shop it doesn't know)", () => {
    expect(toEntries([item({ name: "mystery" }), item({ retailer: "nowhere", shopId: "123456789" }), item({ gtin: "123", name: "short barcode" })])).toEqual([]);
    expect(encodeEntries([])).toBeNull();
  });

  it("is short: a list of 30 Sainsbury's products fits easily in a message", () => {
    const list = Array.from({ length: 30 }, (_, i) => item({ retailer: "sainsburys", shopId: `warburtons-800g-seven-seeds-bread-${i}`, qty: 1 + (i % 3) }));
    const { enc } = roundTrip(list);
    expect(enc.payload.length).toBeLessThan(3500);
    expect(enc.included).toBe(30);
  });

  it("a list too long for one link is cut to the first items that fit, and says how many", () => {
    const list = Array.from({ length: 120 }, (_, i) => item({ retailer: "sainsburys", shopId: `a-very-long-product-name-that-sainsburys-might-use-for-product-number-${i}-in-its-address` }));
    const enc = encodeEntries(toEntries(list))!;
    expect(enc.total).toBe(120);
    expect(enc.included).toBeLessThanOrEqual(MAX_SHARED_ITEMS);
    expect(enc.included).toBeLessThan(120);
    expect(enc.payload.length).toBeLessThanOrEqual(MAX_PAYLOAD_LENGTH);
    const back = decodePayload(enc.payload);
    expect(back.ok && back.entries.length).toBe(enc.included);
  });

  it("keeps the words of typed items in any language, and their emoji", () => {
    const words = ["Mleko 2%", "ਦੁੱਧ", "حليب", "牛乳 🥛", "Pão de forma"];
    const { back } = roundTrip(words.map((w) => item({ retailer: "own", custom: true, name: w })));
    expect(back.ok && back.entries.map((e) => e.code)).toEqual(words);
  });
});

describe("a payload that isn't one, or has been tampered with", () => {
  const good = encodeEntries(toEntries([pancakes, milk]))!.payload;

  it("tells empty, wrong version, cut short and unreadable apart", () => {
    expect(decodePayload("")).toEqual({ ok: false, reason: "empty" });
    expect(decodePayload("   ")).toEqual({ ok: false, reason: "empty" });
    expect(decodePayload("2" + good.slice(1))).toEqual({ ok: false, reason: "version" });
    expect(decodePayload(good.slice(0, -4))).toEqual({ ok: false, reason: "cut" }); // a messaging app cut the link
    expect(decodePayload(good.slice(0, 8))).toEqual({ ok: false, reason: "cut" });
    expect(decodePayload(good.slice(0, 5))).toEqual({ ok: false, reason: "cut" });
    expect(decodePayload("1")).toEqual({ ok: false, reason: "cut" });
    expect(decodePayload("hello world")).toEqual({ ok: false, reason: "unreadable" });
    expect(decodePayload("abc")).toEqual({ ok: false, reason: "unreadable" }); // not a version number, so not "a newer app made this"
    expect(decodePayload("1abcdef!!!!")).toEqual({ ok: false, reason: "unreadable" });
    expect(decodePayload("x".repeat(MAX_PAYLOAD_LENGTH + 1))).toEqual({ ok: false, reason: "unreadable" });
  });

  it("a changed character is caught by the check", () => {
    const flipped = good.slice(0, 12) + (good[12] === "A" ? "B" : "A") + good.slice(13);
    expect(decodePayload(flipped)).toEqual({ ok: false, reason: "cut" });
  });

  // a well-formed payload (right check) that says something it shouldn't: each bad part is dropped, the good parts stay
  const forge = (wire: unknown) => {
    const body = Buffer.from(JSON.stringify(wire)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // borrow the real check function by round-tripping through encode: build the payload the way the app does
    return forgePayload(body);
  };
  function forgePayload(body: string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const check = Buffer.from([(h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255]).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").padEnd(6, "A");
    return "1" + check + body;
  }

  it("drops unknown shops, malformed codes, bad quantities and typed items outside 'own', keeps the rest", () => {
    const r = decodePayload(forge([
      ["tesco", ["s272407558", ["s314428665", 99], ["s../../etc/passwd"], ["g12"], ["gabc"], ["x123"], "s", 7, null, ["s314428665", "lots"], ["nWhat?"]]],
      ["evil", ["s123456789"]],
      ["own", ["nMilk", ["ncarrots", 0], ["n‮evil"], ["n   "], ["s272407558"]]],
      "not a group", [1, 2], [],
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entries).toEqual([
      { retailer: "tesco", kind: "shop", code: "272407558", qty: 1 },
      { retailer: "tesco", kind: "shop", code: "314428665", qty: 20 }, // 99 is capped to 20; the same product again ("lots" counts as 1) stays at the most, 20
      { retailer: "own", kind: "typed", code: "Milk", qty: 1 },
      { retailer: "own", kind: "typed", code: "carrots", qty: 1 },
      { retailer: "own", kind: "typed", code: "evil", qty: 1 },
    ]);
  });

  it("is not fooled by html or script in a typed item: it stays as words for the page to print as text", () => {
    const r = decodePayload(forge([["own", ["n<img src=x onerror=alert(1)>"]]]));
    expect(r.ok && r.entries[0]?.code).toBe("<img src=x onerror=alert(1)>"); // text only: React prints it as text
  });

  it("a payload that decodes to nothing usable is empty, and one that is not a list is unreadable", () => {
    expect(decodePayload(forge([["evil", ["s123456789"]]]))).toEqual({ ok: false, reason: "empty" });
    expect(decodePayload(forge({ a: 1 }))).toEqual({ ok: false, reason: "unreadable" });
    expect(decodePayload(forge("a string"))).toEqual({ ok: false, reason: "unreadable" });
    expect(decodePayload(forgePayload("!!"))).toEqual({ ok: false, reason: "unreadable" });
    expect(decodePayload(forgePayload("AAAA"))).toEqual({ ok: false, reason: "unreadable" });
  });

  it("never holds more than the most items in one list, however many are written", () => {
    const many = Array.from({ length: 150 }, (_, i) => `s${100000000 + i}`);
    const r = decodePayload(forge([["tesco", many]]));
    expect(r.ok && r.entries.length).toBe(MAX_SHARED_ITEMS);
  });
});

describe("addresses", () => {
  const payload = encodeEntries(toEntries([pancakes]))!.payload;

  it("makes the link people send", () => {
    expect(shareUrl("https://numbite.com", payload)).toBe(`https://numbite.com/l#${payload}`);
    expect(shareUrl("https://numbite.com/", payload)).toBe(`https://numbite.com/l#${payload}`);
    expect(SHARED_APP_PATH).toBe("/app/groceries/list/shared");
  });

  it("finds the payload in what was pasted: a link of any kind, with or without trailing marks, or the code alone", () => {
    for (const pasted of [
      `https://numbite.com/l#${payload}`, `  https://numbite.com/l#${payload}\n`, `numbite://l#${payload}`, `https://numbite.com/app/groceries/list/shared#${payload}`,
      `Here you go (https://numbite.com/l#${payload}).`, `look: https://numbite.com/l#${payload}.`, payload,
    ]) expect(payloadFrom(pasted), pasted).toBe(payload);
    for (const pasted of ["", "hello", "https://numbite.com/l", "https://numbite.com/l#", "https://numbite.com/l#abc", "a b c d e f g h"]) expect(payloadFrom(pasted), pasted).toBeNull();
  });

  it("lists the shops a list has items from, once each, in order, without typed items", () => {
    const entries: SharedEntry[] = [
      { retailer: "own", kind: "typed", code: "Milk", qty: 1 }, { retailer: "asda", kind: "barcode", code: "5030039010492", qty: 1 },
      { retailer: "tesco", kind: "shop", code: "272407558", qty: 1 }, { retailer: "asda", kind: "barcode", code: "5000000000000", qty: 1 },
    ];
    expect(shopsOf(entries)).toEqual(["asda", "tesco"]);
  });
});

describe("cleanTyped", () => {
  it("tidies, shortens and refuses empty words", () => {
    expect(cleanTyped("  Semi   skimmed\nmilk ")).toBe("Semi skimmed milk");
    expect(cleanTyped("x".repeat(100))?.length).toBe(60);
    expect(cleanTyped("​‮")).toBeNull();
    expect(cleanTyped("---")).toBeNull();
    expect(cleanTyped(42)).toBeNull();
    expect(cleanTyped("a‮b")).toBe("a b");
  });
});
