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
          Settings, removes them. Browsers can also remove site data on their own if you haven&apos;t visited for a
          while (iPhone Safari can do this after about a week); adding the web app to your Home Screen helps prevent it.
        </li>
        <li>
          A message, report or request you&apos;ve written but that hasn&apos;t been sent yet (for example because you
          were offline) waits in the same place until it is sent. Once it&apos;s sent, the web app deletes its local copy.
        </li>
      </ul>

      <h2>Location</h2>
      <p>
        The web app&apos;s Nearby screen can use your location, but only when you tap &ldquo;Use my location&rdquo; (or your
        browser has already been allowed to share it with this site). Your position is used in your browser to work out
        which restaurant branches are closest, using a list of branch positions that your browser downloads from us. We never
        store or receive your location, and it is not remembered on your device.
      </p>
      <p>
        Instead of sharing your location you can type a postcode or town. That text (not your location) is sent to
        postcodes.io, a free UK postcode service, to find the place on the map. We remember the area you typed on your device
        only, so Nearby opens there next time; &ldquo;Clear data on this device&rdquo; in Settings removes it.
      </p>
      <p>
        The map is drawn with tiles from OpenFreeMap. Like any online map, its server can see which part of the map your browser
        asks for and your IP address, but not your location from your device. Branch positions and map data come from
        OpenStreetMap contributors (openstreetmap.org/copyright).
      </p>
      <p>
        If you allow it, the iPhone app uses your location on your phone to list restaurant chains near you. The search is
        handled by Apple Maps under Apple&apos;s privacy policy. We never store or receive your location.
      </p>

      <h2>Groceries and barcodes</h2>
      <p>
        The web app&apos;s Groceries screen lists supermarket products using the open Open Food Facts database, which is community data and can be
        wrong or out of date. Product photos are only ever the supermarket&apos;s own, shown from the first of these places that has one: a small copy we keep on our
        own site (your browser then talks only to us); or the supermarket&apos;s own website, which loads the picture straight from that shop&apos;s servers, so the shop
        can see your IP address and which pictures your browser asks for (we ask your browser not to say which page you are on). If a picture fails to load we try the
        next place, and show no picture if none loads.
        Your shopping list stays on your device. If you scan a barcode, the camera picture is read inside your browser and is never sent anywhere.
      </p>

      <h2>Recipes and Pip&apos;s recipe maker</h2>
      <p>
        Recipes are worked out in your browser from the supermarket&apos;s product list; your meal size, diet choices and saved recipes stay on your device.
        If you ask Pip to make a recipe, we send what you chose on that page (the meal, how many people, the meal size and protein, your diet and allergy
        choices, and anything you typed in the &ldquo;Anything you&apos;d like?&rdquo; box) and the list of that shop&apos;s products it may use to our server, which passes
        them to Anthropic, the company that makes the Claude AI, to write the recipe. No name, account, location or anything else is sent, and we don&apos;t keep a
        copy: the recipe comes straight back to your browser. Our server uses a one-way scramble of your IP address, held only in memory for a day, to stop one
        person asking too often.
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
        <li>On the Groceries screen, product photos not stored on our own site are served by the supermarket&apos;s own website (Tesco, Sainsbury&apos;s and the others listed there).</li>
        <li>postcodes.io looks up the postcode or town you type on the web app&apos;s Nearby screen, and OpenFreeMap serves the map tiles there.</li>
        <li>Anthropic (the Claude AI) writes a recipe when you ask Pip to make one, from the choices on that page.</li>
      </ul>
      <p>We don&apos;t sell or share your data, show ads, or track you across other apps and websites.</p>

      <h2>How long we keep it</h2>
      <p>
        Reports, requests and support messages are kept while they help us maintain accurate menus and support you.
        Waitlist emails are used only to send you one email when what you signed up for is ready (the iPhone app
        launch, or Pro in the web app), and are deleted after that (or sooner if you ask). You can ask us to delete anything you&apos;ve sent at any time.
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
