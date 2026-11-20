"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SIGN_IN_HEADING, type SignInReason } from "@/lib/mm/signInGate";
import { tk } from "@/lib/mm/i18n";
import { site } from "@/site.config";
import { useT } from "../_lib/i18n";
import { ChevronLeftIcon } from "./icons";
import { PipSays } from "./Mascot";
import { SIGN_IN_MESSAGES, SignInPanel } from "./SignIn";
import { Card } from "./ui";

// The sign-in screen (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts SIGN_IN_REQUIRED, lib/mm/signInGate.ts).
// The same three ways in as Settings › Account (Apple first, Google at the same size, then a 6-digit email code); a new email, Apple ID or Google account creates
// the account, so one screen serves both. Where sign-in is required there is no way past it except signing in: the terms, privacy and support pages stay open below.
// The onboarding redesign meeting of 20 November 2026 (approved by the founder) makes it the welcome steps' last step, "Save your goal and numbers: make your free account" (the overnight audit's words)
// (Step 11 of 11, after the three feature screens and straight before Home), with Back to the screen it came from; the cover's "Already have an account? Sign in"
// opens it headed "Welcome back. Sign in"; a page of the app reached signed out keeps "Sign in or sign up" (founder 2026-11-18). Pip, waving, gives one reason,
// once (no figure is on this screen, so he may stand here). On the last step:
// - "Waiting for you on Home: {recipe}." when a first recipe was chosen on step 5, only while the three buttons still fit on the screen without scrolling (4.8);
// - offline, a status line above the buttons before any tap (the buttons stay; a tap gives the offline error);
// - where sign-in is optional (numbite.com's signInOptional switch, or NEXT_PUBLIC_SIGN_IN_REQUIRED=0), a quiet "Not now", and nothing else changes.
// `top`: the welcome steps' own top bar (Back, the app's name, the bar and its counter), in place of this screen's Back and name. `onBack`: Back on its own.

/** Pip's one line for each way in. */
const PIP_LINE: Readonly<Record<SignInReason | "page", string>> = {
  setup: tk("Your goal and daily numbers are ready. Your free account keeps them safe."),
  returning: tk("Use the same Apple ID, Google account or email as last time."),
  page: tk("First, your free account. It keeps your goal, meals and shopping list safe if you change phone."),
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
  // the recipe line only while Apple, Google and email all still fit on the screen without scrolling (guideline 4.8): measured once it is in place, and
  // taken out again (hidden) when it would push "Continue with email" below the screen
  const waitingLine = useRef<HTMLParagraphElement>(null);
  // a screen reader starts at the heading when this screen takes the place of a page
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    const el = waitingLine.current;
    const last = document.querySelector<HTMLElement>("[data-signin-last]");
    if (el && last && last.getBoundingClientRect().bottom + window.scrollY > window.innerHeight) el.hidden = true;
  }, [waiting]);
  const line = way === "setup" && resumed ? tk("Welcome back. Your goal and daily numbers are still here.") : PIP_LINE[way];
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
  return (
    <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col">
      {top}
      {!top && onBack && (
        // Back with its word, white with the control edge (colour meeting, 19 November 2026: grey-on-grey read as disabled)
        <button type="button" onClick={onBack} className="-ms-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full border-[1.5px] border-edge bg-card pe-4 ps-2.5 text-base font-semibold text-foreground transition active:scale-[0.97] active:bg-background hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ChevronLeftIcon aria-hidden className="h-5 w-5 text-ink rtl:rotate-180" /> {t("Back")}
        </button>
      )}
      {!top && (
        <p className={`${onBack ? "mt-4" : "mt-2"} flex items-center gap-2`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="min-w-0 text-lg font-[800] tracking-[-0.02em]">{site.name}</span>
        </p>
      )}
      <h1 ref={heading} tabIndex={-1} className={`${top ? "mt-5" : "mt-4"} text-[2rem] font-[700] leading-[1.08] tracking-[-0.03em] outline-none [@media(max-height:640px)]:mt-3`}>
        {t(SIGN_IN_HEADING[way])}
        {counter && <span className="sr-only">{`, ${counter}`}</span>}
      </h1>
      {/* on a short screen (an iPhone SE: 568 or 667 pt) Pip and his bubble are smaller, so Apple, Google and email all fit without scrolling (guideline 4.8) */}
      <div className="mt-3 [@media(max-height:640px)]:[&_p]:text-[14px] [@media(max-height:640px)]:[&_svg.pip]:h-[3.2rem] [@media(max-height:640px)]:[&_svg.pip]:w-12">
        <PipSays mood="wave" size={64}>{t(line)}</PipSays>
      </div>
      {waiting && <p ref={waitingLine} className="mt-1 text-base font-semibold leading-snug text-foreground">{t("Waiting for you on Home: {recipe}.", { recipe: waiting })}</p>}
      {way === "setup" && !online && (
        <p role="status" className="mt-3 text-base font-semibold leading-snug text-foreground">{t("You're offline. Connect to the internet to make your account. Your answers are kept on this phone.")}</p>
      )}
      <Card className="mt-3 p-5 [@media(max-height:640px)]:mt-2 [@media(max-height:640px)]:p-4">
        {/* the welcome steps' last step has no line above the buttons: the heading and Pip say it, and all three buttons must fit a small screen */}
        <SignInPanel key={notice ?? ""} required intro={way !== "setup"} notice={notice} community={false} onDone={onDone ?? (() => undefined)} />
      </Card>
      {onNotNow && (
        <button type="button" onClick={onNotNow} className="mx-auto mt-3 flex min-h-11 items-center justify-center px-3 text-center text-[1rem] font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {t("Not now")}
        </button>
      )}
      <p className="mt-auto pt-6 text-center text-[0.8125rem] text-muted">
        <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> ·{" "}
        <a href="/privacy" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Privacy")}</a> ·{" "}
        <a href="/support" className="-mx-2.5 -my-3.5 inline-block px-2.5 py-3.5 underline underline-offset-2">{t("Help")}</a>
      </p>
    </div>
  );
}
