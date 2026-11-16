import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { handleCleanup, handleNotFound, RATE_LIMITS } from "../lib/handlers";
import { mailtoFor, notFoundPayload, sanitizeOutbox, type OutboxItem } from "../lib/mm/outbox";
import { notFoundPost } from "../lib/notFoundRoute";
import type { Store, Table } from "../lib/store";
import { notFoundSchema } from "../lib/validation";

// "Couldn't find this at {shop}?" reports (RECIPES_ANY_SHOP_ENABLED; docs/RECIPES_ANY_SUPERMARKET_REPORT.md): only the shop, the ingredient kind, the product, the
// recipe and the app version are kept, never anything about the person; the route answers 404 while the switch is off.

type Row = Record<string, unknown> & { created_at: string };
class MemoryStore implements Store {
  rows: Record<Table, Row[]> = { waitlist: [], number_reports: [], chain_requests: [], support_messages: [], not_found_reports: [] };
  missing = new Set<Table>();
  now = "2026-11-17T12:00:00.000Z";
  async countRecent(table: Table, ipHash: string, sinceIso: string) {
    return this.rows[table].filter((r) => r.ip_hash === ipHash && r.created_at >= sinceIso).length;
  }
  async insert(table: Table, row: Record<string, unknown>) {
    if (this.missing.has(table)) throw new Error(`relation "${table}" does not exist`);
    this.rows[table].push({ ...row, created_at: this.now });
    return { id: String(this.rows[table].length) };
  }
  async insertWaitlist() {}
  async setReportPhotoPath() {}
  async createPhotoUploadUrl() { return { signedUrl: "" }; }
  async clearIpHashes(table: Table, beforeIso: string) {
    if (this.missing.has(table)) throw new Error(`relation "${table}" does not exist`);
    let n = 0;
    for (const r of this.rows[table]) if (r.created_at < beforeIso && r.ip_hash) { r.ip_hash = null; n++; }
    return n;
  }
}

const good = { shop: "tesco", kind: "chicken-breast", productId: "254656543", recipeId: "chicken-fajita-bowls", appVersion: "web 1.0" };

