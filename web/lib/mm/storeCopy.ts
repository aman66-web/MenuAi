// The words that name the phone's own store, account or Settings in the in-app purchase, subscription, reminder and location screens, for the two apps: the iPhone app
// (Apple's App Store, Apple ID, the iPhone's Settings) and the Android app (Google Play, Google account, the phone's Settings). Each line is a whole English sentence
// per platform, not a sentence with a name dropped in, so every language's translation (lib/mm/locales) stays a sentence of its own. The iPhone's lines are exactly the
// ones the screens had before the Android app, and the website (no bridge, platform null) keeps them too, so nothing on the iPhone or the website changed.
// Screens read them with t(storeCopy(platform).line), where platform is nativePlatform() (lib/mm/native.ts) or, in a component, useNativePlatform()
// (app/app/_lib/platform.ts).

import { tk } from "./i18n";
import type { NativePlatform } from "./native";

export interface StoreCopy {
  /** The plans screen while the store is asked for its prices. */
  gettingPrices: string;
  cantReach: string;
  /** The busy label of Continue / Subscribe while the store's sheet is up. */
  waiting: string;
  /** The busy label of Restore purchases. */
  checking: string;
  /** Restore purchases found nothing for this account. */
  restoreNone: string;
  /** The store holds a purchase but our server didn't switch Premium on for it. */
  restoreRefused: string;
  /** What the store requires to be said about renewing and cancelling, under the plans. */
  renewal: string;
  /** Under "Premium · Annual" in Settings › Subscription. */
  renewsThrough: string;
  /** In the delete-account sheet: deleting the account doesn't cancel the store's subscription. */
  deleteNote: string;
  /** Apple's standard licence agreement is linked under the plans (App Store rule 3.1.2); Google Play has no such link. */
  eulaLink: boolean;
  /** Reminders ring in the app (said where the app can't ring them: the website, or a phone that gave no answer). */
  remindersRing: string;
  /** Notifications are off for the app. */
  notificationsOff: string;
  /** The phone's location permission is off for the app. */
  locationDenied: string;
}

const APPLE: StoreCopy = {
  gettingPrices: tk("Getting prices from the App Store…"),
  cantReach: tk("Couldn't reach the App Store. Check your connection and try again."),
  waiting: tk("Waiting for the App Store…"),
  checking: tk("Checking with the App Store…"),
  restoreNone: tk("There's nothing to restore for this Apple ID."),
  restoreRefused: tk("Apple has a purchase for this Apple ID, but Premium couldn't be switched on. Please try again later or contact us."),
  renewal: tk("Payment is charged to your Apple ID when you confirm. A subscription renews at the same price and length unless you cancel at least 24 hours before the period ends; the renewal is charged within those 24 hours. Manage or cancel it in your App Store account settings."),
  renewsThrough: tk("Renews through the App Store."),
  deleteNote: tk("Deleting your account doesn't cancel an App Store subscription. To stop being charged, cancel it in your App Store settings."),
  eulaLink: true,
  remindersRing: tk("Reminders ring in the {app} iPhone app. On the website you'll see what's due today here."),
  notificationsOff: tk("Notifications are off for {app}, so reminders won't ring. Turn them on in your iPhone's Settings."),
  locationDenied: tk("{app} isn't allowed to use your location. Turn it on in the iPhone's Settings, under {app}, or type a postcode or town instead."),
};

const GOOGLE: StoreCopy = {
  gettingPrices: tk("Getting prices from Google Play…"),
  cantReach: tk("Couldn't reach Google Play. Check your connection and try again."),
  waiting: tk("Waiting for Google Play…"),
  checking: tk("Checking with Google Play…"),
  restoreNone: tk("There's nothing to restore for this Google account."),
  restoreRefused: tk("Google Play has a purchase for this Google account, but Premium couldn't be switched on. Please try again later or contact us."),
  renewal: tk("Payment is charged to your Google Play account when you confirm. A subscription renews at the same price and length unless you cancel before the period ends. Manage or cancel it in Google Play, under Payments & subscriptions."),
  renewsThrough: tk("Renews through Google Play."),
  deleteNote: tk("Deleting your account doesn't cancel a Google Play subscription. To stop being charged, cancel it in Google Play."),
  eulaLink: false,
  remindersRing: tk("Reminders ring in the {app} Android app. On the website you'll see what's due today here."),
  notificationsOff: tk("Notifications are off for {app}, so reminders won't ring. Turn them on in your phone's Settings."),
  locationDenied: tk("{app} isn't allowed to use your location. Turn it on in your phone's Settings, under Apps, then {app}, or type a postcode or town instead."),
};

/** The Android app's words on Android, the iPhone's everywhere else (the iPhone app, and the website, which only shows them where they were always shown). */
export const storeCopy = (platform: NativePlatform | null): StoreCopy => (platform === "android" ? GOOGLE : APPLE);
