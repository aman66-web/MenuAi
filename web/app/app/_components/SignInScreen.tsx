"use client";

import { useLayoutEffect, useRef } from "react";
import { site } from "@/site.config";
import { useT } from "../_lib/i18n";
import { ChevronLeftIcon } from "./icons";
import { PipSays } from "./Mascot";
import { SignInPanel } from "./SignIn";
import { Card } from "./ui";

// The screen everyone sees until they are signed in (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts
// SIGN_IN_REQUIRED, lib/mm/signInGate.ts). The same three ways in as Settings › Account (Apple, Google, a 6-digit email code); a new email, Apple ID or Google
// account creates the account, so one screen serves both. There is no way past it except signing in: the terms, privacy and support pages stay open below.
// `onBack`: the welcome screen's own Back (to its cover); the app's pages have none.
// Onboarding review 2026-11-19 (change 12): one reason, said once by Pip (the account keeps things safe if you change phone), instead of three lines on
// "new or returning"; the app's own icon and name on top, like the welcome cover; the heading stays "Sign in or sign up" (founder 2026-11-18).
export function SignInScreen({ onDone, onBack }: { onDone?: () => void; onBack?: () => void }) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  // a screen reader starts at the heading when this screen takes the place of a page
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col">
      {onBack && (
        <button type="button" onClick={onBack} className="-ms-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 text-[0.9375rem] font-semibold text-muted hover:text-foreground">
          <ChevronLeftIcon aria-hidden className="h-5 w-5" /> {t("Back")}
        </button>
      )}
      <p className={`${onBack ? "mt-4" : "mt-2"} flex items-center gap-2`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- our own app icon, a static file */}
        <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" />
        <span className="min-w-0 text-lg font-[800] tracking-[-0.02em]">{site.name}</span>
      </p>
      <h1 ref={heading} tabIndex={-1} className="mt-4 text-[2.25rem] font-[700] leading-[1.06] tracking-[-0.03em] outline-none">{t("Sign in or sign up")}</h1>
      <div className="mt-4">
        <PipSays mood="wave" size={64}>{t("First, your free account. It keeps your goal, meals and shopping list safe if you change phone.")}</PipSays>
      </div>
      <Card className="mt-2 p-5">
        <SignInPanel required community={false} onDone={onDone ?? (() => undefined)} />
      </Card>
      <p className="mt-auto pt-6 text-center text-xs text-muted">
        <a href="/terms" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Terms")}</a> ·{" "}
        <a href="/privacy" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Privacy")}</a> ·{" "}
        <a href="/support" className="-mx-1.5 -my-3.5 inline-block px-1.5 py-3.5 underline underline-offset-2">{t("Help")}</a>
      </p>
    </div>
  );
}
