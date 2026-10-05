import { site } from "@/site.config";
import { WaitlistForm } from "./components/WaitlistForm";

const steps = [
  { title: "Pick the restaurant", body: "Choose a chain near you or search by name. Works offline." },
  { title: "See every item's numbers", body: "Calories, protein, carbs and fat for the whole menu, free." },
  { title: "Get the order that fits", body: "Pro ranks the five best orders for your goal and what's left today, and adds up custom orders as you tap." },
];

const goals = [
  { title: "Lose weight", body: "Stay under today's budget without guessing." },
  { title: "Build muscle", body: "The most protein per calorie, with double-protein options." },
  { title: "Maintain", body: "Eat out with friends and still know your numbers." },
  { title: "GLP-1 medication", body: "Smaller, protein-first orders with a meal-size cap you set." },
];

const faqs = [
  { q: "Is it free?", a: "Full menus with calories and macros are free for everyone. Pro adds the ranked best orders, the order builder, logging and Apple Health. Pricing will be shown in the App Store at launch, with a free trial." },
  { q: "Where do the numbers come from?", a: "From each restaurant's own published nutrition information. We show the source and the date we last checked on every chain, never estimate missing values, and fix reported mistakes within 48 hours." },
  { q: "Which restaurants?", a: "50 popular US chains at launch, with more added based on what people request." },
  { q: "iPhone only?", a: "Yes, iPhone first (US). Android may follow later." },
  { q: "Is this medical advice?", a: "No. It shows published nutrition information and helps you choose. Talk to your doctor or a dietitian about your own needs." },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:pt-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Coming to iPhone</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{site.tagline}</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">{site.description}</p>
        <div className="mt-8">
          {site.appStoreUrl ? (
            <a href={site.appStoreUrl} className="inline-block rounded-xl bg-foreground px-5 py-3 font-semibold text-background">
              Download on the App Store
            </a>
          ) : (
            <WaitlistForm />
          )}
        </div>
      </section>

      <section className="bg-soft">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-bold">How it works</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-background p-5">
                <span className="text-sm font-semibold text-accent">Step {i + 1}</span>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14 grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold">Numbers you can trust</h2>
          <ul className="mt-4 space-y-3 text-muted">
            <li>Every number comes from the restaurant&apos;s own published nutrition guide.</li>
            <li>The source and the date we last checked are shown on every chain.</li>
            <li>If a value isn&apos;t published, we say so. We never estimate.</li>
            <li>Spot something wrong? Tap &ldquo;Report a number&rdquo; and we check it within 48 hours.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-bold">Made for your goal</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {goals.map((g) => (
              <div key={g.title}>
                <dt className="font-semibold">{g.title}</dt>
                <dd className="mt-1 text-muted">{g.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-6">
        <h2 className="text-2xl font-bold">Questions</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            <details key={f.q} className="py-4">
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-2 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {!site.appStoreUrl && (
        <section className="mx-auto max-w-5xl px-5 py-14">
          <div className="rounded-3xl bg-accent-soft p-8">
            <h2 className="text-2xl font-bold">Be first in line</h2>
            <p className="mt-2 mb-5 text-muted">Get one email the day {site.name} launches.</p>
            <WaitlistForm />
          </div>
        </section>
      )}
    </>
  );
}
