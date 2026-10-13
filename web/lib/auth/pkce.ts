import { createHash, randomBytes } from "node:crypto";

// PKCE (RFC 7636): the browser or app that starts a sign-in keeps a secret "verifier" and sends only its fingerprint (the "challenge").
// Only whoever holds the verifier can finish the sign-in, so a stolen redirect (a code in a URL) is useless on its own.

export const newVerifier = (): string => randomBytes(48).toString("base64url"); // 64 characters
export const challengeFor = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url"); // 43 characters

export const isChallenge = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
export const isVerifier = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(s);
