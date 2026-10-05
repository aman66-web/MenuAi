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
        covers the {site.name} iPhone app, the {site.name} web app (at /app on this website) and this website.
      </p>

      <h2>What stays on your phone or in your browser</h2>
      <ul>
        <li>Your goal, daily targets, preferences, favourite restaurants, saved orders and the meals you log.</li>
        <li>
          In the iPhone app these are stored only on your device. In the web app they are stored only in this browser
          on this device (local storage and, for a report photo that hasn&apos;t been sent yet, IndexedDB). We never
          receive them. Clearing your browser&apos;s site data, or using &ldquo;Clear data on this device&rdquo; in
          Settings, removes them.
        </li>
      </ul>

      <h2>Location</h2>
      <p>
        If you allow it, the iPhone app uses your location on your phone to list restaurant chains near you. The
        search is handled by Apple Maps under Apple&apos;s privacy policy. We never store or receive your location. The
        web app doesn&apos;t use your location.
      </p>

      <h2>Apple Health</h2>
      <p>
        If you turn it on, the app writes the meals you log (calories, protein, carbs, fat and other published
        nutrients) to Apple Health. It never reads your Health data, and Health data is never sent to us or used for
        advertising or marketing.
      </p>

      <h2>Purchases</h2>
      <p>
        Subscriptions in the iPhone app are handled by Apple. We don&apos;t receive your name, email or payment
        details. Paid features aren&apos;t available in the web app yet.
      </p>

      <h2>Cookies, offline storage and usage statistics</h2>
      <p>
        We don&apos;t use cookies or advertising trackers. The web app saves menus and its own files in your browser&apos;s
        cache so it keeps working with a poor connection. The iPhone app sends anonymous counts of how features are used
        (for example &ldquo;order builder opened&rdquo;) so we can improve it. They aren&apos;t linked to you, contain no
        location or health data, and aren&apos;t used for advertising or tracking. The web app doesn&apos;t send usage
        statistics.
      </p>

      <h2>Things you choose to send us</h2>
      <ul>
        <li>
          <strong>Report a number:</strong> the restaurant and item, the value you think is wrong and the correct value,
          your note, an optional photo, and the app (or web app) version and menu data version.
        </li>
        <li><strong>Request a restaurant:</strong> the name you type and the app version.</li>
        <li><strong>Support messages:</strong> your message and, if you give it, your email address so we can reply.</li>
        <li>
          <strong>Website and web app waitlist:</strong> your email address, and which link or screen brought you here
          (for example a link you followed, or the Pro screen in the web app).
        </li>
      </ul>
      <p>
        To prevent spam we also keep a one-way, salted hash of the IP address each message came from (not the IP
        address itself) for 30 days, then delete it.
      </p>

      <h2>Who processes this data</h2>
      <ul>
        <li>Supabase (database and file storage) stores what you send us.</li>
        <li>Vercel hosts this website and the service that receives your messages.</li>
        <li>TelemetryDeck receives the iPhone app&apos;s anonymous usage statistics.</li>
        <li>Apple processes App Store purchases, Apple Maps searches and Apple Health storage for the iPhone app.</li>
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
