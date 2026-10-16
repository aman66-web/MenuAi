"use client";

import Link from "next/link";
import { localeInfo } from "@/lib/mm/i18n";
import { formatNextDay, formatTime, isDueToday, MAX_REMINDERS, nextOccurrence, repeatWords, type Reminder } from "@/lib/mm/reminders";
import { remindersStore, setReminderEnabled } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { BellIcon, ChevronLeftIcon } from "../_components/icons";
import { useReminderEditor } from "../_components/ReminderEditor";
import { ReminderNotice } from "../_components/ReminderNotice";
import { Button, EmptyState } from "../_components/ui";
import { backName, useBack } from "../_lib/backNav";
import { useHydrated, useNow, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { askForNotifications, useReminderStatus } from "../_lib/reminderSync";

// Every reminder in one list, with Edit, Pause and Delete (founder 2026-10-16: reminders on Home, for medication or anything else the person wants to be
// reminded of). Reached from "Manage" on Home's Reminders section and from Settings. The reminders are the person's own; Numbite suggests nothing
// (CLAUDE.md rule 3) and they stay on this phone (rule 4).

function BackHome() {
  const t = useT();
  const back = useBack("/app");
  return (
    <Link href={back.href} onClick={back.onClick} aria-label={backName(t("Back"), t("Back to home"), back.cameFromApp)} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong">
      <ChevronLeftIcon className="h-5 w-5" />
      <span>{t("Back")}</span>
    </Link>
  );
}

const pillBase = "mt-2 inline-flex items-center rounded-full px-3 py-1.5 text-[0.875rem] font-semibold leading-none";
const pill = `${pillBase} bg-soft-strong text-muted`;
const pillDark = `${pillBase} bg-foreground text-background`;

function ManageRow({ r, list, now, htmlLang, wontRing, onEdit, onDelete }: { r: Reminder; list: readonly Reminder[]; now: Date; htmlLang: string; wontRing: boolean; onEdit: () => void; onDelete: () => void }) {
  const t = useT();
  const words = repeatWords(r, htmlLang);
  // the next day it is for, when that isn't today (today's are on Home with their tick)
  const next = r.enabled && !isDueToday(r, now) ? nextOccurrence(r, now) : null;
  return (
    <li className="glass rounded-[1.25rem] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-lg font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere] ${r.enabled ? "" : "text-muted"}`}>{r.title}</p>
          <p className="mt-0.5 text-[0.9375rem] leading-snug text-muted">
            {t(words.key, words.values)}<span aria-hidden>{"\u00A0·"}</span>{" "}<span className="app-numbers whitespace-nowrap">{formatTime(r.time, htmlLang)}</span>
          </p>
          {r.note && <p className="mt-1.5 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{r.note}</p>}
          <div className="flex flex-wrap gap-x-2">
            {!r.enabled ? <span className={pill}>{t("Paused")}</span> : next ? <span className={pill}>{t("Next: {date}", { date: formatNextDay(next, htmlLang) })}</span> : null}
            {wontRing && <span className={pillDark}>{t("Won't ring")}</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* A word, not just a pencil: the whole row isn't a button here (Pause and Delete are), so the way to change a reminder is named. */}
        <Button variant="secondary" aria-label={t("Edit {name}", { name: r.title })} onClick={onEdit}>{t("Edit")}</Button>
        <Button
          variant="secondary"
          aria-label={r.enabled ? t("Pause {name}", { name: r.title }) : t("Resume {name}", { name: r.title })}
          onClick={() => {
            const firstOn = !r.enabled && !list.some((x) => x.enabled);
            setReminderEnabled(r.id, !r.enabled);
            if (firstOn) void askForNotifications();
          }}
        >
          {r.enabled ? t("Pause") : t("Resume")}
        </Button>
        <Button variant="secondary" aria-label={t("Delete {name}", { name: r.title })} onClick={onDelete}>{t("Delete")}</Button>
      </div>
    </li>
  );
}

export default function RemindersPage() {
  const t = useT();
  const hydrated = useHydrated();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const list = useStore(remindersStore);
  const editor = useReminderEditor("reminders-title");
  const now = useNow();
  const { permission, droppedIds } = useReminderStatus();
  if (!hydrated) return null;

  const rows = [...list].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  const full = list.length >= MAX_REMINDERS;

  return (
    <div>
      <BackHome />
      <h1 id="reminders-title" tabIndex={-1} className="mt-5 text-[1.75rem] font-[800] leading-none tracking-[-0.02em] outline-none">{t("Reminders")}</h1>
      <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("{app} rings at the times you choose, but a reminder may not appear if notifications are off or silenced, so don't rely on it alone. Follow the advice of your doctor or pharmacist about any medication.", { app: site.name })}</p>
      <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Ticking “Done” is only your own mark. It doesn't stop a reminder from ringing later today.")}</p>
      <ReminderNotice />

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={<BellIcon />}
            title={t("No reminders yet")}
            action={<Button onClick={editor.openNew}>{t("Add a reminder")}</Button>}
          />
        </div>
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {rows.map((r) => (
              <ManageRow key={r.id} r={r} list={list} now={now} htmlLang={htmlLang} wontRing={r.enabled && permission !== "unavailable" && droppedIds.includes(r.id)} onEdit={() => editor.openEdit(r)} onDelete={() => editor.askDelete(r)} />
            ))}
          </ul>
          <div className="mt-5">
            {full ? <p className="text-[0.9375rem] leading-snug text-muted">{t("You can have up to {n} reminders.", { n: MAX_REMINDERS })}</p> : <Button full className="min-h-12 text-base" onClick={editor.openNew}>{t("Add a reminder")}</Button>}
          </div>
        </>
      )}
      {editor.node}
    </div>
  );
}
