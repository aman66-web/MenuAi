"use client";

import { useId, useState } from "react";
import type { ReportReason } from "@/lib/community/types";
import { reportAbuse } from "../_lib/community";
import { failureText } from "../_lib/communityText";
import { useT } from "../_lib/i18n";
import { Button, Spinner, Toggle, inputClass, radioKeyNav } from "./ui";
import { tk } from "@/lib/mm/i18n";

// "Report" (App Review guideline 1.2: a way to flag objectionable material, and to act on it). A report goes to the founder, who reads it in the database
// (docs/BACKEND.md); the person who is reported is never told who reported them. What can be reported is a person's username (a friend, or a request waiting for
// you) and a shopping list someone sent you. The server copies the usernames and, for a list, the words typed into it, so a report still makes sense after
// the person is blocked and the list deleted.

export interface ReportTarget {
  kind: "friend" | "request" | "list";
  /** The row that connects you: the friendship, or the inbox item. */
  id: string;
  username: string;
}

const PERSON_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: "abusive_username", label: tk("Offensive username") },
  { value: "spam", label: tk("Spam") },
  { value: "harassment", label: tk("Harassment or bullying") },
  { value: "impersonation", label: tk("Pretending to be someone else") },
  { value: "other", label: tk("Something else") },
];
const LIST_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: "abusive_list", label: tk("Offensive words in the list") },
  { value: "spam", label: tk("Spam") },
  { value: "harassment", label: tk("Harassment or bullying") },
  { value: "other", label: tk("Something else") },
];

export const NOTE_MAX = 500;

export function ReportForm({ target, onSent, onCancel }: { target: ReportTarget; onSent: (blocked: boolean) => void; onCancel: () => void }) {
  const t = useT();
  const labelId = useId();
  const reasons = target.kind === "list" ? LIST_REASONS : PERSON_REASONS;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const base = target.kind === "list" ? { listId: target.id } : { friendId: target.id };
      const r = await reportAbuse({ ...base, reason, ...(note.trim() ? { note: note.trim() } : {}), block: alsoBlock });
      if (r.ok) onSent(r.blocked);
      else setError(failureText(r, t, target.username));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void send(); }} className="pb-2 pt-1">
      <p id={labelId} className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">{t("Why are you reporting {name}?", { name: target.username })}</p>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-3 space-y-2">
        {reasons.map((r, i) => {
          const on = reason === r.value;
          return (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (reason === null && i === 0) ? 0 : -1}
              onClick={() => setReason(r.value)}
              onKeyDown={(e) => radioKeyNav(e, i, reasons.length, (n) => setReason(reasons[n]!.value))}
              className={`flex min-h-12 w-full items-center rounded-2xl px-4 py-2.5 text-start text-base font-medium leading-snug transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "bg-foreground text-background" : "bg-[var(--fill)] hover:bg-soft-strong"}`}
            >
              {t(r.label)}
            </button>
          );
        })}
      </div>
      <label className="mt-5 block">
        <span className="mb-2 block text-[0.9375rem] font-semibold leading-snug">{t("Add a note (optional)")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} rows={3} className={`${inputClass} min-h-24 resize-y py-3`} />
      </label>
      <div className="mt-2">
        <Toggle checked={alsoBlock} onChange={setAlsoBlock} label={t("Also block {name}", { name: target.username })} description={t("You'll stop seeing each other.")} />
      </div>
      {error && <p role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-snug">{error}</p>}
      {/* aria-disabled, not disabled, while it is sending: a disabled button drops the keyboard focus to the page */}
      <Button full type="submit" className="mt-5 min-h-12 text-base" disabled={!reason} aria-disabled={busy || undefined}>{busy ? <Spinner label={t("Sending…")} /> : t("Send report")}</Button>
      <Button full variant="ghost" className="mt-1.5" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button>
    </form>
  );
}
