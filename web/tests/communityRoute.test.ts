import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The HTTP glue for Community (lib/community/route.ts + lib/auth/http.ts): who gets in, how a body is read, CORS for the iPhone app, a clean 500.
// Sign-in itself (cookies, Bearer tokens, refresh) is tested in tests/auth.test.ts; here it is replaced by a stand-in that knows two bearer tokens.

vi.mock("server-only", () => ({}));
vi.mock("../lib/store-supabase-community", async () => {
  const { memoryCommunityStore } = await import("./helpers/communityMemory");
  const mem = memoryCommunityStore();
  return { supabaseCommunity: mem.store, __mem: mem };
});
vi.mock("../lib/auth/handlers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/auth/handlers")>();
  return {
    ...real,
    authenticate: vi.fn(async (headers: Headers) => {
      const bearer = headers.get("authorization");
      if (bearer === "Bearer token-alice") return { user: { id: "20000000-0000-4000-8000-00000000000a", email: "alice@example.test" }, token: "token-alice", viaCookie: false };
      if (bearer === "Bearer token-renewed") {
        return { user: { id: "20000000-0000-4000-8000-00000000000b", email: null }, token: "token-renewed", viaCookie: true, cookies: ["nb_at=new; Path=/api/v1; HttpOnly"] };
      }
      return null;
    }),
  };
});

const APP = "app://menumath";
const URL_BASE = "https://numbite.com/api/v1/community";
const alice = { authorization: "Bearer token-alice" };

let communityRoute: typeof import("../lib/community/route").communityRoute;
let authPreflight: typeof import("../lib/auth/http").authPreflight;
let handlers: typeof import("../lib/community/handlers");
let mem: Awaited<ReturnType<typeof import("./helpers/communityMemory").memoryCommunityStore>>;

beforeAll(async () => {
  process.env.SUPABASE_URL = "https://example-project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret-key-test-secret-key-0123456789";
  process.env.IP_HASH_SALT = "test-salt-test-salt-0123456789";
  ({ communityRoute } = await import("../lib/community/route"));
  ({ authPreflight } = await import("../lib/auth/http"));
  handlers = await import("../lib/community/handlers");
  mem = ((await import("../lib/store-supabase-community")) as unknown as { __mem: typeof mem }).__mem;
});

const req = (method: string, path: string, headers: Record<string, string> = {}, body?: string) =>
  new Request(`${URL_BASE}${path}`, { method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body }) });

describe("who gets in", () => {
  it("someone who isn't signed in gets 401 before anything is read or run", async () => {
    let ran = false;
    for (const headers of [{}, { authorization: "Bearer nonsense" }, { cookie: "nb_at=whatever" }] as Array<Record<string, string>>) {
      const res = await communityRoute(req("POST", "/me", headers, "{ this is not json"), async () => ((ran = true), { status: 200, body: {} }), { json: true });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(ran).toBe(false);
  });

  it("a signed-in caller's handler gets their user id, and answers are JSON and never cached", async () => {
    const res = await communityRoute(req("GET", "/me", alice), (userId, ctx) => handlers.handleGetMe(userId, ctx));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, profile: null, counts: { unread: 0, friendRequests: 0 } });
  });

  it("the whole way through: choose a username, then read it back, with a body the handler checks", async () => {
    const put = await communityRoute(req("PUT", "/me", alice, JSON.stringify({ username: "Alice.Test" })), (u, ctx, body) => handlers.handlePutMe(u, body, ctx), { json: true });
    expect(put.status).toBe(201);
    const made = (await put.json()) as { profile: { username: string; friendCode: string } };
    expect(made.profile.username).toBe("alice.test");
    const get = await communityRoute(req("GET", "/me", alice), (u, ctx) => handlers.handleGetMe(u, ctx));
    expect(((await get.json()) as { profile: unknown }).profile).toEqual(expect.objectContaining({ username: "alice.test", friendCode: made.profile.friendCode }));
    // a body the handler dislikes is its 400, not a crash
    const bad = await communityRoute(req("PUT", "/me", alice, JSON.stringify({ username: 5 })), (u, ctx, body) => handlers.handlePutMe(u, body, ctx), { json: true });
    expect(bad.status).toBe(400);
  });

  it("a sign-in the server just renewed sends its new cookies back", async () => {
    const res = await communityRoute(req("GET", "/me", { authorization: "Bearer token-renewed" }), (u, ctx) => handlers.handleGetMe(u, ctx));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("nb_at=new");
  });
});

