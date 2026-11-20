"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Pip } from "./_components/Mascot";
import { useT } from "./_lib/i18n";

// When something on a screen breaks (founder 2026-11-18: "Sometimes my app just kind of crashes sometimes, so like please make sure it doesn't"): instead of a
// blank page, this screen with Pip, "Try again" (draws the screen again) and "Go to Home". The tab bar round it keeps working, and nothing the person saved is
// touched. Nothing about the error is sent anywhere; it is written to the console only.

export default function ScreenError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-2 text-center">
      <Pip mood="think" size={96} />
      <h1 className="text-[1.5rem] font-[800] leading-tight tracking-[-0.02em]">{t("Something went wrong on this screen")}</h1>
      <p className="max-w-sm text-base leading-snug text-muted">{t("Nothing you've saved is lost. Try again, or go back to Home.")}</p>
      <button type="button" onClick={() => retry()} className="inline-flex min-h-14 w-full max-w-xs items-center justify-center rounded-full bg-ink px-6 text-lg font-bold text-on-ink transition active:scale-[0.98]">
        {t("Try again")}
      </button>
      <Link href="/app" className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full px-6 text-base font-semibold transition hover:bg-soft-strong">
        {t("Go to Home")}
      </Link>
    </div>
  );
}
