import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The meeting of 21 November 2026, second pass (C. Offline, menus and the iPhone's waiting screens): the website's service worker (Violet #21, #22, #24), the
// iPhone app's sign-in check (Violet #23), Near me's location limit (Will #28, Arjun #57) and the share sheets' limit (Will #29). The menu client's own fixes
// (Violet #20, #25) are in tests/menu-client.test.ts.

const WEB = new URL("../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, WEB), "utf8");

// ------------------------------------------------------------------------------------------------ the service worker, run as the browser would

const ORIGIN = "https://numbite.test";

interface FakeResponse { ok: boolean; status: number; type: string; body: string; clone(): FakeResponse; text(): Promise<string> }
const respond = (body: string, status = 200): FakeResponse => ({ ok: status >= 200 && status < 300, status, type: "basic", body, clone: () => respond(body, status), text: async () => body });

/** A Cache as the spec has it: keys in the order they were put, and putting a key again makes it the newest. */
class FakeCache {
  entries = new Map<string, FakeResponse>();
  private key(k: string | { url: string }) { return typeof k === "string" ? new URL(k, ORIGIN).href : k.url; }
  async match(k: string | { url: string }) { return this.entries.get(this.key(k))?.clone(); }
  async put(k: string | { url: string }, r: FakeResponse) { const key = this.key(k); this.entries.delete(key); this.entries.set(key, r); }
  async keys() { return [...this.entries.keys()].map((url) => ({ url })); }
  async delete(k: string | { url: string }) { return this.entries.delete(this.key(k)); }
  has(path: string) { return this.entries.has(new URL(path, ORIGIN).href); }
}

function loadServiceWorker() {
  const stores = new Map<string, FakeCache>();
  const caches = {
    open: async (name: string) => { if (!stores.has(name)) stores.set(name, new FakeCache()); return stores.get(name)!; },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const net = { online: true, files: new Map<string, string>() };
  const fetchFn = async (input: string | { url: string }) => {
    if (!net.online) throw new TypeError("offline");
    const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
    const body = net.files.get(url.pathname);
    return body === undefined ? respond("not found", 404) : respond(body);
  };
  const handlers: Record<string, (event: unknown) => void> = {};
  const self = { location: { origin: ORIGIN }, addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
  const ctx = { self, caches, fetch: fetchFn, URL, AbortController, setTimeout, clearTimeout };
  runInNewContext(`${read("public/sw.js")}\n;self.__test = { SHELLS, QUERY_SHELLS, MAX_ENTRIES, VERSION, PAGES, DATA, STATIC, LOGOS: typeof LOGOS === "undefined" ? "(none)" : LOGOS };`, ctx);
  const t = (self as unknown as { __test: { SHELLS: string[]; QUERY_SHELLS: string[]; MAX_ENTRIES: Record<string, number>; VERSION: string; PAGES: string; DATA: string; STATIC: string; LOGOS: string } }).__test;
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
  const install = async () => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.install!({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
  const get = async (path: string, mode = "no-cors") => {
    let answer: Promise<FakeResponse> | undefined;
    handlers.fetch!({ request: { url: ORIGIN + path, method: "GET", mode }, respondWith: (p: Promise<FakeResponse>) => { answer = p; } });
    const r = answer ? await answer : undefined;
    await settle(); // the cache writes (and their trimming) run after the answer
    return r;
  };
  return { t, net, stores, caches, install, get };
}

describe("the website's service worker", () => {
  it("keeps the logos in a cache of their own, so scrolling Eat out never pushes out the menus kept for offline (Violet #21)", async () => {
    const sw = loadServiceWorker();
    sw.net.files.set("/menus/chain-kfc.json", "{}");
    for (let i = 0; i < 200; i++) sw.net.files.set(`/logos/chain-${i}.png`, "png");
    await sw.get("/menus/chain-kfc.json");
    for (let i = 0; i < 200; i++) await sw.get(`/logos/chain-${i}.png`);
    const data = await sw.caches.open(sw.t.DATA);
    const logos = await sw.caches.open(sw.t.LOGOS);
    expect(data.has("/menus/chain-kfc.json")).toBe(true);
    expect(data.entries.size).toBe(1);
    expect(logos.entries.size).toBe(200);
    // offline the logo comes from its own cache
    sw.net.online = false;
    expect((await sw.get("/logos/chain-7.png"))?.body).toBe("png");
  });

  it("the logos' cache has a place for every logo file we ship (and the takedown list), and its name keeps it through the activate step", () => {
    const sw = loadServiceWorker();
    const images = (dir: string): number =>
      readdirSync(dir).reduce((n, f) => {
        const p = join(dir, f);
        return n + (statSync(p).isDirectory() ? images(p) : /\.(png|svg|webp|jpe?g|gif|avif|ico)$/i.test(f) ? 1 : 0);
      }, 0);
    const count = images(new URL("public/logos", WEB).pathname);
    expect(count).toBeGreaterThan(100);
    expect(sw.t.MAX_ENTRIES[sw.t.LOGOS]).toBeGreaterThanOrEqual(count + 1);
    expect(sw.t.LOGOS.startsWith(`${sw.t.VERSION}-`)).toBe(true);
  });

  it("offline, an extra shopping list, its recipes, the leaderboards, welcome and settings open from their one kept copy whatever the query (Violet #22)", async () => {
    const sw = loadServiceWorker();
    for (const path of sw.t.SHELLS) sw.net.files.set(path, `<html>${path}</html>`);
    await sw.install();
    sw.net.online = false;
    for (const page of ["/app/groceries/list?list=2", "/app/groceries/list/recipes?list=2", "/app/groceries/leaderboards?shop=tesco", "/app/welcome?cleared=1", "/app/settings?signin=ok"]) {
      const r = await sw.get(page, "navigate");
      expect(r?.body, page).toBe(`<html>${page.split("?")[0]}</html>`);
    }
    // and every query-driven screen is one of the precached shells
    for (const q of sw.t.QUERY_SHELLS) expect(sw.t.SHELLS, q).toContain(q);
  });

  it("a deploy's precache puts the script files the pages still use back as the newest, so trimming drops older deploys' files first (Violet #24)", async () => {
    const sw = loadServiceWorker();
    const statics = await sw.caches.open(sw.t.STATIC);
    const current = "/_next/static/chunks/current.js";
    // the current pages' script, kept since an earlier deploy (so the oldest), then the cache filled with older deploys' files
    await statics.put(current, respond("current"));
    for (let i = 0; statics.entries.size < sw.t.MAX_ENTRIES[sw.t.STATIC]!; i++) await statics.put(`/_next/static/chunks/old-${i}.js`, respond("old"));
    for (const path of sw.t.SHELLS) sw.net.files.set(path, `<html><script src="${current}"></script></html>`);
    await sw.install();
    // the next script file used goes in and the cache is trimmed back to its limit
    sw.net.files.set("/_next/static/chunks/next.js", "next");
    await sw.get("/_next/static/chunks/next.js");
    expect(statics.entries.size).toBe(sw.t.MAX_ENTRIES[sw.t.STATIC]);
    expect(statics.has(current)).toBe(true);
    expect(statics.has("/_next/static/chunks/old-0.js")).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------ the share card in the iPhone app

const share = vi.hoisted(() => ({ reply: { error: "timeout" } as Record<string, unknown>, calls: [] as Array<{ action: string; timeout: number | undefined }> }));
vi.mock("@/lib/mm/format", () => import("../lib/mm/format"));
vi.mock("@/lib/mm/native", () => ({
  hasNative: () => true,
  nativeCall: async (action: string, _payload: unknown, timeout?: number) => {
    share.calls.push({ action, timeout });
    return share.reply;
  },
}));

describe("the share card in the iPhone app (Will #29)", () => {
  beforeEach(() => {
    share.calls.length = 0;
    vi.stubGlobal("FileReader", class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      error = null;
      readAsDataURL() { this.result = "data:image/png;base64,AA=="; queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal("navigator", {}); // the app's web view: no Web Share with files
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the share sheet open for 15 minutes, and a sheet that outlasts even that, or any other answer, never claims a download the app refuses", async () => {
    const { deliverImage } = await import("../app/app/_lib/share-card");
    const blob = new Blob(["png"], { type: "image/png" });
    const opts = { fileName: "my-order.png", title: "My order", text: "My order" };
    for (const reply of [{ error: "timeout" }, { error: "cancelled" }, { error: "unavailable" }]) {
      share.reply = reply;
      expect(await deliverImage(blob, opts), reply.error).toBe("cancelled");
    }
    share.reply = { done: true };
    expect(await deliverImage(blob, opts)).toBe("shared");
    expect(share.calls.every((c) => c.action === "share" && c.timeout === 15 * 60_000)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ the waits in the screens' code

describe("the waits for the iPhone's own sheets and questions", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const app = [...files(new URL("app", WEB).pathname), ...files(new URL("lib", WEB).pathname)];

  it("every share sheet waits as long as buying a plan (15 minutes), never the 2-minute default", () => {
    const calls = app.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/nativeCall\("share",[^;]*?\)\s*;/g)].map((m) => ({ f, call: m[0] })));
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const { f, call } of calls) expect(call, f).toMatch(/,\s*15 \* 60_000\)\s*;$/);
  });

  it("Near me's tap waits as long as the other permission questions (iOS asks 'Allow location?' the first time); the quiet look on opening stays short", () => {
    const map = read("app/app/map/page.tsx");
    expect(map).toContain('nativeCall("locate", { onlyIfAllowed: quietly }, quietly ? 20_000 : 120_000)');
    expect(read("lib/mm/native.ts")).toContain("const PERMISSION_TIMEOUT_MS = 120_000;");
  });
});
