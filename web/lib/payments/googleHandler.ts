// POST /api/v1/entitlement/google as a pure function: the Android app sends the Google Play purchase tokens it holds (from a purchase, or from "Restore purchases", which goes
// through the person's Google account), and gets back our access token (lib/payments/token.ts, src "google") for the one whose access ends last. Google keeps the purchase
// record and is asked about each token (lib/payments/google.ts); nothing is stored here, and nothing personal is logged or put in the token. A purchase token is never
// logged or sent back.

import { z } from "zod";
import type { Result } from "../handlers";
import type { GooglePurchase, GoogleVerifyResult } from "./google";
import type { EntitlementClaims } from "./token";

export interface GoogleEntitlementDeps {
  /** null when the server has no signing key (ENTITLEMENT_PRIVATE_JWK): answered with 503. */
  sign: ((claims: EntitlementClaims) => Promise<string>) | null;
  nowMs: number;
  /** false when the caller has asked too often. */
  allow: () => boolean;
  /** Asks Google about one purchase; null when the server has no service account (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) or package name: answered with 503. */
  verify: ((purchase: GooglePurchase, nowMs: number) => Promise<GoogleVerifyResult>) | null;
  /** Told why a request gave no access (reason codes and counts only: never a token, a key or anything about the person). */
  note?: (message: string) => void;
}

/** What Play Billing gives: the subscription id (as the app names the product) and the purchase token (opaque, up to 4,000 characters of [A-Za-z0-9._-]). */
const purchaseSchema = z.strictObject({
  productId: z.string().regex(/^[a-z0-9._:]{3,100}$/),
  token: z.string().regex(/^[A-Za-z0-9._-]{10,4000}$/),
});
const bodySchema = z.strictObject({ purchases: z.array(purchaseSchema).min(1).max(10) });

export async function handleGoogleEntitlement(body: unknown, deps: GoogleEntitlementDeps): Promise<Result> {
  if (!deps.sign || !deps.verify) return { status: 503, body: { error: "unavailable" } };
  if (!deps.allow()) return { status: 429, body: { error: "rate_limited" } };
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_request" } };

  // the same token twice is asked about once
  const seen = new Set<string>();
  const purchases = parsed.data.purchases.filter((p) => !seen.has(p.token) && seen.add(p.token));
  const verify = deps.verify;
  const results = await Promise.all(purchases.map((p) => verify(p, deps.nowMs).catch((): GoogleVerifyResult => ({ ok: false, transient: true, reason: "google_down" }))));

  let best: { plan: EntitlementClaims["plan"]; accessEnd: number } | null = null;
  const refused: string[] = [];
  const unreached: string[] = [];
  for (const result of results) {
    if (!result.ok) {
      (result.transient ? unreached : refused).push(result.reason);
      continue;
    }
    if (!best || result.accessEnd > best.accessEnd) best = { plan: result.plan, accessEnd: result.accessEnd };
  }
  if (!best) {
    if (unreached.length > 0) {
      // Google couldn't be asked about at least one, so "not paid" would be a guess: the app keeps what it has and asks again
      deps.note?.(`google entitlement: could not check ${unreached.length} of ${results.length} (${unreached.join(", ")})`);
      return { status: 503, body: { error: "unavailable" } };
    }
    deps.note?.(`google entitlement: none of ${refused.length} gave access (${refused.join(", ")})`);
    return { status: 402, body: { error: "not_paid" } };
  }

  const claims: EntitlementClaims = { v: 1, plan: best.plan, src: "google", iat: Math.floor(deps.nowMs / 1000), exp: Math.floor(best.accessEnd / 1000) };
  return { status: 200, body: { token: await deps.sign(claims), plan: best.plan, expiresAt: best.accessEnd } };
}
