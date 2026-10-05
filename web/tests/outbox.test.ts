import { describe, expect, it } from "vitest";
import {
  chainRequestPayload, mailtoFor, OUTBOX_MAX_ATTEMPTS, OUTBOX_RETRY_MS, OutboxSender, reportPayload, supportPayload,
  type OutboxItem, type PhotoStore,
} from "../lib/mm/outbox";
import { createStore } from "../lib/mm/persist";
import { sanitizeOutbox } from "../lib/mm/outbox";
import { chainRequestSchema, reportSchema, supportSchema } from "../lib/validation";

class FakePhotos implements PhotoStore {
  blobs = new Map<string, Blob>();
  async put(id: string, blob: Blob) { this.blobs.set(id, blob); }
  async get(id: string) { return this.blobs.get(id) ?? null; }
  async delete(id: string) { this.blobs.delete(id); }
}

type Call = { url: string; init: RequestInit };
function setup(responder: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let clock = Date.UTC(2026, 9, 5, 12, 0, 0);
  const store = createStore<OutboxItem[]>("outbox", [], { sanitize: sanitizeOutbox, storage: null });
  const photos = new FakePhotos();
  let n = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return responder(call, n++);
  }) as unknown as typeof fetch;
  const sender = new OutboxSender({ store, fetch: fetchFn, now: () => clock, photos, baseUrl: "/api/v1/", newId: () => `id${store.get().length + 1}` });
  return { sender, store, calls, photos, advance: (ms: number) => (clock += ms) };
}
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const settle = () => new Promise((r) => setTimeout(r, 0));
const status = (s: ReturnType<typeof setup>, i = 0) => s.store.get()[i]!.status;

