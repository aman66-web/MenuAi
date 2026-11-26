"use client";

import { aiConsentStore } from "@/lib/mm/aiConsent";
import { forgetInstallId } from "@/lib/mm/analytics";
import {
  clearReminders, coachStore, comparePicksStore, compareStore, cupboardStore, earlierPlansStore, favoritesStore, homePagesStore, householdStore, logStore, mealPlanStore,
  myRecipesStore, outbox, pipChatStore, ratingStore, recentStore, savedRecipesStore, savedStore, settingsStore, shoppingStore, stepsStore, tourStore, waterStore,
} from "@/lib/mm/stores";
import { nativeSteps } from "@/lib/mm/native";
import { DEFAULT_SETTINGS } from "@/lib/mm/user-data";
import { forgetAccountAccess } from "@/lib/payments/accountAccess";
import { leaveForClearing } from "./account";
import { clearRecipePhotos } from "./recipePhotos";
import { forgetTabs } from "./tabMemoryStore";

// Settings › "Clear data on this device": everything this device keeps about the person, in one place, so nothing new is missed. tests/clearData.test.ts reads
// this file and fails if a store in lib/mm or app/app (a createStore("mm.v1.…") key) is in none of the three lists below: CLEARED, LEFT_WITH_THE_ACCOUNT
// or KEPT_ON_CLEAR. A new store is added to one of them on purpose.

/** Emptied by leaveForClearing (app/_lib/account.ts), which runs first: the account on this device, the iPhone app's session, the link to the account's
 *  synced copy (forgotten even when signed out, or signing in again would take the emptied stores for deletions) and the copy of Community. */
export const LEFT_WITH_THE_ACCOUNT = ["mm.v1.account", "mm.v1.session", "mm.v1.syncMeta", "mm.v1.community"] as const;

/** Kept on purpose: they are not the person's own data. */
export const KEPT_ON_CLEAR = {
  "mm.v1.paid": "Premium the person has bought (an App Store subscription is Apple's; Restore purchases would bring it back anyway)",
  "mm.v1.trialOffer": "whether the free-trial offer was already shown",
  "mm.v1.truthDay": "today's free Truth cards (clearing must not give more)",
  "mm.v1.hiddenLogos": "logos taken down at their owners' request",
  "mm.v1.appSwitches": "the remote switches from numbite.com",
} as const;

/** Every other store, and how it is emptied. */
const CLEARED: Record<string, () => void> = {
  // the text size stays as it is (a person who needs large text shouldn't lose it)
  "mm.v1.settings": () => {
    const keepSize = settingsStore.get().textSize;
    settingsStore.set({ ...DEFAULT_SETTINGS, ...(keepSize ? { textSize: keepSize } : {}) });
  },
  "mm.v1.tour": () => tourStore.reset(),
  "mm.v1.coach": () => coachStore.reset(),
  "mm.v1.homePages": () => homePagesStore.reset(),
  "mm.v1.saved": () => savedStore.reset(),
  "mm.v1.log": () => logStore.reset(),
  "mm.v1.water": () => waterStore.reset(),
  // step counting off again (on Android the phone also stops recording steps for Numbite); the steps themselves were never stored
  "mm.v1.steps": () => {
    const wasOn = stepsStore.get().on;
    stepsStore.reset();
    if (wasOn) void nativeSteps.stop();
  },
  "mm.v1.reminders": () => clearReminders(),
  "mm.v1.favorites": () => favoritesStore.reset(),
  "mm.v1.shopping": () => shoppingStore.reset(),
  "mm.v1.mealPlan": () => mealPlanStore.reset(),
  "mm.v1.earlierPlans": () => earlierPlansStore.reset(),
  "mm.v1.household": () => householdStore.reset(),
  "mm.v1.myRecipes": () => {
    myRecipesStore.reset();
    void clearRecipePhotos(); // the photos of Pip's recipes, kept in IndexedDB
  },
  "mm.v1.savedRecipes": () => savedRecipesStore.reset(),
  "mm.v1.cupboard": () => cupboardStore.reset(),
  "mm.v1.recentItems": () => recentStore.reset(),
  "mm.v1.compare": () => compareStore.reset(),
  "mm.v1.comparePicks": () => comparePicksStore.reset(),
  "mm.v1.pipChat": () => pipChatStore.reset(), // Ask Pip's conversation
  "mm.v1.rating": () => ratingStore.reset(),
  "mm.v1.aiOk": () => aiConsentStore.reset(), // the permission for Pip's AI features: asked again
  "mm.v1.outbox": () => outbox().clear(), // messages not sent yet (and a report's photo)
  "mm.v1.installId": () => forgetInstallId(),
  "mm.v1.recentSearches": () => localStorage.removeItem("mm.v1.recentSearches"),
  "mm.v1.mapArea": () => localStorage.removeItem("mm.v1.mapArea"), // the area typed for Near me
  "mm.v1.welcomeProgress": () => localStorage.removeItem("mm.v1.welcomeProgress"),
  "mm.v1.freeWeek": () => forgetAccountAccess(), // the account's free week or gift (and its token; a bought one stays in mm.v1.paid)
};

/** This tab's own notes (session storage): where browsing was, a list just added from a link, an order half built in the order builder (BuilderScreen.tsx). */
const TAB_NOTES = ["mm.browseType", "mm.finder", "mm.sharedAdded", "mm.welcomeSignIn", "mm.signInHash", "mm.builderDraft"];

/** Empty this device: leave the account here first (the synced copy stays in the account), then every store. It never throws. */
export async function clearDeviceData(): Promise<void> {
  await leaveForClearing().catch(() => undefined); // offline: the account is still left on this device
  for (const clear of Object.values(CLEARED)) {
    try {
      clear();
    } catch {
      // storage blocked: the rest are still cleared
    }
  }
  for (const key of TAB_NOTES) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // storage blocked
    }
  }
  // where each tab was (Dina, the 30-person meeting, 21 November 2026: the tabs reopened pages whose data had just been cleared)
  try {
    forgetTabs();
  } catch {
    // a listener failed: the rest is cleared
  }
}
