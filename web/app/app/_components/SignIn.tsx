"use client";

import { useEffect, useId, useRef, useState } from "react";
import { API_BASE, APP_BUILD, TELEMETRY_ENABLED } from "@/lib/mm/config";
import { AccountError } from "@/lib/mm/account";
import { tk, type T } from "@/lib/mm/i18n";
import { nativeCall, hasNative } from "@/lib/mm/native";
import { CODE_LENGTH, CODE_RESEND_SECONDS, codeDigits, looksLikeEmail, resendWait } from "@/lib/mm/signInGate";
import { site } from "@/site.config";
import { accountApi, keepHashForSignIn, signedIn } from "../_lib/account";
import { useT } from "../_lib/i18n";
import { ShieldIcon } from "./icons";
import { SigningIn, type SignInHow } from "./SigningIn";
import { Note } from "./Note";
import { Button, Sheet } from "./ui";

// Sign in (docs/ACCOUNTS_SYNC.md). Since 2026-11-17 everyone signs in (SIGN_IN_REQUIRED: the full-screen SignInScreen uses this same panel); with that
// switch off it is optional, and signing in only turns on sync across devices.
// Three ways in, one big button each: Apple, Google, and a 6-digit code by email (no password to remember).
//   * Website: Apple and Google are a normal sign-in on numbite.com (the browser leaves for the provider and comes back).
//   * iPhone app: Apple uses the iPhone's own Apple sheet; Google opens numbite.com in the iPhone's secure browser sheet.
//   * Email: two screens of one question each (founder 2026-11-20, "short and simple", laid out like his reference screens): "What's your email?" typed big
//     in the middle with Continue held just above the keyboard, then "Enter the code" with six places that go on by themselves (EmailSignIn). The app keeps the session it is
//     given, the website gets http-only cookies.

/** What the website's Apple and Google sign-in says when it comes back without finishing (?signin=<reason>, lib/auth/handlers.ts failure). "ok" has none. */
export const SIGN_IN_MESSAGES: Readonly<Record<string, string>> = {
  cancelled: tk("Sign-in was cancelled."),
  failed: tk("Sign-in didn't finish. Please try again."),
  expired: tk("That sign-in took too long. Please try again."),
  busy: tk("Too many tries. Please wait a few minutes and try again."),
};

/** The sign-in screen's own height: the whole screen inside the app's padding (AppShell's main), so a bar at its foot sits at the screen's foot. */
export const SIGN_IN_SCREEN = "flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col";

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
function ProviderButton({ href, disabled, onClick, className, last, children }: { href?: string; disabled?: boolean; onClick: () => void; className: string; last?: boolean; children: React.ReactNode }) {
  // 56 px tall, the reference screens' big full-width pill (founder 2026-11-20)
  const cls = `inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full px-5 text-[1.0625rem] font-semibold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${disabled ? "pointer-events-none" : ""} ${className}`;
  // the website leaves for Apple or Google: this page's "#..." (a shared list) is noted first, as the browser won't bring it back (app/_lib/account.ts)
  return href ? (
    <a href={href} onClick={keepHashForSignIn} className={cls}>{children}</a>
  ) : (
    <button type="button" disabled={disabled} onClick={onClick} className={cls} data-signin-last={last || undefined}>{children}</button>
  );
}

/** What went wrong, under the field or the buttons: the app's error banner (colour meeting, 19 November 2026: "failures as the error banner"; _components/Note.tsx). */
function SignInError({ children, id }: { children: string; id?: string }) {
  return <Note kind="error" heading={null} className="mt-3" id={id}>{children}</Note>;
}

