import type { UserTarget } from "../types";

export type TargetKey = "calories" | "protein" | "carbs" | "fat" | "maxBudget";

export const TARGET_FIELDS: Record<TargetKey, { label: string; unit: string; min: number; max: number; decimals: boolean; hint?: string }> = {
  calories: { label: "Calories", unit: "kcal", min: 200, max: 2500, decimals: false },
  protein: { label: "Protein (at least)", unit: "g", min: 0, max: 250, decimals: false },
  carbs: { label: "Carbs", unit: "g", min: 0, max: 400, decimals: false },
  fat: { label: "Fat", unit: "g", min: 0, max: 200, decimals: false },
  maxBudget: { label: "Budget", unit: "€", min: 5, max: 100, decimals: true, hint: "Hard limit" },
};

export function validateTargetField(key: TargetKey, raw: string): { value: number } | { error: string } {
  const f = TARGET_FIELDS[key];
  const s = raw.trim().replace(",", ".");
  if (!s) return { error: `Enter ${f.label.toLowerCase().replace(" (at least)", "")}` };
  const pattern = f.decimals ? /^\d+(\.\d{1,2})?$/ : /^\d+$/;
  if (!pattern.test(s)) return { error: f.decimals ? "Use a number like 18 or 17.50" : "Use a whole number" };
  const value = Number(s);
  if (value < f.min || value > f.max) return { error: `Between ${f.min} and ${f.max} ${f.unit}` };
  return { value };
}

export function targetDrafts(t: UserTarget): Record<TargetKey, string> {
  return {
    calories: String(t.calories),
    protein: String(t.protein),
    carbs: String(t.carbs),
    fat: String(t.fat),
    maxBudget: String(t.maxBudget),
  };
}
