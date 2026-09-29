import { useEffect, useMemo } from "react";
import { getScopedMeal, isStudyScope } from "../data/restaurants";
import { runSearch, optimizeMeal } from "../lib/optimizer";
import { computeConfiguration, defaultSelections, isSelectionSupported } from "../lib/nutrition";
import { meetsTarget, withinBudget } from "../lib/feasibility";
import { useAppState } from "./AppState";
import type { Configuration } from "../types";

/**
 * Resolves the meal on screen plus the configuration being discussed.
 * If the user arrives without a selection (e.g. from Discover), the
 * optimiser's configuration for that meal is used and stored.
 */
export function useMealSelection(mealId: string | undefined) {
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
  const selections = synced ? selection!.selections : recommended;

  useEffect(() => {
    if (found && !synced) selectMeal({ mealId: found.meal.id, selections: recommended, recommended });
  }, [found, synced, recommended, selectMeal]);

  let config: Configuration | null = null;
  if (found && found.meal.nutrition && isSelectionSupported(found.meal, selections)) {
    const { nutrition, price } = computeConfiguration(found.meal, selections);
    config = { meal: found.meal, restaurant: found.restaurant, selections, nutrition, price };
  }
  const isRecommended = JSON.stringify(selections) === JSON.stringify(synced ? (selection!.recommended ?? recommended) : recommended);

  return {
    found,
    result,
    config,
    selections,
    recommended: synced ? (selection!.recommended ?? recommended) : recommended,
    isRecommended,
    meets: config ? meetsTarget(config.nutrition, target) : false,
    inBudget: config ? withinBudget(config.price, target) : false,
  };
}

export function useSearch(scope?: string | null) {
  const { target, prefs } = useAppState();
  const study = isStudyScope();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => runSearch(target, prefs, scope ?? undefined), [target, prefs, scope, study]);
}
