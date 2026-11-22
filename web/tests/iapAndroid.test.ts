import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GOOGLE_PRODUCT_IDS, IAP_PRODUCT_IDS, REFRESH_BEFORE_MS, buyPlan, claimPurchases, currentPlatform, loadProducts, productIdsFor, refreshAppStoreAccess, restorePurchases } from "../lib/payments/iap";
import { googleProductId, GOOGLE_SUBSCRIPTION_ID } from "../lib/payments/googleIds";
import { refreshAccountAccess, resetAccountAccessForTests } from "../lib/payments/accountAccess";
import { generateKeyPair, signClaims, verifyToken, type EntitlementClaims } from "../lib/payments/token";
import { cleanNativeResult, hasNative, nativePlatform, type NativeResult } from "../lib/mm/native";
import { NO_FREE_WEEK } from "../lib/mm/freeWeek";
import { NO_PAID } from "../lib/mm/paid";
import { freeWeekStore, paidStore } from "../lib/mm/stores";
import { storeCopy } from "../lib/mm/storeCopy";

// The Android app's side of In-App Purchase (docs/ANDROID_BRIDGE.md): the page asks Play Billing through the same bridge, claims the purchase tokens at
// entitlement/google, then has the app acknowledge them. The iPhone's path is in iap.test.ts, which this changes nothing in.

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 22, 12);
const ANNUAL = "com.amanmarwaha.numbite.premium:annual";
const MONTHLY = "com.amanmarwaha.numbite.premium:monthly";
const PURCHASE = { productId: GOOGLE_SUBSCRIPTION_ID, token: "play-purchase-token.AbCdEf_0123456789-xyz" };
const PURCHASE_2 = { productId: GOOGLE_SUBSCRIPTION_ID, token: "play-purchase-token-two.0123456789ABCDEFGH" };
let privateJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await generateKeyPair();
  privateJwk = pair.privateJwk;
  process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK = JSON.stringify(pair.publicJwk);
});
afterEach(() => {
  paidStore.set(NO_PAID);
  freeWeekStore.set(NO_FREE_WEEK);
  resetAccountAccessForTests();
  vi.unstubAllGlobals();
});

const token = (src: EntitlementClaims["src"], expMs: number, plan: EntitlementClaims["plan"] = "annual") =>
  signClaims({ v: 1, plan, src, iat: Math.floor(NOW / 1000), exp: Math.floor(expMs / 1000) }, privateJwk);
const phone = (answers: Partial<Record<string, NativeResult>>) => vi.fn(async (action: string) => answers[action] ?? { error: "unavailable" as const });
const server = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const asFetch = (f: unknown) => f as unknown as typeof fetch;

describe("the access token a Google Play purchase gives", () => {
  it("is accepted for a paid plan with src google, and a free week or gift still comes only from the account", async () => {
    const key = JSON.parse(process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK!) as JsonWebKey;
    expect(await verifyToken(await token("google", NOW + DAY, "annual"), key, NOW)).toMatchObject({ src: "google", plan: "annual" });
    expect(await verifyToken(await token("google", NOW + DAY, "monthly"), key, NOW)).toMatchObject({ src: "google", plan: "monthly" });
    expect(await verifyToken(await token("google", NOW + DAY, "trial"), key, NOW)).toBeNull();
    expect(await verifyToken(await token("google", NOW + DAY, "gift"), key, NOW)).toBeNull();
    expect(await verifyToken(await token("google", NOW - DAY), key, NOW)).toBeNull();
  });
});

describe("which phone the page is on", () => {
  it("is Android when the Android app's shim says so, the iPhone when there is a bridge and no such mark, and neither on the website", () => {
    expect(nativePlatform()).toBeNull(); // no window at all
    vi.stubGlobal("window", {});
    expect(nativePlatform()).toBeNull();
    expect(hasNative()).toBe(false);
    const bridge = { messageHandlers: { menumath: { postMessage: () => undefined } } };
    vi.stubGlobal("window", { webkit: bridge });
    expect(nativePlatform()).toBe("ios");
    expect(currentPlatform()).toBe("ios");
    vi.stubGlobal("window", { webkit: bridge, __numbitePlatform: "android" });
    expect(nativePlatform()).toBe("android");
    expect(currentPlatform()).toBe("android");
    expect(hasNative()).toBe(true);
    // the mark alone (no bridge), or any other value, doesn't make an app
    vi.stubGlobal("window", { __numbitePlatform: "android" });
    expect(nativePlatform()).toBeNull();
    vi.stubGlobal("window", { webkit: bridge, __numbitePlatform: "windows" });
    expect(nativePlatform()).toBe("ios");
    // a page with no bridge and no window falls back to the iPhone's store for the purchase code (never reached on the website)
    vi.stubGlobal("window", {});
    expect(currentPlatform()).toBe("ios");
  });
});

