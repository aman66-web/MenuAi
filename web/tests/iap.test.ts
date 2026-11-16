import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IAP_PRODUCT_IDS, REFRESH_BEFORE_MS, buyPlan, claimTransactions, loadProducts, refreshAppStoreAccess, restorePurchases } from "../lib/payments/iap";
import { generateKeyPair, signClaims } from "../lib/payments/token";
import { cleanNativeResult, type NativeResult } from "../lib/mm/native";
import { paidStore } from "../lib/mm/stores";
import { NO_PAID } from "../lib/mm/paid";

// The app's In-App Purchase client (lib/payments/iap.ts) with a pretend phone (the bridge) and a pretend server. The server's own check of Apple's signature is in
// applePurchase.test.ts; StoreKit's side is tested in Swift (MenuMacrosTests/PurchaseTests.swift).

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 16, 12);
const JWS = "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJ4In0.c2lnbmF0dXJl";
let privateJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await generateKeyPair();
  privateJwk = pair.privateJwk;
  process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK = JSON.stringify(pair.publicJwk);
});
afterEach(() => paidStore.set(NO_PAID));

const token = (src: "apple" | "stripe", expMs: number) => signClaims({ v: 1, plan: "annual", src, iat: Math.floor(NOW / 1000), exp: Math.floor(expMs / 1000) }, privateJwk);
const phone = (answers: Partial<Record<string, NativeResult>>) => vi.fn(async (action: string) => answers[action] ?? { error: "unavailable" as const });
const server = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("bridge answers for purchases", () => {
  it("lets through StoreKit's products and signed transactions, nothing else", () => {
    const product = { id: IAP_PRODUCT_IDS.annual, name: "Annual", price: "£14.99", period: "year" };
    expect(cleanNativeResult({ products: [product, { id: "<x>", name: "A", price: "1", period: "year" }] })).toEqual({ products: [product] });
    expect(cleanNativeResult({ transactions: [JWS] })).toEqual({ transactions: [JWS] });
    expect(cleanNativeResult({ transactions: [] })).toEqual({ transactions: [] });
    expect(cleanNativeResult({ transactions: ["not a jws"] })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ pending: true })).toEqual({ pending: true });
    expect(cleanNativeResult({ products: [{ ...product, price: "<b>£1</b>" }] })).toEqual({ products: [] });
    // the free trial's length, only as a whole number of days StoreKit could mean
    expect(cleanNativeResult({ products: [{ ...product, trialDays: 7 }] })).toEqual({ products: [{ ...product, trialDays: 7 }] });
    for (const bad of [0, 1.5, 40, "7", -7, null]) expect(cleanNativeResult({ products: [{ ...product, trialDays: bad }] })).toEqual({ products: [product] });
  });
});

describe("loading the plans from the App Store", () => {
  it("keeps the app's order and StoreKit's names and prices; null when StoreKit has none", async () => {
    const call = phone({ "iap.products": { products: [
      { id: IAP_PRODUCT_IDS.monthly, name: "Monthly", price: "£2.99", period: "month" },
      { id: IAP_PRODUCT_IDS.pass90, name: "Founding Member 90-Day Pass", price: "£9.99", period: "none" },
    ] } });
    expect((await loadProducts(call))?.map((p) => `${p.plan} ${p.price}`)).toEqual(["pass90 £9.99", "monthly £2.99"]);
    const withTrial = phone({ "iap.products": { products: [{ id: IAP_PRODUCT_IDS.annual, name: "Annual", price: "£14.99", period: "year", trialDays: 7 }] } });
    expect((await loadProducts(withTrial))?.[0]).toMatchObject({ plan: "annual", trialDays: 7 });
    expect(call).toHaveBeenCalledWith("iap.products", { ids: [IAP_PRODUCT_IDS.pass90, IAP_PRODUCT_IDS.annual, IAP_PRODUCT_IDS.monthly] }, 30_000);
    expect(await loadProducts(phone({ "iap.products": { products: [] } }))).toBeNull();
    expect(await loadProducts(phone({}))).toBeNull();
  });
});

