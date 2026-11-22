import { createVerify, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  FREE_WEEK_DAYS, GIFT_TOKEN_DAYS, claimKey, claimKeys, deviceClaimKey, handleAccountEntitlement, memoryFreeWeekStore, normaliseEmail,
  type AccountEntitlementDeps, type AccountIdentity, type DeviceBits, type DeviceCheckPort,
} from "../lib/payments/freeWeek";
import { NO_BITS_YET, appleDeviceCheck, deviceCheckConfigFromEnv, deviceCheckJwt } from "../lib/payments/deviceCheck";
import { generateKeyPair, signClaims, verifyToken, type EntitlementClaims } from "../lib/payments/token";

vi.mock("server-only", () => ({}));

// The free week and gifts of Premium on the server (lib/payments/freeWeek.ts, POST /api/v1/entitlement/account): who gets a week, who doesn't (the same email,
// the same Apple ID, the same iPhone), gifts, DeviceCheck switched off or failing, and the token the AI routes then accept. The phone's side is in
// accountAccess.test.ts.

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 21, 9);
const SECRET = "a-test-secret-that-is-long-enough-for-hmac-keys";
let keys: { publicJwk: JsonWebKey; privateJwk: JsonWebKey };

beforeAll(async () => {
  keys = await generateKeyPair();
});

/** A pretend Apple DeviceCheck server: iPhones by token, each with its two bits. */
function fakeApple(initial: Record<string, DeviceBits> = {}, opts: { down?: boolean; refuseUpdate?: boolean } = {}) {
  const phones = new Map(Object.entries(initial));
  const port: DeviceCheckPort & { phones: typeof phones; asked: string[] } = {
    phones,
    asked: [],
    async query(token, env) {
      port.asked.push(`query ${env}`);
      if (opts.down) return null;
      return phones.get(token) ?? { bit0: false, bit1: false };
    },
    async markFreeWeek(token, env, bits) {
      port.asked.push(`mark ${env}`);
      if (opts.down || opts.refuseUpdate) return false;
      phones.set(token, { bit0: true, bit1: bits.bit1 });
      return true;
    },
  };
  return port;
}

function deps(over: Partial<AccountEntitlementDeps> = {}): AccountEntitlementDeps {
  return {
    sign: (claims) => signClaims(claims, keys.privateJwk),
    secret: SECRET,
    store: memoryFreeWeekStore(),
    deviceCheck: fakeApple(),
    nowMs: NOW,
    allow: () => true,
    ...over,
  };
}

const person = (over: Partial<AccountIdentity> = {}): AccountIdentity => ({ userId: "user-1", email: "Anna.Smith@example.com", appleSub: null, ...over });
const PHONE = { deviceToken: "cGhvbmUtb25lLXRva2VuLWZyb20tYXBwbGU=" };
const OTHER_PHONE = { deviceToken: "cGhvbmUtdHdvLXRva2VuLWZyb20tYXBwbGU=" };
// Android phones: the app's SHA-256 of the Android ID (the server hashes it again with its secret)
const DROID = { androidDeviceHash: "a".repeat(64) };
const OTHER_DROID = { androidDeviceHash: "b".repeat(64) };

describe("the keys: a normalised email and the Apple ID, hashed with the server's secret", () => {
  it("treats one mailbox as one address", () => {
    expect(normaliseEmail("  Anna.Smith@Example.COM ")).toBe("anna.smith@example.com");
    expect(normaliseEmail("anna+numbite@example.com")).toBe("anna@example.com");
    expect(normaliseEmail("a.n.n.a+x@gmail.com")).toBe("anna@gmail.com");
    expect(normaliseEmail("anna@googlemail.com")).toBe("anna@gmail.com");
    // dots matter elsewhere
    expect(normaliseEmail("a.nna@example.com")).not.toBe(normaliseEmail("anna@example.com"));
    expect(normaliseEmail("abc123@privaterelay.appleid.com")).toBe("abc123@privaterelay.appleid.com");
    for (const bad of ["", "anna", "@example.com", "anna@", "+x@example.com", "an na@example.com", "anna@localhost"]) expect(normaliseEmail(bad), bad).toBeNull();
  });

  it("is a keyed one-way hash: never the address, different with another secret, the same for the same mailbox", () => {
    const k = claimKey("email", "anna@example.com", SECRET);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain("anna");
    expect(claimKey("email", "anna@example.com", `${SECRET}-other`)).not.toBe(k);
    expect(claimKey("apple", "anna@example.com", SECRET)).not.toBe(k); // an email and an Apple ID never collide
    const [a] = claimKeys({ email: "Anna+promo@Example.com", appleSub: null }, SECRET);
    const [b] = claimKeys({ email: "anna@example.com", appleSub: null }, SECRET);
    expect(a).toEqual(b);
    expect(claimKeys({ email: "x@example.com", appleSub: " 001234.abc.0987 " }, SECRET).map((c) => c.kind)).toEqual(["email", "apple"]);
    expect(claimKeys({ email: null, appleSub: null }, SECRET)).toEqual([]);
  });
});

