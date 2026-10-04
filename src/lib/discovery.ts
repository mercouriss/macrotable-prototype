import type { Meal, Restaurant } from "../types";

/*
 * Food discovery (normal/demo mode): what kind of food the user wants, matched deterministically against the
 * restaurant and menu data only — never the model, never invented attributes.
 *
 *   Cuisine   = a property of the RESTAURANT, read from its own `cuisine` label ("Fresh pasta" → Italian).
 *   Dish type = a property of a DISH, read from its name/description ("Turkey Bolognese Rigatoni" → Pasta).
 *               A real restaurant (no menu data) can match a dish type only through its own label
 *               ("Burgers"), and says so ("Burgers restaurant · no menu data").
 *
 * Within a group, chips are alternatives (Pasta OR Salads); groups and the search text combine with AND.
 * The regexes cover exactly the vocabulary in the dataset; chips with no matching restaurant are hidden.
 */

/** Explore's "Show" choice (single): the existing fit / diet / restaurant-type views, now inside the Filters sheet. */
export type ExploreShow = "all" | "fit" | "protein" | "budget" | "veg" | "demo" | "real";
export const EXPLORE_SHOWS: ExploreShow[] = ["all", "fit", "protein", "budget", "veg", "demo", "real"];

/** Normal-mode discovery state shared by Explore and Find My Next Meal. */
export interface Discovery {
  food: FoodFilter;
  show: ExploreShow;
}

export interface FoodFilter {
  cuisines: string[];
  dishes: string[];
}

export const NO_FOOD_FILTER: FoodFilter = { cuisines: [], dishes: [] };

interface Category {
  id: string;
  label: string;
  /** Matched against normalised text. */
  re: RegExp;
}

/** Cuisines, read from the restaurant's `cuisine` label. */
export const CUISINES: Category[] = [
  { id: "italian", label: "Italian", re: /\b(italian|pasta)\b/ },
  { id: "mediterranean", label: "Mediterranean", re: /\b(mediterranean|mezze|greek)\b/ },
  { id: "indian", label: "Indian", re: /\bindian\b/ },
  { id: "japanese", label: "Japanese", re: /\b(japanese|sushi)\b/ },
  { id: "indonesian", label: "Indonesian", re: /\bindonesian\b/ },
  { id: "spanish", label: "Spanish", re: /\b(spanish|tapas)\b/ },
  { id: "grill", label: "Grill", re: /\bgrill\b/ },
  { id: "cafe", label: "Café & deli", re: /\b(cafe|coffee|deli|sandwiches?|toasties?)\b/ },
];

/** Dish types, read from a dish's name (+ description where the word names the food itself). */
export const DISH_TYPES: (Category & { field: "name" | "text" })[] = [
  { id: "pasta", label: "Pasta", re: /\b(pasta|penne|rigatoni|orzo|spaghetti|linguine|tagliatelle|fusilli|lasagn[ae]|ravioli|gnocchi|macaroni)\b/, field: "text" },
  { id: "bowls", label: "Bowls", re: /\bbowls?\b/, field: "name" },
  { id: "salads", label: "Salads", re: /\bsalads?\b/, field: "name" },
  { id: "wraps", label: "Wraps & sandwiches", re: /\b(wraps?|sandwich(es)?|melt|rye|toasties?|panini)\b/, field: "name" },
  { id: "curry", label: "Curry", re: /\b(curry|masala|tikka|rogan josh|korma)\b/, field: "text" },
  { id: "chicken", label: "Chicken", re: /\bchicken\b/, field: "text" },
  { id: "seafood", label: "Fish & seafood", re: /\b(salmon|tuna|fish|prawns?|shrimp|seafood|sushi)\b/, field: "text" },
  { id: "burgers", label: "Burgers", re: /\bburgers?\b/, field: "name" },
];

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((c) => [c.id, c])) as Record<string, T>;
const CUISINE_BY_ID = byId(CUISINES);
const DISH_BY_ID = byId(DISH_TYPES);

/** Lower-case, accents removed ("Ragù" → "ragu", "Café" → "cafe"). */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const cuisinesOf = (r: Pick<Restaurant, "cuisine">) => CUISINES.filter((c) => c.re.test(normalize(r.cuisine)));

export const dishTypesOf = (m: Pick<Meal, "name" | "description">) =>
  DISH_TYPES.filter((t) => t.re.test(normalize(t.field === "name" ? m.name : `${m.name} ${m.description}`)));

