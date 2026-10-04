import { useEffect, useMemo } from "react";
import { getScopedMeal, isStudyScope } from "../data/restaurants";
import { runSearch, optimizeMeal } from "../lib/optimizer";
import { computeConfiguration, defaultSelections, isSelectionSupported } from "../lib/nutrition";
import { meetsTarget, withinBudget } from "../lib/feasibility";
import { useAppState, type MealSelection } from "./AppState";
import { foodPredicate, type FoodFilter } from "../lib/discovery";
import type { Configuration } from "../types";

/**
 * Resolves the meal on screen plus the configuration being discussed.
 * If the user arrives without a selection (e.g. from Discover), the
 * optimiser's configuration for that meal is used and stored. `restore` (from this screen's own
 * history entry, see lib/menuNav) brings back the exact selection the user left, e.g. after
 * looking at another dish on the restaurant's menu, instead of recomputing it.
 */
export function useMealSelection(mealId: string | undefined, restore?: MealSelection | null) {
  const { selection, selectMeal, target, prefs } = useAppState();
  const study = isStudyScope();
  // Scoped: during a trial a deep link to a non-study dish resolves to nothing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const found = useMemo(() => getScopedMeal(mealId), [mealId, study]);
  const result = useMemo(
    () => (found ? optimizeMeal(found.meal, found.restaurant, target, prefs) : undefined),
    [found, target, prefs],
  );
  const recommended = useMemo(
    () => result?.best?.selections ?? result?.cheapestOverBudget?.selections ?? (found ? defaultSelections(found.meal) : {}),
    [result, found],
  );
  const synced = selection?.mealId === mealId;
  const restored = !synced && found && restore?.mealId === found.meal.id && isSelectionSupported(found.meal, restore.selections) ? restore : null;
  const selections = synced ? selection!.selections : (restored?.selections ?? recommended);

  useEffect(() => {
    if (found && !synced) selectMeal(restored ?? { mealId: found.meal.id, selections: recommended, recommended });
  }, [found, synced, recommended, restored, selectMeal]);

  let config: Configuration | null = null;
  if (found && found.meal.nutrition && isSelectionSupported(found.meal, selections)) {
    const { nutrition, price } = computeConfiguration(found.meal, selections);
    config = { meal: found.meal, restaurant: found.restaurant, selections, nutrition, price };
  }
  const baseline = synced ? (selection!.recommended ?? recommended) : (restored?.recommended ?? recommended);
  const isRecommended = JSON.stringify(selections) === JSON.stringify(baseline);

  return {
    found,
    result,
    config,
    selections,
    recommended: baseline,
    isRecommended,
    meets: config ? meetsTarget(config.nutrition, target) : false,
    inBudget: config ? withinBudget(config.price, target) : false,
  };
}

/**
 * `food` (Find My Next Meal, normal mode): only matching dishes enter the same deterministic search.
 * Omitted (Home, research trials): the search is exactly as before.
 */
export function useSearch(scope?: string | null, food?: FoodFilter) {
  const { target, prefs } = useAppState();
  const study = isStudyScope();
  const key = food ? `${food.cuisines.join(",")}|${food.dishes.join(",")}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => runSearch(target, prefs, scope ?? undefined, food && foodPredicate(food)), [target, prefs, scope, study, key]);
}
