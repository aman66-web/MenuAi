// POST /api/v1/entitlement/apple as a pure function: the iPhone app sends the StoreKit 2 signed transactions it holds (from a purchase, or from "Restore purchases",
// which goes through the person's Apple ID), and gets back our access token (lib/payments/token.ts) for the one whose access ends last. Stateless: Apple keeps the
// purchase record, so nothing is stored here, and nothing personal is logged or put in the token.

import { z } from "zod";
import type { Result } from "../handlers";
import { verifyAppleTransaction, type AppleVerifyOptions } from "./apple";
import type { EntitlementClaims } from "./token";

export interface AppleEntitlementDeps {
  /** null when the server has no signing key (ENTITLEMENT_PRIVATE_JWK): answered with 503. */
  sign: ((claims: EntitlementClaims) => Promise<string>) | null;
  nowMs: number;
  /** false when the caller has asked too often. */
  allow: () => boolean;
  /** Which roots to trust; the time comes from nowMs. */
  verifyOptions: Omit<AppleVerifyOptions, "nowMs">;
  /** Told why a request gave no access (reason codes only, and for a refused Xcode test purchase its public certificate, so it can be pinned for a test). Never
   *  anything personal: a transaction's ids, dates and price are not passed on. */
  note?: (message: string) => void;
}

/** The last certificate of a JWS's x5c header (base64 DER, public), or null. */
function lastCertificate(jws: string): string | null {
  try {
    const header = JSON.parse(Buffer.from(jws.split(".")[0] ?? "", "base64url").toString("utf8")) as { x5c?: unknown };
    const chain = Array.isArray(header.x5c) ? header.x5c : [];
    const last = chain[chain.length - 1];
    return typeof last === "string" && /^[A-Za-z0-9+/=]{100,8000}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

/** A compact JWS is base64url parts joined by dots; a real StoreKit transaction is about 5,000 to 7,000 characters. */
const transactionSchema = z
  .string()
  .min(20)
  .max(20_000)
  .regex(/^[A-Za-z0-9._-]+$/);
const bodySchema = z.strictObject({ transactions: z.array(transactionSchema).min(1).max(10) });

/** The longest a token from an Xcode test purchase lasts. */
export const XCODE_ACCESS_MS = 48 * 60 * 60 * 1000;

export async function handleAppleEntitlement(body: unknown, deps: AppleEntitlementDeps): Promise<Result> {
  if (!deps.sign) return { status: 503, body: { error: "unavailable" } };
  if (!deps.allow()) return { status: 429, body: { error: "rate_limited" } };
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_request" } };

  let best: { plan: EntitlementClaims["plan"]; accessEnd: number } | null = null;
  const refused: string[] = [];
  let xcodeCert: string | null = null;
  for (const jws of parsed.data.transactions) {
    const result = verifyAppleTransaction(jws, { ...deps.verifyOptions, nowMs: deps.nowMs });
    if (!result.ok) {
      refused.push(result.reason);
      if (result.reason === "xcode_not_allowed" || (result.reason === "untrusted_root" && deps.verifyOptions.xcodeRoot)) xcodeCert ??= lastCertificate(jws);
      continue;
    }
    // A test purchase from Xcode's local store (testing on the Mac or the founder's phone) gives at most 48 hours, whatever it was for.
    const accessEnd = result.environment === "Xcode" ? Math.min(result.accessEnd, deps.nowMs + XCODE_ACCESS_MS) : result.accessEnd;
    if (!best || accessEnd > best.accessEnd) best = { plan: result.plan, accessEnd };
  }
  if (!best) {
    deps.note?.(`apple entitlement: none of ${refused.length} gave access (${refused.join(", ")})${xcodeCert ? `; Xcode test certificate: ${xcodeCert}` : ""}`);
    return { status: 402, body: { error: "not_paid" } };
  }

  const claims: EntitlementClaims = { v: 1, plan: best.plan, src: "apple", iat: Math.floor(deps.nowMs / 1000), exp: Math.floor(best.accessEnd / 1000) };
  return { status: 200, body: { token: await deps.sign(claims), plan: best.plan, expiresAt: best.accessEnd } };
}
