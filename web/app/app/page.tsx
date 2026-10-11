"use client";

import Link from "next/link";
import { loggedToday, remainingToday } from "@/lib/mm/budget";
import { PAYMENTS_ENABLED, SAMPLES_ENABLED } from "@/lib/mm/config";
import { formatCalories, formatGrams, formatInt } from "@/lib/mm/format";
import { localeInfo } from "@/lib/mm/i18n";
import { favoritesStore, logStore, myRecipesStore, savedRecipesStore, savedStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { dietWords } from "./_components/DietPicker";
import { useGate } from "./_components/Paywall";
import { Ring } from "./_components/Ring";
import { ArrowRightIcon, BookmarkIcon, LeafIcon, ListIcon, PencilIcon, PotIcon } from "./_components/icons";
import { Card, Spinner } from "./_components/ui";
import { useHydrated, useIsPro, useMenu, useNow, useSettings, useStore } from "./_lib/hooks";
import { useLanguage, useT } from "./_lib/i18n";
import { Rich } from "./_lib/Rich";

// Home is today (founder 2026-10-10: "the Home Screen will be the today screen where at the top it will have today's macros, then below that
// ... 4 tabs"): the day's numbers first, then four big tiles for the person's own things. Eating out, groceries and recipes have their own
// tabs. Logging meals is Pro (SPEC §7.8), so a free user sees their targets here with a way to see Pro; nothing about the gating changed.

function HomeTile({ href, Icon, title, line, badge }: { href: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode; title: string; line: string; badge?: number }) {
  return (
    <Link href={href} className="glass lift group flex min-h-[8.5rem] min-w-0 flex-col justify-between gap-3 rounded-[1.75rem] p-4 [overflow-wrap:anywhere] hover:bg-soft-strong">
      <span className="flex items-start justify-between gap-2">
        <span aria-hidden className="icon-bubble h-12 w-12 rounded-2xl"><Icon className="h-6 w-6" /></span>
        {badge ? <span aria-hidden className="app-numbers rounded-full bg-accent-soft px-2.5 py-1 text-sm font-extrabold text-accent">{badge}</span> : null}
      </span>
      <span>
        <span className="block text-[17px] font-extrabold leading-snug tracking-tight">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{line}</span>
      </span>
    </Link>
  );
}

export default function HomePage() {
  const t = useT();
  const language = useLanguage();
  const hydrated = useHydrated();
  const settings = useSettings();
  const pro = useIsPro();
  const menu = useMenu();
  const { showPaywall } = useGate();
  const log = useStore(logStore);
  const shopping = useStore(shoppingStore);
  const saved = useStore(savedStore);
  const favorites = useStore(favoritesStore);
  const savedRecipes = useStore(savedRecipesStore);
  const pipRecipes = useStore(myRecipesStore);
  const now = useNow();

  if (!hydrated || !settings.hasCompletedOnboarding) return <Spinner />;

  const profile = { goal: settings.goal, dailyCalories: settings.dailyCalories, ...(settings.dailyProtein ? { dailyProtein: settings.dailyProtein } : {}) };
  const eaten = loggedToday(log, now);
  const left = remainingToday(profile, eaten);
  const used = Math.min(1, Math.max(0, eaten.calories / settings.dailyCalories));
  const date = new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long", day: "numeric", month: "long" }).format(now);

  const toBuy = shopping.filter((i) => !i.done).length;
  const groceriesLine = shopping.length === 0 ? t("Your shopping list") : toBuy === 0 ? t("All picked up") : toBuy === 1 ? t("1 thing to pick up") : t("{n} things to pick up", { n: toBuy });
  const meals = saved.length + favorites.length;
  const mealsLine = saved.length > 0 ? (saved.length === 1 ? t("1 saved meal") : t("{n} saved meals", { n: saved.length })) : favorites.length > 0 ? (favorites.length === 1 ? t("1 favourite restaurant") : t("{n} favourite restaurants", { n: favorites.length })) : t("Restaurant meals you save");
  const recipeCount = savedRecipes.length + pipRecipes.length;
  const recipesLine = recipeCount === 0 ? t("Recipes you save") : recipeCount === 1 ? t("1 saved recipe") : t("{n} saved recipes", { n: recipeCount });
  const diet = dietWords(t, settings.preferences);
  const dietLine = diet.length ? diet.slice(0, 3).join(" · ") + (diet.length > 3 ? " …" : "") : t("Nothing left out");

  return (
    <div>
      <p className="text-sm font-semibold text-muted">{date}</p>
      <h1 className="mt-0.5 text-[2.75rem] font-extrabold leading-[1.0] tracking-[-0.035em]">{t("Today")}</h1>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="glass mt-4 rounded-2xl px-4 py-2.5 text-xs text-muted">{t("Showing fictional sample data for testing. Numbers are not real.")}</p>
      )}

      <Card hero className="app-numbers mt-5 overflow-hidden p-5">
        {pro ? (
          <>
            <div className="flex items-center gap-5">
              <Ring id="home" label={t("Calories used today")} fraction={used} size={104} stroke={10}>
                <span aria-hidden className="text-lg font-extrabold">{Math.round(used * 100)}%</span>
              </Ring>
              <div className="min-w-0 flex-1 text-base leading-snug">
                {left.calories >= 0 ? (
                  <>
                    <span className="block text-sm font-semibold text-muted">{t("Left today:")}</span>
                    <span className="sun-text block text-3xl font-extrabold tracking-tight">{formatCalories(left.calories)}</span>
                    {left.protein !== undefined && <span className="mt-1 flex items-center gap-2 font-extrabold text-accent"><span aria-hidden className="dot bg-protein" />{t("{grams} protein", { grams: formatGrams(Math.max(0, left.protein)) })}</span>}
                  </>
                ) : (
                  <Rich text={t("Over today's target by {kcal}")} values={{ kcal: <span className="text-xl font-extrabold">{formatCalories(-left.calories)}</span> }} />
                )}
              </div>
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-muted">{t("Eaten so far")}</p>
            <dl className="mt-1.5 grid grid-cols-2 gap-2 text-center">
              {[
                { label: "kcal", value: formatInt(eaten.calories) },
                { label: t("protein"), value: formatGrams(eaten.protein) },
                { label: t("carbs"), value: formatGrams(eaten.carbs) },
                { label: t("fat"), value: formatGrams(eaten.fat) },
              ].map((x) => (
                <div key={x.label} className="inset-card flex flex-col-reverse rounded-2xl px-2 py-2">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{x.label}</dt>
                  <dd className="text-lg font-extrabold leading-tight">{x.value}</dd>
                </div>
              ))}
            </dl>
            <Link href="/app/today" className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line px-4 font-bold text-accent transition hover:bg-accent-soft">
              {t("See what you've eaten today")}<ArrowRightIcon className="h-5 w-5 shrink-0" />
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-muted">{t("Your daily targets")}</p>
              <Link href="/app/settings#targets" aria-label={t("Edit your targets")} className="-my-2 -me-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-soft-strong hover:text-accent">
                <PencilIcon className="h-[18px] w-[18px]" />
              </Link>
            </div>
            <p className="mt-2 grid grid-cols-2 gap-3">
              <span className="tile min-w-0 rounded-2xl px-4 py-3 [overflow-wrap:anywhere]">
                <span className="block text-[1.7rem] font-extrabold leading-tight tracking-tight"><span className="sun-text">{formatInt(settings.dailyCalories)}</span> <span className="text-base font-bold text-muted">kcal</span></span>
                <span aria-hidden className="mt-0.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted"><span className="dot bg-sun" />{t("a day")}</span>
              </span>
              {settings.dailyProtein ? (
                <span className="tile min-w-0 rounded-2xl px-4 py-3 [overflow-wrap:anywhere]">
                  <span className="block text-[1.7rem] font-extrabold leading-tight tracking-tight text-accent">{formatGrams(settings.dailyProtein)} <span className="sr-only">{t("protein")}</span></span>
                  <span aria-hidden className="mt-0.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted"><span className="dot bg-protein" />{t("protein")}</span>
                </span>
              ) : null}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-4">
              <p className="min-w-[10rem] flex-1 text-sm leading-snug">{t("Log your meals to see what's left today.")}</p>
              <button type="button" onClick={() => showPaywall("log")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-4 text-sm font-bold text-accent transition active:scale-[0.97]">
                {PAYMENTS_ENABLED ? t("Try Pro free") : t("See Pro")}
              </button>
            </div>
          </>
        )}
      </Card>

      {!settings.hasSetTargets && !settings.dismissedTargetsCard && (
        <Card className="mt-3 flex items-center justify-between gap-3 p-4">
          <Link href="/app/settings#targets" className="min-h-11 flex-1 font-medium">{t("Set your targets to see what's left today")}</Link>
          <button type="button" className="min-h-11 min-w-11 text-sm text-muted" onClick={() => updateSettings({ dismissedTargetsCard: true })} aria-label={t("Dismiss")}>{t("Dismiss")}</button>
        </Card>
      )}

      <h2 className="sr-only">{t("Your things")}</h2>
      <div className="stagger mt-5 grid grid-cols-2 gap-3">
        <HomeTile href="/app/groceries/list" Icon={ListIcon} title={t("My groceries")} line={groceriesLine} badge={toBuy} />
        <HomeTile href="/app/saved" Icon={BookmarkIcon} title={t("My saved meals")} line={mealsLine} badge={meals} />
        <HomeTile href="/app/recipes/saved" Icon={PotIcon} title={t("My recipes")} line={recipesLine} badge={recipeCount} />
        <HomeTile href="/app/settings#diet" Icon={LeafIcon} title={t("My diet")} line={dietLine} />
      </div>
    </div>
  );
}
