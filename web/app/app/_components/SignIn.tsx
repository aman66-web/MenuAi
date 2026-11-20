"use client";

import { useState } from "react";
import { API_BASE, APP_BUILD, TELEMETRY_ENABLED } from "@/lib/mm/config";
import { AccountError } from "@/lib/mm/account";
import { tk } from "@/lib/mm/i18n";
import { nativeCall, hasNative } from "@/lib/mm/native";
import { site } from "@/site.config";
import { accountApi, keepHashForSignIn, signedIn } from "../_lib/account";
import { useT } from "../_lib/i18n";
import { ShieldIcon } from "./icons";
import { Pip } from "./Mascot";
import { Note } from "./Note";
import { Button, Field, Sheet, inputClass } from "./ui";

// Sign in (docs/ACCOUNTS_SYNC.md). Since 2026-11-17 everyone signs in (SIGN_IN_REQUIRED: the full-screen SignInScreen uses this same panel); with that
// switch off it is optional, and signing in only turns on sync across devices.
// Three ways in, one big button each: Apple, Google, and a 6-digit code by email (no password to remember).
//   * Website: Apple and Google are a normal sign-in on numbite.com (the browser leaves for the provider and comes back).
//   * iPhone app: Apple uses the iPhone's own Apple sheet; Google opens numbite.com in the iPhone's secure browser sheet.
//   * Email: the same code form in both; the app keeps the session it is given, the website gets http-only cookies.

type Step = "choose" | "email" | "code";

/** What the website's Apple and Google sign-in says when it comes back without finishing (?signin=<reason>, lib/auth/handlers.ts failure). "ok" has none. */
export const SIGN_IN_MESSAGES: Readonly<Record<string, string>> = {
  cancelled: tk("Sign-in was cancelled."),
  failed: tk("Sign-in didn't finish. Please try again."),
  expired: tk("That sign-in took too long. Please try again."),
  busy: tk("Too many tries. Please wait a few minutes and try again."),
};

/** Who the code email comes from: Supabase sends it through Resend as "Numbite" <noreply@numbite.com> (docs/ACCOUNTS_SYNC.md, SMTP settings). */
const CODE_SENDER = "noreply@numbite.com";

function AppleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * A big sign-in button: a link on the website (it leaves for the provider), a button in the iPhone app (the phone does it). Apple's and Google's own required looks.
 * While another way in is busy it can't be pressed, but it is never faded (colour meeting, 19 November 2026: a faded control reads as broken); the full-screen
 * "Signing you in…" covers the screen meanwhile.
 */
function ProviderButton({ href, disabled, onClick, className, children }: { href?: string; disabled?: boolean; onClick: () => void; className: string; children: React.ReactNode }) {
  const cls = `inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full px-5 text-base font-semibold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${disabled ? "pointer-events-none" : ""} ${className}`;
  // the website leaves for Apple or Google: this page's "#..." (a shared list) is noted first, as the browser won't bring it back (app/_lib/account.ts)
  return href ? (
    <a href={href} onClick={keepHashForSignIn} className={cls}>{children}</a>
  ) : (
    <button type="button" disabled={disabled} onClick={onClick} className={cls}>{children}</button>
  );
}

/** What went wrong, under the field or the buttons: the app's error banner (colour meeting, 19 November 2026: "failures as the error banner"; _components/Note.tsx). */
function SignInError({ children }: { children: string }) {
  return <Note kind="error" heading={null} className="mt-3">{children}</Note>;
}

/** `community`: the sheet was opened to use friends, so it also says what Community keeps (a username, friends and the lists sent), not only the sync data. */
export function SignInSheet({ open, onClose, community }: { open: boolean; onClose: () => void; community?: boolean }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Sign in")}>
      {open && <SignInPanel onDone={onClose} community={community === true} />}
    </Sheet>
  );
}

/** While the account is being made or opened (Apple's or Google's window has closed, or the email code was right) the whole screen shows Pip and a spinner,
 *  so the sign-in buttons don't flash up again for the second it takes (founder 2026-11-18: "instead of that little small 1 second flash, just have like a loading
 *  animation"). It stays until the app opens, or comes off with the error if it fails. The welcome screens show it too while they wait for the account's
 *  settings after their sign-in step (app/app/welcome/page.tsx). Pip waves (the founder's Pip audit, 20 November 2026: calm, he cheers for nothing here). */
export function SigningIn() {
  const t = useT();
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-background px-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <Pip mood="wave" size={96} />
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-ink motion-reduce:animate-none" />
        <p className="text-lg font-bold">{t("Signing you in…")}</p>
      </div>
    </div>
  );
}