describe("what the app answers for purchases (lib/mm/native.ts)", () => {
  it("lets through up to ten { productId, token } and nothing else, an empty list included", () => {
    expect(cleanNativeResult({ purchases: [PURCHASE] })).toEqual({ purchases: [PURCHASE] });
    expect(cleanNativeResult({ purchases: [{ ...PURCHASE, extra: "x", orderId: "GPA.1" }] })).toEqual({ purchases: [PURCHASE] });
    expect(cleanNativeResult({ purchases: [] })).toEqual({ purchases: [] }); // "nothing current" is a real answer
    expect(cleanNativeResult({ purchases: Array.from({ length: 10 }, () => PURCHASE) }).purchases).toHaveLength(10);
    expect(cleanNativeResult({ purchases: Array.from({ length: 11 }, () => PURCHASE) })).toEqual({ error: "unavailable" });
    // an entry that isn't a purchase spoils the answer: it is never read as "nothing current"
    for (const bad of [
      { productId: "<x>", token: PURCHASE.token },
      { productId: PURCHASE.productId, token: "short" },
      { productId: PURCHASE.productId, token: "has spaces in the token 12345" },
      { productId: PURCHASE.productId, token: "a".repeat(4001) },
      { productId: "UPPER", token: PURCHASE.token },
      { productId: PURCHASE.productId },
      "text",
      null,
    ]) {
      expect(cleanNativeResult({ purchases: [bad] }), JSON.stringify(bad)).toEqual({ error: "unavailable" });
      expect(cleanNativeResult({ purchases: [PURCHASE, bad] }), JSON.stringify(bad)).toEqual({ error: "unavailable" });
    }
    expect(cleanNativeResult({ purchases: "nope" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ purchases: [{ productId: ANNUAL, token: "a".repeat(4000) }] }).purchases).toHaveLength(1);
  });

  it("lets through Play's products, which are named <subscription id>:<base plan id>, and still no markup", () => {
    const product = { id: ANNUAL, name: "Annual", price: "£49.99", period: "year" };
    expect(cleanNativeResult({ products: [product, { ...product, id: MONTHLY, name: "Monthly", price: "£4.99", period: "month" }] }).products).toHaveLength(2);
    expect(cleanNativeResult({ products: [{ ...product, id: "<b>:annual" }] })).toEqual({ products: [] });
    expect(cleanNativeResult({ products: [{ ...product, price: "<b>£1</b>" }] })).toEqual({ products: [] });
    // the iPhone's answers are as they were
    expect(cleanNativeResult({ transactions: ["eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJ4In0.c2lnbmF0dXJl"] }).transactions).toHaveLength(1);
  });
});

describe("the plans", () => {
  it("are named <subscription id>:<base plan id> for Google Play, and the iPhone's ids are what they were", () => {
    expect(GOOGLE_PRODUCT_IDS).toEqual({ annual: ANNUAL, monthly: MONTHLY });
    expect(googleProductId("annual")).toBe(ANNUAL);
    expect(IAP_PRODUCT_IDS).toEqual({ annual: "com.amanmarwaha.numbite.pro.annual", monthly: "com.amanmarwaha.numbite.pro.monthly" });
    expect(productIdsFor("android")).toBe(GOOGLE_PRODUCT_IDS);
    expect(productIdsFor("ios")).toBe(IAP_PRODUCT_IDS);
  });

  it("are asked of Play Billing by those ids, in the app's order, with Play's own names and prices; null when Play has none", async () => {
    const call = phone({ "iap.products": { products: [
      { id: MONTHLY, name: "Monthly", price: "£4.99", period: "month" },
      { id: ANNUAL, name: "Annual", price: "£49.99", period: "year" },
      { id: "com.amanmarwaha.numbite.pro.annual", name: "Apple's", price: "£1", period: "year" }, // another store's id is never shown
    ] } });
    expect((await loadProducts(call, "android"))?.map((p) => `${p.plan} ${p.price} ${p.trialDays ?? "-"}`)).toEqual(["annual £49.99 -", "monthly £4.99 -"]);
    expect(call).toHaveBeenCalledWith("iap.products", { ids: [ANNUAL, MONTHLY] }, 30_000);
    expect(await loadProducts(phone({ "iap.products": { products: [] } }), "android")).toBeNull();
    expect(await loadProducts(phone({}), "android")).toBeNull();
    // the iPhone still asks for its own ids
    const apple = phone({});
    await loadProducts(apple, "ios");
    expect(apple).toHaveBeenCalledWith("iap.products", { ids: [IAP_PRODUCT_IDS.annual, IAP_PRODUCT_IDS.monthly] }, 30_000);
  });
});

