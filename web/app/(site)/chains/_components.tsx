import Link from "next/link";
import { SIGN_IN_REQUIRED } from "@/lib/mm/config";
import { site } from "@/site.config";
import { chainHref, itemHref } from "@/lib/mm/routes";
import { FSA_SOURCE, type Light } from "@/lib/mm/truth/fsaLights";
import { itemTruth } from "@/lib/mm/truth/itemTruth";
import { SCORE_LABELS } from "@/lib/mm/truth/proteinScore";
import type { Chain, MenuItem } from "@/lib/mm/types";
import type { Faq } from "@/lib/mm/truth/chainFacts";

// Plain server-rendered pieces for the public restaurant pages. English only, like the rest of the website. Chain names are plain text (no logo, no photo,
// no brand colours: CLAUDE.md rule 2) and every page says it is not affiliated with the restaurant.

export const LIGHT_BG: Record<Light, string> = { green: "bg-[var(--tl-green)]", amber: "bg-[var(--tl-amber)]", red: "bg-[var(--tl-red)]" };
export const LIGHT_WORD: Record<Light, string> = { green: "Low", amber: "Medium", red: "High" };
const NAME = { fat: "Fat", saturatedFat: "Saturates", sugar: "Sugars", salt: "Salt" } as const;

/** Safe JSON for a <script type="application/ld+json"> tag: no "<" can close the tag early. */
export const jsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}

export function faqJsonLd(faq: Faq[]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })) };
}

export function Crumbs({ items }: { items: Array<{ name: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-base text-muted">
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((c, i) => (
          <li key={c.name} className="flex items-center gap-x-2">
            {c.href ? <Link href={c.href} className="inline-flex min-h-11 items-center underline underline-offset-4">{c.name}</Link> : <span aria-current="page">{c.name}</span>}
            {i < items.length - 1 && <span aria-hidden>›</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function OpenInApp({ chain, children }: { chain: Pick<Chain, "id" | "name">; children?: React.ReactNode }) {
  return (
    <Link href={chainHref(chain.id)} className="inline-flex min-h-12 items-center justify-center rounded-full bg-foreground px-6 text-base font-bold text-background transition active:scale-[0.97]">
      {children ?? `Open ${chain.name} in Numbite`}
    </Link>
  );
}

/** One dish as a card: the numbers, the four official traffic-light pills (colour only where the published figures allow it), and a link into the app. */
export function ItemCard({ chain, item, level = "h3" }: { chain: Pick<Chain, "id" | "name">; item: MenuItem; level?: "h2" | "h3" }) {
  const Heading = level;
  const truth = itemTruth(item);
  const n = item.nutrients;
  return (
    <li className="rounded-[1.25rem] border border-line bg-white p-5">
      <Heading className="text-xl font-extrabold leading-snug tracking-tight">{item.name}</Heading>
      <p className="mt-1 text-2xl font-extrabold leading-snug tracking-tight">
        {Math.round(n.calories).toLocaleString("en-GB")} <span className="text-lg font-bold text-muted">kcal</span>
        {n.protein !== undefined && (
          <>
            {" "}· {n.protein} <span className="text-lg font-bold text-muted">g protein</span>
          </>
        )}
      </p>
      {(n.carbs !== undefined || n.fat !== undefined) && <p className="mt-0.5 text-base text-muted">{[n.carbs !== undefined && `${n.carbs} g carbs`, n.fat !== undefined && `${n.fat} g fat`].filter(Boolean).join(" · ")}</p>}
      {truth.score && <p className="mt-1 text-base font-semibold">Protein score {truth.score.score} / 5: {SCORE_LABELS[truth.score.score].toLowerCase()}.</p>}
      {truth.lights.some((l) => l.grams !== undefined) && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Official traffic lights">
          {truth.lights.map((l) => (
            <li key={l.key} className={`rounded-xl px-3 py-2 text-[var(--tl-ink)] ${l.light ? LIGHT_BG[l.light] : "bg-[var(--tl-grey)]"}`}>
              <span className="block text-base font-bold leading-tight">{NAME[l.key]}</span>
              {l.grams === undefined ? (
                <span className="block text-base font-semibold">Not published</span>
              ) : (
                <>
                  <span className="block text-xl font-extrabold leading-tight">{Number.isInteger(l.grams) ? l.grams : l.key === "salt" ? String(+l.grams.toFixed(2)) : l.grams.toFixed(1)} g</span>
                  <span className="block text-base font-bold">{l.light ? LIGHT_WORD[l.light] : "No colour"}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href={itemHref(chain.id, item.id)} className="mt-3 inline-flex min-h-11 items-center text-base font-bold text-accent underline underline-offset-4">
        See the full numbers and a Smart Swap in Numbite<span className="sr-only"> for {item.name}</span>
      </Link>
    </li>
  );
}

export function Faqs({ faq }: { faq: Faq[] }) {
  if (faq.length === 0) return null;
  return (
    <section aria-labelledby="faq" className="mt-10">
      <h2 id="faq" className="text-2xl font-extrabold tracking-tight">Common questions</h2>
      <dl className="mt-4 space-y-5">
        {faq.map((q) => (
          <div key={q.question}>
            <dt className="text-lg font-bold leading-snug">{q.question}</dt>
            <dd className="mt-1 text-base leading-relaxed">{q.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SourceNote({ chain, checkedOn }: { chain: Pick<Chain, "name" | "source" | "note">; checkedOn: string }) {
  return (
    <footer className="mt-10 space-y-2 border-t border-line pt-5 text-base leading-relaxed text-muted">
      <p>
        Figures are copied from <a href={chain.source.url} className="font-semibold text-accent underline underline-offset-4" rel="noopener noreferrer">{chain.source.title}</a>, checked {checkedOn}. Menus change, so check the restaurant if it matters.
      </p>
      {chain.note && <p>{chain.note}</p>}
      <p>
        Colours follow the official UK traffic-light scheme and are shown only where the published figures allow it.{" "}
        <a href={FSA_SOURCE.url} className="font-semibold text-accent underline underline-offset-4" rel="noopener noreferrer">See the guidance</a>.
      </p>
      {/* this page needs no account, but the app it opens does where everyone signs in */}
      <p>Not affiliated with {chain.name}. {SIGN_IN_REQUIRED ? `Opening it in ${site.name} needs a free account.` : `You don't need an account to look at a menu on ${site.name}.`}</p>
    </footer>
  );
}
