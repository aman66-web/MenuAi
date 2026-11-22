// The bridge to the iPhone app (and the Android app) around the web app (docs/APP_BUILD.md, docs/ANDROID_BRIDGE.md). Inside the app, a few things are done by the phone itself instead of
// the browser: scanning a barcode (the iPhone's own scanner), finding the person's location (one system prompt, the location stays on the
// phone), the share sheet, and ringing reminders (local notifications scheduled by the phone itself). On the website there is no bridge and every
// caller keeps its browser path.
//
// Protocol: the page posts { id, action, payload } to window.webkit.messageHandlers.menumath; the app answers by calling
// window.__menumathReply(id, result) with a plain JSON object. A call the app doesn't answer within its timeout resolves { error: "timeout" }.
// The Android app installs the same two names (a shim written before the page's scripts run) and also sets window.__numbitePlatform = "android", so the page can tell which
// phone it is on (nativePlatform below); an action the Android app can't do answers { error: "unavailable" } and the page takes its browser path.

import type { PlanItem } from "./reminders";

export type NativeAction =
  | "scan"
  | "locate"
  | "share"
  | "appleSignIn"
  | "webAuth"
  | "notifications.requestPermission"
  | "notifications.status"
  | "notifications.syncReminders"
  | "notifications.openSettings"
  | "keyboard.hide"
  | "iap.products"
  | "iap.purchase"
  | "iap.entitlements"
  | "iap.restore"
  | "iap.manage"
  | "iap.acknowledge"
  | "review.request"
  | "session.load"
  | "session.save"
  | "deviceCheck.token";

/** "iap.products": one App Store product as StoreKit gives it (the price is StoreKit's own localised text, never ours). */
export interface NativeProduct {
  id: string;
  name: string;
  price: string;
  period: "month" | "year" | "none";
  /** The free trial's length in days: only when the product has one and this Apple ID can still have it (one per subscription group per Apple ID). */
  trialDays?: number;
}

/** One Google Play purchase as Play Billing gives it to the Android app. */
export interface NativePurchase {
  productId: string;
  token: string;
}

export interface NativeResult {
  /** "scan": the barcode digits. */
  code?: string;
  /** "locate": the position (never stored or sent anywhere by us). */
  lat?: number;
  lng?: number;
  /** "share": the share sheet was shown and closed. */
  done?: boolean;
  /** "appleSignIn": Apple's identity token from the iPhone's own Apple sheet, and the raw nonce the app gave Apple. */
  idToken?: string;
  nonce?: string;
  /** "appleSignIn": Apple's one-time authorization code, used to tell Apple when an account that signs in with Apple is deleted. */
  appleCode?: string;
  /** "webAuth": the one-time code from numbite://auth?code=... after Google sign-in in the secure browser sheet, and the PKCE verifier the app made for it. */
  authCode?: string;
  verifier?: string;
  /** "notifications.requestPermission" and "notifications.status": whether the person lets the app show notifications ("notDetermined" = not asked yet). */
  permission?: "granted" | "denied" | "notDetermined";
  /** "iap.products": the products asked for that the App Store knows, in the order asked. */
  products?: NativeProduct[];
  /** "iap.purchase", "iap.entitlements", "iap.restore": Apple's signed transactions (JWS), verified by StoreKit on the phone and checked again by our server. */
  transactions?: string[];
  /** Android: "iap.purchase", "iap.entitlements", "iap.restore": Google Play purchases, each the subscription's id and Play Billing's purchase token (opaque). Our server asks Google about each
   *  one (lib/payments/google.ts). The iPhone's answers are `transactions`, which stay as they are. */
  purchases?: NativePurchase[];
  /** "iap.purchase": waiting for approval (Ask to Buy, or the bank's extra check). */
  pending?: boolean;
  /** "session.load": the account's saved sign-in as the page handed it to "session.save" (kept in the iPhone's Keychain). */
  session?: string;
  /** "deviceCheck.token": Apple's one-time DeviceCheck token for this iPhone (base64), and which of Apple's DeviceCheck servers it is for (a build run from
   *  Xcode uses the development one). Sent only to our server, which asks Apple whether this iPhone had the free week (lib/payments/freeWeek.ts). */
  deviceToken?: string;
  deviceEnv?: "development" | "production";
  /** "denied" (the person said no in Settings), "unavailable" (this iPhone can't), "cancelled", "timeout". */
  error?: "denied" | "unavailable" | "cancelled" | "timeout";
}

interface Handler {
  postMessage(message: unknown): void;
}

