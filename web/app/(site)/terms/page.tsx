import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRO_ENABLED } from "@/lib/mm/config";
import { site } from "@/site.config";

export const metadata: Metadata = { title: "Terms" };

// Layout only (founder 2026-10-15: "the rest of the app should match that elegance too"): the words are the legal text and are never
// changed from here. Same language as the privacy policy: a compact heavy title, plain section headings with generous space, and the
// contact address as the same green text link as on the privacy and support pages.
const LINK = "font-semibold text-accent underline decoration-[1.5px] underline-offset-[3px] [overflow-wrap:anywhere]";
const para = "text-base leading-[1.7]";

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10 sm:mt-11">
      <h2 className="text-xl font-[800] tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 space-y-3.5">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl px-5 pb-10 pt-10 sm:pt-14">
      <h1 className="text-[2rem] font-[800] leading-none tracking-[-0.02em] sm:text-[2.5rem]">Terms</h1>

      <Section title="The app">
        <p className={para}>
          Your use of the {site.name} app is governed by Apple&apos;s{" "}
          <a className={LINK} href={site.appleStandardEula}>Licensed Application End User License Agreement</a>.{" "}
          {PRO_ENABLED
            ? "Subscriptions are billed and managed by Apple; you can cancel any time in your App Store account settings."
            : "The app is free: there is nothing to buy in it."}
        </p>
      </Section>

      <Section title="The web app">
        <p className={para}>
          The {site.name} web app (at /app on this website) is free to use.{PRO_ENABLED ? " Paid features aren't available in it yet." : ""}{" "}
          Your goal, targets, saved orders and log are kept only in your browser unless you sign in (see below); if you clear your browser&apos;s site
          data, or the browser removes it, and you aren&apos;t signed in, they are deleted and we can&apos;t restore them.
        </p>
      </Section>

      <Section title="Accounts (optional)">
        <p className={para}>
          You can use {site.name} without an account; only friends (the Community tab) need one. If you sign in (with Apple, Google or an email code) your settings and saved items sync across your devices.
          Keep your sign-in secure and tell us if you think someone else has used it. You can delete your account at any time in Settings › Account; that
          deletes the account and everything synced for it. We may close an account that is used to misuse the service. What we keep, and for how long, is
          in the <a className={LINK} href="/privacy">privacy policy</a>.
        </p>
      </Section>

      <Section title="Community">
        <p className={para}>
          Adding friends and sending them shopping lists (the Community tab) needs an account. Choose a username you are happy for your friends to see: it is chosen once and shown to
          your friends and to anyone who enters your friend code or whose friend request you have received, and we never show your email address. We do not tolerate offensive or abusive
          content, and we remove it and the accounts behind it. Be kind. Don&apos;t use a username or a shopping list to insult, harass or threaten anyone, to pretend to be
          someone else (or us), to send spam or advertising, or to share anything unlawful or offensive. Only add and send to people who are happy to hear from you; share your friend code only
          with people you choose.
        </p>
        <p className={para}>
          You can report a username or a shopping list, and block anyone, in the app: report and block are in Community › Friends, and on every list in Shared with you. We read reports and may
          remove a username or list, refuse a friend request or close an account that breaks these rules, without warning. Lists are kept for 30 days and can be deleted by the person who
          receives them, so we cannot promise a list arrives or stays. See the <a className={LINK} href="/privacy">privacy policy</a> for what Community keeps.
        </p>
      </Section>

      <Section title="Nutrition information">
        <p className={para}>
          Nutrition values come from each restaurant&apos;s published information and are shown with their source and
          the date we last checked. Restaurants change recipes and portions, and mistakes can happen, so values may not
          match what you&apos;re served. If something looks wrong, please report it in the app or the web app.
        </p>
      </Section>

      <Section title="Not medical advice">
        <p className={para}>
          {site.name} helps you choose from published menu information. It doesn&apos;t provide medical, dietary or
          health advice. Suggested targets are starting points only. Talk to your doctor or a registered dietitian about
          your needs, especially if you take medication or have a health condition.
        </p>
      </Section>

      <Section title="Reminders">
        <p className={para}>
          Reminders are a convenience. {site.name} rings at the times you choose, but a reminder may not appear if notifications are switched off or silenced
          on your phone, so don&apos;t rely on it alone. {site.name} isn&apos;t a medical device. It doesn&apos;t suggest what to take or when, and it
          doesn&apos;t check that you have taken anything. You are responsible for your medication: follow the advice of your doctor or pharmacist.
        </p>
      </Section>

      <Section title="Restaurants and shops">
        <p className={para}>
          {site.name} is not affiliated with, endorsed by or sponsored by any restaurant or supermarket. Their names and
          logos are used only to identify whose menu or products are shown and remain the property of their owners. If you
          own one and want it removed, email us and we&apos;ll take it down.
        </p>
      </Section>

      <Section title="This website">
        <p className={para}>
          Don&apos;t misuse the website or its forms (for example, by sending spam or automated requests). We may change
          these terms; the current version is always on this page.
        </p>
      </Section>

      <Section title="Contact">
        <p className={para}>
          <a className={LINK} href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
        </p>
      </Section>
    </article>
  );
}
