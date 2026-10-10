"use client";

import Link from "next/link";
import { useState } from "react";
import type { ListRecipe } from "@/lib/mm/listRecipes";
import type { ShopFile } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, PotIcon } from "../../../_components/icons";
import { PipSays } from "../../../_components/Mascot";
import { Button, EmptyState, ErrorBox, LinkButton, Spinner } from "../../../_components/ui";
import { useHydrated, useStore } from "../../../_lib/hooks";
import { useT } from "../../../_lib/i18n";
import { addMissing, useListRecipes } from "../../../_lib/listRecipes";
import { Rich } from "../../../_lib/Rich";

// "What can I cook with this?" (founder 2026-10-10): recipes that use something on the shopping list, the ones needing least else first.
// Each says what the list already covers and what is still to buy, with one tap to add the rest (the recipe's own picks at the shop).

const PAGE = 12;

function MatchCard({ m, file }: { m: ListRecipe; file: ShopFile }) {
  const t = useT();
  const [added, setAdded] = useState<string | null>(null);
  const total = m.recipe.ingredients.length;
  const label = (i: number) => t(m.resolved.picks[i]?.spec.label ?? m.recipe.ingredients[i]!.label);
  return (
    <li className="glass rounded-3xl p-4">
      <Link href={`/app/recipes/view?id=${m.recipe.id}&r=${file.retailer}`} className="flex items-start gap-3">
        <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 rounded-2xl"><PotIcon className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-extrabold leading-snug tracking-tight [overflow-wrap:anywhere]">{t(m.recipe.name)}</span>
          <span className="app-numbers block text-sm font-semibold text-accent">{t("You have {have} of {total} ingredients", { have: m.have.length, total })}</span>
        </span>
        <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-muted" />
      </Link>
      <div aria-hidden className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ring-track)]"><div className="bg-sun h-full rounded-full" style={{ width: `${(m.have.length / total) * 100}%` }} /></div>
      <p className="sr-only">{t("On your list:")} {m.have.map(label).join(", ")}</p>
      <ul aria-hidden className="mt-3 flex flex-wrap gap-1.5">
        {m.have.map((i) => (<li key={i} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent"><CheckIcon className="h-4 w-4" strokeWidth={3} />{label(i)}</li>))}
      </ul>
      {m.missing.length > 0 ? (
        <>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">{t("Still to buy")}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {m.missing.map((i) => (<li key={i} className="tile rounded-full px-3 py-1 text-sm font-semibold">{label(i)}</li>))}
          </ul>
          <Button variant="secondary" className="mt-3" onClick={() => { const n = addMissing(m, file); setAdded(n === 1 ? t("Added 1 product to your {shop} list.", { shop: file.name }) : t("Added {n} products to your {shop} list.", { n, shop: file.name })); }}>
            <PlusIcon className="h-5 w-5" />{m.missing.length === 1 ? t("Add the last one to my list") : t("Add the other {n} to my list", { n: m.missing.length })}
          </Button>
        </>
      ) : (
        <p className="mt-3 text-sm font-semibold">{t("Your list has everything this recipe uses.")}</p>
      )}
      <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm font-medium text-accent">{added}</p>
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
      <Link href="/app/groceries/list" aria-label={t("Back to my groceries")} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Cook with your {list}")} values={{ list: <span className="serif-em sun-text pe-0.5">{t("shopping list")}</span> }} /></h1>
      <div className="mt-4"><PipSays mood="point" size={72}>{t("These recipes use something on your list. Each one shows what you still need to buy.")}</PipSays></div>

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
          <p role="status" className="app-numbers mt-5 px-1 text-sm text-muted">{matches.length === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: matches.length })}</p>
          <ul className="mt-2 space-y-3">
            {matches.slice(0, limit).map((m) => (<MatchCard key={m.recipe.id} m={m} file={state.file} />))}
          </ul>
          {matches.length > limit && <div className="mt-4"><Button full variant="secondary" className="min-h-14 text-base" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more recipes ({n} more)", { n: matches.length - limit })}</Button></div>}
          <p className="mt-6 text-xs text-muted">{t("Recipes are matched to your list by the products' names and chosen for your diet by their ingredients; check each pack.")}</p>
        </>
      )}
    </div>
  );
}
