// POST /api/v1/entitlement/account as a pure function: a signed-in account asks whether it has Premium of its own (not bought), and gets back the same signed token
// a purchase gives (lib/payments/token.ts, src "account"):
//   * a gift of Premium the founder gave this account (premium_gifts: an account, an optional end, a note), plan "gift"; otherwise
//   * its free week (founder, 20 November 2026: "Whenever someone signs into the app for the first time, they automatically get a 7-day free trial"), plan
//     "trial": FREE_WEEK_DAYS from the first time the account asked, never a second one.
// A second free week is stopped three ways ("if someone deletes their account or uninstalls the app ... we won't allow them to"):
//   1. a keyed one-way hash of the normalised email address (HMAC-SHA256 with a server secret: the address itself is never stored, and the hash can't be turned
//      back into it), kept in trial_claims after the account is deleted, only for this;
//   2. the same for the account's Sign in with Apple user id (Apple's "sub", the same for this person in our app however their email looks);
//   3. Apple's DeviceCheck: bit 0 of this iPhone's two bits means "this iPhone had the free week" (lib/payments/deviceCheck.ts). Only when the app sent a
//      DeviceCheck token and the DeviceCheck key is set on the server; otherwise this check is skipped and the answer says so. It never fails the request.
//   4. On Android, the same job is done by a keyed hash of the phone's Android ID (founder, 22 November 2026: "Does Android have one of those too to prevent that?"
//      "Yes, please do that for me."): the app sends SHA-256("numbite-device:" + ANDROID_ID), this server hashes that again with its secret (kind "android") and keeps it
//      in trial_claims like the email hash. An account with no week of its own on a phone that had one gets none ("device_used", as on an iPhone). The Android ID
//      survives uninstalling and reinstalling, not a factory reset. Google's own "device recall" (Play Integrity) would survive a reset too, but it is a closed beta
//      for apps with production usage, which Numbite does not have yet. Storing this key is best effort (see insertKeys): until the kind is allowed in the table
//      (supabase/migrations/20261122120000_trial_claims_android.sql) the week is simply not remembered by phone.
// An App Store subscription wins over all of this on the phone (lib/payments/accountAccess.ts never replaces a bought token). Nothing personal is logged or put
// in the token. The answer says why in machine-readable words (`freeWeek`, `deviceCheck`).

import { createHmac } from "node:crypto";
import { z } from "zod";
import type { Result } from "../handlers";
import { FREE_WEEK_DAYS } from "../mm/freeWeek";
import type { EntitlementClaims } from "./token";

export { FREE_WEEK_DAYS };

const DAY_MS = 24 * 60 * 60 * 1000;
/** A gift's token lasts at most this long (a gift with no end, or a later one, is renewed each time the app asks): a gift taken away stops at the latest then. */
export const GIFT_TOKEN_DAYS = 30;
/** The secret the claim hashes are keyed with must be at least this long. */
export const MIN_HASH_SECRET_LENGTH = 32;

// ---- the keys

export type ClaimKind = "email" | "apple" | "android";

/**
 * The email address as one mailbox: trimmed, lower case, without a "+tag" after the name (most providers deliver a+b@x to a@x), and for Gmail without the dots
 * in the name and with googlemail.com as gmail.com (Gmail ignores both). Null when it isn't an address.
 */
export function normaliseEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1 || /\s/.test(e)) return null;
  let local = e.slice(0, at).split("+")[0] ?? "";
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local && domain.includes(".") ? `${local}@${domain}` : null;
}

/** The stored key for an email address or an Apple user id: HMAC-SHA256 keyed with the server's secret, hex. Without the secret it can't be worked out from the
 *  address, and it can't be turned back into the address. */
export function claimKey(kind: ClaimKind, value: string, secret: string): string {
  return createHmac("sha256", secret).update(`numbite-free-week:${kind}:${value}`).digest("hex");
}