describe("buying on Android", () => {
  it("sends the purchase token to entitlement/google, keeps the token it answers with, then has the app acknowledge the purchase", async () => {
    const t = await token("google", NOW + 400 * DAY);
    const fetchImpl = server(200, { token: t, plan: "annual", expiresAt: NOW + 400 * DAY });
    const call = phone({ "iap.purchase": { purchases: [PURCHASE] }, "iap.acknowledge": { done: true } });
    expect(await buyPlan("annual", call, asFetch(fetchImpl), "android")).toBe("ok");
    expect(call).toHaveBeenNthCalledWith(1, "iap.purchase", { id: ANNUAL }, 15 * 60_000);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/entitlement\/google$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ purchases: [PURCHASE] });
    expect(paidStore.get().token).toBe(t);
    expect(paidStore.get().plan).toBe("annual");
    expect(call).toHaveBeenNthCalledWith(2, "iap.acknowledge", { token: PURCHASE.token }, 30_000);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("acknowledges only after our server has accepted: never when it says no, can't be reached or sends a token that doesn't check out", async () => {
    for (const fetchImpl of [server(402, { error: "not_paid" }), server(503, { error: "unavailable" }), server(200, { token: "v1.forged.token" }), server(200, {}), vi.fn(async () => { throw new Error("offline"); })]) {
      const call = phone({ "iap.purchase": { purchases: [PURCHASE] } });
      expect(await buyPlan("monthly", call, asFetch(fetchImpl), "android")).toBe("not_confirmed");
      expect(call).toHaveBeenCalledTimes(1);
    }
    expect(paidStore.get().token).toBeNull();
  });

  it("says cancelled, pending or unavailable without asking the server (a purchase list that is empty is unavailable)", async () => {
    const fetchImpl = server(200, {});
    expect(await buyPlan("monthly", phone({ "iap.purchase": { error: "cancelled" } }), asFetch(fetchImpl), "android")).toBe("cancelled");
    expect(await buyPlan("monthly", phone({ "iap.purchase": { pending: true } }), asFetch(fetchImpl), "android")).toBe("pending");
    expect(await buyPlan("monthly", phone({ "iap.purchase": { error: "unavailable" } }), asFetch(fetchImpl), "android")).toBe("unavailable");
    expect(await buyPlan("monthly", phone({ "iap.purchase": { purchases: [] } }), asFetch(fetchImpl), "android")).toBe("unavailable");
    // an iPhone-style answer on Android is not read
    expect(await buyPlan("monthly", phone({ "iap.purchase": { transactions: ["eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJ4In0.c2lnbmF0dXJl"] } }), asFetch(fetchImpl), "android")).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a failed acknowledgement doesn't undo the purchase", async () => {
    const t = await token("google", NOW + 30 * DAY, "monthly");
    const call = vi.fn(async (action: string): Promise<NativeResult> => {
      if (action === "iap.purchase") return { purchases: [PURCHASE] };
      throw new Error("bridge fell over");
    });
    expect(await buyPlan("monthly", call, asFetch(server(200, { token: t })), "android")).toBe("ok");
    expect(paidStore.get().token).toBe(t);
  });

  it("sends only productId and token, at most ten, never an empty list", async () => {
    const fetchImpl = server(402, {});
    expect(await claimPurchases([], asFetch(fetchImpl))).toBe("not_paid");
    expect(fetchImpl).not.toHaveBeenCalled();
    const many = Array.from({ length: 12 }, (_, i) => ({ ...PURCHASE, token: `token-number-${i}.0123456789`, orderId: "GPA.1" })) as unknown as typeof PURCHASE[];
    await claimPurchases(many, asFetch(fetchImpl), phone({}));
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { purchases: Array<Record<string, string>> };
    expect(sent.purchases).toHaveLength(10);
    for (const p of sent.purchases) expect(Object.keys(p).sort()).toEqual(["productId", "token"]);
  });

  it("acknowledges every token it sent once the server said yes", async () => {
    const t = await token("google", NOW + 30 * DAY, "monthly");
    const call = phone({ "iap.acknowledge": { done: true } });
    expect(await claimPurchases([PURCHASE, PURCHASE_2], asFetch(server(200, { token: t })), call)).toBe("ok");
    expect(call).toHaveBeenCalledWith("iap.acknowledge", { token: PURCHASE.token }, 30_000);
    expect(call).toHaveBeenCalledWith("iap.acknowledge", { token: PURCHASE_2.token }, 30_000);
  });
});

