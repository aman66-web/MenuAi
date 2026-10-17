"use client";

import { useCallback, useEffect, useState } from "react";
import { parseFriendCode } from "@/lib/community/friendCode";

// A friend's invite link (https://numbite.com/f#CODE, or numbite://f#CODE in the iPhone app) lands on /app/community/friends#CODE. The code is in the part after the
// "#", which no server ever receives from the link. It is read there, kept for this tab only (sessionStorage), and taken out of the address, so that
//   * signing in (Apple and Google leave this page and come back to it without the "#") doesn't lose it, and
//   * adding the friend, or reloading, doesn't fill the box a second time.
// It is only ever put in the "Add a friend" box: nothing is sent until the person taps Add friend.

const KEY = "mm.friendInvite";

function stored(): string | null {
  try {
    return parseFriendCode(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}
function keep(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(KEY, code);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the code lives in memory for this visit */
  }
}

/** Forget a kept invite code (Clear data on this device, deleting the account): it belongs to this tab's visit, not to whoever signs in next. */
export function forgetInviteCode(): void {
  keep(null);
}

/** The friend code from an invite link (or the one kept from earlier in this tab), and a function to let go of it once it has been used. */
export function useInviteCode(): [string | null, () => void] {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const fromLink = parseFriendCode(window.location.hash.replace(/^#/, ""));
      if (fromLink) {
        keep(fromLink);
        setCode(fromLink);
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); // out of the address
        return;
      }
      setCode((current) => current ?? stored());
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const clear = useCallback(() => {
    keep(null);
    setCode(null);
  }, []);
  return [code, clear];
}
