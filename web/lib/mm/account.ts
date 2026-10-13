import { validateState, isSyncStore, type SyncState, type SyncStoreName } from "./syncMerge";
import type { Store } from "./persist";

// The browser's (and iPhone app's) side of signing in (docs/ACCOUNTS_SYNC.md): a small client for our own API. Nothing here talks to
// Supabase: every call goes to numbite.com's /api/v1, which holds the server-only key.
//   * On the website the session is two http-only cookies the page can't read: the browser sends them by itself.
//   * Inside the iPhone app (a different origin, app://menumath) there are no cookies, so the app keeps the session it was given
//     and sends it as `Authorization: Bearer`; when the access token has run out it renews it once with the refresh token.

export interface AccountUser {
  id: string;
  email: string | null;
}

/** The iPhone app's own copy of the session (never used on the website, where the cookies are http-only). */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Seconds since 1970. */
  expiresAt: number;
}

export class AccountError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AccountError";
  }
  /** Offline, or the server could not be reached (as opposed to the server saying no). */
  get offline() {
    return this.status === 0;
  }
}

export interface AccountDeps {
  fetch: typeof fetch;
  /** Our API's address ending in a slash (config.API_BASE). */
  base: string;
  /** True inside the iPhone app: Authorization header instead of cookies. */
  useTokens: boolean;
  tokens: Store<StoredSession | null>;
}

const isUser = (u: unknown): u is AccountUser =>
  typeof u === "object" && u !== null && typeof (u as AccountUser).id === "string" && (typeof (u as AccountUser).email === "string" || (u as AccountUser).email === null);

const isStoredSession = (s: unknown): s is StoredSession =>
  typeof s === "object" && s !== null && typeof (s as StoredSession).accessToken === "string" && typeof (s as StoredSession).refreshToken === "string" && typeof (s as StoredSession).expiresAt === "number";

export const sanitizeStoredSession = (raw: unknown): StoredSession | null => (isStoredSession(raw) ? { accessToken: raw.accessToken, refreshToken: raw.refreshToken, expiresAt: raw.expiresAt } : null);

export function createAccountApi(deps: AccountDeps) {
  let renewing: Promise<boolean> | null = null;

  async function raw(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<Response> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const token = deps.useTokens && init.auth !== false ? deps.tokens.get()?.accessToken : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await deps.fetch(`${deps.base}${path}`, {
        method: init.method ?? "GET",
        headers,
        credentials: deps.useTokens ? "omit" : "same-origin",
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        cache: "no-store",
      });
    } catch {
      throw new AccountError(0, "offline", "offline");
    }
  }

  /** Renew the session once: the app with its refresh token, the website by asking /auth/session (which renews its cookies). */
  function renew(): Promise<boolean> {
    renewing ??= (async () => {
      try {
        if (deps.useTokens) {
          const refreshToken = deps.tokens.get()?.refreshToken;
          if (!refreshToken) return false;
          const res = await raw("auth/refresh", { method: "POST", body: { refreshToken }, auth: false });
          if (!res.ok) {
            if (res.status === 401) deps.tokens.set(null); // the refresh token is no good any more: signed out
            return false;
          }
          const body = (await res.json().catch(() => null)) as { session?: unknown } | null;
          const session = sanitizeStoredSession(body?.session);
          if (!session) return false;
          deps.tokens.set(session);
          return true;
        }
        const res = await raw("auth/session");
        const body = (await res.json().catch(() => null)) as { user?: unknown } | null;
        return res.ok && isUser(body?.user);
      } finally {
        renewing = null;
      }
    })();
    return renewing;
  }

  /** A request as the signed-in person: on a 401 it renews the session once and tries again. */
  async function authed(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    let res = await raw(path, init);
    if (res.status === 401 && (await renew())) res = await raw(path, init);
    return res;
  }

  async function failure(res: Response): Promise<AccountError> {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    return new AccountError(res.status, body?.error ?? "error", body?.message);
  }

  async function userFromSessionBody(res: Response): Promise<AccountUser> {
    const body = (await res.json().catch(() => null)) as { user?: unknown; session?: unknown } | null;
    const session = sanitizeStoredSession(body?.session);
    if (session) deps.tokens.set(session);
    const user = isUser(body?.user) ? body.user : isUser((body?.session as { user?: unknown } | undefined)?.user) ? ((body?.session as { user: AccountUser }).user) : null;
    if (!user) throw new AccountError(res.status, "error");
    return { id: user.id, email: user.email };
  }

  return {
    /** Who is signed in, or null. A network failure throws (so the caller keeps what it knew). */
    async session(): Promise<AccountUser | null> {
      if (deps.useTokens && !deps.tokens.get()) return null;
      const res = await authed("auth/session");
      if (!res.ok) throw await failure(res);
      const body = (await res.json().catch(() => null)) as { user?: unknown } | null;
      return isUser(body?.user) ? { id: body.user.id, email: body.user.email } : null;
    },

    async sendCode(email: string): Promise<void> {
      const res = await raw("auth/email/start", { method: "POST", body: { email } });
      if (!res.ok) throw await failure(res);
    },

    async verifyCode(email: string, code: string): Promise<AccountUser> {
      const res = await raw("auth/email/verify", { method: "POST", body: { email, code, mode: deps.useTokens ? "token" : "web" } });
      if (!res.ok) throw await failure(res);
      return userFromSessionBody(res);
    },

    /** The iPhone's own Apple sheet gave us an identity token. */
    async signInWithApple(idToken: string, nonce?: string): Promise<AccountUser> {
      const res = await raw("auth/apple", { method: "POST", body: { idToken, ...(nonce ? { nonce } : {}) } });
      if (!res.ok) throw await failure(res);
      return userFromSessionBody(res);
    },

    /** The iPhone's browser sheet finished Google sign-in and gave us a one-time code (and the verifier it made). */
    async exchange(code: string, verifier: string): Promise<AccountUser> {
      const res = await raw("auth/exchange", { method: "POST", body: { code, verifier } });
      if (!res.ok) throw await failure(res);
      return userFromSessionBody(res);
    },

    /** Sign out. Always clears this device's session, even if the server can't be reached. */
    async signOut(): Promise<void> {
      try {
        await raw("auth/signout", { method: "POST" });
      } catch {
        // offline: the local session is cleared below regardless
      }
      deps.tokens.set(null);
    },

    async deleteAccount(): Promise<void> {
      const res = await authed("account", { method: "DELETE", body: { confirm: true } });
      if (!res.ok) throw await failure(res);
      deps.tokens.set(null);
    },

    /** Everything the signed-in person has synced. */
    async syncGetAll(): Promise<Partial<Record<SyncStoreName, SyncState>>> {
      const res = await authed("sync");
      if (!res.ok) throw await failure(res);
      const body = (await res.json().catch(() => null)) as { stores?: Record<string, unknown> } | null;
      const out: Partial<Record<SyncStoreName, SyncState>> = {};
      for (const [name, value] of Object.entries(body?.stores ?? {})) {
        if (!isSyncStore(name)) continue;
        const state = validateState(name, value);
        if (state) out[name] = state;
      }
      return out;
    },

    /** Send one store; the answer is the merged copy to keep. */
    async syncPut(store: SyncStoreName, state: SyncState): Promise<SyncState> {
      const res = await authed(`sync/${store}`, { method: "PUT", body: { state } });
      if (!res.ok) throw await failure(res);
      const body = (await res.json().catch(() => null)) as { state?: unknown } | null;
      const merged = validateState(store, body?.state);
      if (!merged) throw new AccountError(res.status, "error");
      return merged;
    },
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;
