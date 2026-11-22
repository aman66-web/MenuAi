// Google Play Billing, checked on our server: the Android app hands over the purchase tokens Play Billing gave it (from a purchase, or from "Restore purchases", which
// reads the person's Google account) and this file decides whether each one is a real, current purchase of our subscription by asking Google itself (the Play Developer
// API, purchases.subscriptionsv2.get, with a service account). Unlike Apple's signed transactions a Google token proves nothing alone: Google's answer is the proof.
//
// What makes a purchase genuine (docs/ANDROID_BRIDGE.md, docs/PAYMENTS.md "Android (Google Play Billing)"):
//   1. Google knows the token for OUR package (the package is in the URL we ask, so another app's token is "not found");
//   2. a line item is our subscription (com.amanmarwaha.numbite.premium) and its base plan is "annual" or "monthly" (that is where the plan comes from);
//   3. the subscription is active (ACTIVE or IN_GRACE_PERIOD) or cancelled with its paid period still running (CANCELED, expiry in the future). Anything else (on hold,
//      paused, expired, refunded or revoked, which Google reports as expired, pending) gives no access.
// Then the access ends when the paid period ends plus the same few days' grace as every other subscription (plans.ts renewalExpiry).
//
// No new dependency: the service account's OAuth access token is an RS256 JWT signed with node:crypto, swapped at oauth2.googleapis.com for a bearer token that is kept
// in memory until shortly before it expires. Every call to Google goes through an injected `fetch`, so tests use a pretend Google. Nothing here logs or returns a key,
// an access token or a purchase token.

import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { GOOGLE_BASE_PLAN_IDS, GOOGLE_PACKAGE_NAME, GOOGLE_SUBSCRIPTION_ID } from "./googleIds";
import { renewalExpiry, type PlanId } from "./plans";

export { GOOGLE_PACKAGE_NAME, GOOGLE_SUBSCRIPTION_ID };
/** The base plans of that subscription and the plan each gives. A Map, so a base plan called "constructor" or "__proto__" can't find anything. */
export const GOOGLE_BASE_PLANS: ReadonlyMap<string, PlanId> = new Map<string, PlanId>([
  [GOOGLE_BASE_PLAN_IDS.annual, "annual"],
  [GOOGLE_BASE_PLAN_IDS.monthly, "monthly"],
]);

export const GOOGLE_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** Each call to Google gives up after this long (a request may check up to 10 purchases at once, so the whole answer stays within a function's time). */
export const GOOGLE_TIMEOUT_MS = 6_000;
/** An access token is swapped for a new one this long before Google says it ends. */
export const TOKEN_EARLY_MS = 60_000;

/** Why a purchase gave no access, for good reason (short codes the tests check and the server's log shows; never shown to anyone). */
export type GoogleRefusal =
  | "wrong_product" // not our subscription (the app said so, or none of Google's line items is ours)
  | "wrong_package" // Google's answer names another app
  | "no_line_item" // Google's answer has no line item
  | "unknown_base_plan" // our subscription, but a base plan we don't sell
  | "bad_response" // Google's answer isn't what we expect (an expiry that isn't a date)
  | "bad_token" // Google says the token isn't valid (400)
  | "not_found" // Google doesn't know the token for our package (404)
  | "gone" // Google no longer holds it: it expired long ago (410)
  | "on_hold" // payment failed and the grace period is over
  | "paused" // the person paused it
  | "pending" // not paid yet, or the purchase was cancelled before it was
  | "not_active" // any other state
  | "expired"; // the access it gave has ended

/** Why Google couldn't be asked, so nothing is known about the purchase (the caller answers 503, never "not paid"). */
export type GoogleUnavailable =
  | "google_down" // no answer, a timeout, a server error or Google asking us to slow down
  | "auth_failed" // our service account couldn't get an access token, or Google turned it down
  | "forbidden" // the service account isn't allowed to read purchases (Play Console › Users and permissions) or the API is off
  | "bad_reply"; // Google answered 200 with something that isn't JSON

export interface GooglePurchase {
  /** The subscription id the app says it holds (or `<subscription id>:<base plan>`). Google's answer decides; this only saves asking about anything else. */
  productId: string;
  /** Play Billing's purchaseToken. */
  token: string;
}

export type GoogleVerifyResult =
  | { ok: true; plan: PlanId; accessEnd: number; testPurchase: boolean }
  | { ok: false; transient: false; reason: GoogleRefusal }
  | { ok: false; transient: true; reason: GoogleUnavailable };

type Fetch = typeof fetch;

// ---- the service account

export interface GoogleServiceAccount {
  clientEmail: string;
  privateKey: KeyObject;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The service account's key file (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON): its JSON as downloaded from Google Cloud, or that JSON in base64 (some people keep a file's text in
 * one line that way). Null for anything else, a key that isn't an RSA key included, so a wrong value means "not set up" (the route answers 503), never a crash.
 */
export function parseServiceAccount(raw: string | undefined): GoogleServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const json = text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!isObject(parsed) || parsed.type !== "service_account") return null;
    const { client_email: email, private_key: pem } = parsed;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email) || typeof pem !== "string") return null;
    const privateKey = createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== "rsa") return null;
    return { clientEmail: email, privateKey };
  } catch {
    return null;
  }
}

