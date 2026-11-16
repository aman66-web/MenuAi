"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, PAID_ACCESS_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { tk } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { MAX_DESCRIPTION, PHOTO_WORKING_LINES, needsMoreDetail, photoRecipeFromAi, type PhotoRecipeRequest } from "@/lib/mm/photoRecipe";
import { pantryLines, recipeToSaved } from "@/lib/mm/aiRecipe";
import { mealSizes, type Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, paidStore, updateSettings } from "@/lib/mm/stores";
import { CameraIcon, CheckIcon, ChevronLeftIcon, GridIcon } from "../../_components/icons";
import { Pip, PipSays } from "../../_components/Mascot";
import { useGate } from "../../_components/Paywall";
import { ShopPicker } from "../../_components/ShopPicker";
import { Button, ErrorBox, inputClass, Spinner } from "../../_components/ui";
import { backName, useBack } from "../../_lib/backNav";
import { useHydrated, useIsPro, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { shrinkPhoto, type ShrunkPhoto } from "../../_lib/photo";
import { recipeShop } from "../../_lib/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { RecipeDetail } from "../RecipeDetail";

// Make it at home (founder 2026-11-16): take a photo of a dish (or pick a screenshot), say what it is in as much detail as you can, choose your supermarkets,
// press Generate, and Pip writes a home version from real products at the shop, with every number worked out from their labels (lib/mm/photoRecipe.ts).
// Premium only, and the whole page exists only while PHOTO_RECIPES_ENABLED (lib/mm/config.ts). The photo is made smaller on the phone first (_lib/photo.ts).

type Step = "photo" | "describe" | "shops" | "working" | "done" | "error";
const SERVINGS = 2;
const WORKING_STEP_MS = 2200;

const H1 = "mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]";
const H2 = "text-[1.25rem] font-bold leading-tight tracking-[-0.01em]";

/** The lines while Pip works: each ticks off in turn, and the last keeps spinning until the recipe is back. */
function Working({ shopName, finished }: { shopName: string; finished: boolean }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const last = PHOTO_WORKING_LINES.length - 1;
  useEffect(() => {
    if (step >= last) return;
    const timer = setTimeout(() => setStep(step + 1), WORKING_STEP_MS);
    return () => clearTimeout(timer);
  }, [step, last]);
  const shown = finished ? PHOTO_WORKING_LINES.length : step;
  return (
    <div className="mt-8">
      <div className="flex justify-center"><Pip mood={finished ? "cheer" : "think"} size={110} /></div>
      <p role="status" aria-live="polite" className="sr-only">{t(PHOTO_WORKING_LINES[Math.min(shown, last)]!, { shop: shopName })}</p>
      <ul aria-hidden className="mx-auto mt-6 max-w-sm space-y-3.5">
        {PHOTO_WORKING_LINES.map((line, i) => (
          <li key={line} className={`flex items-center gap-3 text-[1.0625rem] font-semibold transition-colors ${i <= shown ? "text-foreground" : "text-muted"}`}>
            {i < shown ? (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)]"><CheckIcon className="h-4 w-4" /></span>
            ) : i === shown ? (
              <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-[rgba(17,24,20,0.1)] border-t-[var(--bar)] motion-reduce:animate-none" />
            ) : (
              <span className="h-7 w-7 shrink-0 rounded-full border-[3px] border-[rgba(17,24,20,0.1)]" />
            )}
            <span>{t(line, { shop: shopName })}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-muted">{t("This usually takes 10 to 30 seconds.")}</p>
    </div>
  );
}

function PhotoScreen() {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const paid = useStore(paidStore);
  // Premium here means a checked paid token (the server checks it again); a test build that previews Pro has no payments, so Pro is enough there.
  const access = PAID_ACCESS_ENABLED ? pro && !!paid.token : pro;
  const { showPaywall } = useGate();
  const nav = useBack("/app/recipes");

  const [step, setStep] = useState<Step>("photo");
  const [photo, setPhoto] = useState<ShrunkPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [description, setDescription] = useState("");
  const [nudged, setNudged] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [shops, setShops] = useState<string[]>(() => settings.shops ?? []);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [finished, setFinished] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const abort = useRef<AbortController | null>(null);

  const shop = recipeShop(manifest, null, shops.length ? shops : settings.shops);
  const shopName = manifest?.retailers.find((r) => r.id === shop)?.name ?? t("your shop");
  const [retry, setRetry] = useState(0);
  const products = useShopProducts(shop, retry);
  const diet = settings.preferences;
  const dietKey = JSON.stringify(diet);
  const ready = products.status === "ready" ? products : null;
  const pantry = useMemo(() => (ready ? pantryLines(ready.products, JSON.parse(dietKey)) : []), [ready, dietKey]);
  const target = mealTargetFor(settings) ?? { kcal: mealSizes(settings.dailyCalories).normal };
  const onlyOneShop = recipeShops(manifest).length <= 1;

  // each new step starts at the top with its heading focused (a screen reader hears where it is)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus(); }, [step]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReadingPhoto(true);
    setPhotoError(false);
    const shrunk = await shrinkPhoto(file);
    setReadingPhoto(false);
    if (!shrunk) { setPhotoError(true); return; }
    setPhoto(shrunk);
  };

  const headers = (): Record<string, string> => ({ "Content-Type": "application/json", ...(paid.token ? { Authorization: `Bearer ${paid.token}` } : {}) });

  const suggest = async () => {
    if (!photo) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch(`${API_BASE}recipe/photo/describe`, { method: "POST", headers: headers(), body: JSON.stringify({ image: photo.base64 }) });
      const json = (await res.json().catch(() => ({}))) as { description?: unknown; message?: string };
      if (res.ok && typeof json.description === "string") {
        setDescription(json.description.slice(0, MAX_DESCRIPTION));
        setNudged(false);
      } else setSuggestError(json.message ?? tk("Pip couldn't suggest a description this time. Please type what the dish is."));
    } catch {
      setSuggestError(tk("Couldn't reach Pip. Check your connection and try again."));
    }
    setSuggesting(false);
  };

  const next = () => {
    if (needsMoreDetail(description) && !nudged) { setNudged(true); return; }
    setStep("shops");
  };

  const generate = async () => {
    if (!photo || !shop || pantry.length < 2) return;
    updateSettings({ shops: shops.length ? shops : undefined });
    const body: PhotoRecipeRequest = { shop, servings: SERVINGS, target, diet, description: description.trim().slice(0, MAX_DESCRIPTION), image: photo.base64, pantry };
    setStep("working");
    setFinished(false);
    setSavedId(null);
    abort.current = new AbortController();
    try {
      const res = await fetch(`${API_BASE}recipe/photo`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: abort.current.signal });
      const json = (await res.json().catch(() => ({}))) as { recipe?: unknown; message?: string };
      if (!res.ok) { setError(json.message ?? tk("Pip couldn't make a recipe from this photo. Please try again, maybe with more detail about the dish.")); setStep("error"); return; }
      const made = photoRecipeFromAi(json.recipe, { servings: SERVINGS, diet }, `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
      if (!made) { setError(tk("Pip's recipe didn't pass our checks. Please try again.")); setStep("error"); return; }
      setFinished(true);
      setRecipe(made);
      // a moment on the ticked list, then the recipe
      setTimeout(() => setStep("done"), 700);
    } catch (e) {
      if ((e as Error).name === "AbortError") { setStep("shops"); return; }
      setError(tk("Couldn't reach Pip. Check your connection and try again."));
      setStep("error");
    }
  };

  const goBack = () => {
    if (step === "describe") setStep("photo");
    else if (step === "shops") setStep("describe");
    else if (step === "error") setStep("shops");
  };
  const inFlow = step === "describe" || step === "shops" || step === "error";
  const back = inFlow ? (
    <button type="button" onClick={goBack} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full ps-2.5 pe-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></button>
  ) : (
    <Link href={nav.href} onClick={nav.onClick} aria-label={backName(t("Back"), t("Back to recipes"), nav.cameFromApp)} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
  );

  if (!hydrated) return <Spinner />;
  if (!access) {
    return (
      <div>
        {back}
        <h1 className={H1}>{t("Make it at home")}</h1>
        <div className="mt-4"><PipSays mood="wave" size={84}>{t("Make it at home is part of Premium. Snap a dish you've loved and I'll write a recipe you can cook from your supermarket.")}</PipSays></div>
        <div className="mt-5 grid gap-3">
          <Button full className="min-h-14 text-lg" onClick={() => showPaywall("photoRecipe")}>{t("See Premium")}</Button>
          <Link href={nav.href} onClick={nav.onClick} replace className="glass flex min-h-14 items-center justify-center rounded-full px-5 text-base font-bold">{t("Back to the recipes")}</Link>
        </div>
      </div>
    );
  }

  if (step === "done" && recipe && ready && shop) {
    return (
      <RecipeDetail
        recipe={recipe}
        file={ready.file}
        products={ready.products}
        backHref="/app/recipes"
        photo={photo?.url}
        actions={
          <>
            {savedId ? (
              <p role="status" className="glass rounded-[1.25rem] p-4 text-center font-semibold">{t("Saved to Your recipes.")} <Link href={`/app/recipes/view?mine=${savedId}&r=${shop}`} className="text-accent underline underline-offset-2">{t("Open it")}</Link></p>
            ) : (
              <Button full className="min-h-14 text-base" onClick={() => { myRecipesStore.update((l) => [recipeToSaved(recipe, shop), ...l.filter((s) => s.id !== recipe.id)].slice(0, 30)); setSavedId(recipe.id); }}>{t("Save this recipe")}</Button>
            )}
            <Button full variant="secondary" className="min-h-14 text-base" onClick={() => { setRecipe(null); setPhoto(null); setDescription(""); setNudged(false); setStep("photo"); }}>{t("Make another")}</Button>
          </>
        }
      />
    );
  }

  return (
    <div>
      {back}
      <h1 ref={heading} tabIndex={-1} className={`${H1} outline-none`}>{t("Make it at home")}</h1>

      {step === "photo" && (
        <>
          <div className="mt-4"><PipSays mood="wave" size={84}>{t("Snap a dish you've loved, or pick a screenshot, and I'll write a recipe you can cook from your supermarket.")}</PipSays></div>
          {photo ? (
            <div className="mt-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local photo on this phone, not a site image */}
              <img src={photo.url} alt={t("Your photo")} className="aspect-[4/3] w-full rounded-[1.25rem] object-cover" />
              <div className="mt-3 grid gap-3">
                <Button full className="min-h-14 text-lg" onClick={() => setStep("describe")}>{t("Next")}</Button>
                <Button full variant="secondary" className="min-h-12" onClick={() => library.current?.click()}>{t("Change photo")}</Button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              <Button full className="min-h-16 text-lg" onClick={() => camera.current?.click()} disabled={readingPhoto}><CameraIcon className="h-6 w-6" />{t("Take a photo")}</Button>
              <Button full variant="secondary" className="min-h-16 text-lg" onClick={() => library.current?.click()} disabled={readingPhoto}><GridIcon className="h-6 w-6" />{t("Choose from your photos")}</Button>
              {readingPhoto && <Spinner label={t("Getting your photo ready")} />}
              {photoError && <p role="alert" className="glass rounded-[1.25rem] p-4 font-semibold">{t("That photo couldn't be opened. Please try another one.")}</p>}
            </div>
          )}
          {/* the phone's own camera and photo picker (the iPhone app has camera access for the barcode scanner already) */}
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={library} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </>
      )}

      {step === "describe" && photo && (
        <section aria-labelledby="describe-q" className="mt-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local photo on this phone */}
            <img src={photo.url} alt="" className="h-20 w-20 shrink-0 rounded-[1rem] object-cover" />
            <h2 id="describe-q" className={H2}>{t("What's in the photo?")}</h2>
          </div>
          <p id="describe-help" className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("Be as specific as you can: the flavour, the sauce and how it's cooked. For example, 'peri-peri chicken wings with spicy rice', not just 'chicken wings'.")}</p>
          <textarea
            aria-labelledby="describe-q"
            aria-describedby={`describe-help${nudged && needsMoreDetail(description) ? " describe-nudge" : ""}`}
            className={`${inputClass} mt-3 min-h-28 text-lg leading-snug`}
            value={description}
            maxLength={MAX_DESCRIPTION}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("For example: peri-peri chicken wings with spicy rice and coleslaw")}
          />
          <Button full variant="secondary" className="mt-3 min-h-12" onClick={suggest} disabled={suggesting}>{suggesting ? <Spinner label={t("Pip is looking at your photo")} /> : t("Suggest from my photo")}</Button>
          {suggestError && <p role="alert" className="mt-3 text-[0.9375rem] font-semibold">{t(suggestError)}</p>}
          {nudged && needsMoreDetail(description) && (
            <p id="describe-nudge" role="alert" className="glass mt-3 rounded-[1.25rem] p-4 font-semibold">{t("Add a bit more, like the flavour or sauce, so the recipe matches your photo.")}</p>
          )}
          <Button full className="mt-5 min-h-14 text-lg" disabled={!description.trim()} onClick={next}>{nudged && needsMoreDetail(description) ? t("Carry on anyway") : t("Next")}</Button>
        </section>
      )}

      {(step === "shops" || step === "error") && (
        <section aria-labelledby="shops-q" className="mt-5">
          <h2 id="shops-q" className={H2}>{t("Where do you shop?")}</h2>
          <div className="mt-3"><ShopPicker value={shops} onChange={setShops} /></div>
          {onlyOneShop && shop && <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("For now, recipes use {shop} products, the shop whose labels we've read. More supermarkets will come as we read theirs.", { shop: shopName })}</p>}
          {step === "error" && error && <div className="mt-4"><ErrorBox message={t(error)} onRetry={generate} /></div>}
          {!manifest || (shop && products.status === "loading") ? (
            <Spinner label={t("Loading products")} />
          ) : products.status === "error" ? (
            <div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
          ) : (
            <>
              <Button full className="mt-5 min-h-14 text-lg" disabled={pantry.length < 2} onClick={generate}>{t("Generate my recipe")}</Button>
              <p className="mt-3 text-[0.8125rem] leading-snug text-muted">
                {t("Pip uses AI from Anthropic (the company that makes Claude). To write your recipe we send your photo (made smaller on your phone first), your description, your diet choices and the list of {shop} products it may use. Nothing about you, and nothing is kept. The numbers you see are worked out from the products' own labels.", { shop: shopName })}
              </p>
            </>
          )}
        </section>
      )}

      {step === "working" && (
        <>
          <Working shopName={shopName} finished={finished} />
          <div className="mt-6 flex justify-center"><Button variant="ghost" onClick={() => abort.current?.abort()}>{t("Stop")}</Button></div>
        </>
      )}
    </div>
  );
}

/** While the feature is off (lib/mm/config.ts), its address opens the recipes instead. */
function ForwardToRecipes() {
  const router = useRouter();
  useEffect(() => { router.replace("/app/recipes"); }, [router]);
  return <Spinner />;
}

export default function PhotoRecipePage() {
  if (!PHOTO_RECIPES_ENABLED) return <ForwardToRecipes />;
  return (
    <Suspense fallback={<Spinner />}>
      <PhotoScreen />
    </Suspense>
  );
}
