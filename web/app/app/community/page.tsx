"use client";

import Link from "next/link";
import { ARTICLES } from "@/lib/mm/blog";
import { ChevronRightIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { HEADING, NOTE, TITLE } from "../groceries/PageBits";

// Community (founder 2026-10-16: "The settings at the bottom right is now a community. Where you can find food blogs, and more and also add a
// friend and more"). The fifth tab. For now it holds the food blogs: short articles of our own, bundled in the app, so they are readable with no
// account and no signal. Friends and shared shopping lists come later and get their own cards here when they exist (nothing is shown for them
// before). Settings is the gear at the top of Home. Home's look: the compact heavy title, one white card with 20 px corners and soft shadow.

const LATEST = 3;

export default function CommunityPage() {
  const t = useT();
  const latest = ARTICLES.slice(0, LATEST);
  return (
    <div>
      <h1 className={TITLE}>{t("Community")}</h1>
      <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Short articles on eating out, shopping and cooking.")}</p>

      {/* the section heading sits on the grey page above its card, with its action at the end of the row, like Eat out's "All restaurants" */}
      <div className="mt-6 flex items-center justify-between gap-3">
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
