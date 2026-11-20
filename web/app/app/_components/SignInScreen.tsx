"use client";

import { useLayoutEffect, useRef } from "react";
import { SIGN_IN_HEADING, type SignInReason } from "@/lib/mm/signInGate";
import { tk } from "@/lib/mm/i18n";
import { site } from "@/site.config";
import { useT } from "../_lib/i18n";
import { ChevronLeftIcon } from "./icons";
import { PipSays } from "./Mascot";
import { SignInPanel } from "./SignIn";
import { Card } from "./ui";

// The sign-in screen (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts SIGN_IN_REQUIRED, lib/mm/signInGate.ts).
// The same three ways in as Settings › Account (Apple, Google, a 6-digit email code); a new email, Apple ID or Google account creates the account, so one screen
// serves both. There is no way past it except signing in: the terms, privacy and support pages stay open below.
// Since the onboarding meeting of 19 November (questions 1 and 4, approved by the founder that day) the welcome screens show it after "Your daily targets", and its
// heading follows how it was reached (`reason`): "Save your plan: make your free account" from setup, "Make your free account" from "Look around first", "Welcome
// back. Sign in" from the cover's "Already have an account? Sign in". A page of the app reached signed out keeps "Sign in or sign up" (founder 2026-11-18).
// Pip gives one reason, once (onboarding review 2026-11-19, change 12); the app's own icon and name sit on top, like the welcome cover.
// `onBack`: the welcome screens' own Back (to the screen it was opened from); the app's pages have none.

/** Pip's one line for each way in. */
const PIP_LINE: Readonly<Record<SignInReason | "page", string>> = {
  setup: tk("Your numbers are ready. Your free account keeps them, and your meals and lists, safe if you change phone."),
  look: tk("First, your free account. It keeps your goal, meals and shopping list safe if you change phone."),
  returning: tk("Use the same Apple ID, Google account or email as last time."),
  page: tk("First, your free account. It keeps your goal, meals and shopping list safe if you change phone."),
};

export function SignInScreen({ onDone, onBack, reason }: { onDone?: () => void; onBack?: () => void; reason?: SignInReason }) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const way = reason ?? "page";
  // a screen reader starts at the heading when this screen takes the place of a page
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col">
      {onBack && (
        // Back with its word, white with the control edge (colour meeting, 19 November 2026: grey-on-grey read as disabled)
        <button type="button" onClick={onBack} className="-ms-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full border-[1.5px] border-edge bg-card pe-4 ps-2.5 text-base font-semibold text-foreground transition active:scale-[0.97] active:bg-background hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ChevronLeftIcon aria-hidden className="h-5 w-5 text-ink rtl:rotate-180" /> {t("Back")}
        </button>
      )}
      <p className={`${onBack ? "mt-4" : "mt-2"} flex items-center gap-2`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
        <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
        <span className="min-w-0 text-lg font-[800] tracking-[-0.02em]">{site.name}</span>
      </p>
      <h1 ref={heading} tabIndex={-1} className="mt-4 text-[2.25rem] font-[700] leading-[1.06] tracking-[-0.03em] outline-none">{t(SIGN_IN_HEADING[way])}</h1>
      <div className="mt-4">
        <PipSays mood="wave" size={64}>{t(PIP_LINE[way])}</PipSays>
      </div>
      <Card className="mt-2 p-5">
        <SignInPanel required community={false} onDone={onDone ?? (() => undefined)} />
      </Card>
      <p className="mt-auto pt-6 text-center text-[0.8125rem] text-muted">
        <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> ·{" "}
        <a href="/privacy" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Privacy")}</a> ·{" "}
        <a href="/support" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Help")}</a>
      </p>
    </div>
  );
}
