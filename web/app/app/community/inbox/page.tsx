"use client";

import Link from "next/link";
import { localeInfo } from "@/lib/mm/i18n";
import { INBOX_DAYS } from "@/lib/community/limits";
import { InboxIcon } from "../../_components/communityIcons";
import { RefreshNote, SignInPrompt } from "../../_components/CommunityPrompts";
import { ChevronRightIcon } from "../../_components/icons";
import { EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { useCommunityResource, useFriendsScreen } from "../../_lib/community";
import { failureText } from "../../_lib/communityText";
import { whenSent } from "../../_lib/communityTime";
import { useHydrated } from "../../_lib/hooks";
import { useLanguage, useT } from "../../_lib/i18n";
import { BackLink, CARD, TITLE } from "../../groceries/PageBits";
import { Initial } from "../friends/FriendRows";

// "Shared with you" (Community, founder 2026-10-16: "send them shopping lists"): the shopping lists friends sent, newest first, each with who sent it, when and how many
// things are on it. A list stays 30 days. Opening one shows its products (the Shopping list's own look) with "Add all to my shopping list"; the number on the
// Community tab counts the ones not opened yet. Needs an account. States: signed out, loading, couldn't load, offline (the copy kept on this device) and empty.

export default function InboxPage() {
  const t = useT();
  const enabled = useFriendsScreen();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const hydrated = useHydrated();
  const inbox = useCommunityResource("inbox");
  const back = <BackLink href="/app/community" label={t("Back to community")} />;
  const heading = <h1 className={`mt-5 ${TITLE}`}>{t("Shared with you")}</h1>;

  if (!enabled) return null;
  if (!hydrated) return <div>{back}{heading}</div>;
  if (!inbox.signedIn) return <div>{back}{heading}<div className="mt-6"><SignInPrompt title={t("Sign in to see lists from friends")} /></div></div>;

  const items = inbox.data?.items ?? [];
  return (
    <div>
      {back}
      {heading}
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Shopping lists your friends sent you. Each one stays here for {days} days.", { days: INBOX_DAYS })}</p>
      <RefreshNote failure={inbox.failure} shown={inbox.data !== null} onRetry={inbox.reload} />

      <div className="mt-5">
        {inbox.data === null ? (
          inbox.failure ? <ErrorBox message={failureText(inbox.failure, t)} onRetry={inbox.reload} /> : <Spinner />
        ) : items.length === 0 ? (
          <EmptyState icon={<InboxIcon />} title={t("Nothing shared with you yet")} body={t("When a friend sends you a shopping list, it shows up here.")} />
        ) : (
          <ul className={`${CARD} overflow-hidden`}>
            {items.map((i) => {
              const unread = !i.readAt;
              return (
                <li key={i.id} className="relative before:pointer-events-none before:absolute before:end-0 before:start-4 before:top-0 before:h-px before:bg-[var(--line)] first:before:hidden">
                  <Link href={`/app/community/inbox/view?id=${encodeURIComponent(i.id)}`} className="group flex min-h-[4.5rem] items-center gap-3.5 px-4 py-3 transition hover:bg-[var(--fill)] active:bg-soft-strong">
                    <Initial name={i.from} />
                    <span className="min-w-0 flex-1">
                      {/* "New" sits with the name and wraps under it: beside the chevron it left the name a column a few letters wide at Extra large text */}
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className={`text-base leading-snug [overflow-wrap:anywhere] ${unread ? "font-[800]" : "font-semibold"}`}>{i.from}</span>
                        {unread && <span className="bg-sun shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold uppercase leading-none tracking-[0.1em] text-on-accent">{t("New")}</span>}
                      </span>
                      <span className="app-numbers mt-0.5 block text-sm leading-snug text-muted">{i.itemCount === 1 ? t("1 item") : t("{n} items", { n: i.itemCount })} · {whenSent(i.createdAt, htmlLang)}</span>
                    </span>
                    <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
