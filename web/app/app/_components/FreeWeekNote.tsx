"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IAP_ENABLED } from "@/lib/mm/config";
import { FREE_WEEK_DAYS, FREE_WEEK_DAYS_FREE, FREE_WEEK_LAST_DAY, FREE_WEEK_LEFT, FREE_WEEK_NO_CARD, FREE_WEEK_STARTED, FREE_WEEK_UNTIL } from "@/lib/mm/freeWeek";
import { localeInfo } from "@/lib/mm/i18n";
import { freeWeekStore } from "@/lib/mm/stores";
import { welcomeSaid } from "@/lib/payments/accountAccess";
import { useAccountUser } from "../_lib/account";
import { useFreeWeekDaysLeft } from "../_lib/freeWeek";
import { useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { ChevronRightIcon, StarIcon } from "./icons";
import { PremiumOffer } from "./PremiumOffer";
import { Button, Sheet } from "./ui";

// The free week, said so (founder 2026-11-21: "when the person goes into the app for the first time, they should be notified that they've got a 7-day trial
// ... they just know that they've got a 7-day trial"). Two parts:
//  * FreeWeekNote: when an account's free week starts, once on this phone, on Home: a sheet, "Your free week has started", with the days, the day it ends,
//    "No card needed, and nothing to cancel." (true: the free week is our server's, nothing is bought and it simply ends) and what Premium adds (PremiumOffer,
//    the one list). Until 21 November evening this was one toast, easily missed. While it is due, Pip's tips wait (data-coach-wait), so it comes first; it
//    waits in turn for any other sheet or toast already up.
//  * FreeWeekPill: at the top of Home while the free week runs, every time Home opens: "Free week: {n} days left" (the words Settings › Subscription uses), a
//    lime pill that opens the plans page.
// Only in the In-App Purchase iPhone app (the website sells nothing).

const HOME = /^\/app\/?$/;

export function FreeWeekNote() {
  if (!IAP_ENABLED) return null;
  return <FreeWeekNoteInApp />;
}

function FreeWeekNoteInApp() {
  const t = useT();
  const language = useLanguage();
  const pathname = usePathname();
  const user = useAccountUser();
  const state = useStore(freeWeekStore);
  const [shown, setShown] = useState(false);
  const due = !!user && state.user === user.id && state.status === "running" && state.welcomeDue && HOME.test(pathname);

  useEffect(() => {
    if (!due) return;
    let timer = window.setTimeout(function show() {
      if (document.querySelector("dialog[open], [data-toast-host]")) {
        timer = window.setTimeout(show, 1000);
        return;
      }
      setShown(true);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [due]);

  const close = () => {
    welcomeSaid();
    setShown(false);
  };
  const ends = state.endsAt ? new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long", day: "numeric", month: "long" }).format(new Date(state.endsAt)) : null;

  return (
    <>
      {/* Pip's tips wait for this sheet (CoachMarks: data-coach-wait) */}
      {due && <span hidden data-coach-wait="" />}
      <Sheet open={shown} onClose={close} title={t(FREE_WEEK_STARTED)}>
        <div className="space-y-4 pb-2">
          <div className="rounded-[1.5rem] border-2 border-on-sun bg-sun px-5 py-5 text-on-sun">
            <p className="flex items-center gap-2 text-base font-bold"><StarIcon filled aria-hidden className="h-5 w-5" />{t("Premium")}</p>
            <p className="mt-1 text-[2rem] font-[800] leading-[1.1] tracking-[-0.02em]">{t(FREE_WEEK_DAYS_FREE, { days: FREE_WEEK_DAYS })}</p>
            {ends && <p className="mt-1.5 text-lg font-bold">{t(FREE_WEEK_UNTIL, { date: ends })}</p>}
          </div>
          <p className="text-base leading-snug">{t(FREE_WEEK_NO_CARD)}</p>
          <PremiumOffer level="h3" />
          <Button full className="min-h-12 text-base" onClick={close}>{t("Start exploring")}</Button>
        </div>
      </Sheet>
    </>
  );
}

/** Home's lime pill while the free week runs: "Free week: {n} days left", opening the plans page. Nothing when no free week is running. */
export function FreeWeekPill({ className = "" }: { className?: string }) {
  const t = useT();
  const left = useFreeWeekDaysLeft();
  if (left <= 0) return null;
  return (
    <Link href="/app/pro" className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-on-sun bg-sun ps-3 pe-2 text-[0.9375rem] font-bold text-on-sun transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}>
      <StarIcon filled aria-hidden className="h-4 w-4" />
      {left === 1 ? t(FREE_WEEK_LAST_DAY) : t(FREE_WEEK_LEFT, { n: left })}
      <ChevronRightIcon aria-hidden className="h-4 w-4" />
    </Link>
  );
}
