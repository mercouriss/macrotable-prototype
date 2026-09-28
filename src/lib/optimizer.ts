import { distanceFromUser } from "../data/geo";
import { RESTAURANTS } from "../data/restaurants";
import type { Configuration, Meal, Nutrition, Preferences, Restaurant, Selections, UserTarget } from "../types";
import {
  enumerateConfigurations,
  mealExclusion,
  meetsTarget,
  unsupportedOptionCount,
  withinBudget,
  type MealExclusion,
} from "./feasibility";
import { changesFromDefault, computeConfiguration, getOption } from "./nutrition";

/*
 * x* = argmin_{x ∈ F} D(N(x), T)
 *
 * F  = configurations that are available, match the diet, use only
 *      restaurant-supported modifiers, and fit the hard budget.
 * D  = the transparent distance below. It is a PROTOTYPE RANKING HEURISTIC,
 *      not a validated nutrition model, and its number is never shown to users.
 */

export interface Weights {
  calories: number;
  proteinShortfall: number;
  carbs: number;
  fat: number;
  /** "Lower fat" preference: fat below target is not penalised. */
  fatExcessOnly: boolean;
}

export function weightsFor(prefs: Preferences): Weights {
  return {
    calories: 1,
    proteinShortfall: prefs.highProtein ? 2 : 1.5,
    carbs: 0.5,
    fat: prefs.lowerFat ? 1 : 0.5,
    fatExcessOnly: prefs.lowerFat,
  };
}

export function scoreNutrition(n: Nutrition, target: Nutrition, w: Weights = weightsFor(DEFAULT_PREFS)): number {
  const calorieError = Math.abs(n.calories - target.calories) / Math.max(target.calories, 1);
  const proteinShortfall = Math.max(target.protein - n.protein, 0) / Math.max(target.protein, 1);
  const carbError = Math.abs(n.carbs - target.carbs) / Math.max(target.carbs, 1);
  const fatDiff = w.fatExcessOnly ? Math.max(n.fat - target.fat, 0) : Math.abs(n.fat - target.fat);
  const fatError = fatDiff / Math.max(target.fat, 1);
  return w.calories * calorieError + w.proteinShortfall * proteinShortfall + w.carbs * carbError + w.fat * fatError;
}

const DEFAULT_PREFS: Preferences = { diet: "none", highProtein: false, lowerFat: false, noSpicy: false };

export interface ScoredConfiguration extends Configuration {
  score: number;
  meets: boolean;
}

/** Lexicographic ranking: configurations reaching the target first, then the user's priority. */
export function compareConfigs(a: ScoredConfiguration, b: ScoredConfiguration, priority: UserTarget["priority"]): number {
  if (a.meets !== b.meets) return a.meets ? -1 : 1;
  if (priority === "price" && a.price !== b.price) return a.price - b.price;
  if (priority === "distance") {
    const da = distanceFromUser(a.restaurant.location);
    const db = distanceFromUser(b.restaurant.location);
    if (da !== db) return da - db;
  }
  if (a.score !== b.score) return a.score - b.score;
  return a.price - b.price;
}

export interface MealResult {
  meal: Meal;
  restaurant: Restaurant;
  exclusion: MealExclusion | null;
  generated: number;
  unsupportedSkipped: number;
  withinBudget: number;
  reachingTarget: number;
  /** Best feasible configuration, or undefined if nothing fits the budget. */
  best?: ScoredConfiguration;
  /** Cheapest supported configuration when nothing fits the budget (for the "over budget" state). */
  cheapestOverBudget?: ScoredConfiguration;
}

export function scoreConfiguration(
  meal: Meal,
  restaurant: Restaurant,
  selections: Selections,
  target: UserTarget,
  prefs: Preferences,
): ScoredConfiguration {
  const { nutrition, price } = computeConfiguration(meal, selections);
  return {
    meal,
    restaurant,
    selections,
    nutrition,
    price,
    score: scoreNutrition(nutrition, target, weightsFor(prefs)),
    meets: meetsTarget(nutrition, target),
  };
}

export function optimizeMeal(meal: Meal, restaurant: Restaurant, target: UserTarget, prefs: Preferences): MealResult {
  const result: MealResult = {
    meal,
    restaurant,
    exclusion: mealExclusion(meal, prefs),
    generated: 0,
    unsupportedSkipped: unsupportedOptionCount(meal),
    withinBudget: 0,
    reachingTarget: 0,
  };
  if (result.exclusion) return result;

  const all = enumerateConfigurations(meal).map((s) => scoreConfiguration(meal, restaurant, s, target, prefs));
  result.generated = all.length;
  const feasible = all.filter((c) => withinBudget(c.price, target));
  result.withinBudget = feasible.length;
  result.reachingTarget = feasible.filter((c) => c.meets).length;
  result.best = [...feasible].sort((a, b) => compareConfigs(a, b, target.priority))[0];
  if (!result.best) result.cheapestOverBudget = [...all].sort((a, b) => a.price - b.price)[0];
  return result;
}