describe("the free week", () => {
  it("starts on the account's first ask: 7 days, a signed token the AI routes accept, the iPhone marked", async () => {
    const d = deps();
    const r = await handleAccountEntitlement(person(), PHONE, d);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ premium: true, plan: "trial", freeWeek: "running", claimedNow: true, deviceCheck: "set", expiresAt: NOW + FREE_WEEK_DAYS * DAY });
    expect(FREE_WEEK_DAYS).toBe(7);
    const claims = await verifyToken(r.body.token as string, keys.publicJwk, NOW);
    expect(claims).toMatchObject({ v: 1, plan: "trial", src: "account", exp: Math.floor((NOW + 7 * DAY) / 1000) });
    // nothing personal in the token or the stored rows
    expect(JSON.stringify(claims)).not.toMatch(/anna|user-1/i);
    const store = d.store as ReturnType<typeof memoryFreeWeekStore>;
    expect(store.claims).toHaveLength(1);
    expect(JSON.stringify(store.claims)).not.toMatch(/anna|example|user-1/i);
    expect((d.deviceCheck as ReturnType<typeof fakeApple>).phones.get(PHONE.deviceToken)).toEqual({ bit0: true, bit1: false });
    // it has run out a week later: the token no longer checks
    expect(await verifyToken(r.body.token as string, keys.publicJwk, NOW + 7 * DAY + 1000)).toBeNull();
  });

  it("asking again during the week gives the same end, not a new week (and doesn't need the iPhone)", async () => {
    const d = deps();
    await handleAccountEntitlement(person(), PHONE, d);
    const later = await handleAccountEntitlement(person(), {}, { ...d, nowMs: NOW + 3 * DAY });
    expect(later.body).toMatchObject({ premium: true, plan: "trial", freeWeek: "running", claimedNow: false, expiresAt: NOW + 7 * DAY, freeWeekEndsAt: NOW + 7 * DAY, deviceCheck: "not_needed" });
  });

  it("has ended after the week: no token, and the answer says so", async () => {
    const d = deps();
    await handleAccountEntitlement(person(), PHONE, d);
    const r = await handleAccountEntitlement(person(), PHONE, { ...d, nowMs: NOW + 8 * DAY });
    expect(r.body).toEqual({ premium: false, freeWeek: "ended", freeWeekEndsAt: NOW + 7 * DAY, deviceCheck: "not_needed" });
  });

  it("is never had twice by the same email: a deleted account signing up again, a +tag, another iPhone", async () => {
    const d = deps();
    await handleAccountEntitlement(person({ userId: "user-1" }), PHONE, d);
    // the account deleted (trial_claims has no link to it) and made again with the same address, on another iPhone, after the week
    const again = await handleAccountEntitlement(person({ userId: "user-2", email: "anna.smith+again@example.com" }), OTHER_PHONE, { ...d, nowMs: NOW + 10 * DAY });
    expect(again.body).toMatchObject({ premium: false, freeWeek: "ended" });
    // made again within the week: only what is left of the same week
    const soon = await handleAccountEntitlement(person({ userId: "user-3" }), OTHER_PHONE, { ...d, nowMs: NOW + 2 * DAY });
    expect(soon.body).toMatchObject({ premium: true, plan: "trial", expiresAt: NOW + 7 * DAY, claimedNow: false });
  });

  it("is never had twice by the same Apple ID, whatever email it shows (Hide My Email, then the real one)", async () => {
    const d = deps();
    await handleAccountEntitlement(person({ email: "x1y2@privaterelay.appleid.com", appleSub: "001234.abcd.0987" }), PHONE, d);
    const r = await handleAccountEntitlement(person({ userId: "user-2", email: "anna@icloud.com", appleSub: "001234.abcd.0987" }), OTHER_PHONE, { ...d, nowMs: NOW + 9 * DAY });
    expect(r.body).toMatchObject({ premium: false, freeWeek: "ended" });
    // and the new email is now remembered with the same dates: a Google account with that address gets no week of its own later
    const google = await handleAccountEntitlement(person({ userId: "user-3", email: "anna@icloud.com", appleSub: null }), OTHER_PHONE, { ...d, nowMs: NOW + 9 * DAY });
    expect(google.body).toMatchObject({ premium: false, freeWeek: "ended", freeWeekEndsAt: NOW + 7 * DAY });
  });

  it("is never had twice on the same iPhone (DeviceCheck's bit 0), even with a new email; another iPhone still can", async () => {
    const d = deps();
    await handleAccountEntitlement(person(), PHONE, d);
    const second = await handleAccountEntitlement(person({ userId: "user-2", email: "someone.else@example.com" }), PHONE, { ...d, nowMs: NOW + DAY });
    expect(second.body).toEqual({ premium: false, freeWeek: "device_used", deviceCheck: "checked" });
    // that account didn't use up a week of its own: on a phone that never had one, it can
    const elsewhere = await handleAccountEntitlement(person({ userId: "user-2", email: "someone.else@example.com" }), OTHER_PHONE, { ...d, nowMs: NOW + DAY });
    expect(elsewhere.body).toMatchObject({ premium: true, plan: "trial", deviceCheck: "set" });
    // bit 1 is left as Apple had it
    const apple = fakeApple({ [PHONE.deviceToken]: { bit0: false, bit1: true } });
    await handleAccountEntitlement(person({ userId: "user-9", email: "nine@example.com" }), PHONE, deps({ deviceCheck: apple }));
    expect(apple.phones.get(PHONE.deviceToken)).toEqual({ bit0: true, bit1: true });
  });

  it("asks the DeviceCheck server the token is for (a build run from Xcode: development)", async () => {
    const apple = fakeApple();
    await handleAccountEntitlement(person(), { ...PHONE, deviceEnv: "development" }, deps({ deviceCheck: apple }));
    await handleAccountEntitlement(person({ userId: "u2", email: "b@example.com" }), OTHER_PHONE, deps({ deviceCheck: apple }));
    expect(apple.asked).toEqual(["query development", "mark development", "query production", "mark production"]);
  });

  it("skips the iPhone check, and says so, when DeviceCheck isn't set up, the app sent no token, or Apple can't be reached; never fails", async () => {
    expect((await handleAccountEntitlement(person(), PHONE, deps({ deviceCheck: null }))).body).toMatchObject({ premium: true, plan: "trial", deviceCheck: "not_configured" });
    expect((await handleAccountEntitlement(person(), {}, deps())).body).toMatchObject({ premium: true, plan: "trial", deviceCheck: "not_sent" });
    expect((await handleAccountEntitlement(person(), PHONE, deps({ deviceCheck: fakeApple({}, { down: true }) }))).body).toMatchObject({ premium: true, plan: "trial", deviceCheck: "failed" });
    expect((await handleAccountEntitlement(person(), PHONE, deps({ deviceCheck: fakeApple({}, { refuseUpdate: true }) }))).body).toMatchObject({ premium: true, plan: "trial", deviceCheck: "failed" });
    // a port that throws is the same as no answer
    const throwing: DeviceCheckPort = { query: async () => { throw new Error("boom"); }, markFreeWeek: async () => { throw new Error("boom"); } };
    expect((await handleAccountEntitlement(person(), PHONE, deps({ deviceCheck: throwing }))).body).toMatchObject({ premium: true, deviceCheck: "failed" });
  });

  it("an Android phone: the week starts, the phone is remembered only as a second hash, never as the app sent it", async () => {
    const d = deps();
    const first = await handleAccountEntitlement(person(), DROID, d);
    expect(first.body).toMatchObject({ premium: true, plan: "trial", expiresAt: NOW + 7 * DAY, claimedNow: true, deviceCheck: "set" });
    const claims = (d.store as ReturnType<typeof memoryFreeWeekStore>).claims;
    expect(claims.map((c) => c.kind).sort()).toEqual(["android", "email"]);
    const stored = claims.find((c) => c.kind === "android")!;
    expect(stored.keyHash).toBe(deviceClaimKey(DROID.androidDeviceHash, SECRET).keyHash);
    expect(stored.keyHash).not.toContain(DROID.androidDeviceHash);
    expect(stored.keyHash).not.toBe(claimKey("android", DROID.androidDeviceHash, "another-secret-that-is-long-enough-for-keys"));
    expect(stored).toMatchObject({ claimedAt: NOW, endsAt: NOW + 7 * DAY });
  });

  it("is never had twice on the same Android phone, even with a new email, a new Google account or after the week; another phone still can", async () => {
    const d = deps();
    await handleAccountEntitlement(person(), DROID, d);
    // a new email on the same phone the next day: no week, and the answer says it was the phone
    const second = await handleAccountEntitlement(person({ userId: "user-2", email: "someone.else@example.com" }), DROID, { ...d, nowMs: NOW + DAY });
    expect(second.body).toEqual({ premium: false, freeWeek: "device_used", deviceCheck: "checked" });
    // asking again (the phone doesn't know yet): still none, and never the days that are left of the other account's week
    const again = await handleAccountEntitlement(person({ userId: "user-2", email: "someone.else@example.com" }), DROID, { ...d, nowMs: NOW + 2 * DAY });
    expect(again.body).toMatchObject({ premium: false, freeWeek: "ended" });
    // and that email can't start a week on another phone either
    const elsewhere = await handleAccountEntitlement(person({ userId: "user-2", email: "someone.else@example.com" }), OTHER_DROID, { ...d, nowMs: NOW + 3 * DAY });
    expect(elsewhere.body).toMatchObject({ premium: false, freeWeek: "ended" });
    // after the week, a third account on the phone: nothing
    const late = await handleAccountEntitlement(person({ userId: "user-3", email: "third@example.com" }), DROID, { ...d, nowMs: NOW + 30 * DAY });
    expect(late.body).toMatchObject({ premium: false, freeWeek: "device_used" });
    // a phone that never had a week gives one to an account that has none
    const fresh = await handleAccountEntitlement(person({ userId: "user-4", email: "fourth@example.com" }), OTHER_DROID, { ...d, nowMs: NOW + 30 * DAY });
    expect(fresh.body).toMatchObject({ premium: true, plan: "trial", deviceCheck: "set" });
  });

  it("the account that had the week keeps it on its own phone and on another phone too, and signing in on a second phone doesn't use that phone up for others", async () => {
    const d = deps();
    await handleAccountEntitlement(person(), DROID, d);
    const same = await handleAccountEntitlement(person(), DROID, { ...d, nowMs: NOW + DAY });
    expect(same.body).toMatchObject({ premium: true, plan: "trial", expiresAt: NOW + 7 * DAY, claimedNow: false });
    const other = await handleAccountEntitlement(person(), OTHER_DROID, { ...d, nowMs: NOW + 2 * DAY });
    expect(other.body).toMatchObject({ premium: true, plan: "trial", expiresAt: NOW + 7 * DAY, claimedNow: false });
    // only the phone the week began on is remembered
    const claims = (d.store as ReturnType<typeof memoryFreeWeekStore>).claims;
    expect(claims.filter((c) => c.kind === "android")).toHaveLength(1);
    // so a different person with a different account gets their week on that second phone
    const partner = await handleAccountEntitlement(person({ userId: "partner", email: "partner@example.com" }), OTHER_DROID, { ...d, nowMs: NOW + 3 * DAY });
    expect(partner.body).toMatchObject({ premium: true, plan: "trial", claimedNow: true, deviceCheck: "set" });
  });

  it("remembering the phone is best effort: if the table doesn't take Android keys yet, the week still starts, and the answer and the notes say so", async () => {
    const base = memoryFreeWeekStore();
    const store = { ...base, insertClaims: async (c: Parameters<typeof base.insertClaims>[0]) => {
      if (c.some((x) => x.kind === "android")) throw new Error("violates check constraint trial_claims_kind_check");
      await base.insertClaims(c);
    } };
    const notes: string[] = [];
    const r = await handleAccountEntitlement(person(), DROID, deps({ store, note: (m) => notes.push(m) }));
    expect(r.body).toMatchObject({ premium: true, plan: "trial", expiresAt: NOW + 7 * DAY, deviceCheck: "failed" });
    expect(base.claims.map((c) => c.kind)).toEqual(["email"]);
    expect(notes).toEqual(["free week: Android phone key not stored"]);
    // the account's own keys are not best effort: a failure there is still a failure
    const broken = { ...base, insertClaims: async () => { throw new Error("down"); } };
    await expect(handleAccountEntitlement(person({ userId: "u9", email: "nine@example.com" }), DROID, deps({ store: broken }))).rejects.toThrow("down");
  });

  it("only a SHA-256 in lower-case hex is taken as an Android phone (anything else is a bad request)", async () => {
    for (const bad of ["", "xyz", "A".repeat(64), "a".repeat(63), "a".repeat(65), 12345]) {
      expect((await handleAccountEntitlement(person(), { androidDeviceHash: bad }, deps())).status).toBe(400);
    }
    expect((await handleAccountEntitlement(person(), { ...DROID, deviceToken: PHONE.deviceToken }, deps())).status).toBe(200);
  });

  it("two requests at once give one week", async () => {
    const d = deps();
    const [a, b] = await Promise.all([handleAccountEntitlement(person(), PHONE, d), handleAccountEntitlement(person(), PHONE, { ...d, nowMs: NOW + 5 })]);
    expect(a.body.expiresAt).toBe(b.body.expiresAt);
    expect((d.store as ReturnType<typeof memoryFreeWeekStore>).claims).toHaveLength(1);
  });

  it("an account with no email and no Apple ID can't be remembered, so it has no free week", async () => {
    expect((await handleAccountEntitlement(person({ email: null }), PHONE, deps())).body).toEqual({ premium: false, freeWeek: "no_identity", deviceCheck: "not_needed" });
  });
});