type ReplyFn = (id: string, result: unknown) => void;

function handler(): Handler | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkit?: { messageHandlers?: { menumath?: Handler } } };
  return w.webkit?.messageHandlers?.menumath ?? null;
}

/** True inside the iPhone app or the Android app (the app installs the bridge before the page loads). */
export function hasNative(): boolean {
  return handler() !== null;
}

export type NativePlatform = "ios" | "android";

/**
 * Which app the page is in: "android" when the Android app's shim says so (window.__numbitePlatform), "ios" for the iPhone app (the bridge is there and says nothing else),
 * null on the website. Read at call time; the apps install the bridge before any page script runs.
 */
export function nativePlatform(): NativePlatform | null {
  if (typeof window === "undefined") return null;
  if ((window as unknown as { __numbitePlatform?: unknown }).__numbitePlatform === "android" && handler() !== null) return "android";
  return handler() !== null ? "ios" : null;
}

const waiting = new Map<string, (result: NativeResult) => void>();
let counter = 0;

/** Only plain, expected fields get through: the reply comes from our own app, but nothing else is trusted. */
const JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function cleanProduct(raw: unknown): NativeProduct | null {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() !== "" && v.length <= max && !/[<>]/.test(v) ? v.trim() : null);
  // an Android plan is named `<subscription id>:<base plan id>`, so a colon is allowed
  const id = typeof p.id === "string" && /^[a-z0-9.:]{3,100}$/.test(p.id) ? p.id : null;
  const name = text(p.name, 100);
  const price = text(p.price, 40);
  const period = p.period === "month" || p.period === "year" || p.period === "none" ? p.period : null;
  const trial = typeof p.trialDays === "number" && Number.isInteger(p.trialDays) && p.trialDays >= 1 && p.trialDays <= 31 ? p.trialDays : null;
  return id && name && price && period ? { id, name, price, period, ...(trial ? { trialDays: trial } : {}) } : null;
}

/** Play Billing's answer: a product id (the subscription's, or `<subscription id>:<base plan id>`) and its purchase token. Anything else in an entry is dropped; an entry that isn't both is left out. */
function cleanPurchase(raw: unknown): NativePurchase | null {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const productId = typeof p.productId === "string" && /^[a-z0-9._:]{3,100}$/.test(p.productId) ? p.productId : null;
  const token = typeof p.token === "string" && /^[A-Za-z0-9._-]{10,4000}$/.test(p.token) ? p.token : null;
  return productId && token ? { productId, token } : null;
}

export function cleanNativeResult(raw: unknown): NativeResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: NativeResult = {};
  if (typeof r.code === "string" && /^\d{6,14}$/.test(r.code)) out.code = r.code;
  if (typeof r.lat === "number" && typeof r.lng === "number" && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180) {
    out.lat = r.lat;
    out.lng = r.lng;
  }
  if (r.done === true) out.done = true;
  if (typeof r.idToken === "string" && r.idToken.length <= 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(r.idToken)) out.idToken = r.idToken;
  if (typeof r.appleCode === "string" && /^[A-Za-z0-9._-]{20,1000}$/.test(r.appleCode)) out.appleCode = r.appleCode;
  if (typeof r.nonce === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(r.nonce)) out.nonce = r.nonce;
  if (typeof r.authCode === "string" && r.authCode.length <= 8192 && /^[A-Za-z0-9_-]{40,}$/.test(r.authCode)) out.authCode = r.authCode;
  if (typeof r.verifier === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(r.verifier)) out.verifier = r.verifier;
  if (r.permission === "granted" || r.permission === "denied" || r.permission === "notDetermined") out.permission = r.permission;
  if (Array.isArray(r.products)) out.products = r.products.slice(0, 10).map(cleanProduct).filter((p): p is NativeProduct => p !== null);
  if (Array.isArray(r.transactions) && r.transactions.length <= 20 && r.transactions.every((t) => typeof t === "string" && t.length <= 20_000 && JWS.test(t))) out.transactions = r.transactions as string[];
  // an empty list is a real answer ("nothing current"); more than 10, or one entry that isn't a purchase, means the answer isn't trusted at all
  if (Array.isArray(r.purchases) && r.purchases.length <= 10) {
    const purchases = r.purchases.map(cleanPurchase);
    if (purchases.every((p) => p !== null)) out.purchases = purchases;
  }
  if (r.pending === true) out.pending = true;
  if (typeof r.session === "string" && r.session.length > 0 && r.session.length <= 16_384) out.session = r.session;
  if (typeof r.deviceToken === "string" && r.deviceToken.length >= 16 && r.deviceToken.length <= 12_000 && /^[A-Za-z0-9+/=]+$/.test(r.deviceToken)) {
    out.deviceToken = r.deviceToken;
    if (r.deviceEnv === "development" || r.deviceEnv === "production") out.deviceEnv = r.deviceEnv;
  }
  if (r.error === "denied" || r.error === "unavailable" || r.error === "cancelled" || r.error === "timeout") out.error = r.error;
  if (!out.code && out.lat === undefined && !out.done && !out.idToken && !out.authCode && !out.permission && !out.products && !out.transactions && !out.purchases && !out.pending && !out.session && !out.deviceToken && !out.error) out.error = "unavailable";
  return out;
}

