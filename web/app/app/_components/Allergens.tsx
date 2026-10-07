import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { formatDate } from "@/lib/mm/format";
import { ALLERGEN_KEYS, type AllergenKey, type Allergens, type Chain } from "@/lib/mm/types";
import { ExternalIcon, InfoIcon } from "./icons";

// Allergens exactly as the chain's own guide lists them (docs/DATA.md "Allergens"): a row for each of the 14 allergens UK
// law names, and a link so people can open the chain's own guide themselves. Shown only when the whole guide was read;
// otherwise just the link. Never "free from": an allergen the guide doesn't list reads "Not listed".

const CHECK_WITH_STAFF = "Recipes change and kitchens handle many allergens, so always check with staff before you order.";

function GuideLink({ chain, href }: { chain: Chain; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-accent transition hover:bg-soft-strong active:scale-[0.98]"
    >
      Open {chain.name}&apos;s allergen guide
      <ExternalIcon className="h-4 w-4" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function statusOf(a: Allergens, key: AllergenKey): { kind: "contains" | "may" | "none"; detail?: string } {
  if (a.contains.includes(key)) {
    const d = key === "gluten" ? a.cereals : key === "nuts" ? a.nuts : undefined;
    return { kind: "contains", ...(d?.length ? { detail: d.join(", ") } : {}) };
  }
  if (a.mayContain.includes(key)) return { kind: "may" };
  return { kind: "none" };
}

/** The 14 allergens UK law names, one row each: Contains (with the cereal or nut when named), May contain, or Not listed. */
export function AllergenTable({ allergens, caption, columnLabel }: { allergens: Allergens; caption: string; columnLabel: string }) {
  return (
    <table className="mt-3 w-full text-left text-[15px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-y border-line text-xs font-bold uppercase tracking-[0.12em] text-muted">
            <th scope="col" className="px-5 py-2 font-bold">Allergen</th>
            <th scope="col" className="px-5 py-2 text-right font-bold">{columnLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ALLERGEN_KEYS.map((key) => {
            const s = statusOf(allergens, key);
            return (
              <tr key={key} className={s.kind === "contains" ? "bg-accent-soft" : undefined}>
                <th scope="row" className={`px-5 py-2.5 ${s.kind === "contains" ? "font-bold" : "font-medium"}`}>
                  {ALLERGEN_LABEL[key]}
                  {s.detail && <span className="block text-sm font-semibold text-accent">{s.detail}</span>}
                </th>
                <td className="px-5 py-2.5 text-right">
                  {s.kind === "contains" ? (
                    <span className="font-bold">Contains</span>
                  ) : s.kind === "may" ? (
                    <span className="whitespace-nowrap rounded-full border border-dashed border-line px-2.5 py-0.5 text-sm font-semibold">May contain</span>
                  ) : (
                    <span className="text-sm text-muted">Not listed</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
    </table>
  );
}

export function AllergenSection({ chain, allergens, changesNotCovered, title = "Allergens", itemName }: { chain: Chain; allergens: Allergens | undefined | null; changesNotCovered?: boolean; title?: string; itemName?: string }) {
  const guide = chain.allergenGuide;
  const link = guide?.url ?? chain.source.url;
  if (!allergens || !guide?.complete) {
    return (
      <section aria-labelledby="allergens-heading" className="glass rounded-3xl p-5">
        <h2 id="allergens-heading" className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted">We don&apos;t show allergens for {chain.name} yet. {chain.name}&apos;s own guide lists them. {CHECK_WITH_STAFF}</p>
        <div className="mt-3"><GuideLink chain={chain} href={link} /></div>
      </section>
    );
  }
  const containsCount = allergens.contains.length;
  return (
    <section aria-labelledby="allergens-heading" className="glass overflow-hidden rounded-3xl">
      <div className="px-5 pt-5">
        <h2 id="allergens-heading" className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted">
          {containsCount === 0 ? "None of the 14 main allergens listed as an ingredient." : `Contains ${containsCount} of the 14 main allergens.`}
          {!guide.mayContainPublished && ` ${chain.name}'s guide doesn't say what may be present in traces.`}
        </p>
      </div>
      <AllergenTable allergens={allergens} caption={`Allergens in ${itemName ?? "this order"}, from ${guide.title}`} columnLabel={itemName ? "This item" : "This order"} />
      <div className="space-y-3 border-t border-line px-5 py-4">
        {changesNotCovered && <p className="text-sm text-muted">Your changes aren&apos;t reflected: the guide lists allergens for the standard item only.</p>}
        <p className="flex gap-2 text-xs text-muted">
          <InfoIcon className="mt-px h-4 w-4 shrink-0 text-accent" />
          <span>From {guide.title}, checked {formatDate(guide.checkedOn)}. &ldquo;Not listed&rdquo; means the guide doesn&apos;t list it, not that the item is free from it. {CHECK_WITH_STAFF}</span>
        </p>
        <GuideLink chain={chain} href={guide.url} />
      </div>
    </section>
  );
}
