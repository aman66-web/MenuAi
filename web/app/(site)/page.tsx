import Link from "next/link";
import { site } from "@/site.config";
import { WaitlistForm } from "@/app/components/WaitlistForm";

const steps = [
  { title: "Pick the restaurant", body: "Search by name and open the whole menu. Works offline once you've opened it." },
  { title: "See every item's numbers", body: "Calories, protein, carbs, fat and salt for the whole menu, free." },
  { title: "Get the order that fits", body: "Pro ranks the five best orders for your goal and what's left today, and adds up custom orders as you tap." },
];

const goals = [
  { title: "Lose weight", body: "Stay under today's budget without guessing." },
  { title: "Build muscle", body: "The most protein per calorie, with double-protein options." },
  { title: "Maintain", body: "Eat out with friends and still know your numbers." },
  { title: "GLP-1 medication", body: "Smaller, protein-first orders with a meal-size cap you set." },
];

const faqs = [
  { q: "Is it free?", a: "Full menus with calories and macros are free for everyone. Pro adds the ranked best orders, the order builder and logging. Pricing will be shown before you pay for anything." },
  { q: "Where do the numbers come from?", a: "From each restaurant's own published nutrition information. We show the source and the date we last checked on every chain, never estimate missing values, and fix reported mistakes within 48 hours." },
  { q: "Which restaurants?", a: "Popular UK chains first, taken from each chain's own nutrition guide, with more added based on what people request. US chains come later." },
  { q: "Is it an app?", a: "There is a web version that works in any browser and can be added to your home screen. An iPhone app is planned; Android may follow later." },
  { q: "Is this medical advice?", a: "No. It shows published nutrition information and helps you choose. Talk to your doctor or a dietitian about your own needs." },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:pt-20">
        <p className="kicker">Know before you order</p>
        <h1 className="mt-3 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
          Know your <span className="serif-em sun-text pr-1">macros</span> before you order.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">{site.description}</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/app" className="btn-sun glow-shadow inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-bold text-on-accent transition active:scale-[0.97]">
            Open the web app
          </Link>
          {site.appStoreUrl && (
            <a href={site.appStoreUrl} className="glass inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-semibold">
              Download on the App Store
            </a>
          )}
        </div>
        <p className="mt-4 text-sm text-muted">Free. No account. Your targets and saved orders stay on your device.</p>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12">
        <p className="kicker">How it works</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Three taps to the right order</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="glass rounded-3xl p-6">
              <span className="bg-sun inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-on-accent">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold tracking-tight">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-5 py-12 sm:grid-cols-2">
        <div className="hero-card rounded-3xl p-7">
          <p className="kicker">Honest numbers</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Numbers you can trust</h2>
          <ul className="mt-4 space-y-3 leading-relaxed text-muted">
            <li>Every number comes from the restaurant&apos;s own published nutrition guide.</li>
            <li>The source and the date we last checked are shown on every chain.</li>
            <li>If a value isn&apos;t published, we say so. We never estimate.</li>
            <li>Spot something wrong? Tap &ldquo;Report a number&rdquo; and we check it within 48 hours.</li>
          </ul>
        </div>
        <div className="glass rounded-3xl p-7">
          <p className="kicker">Your goal</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Made for your goal</h2>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            {goals.map((g) => (
              <div key={g.title}>
                <dt className="font-bold">{g.title}</dt>
                <dd className="mt-1 leading-relaxed text-muted">{g.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="text-3xl font-extrabold tracking-tight">Questions</h2>
        <div className="mt-6 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="glass group rounded-3xl px-6 py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="text-xl text-accent transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-2 pt-1 leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {!site.appStoreUrl && (
        <section className="mx-auto max-w-5xl px-5 py-12">
          <div className="hero-card rounded-[2rem] p-8 sm:p-12">
            <p className="kicker">iPhone app</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Be first in line</h2>
            <p className="mb-6 mt-2 text-muted">Get one email the day {site.name} launches on iPhone.</p>
            <WaitlistForm />
          </div>
        </section>
      )}
    </>
  );
}
