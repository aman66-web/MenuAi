import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AI_RECIPES_ENABLED, PRO_ENABLED } from "@/lib/mm/config";
import { site } from "@/site.config";

export const metadata: Metadata = { title: "Privacy policy" };

// Layout only (founder 2026-10-15: "the rest of the app should match that elegance too"): the words below are the legal text and are
// never changed from here. The page follows Home's language on the website's white page: a compact heavy title, a small grey pill for
// the date, the opening paragraph in a light grey card, plain section headings, and every list as rows in a light grey card. The
// cards' side padding is in px so it doesn't double at 200% text and squeeze the words into a narrow column.
const FILL = "bg-[#f4f5f6]";
const LINK = "font-semibold text-accent underline decoration-[1.5px] underline-offset-[3px] [overflow-wrap:anywhere]";

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-11 sm:mt-12">
      <h2 className="text-xl font-[800] tracking-[-0.01em]">{title}</h2>
      <div className="mt-3.5 space-y-3.5">{children}</div>
    </section>
  );
}

/** A list as rows in a light grey card (like the rows inside Home's cards), instead of bullets. */
function Rows({ children }: { children: ReactNode }) {
  return <ul className={`${FILL} divide-y divide-line rounded-[1.25rem] px-[20px] py-1.5 sm:px-6`}>{children}</ul>;
}

const row = "py-4 text-base leading-[1.65]";
const para = "text-base leading-[1.7]";

