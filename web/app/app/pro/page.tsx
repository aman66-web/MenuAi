"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WEB_PRO_ENABLED } from "@/lib/mm/config";
import { PAID_BULLETS } from "@/lib/mm/entitlements";
import { site } from "@/site.config";
import { BackLink, TITLE } from "../groceries/PageBits";
import { ProPlans } from "../_components/ProPlans";
import { CheckIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { captureRef } from "@/lib/payments/client";

// The pricing screen (website only; with paid access off it forwards to the app, shows no words and the iPhone app's copy never mentions it).
function Pricing() {
  const t = useT();
  const router = useRouter();
  const cancelled = useSearchParams().get("cancelled") === "1";
  useEffect(() => {
    if (!WEB_PRO_ENABLED) router.replace("/app");
    else captureRef(window.location.search);
  }, [router]);
  if (!WEB_PRO_ENABLED) return null;
  return (
    <div>
      <BackLink href="/app" label={t("Back to home")} />
      <h1 className={`mt-4 ${TITLE}`}>{site.name} Pro</h1>
      {cancelled && <p role="status" className="mt-3 rounded-[1.25rem] bg-soft p-4 text-base font-semibold">{t("No payment was taken.")}</p>}
      <ul className="glass mt-4 divide-y divide-line rounded-[1.25rem]">
        {PAID_BULLETS.map((b) => (
          <li key={b} className="flex items-center gap-3.5 px-4 py-3.5">
            <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><CheckIcon className="h-4 w-4" strokeWidth={2.5} /></span>
            <span className="text-base font-semibold leading-snug">{t(b)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-base leading-snug text-muted">{t("Every restaurant's full menu with calories and macros stays free.")}</p>
      <div className="mt-5"><ProPlans /></div>
      <p className="mt-5 text-base leading-snug text-muted">
        <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/terms">{t("Terms")}</a> · <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/privacy">{t("Privacy")}</a>
      </p>
    </div>
  );
}

export default function ProPage() {
  return (
    <Suspense fallback={null}>
      <Pricing />
    </Suspense>
  );
}
