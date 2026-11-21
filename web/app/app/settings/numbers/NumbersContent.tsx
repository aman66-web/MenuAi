"use client";

import { site } from "@/site.config";
import { BackButton } from "../../_components/PageHeader";
import { useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";

// SPEC §12.3 — static copy with {appName} filled in (the supermarket and "never estimate" paragraphs changed on 20 November 2026: Scan your food estimates,
// and supermarkets use stand-ins where a shop publishes no label; logged for rule 8). A client component so it follows the chosen language
// (the page itself stays a server component for its metadata).
export function NumbersContent() {
  const t = useT();
  // Only Settings links here, so "the page before" is Settings: the app's own Back pill (the browser's Back when it came from Settings, so the history doesn't grow).
  return (
    <div>
      <BackButton href="/app/settings" label={t("Back to settings")} />
      <h1 className="mt-5 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]"><Rich text={t("How we get our {numbers}")} values={{ numbers: <span className="serif-em pe-0.5">{t("numbers")}</span> }} /></h1>
      <div className="glass mt-5 space-y-4 rounded-[1.25rem] p-5 text-base leading-relaxed">
        <p>{t("Restaurant numbers in {app} come from each restaurant's own published nutrition information. We copy them in, check them, and show the source and the date we last checked on every restaurant.", { app: site.name })}</p>
        {/* straight after the restaurants, where "Report a number" is (on a dish): after the supermarket paragraph it pointed at a button those pages don't have
            (the meeting of 21 November 2026, Tara); the words are SPEC §12.3's, unchanged */}
        <p>{t("Spot something wrong? Tap ‘Report a number’ and we'll check within 48 hours.")}</p>
        <p>{t("Supermarket numbers come from the shop's own product page; where we haven't read it, from the same product's label at another shop, from Open Food Facts (a community database that can be wrong or out of date), or, for loose fruit and vegetables, from the UK government's figures (CoFID). Each is named on screen. Recipe numbers are added up from the products they use.")}</p>
        <p>{t("Apart from Scan your food, which always says “Estimate from your photo”, we never estimate. If a restaurant doesn't publish a value, we show “not published”.")}</p>
        <p className="text-muted">{t("{app} isn't affiliated with any restaurant and doesn't give medical advice.", { app: site.name })}</p>
      </div>
    </div>
  );
}
