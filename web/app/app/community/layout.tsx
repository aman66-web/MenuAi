"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { COMMUNITY_ENABLED } from "@/lib/mm/config";
import { Spinner } from "../_components/ui";

// Community is switched off (lib/mm/config.ts COMMUNITY_ENABLED, founder 2026-11-18): every Community page, including an old friend-invite link, opens Home instead.
// Its pages and data stay, so switching it back on is the whole change.
function ForwardHome() {
  const router = useRouter();
  useEffect(() => { router.replace("/app"); }, [router]);
  return <Spinner />;
}

export default function CommunityLayout({ children }: { children: ReactNode }) {
  if (!COMMUNITY_ENABLED) return <ForwardHome />;
  return <>{children}</>;
}
