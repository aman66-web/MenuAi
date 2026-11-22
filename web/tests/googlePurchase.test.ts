import { createVerify, generateKeyPairSync, type KeyObject } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_BASE_PLANS,
  GOOGLE_PACKAGE_NAME,
  GOOGLE_PUBLISHER_SCOPE,
  GOOGLE_SUBSCRIPTION_ID,
  GOOGLE_TOKEN_URL,
  TOKEN_EARLY_MS,
  createAccessTokenSource,
  parsePackageName,
  parseServiceAccount,
  serviceAccountAssertion,
  verifyGooglePurchase,
  type GoogleServiceAccount,
  type GoogleVerifyOptions,
} from "../lib/payments/google";
import { handleGoogleEntitlement, type GoogleEntitlementDeps } from "../lib/payments/googleHandler";
import { GOOGLE_CORS, GOOGLE_MAX_BODY_BYTES, googleContext } from "../lib/payments/googleRoute";
import { withJsonBody } from "../lib/http";
import { fromUs, preflight, withCors } from "../lib/cors";
import { generateKeyPair, signClaims, verifyToken } from "../lib/payments/token";

// Google Play Billing on the server (lib/payments/google.ts): a purchase token in, a Numbite access token out. A pretend Google (the token endpoint and the Play Developer
// API) stands in, with a throwaway RSA key for the service account, so nothing here touches the network; the pretend token endpoint checks the RS256 signature of the
// request for an access token with the service account's public key.

vi.mock("server-only", () => ({}));
process.env.SUPABASE_URL = "https://example-project.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret-key-test-secret-key-0123456789";
process.env.IP_HASH_SALT = "test-salt-test-salt-0123456789";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 22, 10);
const SUB = GOOGLE_SUBSCRIPTION_ID;
const PKG = GOOGLE_PACKAGE_NAME;
const TOKEN_A = "token-a.AbCdEf_1234567890-annual";
const TOKEN_B = "token-b.AbCdEf_1234567890-monthly";
const EMAIL = "play-reader@numbite-test.iam.gserviceaccount.com";

let privatePem: string;
let publicKey: KeyObject;
let account: GoogleServiceAccount;
let accountJson: string;

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privatePem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  publicKey = pair.publicKey;
  accountJson = JSON.stringify({ type: "service_account", project_id: "numbite-test", private_key_id: "k1", private_key: privatePem, client_email: EMAIL, client_id: "1" });
  account = parseServiceAccount(accountJson)!;
});

/** A SubscriptionPurchaseV2 as Google answers it. */
function purchase(over: Record<string, unknown> = {}, line: Record<string, unknown> = {}) {
  return {
    kind: "androidpublisher#subscriptionPurchaseV2",
    regionCode: "GB",
    latestOrderId: "GPA.1234-5678-9012-34567",
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    startTime: new Date(NOW - 10 * DAY).toISOString(),
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    lineItems: [{ productId: SUB, expiryTime: new Date(NOW + 20 * DAY).toISOString(), autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: "monthly" }, ...line }],
    ...over,
  };
}

interface FakeOptions {
  /** purchase token -> what Google answers: an object (200) or { status }. */
  tokens?: Record<string, unknown>;
  /** the package Google knows these tokens under */
  packageName?: string;
  /** answer 401 to this many of the next API calls */
  reject401?: number;
  tokenEndpoint?: "ok" | "refused" | "down" | "no_token";
  expiresIn?: number;
}

