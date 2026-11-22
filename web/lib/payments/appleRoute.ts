import "server-only";
import { makeLimit } from "../auth/limiter";
import type { CorsOptions } from "../cors";
import { ipHash } from "../http";
import { parseCertificate } from "./apple";
import type { AppleEntitlementDeps } from "./appleHandler";
import { entitlementPrivateJwk } from "./signingKey";
import { signClaims } from "./token";

// The glue between POST /api/v1/entitlement/apple and its pure handler (appleHandler.ts): read the server's settings, rate-limit the caller. Nothing is read at import time.
//   ENTITLEMENT_PRIVATE_JWK  the key our access tokens are signed with (JSON); without it the route answers 503.
//   APPLE_XCODE_TEST_CERT    Xcode's StoreKit test certificate (PEM or base64 DER) of the Mac the founder tests from, so a test purchase made from Xcode (on the Mac's Simulator or
//                            the founder's phone, no money) works against the live server. Pinned to that one certificate, a token from it lasts 48 hours at most
//                            (appleHandler.ts), and it is set only for a test and removed afterwards (docs/PAYMENTS.md).

/** The iPhone app's pages may POST here (lib/cors.ts); nothing else cross-origin. */
export const APPLE_CORS: CorsOptions = { methods: "POST, OPTIONS", headers: "Content-Type" };
/** Up to 10 transactions of up to 20,000 characters each, plus the JSON around them. */
export const APPLE_MAX_BODY_BYTES = 210 * 1024;

const limit = makeLimit();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;

/** Xcode's test certificate, when one is set for a test. */
export function xcodeRootFromEnv(env: Record<string, string | undefined> = process.env): Buffer | undefined {
  const raw = env.APPLE_XCODE_TEST_CERT;
  return (raw && parseCertificate(raw)) || undefined;
}

export function appleContext(request: Request, nowMs: number = Date.now()): AppleEntitlementDeps {
  const jwk = entitlementPrivateJwk();
  return {
    sign: jwk ? (claims) => signClaims(claims, jwk) : null,
    nowMs,
    allow: () => limit("pay:apple", ipHash(request) ?? "unknown", MAX_PER_WINDOW, WINDOW_MS),
    verifyOptions: { xcodeRoot: xcodeRootFromEnv() },
    note: (message) => console.warn(message), // reason codes only (Vercel's logs), so a failed purchase check can be put right
  };
}
