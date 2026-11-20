"use client";

import { formatInt } from "@/lib/mm/format";
import { localeInfo } from "@/lib/mm/i18n";
import { lastingThings, type WeekCosts, type WeekPlan } from "@/lib/mm/mealPlan";
import { useLanguage, useT } from "../_lib/i18n";

// The week's money as two figures (founder, 20 November 2026: "how much it's going to cost the first food shop I need to buy, but then in coming weeks, how much
// it was going to cost me"; "it's higher because they're having to buy salts and stuff this week, which they won't need to buy again"): "Your first shop:
// about £…" (every pack, lib/mm/mealPlan.ts weekCosts) and "Each week after: about £…" (the fresh food again, and only the share eaten of what keeps), then one
// line naming the week's own long-lasting things (lastingThings). Whole pounds, "about": shelf prices vary by store. Used by Meal plan (the check screen, the
// week, the preview before Premium) and by Your plan's example week (app/app/welcome/WeekShowcase.tsx). Shown only when later weeks cost at least £1 less
// (showsWeekAfter); the caller checks.

/** An ingredient's name inside a sentence: its words in brackets dropped ("Mustard (English, Dijon or wholegrain)"), and a capital first letter made small
 *  unless the word is all capitals (BBQ). The app's languages other than English are either caseless or write these nouns small too. */
function inSentence(name: string): string {
  const plain = name.replace(/\s*[(（][^)）]*[)）]/g, "").trim();
  return /^\p{Lu}\p{Ll}/u.test(plain) ? plain.charAt(0).toLocaleLowerCase() + plain.slice(1) : plain;
}

export function TwoWeeks({ costs, week, things = 3, large = false, className = "" }: {
  costs: WeekCosts;
  /** The week whose shopping is named in the "why" line. */
  week: Pick<WeekPlan, "shopping">;
  /** How many long-lasting things to name. */
  things?: number;
  /** Meal plan's money card: the two figures as its headline. */
  large?: boolean;
  className?: string;
}) {
  const t = useT();
  const language = useLanguage();
  const lasting = lastingThings(week, things);
  // "olive oil, rice and other things", in the language's own way of joining a list
  const names = new Intl.ListFormat(localeInfo(language).htmlLang, { type: "conjunction" }).format([...lasting.names.map((n) => inSentence(t(n))), ...(lasting.more ? [t("other things")] : [])]);
  const figure = large ? "text-[1.375rem] font-[800] leading-tight" : "text-[1.0625rem] font-bold leading-snug";
  return (
    <div className={className}>
      <p className={`app-numbers ${figure}`}>{t("Your first shop: about £{cost}", { cost: formatInt(Math.round(costs.first)) })}</p>
      <p className={`app-numbers ${large ? "mt-1.5" : "mt-0.5"} ${figure}`}>{t("Each week after: about £{cost}", { cost: formatInt(Math.round(costs.after)) })}</p>
      {lasting.names.length > 0 && (
        <p className="mt-1.5 text-[0.9375rem] leading-snug text-foreground">{lasting.more ? t("It includes {items} that last for weeks.", { items: names }) : t("It includes {items}, which last for weeks.", { items: names })}</p>
      )}
    </div>
  );
}
