"use client";

import { useId, useState } from "react";
import { parseNumber } from "@/lib/mm/addFood";
import { localeInfo, tk } from "@/lib/mm/i18n";
import {
  localDateString, MAX_EVERY_DAYS, MAX_NOTE_LENGTH, MAX_REMINDERS, MAX_TITLE_LENGTH, MIN_EVERY_DAYS, weekdayName,
  type Reminder, type ReminderDraft, type ReminderError, type RepeatRule,
} from "@/lib/mm/reminders";
import { site } from "@/site.config";
import { PickTile } from "./DietPicker";
import { NumberDone, SearchDone } from "./SearchDone";
import { Button, Sheet, inputClass, radioKeyNav } from "./ui";
import { useLanguage, useT } from "../_lib/i18n";
import { useReminderStatus } from "../_lib/reminderSync";

// "Add a reminder" and "Edit reminder" (founder 2026-10-16, on Home: "a section here for reminders, some people are GLP-1 and some people need to know
// when to have their medication"). The reminder is the person's own: they type its name, choose how often (every day, certain days, every few days) and
// the time, and may add a short note. Nothing here suggests a medicine, a dose, a day or a time (CLAUDE.md rule 3). Big plain choices for older users:
// three repeat buttons, seven day buttons, the phone's own time and date pickers.

type Kind = RepeatRule["kind"];

const KINDS: ReadonlyArray<{ kind: Kind; label: string }> = [
  { kind: "daily", label: tk("Every day") },
  { kind: "weekdays", label: tk("Certain days of the week") },
  { kind: "everyNDays", label: tk("Every few days") },
];

interface Form {
  title: string;
  note: string;
  time: string;
  kind: Kind;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  days: number[];
  every: string;
  startDate: string;
}

function startForm(r: Reminder | null): Form {
  const rule = r?.repeat;
  return {
    title: r?.title ?? "",
    note: r?.note ?? "",
    // no time is suggested: the person chooses it (the lock-screen words and the time are theirs)
    time: r?.time ?? "",
    kind: rule?.kind ?? "daily",
    days: rule?.kind === "weekdays" ? [...rule.days] : [],
    every: rule?.kind === "everyNDays" ? String(rule.every) : "",
    startDate: rule?.kind === "everyNDays" ? rule.startDate : localDateString(new Date()),
  };
}

/** What the sheet hands over: validateDraft (lib/mm/reminders.ts, through saveReminder) says whether it will do. */
function draftOf(f: Form, r: Reminder | null, enabled: boolean): ReminderDraft {
  const n = parseNumber(f.every);
  const repeat: RepeatRule =
    f.kind === "daily"
      ? { kind: "daily" }
      : f.kind === "weekdays"
        ? { kind: "weekdays", days: [...f.days].sort((a, b) => a - b) }
        : { kind: "everyNDays", every: typeof n === "number" ? n : Number.NaN, startDate: f.startDate };
  const draft: ReminderDraft = { title: f.title, time: f.time, repeat, enabled };
  if (f.note.trim()) draft.note = f.note;
  if (r) {
    draft.id = r.id;
    draft.createdAt = r.createdAt;
    if (r.doneOn) draft.doneOn = r.doneOn;
  }
  return draft;
}

const labelClass = "mb-2 block text-[0.9375rem] font-semibold leading-snug";
const hintClass = "mt-2 text-[0.9375rem] leading-snug text-muted";
const problemClass = "mt-2 text-[0.9375rem] font-semibold leading-snug";
const invalidRing = "aria-invalid:ring-2 aria-invalid:ring-foreground";

/** The keyboard's Return key puts the keyboard away (there is nothing to submit from a text box; Save is the button). */
const doneKey = {
  enterKeyHint: "done" as const,
  // A reminder's name and note can be a medicine's name: the keyboard must neither send it off the phone for spell checking (a browser's "enhanced"
  // spell check does) nor "correct" it into another word, which would then show on the lock screen.
  spellCheck: false,
  autoCorrect: "off" as const,
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  },
};

