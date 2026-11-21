"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WEB_PRO_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import { claimSession } from "@/lib/payments/client";
import { isPlanId, PLANS } from "@/lib/payments/plans";
import { paidStore } from "@/lib/mm/stores";
import { PageHeader } from "../../_components/PageHeader";
import { Button, LinkButton, Spinner } from "../../_components/ui";
import { useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";

// Where Stripe sends the person back after paying: ask the server about the Session (it reads it from Stripe), keep the signed access token, say so.
function Thanks() {
  const t = useT();
  const router = useRouter();
  const sessionId = useSearchParams().get("session_id");
  const paid = useStore(paidStore);
  const [state, setState] = useState<"working" | "done" | "not_paid" | "failed">("working");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!WEB_PRO_ENABLED) { router.replace("/app"); return; }
    let cancelled = false;
    // no payment reference in the address: the same "couldn't confirm" answer, reached the same way (after a promise, never synchronously in the effect)
    const result = sessionId ? claimSession(sessionId) : Promise.resolve({ ok: false, error: "failed" } as const);
    void result.then((r) => { if (!cancelled) setState(r.ok ? "done" : r.error === "not_paid" ? "not_paid" : "failed"); });
    return () => { cancelled = true; };
  }, [router, sessionId, attempt]);

  if (!WEB_PRO_ENABLED) return null;
  return (
    <div>
      {/* the header every page has (colour meeting, 19 November 2026): the title, the Settings cog far right */}
      <PageHeader title={t("Thank you")} />
      {state === "working" && <Spinner label={t("Checking your payment")} />}
      {state === "done" && (
        <div role="status" className="mt-4 space-y-3">
          <p className="text-lg font-semibold leading-snug">
            {paid.plan && isPlanId(paid.plan) && PLANS[paid.plan] ? t("You have {plan}.", { plan: t(PLANS[paid.plan].label) }) : t("You're in.")}{" "}
            {paid.until ? t("Access until {date}.", { date: formatDate(new Date(paid.until).toISOString().slice(0, 10), t) }) : ""}
          </p>
          <LinkButton href="/app" size="lg">{t("Back to the app")}</LinkButton>
        </div>
      )}
      {state === "not_paid" && <p role="alert" className="mt-4 text-lg font-semibold leading-snug">{t("That payment hasn't gone through, so nothing was taken.")}</p>}
      {state === "failed" && (
        <div role="alert" className="mt-4 space-y-3">
          <p className="text-lg font-semibold leading-snug">{t("We couldn't confirm your payment just now. If you were charged, your access will appear here when you try again or sign in with the same email address.")}</p>
          <Button size="lg" onClick={() => { setState("working"); setAttempt((n) => n + 1); }}>{t("Try again")}</Button>
        </div>
      )}
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

export default function ThanksPage() {
  if (IN_APP) return <ToHome />;
  return (
    <Suspense fallback={null}>
      <Thanks />
    </Suspense>
  );
}
