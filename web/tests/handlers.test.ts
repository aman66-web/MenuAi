import { describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  handleChainRequest,
  handleCleanup,
  handleReport,
  handleSupport,
  handleWaitlist,
  type Ctx,
} from "../lib/handlers";
import type { Store, Table } from "../lib/store";

type Row = Record<string, unknown> & { id: string; created_at: string };

class FakeStore implements Store {
  rows: Record<Table, Row[]> = { waitlist: [], number_reports: [], chain_requests: [], support_messages: [] };
  uploads: string[] = [];
  private seq = 0;
  constructor(private now: () => Date) {}

  async countRecent(table: Table, ipHash: string, sinceIso: string) {
    return this.rows[table].filter((r) => r.ip_hash === ipHash && r.created_at >= sinceIso).length;
  }
  async insert(table: Table, row: Record<string, unknown>) {
    const id = `id-${++this.seq}`;
    this.rows[table].push({ ...row, id, created_at: this.now().toISOString() });
    return { id };
  }
  async insertWaitlist(row: { email: string; source: string | null; ip_hash: string | null }) {
    if (!this.rows.waitlist.some((r) => r.email === row.email)) await this.insert("waitlist", row);
  }
  async setReportPhotoPath(reportId: string, path: string) {
    const r = this.rows.number_reports.find((x) => x.id === reportId);
    if (r) r.photo_path = path;
  }
  async createPhotoUploadUrl(path: string) {
    this.uploads.push(path);
    return { signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/report-photos/${path}?token=t` };
  }
  async clearIpHashes(table: Table, beforeIso: string) {
    let n = 0;
    for (const r of this.rows[table]) if (r.created_at < beforeIso && r.ip_hash) { r.ip_hash = null; n++; }
    return n;
  }
}

const NOW = new Date("2026-12-01T12:00:00Z");
function setup(ipHash: string | null = "hash-a") {
  const store = new FakeStore(() => NOW);
  const ctx: Ctx = { store, ipHash, now: NOW };
  return { store, ctx };
}
const validReport = { chainId: "bowl-and-co", itemId: "chicken-bowl", field: "calories", shownValue: 655, reportedValue: 640 };

describe("waitlist", () => {
  it("stores a lower-cased email and answers the same for duplicates", async () => {
    const { store, ctx } = setup();
    expect((await handleWaitlist({ email: "  Fan@Example.COM ", source: "tiktok" }, ctx)).status).toBe(200);
    expect((await handleWaitlist({ email: "fan@example.com" }, ctx)).status).toBe(200);
    expect(store.rows.waitlist).toHaveLength(1);
    expect(store.rows.waitlist[0]).toMatchObject({ email: "fan@example.com", source: "tiktok", ip_hash: "hash-a" });
  });
  it("rejects a bad email and ignores bots that fill the honeypot", async () => {
    const { store, ctx } = setup();
    expect((await handleWaitlist({ email: "nope" }, ctx)).status).toBe(400);
    expect((await handleWaitlist({ email: "bot@example.com", website: "http://spam" }, ctx)).status).toBe(200);
    expect(store.rows.waitlist).toHaveLength(0);
  });
  it("rate-limits per caller", async () => {
    const { ctx } = setup();
    for (let i = 0; i < RATE_LIMITS.waitlist; i++) await handleWaitlist({ email: `p${i}@example.com` }, ctx);
    expect((await handleWaitlist({ email: "one-more@example.com" }, ctx)).status).toBe(429);
    const other = { ...ctx, ipHash: "hash-b" };
    expect((await handleWaitlist({ email: "someone@example.com" }, other)).status).toBe(200);
  });
});

describe("reports", () => {
  it("stores a valid report", async () => {
    const { store, ctx } = setup();
    const res = await handleReport({ ...validReport, note: "Board says 640", appVersion: "1.0 (12)", dataVersion: 20261201100000 }, ctx);
    expect(res.status).toBe(201);
    expect(res.body.photoUpload).toBeUndefined();
    expect(store.rows.number_reports[0]).toMatchObject({ chain_id: "bowl-and-co", field: "calories", reported_value: 640, note: "Board says 640" });
  });
  it("returns a signed upload URL when a photo is coming", async () => {
    const { store, ctx } = setup();
    const res = await handleReport({ ...validReport, photoContentType: "image/jpeg" }, ctx);
    expect(res.status).toBe(201);
    const upload = res.body.photoUpload as { url: string; method: string; headers: Record<string, string> };
    expect(upload.method).toBe("PUT");
    expect(upload.headers["Content-Type"]).toBe("image/jpeg");
    expect(store.uploads[0]).toBe(`2026-12/${res.body.id}.jpg`);
    expect(store.rows.number_reports[0].photo_path).toBe(store.uploads[0]);
  });
  it("rejects bad ids, fields and values", async () => {
    const { ctx } = setup();
    expect((await handleReport({ ...validReport, chainId: "Bowl & Co" }, ctx)).status).toBe(400);
    expect((await handleReport({ ...validReport, field: "vibes" }, ctx)).status).toBe(400);
    expect((await handleReport({ ...validReport, reportedValue: -5 }, ctx)).status).toBe(400);
    expect((await handleReport({ ...validReport, photoContentType: "image/gif" }, ctx)).status).toBe(400);
    expect((await handleReport(undefined, ctx)).status).toBe(400);
  });
});

describe("chain requests and support", () => {
  it("stores a chain request", async () => {
    const { store, ctx } = setup();
    expect((await handleChainRequest({ name: " Raising Cane's " }, ctx)).status).toBe(201);
    expect(store.rows.chain_requests[0].name).toBe("Raising Cane's");
    expect((await handleChainRequest({ name: "x" }, ctx)).status).toBe(400);
  });
  it("stores a support message with or without an email", async () => {
    const { store, ctx } = setup();
    expect((await handleSupport({ message: "Love it, add Cava please", email: "" }, ctx)).status).toBe(201);
    expect((await handleSupport({ message: "Billing question", email: "A@B.co", source: "app" }, ctx)).status).toBe(201);
    expect(store.rows.support_messages.map((r) => r.email)).toEqual([null, "a@b.co"]);
    expect((await handleSupport({ message: "hi" }, ctx)).status).toBe(400);
  });
  it("works without an IP (no rate limit, nothing stored about the caller)", async () => {
    const { store, ctx } = setup(null);
    expect((await handleChainRequest({ name: "Cava" }, ctx)).status).toBe(201);
    expect(store.rows.chain_requests[0].ip_hash).toBeNull();
  });
});

describe("cleanup cron", () => {
  it("requires the cron secret and clears old IP hashes only", async () => {
    const { store, ctx } = setup();
    await handleChainRequest({ name: "Cava" }, ctx);
    store.rows.chain_requests[0].created_at = "2026-10-01T00:00:00Z"; // older than 30 days
    await handleChainRequest({ name: "Qdoba" }, ctx);
    expect((await handleCleanup(null, "secret-secret-123", ctx)).status).toBe(401);
    expect((await handleCleanup("Bearer secret-secret-123", undefined, ctx)).status).toBe(401);
    const res = await handleCleanup("Bearer secret-secret-123", "secret-secret-123", ctx);
    expect(res.status).toBe(200);
    expect(store.rows.chain_requests.map((r) => r.ip_hash)).toEqual([null, "hash-a"]);
  });
});