export interface SearchResult {
  scope?: Restaurant;
  meals: MealResult[];
  /** One best configuration per restaurant, ranked by user fit (never by integration level). */
  recommendations: ScoredConfiguration[];
  /** Every meal's best feasible configuration, ranked. */
  ranked: ScoredConfiguration[];
  anyMeetsTarget: boolean;
  closest?: ScoredConfiguration;
  stats: {
    restaurants: number;
    meals: number;
    available: number;
    matchingDiet: number;
    configurations: number;
    unsupportedSkipped: number;
    withinBudget: number;
    reachingTarget: number;
  };
}

export function runSearch(target: UserTarget, prefs: Preferences, restaurantId?: string): SearchResult {
  const restaurants = restaurantId ? RESTAURANTS.filter((r) => r.id === restaurantId) : RESTAURANTS;
  const meals = restaurants.flatMap((r) => r.meals.map((m) => optimizeMeal(m, r, target, prefs)));
  const ranked = meals
    .map((m) => m.best)
    .filter((b): b is ScoredConfiguration => !!b)
    .sort((a, b) => compareConfigs(a, b, target.priority));

  let recommendations: ScoredConfiguration[];
  if (restaurantId) {
    recommendations = ranked.slice(0, 3);
  } else {
    const seen = new Set<string>();
    recommendations = ranked.filter((c) => !seen.has(c.restaurant.id) && seen.add(c.restaurant.id)).slice(0, 3);
  }

  return {
    scope: restaurantId ? restaurants[0] : undefined,
    meals,
    recommendations,
    ranked,
    anyMeetsTarget: ranked.some((c) => c.meets),
    closest: ranked[0],
    stats: {
      restaurants: restaurants.length,
      meals: meals.length,
      available: meals.filter((m) => m.exclusion !== "unavailable" && m.exclusion !== "no-nutrition").length,
      matchingDiet: meals.filter((m) => !m.exclusion).length,
      configurations: meals.reduce((s, m) => s + m.generated, 0),
      unsupportedSkipped: meals.reduce((s, m) => s + m.unsupportedSkipped, 0),
      withinBudget: meals.reduce((s, m) => s + m.withinBudget, 0),
      reachingTarget: meals.reduce((s, m) => s + m.reachingTarget, 0),
    },
  };
}

// ─── Explanations (dimensions, never the raw score) ───────────────────────

export type ReasonTone = "good" | "warn" | "info";
export interface Reason {
  tone: ReasonTone;
  text: string;
}

export function fitReasons(c: Configuration, target: UserTarget, opts: { includeData?: boolean } = {}): Reason[] {
  const out: Reason[] = [];
  const { nutrition: n } = c;
  // Estimates are hedged so an estimated number never reads as a measured one.
  const est = c.meal.provenance === "estimated";
  const ap = est ? "≈ " : "";
  if (n.protein >= target.protein) out.push({ tone: "good", text: est ? "Likely meets protein target" : "Meets protein target" });
  else out.push({ tone: "warn", text: `${ap}${target.protein - n.protein} g short of protein target` });

  const calDiff = n.calories - target.calories;
  const calPct = Math.abs(calDiff) / target.calories;
  if (calPct <= 0.05) out.push({ tone: "good", text: "Close to calorie target" });
  else if (calPct <= 0.1) out.push({ tone: "good", text: `Within 10% of calorie target` });
  else out.push({ tone: "warn", text: `${ap}${Math.abs(calDiff)} kcal ${calDiff > 0 ? "over" : "under"} calorie target` });

  if (withinBudget(c.price, target)) out.push({ tone: "good", text: "Under budget" });
  else out.push({ tone: "warn", text: "Over budget" });

  if (opts.includeData) {
    const changes = changesFromDefault(c.meal, c.selections).length;
    if (c.restaurant.integrationLevel === 1) {
      out.push({ tone: "info", text: "Ordered as listed — restaurant not integrated" });
    } else if (changes > 0) {
      out.push({ tone: "good", text: "All modifications supported" });
    } else {
      out.push({ tone: "good", text: "No modifications needed" });
    }
    if (c.meal.provenance === "verified") out.push({ tone: "good", text: "Verified recipe data" });
    if (c.meal.provenance === "official") out.push({ tone: "good", text: "Official restaurant nutrition" });
    if (c.meal.provenance === "estimated") out.push({ tone: "warn", text: "Nutrition is an estimate" });
  }
  return out;
}

export type CustomizationStatus = "customized" | "as-listed" | "handoff";

export function customizationStatus(c: Configuration): CustomizationStatus {
  if (c.restaurant.integrationLevel === 1) return "handoff";
  return changesFromDefault(c.meal, c.selections).length > 0 ? "customized" : "as-listed";
}

/**
 * Plain-language reasons why a restaurant's menu cannot reach the target,
 * derived from its modifier data (including options it explicitly does NOT support).
 */
