import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_MEALS, DEMO_MEAL_ID, RESTAURANTS } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { withinBudget } from "../src/lib/feasibility";
import { explainConfiguration, runSearch } from "../src/lib/optimizer";
import { validateTargetField } from "../src/lib/validation";
import type { Restaurant } from "../src/types";

const A = SCENARIOS.A;

describe("hard budget filtering", () => {
  it("never returns a configuration above the budget, at any budget", () => {
    for (const maxBudget of [11, 13.5, 15, 16.49, 16.5, 18, 20]) {
      const r = runSearch({ ...A.target, maxBudget }, A.preferences);
      for (const c of r.ranked) expect(withinBudget(c.price, { maxBudget })).toBe(true);
    }
  });

  it("drops the canonical €16.50 bowl just below its price, keeps it at exactly €16.50", () => {
    const below = runSearch({ ...A.target, maxBudget: 16.49 }, A.preferences).ranked.find((c) => c.meal.id === DEMO_MEAL_ID);
    expect(below?.price ?? 0).toBeLessThanOrEqual(16.49);
    const at = runSearch({ ...A.target, maxBudget: 16.5 }, A.preferences).ranked[0];
    expect(at.meal.id).toBe(DEMO_MEAL_ID);
    expect(at.price).toBe(16.5);
  });

  it("reports an all-over-budget search as having no feasible configuration", () => {
    const r = runSearch({ ...A.target, maxBudget: 10 }, A.preferences);
    expect(r.ranked).toHaveLength(0);
    expect(r.anyMeetsTarget).toBe(false);
  });
});

describe("ranking follows the objective, not integration depth", () => {
  it("produces the same ranking when integration levels are shuffled", async () => {
    const before = runSearch(A.target, A.preferences).ranked.map((c) => [c.meal.id, c.price, c.nutrition.calories]);
    // Temporarily invert integration levels (3↔1) and re-rank.
    const orig = RESTAURANTS.map((r) => r.integrationLevel);
    try {
      RESTAURANTS.forEach((r: Restaurant) => (r.integrationLevel = (4 - r.integrationLevel) as Restaurant["integrationLevel"]));
      const after = runSearch(A.target, A.preferences).ranked.map((c) => [c.meal.id, c.price, c.nutrition.calories]);
      expect(after).toEqual(before);
    } finally {
      RESTAURANTS.forEach((r, i) => (r.integrationLevel = orig[i]));
    }
  });
});

describe("functional preferences", () => {
  it("vegetarian excludes every meal without a vegetarian/vegan tag", () => {
    const r = runSearch({ ...A.target, dietaryRestrictions: ["vegetarian"] }, { ...A.preferences, diet: "vegetarian" });
    expect(r.ranked.length).toBeGreaterThan(0);
    for (const c of r.ranked) expect(c.meal.dietaryTags.some((t) => t === "vegetarian" || t === "vegan")).toBe(true);
  });

  it("no-spicy removes spicy dishes", () => {
    const r = runSearch(A.target, { ...A.preferences, noSpicy: true });
    expect(r.ranked.some((c) => c.meal.dietaryTags.includes("spicy"))).toBe(false);
    expect(ALL_MEALS.some((m) => m.dietaryTags.includes("spicy"))).toBe(true);
  });

  it("lower-fat changes the chosen configuration (Scenario B)", () => {
    const normal = runSearch(SCENARIOS.B.target, { ...SCENARIOS.B.preferences, lowerFat: false }).ranked[0];
    const lower = runSearch(SCENARIOS.B.target, { ...SCENARIOS.B.preferences, lowerFat: true }).ranked[0];
    expect(lower.nutrition.fat).toBeLessThanOrEqual(normal.nutrition.fat);
    expect(lower.selections).not.toEqual(normal.selections);
  });

  it("lowest-price priority picks a cheaper fitting meal than hit-my-macros", () => {
    const macros = runSearch(A.target, A.preferences).ranked[0];
    const price = runSearch({ ...A.target, priority: "price" }, A.preferences).ranked[0];
    expect(price.meets).toBe(true);
    expect(price.price).toBeLessThanOrEqual(macros.price);
  });
});

describe("explanation: meets · trade-offs · confidence", () => {
  it("explains the canonical Scenario A choice with explicit differences", () => {
    const best = runSearch(A.target, A.preferences).ranked[0];
    const e = explainConfiguration(best, A.target);
    expect(e.meets).toEqual([
      "Meets protein target (49 g vs ≥45 g)",
      "Calories within ±10% of 700 kcal",
      "Within budget (€1.50 to spare)",
      "All 4 modifications supported by FitKitchen",
    ]);
    expect(e.misses).toEqual([]);
    expect(e.tradeoffs).toEqual([
      "18 kcal below your calorie target",
      "4 g more protein than your minimum",
      "3 g fewer carbs than your target",
      "2 g less fat than your target",
    ]);
    expect(e.confidence.provenance).toBe("verified");
  });

  it("hedges estimated numbers and never claims modifications for level-1 restaurants", () => {
    const salad = runSearch(A.target, A.preferences).ranked.find((c) => c.meal.id === "lg-chicken-salad")!;
    const e = explainConfiguration(salad, A.target);
    expect(e.misses.join(" ")).toMatch(/≈ 1 g short/);
    expect(e.misses).toContain("No modifications possible — restaurant not integrated");
    expect(e.confidence.text).toMatch(/not verified/);
    for (const t of [...e.meets, ...e.misses, ...e.tradeoffs]) expect(t).not.toMatch(/%\s*(healthy|health)/i);
  });
});

describe("target validation", () => {
  it("accepts sensible values and rejects junk with a message", () => {
    expect(validateTargetField("calories", "700")).toEqual({ value: 700 });
    expect(validateTargetField("maxBudget", "17,50")).toEqual({ value: 17.5 });
    expect("error" in validateTargetField("calories", "")).toBe(true);
    expect("error" in validateTargetField("calories", "70")).toBe(true);
    expect("error" in validateTargetField("protein", "4.5")).toBe(true);
    expect("error" in validateTargetField("maxBudget", "-3")).toBe(true);
    expect("error" in validateTargetField("fat", "abc")).toBe(true);
  });
});

describe("baseline / treatment separation", () => {
  const src = readFileSync(new URL("../src/baseline/Baseline.tsx", import.meta.url), "utf8");

  it("baseline reads the same menu data as treatment", () => {
    expect(src).toMatch(/from "\.\.\/data\/restaurants"/);
    expect(src).toMatch(/RESTAURANTS/);
    expect(src).toMatch(/computeConfiguration/); // same deterministic pricing/nutrition
  });

  it("baseline contains no recommendation, ranking, target comparison or explanation", () => {
    for (const forbidden of ["lib/optimizer", "runSearch", "optimizeMeal", "fitReasons", "explainConfiguration", "NutritionComparison", "MealCard", "Explanation", "meetsTarget", "useSearch", "useMealSelection"]) {
      expect(src, `baseline must not use ${forbidden}`).not.toContain(forbidden);
    }
  });
});