describe("gifts of Premium", () => {
  it("a running gift wins over the free week and doesn't use it up; one with no end is renewed every time the app asks", async () => {
    const d = deps();
    const store = d.store as ReturnType<typeof memoryFreeWeekStore>;
    store.gifts.push({ userId: "user-1", until: null });
    const r = await handleAccountEntitlement(person(), PHONE, d);
    expect(r.body).toMatchObject({ premium: true, plan: "gift", giftUntil: null, expiresAt: NOW + GIFT_TOKEN_DAYS * DAY, freeWeek: "not_checked", deviceCheck: "not_needed" });
    expect(await verifyToken(r.body.token as string, keys.publicJwk, NOW)).toMatchObject({ plan: "gift", src: "account" });
    expect(store.claims).toEqual([]);
    expect((d.deviceCheck as ReturnType<typeof fakeApple>).asked).toEqual([]);
  });

  it("a gift until a date lasts until then; once it has ended the free week applies as for anyone", async () => {
    const d = deps();
    (d.store as ReturnType<typeof memoryFreeWeekStore>).gifts.push({ userId: "user-1", until: NOW + 3 * DAY });
    expect((await handleAccountEntitlement(person(), PHONE, d)).body).toMatchObject({ plan: "gift", expiresAt: NOW + 3 * DAY, giftUntil: NOW + 3 * DAY });
    const after = await handleAccountEntitlement(person(), PHONE, { ...d, nowMs: NOW + 4 * DAY });
    expect(after.body).toMatchObject({ premium: true, plan: "trial", claimedNow: true, expiresAt: NOW + 4 * DAY + 7 * DAY });
  });

  it("another account's gift is not this one's", async () => {
    const d = deps();
    (d.store as ReturnType<typeof memoryFreeWeekStore>).gifts.push({ userId: "someone-else", until: null });
    expect((await handleAccountEntitlement(person(), PHONE, d)).body).toMatchObject({ plan: "trial" });
  });
});

