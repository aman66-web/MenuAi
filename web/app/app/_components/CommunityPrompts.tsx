"use client";

import { useState } from "react";
import { site } from "@/site.config";
import type { Failure } from "@/lib/mm/communityClient";
import { failureText } from "../_lib/communityText";
import { useT } from "../_lib/i18n";
import { PeopleIcon } from "./icons";
import { SignInSheet } from "./SignIn";
import { UsernameSheet } from "./UsernameSheet";
import { Button, EmptyState } from "./ui";

// The states every Community screen shares besides "it works": nobody is signed in, no username chosen yet, and "couldn't update".

/** Signed out: Community is the one place that needs an account (founder 2026-10-16). Everything else in the app works without one, and the screen says so. */
export function SignInPrompt({ title, waitingCode }: { title: string; waitingCode?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <EmptyState
        icon={<PeopleIcon />}
        title={title}
        body={
          <>
            {t("Friends need an account, so they can find you with your friend code. Everything else in {app} works without one.", { app: site.name })}
            {waitingCode && <span className="mt-2 block font-semibold text-foreground">{t("Your friend's code is saved. After you sign in, it will be ready to add.")}</span>}
          </>
        }
        action={<Button className="min-h-12 px-7 text-base" onClick={() => setOpen(true)}>{t("Sign in")}</Button>}
      />
      <SignInSheet community open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Signed in but no username yet: the sheet opens by itself the first time (once per visit), and this card brings it back if it is closed. */
export function UsernamePrompt() {
  const t = useT();
  const [open, setOpen] = useState(true);
  return (
    <>
      <EmptyState
        icon={<PeopleIcon />}
        title={t("Choose a username")}
        body={t("Your friends see this name, not your email address. You can't change it later.")}
        action={<Button className="min-h-12 px-7 text-base" onClick={() => setOpen(true)}>{t("Choose a username")}</Button>}
      />
      <UsernameSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Under a screen that already shows something: what is wrong with getting a fresh copy. Offline, what is shown is what was here last time; any other problem
 * says so with a way to try again. (A screen with nothing to show uses an ErrorBox instead.)
 */
export function RefreshNote({ failure, onRetry, shown }: { failure: Failure | null; onRetry: () => void; shown: boolean }) {
  const t = useT();
  if (!failure || !shown) return null;
  return (
    <div role={failure.offline ? "status" : "alert"} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[1.25rem] bg-soft-strong px-4 py-3 text-[0.9375rem] leading-snug">
      <span className="min-w-0 flex-1 basis-48">{failure.offline ? t("You're offline. Showing what was here last time.") : failureText(failure, t)}</span>
      <Button variant="secondary" className="min-h-11 shrink-0" onClick={onRetry}>{t("Try again")}</Button>
    </div>
  );
}
