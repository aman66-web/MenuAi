"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PAID_ACCESS_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import { BOARDS, LEFT_OUT_NOTE, isLeaderboardsFile, type BoardEntry, type BoardId, type LeaderboardsFile } from "@/lib/mm/leaderboards";
import { FREE_LEADERBOARD_ROWS } from "@/lib/mm/paid";
import { shopPhotoSources } from "@/lib/mm/shopProducts";
import { ShopPrices } from "../ShopPrices";
import { useGate } from "../../_components/Paywall";
import { Button, EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { useIsPro } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { ListThumb } from "../ProductPhoto";
import { BackLink, CARD, FootNote, HEADING, TITLE } from "../PageBits";

// Nutrition leaderboards (founder 2026-11-18, in place of Groceries' "Cheapest protein" shortcut): the top 20 supermarket products for one figure at a time, from
// every shop in the app (lib/mm/leaderboards.ts; worked out when the shop lists are rebuilt). Big board tiles at the top say what each one ranks; each row shows
// the product's photo, its figure, and the logo of every supermarket that sells it (founder: "if the same product is sold by multiple shops, include all the
// logos"). The board lives in the address (?board=protein), so Back and a link keep it. Numbers only: nothing is called good or bad. "Cheapest protein"'s
// own page (with its everyday-or-branded pairs) is linked from its board.

/** True in the free iPhone app's copy (build-time constant): no paid tier there, so the locked-rows button is left out of the app's files. */
const FREE_APP = process.env.NEXT_PUBLIC_APP_BUILD === "1" && process.env.NEXT_PUBLIC_IAP !== "1";

let filePromise: Promise<LeaderboardsFile | null> | null = null;
function loadBoards(): Promise<LeaderboardsFile | null> {
  filePromise ??= fetch("/groceries/all/leaderboards.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => (isLeaderboardsFile(j) ? j : null))
    .catch(() => { filePromise = null; return null; });
  return filePromise;
}

const BOARD_IDS = BOARDS.map((b) => b.id);
const parseBoard = (v: string | null): BoardId => (BOARD_IDS.includes(v as BoardId) ? (v as BoardId) : BOARDS[0]!.id);

const productHref = (e: BoardEntry) =>
  e.gtin && e.shops.length > 1 ? `/app/groceries/product?code=${encodeURIComponent(e.gtin)}` : `/app/groceries/shop/item?r=${encodeURIComponent(e.shops[0]!.shop)}&id=${encodeURIComponent(e.shops[0]!.id)}`;

function figure(board: BoardId, value: number): { big: string; small: string } {
  if (board === "cheapestProtein") return { big: `${value.toFixed(1)}p`, small: "" };
  if (board === "fewestKcal") return { big: `${Math.round(value)}`, small: "kcal" };
  return { big: `${Math.round(value * 10) / 10}`, small: "g" };
}

function Row({ file, board, entry, rank, unit }: { file: LeaderboardsFile; board: BoardId; entry: BoardEntry; rank: number; unit: string }) {
  const first = entry.shops[0]!;
  const meta = file.shops[first.shop];
  const sources = meta ? shopPhotoSources({ retailer: first.shop, photoBase: meta.photoBase, photoTemplate: meta.photoTemplate }, { photoId: first.photoId }) : [];
  const f = figure(board, entry.value);
  return (
    <li>
      {/* the figure moves under the name when the text is large (usability test 2026-11-19: at Extra large the name was squeezed to one letter) */}
      <Link href={productHref(entry)} className="flex min-h-[6rem] flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 transition hover:bg-[var(--fill)] active:bg-[var(--fill)]">
        <span aria-hidden className={`app-numbers grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.9375rem] font-extrabold ${rank <= 3 ? "bg-[var(--sun)] text-[var(--on-accent)]" : "bg-[var(--fill)] text-muted"}`}>{rank}</span>
        <ListThumb sources={sources} />
        <span className="min-w-[7.5rem] flex-1 basis-[7.5rem]">
          <span className="line-clamp-3 text-[0.9375rem] font-bold leading-snug [overflow-wrap:break-word]"><span className="sr-only">{rank}. </span>{entry.name}</span>
          {/* every supermarket that sells it, by its own logo with its price there (the names and prices are read out) */}
          <span className="mt-1.5 block">
            <ShopPrices items={entry.shops.map((s) => ({ shop: s.shop, name: file.shops[s.shop]?.name ?? s.shop, price: s.price }))} />
          </span>
        </span>
        <span className="app-numbers ms-auto shrink-0 rounded-[0.875rem] bg-[var(--fill)] px-2.5 py-2 text-center">
          <span className="block text-[1.125rem] font-extrabold leading-none tracking-tight">{f.big}{f.small && <span className="ms-0.5 text-[0.8125rem] font-bold">{f.small}</span>}</span>
          <span className="mt-1 block max-w-[5.5rem] text-[0.6875rem] font-semibold leading-tight text-muted">{unit}</span>
        </span>
      </Link>
    </li>
  );
}

function Boards() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const board = parseBoard(params.get("board"));
  const pro = useIsPro();
  const { showPaywall } = useGate();
  const gated = !FREE_APP && PAID_ACCESS_ENABLED && !pro; // free tier (only when paid access exists): the first five rows, as Cheapest protein had
  const [file, setFile] = useState<LeaderboardsFile | null | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  useEffect(() => { let live = true; void loadBoards().then((f) => { if (live) setFile(f); }); return () => { live = false; }; }, [retry]);
  const choose = (id: BoardId) => router.replace(`/app/groceries/leaderboards?board=${id}`, { scroll: false });
  const info = BOARDS.find((b) => b.id === board)!;
  const rows = file?.boards[board] ?? [];

  return (
    <div>
      <BackLink href="/app/groceries" label={t("Back to groceries")} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Nutrition leaderboards")}</h1>
      <p className="mt-2.5 text-base leading-snug">{t("The top 20 supermarket products for one thing at a time, from each product's own label. Tap a board to see it.")}</p>

      {/* the boards: big tiles, two across (one a row with large text), the one showing is dark */}
      <div role="radiogroup" aria-label={t("Leaderboards")} className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2.5">
        {BOARDS.map((b) => (
          <button key={b.id} type="button" role="radio" aria-checked={b.id === board} onClick={() => choose(b.id)}
            className={`min-h-[4.75rem] rounded-[1.25rem] px-3.5 py-3 text-start transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${b.id === board ? "bg-foreground text-background" : "glass hover:bg-soft-strong"}`}>
            <span className="block text-base font-[800] leading-snug">{t(b.title)}</span>
            <span className={`mt-0.5 block text-[0.8125rem] leading-snug ${b.id === board ? "text-white/75" : "text-muted"}`}>{t(b.line)}</span>
          </button>
        ))}
      </div>

      <section aria-labelledby="board-h" className="mt-7">
        <h2 id="board-h" className={HEADING}>{t(info.title)}</h2>
        <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t(info.line)}</p>
        {board === "meatFreeProtein" && <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Chosen by the product's name, with no meat or fish in it: if you're vegetarian or vegan, check the pack.")}</p>}
        {file === undefined ? (
          <Spinner label={t("Loading products")} />
        ) : file === null ? (
          <div className="mt-4"><ErrorBox message={t("Couldn't load the leaderboards. Check your connection.")} onRetry={() => { setFile(undefined); setRetry((n) => n + 1); }} /></div>
        ) : rows.length === 0 ? (
          <div className="mt-4"><EmptyState title={t("Nothing on this board yet.")} body={t("We haven't read enough product labels yet.")} /></div>
        ) : (
          <>
            <ol className={`${CARD} mt-3 divide-y divide-line overflow-hidden`}>
              {rows.slice(0, gated ? FREE_LEADERBOARD_ROWS : rows.length).map((e, i) => <Row key={`${e.shops[0]!.shop}-${e.shops[0]!.id}`} file={file} board={board} entry={e} rank={i + 1} unit={t(info.unit)} />)}
            </ol>
            {gated && rows.length > FREE_LEADERBOARD_ROWS && (
              <Button size="lg" full variant="secondary" className="mt-3" onClick={() => showPaywall("leaderboard")}>{t("Unlock the other {n}", { n: rows.length - FREE_LEADERBOARD_ROWS })}</Button>
            )}
            {board === "cheapestProtein" && (
              <Link href="/app/groceries/protein" className="glass border-[1.5px] border-[color:var(--edge)] bg-soft mt-3 flex min-h-12 items-center justify-center rounded-full px-5 text-center text-[0.9375rem] font-bold transition hover:bg-[var(--fill)]">{t("Compare protein products with everyday ones")}</Link>
            )}
          </>
        )}
      </section>

      {file && (
        <FootNote>
          {t(LEFT_OUT_NOTE)}{" "}
          {t("Figures are per 100 g as sold, from each shop's own website (read up to {date}); a product sold at several shops shows every shop's logo with its shelf price there, the cheapest in bold. Prices vary by store. Not affiliated with any supermarket.", { date: formatDate(file.checkedOn, t) })}
        </FootNote>
      )}
    </div>
  );
}

export default function LeaderboardsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Boards />
    </Suspense>
  );
}
