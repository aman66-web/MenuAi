"use client";

import { useEffect, useSyncExternalStore } from "react";
import { hasNative, native } from "@/lib/mm/native";
import { DEFAULT_BODY_KEY, PLAN_CAP, planNotifications } from "@/lib/mm/reminders";
import { dropFutureTicks, remindersStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { useT } from "./i18n";

// The web half of Home's reminders ringing (docs/APP_BUILD.md "Reminders (local notifications)"). Inside the iPhone app the web side works out a plan
// (lib/mm/reminders.ts planNotifications: what to ring, when) and hands the WHOLE plan to the phone, which removes what it scheduled before and
// schedules exactly this. It is sent whenever the reminders change, when the app starts and when it comes back to the front (so the dates of an
// "every few days" reminder keep rolling forward). The phone's permission to show notifications is asked only when the person saves their first
// reminder (askForNotifications, called by the editor), never at launch; here it is only READ, and only while a reminder is switched on.
// On the website there is no bridge: nothing is sent, and the screens say that reminders ring in the iPhone app.

/** What Home and /app/reminders need to say about the phone: "unknown" until it is known (and always inside the app until a reminder is switched on). */
export type NotificationState = "unknown" | "granted" | "denied" | "unavailable";

export interface ReminderStatus {
  permission: NotificationState;
  /** Reminders the phone has no room to ring at all (the plan's cap): they get no notification. */
  droppedIds: readonly string[];
}

const UNKNOWN: ReminderStatus = { permission: "unknown", droppedIds: [] };
let status: ReminderStatus = UNKNOWN;
const listeners = new Set<() => void>();

function setStatus(patch: Partial<ReminderStatus>): void {
  const next: ReminderStatus = { ...status, ...patch };
  const same = next.permission === status.permission && next.droppedIds.length === status.droppedIds.length && next.droppedIds.every((id, i) => id === status.droppedIds[i]);
  if (same) return;
  status = next;
  for (const l of [...listeners]) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The phone's notification state and any reminders it can't ring, for the notice on Home and on /app/reminders. */
export function useReminderStatus(): ReminderStatus {
  return useSyncExternalStore(subscribe, () => status, () => UNKNOWN);
}

type Answer = Awaited<ReturnType<typeof native.requestNotificationPermission>>;
/** "unavailable" from a phone that has the bridge is a failure to ask, not "this is the website": say nothing rather than the wrong thing. */
const stateOf = (answer: Answer): NotificationState => (answer === "granted" ? "granted" : answer === "denied" ? "denied" : "unknown");

let asking = false;

/** Read (never ask) whether the phone lets Numbite show notifications; only worth knowing while a reminder is switched on. */
export async function refreshNotificationStatus(): Promise<void> {
  if (!hasNative()) {
    setStatus({ permission: "unavailable" });
    return;
  }
  if (asking || !remindersStore.get().some((r) => r.enabled)) return;
  const answer = await native.notificationStatus();
  if (!asking) setStatus({ permission: stateOf(answer) });
}

/**
 * Ask the phone for permission to show notifications (its own system prompt, shown once by iOS; afterwards it just answers). Called when the person saves
 * their first switched-on reminder, never at launch.
 */
export async function askForNotifications(): Promise<void> {
  if (!hasNative()) {
    setStatus({ permission: "unavailable" });
    return;
  }
  if (status.permission === "granted") return; // already allowed: nothing to ask
  asking = true;
  try {
    setStatus({ permission: stateOf(await native.requestNotificationPermission()) });
  } finally {
    asking = false;
  }
}

/** Open the iPhone's Settings page for Numbite's notifications ("Open Settings" on the notice). */
export function openNotificationSettings(): void {
  void native.openNotificationSettings();
}

let lastPlan = "";
let lastSentAt = 0;

/**
 * Work out the plan for now and hand it to the phone (replace-all). A change to the reminders sends it only if the plan is different (ticking "done"
 * changes nothing the phone rings); starting and coming back to the front always send it (the dates move on), unless it went a moment ago.
 */
function sendPlan(body: string, always: boolean): void {
  const list = remindersStore.get();
  const plan = planNotifications(list, new Date(), PLAN_CAP, body);
  setStatus({ droppedIds: plan.droppedIds });
  if (!hasNative()) {
    setStatus({ permission: "unavailable" });
    return;
  }
  const json = JSON.stringify(plan.items);
  const now = Date.now();
  if (json === lastPlan && (!always || now - lastSentAt < 2000)) return;
  lastPlan = json;
  lastSentAt = now;
  void native.syncReminders(plan.items);
}

/**
 * Mounted once in the app shell. Sends the plan when the app starts, whenever the reminders (or the language, which words the neutral line) change and
 * when the app comes back to the front; and reads the phone's permission at those moments while a reminder is switched on.
 */
export function useReminderSync(): void {
  const t = useT();
  const body = t(DEFAULT_BODY_KEY, { app: site.name });

  useEffect(() => {
    const everything = () => {
      dropFutureTicks(); // a tick dated after today (the phone's date went back) must not turn up "Done" on the day it arrives
      sendPlan(body, true);
      void refreshNotificationStatus();
    };
    everything();
    const unsubscribe = remindersStore.subscribe(() => sendPlan(body, false));
    const back = () => {
      if (document.visibilityState === "visible") everything();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [body]);
}
