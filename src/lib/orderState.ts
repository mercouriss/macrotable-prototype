import type { PlacedOrder, Restaurant, Selections } from "../types";

/*
 * Order-attempt state shared by the guided flow, the Review screen and MacroAgent.
 * Pure functions so the duplicate-prevention and completion rules are unit-tested.
 */

interface Attempt {
  mealId: string;
  selections: Selections;
  placedOrderNumber?: string;
}

/** Order-insensitive identity of a configuration. */
export const selectionKey = (sel: Selections) => JSON.stringify(Object.entries(sel).sort(([a], [b]) => a.localeCompare(b)));

const sameAttempt = (a: Attempt, b: Attempt) => a.mealId === b.mealId && selectionKey(a.selections) === selectionKey(b.selections);

/**
 * May this attempt be submitted? No if it (or, for an explicit agent draft, the identical
 * current attempt) was already placed. A changed configuration is a new attempt.
 */
export function canPlaceSelection(current: Attempt | null | undefined, explicit?: Attempt): boolean {
  if (!current) return !explicit || !explicit.placedOrderNumber;
  if (!explicit) return !current.placedOrderNumber;
  if (explicit.placedOrderNumber) return false;
  return !(current.placedOrderNumber && sameAttempt(current, explicit));
}

/**
 * The completed order for a recommendation card, if any: an order that came from this card
 * (origin), or an order for exactly this configuration placed after the card appeared.
 */
export function completedOrderFor(
  rec: { mealId: string; selections: Selections },
  opts: { origin?: string; since: number },
  orders: PlacedOrder[],
): PlacedOrder | undefined {
  return orders.find((o) => (opts.origin && o.origin === opts.origin) || (sameAttempt(o, rec) && o.placedAt >= opts.since));
}

export type AcceptanceStage = "sending" | "waiting" | "accepted" | "ticket";
export const ACCEPTANCE_STAGES: AcceptanceStage[] = ["sending", "waiting", "accepted", "ticket"];

/**
 * Simulated restaurant acceptance is shown ONLY for fictional demo brands with a
 * (simulated) kitchen integration. Real, unaffiliated restaurants, hand-offs and
 * scanned menus never "accept" anything: MacroTable sends them nothing.
 */
export function canSimulateAcceptance(restaurant: Pick<Restaurant, "identity" | "integrationLevel">, order: Pick<PlacedOrder, "handoff">): boolean {
  return restaurant.identity === "demo" && restaurant.integrationLevel >= 2 && !order.handoff;
}

/** Milliseconds from approval at which each stage begins (reduced motion: all at once). */
export function acceptanceTimeline(reducedMotion: boolean): Record<AcceptanceStage, number> {
  return reducedMotion ? { sending: 0, waiting: 0, accepted: 0, ticket: 0 } : { sending: 0, waiting: 700, accepted: 1700, ticket: 2300 };
}
