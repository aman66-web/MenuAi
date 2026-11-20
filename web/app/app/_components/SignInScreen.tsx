"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SIGN_IN_HEADING, type SignInReason } from "@/lib/mm/signInGate";
import { tk } from "@/lib/mm/i18n";
import { site } from "@/site.config";
import { useT } from "../_lib/i18n";
import { BackCircle, EmailSignIn, SIGN_IN_MESSAGES, SIGN_IN_SCREEN, SignInPanel } from "./SignIn";

// The sign-in screen (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts SIGN_IN_REQUIRED, lib/mm/signInGate.ts).
// The same three ways in as Settings › Account (Apple first, Google at the same size, then a 6-digit email code); a new email, Apple ID or Google account creates
// the account, so one screen serves both. Where sign-in is required there is no way past it except signing in: the terms, privacy and support pages stay open below.
// The onboarding redesign meeting of 20 November 2026 (approved by the founder) makes it the welcome steps' last step, "Save your plan" (founder, 20 November
// afternoon, "short and simple"; that morning "Save your goal and numbers: make your free account") (Step 11 of 11, after the three feature screens and straight
// before Home), with Back to the screen it came from; the cover's "Already have an account? Sign in" opens it headed "Welcome back. Sign in"; a page of the app
// reached signed out keeps "Sign in or sign up" (founder 2026-11-18). Laid out like the founder's reference screens (20 November: "Did you not use any of the
// examples"): the heading and one grey line at the top left, white space (no picture: Pip stands, small, on the welcome steps' first screen only; the review of
// 20 November evening), and the three big buttons at the foot, where a thumb is; under them one small line says what the account keeps, with the Privacy link (SignIn.tsx), and no card
// round any of it. "Continue with email" swaps the whole screen for the two email screens ("What's your email?", then "Enter the code": SignIn.tsx
// EmailSignIn), whose Back arrow comes back here. On the last step:
// - "Waiting for you on Home: {recipe}." when a first recipe was chosen on step 5, only while the three buttons still fit on the screen without scrolling (4.8);
// - offline, a status line above the buttons before any tap (the buttons stay; a tap gives the offline error);
// - where sign-in is optional (numbite.com's signInOptional switch, or NEXT_PUBLIC_SIGN_IN_REQUIRED=0), a quiet "Not now", and nothing else changes.
// `top`: the welcome steps' own top bar (Back, the app's name, the bar and its counter), in place of this screen's Back and name. `onBack`: Back on its own.

/** The one short grey line under the heading for each way in (founder 2026-11-20: "Free, and it keeps your plan safe on any phone."). */
const PIP_LINE: Readonly<Record<SignInReason | "page", string>> = {
  setup: tk("Free, and it keeps your plan safe on any phone."),
  returning: tk("Use the same Apple ID, Google account or email as last time."),
  page: tk("Free, and it keeps your plan safe on any phone."),
};

/** Whether the browser says it is online (true on the server and until it says otherwise). */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function SignInScreen({ onDone, onBack, reason, top, counter, waiting, resumed, onNotNow }: {
  onDone?: () => void;
  onBack?: () => void;
  reason?: SignInReason;
  top?: React.ReactNode;
  /** "Step 11 of 11", read by a screen reader with the heading. */
  counter?: string;
  /** The first recipe chosen on step 5, by name. */
  waiting?: string | null;
  /** Came back to this step through the cover's "Carry on". */
  resumed?: boolean;
  /** Where sign-in is optional: "Not now". */
  onNotNow?: () => void;
}) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const way = reason ?? "page";
  const online = useOnline();
  // "Continue with email": the two email screens take this screen's place until their Back arrow
  const [emailOpen, setEmailOpen] = useState(false);
  // the recipe line only while Apple, Google and email all still fit on the screen without scrolling (guideline 4.8): measured once it is in place, and
  // taken out again (hidden) when it would push "Continue with email" below the screen
  const waitingLine = useRef<HTMLParagraphElement>(null);
  // a screen reader starts at the heading when this screen takes the place of a page (and again back from the email screens)
  useLayoutEffect(() => {
    if (!emailOpen) heading.current?.focus({ preventScroll: true });
  }, [emailOpen]);
  useLayoutEffect(() => {
    const el = waitingLine.current;
    const last = document.querySelector<HTMLElement>("[data-signin-last]");
    if (el && last && last.getBoundingClientRect().bottom + window.scrollY > window.innerHeight) el.hidden = true;
  }, [waiting, emailOpen]);
  const line = way === "setup" && resumed ? tk("Welcome back. Your plan is still here.") : PIP_LINE[way];
  // A website sign-in with Apple or Google that came back without finishing (?signin=cancelled, failed, expired or busy: lib/auth/handlers.ts failure) says so
  // under the buttons; the address is tidied either way (an "ok" has nothing to say). Read once it is in the browser.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const reason = url.searchParams.get("signin");
    if (!reason) return;
    url.searchParams.delete("signin");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const known = SIGN_IN_MESSAGES[reason];
    if (known) setNotice(known); // eslint-disable-line react-hooks/set-state-in-effect -- read from the address once it is in the browser
  }, []);
  if (emailOpen) return <EmailSignIn full onBack={() => setEmailOpen(false)} onDone={onDone ?? (() => undefined)} />;
  return (
    <div className={SIGN_IN_SCREEN}>
      {top}
      {!top && (
        // one row, like the welcome cover's: the back arrow (when there is somewhere to go back to), then the app's icon and name
        <div className="flex min-h-12 items-center gap-2.5">
          {onBack && <BackCircle onClick={onBack} />}
          <p className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
            <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
            <span className="min-w-0 truncate text-lg font-[800] tracking-[-0.02em]">{site.name}</span>
          </p>
        </div>
      )}
      <h1 ref={heading} tabIndex={-1} className={`${top ? "mt-5" : "mt-4"} text-[2rem] font-[700] leading-[1.08] tracking-[-0.03em] outline-none [@media(max-height:640px)]:mt-3`}>
        {t(SIGN_IN_HEADING[way])}
        {counter && <span className="sr-only">{`, ${counter}`}</span>}
      </h1>
      {/* the one grey line under the heading, as on the reference screens */}
      <p className="mt-2 text-[1.0625rem] leading-snug text-muted">{t(line)}</p>
      {waiting && <p ref={waitingLine} className="mt-2 text-base font-semibold leading-snug text-foreground">{t("Waiting for you on Home: {recipe}.", { recipe: waiting })}</p>}
      {/* nothing in the free space: white space, as on the reference screens (Pip stands, small, on step 1 only) */}
      <div className="mt-auto pt-6">
        {way === "setup" && !online && (
          <p role="status" className="mb-3 text-base font-semibold leading-snug text-foreground">{t("You're offline. Connect to the internet to make your account. Your answers are kept on this phone.")}</p>
        )}
        <SignInPanel key={notice ?? ""} required notice={notice} community={false} onDone={onDone ?? (() => undefined)} onEmail={() => { setNotice(null); setEmailOpen(true); }} />
      </div>
      {onNotNow && (
        <button type="button" onClick={onNotNow} className="mx-auto mt-1 flex min-h-11 items-center justify-center px-3 text-center text-[1rem] font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {t("Not now")}
        </button>
      )}
      {/* Privacy is in the line under the buttons */}
      <p className="pt-3 text-center text-[0.8125rem] text-muted">
        <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> ·{" "}
        <a href="/support" className="-mx-2.5 -my-3.5 inline-block px-2.5 py-3.5 underline underline-offset-2">{t("Help")}</a>
      </p>
    </div>
  );
}
