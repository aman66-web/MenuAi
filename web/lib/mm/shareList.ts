import { CUSTOM_RETAILER, MAX_CUSTOM_NAME, MAX_QTY, RETAILERS, isShopId, withoutDone, type ShoppingItem } from "./groceries";
import { tk } from "./i18n";

// Sharing a shopping list (founder 2026-10-15: "when the person presses share then sends it to someone they know, they get a link saying to download the app to
// view their shopping list ... so that shopping lists can be easily shared"). The link CONTAINS the list, after the "#": https://numbite.com/l#<payload>. The part
// after "#" is never sent to a server (not by the browser, not by a messaging app's link preview), so nothing is stored anywhere and no account is needed: the list
// goes from phone to phone inside the link. What travels is only references, never prices or numbers: for each shop the products' ids (the shop's own product id,
// or a barcode) and how many, plus the words of typed-in items. The person who opens it reads the shop's own list for the names, pictures and prices, so they
// see today's, not the sender's. Pure and unit-tested; no browser APIs here except btoa/atob (also in Node).

export const SHARE_PATH = "/l";
/** Where a shared list is read inside the app (a static page: the list is in its "#"). */
export const SHARED_APP_PATH = "/app/groceries/list/shared";
/** Most items in one link, and the longest payload (characters): a link a messaging app might cut short is worse than a list that says it is shorter. */
export const MAX_SHARED_ITEMS = 100;
export const MAX_PAYLOAD_LENGTH = 6000;

const VERSION = "1";
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const SHOPS: ReadonlySet<string> = new Set(RETAILERS.map((r) => r.id));
const GTIN = /^\d{8,14}$/;

export interface SharedEntry {
  /** A supermarket's id, or CUSTOM_RETAILER for a typed-in item. */
  retailer: string;
  /** "shop": the shop's own product id (`code`); "barcode": the barcode (`code`); "typed": the words (`code`). */
  kind: "shop" | "barcode" | "typed";
  code: string;
  qty: number;
}

export type DecodeFailure = "empty" | "version" | "cut" | "unreadable";

/** What to tell someone whose link can't be read (the app's name goes in as {app}). */
export const SHARE_PROBLEM: Record<DecodeFailure, string> = {
  empty: tk("There is nothing to show in this link. Ask your friend to send the list again."),
  version: tk("This link was made by a newer version of {app}. Update the app to open it."),
  cut: tk("This link looks cut short, so the list can't be read. Ask your friend to send it again."),
  unreadable: tk("This doesn't look like a shopping list link. Ask your friend to send it again."),
};
export type Decoded = { ok: true; entries: SharedEntry[] } | { ok: false; reason: DecodeFailure };

// ---- the words of a typed-in item

/** Control characters and the invisible ones that reorder text are not words (a link can come from anybody). The joiners U+200C and U+200D stay: Persian, Urdu and Indic words need them. */
const NOT_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** A typed-in item's words as they will be shown: tidied, short, and with something readable in them; else null. */
export function cleanTyped(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const name = text.replace(NOT_TEXT, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_NAME).trim();
  return /\p{L}|\p{N}/u.test(name) ? name : null;
}

// ---- from the list to the entries

const entryKey = (e: Pick<SharedEntry, "retailer" | "kind" | "code">) => `${e.retailer}|${e.kind}|${e.kind === "typed" ? e.code.toLowerCase() : e.code}`;

/** What to put in a link for these items: the ones still to get (ticked ones are in the basket), one entry per product, quantities kept. */
export function toEntries(list: readonly ShoppingItem[]): SharedEntry[] {
  const out = new Map<string, SharedEntry>();
  for (const i of withoutDone(list)) {
    const e: SharedEntry | null = i.custom
      ? (cleanTyped(i.name) ? { retailer: CUSTOM_RETAILER, kind: "typed", code: cleanTyped(i.name)!, qty: i.qty } : null)
      : i.shopId && isShopId(i.shopId) && SHOPS.has(i.retailer)
        ? { retailer: i.retailer, kind: "shop", code: i.shopId, qty: i.qty }
        : i.gtin && GTIN.test(i.gtin) && SHOPS.has(i.retailer)
          ? { retailer: i.retailer, kind: "barcode", code: i.gtin, qty: i.qty }
          : null;
    if (!e) continue;
    const key = entryKey(e);
    const had = out.get(key);
    if (had) had.qty = Math.min(MAX_QTY, had.qty + e.qty);
    else out.set(key, { ...e, qty: Math.min(MAX_QTY, Math.max(1, Math.floor(e.qty) || 1)) });
  }
  return [...out.values()];
}

// ---- the payload

/** The shape that is written: a list of [retailer, [item, ...]] where an item is its code ("s" + shop id, "g" + barcode, "n" + words) or [code, quantity] when more than one. */
type Wire = Array<[string, Array<string | [string, number]>]>;

const KIND_CHAR = { shop: "s", barcode: "g", typed: "n" } as const;
const CHAR_KIND: Record<string, SharedEntry["kind"]> = { s: "shop", g: "barcode", n: "typed" };

