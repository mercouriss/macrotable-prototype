import type { Nutrition, PlacedOrder, Provenance, UserTarget } from "../types";
import { readJSON, writeJSON } from "./experiment";
import { extraLabel, orderExtras, orderTotals } from "./extras";

/*
 * Daily nutrition ledger (normal/demo mode only).
 *
 *   eligible confirmed meals, today's LOCAL date, since the active reset boundary → consumed today
 *   base daily target − consumed today → remaining today   (calories, protein, carbs, fat)
 *
 * Consumption is DERIVED from stored confirmations, never accumulated, so it can't double count:
 * each confirmed order is stored once under its unique order number (re-renders, refresh, reopening
 * the success page and back/forward only read it). A meal that was viewed, configured or taken to
 * checkout but not confirmed has no record and costs nothing. Research orders (with a sessionId) are
 * never eligible, and trials don't use the ledger at all.
 */

const KEY = "macrotable.ledger.v1";

export type Macros = Pick<Nutrition, "calories" | "protein" | "carbs" | "fat">;
export const MACRO_KEYS = ["calories", "protein", "carbs", "fat"] as const;
const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/**
 * A confirmed meal with no order record: a scanned-menu dish the user said they'd order at the counter
 * (agent hand-off) or added to today themselves (Add to today), food eaten elsewhere that the user added
 * ("Add food"), or a signed correction of today's totals ("Adjust totals"). Never an order, ticket or transaction.
 */
export interface CounterHandoff {
  /** Stable per dish (`scanLedgerId`), so confirming the same dish again — by either path — records it once. */
  id: string;
  at: number;
  nutrition: Macros;
  /** Optional context, kept as given: the dish, its ORIGINAL provenance (never upgraded) and how it was logged. */
  name?: string;
  provenance?: Provenance;
  source?: "counter-handoff" | "manual-scan" | "manual-food" | "adjustment";
}

/** Entries the user typed in themselves can be removed again (orders and scanned dishes can't). */
export const REMOVABLE_SOURCES: CounterHandoff["source"][] = ["manual-food", "adjustment"];

/** A fresh id for an entry the user adds (each one counts: eating the same food twice is two entries). */
export const foodEntryId = (at: number) => `food:${at}:${Math.random().toString(36).slice(2, 8)}`;

/** Ledger id for a dish on a scanned menu (one scan, one dish). */
export const scanLedgerId = (scanId: string, itemId: string) => `scan:${scanId}:${itemId.replace(/^scan:/, "")}`;

/**
 * The ledger entry for "Add to today" on a scanned dish, or null when its nutrition is INSUFFICIENT (nothing
 * reliable to log). The dish keeps its own provenance (MENU-READ / ESTIMATED), never upgraded.
 */
export function scanMealEntry(
  item: { id: string; name: string; nutrition: Nutrition | null; provenance: Provenance },
  scanId: string,
  at = Date.now(),
): CounterHandoff | null {
  if (!item.nutrition || item.provenance === "insufficient") return null;
  return { id: scanLedgerId(scanId, item.id), at, nutrition: pick(item.nutrition), name: item.name, provenance: item.provenance, source: "manual-scan" };
}

/** True if this confirmation is already in today's ledger history. */
export const isLogged = (id: string) => readLedger().handoffs.some((h) => h.id === id);

interface LedgerMeta {
  /** Reset demo boundary: confirmations before this instant no longer count (history is kept). */
  since: number;
  handoffs: CounterHandoff[];
}

let memory: LedgerMeta = { since: 0, handoffs: [] };

export function readLedger(): LedgerMeta {
  const raw = readJSON<Partial<LedgerMeta> | null>(KEY, null);
  if (!raw) return memory;
  return { since: typeof raw.since === "number" ? raw.since : 0, handoffs: Array.isArray(raw.handoffs) ? raw.handoffs : [] };
}

function write(next: LedgerMeta) {
  memory = next;
  writeJSON(KEY, next);
}

/** Reset demo: start a fresh ledger now. Past orders stay in history but stop counting. */
export function resetLedger(now = Date.now()): void {
  write({ ...readLedger(), since: now });
}

/** Record a confirmed scanned-menu meal. Idempotent by id: a repeated tap, refresh or second path adds nothing. */
export function recordCounterHandoff(h: CounterHandoff): boolean {
  const meta = readLedger();
  if (meta.handoffs.some((x) => x.id === h.id)) return false;
  const extra = { ...(h.name ? { name: h.name } : {}), ...(h.provenance ? { provenance: h.provenance } : {}), ...(h.source ? { source: h.source } : {}) };
  write({ ...meta, handoffs: [...meta.handoffs, { id: h.id, at: h.at, nutrition: pick(h.nutrition), ...extra }] });
  return true;
}

