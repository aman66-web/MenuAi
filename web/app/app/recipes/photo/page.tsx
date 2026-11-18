"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, PAID_ACCESS_ENABLED, PHOTO_RECIPES_ENABLED } from "@/lib/mm/config";
import { tk } from "@/lib/mm/i18n";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import { MAX_DESCRIPTION, PHOTO_WORKING_LINES, needsMoreDetail, photoRecipeFromAi, type PhotoRecipeRequest } from "@/lib/mm/photoRecipe";
import { MAX_SAVED_RECIPES, keepMadeRecipe, pantryLines } from "@/lib/mm/aiRecipe";
import { mealSizes, type Recipe } from "@/lib/mm/recipes";
import { myRecipesStore, paidStore, updateSettings } from "@/lib/mm/stores";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "../../_components/icons";
import { AllergenTiles, DIETS, PickTile } from "../../_components/DietPicker";
import { toggleAllergen, toggleDiet } from "@/lib/mm/menu-view";
import type { Preferences } from "@/lib/mm/types";
import { Pip, PipSays } from "../../_components/Mascot";
import { useGate } from "../../_components/Paywall";
import { Button, ErrorBox, inputClass, Spinner } from "../../_components/ui";
import { backName, useBack } from "../../_lib/backNav";
import { useHydrated, useIsPro, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { recipeThumbnail, shrinkPhoto, type ShrunkPhoto } from "../../_lib/photo";
import { keepRecipePhoto } from "../../_lib/recipePhotos";
import { recipeShop } from "../../_lib/recipes";
import { recipeShops } from "@/lib/mm/shopProducts";
import { useShopManifest, useShopProducts } from "../../_lib/shopProducts";
import { RecipeDetail } from "../RecipeDetail";
import { ShopChoice } from "../ShopChoice";
import { PhotoCamera, ScanningPhoto } from "./PhotoCamera";

// Make it at home (founder 2026-11-16, new order 2026-11-17): the name of the dish and a short description (they help Pip choose the right ingredients), then the
// camera with a scanning look (PhotoCamera.tsx), a couple of seconds of "Scanning", the supermarket, Next, a loading screen while Pip writes it, and the recipe
// with the person's photo on top from real products at the shop, every number worked out from their labels (lib/mm/photoRecipe.ts).
// Premium only, and the whole page exists only while PHOTO_RECIPES_ENABLED (lib/mm/config.ts). The photo is made smaller on the phone first (_lib/photo.ts).

type Step = "describe" | "camera" | "scanning" | "shops" | "working" | "done" | "error";
type FoodCheck = "food" | "notFood" | "unknown";
const SERVINGS = 2;
/** The name and the description are joined into the one sentence the API takes (MAX_DESCRIPTION), so these two add up to less than that. */
const MAX_NAME = 80;
const MAX_ABOUT = 215;
/** The working lines tick off over about half a minute (the recipe is written at high effort, so it can take up to a minute); the last keeps spinning until it is back. */
const WORKING_STEP_MS = 8000;

const H1 = "mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]";
const H2 = "text-[1.25rem] font-bold leading-tight tracking-[-0.01em]";
/** The lime circle with the part's number (1 name, 2 description, 3 what to exclude). */
const STEP_NUMBER = "app-numbers grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sun text-[1.25rem] font-[800] text-[var(--on-accent)]";
const PICK_GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2";
const PICK_LABEL = "text-[0.9375rem] font-semibold leading-snug";

/** The loading screen while Pip works: the person's photo with a light sliding over it, a bar that fills, and the lines that tick off in turn (the last keeps spinning until the recipe is back). */
function Working({ shopName, finished, photoUrl }: { shopName: string; finished: boolean; photoUrl: string | null }) {
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
    <div className="mt-6">
      <div className="work-glow relative aspect-[4/3] w-full overflow-hidden rounded-[1.75rem] bg-soft-strong">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a local photo on this phone, not a site image
          <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div aria-hidden className="absolute inset-0 bg-[rgba(17,24,20,0.32)]" />
        <div aria-hidden className="work-shimmer" />
        <div aria-hidden className="absolute bottom-2 end-3"><Pip mood={finished ? "cheer" : "think"} size={68} /></div>
      </div>
      <div aria-hidden className="mt-5 h-2.5 overflow-hidden rounded-full bg-[rgba(17,24,20,0.08)]">
        <div className={`h-full rounded-full bg-[var(--bar)] ${finished ? "w-full" : "work-bar"}`} />
      </div>
      <p role="status" aria-live="polite" className="sr-only">{t(PHOTO_WORKING_LINES[Math.min(shown, last)]!, { shop: shopName })}</p>
      <ul aria-hidden className="mx-auto mt-5 max-w-sm space-y-3.5">
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
      <p className="mt-5 text-center text-muted">{t("This can take up to a minute, so Pip can get every detail right.")}</p>
    </div>
  );
}

