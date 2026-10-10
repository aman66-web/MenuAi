"use client";

import { LinkButton } from "../_components/ui";
import { useT } from "../_lib/i18n";

// The offline page's words, in the chosen language (the page itself stays a server component for its metadata).
export function OfflineContent() {
  const t = useT();
  return (
    <div className="pt-16 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight">{t("You're offline")}</h1>
      <p className="mx-auto mt-2 max-w-xs text-muted">{t("This page hasn't been opened on this device yet. Restaurants and menus you've already opened still work.")}</p>
      <div className="mt-6 flex justify-center"><LinkButton href="/app">{t("Back to home")}</LinkButton></div>
    </div>
  );
}
