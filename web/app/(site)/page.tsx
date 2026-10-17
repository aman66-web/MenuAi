import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { catalogueStats } from "@/lib/mm/catalogue";
import type { Manifest } from "@/lib/mm/types";
import { PRO_ENABLED } from "@/lib/mm/config";
import { site } from "@/site.config";
import { BasketIcon, CheckIcon, ForkIcon, PlusIcon, PotIcon } from "@/app/app/_components/icons";
import { WaitlistForm } from "@/app/components/WaitlistForm";

// Read once at build time from the published data, so the headline numbers are never typed in by hand.
const stats = catalogueStats((JSON.parse(readFileSync(join(process.cwd(), "public/menus/menus-manifest.json"), "utf8")) as Manifest).chains);

const steps = [
  { title: "Pick the restaurant", body: "Search by name and open the whole menu. Works offline once you've opened it." },
  { title: "See every item's numbers", body: "Calories, protein, carbs, fat and salt for the whole menu, free." },
  { title: "Get the order that fits", body: PRO_ENABLED ? "Pro ranks the five best orders for your goal and what's left today, and adds up custom orders as you tap." : "See the five best orders for your goal and what's left today, and add up your own order as you tap." },
];

// The three things the app does (founder 2026-10-10: "it's also for groceries ... recipes based on where you shop"), each with the
// glyph its tab wears in the app (our own line icons, never a picture of food).
const pillars = [
  { title: "Eat out", body: `Every dish at ${stats.chains > 0 ? `${stats.chains} UK restaurants` : "popular UK restaurants"}, with calories, protein, carbs and fat from each chain's own guide.`, Icon: ForkIcon },
  { title: "Shop", body: "Supermarket products with the calories, protein and price from the shop's own pages. Make a list and see what it comes to.", Icon: BasketIcon },
  { title: "Cook", body: "Recipes filled with real products from your supermarket, with calories, protein and the cost of each serving. Swap any ingredient.", Icon: PotIcon },
];

const goals = [
  { title: "Lose weight", body: "Stay under today's budget without guessing." },
  { title: "Build muscle", body: "The most protein per calorie, with double-protein options." },
  { title: "Maintain", body: "Eat out with friends and still know your numbers." },
  { title: "GLP-1 medication", body: "Smaller, protein-first orders with a meal-size cap you set." },
];

const faqs = [
  { q: "Is it free?", a: PRO_ENABLED ? "Full menus with calories and macros are free for everyone. Pro adds the ranked best orders, the order builder and logging. Pricing will be shown before you pay for anything." : "Yes. Every feature is free, and nothing needs an account except adding friends in Community. There is nothing to buy." },
  { q: "Where do the numbers come from?", a: "From each restaurant's own published nutrition information. We show the source and the date we last checked on every chain, never estimate missing values, and fix reported mistakes within 48 hours." },
  { q: "Which restaurants?", a: `${stats.chains > 0 ? `${stats.chains} popular UK chains so far` : "Popular UK chains first"}, taken from each chain's own nutrition guide, with more added based on what people request. US chains come later.` },
  { q: "Is it an app?", a: "There is a web version that works in any browser and can be added to your home screen. An iPhone app is planned; Android may follow later." },
  { q: "Is this medical advice?", a: "No. It shows published nutrition information and helps you choose. Talk to your doctor or a dietitian about your own needs." },
];

// The website's look (founder 2026-10-15: "the rest of the app should match that elegance too"): a white page, flat light grey cards
// with 20 px corners and nothing inside them but white, the app's black pill for the main action (the words only), the
// one accent green for small highlights, and the Playfair italic kickers the website keeps. No gradients, glows or coloured shadows.
const card = "rounded-[1.25rem] bg-[var(--fill)]";
// Side gutters in px, like the app's: at 200% text the words get the room rather than the margins.
const section = "mx-auto max-w-5xl px-[20px] py-10 sm:py-14";
const heading = "mt-2 max-w-2xl text-3xl font-[650] leading-[1.08] tracking-[-0.02em] sm:text-4xl";
// A plain black pill: the words only (founder 2026-10-15). Side padding is in px so that at 200% text the words still get the room to wrap whole.
const mainButton =
  "inline-flex min-h-14 w-full items-center justify-center rounded-full bg-foreground px-[24px] py-3 text-center text-base font-semibold text-background transition hover:bg-[color-mix(in_srgb,var(--foreground)_86%,white)] active:scale-[0.98] sm:w-auto";
