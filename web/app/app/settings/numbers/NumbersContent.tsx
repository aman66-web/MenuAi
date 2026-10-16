"use client";

import Link from "next/link";
import { site } from "@/site.config";
import { ChevronLeftIcon } from "../../_components/icons";
import { useBack } from "../../_lib/backNav";
import { useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";

// SPEC §12.3 — static copy, word for word with {appName} filled in. A client component so it follows the chosen language
// (the page itself stays a server component for its metadata).
export function NumbersContent() {
  const t = useT();
  // Only Settings links here, so "the page before" is Settings; going back through the browser (not a new link to Settings) keeps the history from growing.
  // The pill names its place ("Settings") rather than saying "Back", as it always has.
  const back = useBack("/app/settings");
  return (
    <div>
      <Link href={back.href} onClick={back.onClick} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Settings")}</span></Link>
      <h1 className="mt-5 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]"><Rich text={t("How we get our {numbers}")} values={{ numbers: <span className="serif-em sun-text pe-0.5">{t("numbers")}</span> }} /></h1>
      <div className="glass mt-5 space-y-4 rounded-[1.25rem] p-5 text-base leading-relaxed">
        <p>{t("Restaurant numbers in {app} come from each restaurant's own published nutrition information. We copy them in, check them, and show the source and the date we last checked on every restaurant.", { app: site.name })}</p>
        <p>{t("Supermarket numbers come from the shop's own product page where we have read it, and otherwise from Open Food Facts, a community database that can be wrong or out of date. Recipe numbers are added up from the labels of the products they use.")}</p>
        <p>{t("We never estimate. If a restaurant doesn't publish a value, we show ‘not published’.")}</p>
        <p>{t("Spot something wrong? Tap ‘Report a number’ and we'll check within 48 hours.")}</p>
        <p className="text-muted">{t("{app} isn't affiliated with any restaurant and doesn't give medical advice.", { app: site.name })}</p>
      </div>
    </div>
  );
}
