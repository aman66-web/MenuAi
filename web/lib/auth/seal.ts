import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { AuthSession } from "./types";

// The iPhone's one-time code. After Google sign-in finishes on numbite.com (inside the iPhone's secure browser sheet), the page hands the
// app a code on numbite://auth?code=... . The code is the session itself, sealed (AES-256-GCM) with a key made from the server-only secret,
// valid for two minutes and usable only together with the app's PKCE verifier. So there is no table to store it in, and nobody who sees
// the URL (another app claiming numbite://, a log) can open it: they can't read it and they don't hold the verifier.

export const HANDOFF_TTL_MS = 2 * 60 * 1000;

export interface Handoff {
  session: AuthSession;
  /** The app's PKCE challenge: the exchange must present the verifier it came from. */
  challenge: string;
  /** Milliseconds since 1970. */
  expires: number;
}

const key = (secret: string): Buffer => Buffer.from(hkdfSync("sha256", secret, "numbite-handoff-salt-v1", "numbite auth handoff v1", 32));

export function sealHandoff(handoff: Handoff, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(handoff), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The handoff, or null if the code is not ours, was changed, or has expired. */
export function openHandoff(code: string, secret: string, now: number): Handoff | null {
  try {
    const raw = Buffer.from(code, "base64url");
    if (raw.length < 12 + 16 + 2) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as Handoff;
    if (typeof parsed.expires !== "number" || parsed.expires < now || typeof parsed.challenge !== "string" || !parsed.session?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}
