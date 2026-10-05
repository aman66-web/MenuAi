import type { Metadata } from "next";
import { site } from "@/site.config";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <article className="prose-legal mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-3xl font-bold">Terms</h1>

      <h2>The app</h2>
      <p>
        Your use of the {site.name} app is governed by Apple&apos;s{" "}
        <a href={site.appleStandardEula}>Licensed Application End User License Agreement</a>. Subscriptions are billed
        and managed by Apple; you can cancel any time in your App Store account settings.
      </p>

      <h2>Nutrition information</h2>
      <p>
        Nutrition values come from each restaurant&apos;s published information and are shown with their source and
        the date we last checked. Restaurants change recipes and portions, and mistakes can happen, so values may not
        match what you&apos;re served. If something looks wrong, please report it in the app.
      </p>

      <h2>Not medical advice</h2>
      <p>
        {site.name} helps you choose from published menu information. It doesn&apos;t provide medical, dietary or
        health advice. Suggested targets are starting points only. Talk to your doctor or a registered dietitian about
        your needs, especially if you take medication or have a health condition.
      </p>

      <h2>Restaurants</h2>
      <p>
        {site.name} is not affiliated with, endorsed by or sponsored by any restaurant. Restaurant names are used only
        to identify whose menu is shown and remain the property of their owners.
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