function ReminderForm({ reminder, onSave, onDelete }: { reminder: Reminder | null; onSave: (draft: ReminderDraft) => ReminderError | null; onDelete: (r: Reminder) => void }) {
  const t = useT();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const id = useId();
  const [form, setForm] = useState<Form>(() => startForm(reminder));
  const [problem, setProblem] = useState<ReminderError | null>(null);
  const editing = reminder !== null;
  // On the website nothing rings and there is no lock screen: the lock-screen line would not be true there, and the sheet says so instead.
  const { permission } = useReminderStatus();
  const onPhone = permission !== "unavailable";
  const field = { name: `${id}-name`, kind: `${id}-kind`, days: `${id}-days`, every: `${id}-every`, start: `${id}-start`, time: `${id}-time`, note: `${id}-note`, problem: `${id}-problem` };

  const change = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };

  const commit = (enabled: boolean) => {
    const refused = onSave(draftOf(form, reminder, enabled));
    if (!refused) return;
    setProblem(refused);
    const target = refused === "name" ? field.name : refused === "time" ? field.time : refused === "days" ? field.days : refused === "every" ? field.every : refused === "start" ? field.start : null;
    if (target) requestAnimationFrame(() => document.getElementById(target)?.focus());
  };

  const days = [1, 2, 3, 4, 5, 6, 7].map((iso) => ({ iso, short: weekdayName(iso, htmlLang, "short"), long: weekdayName(iso, htmlLang, "long") }));
  // seven buttons in a row only when their words are short (Arabic's are not): else four and three
  const wideNames = days.some((d) => Array.from(d.short).length > 4);
  const startLong = (() => {
    try {
      const [y, m, d] = form.startDate.split("-").map(Number) as [number, number, number];
      return new Intl.DateTimeFormat(htmlLang, { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
    } catch {
      return "";
    }
  })();

  const say: Record<ReminderError, string> = {
    name: t("Type a name for the reminder."),
    time: t("Choose a time."),
    days: t("Choose at least one day."),
    every: t("Type a number from {min} to {max}.", { min: MIN_EVERY_DAYS, max: MAX_EVERY_DAYS }),
    start: t("Choose the first day."),
    limit: t("You can have up to {n} reminders.", { n: MAX_REMINDERS }),
  };
  const pickKind = (i: number) => change({ kind: KINDS[i]!.kind });
  // The notification shows both what the person typed as the name and the note: the line is under both boxes, so nobody types a dose or a condition into either without knowing.
  const lockLine = t("The name and the note you type show on your lock screen.");

  return (
    <div className="space-y-5 pb-1 pt-1">
      <div>
        <label htmlFor={field.name} className={labelClass}>{t("Name")}</label>
        <div className="group/search relative">
          <input
            id={field.name}
            value={form.title}
            onChange={(e) => change({ title: e.target.value })}
            maxLength={MAX_TITLE_LENGTH}
            placeholder={t("Morning reminder")}
            autoComplete="off"
            autoCapitalize="sentences"
            aria-invalid={problem === "name" || undefined}
            aria-describedby={problem === "name" ? field.problem : onPhone ? `${field.name}-hint` : undefined}
            {...doneKey}
            className={`${inputClass} ${invalidRing} focus:pe-[6.5rem]`}
          />
          <SearchDone />
        </div>
        {problem === "name" ? <p id={field.problem} role="alert" className={problemClass}>{say.name}</p> : onPhone ? <p id={`${field.name}-hint`} className={hintClass}>{lockLine}</p> : null}
      </div>

      <div>
        <p id={field.kind} className={labelClass}>{t("How often?")}</p>
        <div role="radiogroup" aria-labelledby={field.kind} className="space-y-2">
          {KINDS.map((k, i) => {
            const on = k.kind === form.kind;
            return (
              <PickTile key={k.kind} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} on={on} onClick={() => change({ kind: k.kind })} onKeyDown={(e) => radioKeyNav(e, i, KINDS.length, pickKind)} className="w-full text-base font-semibold">
                {t(k.label)}
              </PickTile>
            );
          })}
        </div>
      </div>

      {form.kind === "weekdays" && (
        <div role="group" aria-labelledby={`${field.days}-label`} aria-describedby={problem === "days" ? field.problem : undefined} className="@container">
          <p id={`${field.days}-label`} className={labelClass}>{t("Which days?")}</p>
          <div className={`grid gap-1.5 ${wideNames ? "grid-cols-4" : "grid-cols-4 @[21.5rem]:grid-cols-7"}`}>
            {days.map((d, i) => {
              const on = form.days.includes(d.iso);
              return (
                <button
                  key={d.iso}
                  id={i === 0 ? field.days : undefined}
                  type="button"
                  aria-pressed={on}
                  aria-describedby={i === 0 && problem === "days" ? field.problem : undefined}
                  onClick={() => change({ days: on ? form.days.filter((x) => x !== d.iso) : [...form.days, d.iso] })}
                  className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-1 text-[0.9375rem] font-semibold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "glass hover:bg-soft-strong [.sheet-panel_&]:shadow-none"}`}
                >
                  <span aria-hidden>{d.short}</span>
                  <span className="sr-only">{d.long}</span>
                </button>
              );
            })}
          </div>
          {problem === "days" && <p id={field.problem} role="alert" className={problemClass}>{say.days}</p>}
        </div>
      )}

      {form.kind === "everyNDays" && (
        <>
          <div className="group/nums relative">
            <label htmlFor={field.every} className="mb-2 flex min-h-8 items-center pe-20 text-[0.9375rem] font-semibold leading-snug">{t("Every how many days?")}</label>
            <NumberDone />
            <input
              id={field.every}
              value={form.every}
              onChange={(e) => change({ every: e.target.value })}
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              aria-invalid={problem === "every" || undefined}
              aria-describedby={`${field.every}-hint`}
              className={`${inputClass} ${invalidRing} app-numbers`}
            />
            <p id={`${field.every}-hint`} role={problem === "every" ? "alert" : undefined} className={problem === "every" ? problemClass : hintClass}>{say.every}</p>
          </div>
          <div>
            <label htmlFor={field.start} className={labelClass}>{t("First day")}</label>
            <input
              id={field.start}
              type="date"
              value={form.startDate}
              onChange={(e) => change({ startDate: e.target.value })}
              aria-invalid={problem === "start" || undefined}
              aria-describedby={[problem === "start" ? field.problem : startLong ? `${field.start}-long` : "", onPhone ? `${field.start}-rolls` : ""].filter(Boolean).join(" ") || undefined}
              className={`${inputClass} ${invalidRing} app-numbers text-start [&::-webkit-date-and-time-value]:text-start`}
            />
            {problem === "start" ? <p id={field.problem} role="alert" className={problemClass}>{say.start}</p> : startLong ? <p id={`${field.start}-long`} className={hintClass}>{t("Starting on {date}", { date: startLong })}</p> : null}
            {/* An "every few days" reminder is a run of one-off notifications (iOS can't repeat it), laid out again each time the app opens: said plainly, because for a medicine a reminder that stops by itself is the one thing that must not be a surprise. */}
            {onPhone && <p id={`${field.start}-rolls`} className={hintClass}>{t("{app} sets these reminders up each time you open it. If you don't open {app} for a while, this one can stop ringing.", { app: site.name })}</p>}
          </div>
        </>
      )}

      <div>
        <label htmlFor={field.time} className={labelClass}>{t("Time")}</label>
        <input
          id={field.time}
          type="time"
          value={form.time}
          onChange={(e) => change({ time: e.target.value })}
          aria-invalid={problem === "time" || undefined}
          aria-describedby={problem === "time" ? field.problem : undefined}
          className={`${inputClass} ${invalidRing} app-numbers text-start [&::-webkit-date-and-time-value]:text-start`}
        />
        {problem === "time" && <p id={field.problem} role="alert" className={problemClass}>{say.time}</p>}
      </div>

      <div>
        <label htmlFor={field.note} className={labelClass}>{t("Note (optional)")}</label>
        <div className="group/search relative">
          <input
            id={field.note}
            value={form.note}
            onChange={(e) => change({ note: e.target.value })}
            maxLength={MAX_NOTE_LENGTH}
            autoComplete="off"
            aria-describedby={onPhone ? `${field.note}-hint` : undefined}
            {...doneKey}
            className={`${inputClass} focus:pe-[6.5rem]`}
          />
          <SearchDone />
        </div>
        {onPhone && <p id={`${field.note}-hint`} className={hintClass}>{lockLine}</p>}
      </div>

      <p className="text-[0.9375rem] leading-snug text-muted">{t("{app} rings at the times you choose, but a reminder may not appear if notifications are off or silenced, so don't rely on it alone. Follow the advice of your doctor or pharmacist about any medication.", { app: site.name })}</p>
      {!onPhone && <p className="text-[0.9375rem] font-semibold leading-snug">{t("Reminders ring in the {app} iPhone app. On the website you'll see what's due today here.", { app: site.name })}</p>}

      {problem === "limit" && <p role="alert" className="text-[0.9375rem] font-semibold leading-snug">{say.limit}</p>}

      {reminder && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2.5">
          <Button variant="secondary" onClick={() => commit(!reminder.enabled)}>{reminder.enabled ? t("Pause") : t("Resume")}</Button>
          <Button variant="danger" onClick={() => onDelete(reminder)}>{t("Delete")}</Button>
        </div>
      )}

      {/* Save stays in view at the foot of the sheet while the form scrolls; the bar reaches over the sheet's own bottom padding so nothing shows through under it. */}
      <div className="sticky bottom-[calc(-1*max(1.75rem,env(safe-area-inset-bottom)))] -mx-5 -mb-[max(1.75rem,env(safe-area-inset-bottom))] border-t border-line bg-white px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-3">
        <Button full className="min-h-12 text-base" onClick={() => commit(reminder ? reminder.enabled : true)}>{editing ? t("Save changes") : t("Save")}</Button>
      </div>
    </div>
  );
}

/**
 * `onSave` gets the draft, saves it and returns null, or returns why it won't do (the sheet says so next to the field). `onDelete` asks the person
 * first (the editor shows "Delete this reminder?"). The form starts afresh each time the sheet opens.
 */
export function ReminderSheet({ open, reminder, onClose, onSave, onDelete }: { open: boolean; reminder: Reminder | null; onClose: () => void; onSave: (draft: ReminderDraft) => ReminderError | null; onDelete: (r: Reminder) => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={reminder ? t("Edit reminder") : t("Add a reminder")}>
      <ReminderForm key={reminder?.id ?? "new"} reminder={reminder} onSave={onSave} onDelete={onDelete} />
    </Sheet>
  );
}
