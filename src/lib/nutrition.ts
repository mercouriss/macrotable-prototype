import type { Meal, ModifierGroup, ModifierOption, Nutrition, Selections } from "../types";

export const ZERO_NUTRITION: Nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

/** Money is summed in integer cents so €14.50 + €1.50 + €0.50 is exactly €16.50. */
export const toCents = (euros: number) => Math.round(euros * 100);
export const fromCents = (cents: number) => cents / 100;

export function defaultSelections(meal: Meal): Selections {
  return Object.fromEntries(meal.modifierGroups.map((g) => [g.id, g.defaultOptionId]));
}

export function getOption(group: ModifierGroup, optionId: string | undefined): ModifierOption | undefined {
  return group.options.find((o) => o.id === optionId);
}

export function supportedOptions(group: ModifierGroup): ModifierOption[] {
  return group.options.filter((o) => o.supported);
}

/**
 * Deterministic nutrition + price for a meal under a set of modifier selections.
 * Throws if a selection references an unsupported or unknown option — the app
 * must never be able to price or order a modification the restaurant does not allow.
 */
export function computeConfiguration(meal: Meal, selections: Selections): { nutrition: Nutrition; price: number } {
  if (!meal.nutrition) throw new Error(`Meal ${meal.id} has no nutrition data`);
  let nutrition = meal.nutrition;
  let cents = toCents(meal.price);
  for (const group of meal.modifierGroups) {
    const option = getOption(group, selections[group.id] ?? group.defaultOptionId);
    if (!option) throw new Error(`Unknown option for ${meal.id}/${group.id}`);
    if (!option.supported) throw new Error(`Unsupported modification ${option.id} on ${meal.id}`);
    nutrition = addNutrition(nutrition, option.nutritionDelta);
    cents += toCents(option.priceDelta);
  }
  return { nutrition, price: fromCents(cents) };
}

export function isSelectionSupported(meal: Meal, selections: Selections): boolean {
  return meal.modifierGroups.every((g) => getOption(g, selections[g.id] ?? g.defaultOptionId)?.supported === true);
}

export function configurationId(meal: Meal, selections: Selections): string {
  const parts = meal.modifierGroups.map((g) => `${g.id}=${selections[g.id] ?? g.defaultOptionId}`);
  return parts.length ? `${meal.id}?${parts.join("&")}` : meal.id;
}

export interface ModifierChange {
  group: ModifierGroup;
  from: ModifierOption;
  to: ModifierOption;
}

/** Groups whose selection differs from the dish as listed. */
export function changesFromDefault(meal: Meal, selections: Selections): ModifierChange[] {
  const out: ModifierChange[] = [];
  for (const group of meal.modifierGroups) {
    const to = getOption(group, selections[group.id] ?? group.defaultOptionId);
    const from = getOption(group, group.defaultOptionId);
    if (to && from && to.id !== from.id) out.push({ group, from, to });
  }
  return out;
}

/** Human wording of a change, e.g. "+50 g chicken", "Half rice", "Double vegetables". */
export function describeChange(c: ModifierChange): string {
  const label = c.to.label;
  const noun = c.group.name.toLowerCase();
  if (label.startsWith("+")) return `${label} ${noun}`;
  if (label === "None") return `No ${noun}`;
  if (["Edamame", "Avocado"].includes(label)) return `Add ${label.toLowerCase()}`;
  if (label === "Add") return `Add ${noun}`;
  return `${label} ${noun}`;
}

export function ticketLine(c: ModifierChange): string {
  return c.to.ticketLabel ?? describeChange(c).toUpperCase();
}