describe("the route's guards", () => {
  it("503 without the signing key or the hash secret (no week that couldn't be remembered); 429 when asked too often; 400 for a bad body", async () => {
    expect((await handleAccountEntitlement(person(), {}, deps({ sign: null }))).status).toBe(503);
    expect((await handleAccountEntitlement(person(), {}, deps({ secret: null }))).status).toBe(503);
    expect((await handleAccountEntitlement(person(), {}, deps({ secret: "short" }))).status).toBe(503);
    expect((await handleAccountEntitlement(person(), {}, deps({ allow: () => false }))).status).toBe(429);
    for (const bad of [{ deviceToken: "<script>" }, { deviceToken: 42 }, { deviceEnv: "staging" }, { other: 1 }, "x"]) {
      expect((await handleAccountEntitlement(person(), bad, deps())).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await handleAccountEntitlement(person(), null, deps())).status).toBe(200);
  });
});

describe("the access token", () => {
  it("accepts a free week or a gift only from the account, and paid plans only from a payment", async () => {
    const sign = (c: Partial<EntitlementClaims>) => signClaims({ v: 1, plan: "trial", src: "account", iat: Math.floor(NOW / 1000), exp: Math.floor((NOW + DAY) / 1000), ...c } as EntitlementClaims, keys.privateJwk);
    expect(await verifyToken(await sign({}), keys.publicJwk, NOW)).toMatchObject({ plan: "trial" });
    expect(await verifyToken(await sign({ plan: "gift" }), keys.publicJwk, NOW)).toMatchObject({ plan: "gift" });
    expect(await verifyToken(await sign({ plan: "annual", src: "apple" }), keys.publicJwk, NOW)).toMatchObject({ plan: "annual" });
    expect(await verifyToken(await sign({ plan: "trial", src: "apple" }), keys.publicJwk, NOW)).toBeNull();
    expect(await verifyToken(await sign({ plan: "annual", src: "account" }), keys.publicJwk, NOW)).toBeNull();
    expect(await verifyToken(await sign({ plan: "forever" as never }), keys.publicJwk, NOW)).toBeNull();
  });

  it("the AI routes' Premium check accepts a free-week token while it runs, and not after", async () => {
    process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK = JSON.stringify(keys.publicJwk);
    const { premiumFor } = await import("../lib/photoRecipeRoute");
    const r = await handleAccountEntitlement(person(), {}, deps());
    const request = new Request("https://numbite.com/api/v1/recipe/photo", { headers: { Authorization: `Bearer ${r.body.token as string}` } });
    expect((await premiumFor(request, NOW + DAY)).premium).toBe(true);
    expect((await premiumFor(request, NOW + 8 * DAY)).token).toBeUndefined();
  });
});

