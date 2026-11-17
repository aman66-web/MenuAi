"use client";

import { useLayoutEffect, useRef } from "react";
import { site } from "@/site.config";
import { useT } from "../_lib/i18n";
import { ChevronLeftIcon } from "./icons";
import { Pip } from "./Mascot";
import { SignInPanel } from "./SignIn";
import { Card } from "./ui";

// The screen everyone sees until they are signed in (founder 2026-11-17: "Sign up screen shouldn't be skippable, required for everyone"; lib/mm/config.ts
// SIGN_IN_REQUIRED, lib/mm/signInGate.ts). The same three ways in as Settings › Account (Apple, Google, a 6-digit email code); a new email, Apple ID or Google
// account creates the account, so one screen serves both. There is no way past it except signing in: the terms, privacy and support pages stay open below.
// `onBack`: the welcome screen's own Back (to its cover); the app's pages have none.
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
      <p className={`${onBack ? "mt-4" : "mt-2"} flex items-center gap-3 text-[1.125rem] font-semibold leading-snug`}>
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--sun)]"><Pip mood="wave" size={40} className="translate-y-0.5" /></span>
        <span className="min-w-0">{site.name}</span>
      </p>
      <h1 ref={heading} tabIndex={-1} className="mt-4 text-[2.25rem] font-[700] leading-[1.06] tracking-[-0.03em] outline-none">{t("Create your free account")}</h1>
      <p className="mt-2 text-base leading-snug text-muted">{t("Already have one? Sign in the same way as before.")}</p>
      <Card className="mt-5 p-5">
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
