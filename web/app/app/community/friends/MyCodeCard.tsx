"use client";

import { useState } from "react";
import { formatFriendCode, inviteUrl } from "@/lib/community/friendCode";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { site } from "@/site.config";
import { CopyIcon, ShareIcon } from "../../_components/icons";
import { LinkIcon } from "../../_components/communityIcons";
import { Button } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { CARD, LABEL, NOTE } from "../../groceries/PageBits";

// "Your friend code": the code and invite link a person gives to someone they want as a friend. The code is the only way to be added (nobody can look anyone up), so
// it is shown large, can be copied or shared in a tap, and the screen says plainly that it is the only thing a friend needs.

export function MyCodeCard({ username, code }: { username: string; code: string }) {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  const link = inviteUrl(site.url, code);
  const message = t("Add me as a friend on {app}. My friend code is {code}. Open this link on your phone to add me:", { app: site.name, code: formatFriendCode(code) }) + "\n" + link;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(t("Copied."));
    } catch {
      setNote(t("Couldn't copy."));
    }
  };
  const share = async () => {
    if (hasNative()) {
      const r = await nativeCall("share", { title: site.name, text: message }); // the iPhone's own share sheet
      if (r.done || r.error === "cancelled") return;
    }
    try {
      if (navigator.share) await navigator.share({ title: site.name, text: message });
      else await copy(message);
    } catch { /* cancelled */ }
  };

  return (
    <section aria-labelledby="my-code" className={`${CARD} mt-6 p-5`}>
      <h2 id="my-code" className={LABEL}>{t("Your friend code")}</h2>
      {/* a paragraph can't carry a label: the code is shown as one word for the eyes and read letter by letter by a screen reader (the spoken copy can't be selected) */}
      <p className="app-numbers mt-2 select-all font-mono text-[2rem] font-medium leading-tight tracking-[0.06em]">
        <span aria-hidden>{formatFriendCode(code)}</span>
        <span className="sr-only select-none">{code.split("").join(" ")}</span>
      </p>
      <p className="mt-1 text-[0.9375rem] leading-snug text-muted [overflow-wrap:anywhere]">{t("Your username is {username}.", { username })}</p>
      {/* Share is the main action, full width; the two copy buttons sit side by side under it (one under the other when the words need the room: large text, long translations) */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2.5">
        <Button className="col-span-full min-h-12" onClick={() => void share()}><ShareIcon className="h-5 w-5" />{t("Share invite")}</Button>
        <Button variant="secondary" className="min-h-12" onClick={() => void copy(code)}><CopyIcon className="h-5 w-5" />{t("Copy code")}</Button>
        <Button variant="secondary" className="min-h-12" onClick={() => void copy(link)}><LinkIcon className="h-5 w-5" />{t("Copy link")}</Button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-medium text-accent">{note}</p>
      <p className={`mt-1 ${NOTE}`}>{t("Friends use this code to add you. Nobody can search for you, and nobody can see your email address.")}</p>
      <p className={`mt-2 ${NOTE}`}>{t("Anyone who has your code can ask to be your friend, and will see your username. Share it only with people you choose.")}</p>
    </section>
  );
}
