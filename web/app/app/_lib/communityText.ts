// Relative imports (not "@/"), so the unit tests can load this file (tests/communityClient.test.ts).
import type { Failure } from "../../../lib/mm/communityClient";
import { MAX_FRIENDS } from "../../../lib/community/limits";
import { USERNAME_MAX, USERNAME_MIN, type UsernameProblem } from "../../../lib/community/username";
import type { T } from "../../../lib/mm/i18n";

// The words for what can go wrong in Community. The server's `message` is an English fallback for logs; the app says it in the person's own language by the
// server's `error` code (and `reason`), so a screen never prints the server's text. One list for every screen, so the same thing is always said the same way.

/** Why a username can't be used (from the check in the app, or the server's `reason`). A reserved or blocked name is only ever "not available": we don't say which, or which word. */
export function usernameProblemText(problem: UsernameProblem | "unavailable", t: T): string {
  switch (problem) {
    case "empty": return t("Type a username.");
    case "too_short": return t("Usernames need at least {min} characters.", { min: USERNAME_MIN });
    case "too_long": return t("Usernames can have at most {max} characters.", { max: USERNAME_MAX });
    case "characters": return t("Use only letters, numbers, dots and underscores.");
    case "edges": return t("A username can't start or end with a dot or an underscore.");
    case "repeats": return t("A username can't have two dots or underscores in a row.");
    default: return t("That username isn't available. Try another.");
  }
}

/** What to tell the person about a failed call. `name` is the friend it was about, where the sentence names one. */
export function failureText(f: Failure, t: T, name = ""): string {
  if (f.offline) return t("You're offline. Connect to the internet and try again.");
  switch (f.error) {
    case "unauthorized": return t("Your sign-in has ended. Please sign in again.");
    case "rate_limited": return t("Too many tries. Please wait a few minutes and try again.");
    case "daily_limit": return t("You've reached today's limit. Try again tomorrow.");
    case "cannot_accept": return t("We couldn't accept that request. Try again later.");
    case "cannot_add": return t("We couldn't add that code. Check it and try again.");
    case "no_username": return t("Choose a username first.");
    case "request_limit": return t("You have too many requests waiting for an answer. Take some back, or wait for them to be answered.");
    case "friend_limit": return t("The limit of {n} friends has been reached.", { n: MAX_FRIENDS });
    case "not_found": return t("We couldn't find that. It may have been removed.");
    case "inbox_full": return t("{name} has too many lists waiting to be opened. Try again later.", { name });
    case "username_taken": return t("That username is taken. Try another.");
    case "username_set": return t("You have already chosen a username.");
    case "invalid_username": return usernameProblemText((f.reason as UsernameProblem | undefined) ?? "unavailable", t);
    case "invalid_list":
      if (f.reason === "empty") return t("Your list has nothing to send.");
      if (f.reason === "too_large") return t("Your list is too long to send. Take some items off and try again.");
      if (f.reason === "unsuitable") return t("Your list has words that can't be sent. Check the items you typed in.");
      return t("Something went wrong. Please try again.");
    default: return t("Something went wrong. Please try again.");
  }
}
