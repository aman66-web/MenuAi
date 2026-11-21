import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ACCOUNT_REFRESH_GAP_MS, forgetAccountAccess, refreshAccountAccess, resetAccountAccessForTests, welcomeSaid } from "../lib/payments/accountAccess";
import { refreshAppStoreAccess } from "../lib/payments/iap";
import { generateKeyPair, signClaims, type EntitlementClaims } from "../lib/payments/token";
import {
  FREE_WEEK_DAYS, FREE_WEEK_ENDED, FREE_WEEK_LAST_DAY, FREE_WEEK_LEFT, FREE_WEEK_NOTE, NO_FREE_WEEK, PREMIUM_GIFT, freeWeekDaysLeft, freeWeekEnded, freeWeekHad, sanitizeFreeWeek,
} from "../lib/mm/freeWeek";
import { format } from "../lib/mm/i18n";
import { cleanNativeResult, type NativeResult } from "../lib/mm/native";
import { NO_PAID, accountAccessActive, boughtActive, sanitizePaid } from "../lib/mm/paid";
import { freeWeekStore, paidStore } from "../lib/mm/stores";
import { isPro } from "../lib/mm/entitlements";

// The phone's side of the free week and gifts (lib/payments/accountAccess.ts): asking the account, keeping its token as a purchase's is kept, a purchase always
// winning, forgetting it with the account, and what the screens read (lib/mm/freeWeek.ts). The server's rules are in freeWeek.test.ts.

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 21, 9);
const JWS = "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJ4In0.c2lnbmF0dXJl";
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
  vi.useRealTimers();
});

const token = (plan: EntitlementClaims["plan"], src: EntitlementClaims["src"], expMs: number) =>
  signClaims({ v: 1, plan, src, iat: Math.floor(NOW / 1000), exp: Math.floor(expMs / 1000) }, privateJwk);
const phone = (answers: Partial<Record<string, NativeResult>>) => vi.fn(async (action: string) => answers[action] ?? { error: "unavailable" as const });
const DEVICE = { deviceToken: "cGhvbmUtb25lLXRva2VuLWZyb20tYXBwbGU=", deviceEnv: "production" as const };
const server = (status: number, body: unknown) => vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
  void path;
  void init;
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
});

async function trialAnswer(endsAt = NOW + FREE_WEEK_DAYS * DAY, claimedNow = true) {
  return { premium: true, plan: "trial", token: await token("trial", "account", endsAt), expiresAt: endsAt, freeWeek: "running", freeWeekEndsAt: endsAt, claimedNow, deviceCheck: "set" };
}

