import { describe, expect, it } from "vitest";
import { ALL_MEALS, DEMO_MEAL_ID, getMeal } from "../../data/restaurants";
import { SCENARIOS } from "../../data/scenarios";
import { enumerateConfigurations, meetsTarget } from "../feasibility";
import { changesFromDefault, computeConfiguration, describeChange, toCents } from "../nutrition";
import { infeasibilityReasons, runSearch } from "../optimizer";

const DEMO_SELECTIONS = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" };

describe("mock data arithmetic", () => {
  it("Chicken Power Bowl demo configuration sums to the spec numbers", () => {
    const { meal } = getMeal(DEMO_MEAL_ID)!;
    expect(meal.nutrition).toEqual({ calories: 890, protein: 39, carbs: 105, fat: 31 });
    expect(meal.price).toBe(14.5);
    const c = computeConfiguration(meal, DEMO_SELECTIONS);
    expect(c.nutrition).toEqual({ calories: 682, protein: 49, carbs: 72, fat: 20 });
    expect(c.price).toBe(16.5);
  });

  it("every supported configuration equals base + deltas (integer cents, non-negative macros)", () => {
    for (const meal of ALL_MEALS.filter((m) => m.nutrition)) {
      for (const sel of enumerateConfigurations(meal)) {
        const c = computeConfiguration(meal, sel);
        let cents = toCents(meal.price);
        const n = { ...meal.nutrition! };
        for (const g of meal.modifierGroups) {
          const o = g.options.find((x) => x.id === sel[g.id])!;
          cents += toCents(o.priceDelta);
          n.calories += o.nutritionDelta.calories;
          n.protein += o.nutritionDelta.protein;
          n.carbs += o.nutritionDelta.carbs;
          n.fat += o.nutritionDelta.fat;
        }
        expect(toCents(c.price)).toBe(cents);
        expect(c.nutrition).toEqual(n);
        for (const v of Object.values(c.nutrition)) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("each group's default option is supported and has a zero delta", () => {
    for (const meal of ALL_MEALS) {
      for (const g of meal.modifierGroups) {
        const d = g.options.find((o) => o.id === g.defaultOptionId)!;
        expect(d.supported).toBe(true);
        expect(d.priceDelta).toBe(0);
        expect(d.nutritionDelta).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
    }
  });
});

describe("supported modifications only", () => {
  it("never enumerates an unsupported option", () => {
    const unsupported = new Set(ALL_MEALS.flatMap((m) => m.modifierGroups.flatMap((g) => g.options.filter((o) => !o.supported).map((o) => `${m.id}/${o.id}`))));
    expect(unsupported.size).toBeGreaterThan(0);
    for (const meal of ALL_MEALS) {
      for (const sel of enumerateConfigurations(meal)) {
        for (const id of Object.values(sel)) expect(unsupported.has(`${meal.id}/${id}`)).toBe(false);
      }
    }
  });

  it("refuses to price an unsupported modification", () => {
    const { meal } = getMeal("ub-teriyaki-salmon")!;
    expect(() => computeConfiguration(meal, { rice: "rice-half" })).toThrow(/Unsupported/);
  });
});

describe("Scenario A (demo path)", () => {
  const { target, preferences } = SCENARIOS.A;
  const r = runSearch(target, preferences);

  it("picks the MacroTable version of the Chicken Power Bowl as best match", () => {
    expect(r.ranked[0].meal.id).toBe(DEMO_MEAL_ID);
    expect(r.ranked[0].selections).toEqual(DEMO_SELECTIONS);
    expect(r.ranked[0].meets).toBe(true);
    expect(changesFromDefault(r.ranked[0].meal, r.ranked[0].selections).map(describeChange)).toEqual([
      "+50 g chicken",
      "Half rice",
      "Light sauce",
      "Double vegetables",
    ]);
  });

  it("recommends VERIFIED, OFFICIAL and ESTIMATED examples, one per restaurant", () => {
    expect(r.recommendations.map((c) => c.meal.provenance)).toEqual(["verified", "official", "estimated"]);
    expect(new Set(r.recommendations.map((c) => c.restaurant.id)).size).toBe(3);
  });

  it("keeps every recommendation within budget", () => {
    for (const c of r.ranked) expect(c.price).toBeLessThanOrEqual(target.maxBudget);
  });

  it("excludes sold-out and no-nutrition meals", () => {
    const excluded = r.meals.filter((m) => m.exclusion).map((m) => [m.meal.id, m.exclusion]);
    expect(excluded).toEqual([
      ["fk-steak-sweet-potato", "unavailable"],
      ["lg-daily-special", "no-nutrition"],
    ]);
  });

  it("Urban Bowl alone cannot reach the target → closest supported option", () => {
    const u = runSearch(target, preferences, "urbanbowl");
    expect(u.anyMeetsTarget).toBe(false);
    expect(u.closest!.meal.id).toBe("ub-teriyaki-salmon");
    expect(u.closest!.nutrition.calories).toBe(760);
    expect(u.closest!.nutrition.protein).toBe(40);
    expect(u.closest!.price).toBe(17.2);
    const why = infeasibilityReasons(u.closest!, target).join(" ");
    expect(why).toMatch(/extra salmon/);
    expect(why).toMatch(/half rice/);
  });

  it("price priority returns the cheapest configuration that reaches the target", () => {
    const p = runSearch({ ...target, priority: "price" }, preferences);
    const meeting = p.ranked.filter((c) => c.meets);
    expect(p.ranked[0].meets).toBe(true);
    expect(p.ranked[0].price).toBe(Math.min(...meeting.map((c) => c.price)));
  });
});

describe("experiment scenarios", () => {
  for (const id of ["A", "B", "C"] as const) {
    it(`Scenario ${id} has both feasible-and-fitting and non-fitting meals`, () => {
      const r = runSearch(SCENARIOS[id].target, SCENARIOS[id].preferences);
      expect(r.ranked.some((c) => c.meets)).toBe(true);
      expect(r.ranked.some((c) => !c.meets)).toBe(true);
    });
  }

  it("Scenario C only returns vegetarian meals", () => {
    const r = runSearch(SCENARIOS.C.target, SCENARIOS.C.preferences);
    for (const c of r.ranked) expect(c.meal.dietaryTags.some((t) => t === "vegetarian" || t === "vegan")).toBe(true);
  });

  it("Scenario D is impossible and explains why", () => {
    const r = runSearch(SCENARIOS.D.target, SCENARIOS.D.preferences);
    expect(r.anyMeetsTarget).toBe(false);
    expect(meetsTarget(r.closest!.nutrition, SCENARIOS.D.target)).toBe(false);
    expect(r.closest!.meal.id).toBe(DEMO_MEAL_ID);
    expect(infeasibilityReasons(r.closest!, SCENARIOS.D.target)[0]).toMatch(/largest protein option/);
  });
});
