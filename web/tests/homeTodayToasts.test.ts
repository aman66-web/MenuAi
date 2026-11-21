import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The 30-person meeting's fixes for Home, Today, My meals and the toasts (21 November 2026). These screens have no DOM in the unit tests, so the tests read the
// code for the piece that fixes each finding (as coach.test.ts does for the marks Pip's tips look for).

const read = (p: string) => readFileSync(p, "utf8");

describe("the toast's Undo focus (Femi and Sam)", () => {
  const toast = () => read("app/app/_components/Toast.tsx");
  it("our own move of the focus to Undo doesn't hold the toast, so Today's 'Removed …' still closes by itself", () => {
    const src = toast();
    expect(src).toContain("const autoFocused = useRef(false);");
    expect(src).toMatch(/autoFocused\.current = true;\s*undo\.focus\(\{ preventScroll: true \}\);/);
    expect(src).toMatch(/if \(autoFocused\.current\) \{\s*autoFocused\.current = false;\s*return;\s*\}\s*setHeld\(true\);/);
    expect(src).not.toContain("onFocus={() => setHeld(true)}");
  });
  it("a toast that goes with the focus inside hands it to the page's heading, never the bare page, and only if the screen hasn't moved it", () => {
    const src = toast();
    // read before the host is removed (after, the focus has already fallen to the page)
    expect(src).toMatch(/const hadFocus = el\.contains\(document\.activeElement\);\s*el\.remove\(\);/);
    expect(src).toContain("if (hadFocus) window.setTimeout(focusPage, 50);");
    expect(src).toContain('document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("main")');
    expect(src).toContain("if (now && now !== document.body && now.isConnected) return;");
  });
  it("removing a saved order or a recipe from My meals moves the focus to Undo, as Today's Remove does", () => {
    expect(read("app/app/meals/RestaurantMeals.tsx")).toMatch(/<Toast key=\{undo\.id\} duration=\{10000\} focusUndo /);
    expect(read("app/app/meals/MyRecipes.tsx")).toMatch(/<Toast key=\{`\$\{undo\.kind\}:\$\{undo\.entry\.id\}`\} duration=\{UNDO_MS\} focusUndo /);
    expect(read("app/app/today/page.tsx")).toMatch(/duration=\{10000\}\s*focusUndo/);
  });
});

describe("the day page's focus after a change (Femi)", () => {
  it("falls back to another meal's heading, then the day's title, when the meal it was in has gone from a day gone by", () => {
    expect(read("app/app/today/page.tsx")).toContain(
      "(change ?? document.getElementById(`today-${focus.meal}`) ?? document.querySelector<HTMLElement>(\"main h2[id^='today-']\") ?? document.querySelector<HTMLElement>(\"main h1 button\"))?.focus();",
    );
  });
});

describe("Home's week page and its pages (Ella and Femi)", () => {
  it("says a food doesn't 'list' protein, never that it wasn't 'entered' (a restaurant may publish calories only)", () => {
    const src = read("app/app/_components/HomeWeek.tsx");
    expect(src).toContain('t("Some foods this week don\'t list protein, so protein counts only the foods that do.")');
    expect(src).not.toContain("no protein entered");
  });
  it("the swipe hint sits above the dots row and the scroller, so its whole height can be tapped", () => {
    const src = read("app/app/_components/HomePages.tsx");
    expect(src).toContain('className="relative z-10 mx-auto mt-2 block min-h-11');
    expect(src).not.toContain("mx-auto -mt-1 block");
  });
  it("the stacked-or-sliding check is set up again after each switch, so it always watches the element on the page", () => {
    expect(read("app/app/_components/HomePages.tsx")).toMatch(/ro\.observe\(el\);\s*return \(\) => ro\.disconnect\(\);\s*\}, \[column\]\);/);
  });
});
