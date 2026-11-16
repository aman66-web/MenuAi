// Where the extra numbers on a dish's Truth card, in Quick answers and in Cheapest protein come from (App Review 1.4.1: citations for health information,
// easy to find). This file adds NO source and NO number: it only gathers the sources the Truth card already links to (each opened and read on 13 November
// 2026, see the file each one is defined in) so one screen can list them, and the screen reads every figure from the same constants the features use.

import { FSA_SOURCE } from "./fsaLights";
import { HOUSEHOLD_SOURCES } from "./household";
import { REFERENCE_INTAKE_SOURCE } from "./referenceIntake";

export interface MenuSource {
  id: "reference-intakes" | "fsa-front-of-pack" | "nhs-sugar" | "butter-fat" | "egg-protein";
  citation: string;
  url: string;
  checkedOn: string;
}

export const MENU_SOURCES: readonly MenuSource[] = [
  { id: "reference-intakes", ...REFERENCE_INTAKE_SOURCE },
  { id: "fsa-front-of-pack", ...FSA_SOURCE },
  { id: "nhs-sugar", ...HOUSEHOLD_SOURCES.sugar },
  { id: "butter-fat", ...HOUSEHOLD_SOURCES.fat },
  { id: "egg-protein", ...HOUSEHOLD_SOURCES.protein },
];

/** The only hosts a menu source may point to (a test fails any other). */
export const MENU_SOURCE_HOSTS: readonly string[] = [
  "www.legislation.gov.uk",
  "assets.publishing.service.gov.uk",
  "www.nhs.uk",
  "patient.info",
  "www.egginfo.co.uk",
];

/** The day the sources were read: the latest of their own dates (all 13 November 2026 today). */
export const MENU_SOURCES_CHECKED: string = MENU_SOURCES.map((s) => s.checkedOn).sort().at(-1) ?? "2026-11-13";

export const menuSource = (id: MenuSource["id"]): MenuSource => {
  const s = MENU_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown menu source ${id}`);
  return s;
};
