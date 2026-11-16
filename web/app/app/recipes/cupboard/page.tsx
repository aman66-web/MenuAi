"use client";

import { pickableKinds } from "@/lib/mm/cupboard";
import { cupboardItemsStore } from "@/lib/mm/stores";
import { useMemo } from "react";
import { PotIcon } from "../../_components/icons";
import { PipSays } from "../../_components/Mascot";
import { useHydrated, useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { BackLink, TITLE } from "../../groceries/PageBits";
import { CupboardPicker } from "./CupboardPicker";
import { CupboardResults } from "./CupboardResults";

// "Cook from my cupboard" (founder 2026-11-16: "the person can put what stuff they have in the cupboard and a rough amount of what they have and it will craft
// a really good recipe"). Version 1, all on the device and no AI: pick what you have, say roughly how much, and the recipe book is ranked by how much of each
// recipe that covers, for the number of people it feeds. What is in the cupboard is kept on this device only (never synced, never sent) and Clear data removes it.
export default function CupboardPage() {
  const t = useT();
  const hydrated = useHydrated();
  const items = useStore(cupboardItemsStore);
  const diet = useSettings().preferences;
  const dietKey = JSON.stringify(diet);
  const kinds = useMemo(() => pickableKinds(JSON.parse(dietKey)), [dietKey]);
  return (
    <div>
      <BackLink href="/app/recipes" label={t("Back to recipes")} />
      <h1 className={`mt-5 ${TITLE}`}>{t("Cook from my cupboard")}</h1>
      <div className="mt-5"><PipSays mood="point" size={72}>{t("Tell me what you have and roughly how much. I'll find recipes that use it.")}</PipSays></div>
      {!hydrated ? null : (
        <>
          <CupboardPicker items={items} kinds={kinds} />
          <CupboardResults items={items} icon={<PotIcon className="h-7 w-7" />} />
        </>
      )}
    </div>
  );
}
