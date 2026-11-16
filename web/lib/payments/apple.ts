// Apple In-App Purchase, checked on our server: the iPhone app hands over a StoreKit 2 signed transaction (a compact JWS: header.payload.signature) and this file
// decides whether it is a real, current purchase of one of our three plans. Nothing here talks to Apple or to a database: the transaction carries its own proof.
//
// What makes a transaction genuine:
//   1. the header says ES256 and carries the signing certificates in x5c (leaf first, root last);
//   2. for an App Store purchase (Production or Sandbox) there are exactly three certificates, the last is byte for byte Apple Root CA - G3, the middle one carries
//      Apple's intermediate marker (OID 1.2.840.113635.100.6.2.1) and the leaf Apple's receipt-signing marker (OID 1.2.840.113635.100.6.11.1), each is signed by the
//      next, and all were valid when Apple signed the transaction;
//   3. the JWS signature checks out with the leaf's public key.
// Then the payload must be our app, one of our products, not refunded, not replaced by an upgrade, and give access that hasn't ended.
//
// Xcode signs local test purchases with its own certificate ("Editor > Save Public Certificate" in Xcode exports it). Those are accepted only when that exact
// certificate is passed in as `xcodeRoot` and the transaction says environment "Xcode"; the route passes it only while APPLE_XCODE_TEST_CERT is set for a test.
//
// Pure (node:crypto only) so tests can drive it with a throwaway test chain; the route glue (appleRoute.ts) is the server-only part.

import { X509Certificate, verify as verifySignature } from "node:crypto";
import { firstExpiry, renewalExpiry, type PlanId } from "./plans";

/** Apple Root CA - G3, from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer (downloaded 16 November 2026).
 *  SHA-256 fingerprint 63 34 3A BF B8 9A 6A 03 EB B5 7E 9B 3F 5F A7 BE 7C 4F 5C 75 6F 30 17 B3 A8 C4 88 C3 65 3E 91 79, as Apple lists it in
 *  "List of available root certificates in iOS 26, iPadOS 26, macOS 26, tvOS 26, visionOS 26 and watchOS 26" (https://support.apple.com/en-gb/126047).
 *  Valid 30 April 2014 to 30 April 2039. tests/applePurchase.test.ts checks the fingerprint. */
const APPLE_ROOT_CA_G3_BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";
export const APPLE_ROOT_CA_G3: Buffer = Buffer.from(APPLE_ROOT_CA_G3_BASE64, "base64");

/** Our app (the bundle ID in Xcode; unchanged since 2026-10-08). */
export const APPLE_BUNDLE_ID = "com.amanmarwaha.MenuMacros";

/** The three App Store products and the plan each one gives. A Map, so a product called "constructor" or "__proto__" can't find anything. */
export const APPLE_PRODUCTS: ReadonlyMap<string, PlanId> = new Map<string, PlanId>([
  ["com.amanmarwaha.numbite.pro.annual", "annual"],
  ["com.amanmarwaha.numbite.pro.monthly", "monthly"],
  ["com.amanmarwaha.numbite.pro.pass90", "pass90"],
]);

/** The markers Apple puts in its certificates, as the DER bytes of the OID (tag 06, length 0A, then the encoded number). */
const OID_APPLE_INTERMEDIATE = Buffer.from("060a2a864886f76364060201", "hex"); // 1.2.840.113635.100.6.2.1
const OID_APPLE_RECEIPT_LEAF = Buffer.from("060a2a864886f76364060b01", "hex"); // 1.2.840.113635.100.6.11.1

export type AppleEnvironment = "Production" | "Sandbox" | "Xcode";

