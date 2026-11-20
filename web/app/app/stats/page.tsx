"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { needsPaywall } from "@/lib/mm/entitlements";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { weekOf } from "@/lib/mm/day";
import { statsDays } from "@/lib/mm/stats";
import { logStore } from "@/lib/mm/stores";
import { macroTargets } from "@/lib/mm/targets";
import { PageHeader } from "../_components/PageHeader";
import { useGate } from "../_components/Paywall";
import { Button } from "../_components/ui";
import { useHydrated, useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { CaloriesPanel } from "./CaloriesPanel";
import { DayBars } from "./DayBars";
import { MacrosPanel } from "./MacrosPanel";
import { NutrientsPanel } from "./NutrientsPanel";
import { StatCard } from "./StatCard";
import { PANEL_ID, parseStatsTab, StatsTabs, tabId, type StatsTab } from "./StatsTabs";

// Stats, behind Home's numbers (founder 2026-11-20, 12:54, from another app's Progress screen): Home's calories card opens Calories, its protein, carbs and
// fat card opens Macros (`?tab=macros`), the week card Calories. Laid out like the founder's example screen (same day): the heading, a row of tab words under
// it, then one calm white card per measure, its figure on the left and a rounded bar a day on the right. Three tabs: Calories (this week, and the last 4
// weeks with a bar a week, against the target), Macros (the week's split as a ring, then a card each for protein, carbs and fat), Nutrients (a card each
// for sugar, saturates, salt and fibre: today and a day this week). Every figure is added up from the food log on this phone (lib/mm/stats.ts); nothing is
// sent anywhere and nothing new is kept. No steps, sleep or weight. Where logging is paid for this person and nothing is logged, one card shows the week's
// empty bars and says the stats come once they log (as Home's week card).

const LABELS: Record<StatsTab, string> = { calories: tk("Calories"), macros: tk("Macros"), nutrients: tk("Nutrients") };

export default function StatsPage() {
  return (
    <Suspense fallback={null}>
      <StatsScreen />
    </Suspense>
  );
}

function StatsScreen() {
  const t = useT();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const [tab, setTab] = useState<StatsTab>(() => parseStatsTab(params.get("tab")));
  const settings = useSettings();
  const pro = useIsPro();
  const { showPaywall } = useGate();
  const log = useStore(logStore);
  const now = useNow();
  const htmlLang = localeInfo(useLanguage()).htmlLang;

  if (!hydrated) return null;

  const choose = (next: StatsTab) => {
    setTab(next);
    // the address follows the tab without a new history entry, so Back still goes to Home and a reload keeps the tab
    try {
      window.history.replaceState(window.history.state, "", next === "calories" ? window.location.pathname : `${window.location.pathname}?tab=${next}`);
    } catch {
      /* Safari limits how often this may run: the tab is still shown */
    }
  };

  const header = <PageHeader back={{ href: "/app", label: t("Back to home") }} title={t("Stats")} />;

  if (needsPaywall("log", { pro }) && log.length === 0) {
    // as the example screen's empty card: this week's empty tracks beside one sentence (never sample bars), then the button
    const days = statsDays([], weekOf(now), now);
    return (
      <div>
        {header}
        <div className="mt-5">
          <StatCard
            title={t("Calories")}
            figure={<p className="text-[1.0625rem] font-semibold leading-snug">{t("Your stats show here once you log your meals.")}</p>}
            chart={<DayBars bars={days.map((d) => ({ key: d.key, date: d.date, state: d.state, value: null }))} top={1} color="bg-ink" htmlLang={htmlLang} listLabel={t("Calories each day")} spoken={(_, day) => t("{day}: nothing logged", { day })} />}
            foot={<Button className="mt-1" onClick={() => showPaywall("log")}>{t("See Premium")}</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="mt-3">
        <StatsTabs value={tab} onChange={choose} label={t("Stats")} labels={{ calories: t(LABELS.calories), macros: t(LABELS.macros), nutrients: t(LABELS.nutrients) }} />
      </div>
      <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(tab)} className="mt-4">
        {tab === "calories" && <CaloriesPanel log={log} now={now} target={settings.dailyCalories} htmlLang={htmlLang} />}
        {tab === "macros" && <MacrosPanel log={log} now={now} targets={macroTargets(settings)} htmlLang={htmlLang} />}
        {tab === "nutrients" && <NutrientsPanel log={log} now={now} htmlLang={htmlLang} />}
      </div>
    </div>
  );
}
