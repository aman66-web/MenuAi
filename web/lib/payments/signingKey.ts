import "server-only";

/** The key our access tokens are signed with (ENTITLEMENT_PRIVATE_JWK, a JSON key). Null when it isn't set or isn't a JSON object, which the entitlement routes answer with 503. */
export function entitlementPrivateJwk(env: Record<string, string | undefined> = process.env): JsonWebKey | null {
  try {
    const raw = env.ENTITLEMENT_PRIVATE_JWK;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as JsonWebKey) : null;
  } catch {
    return null; // a key that isn't JSON counts as not set up
  }
}
