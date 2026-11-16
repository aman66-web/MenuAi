import { describe, expect, it } from "vitest";
import { parseEatOutChoices, startingChoices } from "../app/app/eat-out/eatOutChoices";

// Eat out keeps "More ways to find a restaurant", "Full nutrition only" and "Halal" for this browser tab, so Back from a restaurant finds the list as it was.
// What is read back comes from storage: anything that isn't what Eat out wrote is ignored.

describe("Eat out's choices, stored and read back", () => {
  it("round-trips", () => {
    const c = { moreOpen: true, fullOnly: true, halalOnly: false, savedHalal: false };
    expect(parseEatOutChoices(JSON.stringify(c))).toEqual(c);
  });
  it("ignores anything else", () => {
    for (const raw of [null, "", "nonsense", "null", "[]", "42", '{"moreOpen":true}', '{"moreOpen":"yes","fullOnly":false,"halalOnly":false,"savedHalal":false}', '{"moreOpen":1,"fullOnly":0,"halalOnly":0,"savedHalal":0}',
      '{"moreOpen":true,"fullOnly":false,"halalOnly":false}' /* kept before the saved setting was stored with it */]) {
      expect(parseEatOutChoices(raw), String(raw)).toBe(null);
    }
  });
  it("keeps only the four answers", () => {
    expect(parseEatOutChoices('{"moreOpen":false,"fullOnly":true,"halalOnly":true,"savedHalal":true,"type":"pizza"}')).toEqual({ moreOpen: false, fullOnly: true, halalOnly: true, savedHalal: true });
  });
  it("before anything is kept, starts from the saved Halal setting (and opens the row for it); what was kept wins, even an explicit off", () => {
    expect(startingChoices(null, false)).toEqual({ moreOpen: false, fullOnly: false, halalOnly: false });
    expect(startingChoices(null, true)).toEqual({ moreOpen: true, fullOnly: false, halalOnly: true });
    // closed the row with Halal set in Settings, then Back: what was kept wins
    expect(startingChoices({ moreOpen: false, fullOnly: false, halalOnly: false, savedHalal: true }, true)).toEqual({ moreOpen: false, fullOnly: false, halalOnly: false });
  });
  it("a Halal setting changed in Settings since the choices were kept wins again; the other choices stay (review finding 4)", () => {
    // "Full nutrition only" tapped, then Halal turned on in Settings > Diet and allergies: Eat out comes back filtered to halal, the row open
    expect(startingChoices({ moreOpen: true, fullOnly: true, halalOnly: false, savedHalal: false }, true)).toEqual({ moreOpen: true, fullOnly: true, halalOnly: true });
    expect(startingChoices({ moreOpen: false, fullOnly: false, halalOnly: false, savedHalal: false }, true)).toEqual({ moreOpen: true, fullOnly: false, halalOnly: true });
    // and turned off in Settings: the Halal filter goes, the row stays as it was
    expect(startingChoices({ moreOpen: true, fullOnly: false, halalOnly: true, savedHalal: true }, false)).toEqual({ moreOpen: true, fullOnly: false, halalOnly: false });
  });
});
