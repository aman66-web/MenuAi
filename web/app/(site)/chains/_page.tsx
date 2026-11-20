import type { Metadata } from "next";
import Link from "next/link";
import { realChains } from "./_data";

const count = realChains().length;

// About half the chains publish calories only, so protein is promised only "where published" (the overnight audit, 20 November 2026).
export const metadata: Metadata = {
  title: `Calories (and protein where published) at ${count || "UK"} restaurants`,
  description: "Every UK restaurant chain on Numbite, with the calories of each menu item, and protein, carbs and fat where the restaurant publishes them, copied from its own published nutrition guide.",
  alternates: { canonical: "/chains" },
};

export default function ChainsIndex() {
  const chains = [...realChains()].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Calories (and protein where published) at UK restaurants</h1>
      <p className="mt-3 text-lg leading-relaxed">
        {chains.length} restaurant chains, with the calories of each menu item, and protein, carbs and fat where the restaurant publishes them, copied from its own published nutrition guide. Pick one to see its figures, or open it in the app.
      </p>
      <ul className="mt-8 grid gap-x-6 sm:grid-cols-2">
        {chains.map((c) => (
          <li key={c.id}>
            <Link href={`/chains/${c.id}`} className="inline-flex min-h-12 items-center text-lg font-semibold underline underline-offset-4">{c.name}</Link>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-base text-muted">Not affiliated with any restaurant listed.</p>
    </article>
  );
}
