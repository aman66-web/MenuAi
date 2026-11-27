import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appShopCount, catalogueStats, heroProof, siteFaqs } from "@/lib/mm/catalogue";
import type { Manifest } from "@/lib/mm/types";
import { RECIPES } from "@/lib/mm/recipeBook";
import { APP_PREMIUM, COMMUNITY_FRIENDS_ENABLED, PRO_ENABLED, SIGN_IN_REQUIRED, WEB_PRO_ENABLED } from "@/lib/mm/config";
import { PLANS } from "@/lib/payments/plans";
import { site } from "@/site.config";
import { BasketIcon, CheckIcon, ForkIcon, PlusIcon, PotIcon } from "@/app/app/_components/icons";
import { StoreBadges } from "@/app/components/StoreBadges";
import { GET_THE_APP_ID } from "@/lib/webAppClosed";

// Read once at build time from the published data, so the headline numbers are never typed in by hand: the chains from the menus manifest, the supermarkets
// with a full product list that the apps pack (the count the app's own welcome screen shows), and every recipe in the book.
// A missing file fails the build rather than showing a wrong count.
const readJson = <J,>(path: string): J => JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as J;
const stats = catalogueStats(readJson<Manifest>("public/menus/menus-manifest.json").chains);
const shopLists = readJson<{ retailers: { id: string }[] }>("public/groceries/all/all-manifest.json");
const proof = heroProof({ restaurants: stats.chains, supermarkets: appShopCount(shopLists.retailers, readJson<{ shops?: string[] }>("app-content.json").shops), recipes: RECIPES.length });

const steps = [
  { title: "Pick the restaurant", body: "Search by name and open the whole menu. Works offline once you've opened it." },
  { title: "See every item's numbers", body: "The calories for the whole menu, and protein, carbs and fat wherever the restaurant publishes them. Free." },
  { title: "Get the order that fits", body: PRO_ENABLED ? "Premium ranks the five best orders for your goal and what's left today, and adds up custom orders as you tap." : "See the five best orders for your goal and what's left today, and add up your own order as you tap." },
];

// The three things the app does (founder 2026-10-10: "it's also for groceries ... recipes based on where you shop"), each with the
// glyph its tab wears in the app (our own line icons, never a picture of food).
// The app's own tab names (the audit, 20 November 2026).
const pillars = [
  { title: "Eat out", body: `Every dish at ${stats.chains > 0 ? `${stats.chains} UK restaurants` : "popular UK restaurants"}, with the calories each chain publishes, and protein, carbs and fat where it publishes them.`, Icon: ForkIcon },
  { title: "Groceries", body: "Supermarket products with the calories, protein and price from the shop's own pages. Make a list and see what it comes to.", Icon: BasketIcon },
  { title: "Recipes", body: "Recipes filled with real products from your supermarket, with calories, protein and the cost of each serving. Swap any ingredient.", Icon: PotIcon },
];

// The hero's phone (direction "A. Lime", 27 November 2026): the screen alone, cut from three of the screenshots below (e2e/hero-screens.mjs), slowly fading
// from one to the next. Only screens with no chain's or shop's logo and no food picture in the part shown (the hero is marketing: CLAUDE.md rule 2).
const heroScreens = [
  { name: "home", alt: "The app's Home screen: the calories left today, and the protein, carbs and fat eaten so far against your targets." },
  { name: "best", alt: "Best for you: a restaurant's lunches up to 700 kcal, ranked by the most protein for their calories." },
  { name: "groceries", alt: "Nutrition leaderboards: the top 20 supermarket products for the most protein for the calories, the cheapest protein and more." },
];

