"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { MAX_SAVED_RECIPES, keepMadeRecipe, pantryLines } from "@/lib/mm/aiRecipe";
import { API_BASE, PAID_ACCESS_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { FRIDGE_MESSAGES, FRIDGE_MOODS, MAX_HAVE, MIN_HAVE_ITEMS, fridgeRecipeFromAi, haveItems, ingredientsYouHave, plainItem, readItems, recipesFromFridge, type FridgeMood, type FridgeRecipeRequest } from "@/lib/mm/fridgeRecipe";
import { tk } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { RECIPES } from "@/lib/mm/recipeBook";
import { mealSizes, type Recipe } from "@/lib/mm/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { myRecipesStore, paidStore } from "@/lib/mm/stores";
import { CheckIcon, FridgeIcon, PlusIcon } from "../../_components/icons";
import { PageHeader } from "../../_components/PageHeader";
import { PremiumBadge } from "../../_components/PremiumBadge";
import { Pip, PipSays } from "../../_components/Mascot";
import { useGate } from "../../_components/Paywall";
import { Button, Spinner, inputClass } from "../../_components/ui";
import { useHydrated, useIsPro, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeShop, useRecipeCards } from "../../_lib/recipes";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { CHIP, CHIP_ON, TITLE } from "../../groceries/PageBits";
import { RecipeDetail } from "../RecipeDetail";
import { RecipeTile } from "../RecipeTile";
import { ShopChoice } from "../ShopChoice";

// Cook with what you have (founder 2026-11-19: "people can write down what they have in their fridge, and then it can make some cool recipe which tastes nice
// based on all the stuff that they have"; "And based on what vibe of food they wanna eat"). The person types what they have (or taps the common things) and
// picks what they fancy; our own recipes that use most of it come first (free, on the phone); then Pip can make up a new one from it (Premium, the same
// server checks as Make it at home: lib/fridgeRecipeHandler.ts), saved to My recipes the moment it's made. Every number comes from the shop's real labels.

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
  const access = PAID_ACCESS_ENABLED ? pro && !!paid.token : pro;
  const { gate } = useGate();
  const [text, setText] = useState("");
  const [mood, setMood] = useState<FridgeMood>("any");
  const [shown, setShown] = useState(false);
  const [pickedShop, setPickedShop] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "working" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ recipe: Recipe; fromHome: string[] } | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [line, setLine] = useState(0);
  const results = useRef<HTMLElement>(null);
  const shop = pickedShop ?? recipeShop(manifest, null, settings.shops);
  const readyShops = recipeShops(manifest).map((r) => ({ id: r.id, name: r.name }));
  const shopName = readyShops.find((s) => s.id === shop)?.name ?? t("your shop");
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

  // a tap adds the food to what was typed, or takes just that food out; the rest stays as the person wrote it ("leftover rice" stays "leftover rice")
  const flip = (word: string) => {
    const plain = plainItem(word);
    if (items.includes(plain)) {
      const kept = text.split(/[,;\n&]+|\band\b/).map((x) => x.trim()).filter((x) => x && haveItems(x)[0] !== plain);
      setText(kept.join(", "));
    } else setText(text.trim() ? `${text.trim().replace(/[,;&\s]+$/, "")}, ${word}` : word);
    setShown(false);
  };

  const askPip = async () => {
    if (items.length < MIN_HAVE_ITEMS) { setError(t(FRIDGE_MESSAGES.tooFew)); return; }
    if (!ready || !shop) return;
    setError(null);
    setLine(0);
    setStep("working");
    // the shop's cupboard staples are worked out only here, when Pip is asked (founder 2026-11-19, "the animation is slow when a new one is selected": matching
    // every staple against the whole shop list on each shop change held the page up for about two seconds on a phone)
    const pantry = pantryLines(ready.products, diet);
    const body: FridgeRecipeRequest = { shop, servings: SERVINGS, target, diet, have: text.slice(0, MAX_HAVE), mood, pantry };
    try {
      const res = await fetch(`${API_BASE}recipe/fridge`, { method: "POST", headers: { "Content-Type": "application/json", ...(paid.token ? { Authorization: `Bearer ${paid.token}` } : {}) }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { recipe?: unknown; message?: string };
      const out = res.ok ? fridgeRecipeFromAi(json.recipe, body, `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`) : null;
      if (!out) { setError(json.message ?? t(FRIDGE_MESSAGES.noRecipe)); setStep("form"); return; }
      // saved the moment it's made, like Make it at home (founder 2026-11-18)
      let madeRoom: string | null = null;
      myRecipesStore.update((l) => { const k = keepMadeRecipe(l, out.recipe, shop); madeRoom = k.dropped; return k.list; });
      setDropped(madeRoom);
      setMade(out);
      setStep("done");
    } catch {
      setError(t("Couldn't reach Pip. Check your connection and try again."));
      setStep("form");
    }
  };

  // the header every page has (colour meeting, 19 November 2026): Back with its word (the page before, else Recipes), the Shopping list pill, the Settings cog
  const back = <PageHeader back={{ href: "/app/recipes", label: t("Back to recipes") }} list />;
  if (!hydrated) return <Spinner />;

  if (step === "done" && made && ready && shop) {
    const fromHome = made.recipe.ingredients.filter((i) => made.fromHome.includes(i.pantry ?? i.key)).map((i) => t(i.label).toLowerCase());
    return (
      <RecipeDetail
        recipe={made.recipe}
        files={[ready.file]}
        products={ready.products}
        backHref="/app/recipes"
        diet={diet}
        haveKeys={made.recipe.ingredients.filter((i) => made.fromHome.includes(i.pantry ?? i.key)).map((i) => i.key)}
        save={{ saved: true, onSave: () => {} }}
        actions={
          <>
            <p role="status" className="glass rounded-[1.25rem] p-4 text-center font-semibold">
              {t("Saved to My recipes. You can take it out there any time.")}
              {fromHome.length > 0 && <span className="mt-1.5 block text-[0.9375rem] font-medium text-muted">{t("From your kitchen: {things}.", { things: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(fromHome) })}</span>}
              {dropped && <span className="mt-1.5 block text-[0.9375rem] font-medium text-muted">{t("My recipes keeps {n}, so the oldest, {name}, made room.", { n: MAX_SAVED_RECIPES, name: dropped })}</span>}
            </p>
            <Button full variant="secondary" className="min-h-14 text-base" onClick={() => { setMade(null); setStep("form"); }}>{t("Make another")}</Button>
          </>
        }
      />
    );
  }

  if (step === "working") {
    return (
      <div className="pb-6">
        <h1 className={`mt-11 ${TITLE}`}>{t("Pip is cooking something up")}</h1>
        <div className="mt-4"><PipSays mood="think" size={72} lively pulse={line}>{t("Give me a moment: I'm making a recipe from what you have.")}</PipSays></div>
        <ul role="status" aria-live="polite" className="glass mt-5 space-y-3 rounded-[1.25rem] p-4">
          {WORKING.slice(0, line + 1).map((w, i) => (
            <li key={w} className="flex items-center gap-3 text-[1.0625rem] font-semibold">
              {i < line ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)]"><CheckIcon className="h-4 w-4" /></span>
                : <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />}
              {t(w, { shop: shopName })}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {back}
      <h1 className={`mt-4 ${TITLE}`}>{t("Cook with what you already have")}</h1>
      <div className="mt-4"><PipSays mood="wave" size={72}>{t("Tell me what's in your fridge and cupboards, and what you fancy. I'll find recipes that use it.")}</PipSays></div>

      <label htmlFor="have" className="mt-5 block text-lg font-[800]">{t("What do you have?")}</label>
      <textarea id="have" value={text} onChange={(e) => { setText(e.target.value.slice(0, MAX_HAVE)); setShown(false); }} rows={3} maxLength={MAX_HAVE}
        placeholder={t("For example: eggs, spinach, cheddar, leftover rice, half an onion")} className={`${inputClass} mt-2 min-h-[6rem] w-full py-3 text-base leading-snug`} />
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

      {readyShops.length > 1 && (
        <>
          <h2 className="mt-6 text-lg font-[800]">{t("Shopping at")}</h2>
          <div className="mt-2"><ShopChoice shops={readyShops} value={shop} onChange={(id) => { setPickedShop(id); setShown(false); }} /></div>
        </>
      )}

      <Button full className="mt-6 min-h-14 text-lg" disabled={!items.length} onClick={() => setShown(true)}>{t("Show me recipes")}</Button>
      {!items.length && <p className="mt-2 text-center text-[0.9375rem] font-semibold text-muted">{t("Type or tap at least one thing you have.")}</p>}

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
            // an ink card (colour meeting, 19 November 2026): white and light-grey words, the Premium badge in its on-ink look, and the main button white with
            // ink words (lime is never an action); .on-ink turns its focus rings lime
            <div className="on-ink mt-6 rounded-[1.5rem] bg-ink p-4 text-on-ink">
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[0.875rem] bg-ink-pressed"><Pip mood="cheer" size={40} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[1.1875rem] font-[800] leading-tight">{t("Ask Pip for a new recipe")}</span>
                    <PremiumBadge onInk />
                  </span>
                  <span className="mt-0.5 block text-[0.875rem] leading-snug text-on-ink-2">{t("Pip makes one up from what you have, adding as little as possible from {shop}.", { shop: shopName })}</span>
                </span>
              </div>
              {error && <p role="alert" className="mt-3 rounded-[1rem] bg-ink-pressed p-3 text-[0.9375rem] font-semibold">{error}</p>}
              <Button variant="onInk" full size="lg" className="mt-3" onClick={() => gate("fridgeRecipe", () => { if (access) void askPip(); })} disabled={!ready} reason={!ready ? t("Loading the recipes") : undefined}>
                <FridgeIcon aria-hidden className="h-5 w-5" />{t("Make me a recipe")}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
