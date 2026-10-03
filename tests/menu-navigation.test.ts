import { createElement as h, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStateProvider } from "../src/agent/agentState";
import type { AgentCard } from "../src/agent/types";
import { displayOrder, FullScannedMenu } from "../src/components/agent/AgentCards";
import { SheetProvider } from "../src/components/Sheet";
import { getMeal, getRestaurant, RESTAURANTS, setStudyScope } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { menuState, readFromRecommendation, readRestore, restaurantMenuPath } from "../src/lib/menuNav";
import { computeConfiguration, defaultSelections } from "../src/lib/nutrition";
import { optimizeMeal, runSearch } from "../src/lib/optimizer";
import { simulatedExtraction } from "../src/scan/menuExtraction";
import { Home } from "../src/screens/Home";
import { MealDetail } from "../src/screens/MealDetail";
import { RestaurantPage } from "../src/screens/RestaurantPage";
import { Results } from "../src/screens/Results";
import { AppStateProvider, loadSettings, serializeSettings } from "../src/state/AppState";

/*
 * Recommendation → full menu → back (normal mode), the structured full menu, and the scanned-menu
 * hierarchy. Research trials must render exactly as before (no new links, no new menu layout).
 */

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  writeJSON(STORAGE_KEYS.settings, serializeSettings({ ...loadSettings(null), onboardingDone: true }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setStudyScope(false);
});

const A = SCENARIOS.A;
const page = (path: string, pattern: string, el: ReactElement, state?: unknown) =>
  renderToString(
    h(MemoryRouter, { initialEntries: [{ pathname: path, state }] }, h(AppStateProvider, null, h(AgentStateProvider, null, h(SheetProvider, null, h(Routes, null, h(Route, { path: pattern, element: el })))))),
  );
const restaurantPage = (id: string, state?: unknown) => page(`/macrotable/explore/${id}`, "/macrotable/explore/:restaurantId", h(RestaurantPage), state);
const mealPage = (id: string, state?: unknown) => page(`/macrotable/meal/${id}`, "/macrotable/meal/:mealId", h(MealDetail), state);
const startTrial = () =>
  writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: A.target, prefs: A.preferences, selection: null, lock: { participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "auto", sessionId: "s1", startedAt: 0 } });
const decode = (html: string) => html.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/<!-- -->/g, "");
const rows = (html: string, attr: string) => html.split(`${attr}="`).slice(1);

// A deliberately NON-optimizer configuration of the hero bowl: proves values come from the passed selection.
const bowl = getMeal("fk-chicken-power-bowl")!.meal;
const custom = { ...defaultSelections(bowl) };
const customConfig = computeConfiguration(bowl, custom);
const optimizer = optimizeMeal(bowl, getRestaurant("fitkitchen")!, A.target, A.preferences).best!;

