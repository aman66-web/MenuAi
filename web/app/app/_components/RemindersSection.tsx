"use client";

import Link from "next/link";
import { useId } from "react";
import { localeInfo } from "@/lib/mm/i18n";
import { formatNextDay, formatTime, isDoneToday, isDueToday, MAX_REMINDERS, nextOccurrence, repeatWords, sortForHome, type Reminder } from "@/lib/mm/reminders";
import { remindersStore, toggleReminderDone } from "@/lib/mm/stores";
import { BellIcon, CheckIcon, PlusIcon } from "./icons";
import { ReminderNotice } from "./ReminderNotice";
import { useReminderEditor } from "./ReminderEditor";
import { useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { useReminderStatus } from "../_lib/reminderSync";

// Home's "Reminders" section, last on the page under Water (founder 2026-10-16: "a section here for reminders, some people are GLP-1 and some people
// need to know when to have their medication, the app will send reminders to them when to have"). The reminders are the person's own: they type the
// name, choose when, and the iPhone app rings at those times. A row shows the name, how often and when, and, for a reminder that is for today, a round
// tick for "done today" (it resets itself at midnight). Nothing here says a reminder was missed or late, and nothing keeps a score (CLAUDE.md rule 3).

const pill = "mt-1.5 inline-flex items-center rounded-full px-3 py-1.5 text-[0.875rem] font-semibold leading-none";

function HomeRow({ r, now, htmlLang, wontRing, onEdit }: { r: Reminder; now: Date; htmlLang: string; wontRing: boolean; onEdit: () => void }) {
  const t = useT();
  const id = useId();
  const due = isDueToday(r, now);
  const done = isDoneToday(r, now);
  const words = repeatWords(r, htmlLang);
  const time = formatTime(r.time, htmlLang);
  // When it isn't for today, the next day it is for (so "Every 3 days" is never a guess about tomorrow).
  const next = r.enabled && !due ? nextOccurrence(r, now) : null;

  return (
    <li className="glass relative flex min-w-0 items-center gap-3.5 rounded-[1.75rem] p-4">
      {due ? (
        <button
          type="button"
          aria-pressed={done}
          aria-label={t("Mark {name} done", { name: r.title })}
          onClick={() => toggleReminderDone(r.id, now)}
          className={`relative z-10 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${done ? "bg-sun text-on-accent" : "border-2 border-[color-mix(in_srgb,var(--foreground)_28%,transparent)] hover:bg-soft-strong"}`}
        >
          {done && <CheckIcon aria-hidden className="h-5 w-5" strokeWidth={3} />}
        </button>
      ) : (
        <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-strong text-muted"><BellIcon className="h-5 w-5" /></span>
      )}
      <div className="min-w-0 flex-1">
        {/* The name is the button that opens the reminder; its edges are stretched over the whole card so the card is the tap target (the tick sits above). */}
        <button
          type="button"
          onClick={onEdit}
          aria-describedby={`${id}-details`}
          className={`text-start text-lg font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere] outline-none after:absolute after:inset-0 after:rounded-[1.75rem] after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent ${r.enabled ? "" : "text-muted"}`}
        >
          {r.title}
        </button>
        <p id={`${id}-details`} className="mt-0.5 text-[0.9375rem] leading-snug text-muted">
          {t(words.key, words.values)}<span aria-hidden>{"\u00A0·"}</span>{" "}<span className="app-numbers whitespace-nowrap">{time}</span>
        </p>
        <div className="flex flex-wrap gap-x-2">
          {!r.enabled ? (
            <span className={`${pill} bg-soft-strong text-muted`}>{t("Paused")}</span>
          ) : due ? (
            done ? <span className={`${pill} bg-sun text-on-accent`}>{t("Done today")}</span> : <span className={`${pill} bg-soft-strong text-foreground`}>{t("Today at {time}", { time })}</span>
          ) : next ? (
            <span className={`${pill} bg-soft-strong text-foreground`}>{t("Next: {date}", { date: formatNextDay(next, htmlLang) })}</span>
          ) : null}
          {wontRing && <span className={`${pill} bg-foreground text-background`}>{t("Won't ring")}</span>}
        </div>
      </div>
    </li>
  );
}

/** One calm card: "Add a reminder" and a round + (the only thing there while there are no reminders). */
function AddCard({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass flex min-h-[4.5rem] w-full items-center gap-3.5 rounded-[1.75rem] p-4 text-start transition hover:bg-soft-strong active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent mt-3`}
    >
      <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-strong text-muted"><BellIcon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1 text-lg font-extrabold leading-snug tracking-tight">{t("Add a reminder")}</span>
      <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-strong"><PlusIcon className="h-6 w-6" /></span>
    </button>
  );
}

/** `now` is Home's own clock (it moves on at midnight, so yesterday's ticks stop counting by themselves). */
export function RemindersSection({ now }: { now: Date }) {
  const t = useT();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const list = useStore(remindersStore);
  const editor = useReminderEditor("home-reminders");
  const rows = sortForHome(list, now);
  const { permission, droppedIds } = useReminderStatus();
  const wontRing = (r: Reminder) => r.enabled && permission !== "unavailable" && droppedIds.includes(r.id);

  return (
    <section aria-labelledby="home-reminders">
      <div className="mt-7 flex items-center justify-between gap-3">
        <h2 id="home-reminders" tabIndex={-1} className="min-w-0 text-xl font-extrabold tracking-tight outline-none">{t("Reminders")}</h2>
        {list.length > 0 && (
          <Link href="/app/reminders" aria-label={t("Manage reminders")} className="-me-3.5 inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-[0.9375rem] font-bold text-accent transition hover:bg-accent-soft active:scale-95">
            {t("Manage")}
          </Link>
        )}
      </div>
      <ReminderNotice />
      {rows.length > 0 && (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <HomeRow key={r.id} r={r} now={now} htmlLang={htmlLang} wontRing={wontRing(r)} onEdit={() => editor.openEdit(r)} />
          ))}
        </ul>
      )}
      {/* The tick is the person's own mark: the phone knows nothing of it, so a reminder still rings at its time. Said where the tick is. */}
      {rows.some((r) => isDueToday(r, now)) && <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("Ticking “Done” is only your own mark. It doesn't stop a reminder from ringing later today.")}</p>}
      {list.length < MAX_REMINDERS ? (
        <AddCard onClick={editor.openNew} />
      ) : (
        <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("You can have up to {n} reminders.", { n: MAX_REMINDERS })}</p>
      )}
      {editor.node}
    </section>
  );
}
