import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool, type ToolContext } from "../src/agent/tools";
import { AddFoodPanel, TodayLogPanel } from "../src/components/FoodLog";
import { SheetProvider } from "../src/components/Sheet";
import { SCENARIOS } from "../src/data/scenarios";
import { clearOrders, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { validateFoodValue } from "../src/lib/foodLog";
import { clearLedger, readLedger } from "../src/lib/ledger";
import { runSearch } from "../src/lib/optimizer";
import { Home } from "../src/screens/Home";
import { Preferences } from "../src/screens/Preferences";
import { AppStateProvider, useAppState } from "../src/state/AppState";

/*
 * Today's food log (normal mode only): "Add food" for food eaten elsewhere and "Adjust totals", so MacroTable
 * works without a calorie-tracking app. Research trials never see any of it.
 * Scenario A base: 700 kcal · ≥45 g protein · 75 g carbs · 22 g fat.
 */

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  clearOrders();
  clearLedger();
});
afterEach(() => (vi.useRealTimers(), vi.unstubAllGlobals()));

const A = SCENARIOS.A;
const lockOf = { participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "offline", sessionId: "s-fixed", startedAt: 1 };
let app: ReturnType<typeof useAppState>;
const Probe = () => ((app = useAppState()), null);
const load = () => (renderToString(h(AppStateProvider, null, h(Probe))), app);
const persist = (extra: Record<string, unknown> = {}) =>
  writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: A.target, prefs: A.preferences, selection: null, lock: null, ...extra });
const page = (el: ReturnType<typeof h>) => {
  writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true });
  return renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, el))));
};
const food = (calories: number, protein = 0, carbs = 0, fat = 0) => ({ calories, protein, carbs, fat });

describe("Add food: food eaten elsewhere (calories required, macros optional)", () => {
  it("counts toward today; the remaining nutrition updates", () => {
    expect(load().addFood({ name: "Banana", nutrition: food(105, 1, 27, 0), source: "manual-food" })).toBe(true);
    const a = load();
    expect(a.ledger!.consumed).toEqual(food(105, 1, 27, 0));
    expect(a.target).toMatchObject({ calories: 595, protein: 44, carbs: 48, fat: 22 });
    expect(a.todayLog).toMatchObject([{ name: "Banana", source: "manual-food", removable: true }]);
    expect(readLedger().handoffs[0]).toMatchObject({ name: "Banana", source: "manual-food" });
    expect(readLedger().handoffs[0].provenance).toBeUndefined(); // the user's own values: never labelled verified/menu-read
  });

  it("the corrected remaining reaches Find My Next Meal and MacroAgent (the same app target)", () => {
    load().addFood({ name: "Lunch", nutrition: food(400, 30, 40, 10), source: "manual-food" });
    const { target, prefs } = load();
    expect(target).toMatchObject({ calories: 300, protein: 15 });
    expect(runSearch(target, prefs).ranked.every((c) => Math.abs(c.nutrition.calories - 300) <= 30 || !c.meets)).toBe(true); // ranked against 300 kcal
    const ctx: ToolContext = { target, prefs: { ...A.preferences }, state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] } };
    expect((executeTool("getUserContext", {}, ctx).result as { remaining: { calories: number } }).remaining.calories).toBe(300);
  });

  it("validation: calories required for food, whole non-negative numbers, sensible maximums; blank macros = 0", () => {
    expect(validateFoodValue("calories", "", true)).toEqual({ error: "Enter the calories" });
    expect(validateFoodValue("protein", "", false)).toEqual({ value: 0 });
    expect(validateFoodValue("carbs", "12.5", false)).toEqual({ error: "Use a whole number" });
    expect(validateFoodValue("fat", "-3", false)).toEqual({ error: "Use a whole number" });
    expect(validateFoodValue("calories", "6000", true)).toEqual({ error: "At most 5000 kcal" });
    expect(validateFoodValue("calories", " 105 ", true)).toEqual({ value: 105 });
  });

  it("the sheet: name + four values, Add food / Adjust totals, a pinned Add to today; errors clear when a field is edited", () => {
    const html = page(h(AddFoodPanel, { onDone: () => {} }));
    expect(html).toMatch(/>Add food<.*>Adjust totals</s);
    expect(html).toContain("What did you eat?");
    for (const label of ["Calories", "Protein", "Carbs", "Fat"]) expect(html).toContain(`>${label}</label>`);
    expect(html).toMatch(/class="sticky -bottom-8[^"]*"><button[^>]*>Add to today</);
    expect(html).not.toMatch(/MacroAgent|PREMIUM|Premium/);
    const src = readFileSync("src/components/FoodLog.tsx", "utf8");
    expect(src).toMatch(/setErrors\(\(p\) => \(\{ \.\.\.p, name: undefined \}\)\)/);
    expect(src).toMatch(/setErrors\(\(p\) => \(\{ \.\.\.p, \[k\]: undefined, form: undefined \}\)\)/);
  });
});