/** The package name from GOOGLE_PLAY_PACKAGE_NAME: our default when unset, null when it is set to something that isn't an Android package name. */
export function parsePackageName(raw: string | undefined): string | null {
  const text = raw?.trim();
  if (!text) return GOOGLE_PACKAGE_NAME;
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(text) ? text : null;
}

const b64url = (value: unknown): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

/** The signed request for an access token (Google's "JWT bearer" grant): RS256 over the header and claims, valid for an hour. */
export function serviceAccountAssertion(account: GoogleServiceAccount, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const head = b64url({ alg: "RS256", typ: "JWT" });
  const claims = b64url({ iss: account.clientEmail, scope: GOOGLE_PUBLISHER_SCOPE, aud: GOOGLE_TOKEN_URL, iat, exp: iat + 3600 });
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(account.privateKey).toString("base64url");
  return `${head}.${claims}.${signature}`;
}

/** Gives a bearer token for Google's API. Throws (with no detail) when Google won't. */
export interface AccessTokenSource {
  get(nowMs: number, fresh?: boolean): Promise<string>;
}

/** An access token source that keeps the token Google gave in memory until shortly before it ends, and asks only once at a time. */
export function createAccessTokenSource(account: GoogleServiceAccount, fetchImpl: Fetch): AccessTokenSource {
  let cached: { token: string; endsAt: number } | null = null;
  let asking: Promise<string> | null = null;

  async function ask(nowMs: number): Promise<string> {
    const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAccountAssertion(account, nowMs) }).toString();
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("token_refused");
    const answer: unknown = await res.json();
    const token = isObject(answer) ? answer.access_token : undefined;
    const lifetime = isObject(answer) && typeof answer.expires_in === "number" && Number.isFinite(answer.expires_in) ? answer.expires_in : 3600;
    if (typeof token !== "string" || token.length < 10) throw new Error("token_missing");
    cached = { token, endsAt: nowMs + Math.min(Math.max(lifetime, 0), 3600) * 1000 };
    return token;
  }

  return {
    async get(nowMs, fresh = false) {
      if (!fresh && cached && nowMs < cached.endsAt - TOKEN_EARLY_MS) return cached.token;
      asking ??= ask(nowMs).finally(() => {
        asking = null;
      });
      return asking;
    },
  };
}

// ---- one purchase

export interface GoogleVerifyOptions {
  /** Now, milliseconds since 1970. */
  nowMs: number;
  /** The app's package name (in the address we ask Google, so another app's token is unknown). */
  packageName: string;
  fetch: Fetch;
  accessTokens: AccessTokenSource;
}

const refuse = (reason: GoogleRefusal): GoogleVerifyResult => ({ ok: false, transient: false, reason });
const unavailable = (reason: GoogleUnavailable): GoogleVerifyResult => ({ ok: false, transient: true, reason });

/** The app may name the subscription alone or with its base plan, the way the page names a plan (`<subscription id>:annual`). */
const isOurProduct = (productId: string): boolean => productId === GOOGLE_SUBSCRIPTION_ID || productId.startsWith(`${GOOGLE_SUBSCRIPTION_ID}:`);

/** Ask Google about one purchase token. Never throws, and never puts the token or a key in its answer. */
export async function verifyGooglePurchase(purchase: GooglePurchase, options: GoogleVerifyOptions): Promise<GoogleVerifyResult> {
  try {
    return await check(purchase, options);
  } catch {
    return unavailable("google_down");
  }
}

