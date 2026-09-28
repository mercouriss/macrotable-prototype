import type { Meal, Nutrition, Preferences, Selections, UserTarget } from "../types";
import { supportedOptions } from "./nutrition";

/**
 * "Reaches your target" — the definition used everywhere in the UI:
 *  - calories within ±10 % of the remaining calories, and
 *  - protein at or above the remaining protein.
 * Carbs and fat are soft preferences handled by the ranking, not by this check.
 */
export const CALORIE_TOLERANCE = 0.1;

export function meetsTarget(n: Nutrition, t: Pick<UserTarget, "calories" | "protein">): boolean {
  return Math.abs(n.calories - t.calories) <= t.calories * CALORIE_TOLERANCE && n.protein >= t.protein;
}

export function withinBudget(price: number, t: Pick<UserTarget, "maxBudget">): boolean {
  return Math.round(price * 100) <= Math.round(t.maxBudget * 100);
}

export type MealExclusion = "unavailable" | "no-nutrition" | "diet" | "spicy";

export const EXCLUSION_TEXT: Record<MealExclusion, string> = {
  unavailable: "Not available right now",
  "no-nutrition": "No reliable nutrition information",
  diet: "Doesn't match your diet",
  spicy: "Spicy (you asked for no spicy food)",
};

/** Hard, meal-level filters. Returns null when the meal may be considered. */
export function mealExclusion(meal: Meal, prefs: Preferences): MealExclusion | null {
  if (!meal.available) return "unavailable";
  if (!meal.nutrition) return "no-nutrition";
  if (prefs.diet === "vegetarian" && !meal.dietaryTags.some((t) => t === "vegetarian" || t === "vegan")) return "diet";
  if (prefs.diet === "vegan" && !meal.dietaryTags.includes("vegan")) return "diet";
  if (prefs.noSpicy && meal.dietaryTags.includes("spicy")) return "spicy";
  return null;
}

/**
 * Every configuration the restaurant supports: the Cartesian product of the
 * SUPPORTED options of each modifier group. Unsupported options never enter
 * the search space, so the optimiser cannot "invent" a modification.
 */
export function enumerateConfigurations(meal: Meal): Selections[] {
  let configs: Selections[] = [{}];
  for (const group of meal.modifierGroups) {
    const next: Selections[] = [];
    for (const partial of configs) {
      for (const option of supportedOptions(group)) next.push({ ...partial, [group.id]: option.id });
    }
    configs = next;
  }
  return configs;
}

export function unsupportedOptionCount(meal: Meal): number {
  return meal.modifierGroups.reduce((sum, g) => sum + g.options.filter((o) => !o.supported).length, 0);
}
