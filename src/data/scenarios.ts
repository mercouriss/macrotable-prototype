import type { Scenario, ScenarioId } from "../types";

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  A: {
    id: "A",
    label: "Scenario A",
    summary: "700 kcal · ≥45 g protein · €18 max · no restriction",
    target: {
      calories: 700,
      protein: 45,
      carbs: 75,
      fat: 22,
      maxBudget: 18,
      dietaryRestrictions: [],
      priority: "macros",
    },
    preferences: { diet: "none", highProtein: true, lowerFat: false, noSpicy: false },
  },
  B: {
    id: "B",
    label: "Scenario B",
    summary: "800 kcal · ≥55 g protein · €20 max · lower fat",
    target: {
      calories: 800,
      protein: 55,
      carbs: 90,
      fat: 20,
      maxBudget: 20,
      dietaryRestrictions: [],
      priority: "macros",
    },
    preferences: { diet: "none", highProtein: true, lowerFat: true, noSpicy: false },
  },
  C: {
    id: "C",
    label: "Scenario C",
    summary: "650 kcal · ≥40 g protein · €17 max · vegetarian",
    target: {
      calories: 650,
      protein: 40,
      carbs: 75,
      fat: 20,
      maxBudget: 17,
      dietaryRestrictions: ["vegetarian"],
      priority: "macros",
    },
    preferences: { diet: "vegetarian", highProtein: false, lowerFat: false, noSpicy: false },
  },
  D: {
    id: "D",
    label: "Scenario D (impossible)",
    summary: "450 kcal · ≥65 g protein · €18 max — deliberately unreachable",
    demoOnly: true,
    target: {
      calories: 450,
      protein: 65,
      carbs: 40,
      fat: 12,
      maxBudget: 18,
      dietaryRestrictions: [],
      priority: "macros",
    },
    preferences: { diet: "none", highProtein: true, lowerFat: false, noSpicy: false },
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

export function isScenarioId(v: string | null | undefined): v is ScenarioId {
  return !!v && v.toUpperCase() in SCENARIOS;
}

/** The fictional demo persona. */
export const PERSONA = { name: "Alex", goal: "Fitness / body composition" };