describe("the not-found report's shape", () => {
  it("accepts a shop, an ingredient kind, a product, a recipe and the app version", () => {
    expect(notFoundSchema.safeParse(good).success).toBe(true);
    expect(notFoundSchema.safeParse({ shop: "marks-and-spencer", kind: "oats", productId: "SP-12_3.x%2F" }).success).toBe(true);
  });
  it("refuses anything else: other fields (an email, a name, a location, a note), bad ids and paths", () => {
    for (const extra of [{ email: "a@b.co" }, { name: "Sam" }, { lat: 51.5 }, { note: "hello" }, { userId: "u1" }]) {
      expect(notFoundSchema.safeParse({ ...good, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    for (const bad of [{ shop: "Tesco" }, { shop: "t" }, { shop: "tesco1" }, { kind: "Chicken Breast" }, { productId: "../etc" }, { productId: "a..b" }, { productId: "" }, { productId: "x".repeat(121) }, { recipeId: "Not A Slug" }]) {
      expect(notFoundSchema.safeParse({ ...good, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("handleNotFound", () => {
  it("stores the five facts and the IP hash used for rate limiting, nothing else", async () => {
    const store = new MemoryStore();
    const r = await handleNotFound(good, { store, ipHash: "hash-a" });
    expect(r.status).toBe(201);
    const row = { ...store.rows.not_found_reports[0]! } as Record<string, unknown>;
    delete row.created_at;
    expect(row).toEqual({ shop: "tesco", ingredient_kind: "chicken-breast", product_id: "254656543", recipe_id: "chicken-fajita-bowls", app_version: "web 1.0", ip_hash: "hash-a" });
  });
  it("a recipe written by Pip has no recipe id; the app version is optional", async () => {
    const store = new MemoryStore();
    expect((await handleNotFound({ shop: "asda", kind: "rice", productId: "123" }, { store, ipHash: null })).status).toBe(201);
    expect(store.rows.not_found_reports[0]).toMatchObject({ recipe_id: null, app_version: null, ip_hash: null });
  });
  it("a bad body is a 400 and writes nothing", async () => {
    const store = new MemoryStore();
    const r = await handleNotFound({ ...good, email: "a@b.co" }, { store, ipHash: "h" });
    expect(r.status).toBe(400);
    expect(store.rows.not_found_reports).toHaveLength(0);
  });
  it("one caller can send at most the hourly limit, then 429", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < RATE_LIMITS.not_found_reports; i++) expect((await handleNotFound(good, { store, ipHash: "h" })).status).toBe(201);
    expect((await handleNotFound(good, { store, ipHash: "h" })).status).toBe(429);
    expect((await handleNotFound(good, { store, ipHash: "other" })).status).toBe(201);
  });
});

describe("POST /api/v1/not-found", () => {
  const post = (body: unknown, origin?: string) => new Request("https://numbite.com/api/v1/not-found", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(origin ? { origin } : {}) } });
  it("answers 404 and writes nothing while the switch is off", async () => {
    const store = new MemoryStore();
    const res = await notFoundPost(post(good), { enabled: false, store, ipHash: () => "h" });
    expect(res.status).toBe(404);
    expect(store.rows.not_found_reports).toHaveLength(0);
  });
  it("with the switch on: 201 for a good report, 400 for a bad one, and the iPhone app's origin is allowed", async () => {
    const store = new MemoryStore();
    const ok = await notFoundPost(post(good, "app://menumath"), { enabled: true, store, ipHash: () => "h" });
    expect(ok.status).toBe(201);
    expect(ok.headers.get("access-control-allow-origin")).toBe("app://menumath");
    expect((await notFoundPost(post({ shop: "nope!" }), { enabled: true, store, ipHash: () => "h" })).status).toBe(400);
    expect(store.rows.not_found_reports).toHaveLength(1);
  });
});

describe("the daily clean-up and the not-found table", () => {
  const run = (store: MemoryStore, notFoundReports?: boolean) => handleCleanup("Bearer s", "s", { store, ipHash: null, now: new Date("2026-12-31T00:00:00Z"), ...(notFoundReports ? { notFoundReports } : {}) });
  it("leaves it alone (and answers exactly as before) when not asked", async () => {
    const store = new MemoryStore();
    store.rows.not_found_reports.push({ ip_hash: "h", created_at: "2026-11-01T00:00:00Z" });
    expect((await run(store)).body).toEqual({ ok: true, cleared: { waitlist: 0, number_reports: 0, chain_requests: 0, support_messages: 0 } });
    expect(store.rows.not_found_reports[0]!.ip_hash).toBe("h");
  });
  it("forgets IP hashes older than 30 days when asked", async () => {
    const store = new MemoryStore();
    store.rows.not_found_reports.push({ ip_hash: "old", created_at: "2026-11-01T00:00:00Z" }, { ip_hash: "new", created_at: "2026-12-30T00:00:00Z" });
    const r = await run(store, true);
    expect(r.body.notFoundCleared).toBe(1);
    expect(store.rows.not_found_reports.map((x) => x.ip_hash)).toEqual([null, "new"]);
  });
  it("a missing table (migration not applied yet) is null, and the rest still runs", async () => {
    const store = new MemoryStore();
    store.missing.add("not_found_reports");
    const r = await run(store, true);
    expect(r.status).toBe(200);
    expect(r.body.notFoundCleared).toBeNull();
  });
});

describe("the outbox's not-found item", () => {
  it("carries exactly the five facts", () => {
    expect(notFoundPayload({ shop: "tesco", kind: "oats", productId: "1", recipeId: "porridge" })).toEqual({ shop: "tesco", kind: "oats", productId: "1", recipeId: "porridge", appVersion: "web 1.0" });
    expect(notFoundPayload({ shop: "tesco", kind: "oats", productId: "1" })).toEqual({ shop: "tesco", kind: "oats", productId: "1", appVersion: "web 1.0" });
    expect(notFoundSchema.safeParse(notFoundPayload({ shop: "tesco", kind: "oats", productId: "1", recipeId: "porridge" })).success).toBe(true);
  });
  it("is kept when read back, and 'Email instead' says what it was", () => {
    const item: OutboxItem = { id: "a", createdAt: "2026-11-17T00:00:00Z", kind: "notFound", payload: { shop: "tesco", kind: "oats", productId: "1" }, hasPhoto: false, status: "failed", attempts: 5 };
    expect(sanitizeOutbox([item])).toHaveLength(1);
    const link = decodeURIComponent(mailtoFor(item, "help@example.org"));
    expect(link).toContain("subject=Product not found");
    expect(link).toContain("Couldn't find this product: 1 at tesco (oats)");
  });
});
