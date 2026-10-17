"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ARTICLES } from "@/lib/mm/blog";
import { COMMUNITY_FRIENDS_ENABLED } from "@/lib/mm/config";
import { InboxIcon } from "../_components/communityIcons";
import { ChevronRightIcon, PeopleIcon } from "../_components/icons";
import { useAccountUser } from "../_lib/account";
import { useCommunityState } from "../_lib/community";
import { useHydrated } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { HEADING, NOTE, TITLE } from "../groceries/PageBits";

// Community (founder 2026-10-16: "The settings at the bottom right is now a community. Where you can find food blogs, and more and also add a
// friend and more"). The fifth tab. Three things: Friends (add friends with a code; needs an account), Shared with you (shopping lists friends
// sent; needs an account) and the food blogs (short articles of our own, bundled in the app, so they are readable with no account and no signal).
// Settings is the gear at the top of Home. Home's look: the compact heavy title, white cards with 20 px corners and a soft shadow.

/** One of the two cards that lead to a signed-in page: a round icon, what it is, one line of what is in it, and (if something is waiting) a small lime count. */
function HubCard({ href, icon, title, line, waiting }: { href: string; icon: ReactNode; title: string; line: string; waiting?: string }) {
  return (
    <Link href={href} className="glass lift group flex min-h-[4.75rem] items-center gap-3.5 rounded-[1.25rem] p-4">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-soft-strong [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="min-w-0 flex-1">
        {/* the count sits beside the title and wraps under it when the text is large: beside the chevron it left the words a column about 60 px wide at Extra large text */}
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-base font-bold leading-snug">{title}</span>
          {waiting && <span className="bg-sun app-numbers rounded-full px-2.5 py-1 text-[0.75rem] font-bold leading-none text-on-accent">{waiting}</span>}
        </span>
        <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{line}</span>
      </span>
      <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
    </Link>
  );
}

/** Friends and Shared with you. What is waiting comes from the copy the tab bar's badge keeps fresh (nothing is asked here); signed out, each says it needs an account. */
function FriendCards() {
  const t = useT();
  const hydrated = useHydrated();
  const user = useAccountUser();
  const s = useCommunityState();
  const signedIn = hydrated && user !== null;
  const counts = signedIn ? s.me.data?.counts : undefined;
  const friends = signedIn ? s.friends.data?.friends.length : undefined;
  return (
    <div className="mt-6 grid gap-3">
      <HubCard
        href="/app/community/friends"
        icon={<PeopleIcon />}
        title={t("Friends")}
        line={!signedIn ? t("Sign in to add friends") : friends === undefined ? t("Add friends with a code and send them your shopping list.") : friends === 1 ? t("1 friend") : t("{n} friends", { n: friends })}
        waiting={counts && counts.friendRequests > 0 ? t("{n} new", { n: counts.friendRequests }) : undefined}
      />
      <HubCard
        href="/app/community/inbox"
        icon={<InboxIcon />}
        title={t("Shared with you")}
        line={!signedIn ? t("Sign in to see lists from friends") : t("Shopping lists your friends sent you")}
        waiting={counts && counts.unread > 0 ? t("{n} new", { n: counts.unread }) : undefined}
      />
    </div>
  );
}

const LATEST = 3;

export default function CommunityPage() {
  const t = useT();
  const latest = ARTICLES.slice(0, LATEST);
  return (
    <div>
      <h1 className={TITLE}>{t("Community")}</h1>
      <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Short articles on eating out, shopping and cooking.")}</p>

      {COMMUNITY_FRIENDS_ENABLED && <FriendCards />}

      {/* the section heading sits on the grey page above its card, with its action at the end of the row, like Eat out's "All restaurants" */}
      <div className={`${COMMUNITY_FRIENDS_ENABLED ? "mt-8" : "mt-6"} flex items-center justify-between gap-3`}>
        <h2 id="community-blogs" className={HEADING}>{t("Food blogs")}</h2>
        {/* a small grey pill like Home's round actions, inside a full 44 px tap area; the heading is read after the words */}
        <Link href="/app/community/blog" className="group inline-flex min-h-11 shrink-0 items-center transition active:scale-95">
          <span className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-soft-strong px-3.5 text-[0.9375rem] font-bold transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">{t("See all")}</span>
          <span className="sr-only"> {t("Food blogs")}</span>
        </Link>
      </div>
      <p className={NOTE}>{t("The articles are in English.")}</p>

      <section aria-labelledby="community-blogs" className="glass mt-3 rounded-[1.25rem] p-4">
        <ul className="divide-y divide-line">
          {latest.map((a) => (
            <li key={a.id}>
              <Link href={`/app/community/blog/view?id=${encodeURIComponent(a.id)}`} className="group flex min-h-11 items-center gap-3 py-3.5">
                <span className="min-w-0 flex-1">
                  {/* the articles are English only: marked as English and read left to right, also on a right-to-left page */}
                  <span lang="en" dir="ltr" className="block">
                    <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{a.title}</span>
                    <span className="mt-0.5 line-clamp-2 text-[0.9375rem] leading-snug text-muted">{a.summary}</span>
                  </span>
                  <span className={`mt-1.5 block ${NOTE}`}>{t("{n} min read", { n: a.minutes })}</span>
                </span>
                <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
