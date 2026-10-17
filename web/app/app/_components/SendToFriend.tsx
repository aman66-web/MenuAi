"use client";

import { useEffect, useRef, useState } from "react";
import { INBOX_DAYS } from "@/lib/community/limits";
import { COMMUNITY_FRIENDS_ENABLED } from "@/lib/mm/config";
import type { Person } from "@/lib/mm/communityClient";
import type { ShoppingItem } from "@/lib/mm/groceries";
import { encodeEntries, toEntries } from "@/lib/mm/shareList";
import { sendList, useCommunityResource } from "../_lib/community";
import { failureText } from "../_lib/communityText";
import { useAccountUser, userStore } from "../_lib/account";
import { useT } from "../_lib/i18n";
import { SendIcon } from "./communityIcons";
import { RefreshNote } from "./CommunityPrompts";
import { ChevronRightIcon } from "./icons";
import { SignInSheet } from "./SignIn";
import { UsernameSheet } from "./UsernameSheet";
import { Button, ErrorBox, LinkButton, Sheet, Spinner } from "./ui";
import { Initial } from "../community/friends/FriendRows";

// "Send to a friend" on the Shopping list (founder 2026-10-16: "you can add a friend and send them shopping lists"). Pick a friend, check the name, send. The
// friend gets it in Community › Shared with you. What is sent is the share-link code of the list (lib/mm/shareList.ts): references to the shops' own products and
// the words typed in, never a price or a number; ticked items (already in the basket) are left out. This button is the only place that asks a signed-out person
// to sign in to send: the steps go on by themselves (sign in, choose a username, pick a friend), and each can be closed.

type Flow = "closed" | "signin" | "username" | "pick";

export function SendToFriend({ list, onSent }: { list: readonly ShoppingItem[]; onSent: (message: string) => void }) {
  const t = useT();
  const user = useAccountUser();
  const [flow, setFlow] = useState<Flow>("closed");
  const waitingForSignIn = useRef(false);

  // signed in from this button: carry on to the next step
  useEffect(() => {
    if (user && waitingForSignIn.current) {
      waitingForSignIn.current = false;
      setFlow("pick"); // the person has just signed in through the sheet: the next step opens
    }
  }, [user]);

  if (!COMMUNITY_FRIENDS_ENABLED) return null;
  const start = () => {
    if (!user) {
      waitingForSignIn.current = true;
      setFlow("signin");
    } else setFlow("pick");
  };
  // A sheet that closes tells us twice (our own close, then the dialog's own "close" event a moment later, after the next step may already have opened): each
  // only ends the step it belongs to, so a late "close" from the sheet before can't shut the one that has just opened.
  const closeStep = (step: Flow) => setFlow((f) => (f === step ? "closed" : f));
  return (
    <>
      {/* its own row of the button grid: in half a row the label wrapped to "Send to a / friend" beside Share and Copy */}
      <Button variant="secondary" className="col-span-full min-h-12" onClick={start}><SendIcon className="h-5 w-5" />{t("Send to a friend")}</Button>
      {/* closed without signing in: stop waiting for it (the store is read now, not the render's copy of the user, which is from before the sign-in) */}
      <SignInSheet community open={flow === "signin"} onClose={() => { if (!userStore.get()) waitingForSignIn.current = false; closeStep("signin"); }} />
      <UsernameSheet open={flow === "username"} onClose={() => closeStep("username")} onChosen={() => setFlow("pick")} />
      <PickSheet open={flow === "pick"} list={list} onClose={() => closeStep("pick")} onUsername={() => setFlow("username")} onSent={(m) => { setFlow("closed"); onSent(m); }} />
    </>
  );
}

function PickSheet({ open, list, onClose, onUsername, onSent }: { open: boolean; list: readonly ShoppingItem[]; onClose: () => void; onUsername: () => void; onSent: (message: string) => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Send to a friend")}>
      {open && <PickPanel list={list} onUsername={onUsername} onSent={onSent} />}
    </Sheet>
  );
}