export function infeasibilityReasons(c: Configuration, target: UserTarget): string[] {
  const reasons: string[] = [];
  const { meal } = c;
  const unsupported = meal.modifierGroups.flatMap((g) =>
    g.options.filter((o) => !o.supported).map((o) => o.label.toLowerCase()),
  );
  const proteinGroups = meal.modifierGroups.filter((g) =>
    g.options.some((o) => o.supported && o.nutritionDelta.protein > 0 && o.nutritionDelta.calories > 0),
  );
  if (c.nutrition.protein < target.protein) {
    const short = target.protein - c.nutrition.protein;
    if (!proteinGroups.length) {
      reasons.push(`${c.restaurant.name} doesn't offer a way to add more protein to this dish.`);
    } else {
      const g = proteinGroups[0];
      const max = [...g.options].filter((o) => o.supported).sort((a, b) => b.nutritionDelta.protein - a.nutritionDelta.protein)[0];
      reasons.push(
        c.selections[g.id] === max.id
          ? `Even with the largest protein option ${c.restaurant.name} supports (${max.label.startsWith("+") ? `${max.label} ${g.name.toLowerCase()}` : max.label.toLowerCase()}), it's still ${short} g short of your protein target.`
          : `Larger protein options would take the order over your ${euroLabel(target.maxBudget)} budget.`,
      );
    }
  }
  if (Math.abs(c.nutrition.calories - target.calories) > target.calories * 0.1) {
    reasons.push(
      c.nutrition.calories > target.calories
        ? "The lightest supported version is still above your calorie range."
        : "Even the fullest supported version is below your calorie range.",
    );
  }
  if (unsupported.length) {
    reasons.push(`Not offered by the restaurant: ${unsupported.join(", ")}. MacroTable won't request modifications a kitchen doesn't support.`);
  }
  if (c.restaurant.integrationLevel === 1) {
    reasons.push(`${c.restaurant.name} isn't integrated, so no modifications can be sent at all.`);
  }
  return reasons;
}

const euroLabel = (v: number) => `€${v.toFixed(2).replace(/\.00$/, "")}`;

/** Selected option label per group, used for display. */
export function selectionLabel(meal: Meal, selections: Selections, groupId: string): string {
  const g = meal.modifierGroups.find((x) => x.id === groupId);
  if (!g) return "";
  return getOption(g, selections[groupId] ?? g.defaultOptionId)?.label ?? "";
}

// ─── Structured explanation: Meets · Trade-offs · Confidence ──────────────

export interface Explanation {
  meets: string[];
  misses: string[];
  tradeoffs: string[];
  confidence: { provenance: Configuration["meal"]["provenance"]; text: string };
}

/**
 * Plain-language explanation of a configuration against the target.
 * States explicit differences only — no health percentages or scores.
 */
export function explainConfiguration(c: Configuration, target: UserTarget): Explanation {
  const n = c.nutrition;
  const est = c.meal.provenance === "estimated";
  const ap = est ? "≈ " : "";
  const meets: string[] = [];
  const misses: string[] = [];
  const tradeoffs: string[] = [];

  if (n.protein >= target.protein) meets.push(`${est ? "Likely meets" : "Meets"} protein target (${ap}${n.protein} g vs ≥${target.protein} g)`);
  else misses.push(`${ap}${target.protein - n.protein} g short of protein target`);

  const calDiff = n.calories - target.calories;
  if (Math.abs(calDiff) <= target.calories * 0.1) meets.push(`Calories within ±10% of ${target.calories} kcal`);
  else misses.push(`${ap}${Math.abs(calDiff)} kcal ${calDiff > 0 ? "over" : "under"} your calorie range`);

  const spare = Math.round((target.maxBudget - c.price) * 100) / 100;
  if (spare >= 0) meets.push(spare === 0 ? "Exactly on budget" : `Within budget (€${spare.toFixed(2)} to spare)`);
  else misses.push(`€${Math.abs(spare).toFixed(2)} over budget`);

  const changes = changesFromDefault(c.meal, c.selections).length;
  if (c.restaurant.integrationLevel === 1) misses.push("No modifications possible — restaurant not integrated");
  else meets.push(changes ? `All ${changes} modifications supported by ${c.restaurant.name}` : "No modifications needed");

  const diff = (v: number, unit: string, more: string, less: string, what: string) =>
    v === 0 ? null : `${ap}${Math.abs(v)}${unit} ${v > 0 ? more : less} ${what}`;
  const t = [
    calDiff !== 0 && Math.abs(calDiff) <= target.calories * 0.1 ? diff(calDiff, " kcal", "above", "below", "your calorie target") : null,
    n.protein > target.protein ? `${ap}${n.protein - target.protein} g more protein than your minimum` : null,
    diff(n.carbs - target.carbs, " g", "more", "fewer", "carbs than your target"),
    diff(n.fat - target.fat, " g", "more", "less", "fat than your target"),
  ];
  for (const x of t) if (x) tradeoffs.push(x);

  const r = c.restaurant.name;
  const confidence = {
    provenance: c.meal.provenance,
    text:
      c.meal.provenance === "verified"
        ? `Verified recipe data from ${r}: nutrition is calculated from the configured ingredients. Actual preparation may vary.`
        : c.meal.provenance === "official"
          ? `Official nutrition published by ${r}, combined with its published modifier values. Actual preparation may vary.`
          : `Estimated from ${r}'s public menu — not verified by the restaurant. Actual nutrition may differ.`,
  };
  return { meets, misses, tradeoffs, confidence };
}