/** Why a transaction was refused (short codes the tests check; never shown to anyone). */
export type AppleRefusal =
  | "malformed" // not a compact JWS with JSON header and payload
  | "bad_alg" // header alg isn't ES256
  | "bad_x5c" // x5c isn't 1 to 4 standard-base64 DER certificates
  | "bad_environment" // environment isn't Production, Sandbox or Xcode
  | "xcode_not_allowed" // an Xcode test purchase, but no Xcode certificate was given
  | "bad_chain_length" // an App Store purchase without exactly three certificates
  | "untrusted_root" // the chain doesn't end at a root we trust
  | "missing_oid" // the intermediate or the leaf lacks Apple's marker
  | "bad_chain" // a certificate isn't issued and signed by the next one
  | "cert_not_valid" // a certificate wasn't valid when the transaction was signed
  | "bad_signature" // the JWS signature doesn't check out with the leaf's key
  | "wrong_bundle" // another app's purchase
  | "unknown_product" // not one of our three products
  | "bad_payload" // a date that isn't a finite number, or a missing field
  | "revoked" // refunded or otherwise taken back by Apple
  | "upgraded" // replaced by an upgrade to another subscription
  | "expired"; // the access it gave has ended

export type AppleVerifyResult =
  | { ok: true; plan: PlanId; accessEnd: number; environment: AppleEnvironment; originalTransactionId: string }
  | { ok: false; reason: AppleRefusal };