// Plain-English privacy policy matching docs/BACKEND.md and what the apps actually do. Since the free launch (founder 2026-10-12) the
// iPhone app is the web app packed into an app: no purchases, no AI recipe maker, no Apple Health, no usage statistics. Sections for Pro
// and Pip's recipe maker show only while those are switched on (lib/mm/config.ts). Review it (ideally with a professional) before
// publishing, and update it whenever the app or website starts collecting anything new.
export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl px-5 pb-10 pt-10 sm:pt-14">
      <header>
        <h1 className="text-[2rem] font-[800] leading-none tracking-[-0.02em] sm:text-[2.5rem]">Privacy policy</h1>
        <p className={`${FILL} mt-5 inline-flex min-h-9 max-w-full items-center rounded-[1.125rem] px-3.5 py-1.5 text-sm font-semibold text-muted`}>
          Last updated: {site.privacyLastUpdated}
        </p>
      </header>

      <p className={`${FILL} mt-8 rounded-[1.25rem] p-[20px] text-base leading-[1.65] sm:p-6 sm:text-[1.0625rem]`}>
        {site.name} is built to know as little about you as possible. You don&apos;t need an account: everything works without one, and then
        nothing you set up leaves your device. If you choose to sign in, to keep your data on all your devices, the section &ldquo;Signing in and
        syncing (optional)&rdquo; below says exactly what we then keep. This policy covers the {site.name} iPhone app, the {site.name} web app (at /app on this website) and this website. The iPhone app
        is the web app packed into an app, so it works the same way, except that it keeps everything inside the app on your phone.
      </p>

      <Section title="What stays on your phone or in your browser">
        <Rows>
          <li className={row}>Your goal, daily targets, preferences, favourite restaurants, saved orders, the meals you log, and the dishes you looked at in the last day (shown as &ldquo;Recently viewed&rdquo; on that restaurant&apos;s page, then forgotten), and the products and dishes you pick to compare.</li>
          <li className={row}>
            In the iPhone app these are stored only inside the app on your phone; deleting the app deletes them. In the web app they are stored only in this browser
            on this device (local storage and, for a report photo that hasn&apos;t been sent yet, IndexedDB). If you don&apos;t sign in, we never
            receive them; if you do, the parts listed under &ldquo;Signing in and syncing&rdquo; are also saved in your account. Clearing your browser&apos;s site data, or using &ldquo;Clear data on this device&rdquo; in
            Settings, removes them. Browsers can also remove site data on their own if you haven&apos;t visited for a
            while (iPhone Safari can do this after about a week); adding the web app to your Home Screen helps prevent it.
          </li>
          <li className={row}>
            A message, report or request you&apos;ve written but that hasn&apos;t been sent yet (for example because you
            were offline) waits in the same place until it is sent. Once it&apos;s sent, the web app deletes its local copy.
          </li>
        </Rows>
      </Section>

      <Section title="Signing in and syncing (optional)">
        <p className={para}>
          Signing in is your choice and nothing in {site.name} needs it. You can sign in with Apple, with Google, or with a 6-digit code we email you
          (no password). Signing in turns on sync, so your data follows you to your other devices.
        </p>
        <Rows>
          <li className={row}>
            <strong>What we keep about you:</strong> your email address and a user ID. With Apple you may use Apple&apos;s &ldquo;Hide My Email&rdquo;
            address, and we only ever see that address. With Google we ask only for your email address (and the basic profile and openid sign-in
            details Google always includes) and keep only the email address.
          </li>
          <li className={row}>
            <strong>What syncs when you are signed in:</strong> your goal, targets and settings (not your text size or language), your diet and
            allergy choices, favourite restaurants, saved restaurant meals, the recipes you saved, your shopping list, the store-cupboard items you
            mark as already having, what you picked to compare, and today&apos;s log (entries from today and yesterday only).
          </li>
          <li className={row}>
            <strong>What never syncs:</strong> your location, the dishes you viewed in the last day, the offline menu files, messages waiting to be
            sent, and anything in the app while you are signed out.
          </li>
          <li className={row}>
            <strong>Where it is kept:</strong> in our database at Supabase (hosted in the United States), in a table that only our service can read or write,
            and only for the signed-in person. The app and this website never talk to the database directly.
          </li>
          <li className={row}>
            <strong>Sign-in cookies:</strong> if you sign in on this website we set cookies that keep you signed in (and a short-lived one while you
            sign in with Apple or Google). They cannot be read by page scripts and are removed when you sign out. In the iPhone app your sign-in is kept
            inside the app on your phone.
          </li>
          <li className={row}>
            <strong>Signing out</strong> stops syncing on that device; its data stays on the device. <strong>Delete my account</strong> (Settings ›
            Account) deletes your account and everything synced for it from our database straight away, and cannot be undone; what is on your device
            stays there until you clear it. You can also email us to ask for this.
          </li>
          <li className={row}>
            <strong>Clear data on this device</strong> also signs you out on that device; your synced data stays in your account.
          </li>
        </Rows>
      </Section>

      <Section title="Location">
        <p className={para}>
          The Near me map (in Eat out) can use your location, but only when you tap &ldquo;Use my location&rdquo; and allow it (in the
          iPhone app through the iPhone&apos;s own location permission; in the web app through your browser). Your position is used on your
          device to work out which restaurant branches are closest, using a list of branch positions that comes with the app or that your
          browser downloads from us. We never store or receive your location, and it is not remembered on your device.
        </p>
        <p className={para}>
          Instead of sharing your location you can type a postcode or town. That text (not your location) is sent to
          postcodes.io, a free UK postcode service, to find the place on the map. We remember the area you typed on your device
          only, so the Near me map opens there next time; &ldquo;Clear data on this device&rdquo; in Settings removes it.
        </p>
        <p className={para}>
          The map is drawn with tiles from OpenFreeMap. Like any online map, its server can see which part of the map your browser
          asks for and your IP address, but not your location from your device. Branch positions and map data come from
          OpenStreetMap contributors (openstreetmap.org/copyright).
        </p>
      </Section>

      <Section title="Groceries and barcodes">
        <p className={para}>
          The Groceries screen lists supermarket products using the open Open Food Facts database, which is community data and can be
          wrong or out of date. Product photos are shown from the first of these places that has one: a small copy we keep on our own site (your browser then
          talks only to us); or a supermarket&apos;s own website, which loads the picture straight from that shop&apos;s servers, so the shop can see your IP address and
          which pictures your device asks for (we ask it not to say which page you are on); or, only for a product no supermarket&apos;s website has a photo
          of, the Open Food Facts photo of that exact barcode, loaded from Open Food Facts&apos; servers, which can see the same. If a picture fails to load we try the
          next place, and show no picture if none loads.
          Your shopping list stays on your device. If you scan a barcode, the camera picture is read on your device and is never sent anywhere.
        </p>
      </Section>

      <Section title={AI_RECIPES_ENABLED ? <>Recipes and Pip&apos;s recipe maker</> : "Recipes"}>
        <p className={para}>
          Recipes are worked out on your device from the supermarket&apos;s product list; your meal size, diet choices, saved recipes and the store-cupboard items you mark as already having stay on your device.
        </p>
        {AI_RECIPES_ENABLED && (
        <p className={para}>
          If you ask Pip to make a recipe, we send what you chose on that page (the meal, how many people, the meal size and protein, your diet and allergy
          choices, and anything you typed in the &ldquo;Anything you&apos;d like?&rdquo; box) and the list of that shop&apos;s products it may use to our server, which passes
          them to Anthropic, the company that makes the Claude AI, to write the recipe. No name, account, location or anything else is sent, and we don&apos;t keep a
          copy: the recipe comes straight back to your browser. Our server uses a one-way scramble of your IP address, held only in memory for a day, to stop one
          person asking too often.
        </p>
        )}
      </Section>

      <Section title="Purchases">
        <p className={para}>
          {PRO_ENABLED
            ? <>Subscriptions in the iPhone app are handled by Apple. We don&apos;t receive your name, email or payment details. Paid features aren&apos;t available in the web app yet.</>
            : <>There is nothing to buy: every feature is free, in the iPhone app and the web app.</>}
        </p>
      </Section>

      <Section title="Cookies, offline storage and usage statistics">
        <p className={para}>
          We don&apos;t use advertising or tracking cookies. The only cookies are the sign-in cookies described above, and only if you sign in on the website. The iPhone app carries the menus inside it and, when you&apos;re online,
          downloads newer menus and product lists from this website. The web app saves menus and its own files in your browser&apos;s
          cache so it keeps working with a poor connection. Neither sends usage statistics.
        </p>
      </Section>

      <Section title="Things you choose to send us">
        <Rows>
          <li className={row}>
            <strong>Report a number:</strong> the restaurant and item, the value you think is wrong and the correct value,
            your note, an optional photo, and the app (or web app) version and menu data version.
          </li>
          <li className={row}><strong>Request a restaurant:</strong> the name you type and the app version.</li>
          <li className={row}><strong>Support messages:</strong> your message and, if you give it, your email address so we can reply.</li>
          <li className={row}>
            <strong>Website and web app waitlist:</strong> your email address, and which link or screen brought you here
            (for example a link you followed{PRO_ENABLED ? ", or the Pro screen in the web app" : ""}).
          </li>
        </Rows>
        <p className={para}>
          To prevent spam we also keep a one-way, salted hash of the IP address each message came from (not the IP
          address itself) for 30 days, then delete it.
        </p>
      </Section>

      <Section title="Who processes this data">
        <Rows>
          <li className={row}>Supabase (database and file storage) stores what you send us.</li>
          <li className={row}>Vercel hosts this website and the service that receives your messages.</li>
          <li className={row}>
            If you sign in: Supabase also provides the accounts and keeps your synced data; Resend delivers the sign-in code email to your address;
            and Apple or Google confirm your identity if you choose them (see their own privacy policies for what they keep).
          </li>
          {PRO_ENABLED && <li className={row}>Apple processes App Store purchases for the iPhone app.</li>}
          <li className={row}>On the Groceries screen, product photos not stored on our own site are served by the supermarket&apos;s own website (Tesco, Sainsbury&apos;s and the others listed there), or by Open Food Facts for a product no supermarket has a photo of.</li>
          <li className={row}>postcodes.io looks up the postcode or town you type on the Near me map, and OpenFreeMap serves the map tiles there.</li>
          {AI_RECIPES_ENABLED && <li className={row}>Anthropic (the Claude AI) writes a recipe when you ask Pip to make one, from the choices on that page.</li>}
        </Rows>
        <p className={para}>We don&apos;t sell or share your data, show ads, or track you across other apps and websites.</p>
      </Section>

      <Section title="How long we keep it">
        <p className={para}>
          Reports, requests and support messages are kept while they help us maintain accurate menus and support you.
          Waitlist emails are used only to send you one email when what you signed up for is ready (the iPhone app
          launch{PRO_ENABLED ? ", or Pro in the web app" : ""}), and are deleted after that (or sooner if you ask). Your account and its synced data are kept until you delete your account. You can ask us to delete anything you&apos;ve sent at any time.
        </p>
      </Section>

      <Section title="Children">
        <p className={para}>{site.name} is not directed at children under 13, and we don&apos;t knowingly collect their information.</p>
      </Section>

      <Section title="Your choices and contact">
        <p className={para}>
          To access or delete what you&apos;ve sent us, or to ask a question, email{" "}
          <a className={LINK} href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. If this policy changes, we&apos;ll update the
          date above.
        </p>
      </Section>
    </article>
  );
}
