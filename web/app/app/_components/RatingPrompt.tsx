"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { site } from "@/site.config";
import { APP_BUILD } from "@/lib/mm/config";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { answered, localDay, noteUse, ratingDue } from "@/lib/mm/ratingPrompt";
import { ratingStore } from "@/lib/mm/stores";
import { useT } from "../_lib/i18n";
import { Button, Sheet } from "./ui";

// "Are you enjoying Numbite?" (founder 2026-11-17; the timing is lib/mm/ratingPrompt.ts): in the iPhone app only, on Home, rarely, and never over another sheet. A 5 asks
// for Apple's own review pop-up (the founder's decision, aware that showing it only after a 5 is "review gating" Apple may object to); 1-4 or Not now waits 90 days.

const HOME = /^\/app\/?$/;

export function RatingPrompt() {
  if (!APP_BUILD) return null;
  return <RatingPromptInApp />;
}

function RatingPromptInApp() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [thanks, setThanks] = useState(false);

  // every day the app is opened counts once
  useEffect(() => {
    if (!hasNative()) return;
    const today = localDay(new Date());
    ratingStore.set(noteUse(ratingStore.get(), today));
  }, []);

  useEffect(() => {
    if (!hasNative() || !HOME.test(pathname) || !ratingDue(ratingStore.get(), localDay(new Date()))) return;
    // a few seconds after Home appears; while another sheet is open it waits
    let timer = window.setTimeout(function show() {
      if (document.querySelector("dialog[open]")) {
        timer = window.setTimeout(show, 2000);
        return;
      }
      setOpen(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const close = () => {
    if (!thanks) ratingStore.set(answered(ratingStore.get(), localDay(new Date()), null));
    setOpen(false);
    setThanks(false);
  };
  const rate = (n: number) => {
    ratingStore.set(answered(ratingStore.get(), localDay(new Date()), n));
    if (n === 5) {
      setOpen(false);
      void nativeCall("review.request", {}, 30_000).catch(() => undefined);
    } else setThanks(true);
  };

  return (
    <Sheet open={open} onClose={close} title={thanks ? t("Thank you") : t("Are you enjoying {app}?", { app: site.name })}>
      {thanks ? (
        <div className="pb-2">
          <p className="text-base leading-snug">{t("Thanks for telling us. If anything could be better, tell us in Settings › Contact us.")}</p>
          <Button size="lg" full className="mt-5" onClick={close}>{t("Done")}</Button>
        </div>
      ) : (
        <div className="pb-2">
          <p className="text-base leading-snug text-muted">{t("Tap a number: 1 is not really, 5 is love it.")}</p>
          <div role="group" aria-label={t("Your rating, 1 to 5")} className="mt-5 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => rate(n)} aria-label={t("{n} out of 5", { n })}
                className="grid aspect-square min-h-12 place-items-center rounded-2xl border-[1.5px] border-edge bg-card text-[1.375rem] font-bold tabular-nums text-foreground transition hover:bg-background active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {n}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[0.8125rem] font-semibold text-muted" aria-hidden><span>{t("Not really")}</span><span>{t("Love it")}</span></div>
          <Button size="lg" full variant="secondary" className="mt-5" onClick={close}>{t("Not now")}</Button>
        </div>
      )}
    </Sheet>
  );
}