describe("asking the account for its own Premium", () => {
  it("a new account: sends this iPhone's DeviceCheck token, keeps the free week's token as a purchase's is kept, and Home's one line is owed", async () => {
    vi.useFakeTimers({ now: NOW });
    const call = phone({ "deviceCheck.token": DEVICE });
    const request = server(200, await trialAnswer());
    expect(await refreshAccountAccess({ userId: "user-1", request, call, nowMs: NOW, force: true })).toBe("trial");
    expect(call).toHaveBeenCalledWith("deviceCheck.token", {}, 10_000);
    expect(request).toHaveBeenCalledWith("entitlement/account", { method: "POST", body: DEVICE });
    expect(paidStore.get()).toMatchObject({ plan: "trial", until: Math.floor((NOW + 7 * DAY) / 1000) * 1000 });
    expect(isPro({ devProOverride: false }, paidStore.get(), NOW)).toBe(true);
    expect(accountAccessActive(paidStore.get(), NOW)).toBe(true);
    expect(boughtActive(paidStore.get(), NOW)).toBe(false);
    expect(freeWeekStore.get()).toEqual({ user: "user-1", status: "running", endsAt: NOW + 7 * DAY, welcomeDue: true });
    welcomeSaid();
    expect(freeWeekStore.get().welcomeDue).toBe(false);
  });

  it("no DeviceCheck token (the Simulator): asks anyway, with an empty body", async () => {
    const request = server(200, await trialAnswer());
    expect(await refreshAccountAccess({ userId: "user-1", request, call: phone({}), nowMs: NOW, force: true })).toBe("trial");
    expect(request).toHaveBeenCalledWith("entitlement/account", { method: "POST", body: {} });
  });

  it("once the phone knows the week is running, it doesn't ask Apple for the iPhone again; the line isn't owed twice", async () => {
    freeWeekStore.set({ user: "user-1", status: "running", endsAt: NOW + 5 * DAY, welcomeDue: false });
    const call = phone({ "deviceCheck.token": DEVICE });
    const request = server(200, await trialAnswer(NOW + 5 * DAY, false));
    await refreshAccountAccess({ userId: "user-1", request, call, nowMs: NOW, force: true });
    expect(call).not.toHaveBeenCalled();
    expect(freeWeekStore.get().welcomeDue).toBe(false);
  });

  it("a purchase wins: with a bought token running the account isn't asked at all (so a subscriber's week isn't used up)", async () => {
    paidStore.set(sanitizePaid({ token: await token("annual", "apple", NOW + 300 * DAY), plan: "annual", until: NOW + 300 * DAY }));
    const request = server(200, await trialAnswer());
    expect(await refreshAccountAccess({ userId: "user-1", request, call: phone({}), nowMs: NOW, force: true })).toBe("bought");
    expect(request).not.toHaveBeenCalled();
    expect(paidStore.get().plan).toBe("annual");
  });

  it("asks at most every half hour unless forced (start-up, a new sign-in)", async () => {
    const request = server(200, await trialAnswer());
    await refreshAccountAccess({ userId: "user-1", request, call: phone({}), nowMs: NOW, force: true });
    expect(await refreshAccountAccess({ userId: "user-1", request, call: phone({}), nowMs: NOW + 60_000 })).toBe("skipped");
    expect(await refreshAccountAccess({ userId: "user-1", request, call: phone({}), nowMs: NOW + ACCOUNT_REFRESH_GAP_MS + 1 })).toBe("trial");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("the week has ended: the account's token goes, the paywall can say so; another account on this phone isn't told", async () => {
    vi.useFakeTimers({ now: NOW + 8 * DAY });
    paidStore.set(sanitizePaid({ token: await token("trial", "account", NOW + 7 * DAY), plan: "trial", until: NOW + 7 * DAY }));
    freeWeekStore.set({ user: "user-1", status: "running", endsAt: NOW + 7 * DAY, welcomeDue: false });
    const request = server(200, { premium: false, freeWeek: "ended", freeWeekEndsAt: NOW + 7 * DAY, deviceCheck: "not_needed" });
    expect(await refreshAccountAccess({ userId: "user-1", request, call: phone({}), nowMs: NOW + 8 * DAY, force: true })).toBe("none");
    expect(paidStore.get().token).toBeNull();
    expect(freeWeekEnded(freeWeekStore.get(), "user-1", NOW + 8 * DAY)).toBe(true);
    expect(freeWeekEnded(freeWeekStore.get(), "user-2", NOW + 8 * DAY)).toBe(false);
    expect(freeWeekEnded(freeWeekStore.get(), null, NOW + 8 * DAY)).toBe(false);
  });

  it("this iPhone had a week on another account: no Premium, and not said to be this account's week ending", async () => {
    const request = server(200, { premium: false, freeWeek: "device_used", deviceCheck: "checked" });
    expect(await refreshAccountAccess({ userId: "user-2", request, call: phone({ "deviceCheck.token": DEVICE }), nowMs: NOW, force: true })).toBe("none");
    expect(freeWeekStore.get()).toMatchObject({ user: "user-2", status: "none" });
    expect(freeWeekEnded(freeWeekStore.get(), "user-2", NOW)).toBe(false);
  });

  it("a gift: kept like the free week, and gone once the founder takes it away", async () => {
    vi.useFakeTimers({ now: NOW });
    const gift = { premium: true, plan: "gift", token: await token("gift", "account", NOW + 30 * DAY), expiresAt: NOW + 30 * DAY, giftUntil: null, freeWeek: "not_checked", deviceCheck: "not_needed" };
    expect(await refreshAccountAccess({ userId: "user-1", request: server(200, gift), call: phone({}), nowMs: NOW, force: true })).toBe("gift");
    expect(paidStore.get().plan).toBe("gift");
    expect(freeWeekStore.get()).toMatchObject({ status: "gift", welcomeDue: false });
    // taken away, and the account's week was had long ago
    const removed = server(200, { premium: false, freeWeek: "ended", freeWeekEndsAt: NOW - DAY, deviceCheck: "not_needed" });
    await refreshAccountAccess({ userId: "user-1", request: removed, call: phone({}), nowMs: NOW + DAY, force: true });
    expect(paidStore.get().token).toBeNull();
  });

  it("no answer (offline, the server down, the tables not made yet, a forged token) changes nothing", async () => {
    vi.useFakeTimers({ now: NOW });
    const kept = await token("trial", "account", NOW + 3 * DAY);
    paidStore.set(sanitizePaid({ token: kept, plan: "trial", until: NOW + 3 * DAY }));
    freeWeekStore.set({ user: "user-1", status: "running", endsAt: NOW + 3 * DAY, welcomeDue: false });
    const offline = vi.fn(async () => { throw new Error("offline"); });
    expect(await refreshAccountAccess({ userId: "user-1", request: offline, call: phone({}), nowMs: NOW, force: true })).toBe("failed");
    expect(await refreshAccountAccess({ userId: "user-1", request: server(500, { error: "server_error" }), call: phone({}), nowMs: NOW, force: true })).toBe("failed");
    expect(await refreshAccountAccess({ userId: "user-1", request: server(401, { error: "unauthorized" }), call: phone({}), nowMs: NOW, force: true })).toBe("failed");
    const forged = { ...(await trialAnswer()), token: "v1.e30.c2ln" };
    expect(await refreshAccountAccess({ userId: "user-1", request: server(200, forged), call: phone({}), nowMs: NOW, force: true })).toBe("failed");
    expect(paidStore.get().token).toBe(kept);
    expect(freeWeekStore.get().status).toBe("running");
    // a failure doesn't hold off the next return to the front
    expect(await refreshAccountAccess({ userId: "user-1", request: server(200, await trialAnswer()), call: phone({}), nowMs: NOW + 1000 })).toBe("trial");
  });

  it("another account on this phone: the last account's token and notes are not this one's", async () => {
    paidStore.set(sanitizePaid({ token: await token("trial", "account", NOW + 3 * DAY), plan: "trial", until: NOW + 3 * DAY }));
    freeWeekStore.set({ user: "user-1", status: "running", endsAt: NOW + 3 * DAY, welcomeDue: true });
    const request = server(500, {});
    await refreshAccountAccess({ userId: "user-2", request, call: phone({}), nowMs: NOW, force: true });
    expect(paidStore.get().token).toBeNull();
    expect(freeWeekStore.get()).toEqual(NO_FREE_WEEK);
  });
});

describe("forgetting it with the account, and Apple's purchases", () => {
  it("signing out, Delete my account and Clear data forget the account's token, never a bought one", async () => {
    paidStore.set(sanitizePaid({ token: await token("trial", "account", NOW + 3 * DAY), plan: "trial", until: NOW + 3 * DAY }));
    freeWeekStore.set({ user: "user-1", status: "running", endsAt: NOW + 3 * DAY, welcomeDue: false });
    forgetAccountAccess();
    expect(paidStore.get().token).toBeNull();
    expect(freeWeekStore.get()).toEqual(NO_FREE_WEEK);
    const bought = await token("monthly", "apple", NOW + 20 * DAY);
    paidStore.set(sanitizePaid({ token: bought, plan: "monthly", until: NOW + 20 * DAY }));
    forgetAccountAccess();
    expect(paidStore.get().token).toBe(bought);
  });

  it("an App Store purchase replaces a gift's token at once, even one with weeks left; Apple's empty list leaves the account's token alone", async () => {
    paidStore.set(sanitizePaid({ token: await token("gift", "account", NOW + 30 * DAY), plan: "gift", until: NOW + 30 * DAY }));
    const appleToken = await token("annual", "apple", NOW + 365 * DAY);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ token: appleToken }), { status: 200 }));
    await refreshAppStoreAccess(phone({ "iap.entitlements": { transactions: [JWS] } }), fetchImpl as unknown as typeof fetch, NOW);
    expect(paidStore.get().plan).toBe("annual");

    const trial = await token("trial", "account", NOW + 5 * DAY);
    paidStore.set(sanitizePaid({ token: trial, plan: "trial", until: NOW + 5 * DAY }));
    await refreshAppStoreAccess(phone({ "iap.entitlements": { transactions: [] } }), fetchImpl as unknown as typeof fetch, NOW);
    expect(paidStore.get().token).toBe(trial);
  });
});