/** Dish types a restaurant's own label names (the only evidence for a restaurant without menu data). */
const labelDishTypes = (r: Pick<Restaurant, "cuisine">) => DISH_TYPES.filter((t) => t.re.test(normalize(r.cuisine)));

/** Search words; "salads" also matches "salad". */
function tokens(query: string): string[][] {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") ? [t, t.slice(0, -1)] : [t]));
}
const hasAll = (text: string, toks: string[][]) => toks.every((alts) => alts.some((a) => text.includes(a)));

export interface RestaurantMatch {
  match: boolean;
  /** Orderable dishes that satisfy the dish filter and/or the search words (what the card shows as the reason). */
  dishes: Meal[];
  /** True when a no-menu restaurant matched a dish type only through its own label. */
  byLabel: boolean;
  /** Search relevance, for ordering only (lower first): 0 a name, 1 a cuisine or dish type, 2 only a dish description. */
  tier: Tier;
  /** The shown dishes matched the search words only in their descriptions (the card says so). */
  described: boolean;
}

type Tier = 0 | 1 | 2;
const NO_MATCH: RestaurantMatch = { match: false, dishes: [], byLabel: false, tier: 2, described: false };

/**
 * For words already known to match: 0 in a name, 1 via a cuisine or dish type, 2 only in a dish description.
 * A word is graded where the dish itself has it, falling back to the restaurant only for words the dish lacks
 * ("fitkitchen chicken"), so "Local Grill" doesn't make its wrap a name match for "grill". The weakest word decides.
 */
function relevance(toks: string[][], own: { name: string; kinds: string; desc: string } | null, rest: { name: string; kinds: string }): Tier {
  const has = (text: string, alts: string[]) => alts.some((a) => text.includes(a));
  const grade = (alts: string[]): Tier =>
    own && has(own.name, alts) ? 0 : own && has(own.kinds, alts) ? 1 : own && has(own.desc, alts) ? 2 : has(rest.name, alts) ? 0 : has(rest.kinds, alts) ? 1 : 2;
  return Math.max(0, ...toks.map(grade)) as Tier;
}

/**
 * Does a restaurant satisfy the search text AND the cuisine chips AND the dish-type chips?
 * Search text matches the restaurant (name, cuisine label, cuisine/dish-type names) or one of its dishes
 * (name, description, dish-type names); every word must match somewhere in the same place.
 */
export function matchRestaurant(r: Restaurant, query: string, f: FoodFilter): RestaurantMatch {
  const meals = r.meals.filter((m) => m.available);
  const restName = normalize(r.name);
  const restKinds = normalize([r.cuisine, ...cuisinesOf(r).map((c) => c.label), ...labelDishTypes(r).map((t) => t.label)].join(" "));
  const restText = `${restName} ${restKinds}`;
  const rest = { name: restName, kinds: restKinds };
  const dishKinds = (m: Meal) => normalize(dishTypesOf(m).map((t) => t.label).join(" "));
  const dishOwnText = (m: Meal) => normalize([m.name, m.description, ...dishTypesOf(m).map((t) => t.label)].join(" "));

  if (f.cuisines.length && !f.cuisines.some((id) => CUISINE_BY_ID[id]?.re.test(normalize(r.cuisine)))) return NO_MATCH;

  let pool = meals;
  let byLabel = false;
  if (f.dishes.length) {
    pool = meals.filter((m) => f.dishes.some((id) => dishTypesOf(m).some((t) => t.id === id)));
    byLabel = !pool.length && r.meals.length === 0 && f.dishes.some((id) => DISH_BY_ID[id]?.re.test(normalize(r.cuisine)));
    if (!pool.length && !byLabel) return NO_MATCH;
  }

  const toks = tokens(query);
  if (!toks.length) return { match: true, dishes: f.dishes.length ? pool : [], byLabel, tier: 0, described: false };
  const restTier = hasAll(restText, toks) ? relevance(toks, null, rest) : null;
  // Words matching a dish (possibly together with the restaurant's name/cuisine, e.g. "fitkitchen chicken").
  const hits = pool.filter((m) => hasAll(`${dishOwnText(m)} ${restText}`, toks) && toks.some((alts) => alts.some((a) => dishOwnText(m).includes(a))));
  if (hits.length) {
    // Only the best-matching dishes explain the card: a "Salad" by name before a plate whose description mentions salad.
    const tiered = hits.map((m) => ({ m, t: relevance(toks, { name: normalize(m.name), kinds: dishKinds(m), desc: normalize(m.description) }, rest) }));
    const best = Math.min(...tiered.map((x) => x.t)) as Tier;
    return { match: true, dishes: tiered.filter((x) => x.t === best).map((x) => x.m), byLabel: false, tier: Math.min(best, restTier ?? 2) as Tier, described: best === 2 };
  }
  if (restTier !== null) return { match: true, dishes: f.dishes.length ? pool : [], byLabel, tier: restTier, described: false };
  return NO_MATCH;
}

