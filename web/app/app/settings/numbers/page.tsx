import Link from "next/link";
import { site } from "@/site.config";

// SPEC §12.3 — static copy, word for word with {appName} filled in.
export const metadata = { title: "How we get our numbers" };

export default function NumbersPage() {
  return (
    <div>
      <Link href="/app/settings" className="-ml-1 inline-flex min-h-11 items-center text-sm font-medium text-accent">← Settings</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">How we get our numbers</h1>
      <div className="mt-4 space-y-4 text-base leading-relaxed">
        <p>Every number in {site.name} comes from the restaurant&apos;s own published nutrition information. We type it in, check it, and show the source and the date we last checked on every restaurant.</p>
        <p>We never estimate. If a restaurant doesn&apos;t publish a value, we show &lsquo;not published&rsquo;.</p>
        <p>Spot something wrong? Tap &lsquo;Report a number&rsquo; and we&apos;ll check within 48 hours.</p>
        <p>{site.name} isn&apos;t affiliated with any restaurant and doesn&apos;t give medical advice.</p>
      </div>
    </div>
  );
}