/** Where the person is: the dish, the photo, the shop. */
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const t = useT();
  const labels = [t("Dish"), t("Photo"), t("Shop")];
  return (
    <ol aria-label={t("Steps")} className="mt-5 grid grid-cols-3 gap-2.5">
      {labels.map((label, i) => {
        const n = i + 1;
        const on = n <= current;
        return (
          <li key={label} aria-current={n === current ? "step" : undefined} className="min-w-0">
            <span aria-hidden className={`block h-1.5 rounded-full transition-colors ${on ? "bg-[var(--bar)]" : "bg-[rgba(17,24,20,0.1)]"}`} />
            <span className={`mt-1.5 block truncate text-[0.8125rem] font-bold uppercase tracking-[0.08em] ${n === current ? "text-foreground" : "text-muted"}`}>{n}. {label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The dish's name and its short description as the one sentence the API takes. */
function dishText(name: string, about: string): string {
  const n = name.trim().replace(/[.\s]+$/, "");
  const d = about.trim();
  return (d ? `${n}. ${d}` : n).slice(0, MAX_DESCRIPTION);
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

  const [step, setStep] = useState<Step>("describe");
  const [photo, setPhoto] = useState<ShrunkPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  // While "Scanning", Pip checks the photo shows food (the describe route); a photo of anything else goes back to the camera with this note (founder 2026-11-17)
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const foodCheck = useRef<Promise<FoodCheck> | null>(null);
  const stepNow = useRef<Step>("describe");
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [nudged, setNudged] = useState(false);
  // One shop for the recipe (founder 2026-11-17: "they should only be allowed to choose one shop on this screen"); it starts with the person's first shop that can make recipes
  const [pickedShop, setPickedShop] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [finished, setFinished] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // the saved recipe that made room when the list was full (keepMadeRecipe), said once
  const [dropped, setDropped] = useState<string | null>(null);
  const phoneCamera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const abort = useRef<AbortController | null>(null);

  const shop = pickedShop ?? recipeShop(manifest, null, settings.shops);
  const readyShops = recipeShops(manifest).map((r) => ({ id: r.id, name: r.name }));
  // the person's own shops whose labels we haven't read enough of to make recipes (named under the list, as on the Recipes page)
  const unreadShops = (manifest?.retailers ?? []).filter((r) => (settings.shops ?? []).includes(r.id) && !readyShops.some((x) => x.id === r.id)).map((r) => r.name);
  const shopName = manifest?.retailers.find((r) => r.id === shop)?.name ?? t("your shop");
  const [retry, setRetry] = useState(0);
  const products = useShopProducts(shop, retry);
  // What to exclude (founder 2026-11-17): starts with the diet in Settings; a change here is for this recipe only and is what the pantry, the request and the checks use
  const [ownDiet, setOwnDiet] = useState<Preferences | null>(null);
  const diet = ownDiet ?? settings.preferences;
  const [allergiesOpen, setAllergiesOpen] = useState<boolean | null>(null);
  const dietKey = JSON.stringify(diet);
  const ready = products.status === "ready" ? products : null;
  const pantry = useMemo(() => (ready ? pantryLines(ready.products, JSON.parse(dietKey)) : []), [ready, dietKey]);
  const target = mealTargetFor(settings) ?? { kcal: mealSizes(settings.dailyCalories).normal };
  const onlyOneShop = recipeShops(manifest).length <= 1;
  const text = dishText(name, about);
  const thin = needsMoreDetail(text);

  stepNow.current = step; // eslint-disable-line react-hooks/refs -- which step is showing, read when the photo check comes back
  // each new step starts at the top with its heading focused (a screen reader hears where it is)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus(); }, [step]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  /** A photo taken with the camera, or picked from the phone: made smaller, then "scanned" for a couple of seconds. */
  const headers = (): Record<string, string> => ({ "Content-Type": "application/json", ...(paid.token ? { Authorization: `Bearer ${paid.token}` } : {}) });

  /** Does the photo show food? Only a clear "no" from Pip turns it down; if the check can't be made (no signal, too many tries) the flow carries on. */
  const checkFood = async (image: string): Promise<FoodCheck> => {
    try {
      const res = await fetch(`${API_BASE}recipe/photo/describe`, { method: "POST", headers: headers(), body: JSON.stringify({ image }) });
      if (res.ok) return "food";
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return res.status === 422 && json.error === "not_food" ? "notFood" : "unknown";
    } catch {
      return "unknown";
    }
  };

  const pick = async (file: Blob | undefined) => {
    if (!file) return;
    setPhotoError(false);
    setRetryNote(null);
    const shrunk = await shrinkPhoto(file);
    if (!shrunk) { setPhotoError(true); setStep("describe"); return; }
    setPhoto(shrunk);
    foodCheck.current = checkFood(shrunk.base64);
    setStep("scanning");
  };

  /** "Scanning" has run its course: on to the supermarket, or back to the camera if the photo isn't of food. */
  const afterScan = async () => {
    const result = await (foodCheck.current ?? Promise.resolve<FoodCheck>("unknown"));
    if (stepNow.current !== "scanning") return; // the person went Back meanwhile
    if (result === "notFood") {
      setPhoto(null);
      setRetryNote(tk("That doesn't look like food. Please try again with a photo of the dish."));
      setStep("camera");
      return;
    }
    setStep("shops");
  };

  const next = () => {
    if (thin && !nudged) { setNudged(true); return; }
    setStep(photo ? "shops" : "camera");
  };

  const generate = async () => {
    if (!photo || !shop || pantry.length < 2) return;
    // the shop chosen here becomes the person's first shop, as on the Recipes page (the others stay ticked for Groceries)
    if (pickedShop && settings.shops?.[0] !== pickedShop) updateSettings({ shops: [pickedShop, ...(settings.shops ?? []).filter((id) => id !== pickedShop)] });
    const body: PhotoRecipeRequest = { shop, servings: SERVINGS, target, diet, description: text, image: photo.base64, pantry };
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
      // saved the moment it's made (founder 2026-11-18: "When the person makes a recipe it automatically becomes a saved recipe. They can remove it from the
      // recipes in my meals later"), with the person's photo as its picture, kept on this phone only (lib/mm/recipePhotos.ts)
      let madeRoom: string | null = null;
      myRecipesStore.update((l) => { const k = keepMadeRecipe(l, made, shop); madeRoom = k.dropped; return k.list; });
      setSavedId(made.id);
      setDropped(madeRoom);
      if (photo) void recipeThumbnail(photo.url).then((thumb) => thumb && keepRecipePhoto(made.id, thumb));
      // a moment on the ticked list, then the recipe
      setTimeout(() => setStep("done"), 700);
    } catch (e) {
      if ((e as Error).name === "AbortError") { setStep("shops"); return; }
      setError(tk("Couldn't reach Pip. Check your connection and try again."));
      setStep("error");
    }
  };

  const goBack = () => {
    if (step === "scanning" || step === "shops") setStep("camera");
    else if (step === "error") setStep("shops");
  };
  const inFlow = step === "scanning" || step === "shops" || step === "error";
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
    // only if it was taken out of My recipes while this page was open: saving it again puts it back
    const saveRecipe = () => {
      if (myRecipesStore.get().some((s) => s.id === recipe.id)) return;
      myRecipesStore.update((l) => keepMadeRecipe(l, recipe, shop).list);
      setSavedId(recipe.id);
      if (photo) void recipeThumbnail(photo.url).then((thumb) => thumb && keepRecipePhoto(recipe.id, thumb));
    };
    return (
      <RecipeDetail
        recipe={recipe}
        files={[ready.file]}
        products={ready.products}
        backHref="/app/recipes"
        photo={photo?.url}
        diet={diet}
        save={{ saved: !!savedId, onSave: saveRecipe }}
        actions={
          <>
            {savedId ? (
              <p role="status" className="glass rounded-[1.25rem] p-4 text-center font-semibold">
                {t("Saved to My recipes. You can take it out there any time.")} <Link href={`/app/recipes/view?mine=${savedId}&r=${shop}`} className="text-accent underline underline-offset-2">{t("Open it")}</Link>
                {dropped && <span className="mt-1.5 block text-[0.9375rem] font-medium text-muted">{t("My recipes keeps {n}, so the oldest, {name}, made room.", { n: MAX_SAVED_RECIPES, name: dropped })}</span>}
              </p>
            ) : (
              <Button full className="min-h-14 text-base" onClick={saveRecipe}>{t("Save this recipe")}</Button>
            )}
            <Button full variant="secondary" className="min-h-14 text-base" onClick={() => { setRecipe(null); setPhoto(null); setName(""); setAbout(""); setOwnDiet(null); setAllergiesOpen(null); setNudged(false); setStep("describe"); }}>{t("Make another")}</Button>
          </>
        }
      />
    );
  }

  return (
    <div>
      {back}
      <h1 ref={heading} tabIndex={-1} className={`${H1} outline-none`}>{t("Make it at home")}</h1>

      {(step === "describe" || step === "camera") && (
        <section aria-labelledby="describe-intro">
          <Steps current={1} />
          <div id="describe-intro" className="mt-5"><PipSays mood="wave" size={76}>{t("Tell me what you'd like to make. The more detail you give, the better the recipe will match.")}</PipSays></div>

          <div className="glass mt-5 rounded-[1.5rem] p-5 shadow-[0_14px_34px_-22px_rgba(17,24,20,0.4)]">
            <div className="flex items-center gap-3">
              <span aria-hidden className={STEP_NUMBER}>1</span>
              <label htmlFor="dish-name" className="min-w-0 flex-1 text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Name of the dish")}</label>
            </div>
            <input
              id="dish-name"
              className={`${inputClass} mt-3 min-h-14 text-[1.125rem] font-semibold placeholder:text-base placeholder:font-medium`}
              value={name}
              maxLength={MAX_NAME}
              autoComplete="off"
              aria-describedby={`dish-help${nudged && thin ? " dish-nudge" : ""}`}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("For example: salsa chicken tacos")}
            />
            <p id="dish-help" className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Be as specific as you can: the flavour, the sauce and how it's cooked. For example, 'peri-peri chicken wings with spicy rice', not just 'chicken wings'.")}</p>

            <div className="my-5 h-px bg-[color:var(--line)]" aria-hidden />

            <div className="flex items-center gap-3">
              <span aria-hidden className={STEP_NUMBER}>2</span>
              <div className="min-w-0 flex-1">
                <label htmlFor="dish-about" className="block text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("A short description")}</label>
                <span className="mt-1.5 inline-block rounded-full bg-sun px-2.5 py-1 text-[0.75rem] font-bold uppercase leading-none tracking-[0.08em] text-[var(--on-accent)]">{t("Recommended for accuracy")}</span>
              </div>
            </div>
            <textarea
              id="dish-about"
              className={`${inputClass} mt-3 min-h-28 py-3 text-[1.0625rem] leading-snug placeholder:font-medium`}
              value={about}
              maxLength={MAX_ABOUT}
              rows={3}
              onChange={(e) => setAbout(e.target.value)}
              placeholder={t("For example: honey-glazed chicken tacos with sweet corn salsa and lime crema")}
            />
            <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("It helps Pip choose the right ingredients, so the recipe matches your dish more closely.")}</p>

            <div className="my-5 h-px bg-[color:var(--line)]" aria-hidden />

            <div role="group" aria-labelledby="exclude-title" aria-describedby="exclude-help">
              <div className="flex items-center gap-3">
                <span aria-hidden className={STEP_NUMBER}>3</span>
                <p id="exclude-title" className="min-w-0 flex-1 text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("What to exclude")}</p>
              </div>
              <p id="exclude-help" className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Tick anything you don't eat, and Pip leaves it out. It starts with your diet from Settings; changes here are for this recipe only.")}</p>
              <div role="group" aria-label={t("Your diet")} className={`mt-3 ${PICK_GRID}`}>
                {DIETS.map((d) => {
                  const on = Boolean(diet[d.key]);
                  return (
                    <PickTile key={d.key} on={on} aria-pressed={on} onClick={() => setOwnDiet(toggleDiet(diet, d.key))} className={PICK_LABEL}>
                      {t(d.label)}
                    </PickTile>
                  );
                })}
              </div>
              {(() => {
                const chosen = diet.avoidAllergens ?? [];
                const open = allergiesOpen ?? chosen.length > 0;
                return (
                  <>
                    <button type="button" aria-expanded={open} aria-controls="exclude-allergies" onClick={() => setAllergiesOpen(!open)} className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-[1.25rem] bg-[var(--fill)] px-4 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                      <span className="text-[0.9375rem] font-bold">{t("Allergies to avoid")}{chosen.length > 0 && <span className="ms-2 font-semibold text-muted">{t("{n} chosen", { n: chosen.length })}</span>}</span>
                      <ChevronRightIcon aria-hidden className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? "rotate-90" : "rtl:rotate-180"}`} />
                    </button>
                    {open && <div id="exclude-allergies" className="mt-2"><AllergenTiles chosen={chosen} label={t("Allergies to avoid")} onToggle={(k) => setOwnDiet(toggleAllergen(diet, k))} /></div>}
                  </>
                );
              })()}
              {(diet.vegetarianOnly || diet.veganOnly || diet.pescatarianOnly || diet.halalOnly || (diet.avoidAllergens?.length ?? 0) > 0) && (
                <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{diet.halalOnly ? t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen or halal labels, so check each pack before you buy.") : t("Recipes are chosen for your diet by their ingredients. We haven't read these products' allergen labels, so check each pack before you buy.")}</p>
              )}
            </div>
          </div>

          {photoError && <p role="alert" className="glass mt-3 rounded-[1.25rem] p-4 font-semibold">{t("That photo couldn't be opened. Please try another one.")}</p>}
          {nudged && thin && (
            <p id="dish-nudge" role="alert" className="glass mt-3 rounded-[1.25rem] p-4 font-semibold">{t("Add a bit more, like the flavour or sauce, so the recipe matches your photo.")}</p>
          )}

          {/* founder 2026-11-17 ("you can't see the next button ... you have to scroll down"): Next stays in view just above the tab bar, like a recipe's
              "Add all to my shopping list", on a strip of the page's grey that the form slides under */}
          <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
            <Button full className="min-h-14 text-lg" disabled={!name.trim()} onClick={next}>{nudged && thin ? t("Carry on anyway") : t("Next")}</Button>
          </div>
        </section>
      )}

      {step === "camera" && (
        <PhotoCamera
          onCapture={(blob) => void pick(blob)}
          onClose={() => { setRetryNote(null); setStep("describe"); }}
          notice={retryNote ? t(retryNote) : null}
          onPickPhoto={() => library.current?.click()}
          onPhonesCamera={() => phoneCamera.current?.click()}
        />
      )}

      {step === "scanning" && photo && (<><Steps current={2} /><ScanningPhoto url={photo.url} onDone={() => void afterScan()} /></>)}

      {(step === "shops" || step === "error") && (
        <section aria-labelledby="shops-q">
          <Steps current={3} />
          <h2 id="shops-q" className={`${H2} mt-5`}>{t("Where do you shop?")}</h2>
          <div className="mt-3"><ShopChoice shops={readyShops} value={shop} onChange={setPickedShop} /></div>
          {unreadShops.length > 0 && (
            <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("Recipes can't use {shops} yet: we haven't read enough of their products' labels.", { shops: new Intl.ListFormat("en-GB", { type: "conjunction" }).format(unreadShops) })}</p>
          )}
          {onlyOneShop && shop && <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("For now, recipes use {shop} products, the shop whose labels we've read. More supermarkets will come as we read theirs.", { shop: shopName })}</p>}
          {step === "error" && error && <div className="mt-4"><ErrorBox message={t(error)} onRetry={generate} /></div>}
          {!manifest || (shop && products.status === "loading") ? (
            <Spinner label={t("Loading products")} />
          ) : products.status === "error" ? (
            <div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
          ) : (
            <>
              <p className="mt-5 text-[0.8125rem] leading-snug text-muted">
                {t("Pip uses AI from Anthropic (the company that makes Claude). To write your recipe we send your photo (made smaller on your phone first), your description, your diet choices and the list of {shop} products it may use. Nothing about you, and nothing is kept. The numbers you see are worked out from the products' own labels.", { shop: shopName })}
              </p>
              <div className="sticky bottom-0 z-10 -mx-5 -mb-32 mt-4 bg-background px-5 pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.1rem)] pt-3">
                <Button full className="min-h-14 text-lg" disabled={pantry.length < 2 || !photo} onClick={generate}>{t("Next")}</Button>
              </div>
            </>
          )}
        </section>
      )}

      {step === "working" && (
        <>
          <Steps current={3} />
          <Working shopName={shopName} finished={finished} photoUrl={photo?.url ?? null} />
          <div className="mt-6 flex justify-center"><Button variant="ghost" onClick={() => abort.current?.abort()}>{t("Stop")}</Button></div>
        </>
      )}

      {/* the phone's own camera and photo picker, for the camera screen's buttons (the iPhone app has camera access for the barcode scanner already) */}
      <input ref={phoneCamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={library} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
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
