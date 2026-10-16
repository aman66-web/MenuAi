import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanNativeResult, native } from "../lib/mm/native";
import type { PlanItem } from "../lib/mm/reminders";

// The reminders' side of the bridge to the iPhone app (docs/APP_BUILD.md "Reminders (local notifications)"): the four calls, what the phone is sent,
// how its answers are read, and that the website (no bridge) is unaffected.
type Posted = { id: string; action: string; payload: Record<string, unknown> };

function installBridge(answer: (m: Posted) => unknown | undefined): { posted: Posted[]; win: Record<string, unknown> } {
  const posted: Posted[] = [];
  const win: Record<string, unknown> = {};
  win.webkit = {
    messageHandlers: {
      menumath: {
        postMessage: (m: Posted) => {
          posted.push(m);
          const reply = answer(m);
          if (reply !== undefined) queueMicrotask(() => (win.__menumathReply as (id: string, r: unknown) => void)(m.id, reply));
        },
      },
    },
  };
  vi.stubGlobal("window", win);
  return { posted, win };
}

const daily: PlanItem = { id: "r1", title: "Morning reminder", body: "Tap to open Numbite", hour: 8, minute: 0 };
const weekly: PlanItem = { id: "r2", title: "Weekly reminder", body: "A note", hour: 20, minute: 30, weekdays: [2, 5] };
const everyFew: PlanItem = { id: "r3", title: "Every third day", body: "Tap to open Numbite", hour: 9, minute: 5, fireAt: ["2026-10-20T09:05", "2026-10-23T09:05"] };

describe("native reminders bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("understands the permission answers and nothing else", () => {
    expect(cleanNativeResult({ permission: "granted" })).toEqual({ permission: "granted" });
    expect(cleanNativeResult({ permission: "denied" })).toEqual({ permission: "denied" });
    expect(cleanNativeResult({ permission: "notDetermined" })).toEqual({ permission: "notDetermined" });
    expect(cleanNativeResult({ permission: "maybe" })).toEqual({ error: "unavailable" });
    expect(cleanNativeResult({ permission: 1 })).toEqual({ error: "unavailable" });
  });

  it("on the website there is no bridge: nothing is asked, sent or opened", async () => {
    vi.stubGlobal("window", {});
    await expect(native.requestNotificationPermission()).resolves.toBe("unavailable");
    await expect(native.notificationStatus()).resolves.toBe("unavailable");
    await expect(native.syncReminders([daily])).resolves.toBeUndefined();
    await expect(native.openNotificationSettings()).resolves.toBeUndefined();
  });

  it("asks the phone for permission and reads granted, denied and not-asked-yet", async () => {
    let answer: unknown = { permission: "granted" };
    const { posted } = installBridge(() => answer);
    await expect(native.requestNotificationPermission()).resolves.toBe("granted");
    expect(posted[0]).toMatchObject({ action: "notifications.requestPermission", payload: {} });
    answer = { permission: "denied" };
    await expect(native.requestNotificationPermission()).resolves.toBe("denied");
    answer = { permission: "notDetermined" };
    await expect(native.notificationStatus()).resolves.toBe("unavailable");
    expect(posted[2]).toMatchObject({ action: "notifications.status" });
    answer = { error: "unavailable" };
    await expect(native.notificationStatus()).resolves.toBe("unavailable");
    answer = { error: "denied" };
    await expect(native.notificationStatus()).resolves.toBe("denied");
  });

  it("a plain test bridge that answers { done: true } counts as granted", async () => {
    installBridge(() => ({ done: true }));
    await expect(native.requestNotificationPermission()).resolves.toBe("granted");
    await expect(native.notificationStatus()).resolves.toBe("granted");
  });

  it("sends the whole plan as { items } and an empty plan cancels everything", async () => {
    const { posted } = installBridge(() => ({ done: true }));
    await native.syncReminders([daily, weekly, everyFew]);
    expect(posted[0]!.action).toBe("notifications.syncReminders");
    expect(posted[0]!.payload).toEqual({ items: [daily, weekly, everyFew] });
    await native.syncReminders([]);
    expect(posted[1]!.payload).toEqual({ items: [] });
  });

  it("copies the plan, so nothing but plain data reaches the phone", async () => {
    const { posted } = installBridge(() => ({ done: true }));
    const item = { ...daily, weekdays: undefined } as PlanItem;
    await native.syncReminders([item]);
    const sent = (posted[0]!.payload.items as Array<Record<string, unknown>>)[0]!;
    expect("weekdays" in sent).toBe(false);
    expect(sent).toEqual(daily);
  });

  it("opens the iPhone's notification settings", async () => {
    const { posted } = installBridge(() => ({ done: true }));
    await native.openNotificationSettings();
    expect(posted[0]).toMatchObject({ action: "notifications.openSettings", payload: {} });
  });

  it("a phone that never answers gives up: the permission is unknown, the sync resolves", async () => {
    installBridge(() => undefined);
    vi.useFakeTimers();
    const status = native.notificationStatus();
    const sync = native.syncReminders([daily]);
    const settings = native.openNotificationSettings();
    await vi.advanceTimersByTimeAsync(9_000);
    await expect(status).resolves.toBe("unavailable");
    await expect(sync).resolves.toBeUndefined();
    await expect(settings).resolves.toBeUndefined();
    const asking = native.requestNotificationPermission();
    await vi.advanceTimersByTimeAsync(121_000);
    await expect(asking).resolves.toBe("unavailable");
  });
});
