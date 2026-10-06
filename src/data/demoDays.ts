import type { Macros } from "../lib/ledger";
import type { ScenarioId } from "../types";

/*
 * Demo days (normal/demo mode only): what the demo user ate EARLIER TODAY, before the demo starts.
 *
 *   full-day target − earlier today = the scenario's target (its starting "remaining today")
 *
 * Display-only explanation of where each scenario's remaining allowance comes from. It is never stored,
 * never a ledger entry, order or scan, has no restaurant or provenance, and never reaches the optimizer,
 * MacroAgent or research: those keep using the scenario target exactly as before. Research trials never
 * show it (they have no ledger). SCENARIOS is untouched (it defines the trials and the fingerprint).
 */

export interface EarlierMeal {
  /** Local time of day it was eaten (display only). */
  time: string;
  name: string;
  nutrition: Macros;
}

export const DEMO_DAYS: Record<ScenarioId, EarlierMeal[]> = {
  A: [
    { time: "08:00", name: "Granola with yogurt and berries", nutrition: { calories: 420, protein: 16, carbs: 70, fat: 9 } },
    { time: "10:30", name: "Cappuccino", nutrition: { calories: 80, protein: 5, carbs: 7, fat: 4 } },
    { time: "13:00", name: "Chicken wrap and side salad", nutrition: { calories: 710, protein: 62, carbs: 56, fat: 26 } },
    { time: "16:30", name: "Cottage cheese and an apple", nutrition: { calories: 290, protein: 22, carbs: 32, fat: 9 } },
  ],
  B: [
    { time: "07:45", name: "Egg-white omelette and toast", nutrition: { calories: 350, protein: 30, carbs: 30, fat: 11 } },
    { time: "10:30", name: "Skyr with honey", nutrition: { calories: 200, protein: 20, carbs: 26, fat: 1 } },
    { time: "12:45", name: "Tuna pasta salad", nutrition: { calories: 560, protein: 38, carbs: 70, fat: 12 } },
    { time: "15:30", name: "Hummus, pita and carrots", nutrition: { calories: 390, protein: 17, carbs: 44, fat: 16 } },
  ],
  C: [
    { time: "08:15", name: "Porridge with banana and honey", nutrition: { calories: 480, protein: 24, carbs: 79, fat: 9 } },
    { time: "10:45", name: "Flat white", nutrition: { calories: 110, protein: 6, carbs: 9, fat: 6 } },
    { time: "13:00", name: "Lentil soup with bread", nutrition: { calories: 480, protein: 26, carbs: 70, fat: 10 } },
    { time: "16:00", name: "Greek yogurt with walnuts", nutrition: { calories: 280, protein: 14, carbs: 12, fat: 20 } },
  ],
  D: [
    { time: "08:30", name: "Croissant and latte", nutrition: { calories: 450, protein: 14, carbs: 45, fat: 24 } },
    { time: "13:15", name: "Pasta with tomato sauce", nutrition: { calories: 600, protein: 20, carbs: 95, fat: 15 } },
    { time: "16:30", name: "Protein shake", nutrition: { calories: 300, protein: 41, carbs: 10, fat: 9 } },
  ],
};

/** The scenario's demo day: its earlier meals, their total, and the full day (the target the user sees plus them). */
export interface DemoDay {
  meals: EarlierMeal[];
  earlier: Macros;
  day: Macros;
}

export function demoDayFor(id: ScenarioId, target: Macros): DemoDay | null {
  // Own scenarios only: a corrupted stored id (e.g. "toString") gets no demo day rather than an inherited property.
  if (!Object.hasOwn(DEMO_DAYS, id)) return null;
  const meals = DEMO_DAYS[id];
  const earlier = meals.reduce(
    (a, m) => ({ calories: a.calories + m.nutrition.calories, protein: a.protein + m.nutrition.protein, carbs: a.carbs + m.nutrition.carbs, fat: a.fat + m.nutrition.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    meals,
    earlier,
    day: { calories: target.calories + earlier.calories, protein: target.protein + earlier.protein, carbs: target.carbs + earlier.carbs, fat: target.fat + earlier.fat },
  };
}
