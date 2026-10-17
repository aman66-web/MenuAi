"use client";

import { useId, useState } from "react";
import { publicUsernameProblem, USERNAME_MAX, USERNAME_MIN, checkUsernameShape, validateUsername } from "@/lib/community/username";
import type { Profile } from "@/lib/mm/communityClient";
import { chooseUsername, refreshMe } from "../_lib/community";
import { failureText, usernameProblemText } from "../_lib/communityText";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { Button, Field, Sheet, Spinner, inputClass } from "./ui";

// "Choose a username" (Community, founder 2026-10-16). The name friends see instead of an email address; chosen once and never changed. The rules are one function
// (lib/community/username.ts) that the server runs too, so this sheet can say what is wrong before anything is sent, and the server still has the last word
// (a name that is taken, or isn't available, can only be known there).

export function UsernameSheet({ open, onClose, onChosen }: { open: boolean; onClose: () => void; onChosen?: (profile: Profile) => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Choose a username")}>
      {open && <UsernamePanel onClose={onClose} onChosen={onChosen} />}
    </Sheet>
  );
}

function UsernamePanel({ onClose, onChosen }: { onClose: () => void; onChosen?: (profile: Profile) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shape = checkUsernameShape(name);
  const messageId = useId();

  async function submit() {
    if (busy) return;
    setError(null);
    const checked = validateUsername(name); // the same rules the server applies
    if (!checked.ok) {
      setError(usernameProblemText(publicUsernameProblem(checked.reason), t));
      return;
    }
    setBusy(true);
    try {
      const r = await chooseUsername(checked.username);
      if (r.ok) {
        onClose();
        onChosen?.(r.profile); // after closing, so a screen that carries on to its next step (the friend picker) has the last word
      } else if (!r.offline && r.error === "username_set") {
        void refreshMe(); // already chosen (on another device): show it
        setError(failureText(r, t));
      } else {
        setError(failureText(r, t));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="pb-2 pt-1">
      <p className="text-base leading-snug">{t("This is the name your friends see. You can't change it later, and nobody can see your email address.")}</p>
      <div className="mt-5">
        <Field label={t("Username")} hint={t("{min} to {max} letters, numbers, dots or underscores.", { min: USERNAME_MIN, max: USERNAME_MAX })}>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            maxLength={USERNAME_MAX}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            // The keyboard's Return key is labelled Done, as everywhere in the app, so it only puts the keyboard away. The name can't be changed later, so the one thing that
            // sets it is the button below, after the person has seen "Your friends will see: …".
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || shape.ok ? messageId : undefined}
            className={inputClass}
          />
        </Field>
      </div>
      {shape.ok && !error && <p id={messageId} className="mt-3 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]" role="status">{t("Your friends will see: {username}", { username: shape.username })}</p>}
      {error && <p id={messageId} role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-snug">{error}</p>}
      <p className="mt-4 text-sm leading-snug text-muted">
        <Rich text={t("By choosing a username you agree to the {terms}.")} values={{ terms: <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> }} />
      </p>
      {/* aria-disabled, not disabled, while it is working: a disabled button drops the keyboard focus to the page */}
      <Button full type="submit" className="mt-3 min-h-12 text-base" disabled={name.trim() === ""} aria-disabled={busy || undefined}>{busy ? <Spinner label={t("Checking…")} /> : t("Choose this username")}</Button>
      <Button full variant="ghost" className="mt-1.5" disabled={busy} onClick={onClose}>{t("Cancel")}</Button>
    </form>
  );
}