describe("recommendation → restaurant menu", () => {
  it("1. the restaurant name/logo on each recommendation card links to THAT restaurant's menu (Home + Results)", () => {
    const home = decode(page("/macrotable", "/macrotable", h(Home)));
    const nearby = runSearch(A.target, A.preferences).recommendations;
    expect(nearby.length).toBeGreaterThan(0);
    const link = (html: string, name: string) => html.split(`aria-label="${name}: view full menu"`)[1]?.split(">")[0] ?? "";
    for (const c of nearby) expect(link(home, c.restaurant.name)).toContain(`href="${restaurantMenuPath(c.restaurant.id)}"`);
    expect(home).toContain("Menu");
    const results = decode(page("/macrotable/results", "/macrotable/results", h(Results)));
    for (const c of nearby) expect(link(results, c.restaurant.name)).toContain(`href="${restaurantMenuPath(c.restaurant.id)}"`);
  });

  it("2. the recommendation screen has an explicit 'View full menu' action for its restaurant", () => {
    const html = decode(mealPage("fk-chicken-power-bowl"));
    expect(html).toContain("View full menu");
    expect(html).toContain(`aria-label="View FitKitchen's full menu"`);
    expect(restaurantMenuPath(getMeal("fk-chicken-power-bowl")!.restaurant.id)).toBe("/macrotable/explore/fitkitchen");
  });

  it("3. the menu pins the exact recommendation it was opened from (not recomputed)", () => {
    expect(customConfig.nutrition.calories).not.toBe(optimizer.nutrition.calories); // the test is meaningful
    const html = decode(restaurantPage("fitkitchen", menuState("meal", bowl.id, custom)));
    const rec = html.split('data-section="recommended-for-you"')[1].split("</section>")[0];
    expect(rec).toContain("Recommended for you");
    expect(rec).toContain(bowl.name);
    const n = customConfig.nutrition;
    expect(rec).toContain(`${n.calories} kcal · ${n.protein} g protein · ${n.carbs} g carbs · ${n.fat} g fat`);
    expect(rec).toContain(`€${customConfig.price.toFixed(2)}`);
    expect(rec).toContain("Back to this recommendation");
    // A context for another restaurant's dish, or unsupported selections, is ignored.
    expect(readFromRecommendation(menuState("meal", bowl.id, custom), "urbanbowl")).toBeNull();
    expect(readFromRecommendation(menuState("meal", bowl.id, { rice: "no-such-option" }), "fitkitchen")).toBeNull();
  });

  it("4. Back to the recommendation restores the exact selection saved in its history entry", () => {
    const restore = { selection: { mealId: bowl.id, selections: custom, recommended: optimizer.selections }, scrollTop: 240 };
    const html = decode(mealPage(bowl.id, { restore }));
    expect(html).toContain(`${customConfig.nutrition.calories} kcal`);
    expect(html).not.toContain(`${optimizer.nutrition.calories} kcal`);
    expect(readRestore({ restore }, "fk-tofu-tahini")).toBeNull(); // only for the same dish
    // Without a saved entry the screen shows the optimizer's configuration as before.
    expect(decode(mealPage(bowl.id))).toContain(`${optimizer.nutrition.calories} kcal`);
  });

  it("5. opened directly (Explore), the page has no pinned recommendation and its Back falls back to Explore", () => {
    const html = decode(restaurantPage("fitkitchen"));
    expect(html).not.toContain("Recommended for you");
    expect(html).toContain("Best for you here");
    expect(html).toContain('aria-label="Back"');
  });
});

describe("full menu structure", () => {
  const demo = RESTAURANTS.filter((r) => r.identity === "demo");

  it("6. renders every dish of every demo restaurant with one row structure", () => {
    for (const r of demo) {
      const html = decode(restaurantPage(r.id));
      expect(html).toContain(`Full menu · ${r.meals.length} dishes`);
      expect(rows(html, "data-menu-item").map((x) => x.split('"')[0])).toEqual(r.meals.map((m) => m.id));
    }
  });

  it("7. missing nutrition is never fabricated", () => {
    const soup = decode(restaurantPage("tinplate")).split('data-menu-item="td-soup-of-the-day"')[1].split("</li>")[0];
    expect(soup).toContain("Nutrition unavailable");
    expect(soup).not.toMatch(/kcal|g protein|INSUFFICIENT|VERIFIED/);
  });

  it("8. provenance stays visible and matches the data; estimates carry ≈", () => {
    for (const r of demo) {
      const html = decode(restaurantPage(r.id));
      for (const m of r.meals.filter((x) => x.nutrition && x.available)) {
        const row = html.split(`data-menu-item="${m.id}"`)[1].split("</li>")[0];
        expect(row, m.id).toContain({ verified: "VERIFIED", official: "OFFICIAL", estimated: "ESTIMATED" }[m.provenance as "verified"]);
        expect(row.includes("≈"), m.id).toBe(m.provenance === "estimated");
        expect(row).toContain(`${m.nutrition!.carbs} g carbs · `);
      }
    }
  });
});

