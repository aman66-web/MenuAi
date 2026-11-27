import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { site } from "@/site.config";
import { formatDate } from "@/lib/mm/format";
import { chainFacts } from "@/lib/mm/truth/chainFacts";
import { chainEntry, chainsWithSubPage, hasSubPage, loadChain, subPageItems } from "../../_data";
import { Crumbs, ItemCard, GetTheApp, SourceNote } from "../../_components";

export function generateStaticParams() {
  return chainsWithSubPage("high-protein").map((slug) => ({ slug }));
}

type Params = { params: Promise<{ slug: string }> };
const TOP = 25;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const chain = loadChain(slug);
  if (!chain || !hasSubPage(chain, "high-protein")) return {};
  const items = subPageItems(chain, "high-protein");
  const best = items[0];
  const description = `${items.length} ${chain.name} meals have 35 g or more of protein. Top of the list for protein per calorie: ${best.name} with ${best.nutrients.protein} g protein and ${Math.round(best.nutrients.calories)} kcal. Copied from ${chain.name}'s own published guide.`;
  const title = `High protein at ${chain.name}: meals with 35 g+ protein`;
  return { title, description, alternates: { canonical: `/chains/${slug}/high-protein` }, openGraph: { title: `${title} · ${site.name}`, description, type: "website", url: `/chains/${slug}/high-protein` } };
}

export default async function HighProteinPage({ params }: Params) {
  const { slug } = await params;
  const chain = loadChain(slug);
  const entry = chainEntry(slug);
  if (!chain || !entry || !hasSubPage(chain, "high-protein")) notFound();
  const items = subPageItems(chain, "high-protein");
  const checkedOn = formatDate(chain.source.checkedOn);
  const f = chainFacts(chain);
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-8">
      <Crumbs items={[{ name: site.name, href: "/" }, { name: "Restaurants", href: "/chains" }, { name: chain.name, href: `/chains/${slug}` }, { name: "High protein" }]} />
      <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">High protein at {chain.name}: meals with 35 g or more</h1>
      <p className="mt-3 text-lg leading-relaxed">
        {items.length} of the {f.meals} meals on {chain.name}&apos;s menu have 35 g or more of protein, from its own published nutrition guide (checked {checkedOn}). The list is ordered by protein for the calories, so the first dish gives the most protein per calorie.
        Drinks, sides, desserts, sauces and add-ons are not counted.
      </p>
      <GetTheApp chain={chain} className="mt-5" />
      <ul className="mt-8 space-y-4">{items.slice(0, TOP).map((i) => <ItemCard key={i.id} item={i} level="h2" />)}</ul>
      {items.length > TOP && <p className="mt-4 text-base text-muted">Showing the first {TOP} of {items.length}. The app has them all.</p>}
      <SourceNote chain={chain} checkedOn={checkedOn} />
    </article>
  );
}
