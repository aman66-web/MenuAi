import type { Metadata } from "next";
import { site } from "@/site.config";

export const metadata: Metadata = { title: "Privacy policy" };

// Plain-English privacy policy matching docs/SPEC.md §16 and docs/BACKEND.md.
// Review it (ideally with a professional) before publishing, and update it whenever
// the app or website starts collecting anything new.
export default function Privacy() {
  return (
    <article className="prose-legal mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-3xl font-bold">Privacy policy</h1>
      <p className="text-muted">Last updated: {site.privacyLastUpdated}</p>

      <p>
        {site.name} is built to know as little about you as possible. There is no account and no sign-in. This policy
        covers the {site.name} iPhone app and this website.
      </p>

      <h2>What stays on your phone</h2>
      <ul>
        <li>Your goal, daily targets, preferences, favourite restaurants, saved orders and the meals you log.</li>
        <li>These are stored only on your device. We never receive them.</li>
      </ul>

      <h2>Location</h2>
      <p>
        If you allow it, the app uses your location on your phone to list restaurant chains near you. The search is
        handled by Apple Maps under Apple&apos;s privacy policy. We never store or receive your location.
      </p>

      <h2>Apple Health</h2>
      <p>
        If you turn it on, the app writes the meals you log (calories, protein, carbs, fat and other published
        nutrients) to Apple Health. It never reads your Health data, and Health data is never sent to us or used for
        advertising or marketing.
      </p>

      <h2>Purchases</h2>
      <p>Subscriptions are handled by Apple. We don&apos;t receive your name, email or payment details.</p>

      <h2>Anonymous usage statistics</h2>
      <p>
        The app sends anonymous counts of how features are used (for example &ldquo;order builder opened&rdquo;) so
        we can improve it. They aren&apos;t linked to you, contain no location or health data, and aren&apos;t used
        for advertising or tracking.
      </p>

      <h2>Things you choose to send us</h2>
      <ul>
        <li>
          <strong>Report a number:</strong> the restaurant and item, the value you think is wrong and the correct value,
          your note, an optional photo, and the app and data version.
        </li>
        <li><strong>Request a restaurant:</strong> the name you type and the app version.</li>
        <li><strong>Support messages:</strong> your message and, if you give it, your email address so we can reply.</li>
        <li><strong>Website waitlist:</strong> your email address, and which link brought you here if there was one.</li>
      </ul>
      <p>
        To prevent spam we also keep a one-way, salted hash of the IP address each message came from (not the IP
        address itself) for 30 days, then delete it.
      </p>

      <h2>Who processes this data</h2>
      <ul>
        <li>Supabase (database and file storage) stores what you send us.</li>
        <li>Vercel hosts this website and the service that receives your messages.</li>
        <li>TelemetryDeck receives the anonymous usage statistics.</li>
        <li>Apple processes App Store purchases, Apple Maps searches and Apple Health storage.</li>
      </ul>
      <p>We don&apos;t sell or share your data, show ads, or track you across other apps and websites.</p>

      <h2>How long we keep it</h2>
      <p>
        Reports, requests and support messages are kept while they help us maintain accurate menus and support you.
        Waitlist emails are used only to send one email when we launch, and are deleted after that (or sooner if you
        ask). You can ask us to delete anything you&apos;ve sent at any time.
      </p>

      <h2>Children</h2>
      <p>{site.name} is not directed at children under 13, and we don&apos;t knowingly collect their information.</p>

      <h2>Your choices and contact</h2>
      <p>
        To access or delete what you&apos;ve sent us, or to ask a question, email{" "}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. If this policy changes, we&apos;ll update the
        date above.
      </p>
    </article>
  );
}