function installReply() {
  const w = window as unknown as { __menumathReply?: ReplyFn };
  if (w.__menumathReply) return;
  w.__menumathReply = (id, result) => {
    const resolve = waiting.get(id);
    if (!resolve) return;
    waiting.delete(id);
    resolve(cleanNativeResult(result));
  };
}

/** Ask the app to do something. Resolves with the app's answer (never rejects). */
export function nativeCall(action: NativeAction, payload: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<NativeResult> {
  const h = handler();
  if (!h) return Promise.resolve({ error: "unavailable" });
  installReply();
  const id = `${Date.now().toString(36)}-${(counter++).toString(36)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (waiting.delete(id)) resolve({ error: "timeout" });
    }, timeoutMs);
    waiting.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    try {
      h.postMessage({ id, action, payload });
    } catch {
      waiting.delete(id);
      clearTimeout(timer);
      resolve({ error: "unavailable" });
    }
  });
}

// ---- reminders (local notifications): the phone only schedules what it is given (docs/APP_BUILD.md "Reminders (local notifications)")

/**
 * Whether the person lets the app show notifications. "unavailable" = nothing to report: on the website (no bridge), an app that didn't answer in time, or
 * the question hasn't been put to the person yet (the phone's "not determined"): callers say nothing in that case rather than the wrong thing.
 */
export type NotificationPermissionState = "granted" | "denied" | "unavailable";

function permissionOf(r: NativeResult): NotificationPermissionState {
  // `done: true` and `error: "denied"` are also understood, so a plain test bridge that answers like share does works too
  if (r.permission === "granted" || (r.permission === undefined && r.done === true)) return "granted";
  if (r.permission === "denied" || r.error === "denied") return "denied";
  return "unavailable";
}

/** The permission question is the phone's own system prompt, answered by a person: as long as scanning. The rest are instant calls on the phone. */
const PERMISSION_TIMEOUT_MS = 120_000;
const QUICK_TIMEOUT_MS = 8_000;

/** The reminders' side of the bridge. Every call resolves (never rejects): "unavailable" / nothing happens when there is no bridge. */
export const native = {
  /** Shows the phone's one-time "Allow notifications?" prompt (afterwards it just answers). Ask only when the person saves their first reminder. */
  async requestNotificationPermission(): Promise<NotificationPermissionState> {
    return permissionOf(await nativeCall("notifications.requestPermission", {}, PERMISSION_TIMEOUT_MS));
  },
  /** Reads (never asks) whether notifications are allowed. */
  async notificationStatus(): Promise<NotificationPermissionState> {
    return permissionOf(await nativeCall("notifications.status", {}, QUICK_TIMEOUT_MS));
  },
  /**
   * Hands the phone the WHOLE plan: it removes every reminder notification it scheduled before and schedules exactly these (an empty plan cancels all).
   * Nothing happens without the bridge. The plan is copied through JSON so only plain data reaches the phone.
   */
  async syncReminders(plan: readonly PlanItem[]): Promise<void> {
    if (!hasNative()) return;
    await nativeCall("notifications.syncReminders", { items: JSON.parse(JSON.stringify(plan)) as unknown }, QUICK_TIMEOUT_MS);
  },
  /** Asks the iPhone app to put the keyboard away (nothing happens on the website: the page's own blur() does it there). */
  async hideKeyboard(): Promise<void> {
    if (!hasNative()) return;
    await nativeCall("keyboard.hide", {}, 1_500);
  },
  /** Opens the iPhone's Settings page for this app's notifications (to turn them back on). */
  async openNotificationSettings(): Promise<void> {
    if (!hasNative()) return;
    await nativeCall("notifications.openSettings", {}, QUICK_TIMEOUT_MS);
  },
};
