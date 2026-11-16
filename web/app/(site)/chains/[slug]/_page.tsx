import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { site } from "@/site.config";
import { formatDate } from "@/lib/mm/format";
import { chainFacts, chainFaq } from "@/lib/mm/truth/chainFacts";
import { applyPreset } from "@/lib/mm/truth/presets";
import { chainEntry, hasSubPage, loadChain, MIN_ITEMS_TO_INDEX, realChains } from "../_data";
import { Crumbs, Faqs, faqJsonLd, ItemCard, JsonLd, OpenInApp, SourceNote } from "../_components";

// /chains/<id>: one restaurant's public page, rendered at build time from its published figures (founder's brief, 13 Nov 2026, deliverable 6). Every number on it is
// copied from the restaurant's own nutrition guide; the answers in the FAQ are worked out from those numbers (lib/mm/truth/chainFacts.ts) and shown on the page as well
// as in its structured data, so the two agree. No logos or photos, and each page says it is not affiliated with the restaurant.

export function generateStaticParams() {
  return realChains().map((c) => ({ slug: c.id }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const chain = loadChain(slug);
  const entry = chainEntry(slug);
  if (!chain || !entry) return {};
  const f = chainFacts(chain);
  const bits = [
    `${chain.items.length} menu items with calories${chain.nutritionLevel === "calories" ? "" : ", protein, carbs and fat"}`,
    f.mostProtein ? `most protein: ${f.mostProtein.name} (${f.mostProtein.nutrients.protein} g)` : null,
    f.fewestCalories ? `fewest calories: ${f.fewestCalories.name} (${Math.round(f.fewestCalories.nutrients.calories)} kcal)` : null,
  ].filter(Boolean);
  const description = `${chain.name} nutrition: ${bits.join("; ")}. Copied from ${chain.name}'s own published guide.`;
  const title = `${chain.name} calories and protein`;
  return {
    title,
    description,
    alternates: { canonical: `/chains/${slug}` },
    openGraph: { title: `${title} · ${site.name}`, description, type: "website", url: `/chains/${slug}` },
    robots: chain.items.length < MIN_ITEMS_TO_INDEX ? { index: false, follow: true } : undefined,
  };
}

export default async function ChainPage({ params }: Params) {
  const { slug } = await params;
  const chain = loadChain(slug);
  const entry = chainEntry(slug);
  if (!chain || !entry) notFound();
  const checkedOn = formatDate(chain.source.checkedOn);
  const full = chain.nutritionLevel !== "calories";
  const faq = chainFaq(chain, checkedOn);
  const f = chainFacts(chain);
  const topProtein = full ? applyPreset("most-protein", chain.items).slice(0, 5) : [];
  const lowest = applyPreset("under-500", chain.items)
    .sort((a, b) => a.nutrients.calories - b.nutrients.calories)
    .slice(0, 5);
  const highProtein = hasSubPage(chain, "high-protein");
  const under500 = hasSubPage(chain, "under-500-calories");

  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-8">
      <Crumbs items={[{ name: site.name, href: "/" }, { name: "Restaurants", href: "/chains" }, { name: chain.name }]} />
      <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">{chain.name}: calories and protein for every menu item</h1>
      <p className="mt-3 text-lg leading-relaxed">
        {chain.items.length} items from {chain.name}&apos;s own published nutrition guide (checked {checkedOn}), with {full ? "calories, protein, carbs, fat and the official traffic-light colours" : "calories"}.
        {" "}
        {f.fewestCalories && <>The fewest calories in a meal is {f.fewestCalories.name} at {Math.round(f.fewestCalories.nutrients.calories)} kcal.</>}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <OpenInApp chain={chain} />
        {highProtein && <Link href={`/chains/${slug}/high-protein`} className="inline-flex min-h-12 items-center rounded-full border border-line px-6 text-base font-bold">High protein at {chain.name}</Link>}
        {under500 && <Link href={`/chains/${slug}/under-500-calories`} className="inline-flex min-h-12 items-center rounded-full border border-line px-6 text-base font-bold">Under 500 calories</Link>}
      </div>

      {topProtein.length > 0 && (
        <section aria-labelledby="top-protein" className="mt-10">
          <h2 id="top-protein" className="text-2xl font-extrabold tracking-tight">Most protein for the calories</h2>
          <p className="mt-1 text-base text-muted">Meals of 250 kcal or more with at least 20 g of protein, ranked by protein for their calories.</p>
          <ul className="mt-4 space-y-4">{topProtein.map((i) => <ItemCard key={i.id} chain={chain} item={i} />)}</ul>
        </section>
      )}

      {lowest.length > 0 && (
        <section aria-labelledby="lowest" className="mt-10">
          <h2 id="lowest" className="text-2xl font-extrabold tracking-tight">Five lowest-calorie meals</h2>
          <p className="mt-1 text-base text-muted">Meals of 500 kcal or less (not drinks, sides, desserts, sauces or add-ons), fewest calories first.</p>
          <ul className="mt-4 space-y-4">{lowest.map((i) => <ItemCard key={i.id} chain={chain} item={i} />)}</ul>
        </section>
      )}

      <Faqs faq={faq} />
      <JsonLd data={faqJsonLd(faq)} />
      <SourceNote chain={chain} checkedOn={checkedOn} />
    </article>
  );
}
