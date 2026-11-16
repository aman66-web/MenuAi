import { describe, expect, it } from "vitest";
import { splitStep, stepTime } from "../lib/mm/recipeSteps";

describe("recipe steps", () => {
  it("splits a titled step and leaves an untitled one whole", () => {
    expect(splitStep("Soften the onion: Cook the onion for 5 minutes, until soft.")).toEqual({ title: "Soften the onion", text: "Cook the onion for 5 minutes, until soft." });
    expect(splitStep("Serve: Spoon it into bowls.")).toEqual({ title: "Serve", text: "Spoon it into bowls." });
    // an old step with no title, a colon after a long sentence, a number before the colon, too many words
    expect(splitStep("Cook the rice for 10 minutes.")).toEqual({ text: "Cook the rice for 10 minutes." });
    expect(splitStep("Heat 2 tablespoons: Add the oil.")).toEqual({ text: "Heat 2 tablespoons: Add the oil." });
    expect(splitStep("Put the pan on a medium heat and then wait: Add oil.")).toEqual({ text: "Put the pan on a medium heat and then wait: Add oil." });
    expect(splitStep("cook the pasta: Boil it.")).toEqual({ text: "cook the pasta: Boil it." });
  });

  it("finds the first time a step names", () => {
    expect(stepTime("Cook for 5 minutes, until soft.")).toBe("5 min");
    expect(stepTime("Bake for 25 to 30 minutes, until golden.")).toBe("25–30 min");
    expect(stepTime("Simmer for 8-10 mins.")).toBe("8–10 min");
    expect(stepTime("Stir for 30 seconds.")).toBe("30 sec");
    expect(stepTime("Chill for 2 hours.")).toBe("2 hr");
    expect(stepTime("Leave in the fridge overnight.")).toBe("Overnight");
    expect(stepTime("Cook for a minute, then serve.")).toBeNull();
    expect(stepTime("Spoon into bowls and serve.")).toBeNull();
    // a lead time is not the step's own time
    expect(stepTime("About 12 minutes before the sauce is ready, add the pasta and cook for 10 minutes.")).toBe("10 min");
    expect(stepTime("About 12 minutes before the sauce is ready, add the pasta.")).toBeNull();
  });
});
