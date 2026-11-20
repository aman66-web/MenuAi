"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ADDED_TO } from "@/lib/mm/addFood";
import { AI_MESSAGES, aiFailureMessage, aiRetrySame } from "@/lib/mm/aiConsent";
import { analytics } from "@/lib/mm/analytics";
import { LOG_MEAL_LABEL, LOG_MEALS, mealSlotFor } from "@/lib/mm/budget";
import { API_BASE, FOOD_SCAN_ENABLED, PAID_ACCESS_ENABLED } from "@/lib/mm/config";
import { ESTIMATE_LOG_NAME, MAX_DESCRIPTION, SCAN_MESSAGES, SCAN_WORKING_LINES, type FoodScan } from "@/lib/mm/foodScan";
import { formatInt } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { addLogEntry, countProAction, deleteLogEntry, moveLogEntry, paidStore } from "@/lib/mm/stores";
import type { LogMeal } from "@/lib/mm/types";
import { OfflineBanner, useAiConsent, useOnline } from "../_components/AiConsentSheet";
import { CameraIcon, CheckIcon, InfoIcon, PhotoIcon } from "../_components/icons";
import { PageHeader } from "../_components/PageHeader";
import { useGate } from "../_components/Paywall";
import { PremiumBadge } from "../_components/PremiumBadge";
import { Toast } from "../_components/Toast";
import { Button, ErrorBox, inputClass, Spinner } from "../_components/ui";
import { useHydrated, useIsPro, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { shrinkPhoto, type ShrunkPhoto } from "../_lib/photo";
import { PhotoCamera, ScanningPhoto } from "../recipes/photo/PhotoCamera";

// Scan food (founder 2026-11-18; lib/mm/foodScan.ts has the rules): a first page that says in plain words what this does, with two big buttons (take a photo, or
// choose one), then the camera, a short scanning look, a loading screen while Pip works, and the estimate: the plate's calories, protein, carbs and fat, what Pip
// counted, how sure it is, always marked as an estimate from a photo. One tap adds it to today's breakfast, lunch or dinner. Premium only, and the page exists only
// while FOOD_SCAN_ENABLED (lib/mm/config.ts). The photo is made smaller on the phone first (_lib/photo.ts) and is never kept.
// No Pip on the first page (Pip audit, founder 2026-11-20: "keep him as the guide, not the decoration"). The estimate is a white card with the dashed edge and
// the "Estimate from your photo" info tag at its top (colour meeting, 19 November 2026: an AI estimate must never look like a published label), and nothing on
// this screen is lime: the loading list's finished steps are plain ink ticks.
// The 20 November 2026 audit: Pip's permission sheet before the first photo (AiConsentSheet.tsx), an offline line and no camera while offline, Stop that stops
// quietly, a failure of the connection or of Pip keeps the photo and Try again sends it again, "Pip can't do this right now" when Anthropic can't answer,
// the plate logged once (another meal moves it, with the app's toast and Undo), "Scan another" back to the first page with nothing left from the last plate,
// and for someone without Premium the Premium badge and "See Premium" in place of the form. ?meal= (from the Add food sheet) chooses the meal on the result.

type Step = "start" | "camera" | "scanning" | "working" | "done" | "error";
type Reply = { scan?: FoodScan; error?: string; message?: string; status: number; aborted?: true };
const WORKING_STEP_MS = 6000;
const H1 = "mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]";

const SURE: Record<FoodScan["confidence"], string> = {
  high: tk("Pip is fairly sure."),
  medium: tk("A good guess from what Pip can see."),
  low: tk("A rough guess: some of it is hard to see."),
};

function Working({ photoUrl, finished }: { photoUrl: string | null; finished: boolean }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const last = SCAN_WORKING_LINES.length - 1;
  useEffect(() => {
    if (step >= last) return;
    const timer = setTimeout(() => setStep(step + 1), WORKING_STEP_MS);
    return () => clearTimeout(timer);
  }, [step, last]);
  const shown = finished ? SCAN_WORKING_LINES.length : step;
  return (
    <div className="pt-2">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, a local blob address
        <img src={photoUrl} alt={t("Your photo")} className="mx-auto aspect-square w-full max-w-xs rounded-[1.5rem] object-cover" />
      )}
      <p role="status" aria-live="polite" className="sr-only">{t(SCAN_WORKING_LINES[Math.min(shown, last)]!)}</p>
      <ul aria-hidden className="mt-5 space-y-3">
        {SCAN_WORKING_LINES.map((line, i) => (
          <li key={line} className={`flex items-center gap-3 text-[1.0625rem] font-semibold ${i <= shown ? "text-foreground" : "text-muted"}`}>
            {i < shown ? (
              <span className="grid h-7 w-7 shrink-0 place-items-center text-foreground"><CheckIcon className="h-6 w-6" strokeWidth={3} /></span>
            ) : i === shown ? (
              <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />
            ) : (
              <span className="h-7 w-7 shrink-0 rounded-full border-[3px] border-line" />
            )}
            <span>{t(line)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One of the four big numbers: the figure, then its name under it. */
function Figure({ value, unit, label, big }: { value: number; unit: string; label: string; big?: boolean }) {
  return (
    <div className={`glass flex min-w-0 flex-col items-center justify-center rounded-[1.25rem] p-3 text-center ${big ? "col-span-full py-4" : ""}`}>
      <span className={`app-numbers font-[800] leading-none tracking-[-0.02em] ${big ? "text-[2.5rem]" : "text-[1.5rem]"}`}>
        {formatInt(value)}<span className={`ms-1 font-semibold text-muted ${big ? "text-lg" : "text-sm"}`}>{unit}</span>
      </span>
      <span className="mt-1.5 text-[0.9375rem] font-semibold text-muted">{label}</span>
    </div>
  );
}

function ScanScreen() {
  const t = useT();
  const router = useRouter();
  const hydrated = useHydrated();
  const pro = useIsPro();
  const paid = useStore(paidStore);
  const online = useOnline();
  // Premium here means a checked paid token (the server checks it again); a test build that previews Pro has no payments, so Pro is enough there.
  const access = PAID_ACCESS_ENABLED ? pro && !!paid.token : pro;
  const { showPaywall } = useGate();
  const consent = useAiConsent("scan");
  // the meal asked for by the page that opened this one (the Add food sheet: ?meal=lunch), else the one for the time of day
  const askedMeal = useSearchParams().get("meal");
  const [step, setStep] = useState<Step>("start");
  // which step is showing, read when an answer comes back (the person may have pressed Stop meanwhile)
  const stepNow = useRef<Step>("start");
  const go = (next: Step) => {
    stepNow.current = next;
    setStep(next);
  };
  const [photo, setPhoto] = useState<ShrunkPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scan, setScan] = useState<FoodScan | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the failure was the connection or Pip, not the photo: Try again sends the same photo again
  const [retrySame, setRetrySame] = useState(false);
  const [meal, setMeal] = useState<LogMeal>(() => (LOG_MEALS as readonly string[]).includes(askedMeal ?? "") ? (askedMeal as LogMeal) : mealSlotFor(new Date()));
  // the plate as logged (once): another meal then moves it instead of adding it again
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: boolean; n: number } | null>(null);
  // what the food is, typed before the photo (founder 2026-11-18: "before they take a photo, they have to type in what the food is ... that brief description will
  // also help the AI"); sent with the photo, never kept
  const [what, setWhat] = useState("");
  const [whatMissing, setWhatMissing] = useState(false);
  const whatBox = useRef<HTMLInputElement>(null);
  const described = what.trim().length >= 2;
  const answer = useRef<Promise<Reply> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const phoneCamera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus(); }, [step]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => abort.current?.abort(), []);

  const ask = async (image: string): Promise<Reply> => {
    abort.current = new AbortController();
    try {
      const res = await fetch(`${API_BASE}scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(paid.token ? { Authorization: `Bearer ${paid.token}` } : {}) },
        body: JSON.stringify({ image, description: what.trim() }),
        signal: abort.current.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { scan?: FoodScan; error?: string; message?: string };
      return { ...json, status: res.status };
    } catch (e) {
      // Stop (or leaving the page): not a failure, nothing to say
      if ((e as Error).name === "AbortError") return { status: -1, aborted: true };
      return { status: 0 };
    }
  };

  /** A photo taken with the camera, or picked from the phone: made smaller, sent to Pip at once, "scanned" for a couple of seconds meanwhile. */
  const pick = async (file: Blob | undefined) => {
    if (!file) return;
    setPhotoError(false);
    setNotice(null);
    const shrunk = await shrinkPhoto(file);
    if (!shrunk) { setPhotoError(true); go("start"); return; }
    setPhoto(shrunk);
    setFinished(false);
    answer.current = ask(shrunk.base64);
    go("scanning");
  };

  const afterScan = async () => {
    go("working");
    const res = await (answer.current ?? Promise.resolve<Reply>({ status: 0 }));
    // stopped, or the person has moved on: the answer is dropped
    if (res.aborted || stepNow.current !== "working") return;
    if (res.status === 200 && res.scan) {
      setFinished(true);
      setScan(res.scan);
      setLoggedId(null);
      setTimeout(() => { if (stepNow.current === "working") go("done"); }, 400);
      return;
    }
    if (res.error === "not_food") {
      setPhoto(null);
      setNotice(tk("That doesn't look like food. Please try again with a photo of your plate."));
      go("camera");
      return;
    }
    if (res.error === "premium" || res.status === 402) { showPaywall("foodScan"); go("start"); return; }
    setError(aiFailureMessage(res, SCAN_MESSAGES.noEstimate, navigator.onLine !== false));
    setRetrySame(aiRetrySame(res));
    go("error");
  };

  /** Try again after the connection or Pip failed: the same photo, sent again. */
  const resend = () => {
    if (!photo) { go("camera"); return; }
    setFinished(false);
    answer.current = ask(photo.base64);
    void afterScan();
  };

  const start = (how: "camera" | "library") => {
    if (!access) { showPaywall("foodScan"); return; }
    if (!online) return; // the offline line at the top says why
    if (!described) { setWhatMissing(true); whatBox.current?.focus(); return; }
    consent.ask(() => {
      if (how === "camera") go("camera");
      else library.current?.click();
    });
  };

  const name = scan ? t(ESTIMATE_LOG_NAME, { name: scan.name }) : "";
  const log = () => {
    if (!scan || loggedId) return;
    const entry = addLogEntry({ chainId: "", chainName: "", name, nutrients: { calories: scan.total.kcal, protein: scan.total.protein, carbs: scan.total.carbs, fat: scan.total.fat }, source: "custom", meal, estimate: true });
    analytics.track({ name: "mealLogged" });
    countProAction();
    setLoggedId(entry.id);
    setToast((was) => ({ text: t(ADDED_TO[meal], { name }), undo: true, n: (was?.n ?? 0) + 1 }));
  };
  /** A meal tapped on the result: before adding, the meal it will go to; after, the plate moves there (never a second copy). */
  const chooseMeal = (m: LogMeal) => {
    setMeal(m);
    if (!loggedId || m === meal) return;
    moveLogEntry(loggedId, m);
    setToast((was) => ({ text: t("Moved “{name}” to {meal}.", { name, meal: t(LOG_MEAL_LABEL[m]) }), undo: false, n: (was?.n ?? 0) + 1 }));
  };
  const undo = () => {
    if (loggedId) deleteLogEntry(loggedId);
    setLoggedId(null);
    setToast(null);
  };
  /** A different plate: back to the first page, with nothing of the last one kept (its words would be sent with the new photo). */
  const scanAnother = () => {
    setWhat("");
    setWhatMissing(false);
    setScan(null);
    setPhoto(null);
    setLoggedId(null);
    setToast(null);
    go("start");
  };

  if (!hydrated) return <Spinner />;

  return (
    <div className="pb-6">
      {/* the header every page has (colour meeting, 19 November 2026), except on the full-screen camera: Back (the page before, else Home) and the cog */}
      {step !== "camera" && <PageHeader back={{ href: "/app", label: t("Back to Home") }} />}

      {step === "start" && !access && (
        // someone without Premium: what it does, the badge, and the plans (never a form that ends in a paywall)
        <section aria-labelledby="scan-h">
          <h1 id="scan-h" ref={heading} tabIndex={-1} className={`${H1} flex flex-wrap items-center gap-x-2.5 gap-y-1`}>{t("Scan your food")}<PremiumBadge always /></h1>
          <p className="mt-2 text-[1.0625rem] leading-snug text-muted">{t("Pip estimates a plate's calories, protein, carbs and fat from a photo.")}</p>
          <p className="mt-5 flex gap-2 text-[0.9375rem] leading-snug text-foreground"><InfoIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-foreground" /><span>{t("Estimate from your photo, not a label: oil, sauces and portion sizes can't always be seen.")}</span></p>
          <Button full className="mt-5 min-h-14 text-lg" onClick={() => showPaywall("foodScan")}>{t("See Premium")}</Button>
        </section>
      )}

      {step === "start" && access && (
        <section aria-labelledby="scan-h">
          <h1 id="scan-h" ref={heading} tabIndex={-1} className={H1}>{t("Scan your food")}</h1>
          {!online && <OfflineBanner className="mt-4" />}
          <p className="mt-2 text-[1.0625rem] leading-snug text-muted">{t("Pip estimates a plate's calories, protein, carbs and fat from a photo.")}</p>
          {/* first, in a few words, what the food is: Pip reads it with the photo */}
          <label htmlFor="scan-what" className="mt-5 block text-lg font-[800] leading-snug">{t("What are you eating?")}</label>
          <input
            ref={whatBox}
            id="scan-what"
            type="text"
            value={what}
            maxLength={MAX_DESCRIPTION}
            enterKeyHint="done"
            autoComplete="off"
            aria-describedby={whatMissing && !described ? "scan-what-missing" : undefined}
            aria-invalid={whatMissing && !described ? true : undefined}
            placeholder={t("For example: creamy chicken pasta")}
            onChange={(e) => { setWhat(e.target.value); if (e.target.value.trim().length >= 2) setWhatMissing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className={`${inputClass} mt-2 min-h-14 text-[1.0625rem]`}
          />
          {whatMissing && !described && <p id="scan-what-missing" role="alert" className="mt-2 text-[0.9375rem] font-semibold text-danger">{t("Type what the food is first, then take the photo.")}</p>}
          <div className="mt-4 space-y-3">
            <Button full className="min-h-14 gap-2.5 text-lg" disabled={!online} onClick={() => start("camera")}><CameraIcon className="h-6 w-6" />{t("Take a photo")}</Button>
            <Button full variant="secondary" className="min-h-14 gap-2.5 text-lg" disabled={!online} onClick={() => start("library")}><PhotoIcon className="h-6 w-6" />{t("Choose a photo")}</Button>
          </div>
          {photoError && <p role="alert" className="glass mt-3 rounded-[1.25rem] p-4 font-semibold">{t("That photo couldn't be opened. Please try another one.")}</p>}
          {/* the estimate line in the text colour with an info icon (colour meeting: "the estimate must be seen", CLAUDE.md rule 1) */}
          <p className="mt-5 flex gap-2 text-[0.9375rem] leading-snug text-foreground"><InfoIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-foreground" /><span>{t("Estimate from your photo, not a label: oil, sauces and portion sizes can't always be seen.")}</span></p>
          <p className="mt-3 text-[0.8125rem] leading-snug text-muted">{t("Pip uses AI from Anthropic. We send your photo (made smaller) and your words; never your name, email or account. We don't keep it.")}</p>
        </section>
      )}

      {step === "camera" && (
        <PhotoCamera
          onCapture={(blob) => void pick(blob)}
          onClose={() => { setNotice(null); go("start"); }}
          notice={notice ? t(notice) : null}
          onPickPhoto={() => library.current?.click()}
          onPhonesCamera={() => phoneCamera.current?.click()}
        />
      )}

      {step === "scanning" && photo && <ScanningPhoto url={photo.url} onDone={() => void afterScan()} />}

      {step === "working" && (
        <section aria-labelledby="scan-working-h">
          <h1 id="scan-working-h" ref={heading} tabIndex={-1} className={H1}>{t("Working it out")}</h1>
          <Working photoUrl={photo?.url ?? null} finished={finished} />
          <div className="mt-6 flex justify-center"><Button variant="ghost" onClick={() => { go("start"); abort.current?.abort(); }}>{t("Stop")}</Button></div>
        </section>
      )}

      {step === "error" && (
        <section aria-labelledby="scan-error-h">
          <h1 id="scan-error-h" ref={heading} tabIndex={-1} className={H1}>{t("Scan your food")}</h1>
          {retrySame && photo ? (
            <>
              {/* the connection or Pip failed, not the photo: it is kept, and Try again sends it again */}
              {/* eslint-disable-next-line @next/next/no-img-element -- the person's own photo, a local blob address */}
              <img src={photo.url} alt={t("Your photo")} className="mt-4 aspect-[4/3] w-full rounded-[1.5rem] object-cover" />
              <div className="mt-4"><ErrorBox message={t(error ?? AI_MESSAGES.busy)} onRetry={resend} /></div>
              <Button full variant="secondary" className="mt-3 min-h-12" onClick={() => { setPhoto(null); go("camera"); }}>{t("Take another photo")}</Button>
            </>
          ) : (
            <div className="mt-4"><ErrorBox message={t(error ?? "")} onRetry={() => go("camera")} /></div>
          )}
        </section>
      )}

      {step === "done" && scan && (
        <section aria-labelledby="scan-done-h">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, a local blob address
            <img src={photo.url} alt={t("Your photo")} className="mt-4 aspect-[4/3] w-full rounded-[1.5rem] object-cover" />
          )}
          <h1 id="scan-done-h" ref={heading} tabIndex={-1} className={H1}>{scan.name}</h1>
          {/* a white card with the 1.5 px dashed edge, the info tag at its top (page fill, 6 px corners, no edge, text-colour words at body size), the four
              figures in page-fill wells (a .glass inside a .glass) */}
          <div className="glass mt-4 rounded-[1.25rem] border-[1.5px] border-dashed border-edge p-3">
            <p className="inline-flex items-center gap-1.5 rounded-[6px] bg-fill px-2.5 py-1 text-base font-semibold text-foreground"><InfoIcon aria-hidden className="h-[1.125rem] w-[1.125rem] shrink-0" />{t("Estimate from your photo")}</p>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <Figure big value={scan.total.kcal} unit="kcal" label={t("Calories")} />
              <Figure value={scan.total.protein} unit="g" label={t("Protein")} />
              <Figure value={scan.total.carbs} unit="g" label={t("Carbs")} />
              <Figure value={scan.total.fat} unit="g" label={t("Fat")} />
            </div>
            <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t(SURE[scan.confidence])}</p>
          </div>

          <h2 className="mt-6 text-xl font-[800] tracking-[-0.01em]">{t("What Pip counted")}</h2>
          <ul className="mt-3 space-y-2.5">
            {scan.items.map((item, i) => (
              <li key={`${item.name}-${i}`} className="glass flex items-center justify-between gap-3 rounded-[1.25rem] p-4">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="block font-bold leading-snug">{item.name}</span>
                  {item.portion && <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{item.portion}</span>}
                </span>
                <span className="app-numbers shrink-0 text-end font-bold">{formatInt(item.kcal)} <span className="text-sm font-semibold text-muted">kcal</span></span>
              </li>
            ))}
          </ul>

          <div className="glass mt-6 rounded-[1.25rem] p-4">
            <h2 className="text-lg font-[800]">{loggedId ? t("Added to today") : t("Add it to today")}</h2>
            <div role="radiogroup" aria-label={t("Which meal?")} className="mt-3 grid grid-cols-2 gap-2">
              {/* the three meals and Snacks (founder 2026-11-19), two by two so each word stays whole; once added, a tap moves it */}
              {LOG_MEALS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={meal === m} onClick={() => chooseMeal(m)} className={`min-h-12 rounded-full px-2 text-[0.9375rem] font-bold transition active:scale-95 ${meal === m ? "border-[1.5px] border-transparent bg-ink text-on-ink" : "border-[1.5px] border-[color:var(--edge)] bg-soft"}`}>{t(LOG_MEAL_LABEL[m])}</button>
              ))}
            </div>
            {loggedId ? (
              <p className="mt-3 flex items-center gap-2 font-semibold"><CheckIcon aria-hidden className="h-5 w-5 shrink-0 text-foreground" />{t(ADDED_TO[meal], { name })}</p>
            ) : (
              <Button full className="mt-3 min-h-14 text-lg" onClick={log}>{t("Add to {meal}", { meal: t(LOG_MEAL_LABEL[meal]) })}</Button>
            )}
          </div>
          <div className="mt-3 grid gap-2.5">
            {loggedId && <Button full variant="secondary" className="min-h-12" onClick={() => router.push("/app")}>{t("Back to Home")}</Button>}
            <Button full variant="secondary" className="min-h-12" onClick={scanAnother}>{t("Scan another")}</Button>
          </div>
          <p className="mt-4 text-[0.8125rem] leading-snug text-muted">{t("Not from a label: oil, sauces and portion sizes can't always be seen.")}</p>
        </section>
      )}

      {toast && (
        // the app's one toast (Home and Today use it too), with Undo after adding; a new key for each message so its time starts afresh
        <Toast key={toast.n} onClose={() => setToast(null)} onUndo={toast.undo ? undo : undefined}>{toast.text}</Toast>
      )}
      {consent.sheet}

      {/* the phone's own camera and photo picker, for the buttons above and the camera screen's */}
      <input ref={phoneCamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={library} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

/** While the feature is off (lib/mm/config.ts), its address opens Home instead. */
function ForwardHome() {
  const router = useRouter();
  useEffect(() => { router.replace("/app"); }, [router]);
  return <Spinner />;
}

export default function ScanPage() {
  if (!FOOD_SCAN_ENABLED) return <ForwardHome />;
  return (
    <Suspense fallback={<Spinner />}>
      <ScanScreen />
    </Suspense>
  );
}
