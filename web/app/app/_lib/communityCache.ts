"use client";

import { createStore } from "@/lib/mm/persist";
import { sanitiseCache, type CommunityCache } from "@/lib/mm/communityCache";

// The copy of Community kept on this device for showing it offline (lib/mm/communityCache.ts has the rules). A store of its own, in a module of its own,
// so account.ts can clear it when someone signs out, deletes the account or clears the device without importing the screens' code (which imports account.ts).
// Never synced: it is not in SYNC_STORES and not handed to the sync engine.
export const communityCacheStore = createStore<CommunityCache | null>("mm.v1.community", null, { sanitize: sanitiseCache });