describe("what the phone keeps and the screens read", () => {
  it("keeps a free week or gift plan with its token; drops anything it doesn't know", () => {
    expect(sanitizePaid({ token: "v1.abcdefghijklmnopqrstuvwxyz.sig", plan: "trial", until: NOW }).plan).toBe("trial");
    expect(sanitizePaid({ token: "v1.abcdefghijklmnopqrstuvwxyz.sig", plan: "gift", until: NOW }).plan).toBe("gift");
    expect(sanitizePaid({ token: "v1.abcdefghijklmnopqrstuvwxyz.sig", plan: "forever", until: NOW }).plan).toBeNull();
    expect(sanitizeFreeWeek({ user: "user-1", status: "running", endsAt: NOW, welcomeDue: true })).toEqual({ user: "user-1", status: "running", endsAt: NOW, welcomeDue: true });
    expect(sanitizeFreeWeek({ user: "user-1", status: "ended", endsAt: NOW, welcomeDue: true }).welcomeDue).toBe(false);
    expect(sanitizeFreeWeek({ user: "<x>", status: "running" })).toEqual(NO_FREE_WEEK);
    expect(sanitizeFreeWeek({ user: "user-1", status: "weird" }).status).toBe("none");
    expect(sanitizeFreeWeek(null)).toEqual(NO_FREE_WEEK);
  });

  it("days left count a part day as a day; ended after the end; had = running or ended", () => {
    expect(freeWeekDaysLeft(NOW + 7 * DAY, NOW)).toBe(7);
    expect(freeWeekDaysLeft(NOW + 6 * DAY + 1, NOW)).toBe(7);
    expect(freeWeekDaysLeft(NOW + 1000, NOW)).toBe(1);
    expect(freeWeekDaysLeft(NOW, NOW)).toBe(0);
    const running = { user: "u", status: "running" as const, endsAt: NOW + DAY, welcomeDue: false };
    expect(freeWeekEnded(running, "u", NOW)).toBe(false);
    expect(freeWeekEnded(running, "u", NOW + DAY)).toBe(true); // run out on this phone since the server last said
    expect(freeWeekHad(running, "u")).toBe(true);
    expect(freeWeekHad({ ...running, status: "gift" }, "u")).toBe(false);
    expect(freeWeekHad(running, "v")).toBe(false);
  });

  it("the words: the line when it starts, Settings, and the paywall once it has ended (one free week, never two)", () => {
    expect(format(FREE_WEEK_NOTE, { days: FREE_WEEK_DAYS })).toBe("Premium is yours free for 7 days.");
    expect(format(FREE_WEEK_LEFT, { n: 3 })).toBe("Free week: 3 days left");
    expect(FREE_WEEK_LAST_DAY).toBe("Free week: 1 day left");
    expect(PREMIUM_GIFT).toBe("Premium, a gift");
    expect(FREE_WEEK_ENDED).toBe("Your free week has ended");
  });

  it("the bridge lets through Apple's DeviceCheck token and its server, nothing else", () => {
    expect(cleanNativeResult(DEVICE)).toEqual(DEVICE);
    expect(cleanNativeResult({ deviceToken: DEVICE.deviceToken, deviceEnv: "staging" })).toEqual({ deviceToken: DEVICE.deviceToken });
    expect(cleanNativeResult({ deviceToken: "<script>alert(1)</script>" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ deviceToken: "short" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ deviceEnv: "production" })).toEqual({ error: "unavailable" });
  });
});
