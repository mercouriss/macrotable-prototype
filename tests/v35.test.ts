import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { executeTool } from "../src/agent/tools";
import type { AgentSessionState } from "../src/agent/types";
import { catalog, MENU_RESTAURANTS, RESTAURANTS, setStudyScope, STUDY_RESTAURANT_IDS, STUDY_RESTAURANTS } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { runSearch } from "../src/lib/optimizer";

const A = SCENARIOS.A;
const newAgentState = (): AgentSessionState => ({ messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] });
const ctx = () => ({ target: { ...A.target }, prefs: { ...A.preferences }, state: newAgentState() });

afterEach(() => setStudyScope(false));

describe("V3.5 dataset", () => {
  it("has 5–8 fictional demo brands with original monograms, and ≥15 real unaffiliated restaurants", () => {
    const demo = RESTAURANTS.filter((r) => r.identity === "demo");
    const real = RESTAURANTS.filter((r) => r.identity === "real");
    expect(demo.length).toBeGreaterThanOrEqual(5);
    expect(demo.length).toBeLessThanOrEqual(8);
    expect(real.length).toBeGreaterThanOrEqual(15);
    for (const r of demo) expect(r.brand?.mark).toBeTruthy();
    // Integration depth stays mixed — not everything is Level 3.
    expect(new Set(demo.map((r) => r.integrationLevel))).toEqual(new Set([1, 2, 3]));
    expect(MENU_RESTAURANTS.every((r) => r.identity === "demo")).toBe(true);
  });
});

describe("frozen study dataset", () => {
  it("is exactly the three calibrated brands", () => {
    expect(STUDY_RESTAURANTS.map((r) => r.id)).toEqual(["fitkitchen", "urbanbowl", "localgrill"]);
    expect([...STUDY_RESTAURANT_IDS]).toEqual(["fitkitchen", "urbanbowl", "localgrill"]);
  });

  it("scopes the catalog, optimizer and agent tools while a trial runs", () => {
    setStudyScope(true);
    expect(catalog().map((r) => r.id)).toEqual(["fitkitchen", "urbanbowl", "localgrill"]);
    expect(runSearch(A.target, A.preferences).stats.restaurants).toBe(3);
    const stores = executeTool("listNearbyStores", {}, ctx());
    expect((stores.result as { stores: { restaurantId: string }[] }).stores.map((s) => s.restaurantId).sort()).toEqual(["fitkitchen", "localgrill", "urbanbowl"]);
    // A public-only brand can't be reached through the agent during a trial.
    expect(executeTool("getMenu", { restaurantId: "pastametrica" }, ctx()).ok).toBe(false);
    expect(executeTool("optimizeMeal", { mealId: "pm-turkey-bolognese" }, ctx()).ok).toBe(false);
  });

  it("the public product sees every brand, and Scenario A's canonical pick is unchanged", () => {
    expect(catalog()).toBe(RESTAURANTS);
    const r = runSearch(A.target, A.preferences);
    expect(r.stats.restaurants).toBe(MENU_RESTAURANTS.length);
    expect(r.ranked[0].meal.id).toBe("fk-chicken-power-bowl");
    expect(r.ranked[0].nutrition).toEqual({ calories: 682, protein: 49, carbs: 72, fat: 20 });
  });

  it("the impossible Scenario D stays infeasible with every public brand too (no invented solution)", () => {
    const D = SCENARIOS.D;
    const r = runSearch(D.target, D.preferences);
    expect(r.anyMeetsTarget).toBe(false);
    expect(r.closest).toBeDefined();
  });

  it("the baseline and research dashboard read the study dataset, never the public one", () => {
    for (const f of ["src/baseline/Baseline.tsx", "src/screens/Research.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toMatch(/STUDY_RESTAURANTS/);
      expect(src).not.toMatch(/\bMENU_RESTAURANTS\b|\bcatalog\(\)/);
    }
  });

  it("the agent's store list stays small: demo stores plus the three nearest real ones", () => {
    const run = executeTool("listNearbyStores", {}, ctx());
    const res = run.result as { stores: { identity: string }[]; otherRealRestaurantsNearby: number };
    expect(res.stores.filter((s) => s.identity === "real")).toHaveLength(3);
    expect(res.otherRealRestaurantsNearby).toBe(RESTAURANTS.filter((r) => r.identity === "real").length - 3);
  });
});

describe("saved meals", () => {
  it("toggle an exact configuration on and off, stored only locally", async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const { getSaved, isSaved, toggleSaved, clearSaved, SAVED_KEY } = await import("../src/lib/saved");
    const sel = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" };
    expect(toggleSaved("fk-chicken-power-bowl", sel)).toBe(true);
    expect(isSaved("fk-chicken-power-bowl", { veg: "veg-double", sauce: "sauce-light", rice: "rice-half", chicken: "chicken-50" })).toBe(true);
    expect(isSaved("fk-chicken-power-bowl", { ...sel, rice: "rice-std" })).toBe(false);
    expect(JSON.parse(store.get(SAVED_KEY)!)).toHaveLength(1);
    expect(toggleSaved("fk-chicken-power-bowl", sel)).toBe(false);
    expect(getSaved()).toHaveLength(0);
    toggleSaved("fk-chicken-power-bowl", sel);
    clearSaved();
    expect(getSaved()).toHaveLength(0);
  });
});
