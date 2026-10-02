import { getRestaurant } from "../data/restaurants";
import { isSelectionSupported } from "./nutrition";
import type { Selections } from "../types";
import type { MealSelection } from "../state/AppState";

/*
 * Recommendation → restaurant's full menu → Back, on ordinary browser history (normal mode only).
 * Going out: the menu page gets the recommendation it was opened from in its location state.
 * Coming back: the recommendation screen saved its exact selection + scroll position in its OWN
 * history entry (replace) before navigating, so Back restores it without recomputing anything.
 */

/** Where the menu was opened from, and the exact configuration recommended there. */
export interface FromRecommendation {
  from: "meal" | "home" | "results" | "agent";
  mealId: string;
  selections: Selections;
}

/** Snapshot kept in the recommendation screen's history entry while the menu is open. */
export interface RecommendationRestore {
  selection: MealSelection;
  scrollTop: number;
}

export const restaurantMenuPath = (restaurantId: string) => `/macrotable/explore/${restaurantId}`;

export function menuState(from: FromRecommendation["from"], mealId: string, selections: Selections) {
  return { fromRecommendation: { from, mealId, selections } satisfies FromRecommendation };
}

/** The recommendation context for this restaurant's menu, if the state carries a valid one. */
export function readFromRecommendation(state: unknown, restaurantId: string | undefined): FromRecommendation | null {
  const f = (state as { fromRecommendation?: FromRecommendation } | null)?.fromRecommendation;
  const meal = f && getRestaurant(restaurantId)?.meals.find((m) => m.id === f.mealId);
  return f && meal && isSelectionSupported(meal, f.selections) ? f : null;
}

/** The selection to restore on the recommendation screen for `mealId`, if its history entry saved one. */
export function readRestore(state: unknown, mealId: string | undefined): RecommendationRestore | null {
  const r = (state as { restore?: RecommendationRestore } | null)?.restore;
  return r && r.selection?.mealId === mealId ? r : null;
}