/**
 * The three ways in. `required`: on the sign-in screen everyone sees first (it says an account is needed rather than that it isn't). `intro`: the line above the
 * buttons (off on the welcome steps' last step, where the heading and Pip already say it and all three buttons must fit a small iPhone's screen). `notice`: what
 * happened to a website sign-in that came back without finishing (SIGN_IN_MESSAGES), shown under the buttons until the next tap.
 */
export function SignInPanel({ onDone, community, required = false, intro = true, notice = null }: { onDone: () => void; community: boolean; required?: boolean; intro?: boolean; notice?: string | null }) {
  const t = useT();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(notice ? t(notice) : null);
  const native = hasNative();
  const canUseProviders = !APP_BUILD || native; // the packed app outside the iPhone app (a testing browser) has no way to open them

  function describe(e: unknown): string {
    if (e instanceof AccountError) {
      if (e.offline) return t("You're offline. Connect to the internet and try again.");
      if (e.code === "invalid_code") return t("That code isn't right, or it has run out. Ask for a new one.");
      if (e.status === 429) return t("Please wait a minute and try again.");
      if (e.code === "invalid_request") return t("That doesn't look right. Please check it and try again.");
      if (e.status === 503) return t("Sign-in isn't available right now. Please try again in a moment.");
    }
    return t("Something went wrong. Please try again.");
  }

  /** The website: a normal sign-in. The browser leaves for Apple or Google and comes back to /auth/callback, then to this page. */
  const providerHref = (provider: "apple" | "google") => {
    const here = typeof window !== "undefined" && window.location.pathname === "/app/settings" ? "/app/settings#account" : typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app/settings#account";
    return `${API_BASE}auth/${provider}/start?mode=web&next=${encodeURIComponent(here)}`;
  };

  async function finish(user: Awaited<ReturnType<ReturnType<typeof accountApi>["verifyCode"]>>) {
    signedIn(user);
    onDone();
    // the app opens in place of this screen; if this screen is still here a few seconds on (a sheet, a slow start), the loading screen comes off
    setTimeout(() => setFinishing(false), 4000);
  }

  async function withProvider(provider: "apple" | "google") {
    setError(null);
    if (!native) return; // the website uses a plain link (providerHref below)
    setBusy(true);
    try {
      if (provider === "apple") {
        const r = await nativeCall("appleSignIn");
        if (r.error === "cancelled") return;
        if (!r.idToken) throw new Error(r.error ?? "failed");
        setFinishing(true);
        await finish(await accountApi().signInWithApple(r.idToken, r.nonce));
      } else {
        const r = await nativeCall("webAuth", { provider: "google" });
        if (r.error === "cancelled") return;
        if (!r.authCode || !r.verifier) throw new Error(r.error ?? "failed");
        setFinishing(true);
        await finish(await accountApi().exchange(r.authCode, r.verifier));
      }
    } catch (e) {
      setFinishing(false);
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t("That doesn't look like an email address."));
      return;
    }
    setBusy(true);
    try {
      await accountApi().sendCode(email.trim());
      setCode("");
      setStep("code");
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkCode() {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t("Please type the 6 digits from the email."));
      return;
    }
    setBusy(true);
    setFinishing(true);
    try {
      await finish(await accountApi().verifyCode(email.trim(), code.trim()));
    } catch (e) {
      setFinishing(false);
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-2 pt-1">
      {finishing && required && <SigningIn />}
      {step === "choose" && (
        <>
          {intro && <p className="mb-5 text-base leading-snug">{required
            ? t("New here? Any of these makes your free account. Been here before? Use the same one as last time.")
            : t("Sign in to keep your saved meals, shopping list and settings on all your devices. You don't need an account to use {app}.", { app: site.name })}</p>}
          <div className="space-y-2.5">
            {canUseProviders && (
              <>
                <ProviderButton href={native ? undefined : providerHref("apple")} disabled={busy} onClick={() => void withProvider("apple")} className="bg-black text-white">
                  <AppleLogo />
                  {t("Continue with Apple")}
                </ProviderButton>
                {/* Google's own look: white, its dark words, and a visible edge (#7a817d, close to Google's #747775; the hairline was 1.36:1) */}
                <ProviderButton href={native ? undefined : providerHref("google")} disabled={busy} onClick={() => void withProvider("google")} className="border-[1.5px] border-edge bg-white text-[#1f1f1f]">
                  <GoogleLogo />
                  {t("Continue with Google")}
                </ProviderButton>
              </>
            )}
            <Button full variant="secondary" disabled={busy} data-signin-last className="min-h-12 text-base" onClick={() => { setError(null); setStep("email"); }}>
              {t("Continue with email")}
            </Button>
            {/* the iPhone app only: what Apple's own sheet will ask for, under all three buttons so they fit a small screen together (guideline 4.8) */}
            {native && canUseProviders && <p className="px-1 text-[0.9375rem] leading-snug text-foreground">{t("With Apple, your iPhone asks for Face ID or your passcode. There's no new password to remember.")}</p>}
          </div>
          {error && <SignInError>{error}</SignInError>}
        </>
      )}

      {step === "email" && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
          <p className="text-base leading-snug">{t("We'll email you a 6-digit code. There's no password to remember.")}</p>
          <div className="mt-5">
            <Field label={t("Your email address")}>
              <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          {error && <SignInError>{error}</SignInError>}
          {/* busy: the ink stays ink with a spinner and "Working…" (never the grey can't-press fill, which read as broken) */}
          <Button full className="mt-5 min-h-12 text-base" busy={busy} type="submit">{t("Send me a code")}</Button>
          {/* not "Back": on the welcome steps the screen's own Back is just above (two Backs that go to different places) */}
          <Button full variant="ghost" className="mt-1.5" onClick={() => { setError(null); setStep("choose"); }}>{t("Other ways to sign in")}</Button>
        </form>
      )}

      {step === "code" && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void checkCode(); }}>
          {/* the address on its own line, big, so a typo shows; then who the email is from and where else to look (onboarding review 2026-11-19: older people
              stall in Mail with the code in Junk). No subject is named: returning people get the Magic Link email, whose subject isn't ours yet. */}
          <p className="text-base leading-snug">
            {t("We've sent a 6-digit code to")}{" "}
            <strong className="mt-0.5 block text-[1.125rem] font-bold [overflow-wrap:anywhere]">{email.trim()}</strong>
          </p>
          <p className="mt-2.5 text-base leading-snug">{t("It comes from {app} ({sender}). Not there in a minute? Look in Junk or Spam.", { app: site.name, sender: CODE_SENDER })}</p>
          {/* the iPhone app: going to Mail and back loses nothing (if iOS ends the app meanwhile, the welcome screens carry on from this step) */}
          {native && <p className="mt-2.5 text-base leading-snug">{t("Open Mail to find the code, then come back here. {app} keeps your place.", { app: site.name })}</p>}
          <div className="mt-5">
            <Field label={t("6-digit code")}>
              <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6} autoFocus className={`${inputClass} min-h-14 text-center text-[1.75rem] font-semibold tracking-[0.4em] tabular-nums`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </Field>
          </div>
          {error && <SignInError>{error}</SignInError>}
          <Button full className="mt-5 min-h-12 text-base" busy={busy} type="submit">{t("Sign in")}</Button>
          <div className="mt-1.5 flex flex-wrap justify-center gap-x-2">
            <Button variant="ghost" disabled={busy} onClick={() => { setError(null); setStep("email"); }}>{t("Use a different email")}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void sendCode()}>{t("Send a new code")}</Button>
          </div>
        </form>
      )}

      {required ? (
        // What the account keeps, named (lib/mm/syncStores.ts YOUR_DATA_SYNCED: the synced settings and stores; the log only its last two days), at 16 px in the
        // page's ink, not small grey. Sex, age, height, weight and activity are never kept (lib/mm/onboardingPlan.ts PRIVACY). Change this with the privacy page
        // and SYNC_STORES.
        <p className="mt-5 flex items-start gap-2.5 text-base leading-snug text-foreground">
          <ShieldIcon aria-hidden className="mt-[0.2rem] h-[1.125rem] w-[1.125rem] shrink-0 text-accent" />
          {/* "No ads, no tracking" stays only while the setup screen counts are off (lib/mm/config.ts TELEMETRY_ENABLED); on, the line says what is counted */}
          <span>{TELEMETRY_ENABLED
            ? t("We keep your email address, your goal and daily numbers, the foods you avoid, your shops, the last two days of your food log, your favourites, the meals, recipes, lists and comparisons you save, and the foods you said you have. Never your sex, age, height, weight or activity. No ads. We also count how many people reach each setup screen, without knowing who they are.")
            : t("We keep your email address, your goal and daily numbers, the foods you avoid, your shops, the last two days of your food log, your favourites, the meals, recipes, lists and comparisons you save, and the foods you said you have. Never your sex, age, height, weight or activity. No ads, no tracking.")}</span>
        </p>
      ) : (
        <p className="mt-5 text-[0.8125rem] leading-snug text-muted">{TELEMETRY_ENABLED
          ? t("We only keep your email address and the things listed in Settings › Your data. No ads. We also count how many people reach each setup screen, without knowing who they are.")
          : t("We only keep your email address and the things listed in Settings › Your data. No ads, no tracking.")}</p>
      )}
      {community && <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{t("To use friends, we also keep the username you choose, your friends and the shopping lists you send and get.")}</p>}
    </div>
  );
}
