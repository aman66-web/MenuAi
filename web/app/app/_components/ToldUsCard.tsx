"use client";

import Link from "next/link";
import { updateSettings } from "@/lib/mm/stores";
import { anyPreference } from "@/lib/mm/user-data";
import { useHydrated, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { dietWords } from "./DietPicker";
import { Button, Card } from "./ui";

/**
 * Home's one-off card about the diet and allergies given at sign-up (founder 2026-11-21: "you should not filter people based on what they've put in ... when
 * they've went into the dashboard, that's when you can explain to them ... they can go on the recipes and then they can filter it"). Those answers hide
 * nothing; the card says what they were and where the filters are, and goes once it is closed or Recipes is opened from it.
 */
export function ToldUsCard({ className = "" }: { className?: string }) {
  const t = useT();
  const hydrated = useHydrated();
  const settings = useSettings();
  const told = settings.toldUs;
  if (!hydrated || !settings.hasCompletedOnboarding || settings.toldUsCardDone || !told || !anyPreference(told)) return null;
  const done = () => updateSettings({ toldUsCardDone: true });
  return (
    <Card className={`p-4 ${className}`}>
      <h2 className="text-lg font-[800] leading-snug">{t("Everything is showing")}</h2>
      <p className="mt-1 text-base leading-snug">{t("You told us: {diet}.", { diet: dietWords(t, told).join(", ") })}</p>
      <p className="mt-1 text-base leading-snug text-muted">{t("To see only what suits you, use Filters in Recipes, or “Your diet” on a restaurant's page.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/app/recipes" onClick={done} className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 text-base font-bold text-on-ink transition active:scale-[0.97] hover:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {t("Open Recipes")}
        </Link>
        <Button variant="secondary" onClick={done}>{t("Got it")}</Button>
      </div>
    </Card>
  );
}
