import type { Result } from "./handlers";
import { makeLimit, type Limit } from "./auth/limiter";
import { barcodeDigits, normaliseBarcode, offAnswerFromOff, validGs1, type OffAnswer } from "./mm/barcodes";

// GET /api/v1/barcode/{code}: a barcode none of our lists holds, looked up at Open Food Facts (founder 2026-11-20: scan a barcode into the food diary). Our server asks,
// so the phone talks only to us (CLAUDE.md rule 4): only the barcode goes to Open Food Facts, with our own name as the User-Agent (never anyone's email, as its API
// terms ask of apps), and only the fields we use come back. One request per barcode: the answer (found or not) is kept in this server's memory for a day, keyed by
// the barcode alone, nothing about who asked. Every figure is checked (lib/mm/barcodes.ts offLabel) before it is sent on, and the phone checks it again. The only
// thing about the caller is a salted one-way hash of the IP address for the per-caller count (PER_CALLER_PER_MINUTE), in this server's memory for a day at most.

export const OFF_USER_AGENT = "Numbite/1.1 (+https://numbite.com)";
/** Only what the screen uses: the name, the brand, the pack size, the serving, the per-100 figures and the front photo. */
export const OFF_FIELDS = "product_name,product_name_en,brands,quantity,serving_size,nutriments,image_front_url";
export const offProductUrl = (code: string): string => `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`;

const DAY_MS = 24 * 3600_000;
const MAX_KEPT = 5000;
/** Open Food Facts asks apps to stay under 100 product reads a minute; this server stays well under, whoever is asking. */
const PER_MINUTE = 50;
/**
 * New barcodes one caller may have looked up a minute (cache hits are never counted): without it one caller could spend the whole server's allowance and
 * leave everyone else "busy" (the meeting of 21 November 2026, Umar). A new anti-abuse limit, told to the founder; a person scanning their shopping is far under it.
 */
export const PER_CALLER_PER_MINUTE = 15;
const TIMEOUT_MS = 8000;

export interface LookupDeps {
  fetch: typeof fetch;
  now: () => number;
  /** The per-caller count (lib/auth/limiter.ts); tests make their own. */
  limit?: Limit;
}

/** The lookup with its own day-long memory and its own minute count (one per server instance; tests make their own). */
export function makeBarcodeLookup(deps: LookupDeps = { fetch: (...a) => fetch(...a), now: () => Date.now() }) {
  const kept = new Map<string, { at: number; answer: OffAnswer }>();
  const asking = new Map<string, Promise<OffAnswer | null>>();
  // the per-caller count starts again each day, so no caller's hash is held longer than that (the privacy page says "a day at most")
  let limit = deps.limit ?? makeLimit(deps.now);
  let limitSince = deps.now();
  let calls: number[] = [];

  /** Open Food Facts' answer, or null when it couldn't be had (no connection, its server busy or down): that is never kept. */
  async function ask(code: string): Promise<OffAnswer | null> {
    let res: Response;
    try {
      res = await deps.fetch(offProductUrl(code), { headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      return null;
    }
    // a barcode it doesn't have is a 404 with a small JSON body
    if (res.status === 404) return { found: false };
    if (!res.ok) return null;
    try {
      return offAnswerFromOff(code, await res.json());
    } catch {
      return null;
    }
  }

  /** `who`: the caller's salted IP hash (lib/http.ts ipHash), counted against PER_CALLER_PER_MINUTE; none (no address known) is counted only in the server's total. */
  return async function lookup(raw: string, who?: string): Promise<Result> {
    const code = barcodeDigits(raw);
    const key = code ? normaliseBarcode(code) : null;
    if (!code || !key) return { status: 400, body: { error: "bad_barcode", message: "A barcode is 8 to 14 digits." } };
    // a number whose check digit is wrong is no product's (a slip, or one still being typed): never sent on, so it spends none of Open Food Facts' limit
    // (the 30-person meeting, 21 November 2026, Grace)
    if (!validGs1(code)) return { status: 400, body: { error: "bad_barcode", message: "That isn't a whole barcode: check the number." } };
    const now = deps.now();
    const hit = kept.get(key);
    if (hit && now - hit.at < DAY_MS) return answer(hit.answer, code);
    // the same barcode asked twice at once: one request
    let pending = asking.get(key);
    if (!pending) {
      calls = calls.filter((t) => now - t < 60_000);
      if (calls.length >= PER_MINUTE) return BUSY;
      if (!deps.limit && now - limitSince >= DAY_MS) [limit, limitSince] = [makeLimit(deps.now), now];
      // one caller's own share, counted only for a request that is really sent; a 503 (never 429, which the app reads as offline), so the app says its own
      // "Couldn't look it up just now. Try again."
      if (who && !limit("barcode", who, PER_CALLER_PER_MINUTE, 60_000)) return BUSY;
      calls.push(now);
      pending = ask(code).finally(() => asking.delete(key));
      asking.set(key, pending);
    }
    const got = await pending;
    if (!got) return { status: 502, body: { error: "unavailable", message: "Open Food Facts couldn't be reached. Try again." } };
    kept.delete(key);
    kept.set(key, { at: deps.now(), answer: got });
    while (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value as string);
    return answer(got, code);
  };
}

const BUSY: Result = { status: 503, body: { error: "busy", message: "Try again in a minute." } };

/** The answer for the digits asked (a kept answer may have been asked with other leading zeros). */
function answer(a: OffAnswer, code: string): Result {
  return { status: 200, body: a.found ? { found: true, product: { ...a.product, code } } : { found: false } };
}

/** The one lookup this server instance keeps. */
export const barcodeLookup = makeBarcodeLookup();
