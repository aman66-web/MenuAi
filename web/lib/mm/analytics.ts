// SPEC §14: anonymous events, no location, no health values, no free text. Only an interface for now:
// events print to the console in development and go nowhere in production until the founder picks a tool.

export type AnalyticsEvent =
  | { name: "onboardingCompleted"; goal: string }
  | { name: "onboardingSkipped"; step: number }
  | { name: "chainOpened"; chainId: string; source: "search" | "favorite" | "popular" | "saved" }
  | { name: "itemOpened"; chainId: string }
  | { name: "menuSorted"; kind: string }
  | { name: "menuFiltered"; kind: string }
  | { name: "bestForYouViewed"; chainId: string; mode: string }
  | { name: "bestForYouPickOpened"; rank: number }
  | { name: "builderOpened"; origin: "item" | "pick" | "saved" }
  | { name: "builderChanged"; kind: "add" | "remove" | "double" | "swap" | "modifier" }
  | { name: "orderSaved" }
  | { name: "mealLogged" }
  | { name: "shareCardCreated" }
  | { name: "paywallShown"; trigger: string }
  | { name: "paywallDismissed"; trigger: string }
  | { name: "numberReported"; chainId: string }
  | { name: "chainRequested" };

export interface Analytics {
  track(event: AnalyticsEvent): void;
}

export const consoleAnalytics: Analytics = {
  track(event) {
    if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event);
  },
};

export const analytics: Analytics = consoleAnalytics;