// Proof cards: the label comes first in the code (a dl needs it, screen readers read it first) and is placed under the figure. Each
// figure is sized to the section (cqi, capped) so its longest word always fits whole in a stacked card; side by side the cards share two
// rows (subgrid), so the figures end on one line and the labels start on one line, however the figures wrap. (The card itself can't be
// a size container: that would stop it being a subgrid.)
const proofCard = `${card} grid content-start gap-3 p-[22px] sm:p-6 @2xl:row-span-2 @2xl:grid-rows-subgrid`;
const proofLabel = "row-start-2 self-start text-pretty text-[0.9375rem] font-medium leading-snug text-muted";
const proofFigure = "row-start-1 self-end leading-[1.04]";
const proofNumber = "app-numbers text-[length:min(2.75rem,22cqi)] font-medium tracking-[-0.02em]";

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
      <section className="mx-auto max-w-5xl px-[20px] pb-6 pt-12 sm:pt-20 lg:pb-10">
        <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16">
          <div>
            <p className="kicker">Know before you order</p>
            <h1 className="mt-4 max-w-3xl text-[2.75rem] font-[650] leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.5rem]">
              Know your <span className="serif-em pe-1 text-accent">macros</span> before you order.
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-muted sm:text-xl">{site.description}</p>
            <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/app" className={mainButton}>
                <span className="min-w-0 text-balance">Open the web app</span>
              </Link>
              {site.appStoreUrl && (
                <a href={site.appStoreUrl} className="inline-flex min-h-14 items-center justify-center rounded-full bg-[var(--fill)] px-7 text-base font-semibold transition hover:bg-soft-strong active:scale-[0.98]">
                  Download on the App Store
                </a>
              )}
            </div>
            <p className="mt-5 max-w-xl text-sm font-medium leading-relaxed text-muted">Free. No account needed for menus, shops and recipes. Your targets and saved orders stay on your device unless you sign in to sync them.</p>
          </div>

          {stats.chains > 0 && (
            // A container, so the three cards sit side by side only when there is room for them at the chosen text size (42rem grows
            // with it): at 200% text they stack.
            <section aria-label="What's in it" className="@container mt-12 lg:mt-0">
              <dl className="grid gap-3.5 @2xl:grid-cols-3">
                <div className={proofCard}>
                  <dt className={proofLabel}>UK restaurants</dt>
                  <dd className={`${proofFigure} ${proofNumber} text-accent`}>{stats.chains}</dd>
                </div>
                <div className={proofCard}>
                  <dt className={proofLabel}>menu items, each with calories, protein, carbs and fat</dt>
                  <dd className={`${proofFigure} ${proofNumber}`}>{stats.itemsLabel}</dd>
                </div>
                <div className={proofCard}>
                  <dt className={proofLabel}>from each restaurant&apos;s own published nutrition information</dt>
                  <dd className={`${proofFigure} serif-em text-[length:min(2.5rem,22cqi)] tracking-[-0.01em]`}>Every number</dd>
                </div>
              </dl>
            </section>
          )}
        </div>
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
            <li className="flex gap-[10px]"><Tick /><span>If a value isn&apos;t published, we say so. We never estimate.</span></li>
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

      {!site.appStoreUrl && (
        <section className={section}>
          {/* The one dark moment on the page: the same black as the app's main buttons, with the lime kept for the kicker. */}
          <div className="rounded-[1.25rem] bg-foreground p-[28px] text-background sm:p-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
            <div>
              <p className="kicker" style={{ color: "var(--sun)" }}>iPhone app</p>
              <h2 className="mt-2 text-3xl font-[650] tracking-[-0.02em] sm:text-4xl">Be first in line</h2>
              <p className="mt-3 text-base font-medium leading-relaxed text-[#c9d1cc] sm:text-lg">Get one email the day {site.name} launches on iPhone.</p>
            </div>
            <div className="mt-7 lg:mt-0">
              <WaitlistForm tone="dark" />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
