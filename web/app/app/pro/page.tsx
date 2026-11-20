"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PAID_ACCESS_ENABLED, WEB_PRO_ENABLED } from "@/lib/mm/config";
import { PAID_BULLETS } from "@/lib/mm/entitlements";
import { site } from "@/site.config";
import { PageHeader } from "../_components/PageHeader";
import { ProPlans } from "../_components/ProPlans";
import { CheckIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { captureRefFromLocation } from "@/lib/payments/ref";

// The pricing screen (the website with paid access on, or the In-App Purchase app; with paid access off it forwards to the app, shows no words and the iPhone app's copy never mentions it).
function Pricing() {
  const t = useT();
  const router = useRouter();
  const cancelled = useSearchParams().get("cancelled") === "1";
  useEffect(() => {
    if (!PAID_ACCESS_ENABLED) router.replace("/app");
    else if (WEB_PRO_ENABLED) captureRefFromLocation();
  }, [router]);
  if (!PAID_ACCESS_ENABLED) return null;
  return (
    <div>
      {/* the header every page has (colour meeting, 19 November 2026): Back, the title under it, the Settings cog far right; the one name on screen is
          Premium (onboarding meeting, 19 November 2026) */}
      <PageHeader back={{ href: "/app", label: t("Back to home") }} title={`${site.name} Premium`} />
      {cancelled && <p role="status" className="mt-3 rounded-[1.25rem] bg-soft p-4 text-base font-semibold">{t("No payment was taken.")}</p>}
      <ul className="glass mt-4 divide-y divide-line rounded-[1.25rem]">
        {PAID_BULLETS.map((b) => (
          <li key={b} className="flex items-center gap-3.5 px-4 py-3.5">
            <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink"><CheckIcon className="h-4 w-4" strokeWidth={2.5} /></span>
            <span className="text-base font-semibold leading-snug">{t(b)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-base leading-snug text-muted">{t("Every restaurant's full menu with calories and macros stays free.")}</p>
      <div className="mt-5"><ProPlans level="h2" /></div>
      <p className="mt-5 text-base leading-snug text-muted">
        <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/terms">{t("Terms")}</a> · <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/privacy">{t("Privacy")}</a>
      </p>
    </div>
  );
}

/** True in the iPhone app's copy (build-time constant): the page only forwards to Home there, and nothing of the paid screens is in the app's files (App Store 3.1.1, App Review 2.3.1). */
const IN_APP = process.env.NEXT_PUBLIC_APP_BUILD === "1" && process.env.NEXT_PUBLIC_IAP !== "1"; // the free iPhone app (an In-App Purchase build, 1.1, keeps it)

function ToHome() {
  const router = useRouter();
  useEffect(() => { router.replace("/app"); }, [router]);
  return null;
}

export default function ProPage() {
  if (IN_APP) return <ToHome />;
  return (
    <Suspense fallback={null}>
      <Pricing />
    </Suspense>
  );
}
