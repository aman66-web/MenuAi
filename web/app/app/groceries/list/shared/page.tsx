"use client";

import { useEffect, useMemo, useState } from "react";
import { decodePayload, SHARE_PROBLEM } from "@/lib/mm/shareList";
import { site } from "@/site.config";
import { ErrorBox, LinkButton, Spinner } from "../../../_components/ui";
import { useBack } from "../../../_lib/backNav";
import { useT } from "../../../_lib/i18n";
import { BackLink, TITLE } from "../../PageBits";
import { SharedListBody } from "./SharedListBody";

// A shopping list a friend sent (founder 2026-10-15). It is in the address after the "#" (lib/mm/shareList.ts), which never leaves this phone; the shops' own
// lists give the names, pictures and prices. Read it here, then add it all to your own list. Looks follow the Shopping list: the shop under a small capital
// label in one white card, a picture beside each name, the quantity at the end (here read-only).

/** What follows the "#" in the address, read after the page opens (the address isn't known while it is built) and again if it changes: null when there is none. */
function useHash(): string | null | undefined {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, "") || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return hash;
}

export default function SharedListPage() {
  const t = useT();
  const hash = useHash();
  const decoded = useMemo(() => (hash === undefined ? undefined : decodePayload(hash ?? "")), [hash]);

  const listNav = useBack("/app/groceries/list"); // for the "Back to shopping list" button below: the page before when there is one in the app, else the list in this page's place
  const back = <BackLink href="/app/groceries/list" label={t("Back to shopping list")} />;
  const heading = <h1 className={`mt-5 ${TITLE}`}>{t("Shared shopping list")}</h1>;

  if (decoded === undefined) return <div>{back}{heading}<Spinner label={t("Opening the list")} /></div>;
  if (!decoded.ok) {
    return (
      <div>
        {back}
        {heading}
        <div className="mt-4"><ErrorBox message={t(SHARE_PROBLEM[decoded.reason], { app: site.name })} /></div>
        <LinkButton href={listNav.href} onClick={listNav.onClick} replace variant="secondary" full className="mt-4 min-h-12">{t("Back to shopping list")}</LinkButton>
      </div>
    );
  }

  // "Added" belongs to the list that was added: a different link opened in this same page (the "#" changes) starts as not added.
  return (
    <div>
      {back}
      {heading}
      <SharedListBody entries={decoded.entries} code={hash ?? ""} intro={t("A friend shared this shopping list with you. Add it to yours to tick things off as you shop.")} />
    </div>
  );
}
