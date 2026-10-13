"use client";

import Link from "next/link";
import { site } from "@/site.config";
import { useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";

// SPEC §12.3 — static copy, word for word with {appName} filled in. A client component so it follows the chosen language
// (the page itself stays a server component for its metadata).
export function NumbersContent() {
  const t = useT();
  return (
    <div>
      <Link href="/app/settings" className="-ms-1 inline-flex min-h-11 items-center text-sm font-medium text-accent">← {t("Settings")}</Link>
      <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight"><Rich text={t("How we get our {numbers}")} values={{ numbers: <span className="serif-em sun-text pe-0.5">{t("numbers")}</span> }} /></h1>
      <div className="mt-4 space-y-4 text-base leading-relaxed">
        <p>{t("Restaurant numbers in {app} come from each restaurant's own published nutrition information. We copy them in, check them, and show the source and the date we last checked on every restaurant.", { app: site.name })}</p>
        <p>{t("Supermarket numbers come from the shop's own product page where we have read it, and otherwise from Open Food Facts, a community database that can be wrong or out of date. Recipe numbers are added up from the labels of the products they use.")}</p>
        <p>{t("We never estimate. If a restaurant doesn't publish a value, we show ‘not published’.")}</p>
        <p>{t("Spot something wrong? Tap ‘Report a number’ and we'll check within 48 hours.")}</p>
        <p>{t("{app} isn't affiliated with any restaurant and doesn't give medical advice.", { app: site.name })}</p>
      </div>
    </div>
  );
}