/** Each failure said plainly, in the same words wherever it happens. */
function describeError(e: unknown, t: T): string {
  if (e instanceof AccountError) {
    if (e.offline) return t("You're offline. Connect to the internet and try again.");
    // short: the countdown and "Send it again" under it say the rest (the 20 November review: the old "Ask for a new one" fought the countdown)
    if (e.code === "invalid_code") return t("That code isn't right.");
    if (e.status === 429) return t("Please wait a minute and try again.");
    if (e.code === "invalid_request") return t("That doesn't look right. Please check it and try again.");
    if (e.status === 503) return t("Sign-in isn't available right now. Please try again in a moment.");
  }
  return t("Something went wrong. Please try again.");
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

// "Signing you in…" with the real steps under it lives in SigningIn.tsx (founder 2026-11-20: "what it's doing, like loading recipes").
export { SigningIn } from "./SigningIn";

/**
 * The three ways in. `required`: on the sign-in screen everyone sees first: one small line under the buttons says what the account keeps, with the Privacy link
 * (founder 2026-11-20: no "New here?" line, no Face ID explanation, no long list). Otherwise (Settings › Account, Premium, friends, where an account is optional)
 * `intro` is the line above the buttons that says it is optional. `notice`: what happened to a website sign-in that came back without finishing
 * (SIGN_IN_MESSAGES), shown under the buttons until the next tap. `onEmail`: the sign-in screen shows the email screens in its own place; without it they
 * open inside this panel (the sheet).
 */
export function SignInPanel({ onDone, community, required = false, intro = true, notice = null, onEmail }: { onDone: () => void; community: boolean; required?: boolean; intro?: boolean; notice?: string | null; onEmail?: () => void }) {
  const t = useT();
  const [emailHere, setEmailHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [how, setHow] = useState<SignInHow>("apple");
  const [error, setError] = useState<string | null>(notice ? t(notice) : null);
  const native = hasNative();
  const canUseProviders = !APP_BUILD || native; // the packed app outside the iPhone app (a testing browser) has no way to open them

  /** The website: a normal sign-in. The browser leaves for Apple or Google and comes back to /auth/callback, then to this page. */
  const providerHref = (provider: "apple" | "google") => {
    const here = typeof window !== "undefined" && window.location.pathname === "/app/settings" ? "/app/settings#account" : typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app/settings#account";
    return `${API_BASE}auth/${provider}/start?mode=web&next=${encodeURIComponent(here)}`;
  };

  async function withProvider(provider: "apple" | "google") {
    setError(null);
    if (!native) return; // the website uses a plain link (providerHref below)
    setBusy(true);
    try {
      if (provider === "apple") {
        const r = await nativeCall("appleSignIn");
        if (r.error === "cancelled") return;
        if (!r.idToken) throw new Error(r.error ?? "failed");
        setHow("apple");
        setFinishing(true);
        signedIn(await accountApi().signInWithApple(r.idToken, r.nonce));
      } else {
        const r = await nativeCall("webAuth", { provider: "google" });
        if (r.error === "cancelled") return;
        if (!r.authCode || !r.verifier) throw new Error(r.error ?? "failed");
        setHow("google");
        setFinishing(true);
        signedIn(await accountApi().exchange(r.authCode, r.verifier));
      }
      onDone();
      // the app opens in place of this screen; if this screen is still here a few seconds on (a sheet, a slow start), the loading screen comes off
      setTimeout(() => setFinishing(false), 4000);
    } catch (e) {
      setFinishing(false);
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const keeps = (
    <>
      {required ? (
        // What the account keeps, in one small line (founder 2026-11-20), with the privacy page for the whole list (lib/mm/syncStores.ts YOUR_DATA_SYNCED).
        // "No ads, no tracking" stays only while the setup screen counts are off (lib/mm/config.ts TELEMETRY_ENABLED); on, the line says what is counted.
        // Small and centred under the buttons, its shield in line with the words, narrow enough that English breaks after its first sentence.
        <p className="mx-auto mt-3.5 max-w-[18.5rem] text-center text-[0.9375rem] leading-snug text-muted">
          <ShieldIcon aria-hidden className="-mt-0.5 me-1.5 inline-block h-4 w-4 align-middle text-accent" />
          <span>
            {TELEMETRY_ENABLED
              ? t("We keep your email and what you save. No ads. We count visits to setup screens, without knowing who you are.")
              : t("We keep your email and what you save. No ads, no tracking.")}{" "}
            <a href="/privacy" className="-my-3 inline-block py-3 font-semibold text-foreground underline underline-offset-2">{t("Privacy")}</a>
          </span>
        </p>
      ) : (
        <p className="mt-5 text-[0.8125rem] leading-snug text-muted">{TELEMETRY_ENABLED
          ? t("We only keep your email address and the things listed in Settings › Your data. No ads. We also count how many people reach each setup screen, without knowing who they are.")
          : t("We only keep your email address and the things listed in Settings › Your data. No ads, no tracking.")}</p>
      )}
      {community && <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{t("To use friends, we also keep the username you choose, your friends and the shopping lists you send and get.")}</p>}
    </>
  );

  // the sheet: the two email screens in the sheet's own place, with Back to the three ways in
  if (emailHere) {
    return (
      <div className="pb-2 pt-1">
        <EmailSignIn onDone={onDone} onBack={() => setEmailHere(false)} />
        {keeps}
      </div>
    );
  }

  return (
    <div className="pb-2 pt-1">
      {finishing && required && <SigningIn how={how} />}
      {intro && !required && <p className="mb-5 text-base leading-snug">{t("Sign in to keep your saved meals, shopping list and settings on all your devices. You don't need an account to use {app}.", { app: site.name })}</p>}
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
        <ProviderButton last disabled={busy} onClick={() => { setError(null); if (onEmail) onEmail(); else setEmailHere(true); }} className="border-[1.5px] border-edge bg-card text-foreground hover:bg-background active:bg-background">
          {t("Continue with email")}
        </ProviderButton>
      </div>
      {error && <SignInError>{error}</SignInError>}
      {keeps}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ "Continue with email"

/** A white circle with the control edge round an ink arrow (mirrored for right-to-left languages): the same Back as the welcome steps' top bar. */
const CIRCLE = "border-[1.5px] border-edge bg-card text-foreground transition active:scale-[0.97] active:bg-background hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export function BackCircle({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={t("Back")} className={`${CIRCLE} -ms-1 grid h-12 w-12 shrink-0 place-items-center rounded-full`}>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-ink rtl:rotate-180">
        <path d="M19 12H5M11 5l-7 7 7 7" />
      </svg>
    </button>
  );
}

/**
 * The top of the two email screens, as on the founder's reference screens: Back at the top left and, on the sign-in screen's own full screens, Help at the
 * top right (the support page, for a code that doesn't come): a white pill like the welcome steps' Skip, a real button rather than faint words.
 */
function EmailTop({ onBack, help }: { onBack: () => void; help: boolean }) {
  const t = useT();
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <BackCircle onClick={onBack} />
      {help && (
        <a href="/support" className={`${CIRCLE} -me-1 inline-flex min-h-12 shrink-0 items-center rounded-full px-4 text-[1rem] font-bold`}>
          {t("Help")}
        </a>
      )}
    </div>
  );
}

/**
 * How much of the page the iPhone's keyboard covers (0 when it is down), so Continue can sit just above it. iOS (and Chrome on Android) shrink only the visual
 * viewport for the keyboard: the part of the layout viewport below it is covered. Small differences (a toolbar, a pinch) count as no keyboard.
 */
function useKeyboardInset(on: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!on || !vv) return;
    const update = () => {
      const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setInset(covered > 120 ? covered : 0);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [on]);
  return inset;
}

/**
 * The email field on "What's your email?", as on the reference screen: no box, the words big (32 px) and centred in the free space, "Email" in grey until
 * something is typed. A long address gets smaller to fit the width (each character taken as 0.58 of the type size, measured against the field's own width:
 * `@container`), never below 18 px. No ring round it: the typing mark and the keyboard show it is in use (globals.css rings every focused field).
 */
const EMAIL_FIELD = "block min-h-14 w-full bg-transparent px-1 text-center font-medium leading-tight tracking-[-0.01em] text-foreground caret-accent placeholder:font-normal placeholder:text-placeholder";
const emailSize = (typed: string) => ({ fontSize: `clamp(1.125rem, calc(100cqw / ${(Math.max(typed.trim().length, 10) * 0.58).toFixed(2)}), 2rem)` });

/**
 * "Continue with email" (founder 2026-11-20, laid out like his reference screens; nothing else on either screen). Each has Back top left and Help top right, the
 * heading and one grey line at the top left, the answer big in the middle of the free space, and its foot just above the keyboard:
 * 1. "What's your email?" / "We'll send you a code." / the address typed big and centred, no box ("Email" in grey before) / Continue at the foot.
 * 2. "Enter the code" / "Sent to {email}" / six places in a row (dots until typed). They are one real field (numbers only, `one-time-code` so the iPhone offers
 *    the code from Mail; a paste fills all six); when the sixth digit is in, it goes on by itself. At the foot, small and centred, "You can ask for a new code
 *    in {n} seconds" counts down (Supabase sends one code a minute), then "Send it again".
 * Back (the chevron, top left) goes from the code to the email, and from the email to the three ways in. Coming back to the email and going on with the same
 * address while its code is still new goes straight to the code, with no second email. `full`: the sign-in screen's own two full screens; otherwise in the sheet.
 */
export function EmailSignIn({ onDone, onBack, full = false }: { onDone: () => void; onBack: () => void; full?: boolean }) {
  const t = useT();
  const ids = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ to: string; at: number } | null>(null);
  const [wait, setWait] = useState(0);
  const [resent, setResent] = useState(false);
  const codeBox = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboardInset(full);

  // the countdown to "Send it again", once a second until it is over
  useEffect(() => {
    if (!sent) return;
    const id = window.setInterval(() => {
      const left = resendWait(sent.at, Date.now());
      setWait(left);
      if (left === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [sent]);

  async function send(again = false) {
    setError(null);
    const to = email.trim();
    if (!looksLikeEmail(to)) {
      setError(t("That doesn't look like an email address."));
      return;
    }
    // back from the code with the same address while it is still new: straight back to it (a second email now would be refused)
    if (!again && sent?.to === to && resendWait(sent.at, Date.now()) > 0) {
      setStep("code");
      return;
    }
    setBusy(true);
    try {
      await accountApi().sendCode(to);
      setCode("");
      setSent({ to, at: Date.now() });
      setWait(CODE_RESEND_SECONDS);
      setResent(again);
      setStep("code");
      if (again) codeBox.current?.focus();
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function check(digits: string) {
    setError(null);
    setBusy(true);
    setFinishing(true);
    try {
      signedIn(await accountApi().verifyCode(email.trim(), digits));
      onDone();
      // the app opens in place of this screen; if it is still here a few seconds on (a sheet, a slow start), the loading screen comes off
      setTimeout(() => setFinishing(false), 4000);
    } catch (e) {
      setFinishing(false);
      // a wrong or old code: the places empty, ready for the right one; anything else keeps the digits for "Try again"
      if (e instanceof AccountError && e.code === "invalid_code") setCode("");
      setError(describeError(e, t));
      codeBox.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  /** Whatever went into the field (typed, filled in from Mail, pasted): its digits, and on with the sixth. Nothing changes while the code is being checked. */
  function typeCode(raw: string) {
    if (busy) return;
    const next = codeDigits(raw);
    setCode(next);
    setError(null);
    setResent(false);
    if (next.length === CODE_LENGTH) void check(next);
  }

  /** The typing point always stays after the last digit (the field's own words can't be seen, so typing in the middle would be lost). */
  function caretToEnd(el: HTMLInputElement) {
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end);
  }

  const head = `${ids}-head`;
  const sub = `${ids}-sub`;
  const err = `${ids}-err`;
  const Heading = full ? "h1" : "h3";
  // the welcome screens' own heading size on the full screens; the grey line under it, as on the reference screens
  const headClass = full ? "mt-4 text-[2rem] font-[700] leading-[1.08] tracking-[-0.03em]" : "mt-3 text-[1.5rem] font-[700] leading-tight tracking-[-0.02em]";
  const subClass = "mt-2 text-[1.0625rem] leading-snug text-muted";
  // The full screens fill the screen, and while the keyboard is up only the part above it, so the field sits in the middle of what can be seen and the foot
  // (Continue, or the countdown) sits just above the keyboard. In the sheet everything simply follows on.
  const screen = full ? SIGN_IN_SCREEN : undefined;
  const screenStyle = full && keyboard ? { minHeight: `calc(100dvh - max(1.25rem, env(safe-area-inset-top)) - ${keyboard}px)` } : undefined;
  const middle = full ? "flex min-h-0 flex-1 flex-col justify-center py-6" : "flex flex-col justify-center py-7";
  const foot = (children: React.ReactNode) =>
    full ? (
      // held at the foot of the screen, and 16 px above the keyboard while it is up (solid, with a short fade at its top)
      <div
        className="sticky z-10 -mx-5 mt-auto bg-[linear-gradient(to_top,var(--color-background)_calc(100%-1.5rem),transparent)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6"
        style={{ bottom: keyboard, ...(keyboard ? { paddingBottom: "1rem" } : {}) }}
      >
        {children}
      </div>
    ) : (
      children
    );

  if (step === "email") {
    return (
      <form noValidate onSubmit={(e) => { e.preventDefault(); void send(); }} className={screen} style={screenStyle}>
        <EmailTop help={full} onBack={() => { setError(null); onBack(); }} />
        <Heading id={head} className={headClass}>{t("What's your email?")}</Heading>
        <p id={sub} className={subClass}>{t("We'll send you a code.")}</p>
        <div className={`${middle} @container`}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            autoFocus
            placeholder={t("Email")}
            aria-labelledby={head}
            aria-describedby={error ? `${sub} ${err}` : sub}
            aria-invalid={error ? true : undefined}
            className={EMAIL_FIELD}
            style={{ ...emailSize(email), outline: "none" }}
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
          />
          {error && <SignInError id={err}>{error}</SignInError>}
        </div>
        {foot(<Button full busy={busy} type="submit" className="min-h-14 text-[1.0625rem]">{t("Continue")}</Button>)}
      </form>
    );
  }

  // "Sent to {email}" with the address in the ink colour, so a typo shows (the words around it come from the translation)
  const [sentBefore, sentAfter = ""] = t("Sent to {email}").split("{email}");
  const next = Math.min(code.length, CODE_LENGTH - 1);
  return (
    <div className={screen} style={screenStyle}>
      {finishing && full && <SigningIn how="code" />}
      <EmailTop help={full} onBack={() => { setError(null); setCode(""); setStep("email"); }} />
      <Heading id={head} className={headClass}>{t("Enter the code")}</Heading>
      <p id={sub} className={subClass}>
        {sentBefore}<strong className="font-semibold text-foreground [overflow-wrap:anywhere]">{email.trim()}</strong>{sentAfter}
      </p>
      <div className={middle}>
        {/* Six places in a row in the middle, as on the reference screen: a light lime dot for each digit to come, the next one solid and a little bigger, each
            digit big in its place once typed. The real field lies over the row: one field for a screen reader, the phone's code from
            Mail and a paste; its own words are see-through. */}
        <label className="relative mx-auto block w-fit">
          <span aria-hidden className="flex">
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <span key={i} className="flex h-16 w-12 items-center justify-center">
                {code[i] ? (
                  <span className="text-[2.25rem] font-bold leading-none tabular-nums text-foreground">{code[i]}</span>
                ) : i === next ? (
                  <span className="block h-3.5 w-3.5 rounded-full bg-[var(--bar)]" />
                ) : (
                  <span className="block h-3 w-3 rounded-full bg-[var(--bar)]/40" />
                )}
              </span>
            ))}
          </span>
          <input
            ref={codeBox}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            autoFocus
            aria-labelledby={head}
            aria-describedby={error ? `${sub} ${err}` : sub}
            aria-invalid={error ? true : undefined}
            className="absolute inset-0 h-full w-full cursor-text bg-transparent text-base text-transparent caret-transparent selection:bg-transparent [-webkit-text-fill-color:transparent]"
            // no ring round the row (globals.css rings every focused field): the darker dot shows where the next digit goes
            style={{ outline: "none" }}
            value={code}
            onChange={(e) => typeCode(e.target.value)}
            onSelect={(e) => caretToEnd(e.currentTarget)}
            onFocus={(e) => caretToEnd(e.currentTarget)}
          />
        </label>
        {error && <SignInError id={err}>{error}</SignInError>}
        {/* a failure that wasn't the code (no connection, a busy server) leaves the six digits in: one tap tries them again */}
        {error && code.length === CODE_LENGTH && !busy && (
          <Button full variant="secondary" className="mt-3 min-h-12 text-base" onClick={() => void check(code)}>{t("Try again")}</Button>
        )}
        {busy && !full && (
          <p role="status" className="mt-4 flex items-center justify-center gap-2.5 text-base font-semibold">
            <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none" />
            {t("Signing you in…")}
          </p>
        )}
      </div>
      {foot(
        // small and centred at the foot, as on the reference screen: the countdown, then "Send it again"
        <div className="flex min-h-11 items-center justify-center text-center">
          {wait > 0 ? (
            <p className="text-base leading-snug text-muted">
              {wait === 1 ? t("You can ask for a new code in 1 second") : t("You can ask for a new code in {n} seconds", { n: wait })}
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(true)}
              className="inline-flex min-h-11 items-center px-2 text-[1.0625rem] font-semibold text-accent underline decoration-solid underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t("Send it again")}
            </button>
          )}
        </div>,
      )}
      {/* said, not shown: the countdown starting again is what the eye sees */}
      <p role="status" className="sr-only">{resent ? t("We've sent a new code.") : ""}</p>
    </div>
  );
}
