"use client";

import { useEffect, useState } from "react";
import { codeFromPasted } from "@/lib/community/friendCode";
import { Button, Spinner } from "../../_components/ui";
import { addFriendByCode } from "../../_lib/community";
import { failureText } from "../../_lib/communityText";
import { useT } from "../../_lib/i18n";
import { CARD, HEADING, NOTE, PILL_INPUT } from "../../groceries/PageBits";

// "Add a friend": type or paste a friend code (or the whole invite link), tap Add friend. Every code that can't be added, whatever the reason, gets the same words
// (the server answers all of them alike, so nothing here can tell a person whether a code exists, or belongs to someone who blocked them). A friend's invite link
// fills the box for you; nothing is sent until you tap the button.

export function AddFriendCard({ invite, onUsed }: { invite: string | null; onUsed: () => void }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [filled, setFilled] = useState(false);

  // a code from an invite link goes into the box (once)
  useEffect(() => {
    if (!invite) return;
    setValue(invite); // eslint-disable-line react-hooks/set-state-in-effect -- the invite link is only known in the browser, after the page opens
    setFilled(true);
    setResult(null);
  }, [invite]);

  async function add() {
    if (busy) return;
    const code = codeFromPasted(value);
    if (!code) {
      setResult({ ok: false, text: t("We couldn't add that code. Check it and try again.") }); // the same words the server uses for any code it can't add
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await addFriendByCode(code);
      if (r.ok) {
        setResult({ ok: true, text: r.status === "friends" ? t("You and {name} are now friends.", { name: r.username }) : t("Request sent to {name}.", { name: r.username }) });
        setValue("");
        setFilled(false);
        onUsed();
      } else {
        setResult({ ok: false, text: failureText(r, t) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="add-friend" className={`${CARD} mt-4 p-5`}>
      <h2 id="add-friend" className={HEADING}>{t("Add a friend")}</h2>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void add(); }} className="mt-3">
        <label className="block">
          <span className="sr-only">{t("Friend code")}</span>
          <input
            value={value}
            onChange={(e) => { setValue(e.target.value); setResult(null); setFilled(false); }}
            placeholder={t("Friend code or invite link")}
            maxLength={120}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className={`${PILL_INPUT} bg-[var(--fill)]`}
          />
        </label>
        {filled && <p className={`mt-2 ps-1 ${NOTE}`}>{t("This is the code from your friend's invite. Check it, then tap Add friend.")}</p>}
        {/* aria-disabled, not disabled, while it is sending: a disabled button drops the keyboard focus to the page */}
        <Button full type="submit" className="mt-3 min-h-12 text-base" disabled={value.trim() === ""} aria-disabled={busy || undefined}>{busy ? <Spinner label={t("Sending…")} /> : t("Add friend")}</Button>
      </form>
      <p role={result && !result.ok ? "alert" : "status"} aria-live="polite" className={`mt-3 text-[0.9375rem] font-semibold leading-snug empty:mt-0 ${result?.ok ? "text-accent" : ""}`}>{result?.text}</p>
    </section>
  );
}
