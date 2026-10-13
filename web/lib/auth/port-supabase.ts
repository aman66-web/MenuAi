import "server-only";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { revokeAppleAuthorizationCode, type AppleConfig } from "./apple";
import { AuthError, type AuthPort, type AuthSession, type AuthUser, type OAuthProvider } from "./types";

// The real AuthPort: Supabase Auth through the server-only secret key (never in the app or the browser). Standard library calls for Apple,
// email codes, refresh, user lookup, sign-out and delete; the two PKCE steps for Google and Apple on the web are plain HTTP to Supabase's
// documented /authorize and /token?grant_type=pkce, so they don't depend on the library's own browser-oriented PKCE storage.

export interface SupabaseAuthConfig {
  url: string;
  secretKey: string;
  fetch?: typeof fetch;
  /** The Sign in with Apple key, when it is set up (lib/auth/apple.ts). */
  apple?: AppleConfig | null;
}

interface LibError {
  status?: number;
  code?: string;
  message?: string;
}

function toAuthError(e: LibError | null | undefined): AuthError {
  const status = e?.status;
  if (status === 429 || e?.code === "over_request_rate_limit" || e?.code === "over_email_send_rate_limit") return new AuthError("rate_limited");
  if (e?.code === "otp_expired") return new AuthError("expired");
  if (status === undefined || status === 0 || status >= 500) return new AuthError("unavailable", e?.message ?? "unavailable");
  return new AuthError("invalid", e?.message ?? "invalid");
}

const userOf = (u: { id: string; email?: string | null; app_metadata?: { providers?: unknown } }): AuthUser => {
  const providers = Array.isArray(u.app_metadata?.providers) ? u.app_metadata.providers.filter((p): p is string => typeof p === "string") : undefined;
  return { id: u.id, email: u.email ?? null, ...(providers ? { providers } : {}) };
};

function sessionOf(s: Session): AuthSession {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in,
    user: userOf(s.user),
  };
}

export function supabaseAuthPort(config: SupabaseAuthConfig): AuthPort {
  const base = config.url.replace(/\/$/, "");
  const doFetch = config.fetch ?? fetch;
  let client: SupabaseClient | null = null;
  const db = (): SupabaseClient => (client ??= createClient(base, config.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));

  const need = (data: { session: Session | null }, error: LibError | null): AuthSession => {
    if (error) throw toAuthError(error);
    if (!data.session) throw new AuthError("invalid");
    return sessionOf(data.session);
  };

  return {
    async signInWithAppleToken(idToken, nonce) {
      const { data, error } = await db().auth.signInWithIdToken({ provider: "apple", token: idToken, ...(nonce ? { nonce } : {}) });
      return need(data, error);
    },

    async sendEmailCode(email) {
      const { error } = await db().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw toAuthError(error);
    },

    async verifyEmailCode(email, code) {
      const { data, error } = await db().auth.verifyOtp({ email, token: code, type: "email" });
      return need(data, error);
    },

    oauthUrl(provider: OAuthProvider, redirectTo, challenge) {
      const q = new URLSearchParams({ provider, redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: "s256" });
      return `${base}/auth/v1/authorize?${q}`;
    },

    async oauthExchange(code, verifier) {
      let res: Response;
      try {
        res = await doFetch(`${base}/auth/v1/token?grant_type=pkce`, {
          method: "POST",
          headers: { apikey: config.secretKey, "Content-Type": "application/json" },
          body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
        });
      } catch {
        throw new AuthError("unavailable");
      }
      if (!res.ok) throw toAuthError({ status: res.status });
      const body = (await res.json().catch(() => null)) as
        | { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: { id: string; email?: string | null } }
        | null;
      if (!body?.access_token || !body.refresh_token || !body.user?.id) throw new AuthError("invalid");
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
        user: userOf(body.user),
      };
    },

    async refresh(refreshToken) {
      const { data, error } = await db().auth.refreshSession({ refresh_token: refreshToken });
      return need(data, error);
    },

    async userFromToken(accessToken) {
      const { data, error } = await db().auth.getUser(accessToken);
      if (error) {
        const e = toAuthError(error);
        if (e.code === "unavailable") throw e;
        return null;
      }
      return data.user ? userOf(data.user) : null;
    },

    async signOut(accessToken) {
      const { error } = await db().auth.admin.signOut(accessToken, "local");
      if (error) throw toAuthError(error);
    },

    async deleteUser(userId) {
      const { error } = await db().auth.admin.deleteUser(userId);
      if (error) throw toAuthError(error);
    },

    async revokeApple(authorizationCode) {
      if (!config.apple) return false;
      try {
        return await revokeAppleAuthorizationCode(authorizationCode, config.apple, doFetch);
      } catch {
        return false;
      }
    },
  };
}
