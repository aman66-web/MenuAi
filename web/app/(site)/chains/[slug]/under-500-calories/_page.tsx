import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { site } from "@/site.config";
import { formatDate } from "@/lib/mm/format";
import { chainFacts } from "@/lib/mm/truth/chainFacts";
import { chainEntry, chainsWithSubPage, hasSubPage, loadChain, subPageItems } from "../../_data";
import { Crumbs, ItemCard, OpenInApp, SourceNote } from "../../_components";

export function generateStaticParams() {
  return chainsWithSubPage("under-500-calories").map((slug) => ({ slug }));
}

type Params = { params: Promise<{ slug: string }> };
const TOP = 25;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const chain = loadChain(slug);
  if (!chain || !hasSubPage(chain, "under-500-calories")) return {};
  const items = subPageItems(chain, "under-500-calories");
  const description = `${items.length} ${chain.name} meals are 500 kcal or less. Copied from ${chain.name}'s own published nutrition guide${chain.nutritionLevel === "calories" ? "" : ", with protein, carbs, fat and traffic-light colours"}.`;
  const title = `${chain.name} meals under 500 calories`;
  return { title, description, alternates: { canonical: `/chains/${slug}/under-500-calories` }, openGraph: { title: `${title} · ${site.name}`, description, type: "website", url: `/chains/${slug}/under-500-calories` } };
}

export default async function Under500Page({ params }: Params) {
  const { slug } = await params;
  const chain = loadChain(slug);
  const entry = chainEntry(slug);
  if (!chain || !entry || !hasSubPage(chain, "under-500-calories")) notFound();
  const items = subPageItems(chain, "under-500-calories");
  const checkedOn = formatDate(chain.source.checkedOn);
  const f = chainFacts(chain);
  const full = chain.nutritionLevel !== "calories";
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-8">
      <Crumbs items={[{ name: site.name, href: "/" }, { name: "Restaurants", href: "/chains" }, { name: chain.name, href: `/chains/${slug}` }, { name: "Under 500 calories" }]} />
      <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">{chain.name} meals under 500 calories</h1>
      <p className="mt-3 text-lg leading-relaxed">
        {items.length} of the {f.meals} meals on {chain.name}&apos;s menu are 500 kcal or less, from its own published nutrition guide (checked {checkedOn}){full ? ", with the most protein first" : ", the highest calories first"}.
        Drinks, sides, desserts, sauces and add-ons are not counted.
      </p>
      <div className="mt-5"><OpenInApp chain={chain} /></div>
      <ul className="mt-8 space-y-4">{items.slice(0, TOP).map((i) => <ItemCard key={i.id} chain={chain} item={i} level="h2" />)}</ul>
      {items.length > TOP && <p className="mt-4 text-base text-muted">Showing the first {TOP} of {items.length}. The app has them all.</p>}
      <SourceNote chain={chain} checkedOn={checkedOn} />
    </article>
  );
}
