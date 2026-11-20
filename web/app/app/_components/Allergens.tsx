import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { formatDate } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { ALLERGEN_KEYS, type AllergenKey, type Allergens, type Chain } from "@/lib/mm/types";
import { useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { ExternalIcon, InfoIcon, WarningIcon } from "./icons";
import { SMALL_LABEL } from "./Nutrition";

// Allergens exactly as the chain's own guide lists them (docs/DATA.md "Allergens"): a row for each of the 14 allergens UK
// law names, and a link so people can open the chain's own guide themselves. Shown only when the whole guide was read;
// otherwise just the link. Never "free from": an allergen the guide doesn't list reads "Not listed".
// Look (founder 2026-10-15, Home's language): a white card with no tints; "Contains" is a small dark pill on a quiet grey row,
// "May contain" an outlined pill, "Not listed" muted text. Dark means emphasis, never good or bad (CLAUDE.md rule 3).
// Usability test 2026-11-19 (Harold, whose wife has a peanut allergy): "May contain" looked weaker than "Contains" and was never explained, and nothing
// pointed at the allergy he had set. Now "May contain" has a strong outline and its own line saying what it means, and an allergen the person avoids
// is marked "You avoid" in its row and named at the top.

const CHECK_WITH_STAFF = tk("Before you order, always check with staff.");
/** What "may contain" means, said once on the card: in the box for the person's own allergen when one of theirs is a "may contain", else under the table. */
const MAY_MEANS = tk("Small amounts could get in, for example from a shared kitchen or fryer.");

function GuideLink({ chain, href }: { chain: Chain; href: string }) {
  const t = useT();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="glass border-[1.5px] border-[color:var(--edge)] bg-soft inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-semibold text-foreground transition hover:bg-[var(--fill)] active:scale-[0.98]"
    >
      {t("Open {chain}'s allergen guide", { chain: chain.name })}
      <ExternalIcon className="h-4 w-4" />
      <span className="sr-only">{t("(opens in a new tab)")}</span>
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
/** `pad`: the cells' side padding, matching the card the table sits in (px-5 on the grocery product page, px-4 on a dish's card). `from`: what brings each
 *  contained allergen, said under its name (a recipe's ingredients), in place of the guide's cereal or nut. */
export function AllergenTable({ allergens, caption, columnLabel, pad = "px-5", from }: { allergens: Allergens; caption: string; columnLabel: string; pad?: string; from?: Partial<Record<AllergenKey, string>> }) {
  const t = useT();
  const avoid = useSettings().preferences.avoidAllergens ?? [];
  return (
    <table className="mt-3 w-full text-start text-[0.9375rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={`border-y border-line ${SMALL_LABEL}`}>
            <th scope="col" className={`${pad} py-2.5 text-start font-semibold`}>{t("Allergen")}</th>
            <th scope="col" className={`${pad} py-2.5 text-end font-semibold`}>{columnLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ALLERGEN_KEYS.map((key) => {
            const s = statusOf(allergens, key);
            const detail = (s.kind === "contains" && from?.[key]) || s.detail;
            return (
              <tr key={key} className={s.kind !== "none" || avoid.includes(key) ? "bg-[var(--fill)]" : undefined}>
                <th scope="row" className={`${pad} py-3 text-start align-middle leading-snug ${s.kind !== "none" || avoid.includes(key) ? "font-bold" : "font-medium"}`}>
                  {t(ALLERGEN_LABEL[key])}
                  {/* the person's own allergen: the amber allergy note's look (Note.tsx), never lime, which means only chosen or done (second wave's review); 6 px
                      corners so it reads as a label, not a button (the 20 November 2026 audit) */}
                  {avoid.includes(key) && (
                    <span className="ms-2 inline-flex items-center gap-1 rounded-[0.375rem] border-2 border-note-edge bg-note-bg px-2 py-0.5 align-middle text-[0.8125rem] font-bold text-foreground">
                      <WarningIcon className="h-3.5 w-3.5 shrink-0 text-note-edge" />
                      {t("You avoid")}
                    </span>
                  )}
                  {detail && <span className="mt-0.5 block text-sm font-medium text-muted">{detail}</span>}
                </th>
                <td className={`${pad} py-3 text-end align-middle`}>
                  {/* labels, not buttons: 6 px corners, never a pill (the 20 November 2026 audit); "Contains" leads with the warning sign */}
                  {s.kind === "contains" ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[0.375rem] bg-ink px-2 py-1 text-[0.8125rem] font-semibold leading-none text-on-ink"><WarningIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />{t("Contains")}</span>
                  ) : s.kind === "may" ? (
                    <span className="inline-flex items-center whitespace-nowrap rounded-[0.375rem] border-[3px] border-ink px-2 py-0.5 text-[0.8125rem] font-bold leading-none">{t("May contain")}</span>
                  ) : (
                    <span className="text-sm text-muted">{t("Not listed")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
    </table>
  );
}

export function AllergenSection({ chain, allergens, changesNotCovered, title: titleProp, itemName }: { chain: Chain; allergens: Allergens | undefined | null; changesNotCovered?: boolean; title?: string; itemName?: string }) {
  const t = useT();
  const settings = useSettings();
  const title = titleProp ?? t("Allergens");
  const guide = chain.allergenGuide;
  const link = guide?.url ?? chain.source.url;
  if (!allergens || !guide?.complete) {
    return (
      <section aria-labelledby="allergens-heading" className="glass rounded-[1.25rem] p-4">
        <h2 id="allergens-heading" className="text-xl font-[800] tracking-[-0.01em]">{title}</h2>
        <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("We don't show allergens for {chain} yet.", { chain: chain.name })} {t(CHECK_WITH_STAFF)}</p>
        <div className="mt-3.5"><GuideLink chain={chain} href={link} /></div>
      </section>
    );
  }
  const containsCount = allergens.contains.length;
  // the person's own allergies, the warnings first: contains, then may contain, then not listed
  const rank = { contains: 0, may: 1 } as Record<string, number>;
  const mine = (settings.preferences.avoidAllergens ?? []).map((k) => ({ k, s: statusOf(allergens, k).kind })).sort((a, b) => (rank[a.s] ?? 2) - (rank[b.s] ?? 2));
  const mayCount = allergens.mayContain.length;
  return (
    <section aria-labelledby="allergens-heading" className="glass overflow-hidden rounded-[1.25rem]">
      <div className="px-4 pt-4">
        <h2 id="allergens-heading" className="text-xl font-[800] tracking-[-0.01em]">{title}</h2>
        <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">
          {containsCount === 0 ? t("None of the 14 allergens listed as an ingredient.") : t("Contains {n} of the 14 allergens.", { n: containsCount })}
          {/* the "may contain" ones counted apart (usability test 2026-11-19: Harold read "Contains 4" as counting his wife's "may contain" peanuts too), in the
              table's own words */}
          {guide.mayContainPublished && mayCount > 0 && ` ${containsCount === 0 ? t("May contain {n}.", { n: mayCount }) : t("May contain {n} more.", { n: mayCount })}`}
          {!guide.mayContainPublished && ` ${t("{chain}'s guide doesn't list traces.", { chain: chain.name })}`}
        </p>
        {/* the allergies the person set, said first, in words */}
        {mine.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {/* a warning never looks like an all-clear (usability test 2026-11-19: Harold's "may contain" peanuts sat in the same grey box as "not listed"):
                contains is the dark box, may contain a box with a heavy border and what it means said in it, not listed the plain grey one */}
            {mine.map(({ k, s }) => (
              <li key={k} className={`rounded-[0.875rem] px-3.5 py-2.5 text-[0.9375rem] font-bold leading-snug ${s === "contains" ? "bg-ink text-on-ink" : s === "may" ? "border-[3px] border-foreground bg-card" : "bg-[var(--fill)]"}`}>
                {s === "contains" ? <><span aria-hidden className="me-1.5">⚠</span>{t("{allergen}: this item contains it.", { allergen: t(ALLERGEN_LABEL[k]) })}</>
                  : s === "may" ? <>
                      <span aria-hidden className="me-1.5">⚠</span>{t("{allergen}: this item may contain it.", { allergen: t(ALLERGEN_LABEL[k]) })}
                      <span className="mt-1 block font-normal">{t(MAY_MEANS)}</span>
                    </>
                  : t("{allergen}: not listed for this item. Ask staff to be sure.", { allergen: t(ALLERGEN_LABEL[k]) })}
              </li>
            ))}
          </ul>
        )}
      </div>
      <AllergenTable
        allergens={allergens}
        caption={itemName ? t("Allergens in {item}, from {guide}", { item: itemName, guide: guide.title }) : t("Allergens in this order, from {guide}", { guide: guide.title })}
        columnLabel={itemName ? t("This item") : t("This order")}
        pad="px-4"
      />
      <div className="space-y-3 px-4 pb-4 pt-3.5">
        {changesNotCovered && <p className="text-sm text-muted">{t("The guide covers the standard items, not your changes.")}</p>}
        {guide.mayContainPublished && mayCount > 0 && !mine.some((m) => m.s === "may") && <p className="text-[0.9375rem] leading-snug"><span className="font-bold">{t("“May contain”")}</span> {t("means small amounts could get in, for example from a shared kitchen or fryer.")}</p>}
        <p className="flex gap-2 text-[0.8125rem] leading-snug text-muted">
          <InfoIcon className="mt-px h-4 w-4 shrink-0 text-foreground" />
          <span>{t("From {chain}'s allergen guide, checked {date}.", { chain: chain.name, date: formatDate(guide.checkedOn, t) })} {t("“Not listed” doesn't mean free from.")} {t(CHECK_WITH_STAFF)}</span>
        </p>
        <GuideLink chain={chain} href={guide.url} />
      </div>
    </section>
  );
}
