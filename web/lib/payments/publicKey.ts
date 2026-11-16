import committed from "./entitlement-public-key.json";

// The public key that checks paid-access tokens (lib/payments/token.ts). It is safe to publish: it can only check a token, never make one. It lives in the repo
// (written once by tools/payments/make_entitlement_key.mjs), so the website and every iPhone app build carry the same one; NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK, when set,
// takes its place (the tests use that). No key = no token is accepted anywhere.
export function entitlementPublicKey(): JsonWebKey | null {
  const raw = process.env.NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK;
  if (raw) {
    try {
      return JSON.parse(raw) as JsonWebKey;
    } catch {
      return null;
    }
  }
  const key = committed as JsonWebKey;
  return key.kty === "EC" && key.crv === "P-256" && typeof key.x === "string" && typeof key.y === "string" ? key : null;
}
