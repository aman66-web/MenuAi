"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { MAX_SAVED_RECIPES, keepMadeRecipe, pantryLines } from "@/lib/mm/aiRecipe";
import { AI_MESSAGES, aiFailureMessage } from "@/lib/mm/aiConsent";
import { API_BASE, PAID_ACCESS_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { FRIDGE_MESSAGES, FRIDGE_MOODS, MAX_HAVE, MIN_HAVE_ITEMS, fridgeRecipeFromAi, haveItems, ingredientsYouHave, plainItem, readItems, recipesFromFridge, type FridgeMood, type FridgeRecipeRequest } from "@/lib/mm/fridgeRecipe";
import { tk } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import { mealSizes, type Recipe } from "@/lib/mm/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { myRecipesStore, paidStore } from "@/lib/mm/stores";
import { OfflineBanner, useAiConsent, useOnline } from "../../_components/AiConsentSheet";
import { CheckIcon, FridgeIcon, PlusIcon } from "../../_components/icons";
import { PageHeader } from "../../_components/PageHeader";
import { PremiumBadge } from "../../_components/PremiumBadge";
import { PipSays } from "../../_components/Mascot";
import { useGate } from "../../_components/Paywall";
import { Button, Card, ErrorBox, Spinner, inputClass } from "../../_components/ui";
import { useHydrated, useIsPro, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShop, useRecipeCards } from "../../_lib/recipes";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { CHIP, CHIP_ON, TITLE } from "../../groceries/PageBits";
import { RecipeDetail } from "../RecipeDetail";
import { RecipeTile } from "../RecipeTile";

// Cook with what you have (founder 2026-11-19: "people can write down what they have in their fridge, and then it can make some cool recipe which tastes nice
// based on all the stuff that they have"; "And based on what vibe of food they wanna eat"). The person types what they have (or taps the common things) and
// picks what they fancy; our own recipes that use most of it come first (free, on the phone); then Pip can make up a new one from it (Premium, the same
// server checks as Make it at home: lib/fridgeRecipeHandler.ts), saved to My recipes the moment it's made. Every number comes from the shop's real labels.
// The 20 November 2026 audit: Pip's permission sheet before the first request (AiConsentSheet.tsx) and the line under the button saying what is sent; a white
// "Ask Pip" card (no ink card, no cheering Pip on a disc); the working screen has Back and Stop (what was typed is kept) and a failure stays on it with Try
// again and Back, in view; the plans (never an error) when the server says Premium is needed; an offline line at the top.

const SERVINGS = 2;
/** Common things to tap in, for anyone who'd rather not type. */
const COMMON = [tk("eggs"), tk("chicken"), tk("mince"), tk("rice"), tk("pasta"), tk("potatoes"), tk("onion"), tk("peppers"), tk("tomatoes"), tk("spinach"), tk("cheese"), tk("tinned beans"), tk("tuna"), tk("yoghurt")];
const WORKING = [tk("Reading what you have…"), tk("Choosing the rest from {shop}…"), tk("Writing the steps…"), tk("Working out each serving's price and nutrition…")] as const;

export default function FridgePage() {
  return <Suspense fallback={<Spinner />}><Fridge /></Suspense>;
}

function Fridge() {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const paid = useStore(paidStore);
  const myRecipes = useStore(myRecipesStore);
  const online = useOnline();
  const access = PAID_ACCESS_ENABLED ? pro && !!paid.token : pro;
  const { gate, showPaywall } = useGate();
  const [text, setText] = useState("");
  const [mood, setMood] = useState<FridgeMood>("any");
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState<"form" | "working" | "error" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ recipe: Recipe; fromHome: string[] } | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [line, setLine] = useState(0);
  const results = useRef<HTMLElement>(null);
  const abort = useRef<AbortController | null>(null);
  // the person's usual recipe shop, used quietly for the sums (founder 2026-11-20: no "Shopping at" choice on this screen)
  const shop = recipeShop(manifest, null, settings.shops);
  const shopName = recipeShops(manifest).find((s) => s.id === shop)?.name ?? t("your shop");
  const consent = useAiConsent("fridgeRecipe", shopName);
  const products = useShopProducts(shop, 0);
  const ready = products.status === "ready" ? products : null;
  const diet = settings.preferences;
  const target = mealTargetFor(settings) ?? { kcal: mealSizes(settings.dailyCalories).normal };
  const items = haveItems(text);
  // what was typed as our recipes read it: a slip of the finger read as the food meant, and anything none of them uses named (usability test 2026-11-19: Pat)
  const reading = readItems(RECIPES, items);
  const itemsKey = reading.items.join("|");
  // worked out again only when what they have, the diet or the kind of food changes (the React Compiler keeps it between renders)
  const matches = shown ? recipesFromFridge(RECIPES, itemsKey ? itemsKey.split("|") : [], diet, 12, mood) : [];
  const { cards } = useRecipeCards(matches.map((m) => m.recipe), ready?.products ?? null, diet, target);
  const usesOf = new Map(matches.map((m) => [m.recipe.id, m.uses]));
  // the recipe opens with what the person has ticked "I have this", so Add all leaves it off the list
  const haveOf = new Map(matches.map((m) => [m.recipe.id, ingredientsYouHave(m.recipe, m.uses)]));
  const haveFor = (id: string) => { const keys = haveOf.get(id) ?? []; return keys.length ? `&have=${keys.join(",")}` : ""; };

  useEffect(() => { if (shown) results.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [shown]);
  useEffect(() => {
    if (step !== "working") return;
    const id = setInterval(() => setLine((n) => Math.min(n + 1, WORKING.length - 1)), 6000);
    return () => clearInterval(id);
  }, [step]);
  // each new screen (working, the failure, back to the form) starts at the top
  useEffect(() => { if (step !== "form") window.scrollTo({ top: 0 }); }, [step]);
  // leaving the page stops a request still on its way
  useEffect(() => () => abort.current?.abort(), []);

  // a tap adds the food to what was typed, or takes just that food out; the rest stays as the person wrote it ("leftover rice" stays "leftover rice")
  const flip = (word: string) => {
    const plain = plainItem(word);
    if (items.includes(plain)) {
      const kept = text.split(/[,;\n&]+|\band\b/).map((x) => x.trim()).filter((x) => x && haveItems(x)[0] !== plain);
      setText(kept.join(", "));
    } else setText(text.trim() ? `${text.trim().replace(/[,;&\s]+$/, "")}, ${word}` : word);
    setShown(false);
  };

  const write = async () => {
    if (items.length < MIN_HAVE_ITEMS || !ready || !shop) return;
    setError(null);
    setLine(0);
    setStep("working");
    // the shop's cupboard staples are worked out only here, when Pip is asked (founder 2026-11-19, "the animation is slow when a new one is selected": matching
    // every staple against the whole shop list on each shop change held the page up for about two seconds on a phone)
    const pantry = pantryLines(ready.products, diet);
    const body: FridgeRecipeRequest = { shop, servings: SERVINGS, target, diet, have: text.slice(0, MAX_HAVE), mood, pantry };
    abort.current = new AbortController();
    try {
      const res = await fetch(`${API_BASE}recipe/fridge`, { method: "POST", headers: { "Content-Type": "application/json", ...(paid.token ? { Authorization: `Bearer ${paid.token}` } : {}) }, body: JSON.stringify(body), signal: abort.current.signal });
      const json = (await res.json().catch(() => ({}))) as { recipe?: unknown; message?: string; error?: string };
      // the server's Premium check said no: the plans, never an error
      if (res.status === 402 || json.error === "premium") { setStep("form"); showPaywall("fridgeRecipe"); return; }
      const out = res.ok ? fridgeRecipeFromAi(json.recipe, body, `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`) : null;
      if (!out) { setError(aiFailureMessage({ status: res.ok ? 200 : res.status, message: json.message }, FRIDGE_MESSAGES.noRecipe)); setStep("error"); return; }
      // saved the moment it's made, like Make it at home (founder 2026-11-18)
      let madeRoom: string | null = null;
      myRecipesStore.update((l) => { const k = keepMadeRecipe(l, out.recipe, shop); madeRoom = k.dropped; return k.list; });
      setDropped(madeRoom);
      setMade(out);
      setStep("done");
    } catch (e) {
      // Stop (or leaving the page): back to what was typed, nothing to say
      if ((e as Error).name === "AbortError") return;
      setError(aiFailureMessage({ status: 0 }, AI_MESSAGES.connection, navigator.onLine !== false));
      setStep("error");
    }
  };
  /** "Make me a recipe": the plans for someone without Premium; otherwise Pip's permission (once), then the request. */
  const askPip = () => gate("fridgeRecipe", () => (access ? consent.ask(() => void write()) : showPaywall("fridgeRecipe")));
  /** Stop or Back while Pip works: the request is called off and the form comes back with everything as it was typed. */
  const stop = () => {
    abort.current?.abort();
    setError(null);
    setStep("form");
  };

  // the header every page has (colour meeting, 19 November 2026): Back with its word (the page before, else Recipes), the Shopping list pill, the Settings cog
  const back = <PageHeader back={{ href: "/app/recipes", label: t("Back to recipes") }} list />;
  if (!hydrated) return <Spinner />;

  if (step === "done" && made && ready && shop) {
    const fromHome = made.recipe.ingredients.filter((i) => made.fromHome.includes(i.pantry ?? i.key)).map((i) => t(i.label).toLowerCase());
    // whether it is in My recipes now (taken out there while this page was open: saving it again puts it back)
    const saved = myRecipes.some((r) => r.id === made.recipe.id);
    const save = () => { if (!saved) myRecipesStore.update((l) => keepMadeRecipe(l, made.recipe, shop).list); };
    return (
      <RecipeDetail
        recipe={made.recipe}
        files={[ready.file]}
        products={ready.products}
        backHref="/app/recipes"
        diet={diet}
        haveKeys={made.recipe.ingredients.filter((i) => made.fromHome.includes(i.pantry ?? i.key)).map((i) => i.key)}
        save={{ saved, onSave: save }}
        actions={
          <>
            {saved ? (
              <p role="status" className="glass rounded-[1.25rem] p-4 text-center font-semibold">
                {t("Saved to My recipes.")}
                {fromHome.length > 0 && <span className="mt-1.5 block text-[0.9375rem] font-medium text-muted">{t("From your kitchen: {things}.", { things: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(fromHome) })}</span>}
                {dropped && <span className="mt-1.5 block text-[0.9375rem] font-medium text-muted">{t("My recipes keeps {n}, so the oldest, {name}, made room.", { n: MAX_SAVED_RECIPES, name: dropped })}</span>}
              </p>
            ) : (
              <Button full className="min-h-14 text-base" onClick={save}>{t("Save this recipe")}</Button>
            )}
            <Button full variant="secondary" className="min-h-14 text-base" onClick={() => { setMade(null); setStep("form"); }}>{t("Make another")}</Button>
          </>
        }
      />
    );
  }

  if (step === "working" || step === "error") {
    return (
      <div className="pb-6">
        {/* Back calls the request off (or leaves the failure) and returns to the form, with what was typed kept */}
        <PageHeader back={{ onPress: stop }} />
        <h1 className={`mt-4 ${TITLE}`}>{step === "error" ? t("Ask Pip for a new recipe") : t("Pip is cooking something up")}</h1>
        {step === "error" ? (
          <>
            <div className="mt-5"><ErrorBox message={t(error ?? FRIDGE_MESSAGES.noRecipe)} onRetry={() => void write()} /></div>
            <Button full variant="secondary" className="mt-3 min-h-12" onClick={stop}>{t("Back")}</Button>
          </>
        ) : (
          <>
            {/* Pip hops in once and then stays still while he works (no hop every few seconds) */}
            <div className="mt-4"><PipSays mood="think" size={64} lively pulse="fridge">{t("Making a recipe from what you have.")}</PipSays></div>
            <ul role="status" aria-live="polite" className="glass mt-5 space-y-3 rounded-[1.25rem] p-4">
              {WORKING.slice(0, line + 1).map((w, i) => (
                <li key={w} className="flex items-center gap-3 text-[1.0625rem] font-semibold">
                  {/* a finished line: lime with the dark-green edge and a tick, as on every loading list */}
                  {i < line ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-on-sun bg-sun text-on-sun"><CheckIcon className="h-4 w-4" strokeWidth={3} /></span>
                    : <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />}
                  {t(w, { shop: shopName })}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-center"><Button variant="ghost" onClick={stop}>{t("Stop")}</Button></div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="pb-6">
      {back}
      <h1 className={`mt-4 ${TITLE}`}>{t("Cook with what you already have")}</h1>
      {!online && <OfflineBanner className="mt-4" />}
      <div className="mt-4"><PipSays mood="wave" size={64}>{t("Tell me what you have, and I'll find recipes that use it.")}</PipSays></div>

      <label htmlFor="have" className="mt-5 block text-lg font-[800]">{t("What do you have?")}</label>
      <textarea id="have" value={text} onChange={(e) => { setText(e.target.value.slice(0, MAX_HAVE)); setShown(false); }} rows={3} maxLength={MAX_HAVE}
        placeholder={t("For example: eggs, spinach, leftover rice")} className={`${inputClass} mt-2 min-h-[6rem] w-full py-3 text-base leading-snug`} />
      <p className="mt-2 text-[0.9375rem] font-semibold text-muted">{t("Or tap to add:")}</p>
      <div role="group" aria-label={t("Common things to add")} className="mt-2 flex flex-wrap gap-2">
        {COMMON.map((c) => {
          const word = t(c);
          const on = items.includes(plainItem(word.toLowerCase()));
          return (
            <button key={c} type="button" aria-pressed={on} onClick={() => flip(word.toLowerCase())} className={`${on ? CHIP_ON : CHIP} gap-1.5 px-4`}>
              {on ? <CheckIcon aria-hidden className="h-4 w-4" /> : <PlusIcon aria-hidden className="h-4 w-4" />}{word}
            </button>
          );
        })}
      </div>

      <h2 className="mt-6 text-lg font-[800]">{t("What do you fancy?")}</h2>
      <div role="radiogroup" aria-label={t("What do you fancy?")} className="mt-2 flex flex-wrap gap-2">
        {FRIDGE_MOODS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mood === m.id} onClick={() => { setMood(m.id); setShown(false); }} className={`${mood === m.id ? CHIP_ON : CHIP} px-4`}>{t(m.label)}</button>
        ))}
      </div>

      {/* while it can't be pressed, the reason sits above it (colour meeting: never a silent grey button) */}
      <Button full wrapClassName="mt-6" className={items.length ? "mt-6 min-h-14 text-lg" : "min-h-14 text-lg"} disabled={!items.length} reason={t("Type or tap at least one thing you have.")} onClick={() => setShown(true)}>{t("Show me recipes")}</Button>

      {shown && (
        <section ref={results} aria-labelledby="fridge-results" className="mt-8 scroll-mt-4">
          <h2 id="fridge-results" className="text-[1.375rem] font-[800] leading-tight">{t("Recipes that use what you have")}</h2>
          {(reading.fixed.length > 0 || reading.missing.length > 0) && (
            <div role="status" className="mt-3 space-y-1 rounded-[1.25rem] bg-[var(--fill)] p-4 text-[0.9375rem] leading-snug">
              {reading.fixed.map((f) => <p key={f.typed}>{t("I read “{typed}” as {read}.", { typed: f.typed, read: f.read })}</p>)}
              {reading.missing.length > 0 && <p className="font-semibold">{t("None of our recipes uses {things}. Check the spelling, or tap a food above.", { things: new Intl.ListFormat("en-GB", { type: "disjunction" }).format(reading.missing.map((m) => `“${m}”`)) })}</p>}
            </div>
          )}
          {!ready ? <Spinner label={t("Loading the recipes")} />
            : cards.length === 0 ? <p className="glass mt-3 rounded-[1.25rem] p-4 text-[0.9375rem] leading-snug">{mood === "any" ? t("None of our recipes uses these yet.") : t("None of our recipes of that kind uses these. Try Anything.")}</p>
            : (
              <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3">
                {cards.map((c) => {
                  const uses = usesOf.get(c.recipe.id) ?? [];
                  return (
                    // the tile fills the space above the line, so the line stays in view (usability test 2026-11-19: the tile's full height pushed it under the next card)
                    <li key={c.recipe.id} className="flex min-w-0 flex-col">
                      <div className="min-h-0 flex-1"><RecipeTile card={c} href={`/app/recipes/view?id=${c.recipe.id}&r=${shop}${haveFor(c.recipe.id)}`} /></div>
                      <p className="mt-1.5 px-1 text-[0.875rem] font-semibold leading-snug text-foreground">{t("Uses your {things}", { things: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(uses) })}</p>
                    </li>
                  );
                })}
              </ul>
            )}

          {/* Pip makes one up (Premium; on the website, where nothing is sold, this is hidden like Make it at home) */}
          {PHOTO_RECIPES_ENABLED && (
            // a white card with the line (the 20 November 2026 audit: the ink card with Pip cheering on a dark disc sat heavily under the priced tiles): the
            // fridge in a page-fill well, the light Premium badge, the main button in ink with its reason above it while it can't be pressed, and under it what
            // Pip is sent
            <Card className="mt-6 p-4">
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[0.875rem] bg-fill text-accent"><FridgeIcon className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[1.1875rem] font-[800] leading-tight">{t("Ask Pip for a new recipe")}</span>
                    <PremiumBadge />
                  </span>
                  <span className="mt-0.5 block text-[0.875rem] leading-snug text-muted">{t("From what you have, plus as little as possible from {shop}.", { shop: shopName })}</span>
                </span>
              </div>
              <Button
                full
                size="lg"
                wrapClassName="mt-3"
                className={ready && online && items.length >= MIN_HAVE_ITEMS ? "mt-3" : ""}
                onClick={askPip}
                disabled={!ready || !online || items.length < MIN_HAVE_ITEMS}
                reason={!online ? t(AI_MESSAGES.offline) : !ready ? t("Loading the recipes") : t(FRIDGE_MESSAGES.tooFew)}
              >
                {t("Make me a recipe")}
              </Button>
              <p className="mt-3 text-[0.8125rem] leading-snug text-muted">{t("Pip uses AI from Anthropic. We send your foods, what you fancy, your diet and allergies, the meal size and {shop} product list; never your name, email or account. We don't keep it.", { shop: shopName })}</p>
            </Card>
          )}
        </section>
      )}
      {consent.sheet}
    </div>
  );
}