/** A pretend Google: the OAuth token endpoint (it checks the signed request) and purchases.subscriptionsv2.get. */
function fakeGoogle(options: FakeOptions = {}) {
  const calls: Array<{ url: string; method: string; authorization?: string }> = [];
  const issued: string[] = [];
  let reject = options.reject401 ?? 0;
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ url, method, authorization: headers.get("authorization") ?? undefined });
    if (url === GOOGLE_TOKEN_URL) {
      expect(method).toBe("POST");
      expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      const assertion = form.get("assertion")!;
      const [head, claims, signature] = assertion.split(".");
      expect(JSON.parse(Buffer.from(head!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
      const body = JSON.parse(Buffer.from(claims!, "base64url").toString()) as Record<string, number | string>;
      expect(body).toMatchObject({ iss: EMAIL, scope: GOOGLE_PUBLISHER_SCOPE, aud: GOOGLE_TOKEN_URL });
      expect(Number(body.exp) - Number(body.iat)).toBe(3600);
      const ok = createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(signature!, "base64url"));
      expect(ok, "the request for an access token is signed with the service account's key").toBe(true);
      if (options.tokenEndpoint === "down") throw new Error("network down");
      if (options.tokenEndpoint === "refused") return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      if (options.tokenEndpoint === "no_token") return new Response(JSON.stringify({ token_type: "Bearer" }), { status: 200 });
      const access = `ya29.access-token-${issued.length + 1}`;
      issued.push(access);
      return new Response(JSON.stringify({ access_token: access, expires_in: options.expiresIn ?? 3599, token_type: "Bearer" }), { status: 200 });
    }
    expect(method).toBe("GET");
    const pkg = options.packageName ?? PKG;
    const prefix = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/subscriptionsv2/tokens/`;
    if (reject > 0) {
      reject--;
      return new Response("{}", { status: 401 });
    }
    expect(issued).toContain((headers.get("authorization") ?? "").replace("Bearer ", ""));
    if (!url.startsWith(prefix)) return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }); // another package's address: this token isn't known there
    const answer = (options.tokens ?? {})[decodeURIComponent(url.slice(prefix.length))];
    if (answer === undefined) return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
    if (typeof answer === "object" && answer !== null && "status" in answer && typeof (answer as { status: unknown }).status === "number") {
      const status = (answer as { status: number }).status;
      return new Response((answer as { body?: string }).body ?? "{}", { status });
    }
    if (typeof answer === "function") throw new Error("network down");
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  return { fetch: impl as unknown as typeof fetch, impl, calls, issued };
}

function optionsFor(fake: ReturnType<typeof fakeGoogle>, over: Partial<GoogleVerifyOptions> = {}): GoogleVerifyOptions {
  return { nowMs: NOW, packageName: PKG, fetch: fake.fetch, accessTokens: createAccessTokenSource(account, fake.fetch), ...over };
}
const ask = (token: string, fake: ReturnType<typeof fakeGoogle>, over: Partial<GoogleVerifyOptions> = {}, productId = SUB) => verifyGooglePurchase({ productId, token }, optionsFor(fake, over));

describe("the service account (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)", () => {
  it("reads the key file's JSON, or the same text in base64, and nothing else", () => {
    expect(parseServiceAccount(accountJson)?.clientEmail).toBe(EMAIL);
    expect(parseServiceAccount(`  ${accountJson}\n`)?.clientEmail).toBe(EMAIL);
    expect(parseServiceAccount(Buffer.from(accountJson).toString("base64"))?.clientEmail).toBe(EMAIL);
    for (const bad of [undefined, "", "  ", "not json", "null", "42", "[]", "{}", JSON.stringify({ type: "authorized_user" }), JSON.stringify({ type: "service_account", client_email: "nope", private_key: privatePem }), JSON.stringify({ type: "service_account", client_email: EMAIL, private_key: "-----BEGIN PRIVATE KEY-----\nbm9wZQ==\n-----END PRIVATE KEY-----" }), JSON.stringify({ type: "service_account", client_email: EMAIL })]) {
      expect(parseServiceAccount(bad)).toBeNull();
    }
    // an EC key is not what Google's service accounts use
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(parseServiceAccount(JSON.stringify({ type: "service_account", client_email: EMAIL, private_key: ec }))).toBeNull();
  });

  it("the package name is ours unless GOOGLE_PLAY_PACKAGE_NAME names another, and a value that isn't a package name counts as not set up", () => {
    expect(parsePackageName(undefined)).toBe("com.amanmarwaha.numbite");
    expect(parsePackageName("  ")).toBe("com.amanmarwaha.numbite");
    expect(parsePackageName("com.example.other_app")).toBe("com.example.other_app");
    for (const bad of ["numbite", "com.example/../x", "com.example.app?x=1", "1com.example", "com..example"]) expect(parsePackageName(bad)).toBeNull();
  });

  it("signs the request for an access token with RS256, for an hour", () => {
    const [head, claims, signature] = serviceAccountAssertion(account, NOW).split(".");
    expect(createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
    const body = JSON.parse(Buffer.from(claims!, "base64url").toString()) as { iat: number; exp: number };
    expect(body.iat).toBe(Math.floor(NOW / 1000));
    expect(body.exp).toBe(body.iat + 3600);
  });
});

describe("the access token for Google's API", () => {
  it("is asked for once and kept until shortly before it ends, then asked for again", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase() }, expiresIn: 3599 });
    const source = createAccessTokenSource(account, fake.fetch);
    const first = await source.get(NOW);
    expect(await source.get(NOW + 30 * 60_000)).toBe(first);
    expect(fake.issued).toHaveLength(1);
    expect(await source.get(NOW + 3599_000 - TOKEN_EARLY_MS - 1)).toBe(first);
    expect(fake.issued).toHaveLength(1);
    const second = await source.get(NOW + 3599_000 - TOKEN_EARLY_MS);
    expect(second).not.toBe(first);
    expect(fake.issued).toHaveLength(2);
    // a new one on demand (Google turned the old one down)
    expect(await source.get(NOW + 3599_000 - TOKEN_EARLY_MS, true)).not.toBe(second);
  });

  it("asks only once when several purchases are checked at the same moment", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase(), [TOKEN_B]: purchase() } });
    const options = optionsFor(fake);
    await Promise.all([verifyGooglePurchase({ productId: SUB, token: TOKEN_A }, options), verifyGooglePurchase({ productId: SUB, token: TOKEN_B }, options)]);
    expect(fake.calls.filter((c) => c.url === GOOGLE_TOKEN_URL)).toHaveLength(1);
  });

  it("throws, with nothing in the error that matters, when Google refuses or says nothing useful", async () => {
    for (const tokenEndpoint of ["refused", "down", "no_token"] as const) {
      const fake = fakeGoogle({ tokenEndpoint });
      await expect(createAccessTokenSource(account, fake.fetch).get(NOW)).rejects.toThrow();
    }
  });
});

describe("one purchase: what Google says decides", () => {
  it("accepts an active monthly and an active annual, with access to the paid period's end plus three days", async () => {
    const monthlyEnd = NOW + 20 * DAY;
    const annualEnd = NOW + 300 * DAY;
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_B]: purchase({}, { expiryTime: new Date(monthlyEnd).toISOString(), offerDetails: { basePlanId: "monthly" } }),
        [TOKEN_A]: purchase({}, { expiryTime: new Date(annualEnd).toISOString(), offerDetails: { basePlanId: "annual", offerId: "intro" } }),
      },
    });
    expect(await ask(TOKEN_B, fake)).toEqual({ ok: true, plan: "monthly", accessEnd: monthlyEnd + 3 * DAY, testPurchase: false });
    expect(await ask(TOKEN_A, fake)).toEqual({ ok: true, plan: "annual", accessEnd: annualEnd + 3 * DAY, testPurchase: false });
    // the page may name the product the way it names a plan
    expect(await ask(TOKEN_A, fake, {}, `${SUB}:annual`)).toMatchObject({ ok: true, plan: "annual" });
    // a license tester's purchase is a real purchase for our purposes (and is marked)
    const tester = fakeGoogle({ tokens: { [TOKEN_A]: purchase({ testPurchase: {} }) } });
    expect(await ask(TOKEN_A, tester)).toMatchObject({ ok: true, testPurchase: true });
  });

  it("asks Google for our package, with the service account's access token, and puts the purchase token in the address safely", async () => {
    const odd = "tok/en?x=1&y=2#frag.0123456789";
    const fake = fakeGoogle({ tokens: { [odd]: purchase() } });
    expect((await ask(odd, fake)).ok).toBe(true);
    const api = fake.calls.find((c) => c.url.includes("/purchases/subscriptionsv2/tokens/"))!;
    expect(api.url).toBe(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.amanmarwaha.numbite/purchases/subscriptionsv2/tokens/${encodeURIComponent(odd)}`);
    expect(api.url).not.toContain("?x=1");
    expect(api.authorization).toBe(`Bearer ${fake.issued[0]}`);
  });

  it("keeps a subscription that is cancelled (it won't renew) while its paid period still runs, and gives nothing once that has ended", async () => {
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_A]: purchase({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED", canceledStateContext: { userInitiatedCancellation: {} } }, { expiryTime: new Date(NOW + 5 * DAY).toISOString(), autoRenewingPlan: { autoRenewEnabled: false } }),
        [TOKEN_B]: purchase({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED" }, { expiryTime: new Date(NOW - 1000).toISOString() }),
      },
    });
    expect(await ask(TOKEN_A, fake)).toMatchObject({ ok: true, plan: "monthly", accessEnd: NOW + 8 * DAY });
    expect(await ask(TOKEN_B, fake)).toEqual({ ok: false, transient: false, reason: "expired" });
  });

  it("keeps a subscription in its grace period (Google is retrying the payment and still gives access), whatever date it shows", async () => {
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_A]: purchase({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }, { expiryTime: new Date(NOW + 4 * DAY).toISOString() }),
        [TOKEN_B]: purchase({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }, { expiryTime: new Date(NOW - 2 * DAY).toISOString() }),
      },
    });
    expect(await ask(TOKEN_A, fake)).toMatchObject({ ok: true, accessEnd: NOW + 7 * DAY });
    // the access is the few days' grace from now, and the app asks again before it ends
    expect(await ask(TOKEN_B, fake)).toMatchObject({ ok: true, accessEnd: NOW + 3 * DAY });
  });

  it("refuses a subscription on hold, paused, pending or expired (a refunded or revoked one is reported as expired), or in a state it doesn't know", async () => {
    const states: Array<[string, string]> = [
      ["SUBSCRIPTION_STATE_ON_HOLD", "on_hold"],
      ["SUBSCRIPTION_STATE_PAUSED", "paused"],
      ["SUBSCRIPTION_STATE_PENDING", "pending"],
      ["SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED", "pending"],
      ["SUBSCRIPTION_STATE_EXPIRED", "expired"],
      ["SUBSCRIPTION_STATE_UNSPECIFIED", "not_active"],
      ["SOMETHING_NEW", "not_active"],
    ];
    for (const [state, reason] of states) {
      // a date still in the future changes nothing: the state is what counts
      const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase({ subscriptionState: state }) } });
      expect(await ask(TOKEN_A, fake), state).toEqual({ ok: false, transient: false, reason });
    }
    const missing = fakeGoogle({ tokens: { [TOKEN_A]: { lineItems: purchase().lineItems } } });
    expect(await ask(TOKEN_A, missing)).toEqual({ ok: false, transient: false, reason: "not_active" });
  });

  it("an active subscription whose paid period (and the few days' grace) ended long ago is expired; one that ended a day ago, with the renewal not in yet, still counts", async () => {
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_A]: purchase({}, { expiryTime: new Date(NOW - 4 * DAY).toISOString() }),
        [TOKEN_B]: purchase({}, { expiryTime: new Date(NOW - DAY).toISOString() }),
      },
    });
    expect(await ask(TOKEN_A, fake)).toEqual({ ok: false, transient: false, reason: "expired" });
    expect(await ask(TOKEN_B, fake)).toMatchObject({ ok: true, accessEnd: NOW + 2 * DAY });
  });

  it("refuses another app's purchase: Google doesn't know the token under our package, or its answer names another package", async () => {
    // the token belongs to another package: asked about under ours, Google says not found
    const theirs = fakeGoogle({ packageName: "com.example.other", tokens: { [TOKEN_A]: purchase() } });
    expect(await ask(TOKEN_A, theirs)).toEqual({ ok: false, transient: false, reason: "not_found" });
    // an answer that says it is about another package is not ours
    const named = fakeGoogle({ tokens: { [TOKEN_A]: purchase({ packageName: "com.example.other" }) } });
    expect(await ask(TOKEN_A, named)).toEqual({ ok: false, transient: false, reason: "wrong_package" });
    // the package asked about is the one configured
    const custom = fakeGoogle({ packageName: "com.example.configured", tokens: { [TOKEN_A]: purchase() } });
    expect(await ask(TOKEN_A, custom, { packageName: "com.example.configured" })).toMatchObject({ ok: true });
  });

  it("refuses another product: the app names one, or Google's line items hold none of ours", async () => {
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_A]: purchase({}, { productId: "com.example.other.premium" }),
        [TOKEN_B]: purchase({ lineItems: [] }),
      },
    });
    for (const productId of ["com.example.other.premium", `${SUB}x`, `${SUB}.pro`, "constructor", ""]) {
      expect(await ask(TOKEN_A, fake, {}, productId), productId).toEqual({ ok: false, transient: false, reason: "wrong_product" });
    }
    expect(fake.calls).toHaveLength(0); // never asked Google about them
    expect(await ask(TOKEN_A, fake)).toEqual({ ok: false, transient: false, reason: "wrong_product" });
    expect(await ask(TOKEN_B, fake)).toEqual({ ok: false, transient: false, reason: "no_line_item" });
  });

  it("refuses a base plan we don't sell, and takes the plan from the base plan alone", async () => {
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_A]: purchase({}, { offerDetails: { basePlanId: "weekly" } }),
        [TOKEN_B]: purchase({}, { offerDetails: {} }),
        "proto-token-0123456789": purchase({}, { offerDetails: { basePlanId: "__proto__" } }),
        "ctor-token-01234567890": purchase({}, { offerDetails: { basePlanId: "constructor" } }),
        "none-token-01234567890": purchase({ lineItems: [{ productId: SUB, expiryTime: new Date(NOW + DAY).toISOString() }] }),
      },
    });
    for (const token of [TOKEN_A, TOKEN_B, "proto-token-0123456789", "ctor-token-01234567890", "none-token-01234567890"]) {
      expect(await ask(token, fake), token).toEqual({ ok: false, transient: false, reason: "unknown_base_plan" });
    }
    expect([...GOOGLE_BASE_PLANS.entries()]).toEqual([["annual", "annual"], ["monthly", "monthly"]]);
  });

  it("takes the line item of ours that ends last, and ignores items that aren't ours", async () => {
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_A]: purchase({
          lineItems: [
            { productId: "com.example.addon", expiryTime: new Date(NOW + 999 * DAY).toISOString(), offerDetails: { basePlanId: "annual" } },
            { productId: SUB, expiryTime: new Date(NOW + 10 * DAY).toISOString(), offerDetails: { basePlanId: "monthly" } },
            { productId: SUB, expiryTime: new Date(NOW + 200 * DAY).toISOString(), offerDetails: { basePlanId: "annual" } },
          ],
        }),
      },
    });
    expect(await ask(TOKEN_A, fake)).toMatchObject({ ok: true, plan: "annual", accessEnd: NOW + 203 * DAY });
  });

  it("refuses an expiry that isn't a date", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase({}, { expiryTime: "soon" }), [TOKEN_B]: purchase({}, { expiryTime: undefined }) } });
    expect(await ask(TOKEN_A, fake)).toEqual({ ok: false, transient: false, reason: "bad_response" });
    expect(await ask(TOKEN_B, fake)).toEqual({ ok: false, transient: false, reason: "bad_response" });
  });

  it("Google saying the token is malformed (400), unknown (404) or gone (410) is a firm 'no'", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: { status: 400 }, [TOKEN_B]: { status: 410 }, "unknown-token-0123456789": { status: 404 } } });
    expect(await ask(TOKEN_A, fake)).toEqual({ ok: false, transient: false, reason: "bad_token" });
    expect(await ask(TOKEN_B, fake)).toEqual({ ok: false, transient: false, reason: "gone" });
    expect(await ask("unknown-token-0123456789", fake)).toEqual({ ok: false, transient: false, reason: "not_found" });
    expect(await ask("never-heard-of-it-0123456", fake)).toEqual({ ok: false, transient: false, reason: "not_found" });
  });

  it("Google down, slow, asking us to slow down, or answering nonsense is 'couldn't check', never 'not paid'", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: { status: 500 }, [TOKEN_B]: { status: 429 }, "bad-json-token-012345678": { status: 200, body: "<html>" }, "throws-token-0123456789": (() => 1) as unknown } });
    expect(await ask(TOKEN_A, fake)).toEqual({ ok: false, transient: true, reason: "google_down" });
    expect(await ask(TOKEN_B, fake)).toEqual({ ok: false, transient: true, reason: "google_down" });
    expect(await ask("bad-json-token-012345678", fake)).toEqual({ ok: false, transient: true, reason: "bad_reply" });
    expect(await ask("throws-token-0123456789", fake)).toEqual({ ok: false, transient: true, reason: "google_down" });
    // an answer that isn't an object
    const odd = fakeGoogle({ tokens: { [TOKEN_A]: [1, 2] } });
    expect(await ask(TOKEN_A, odd)).toEqual({ ok: false, transient: true, reason: "bad_reply" });
  });

  it("our service account not being allowed to read purchases (403) is 'couldn't check' too, said as such", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: { status: 403 } } });
    expect(await ask(TOKEN_A, fake)).toEqual({ ok: false, transient: true, reason: "forbidden" });
  });

  it("an access token Google turns down (401) is swapped for a new one once; twice is 'couldn't check'", async () => {
    const once = fakeGoogle({ tokens: { [TOKEN_A]: purchase() }, reject401: 1 });
    expect((await ask(TOKEN_A, once)).ok).toBe(true);
    expect(once.issued).toHaveLength(2);
    const twice = fakeGoogle({ tokens: { [TOKEN_A]: purchase() }, reject401: 2 });
    expect(await ask(TOKEN_A, twice)).toEqual({ ok: false, transient: true, reason: "auth_failed" });
  });

  it("no access token (the token endpoint refuses or is down) is 'couldn't check', and nothing is asked about the purchase", async () => {
    for (const tokenEndpoint of ["refused", "down", "no_token"] as const) {
      const fake = fakeGoogle({ tokenEndpoint, tokens: { [TOKEN_A]: purchase() } });
      expect(await ask(TOKEN_A, fake)).toEqual({ ok: false, transient: true, reason: "auth_failed" });
      expect(fake.calls.filter((c) => c.url !== GOOGLE_TOKEN_URL)).toHaveLength(0);
    }
  });
});