/** The key of an Android phone: the app's SHA-256 of the Android ID (64 hex characters), hashed again with the server's secret. */
export function deviceClaimKey(deviceHash: string, secret: string): { keyHash: string; kind: ClaimKind } {
  return { keyHash: claimKey("android", deviceHash, secret), kind: "android" };
}

/** The account's keys: its normalised email and its Apple user id, whichever it has. */
export function claimKeys(identity: { email: string | null; appleSub: string | null }, secret: string): Array<{ keyHash: string; kind: ClaimKind }> {
  const out: Array<{ keyHash: string; kind: ClaimKind }> = [];
  const email = identity.email ? normaliseEmail(identity.email) : null;
  if (email) out.push({ keyHash: claimKey("email", email, secret), kind: "email" });
  const sub = identity.appleSub?.trim();
  if (sub) out.push({ keyHash: claimKey("apple", sub, secret), kind: "apple" });
  return out;
}

// ---- what the handler needs from the database (the real one is freeWeekStore-supabase.ts; tests use the in-memory one below)

export interface TrialClaim {
  keyHash: string;
  kind: ClaimKind;
  /** Milliseconds since 1970. */
  claimedAt: number;
  endsAt: number;
}

export interface FreeWeekStore {
  /** The claims stored under any of these keys. */
  findClaims(keyHashes: string[]): Promise<TrialClaim[]>;
  /** Stores each claim whose key isn't there yet; a key already there keeps its own row (two requests at once: the first wins). */
  insertClaims(claims: TrialClaim[]): Promise<void>;
  /** The account's gift of Premium that is running now (`until` null = no end), or null. */
  activeGift(userId: string, nowMs: number): Promise<{ until: number | null } | null>;
}

export function memoryFreeWeekStore(): FreeWeekStore & { claims: TrialClaim[]; gifts: Array<{ userId: string; until: number | null }> } {
  const claims: TrialClaim[] = [];
  const gifts: Array<{ userId: string; until: number | null }> = [];
  return {
    claims,
    gifts,
    async findClaims(keys) { return claims.filter((c) => keys.includes(c.keyHash)); },
    async insertClaims(next) {
      for (const c of next) if (!claims.some((x) => x.keyHash === c.keyHash)) claims.push({ ...c });
    },
    async activeGift(userId, now) {
      const running = gifts.filter((g) => g.userId === userId && (g.until === null || g.until > now));
      if (running.length === 0) return null;
      return running.some((g) => g.until === null) ? { until: null } : { until: Math.max(...running.map((g) => g.until as number)) };
    },
  };
}

// ---- Apple's DeviceCheck, as the handler sees it (lib/payments/deviceCheck.ts)

export type DeviceEnv = "development" | "production";

export interface DeviceBits {
  bit0: boolean;
  bit1: boolean;
}

export interface DeviceCheckPort {
  /** This iPhone's two bits, or null when Apple couldn't be asked (or didn't accept the token). */
  query(deviceToken: string, env: DeviceEnv): Promise<DeviceBits | null>;
  /** Sets bit 0 ("had the free week"), keeping bit 1 as it was. False when Apple didn't take it. */
  markFreeWeek(deviceToken: string, env: DeviceEnv, bits: DeviceBits): Promise<boolean>;
}

// ---- the handler

export interface AccountIdentity {
  userId: string;
  email: string | null;
  /** Sign in with Apple's user id for this person ("sub"), when the account signs in with Apple. */
  appleSub: string | null;
}

export interface AccountEntitlementDeps {
  /** null when the server has no signing key (ENTITLEMENT_PRIVATE_JWK): answered with 503. */
  sign: ((claims: EntitlementClaims) => Promise<string>) | null;
  /** The secret the claim hashes are keyed with (FREE_WEEK_HASH_SECRET); null (or too short) = 503: never a free week that can't be remembered. */
  secret: string | null;
  store: FreeWeekStore;
  /** null when the DeviceCheck key isn't set on the server: the device check is skipped. */
  deviceCheck: DeviceCheckPort | null;
  nowMs: number;
  /** false when this account has asked too often. */
  allow: (userId: string) => boolean;
  /** Told what happened, in reason codes only (never an email, an id or a token). */
  note?: (message: string) => void;
}

