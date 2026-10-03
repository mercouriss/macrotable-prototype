import type { PlacedOrder, Restaurant, ServiceMode } from "../types";

/*
 * How the user gets a meal at a MacroTable demo restaurant: pickup, or dine in at a table.
 * Deterministic app state (never inferred by the agent), and normal/demo mode only: research trials keep
 * the original "Pickup / Eat in-store" choice without tables.
 */

/** Tables a demo table-service restaurant offers (simulated). */
export const TABLES = Array.from({ length: 30 }, (_, i) => String(i + 1));

/** Full-service demo restaurant whose in-store option is "Dine in" with a table. */
export const offersDineIn = (r: Pick<Restaurant, "tableService" | "serviceModes">) => !!r.tableService && r.serviceModes.includes("in-store");

/** A table number as the app stores it ("12"), or null if it isn't one of the restaurant's tables. */
export function normalizeTable(raw: unknown): string | null {
  const t = String(raw ?? "").trim().replace(/^table\s*/i, "");
  return TABLES.includes(String(Number(t))) && /^\d+$/.test(t) ? String(Number(t)) : null;
}

/** True when approving this order must carry a table number. */
export const needsTable = (r: Pick<Restaurant, "tableService" | "serviceModes">, mode: ServiceMode, inTrial: boolean) =>
  !inTrial && offersDineIn(r) && mode === "in-store";

/** The fulfilment line shown on Review and the ticket: "DINE IN · TABLE 12", "PICKUP" or "IN-STORE". */
export function fulfilmentLabel(o: Pick<PlacedOrder, "serviceMode" | "table">): string {
  if (o.table) return `DINE IN · TABLE ${o.table}`;
  return o.serviceMode === "in-store" ? "IN-STORE" : o.serviceMode === "handoff" ? "COUNTER" : "PICKUP";
}

/** The user's chosen way of eating at one restaurant (set on the QR landing or Review; normal mode). */
export interface DiningChoice {
  restaurantId: string;
  mode: ServiceMode;
  table?: string;
}