describe("bodies", () => {
  it("bad JSON is a 400 and an oversized body a 413, after the sign-in check", async () => {
    const run = async () => ({ status: 200, body: {} });
    const bad = await communityRoute(req("POST", "/report", alice, "{ nope"), run, { json: true });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_json" });
    const big = await communityRoute(req("POST", "/send-list", alice, JSON.stringify({ payload: "x".repeat(20 * 1024) })), run, { json: true });
    expect(big.status).toBe(413);
  });

  it("a route that takes no body doesn't read one", async () => {
    const res = await communityRoute(req("GET", "/friends", alice), async (_u, _ctx, body) => ({ status: 200, body: { got: body === undefined } }));
    expect(await res.json()).toEqual({ got: true });
  });
});

describe("the iPhone app", () => {
  it("its own pages are allowed with the headers the Authorization token needs; no other origin is", async () => {
    const run = async () => ({ status: 200, body: { ok: true } });
    const fromApp = await communityRoute(req("GET", "/me", { ...alice, origin: APP }), run);
    expect(fromApp.headers.get("access-control-allow-origin")).toBe(APP);
    const stranger = await communityRoute(req("GET", "/me", { ...alice, origin: "https://evil.example" }), run);
    expect(stranger.headers.get("access-control-allow-origin")).toBeNull();
    const none = await communityRoute(req("GET", "/me", alice), run);
    expect(none.headers.get("access-control-allow-origin")).toBeNull();
    // a refusal carries the headers too, so the app can read it
    const refused = await communityRoute(req("GET", "/me", { origin: APP }), run);
    expect(refused.status).toBe(401);
    expect(refused.headers.get("access-control-allow-origin")).toBe(APP);
  });

  it("the preflight allows GET, POST, PUT, DELETE and the Authorization header for the app only", () => {
    const ok = authPreflight(req("OPTIONS", "/friends", { origin: APP }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(APP);
    for (const m of ["GET", "POST", "PUT", "DELETE"]) expect(ok.headers.get("access-control-allow-methods")).toContain(m);
    expect(ok.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(authPreflight(req("OPTIONS", "/friends", { origin: "https://evil.example" })).headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("failures", () => {
  it("something unexpected is a plain 500 that says nothing about what happened", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await communityRoute(req("GET", "/me", alice), async () => {
      throw new Error("Supabase read community_profiles failed: password=hunter2");
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("server_error");
    expect(text).not.toMatch(/hunter2|Supabase|community_profiles/);
    spy.mockRestore();
  });
});

describe("the route files", () => {
  const root = new URL("../app/api/v1/community/", import.meta.url).pathname;
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f === "route.ts" ? [join(dir, f)] : []));
  const routes = files(root).map((f) => ({ path: f.slice(root.length - 1).replace(/\/route\.ts$/, "").replace(/\/$/, "") || "/", text: readFileSync(f, "utf8") }));

  it("are exactly the documented ones", () => {
    const methodsOf = (text: string) => [...text.matchAll(/export async function (GET|POST|PUT|DELETE)\(/g)].map((m) => m[1]).sort();
    expect(Object.fromEntries(routes.map((r) => [r.path, methodsOf(r.text)]).sort())).toEqual({
      "/blocks": ["GET", "POST"],
      "/blocks/[id]": ["DELETE"],
      "/friends": ["GET"],
      "/friends/[id]": ["DELETE"],
      "/friends/request": ["POST"],
      "/friends/respond": ["POST"],
      "/inbox": ["GET"],
      "/inbox/[id]": ["DELETE"],
      "/inbox/[id]/read": ["POST"],
      "/me": ["GET", "PUT"],
      "/report": ["POST"],
      "/send-list": ["POST"],
    });
  });

  it("every one runs behind the sign-in check and answers the app's preflight, and none talks to the database itself", () => {
    for (const r of routes) {
      expect(r.text, r.path).toContain("communityRoute(");
      expect(r.text, r.path).toContain("export const OPTIONS = authPreflight;");
      expect(r.text, r.path).not.toMatch(/store-supabase|supabase-js|serverEnv|process\.env/);
    }
  });

  it("a route that changes something reads a JSON body, and one that only reads doesn't", () => {
    for (const r of routes) {
      for (const m of r.text.matchAll(/export async function (GET|POST|PUT|DELETE)\([\s\S]*?\n}\n/g)) {
        const takesBody = /\{ json: true \}/.test(m[0]);
        const expectsBody = (m[1] === "PUT" || m[1] === "POST") && !r.path.endsWith("/read");
        expect(takesBody, `${m[1]} ${r.path}`).toBe(expectsBody);
      }
    }
  });
});

describe("the data behind it", () => {
  it("is the one store the routes are given (the real adapter is swapped for the in-memory one here)", () => {
    expect(mem.profiles.map((p) => p.username)).toContain("alice.test");
  });
});
