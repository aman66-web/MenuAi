"use client";

import { useEffect, useState } from "react";
import type { Failure, Person } from "@/lib/mm/communityClient";
import { PersonSheet } from "../../_components/PersonSheet";
import type { ReportTarget } from "../../_components/ReportForm";
import { RefreshNote, SignInPrompt, UsernamePrompt } from "../../_components/CommunityPrompts";
import { Button, ErrorBox, Spinner } from "../../_components/ui";
import { answerRequest, refreshBlocks, refreshFriends, removeFriend, unblock, useCommunityResource, useFriendsScreen } from "../../_lib/community";
import { failureText } from "../../_lib/communityText";
import { useHydrated } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { useInviteCode } from "../../_lib/inviteCode";
import { BackLink, CARD, NOTE, TITLE } from "../../groceries/PageBits";
import { AddFriendCard } from "./AddFriendCard";
import { ListSection, PersonRow, RowMenuButton } from "./FriendRows";
import { MyCodeCard } from "./MyCodeCard";

// Friends (Community, founder 2026-10-16: "add a friend and more, you can add a friend and send them shopping lists"). Needs an account; nothing else in the app does.
// You are found only by your friend code or invite link: there is no search by name or email, and nobody sees an email address, only a username. From here: share
// your code, add a friend's, answer requests, and report, block or remove someone. The screen has a state for each way it can be: signed out, no username yet,
// loading, couldn't load, offline (showing the copy kept on this device) and empty.

/** After a row is answered or removed the button that was pressed is gone: focus goes to the heading of the first of these lists that is still on the page (else the page title). */
function focusAfter(...ids: string[]): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const heading = ids.map((id) => document.getElementById(id)).find((el) => el !== null) ?? document.querySelector("h1");
      heading?.focus();
    }),
  );
}

/** How long a note about what just happened stays on screen. */
const NOTE_MS = 7000;

