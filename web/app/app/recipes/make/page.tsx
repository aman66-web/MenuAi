"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { MAX_WISH, pantryLines, recipeFromAi, recipeToSaved, type Meal, type RecipeRequest } from "@/lib/mm/aiRecipe";
import { mealSlotFor } from "@/lib/mm/budget";
import { tk } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { mealSizes, type Recipe } from "@/lib/mm/recipes";
import { myRecipesStore } from "@/lib/mm/stores";
import { site } from "@/site.config";
import { ALLERGEN_SHORT } from "../../_components/DietPicker";
import { CheckIcon, ChevronLeftIcon } from "../../_components/icons";
import { PipSays } from "../../_components/Mascot";
import { useGate } from "../../_components/Paywall";
import { Button, ErrorBox, inputClass, radioKeyNav, Spinner } from "../../_components/ui";
import { useHydrated, useIsPro, useSettings } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";
import { recipeShop, useRecipeMakerEnabled } from "../../_lib/recipes";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { MealPicker } from "../MealPicker";
import { RecipeDetail } from "../RecipeDetail";

// Pip's recipe maker: the person picks a few big buttons (and may type a wish), Pip writes a recipe with AI from their shop's real products,
// and the app works out every number from the labels (lib/mm/aiRecipe.ts). What is sent is said right above the button.

const MEAL_OPTIONS: ReadonlyArray<{ value: Meal; label: string }> = [
  { value: "breakfast", label: tk("Breakfast") },
  { value: "lunch", label: tk("Lunch") },
  { value: "dinner", label: tk("Dinner") },
];
const PEOPLE = [1, 2, 3, 4] as const;
const IDEAS = [tk("Something Italian"), tk("Quick and easy"), tk("A bit spicy"), tk("Comfort food"), tk("Something Mexican"), tk("A curry")];

function BigRadio<T extends string | number>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; render: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
      {options.map((o, i) => {
        const on = o === value;
        return (
          <button key={String(o)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o)} onKeyDown={(e) => radioKeyNav(e, i, options.length, (n) => onChange(options[n]!))}
            className={`relative flex min-h-14 items-center justify-center rounded-2xl border px-2 text-base font-extrabold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background" : "border-line bg-soft hover:bg-soft-strong"}`}>
            {on && <span aria-hidden className="bg-sun absolute -end-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full text-on-accent shadow"><CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /></span>}
            {render(o)}
          </button>
        );
      })}
    </div>
  );
}

type Phase = { kind: "form" } | { kind: "thinking" } | { kind: "done"; recipe: Recipe } | { kind: "error"; message: string };

