import { describe, expect, it } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { appleClientSecret, appleConfigFromEnv, revokeAppleAuthorizationCode, type AppleConfig } from "../lib/auth/apple";
import { handleDeleteAccount, type AuthCtx } from "../lib/auth/handlers";
import { makeLimit } from "../lib/auth/limiter";
import type { AuthPort } from "../lib/auth/types";
import { cleanNativeResult } from "../lib/mm/native";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const cfg: AppleConfig = { teamId: "TEAMID1234", keyId: "KEYID12345", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), clientId: "com.example.app" };
const NOW = 1_800_000_000;

describe("Sign in with Apple: telling Apple when an account is deleted", () => {
  it("makes Apple's client secret: an ES256 token for our team, key and app, good for five minutes", () => {
    const [h, p, sig] = appleClientSecret(cfg, NOW).split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEYID12345", typ: "JWT" });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toEqual({ iss: "TEAMID1234", iat: NOW, exp: NOW + 300, aud: "https://appleid.apple.com", sub: "com.example.app" });
    expect(Buffer.from(sig, "base64url").length).toBe(64); // raw r||s, as JWT ES256 needs
    const ok = createVerify("SHA256").update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
  });

  it("swaps the code for a refresh token, then revokes it", async () => {
    const calls: Array<{ url: string; body: URLSearchParams }> = [];
    const doFetch = (async (url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string);
      calls.push({ url, body });
      return new Response(JSON.stringify(url.endsWith("/token") ? { refresh_token: "rt-from-apple" } : {}), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await revokeAppleAuthorizationCode("the-code-from-the-sheet", cfg, doFetch, NOW)).toBe(true);
    expect(calls[0].url).toBe("https://appleid.apple.com/auth/token");
    expect(calls[0].body.get("grant_type")).toBe("authorization_code");
    expect(calls[0].body.get("code")).toBe("the-code-from-the-sheet");
    expect(calls[0].body.get("client_id")).toBe("com.example.app");
    expect(calls[1].url).toBe("https://appleid.apple.com/auth/revoke");
    expect(calls[1].body.get("token")).toBe("rt-from-apple");
    expect(calls[1].body.get("token_type_hint")).toBe("refresh_token");
  });

  it("says false when Apple refuses the code or the revoke, and never throws for an answer", async () => {
    const refuse = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    expect(await revokeAppleAuthorizationCode("x", cfg, refuse, NOW)).toBe(false);
    const noToken = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    expect(await revokeAppleAuthorizationCode("x", cfg, noToken, NOW)).toBe(false);
  });

  it("is only set up when all three Apple settings are present", () => {
    expect(appleConfigFromEnv({})).toBeNull();
    expect(appleConfigFromEnv({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K" })).toBeNull();
    expect(appleConfigFromEnv({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P" })).toMatchObject({ clientId: "com.amanmarwaha.MenuMacros" });
  });
});

describe("deleting an account that signs in with Apple", () => {
  const ctx = (port: Partial<AuthPort>): AuthCtx => ({
    port: { userFromToken: async () => ({ id: "u1", email: "a@example.com", providers: ["apple"] }), deleteUser: async () => undefined, ...port } as AuthPort,
    secret: "s".repeat(32), now: () => NOW * 1000, limit: makeLimit(() => NOW * 1000), who: "w", origin: "https://numbite.com", secure: true, method: "DELETE", sameOrigin: false, fromApp: true,
  });
  const headers = new Headers({ authorization: "Bearer token" });

  it("tells Apple first, then deletes", async () => {
    const order: string[] = [];
    const c = ctx({ revokeApple: async (code) => (order.push(`revoke:${code}`), true), deleteUser: async () => void order.push("delete") });
    const r = await handleDeleteAccount({ confirm: true, appleAuthorizationCode: "c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv" }, headers, c);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, appleRevoked: true });
    expect(order).toEqual(["revoke:c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv", "delete"]);
  });

  it("still deletes when Apple can't be told", async () => {
    let deleted = false;
    const c = ctx({ revokeApple: async () => { throw new Error("apple down"); }, deleteUser: async () => void (deleted = true) });
    const r = await handleDeleteAccount({ confirm: true, appleAuthorizationCode: "c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv" }, headers, c);
    expect(r.status).toBe(200);
    expect(r.body?.appleRevoked).toBe(false);
    expect(deleted).toBe(true);
  });

  it("works without a code or without the Apple key (nothing to revoke)", async () => {
    let deleted = 0;
    const c = ctx({ deleteUser: async () => void deleted++ });
    expect((await handleDeleteAccount({ confirm: true }, headers, c)).body).toEqual({ ok: true });
    expect((await handleDeleteAccount({ confirm: true, appleAuthorizationCode: "c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv" }, headers, c)).body).toEqual({ ok: true });
    expect(deleted).toBe(2);
  });

  it("refuses a code that doesn't look like Apple's", async () => {
    expect((await handleDeleteAccount({ confirm: true, appleAuthorizationCode: "short" }, headers, ctx({}))).status).toBe(400);
  });

  it("the bridge passes on the code from Apple's sheet", () => {
    expect(cleanNativeResult({ idToken: "aaa.bbb.ccc", appleCode: "c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv" })).toEqual({ idToken: "aaa.bbb.ccc", appleCode: "c72f5a2b0f4e84e22b8c9d0a1d5d7a1ae.0.rrwv" });
    expect(cleanNativeResult({ idToken: "aaa.bbb.ccc", appleCode: "<script>" })).toEqual({ idToken: "aaa.bbb.ccc" });
  });
});
