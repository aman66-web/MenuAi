"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { decodePayload, SHARE_PROBLEM } from "@/lib/mm/shareList";
import { localeInfo } from "@/lib/mm/i18n";
import { site } from "@/site.config";
import { RefreshNote, SignInPrompt } from "../../../_components/CommunityPrompts";
import { PersonSheet } from "../../../_components/PersonSheet";
import { Button, ErrorBox, Sheet, Spinner } from "../../../_components/ui";
import { deleteListItem, markListRead, useCommunityResource, useFriendsScreen } from "../../../_lib/community";
import { failureText } from "../../../_lib/communityText";
import { whenSent } from "../../../_lib/communityTime";
import { useHydrated } from "../../../_lib/hooks";
import { useLanguage, useT } from "../../../_lib/i18n";
import { BackLink, NOTE, TITLE } from "../../../groceries/PageBits";
import { SharedListBody } from "../../../groceries/list/shared/SharedListBody";

// One shopping list a friend sent. A static shell like /app/chain: the list comes from ?id=, so one cached page opens every list. It is the same view as a list that
// arrives as a link (the products with their pictures and today's prices, "Add all to my shopping list"), with who sent it, and below it the ways to deal with it:
// delete it, or report or block the sender. Opening it marks it as read. The words the sender typed are shown as plain text, never run.

function ViewRoute() {
  const t = useT();
  const router = useRouter();
  const enabled = useFriendsScreen();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const hydrated = useHydrated();
  const id = useSearchParams().get("id") ?? "";
  const inbox = useCommunityResource("inbox");
  const item = inbox.data?.items.find((i) => i.id === id) ?? null;
  const [sheet, setSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // opening a list marks it read (the tab's number drops); offline, it simply stays unread until next time
  useEffect(() => {
    if (item && !item.readAt) void markListRead(item.id);
  }, [item]);

  const back = <BackLink href="/app/community/inbox" label={t("Back to shared lists")} />;

  if (!enabled) return null;
  if (!hydrated) return <div>{back}</div>;
  if (!inbox.signedIn) return <div>{back}<h1 className={`mt-5 ${TITLE}`}>{t("Shared with you")}</h1><div className="mt-6"><SignInPrompt title={t("Sign in to see lists from friends")} /></div></div>;
  if (inbox.data === null) {
    return <div>{back}<h1 className="sr-only">{t("Shared with you")}</h1><div className="mt-5">{inbox.failure ? <ErrorBox message={failureText(inbox.failure, t)} onRetry={inbox.reload} /> : <Spinner />}</div></div>;
  }
  if (!item) {
    return <div>{back}<h1 className="sr-only">{t("Shared with you")}</h1><div className="mt-5"><ErrorBox message={t("That list isn't here any more. It may have been deleted, or it may have run out.")} /></div></div>;
  }

  const decoded = decodePayload(item.payload);
  const heading = <h1 className={`mt-5 ${TITLE} [overflow-wrap:anywhere]`}>{t("Shopping list from {name}", { name: item.from })}</h1>;
  const meta = <p className={`app-numbers mt-2 ${NOTE}`}>{item.itemCount === 1 ? t("1 item") : t("{n} items", { n: item.itemCount })} · {whenSent(item.createdAt, htmlLang)}</p>;

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await deleteListItem(item!.id);
      if (r.ok) router.replace("/app/community/inbox");
      else {
        setConfirmDelete(false);
        setError(failureText(r, t));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {back}
      {heading}
      {meta}
      <RefreshNote failure={inbox.failure} shown onRetry={inbox.reload} />
      {decoded.ok ? (
        <SharedListBody entries={decoded.entries} code={item.payload} intro={t("{name} sent you this shopping list. Add it to yours to tick things off as you shop.", { name: item.from })} />
      ) : (
        <div className="mt-4"><ErrorBox message={t(SHARE_PROBLEM[decoded.reason], { app: site.name })} /></div>
      )}

      <div className="mt-8 grid gap-2.5">
        <Button variant="secondary" className="min-h-12" onClick={() => setConfirmDelete(true)}>{t("Delete this list")}</Button>
        <Button variant="ghost" className="min-h-12" onClick={() => setSheet(true)}>{t("Report or block {name}", { name: item.from })}</Button>
      </div>
      {error && <p role="alert" className="mt-3 px-1 text-[0.9375rem] font-semibold leading-snug">{error}</p>}

      {/* deleting can't be undone (the sender isn't told, and may not know to send it again): one more question, in plain words */}
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t("Delete this list")}>
        {confirmDelete && (
          <div className="pb-2 pt-1">
            <p className="text-base leading-snug [overflow-wrap:anywhere]">{t("Delete this list from {name}? You can't undo this.", { name: item.from })}</p>
            <Button full variant="danger" className="mt-5 min-h-12 text-base" aria-disabled={busy || undefined} onClick={() => void remove()}>{busy ? <Spinner /> : t("Delete this list")}</Button>
            <Button full variant="ghost" className="mt-1.5" disabled={busy} onClick={() => setConfirmDelete(false)}>{t("Cancel")}</Button>
          </div>
        )}
      </Sheet>

      <PersonSheet
        target={sheet ? { kind: "list", id: item.id, username: item.from } : null}
        onClose={() => setSheet(false)}
        onDone={(what) => { if (what === "blocked") router.replace("/app/community/inbox"); }}
      />
    </div>
  );
}

export default function InboxItemPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ViewRoute />
    </Suspense>
  );
}
