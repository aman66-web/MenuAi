import { describe, expect, it, vi } from "vitest";
import { handleCleanup, type Ctx } from "../lib/handlers";
import { reportAlertText, sendReportAlert } from "../lib/reportAlert";
import { memoryCommunityStore } from "./helpers/communityMemory";

// The daily clean-up's Community part (lib/handlers.ts handleCleanup) and the optional report alert (lib/reportAlert.ts).

const NOW = Date.UTC(2026, 9, 16, 4, 17, 0);
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const SECRET = "secret-secret-123";
const run = (ctx: Ctx) => handleCleanup(`Bearer ${SECRET}`, SECRET, ctx);
const base = (community: Ctx["community"]): Ctx => ({ store: { clearIpHashes: async () => 3 } as never, ipHash: null, now: new Date(NOW), community });

describe("the daily clean-up of Community", () => {
  it("deletes what has run out and reports what is open", async () => {
    const mem = memoryCommunityStore({ clock: () => NOW });
    const a = "10000000-0000-4000-8000-000000000001";
    const b = "10000000-0000-4000-8000-000000000002";
    mem.seedProfile(a, "alice", "AAAAAAAA");
    mem.seedProfile(b, "bob", "BBBBBBBB");
    // tallies: one 3 days old (goes), one from this morning (stays)
    await mem.store.addAttempt(a, "code", null, iso(NOW - 3 * DAY));
    await mem.store.addAttempt(a, "code", null, iso(NOW - 1000));
    // a request declined 31 days ago (goes) and one declined yesterday (stays)
    const old = await mem.store.createFriendship(a, b, iso(NOW - 40 * DAY));
    await mem.store.declineFriendship(old!.id, iso(NOW - 31 * DAY));
    // reports: closed and over a year old (goes), closed and recent (stays), open and over a year old (stays: nothing deletes an open report)
    const report = (reportedUsername: string) => ({ reporter: a, reported: b, reporterUsername: "alice", reportedUsername, reason: "spam" as const, note: null, listPayload: reportedUsername, listText: null });
    await mem.store.addReport(report("closed.old"), iso(NOW - 400 * DAY));
    await mem.store.addReport(report("closed.new"), iso(NOW - 10 * DAY));
    await mem.store.addReport(report("open.old"), iso(NOW - 500 * DAY));
    mem.closeReport(mem.reports[0]!.id, "dismissed");
    mem.closeReport(mem.reports[1]!.id, "actioned");

    const res = await run(base(mem.store));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, cleared: expect.anything(), expiredLists: 0, oldTallies: 1, oldDeclined: 1, oldReports: 1, openReports: 1 });
    expect(mem.attempts).toHaveLength(1);
    expect(mem.friendships).toEqual([]);
    expect(mem.reports.map((r) => r.reportedUsername)).toEqual(["closed.new", "open.old"]);
  });

  it("if Community's tables aren't there yet (the migration is applied by hand), the cron still succeeds and says null for each step", async () => {
    const broken = new Error('relation "public.community_lists" does not exist');
    const fail = async () => {
      throw broken;
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await run(base({ deleteExpiredLists: fail, deleteOldAttempts: fail, deleteOldDeclined: fail, deleteOldReports: fail, countOpenReports: fail }));
    error.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, cleared: { waitlist: 3 }, expiredLists: null, oldTallies: null, oldDeclined: null, oldReports: null, openReports: null });
  });

  it("one failing step doesn't stop the others", async () => {
    const mem = memoryCommunityStore({ clock: () => NOW });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await run(base({ ...mem.store, deleteOldAttempts: async () => Promise.reject(new Error("boom")) }));
    error.mockRestore();
    expect(res.body).toMatchObject({ expiredLists: 0, oldTallies: null, oldDeclined: 0, oldReports: 0, openReports: 0 });
  });

  it("still needs the cron secret, and leaves Community alone when it isn't attached", async () => {
    const mem = memoryCommunityStore({ clock: () => NOW });
    expect((await handleCleanup("Bearer nope", SECRET, base(mem.store))).status).toBe(401);
    expect((await run({ store: { clearIpHashes: async () => 0 } as never, ipHash: null })).body).toEqual({ ok: true, cleared: expect.anything() });
  });
});

describe("the open-report alert email", () => {
  const config = { apiKey: "re_test_key_123", to: "founder@example.test", from: "Numbite <alerts@example.test>" };

  it("says only how many are open and where to look: no names, no words from a report", () => {
    expect(reportAlertText(1).subject).toBe("Numbite: 1 Community report is waiting");
    expect(reportAlertText(4).subject).toBe("Numbite: 4 Community reports are waiting");
    expect(reportAlertText(4).text).toContain("open_community_reports");
    expect(reportAlertText(4).text).toContain("24 hours");
    expect(reportAlertText(4).text).not.toMatch(/username|alice|bob/i);
  });

  it("is sent through Resend's HTTP API with the key, to the configured address", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendReportAlert(2, config, fake)).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key_123");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ from: config.from, to: [config.to], subject: expect.stringContaining("2 Community reports") });
  });

  it("sends nothing unless all three settings are there and look right", async () => {
    const fake = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    for (const c of [{}, { ...config, apiKey: "" }, { ...config, to: undefined }, { ...config, from: "" }, { ...config, to: "not an address" }, { ...config, from: "nonsense" }]) {
      expect(await sendReportAlert(1, c, fake)).toBe("not_configured");
    }
    expect(fake).not.toHaveBeenCalled();
  });

  it("a refusal or a failure to connect is reported, never thrown (the cron must still succeed)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendReportAlert(1, config, (async () => new Response("no", { status: 403 })) as unknown as typeof fetch)).toBe("failed");
    expect(await sendReportAlert(1, config, (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBe("failed");
    error.mockRestore();
  });
});
