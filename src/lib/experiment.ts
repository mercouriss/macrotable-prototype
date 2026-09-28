import type { ExperimentEvent, Mode, PlacedOrder } from "../types";

/*
 * Research instrumentation — localStorage only, no network, no analytics service.
 * Every access is wrapped: storage can be unavailable (private mode, blocked site data)
 * and the app must keep working without it.
 */

const KEYS = {
  events: "macrotable.events.v1",
  orders: "macrotable.orders.v1",
  state: "macrotable.state.v1",
  settings: "macrotable.settings.v1",
} as const;

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

export const STORAGE_KEYS = KEYS;

// In-memory mirror so the demo still works when storage is blocked.
let memoryEvents: ExperimentEvent[] = [];
let memoryOrders: PlacedOrder[] = [];

export function getEvents(): ExperimentEvent[] {
  return readJSON<ExperimentEvent[] | null>(KEYS.events, null) ?? memoryEvents;
}

export function appendEvent(e: ExperimentEvent): void {
  memoryEvents = [...getEvents(), e].slice(-2000);
  writeJSON(KEYS.events, memoryEvents);
}

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

export function clearResearchData(): void {
  memoryEvents = [];
  memoryOrders = [];
  try {
    localStorage.removeItem(KEYS.events);
    localStorage.removeItem(KEYS.orders);
  } catch {
    /* ignore */
  }
}

export function newSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface Trial {
  sessionId: string;
  mode: Mode;
  scenario: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  order?: PlacedOrder;
  mealsViewed: number;
  modifierChanges: number;
}

export function summarizeTrials(events: ExperimentEvent[], orders: PlacedOrder[]): Trial[] {
  const bySession = new Map<string, Trial>();
  for (const e of events) {
    let t = bySession.get(e.sessionId);
    if (!t) {
      t = { sessionId: e.sessionId, mode: e.mode, scenario: e.scenario, startedAt: e.timestamp, mealsViewed: 0, modifierChanges: 0 };
      bySession.set(e.sessionId, t);
    }
    if (e.event === "experiment_started") t.startedAt = e.timestamp;
    if (e.event === "meal_viewed") t.mealsViewed++;
    if (e.event === "modifier_changed") t.modifierChanges++;
    if (e.event === "experiment_completed") {
      t.completedAt = e.timestamp;
      t.durationMs = e.timestamp - t.startedAt;
    }
  }
  for (const o of orders) {
    const t = o.sessionId ? bySession.get(o.sessionId) : undefined;
    if (t) t.order = o;
  }
  return [...bySession.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function exportResearchData(): void {
  const events = getEvents();
  const orders = getOrders();
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), trials: summarizeTrials(events, orders), events, orders }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `macrotable-research-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
