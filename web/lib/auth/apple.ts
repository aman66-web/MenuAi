import { createSign } from "node:crypto";

// Sign in with Apple, account deletion (App Review 5.1.1(v)): when someone deletes their account Apple wants us to tell it, through its REST API,
// that the sign-in is over ("revoke the user's tokens"), so the app also disappears from their Apple ID's list of apps. The iPhone app gives us a
// fresh one-time authorization code (the person confirms in Apple's own sheet); we swap it for Apple's refresh token and revoke that.
// This needs the Sign in with Apple key (the .p8 from Part A), so it only runs when APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY are set in
// Vercel; without them deletion still works and the Apple side is simply not told (the person can remove the app in Settings › Apple ID).

export interface AppleConfig {
  teamId: string;
  keyId: string;
  /** The .p8 file's text (a PKCS#8 PEM). */
  privateKey: string;
  /** The app's bundle ID: what the iPhone's own Apple sheet signs in as. */
  clientId: string;
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

/** Apple's "client secret": a short-lived ES256 JWT signed with the Sign in with Apple key. */
export function appleClientSecret(cfg: AppleConfig, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: "https://appleid.apple.com", sub: cfg.clientId }));
  const signature = createSign("SHA256").update(`${header}.${payload}`).sign({ key: cfg.privateKey.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(signature)}`;
}

export function appleConfigFromEnv(env: Record<string, string | undefined>): AppleConfig | null {
  const { APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_PRIVATE_KEY: privateKey } = env;
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey, clientId: env.APPLE_CLIENT_ID || "com.amanmarwaha.MenuMacros" };
}

/** Swap the authorization code for Apple's refresh token, then revoke it. True when Apple accepted the revoke. */
export async function revokeAppleAuthorizationCode(code: string, cfg: AppleConfig, doFetch: typeof fetch = fetch, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const secret = appleClientSecret(cfg, nowSeconds);
  const form = (fields: Record<string, string>) => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: secret, ...fields }).toString(),
  });
  const tokenRes = await doFetch("https://appleid.apple.com/auth/token", form({ grant_type: "authorization_code", code }));
  if (!tokenRes.ok) return false;
  const body = (await tokenRes.json().catch(() => null)) as { refresh_token?: string } | null;
  if (!body?.refresh_token) return false;
  const revokeRes = await doFetch("https://appleid.apple.com/auth/revoke", form({ token: body.refresh_token, token_type_hint: "refresh_token" }));
  return revokeRes.ok;
}
