/*
 * Today's food log (normal/demo mode only): what the user ate outside MacroTable orders.
 *
 *   "Add food":      food eaten elsewhere — a name, calories (required) and macros (optional).
 *   "Adjust totals": add to or subtract from today's totals.
 *
 * Entries go into the daily ledger (lib/ledger) as the user's own entries, so the remaining nutrition that
 * Home, Find My Next Meal and MacroAgent use updates straight away. Research trials never use it.
 */

export const FOOD_FIELDS = {
  calories: { label: "Calories", unit: "kcal", max: 5000 },
  protein: { label: "Protein", unit: "g", max: 500 },
  carbs: { label: "Carbs", unit: "g", max: 1000 },
  fat: { label: "Fat", unit: "g", max: 500 },
} as const;
export type FoodField = keyof typeof FOOD_FIELDS;
export const FOOD_FIELD_KEYS = Object.keys(FOOD_FIELDS) as FoodField[];

/** A whole, non-negative amount; blank = 0 except calories when adding food (a food always has calories). */
export function validateFoodValue(k: FoodField, raw: string, required: boolean): { value: number } | { error: string } {
  const s = raw.trim();
  if (!s) return required ? { error: "Enter the calories" } : { value: 0 };
  if (!/^\d+$/.test(s)) return { error: "Use a whole number" };
  const value = Number(s);
  if (value > FOOD_FIELDS[k].max) return { error: `At most ${FOOD_FIELDS[k].max} ${FOOD_FIELDS[k].unit}` };
  return { value };
}