describe("restoring on Android", () => {
  it("restores, says when Play holds nothing, and forgets a Google token Play no longer lists, but never another source's", async () => {
    const t = await token("google", NOW + 30 * DAY);
    const call = phone({ "iap.restore": { purchases: [PURCHASE] }, "iap.acknowledge": { done: true } });
    expect(await restorePurchases(call, asFetch(server(200, { token: t })), NOW, "android")).toBe("restored");
    expect(paidStore.get().token).toBe(t);
    expect(call).toHaveBeenCalledWith("iap.restore", {}, 5 * 60_000);
    expect(call).toHaveBeenCalledWith("iap.acknowledge", { token: PURCHASE.token }, 30_000);
    expect(await restorePurchases(phone({ "iap.restore": { purchases: [] } }), asFetch(server(200, {})), NOW, "android")).toBe("none");
    expect(paidStore.get().token).toBeNull();
    // Play holds a purchase our server refused: never "nothing to restore"
    expect(await restorePurchases(phone({ "iap.restore": { purchases: [PURCHASE] } }), asFetch(server(402, { error: "not_paid" })), NOW, "android")).toBe("refused");
    expect(await restorePurchases(phone({ "iap.restore": { purchases: [PURCHASE] } }), asFetch(server(503, {})), NOW, "android")).toBe("failed");
    expect(await restorePurchases(phone({ "iap.restore": { error: "cancelled" } }), asFetch(server(200, {})), NOW, "android")).toBe("cancelled");
    expect(await restorePurchases(phone({}), asFetch(server(200, {})), NOW, "android")).toBe("failed");
    // a token from the website, the account's free week or the iPhone's store is left alone
    for (const src of ["stripe", "apple"] as const) {
      const other = await token(src, NOW + 30 * DAY);
      paidStore.set({ ...NO_PAID, token: other, plan: "annual", until: NOW + 30 * DAY });
      await restorePurchases(phone({ "iap.restore": { purchases: [] } }), asFetch(server(200, {})), NOW, "android");
      expect(paidStore.get().token).toBe(other);
    }
    const trial = await token("account", NOW + 3 * DAY, "trial");
    paidStore.set({ ...NO_PAID, token: trial, plan: "trial", until: NOW + 3 * DAY });
    await restorePurchases(phone({ "iap.restore": { purchases: [] } }), asFetch(server(200, {})), NOW, "android");
    expect(paidStore.get().token).toBe(trial);
  });

  it("the iPhone forgets only its own source: a Google token stays on an iPhone's empty list", async () => {
    const google = await token("google", NOW + 30 * DAY);
    paidStore.set({ ...NO_PAID, token: google, plan: "annual", until: NOW + 30 * DAY });
    await restorePurchases(phone({ "iap.restore": { transactions: [] } }), asFetch(server(200, {})), NOW, "ios");
    expect(paidStore.get().token).toBe(google);
  });
});

