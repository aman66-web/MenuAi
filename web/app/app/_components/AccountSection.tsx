"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { site } from "@/site.config";
import { AccountError, appleDeleteConfirm } from "@/lib/mm/account";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { storeCopy } from "@/lib/mm/storeCopy";
import { localeInfo } from "@/lib/mm/i18n";
import { APP_BUILD, APP_PREMIUM, IAP_ENABLED } from "@/lib/mm/config";
import { formatDate } from "@/lib/mm/format";
import { formatTime } from "@/lib/mm/reminders";
import { manageSubscriptions } from "@/lib/payments/iap";
import { tourStore, updateSettings } from "@/lib/mm/stores";
import { deleteAccount, signOut, syncEngine, useAccountUser, useSyncState } from "../_lib/account";
import { useSignInRequired } from "../_lib/appSwitches";
import { communityCacheStore } from "../_lib/communityCache";
import { useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { useNativePlatform } from "../_lib/platform";
import { Button, Card, Sheet } from "./ui";
import { TrashIcon } from "./icons";
import { SIGN_IN_MESSAGES, SignInSheet } from "./SignIn";

// Settings › Account (docs/ACCOUNTS_SYNC.md). Optional: signed out, everything stays on this device. Signed in, the person's saved meals,
// shopping list, settings, favourites and today's log follow them to their other devices. Sign out keeps the data on this device;
// "Delete my account" (App Store guideline 5.1.1(v)) deletes the account and everything synced for it, and nothing here.

/** "Last saved to your account": the day and the time in the phone's own clock style, no seconds. */
function savedWhen(ms: number, t: ReturnType<typeof useT>, locale: string | undefined): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, t)}, ${formatTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`, locale)}`;
}

/** A quiet note inside the card (what just happened): flat in the page fill with no outline, as anything inside a card (the line fill means "can't press"). */
const noteClass = "mt-3.5 rounded-[0.875rem] bg-fill px-3.5 py-3 text-[0.9375rem] leading-snug";

