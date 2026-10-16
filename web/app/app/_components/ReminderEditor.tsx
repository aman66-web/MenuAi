"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Reminder, ReminderDraft, ReminderError } from "@/lib/mm/reminders";
import { deleteReminder, restoreReminder, saveReminder } from "@/lib/mm/stores";
import { ReminderSheet } from "./ReminderSheet";
import { Button, Sheet } from "./ui";
import { askForNotifications } from "../_lib/reminderSync";
import { useT } from "../_lib/i18n";

// Adding, editing and deleting a reminder, for Home's Reminders section and for /app/reminders: one place for the sheet, the "Delete this reminder?"
// question and the Undo that follows (8 seconds, like the other deletes in the app). `node` goes anywhere in the screen's output.
// The phone's permission to show notifications is asked when the first switched-on reminder is saved, never earlier (reminderSync.ts).

/**
 * How long "Delete this reminder?" ignores the Delete button after it opens. The question opens where the finger just was (the edit sheet's Delete button is
 * at the same height), so a quick second tap of the same button would answer it before it could be read. Cancel works at once.
 */
export const CONFIRM_DELAY_MS = 800;

export interface ReminderEditor {
  openNew: () => void;
  openEdit: (r: Reminder) => void;
  /** Ask "Delete this reminder?" (closing the edit sheet if it is open). */
  askDelete: (r: Reminder) => void;
  node: ReactNode;
}

/** `focusId` is the id of the screen's heading: focus goes there when the thing that opened a sheet has gone (the first reminder replaces the "Add" card). */
export function useReminderEditor(focusId: string): ReminderEditor {
  const t = useT();
  const [sheet, setSheet] = useState<{ reminder: Reminder | null } | null>(null);
  const [confirm, setConfirm] = useState<Reminder | null>(null);
  const [undo, setUndo] = useState<Reminder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmOpenedAt = useRef(0);
  const [armed, setArmed] = useState(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // The question's Delete button works only after CONFIRM_DELAY_MS (and looks switched off until then).
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setArmed(true), CONFIRM_DELAY_MS);
    return () => clearTimeout(id);
  }, [confirm]);
  const ask = (r: Reminder) => {
    confirmOpenedAt.current = Date.now();
    setArmed(false);
    setSheet(null);
    setConfirm(r);
  };

  // A closed dialog gives the focus back to what opened it; if that has gone from the page, the heading takes it, so the keyboard and a screen reader
  // never start again from the top of the page.
  const settleFocus = () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) document.getElementById(focusId)?.focus({ preventScroll: true });
    }, 80);
  };

  const save = (draft: ReminderDraft): ReminderError | null => {
    const saved = saveReminder(draft);
    if (!saved.ok) return saved.error;
    if (saved.firstEnabled) void askForNotifications();
    setSheet(null);
    settleFocus();
    return null;
  };

  const remove = () => {
    if (!confirm || Date.now() - confirmOpenedAt.current < CONFIRM_DELAY_MS) return;
    const gone = deleteReminder(confirm.id);
    setConfirm(null);
    settleFocus();
    if (!gone) return;
    setUndo(gone);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 8000);
  };

  const node = (
    <>
      <ReminderSheet
        open={sheet !== null}
        reminder={sheet?.reminder ?? null}
        onClose={() => {
          setSheet(null);
          settleFocus();
        }}
        onSave={save}
        onDelete={ask}
      />
      <Sheet
        open={confirm !== null}
        onClose={() => {
          setConfirm(null);
          settleFocus();
        }}
        title={t("Delete this reminder?")}
      >
        {confirm && (
          <div className="pb-2 pt-1">
            <p className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">{confirm.title}</p>
            {/* The safe answer is the big black one on top; Delete is the quiet grey one below it and waits a moment before it works. */}
            <div className="mt-5 space-y-2">
              <Button full className="min-h-12 text-base" onClick={() => {
                setConfirm(null);
                settleFocus();
              }}>{t("Cancel")}</Button>
              <Button variant="danger" full disabled={!armed} onClick={remove}>{t("Delete")}</Button>
            </div>
          </div>
        )}
      </Sheet>
      {undo && (
        // At the top, clear of the rows and their buttons, like Home's "Added" bar.
        <div role="status" className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-[1.75rem] bg-foreground py-1.5 ps-5 pe-2 text-background shadow-lg">
          <span className="min-w-0 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{t("Reminder deleted.")}</span>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-full px-3.5 text-[0.9375rem] font-bold text-[var(--sun)] transition hover:bg-white/10"
            onClick={() => {
              restoreReminder(undo);
              setUndo(null);
            }}
          >
            {t("Undo")}
          </button>
        </div>
      )}
    </>
  );

  return {
    openNew: () => setSheet({ reminder: null }),
    openEdit: (r) => setSheet({ reminder: r }),
    askDelete: ask,
    node,
  };
}