describe("outbox sending (SPEC §12)", () => {
  it("201 → sent, with the server id", async () => {
    const s = setup(() => json(201, { id: "abc" }));
    await s.sender.enqueue("chainRequest", chainRequestPayload("Raising Cane's"));
    await settle();
    expect(status(s)).toBe("sent");
    expect(s.store.get()[0]!.serverId).toBe("abc");
    expect(s.calls[0]!.url).toBe("/api/v1/chain-requests");
    expect(s.calls[0]!.init.method).toBe("POST");
  });
  it("saves locally first: the item exists before the network answers", async () => {
    let release!: () => void;
    const s = setup(() => new Promise((r) => (release = () => r(json(201)))));
    await s.sender.enqueue("support", supportPayload("hello there", "a@b.co"));
    expect(s.store.get()).toHaveLength(1);
    expect(status(s)).toBe("pending");
    release();
    await settle();
    expect(status(s)).toBe("sent");
  });
  it("offline → stays pending, then is sent on retry (not before 10 minutes)", async () => {
    let online = false;
    const s = setup(() => { if (!online) throw new TypeError("offline"); return json(201); });
    await s.sender.enqueue("support", supportPayload("hello there"));
    await settle();
    expect(status(s)).toBe("pending");
    expect(s.store.get()[0]!.attempts).toBe(1);
    online = true;
    await s.sender.flush();
    expect(s.calls).toHaveLength(1); // too soon
    s.advance(OUTBOX_RETRY_MS);
    await s.sender.flush();
    expect(status(s)).toBe("sent");
  });
  it.each([429, 500, 503])("%i → kept pending and retried", async (code) => {
    let fail = true;
    const s = setup(() => (fail ? json(code, { error: "x" }) : json(201)));
    await s.sender.enqueue("chainRequest", chainRequestPayload("Some Chain"));
    await settle();
    expect(status(s)).toBe("pending");
    fail = false;
    s.advance(OUTBOX_RETRY_MS);
    await s.sender.flush();
    expect(status(s)).toBe("sent");
  });
  it.each([400, 413])("%i → failed straight away, never retried", async (code) => {
    const s = setup(() => json(code, { error: "invalid_request" }));
    await s.sender.enqueue("chainRequest", chainRequestPayload("Some Chain"));
    await settle();
    expect(status(s)).toBe("failed");
    s.advance(OUTBOX_RETRY_MS * 3);
    await s.sender.flush({ force: true });
    expect(s.calls).toHaveLength(1);
  });
  it("five failed attempts → failed", async () => {
    const s = setup(() => json(500));
    await s.sender.enqueue("support", supportPayload("hello there"));
    await settle();
    for (let i = 1; i < OUTBOX_MAX_ATTEMPTS; i++) {
      s.advance(OUTBOX_RETRY_MS);
      await s.sender.flush();
    }
    expect(s.calls).toHaveLength(OUTBOX_MAX_ATTEMPTS);
    expect(status(s)).toBe("failed");
    s.advance(OUTBOX_RETRY_MS);
    await s.sender.flush({ force: true });
    expect(s.calls).toHaveLength(OUTBOX_MAX_ATTEMPTS);
  });
  it("after the network comes back, an item that never reached the server is retried at once (no 10-minute wait)", async () => {
    let online = false;
    const s = setup(() => { if (!online) throw new TypeError("offline"); return json(201); });
    await s.sender.enqueue("support", supportPayload("hello there"));
    await settle();
    expect(s.store.get()[0]!.failureReason).toBe("network");
    online = true;
    await s.sender.flush(); // app became active: still within the 10-minute window
    expect(s.calls).toHaveLength(1);
    await s.sender.flush({ afterReconnect: true });
    expect(status(s)).toBe("sent");
  });
  it("reconnecting does not hammer the server: a 429/5xx item still waits out the 10 minutes", async () => {
    const s = setup(() => json(503));
    await s.sender.enqueue("support", supportPayload("hello there"));
    await settle();
    expect(s.store.get()[0]!.failureReason).toBe("http_503");
    await s.sender.flush({ afterReconnect: true });
    expect(s.calls).toHaveLength(1);
  });
  it("never sends the same item twice at once", async () => {
    let release!: () => void;
    const s = setup(() => new Promise((r) => (release = () => r(json(201)))));
    await s.sender.enqueue("support", supportPayload("hello there"));
    void s.sender.attempt("id1");
    void s.sender.attempt("id1");
    release();
    await settle();
    expect(s.calls).toHaveLength(1);
  });
  it("report with photo → PUT to the returned URL with the returned Content-Type, and the report is never re-sent", async () => {
    const upload = { url: "https://example.supabase.co/storage/v1/object/upload/sign/report-photos/x.jpg?token=t", method: "PUT", headers: { "Content-Type": "image/jpeg" } };
    const s = setup((call) => (call.url.startsWith("/api") ? json(201, { id: "r1", photoUpload: upload }) : json(500)));
    const photo = new Blob(["jpegbytes"], { type: "image/jpeg" });
    await s.sender.enqueue("report", reportPayload({ chainId: "bowl-and-co", itemId: "chicken-bowl", field: "calories", hasPhoto: true }), photo);
    await settle();
    expect(status(s)).toBe("sent"); // a failing photo upload (500 here) doesn't un-send the report
    expect(s.calls.map((c) => c.url)).toEqual(["/api/v1/reports", upload.url]);
    expect(s.calls[1]!.init.method).toBe("PUT");
    expect(s.calls[1]!.init.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(s.calls[1]!.init.body).toBe(photo);
    expect(s.photos.blobs.size).toBe(0);
    s.advance(OUTBOX_RETRY_MS);
    await s.sender.flush({ force: true });
    expect(s.calls).toHaveLength(2);
  });
  it("remove deletes the item and its photo", async () => {
    const s = setup(() => json(500));
    await s.sender.enqueue("report", reportPayload({ chainId: "a", itemId: "b", field: "fat", hasPhoto: true }), new Blob(["x"]));
    await settle();
    s.sender.remove("id1");
    expect(s.store.get()).toHaveLength(0);
    expect(s.photos.blobs.size).toBe(0);
  });
});

describe("request bodies match docs/BACKEND.md and pass the server's own validation", () => {
  it("report", () => {
    const body = reportPayload({ chainId: "bowl-and-co", itemId: "chicken-bowl", itemName: "Chicken bowl", field: "calories", shownValue: 655, reportedValue: 640, note: "  Board says 640 ", dataVersion: 20261201100000, hasPhoto: true });
    expect(body).toEqual({
      chainId: "bowl-and-co", itemId: "chicken-bowl", itemName: "Chicken bowl", field: "calories", shownValue: 655, reportedValue: 640,
      note: "Board says 640", dataVersion: 20261201100000, appVersion: "web 1.0", photoContentType: "image/jpeg",
    });
    expect(reportSchema.safeParse(body).success).toBe(true);
    const minimal = reportPayload({ chainId: "a", itemId: "b", field: "other", hasPhoto: false });
    expect(minimal).toEqual({ chainId: "a", itemId: "b", field: "other", appVersion: "web 1.0" });
    expect(reportSchema.safeParse(minimal).success).toBe(true);
  });
  it("chain request", () => {
    const body = chainRequestPayload("  Raising Cane's ");
    expect(body).toEqual({ name: "Raising Cane's", appVersion: "web 1.0" });
    expect(chainRequestSchema.safeParse(body).success).toBe(true);
  });
  it("support, with and without an email", () => {
    expect(supportPayload("  I found a bug  ", "me@example.com")).toEqual({ message: "I found a bug", email: "me@example.com", source: "web", appVersion: "web 1.0" });
    const noEmail = supportPayload("I found a bug", "  ");
    expect("email" in noEmail).toBe(false);
    expect(supportSchema.safeParse(noEmail).success).toBe(true);
    expect(supportSchema.safeParse(supportPayload("I found a bug", "me@example.com")).success).toBe(true);
  });
  it("builds an 'Email instead' link for failed items", () => {
    const item: OutboxItem = { id: "1", createdAt: "2026-10-05T12:00:00Z", kind: "support", payload: supportPayload("Hello there", "me@example.com"), hasPhoto: false, status: "failed", attempts: 5 };
    const link = mailtoFor(item, "support@example.com");
    expect(link.startsWith("mailto:support@example.com?subject=Support&body=")).toBe(true);
    expect(decodeURIComponent(link)).toContain("Hello there");
  });
});
