import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStateProvider, useAgent } from "../src/agent/agentState";
import { executeTool } from "../src/agent/tools";
import { TodayLogPanel } from "../src/components/FoodLog";
import { KitchenTicket } from "../src/components/KitchenTicket";
import { SheetProvider } from "../src/components/Sheet";
import { EXTRAS } from "../src/data/extras";
import { RESTAURANTS } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { clearOrders, getOrders, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { extrasFor, extrasTotals, orderTotals, resolveExtras } from "../src/lib/extras";
import { clearLedger } from "../src/lib/ledger";
import { runSearch } from "../src/lib/optimizer";
import { RestaurantPage } from "../src/screens/RestaurantPage";
import { Review } from "../src/screens/Review";
import { AppStateProvider, useAppState, type MealSelection } from "../src/state/AppState";
import type { Selections } from "../src/types";

/*
 * Drinks and desserts (normal mode only): users add them to a dish at Review, on MacroAgent's order card
 * or on a demo restaurant's menu page. They count toward the order, the ticket and today's nutrition,
 * never toward a recommendation, and research trials never see or order them.
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
afterEach(() => vi.unstubAllGlobals());

const A = SCENARIOS.A; // 700 kcal · ≥45 g protein · €18
const BOWL: Selections = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" }; // 682 kcal · 49 g · €16.50
const bowl = (extra: Partial<MealSelection> = {}): MealSelection => ({ mealId: "fk-chicken-power-bowl", selections: BOWL, ...extra });
const SHAKE = { id: "fk-x-protein-shake", qty: 1 }; // 175 kcal · 25 P · 12 C · 3 F · €4.50
const BROWNIE = { id: "fk-x-protein-brownie", qty: 2 }; // 212 kcal · 15 P · 20 C · 8 F · €3.75 each
const lockOf = { participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "offline", sessionId: "s-fixed", startedAt: 1 };
const persist = (extra: Record<string, unknown> = {}) => {
  writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true, agentMode: "offline" });
  writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: A.target, prefs: A.preferences, selection: null, lock: null, ...extra });
};
let app: ReturnType<typeof useAppState>;
const Probe = () => ((app = useAppState()), null);
const load = () => (renderToString(h(AppStateProvider, null, h(Probe))), app);
const render = (el: ReturnType<typeof h>, path = "/", route = "/") =>
  renderToString(h(MemoryRouter, { initialEntries: [path] }, h(AppStateProvider, null, h(SheetProvider, null, h(AgentStateProvider, null, h(Routes, null, h(Route, { path: route, element: el })))))));
const visible = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\u00a0/g, " ").replace(/\s+/g, " ");

describe("the menu data", () => {
  it("every demo restaurant has drinks and desserts; real restaurants get none (no invented menus)", () => {
    for (const r of RESTAURANTS) {
      const xs = extrasFor(r.id);
      if (r.identity === "real") expect(xs).toEqual([]);
      else {
        expect(xs.filter((x) => x.kind === "drink").length).toBeGreaterThanOrEqual(2);
        expect(xs.filter((x) => x.kind === "dessert").length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(new Set(EXTRAS.map((x) => x.id)).size).toBe(EXTRAS.length);
    expect(EXTRAS.every((x) => RESTAURANTS.find((r) => r.id === x.restaurantId)?.identity === "demo")).toBe(true);
  });

  it("calories agree with the macros (4/4/9 kcal per g, ±6 kcal) and prices are real", () => {
    for (const x of EXTRAS) {
      const { calories, protein, carbs, fat } = x.nutrition;
      expect(Math.abs(calories - (4 * protein + 4 * carbs + 9 * fat)), x.id).toBeLessThanOrEqual(6);
      expect(x.price, x.id).toBeGreaterThan(0);
      expect(Number.isInteger(Math.round(x.price * 100))).toBe(true);
    }
  });

  it("they are never meals: the optimizer, MacroAgent's menu and recommendations only use dishes", () => {
    const ids = new Set(EXTRAS.map((x) => x.id));
    for (const sid of ["A", "B", "C", "D"] as const) {
      const r = runSearch(SCENARIOS[sid].target, SCENARIOS[sid].preferences);
      expect(r.ranked.some((c) => ids.has(c.meal.id))).toBe(false);
    }
    expect(RESTAURANTS.flatMap((r) => r.meals).some((m) => ids.has(m.id))).toBe(false);
    const ctx = { target: A.target, prefs: { ...A.preferences }, state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] } };
    const menu = executeTool("getMenu", { restaurantId: "fitkitchen" }, ctx).result as { dishes: { name: string }[] };
    const extraNames = new Set(EXTRAS.map((x) => x.name));
    expect(menu.dishes.length).toBeGreaterThan(0);
    expect(menu.dishes.some((d) => extraNames.has(d.name))).toBe(false);
  });
});

describe("choosing extras", () => {
  it("resolveExtras keeps only this restaurant's items, whole quantities 1–4, one line per item", () => {
    expect(resolveExtras("fitkitchen", [SHAKE, { id: "ub-x-kombucha", qty: 1 }, { id: "nope", qty: 1 }, { id: "fk-x-iced-green-tea", qty: 0 }])).toHaveLength(1);
    expect(resolveExtras("fitkitchen", [{ id: "fk-x-protein-shake", qty: 9 }])[0].qty).toBe(4);
    expect(resolveExtras("fitkitchen", [{ id: "fk-x-protein-shake", qty: 1.5 }])).toEqual([]);
    expect(resolveExtras("fitkitchen", [SHAKE, { id: "fk-x-protein-shake", qty: 3 }])).toHaveLength(1);
    expect(resolveExtras("fitkitchen", "junk" as never)).toEqual([]);
  });

  it("setExtras adds them to the current dish; ignored once ordered and during a research trial", () => {
    // One app instance (state is saved to storage in an effect, which server rendering doesn't run).
    persist({ selection: bowl() });
    const a = load();
    a.setExtras([SHAKE, BROWNIE, { id: "ub-x-kombucha", qty: 1 }]); // another restaurant's item is dropped
    a.setExtras([]); // ...and can be cleared again
    a.setExtras([SHAKE, BROWNIE]);
    a.placeOrder("pickup");
    expect(getOrders()[0].extras?.map((x) => [x.id, x.qty])).toEqual([["fk-x-protein-shake", 1], ["fk-x-protein-brownie", 2]]);
    a.setExtras([]); // the ordered attempt is immutable
    expect(a.placeOrder("pickup")).toBeNull();
    expect(getOrders()).toHaveLength(1);
    clearOrders();
    persist({ selection: bowl(), lock: lockOf });
    const t = load();
    t.setExtras([SHAKE]);
    t.placeOrder("pickup");
    expect("extras" in getOrders()[0]).toBe(false);
  });
});

describe("ordering and macro tracking", () => {
  it("the order keeps the dish and lists the extras; totals, ticket and today's nutrition include them", () => {
    persist({ selection: bowl({ extras: [SHAKE, BROWNIE] }) });
    const r = load().placeOrder("pickup")!;
    expect(r.research).toBe(false);
    const o = getOrders()[0];
    expect(o).toMatchObject({ nutrition: { calories: 682, protein: 49 }, price: 16.5, meetsTarget: true }); // the dish's own values
    expect(o.extras).toEqual([
      { id: "fk-x-protein-shake", kind: "drink", name: "Vanilla protein shake", qty: 1, price: 4.5, nutrition: { calories: 175, protein: 25, carbs: 12, fat: 3 } },
      { id: "fk-x-protein-brownie", kind: "dessert", name: "Protein brownie", qty: 2, price: 3.75, nutrition: { calories: 212, protein: 15, carbs: 20, fat: 8 } },
    ]);
    const t = orderTotals(o);
    expect(t).toEqual({ nutrition: { calories: 682 + 175 + 424, protein: 49 + 25 + 30, carbs: 72 + 12 + 40, fat: 20 + 3 + 16 }, price: 28.5 });
    const a = load();
    expect(a.ledger!.consumed).toEqual(t.nutrition); // macro tracking counts the drink and desserts
    expect(a.todayLog[0]).toMatchObject({ source: "order", nutrition: t.nutrition, extras: ["Vanilla protein shake", "2× Protein brownie"] });
    const ticket = visible(renderToString(h(KitchenTicket, { order: o })));
    expect(ticket).toContain("1× VANILLA PROTEIN SHAKE €4.50");
    expect(ticket).toContain("2× PROTEIN BROWNIE €7.50");
    expect(ticket).toContain("WITH DRINKS & DESSERTS: 1281 KCAL");
    expect(ticket).toMatch(/TOTAL \(SIMULATED\) €28\.50/);
    expect(visible(render(h(TodayLogPanel)))).toContain("With Vanilla protein shake · 2× Protein brownie");
  });

  it("a malformed stored extras line can't break today's totals", () => {
    const o = { nutrition: { calories: 100, protein: 10, carbs: 10, fat: 1 }, price: 5, extras: [null, { id: "x", kind: "drink", name: "X", qty: 1, price: 2 }, { id: "y", kind: "drink", name: "Y", qty: 2, price: 1, nutrition: { calories: 10, protein: 0, carbs: 2, fat: 0 } }] } as never;
    expect(orderTotals(o)).toEqual({ nutrition: { calories: 120, protein: 10, carbs: 14, fat: 1 }, price: 7 });
    expect(orderTotals({ nutrition: { calories: 1, protein: 0, carbs: 0, fat: 0 }, price: 1, extras: "junk" } as never).price).toBe(1);
    // Every screen that lists an order's extras survives it too: Today's log, the ticket.
    persist({ selection: bowl() });
    load().placeOrder("pickup");
    const stored = getOrders()[0];
    writeJSON("macrotable.orders.v1", [{ ...stored, extras: [null, { id: "x", name: "Broken" }, { id: "fk-x-protein-shake", kind: "drink", name: "Vanilla protein shake", qty: 1, price: 4.5, nutrition: { calories: 175, protein: 25, carbs: 12, fat: 3 } }] }]);
    expect(load().todayLog[0]).toMatchObject({ extras: ["Vanilla protein shake"], nutrition: { calories: 857 } });
    expect(visible(renderToString(h(KitchenTicket, { order: getOrders()[0] })))).toContain("1× VANILLA PROTEIN SHAKE");
  });

  it("without extras an order is exactly as before", () => {
    persist({ selection: bowl() });
    load().placeOrder("pickup");
    const o = getOrders()[0];
    expect("extras" in o).toBe(false);
    expect(orderTotals(o)).toEqual({ nutrition: o.nutrition, price: o.price });
    expect(load().ledger!.consumed).toEqual({ calories: 682, protein: 49, carbs: 72, fat: 20 });
  });

  it("a research trial never orders extras, even if some were passed or stored", () => {
    persist({ selection: bowl({ extras: [SHAKE] }), lock: lockOf });
    const r = load().placeOrder("pickup", undefined, { extras: [BROWNIE] })!;
    expect(r.research).toBe(true);
    expect("extras" in getOrders()[0]).toBe(false);
    expect(JSON.stringify(localStorage.getItem("macrotable.sessions.v2"))).not.toMatch(/fk-x-|shake|brownie/i);
  });

  it("MacroAgent: approving with extras orders them; without, the approval is unchanged", () => {
    persist({});
    const draft = { id: "d1", restaurantId: "fitkitchen", restaurantName: "FitKitchen", mealId: "fk-chicken-power-bowl", mealName: "Chicken Power Bowl", selections: BOWL, changes: [], nutrition: { calories: 682, protein: 49, carbs: 72, fat: 20 }, price: 16.5, provenance: "verified", mode: "pickup", status: "awaiting-approval", createdAt: Date.now() - 1000 };
    sessionStorage.setItem("macrotable.agent.v1", JSON.stringify({ messages: [], currentRestaurantId: "fitkitchen", scannedMenu: null, currentRecommendation: null, orderDrafts: [draft, { ...draft, id: "d2", selections: { ...BOWL, veg: "veg-std" } }], providerHistory: [] }));
    let agent!: ReturnType<typeof useAgent>;
    const AP = () => ((agent = useAgent()), null);
    renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(AgentStateProvider, null, h(AP)))));
    expect(agent.approveDraft("d1", undefined, [SHAKE])).not.toBeNull();
    expect(getOrders()[0].extras?.map((x) => x.id)).toEqual(["fk-x-protein-shake"]);
    expect(agent.approveDraft("d2")).not.toBeNull();
    expect("extras" in getOrders()[1]).toBe(false);
  });
});

describe("where people add them", () => {
  it("Review: an 'Add a drink or dessert' section; with extras, the whole order and a warning when it goes over (still allowed)", () => {
    persist({ selection: bowl() });
    const plain = visible(render(h(Review)));
    expect(plain).toContain("Add a drink or dessert");
    expect(plain).not.toContain("Your order · dish +");
    persist({ selection: bowl({ extras: [SHAKE, BROWNIE] }) });
    const html = render(h(Review));
    const t = visible(html);
    expect(t).toContain("3 added to your order");
    expect(t).toContain("Your order · dish + 3 extras €28.50");
    expect(t).toContain("1281 kcal · 104 g protein · 124 g carbs · 39 g fat");
    expect(t).toContain("581 kcal over what's left today and €10.50 over your €18 budget. You can still order it.");
    expect(html).toMatch(/<button[^>]*>.*Approve order/s);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?<\/svg>Approve order/s); // over the limit is a warning, not a block
  });

  it("Review in a research trial: no drinks or desserts at all", () => {
    persist({ selection: bowl({ extras: [SHAKE] }), lock: lockOf });
    const t = visible(render(h(Review)));
    expect(t).not.toMatch(/drink or dessert|Your order · dish/);
  });

  it("menu page: drinks & desserts listed; addable when a dish from this restaurant is chosen; never in a trial", () => {
    const page = () => visible(render(h(RestaurantPage), "/x/fitkitchen", "/x/:restaurantId"));
    persist({});
    expect(page()).toContain("Drinks & desserts");
    expect(page()).toContain("Choose a dish first, then add drinks and desserts to your order.");
    persist({ selection: bowl({ extras: [SHAKE] }) });
    const withDish = page();
    expect(withDish).toContain("Vanilla protein shake 330 ml · €4.50 175 kcal · P 25 g · C 12 g · F 3 g");
    expect(withDish).toContain("Added to your Chicken Power Bowl order.");
    persist({ lock: lockOf });
    expect(page()).not.toMatch(/Drinks & desserts|drink or dessert/);
  });

  it("an estimated (hand-off) restaurant marks its extras ≈", () => {
    persist({ selection: { mealId: "lg-chicken-salad", selections: {} } });
    const t = visible(render(h(RestaurantPage), "/x/localgrill", "/x/:restaurantId"));
    expect(t).toContain("≈ 140 kcal · P ≈ 0 g · C ≈ 35 g · F ≈ 0 g");
    expect(extrasTotals(resolveExtras("localgrill", [{ id: "lg-x-cola", qty: 2 }]))).toEqual({ nutrition: { calories: 280, protein: 0, carbs: 70, fat: 0 }, price: 5.5, count: 2 });
  });
});