describe("Apple's DeviceCheck server (lib/payments/deviceCheck.ts)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const cfg = { keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: pem };

  it("is set up only with all three of the key's values (the team may be the Sign in with Apple one)", () => {
    expect(deviceCheckConfigFromEnv({})).toBeNull();
    expect(deviceCheckConfigFromEnv({ DEVICECHECK_KEY_ID: "K", DEVICECHECK_PRIVATE_KEY: pem })).toBeNull();
    expect(deviceCheckConfigFromEnv({ DEVICECHECK_KEY_ID: "K", APPLE_TEAM_ID: "T", DEVICECHECK_PRIVATE_KEY: pem })).toMatchObject({ keyId: "K", teamId: "T" });
    expect(deviceCheckConfigFromEnv({ DEVICECHECK_KEY_ID: "K", DEVICECHECK_TEAM_ID: "T", DEVICECHECK_PRIVATE_KEY: "not a key" })).toBeNull();
  });

  it("signs the JWT Apple asks for: ES256, the key id, the team as issuer", () => {
    const jwt = deviceCheckJwt(cfg, 1_800_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(p!, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_800_000_000 });
    expect(createVerify("SHA256").update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"))).toBe(true);
  });

  it("reads the two bits (none set yet is Apple's plain-text answer), sets bit 0 keeping bit 1, and turns every failure into no answer", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; auth: string }> = [];
    const answers: Response[] = [];
    const fetchFake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: String((init?.headers as Record<string, string>).Authorization) });
      const next = answers.shift();
      if (!next) throw new Error("offline");
      return next;
    }) as unknown as typeof fetch;
    const port = appleDeviceCheck(cfg, { fetch: fetchFake, now: () => NOW, uuid: () => "00000000-0000-4000-8000-000000000000" });

    answers.push(new Response(NO_BITS_YET, { status: 200 }));
    expect(await port.query("dG9rZW4=", "production")).toEqual({ bit0: false, bit1: false });
    expect(calls[0]).toMatchObject({ url: "https://api.devicecheck.apple.com/v1/query_two_bits", body: { device_token: "dG9rZW4=", transaction_id: "00000000-0000-4000-8000-000000000000", timestamp: NOW } });
    expect(calls[0]!.auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);

    answers.push(new Response(JSON.stringify({ bit0: true, bit1: false, last_update_time: "2026-11" }), { status: 200 }));
    expect(await port.query("dG9rZW4=", "development")).toEqual({ bit0: true, bit1: false });
    expect(calls[1]!.url).toBe("https://api.development.devicecheck.apple.com/v1/query_two_bits");

    answers.push(new Response("", { status: 200 }));
    expect(await port.markFreeWeek("dG9rZW4=", "production", { bit0: false, bit1: true })).toBe(true);
    expect(calls[2]).toMatchObject({ url: "https://api.devicecheck.apple.com/v1/update_two_bits", body: { device_token: "dG9rZW4=", bit0: true, bit1: true } });

    answers.push(new Response("Missing or incorrectly formatted device token payload", { status: 400 }));
    expect(await port.query("bad", "production")).toBeNull();
    answers.push(new Response("Unable to verify authorization token", { status: 401 }));
    expect(await port.markFreeWeek("dG9rZW4=", "production", { bit0: false, bit1: false })).toBe(false);
    expect(await port.query("dG9rZW4=", "production")).toBeNull(); // no answer at all
  });
});

