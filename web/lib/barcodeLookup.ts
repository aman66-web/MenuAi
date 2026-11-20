import type { Result } from "./handlers";
import { barcodeDigits, normaliseBarcode, offAnswerFromOff, type OffAnswer } from "./mm/barcodes";

// GET /api/v1/barcode/{code}: a barcode none of our lists holds, looked up at Open Food Facts (founder 2026-11-20: scan a barcode into the food diary). Our server asks,
// so the phone talks only to us (CLAUDE.md rule 4): only the barcode goes to Open Food Facts, with our own name as the User-Agent (never anyone's email, as its API
// terms ask of apps), and only the fields we use come back. One request per barcode: the answer (found or not) is kept in this server's memory for a day, keyed by
// the barcode alone, nothing about who asked. Every figure is checked (lib/mm/barcodes.ts offLabel) before it is sent on, and the phone checks it again.

export const OFF_USER_AGENT = "Numbite/1.1 (+https://numbite.com)";
/** Only what the screen uses: the name, the brand, the pack size, the serving, the per-100 figures and the front photo. */
export const OFF_FIELDS = "product_name,product_name_en,brands,quantity,serving_size,nutriments,image_front_url";
export const offProductUrl = (code: string): string => `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`;

const DAY_MS = 24 * 3600_000;
const MAX_KEPT = 5000;
/** Open Food Facts asks apps to stay under 100 product reads a minute; this server stays well under, whoever is asking. */
const PER_MINUTE = 50;
const TIMEOUT_MS = 8000;

export interface LookupDeps {
  fetch: typeof fetch;
  now: () => number;
}

/** The lookup with its own day-long memory and its own minute count (one per server instance; tests make their own). */
export function makeBarcodeLookup(deps: LookupDeps = { fetch: (...a) => fetch(...a), now: () => Date.now() }) {
  const kept = new Map<string, { at: number; answer: OffAnswer }>();
  const asking = new Map<string, Promise<OffAnswer | null>>();
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

  return async function lookup(raw: string): Promise<Result> {
    const code = barcodeDigits(raw);
    const key = code ? normaliseBarcode(code) : null;
    if (!code || !key) return { status: 400, body: { error: "bad_barcode", message: "A barcode is 8 to 14 digits." } };
    const now = deps.now();
    const hit = kept.get(key);
    if (hit && now - hit.at < DAY_MS) return answer(hit.answer, code);
    // the same barcode asked twice at once: one request
    let pending = asking.get(key);
    if (!pending) {
      calls = calls.filter((t) => now - t < 60_000);
      if (calls.length >= PER_MINUTE) return { status: 503, body: { error: "busy", message: "Try again in a minute." } };
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

/** The answer for the digits asked (a kept answer may have been asked with other leading zeros). */
function answer(a: OffAnswer, code: string): Result {
  return { status: 200, body: a.found ? { found: true, product: { ...a.product, code } } : { found: false } };
}

/** The one lookup this server instance keeps. */
export const barcodeLookup = makeBarcodeLookup();
