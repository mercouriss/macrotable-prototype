import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStateProvider } from "../src/agent/agentState";
import { runMockTurn } from "../src/agent/mock";
import { runContextTurn } from "../src/agent/orchestrator";
import { executeTool, type ToolContext } from "../src/agent/tools";
import type { AgentSessionState, ScannedItem } from "../src/agent/types";
import { AddToTodayConfirm, AgentCardView, FullScannedMenu } from "../src/components/agent/AgentCards";
import { SheetProvider } from "../src/components/Sheet";
import { SCENARIOS } from "../src/data/scenarios";
import { clearOrders, getOrders, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { clearLedger, isLogged, readLedger, scanLedgerId, scanMealEntry } from "../src/lib/ledger";
import { simulatedExtraction } from "../src/scan/menuExtraction";
import { AppStateProvider, useAppState } from "../src/state/AppState";

/*
 * "Add to today" on an external (scanned) menu: the user records the meal they actually chose, reusing the
 * daily ledger's non-order entry. Normal mode only; provenance is never upgraded; INSUFFICIENT can't be logged.
 * Sample menu (offline extraction): i0 Grilled Chicken Wrap 610/42/55/22 MENU-READ · i1 Falafel Plate
 * ESTIMATED (calories printed) · i2 Tuna Salad Bowl ESTIMATED · i3 Beef Burger & Fries MENU-READ ·
 * i4 Soup of the Day INSUFFICIENT.
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

const BASE = SCENARIOS.A.target; // 700 / 45 / 75 / 22
const menu = simulatedExtraction("scan-1", 0);
const item = (id: string) => menu.items.find((i) => i.id === id)! as ScannedItem;
let app: ReturnType<typeof useAppState>;
const Probe = () => ((app = useAppState()), null);
const load = () => (renderToString(h(AppStateProvider, null, h(Probe))), app);
const sheetMenu = () => renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(FullScannedMenu, { menu })))));
/** What the "Add to today" button does after the user confirms. */
const confirmAdd = (id: string) => load().recordCounterHandoff({ ...scanMealEntry(item(id), menu.scanId)!, at: Date.now() });
const agentState = (): AgentSessionState => ({ messages: [], currentRestaurantId: "scan", scannedMenu: menu, currentRecommendation: null, orderDrafts: [], providerHistory: [] });

describe("Add to today: offered only where nutrition can be logged", () => {
  it("each eligible scanned dish shows 'Add to today'; the INSUFFICIENT one explains why it can't", () => {
    expect(menu.items.map((i) => `${i.id}:${i.provenance}`)).toEqual(["i0:menu-read", "i1:estimated", "i2:estimated", "i3:menu-read", "i4:insufficient"]);
    const html = sheetMenu();
    expect(html.match(/data-add-today="offer"/g)).toHaveLength(4);
    expect(html.match(/data-add-today="unavailable"/g)).toHaveLength(1);
    expect(html).toContain("Not enough nutrition information to add this to today reliably.");
  });

  it("INSUFFICIENT can't become a ledger entry, and has no confirmation", () => {
    expect(scanMealEntry(item("i4"), menu.scanId)).toBeNull();
    expect(renderToString(h(SheetProvider, null, h(AddToTodayConfirm, { item: item("i4"), onCancel: () => {}, onAdd: () => {} })))).not.toContain("data-add-today");
  });
});

describe("The confirmation", () => {
  it("MENU-READ dish: name, all four macros, its own label and that it isn't an order", () => {
    const html = renderToString(h(SheetProvider, null, h(AddToTodayConfirm, { item: item("i0"), onCancel: () => {}, onAdd: () => {} })));
    expect(html).toContain("Grilled Chicken Wrap");
    expect(html).toContain("610 kcal · 42 g protein · 55 g carbs · 22 g fat");
    expect(html).toContain("MENU-READ");
    expect(html).toContain("Printed on the menu you scanned. Not verified by the restaurant.");
    expect(html).toContain("it isn&#x27;t an order, and nothing is sent to the restaurant");
    expect(html).not.toMatch(/VERIFIED[^.]|OFFICIAL/);
    expect(html).toMatch(/>Cancel<.*>Add to today</s);
  });

  it("ESTIMATED dish: stays ESTIMATED, with ≈ on estimated values and the estimate wording", () => {
    const html = renderToString(h(SheetProvider, null, h(AddToTodayConfirm, { item: item("i2"), onCancel: () => {}, onAdd: () => {} })));
    expect(html).toContain("ESTIMATED");
    expect(html).toContain("≈ ");
    expect(html).toContain("Estimated from the scanned menu. Actual nutrition may differ.");
    expect(html).toContain("Values marked ≈ are estimates.");
    expect(html).not.toMatch(/VERIFIED|OFFICIAL|MENU-READ/);
  });
});

describe("Logging updates the daily ledger once, as a non-order entry with its original provenance", () => {
  it("a recommendation alone changes nothing", () => {
    const ctx: ToolContext = { target: load().target, prefs: { ...SCENARIOS.A.preferences }, state: agentState() };
    runContextTurn("scan", ctx);
    expect(ctx.state.currentRecommendation?.mealName).toBe("Grilled Chicken Wrap");
    expect(load().ledger!.consumed.calories).toBe(0);
    expect(readLedger().handoffs).toHaveLength(0);
  });

  it("confirming adds the meal: consumed and remaining update (700 → 90 kcal left)", () => {
    expect(confirmAdd("i0")).toBeUndefined(); // the AppState wrapper returns nothing; the ledger decides
    const a = load();
    expect(a.ledger!.consumed).toEqual({ calories: 610, protein: 42, carbs: 55, fat: 22 });
    expect(a.target).toMatchObject({ calories: 90, protein: 3, carbs: 20, fat: 0 });
  });

  it("the entry keeps the dish's provenance (MENU-READ / ESTIMATED) and is marked as added manually", () => {
    confirmAdd("i0");
    confirmAdd("i2");
    const [wrap, tuna] = readLedger().handoffs;
    expect(wrap).toMatchObject({ id: scanLedgerId("scan-1", "i0"), name: "Grilled Chicken Wrap", provenance: "menu-read", source: "manual-scan" });
    expect(tuna).toMatchObject({ name: "Tuna Salad Bowl", provenance: "estimated", source: "manual-scan" });
  });

  it("repeated taps and reloads never double count; the row then shows 'Added to today'", () => {
    for (let i = 0; i < 3; i++) confirmAdd("i0");
    for (let i = 0; i < 2; i++) expect(load().ledger!.consumed.calories).toBe(610);
    expect(readLedger().handoffs).toHaveLength(1);
    expect(isLogged(scanLedgerId("scan-1", "i0"))).toBe(true);
    const html = sheetMenu();
    expect(html.match(/data-add-today="added"/g)).toHaveLength(1);
    expect(html.match(/data-add-today="offer"/g)).toHaveLength(3);
  });

  it("the agent's counter hand-off and Add to today for the same dish count once (shared per-dish id)", () => {
    expect(readFileSync("src/agent/agentState.tsx", "utf8")).toMatch(/id: scan \? scanLedgerId\(scan\.scanId, d\.mealId\) : d\.id/);
    confirmAdd("i0");
    load().recordCounterHandoff({ id: scanLedgerId(menu.scanId, "scan:i0"), at: Date.now(), nutrition: item("i0").nutrition!, source: "counter-handoff" });
    expect(load().ledger!.consumed.calories).toBe(610);
  });

  it("logging creates no order, ticket or transaction", () => {
    confirmAdd("i0");
    expect(getOrders()).toHaveLength(0);
    expect(readFileSync("src/components/agent/AgentCards.tsx", "utf8")).not.toMatch(/AddToToday[\s\S]{0,1500}placeOrder/);
  });

  it("the next recommendation uses the updated remaining target through the existing state", () => {
    confirmAdd("i0");
    const target = load().target; // what the agent and Home receive
    const ctx: ToolContext = { target, prefs: { ...SCENARIOS.A.preferences }, state: { ...agentState(), currentRestaurantId: null, scannedMenu: null } };
    expect((executeTool("getUserContext", {}, ctx).result as { remaining: { calories: number } }).remaining.calories).toBe(90);
    const t = runMockTurn("What should I eat next?", ctx);
    const used = (t.toolRuns.filter((r) => r.name === "optimizeMeal").at(-1)!.result as { targetUsed: { calories: number } }).targetUsed;
    expect(used.calories).toBe(90);
  });
});

describe("Research isolation", () => {
  const lockOf = { participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "offline", sessionId: "s-fixed", startedAt: 1 };

  it("a locked trial's scan card has no Add to today (trials see the plain list), and logging is refused", () => {
    writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: BASE, prefs: SCENARIOS.A.preferences, selection: null, lock: lockOf });
    sessionStorage.setItem("macrotable.agent.v1", JSON.stringify(agentState()));
    const html = renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(AgentStateProvider, null, h(AgentCardView, { card: { kind: "scan", scanId: "scan-1" }, messageId: "m1", index: 0 } as never))))));
    expect(html).toContain("Grilled Chicken Wrap");
    expect(html).not.toContain("data-add-today");
    expect(html).not.toContain("Add to today");
    load().recordCounterHandoff({ ...scanMealEntry(item("i0"), menu.scanId)!, at: Date.now() });
    expect(readLedger().handoffs).toHaveLength(0);
  });
});