export interface AppleVerifyOptions {
  /** Now, milliseconds since 1970. */
  nowMs: number;
  /** DER bytes of the roots trusted for App Store purchases. Default: Apple Root CA - G3 only. */
  appleRoots?: Buffer[];
  /** DER bytes of Xcode's StoreKit test certificate; only for local testing, never in production. */
  xcodeRoot?: Buffer;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

const refuse = (reason: AppleRefusal): AppleVerifyResult => ({ ok: false, reason });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** The x5c list as certificates, or null if it isn't 1 to 4 standard-base64 DER certificates. */
function readChain(x5c: unknown): X509Certificate[] | null {
  if (!Array.isArray(x5c) || x5c.length < 1 || x5c.length > 4) return null;
  const certs: X509Certificate[] = [];
  for (const item of x5c) {
    if (typeof item !== "string" || item.length % 4 !== 0 || !B64.test(item)) return null;
    try {
      certs.push(new X509Certificate(Buffer.from(item, "base64")));
    } catch {
      return null;
    }
  }
  return certs;
}

/** Each certificate issued (by name and key identifier) and signed by the next one in the list. */
function linked(certs: X509Certificate[], issuersMustBeCa: boolean): boolean {
  for (let i = 0; i + 1 < certs.length; i++) {
    const child = certs[i];
    const parent = certs[i + 1];
    if (issuersMustBeCa && !parent.ca) return false;
    if (!child.checkIssued(parent) || !child.verify(parent.publicKey)) return false;
  }
  return true;
}

/** Valid at `at` (ms). validFrom/validTo are text such as "Apr 30 18:19:06 2014 GMT"; Date reads them on every Node version Vercel runs. */
function validAt(cert: X509Certificate, at: number): boolean {
  const from = new Date(cert.validFrom).getTime();
  const to = new Date(cert.validTo).getTime();
  return Number.isFinite(from) && Number.isFinite(to) && from <= at && at <= to;
}

/** A certificate given as PEM text or as base64 DER (e.g. the Xcode certificate in an environment variable): its DER bytes, or null. */
export function parseCertificate(text: string): Buffer | null {
  const pem = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(text);
  const b64 = (pem ? pem[1] : text).replace(/\s+/g, "");
  if (!b64 || b64.length % 4 !== 0 || !B64.test(b64)) return null;
  try {
    return new X509Certificate(Buffer.from(b64, "base64")).raw;
  } catch {
    return null;
  }
}

/** Check one StoreKit 2 signed transaction. Never throws: anything unexpected is "malformed". */
export function verifyAppleTransaction(jws: string, options: AppleVerifyOptions): AppleVerifyResult {
  try {
    return check(jws, options);
  } catch {
    return refuse("malformed");
  }
}

function check(jws: string, options: AppleVerifyOptions): AppleVerifyResult {
  if (typeof jws !== "string") return refuse("malformed");
  const parts = jws.split(".");
  if (parts.length !== 3 || !parts.every((part) => B64URL.test(part))) return refuse("malformed");
  const [h, p, s] = parts;
  const header = decodeJson(h);
  const payload = decodeJson(p);
  if (!header || !payload) return refuse("malformed");
  if (header.alg !== "ES256") return refuse("bad_alg");
  const certs = readChain(header.x5c);
  if (!certs) return refuse("bad_x5c");

  // The payload isn't trusted yet: its environment only picks which root it must lead to, and its signedDate the moment the certificates must have been valid.
  // Both are covered by the signature checked below, so a changed value fails there.
  if (payload.signedDate !== undefined && !isFiniteNumber(payload.signedDate)) return refuse("bad_payload");
  const signedAt = isFiniteNumber(payload.signedDate) ? payload.signedDate : options.nowMs;
  const environment = payload.environment;
  const top = certs[certs.length - 1];

  if (environment === "Production" || environment === "Sandbox") {
    if (certs.length !== 3) return refuse("bad_chain_length");
    const roots = options.appleRoots ?? [APPLE_ROOT_CA_G3];
    if (!roots.some((root) => top.raw.equals(root))) return refuse("untrusted_root");
    if (!certs[1].raw.includes(OID_APPLE_INTERMEDIATE) || !certs[0].raw.includes(OID_APPLE_RECEIPT_LEAF)) return refuse("missing_oid");
    if (!linked(certs, true)) return refuse("bad_chain");
  } else if (environment === "Xcode") {
    if (!options.xcodeRoot) return refuse("xcode_not_allowed");
    if (!top.raw.equals(options.xcodeRoot)) return refuse("untrusted_root");
    if (!linked(certs, false)) return refuse("bad_chain");
  } else {
    return refuse("bad_environment");
  }
  if (!certs.every((cert) => validAt(cert, signedAt))) return refuse("cert_not_valid");

  // ES256 = ECDSA on P-256 with SHA-256; a JWS carries the signature as 64 raw bytes (r then s).
  const key = certs[0].publicKey;
  const signature = Buffer.from(s, "base64url");
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1" || signature.length !== 64) return refuse("bad_signature");
  if (!verifySignature("sha256", Buffer.from(`${h}.${p}`, "ascii"), { key, dsaEncoding: "ieee-p1363" }, signature)) return refuse("bad_signature");

  // From here on the payload is Apple's (or, in local testing, Xcode's).
  if (payload.bundleId !== APPLE_BUNDLE_ID) return refuse("wrong_bundle");
  const plan = typeof payload.productId === "string" ? APPLE_PRODUCTS.get(payload.productId) : undefined;
  if (!plan) return refuse("unknown_product");
  if (payload.revocationDate !== undefined && payload.revocationDate !== null) return refuse("revoked");
  if (payload.isUpgraded === true) return refuse("upgraded");
  for (const field of ["purchaseDate", "originalPurchaseDate", "expiresDate"] as const) {
    if (payload[field] !== undefined && !isFiniteNumber(payload[field])) return refuse("bad_payload");
  }
  const purchaseDate = payload.purchaseDate;
  const originalTransactionId = payload.originalTransactionId;
  if (!isFiniteNumber(purchaseDate) || typeof originalTransactionId !== "string" || !originalTransactionId) return refuse("bad_payload");

  let accessEnd: number;
  if (plan === "pass90") {
    accessEnd = firstExpiry("pass90", purchaseDate); // a non-renewing subscription has no expiresDate: 90 days from the purchase
  } else {
    if (!isFiniteNumber(payload.expiresDate)) return refuse("bad_payload");
    accessEnd = renewalExpiry(payload.expiresDate); // the paid period plus a few days' grace, as for the website's subscriptions
  }
  if (accessEnd <= options.nowMs) return refuse("expired");
  return { ok: true, plan, accessEnd, environment, originalTransactionId };
}
