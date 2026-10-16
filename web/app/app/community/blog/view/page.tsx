"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { articleById, type Article } from "@/lib/mm/blog";
import { articleDate } from "@/lib/mm/articleSearch";
import { localeInfo } from "@/lib/mm/i18n";
import { site } from "@/site.config";
import { ErrorBox, Spinner } from "../../../_components/ui";
import { useLanguage, useT } from "../../../_lib/i18n";
import { BackLink, LABEL, NOTE } from "../../../groceries/PageBits";

// One article. A static shell like /app/chain: the article comes from ?id=, so one cached page opens every article, offline too. The articles are
// ours, bundled in the app, English only (like restaurant notes); the screen's own words (Back, "min read") go through t(). Comfortable reading:
// body text at 17 px (never below 1rem, so it grows with the text-size setting), line height 1.6, on a white card. Back goes to the page the reader
// came from (the hub lists the latest three, the list has them all); the list is where it goes when the article was opened by its address.

function ArticleBody({ article }: { article: Article }) {
  const t = useT();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  return (
    <article>
      {/* the article is English only: its tags, title and text are marked as English and read left to right, also on a right-to-left page */}
      {article.tags.length > 0 && <p lang="en" dir="ltr" className={LABEL}>{article.tags.join(" · ")}</p>}
      <h1 lang="en" dir="ltr" className="mt-1.5 text-[1.75rem] font-[800] leading-[1.15] tracking-[-0.02em] [overflow-wrap:anywhere]">{article.title}</h1>
      <p className={`mt-2.5 ${NOTE}`}>
        {t("{n} min read", { n: article.minutes })}
        {" · "}<time dateTime={article.date}>{articleDate(article.date, htmlLang)}</time>
        {" · "}<span>{site.name}</span>
      </p>
      <div lang="en" dir="ltr" className="glass mt-5 rounded-[1.25rem] px-5 py-6 text-[1.0625rem] leading-[1.6] [overflow-wrap:anywhere]">
        {article.blocks.map((b, i) =>
          "h" in b ? (
            <h2 key={i} className="mt-7 text-xl font-[800] leading-snug tracking-[-0.01em] first:mt-0">{b.h}</h2>
          ) : "p" in b ? (
            <p key={i} className="mt-3 first:mt-0">{b.p}</p>
          ) : (
            <ul key={i} className="mt-3 list-disc space-y-2 ps-6 marker:text-muted first:mt-0">
              {b.ul.map((li, j) => (<li key={j} className="ps-1">{li}</li>))}
            </ul>
          ),
        )}
      </div>
    </article>
  );
}

function ArticleRoute() {
  const t = useT();
  const params = useSearchParams();
  const article = articleById(params.get("id"));
  const back = <BackLink href="/app/community/blog" label={t("Back")} />;
  return (
    <div>
      {back}
      <div className="mt-4">
        {article ? (
          <ArticleBody article={article} />
        ) : (
          <>
            {/* a page needs its heading even when there is nothing to read: the message alone would leave screen readers without one */}
            <h1 className="sr-only">{t("Food blogs")}</h1>
            <ErrorBox message={t("We couldn't find that article.")} />
          </>
        )}
      </div>
    </div>
  );
}

export default function ArticlePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ArticleRoute />
    </Suspense>
  );
}