describe("refreshing at start-up on Android", () => {
  it("fetches a token when Play lists a purchase and there is none, or it runs out within a week; leaves a fresh one alone", async () => {
    const fresh = await token("google", NOW + 300 * DAY);
    const fetchImpl = server(200, { token: fresh });
    const answers = { "iap.entitlements": { purchases: [PURCHASE] }, "iap.acknowledge": { done: true } };
    await refreshAppStoreAccess(phone(answers), asFetch(fetchImpl), NOW, "android");
    expect(paidStore.get().token).toBe(fresh);
    await refreshAppStoreAccess(phone(answers), asFetch(fetchImpl), NOW, "android");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await refreshAppStoreAccess(phone(answers), asFetch(fetchImpl), NOW + 300 * DAY - REFRESH_BEFORE_MS + DAY, "android");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("forgets a Google token after a refund or an ended subscription, keeps a token from elsewhere, and changes nothing without an answer", async () => {
    paidStore.set({ ...NO_PAID, token: await token("google", NOW + 30 * DAY), plan: "annual", until: NOW + 30 * DAY });
    await refreshAppStoreAccess(phone({}), asFetch(server(200, {})), NOW, "android");
    expect(paidStore.get().token).not.toBeNull();
    await refreshAppStoreAccess(phone({ "iap.entitlements": { purchases: [] } }), asFetch(server(200, {})), NOW, "android");
    expect(paidStore.get().token).toBeNull();
    const web = await token("stripe", NOW + 30 * DAY);
    paidStore.set({ ...NO_PAID, token: web, plan: "annual", until: NOW + 30 * DAY });
    await refreshAppStoreAccess(phone({ "iap.entitlements": { purchases: [] } }), asFetch(server(200, {})), NOW, "android");
    expect(paidStore.get().token).toBe(web);
  });

  it("a purchase replaces the account's own free week at once, and a free week never replaces a purchase", async () => {
    const trial = await token("account", NOW + 5 * DAY, "trial");
    paidStore.set({ ...NO_PAID, token: trial, plan: "trial", until: NOW + 400 * DAY });
    const google = await token("google", NOW + 300 * DAY);
    await refreshAppStoreAccess(phone({ "iap.entitlements": { purchases: [PURCHASE] } }), asFetch(server(200, { token: google })), NOW, "android");
    expect(paidStore.get()).toMatchObject({ token: google, plan: "annual" });
    // with a Google purchase running the account isn't asked at all (accountAccess keeps its rule for every bought token)
    const request = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await refreshAccountAccess({ userId: "u1", request, call: phone({}), nowMs: NOW, force: true })).toBe("bought");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("the free week on Android", () => {
  it("never asks for a DeviceCheck token (there is none): it asks the app for the phone's one-way hash instead, and asks the account with an empty body when the app has none", async () => {
    vi.stubGlobal("window", { webkit: { messageHandlers: { menumath: { postMessage: () => undefined } } }, __numbitePlatform: "android" });
    const call = phone({ "deviceCheck.token": { deviceToken: "cGhvbmUtb25lLXRva2VuLWZyb20tYXBwbGU=", deviceEnv: "production" } });
    const request = vi.fn(async () => new Response(JSON.stringify({ premium: false, freeWeek: "ended", deviceCheck: "not_sent" }), { status: 200 }));
    await refreshAccountAccess({ userId: "u1", request, call, nowMs: NOW, force: true });
    expect(call).not.toHaveBeenCalledWith("deviceCheck.token", expect.anything(), expect.anything());
    expect(call).toHaveBeenCalledWith("device.id", {}, 5_000);
    expect(request).toHaveBeenCalledWith("entitlement/account", { method: "POST", body: {} });
  });
});

describe("the words that name the store", () => {
  it("are the iPhone's, exactly as before, on the iPhone and the website, and Google Play's on Android", () => {
    for (const platform of ["ios", null] as const) {
      const c = storeCopy(platform);
      expect(c.gettingPrices).toBe("Getting prices from the App Store…");
      expect(c.cantReach).toBe("Couldn't reach the App Store. Check your connection and try again.");
      expect(c.waiting).toBe("Waiting for the App Store…");
      expect(c.checking).toBe("Checking with the App Store…");
      expect(c.restoreNone).toBe("There's nothing to restore for this Apple ID.");
      expect(c.renewsThrough).toBe("Renews through the App Store.");
      expect(c.deleteNote).toBe("Deleting your account doesn't cancel an App Store subscription. To stop being charged, cancel it in your App Store settings.");
      expect(c.remindersRing).toBe("Reminders ring in the {app} iPhone app. On the website you'll see what's due today here.");
      expect(c.notificationsOff).toContain("iPhone's Settings");
      expect(c.eulaLink).toBe(true);
    }
    const g = storeCopy("android");
    for (const line of Object.values(g)) if (typeof line === "string") expect(line, line).not.toMatch(/Apple|App Store|iPhone|iOS|StoreKit/);
    expect(g.gettingPrices).toBe("Getting prices from Google Play…");
    expect(g.renewsThrough).toBe("Renews through Google Play.");
    expect(g.renewal).not.toMatch(/24 hours/);
    expect(g.eulaLink).toBe(false);
  });
});
