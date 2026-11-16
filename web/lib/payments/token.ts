// The access token a device keeps after paying: a short signed statement "this device may use paid features until <date>", signed by the server with an ECDSA P-256
// key (ES256) and checked on the device with the matching public key, so it also works with no signal. It carries no name, email or card detail: only the plan,
// the dates and where the payment came from. Works in Node and in the browser (Web Crypto).

import type { PlanId } from "./plans";
import { PLAN_IDS } from "./plans";

export interface EntitlementClaims {
  v: 1;
  plan: PlanId;
  src: "stripe" | "apple";
  /** Issued at, seconds since 1970. */
  iat: number;
  /** Access ends, seconds since 1970. */
  exp: number;
}

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
const PREFIX = "v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A new key pair as JWKs (for tools/payments/make_entitlement_key.mjs; the private one goes only into the server's environment). */
export async function generateKeyPair(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  return { publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

export async function signClaims(claims: EntitlementClaims, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", privateJwk, ALG, false, ["sign"]);
  const payload = b64urlEncode(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN, key, enc.encode(`${PREFIX}.${payload}`)));
  return `${PREFIX}.${payload}.${b64urlEncode(sig)}`;
}

function validClaims(x: unknown): x is EntitlementClaims {
  const c = x as EntitlementClaims;
  return !!c && c.v === 1 && (PLAN_IDS as readonly string[]).includes(c.plan) && (c.src === "stripe" || c.src === "apple") && Number.isFinite(c.iat) && Number.isFinite(c.exp);
}

/** The claims if the signature is the server's and the token has not run out; null for anything else (never throws). */
export async function verifyToken(token: string, publicJwk: JsonWebKey, nowMs: number): Promise<EntitlementClaims | null> {
  try {
    const [prefix, payload, signature, extra] = token.split(".");
    if (prefix !== PREFIX || !payload || !signature || extra !== undefined) return null;
    const sig = b64urlDecode(signature);
    const body = b64urlDecode(payload);
    if (!sig || !body) return null;
    const key = await crypto.subtle.importKey("jwk", publicJwk, ALG, false, ["verify"]);
    if (!(await crypto.subtle.verify(SIGN, key, sig as BufferSource, enc.encode(`${PREFIX}.${payload}`)))) return null;
    const claims: unknown = JSON.parse(dec.decode(body));
    return validClaims(claims) && claims.exp * 1000 > nowMs ? claims : null;
  } catch {
    return null;
  }
}
