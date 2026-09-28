import type { PlacedOrder } from "../types";

/*
 * Browser-local persistence for UI state, settings and simulated orders.
 * Every access is wrapped: storage can be unavailable (private mode, blocked
 * site data) and the app must keep working without it.
 * Research sessions live in ./research.ts.
 */

const KEYS = {
  orders: "macrotable.orders.v1",
  state: "macrotable.state.v2",
  settings: "macrotable.settings.v1",
} as const;

export const STORAGE_KEYS = KEYS;

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the prototype still works, it just doesn't persist */
  }
}

// In-memory mirror so the demo still works when storage is blocked.
let memoryOrders: PlacedOrder[] = [];

export function getOrders(): PlacedOrder[] {
  return readJSON<PlacedOrder[] | null>(KEYS.orders, null) ?? memoryOrders;
}

export function saveOrder(o: PlacedOrder): void {
  memoryOrders = [...getOrders(), o];
  writeJSON(KEYS.orders, memoryOrders);
}

export function nextOrderNumber(): string {
  return `MT${1042 + getOrders().length}`;
}

export function clearOrders(): void {
  memoryOrders = [];
  try {
    localStorage.removeItem(KEYS.orders);
  } catch {
    /* ignore */
  }
}
