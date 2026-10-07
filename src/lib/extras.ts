import { EXTRAS, type MenuExtra } from "../data/extras";
import type { Macros } from "./ledger";
import type { OrderExtra, PlacedOrder, Provenance, Restaurant } from "../types";

/*
 * Drinks and desserts added to a dish (normal/demo mode only). The dish stays what MacroTable recommends
 * and configures; extras are the user's own additions on top: they count toward the order total, the
 * payment step, the kitchen ticket and today's nutrition, but never toward a recommendation.
 */

/** One chosen extra, as a selection or an order step holds it. */
export interface ExtraLine {
  id: string;
  qty: number;
}

export const MAX_EXTRA_QTY = 4;
const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** The restaurant's drinks and desserts (drinks first). Demo restaurants only; empty for real ones. */
export function extrasFor(restaurantId: string): MenuExtra[] {
  return EXTRAS.filter((x) => x.restaurantId === restaurantId).sort((a, b) => Number(a.kind === "dessert") - Number(b.kind === "dessert"));
}

/** Same data confidence as the restaurant's menu: simulated partner data, published values, or an estimate. */
export function extrasProvenance(r: Pick<Restaurant, "integrationLevel">): Provenance {
  return r.integrationLevel === 3 ? "verified" : r.integrationLevel === 2 ? "official" : "estimated";
}

/** Valid lines only: this restaurant's extras, whole quantities 1–4, one line per item (input order kept). */
export function resolveExtras(restaurantId: string, lines: readonly ExtraLine[] | undefined): OrderExtra[] {
  if (!Array.isArray(lines)) return [];
  const menu = new Map(extrasFor(restaurantId).map((x) => [x.id, x]));
  const out = new Map<string, OrderExtra>();
  for (const l of lines) {
    const x = l && typeof l.id === "string" ? menu.get(l.id) : undefined;
    const qty = Number.isInteger(l?.qty) ? Math.min(MAX_EXTRA_QTY, l.qty) : 0;
    if (!x || qty < 1 || out.has(x.id)) continue;
    out.set(x.id, { id: x.id, kind: x.kind, name: x.name, qty, price: x.price, nutrition: { ...x.nutrition } });
  }
  return [...out.values()];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

const isLine = (x: unknown): x is OrderExtra => {
  const l = x as OrderExtra | null;
  return !!l && typeof l.name === "string" && !!l.nutrition && Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.price);
};

/** An order's drinks and desserts; a malformed stored line is dropped rather than breaking a screen. */
export function orderExtras(o: Pick<PlacedOrder, "extras">): OrderExtra[] {
  return Array.isArray(o.extras) ? o.extras.filter(isLine) : [];
}

/** What the extras add: nutrition and price for all units. */
export function extrasTotals(extras: readonly OrderExtra[] | undefined): { nutrition: Macros; price: number; count: number } {
  const nutrition = { ...ZERO };
  let price = 0;
  let count = 0;
  for (const x of Array.isArray(extras) ? extras.filter(isLine) : []) {
    nutrition.calories += x.nutrition.calories * x.qty;
    nutrition.protein += x.nutrition.protein * x.qty;
    nutrition.carbs += x.nutrition.carbs * x.qty;
    nutrition.fat += x.nutrition.fat * x.qty;
    price += x.price * x.qty;
    count += x.qty;
  }
  return { nutrition, price: round2(price), count };
}

/** Dish + its extras. */
export function withExtras(dish: { nutrition: Macros; price: number }, extras: readonly OrderExtra[] | undefined): { nutrition: Macros; price: number } {
  const e = extrasTotals(extras);
  return {
    nutrition: {
      calories: dish.nutrition.calories + e.nutrition.calories,
      protein: dish.nutrition.protein + e.nutrition.protein,
      carbs: dish.nutrition.carbs + e.nutrition.carbs,
      fat: dish.nutrition.fat + e.nutrition.fat,
    },
    price: round2(dish.price + e.price),
  };
}

/** The whole order: the dish plus any drinks and desserts. */
export function orderTotals(o: Pick<PlacedOrder, "nutrition" | "price" | "extras">): { nutrition: Macros; price: number } {
  return withExtras(o, o.extras);
}

/** "2× Iced green tea" / "Tiramisu". */
export const extraLabel = (x: Pick<OrderExtra, "name" | "qty">) => (x.qty > 1 ? `${x.qty}× ${x.name}` : x.name);
