"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { addToList, formatPrice, withPhoto } from "@/lib/mm/groceries";
import { LEAVE_OUT, PLAN_MEALS, buildWeek, makePlan, planCandidates, swapMeal, type PlanIds, type SavedPlan } from "@/lib/mm/mealPlan";
import { MEAL_LABEL } from "@/lib/mm/budget";
import { formatInt } from "@/lib/mm/format";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import { mealSizes } from "@/lib/mm/recipes";
import { recipeShops, shopPhotoSources } from "@/lib/mm/shopProducts";
import { mealPlanStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { macroTargets } from "@/lib/mm/targets";
import { DietPicker } from "../_components/DietPicker";
import { CheckIcon, PlusIcon, SwapIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { Button, ErrorBox, Spinner, inputClass } from "../_components/ui";
import { useHydrated, useSettings, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { localeInfo } from "@/lib/mm/i18n";
import { useShopManifest, useShopProducts } from "../_lib/shopProducts";
import { BackLink, CARD, CHIP, CHIP_ON, HEADING, TITLE } from "../groceries/PageBits";
import { RecipeThumb } from "../recipes/RecipeThumb";
import { ShopChoice } from "../recipes/ShopChoice";

// Plan my week (founder 2026-11-18; lib/mm/mealPlan.ts has the rules): one page of plain questions (the daily target from the person's own plan, their diet and
// allergies, foods they don't eat, a budget for the week and their shop), then the week: each day's breakfast, lunch and dinner from our own recipes with its
// calories, protein and price, the day's totals, what the shopping comes to against the budget, and the shopping list for the whole week with one button to
// put it all on the Shopping list. Any meal can be swapped for the next best recipe. The plan stays on the phone until a new one is made (mm.v1.mealPlan).

const H1 = `mt-4 ${TITLE}`;
const STEP = "app-numbers grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sun text-base font-[800] text-[var(--on-accent)]";
const today = () => new Date().toISOString().slice(0, 10);

function Question({ n, title, line, children }: { n: number; title: string; line?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-center gap-3">
        <span aria-hidden className={STEP}>{n}</span>
        <h2 className={HEADING}>{title}</h2>
      </div>
      {line && <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{line}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PlanScreen() {
  const t = useT();
  const language = useLanguage();
  const hydrated = useHydrated();
  const settings = useSettings();
  const saved = useStore(mealPlanStore);
  const manifest = useShopManifest();
  const shops = recipeShops(manifest).map((r) => ({ id: r.id, name: r.name }));
  const [editing, setEditing] = useState(false);
  const [shop, setShop] = useState<string | null>(null);
  const [leaveOut, setLeaveOut] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [budgetText, setBudgetText] = useState("");
  const [day, setDay] = useState(0);
  const [retry, setRetry] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [noPlan, setNoPlan] = useState(false);

  // start the questions from the saved plan's answers (or the person's first shop that can make recipes)
  useEffect(() => {
    if (!hydrated) return;
    setShop((s) => s ?? saved?.shop ?? shops.find((x) => (settings.shops ?? []).includes(x.id))?.id ?? shops[0]?.id ?? null); // eslint-disable-line react-hooks/set-state-in-effect -- the answers start from what is saved
    if (saved) { setLeaveOut(saved.leaveOut); setBudgetText(saved.budget ? String(saved.budget) : ""); } // eslint-disable-line react-hooks/set-state-in-effect -- as above
  }, [hydrated, saved, shops.length]); // eslint-disable-line react-hooks/exhaustive-deps -- only when what is saved or the shops arrive

  const showing = saved && !editing;
  const planShop = showing ? saved.shop : shop;
  const products = useShopProducts(planShop, retry);
  const daily = macroTargets(settings);
  // each meal: the Recipes tab's meal size, and a share of the day's protein (three meals at 30% each), so the week reaches the person's protein too
  const meal = mealTargetFor(settings) ?? { kcal: mealSizes(settings.dailyCalories).normal };
  const target = { ...meal, protein: meal.protein ?? Math.round(daily.protein * 0.3) };
  const dietKey = JSON.stringify(settings.preferences);
  const leaveKey = (showing ? saved.leaveOut : leaveOut).join("|");
  const candidates = useMemo(
    () => (products.status === "ready" ? planCandidates(RECIPES, products.products, JSON.parse(dietKey), target, leaveKey ? leaveKey.split("|") : []) : null),
    [products, dietKey, target.kcal, target.protein, leaveKey], // eslint-disable-line react-hooks/exhaustive-deps -- the target's own numbers
  );
  const budget = (() => { const v = Number(budgetText.replace(/[£,\s]/g, "")); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null; })();
  const week = useMemo(() => (showing && candidates ? buildWeek(saved.ids, candidates, saved.budget) : null), [showing, candidates, saved]);
  const shopName = shops.find((s) => s.id === planShop)?.name ?? "";
  const file = products.status === "ready" ? products.file : null;
  const dayNames = useMemo(() => {
    const start = new Date(`${(saved?.start ?? today())}T12:00:00`);
    const f = new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday: "long" });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(start.getTime() + i * 86_400_000)));
  }, [saved?.start, language]);

  const make = () => {
    if (!candidates || !shop) return;
    setMaking(true);
    const plan = makePlan(candidates, budget);
    setMaking(false);
    if (!plan) { setNoPlan(true); return; }
    setNoPlan(false);
    mealPlanStore.set({ shop, ids: plan.ids, leaveOut, budget, start: today() } satisfies SavedPlan);
    setEditing(false);
    setDay(0);
    setAdded(null);
    window.scrollTo({ top: 0 });
  };

  const swap = (d: number, m: number) => {
    if (!saved || !candidates) return;
    const ids: PlanIds = swapMeal(saved.ids, d, m, candidates);
    mealPlanStore.set({ ...saved, ids });
    setAdded(null);
  };

  const addAll = () => {
    if (!week || !file) return;
    shoppingStore.update((list) => week.shopping.reduce((l, line) => addToList(l, { gtin: line.product.gtin, shopId: line.product.id, retailer: file.retailer, name: line.product.name, brand: "", size: "", price: line.product.price, checkedOn: file.checkedOn, ...withPhoto(shopPhotoSources(file, line.product)) }, new Date(), line.packs), list));
    setAdded(t("Added {n} products to your {shop} list.", { n: week.shopping.length, shop: shopName }));
  };

  if (!hydrated) return <Spinner />;

  // ---------- the questions ----------
  if (!showing) {
    const flip = (id: string) => setLeaveOut((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    const addTyped = () => {
      const w = typed.trim().toLowerCase().slice(0, 40);
      if (w.length >= 3 && !leaveOut.includes(w)) setLeaveOut((l) => [...l, w]);
      setTyped("");
    };
    const typedWords = leaveOut.filter((x) => !LEAVE_OUT.some((c) => c.id === x));
    return (
      <div className="pb-6">
        <BackLink href="/app/recipes" label={t("Back to recipes")} />
        <h1 className={H1}>{t("Plan my week")}</h1>
        <p className="mt-2 text-base leading-snug text-muted">{t("Answer a few questions and we'll plan a week of breakfasts, lunches and dinners from our recipes, with the shopping list and what each meal costs.")}</p>

        <Question n={1} title={t("Your daily target")} line={t("From your plan. Every meal is sized to about {kcal} kcal, like the recipes.", { kcal: formatInt(target.kcal) })}>
          <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
            <p className="app-numbers text-base font-bold">{t("{kcal} kcal and {protein} g protein a day", { kcal: formatInt(settings.dailyCalories), protein: formatInt(daily.protein) })}</p>
            <Link href="/app/settings#targets" className="inline-flex min-h-11 items-center rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-bold">{t("Change")}</Link>
          </div>
        </Question>

        <Question n={2} title={t("Your diet and allergies")} line={t("The same choices as in Settings: changing them here changes them everywhere.")}>
          <DietPicker value={settings.preferences} onChange={(p) => updateSettings({ preferences: p })} />
        </Question>

        <Question n={3} title={t("Foods you don't eat")} line={t("Tap any you'd like left out.")}>
          <div role="group" aria-label={t("Foods you don't eat")} className="flex flex-wrap gap-2">
            {LEAVE_OUT.map((c) => (
              <button key={c.id} type="button" aria-pressed={leaveOut.includes(c.id)} onClick={() => flip(c.id)} className={`${leaveOut.includes(c.id) ? CHIP_ON : CHIP} gap-1.5 px-4`}>
                {leaveOut.includes(c.id) && <CheckIcon aria-hidden className="h-4 w-4" />}{t(c.label)}
              </button>
            ))}
            {typedWords.map((w) => (
              <button key={w} type="button" aria-pressed onClick={() => flip(w)} className={`${CHIP_ON} gap-1.5 px-4`}><CheckIcon aria-hidden className="h-4 w-4" />{w}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }} placeholder={t("Something else, like sweetcorn")} aria-label={t("Another food to leave out")} className={`${inputClass} min-w-0 flex-1`} maxLength={40} />
            <Button variant="secondary" onClick={addTyped} disabled={typed.trim().length < 3}>{t("Add")}</Button>
          </div>
        </Question>

        <Question n={4} title={t("Your budget for the week")} line={t("What you'd like the week's shopping to cost at most. Leave it empty for no limit.")}>
          <label className="flex items-center gap-2">
            <span className="text-xl font-bold">£</span>
            <input inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value.slice(0, 8))} placeholder="50" aria-label={t("Budget for the week in pounds")} className={`${inputClass} app-numbers w-36`} />
          </label>
        </Question>

        <Question n={5} title={t("Where you shop")} line={t("Every ingredient is a real product at this shop, with its price.")}>
          {!manifest ? <Spinner /> : <ShopChoice shops={shops} value={shop} onChange={setShop} />}
        </Question>

        {noPlan && <p role="alert" className="glass mt-5 rounded-[1.25rem] p-4 font-semibold">{t("We couldn't make a week with these choices: there aren't enough of our recipes left for every meal. Try leaving out fewer foods.")}</p>}
        {products.status === "error" && <div className="mt-5"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>}

        <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-6 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
          <Button full className="min-h-14 text-lg" disabled={!candidates || !shop || making} onClick={make}>{candidates ? t("Make my plan") : t("Loading products")}</Button>
          {saved && <Button full variant="ghost" className="mt-1" onClick={() => setEditing(false)}>{t("Keep my plan")}</Button>}
        </div>
      </div>
    );
  }

  // ---------- the week ----------
  if (!week) {
    return (
      <div>
        <BackLink href="/app/recipes" label={t("Back to recipes")} />
        <h1 className={H1}>{t("Your week")}</h1>
        {products.status === "error" ? <div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
          : products.status === "loading" || !candidates ? <Spinner label={t("Loading products")} />
          : <div className="mt-4 space-y-3"><p className="glass rounded-[1.25rem] p-4">{t("Some recipes in your plan can't be made at this shop any more. Make a new plan.")}</p><Button full onClick={() => setEditing(true)}>{t("Make a new plan")}</Button></div>}
      </div>
    );
  }
  const today0 = week.days[day]!;
  const avg = (k: "kcal" | "protein") => Math.round(week.days.reduce((s, d) => s + d[k], 0) / week.days.length);
  return (
    <div className="pb-6">
      <BackLink href="/app/recipes" label={t("Back to recipes")} />
      <h1 className={H1}>{t("Your week")}</h1>
      <p className="mt-2 text-base leading-snug text-muted">{t("21 meals from our recipes, every ingredient from {shop}.", { shop: shopName })}</p>

      {/* the money first: what the shopping comes to, against the budget */}
      <div className={`${CARD} mt-4 p-4`}>
        <div className="flex items-center gap-3">
          <Pip mood={week.overBudget ? "think" : "cheer"} size={56} />
          <div className="min-w-0">
            <p className="app-numbers text-[1.75rem] font-[800] leading-none">{formatPrice(week.shoppingCost)}</p>
            <p className="mt-1 text-[0.9375rem] font-semibold text-muted">{t("for the week's shopping")}</p>
          </div>
        </div>
        <p className="mt-3 text-[0.9375rem] leading-snug">
          {week.budget === null ? t("No budget set.")
            : week.overBudget ? t("That's {over} over your {budget} budget: it's the cheapest week our recipes allow with your choices.", { over: formatPrice(week.shoppingCost - week.budget), budget: formatPrice(week.budget) })
            : t("Within your {budget} budget.", { budget: formatPrice(week.budget) })}
        </p>
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("The 21 meals use {meals} of it; the rest is food left over in the packs.", { meals: formatPrice(week.mealsCost) })}</p>
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{t("About {kcal} kcal and {protein} g protein a day from the three meals (your target is {target} kcal).", { kcal: formatInt(avg("kcal")), protein: formatInt(avg("protein")), target: formatInt(settings.dailyCalories) })}</p>
      </div>

      {/* the days: big buttons, the one showing is dark */}
      <div role="radiogroup" aria-label={t("Day")} className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        {dayNames.map((name, i) => (
          <button key={i} type="button" role="radio" aria-checked={day === i} onClick={() => setDay(i)} className={`min-h-12 shrink-0 rounded-full px-4 text-[0.9375rem] font-bold transition active:scale-95 ${day === i ? "bg-foreground text-background" : "glass"}`}>{name}</button>
        ))}
      </div>

      <section aria-labelledby="day-h" className="mt-4">
        <h2 id="day-h" className={HEADING}>{dayNames[day]}</h2>
        <ul className="mt-3 space-y-3">
          {today0.meals.map((m, i) => (
            <li key={m.meal} className={`${CARD} p-3`}>
              <p className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t(MEAL_LABEL[m.meal as "breakfast" | "lunch" | "dinner"])}</p>
              <div className="mt-2 flex items-center gap-3">
                <Link href={`/app/recipes/view?id=${m.candidate.recipe.id}&r=${planShop}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <RecipeThumb id={m.candidate.recipe.id} name={m.candidate.recipe.name} meal={m.meal} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug [overflow-wrap:anywhere]">{t(m.candidate.recipe.name)}</span>
                    <span className="app-numbers mt-0.5 block text-[0.875rem] text-muted">{formatInt(m.candidate.perServing.kcal)} kcal · {formatInt(m.candidate.perServing.protein)} g {t("protein")}</span>
                  </span>
                </Link>
                <span className="app-numbers shrink-0 text-end text-base font-[800]">{formatPrice(m.candidate.cost)}</span>
              </div>
              <button type="button" onClick={() => swap(day, i)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--fill)] px-4 text-[0.875rem] font-bold transition active:scale-95">
                <SwapIcon aria-hidden className="h-4 w-4" />{t("Swap this meal")}
              </button>
            </li>
          ))}
        </ul>
        <p className="app-numbers mt-3 px-1 text-[0.9375rem] font-semibold">{t("{day}: {kcal} kcal · {protein} g protein · {cost}", { day: dayNames[day]!, kcal: formatInt(today0.kcal), protein: formatInt(today0.protein), cost: formatPrice(today0.cost) })}</p>
      </section>

      <section aria-labelledby="buy-h" className="mt-8">
        <h2 id="buy-h" className={HEADING}>{t("What to buy for the week")}</h2>
        <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Every meal's amounts added up, as whole packs at {shop}.", { shop: shopName })}</p>
        <ul className={`${CARD} mt-3 divide-y divide-line overflow-hidden`}>
          {week.shopping.map((l) => (
            <li key={l.product.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="block font-semibold leading-snug">{l.packs > 1 ? `${l.packs} × ` : ""}{l.product.name}</span>
                {l.cupboard && <span className="mt-0.5 block text-[0.8125rem] text-muted">{t("You may have this already")}</span>}
              </span>
              <span className="app-numbers shrink-0 font-bold">{formatPrice(l.cost)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 bg-[var(--fill)] px-4 py-3 font-[800]"><span>{t("Total")}</span><span className="app-numbers">{formatPrice(week.shoppingCost)}</span></li>
        </ul>
        <p className="mt-2 px-1 text-[0.8125rem] leading-snug text-muted">{t("Prices are {shop}'s shelf prices and vary by store.", { shop: shopName })}</p>
      </section>

      <div className="mt-6 space-y-2.5">
        <Button variant="secondary" full className="min-h-12" onClick={() => setEditing(true)}>{t("Change my answers")}</Button>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
        <Button full className="min-h-14 text-lg" onClick={addAll}><PlusIcon aria-hidden className="h-5 w-5" />{t("Add all to my shopping list")}</Button>
        <p role="status" aria-live="polite" className="px-2 text-center text-[0.875rem] font-semibold text-accent">
          {added && <span className="mt-2 block">{added} <Link href="/app/groceries/list" className="underline underline-offset-2">{t("See list")}</Link></span>}
        </p>
      </div>
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PlanScreen />
    </Suspense>
  );
}