function PickPanel({ list, onUsername, onSent }: { list: readonly ShoppingItem[]; onUsername: () => void; onSent: (message: string) => void }) {
  const t = useT();
  const me = useCommunityResource("me");
  const profile = me.data?.profile ?? null;
  const friends = useCommunityResource("friends", profile !== null);
  const [chosen, setChosen] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const encoded = encodeEntries(toEntries(list));

  // Choosing a friend (and going back) swaps the whole sheet: the button that was pressed is gone, so focus goes to the sheet's title, where it is read out.
  const lastChosen = useRef<Person | null>(null);
  useEffect(() => {
    if (lastChosen.current === chosen) return;
    lastChosen.current = chosen;
    document.querySelector<HTMLElement>("dialog[open] h2")?.focus();
  }, [chosen]);

  if (!encoded) return <p className="pb-2 pt-1 text-base leading-snug">{t("Nothing on your list is left to send. Items you've ticked aren't sent.")}</p>;
  if (me.waiting || (me.loading && !me.data)) return <Spinner />;
  if (!me.data) return <div className="pb-2"><ErrorBox message={me.failure ? failureText(me.failure, t) : t("Something went wrong. Please try again.")} onRetry={me.reload} /></div>;
  if (!profile) {
    return (
      <div className="pb-2 pt-1">
        <p className="text-base leading-snug">{t("Choose a username first, so your friends know who the list is from.")}</p>
        <Button full className="mt-5 min-h-12 text-base" onClick={onUsername}>{t("Choose a username")}</Button>
      </div>
    );
  }

  async function send(friend: Person) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sendList(friend.id, encoded!.payload);
      if (r.ok) onSent(t("Sent to {name}.", { name: friend.username }));
      else setError(failureText(r, t, friend.username));
    } finally {
      setBusy(false);
    }
  }

  if (chosen) {
    const cut = encoded.included < encoded.total;
    return (
      <div className="pb-2 pt-1">
        <p className="text-base leading-snug [overflow-wrap:anywhere]">{t("Send your shopping list to {name}?", { name: chosen.username })}</p>
        <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-muted">{encoded.included === 1 ? t("1 item") : t("{n} items", { n: encoded.included })}</p>
        {/* what the friend gets and for how long, before it can't be taken back */}
        <p className="mt-2 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]">{t("{name} will see this list, and your username {username}, for {days} days. Any words you typed are shown too. You can't take it back.", { name: chosen.username, username: profile.username, days: INBOX_DAYS })}</p>
        {cut && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Only the first {n} of your {total} items can be sent.", { n: encoded.included, total: encoded.total })}</p>}
        {error && <p role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-snug">{error}</p>}
        {/* aria-disabled, not disabled, while it is sending: a disabled button drops the keyboard focus to the page */}
        <Button full className="mt-5 min-h-12 text-base" aria-disabled={busy || undefined} onClick={() => void send(chosen)}>{busy ? <Spinner label={t("Sending…")} /> : t("Send")}</Button>
        <Button full variant="ghost" className="mt-1.5" disabled={busy} onClick={() => { setChosen(null); setError(null); }}>{t("Back")}</Button>
      </div>
    );
  }

  if (friends.data === null) {
    return friends.failure ? <div className="pb-2"><ErrorBox message={failureText(friends.failure, t)} onRetry={friends.reload} /></div> : <Spinner />;
  }
  if (friends.data.friends.length === 0) {
    return (
      <div className="pb-2 pt-1">
        <p className="text-base leading-snug">{t("You have no friends yet. Add one with their friend code, then send your list.")}</p>
        <LinkButton href="/app/community/friends" full className="mt-5 min-h-12 text-base">{t("Add a friend")}</LinkButton>
      </div>
    );
  }
  return (
    <div className="pb-2">
      <p className="text-[0.9375rem] leading-snug text-muted">{t("Who do you want to send it to?")}</p>
      <RefreshNote failure={friends.failure} shown onRetry={friends.reload} />
      <ul className="mt-3 space-y-2">
        {friends.data.friends.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => { setChosen(f); setError(null); }} className="flex min-h-14 w-full items-center gap-3.5 rounded-2xl bg-[var(--fill)] px-4 py-2 text-start transition active:scale-[0.99] hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <Initial name={f.username} />
              <span className="min-w-0 flex-1 text-base font-semibold leading-snug [overflow-wrap:anywhere]">{f.username}</span>
              <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