export function AccountSection() {
  const t = useT();
  const platform = useNativePlatform();
  const store = storeCopy(platform);
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const router = useRouter();
  const user = useAccountUser();
  const community = useStore(communityCacheStore);
  const signInRequired = useSignInRequired();
  const { status, lastSyncAt } = useSyncState();
  const [signInOpen, setSignInOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The website's Google/Apple sign-in comes back here with ?signin=<what happened> when it didn't finish.
  useEffect(() => {
    const url = new URL(window.location.href);
    const reason = url.searchParams.get("signin");
    if (!reason) return;
    url.searchParams.delete("signin");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    const known = SIGN_IN_MESSAGES[reason]; // "ok" has no message: the account section simply shows who is signed in
    // set at once (a timer cleared by the effect's clean-up lost the message when the effect ran twice, as in development)
    if (known) setMessage(known); // eslint-disable-line react-hooks/set-state-in-effect -- read from the address once it is in the browser
  }, []);

  if (!user) {
    return (
      <Card className="p-4">
        <p className="text-[0.9375rem] leading-snug">{t("Sign in to keep your saved meals, shopping list and settings on all your devices. You don't need an account to use {app}.", { app: site.name })}</p>
        {message && <p role="status" className={noteClass}>{t(message)}</p>}
        <Button full className="mt-4 min-h-12 text-base" onClick={() => { setMessage(null); setSignInOpen(true); }}>{t("Sign in")}</Button>
        <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
      </Card>
    );
  }

  const statusLine =
    status === "syncing" ? t("Syncing…")
    : status === "offline" ? t("Waiting for a connection. Your changes will sync when you're back online.")
    : status === "error" ? t("Couldn't sync just now. We'll try again soon.")
    : lastSyncAt ? t("Last saved to your account {time}", { time: savedWhen(lastSyncAt, t, htmlLang) })
    : t("Not synced yet.");

  async function out() {
    setBusy(true);
    try {
      await signOut();
      setSignOutOpen(false);
      // founder 2026-11-17: signing out goes back to the welcome screen too, keeping the account; signing in again from there goes straight to the app. The cover
      // says what happened (?signedout=1: the welcome page's notice), since a message here is never seen once the page has changed.
      router.replace("/app/welcome?signedout=1");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      // An account that signs in with Apple: Apple's own sheet confirms, and gives us the one-time code that lets the server tell Apple the
      // sign-in is over (App Review 5.1.1(v)). Cancelling Apple's sheet deletes nothing (the meeting of 21 November 2026, Ben: a cancel went on to delete the
      // account); our sheet stays open. If Apple's sheet is unavailable, fails or times out, the account is still deleted. 11 minutes, as the sign-in sheets.
      let appleCode: string | undefined;
      if (appleConfirms) {
        const confirmed = await appleDeleteConfirm(() => nativeCall("appleSignIn", {}, 11 * 60_000));
        if (!confirmed) return;
        appleCode = confirmed.appleCode;
      }
      await deleteAccount(appleCode);
      setDeleteOpen(false);
      setMessage(t("Your account has been deleted. Your data stays on this device."));
      // founder 2026-11-17: "when an account's deleted, they go back to the starting screen of my app": the welcome screen again (the tour counts as unseen); what is on this
      // device is kept. The cover says so in its status line (?deleted=1, the onboarding meeting of 20 November 2026: "Your account has been deleted. What was on
      // this phone is still here.").
      tourStore.reset();
      // ...and a new account starts the setup from the beginning (the data on the phone stays)
      updateSettings({ hasCompletedOnboarding: false });
      router.replace("/app/welcome?deleted=1");
    } catch (e) {
      setMessage(e instanceof AccountError && e.offline ? t("You're offline. Connect to the internet and try again.") : t("Something went wrong. Please try again."));
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  }

  // A round mark with the first letter of the address: decorative, like a contact's initial.
  const initial = (user.email ?? "").trim().charAt(0).toUpperCase();
  // an account that signs in with Apple, in the iPhone app: Apple's own sheet asks to confirm while the account is deleted (said first, so it is no surprise).
  // The Android app has no such sheet (an Apple account there signed in through the browser): it deletes without asking Apple.
  const appleConfirms = !!user.providers?.includes("apple") && platform === "ios";

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3.5">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fill text-[1.0625rem] font-[800]">{initial || "·"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-semibold text-muted">{t("Signed in as")}</p>
          <p className="mt-0.5 break-all text-[1.0625rem] font-bold leading-snug">{user.email ?? t("your account")}</p>
        </div>
      </div>
      <p className="mt-3.5 text-[0.9375rem] leading-snug text-muted" role="status">{statusLine}</p>
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {/* while it syncs the button keeps its look with a spinner and "Working…" (never a faded grey that looks broken) */}
        <Button variant="secondary" busy={status === "syncing"} disabled={busy} onClick={() => void syncEngine().syncNow()}>{t("Update now")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setMessage(null); setSignOutOpen(true); }}>{t("Sign out")}</Button>
      </div>
      {message && <p role="status" className={noteClass}>{message}</p>}
      {/* founder 2026-11-17 ("There's no way for the person to delete their account"): a full-width button of its own, not a small grey link */}
      <div className="mt-4 border-t border-line pt-4">
        <Button full variant="danger" className="min-h-12 gap-2 text-base" disabled={busy} onClick={() => setDeleteOpen(true)}>
          <TrashIcon aria-hidden className="h-5 w-5" />{t("Delete my account")}
        </Button>
        <p className="mt-2 text-[0.875rem] leading-snug text-muted">{t("Deletes your account and everything synced for it.")}</p>
      </div>

      {/* Sign out asks first (the audit, 20 November 2026): where everyone signs in, it ends the use of the app on this phone until they sign in again.
          The meal plan is removed on sign-out (the meeting of 21 November 2026, Ben: "What's on this phone stays here" was untrue for it), so the sheet says so. */}
      <Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title={APP_BUILD ? t("Sign out on this phone?") : t("Sign out on this device?")}>
        <p className="pt-1 text-base leading-snug">{signInRequired
          ? (APP_BUILD ? t("You'll need to sign in again to use {app}. What's on this phone stays here.", { app: site.name }) : t("You'll need to sign in again to use {app}. What's on this device stays here.", { app: site.name }))
          : (APP_BUILD ? t("What's on this phone stays here, and you can keep using {app} without an account.", { app: site.name }) : t("What's on this device stays here, and you can keep using {app} without an account.", { app: site.name }))}{" "}{t("Your meal plan is removed.")}</p>
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2 pb-2">
          <Button full variant="secondary" className="min-h-12 text-base" onClick={() => setSignOutOpen(false)}>{t("Stay signed in")}</Button>
          <Button full className="min-h-12 text-base" busy={busy} onClick={() => void out()}>{t("Sign out")}</Button>
        </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("Delete my account")}>
        {/* the live switch (numbite.com can make sign-in optional), not the build's constant */}
        <p className="pt-1 text-base leading-snug">{signInRequired
          ? t("This deletes your account and everything we've synced for it. This can't be undone. To use {app} again, you'll need to create a new account.", { app: site.name })
          : <>{t("This deletes your account and everything we've synced for it. The data on this device stays, so you can keep using {app} without an account. This can't be undone.", { app: site.name })}{" "}{t("Your meal plan is removed.")}</>}</p>
        {appleConfirms && <p className="mt-2.5 text-base leading-snug">{t("Apple will ask you to confirm. That tells Apple your account is closed.")}</p>}
        {/* An App Store subscription is between the person and Apple: deleting the account can't cancel it (founder 2026-11-17 asked; Apple expects the app to say
            so here and show how to cancel). In the iPhone app the button opens Apple's own screen; on the website, Apple's subscriptions page. */}
        {APP_PREMIUM && (
          <div className="mt-3 rounded-[1rem] bg-fill p-3.5">
            <p className="text-base leading-snug">{t(store.deleteNote)}</p>
            {IAP_ENABLED && hasNative()
              ? <Button full variant="secondary" className="mt-3 min-h-11" onClick={() => void manageSubscriptions()}>{t("Manage subscription")}</Button>
              : <a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-accent underline underline-offset-4">{t("Manage subscription")}</a>}
          </div>
        )}
        {/* Community's rows are removed with the account (docs/BACKEND.md "Community"): said here only to someone who has a username */}
        {community?.userId === user.id && community.profile && <p className="mt-3 text-base leading-snug">{t("Your username, friends and the shopping lists you sent or received are deleted too.")}</p>}
        {/* Keep my account first (secondary, on the left), then the red Delete on the right; stacked when the text is large */}
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2 pb-2">
          <Button full variant="secondary" className="min-h-12 text-base" onClick={() => setDeleteOpen(false)}>{t("Keep my account")}</Button>
          <Button full variant="dangerFilled" className="min-h-12 text-base" busy={busy} onClick={() => void remove()}>{t("Delete my account")}</Button>
        </div>
      </Sheet>
    </Card>
  );
}
