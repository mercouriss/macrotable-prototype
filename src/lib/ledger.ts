import type { Nutrition, PlacedOrder, UserTarget } from "../types";
import { readJSON, writeJSON } from "./experiment";

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

/** A confirmed meal with no order record: a scanned-menu dish the user said they'd order at the counter. */
export interface CounterHandoff {
  /** The agent draft id — confirming the same draft twice records it once. */
  id: string;
  at: number;
  nutrition: Macros;
}

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

/** Record a confirmed counter hand-off for a scanned dish. Idempotent by draft id. */
export function recordCounterHandoff(h: CounterHandoff): boolean {
  const meta = readLedger();
  if (meta.handoffs.some((x) => x.id === h.id)) return false;
  write({ ...meta, handoffs: [...meta.handoffs, { id: h.id, at: h.at, nutrition: pick(h.nutrition) }] });
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
    out.push({ id: o.orderNumber, at: o.placedAt, nutrition: pick(o.nutrition) });
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
  const remaining = { ...base };
  const over = { ...ZERO };
  for (const k of MACRO_KEYS) {
    remaining[k] = Math.max(0, r(base[k] - consumed[k]));
    over[k] = Math.max(0, r(consumed[k] - base[k]));
  }
  return { base, consumed: { calories: r(consumed.calories), protein: r(consumed.protein), carbs: r(consumed.carbs), fat: r(consumed.fat) }, remaining, over };
}
