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

// Since 27 November 2026 the website no longer runs the web app (lib/webAppClosed.ts), so its offline worker is retired: public/sw.js now only clears the old
// worker's caches and removes itself. (The offline worker these meeting fixes were made in is in git history, before the commit that retired it.)

function loadServiceWorker() {
  const stores = new Map<string, Map<string, string>>([["mm-v10-pages", new Map([["/app", "<html>"]])], ["mm-v10-logos", new Map()], ["mm-v9-static", new Map()]]);
  const caches = { keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) };
  const handlers: Record<string, (event: unknown) => void> = {};
  const calls = { skipWaiting: 0, unregister: 0 };
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
    skipWaiting: async () => { calls.skipWaiting++; },
    registration: { unregister: async () => { calls.unregister++; return true; } },
  };
  runInNewContext(read("public/sw.js"), { self, caches });
  const fire = async (type: string) => {
    let done: unknown = Promise.resolve();
    handlers[type]?.({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
  return { stores, handlers, calls, fire };
}

describe("the website's retired service worker", () => {
  it("takes over at once, deletes every cache the old web app's worker made, and unregisters itself", async () => {
    const sw = loadServiceWorker();
    await sw.fire("install");
    expect(sw.calls.skipWaiting).toBe(1);
    await sw.fire("activate");
    expect(sw.stores.size).toBe(0);
    expect(sw.calls.unregister).toBe(1);
  });

  it("answers no request, so /app gets the website's redirect and nothing comes from an old copy", () => {
    const sw = loadServiceWorker();
    expect(Object.keys(sw.handlers).sort()).toEqual(["activate", "install"]);
  });

  it("is still re-checked on every visit, never registered by the web app, and never packed into the phone apps", () => {
    expect(read("next.config.ts")).toMatch(/source: "\/sw\.js",\s*headers: \[\s*\{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" \}/);
    expect(read("app/app/_components/AppShell.tsx")).not.toMatch(/serviceWorker\.register/);
    expect(readFileSync(new URL("../scripts/pack_app_web.py", WEB), "utf8")).toMatch(/ALWAYS_OUT = \{"menus-sample", "sw\.js"\}/);
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
