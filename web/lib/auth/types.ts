// Sign-in (docs/ACCOUNTS_SYNC.md). The API talks to Supabase Auth only through this small port, so the handlers are pure and the
// tests use a fake. The real one is port-supabase.ts. Nothing here imports Next.js or Supabase.

export interface AuthUser {
  id: string;
  email: string | null;
  /** How this person signs in ("apple", "google", "email"): the app asks Apple to confirm before deleting an account that uses Apple. */
  providers?: string[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working: seconds since 1970. */
  expiresAt: number;
  user: AuthUser;
}

export type AuthErrorCode =
  /** The code, token or session isn't right (wrong email code, bad Apple token, used or unknown code). */
  | "invalid"
  /** It was right but is too old. */
  | "expired"
  /** Supabase asked us to slow down (for example, one email code a minute). */
  | "rate_limited"
  /** Supabase could not be reached or answered something unexpected. */
  | "unavailable";

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type OAuthProvider = "google" | "apple";
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["google", "apple"];

export interface AuthPort {
  /** Sign in with Apple's identity token from the iPhone's own Apple sheet (the nonce, if the app sent one, must match). */
  signInWithAppleToken(idToken: string, nonce?: string): Promise<AuthSession>;
  /** Email the person a 6-digit code (a new account if the address is new). */
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<AuthSession>;
  /** The address to send the browser to for Google or Apple, bound to this PKCE challenge, coming back to `redirectTo`. */
  oauthUrl(provider: OAuthProvider, redirectTo: string, challenge: string): string;
  /** Swap the one-time code Supabase put on the redirect for a session, proving we hold the verifier. */
  oauthExchange(code: string, verifier: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  /** Who this access token belongs to, or null if it isn't valid (any more). */
  userFromToken(accessToken: string): Promise<AuthUser | null>;
  /** Stop this session working (best effort). */
  signOut(accessToken: string): Promise<void>;
  /** Delete the account and, through the database's cascade, every synced row. */
  deleteUser(userId: string): Promise<void>;
  /** Tell Apple the person's Sign in with Apple is over (App Review 5.1.1(v)). Absent or false when the Apple key isn't set up. Never throws. */
  revokeApple?(authorizationCode: string): Promise<boolean>;
}