// The App Store screenshots of 1.1 (22 November 2026), in the store's order, retaken without the chains' and shops' own photos, which CLAUDE.md rule 2
// keeps out of marketing (e2e/site-screens.mjs). The words are the ones drawn on each picture.
const screens = [
  { name: "recipes", alt: "Recipes priced at your shop. Real products from 7 UK supermarkets." },
  { name: "recipe", alt: "Every ingredient, ready to buy. Real Sainsbury's products, with prices." },
  { name: "plan", alt: "A week of meals, one list. Fits your calories, budget and 5 a day." },
  { name: "fridge", alt: "Cook with what you have. Tap what's in your fridge." },
  { name: "scan", alt: "Scan it. Log it. Pick a glass, a can or grams." },
  { name: "groceries", alt: "Top 20 supermarket lists. Most protein, cheapest protein, most fibre." },
  { name: "home", alt: "Your day at a glance. Calories, protein, carbs and fat." },
  { name: "eat-out", alt: "Know what's in your order. Official figures from 241 UK restaurants." },
  { name: "truth", alt: "See the truth about a dish. Protein score and traffic lights." },
  { name: "best", alt: "Top picks for your goal. The most protein for the calories, meal by meal." },
];

const goals = [
  { title: "Lose weight", body: "Stay under today's budget without guessing." },
  { title: "Build muscle", body: "The most protein per calorie, with double-protein options." },
  { title: "Maintain", body: "Eat out with friends and still know your numbers." },
  { title: "GLP-1 medication", body: "Smaller, protein-first orders with a meal-size cap you set." },
];

// The answers follow the switches (lib/mm/catalogue.ts siteFaqs; tests/siteFaq.test.ts): the app's Premium is described without figures (the App Store shows
// them), and the website's own prices are named only while the website sells something.
const faqs = siteFaqs(
  {
    appPremium: APP_PREMIUM, webPro: WEB_PRO_ENABLED, pro: PRO_ENABLED, signInRequired: SIGN_IN_REQUIRED, communityFriends: COMMUNITY_FRIENDS_ENABLED,
    appStoreUrl: site.appStoreUrl, playStoreUrl: site.playStoreUrl, webPrices: { monthly: PLANS.monthly.price, annual: PLANS.annual.price, pass90: PLANS.pass90.price }, appName: site.name,
  },
  stats.chains,
);

// The website's look (founder 2026-10-15: "the rest of the app should match that elegance too"): a white page, flat light grey cards
// with 20 px corners and nothing inside them but white, the app's black pill for the main action (the words only), the
// one accent green for small highlights, and the Playfair italic kickers the website keeps. No gradients, glows or coloured shadows.
const card = "rounded-[1.25rem] bg-[var(--fill)]";
// Side gutters in px, like the app's: at 200% text the words get the room rather than the margins.
const section = "mx-auto max-w-5xl px-[20px] py-10 sm:py-14";
const heading = "mt-2 max-w-2xl text-3xl font-[650] leading-[1.08] tracking-[-0.02em] sm:text-4xl";

// Decorative, so it grows only a little with the text (22 px, at most 30 px at 200%) and the words keep the room. It sits in a box
// one line tall, so it stays centred on the first line.
function Tick() {
  return (
    <span aria-hidden className="flex h-[1lh] shrink-0 items-center">
      <span className="grid h-[clamp(22px,1.375rem,30px)] w-[clamp(22px,1.375rem,30px)] place-items-center rounded-full bg-white text-accent">
        <CheckIcon className="h-[clamp(13px,0.8125rem,17px)] w-[clamp(13px,0.8125rem,17px)]" strokeWidth={2.6} />
      </span>
    </span>
  );
}