async function readPurchase(token: string, options: GoogleVerifyOptions, accessToken: string): Promise<Response> {
  const url = `${API_ROOT}/${encodeURIComponent(options.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  return options.fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
}

async function check(purchase: GooglePurchase, options: GoogleVerifyOptions): Promise<GoogleVerifyResult> {
  if (!isOurProduct(purchase.productId)) return refuse("wrong_product");

  let accessToken: string;
  try {
    accessToken = await options.accessTokens.get(options.nowMs);
  } catch {
    return unavailable("auth_failed");
  }
  let res = await readPurchase(purchase.token, options, accessToken);
  if (res.status === 401) {
    // the access token was turned down (revoked, or the clock drifted): one new one, once
    try {
      accessToken = await options.accessTokens.get(options.nowMs, true);
    } catch {
      return unavailable("auth_failed");
    }
    res = await readPurchase(purchase.token, options, accessToken);
    if (res.status === 401) return unavailable("auth_failed");
  }
  if (res.status === 403) return unavailable("forbidden");
  if (res.status === 400) return refuse("bad_token");
  if (res.status === 404) return refuse("not_found");
  if (res.status === 410) return refuse("gone");
  if (!res.ok) return unavailable("google_down"); // 429, 5xx and anything unexpected
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return unavailable("bad_reply");
  }
  return judge(body, options);
}

/** Google's SubscriptionPurchaseV2 turned into an answer. */
function judge(body: unknown, options: GoogleVerifyOptions): GoogleVerifyResult {
  if (!isObject(body)) return unavailable("bad_reply");
  if (typeof body.packageName === "string" && body.packageName !== options.packageName) return refuse("wrong_package");
  const items = Array.isArray(body.lineItems) ? body.lineItems.filter(isObject) : [];
  if (items.length === 0) return refuse("no_line_item");
  const ours = items.filter((item) => item.productId === GOOGLE_SUBSCRIPTION_ID);
  if (ours.length === 0) return refuse("wrong_product");

  // our line items that are a plan we sell, with when each one's paid period ends; the one that ends last counts
  let best: { plan: PlanId; expiry: number } | null = null;
  let problem: GoogleRefusal | null = null;
  for (const item of ours) {
    const basePlanId = isObject(item.offerDetails) ? item.offerDetails.basePlanId : undefined;
    const plan = typeof basePlanId === "string" ? GOOGLE_BASE_PLANS.get(basePlanId) : undefined;
    if (!plan) {
      problem ??= "unknown_base_plan";
      continue;
    }
    const expiry = typeof item.expiryTime === "string" ? Date.parse(item.expiryTime) : NaN;
    if (!Number.isFinite(expiry)) {
      problem ??= "bad_response";
      continue;
    }
    if (!best || expiry > best.expiry) best = { plan, expiry };
  }
  if (!best) return refuse(problem ?? "bad_response");

  const now = options.nowMs;
  const testPurchase = isObject(body.testPurchase);
  switch (body.subscriptionState) {
    case "SUBSCRIPTION_STATE_ACTIVE": {
      const accessEnd = renewalExpiry(best.expiry); // the paid period plus a few days' grace, so a renewal that lands a little late never locks anyone out
      return accessEnd > now ? { ok: true, plan: best.plan, accessEnd, testPurchase } : refuse("expired");
    }
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      // Google still gives access while it retries the payment: trust the state, and ask again (the app does, as the token runs low) rather than guess an end
      return { ok: true, plan: best.plan, accessEnd: renewalExpiry(Math.max(best.expiry, now)), testPurchase };
    case "SUBSCRIPTION_STATE_CANCELED":
      // cancelled, so it will not renew, but paid for until its expiry
      return best.expiry > now ? { ok: true, plan: best.plan, accessEnd: renewalExpiry(best.expiry), testPurchase } : refuse("expired");
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return refuse("on_hold");
    case "SUBSCRIPTION_STATE_PAUSED":
      return refuse("paused");
    case "SUBSCRIPTION_STATE_PENDING":
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      return refuse("pending");
    case "SUBSCRIPTION_STATE_EXPIRED":
      return refuse("expired");
    default:
      return refuse("not_active");
  }
}
