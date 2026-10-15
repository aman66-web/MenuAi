import type { Metadata } from "next";
import { SharedLanding } from "./SharedLanding";

// What a friend sees when they open a shopping list link (founder 2026-10-15: "they get a link saying to download the app to view their shopping list"). The list
// is in the part of the address after the "#", which never reaches our servers, so this page is the same for everyone and reads the list in the browser.
// Not for search engines: every link is somebody's own list.
export const metadata: Metadata = {
  title: "A shopping list for you",
  description: "A friend shared a shopping list with you. Open it in Numbite to see the products and prices.",
  robots: { index: false, follow: false },
};

export default function SharedListLink() {
  return <SharedLanding />;
}