export default function FriendsPage() {
  const t = useT();
  const enabled = useFriendsScreen();
  const hydrated = useHydrated();
  const [invite, clearInvite] = useInviteCode();
  const me = useCommunityResource("me");
  const profile = me.data?.profile ?? null;
  const ready = me.signedIn && profile !== null;
  const friends = useCommunityResource("friends", ready);
  const blocks = useCommunityResource("blocks", ready);
  const [sheet, setSheet] = useState<ReportTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  const back = <BackLink href="/app/community" label={t("Back to community")} />;
  const heading = <h1 tabIndex={-1} className={`mt-5 ${TITLE} outline-none`}>{t("Friends")}</h1>;

  if (!enabled) return null;
  if (!hydrated) return <div>{back}{heading}</div>;
  if (!me.signedIn) return <div>{back}{heading}<div className="mt-6"><SignInPrompt title={t("Sign in to add friends")} waitingCode={invite !== null} /></div></div>;
  if (me.waiting || (me.loading && !me.data)) return <div>{back}{heading}<Spinner /></div>;
  if (!me.data) return <div>{back}{heading}<div className="mt-6"><ErrorBox message={me.failure ? failureText(me.failure, t) : t("Something went wrong. Please try again.")} onRetry={me.reload} /></div></div>;
  if (!profile) return <div>{back}{heading}<div className="mt-6"><UsernamePrompt /></div></div>;

  const data = friends.data;
  const lookup = (p: Person, kind: ReportTarget["kind"]): ReportTarget => ({ kind, id: p.id, username: p.username });
  /** Run one action on a row, wait for the lists to catch up, say how it went (at the top of the screen, where it is seen) and put focus where the row was. */
  async function act(id: string, run: () => Promise<{ ok: true } | Failure>, done: string, after: string[], refresh: () => Promise<void> = refreshFriends) {
    if (busy) return;
    setBusy(id);
    setNote(null);
    try {
      const r = await run();
      if (r.ok) {
        await refresh();
        setNote(done);
        focusAfter(...after);
      } else setNote(failureText(r, t));
    } finally {
      setBusy(null);
    }
  }

  /** Requests waiting for an answer come first when there are any: the tab and the card said so, so they should be the first thing here. */
  const requests = data && data.incoming.length > 0 && (
    <ListSection id="requests" title={t("Friend requests")} count={data.incoming.length}>
      <ul>
        {data.incoming.map((p) => (
          <PersonRow
            key={p.id}
            name={p.username}
            end={<RowMenuButton name={p.username} onClick={() => setSheet(lookup(p, "request"))} />}
            below={
              <>
                <Button className="min-h-11" aria-disabled={busy === p.id || undefined} aria-label={t("Accept {name}", { name: p.username })} onClick={() => void act(p.id, () => answerRequest(p.id, true), t("You and {name} are now friends.", { name: p.username }), ["friends-list"])}>{t("Accept")}</Button>
                <Button variant="secondary" className="min-h-11" aria-disabled={busy === p.id || undefined} aria-label={t("Decline {name}", { name: p.username })} onClick={() => void act(p.id, () => answerRequest(p.id, false), t("Declined."), ["requests", "friends-list"])}>{t("Decline")}</Button>
              </>
            }
          />
        ))}
      </ul>
    </ListSection>
  );
  const expectingRequests = data === null && (me.data?.counts.friendRequests ?? 0) > 0;

  return (
    <div>
      {back}
      {heading}
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Add friends with their code, then send them your shopping list.")}</p>

      {requests}
      {expectingRequests && <Spinner />}
      <MyCodeCard username={profile.username} code={profile.friendCode} />
      <AddFriendCard invite={invite} onUsed={clearInvite} />
      {/* what just happened: read out through a region that is always there, and shown at the top of the screen (the row it was about may be far down or gone) */}
      <p role="status" aria-live="polite" className="sr-only">{note}</p>
      {note && <div aria-hidden className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 mx-auto max-w-md rounded-[1.25rem] bg-foreground px-5 py-3 text-[0.9375rem] font-semibold leading-snug text-background shadow-lg [overflow-wrap:anywhere]">{note}</div>}

      <RefreshNote failure={friends.failure ?? me.failure} shown={data !== null} onRetry={() => { me.reload(); friends.reload(); }} />

      {data === null ? (
        friends.failure ? <div className="mt-6"><ErrorBox message={failureText(friends.failure, t)} onRetry={friends.reload} /></div> : <Spinner />
      ) : (
        <>
          {data.outgoing.length > 0 && (
            <ListSection id="waiting" title={t("Waiting for an answer")} count={data.outgoing.length}>
              <ul>
                {data.outgoing.map((p) => (
                  <PersonRow
                    key={p.id}
                    name={p.username}
                    end={<Button variant="secondary" className="min-h-11 shrink-0" aria-disabled={busy === p.id || undefined} aria-label={t("Take back your request to {name}", { name: p.username })} onClick={() => void act(p.id, () => removeFriend(p.id), t("Request taken back."), ["waiting", "friends-list"])}>{t("Take back")}</Button>}
                  />
                ))}
              </ul>
            </ListSection>
          )}

          <ListSection id="friends-list" title={t("Your friends")} count={data.friends.length}>
            {data.friends.length === 0 ? (
              <p className="px-5 py-6 text-base leading-snug text-muted">{t("No friends yet. Share your friend code, or add a friend's code above.")}</p>
            ) : (
              <ul>
                {data.friends.map((p) => (
                  <PersonRow key={p.id} name={p.username} end={<RowMenuButton name={p.username} onClick={() => setSheet(lookup(p, "friend"))} />} />
                ))}
              </ul>
            )}
          </ListSection>
          {data.friends.length > 0 && <p className={`mt-3 px-1 ${NOTE}`}>{t("Tap the three dots next to a name to report, block or remove someone.")}</p>}

          {blocks.data && blocks.data.length > 0 && (
            <ListSection id="blocked" title={t("People you've blocked")} count={blocks.data.length}>
              <ul>
                {blocks.data.map((p) => (
                  <PersonRow
                    key={p.id}
                    name={p.username}
                    end={<Button variant="secondary" className="min-h-11 shrink-0" aria-disabled={busy === p.id || undefined} aria-label={t("Unblock {name}", { name: p.username })} onClick={() => void act(p.id, () => unblock(p.id), t("{name} is unblocked. You are not friends again unless you add each other's codes.", { name: p.username }), ["blocked", "friends-list"], refreshBlocks)}>{t("Unblock")}</Button>}
                  />
                ))}
              </ul>
            </ListSection>
          )}
        </>
      )}

      <p className={`${CARD} mt-8 p-5 ${NOTE}`}>{t("Friends see only your username. If someone bothers you, report or block them: they aren't told.")}</p>

      <PersonSheet
        target={sheet}
        onClose={() => setSheet(null)}
        onDone={(what, name) => {
          setNote(what === "removed" ? t("{name} was removed from your friends.", { name }) : what === "blocked" ? t("{name} is blocked.", { name }) : null);
          if (what !== "reported") void refreshFriends().then(() => focusAfter("friends-list", "requests"));
        }}
      />
    </div>
  );
}
