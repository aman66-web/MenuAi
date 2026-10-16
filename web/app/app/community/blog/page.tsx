"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ARTICLES, ARTICLE_TAGS } from "@/lib/mm/blog";
import { articleDate, filterArticles } from "@/lib/mm/articleSearch";
import { localeInfo } from "@/lib/mm/i18n";
import { SearchIcon } from "../../_components/icons";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { Chip, EmptyState } from "../../_components/ui";
import { useLanguage, useT } from "../../_lib/i18n";
import { BackLink, LABEL, NOTE, TITLE } from "../../groceries/PageBits";

// Food blogs (Community): every article, newest first. A search box that filters as you type (title, summary and topics) with the app's Done button,
// topic chips like Recipes' meal choices, and a count. The articles are ours, bundled in the app and English only (like restaurant notes), so only
// the screen's own words go through t(). Look: Home's (compact heavy title, white 20 px cards, small grey labels).

export default function BlogListPage() {
  const t = useT();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const found = useMemo(() => filterArticles(ARTICLES, deferred, tag), [deferred, tag]);

  return (
    <div>
      <BackLink href="/app/community" label={t("Back")} />
      <h1 className={`mt-4 ${TITLE}`}>{t("Food blogs")}</h1>
      <p className={`mt-2 ${NOTE}`}>{t("The articles are in English.")}</p>

      <div className="group/search relative mt-4">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        {/* 16 px text: smaller text makes iPhone Safari zoom into the field */}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search articles")} aria-label={t("Search articles")} {...DONE_KEY} autoComplete="off" className={`glass min-h-[3.25rem] w-full rounded-full ps-12 pe-4 ${DONE_ROOM} text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent`} />
        <SearchDone />
      </div>

      {/* topics: outlined chips that wrap onto more lines (no sideways row), the chosen one filled dark; tap it again for all */}
      <div role="group" aria-label={t("Topics")} className="mt-3.5 flex flex-wrap gap-2">
        <Chip selected={tag === null} onClick={() => setTag(null)}>{t("All")}</Chip>
        {ARTICLE_TAGS.map((x) => (
          <Chip key={x} selected={tag === x} onClick={() => setTag(tag === x ? null : x)}><span lang="en" dir="ltr">{x}</span></Chip>
        ))}
      </div>

      <p role="status" className={`mt-4 px-1 ${NOTE}`}>{found.length === 1 ? t("1 article") : t("{n} articles", { n: found.length })}</p>

      {found.length === 0 ? (
        <div className="mt-3">
          <EmptyState icon={<SearchIcon />} title={t("No articles match.")} body={t("Try another word or topic.")} />
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {found.map((a) => (
            <li key={a.id}>
              <Link href={`/app/community/blog/view?id=${encodeURIComponent(a.id)}`} className="glass lift block rounded-[1.25rem] p-4 [overflow-wrap:anywhere]">
                {/* English only: marked as English and read left to right, also on a right-to-left page */}
                <span lang="en" dir="ltr" className="block">
                  {a.tags.length > 0 && <span className={`block ${LABEL}`}>{a.tags.join(" · ")}</span>}
                  <span className="mt-1 block text-lg font-[800] leading-snug tracking-[-0.01em]">{a.title}</span>
                  <span className="mt-1 block text-[0.9375rem] leading-snug text-muted">{a.summary}</span>
                </span>
                <span className={`mt-2.5 block ${NOTE}`}>
                  {t("{n} min read", { n: a.minutes })}
                  {" · "}<time dateTime={a.date}>{articleDate(a.date, htmlLang)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
