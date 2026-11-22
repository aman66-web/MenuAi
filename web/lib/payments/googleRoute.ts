import "server-only";
import { makeLimit } from "../auth/limiter";
import type { CorsOptions } from "../cors";
import { ipHash } from "../http";
import { createAccessTokenSource, parsePackageName, parseServiceAccount, verifyGooglePurchase, type AccessTokenSource, type GoogleServiceAccount } from "./google";
import type { GoogleEntitlementDeps } from "./googleHandler";
import { entitlementPrivateJwk } from "./signingKey";
import { signClaims } from "./token";

// The glue between POST /api/v1/entitlement/google and its pure handler (googleHandler.ts): read the server's settings, rate-limit the caller. Nothing is read at import time.
//   ENTITLEMENT_PRIVATE_JWK            the key our access tokens are signed with (JSON); without it the route answers 503.
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   the whole key file of the Google Cloud service account that may read our Play purchases (Sensitive in Vercel); without it, or when it
//                                      isn't a service account's RSA key, the route answers 503 and checks nothing.
//   GOOGLE_PLAY_PACKAGE_NAME           the Android app's package name; com.amanmarwaha.numbite when unset. A value that isn't a package name counts as not set up.

/** The Android app's pages may POST here (lib/cors.ts); nothing else cross-origin. */
export const GOOGLE_CORS: CorsOptions = { methods: "POST, OPTIONS", headers: "Content-Type" };
/** Up to 10 purchases of up to 4,000 characters of token each, plus the JSON around them. */
export const GOOGLE_MAX_BODY_BYTES = 48 * 1024;

const limit = makeLimit();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;

type Fetch = typeof fetch;

/** The access token Google gave our service account lives in module memory (one per server instance) until shortly before it ends, whichever request asked for it. */
let held: { raw: string; fetchImpl: Fetch; account: GoogleServiceAccount; tokens: AccessTokenSource } | null = null;

function tokensFor(raw: string, fetchImpl: Fetch): { account: GoogleServiceAccount; tokens: AccessTokenSource } | null {
  if (held && held.raw === raw && held.fetchImpl === fetchImpl) return held;
  const account = parseServiceAccount(raw);
  if (!account) return null;
  held = { raw, fetchImpl, account, tokens: createAccessTokenSource(account, fetchImpl) };
  return held;
}

export function googleContext(request: Request, nowMs: number = Date.now(), fetchImpl: Fetch = fetch, env: Record<string, string | undefined> = process.env): GoogleEntitlementDeps {
  const jwk = entitlementPrivateJwk(env);
  const packageName = parsePackageName(env.GOOGLE_PLAY_PACKAGE_NAME);
  const source = packageName ? tokensFor(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "", fetchImpl) : null;
  return {
    sign: jwk ? (claims) => signClaims(claims, jwk) : null,
    nowMs,
    allow: () => limit("pay:google", ipHash(request) ?? "unknown", MAX_PER_WINDOW, WINDOW_MS),
    verify: source && packageName ? (purchase, at) => verifyGooglePurchase(purchase, { nowMs: at, packageName, fetch: fetchImpl, accessTokens: source.tokens }) : null,
    note: (message) => console.warn(message), // reason codes only (Vercel's logs), so a failed purchase check can be put right
  };
}
