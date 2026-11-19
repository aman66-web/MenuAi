"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ADDED_TO } from "@/lib/mm/addFood";
import { analytics } from "@/lib/mm/analytics";
import { LOG_MEAL_LABEL, LOG_MEALS, mealSlotFor } from "@/lib/mm/budget";
import { API_BASE, FOOD_SCAN_ENABLED, PAID_ACCESS_ENABLED } from "@/lib/mm/config";
import { ESTIMATE_LOG_NAME, MAX_DESCRIPTION, SCAN_WORKING_LINES, type FoodScan } from "@/lib/mm/foodScan";
import { formatInt } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { addLogEntry, countProAction, paidStore } from "@/lib/mm/stores";
import type { LogMeal } from "@/lib/mm/types";
import { CameraIcon, CheckIcon, ChevronLeftIcon, PhotoIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { useGate } from "../_components/Paywall";
import { Button, ErrorBox, Spinner } from "../_components/ui";
import { backName, useBack } from "../_lib/backNav";
import { useHydrated, useIsPro, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { shrinkPhoto, type ShrunkPhoto } from "../_lib/photo";
import { PhotoCamera, ScanningPhoto } from "../recipes/photo/PhotoCamera";

// Scan food (founder 2026-11-18; lib/mm/foodScan.ts has the rules): a first page that says in plain words what this does, with two big buttons (take a photo, or
// choose one), then the camera, a short scanning look, a loading screen while Pip works, and the estimate: the plate's calories, protein, carbs and fat, what Pip
// counted, how sure it is, always marked as an estimate from a photo. One tap adds it to today's breakfast, lunch or dinner. Premium only, and the page exists only
// while FOOD_SCAN_ENABLED (lib/mm/config.ts). The photo is made smaller on the phone first (_lib/photo.ts) and is never kept.

type Step = "start" | "camera" | "scanning" | "working" | "done" | "error";
const WORKING_STEP_MS = 6000;
const H1 = "mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]";

const SURE: Record<FoodScan["confidence"], string> = {
  high: tk("Pip is fairly sure about this one."),
  medium: tk("A good guess from what Pip can see."),
  low: tk("A rough guess: some of this plate is hidden or hard to tell."),
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
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sun text-[var(--on-accent)]"><CheckIcon className="h-4 w-4" /></span>
            ) : i === shown ? (
              <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-[rgba(17,24,20,0.1)] border-t-[var(--bar)] motion-reduce:animate-none" />
            ) : (
              <span className="h-7 w-7 shrink-0 rounded-full border-[3px] border-[rgba(17,24,20,0.1)]" />
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
  // Premium here means a checked paid token (the server checks it again); a test build that previews Pro has no payments, so Pro is enough there.
  const access = PAID_ACCESS_ENABLED ? pro && !!paid.token : pro;
  const { showPaywall } = useGate();
  const nav = useBack("/app");
  const [step, setStep] = useState<Step>("start");
  const [photo, setPhoto] = useState<ShrunkPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scan, setScan] = useState<FoodScan | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meal, setMeal] = useState<LogMeal>(() => mealSlotFor(new Date()));
  const [logged, setLogged] = useState<LogMeal | null>(null);
  // what the food is, typed before the photo (founder 2026-11-18: "before they take a photo, they have to type in what the food is ... that brief description will
  // also help the AI"); sent with the photo, never kept
  const [what, setWhat] = useState("");
  const [whatMissing, setWhatMissing] = useState(false);
  const whatBox = useRef<HTMLInputElement>(null);
  const described = what.trim().length >= 2;
  const answer = useRef<Promise<{ scan?: FoodScan; error?: string; message?: string; status: number }> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const phoneCamera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus(); }, [step]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => abort.current?.abort(), []);

  const ask = async (image: string) => {
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
    } catch {
      return { status: 0, message: tk("Couldn't reach Pip. Check your connection and try again.") };
    }
  };

  /** A photo taken with the camera, or picked from the phone: made smaller, sent to Pip at once, "scanned" for a couple of seconds meanwhile. */
  const pick = async (file: Blob | undefined) => {
    if (!file) return;
    setPhotoError(false);
    setNotice(null);
    const shrunk = await shrinkPhoto(file);
    if (!shrunk) { setPhotoError(true); setStep("start"); return; }
    setPhoto(shrunk);
    setFinished(false);
    answer.current = ask(shrunk.base64);
    setStep("scanning");
  };

  const afterScan = async () => {
    setStep("working");
    const res = await (answer.current ?? Promise.resolve({ status: 0 } as { status: number; scan?: FoodScan; error?: string; message?: string }));
    if (res.status === 200 && res.scan) {
      setFinished(true);
      setScan(res.scan);
      setLogged(null);
      setTimeout(() => setStep("done"), 400);
      return;
    }
    if (res.error === "not_food") {
      setPhoto(null);
      setNotice(tk("That doesn't look like food. Please try again with a photo of your plate."));
      setStep("camera");
      return;
    }
    if (res.error === "premium") { showPaywall("foodScan"); setStep("start"); return; }
    setError(res.message ?? tk("Pip couldn't work out this food. Please try again with a clearer photo."));
    setStep("error");
  };

  const start = (how: "camera" | "library") => {
    if (!access) { showPaywall("foodScan"); return; }
    if (!described) { setWhatMissing(true); whatBox.current?.focus(); return; }
    if (how === "camera") setStep("camera");
    else library.current?.click();
  };

  const log = () => {
    if (!scan) return;
    const name = t(ESTIMATE_LOG_NAME, { name: scan.name });
    addLogEntry({ chainId: "", chainName: "", name, nutrients: { calories: scan.total.kcal, protein: scan.total.protein, carbs: scan.total.carbs, fat: scan.total.fat }, source: "custom", meal, estimate: true });
    analytics.track({ name: "mealLogged" });
    countProAction();
    setLogged(meal);
  };

  if (!hydrated) return <Spinner />;

  return (
    <div className="pb-6">
      {step !== "camera" && (
        <Link href={nav.href} onClick={nav.onClick} aria-label={backName(t("Back"), t("Back to Home"), nav.cameFromApp)} className="glass inline-flex min-h-11 items-center gap-1 rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95">
          <ChevronLeftIcon className="h-5 w-5" />
          <span>{t("Back")}</span>
        </Link>
      )}

      {step === "start" && (
        <section aria-labelledby="scan-h">
          <h1 id="scan-h" ref={heading} tabIndex={-1} className={H1}>{t("Scan your food")}</h1>
          <p className="mt-2 text-[1.0625rem] leading-snug text-muted">{t("Take a photo of your plate and Pip estimates its calories, protein, carbs and fat.")}</p>
          <div className="mt-5 flex justify-center"><Pip mood="wave" size={96} /></div>
          {/* first, in a few words, what the food is: Pip reads it with the photo */}
          <label htmlFor="scan-what" className="mt-5 block text-lg font-[800] leading-snug">{t("What are you eating?")}</label>
          <p id="scan-what-help" className="mt-0.5 text-[0.9375rem] leading-snug text-muted">{t("A few words help Pip tell what's on the plate.")}</p>
          <input
            ref={whatBox}
            id="scan-what"
            type="text"
            value={what}
            maxLength={MAX_DESCRIPTION}
            enterKeyHint="done"
            autoComplete="off"
            aria-describedby={whatMissing && !described ? "scan-what-help scan-what-missing" : "scan-what-help"}
            aria-invalid={whatMissing && !described ? true : undefined}
            placeholder={t("For example: chicken pasta in a creamy sauce")}
            onChange={(e) => { setWhat(e.target.value); if (e.target.value.trim().length >= 2) setWhatMissing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="glass mt-2 block min-h-14 w-full rounded-[1.25rem] px-4 text-[1.0625rem] outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
          {whatMissing && !described && <p id="scan-what-missing" role="alert" className="mt-2 text-[0.9375rem] font-semibold text-[var(--danger,#b42318)]">{t("Type what the food is first, then take the photo.")}</p>}
          <div className="mt-4 space-y-3">
            <Button full className="min-h-14 gap-2.5 text-lg" onClick={() => start("camera")}><CameraIcon className="h-6 w-6" />{t("Take a photo")}</Button>
            <Button full variant="secondary" className="min-h-14 gap-2.5 text-lg" onClick={() => start("library")}><PhotoIcon className="h-6 w-6" />{t("Choose a photo")}</Button>
          </div>
          {photoError && <p role="alert" className="glass mt-3 rounded-[1.25rem] p-4 font-semibold">{t("That photo couldn't be opened. Please try another one.")}</p>}
          <p className="mt-5 text-[0.9375rem] leading-snug text-muted">{t("The numbers are an estimate from your photo, not from a label: oil, sauces and portion sizes can't always be seen.")}</p>
          <p className="mt-3 text-[0.8125rem] leading-snug text-muted">{t("Pip uses AI from Anthropic (the company that makes Claude). To work out the numbers we send your photo (made smaller on your phone first). Nothing about you is sent with it, and we don't keep the photo.")}</p>
        </section>
      )}

      {step === "camera" && (
        <PhotoCamera
          onCapture={(blob) => void pick(blob)}
          onClose={() => { setNotice(null); setStep("start"); }}
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
          <div className="mt-6 flex justify-center"><Button variant="ghost" onClick={() => { abort.current?.abort(); setStep("start"); }}>{t("Stop")}</Button></div>
        </section>
      )}

      {step === "error" && (
        <section aria-labelledby="scan-error-h">
          <h1 id="scan-error-h" ref={heading} tabIndex={-1} className={H1}>{t("Scan your food")}</h1>
          <div className="mt-4"><ErrorBox message={t(error ?? "")} onRetry={() => setStep("camera")} /></div>
        </section>
      )}

      {step === "done" && scan && (
        <section aria-labelledby="scan-done-h">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, a local blob address
            <img src={photo.url} alt={t("Your photo")} className="mt-4 aspect-[4/3] w-full rounded-[1.5rem] object-cover" />
          )}
          <h1 id="scan-done-h" ref={heading} tabIndex={-1} className={H1}>{scan.name}</h1>
          <p className="mt-2 inline-flex rounded-full bg-sun px-3 py-1 text-[0.9375rem] font-bold text-[var(--on-accent)]">{t("Estimate from your photo")}</p>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <Figure big value={scan.total.kcal} unit="kcal" label={t("Calories")} />
            <Figure value={scan.total.protein} unit="g" label={t("Protein")} />
            <Figure value={scan.total.carbs} unit="g" label={t("Carbs")} />
            <Figure value={scan.total.fat} unit="g" label={t("Fat")} />
          </div>
          <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t(SURE[scan.confidence])}</p>

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
            <h2 className="text-lg font-[800]">{t("Add it to today")}</h2>
            <div role="radiogroup" aria-label={t("Which meal?")} className="mt-3 grid grid-cols-2 gap-2">
              {/* the three meals and Snacks (founder 2026-11-19), two by two so each word stays whole */}
              {LOG_MEALS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={meal === m} onClick={() => { setMeal(m); setLogged(null); }} className={`min-h-12 rounded-full px-2 text-[0.9375rem] font-bold transition active:scale-95 ${meal === m ? "bg-foreground text-background" : "bg-soft-strong"}`}>{t(LOG_MEAL_LABEL[m])}</button>
              ))}
            </div>
            {logged === meal ? (
              <p role="status" className="mt-3 flex items-center gap-2 font-semibold"><CheckIcon className="h-5 w-5 text-accent" />{t(ADDED_TO[meal], { name: t(ESTIMATE_LOG_NAME, { name: scan.name }) })}</p>
            ) : (
              <Button full className="mt-3 min-h-14 text-lg" onClick={log}>{t("Add to {meal}", { meal: t(LOG_MEAL_LABEL[meal]) })}</Button>
            )}
          </div>
          <div className="mt-3 grid gap-2.5">
            {logged && <Button full variant="secondary" className="min-h-12" onClick={() => router.push("/app")}>{t("Back to Home")}</Button>}
            <Button full variant="secondary" className="min-h-12" onClick={() => { setScan(null); setPhoto(null); setStep("camera"); }}>{t("Scan another")}</Button>
          </div>
          <p className="mt-4 text-[0.8125rem] leading-snug text-muted">{t("The numbers are an estimate from your photo, not from a label: oil, sauces and portion sizes can't always be seen.")}</p>
        </section>
      )}

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
