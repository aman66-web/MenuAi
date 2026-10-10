import { NumbersContent } from "./NumbersContent";

// SPEC §12.3 — static copy, word for word with {appName} filled in (NumbersContent, so it follows the chosen language).
export const metadata = { title: "How we get our numbers" };

export default function NumbersPage() {
  return <NumbersContent />;
}