/** Whether this iPhone was checked with Apple: its bit set now ("set"), read only ("checked"), or not, and why. */
export type DeviceCheckOutcome = "set" | "checked" | "not_needed" | "not_sent" | "not_configured" | "failed";
/** Where the account's free week stands: running, ended (this account's, or one had before with the same email or Apple ID), this iPhone had it already, the
 *  account has no email or Apple ID to remember it by, or not looked at (a gift is running). */
export type FreeWeekAnswer = "running" | "ended" | "device_used" | "no_identity" | "not_checked";

/** A DeviceCheck token is Apple's base64 (about 2,000 to 3,000 characters). */
const bodySchema = z.strictObject({
  deviceToken: z.string().min(16).max(12_000).regex(/^[A-Za-z0-9+/=]+$/).optional(),
  deviceEnv: z.enum(["development", "production"]).optional(),
  /** An Android phone: the app's SHA-256 of its Android ID, 64 lower-case hex characters. */
  androidDeviceHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

/**
 * Stores the keys with these dates. The account's own keys (email, Apple ID) must be stored: a failure is thrown, and the route answers 500 (nothing changes on the
 * phone). The Android phone's key is best effort: if the table doesn't take its kind yet (the migration not run), the week is simply not remembered by phone, and
 * that is said in the notes. Returns whether the phone's key, when there is one, was stored (true when there is none).
 */
async function insertKeys(deps: AccountEntitlementDeps, keys: Array<{ keyHash: string; kind: ClaimKind }>, claimedAt: number, endsAt: number): Promise<boolean> {
  const rows = (list: typeof keys) => list.map((k) => ({ ...k, claimedAt, endsAt }));
  const own = keys.filter((k) => k.kind !== "android");
  const phone = keys.filter((k) => k.kind === "android");
  if (own.length > 0) await deps.store.insertClaims(rows(own));
  if (phone.length === 0) return true;
  try {
    await deps.store.insertClaims(rows(phone));
    return true;
  } catch {
    deps.note?.("free week: Android phone key not stored");
    return false;
  }
}

export async function handleAccountEntitlement(identity: AccountIdentity, body: unknown, deps: AccountEntitlementDeps): Promise<Result> {
  if (!deps.sign || !deps.secret || deps.secret.length < MIN_HASH_SECRET_LENGTH) return { status: 503, body: { error: "unavailable" } };
  if (!deps.allow(identity.userId)) return { status: 429, body: { error: "rate_limited" } };
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return { status: 400, body: { error: "invalid_request" } };
  const now = deps.nowMs;
  const token = (plan: EntitlementClaims["plan"], expMs: number) => deps.sign!({ v: 1, plan, src: "account", iat: Math.floor(now / 1000), exp: Math.floor(expMs / 1000) });

  // 1. a gift of Premium
  const gift = await deps.store.activeGift(identity.userId, now);
  if (gift) {
    const expiresAt = Math.min(gift.until ?? Infinity, now + GIFT_TOKEN_DAYS * DAY_MS);
    return { status: 200, body: { premium: true, plan: "gift", token: await token("gift", expiresAt), expiresAt, giftUntil: gift.until, freeWeek: "not_checked", deviceCheck: "not_needed" } };
  }

  // 2. the free week, by the account's email and Apple ID, and by this Android phone
  const keys = claimKeys(identity, deps.secret);
  if (keys.length === 0) return { status: 200, body: { premium: false, freeWeek: "no_identity", deviceCheck: "not_needed" } };
  const { deviceToken, deviceEnv = "production", androidDeviceHash } = parsed.data;
  const phoneKey = androidDeviceHash ? deviceClaimKey(androidDeviceHash, deps.secret) : null;
  const lookup = phoneKey ? [...keys, phoneKey] : keys;
  const found = await deps.store.findClaims(lookup.map((k) => k.keyHash));
  if (found.length > 0) {
    // the account's own keys decide its dates (a phone's key may belong to another account's week); with none of them known, it is this Android phone that had the
    // week (on another account), as on an iPhone whose DeviceCheck bit is set
    const own = found.filter((c) => keys.some((k) => k.keyHash === c.keyHash));
    const phoneOnly = own.length === 0;
    const claim = (phoneOnly ? found : own).reduce((a, b) => (b.endsAt > a.endsAt ? b : a));
    // a key of this account not stored yet (a new email on the same Apple ID, say) is stored with the same dates, so it can't start a week of its own later.
    // An account that only the phone gave away is stored as having no week at all (it ends the moment it began): its own later asks then say "ended", never the days
    // that are left of the other account's week. A phone is remembered only by the week that began on it: an account that signs in on a second phone doesn't make that
    // phone "used" for whoever has it next.
    const missing = keys.filter((k) => !found.some((c) => c.keyHash === k.keyHash));
    if (missing.length > 0) await insertKeys(deps, missing, claim.claimedAt, phoneOnly ? claim.claimedAt : claim.endsAt);
    if (phoneOnly) {
      deps.note?.("free week: this Android phone had it already");
      return { status: 200, body: { premium: false, freeWeek: "device_used", deviceCheck: "checked" } };
    }
    if (claim.endsAt <= now) return { status: 200, body: { premium: false, freeWeek: "ended", freeWeekEndsAt: claim.endsAt, deviceCheck: "not_needed" } };
    return { status: 200, body: { premium: true, plan: "trial", token: await token("trial", claim.endsAt), expiresAt: claim.endsAt, freeWeek: "running", freeWeekEndsAt: claim.endsAt, claimedNow: false, deviceCheck: "not_needed" } };
  }

  // 3. a new account: this iPhone, when Apple can be asked
  let deviceCheck: DeviceCheckOutcome = phoneKey ? "checked" : !deps.deviceCheck ? "not_configured" : !deviceToken ? "not_sent" : "checked";
  let bits: DeviceBits | null = null;
  if (deps.deviceCheck && deviceToken) {
    bits = await deps.deviceCheck.query(deviceToken, deviceEnv).catch(() => null);
    if (!bits) deviceCheck = "failed"; // Apple couldn't be asked: never a reason to refuse
    else if (bits.bit0) {
      deps.note?.("free week: this iPhone had it already");
      return { status: 200, body: { premium: false, freeWeek: "device_used", deviceCheck: "checked" } };
    }
  }

  // 4. claim it now
  const phoneStored = await insertKeys(deps, lookup, now, now + FREE_WEEK_DAYS * DAY_MS);
  // read back: when two requests claimed at once, the first one's dates stand
  const stored = await deps.store.findClaims(lookup.map((k) => k.keyHash));
  const endsAt = stored.length > 0 ? Math.max(...stored.map((c) => c.endsAt)) : now + FREE_WEEK_DAYS * DAY_MS;
  const claimedNow = stored.some((c) => c.claimedAt === now);
  if (phoneKey) deviceCheck = phoneStored ? "set" : "failed";
  if (deps.deviceCheck && deviceToken && bits) {
    const marked = await deps.deviceCheck.markFreeWeek(deviceToken, deviceEnv, bits).catch(() => false);
    deviceCheck = marked ? "set" : "failed";
    if (!marked) deps.note?.("free week: DeviceCheck bit not set");
  }
  if (endsAt <= now) return { status: 200, body: { premium: false, freeWeek: "ended", freeWeekEndsAt: endsAt, deviceCheck } };
  return { status: 200, body: { premium: true, plan: "trial", token: await token("trial", endsAt), expiresAt: endsAt, freeWeek: "running", freeWeekEndsAt: endsAt, claimedNow, deviceCheck } };
}