function MakeScreen() {
  const t = useT();
  const poss = usePossessive();
  const asked = useSearchParams().get("r");
  const settings = useSettings();
  const manifest = useShopManifest();
  const shop = recipeShop(manifest, asked, settings.shops);
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const makerOn = useRecipeMakerEnabled();
  const [meal, setMeal] = useState<Meal>(() => mealSlotFor(new Date()));
  const [people, setPeople] = useState<number>(2);
  const [wish, setWish] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [savedId, setSavedId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const diet = settings.preferences;
  const dietKey = JSON.stringify(diet);
  const products = state.status === "ready" ? state.products : null;
  const pantry = useMemo(() => (products ? pantryLines(products, JSON.parse(dietKey)) : []), [products, dietKey]);
  const target = mealTargetFor(settings) ?? { kcal: mealSizes(settings.dailyCalories).normal };
  const ownShopName = manifest?.retailers.find((r) => r.id === shop)?.name;
  const shopName = ownShopName ?? t("your shop");
  const pro = useIsPro();
  const hydrated = useHydrated();
  const { showPaywall } = useGate();
  const words = [diet.vegetarianOnly && t("vegetarian"), diet.veganOnly && t("vegan"), diet.halalOnly && t("halal"), diet.noPork && t("no pork"), diet.noBeef && t("no beef"), ...(diet.avoidAllergens ?? []).map((a) => t("no {allergen}", { allergen: t(ALLERGEN_SHORT[a]).toLowerCase() }))].filter(Boolean);

  const make = async () => {
    if (!shop || pantry.length < 2) return;
    const body: RecipeRequest = { shop, meal, servings: people, target, diet, wish: wish.trim().slice(0, MAX_WISH), pantry };
    setPhase({ kind: "thinking" });
    setSavedId(null);
    window.scrollTo({ top: 0 });
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/v1/recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.current.signal });
      const json = (await res.json().catch(() => ({}))) as { recipe?: unknown; message?: string };
      if (!res.ok) { setPhase({ kind: "error", message: json.message ?? tk("Pip couldn't make a recipe this time. Please try again.") }); return; }
      const recipe = recipeFromAi(json.recipe, { servings: people, diet }, `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
      setPhase(recipe ? { kind: "done", recipe } : { kind: "error", message: tk("Pip's recipe didn't pass our checks. Please try again.") });
    } catch (e) {
      if ((e as Error).name === "AbortError") { setPhase({ kind: "form" }); return; }
      setPhase({ kind: "error", message: tk("Couldn't reach Pip. Check your connection and try again.") });
    }
  };

  const back = (<Link href={`/app/recipes${shop ? `?r=${shop}` : ""}`} aria-label={t("Back to recipes")} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>);

  if (!hydrated) return <Spinner />;

  if (!pro) {
    return (
      <div>
        {back}
        <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Ask {pip}")} values={{ pip: <span className="serif-em sun-text pe-0.5">Pip</span> }} /></h1>
        <div className="mt-4">
          <PipSays mood="wave" size={84}>{t("Making a new recipe just for you is part of {app} Pro. All our ready-made recipes stay free.", { app: site.name })}</PipSays>
        </div>
        <div className="mt-5 grid gap-3">
          <Button full className="min-h-14 text-lg" onClick={() => showPaywall("recipeMaker")}>{t("See Pro")}</Button>
          <Link href={`/app/recipes${shop ? `?r=${shop}` : ""}`} className="glass flex min-h-14 items-center justify-center rounded-full px-5 text-base font-bold">{t("Back to the recipes")}</Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "thinking") {
    return (
      <div>
        {back}
        <div role="status" aria-live="polite" className="mt-10 flex flex-col items-center text-center">
          <div className="w-full max-w-sm text-start"><PipSays mood="think" size={130}>{t("I'm writing your recipe now…")}</PipSays></div>
          <p className="mt-4 text-lg font-semibold">{t("Picking products from {shop} and fitting them to your meal.", { shop: shopName })}</p>
          <p className="mt-1 text-muted">{t("This usually takes 10 to 30 seconds.")}</p>
          <span aria-hidden className="mt-5 flex gap-2"><i className="dot-pulse" /><i className="dot-pulse [animation-delay:150ms]" /><i className="dot-pulse [animation-delay:300ms]" /></span>
          <Button variant="ghost" className="mt-6" onClick={() => abort.current?.abort()}>{t("Stop")}</Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "done" && state.status === "ready" && shop) {
    const recipe = phase.recipe;
    return (
      <div>
        {back}
        <RecipeDetail
          recipe={recipe}
          file={state.file}
          products={state.products}
          actions={
            <>
              {savedId ? (
                <p role="status" className="glass rounded-3xl p-4 text-center font-semibold">{t("Saved to Your recipes.")} <Link href={`/app/recipes/view?mine=${savedId}&r=${shop}`} className="text-accent underline underline-offset-2">{t("Open it")}</Link></p>
              ) : (
                <Button full className="min-h-14 text-base" onClick={() => { myRecipesStore.update((l) => [recipeToSaved(recipe, shop), ...l.filter((s) => s.id !== recipe.id)].slice(0, 30)); setSavedId(recipe.id); }}>{t("Save this recipe")}</Button>
              )}
              <Button full variant="secondary" className="min-h-14 text-base" onClick={() => setPhase({ kind: "form" })}>{t("Make another")}</Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {back}
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Ask {pip}")} values={{ pip: <span className="serif-em sun-text pe-0.5">Pip</span> }} /></h1>
      <div className="mt-4">
        <PipSays mood="wave" size={84}>{ownShopName ? t("What shall I make? Tap a few buttons and I'll write a recipe from {shop} products.", { shop: poss(ownShopName) }) : t("What shall I make? Tap a few buttons and I'll write a recipe from your shop's products.")}</PipSays>
      </div>

      {phase.kind === "error" && <div className="mt-4"><ErrorBox message={t(phase.message)} onRetry={make} /></div>}
      {makerOn === false && (
        <p className="glass mt-4 rounded-3xl p-4 font-semibold">{t("Pip's recipe maker isn't switched on yet. Our own recipes are ready to use.")}</p>
      )}

      <section aria-labelledby="meal-q" className="mt-5">
        <h2 id="meal-q" className="mb-2 text-base font-extrabold">{t("Which meal?")}</h2>
        <BigRadio label={t("Which meal")} options={MEAL_OPTIONS.map((m) => m.value)} value={meal} onChange={setMeal} render={(v) => t(MEAL_OPTIONS.find((m) => m.value === v)!.label)} />
      </section>
      <section aria-labelledby="people-q" className="mt-5">
        <h2 id="people-q" className="mb-2 text-base font-extrabold">{t("How many people?")}</h2>
        <BigRadio label={t("How many people")} options={PEOPLE} value={people as (typeof PEOPLE)[number]} onChange={setPeople} render={(v) => String(v)} />
      </section>
      <div className="mt-5"><MealPicker /></div>

      <section aria-labelledby="wish-q" className="mt-5">
        <h2 id="wish-q" className="text-base font-extrabold">{t("Anything you'd like?")} <span className="font-medium text-muted">{t("(you can skip this)")}</span></h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {IDEAS.map((key) => {
            // the idea in the reader's language: it fills the box as shown (Pip understands it either way)
            const idea = t(key);
            return (
              <button key={key} type="button" aria-pressed={wish === idea} onClick={() => setWish(wish === idea ? "" : idea)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.97] ${wish === idea ? "border-transparent bg-foreground text-background" : "border-line bg-soft hover:bg-soft-strong"}`}>{idea}</button>
            );
          })}
        </div>
        <label className="mt-3 block text-sm font-semibold">{t("Or type it")}
          <input className={`${inputClass} mt-1 min-h-12 text-lg`} value={wish} maxLength={MAX_WISH} onChange={(e) => setWish(e.target.value)} placeholder={t("For example: something with chicken")} enterKeyHint="done" />
        </label>
      </section>

      <p className="mt-4 px-1 text-sm"><span className="font-bold">{t("Your diet:")}</span> {words.length ? words.join(" · ") : t("nothing left out")} <Link href="/app/settings" className="inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-4">{t("Change")}</Link></p>

      {!manifest || (shop && state.status === "loading") ? (
        <Spinner label={t("Loading products")} />
      ) : state.status === "error" ? (
        <div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : (
        <div className="mt-4">
          <Button full className="min-h-14 text-lg" disabled={pantry.length < 2 || makerOn === false} onClick={make}>{t("Make my recipe")}</Button>
          <p className="mt-3 text-xs text-muted">
            {t("Pip uses AI from Anthropic (the company that makes Claude). To write your recipe we send your choices on this page (meal, people, meal size, diet and anything you typed) and the list of {shop} products it may use. Nothing about you, and nothing is kept. The numbers you see are worked out from the products' own labels.", { shop: shopName })}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MakePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MakeScreen />
    </Suspense>
  );
}