function toWire(entries: readonly SharedEntry[]): Wire {
  const groups = new Map<string, Array<string | [string, number]>>();
  for (const e of entries) {
    const code = KIND_CHAR[e.kind] + e.code;
    groups.set(e.retailer, [...(groups.get(e.retailer) ?? []), e.qty > 1 ? [code, e.qty] : code]);
  }
  return [...groups.entries()];
}

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function fromBase64Url(body: string): string | null {
  try {
    const bin = atob(body.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (body.length % 4)) % 4));
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** Six characters that say whether the link arrived whole (FNV-1a of the body): a messaging app that cuts a long link short is caught, not half-read. */
function checksum(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const bytes = String.fromCharCode((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").padEnd(6, "A");
}

export interface Encoded {
  payload: string;
  /** How many of the entries went in, and how many there were: fewer when the list is too long for one link. */
  included: number;
  total: number;
}

/** The payload for these entries, the first as many as fit (MAX_SHARED_ITEMS items, MAX_PAYLOAD_LENGTH characters); null when there is nothing to share. */
export function encodeEntries(entries: readonly SharedEntry[]): Encoded | null {
  const total = entries.length;
  if (total === 0) return null;
  const encodeFirst = (n: number) => {
    const body = toBase64Url(JSON.stringify(toWire(entries.slice(0, n))));
    return VERSION + checksum(body) + body;
  };
  let n = Math.min(total, MAX_SHARED_ITEMS);
  let payload = encodeFirst(n);
  // too long: take items off the end, quickly at first (a list is rarely this long, so a loop that halves then steps is plenty)
  while (payload.length > MAX_PAYLOAD_LENGTH && n > 1) {
    n = Math.max(1, payload.length > MAX_PAYLOAD_LENGTH * 1.5 ? Math.floor(n / 2) : n - 1);
    payload = encodeFirst(n);
  }
  return payload.length > MAX_PAYLOAD_LENGTH ? null : { payload, included: n, total };
}

/** Everything the payload says, or why it can't be read. Nothing in it is trusted: shops, codes, words and quantities are all checked. */
export function decodePayload(raw: string): Decoded {
  const payload = raw.trim();
  if (!payload) return { ok: false, reason: "empty" };
  if (payload.length > MAX_PAYLOAD_LENGTH || !BASE64URL.test(payload)) return { ok: false, reason: "unreadable" };
  // a version is a digit: a link made by a newer app says so; anything else is simply not one of our links
  if (!/^\d/.test(payload)) return { ok: false, reason: "unreadable" };
  if (payload[0] !== VERSION) return { ok: false, reason: "version" };
  const check = payload.slice(1, 7);
  const body = payload.slice(7);
  if (body.length === 0 || check.length < 6) return { ok: false, reason: "cut" };
  if (checksum(body) !== check) return { ok: false, reason: "cut" };
  const text = fromBase64Url(body);
  if (text === null) return { ok: false, reason: "unreadable" };
  let wire: unknown;
  try {
    wire = JSON.parse(text);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!Array.isArray(wire)) return { ok: false, reason: "unreadable" };
  const out = new Map<string, SharedEntry>();
  for (const group of wire) {
    if (!Array.isArray(group) || group.length !== 2 || typeof group[0] !== "string" || !Array.isArray(group[1])) continue;
    const retailer = group[0];
    if (retailer !== CUSTOM_RETAILER && !SHOPS.has(retailer)) continue;
    for (const item of group[1]) {
      if (out.size >= MAX_SHARED_ITEMS) break;
      const [code, qty] = Array.isArray(item) ? item : [item, 1];
      if (typeof code !== "string" || code.length < 2) continue;
      const kind = CHAR_KIND[code[0]!];
      const value = code.slice(1);
      if (!kind || (kind === "typed") !== (retailer === CUSTOM_RETAILER)) continue;
      const clean = kind === "typed" ? cleanTyped(value) : kind === "barcode" ? (GTIN.test(value) ? value : null) : isShopId(value) ? value : null;
      if (!clean) continue;
      const n = typeof qty === "number" && Number.isFinite(qty) ? Math.min(MAX_QTY, Math.max(1, Math.floor(qty))) : 1;
      const entry: SharedEntry = { retailer, kind, code: clean, qty: n };
      const key = entryKey(entry);
      const had = out.get(key);
      if (had) had.qty = Math.min(MAX_QTY, had.qty + n);
      else out.set(key, entry);
    }
  }
  return out.size === 0 ? { ok: false, reason: "empty" } : { ok: true, entries: [...out.values()] };
}

// ---- addresses

/** The link people send: https://numbite.com/l#<payload>. */
export const shareUrl = (base: string, payload: string): string => `${base.replace(/\/+$/, "")}${SHARE_PATH}#${payload}`;

/**
 * The payload in whatever was pasted: the whole link (https://numbite.com/l#..., the app's own address, numbite://l#...) or just the code after the "#". A link
 * that a chat app has put a full stop or a bracket after still reads. Null when nothing in it looks like a payload.
 */
export function payloadFrom(pasted: string): string | null {
  const text = pasted.trim();
  // The link itself first (the last one, a message ends with it), so a hashtag in an item's name ("#pancakes") can't be taken for it; else the last "#code".
  let fromLink: string | undefined;
  for (const m of text.matchAll(/(?:https?:\/\/|numbite:\/\/)[^\s#]*#([A-Za-z0-9_-]{8,})/g)) fromLink = m[1];
  if (fromLink) return fromLink;
  let fromTag: string | undefined;
  for (const m of text.matchAll(/#([A-Za-z0-9_-]{8,})/g)) fromTag = m[1];
  if (fromTag) return fromTag;
  return /^[A-Za-z0-9_-]{8,}$/.test(text) ? text : null;
}

/** Which shops a list has items from, in the order they first appear (typed-in items aren't a shop). */
export function shopsOf(entries: readonly SharedEntry[]): string[] {
  return [...new Set(entries.filter((e) => e.retailer !== CUSTOM_RETAILER).map((e) => e.retailer))];
}
