import type { Metadata } from "next";
import { InviteLanding } from "./InviteLanding";

// What a person sees when they open a friend invite (founder 2026-10-16: add a friend with a code and an invite link). The friend code is in the part of the address
// after the "#", which never reaches our servers, so this page is the same for everyone and reads the code in the browser. Not for search engines: every link is
// somebody's own code.
export const metadata: Metadata = {
  title: "A friend invited you",
  description: "A friend invited you to Numbite. Open the invite to add them as a friend.",
  robots: { index: false, follow: false },
};

export default function FriendInviteLink() {
  return <InviteLanding />;
}
