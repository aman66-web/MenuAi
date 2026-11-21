import "server-only";
import { makeLimit } from "../auth/limiter";
import { appleDeviceCheck, deviceCheckConfigFromEnv } from "./deviceCheck";
import type { AccountEntitlementDeps } from "./freeWeek";
import { supabaseFreeWeek } from "./freeWeekStore-supabase";
import { signClaims } from "./token";

// The glue between POST /api/v1/entitlement/account and its pure handler (lib/payments/freeWeek.ts): read the server's settings, rate-limit the account. Nothing
// is read at import time.
//   ENTITLEMENT_PRIVATE_JWK  the key our access tokens are signed with (JSON); without it the route answers 503.
//   FREE_WEEK_HASH_SECRET    the secret the email and Apple ID hashes are keyed with (at least 32 characters, e.g. `openssl rand -base64 48`); without it the route
//                            answers 503 (no free week is given that couldn't be remembered). NEVER change it once set: every hash would change, and everyone
//                            could have a second free week.
//   DEVICECHECK_KEY_ID, DEVICECHECK_TEAM_ID (or APPLE_TEAM_ID), DEVICECHECK_PRIVATE_KEY  Apple's DeviceCheck (lib/payments/deviceCheck.ts); optional.

const limit = makeLimit();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;

function privateJwk(): JsonWebKey | null {
  try {
    const raw = process.env.ENTITLEMENT_PRIVATE_JWK;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as JsonWebKey) : null;
  } catch {
    return null; // a key that isn't JSON counts as not set up
  }
}

export function freeWeekContext(nowMs: number = Date.now(), env: Record<string, string | undefined> = process.env): AccountEntitlementDeps {
  const jwk = privateJwk();
  const dc = deviceCheckConfigFromEnv(env);
  return {
    sign: jwk ? (claims) => signClaims(claims, jwk) : null,
    secret: env.FREE_WEEK_HASH_SECRET?.trim() || null,
    store: supabaseFreeWeek,
    deviceCheck: dc ? appleDeviceCheck(dc, { fetch: (url, init) => fetch(url, init), now: () => Date.now() }) : null,
    nowMs,
    allow: (userId) => limit("free-week", userId, MAX_PER_WINDOW, WINDOW_MS),
    note: (message) => console.warn(message), // reason codes only (Vercel's logs)
  };
}
