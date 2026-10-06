import { allergenPhrases } from "@/lib/mm/allergens";
import { formatDate } from "@/lib/mm/format";
import type { Allergens, Chain } from "@/lib/mm/types";
import { InfoIcon } from "./icons";

// Allergens exactly as the chain's own guide lists them (docs/DATA.md "Allergens"). Shown only when the whole guide was read;
// otherwise just a link to the chain's guide. Never a filter, never "safe": kitchens handle many allergens.

const CHECK_WITH_STAFF = "Recipes change and kitchens handle many allergens, so always check with staff before you order.";

export function AllergenSection({ chain, allergens, changesNotCovered, title = "Allergens" }: { chain: Chain; allergens: Allergens | undefined | null; changesNotCovered?: boolean; title?: string }) {
  const guide = chain.allergenGuide;
  const link = guide?.url ?? chain.source.url;
  if (!allergens || !guide?.complete) {
    return (
      <section aria-labelledby="allergens-heading" className="glass rounded-3xl p-5">
        <h2 id="allergens-heading" className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted">
          We don&apos;t show allergens for {chain.name} yet.{" "}
          <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">See {chain.name}&apos;s allergen information</a>. {CHECK_WITH_STAFF}
        </p>
      </section>
    );
  }
  const contains = allergenPhrases(allergens, "contains");
  const may = allergenPhrases(allergens, "mayContain");
  return (
    <section aria-labelledby="allergens-heading" className="glass rounded-3xl p-5">
      <h2 id="allergens-heading" className="text-lg font-bold tracking-tight">{title}</h2>
      <h3 className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">Contains</h3>
      {contains.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {contains.map((p) => (<li key={p} className="rounded-full border border-line bg-soft-strong px-3 py-1.5 text-sm font-semibold">{p}</li>))}
        </ul>
      ) : (
        <p className="mt-1 text-sm">None of the 14 main allergens listed.</p>
      )}
      {guide.mayContainPublished ? (
        may.length > 0 && (
          <>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-muted">May contain</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {may.map((p) => (<li key={p} className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm">{p}</li>))}
            </ul>
          </>
        )
      ) : (
        <p className="mt-3 text-sm text-muted">{chain.name}&apos;s guide doesn&apos;t say what may be present in traces.</p>
      )}
      {changesNotCovered && <p className="mt-3 text-sm text-muted">Your changes aren&apos;t reflected: the guide lists allergens for the standard item only.</p>}
      <p className="mt-4 flex gap-2 text-xs text-muted">
        <InfoIcon className="mt-px h-4 w-4 shrink-0 text-accent" />
        <span>
          From <a href={guide.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{guide.title}</a>, checked {formatDate(guide.checkedOn)}. {CHECK_WITH_STAFF}
        </span>
      </p>
    </section>
  );
}