describe("buying", () => {
  it("sends Apple's signed transaction to our server and keeps the token it answers with", async () => {
    const t = await token("apple", NOW + 400 * DAY);
    const fetchImpl = server(200, { token: t, plan: "annual", expiresAt: NOW + 400 * DAY });
    expect(await buyPlan("annual", phone({ "iap.purchase": { transactions: [JWS] } }), fetchImpl as unknown as typeof fetch)).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/entitlement\/apple$/);
    expect(JSON.parse(String(init.body))).toEqual({ transactions: [JWS] });
    expect(paidStore.get().token).toBe(t);
    expect(paidStore.get().plan).toBe("annual");
  });

  it("says cancelled, pending or unavailable without asking the server, and 'not confirmed' when the server doesn't agree", async () => {
    const fetchImpl = server(200, {});
    expect(await buyPlan("monthly", phone({ "iap.purchase": { error: "cancelled" } }), fetchImpl as unknown as typeof fetch)).toBe("cancelled");
    expect(await buyPlan("monthly", phone({ "iap.purchase": { pending: true } }), fetchImpl as unknown as typeof fetch)).toBe("pending");
    expect(await buyPlan("monthly", phone({ "iap.purchase": { error: "unavailable" } }), fetchImpl as unknown as typeof fetch)).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await buyPlan("monthly", phone({ "iap.purchase": { transactions: [JWS] } }), server(402, { error: "not_paid" }) as unknown as typeof fetch)).toBe("not_confirmed");
    expect(await buyPlan("monthly", phone({ "iap.purchase": { transactions: [JWS] } }), server(200, { token: "v1.forged.token" }) as unknown as typeof fetch)).toBe("not_confirmed");
    expect(await buyPlan("monthly", phone({ "iap.purchase": { transactions: [JWS] } }), vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("not_confirmed");
    expect(paidStore.get().token).toBeNull();
  });

  it("never sends an empty list", async () => {
    const fetchImpl = server(200, {});
    expect(await claimTransactions([], fetchImpl as unknown as typeof fetch)).toBe("not_paid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("restoring", () => {
  it("restores, says when there is nothing, and forgets an Apple token Apple no longer lists", async () => {
    const t = await token("apple", NOW + 30 * DAY);
    expect(await restorePurchases(phone({ "iap.restore": { transactions: [JWS] } }), server(200, { token: t }) as unknown as typeof fetch, NOW)).toBe("restored");
    expect(paidStore.get().token).toBe(t);
    expect(await restorePurchases(phone({ "iap.restore": { transactions: [] } }), server(200, {}) as unknown as typeof fetch, NOW)).toBe("none");
    expect(paidStore.get().token).toBeNull();
    expect(await restorePurchases(phone({ "iap.restore": { error: "cancelled" } }), server(200, {}) as unknown as typeof fetch, NOW)).toBe("cancelled");
    expect(await restorePurchases(phone({}), server(200, {}) as unknown as typeof fetch, NOW)).toBe("failed");
  });
});

describe("refreshing at start-up", () => {
  it("fetches a token when Apple lists a purchase and there is none, or it runs out within a week; leaves a fresh one alone", async () => {
    const fresh = await token("apple", NOW + 300 * DAY);
    const fetchImpl = server(200, { token: fresh });
    await refreshAppStoreAccess(phone({ "iap.entitlements": { transactions: [JWS] } }), fetchImpl as unknown as typeof fetch, NOW);
    expect(paidStore.get().token).toBe(fresh);
    await refreshAppStoreAccess(phone({ "iap.entitlements": { transactions: [JWS] } }), fetchImpl as unknown as typeof fetch, NOW);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await refreshAppStoreAccess(phone({ "iap.entitlements": { transactions: [JWS] } }), fetchImpl as unknown as typeof fetch, NOW + 300 * DAY - REFRESH_BEFORE_MS + DAY);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("forgets an Apple token after a refund, keeps a token from elsewhere, and changes nothing without an answer", async () => {
    paidStore.set({ ...NO_PAID, token: await token("apple", NOW + 30 * DAY), plan: "annual", until: NOW + 30 * DAY });
    await refreshAppStoreAccess(phone({}), server(200, {}) as unknown as typeof fetch, NOW);
    expect(paidStore.get().token).not.toBeNull();
    await refreshAppStoreAccess(phone({ "iap.entitlements": { transactions: [] } }), server(200, {}) as unknown as typeof fetch, NOW);
    expect(paidStore.get().token).toBeNull();
    const web = await token("stripe", NOW + 30 * DAY);
    paidStore.set({ ...NO_PAID, token: web, plan: "annual", until: NOW + 30 * DAY });
    await refreshAppStoreAccess(phone({ "iap.entitlements": { transactions: [] } }), server(200, {}) as unknown as typeof fetch, NOW);
    expect(paidStore.get().token).toBe(web);
  });
});
