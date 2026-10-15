"use client";

import Link from "next/link";
import { useState } from "react";
import type { ListRecipe } from "@/lib/mm/listRecipes";
import type { ShopFile } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { CheckIcon, ChevronRightIcon, PlusIcon, PotIcon } from "../../../_components/icons";
import { PipSays } from "../../../_components/Mascot";
import { Button, EmptyState, ErrorBox, LinkButton, Spinner } from "../../../_components/ui";
import { useHydrated, useStore } from "../../../_lib/hooks";
import { useT } from "../../../_lib/i18n";
import { addMissing, useListRecipes } from "../../../_lib/listRecipes";
import { Rich } from "../../../_lib/Rich";
import { BackLink, CARD, LABEL, NOTE } from "../../PageBits";

// "What can I cook with this?" (founder 2026-10-10): recipes that use something on the shopping list, the ones needing least else first.
// Each says what the list already covers and what is still to buy, with one tap to add the rest (the recipe's own picks at the shop).
// Looks follow Home (founder 2026-10-15): white cards with 20 px corners, a thin lime bar for how much of the recipe the list covers, the
// ingredients already on the list as lime chips with a tick (like a ticked item on the list) and the rest as outlined chips.

const PAGE = 12;

function MatchCard({ m, file }: { m: ListRecipe; file: ShopFile }) {
  const t = useT();
  const [added, setAdded] = useState<string | null>(null);
  const total = m.recipe.ingredients.length;
  const label = (i: number) => t(m.resolved.picks[i]?.spec.label ?? m.recipe.ingredients[i]!.label);
  return (
    <li className={`${CARD} p-5`}>
      <Link href={`/app/recipes/view?id=${m.recipe.id}&r=${file.retailer}`} className="group @container -m-1 flex items-center gap-3.5 rounded-2xl p-1">
        <span aria-hidden className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-strong @[18rem]:inline-flex"><PotIcon className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-[800] leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] group-hover:underline group-hover:underline-offset-4">{t(m.recipe.name)}</span>
          <span className="app-numbers mt-0.5 block text-sm font-semibold text-accent">{t("You have {have} of {total} ingredients", { have: m.have.length, total })}</span>
        </span>
        <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
      </Link>
      <div aria-hidden className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--ring-track)]"><div className="h-full rounded-full bg-[var(--bar)]" style={{ width: `${(m.have.length / total) * 100}%` }} /></div>
      <p className="sr-only">{t("On your list:")} {m.have.map(label).join(", ")}</p>
      <ul aria-hidden className="mt-4 flex flex-wrap gap-2">
        {m.have.map((i) => (<li key={i} className="bg-sun inline-flex items-center gap-1.5 rounded-full py-1.5 pe-3.5 ps-2.5 text-sm font-semibold text-on-accent"><CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />{label(i)}</li>))}
      </ul>
      {m.missing.length > 0 ? (
        <>
          <p className={`mt-5 ${LABEL}`}>{t("Still to buy")}</p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {m.missing.map((i) => (<li key={i} className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] px-3.5 py-1.5 text-sm font-medium">{label(i)}</li>))}
          </ul>
          <Button variant="secondary" className="mt-5" onClick={() => { const n = addMissing(m, file); setAdded(n === 1 ? t("Added 1 product to your {shop} list.", { shop: file.name }) : t("Added {n} products to your {shop} list.", { n, shop: file.name })); }}>
            <PlusIcon className="h-5 w-5" />{m.missing.length === 1 ? t("Add the last one to my list") : t("Add the other {n} to my list", { n: m.missing.length })}
          </Button>
        </>
      ) : (
        <p className="mt-5 text-[0.9375rem] font-semibold leading-snug">{t("Your list has everything this recipe uses.")}</p>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-sm font-medium text-accent empty:mt-0">{added}</p>
    </li>
  );
}

export default function ListRecipesPage() {
  const t = useT();
  const hydrated = useHydrated();
  const list = useStore(shoppingStore);
  const { state, matches } = useListRecipes(list);
  const [limit, setLimit] = useState(PAGE);

  return (
    <div>
      <BackLink href="/app/groceries/list" label={t("Back to shopping list")} />
      <h1 className="mt-5 text-[1.75rem] font-[800] leading-[1.08] tracking-[-0.02em]"><Rich text={t("Cook with your {list}")} values={{ list: <span>{t("shopping list")}</span> }} /></h1>
      <div className="mt-5"><PipSays mood="point" size={72}>{t("These recipes use something on your list. Each one shows what you still need to buy.")}</PipSays></div>

      {!hydrated ? null : list.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("Your list is empty.")} body={t("Add a few things you have or plan to buy, and I'll find recipes that use them.")} action={<LinkButton href="/app/groceries/list" variant="secondary">{t("Back to my groceries")}</LinkButton>} /></div>
      ) : state === null ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No supermarket list yet.")} body={t("Recipes appear once we've read a supermarket's products and prices.")} /></div>
      ) : state.status === "error" ? (
        <div className="mt-5"><ErrorBox message={t("Couldn't load the recipes. Check your connection.")} onRetry={() => window.location.reload()} /></div>
      ) : state.status === "loading" || matches === null ? (
        <Spinner label={t("Loading recipes")} />
      ) : matches.length === 0 ? (
        <div className="mt-5"><EmptyState icon={<PotIcon className="h-7 w-7" />} title={t("No recipe uses these yet.")} body={t("Try adding a main ingredient, like chicken, rice or eggs.")} action={<LinkButton href="/app/recipes" variant="secondary">{t("See all recipes")}</LinkButton>} /></div>
      ) : (
        <>
          <p role="status" className="app-numbers mt-7 ps-1 text-sm font-semibold text-muted">{matches.length === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: matches.length })}</p>
          <ul className="mt-3 space-y-3.5">
            {matches.slice(0, limit).map((m) => (<MatchCard key={m.recipe.id} m={m} file={state.file} />))}
          </ul>
          {matches.length > limit && <div className="mt-4"><Button full variant="secondary" className="min-h-12 text-[0.9375rem]" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: matches.length - limit })}</Button></div>}
          <p className={`mt-6 ${NOTE}`}>{t("Recipes are matched to your list by the products' names and chosen for your diet by their ingredients; check each pack.")}</p>
        </>
      )}
    </div>
  );
}
