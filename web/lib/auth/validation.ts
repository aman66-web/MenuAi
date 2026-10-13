import { z } from "zod";

// Bodies the sign-in routes accept. Keep in sync with docs/BACKEND.md.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const honeypot = z.string().max(200).optional();

export const appleSchema = z.object({
  idToken: z.string().min(20).max(8192),
  /** The raw nonce the app gave Apple (Apple's token carries its SHA-256); optional. */
  nonce: z.string().min(8).max(200).optional(),
});

export const emailStartSchema = z.object({ email, website: honeypot });

export const emailVerifySchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, "six digits"),
  /** "web": set the session cookies; "token": return the session (only for the iPhone app's own pages). */
  mode: z.enum(["web", "token"]).default("web"),
});

export const exchangeSchema = z.object({
  code: z.string().min(40).max(8192),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(2048) });

export const deleteAccountSchema = z.object({
  confirm: z.literal(true),
  /** From the iPhone's Apple sheet, for an account that signs in with Apple: lets us tell Apple the sign-in is over. */
  appleAuthorizationCode: z.string().regex(/^[A-Za-z0-9._-]{20,1000}$/).optional(),
});
