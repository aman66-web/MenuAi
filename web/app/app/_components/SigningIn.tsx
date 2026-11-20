"use client";

import { useEffect, useState } from "react";
import { recipeShopSet } from "@/lib/mm/shopProducts";
import { useAccountUser, useSyncState } from "../_lib/account";
import { useMenu, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { CheckIcon } from "./icons";
import { Pip } from "./Mascot";

// "Signing you in…" (the whole screen while the account opens). Founder 2026-11-20: "When it says sign in, you're in this, what it's doing, like loading
// recipes". So under the heading, the real things happening, each with its own mark (a turning circle while it runs, the lime tick once done): the code or
// Apple's or Google's answer being checked (done when the account is open), the person's saved meals and settings coming back (the sync signing in started:
// app/_lib/account.ts signedIn), the restaurant menus, and the recipe shop's products. Nothing is shown that isn't really running, and nothing waits on this
// list: the screen goes as soon as sign-in is done, whatever is still loading (it carries on behind). Offline, what needs the internet says it will finish
// when the phone is back online.

export type SignInHow = "code" | "apple" | "google";
type Stage = "doing" | "done" | "later";

const DONE_TICK = "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-on-sun bg-sun text-on-sun";

function Mark({ stage }: { stage: Stage }) {
  if (stage === "done") return <span aria-hidden className={DONE_TICK}><CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /></span>;
  if (stage === "later") return <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-edge text-muted">–</span>;
  return <span aria-hidden className="h-6 w-6 shrink-0 animate-spin rounded-full border-[2.5px] border-line border-t-ink motion-reduce:animate-none" />;
}

/** `how`: what opened the account (the first line says it); without it (the welcome screens, already signed in), "Opening your account". */
export function SigningIn({ how }: { how?: SignInHow } = {}) {
  const t = useT();
  const user = useAccountUser();
  const sync = useSyncState();
  const menu = useMenu();
  const settings = useSettings();
  const manifest = useShopManifest();
  const [shownAt] = useState(() => Date.now());
  const shop = manifest ? recipeShopSet(manifest, null, settings.shops)[0] ?? null : null;
  const shopName = shop ? manifest?.retailers.find((r) => r.id === shop)?.name ?? "" : "";
  const [recipes, setRecipes] = useState<{ shop: string; stage: Stage } | null>(null);
  useEffect(() => {
    if (!shop) return;
    let live = true;
    loadShopFile(shop).then(() => { if (live) setRecipes({ shop, stage: "done" }); }, () => { if (live) setRecipes({ shop, stage: "later" }); });
    return () => { live = false; };
  }, [shop]);

  const account: Stage = user ? "done" : "doing";
  // the sync signing in started: running, finished since this screen came up (or a moment before), or waiting for the internet
  const synced: Stage = !user ? "doing" : sync.status === "offline" || sync.status === "error" ? "later" : sync.status === "idle" && (sync.lastSyncAt ?? 0) >= shownAt - 3000 ? "done" : "doing";
  const menus: Stage = menu.status === "ready" ? "done" : menu.status === "error" ? "later" : "doing";
  const recipeStage: Stage = recipes && recipes.shop === shop ? recipes.stage : "doing";
  const first = how === "code" ? t("Checking your code") : how === "apple" ? t("Signing in with Apple") : how === "google" ? t("Signing in with Google") : t("Opening your account");
  const steps: Array<{ key: string; label: string; stage: Stage }> = [
    { key: "account", label: first, stage: account },
    { key: "sync", label: t("Your saved meals and settings"), stage: synced },
    { key: "menus", label: t("Restaurant menus"), stage: menus },
    ...(shop ? [{ key: "recipes", label: t("Recipes from {shop}", { shop: shopName }), stage: recipeStage }] : []),
  ];
  const later = steps.some((s) => s.stage === "later");

  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-background px-6">
      <div className="flex w-full max-w-[20rem] flex-col items-center text-center">
        <Pip mood="wave" size={88} />
        <p className="mt-5 text-lg font-bold">{t("Signing you in…")}</p>
        <ul className="mt-5 w-full space-y-3 text-start">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-3 text-[1rem] font-semibold leading-snug">
              <Mark stage={s.stage} />
              <span className={`min-w-0 ${s.stage === "done" ? "text-foreground" : "text-muted"}`}>{s.label}</span>
              <span className="sr-only">{s.stage === "done" ? t("Done") : s.stage === "later" ? t("When you're online") : t("Loading")}</span>
            </li>
          ))}
        </ul>
        {later && <p className="mt-4 text-[0.9375rem] leading-snug text-muted">{t("The rest finishes when you're online.")}</p>}
      </div>
    </div>
  );
}