describe("the migration", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261121120000_free_week.sql", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../lib/payments/freeWeekStore-supabase.ts", import.meta.url), "utf8");

  it("has the two tables and the columns the adapter uses, server-only, gifts going with the account and claims staying", () => {
    for (const c of ["key_hash", "kind", "claimed_at", "ends_at"]) expect(sql).toMatch(new RegExp(`^\\s+${c}\\s`, "m"));
    for (const c of ["user_id", "until", "note", "granted_at"]) expect(sql).toMatch(new RegExp(`^\\s+${c}\\s`, "m"));
    expect(adapter).toContain('"trial_claims"');
    expect(adapter).toContain('"premium_gifts"');
    expect(sql).toMatch(/user_id\s+uuid primary key references auth\.users \(id\) on delete cascade/);
    // the claims have no link to an account, so deleting one leaves them
    expect(sql.slice(sql.indexOf("create table public.trial_claims"), sql.indexOf("create table public.premium_gifts"))).not.toMatch(/references|user_id|email\s+text/);
    for (const t of ["trial_claims", "premium_gifts"]) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
      expect(sql).toContain(`revoke all on public.${t} from anon, authenticated;`);
    }
    expect(sql).not.toMatch(/create policy/i);
  });

  it("the Android migration lets kind be 'android' (and keeps email and apple), and the adapter reads it back", () => {
    const android = readFileSync(new URL("../../supabase/migrations/20261122120000_trial_claims_android.sql", import.meta.url), "utf8");
    expect(android).toMatch(/drop constraint if exists trial_claims_kind_check/);
    expect(android).toMatch(/check \(kind in \('email', 'apple', 'android'\)\)/);
    // the table's own constraint is a column check, which Postgres names trial_claims_kind_check
    expect(sql).toMatch(/kind\s+text not null check \(kind in \('email', 'apple'\)\)/);
    expect(adapter).toContain('r.kind === "android" ? "android"');
  });
});
