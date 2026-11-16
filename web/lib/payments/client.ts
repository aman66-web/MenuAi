// The browser's side of paying: start Checkout, come back and claim the access token, restore it for a signed-in person. Every token is checked with the public key
// before it counts (lib/payments/token.ts), so a changed or made-up token does nothing. Only called on the website's build (WEB_PRO_ENABLED); in the iPhone app,
// access comes from the App Store through the same token (docs/PAYMENTS.md).

import { forgetPaidToken, keepPaidToken, paidStore } from "../mm/stores";
import type { PlanId } from "./plans";
import { currentRef } from "./ref";
import { verifyToken } from "./token";

/** True in the iPhone app's copy. The app never starts a payment on our own website (App Store rule 3.1.1: purchases there go through Apple), so the two functions that talk to
 *  Stripe's side return at once, and written as a build-time constant the rest of their code is left out of the app's files. */
const IN_APP = process.env.NEXT_PUBLIC_APP_BUILD === "1";

/** The server's public key, set at build time (NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK, a JSON string). Absent = no token can be accepted. */
function publicKey(): JsonWebKey | null {
  try {
    const raw = process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK;
    return raw ? (JSON.parse(raw) as JsonWebKey) : null;
  } catch {
    return null;
  }
}

/** Checks a token and keeps it if it is genuine and current. Returns whether the device is now paid. */
export async function acceptToken(token: string, nowMs: number = Date.now()): Promise<boolean> {
  const key = publicKey();
  const claims = key ? await verifyToken(token, key, nowMs) : null;
  if (!claims) return false;
  keepPaidToken(token, claims.plan, claims.exp * 1000);
  return true;
}

/** On start-up: a stored token that no longer checks out (run out, changed) is forgotten. */
export async function recheckStoredToken(nowMs: number = Date.now()): Promise<void> {
  const { token } = paidStore.get();
  if (token && !(await acceptToken(token, nowMs))) forgetPaidToken();
}

// ---- the creator code (?ref=): held in memory only, see lib/payments/ref.ts

export { captureRef, currentRef, forgetRef } from "./ref";

// ---- calls to our own API

export type PayResult = { ok: true } | { ok: false; error: "unavailable" | "failed" | "not_paid" | "none" };

export async function startCheckout(plan: PlanId, fetchImpl: typeof fetch = fetch): Promise<{ url: string } | { error: "unavailable" | "failed" }> {
  if (IN_APP) return { error: "unavailable" };
  try {
    const ref = currentRef();
    const res = await fetchImpl("/api/v1/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, ...(ref ? { ref } : {}) }) });
    if (res.status === 503) return { error: "unavailable" };
    const body = (await res.json().catch(() => ({}))) as { url?: unknown };
    return res.ok && typeof body.url === "string" && body.url.startsWith("https://checkout.stripe.com/") ? { url: body.url } : { error: "failed" };
  } catch {
    return { error: "failed" };
  }
}

export async function claimSession(sessionId: string, fetchImpl: typeof fetch = fetch): Promise<PayResult> {
  if (IN_APP) return { ok: false, error: "unavailable" };
  try {
    const res = await fetchImpl("/api/v1/entitlement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
    if (res.status === 503) return { ok: false, error: "unavailable" };
    if (res.status === 402) return { ok: false, error: "not_paid" };
    const body = (await res.json().catch(() => ({}))) as { token?: unknown };
    return res.ok && typeof body.token === "string" && (await acceptToken(body.token)) ? { ok: true } : { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** A signed-in person's access, by their verified email (paid on the website, signed in on this device). */
export async function restoreFromAccount(fetchImpl: typeof fetch = fetch): Promise<PayResult> {
  try {
    const res = await fetchImpl("/api/v1/entitlement/me", { credentials: "same-origin" });
    if (res.status === 404 || res.status === 401) return { ok: false, error: "none" };
    if (res.status === 503) return { ok: false, error: "unavailable" };
    const body = (await res.json().catch(() => ({}))) as { token?: unknown };
    return res.ok && typeof body.token === "string" && (await acceptToken(body.token)) ? { ok: true } : { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}
