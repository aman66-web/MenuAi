"use client";

import { useState } from "react";
import { API_BASE, APP_BUILD } from "@/lib/mm/config";
import { AccountError } from "@/lib/mm/account";
import { nativeCall, hasNative } from "@/lib/mm/native";
import { site } from "@/site.config";
import { accountApi, signedIn } from "../_lib/account";
import { useT } from "../_lib/i18n";
import { Button, Field, Sheet, Spinner, inputClass } from "./ui";

// Sign in (docs/ACCOUNTS_SYNC.md). Optional: the app works the same without it, and signing in only turns on sync across devices.
// Three ways in, one big button each: Apple, Google, and a 6-digit code by email (no password to remember).
//   * Website: Apple and Google are a normal sign-in on numbite.com (the browser leaves for the provider and comes back).
//   * iPhone app: Apple uses the iPhone's own Apple sheet; Google opens numbite.com in the iPhone's secure browser sheet.
//   * Email: the same code form in both; the app keeps the session it is given, the website gets http-only cookies.

type Step = "choose" | "email" | "code";

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

/** A big sign-in button: a link on the website (it leaves for the provider), a button in the iPhone app (the phone does it). */
function ProviderButton({ href, disabled, onClick, className, children }: { href?: string; disabled?: boolean; onClick: () => void; className: string; children: React.ReactNode }) {
  const cls = `inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full px-5 text-base font-semibold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${disabled ? "pointer-events-none opacity-60" : ""} ${className}`;
  return href ? (
    <a href={href} className={cls}>{children}</a>
  ) : (
    <button type="button" disabled={disabled} onClick={onClick} className={cls}>{children}</button>
  );
}

export function SignInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Sign in")}>
      {open && <SignInPanel onDone={onClose} />}
    </Sheet>
  );
}

function SignInPanel({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        await finish(await accountApi().signInWithApple(r.idToken, r.nonce));
      } else {
        const r = await nativeCall("webAuth", { provider: "google" });
        if (r.error === "cancelled") return;
        if (!r.authCode || !r.verifier) throw new Error(r.error ?? "failed");
        await finish(await accountApi().exchange(r.authCode, r.verifier));
      }
    } catch (e) {
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
    try {
      await finish(await accountApi().verifyCode(email.trim(), code.trim()));
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-2">
      {step === "choose" && (
        <>
          <p className="text-base">{t("Sign in to keep your saved meals, shopping list and settings on all your devices. You don't need an account to use {app}.", { app: site.name })}</p>
          <div className="mt-4 space-y-2.5">
            {canUseProviders && (
              <>
                <ProviderButton href={native ? undefined : providerHref("apple")} disabled={busy} onClick={() => void withProvider("apple")} className="bg-black text-white dark:bg-white dark:text-black">
                  <AppleLogo />
                  {t("Continue with Apple")}
                </ProviderButton>
                <ProviderButton href={native ? undefined : providerHref("google")} disabled={busy} onClick={() => void withProvider("google")} className="border border-line bg-white text-[#1f1f1f]">
                  <GoogleLogo />
                  {t("Continue with Google")}
                </ProviderButton>
              </>
            )}
            <Button full variant="secondary" disabled={busy} className="min-h-12 text-base" onClick={() => { setError(null); setStep("email"); }}>
              {t("Continue with email")}
            </Button>
          </div>
        </>
      )}

      {step === "email" && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
          <p className="text-base">{t("We'll email you a 6-digit code. There's no password to remember.")}</p>
          <div className="mt-4">
            <Field label={t("Your email address")}>
              <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Button full className="mt-4 min-h-12 text-base" disabled={busy} type="submit">{busy ? <Spinner label={t("Sending…")} /> : t("Send me a code")}</Button>
          <Button full variant="ghost" className="mt-1" onClick={() => { setError(null); setStep("choose"); }}>{t("Back")}</Button>
        </form>
      )}

      {step === "code" && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void checkCode(); }}>
          <p className="text-base">{t("We've sent a 6-digit code to {email}. It can take a minute to arrive.", { email: email.trim() })}</p>
          <div className="mt-4">
            <Field label={t("6-digit code")}>
              <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6} autoFocus className={`${inputClass} text-center text-2xl tracking-[0.4em] tabular-nums`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </Field>
          </div>
          <Button full className="mt-4 min-h-12 text-base" disabled={busy} type="submit">{busy ? <Spinner label={t("Checking…")} /> : t("Sign in")}</Button>
          <div className="mt-1 flex flex-wrap justify-center gap-x-2">
            <Button variant="ghost" disabled={busy} onClick={() => { setError(null); setStep("email"); }}>{t("Use a different email")}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void sendCode()}>{t("Send a new code")}</Button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-3 rounded-2xl border border-line bg-soft p-3 text-sm">{error}</p>}
      <p className="mt-4 text-xs text-muted">{t("We only keep your email address and what you choose to sync. No ads, no tracking.")}</p>
    </div>
  );
}
