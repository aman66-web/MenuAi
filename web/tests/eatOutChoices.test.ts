import { describe, expect, it } from "vitest";
import { parseEatOutChoices, startingChoices } from "../app/app/eat-out/eatOutChoices";

// Eat out keeps "More ways to find a restaurant", "Full nutrition only" and "Halal" for this browser tab, so Back from a restaurant finds the list as it was.
// What is read back comes from storage: anything that isn't what Eat out wrote is ignored.

describe("Eat out's choices, stored and read back", () => {
  it("round-trips", () => {
    const c = { moreOpen: true, fullOnly: true, halalOnly: false };
    expect(parseEatOutChoices(JSON.stringify(c))).toEqual(c);
  });
  it("ignores anything else", () => {
    for (const raw of [null, "", "nonsense", "null", "[]", "42", '{"moreOpen":true}', '{"moreOpen":"yes","fullOnly":false,"halalOnly":false}', '{"moreOpen":1,"fullOnly":0,"halalOnly":0}']) {
      expect(parseEatOutChoices(raw), String(raw)).toBe(null);
    }
  });
  it("keeps only the three answers", () => {
    expect(parseEatOutChoices('{"moreOpen":false,"fullOnly":true,"halalOnly":true,"type":"pizza"}')).toEqual({ moreOpen: false, fullOnly: true, halalOnly: true });
  });
  it("before anything is kept, starts from the saved Halal setting (and opens the row for it); what was kept wins, even an explicit off", () => {
    expect(startingChoices(null, false)).toEqual({ moreOpen: false, fullOnly: false, halalOnly: false });
    expect(startingChoices(null, true)).toEqual({ moreOpen: true, fullOnly: false, halalOnly: true });
    expect(startingChoices({ moreOpen: false, fullOnly: false, halalOnly: false }, true)).toEqual({ moreOpen: false, fullOnly: false, halalOnly: false }); // closed the row, then Back
  });
});