export default function Home() {
  return (
    <>
      {/* The hero (direction "A. Lime", founder 2026-11-27, after Opal's site): the brand lime edge to edge, filling the first screen under the header (which
          turns lime with it: globals.css), one huge headline, one short line, the two stores' badges, the proof row, and the phone rising from the bottom edge.
          The headline is plain text with no animation and no picture larger than it on the first screen, so it is the first and largest thing to paint. */}
      <section aria-labelledby="hero-title" className="hero-lime">
        <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-5xl flex-col items-center px-[20px] pt-9 text-center sm:pt-16">
          <h1 id="hero-title" className="hero-title max-w-[12ch] text-balance lg:max-w-[17ch]">
            Know your <span className="serif-em pe-[0.06em]">macros</span> before you order.
          </h1>
          <p className="mt-5 max-w-[32rem] text-pretty text-[1.0625rem] font-semibold leading-snug sm:mt-7 sm:text-xl">{site.heroLine}</p>
          {/* The two stores' own badges (app/components/StoreBadges.tsx), centred. The website no longer runs the web app, so they are the only way in, and
              /app comes here (lib/webAppClosed.ts GET_THE_APP): scroll-mt keeps them clear of the sticky header. */}
          <StoreBadges id={GET_THE_APP_ID} className="mt-8 justify-center scroll-mt-28 sm:mt-9" />
          {/* True counts from the published data (read at build time above), never typed in; no ratings or awards, because there are none. */}
          <ul aria-label="In the app" className="mt-6 flex max-w-[21rem] flex-wrap justify-center gap-x-5 gap-y-1 text-[0.9375rem] font-semibold leading-relaxed sm:max-w-none sm:gap-x-7 sm:text-base">
            {proof.map((p) => (
              <li key={p.label} className="whitespace-nowrap">
                <span className="app-numbers text-[1.1875rem] font-[750] tracking-[-0.01em] sm:text-xl">{p.figure}</span> {p.label}
              </li>
            ))}
          </ul>
          {/* The phone, cut off by the hero's bottom edge: our own screens, the first shown at once and the others loaded after it, fading from one to the
              next every five seconds (still, showing the first only, with Reduce Motion: globals.css). */}
          <div className="mt-auto pt-10 sm:pt-14">
            <div role="group" aria-label="Screens from the app" className="hero-phone">
              <div className="hero-screen">
                {heroScreens.map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- already sized WebP files (e2e/hero-screens.mjs), no image service needed
                  <img
                    key={s.name}
                    src={`/screens/hero/${s.name}-360.webp`}
                    srcSet={`/screens/hero/${s.name}-360.webp 360w, /screens/hero/${s.name}-700.webp 700w`}
                    sizes="(min-width: 1024px) 317px, (min-width: 640px) 289px, min(261px, 71vw)"
                    width={700}
                    height={1067}
                    alt={s.alt}
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "auto" : "low"}
                    decoding="async"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The app's own screens, below the hero so they load only when scrolled to. A row to swipe on a phone (it takes the keyboard's arrows once
          focused), two rows of five from 1024 px. */}
      <section aria-labelledby="screens" className={section}>
        <p className="kicker">Inside the app</p>
        <h2 id="screens" className={heading}>See it on your phone</h2>
        <figure className="mt-8">
          <div role="region" aria-label="App screenshots" tabIndex={0} className="-mx-[20px] snap-x snap-mandatory scroll-px-[20px] overflow-x-auto px-[20px] pb-2 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0">
            <ul className="flex gap-3 lg:grid lg:grid-cols-5 lg:gap-3.5">
              {screens.map((s) => (
                <li key={s.name} className="w-[min(240px,62vw)] shrink-0 snap-start lg:w-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element -- already sized WebP files (e2e/site-screens.mjs), no image service needed */}
                  <img
                    src={`/screens/${s.name}-480.webp`}
                    srcSet={`/screens/${s.name}-480.webp 480w, /screens/${s.name}-960.webp 960w`}
                    sizes="(min-width: 1024px) 186px, min(240px, 62vw)"
                    width={480}
                    height={1043}
                    loading="lazy"
                    decoding="async"
                    alt={s.alt}
                    className="block h-auto w-full rounded-[1.25rem] bg-[var(--fill)]"
                  />
                </li>
              ))}
            </ul>
          </div>
          {/* CLAUDE.md rule 2: the screens show chains' and shops' official logos as the app does */}
          <figcaption className="mt-4 text-sm font-medium leading-relaxed text-muted">Screens from the iPhone app. Not affiliated with any restaurant or shop shown.</figcaption>
        </figure>
      </section>

      <section aria-labelledby="pillars" className={`${section} @container`}>
        <p className="kicker">More than menus</p>
        <h2 id="pillars" className={heading}>Eat out, shop and cook with the numbers in front of you</h2>
        <div className="mt-8 grid gap-3.5 @2xl:grid-cols-3">
          {pillars.map(({ title, body, Icon }) => (
            <div key={title} className={`${card} p-[22px] sm:p-6`}>
              <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-white text-foreground"><Icon className="h-5 w-5" /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em]">{title}</h3>
              <p className="mt-1.5 text-pretty text-base font-medium leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${section} @container`}>
        <p className="kicker">How it works</p>
        <h2 className={heading}>Three taps to the right order</h2>
        {/* Not in cards: the black number circles carry the structure, so this section reads differently from the pillars above. */}
        <ol className="mt-8 grid gap-7 @2xl:grid-cols-3 @2xl:gap-8">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-[16px] @2xl:flex-col @2xl:gap-5">
              {/* Decorative (the list numbers the steps for screen readers): grows a little with the text, capped, and is centred on the
                  title's first line (the box is one title line tall). */}
              <span aria-hidden className="flex h-[1lh] shrink-0 items-center text-lg @2xl:h-auto">
                <span className="app-numbers grid h-[clamp(36px,2.25rem,48px)] w-[clamp(36px,2.25rem,48px)] place-items-center rounded-full bg-foreground text-[clamp(14px,0.875rem,18px)] font-semibold text-background">{i + 1}</span>
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-1.5 text-pretty text-base font-medium leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${section} grid gap-3.5 lg:grid-cols-2`}>
        <div className={`${card} p-[22px] sm:p-8`}>
          <p className="kicker">Honest numbers</p>
          <h2 className="mt-2 text-2xl font-[650] tracking-[-0.02em]">Numbers you can trust</h2>
          <ul className="mt-5 space-y-3.5 text-pretty text-base font-medium leading-relaxed text-muted">
            <li className="flex gap-[10px]"><Tick /><span>Every number comes from the restaurant&apos;s own published nutrition guide.</span></li>
            <li className="flex gap-[10px]"><Tick /><span>The source and the date we last checked are shown on every chain.</span></li>
            <li className="flex gap-[10px]"><Tick /><span>If a value isn&apos;t published, we say so. We never estimate it.</span></li>
            <li className="flex gap-[10px]"><Tick /><span>Spot something wrong? Tap &ldquo;Report a number&rdquo; and we check it within 48 hours.</span></li>
          </ul>
        </div>
        <div className={`${card} @container p-[22px] sm:p-8`}>
          <p className="kicker">Your goal</p>
          <h2 className="mt-2 text-2xl font-[650] tracking-[-0.02em]">Made for your goal</h2>
          <dl className="mt-5 grid gap-x-6 gap-y-5 @sm:grid-cols-2">
            {goals.map((g) => (
              <div key={g.title}>
                <dt className="text-base font-semibold">{g.title}</dt>
                <dd className="mt-1 text-pretty text-base font-medium leading-relaxed text-muted">{g.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={`${section} lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12`}>
        <h2 className="self-start text-3xl font-[650] tracking-[-0.02em] sm:text-4xl">Questions</h2>
        <div className="mt-6 space-y-3 lg:mt-0">
          {faqs.map((f) => (
            <details key={f.q} className={`${card} group px-[20px] py-2.5 sm:px-6`}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-[12px] text-base font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="grid h-[clamp(36px,2.25rem,44px)] w-[clamp(36px,2.25rem,44px)] shrink-0 place-items-center rounded-full bg-white text-foreground transition-transform group-open:rotate-45"><PlusIcon className="h-[clamp(16px,1rem,20px)] w-[clamp(16px,1rem,20px)]" strokeWidth={2.2} /></span>
              </summary>
              <p className="max-w-prose text-pretty pb-3 pt-1 text-base font-medium leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