describe("handleGoogleEntitlement", () => {
  const keys = generateKeyPair();
  const body = (...tokens: string[]) => ({ purchases: tokens.map((token) => ({ productId: SUB, token })) });

  async function deps(fake: ReturnType<typeof fakeGoogle>, over: Partial<GoogleEntitlementDeps> = {}): Promise<GoogleEntitlementDeps> {
    const { privateJwk } = await keys;
    const options = optionsFor(fake);
    return { sign: (claims) => signClaims(claims, privateJwk), nowMs: NOW, allow: () => true, verify: (p, at) => verifyGooglePurchase(p, { ...options, nowMs: at }), ...over };
  }

  it("answers 503 when the server has no signing key or no service account, before asking anyone anything", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase() } });
    expect(await handleGoogleEntitlement(body(TOKEN_A), await deps(fake, { sign: null }))).toEqual({ status: 503, body: { error: "unavailable" } });
    expect(await handleGoogleEntitlement(body(TOKEN_A), await deps(fake, { verify: null }))).toEqual({ status: 503, body: { error: "unavailable" } });
    expect(fake.calls).toHaveLength(0);
  });

  it("answers 429 when the caller has asked too often, without asking Google", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase() } });
    expect(await handleGoogleEntitlement(body(TOKEN_A), await deps(fake, { allow: () => false }))).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(fake.calls).toHaveLength(0);
  });

  it("answers 400 to a body that isn't exactly { purchases: [1 to 10 { productId, token }] }", async () => {
    const fake = fakeGoogle({});
    const d = await deps(fake);
    const one = { productId: SUB, token: TOKEN_A };
    for (const bad of [
      null,
      "x",
      [],
      {},
      { purchases: [] },
      { purchases: one },
      { purchases: [one], extra: 1 },
      { purchases: [{ ...one, extra: 1 }] },
      { purchases: Array(11).fill(one) },
      { purchases: [{ productId: SUB }] },
      { purchases: [{ token: TOKEN_A }] },
      { purchases: [{ productId: "UPPER.case", token: TOKEN_A }] },
      { purchases: [{ productId: "x", token: TOKEN_A }] },
      { purchases: [{ productId: SUB, token: "short" }] },
      { purchases: [{ productId: SUB, token: "has space in it 12345" }] },
      { purchases: [{ productId: SUB, token: `${TOKEN_A}\n` }] },
      { purchases: [{ productId: SUB, token: "a".repeat(4001) }] },
      { purchases: [{ productId: SUB, token: 42 }] },
      { purchases: ["token"] },
      { transactions: [TOKEN_A] },
    ]) {
      expect(await handleGoogleEntitlement(bad, d), JSON.stringify(bad).slice(0, 60)).toEqual({ status: 400, body: { error: "invalid_request" } });
    }
    expect(fake.calls).toHaveLength(0);
    // the longest token the contract allows is fine
    const long = "a".repeat(4000);
    expect((await handleGoogleEntitlement(body(long), d)).status).toBe(402);
  });

  it("answers 200 with a token for each plan: src google, the plan from the base plan, access to the paid period's end plus three days, and nothing personal in it", async () => {
    const annualEnd = NOW + 300 * DAY;
    const monthlyEnd = NOW + 20 * DAY;
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_A]: purchase({}, { expiryTime: new Date(annualEnd).toISOString(), offerDetails: { basePlanId: "annual" } }),
        [TOKEN_B]: purchase({}, { expiryTime: new Date(monthlyEnd).toISOString(), offerDetails: { basePlanId: "monthly" } }),
      },
    });
    const { publicJwk } = await keys;
    for (const [token, plan, end] of [[TOKEN_A, "annual", annualEnd], [TOKEN_B, "monthly", monthlyEnd]] as const) {
      const r = await handleGoogleEntitlement(body(token), await deps(fake));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ plan, expiresAt: end + 3 * DAY });
      expect(Object.keys(r.body).sort()).toEqual(["expiresAt", "plan", "token"]);
      const claims = await verifyToken(r.body.token as string, publicJwk, NOW);
      expect(claims).toEqual({ v: 1, plan, src: "google", iat: Math.floor(NOW / 1000), exp: Math.floor((end + 3 * DAY) / 1000) });
      const payload = JSON.parse(Buffer.from((r.body.token as string).split(".")[1]!, "base64url").toString("utf8"));
      expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "plan", "src", "v"]);
    }
    // signed with the server's key only
    const other = await generateKeyPair();
    const r = await handleGoogleEntitlement(body(TOKEN_A), await deps(fake));
    expect(await verifyToken(r.body.token as string, other.publicJwk, NOW)).toBeNull();
  });

  it("with several purchases takes the one whose access ends last, and a refused one doesn't spoil the others", async () => {
    const fake = fakeGoogle({
      tokens: {
        [TOKEN_B]: purchase({}, { expiryTime: new Date(NOW + 20 * DAY).toISOString(), offerDetails: { basePlanId: "monthly" } }),
        [TOKEN_A]: purchase({}, { expiryTime: new Date(NOW + 300 * DAY).toISOString(), offerDetails: { basePlanId: "annual" } }),
        "expired-token-012345678": purchase({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }, { expiryTime: new Date(NOW + 900 * DAY).toISOString(), offerDetails: { basePlanId: "annual" } }),
        "hold-token-01234567890": purchase({ subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD" }),
      },
    });
    const r = await handleGoogleEntitlement(body(TOKEN_B, "expired-token-012345678", TOKEN_A, "hold-token-01234567890", "unknown-token-012345678"), await deps(fake));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ plan: "annual", expiresAt: NOW + 303 * DAY });
  });

  it("asks Google once for a token that is sent twice", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase() } });
    expect((await handleGoogleEntitlement(body(TOKEN_A, TOKEN_A, TOKEN_A), await deps(fake))).status).toBe(200);
    expect(fake.calls.filter((c) => c.url.includes("/tokens/"))).toHaveLength(1);
  });

  it("answers 402 when nothing gives current access", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }), [TOKEN_B]: { status: 410 } } });
    expect(await handleGoogleEntitlement(body(TOKEN_A, TOKEN_B, "unknown-token-012345678"), await deps(fake))).toEqual({ status: 402, body: { error: "not_paid" } });
    // the app names a product that isn't ours
    expect(await handleGoogleEntitlement({ purchases: [{ productId: "com.example.other", token: TOKEN_A }] }, await deps(fake))).toEqual({ status: 402, body: { error: "not_paid" } });
  });

  it("answers 503 (never 'not paid') when Google couldn't be asked and nothing else gave access, and 200 when something else did", async () => {
    const down = fakeGoogle({ tokens: { [TOKEN_A]: { status: 500 }, [TOKEN_B]: { status: 410 } } });
    expect(await handleGoogleEntitlement(body(TOKEN_A), await deps(down))).toEqual({ status: 503, body: { error: "unavailable" } });
    expect(await handleGoogleEntitlement(body(TOKEN_B, TOKEN_A), await deps(down))).toEqual({ status: 503, body: { error: "unavailable" } });
    const mixed = fakeGoogle({ tokens: { [TOKEN_A]: { status: 500 }, [TOKEN_B]: purchase() } });
    expect((await handleGoogleEntitlement(body(TOKEN_A, TOKEN_B), await deps(mixed))).status).toBe(200);
    // no service account access at all
    const noAuth = fakeGoogle({ tokenEndpoint: "refused" });
    expect((await handleGoogleEntitlement(body(TOKEN_A), await deps(noAuth))).status).toBe(503);
    // a verifier that throws is the same as Google being down
    const throwing = await deps(fakeGoogle({}), { verify: async () => { throw new Error(`secret ${privatePem}`); } });
    expect(await handleGoogleEntitlement(body(TOKEN_A), throwing)).toEqual({ status: 503, body: { error: "unavailable" } });
  });

  it("tells the server's log reason codes only: no purchase token, no key, no access token", async () => {
    const notes: string[] = [];
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase({ subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD" }), [TOKEN_B]: { status: 403 } } });
    const d = await deps(fake, { note: (m) => notes.push(m) });
    expect((await handleGoogleEntitlement(body(TOKEN_A), d)).status).toBe(402);
    expect((await handleGoogleEntitlement(body(TOKEN_B), d)).status).toBe(503);
    expect(notes).toEqual(["google entitlement: none of 1 gave access (on_hold)", "google entitlement: could not check 1 of 1 (forbidden)"]);
    const good = fakeGoogle({ tokens: { [TOKEN_A]: purchase() } });
    notes.length = 0;
    expect((await handleGoogleEntitlement(body(TOKEN_A), await deps(good, { note: (m) => notes.push(m) }))).status).toBe(200);
    expect(notes).toEqual([]);
  });

  it("never puts a purchase token, an access token or the service account's key in an answer, a note or a log line", async () => {
    const logged: string[] = [];
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" "))));
    try {
      for (const tokens of [{ [TOKEN_A]: purchase() }, { [TOKEN_A]: { status: 500 } }, { [TOKEN_A]: { status: 403 } }, {}]) {
        const fake = fakeGoogle({ tokens });
        const notes: string[] = [];
        const d = await deps(fake, { note: (m) => notes.push(m) });
        const r = await handleGoogleEntitlement(body(TOKEN_A), d);
        const everything = JSON.stringify([r, notes, logged]);
        const issued = fake.issued;
        for (const secret of [TOKEN_A, ...issued, privatePem, privatePem.split("\n")[1]!, "BEGIN PRIVATE KEY"]) expect(everything).not.toContain(secret);
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe("the route's settings (lib/payments/googleRoute.ts)", () => {
  const request = () => new Request("https://numbite.com/api/v1/entitlement/google", { method: "POST", headers: { "x-forwarded-for": "203.0.113.7" } });

  it("has no service account (so answers 503) until GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is a service account's key", () => {
    const fake = fakeGoogle({});
    const ctx = (env: Record<string, string | undefined>) => googleContext(request(), NOW, fake.fetch, env);
    expect(ctx({}).verify).toBeNull();
    expect(ctx({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "" }).verify).toBeNull();
    expect(ctx({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "not json" }).verify).toBeNull();
    expect(ctx({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: "service_account", client_email: EMAIL }) }).verify).toBeNull();
    expect(ctx({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: accountJson }).verify).not.toBeNull();
    // a package name that isn't one counts as not set up; unset is our own
    expect(ctx({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: accountJson, GOOGLE_PLAY_PACKAGE_NAME: "nonsense" }).verify).toBeNull();
    expect(ctx({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: accountJson, GOOGLE_PLAY_PACKAGE_NAME: "com.example.configured" }).verify).not.toBeNull();
  });

  it("has no signing key (so answers 503) until ENTITLEMENT_PRIVATE_JWK is a JSON key", async () => {
    const fake = fakeGoogle({});
    expect(googleContext(request(), NOW, fake.fetch, {}).sign).toBeNull();
    expect(googleContext(request(), NOW, fake.fetch, { ENTITLEMENT_PRIVATE_JWK: "not json" }).sign).toBeNull();
    for (const notAKey of ["null", "42", "[1]", '"text"']) expect(googleContext(request(), NOW, fake.fetch, { ENTITLEMENT_PRIVATE_JWK: notAKey }).sign).toBeNull();
    const { privateJwk, publicJwk } = await generateKeyPair();
    const sign = googleContext(request(), NOW, fake.fetch, { ENTITLEMENT_PRIVATE_JWK: JSON.stringify(privateJwk) }).sign;
    expect(sign).not.toBeNull();
    const token = await sign!({ v: 1, plan: "monthly", src: "google", iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 60 });
    expect(await verifyToken(token, publicJwk, NOW)).toMatchObject({ plan: "monthly", src: "google" });
  });

  it("checks purchases against the real account, end to end, through the context", async () => {
    const fake = fakeGoogle({ tokens: { [TOKEN_A]: purchase() } });
    const { privateJwk } = await generateKeyPair();
    const d = googleContext(request(), NOW, fake.fetch, { ENTITLEMENT_PRIVATE_JWK: JSON.stringify(privateJwk), GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: accountJson });
    const r = await handleGoogleEntitlement({ purchases: [{ productId: SUB, token: TOKEN_A }] }, d);
    expect(r.status).toBe(200);
    // a second request (a new context) reuses the access token Google gave the first
    const again = googleContext(request(), NOW + 1000, fake.fetch, { ENTITLEMENT_PRIVATE_JWK: JSON.stringify(privateJwk), GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: accountJson });
    expect((await handleGoogleEntitlement({ purchases: [{ productId: SUB, token: TOKEN_A }] }, again)).status).toBe(200);
    expect(fake.issued).toHaveLength(1);
  });

  it("rate-limits a caller: 30 requests in ten minutes, then 429", () => {
    const fake = fakeGoogle({});
    const req = new Request("https://numbite.com/api/v1/entitlement/google", { method: "POST", headers: { "x-forwarded-for": "198.51.100.99" } });
    const ctx = googleContext(req, NOW, fake.fetch, {});
    const results = Array.from({ length: 31 }, () => ctx.allow());
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
    // another caller is counted on its own
    const other = new Request("https://numbite.com/api/v1/entitlement/google", { method: "POST", headers: { "x-forwarded-for": "198.51.100.100" } });
    expect(googleContext(other, NOW, fake.fetch, {}).allow()).toBe(true);
  });
});

