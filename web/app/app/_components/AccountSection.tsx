"use client";

import { useEffect, useState } from "react";
import { site } from "@/site.config";
import { AccountError } from "@/lib/mm/account";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { tk } from "@/lib/mm/i18n";
import { deleteAccount, signOut, syncEngine, useAccountUser, useSyncState } from "../_lib/account";
import { useT } from "../_lib/i18n";
import { Button, Card, Sheet } from "./ui";
import { SignInSheet } from "./SignIn";

// Settings › Account (docs/ACCOUNTS_SYNC.md). Optional: signed out, everything stays on this device. Signed in, the person's saved meals,
// shopping list, settings, favourites and today's log follow them to their other devices. Sign out keeps the data on this device;
// "Delete my account" (App Store guideline 5.1.1(v)) deletes the account and everything synced for it, and nothing here.

const SIGN_IN_MESSAGES: Record<string, string> = {
  cancelled: tk("Sign-in was cancelled."),
  failed: tk("Sign-in didn't finish. Please try again."),
  expired: tk("That sign-in took too long. Please try again."),
  busy: tk("Too many tries. Please wait a few minutes and try again."),
};

export function AccountSection() {
  const t = useT();
  const user = useAccountUser();
  const { status, lastSyncAt } = useSyncState();
  const [signInOpen, setSignInOpen] = useState(false);
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
    if (!known) return;
    const id = setTimeout(() => setMessage(known), 0);
    return () => clearTimeout(id);
  }, []);

  if (!user) {
    return (
      <Card className="p-4">
        <p className="text-base">{t("Sign in to keep your saved meals, shopping list and settings on all your devices. You don't need an account to use {app}.", { app: site.name })}</p>
        {message && <p role="status" className="mt-3 rounded-2xl border border-line bg-soft p-3 text-sm">{t(message)}</p>}
        <Button full className="mt-3 min-h-12 text-base" onClick={() => { setMessage(null); setSignInOpen(true); }}>{t("Sign in")}</Button>
        <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
      </Card>
    );
  }

  const statusLine =
    status === "syncing" ? t("Syncing…")
    : status === "offline" ? t("Waiting for a connection. Your changes will sync when you're back online.")
    : status === "error" ? t("Couldn't sync just now. We'll try again soon.")
    : lastSyncAt ? t("Last synced {time}", { time: new Date(lastSyncAt).toLocaleString() })
    : t("Not synced yet.");

  async function out() {
    setBusy(true);
    try {
      await signOut();
      setMessage(t("Signed out. Your data stays on this device."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      // An account that signs in with Apple: Apple's own sheet confirms, and gives us the one-time code that lets the server tell Apple the
      // sign-in is over (App Review 5.1.1(v)). If the sheet is closed or unavailable the account is still deleted.
      let appleCode: string | undefined;
      if (user?.providers?.includes("apple") && hasNative()) appleCode = (await nativeCall("appleSignIn")).appleCode;
      await deleteAccount(appleCode);
      setDeleteOpen(false);
      setMessage(t("Your account has been deleted. Your data stays on this device."));
    } catch (e) {
      setMessage(e instanceof AccountError && e.offline ? t("You're offline. Connect to the internet and try again.") : t("Something went wrong. Please try again."));
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{t("Signed in as")}</p>
      <p className="break-all text-lg font-bold">{user.email ?? t("your account")}</p>
      <p className="mt-2 text-sm text-muted" role="status">{statusLine}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy || status === "syncing"} onClick={() => void syncEngine().syncNow()}>{t("Sync now")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void out()}>{t("Sign out")}</Button>
      </div>
      {message && <p role="status" className="mt-3 rounded-2xl border border-line bg-soft p-3 text-sm">{message}</p>}
      <button type="button" className="mt-4 min-h-11 text-sm font-semibold text-muted underline" onClick={() => setDeleteOpen(true)}>{t("Delete my account")}</button>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("Delete my account")}>
        <p className="text-base">{t("This deletes your account and everything we've synced for it. The data on this device stays, so you can keep using {app} without an account. This can't be undone.", { app: site.name })}</p>
        <div className="mt-4 space-y-2 pb-2">
          <Button full variant="danger" className="min-h-12 text-base" disabled={busy} onClick={() => void remove()}>{t("Delete my account")}</Button>
          <Button full variant="ghost" onClick={() => setDeleteOpen(false)}>{t("Keep my account")}</Button>
        </div>
      </Sheet>
    </Card>
  );
}