describe("Adjust totals and removal", () => {
  it("adds or subtracts; today's total never goes below nothing eaten", () => {
    load().addFood({ name: "Lunch", nutrition: food(500, 30, 50, 15), source: "manual-food" });
    load().addFood({ name: "Subtracted from today's totals", nutrition: food(-200, -10, 0, -5), source: "adjustment" });
    expect(load().ledger!.consumed).toEqual(food(300, 20, 50, 10));
    load().addFood({ name: "Subtracted from today's totals", nutrition: food(-1000, -100, -100, -100), source: "adjustment" });
    expect(load().ledger!.consumed).toEqual(food(0, 0, 0, 0));
    expect(load().target).toMatchObject({ calories: 700, protein: 45, carbs: 75, fat: 22 }); // never above the daily target
  });

  it("the user's own entries can be removed; orders and scanned dishes can't be removed here", () => {
    load().addFood({ name: "Banana", nutrition: food(105), source: "manual-food" });
    load().addFood({ name: "Added to today's totals", nutrition: food(50), source: "adjustment" });
    load().placeOrder("pickup", { mealId: "fk-chicken-power-bowl", selections: { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" } });
    load().recordCounterHandoff({ id: "scan:s1:i0", at: Date.now(), nutrition: food(610, 42, 55, 22), name: "Grilled Chicken Wrap", provenance: "menu-read", source: "manual-scan" });
    expect(load().todayLog.map((e) => [e.source, e.removable]).sort()).toEqual([
      ["adjustment", true],
      ["manual-food", true],
      ["manual-scan", false],
      ["order", false],
    ]);
    for (const e of load().todayLog) load().removeFood(e.id);
    expect(load().todayLog.map((e) => e.source).sort()).toEqual(["manual-scan", "order"]);
    expect(load().ledger!.consumed.calories).toBe(682 + 610); // order + scanned dish still count
  });

  it("Today's log names each source; scanned estimates keep ≈; only removable rows have a Remove button", () => {
    load().addFood({ name: "Banana", nutrition: food(105, 1, 27, 0), source: "manual-food" });
    load().addFood({ name: "Subtracted from today's totals", nutrition: food(-100), source: "adjustment" });
    load().recordCounterHandoff({ id: "scan:s1:i2", at: Date.now(), nutrition: food(540, 38, 30, 28), name: "Tuna Salad Bowl", provenance: "estimated", source: "manual-scan" });
    const html = page(h(TodayLogPanel));
    expect(html).toContain("Added by you");
    expect(html).toMatch(/−100 kcal<\/p><p[^>]*>Adjustment</); // only what changed
    expect(html).toContain("From a scanned menu");
    expect(html).toContain("≈ 540 kcal");
    expect(html.match(/aria-label="Remove /g)).toHaveLength(2);
    expect(html).not.toContain('aria-label="Remove Tuna Salad Bowl"');
    expect(html).not.toMatch(/Health app|SIMULATED|tracker/i);
  });

  it("Reset demo clears today's manual state", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0));
    load().addFood({ name: "Banana", nutrition: food(105), source: "manual-food" });
    load().addFood({ name: "Added to today's totals", nutrition: food(50), source: "adjustment" });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 5));
    expect(load().resetDemo()).toBe(true);
    const a = load();
    expect(a.todayLog).toEqual([]);
    expect(a.ledger!.consumed).toEqual(food(0));
    expect(a.target).toMatchObject({ calories: 700, protein: 45 });
  });
});

describe("Where it shows", () => {
  it("Home: Today's log + Add food under 'Remaining today'; Preferences: 'Daily target' and what's left", () => {
    persist();
    load().addFood({ name: "Banana", nutrition: food(105, 1, 27, 0), source: "manual-food" });
    const home = page(h(Home));
    expect(home).toContain("data-food-log-actions");
    expect(home).toMatch(/Today&#x27;s log<span[^>]*>1</);
    expect(home).toMatch(/meals you confirmed in MacroTable today and food you added/);
    const prefs = page(h(Preferences));
    expect(prefs).toContain(">Daily target<");
    expect(prefs).toMatch(/data-left-today[^>]*>Left today after your food log: <span[^>]*>595<!-- --> kcal/);
  });
});

describe("Research isolation", () => {
  it("a trial: no food log, nothing can be added, the screens keep their trial wording", () => {
    persist({ lock: lockOf });
    const a = load();
    expect(a.ledger).toBeNull();
    expect(a.todayLog).toEqual([]);
    expect(a.addFood({ name: "Banana", nutrition: food(105), source: "manual-food" })).toBe(false);
    a.removeFood("anything");
    expect(readLedger().handoffs).toHaveLength(0);
    expect(a.target).toEqual(A.target);
    expect(page(h(Home))).not.toContain("data-food-log-actions");
    const prefs = page(h(Preferences));
    expect(prefs).toContain(">Remaining today<");
    expect(prefs).not.toMatch(/Daily target|data-left-today/);
  });
});