describe("scanned menu: best match first, then every dish read", () => {
  const menu = simulatedExtraction("scan-1", 0);
  const scanned = (best?: { id: string; meets: boolean }) => decode(renderToString(h(AppStateProvider, null, h(SheetProvider, null, h(FullScannedMenu, { menu, best })))));
  const item = (html: string, name: string) => rows(html, "data-scan-item").find((x) => x.includes(`>${name}`))!;

  it("9. the recommendation card comes before the scanned menu (normal mode only)", () => {
    const cards: AgentCard[] = [{ kind: "scan", scanId: "scan-1" }, { kind: "recommendation", rec: {} as never }];
    expect(displayOrder(cards, false).map((x) => [x.c.kind, x.i])).toEqual([["recommendation", 1], ["scan", 0]]); // original index kept
    expect(displayOrder(cards, true).map((x) => x.c.kind)).toEqual(["scan", "recommendation"]); // trial: frozen order
  });

  it("10. every successfully extracted dish is listed, the best one tagged", () => {
    const html = scanned({ id: "scan:i0", meets: true });
    expect(html).toContain(`Full scanned menu · ${menu.items.length} dishes`);
    expect(rows(html, "data-scan-item")).toHaveLength(menu.items.length);
    for (const i of menu.items) expect(html).toContain(i.name);
    expect(item(html, "Grilled Chicken Wrap")).toContain("BEST MATCH");
    expect(html.match(/BEST MATCH/g)).toHaveLength(1);
    // A recommended dish that misses the target is tagged like the recommendation card says: closest, not a match.
    const closest = scanned({ id: "scan:i0", meets: false });
    expect(item(closest, "Grilled Chicken Wrap")).toContain("CLOSEST OPTION");
    expect(closest).not.toContain("BEST MATCH");
  });

  it("11. estimated nutrition is labelled ESTIMATED and marked ≈ field by field", () => {
    const html = scanned();
    const tuna = item(html, "Tuna Salad Bowl");
    expect(tuna).toContain("ESTIMATED");
    expect(tuna).toContain("≈ 540 kcal · ≈ 38 g protein");
    const falafel = item(html, "Falafel Plate"); // calories printed, the rest estimated
    expect(falafel).toContain("ESTIMATED");
    expect(falafel).toContain("720 kcal · ≈ 24 g protein · ≈ 80 g carbs · ≈ 32 g fat");
    expect(falafel).not.toContain("≈ 720");
    const wrap = item(html, "Grilled Chicken Wrap"); // all four printed
    expect(wrap).toContain("MENU-READ");
    expect(wrap).not.toContain("≈");
  });

  it("12. insufficient nutrition is shown as unavailable, never as verified", () => {
    const html = scanned();
    const soup = item(html, "Soup of the Day");
    expect(soup).toContain("Nutrition unavailable");
    expect(soup).toContain("INSUFFICIENT");
    expect(soup).not.toMatch(/kcal/);
    expect(html).not.toMatch(/VERIFIED|OFFICIAL/);
  });
});

describe("13. research treatment unchanged (trial = frozen layout, no new navigation)", () => {
  it("restaurant page, recommendation screen, Home and Results render the frozen versions during a trial", () => {
    startTrial();
    setStudyScope(true);
    const r = decode(restaurantPage("fitkitchen", menuState("meal", bowl.id, custom)));
    expect(r).toContain(">Menu<");
    expect(r).not.toMatch(/Full menu|Recommended for you|g carbs|data-menu-item/);
    expect(decode(mealPage(bowl.id))).not.toContain("View full menu");
    const home = decode(page("/macrotable", "/macrotable", h(Home)));
    expect(home).toContain("Good options nearby");
    expect(home).not.toContain("view full menu");
    expect(decode(page("/macrotable/results", "/macrotable/results", h(Results)))).not.toContain("view full menu");
  });
});
