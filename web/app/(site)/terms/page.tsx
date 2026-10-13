import type { Metadata } from "next";
import { PRO_ENABLED } from "@/lib/mm/config";
import { site } from "@/site.config";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <article className="prose-legal mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-3xl font-bold">Terms</h1>

      <h2>The app</h2>
      <p>
        Your use of the {site.name} app is governed by Apple&apos;s{" "}
        <a href={site.appleStandardEula}>Licensed Application End User License Agreement</a>.{" "}
        {PRO_ENABLED
          ? "Subscriptions are billed and managed by Apple; you can cancel any time in your App Store account settings."
          : "The app is free: there is nothing to buy in it."}
      </p>

      <h2>The web app</h2>
      <p>
        The {site.name} web app (at /app on this website) is free to use.{PRO_ENABLED ? " Paid features aren't available in it yet." : ""}{" "}
        Your goal, targets, saved orders and log are kept only in your browser unless you sign in (see below); if you clear your browser&apos;s site
        data, or the browser removes it, and you aren&apos;t signed in, they are deleted and we can&apos;t restore them.
      </p>

      <h2>Accounts (optional)</h2>
      <p>
        You can use {site.name} without an account. If you sign in (with Apple, Google or an email code) your settings and saved items sync across your devices.
        Keep your sign-in secure and tell us if you think someone else has used it. You can delete your account at any time in Settings › Account; that
        deletes the account and everything synced for it. We may close an account that is used to misuse the service. What we keep, and for how long, is
        in the <a href="/privacy">privacy policy</a>.
      </p>

      <h2>Nutrition information</h2>
      <p>
        Nutrition values come from each restaurant&apos;s published information and are shown with their source and
        the date we last checked. Restaurants change recipes and portions, and mistakes can happen, so values may not
        match what you&apos;re served. If something looks wrong, please report it in the app or the web app.
      </p>

      <h2>Not medical advice</h2>
      <p>
        {site.name} helps you choose from published menu information. It doesn&apos;t provide medical, dietary or
        health advice. Suggested targets are starting points only. Talk to your doctor or a registered dietitian about
        your needs, especially if you take medication or have a health condition.
      </p>

      <h2>Restaurants and shops</h2>
      <p>
        {site.name} is not affiliated with, endorsed by or sponsored by any restaurant or supermarket. Their names and
        logos are used only to identify whose menu or products are shown and remain the property of their owners. If you
        own one and want it removed, email us and we&apos;ll take it down.
      </p>

      <h2>This website</h2>
      <p>
        Don&apos;t misuse the website or its forms (for example, by sending spam or automated requests). We may change
        these terms; the current version is always on this page.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
      </p>
    </article>
  );
}
