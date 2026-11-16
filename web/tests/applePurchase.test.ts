import { describe, expect, it, vi, afterEach } from "vitest";
import { createHash, createPrivateKey, generateKeyPairSync, sign, X509Certificate, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APPLE_ROOT_CA_G3, parseCertificate, verifyAppleTransaction, type AppleVerifyOptions } from "../lib/payments/apple";
import { XCODE_ACCESS_MS, handleAppleEntitlement, type AppleEntitlementDeps } from "../lib/payments/appleHandler";
import { appleContext, xcodeRootFromEnv } from "../lib/payments/appleRoute";
import { generateKeyPair, signClaims, verifyToken } from "../lib/payments/token";

// Apple In-App Purchase on the server (lib/payments/apple.ts): a StoreKit 2 signed transaction in, a Numbite access token out. Apple's real certificates can't sign
// test data, so a throwaway test chain stands in (tests/fixtures/apple, made by make.sh) and is passed in as the trusted root; the real Apple Root CA - G3 is
// checked by its fingerprint.

vi.mock("server-only", () => ({}));

const DIR = join(__dirname, "fixtures", "apple");
const pem = (name: string) => readFileSync(join(DIR, name), "utf8");
const cert = (name: string) => new X509Certificate(pem(name));
const der = (name: string) => cert(name).raw;
const LEAF_KEY = createPrivateKey(pem("leaf.key"));
const XCODE_KEY = createPrivateKey(pem("xcode.key"));

const DAY = 24 * 60 * 60 * 1000;
// A month after the test certificates were made, so they are valid whenever make.sh last ran.
const NOW = new Date(cert("leaf.pem").validFrom).getTime() + 30 * DAY;

const BUNDLE = "com.amanmarwaha.MenuMacros";
const ANNUAL = "com.amanmarwaha.numbite.pro.annual";
const MONTHLY = "com.amanmarwaha.numbite.pro.monthly";
const PASS90 = "com.amanmarwaha.numbite.pro.pass90";
const APPLE_CHAIN = ["leaf.pem", "int.pem", "root.pem"];

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: "2000000123456789",
    originalTransactionId: "2000000123456000",
    bundleId: BUNDLE,
    productId: ANNUAL,
    purchaseDate: NOW - 10 * DAY,
    originalPurchaseDate: NOW - 10 * DAY,
    expiresDate: NOW + 355 * DAY,
    type: "Auto-Renewable Subscription",
    inAppOwnershipType: "PURCHASED",
    signedDate: NOW - DAY,
    environment: "Production",
    ...over,
  };
}

const b64url = (x: Buffer | string) => Buffer.from(x).toString("base64url");

function jws(body: unknown, opts: { chain?: string[]; key?: KeyObject; header?: Record<string, unknown> } = {}): string {
  const header = { alg: "ES256", x5c: (opts.chain ?? APPLE_CHAIN).map((n) => der(n).toString("base64")), ...opts.header };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = sign("sha256", Buffer.from(`${h}.${p}`), { key: opts.key ?? LEAF_KEY, dsaEncoding: "ieee-p1363" });
  return `${h}.${p}.${b64url(sig)}`;
}

const OPTS: AppleVerifyOptions = { nowMs: NOW, appleRoots: [der("root.pem")] };
const reason = (token: string, opts: AppleVerifyOptions = OPTS) => {
  const r = verifyAppleTransaction(token, opts);
  return r.ok ? "ok" : r.reason;
};