/** Meal-level predicate for Find My Next Meal: only dishes satisfying the chips enter the optimizer. */
export function foodPredicate(f: FoodFilter): ((m: Meal, r: Restaurant) => boolean) | undefined {
  if (!f.cuisines.length && !f.dishes.length) return undefined;
  return (m, r) =>
    (!f.cuisines.length || f.cuisines.some((id) => CUISINE_BY_ID[id]?.re.test(normalize(r.cuisine)))) &&
    (!f.dishes.length || f.dishes.some((id) => dishTypesOf(m).some((t) => t.id === id)));
}

export const activeCount = (f: FoodFilter) => f.cuisines.length + f.dishes.length;

/** "Pasta", "Pasta or Salads · Italian" — for summaries and messages. */
export function foodLabel(f: FoodFilter): string {
  const d = f.dishes.map((id) => DISH_BY_ID[id]?.label).filter(Boolean);
  const c = f.cuisines.map((id) => CUISINE_BY_ID[id]?.label).filter(Boolean);
  return [d.join(" or "), c.join(" or ")].filter(Boolean).join(" · ");
}

export const NO_DISCOVERY: Discovery = { food: NO_FOOD_FILTER, show: "all" };

/** Stored discovery state, validated. */
export function cleanDiscovery(raw: unknown): Discovery {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<Discovery>;
  return { food: cleanFilter(d.food), show: EXPLORE_SHOWS.includes(d.show as ExploreShow) ? (d.show as ExploreShow) : "all" };
}

/** In a sentence: "pasta", "Italian pasta", "salads or curry", "Italian" (dish types lower-case, cuisines as names). */
export function foodPhrase(f: FoodFilter): string {
  const d = f.dishes.map((id) => DISH_BY_ID[id]?.label.toLowerCase()).filter(Boolean).join(" or ");
  const c = f.cuisines.map((id) => CUISINE_BY_ID[id]?.label).filter(Boolean).join(" or ");
  return [c, d].filter(Boolean).join(" ");
}

/** Keep only known ids (stored state from an older build may carry anything). */
export function cleanFilter(raw: unknown): FoodFilter {
  const f = (raw && typeof raw === "object" ? raw : {}) as Partial<FoodFilter>;
  const keep = (xs: unknown, ok: Record<string, unknown>) => (Array.isArray(xs) ? [...new Set(xs.filter((x): x is string => typeof x === "string" && x in ok))] : []);
  return { cuisines: keep(f.cuisines, CUISINE_BY_ID), dishes: keep(f.dishes, DISH_BY_ID) };
}

/**
 * Why a restaurant matched, for its card: "Pasta: Chicken Pesto Penne, Turkey Bolognese Rigatoni +1 more",
 * "3 matching dishes: …", "Mentioned in the description of: …" when the words appear only in dish descriptions,
 * or "Burgers restaurant · no menu data" for a no-menu restaurant matched by its label.
 */
export function matchReason(m: RestaurantMatch, r: Restaurant, f: FoodFilter): string | null {
  if (m.byLabel) return `${r.cuisine} restaurant · no menu data`;
  if (!m.dishes.length) return null;
  const n = m.dishes.length;
  const names = m.dishes.slice(0, 2).map((d) => d.name).join(", ") + (n > 2 ? ` +${n - 2} more` : "");
  if (m.described) return `Mentioned in ${n === 1 ? "the description of" : "the descriptions of"}: ${names}`;
  const what = f.dishes.length ? f.dishes.map((id) => DISH_BY_ID[id]?.label).filter(Boolean).join(" or ") : `${n} matching ${n === 1 ? "dish" : "dishes"}`;
  return `${what}: ${names}`;
}