describe("the body, the way the route reads it", () => {
  const run = (text: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
    withJsonBody(new Request("https://numbite.com/api/v1/entitlement/google", { method: "POST", headers, body: text }), async (body) => ({ status: 200, body: { echo: JSON.stringify(body).length } }), GOOGLE_MAX_BODY_BYTES);

  it("takes ten of the longest purchases the contract allows, and refuses a body past the limit, one that isn't JSON, or one that isn't sent as JSON", async () => {
    const longest = JSON.stringify({ purchases: Array.from({ length: 10 }, (_, i) => ({ productId: SUB, token: `${i}`.padEnd(4000, "a") })) });
    expect(Buffer.byteLength(longest)).toBeLessThan(GOOGLE_MAX_BODY_BYTES);
    expect((await run(longest)).status).toBe(200);
    expect((await run(`{"padding":"${"x".repeat(GOOGLE_MAX_BODY_BYTES)}"}`)).status).toBe(413);
    expect((await run("{ not json")).status).toBe(400);
    expect((await run(longest, { "content-type": "text/plain" })).status).toBe(415);
    expect((await run(longest, {})).status).toBe(415);
  });
});

describe("who may ask (CORS)", () => {
  const ask = (origin?: string, method = "POST") => new Request("https://numbite.com/api/v1/entitlement/google", { method, headers: origin ? { Origin: origin } : {} });

  it("answers the Android app's origin, the iPhone app's and our own pages, and nobody else", () => {
    expect(fromUs(ask("https://appassets.androidplatform.net"))).toBe(true);
    expect(fromUs(ask("app://menumath"))).toBe(true);
    expect(fromUs(ask("https://numbite.com"))).toBe(true);
    for (const other of ["https://evil.example", "https://appassets.androidplatform.net.evil.example", "http://appassets.androidplatform.net", "https://appassets.androidplatform.net:8443", "null", "https://androidplatform.net"]) expect(fromUs(ask(other)), other).toBe(false);
    expect(fromUs(ask())).toBe(false);
    const res = withCors(ask("https://appassets.androidplatform.net"), Response.json({}), GOOGLE_CORS);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://appassets.androidplatform.net");
    expect(preflight(ask("https://appassets.androidplatform.net", "OPTIONS"), GOOGLE_CORS).headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(preflight(ask("https://evil.example", "OPTIONS"), GOOGLE_CORS).headers.get("access-control-allow-origin")).toBeNull();
  });
});
