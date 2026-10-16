"use client";

import { remindersStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { Button } from "./ui";
import { openNotificationSettings, useReminderStatus } from "../_lib/reminderSync";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// The calm line about whether reminders can ring (Home's Reminders section and /app/reminders). Reminders ring only in the iPhone app, through the phone's
// own notifications: on the website there is nothing to ring, so it says so once, honestly; in the app, if the person said no to notifications, it says
// how to turn them on; and if the phone has no room for some reminders (it keeps only so many), it says to delete or pause some (the rows that won't
// ring are marked "Won't ring"; the notice never tells anyone to change the days of a reminder, which may be their medication). The wrapper is always
// there and always in the page's structure (no display:none while empty), so a screen reader hears the line when it appears (for example after the
// system question is answered).

export function ReminderNotice() {
  const t = useT();
  const { permission, droppedIds } = useReminderStatus();
  const list = useStore(remindersStore);
  const anyOn = list.some((r) => r.enabled);

  return (
    <div role="status">
      {permission === "unavailable" && (
        <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Reminders ring in the {app} iPhone app. On the website you'll see what's due today here.", { app: site.name })}</p>
      )}
      {permission === "denied" && anyOn && (
        <div className="glass mt-3 rounded-[1.25rem] p-4">
          <p className="text-base leading-snug">{t("Notifications are off for {app}, so reminders won't ring. Turn them on in your iPhone's Settings.", { app: site.name })}</p>
          <Button variant="secondary" className="mt-3" onClick={openNotificationSettings}>{t("Open Settings")}</Button>
        </div>
      )}
      {permission !== "unavailable" && droppedIds.length > 0 && (
        <p className="mt-3 text-[0.9375rem] font-semibold leading-snug">{t("Some reminders won't ring: the phone can keep only so many notifications. Delete or pause the ones you don't need.")}</p>
      )}
    </div>
  );
}