describe("Apple Root CA - G3, the root every App Store transaction leads to", () => {
  it("is the certificate whose SHA-256 fingerprint Apple publishes", () => {
    expect(createHash("sha256").update(APPLE_ROOT_CA_G3).digest("hex")).toBe("63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
    expect(new X509Certificate(APPLE_ROOT_CA_G3).subject).toContain("CN=Apple Root CA - G3");
  });

  it("is the only root trusted by default, so the test chain is refused without the test root", () => {
    expect(reason(jws(payload()), { nowMs: NOW })).toBe("untrusted_root");
  });
});

describe("verifyAppleTransaction: purchases that give access", () => {
  it("a yearly subscription: access to its expiry plus three days", () => {
    const expires = NOW + 200 * DAY;
    const r = verifyAppleTransaction(jws(payload({ expiresDate: expires })), OPTS);
    expect(r).toEqual({ ok: true, plan: "annual", accessEnd: expires + 3 * DAY, environment: "Production", originalTransactionId: "2000000123456000" });
  });

  it("a monthly subscription", () => {
    const expires = NOW + 20 * DAY;
    const r = verifyAppleTransaction(jws(payload({ productId: MONTHLY, expiresDate: expires })), OPTS);
    expect(r).toMatchObject({ ok: true, plan: "monthly", accessEnd: expires + 3 * DAY });
  });

  it("the 90-day pass (no expiresDate: it does not renew): 90 days from the purchase", () => {
    const bought = NOW - 5 * DAY;
    const r = verifyAppleTransaction(jws(payload({ productId: PASS90, expiresDate: undefined, purchaseDate: bought, type: "Non-Renewing Subscription" })), OPTS);
    expect(r).toMatchObject({ ok: true, plan: "pass90", accessEnd: bought + 90 * DAY });
  });

  it("a Sandbox purchase (App Review and TestFlight buy there)", () => {
    expect(verifyAppleTransaction(jws(payload({ environment: "Sandbox" })), OPTS)).toMatchObject({ ok: true, environment: "Sandbox" });
  });

  it("a subscription that ran out two days ago is still inside the grace", () => {
    expect(reason(jws(payload({ expiresDate: NOW - 2 * DAY })))).toBe("ok");
  });

  it("a pass bought 89 days ago", () => {
    expect(reason(jws(payload({ productId: PASS90, expiresDate: undefined, purchaseDate: NOW - 89 * DAY })))).toBe("ok");
  });
});

describe("verifyAppleTransaction: what the payload must say", () => {
  it("refuses another app's purchase", () => {
    expect(reason(jws(payload({ bundleId: "com.example.Other" })))).toBe("wrong_bundle");
    expect(reason(jws(payload({ bundleId: undefined })))).toBe("wrong_bundle");
  });

  it("refuses a product that isn't one of our three", () => {
    expect(reason(jws(payload({ productId: "com.amanmarwaha.numbite.pro.lifetime" })))).toBe("unknown_product");
    expect(reason(jws(payload({ productId: "constructor" })))).toBe("unknown_product");
    expect(reason(jws(payload({ productId: "__proto__" })))).toBe("unknown_product");
    expect(reason(jws(payload({ productId: 7 })))).toBe("unknown_product");
  });

  it("refuses a subscription that ran out more than three days ago", () => {
    expect(reason(jws(payload({ expiresDate: NOW - 4 * DAY })))).toBe("expired");
  });

  it("refuses a pass bought more than 90 days ago", () => {
    expect(reason(jws(payload({ productId: PASS90, expiresDate: undefined, purchaseDate: NOW - 91 * DAY })))).toBe("expired");
  });

  it("refuses a refunded (revoked) purchase", () => {
    expect(reason(jws(payload({ revocationDate: NOW - DAY, revocationReason: 0 })))).toBe("revoked");
  });

  it("refuses a subscription the person has since upgraded from", () => {
    expect(reason(jws(payload({ isUpgraded: true })))).toBe("upgraded");
    expect(reason(jws(payload({ isUpgraded: false })))).toBe("ok");
  });

  it("refuses dates that aren't finite numbers, and a subscription with no expiry", () => {
    expect(reason(jws(payload({ purchaseDate: "1800000000000" })))).toBe("bad_payload");
    expect(reason(jws(payload({ purchaseDate: undefined })))).toBe("bad_payload");
    expect(reason(jws(payload({ expiresDate: undefined })))).toBe("bad_payload");
    expect(reason(jws(payload({ expiresDate: null })))).toBe("bad_payload");
    expect(reason(jws(payload({ productId: PASS90, expiresDate: "soon" })))).toBe("bad_payload");
    expect(reason(jws(payload({ signedDate: "yesterday" })))).toBe("bad_payload");
    expect(reason(jws(payload({ originalTransactionId: undefined })))).toBe("bad_payload");
    expect(reason(jws(payload({ originalTransactionId: 12345 })))).toBe("bad_payload");
  });

  it("refuses an environment that isn't Production, Sandbox or Xcode", () => {
    expect(reason(jws(payload({ environment: "LocalTesting" })))).toBe("bad_environment");
    expect(reason(jws(payload({ environment: undefined })))).toBe("bad_environment");
  });
});

describe("verifyAppleTransaction: the signature and the certificate chain", () => {
  it("refuses a payload changed after Apple signed it", () => {
    const good = jws(payload({ productId: MONTHLY }));
    const [h, , s] = good.split(".");
    const forged = b64url(JSON.stringify(payload({ productId: ANNUAL })));
    expect(reason(`${h}.${forged}.${s}`)).toBe("bad_signature");
    // one character of the payload changed
    const [hh, pp, ss] = good.split(".");
    const flipped = pp.slice(0, 10) + (pp[10] === "A" ? "B" : "A") + pp.slice(11);
    expect(reason(`${hh}.${flipped}.${ss}`)).not.toBe("ok");
  });

  it("refuses a transaction signed by a key that isn't the leaf certificate's", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(reason(jws(payload(), { key: privateKey }))).toBe("bad_signature");
  });

  it("refuses a signature of the wrong length", () => {
    const [h, p] = jws(payload()).split(".");
    expect(reason(`${h}.${p}.${b64url(Buffer.alloc(70, 1))}`)).toBe("bad_signature");
  });

  it("refuses a chain that ends at another root", () => {
    expect(reason(jws(payload(), { chain: ["leaf.pem", "int.pem", "other-root.pem"] }))).toBe("untrusted_root");
    expect(reason(jws(payload()), { nowMs: NOW, appleRoots: [der("other-root.pem")] })).toBe("untrusted_root");
    expect(reason(jws(payload()), { nowMs: NOW, appleRoots: [] })).toBe("untrusted_root");
  });

  it("refuses a leaf or intermediate without Apple's marker", () => {
    expect(reason(jws(payload(), { chain: ["leaf-no-oid.pem", "int.pem", "root.pem"] }))).toBe("missing_oid");
    expect(reason(jws(payload(), { chain: ["leaf.pem", "int-no-oid.pem", "root.pem"] }))).toBe("missing_oid");
  });

  it("refuses an intermediate that didn't sign the leaf, even with the same name and marker", () => {
    expect(reason(jws(payload(), { chain: ["leaf.pem", "int-imposter.pem", "root.pem"] }))).toBe("bad_chain");
  });

  it("refuses an intermediate that signed the leaf but isn't a certificate authority", () => {
    expect(reason(jws(payload(), { chain: ["leaf.pem", "int-not-ca.pem", "root.pem"] }))).toBe("bad_chain");
  });

  it("refuses a chain whose certificates are in the wrong order", () => {
    expect(reason(jws(payload(), { chain: ["int.pem", "leaf.pem", "root.pem"] }))).not.toBe("ok");
  });

  it("needs exactly three certificates for an App Store transaction", () => {
    expect(reason(jws(payload(), { chain: ["leaf.pem", "root.pem"] }))).toBe("bad_chain_length");
    expect(reason(jws(payload(), { chain: ["leaf.pem", "int.pem", "int.pem", "root.pem"] }))).toBe("bad_chain_length");
  });

  it("refuses certificates that weren't valid when the transaction was signed", () => {
    expect(reason(jws(payload({ signedDate: Date.UTC(2000, 0, 1) })))).toBe("cert_not_valid");
  });

  it("refuses any algorithm but ES256", () => {
    expect(reason(jws(payload(), { header: { alg: "ES384" } }))).toBe("bad_alg");
    expect(reason(jws(payload(), { header: { alg: "none" } }))).toBe("bad_alg");
    expect(reason(jws(payload(), { header: { alg: "HS256" } }))).toBe("bad_alg");
    expect(reason(jws(payload(), { header: { alg: undefined } }))).toBe("bad_alg");
  });

  it("refuses a missing or broken x5c", () => {
    expect(reason(jws(payload(), { header: { x5c: undefined } }))).toBe("bad_x5c");
    expect(reason(jws(payload(), { header: { x5c: [] } }))).toBe("bad_x5c");
    expect(reason(jws(payload(), { header: { x5c: "not-a-list" } }))).toBe("bad_x5c");
    expect(reason(jws(payload(), { header: { x5c: Array(5).fill(der("leaf.pem").toString("base64")) } }))).toBe("bad_x5c");
    expect(reason(jws(payload(), { header: { x5c: ["not base64!", der("int.pem").toString("base64"), der("root.pem").toString("base64")] } }))).toBe("bad_x5c");
    expect(reason(jws(payload(), { header: { x5c: [Buffer.from("hello, not a certificate").toString("base64"), "AAAA", "AAAA"] } }))).toBe("bad_x5c");
    // base64url is not the standard base64 x5c uses
    expect(reason(jws(payload(), { header: { x5c: APPLE_CHAIN.map((n) => der(n).toString("base64url")) } }))).toBe("bad_x5c");
  });

  it("refuses anything that isn't a compact JWS", () => {
    const [h, p, s] = jws(payload()).split(".");
    for (const bad of ["", "abc", `${h}.${p}`, `${h}.${p}.${s}.${s}`, `${h}.${p}.${s}=`, `${h}.${p}.`, `${h}.${p} .${s}`]) expect(reason(bad)).toBe("malformed");
    expect(reason(`${b64url("not json")}.${p}.${s}`)).toBe("malformed");
    expect(reason(`${h}.${b64url("[1,2]")}.${s}`)).toBe("malformed");
    expect(reason(`${h}.${b64url("null")}.${s}`)).toBe("malformed");
    expect(verifyAppleTransaction(42 as unknown as string, OPTS)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("verifyAppleTransaction: Xcode's own test purchases", () => {
  const xcodeBody = () => payload({ environment: "Xcode" });
  const xcodeJws = () => jws(xcodeBody(), { chain: ["xcode.pem"], key: XCODE_KEY });

  it("refuses them when no Xcode certificate is given", () => {
    expect(reason(xcodeJws())).toBe("xcode_not_allowed");
  });

  it("accepts them when signed with exactly the Xcode certificate given", () => {
    expect(verifyAppleTransaction(xcodeJws(), { ...OPTS, xcodeRoot: der("xcode.pem") })).toMatchObject({ ok: true, plan: "annual", environment: "Xcode" });
  });

  it("refuses an Xcode purchase whose chain ends anywhere else", () => {
    expect(reason(xcodeJws(), { ...OPTS, xcodeRoot: der("other-root.pem") })).toBe("untrusted_root");
    expect(reason(jws(xcodeBody()), { ...OPTS, xcodeRoot: der("xcode.pem") })).toBe("untrusted_root");
  });

  it("never lets the Xcode certificate vouch for an App Store purchase", () => {
    const sandbox = jws(payload({ environment: "Sandbox" }), { chain: ["xcode.pem"], key: XCODE_KEY });
    expect(reason(sandbox, { ...OPTS, xcodeRoot: der("xcode.pem"), appleRoots: [der("root.pem")] })).not.toBe("ok");
    expect(reason(sandbox, { nowMs: NOW, xcodeRoot: der("xcode.pem"), appleRoots: [der("xcode.pem")] })).not.toBe("ok");
  });

  it("still checks the Xcode purchase's signature and payload", () => {
    const opts = { ...OPTS, xcodeRoot: der("xcode.pem") };
    expect(reason(jws(xcodeBody(), { chain: ["xcode.pem"], key: LEAF_KEY }), opts)).toBe("bad_signature");
    expect(reason(jws(payload({ environment: "Xcode", bundleId: "x" }), { chain: ["xcode.pem"], key: XCODE_KEY }), opts)).toBe("wrong_bundle");
  });
});

describe("parseCertificate (the Xcode certificate from the server's settings)", () => {
  it("reads PEM or plain base64 DER, and nothing else", () => {
    expect(parseCertificate(pem("xcode.pem"))?.equals(der("xcode.pem"))).toBe(true);
    expect(parseCertificate(der("xcode.pem").toString("base64"))?.equals(der("xcode.pem"))).toBe(true);
    expect(parseCertificate(`  ${der("xcode.pem").toString("base64").replace(/(.{64})/g, "$1\n")}\n`)?.equals(der("xcode.pem"))).toBe(true);
    expect(parseCertificate("")).toBeNull();
    expect(parseCertificate("hello")).toBeNull();
    expect(parseCertificate(Buffer.from("not a certificate").toString("base64"))).toBeNull();
  });
});

describe("handleAppleEntitlement: POST /api/v1/entitlement/apple", () => {
  const keys = generateKeyPair();
  async function deps(over: Partial<AppleEntitlementDeps> = {}): Promise<AppleEntitlementDeps> {
    const { privateJwk } = await keys;
    return { sign: (claims) => signClaims(claims, privateJwk), nowMs: NOW, allow: () => true, verifyOptions: { appleRoots: [der("root.pem")] }, ...over };
  }

  it("answers 503 when the server has no signing key", async () => {
    expect(await handleAppleEntitlement({ transactions: [jws(payload())] }, await deps({ sign: null }))).toEqual({ status: 503, body: { error: "unavailable" } });
  });

  it("answers 429 when the caller has asked too often", async () => {
    expect(await handleAppleEntitlement({ transactions: [jws(payload())] }, await deps({ allow: () => false }))).toEqual({ status: 429, body: { error: "rate_limited" } });
  });

  it("answers 400 to a body that isn't exactly { transactions: [1 to 10 JWS strings] }", async () => {
    const d = await deps();
    const one = jws(payload());
    for (const body of [
      null,
      "x",
      [],
      {},
      { transactions: [] },
      { transactions: one },
      { transactions: [one], extra: 1 },
      { transactions: Array(11).fill(one) },
      { transactions: ["short.jws.x"] },
      { transactions: [`${one} `] },
      { transactions: [`${one}\n`] },
      { transactions: ["a".repeat(20_001)] },
      { transactions: [42] },
    ]) {
      expect(await handleAppleEntitlement(body, d)).toEqual({ status: 400, body: { error: "invalid_request" } });
    }
  });

  it("answers 402 when no transaction gives current access", async () => {
    const r = await handleAppleEntitlement({ transactions: [jws(payload({ expiresDate: NOW - 10 * DAY })), jws(payload({ bundleId: "x" })), "a".repeat(30)] }, await deps());
    expect(r).toEqual({ status: 402, body: { error: "not_paid" } });
  });

  it("answers 200 with a token for the purchase whose access ends last", async () => {
    const annualEnd = NOW + 300 * DAY;
    const r = await handleAppleEntitlement(
      {
        transactions: [
          jws(payload({ productId: MONTHLY, expiresDate: NOW + 20 * DAY })),
          jws(payload({ productId: ANNUAL, expiresDate: annualEnd })),
          jws(payload({ productId: PASS90, expiresDate: undefined, purchaseDate: NOW - DAY })),
          jws(payload({ productId: ANNUAL, expiresDate: NOW + 999 * DAY, revocationDate: NOW - DAY })),
        ],
      },
      await deps(),
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ plan: "annual", expiresAt: annualEnd + 3 * DAY });
    const claims = await verifyToken(r.body.token as string, (await keys).publicJwk, NOW);
    expect(claims).toEqual({ v: 1, plan: "annual", src: "apple", iat: Math.floor(NOW / 1000), exp: Math.floor((annualEnd + 3 * DAY) / 1000) });
    // signed with the server's key only
    const other = await generateKeyPair();
    expect(await verifyToken(r.body.token as string, other.publicJwk, NOW)).toBeNull();
  });

  it("passes the Xcode certificate through", async () => {
    const t = jws(payload({ environment: "Xcode" }), { chain: ["xcode.pem"], key: XCODE_KEY });
    expect((await handleAppleEntitlement({ transactions: [t] }, await deps())).status).toBe(402);
    const r = await handleAppleEntitlement({ transactions: [t] }, await deps({ verifyOptions: { appleRoots: [der("root.pem")], xcodeRoot: der("xcode.pem") } }));
    expect(r.status).toBe(200);
    // a test purchase lasts 48 hours at most, whatever it was for (an annual here)
    expect(r.body.expiresAt).toBe(NOW + XCODE_ACCESS_MS);
  });

  it("puts nothing personal in the token (only plan, dates and where it came from)", async () => {
    const r = await handleAppleEntitlement({ transactions: [jws(payload())] }, await deps());
    const body = JSON.parse(Buffer.from((r.body.token as string).split(".")[1], "base64url").toString("utf8"));
    expect(Object.keys(body).sort()).toEqual(["exp", "iat", "plan", "src", "v"]);
  });
});

describe("the route's settings (lib/payments/appleRoute.ts)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the Xcode certificate only while one is set for a test (live server included)", () => {
    const xcode = pem("xcode.pem");
    expect(xcodeRootFromEnv({ APPLE_XCODE_TEST_CERT: xcode })?.equals(der("xcode.pem"))).toBe(true);
    expect(xcodeRootFromEnv({ APPLE_XCODE_TEST_CERT: xcode, VERCEL_ENV: "preview" })?.equals(der("xcode.pem"))).toBe(true);
    expect(xcodeRootFromEnv({ APPLE_XCODE_TEST_CERT: xcode, VERCEL_ENV: "production" })?.equals(der("xcode.pem"))).toBe(true);
    expect(xcodeRootFromEnv({})).toBeUndefined();
    expect(xcodeRootFromEnv({ APPLE_XCODE_TEST_CERT: "rubbish" })).toBeUndefined();
  });

  it("has no signing key (so answers 503) until ENTITLEMENT_PRIVATE_JWK is a JSON key", async () => {
    const request = new Request("https://numbite.com/api/v1/entitlement/apple", { method: "POST" });
    vi.stubEnv("ENTITLEMENT_PRIVATE_JWK", "");
    expect(appleContext(request).sign).toBeNull();
    vi.stubEnv("ENTITLEMENT_PRIVATE_JWK", "not json");
    expect(appleContext(request).sign).toBeNull();
    for (const notAKey of ["null", "42", "[1]", '"text"']) {
      vi.stubEnv("ENTITLEMENT_PRIVATE_JWK", notAKey);
      expect(appleContext(request).sign).toBeNull();
    }
    const { privateJwk, publicJwk } = await generateKeyPair();
    vi.stubEnv("ENTITLEMENT_PRIVATE_JWK", JSON.stringify(privateJwk));
    const sign = appleContext(request, NOW).sign;
    expect(sign).not.toBeNull();
    const token = await sign!({ v: 1, plan: "monthly", src: "apple", iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 60 });
    expect(await verifyToken(token, publicJwk, NOW)).toMatchObject({ plan: "monthly", src: "apple" });
  });

  it("reads the Xcode certificate from the server's settings, and has none when it is removed", () => {
    const request = new Request("https://numbite.com/api/v1/entitlement/apple", { method: "POST" });
    vi.stubEnv("APPLE_XCODE_TEST_CERT", pem("xcode.pem"));
    expect(appleContext(request).verifyOptions.xcodeRoot?.equals(der("xcode.pem"))).toBe(true);
    vi.stubEnv("APPLE_XCODE_TEST_CERT", "");
    expect(appleContext(request).verifyOptions.xcodeRoot).toBeUndefined();
  });
});

describe("handleAppleEntitlement: telling the server's log why nothing gave access", () => {
  it("notes reason codes only, plus the public certificate of a refused Xcode test purchase so it can be pinned", async () => {
    const { privateJwk } = await generateKeyPair();
    const notes: string[] = [];
    const deps: AppleEntitlementDeps = { sign: (c) => signClaims(c, privateJwk), nowMs: NOW, allow: () => true, verifyOptions: { appleRoots: [der("root.pem")] }, note: (m) => notes.push(m) };
    const xcode = jws(payload({ environment: "Xcode" }), { chain: ["xcode.pem"], key: XCODE_KEY });
    expect((await handleAppleEntitlement({ transactions: [xcode, jws(payload({ bundleId: "x" }))] }, deps)).status).toBe(402);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("xcode_not_allowed, wrong_bundle");
    expect(notes[0]).toContain(`Xcode test certificate: ${der("xcode.pem").toString("base64")}`);
    expect(notes[0]).not.toMatch(/originalTransactionId|transactionId|purchaseDate/);
    notes.length = 0;
    expect((await handleAppleEntitlement({ transactions: [jws(payload())] }, deps)).status).toBe(200);
    expect(notes).toEqual([]);
  });
});
