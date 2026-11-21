import { createSign, randomUUID } from "node:crypto";
import type { DeviceBits, DeviceCheckPort, DeviceEnv } from "./freeWeek";

// Apple's DeviceCheck (developer.apple.com/documentation/devicecheck): Apple keeps two bits per iPhone for each developer, which survive deleting the app and
// signing out. We use bit 0 to mean "this iPhone had the free week" (lib/payments/freeWeek.ts); bit 1 is unused and kept as it is. The iPhone app makes a
// one-time device token (DCDevice, MenuMacros/Services/DeviceCheckService.swift); our server asks Apple about it with a short JWT signed by the DeviceCheck key
// (a .p8 from Apple Developer › Keys). Apple tells us only the two bits: nothing about the person or the phone. We keep neither the token nor the bits.
//   DEVICECHECK_KEY_ID       the key's ID (10 characters)
//   DEVICECHECK_TEAM_ID      the Apple Developer team ID (or APPLE_TEAM_ID, the Sign in with Apple one, when that is the same team)
//   DEVICECHECK_PRIVATE_KEY  the .p8 file's text
// Without them the device check is skipped (deviceCheckFromEnv returns null) and the free week is still stopped by the email and Apple ID hashes.

export interface DeviceCheckConfig {
  keyId: string;
  teamId: string;
  /** The .p8 file's text (a PKCS#8 PEM; "\n" written as two characters is understood too). */
  privateKey: string;
}

const HOSTS: Record<DeviceEnv, string> = {
  production: "https://api.devicecheck.apple.com",
  development: "https://api.development.devicecheck.apple.com",
};

/** Apple answers a query for an iPhone whose bits were never set with 200 and these words instead of JSON. */
export const NO_BITS_YET = "Failed to find bit state";

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

export function deviceCheckConfigFromEnv(env: Record<string, string | undefined> = process.env): DeviceCheckConfig | null {
  const keyId = env.DEVICECHECK_KEY_ID?.trim();
  const teamId = (env.DEVICECHECK_TEAM_ID || env.APPLE_TEAM_ID)?.trim();
  const privateKey = env.DEVICECHECK_PRIVATE_KEY;
  if (!keyId || !teamId || !privateKey || !privateKey.includes("PRIVATE KEY")) return null;
  return { keyId, teamId, privateKey };
}

/** The JWT Apple's DeviceCheck server wants: ES256, the key's ID in the header, the team as issuer, issued now (Apple accepts one up to an hour old). */
export function deviceCheckJwt(cfg: DeviceCheckConfig, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSeconds }));
  const signature = createSign("SHA256").update(`${header}.${payload}`).sign({ key: cfg.privateKey.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(signature)}`;
}

export interface DeviceCheckDeps {
  fetch: typeof fetch;
  now: () => number;
  /** A fresh transaction id for each call (Apple wants one). */
  uuid?: () => string;
  /** How long to wait for Apple before giving up (the free week never waits long on it). */
  timeoutMs?: number;
}

/** The DeviceCheck port the free week handler uses, talking to Apple. Every failure becomes null / false: it never throws. */
export function appleDeviceCheck(cfg: DeviceCheckConfig, deps: DeviceCheckDeps): DeviceCheckPort {
  const uuid = deps.uuid ?? randomUUID;
  const post = async (env: DeviceEnv, path: string, fields: Record<string, unknown>): Promise<Response | null> => {
    const now = deps.now();
    try {
      return await deps.fetch(`${HOSTS[env]}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${deviceCheckJwt(cfg, Math.floor(now / 1000))}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, transaction_id: uuid(), timestamp: now }),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 5000),
      });
    } catch {
      return null; // no answer from Apple (or a key that doesn't sign)
    }
  };
  return {
    async query(deviceToken, env) {
      const res = await post(env, "/v1/query_two_bits", { device_token: deviceToken });
      if (!res || res.status !== 200) return null;
      const text = await res.text().catch(() => "");
      if (text.trim() === "" || text.includes(NO_BITS_YET)) return { bit0: false, bit1: false };
      try {
        const body = JSON.parse(text) as { bit0?: unknown; bit1?: unknown };
        return { bit0: body.bit0 === true, bit1: body.bit1 === true };
      } catch {
        return null;
      }
    },
    async markFreeWeek(deviceToken, env, bits: DeviceBits) {
      const res = await post(env, "/v1/update_two_bits", { device_token: deviceToken, bit0: true, bit1: bits.bit1 });
      return res?.status === 200;
    },
  };
}