/** Remove an entry the user added (Add food / Adjust totals). Orders and scanned dishes are never removed here. */
export function removeHandoff(id: string): boolean {
  const meta = readLedger();
  const h = meta.handoffs.find((x) => x.id === id);
  if (!h || !REMOVABLE_SOURCES.includes(h.source)) return false;
  write({ ...meta, handoffs: meta.handoffs.filter((x) => x.id !== id) });
  return true;
}

/** Test helper / researcher wipe. */
export function clearLedger(): void {
  memory = { since: 0, handoffs: [] };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const pick = (n: Macros): Macros => ({ calories: n.calories, protein: n.protein, carbs: n.carbs, fat: n.fat });

/** Local calendar date (the user's day, not UTC). */
export function localDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Everything the user confirmed eating outside research: normal orders (incl. catalog hand-offs) + scanned hand-offs. */
export function confirmedMeals(orders: PlacedOrder[], meta: LedgerMeta): { id: string; at: number; nutrition: Macros }[] {
  const seen = new Set<string>();
  const out: { id: string; at: number; nutrition: Macros }[] = [];
  for (const o of orders) {
    if (o.sessionId || !o.nutrition || seen.has(o.orderNumber)) continue; // research orders never count
    seen.add(o.orderNumber);
    out.push({ id: o.orderNumber, at: o.placedAt, nutrition: pick(orderTotals(o).nutrition) }); // dish + any drinks and desserts
  }
  for (const h of meta.handoffs) if (!seen.has(h.id)) (seen.add(h.id), out.push(h));
  return out;
}

/** Sum of today's confirmed meals since the reset boundary. */
export function consumedToday(orders: PlacedOrder[], meta: LedgerMeta, now = Date.now()): Macros {
  const today = localDay(now);
  return confirmedMeals(orders, meta)
    .filter((m) => m.at >= meta.since && localDay(m.at) === today)
    .reduce((acc, m) => ({ calories: acc.calories + m.nutrition.calories, protein: acc.protein + m.nutrition.protein, carbs: acc.carbs + m.nutrition.carbs, fat: acc.fat + m.nutrition.fat }), { ...ZERO });
}

/** One line of today's food log, newest first. */
export interface TodayEntry {
  id: string;
  at: number;
  nutrition: Macros;
  source: "order" | NonNullable<CounterHandoff["source"]>;
  /** For orders: the ordered meal (the screen resolves its name). */
  mealId?: string;
  /** For orders: the drinks and desserts added to it ("2× Iced green tea"). */
  extras?: string[];
  name?: string;
  provenance?: Provenance;
  removable: boolean;
}

/** Today's confirmed meals and entries since the reset boundary, as the food log shows them. */
export function todayEntries(orders: PlacedOrder[], meta: LedgerMeta, now = Date.now()): TodayEntry[] {
  const today = localDay(now);
  const counts = (at: number) => at >= meta.since && localDay(at) === today;
  const seen = new Set<string>();
  const out: TodayEntry[] = [];
  for (const o of orders) {
    if (o.sessionId || !o.nutrition || seen.has(o.orderNumber) || !counts(o.placedAt)) continue;
    seen.add(o.orderNumber);
    out.push({
      id: o.orderNumber,
      at: o.placedAt,
      nutrition: pick(orderTotals(o).nutrition),
      source: "order",
      mealId: o.mealId,
      ...(orderExtras(o).length ? { extras: orderExtras(o).map(extraLabel) } : {}),
      removable: false,
    });
  }
  for (const h of meta.handoffs) {
    if (seen.has(h.id) || !counts(h.at)) continue;
    seen.add(h.id);
    out.push({ id: h.id, at: h.at, nutrition: pick(h.nutrition), source: h.source ?? "counter-handoff", name: h.name, provenance: h.provenance, removable: REMOVABLE_SOURCES.includes(h.source) });
  }
  return out.sort((a, b) => b.at - a.at);
}

export interface DailyLedger {
  /** The daily target the user set (Preferences). */
  base: UserTarget;
  consumed: Macros;
  /** base − consumed, never below 0. Budget, diet and priority are the base's. */
  remaining: UserTarget;
  /** How far consumption exceeds the base (0 when it doesn't). */
  over: Macros;
}

export function dailyLedger(base: UserTarget, consumed: Macros): DailyLedger {
  const r = (x: number) => Math.round(x);
  // Subtractions ("Adjust totals") can lower today's total, never below nothing eaten.
  consumed = { calories: Math.max(0, consumed.calories), protein: Math.max(0, consumed.protein), carbs: Math.max(0, consumed.carbs), fat: Math.max(0, consumed.fat) };
  const remaining = { ...base };
  const over = { ...ZERO };
  for (const k of MACRO_KEYS) {
    remaining[k] = Math.max(0, r(base[k] - consumed[k]));
    over[k] = Math.max(0, r(consumed[k] - base[k]));
  }
  return { base, consumed: { calories: r(consumed.calories), protein: r(consumed.protein), carbs: r(consumed.carbs), fat: r(consumed.fat) }, remaining, over };
}
