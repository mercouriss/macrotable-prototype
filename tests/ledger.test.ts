import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool, type ToolContext } from "../src/agent/tools";
import { MacroSummary } from "../src/components/MacroSummary";
import { SheetProvider } from "../src/components/Sheet";
import { TrialMacroSummary } from "../src/components/TrialMacroSummary";
import { getMeal } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { clearOrders, getOrders, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { clearLedger, consumedToday, dailyLedger, readLedger } from "../src/lib/ledger";
import { defaultSelections } from "../src/lib/nutrition";
import { Home } from "../src/screens/Home";
import { Review } from "../src/screens/Review";
import { Success } from "../src/screens/Success";
import { AppStateProvider, useAppState, type MealSelection } from "../src/state/AppState";
import type { Selections } from "../src/types";

/*
 * C: a confirmed order → today's nutrition ledger (normal/demo mode only).
 *   consumed today = eligible confirmed meals on today's local date since the reset boundary
 *   remaining today = base daily target − consumed today
 * Scenario A base: 700 kcal · ≥45 g protein · 75 g carbs · 22 g fat · €18.
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

const BASE = SCENARIOS.A.target; // 700 / 45 / 75 / 22
/** Scenario A's canonical configuration: 682 kcal · 49 g · 72 g · 20 g (€16.50). The listed dish is 890 / 39 / 105 / 31. */
const BOWL_CONFIGURED = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" };
const bowl = (selections: Selections = BOWL_CONFIGURED): MealSelection => ({ mealId: "fk-chicken-power-bowl", selections });
const salad = (): MealSelection => ({ mealId: "lg-chicken-salad", selections: {} }); // Local Grill: level 1 → counter hand-off

let app: ReturnType<typeof useAppState>;
function Probe() {
  app = useAppState();
  return null;
}
/** A fresh app instance reading everything from storage — i.e. a page load / refresh. */
const load = () => {
  renderToString(h(AppStateProvider, null, h(Probe)));
  return app;
};
const at = (y: number, mo: number, d: number, hh: number, mm = 0) => vi.setSystemTime(new Date(y, mo - 1, d, hh, mm));

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  clearOrders();
  clearLedger();
  vi.useFakeTimers({ toFake: ["Date"] });
  at(2026, 10, 2, 19, 0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("C: confirming an order deducts its FINAL configured nutrition, once", () => {
  it("before any order: remaining = the base target, nothing consumed (no fictional pre-logged food)", () => {
    const a = load();
    expect(a.ledger?.consumed).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(a.target).toEqual(BASE);
    expect(readFileSync("src/components/MacroSummary.tsx", "utf8")).not.toMatch(/LOGGED_TODAY|1400/);
  });

  it("base meal (dish as listed): remaining drops by the listed nutrition; past the target it's 0 with 'over'", () => {
    const meal = getMeal("fk-chicken-power-bowl")!.meal;
    expect(load().placeOrder("pickup", bowl(defaultSelections(meal)))).not.toBeNull();
    const l = load().ledger!;
    expect(l.consumed).toEqual({ calories: 890, protein: 39, carbs: 105, fat: 31 });
    expect(l.remaining).toMatchObject({ calories: 0, protein: 6, carbs: 0, fat: 0, maxBudget: 18 });
    expect(l.over).toEqual({ calories: 190, protein: 0, carbs: 30, fat: 9 });
  });

  it("meal with modifiers: the configured nutrition (682/49/72/20), not the listed dish (890/39/105/31)", () => {
    const r = load().placeOrder("pickup", bowl());
    expect(r?.order.nutrition).toEqual({ calories: 682, protein: 49, carbs: 72, fat: 20 });
    const a = load();
    expect(a.ledger!.consumed).toEqual({ calories: 682, protein: 49, carbs: 72, fat: 20 });
    expect(a.target).toMatchObject({ calories: 18, protein: 0, carbs: 3, fat: 2, maxBudget: 18, priority: BASE.priority });
    expect(a.ledger!.over.protein).toBe(4);
  });

  it("the order records whether it fit what was LEFT before it (not the base)", () => {
    expect(load().placeOrder("pickup", bowl())?.order.meetsTarget).toBe(true);
    expect(load().placeOrder("pickup", salad())?.order.meetsTarget).toBe(false); // only 18 kcal were left
  });

  it("refresh / reload: the same order is counted exactly once on every load", () => {
    load().placeOrder("pickup", bowl());
    for (let i = 0; i < 3; i++) expect(load().ledger!.consumed.calories).toBe(682);
    expect(getOrders()).toHaveLength(1);
  });

  it("reopening the success page (any number of times) only reads the order", () => {
    const n = load().placeOrder("pickup", bowl())!.order.orderNumber;
    for (let i = 0; i < 3; i++)
      renderToString(h(MemoryRouter, { initialEntries: [`/macrotable/success/${n}`] }, h(AppStateProvider, null, h(Routes, null, h(Route, { path: "/macrotable/success/:orderNumber", element: h(Success) })))));
    expect(getOrders()).toHaveLength(1);
    expect(load().ledger!.consumed.calories).toBe(682);
  });

  it("back / forward to checkout: the placed attempt can't be confirmed again (same session or after reload)", () => {
    const a = load();
    expect(a.placeOrder("pickup", bowl())).not.toBeNull();
    expect(a.placeOrder("pickup", bowl())).toBeNull(); // Back to Review → Approve again
    writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: BASE, prefs: SCENARIOS.A.preferences, lock: null, selection: { ...bowl(), placedOrderNumber: "MT1042" } });
    expect(load().placeOrder("pickup")).toBeNull(); // Forward/back after a reload: the stored attempt is already placed
    expect(getOrders()).toHaveLength(1);
    expect(load().ledger!.consumed.calories).toBe(682);
  });

  it("no deduction before confirmation: viewing, configuring, checkout, an agent draft and cancelling it", () => {
    writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: BASE, prefs: SCENARIOS.A.preferences, lock: null, selection: bowl() });
    // Checkout (Review) with a configured selection, rendered repeatedly:
    for (let i = 0; i < 2; i++) expect(renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(Review)))))).toMatch(/Chicken Power Bowl/);
    // The agent drafts an order and the user cancels it:
    const ctx: ToolContext = { target: load().target, prefs: { ...SCENARIOS.A.preferences }, state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] } };
    executeTool("optimizeMeal", {}, ctx);
    expect(executeTool("prepareOrder", { mode: "pickup" }, ctx).ok).toBe(true);
    ctx.state.orderDrafts = ctx.state.orderDrafts.map((d) => ({ ...d, status: "cancelled" as const }));
    expect(getOrders()).toHaveLength(0);
    expect(load().target).toEqual(BASE);
  });

  it("two distinct orders each count", () => {
    load().placeOrder("pickup", bowl());
    load().placeOrder("pickup", salad());
    const l = load().ledger!;
    expect(l.consumed).toEqual({ calories: 682 + 520, protein: 49 + 44, carbs: 72 + 22, fat: 20 + 28 });
    expect(l.remaining).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(l.over).toEqual({ calories: 502, protein: 48, carbs: 19, fat: 26 });
  });
});

describe("C: hand-offs", () => {
  it("a confirmed counter hand-off at a level-1 restaurant (Local Grill) counts", () => {
    const r = load().placeOrder("pickup", salad());
    expect(r?.order).toMatchObject({ handoff: true, serviceMode: "handoff" });
    expect(load().ledger!.consumed).toEqual({ calories: 520, protein: 44, carbs: 22, fat: 28 });
  });

  it("a confirmed scanned-menu hand-off (no order record) counts once per draft", () => {
    const a = load();
    a.recordCounterHandoff({ id: "draft-1", at: Date.now(), nutrition: { calories: 610, protein: 42, carbs: 55, fat: 22 } });
    a.recordCounterHandoff({ id: "draft-1", at: Date.now(), nutrition: { calories: 610, protein: 42, carbs: 55, fat: 22 } });
    expect(load().ledger!.consumed.calories).toBe(610);
    expect(readFileSync("src/agent/agentState.tsx", "utf8")).toMatch(/recordCounterHandoff\(\{ id: d\.id, at: Date\.now\(\), nutrition: d\.nutrition \}\)/);
  });
});

describe("C: days, reset and persistence", () => {
  it("persists across reloads and counts on the user's LOCAL date only; the next day starts clean", () => {
    at(2026, 10, 1, 23, 30);
    load().placeOrder("pickup", bowl()); // yesterday, late
    at(2026, 10, 2, 0, 30);
    load().placeOrder("pickup", salad()); // today, just after midnight
    at(2026, 10, 2, 19, 0);
    expect(load().ledger!.consumed.calories).toBe(520);
    at(2026, 10, 3, 8, 0);
    expect(load().ledger!.consumed.calories).toBe(0);
    expect(load().target).toEqual(BASE);
    expect(getOrders()).toHaveLength(2); // history is kept
  });

  it("Reset demo restores the base target and keeps the order history; later orders count again", () => {
    load().placeOrder("pickup", bowl());
    at(2026, 10, 2, 19, 5);
    expect(load().resetDemo()).toBe(true);
    expect(readLedger().since).toBe(Date.now());
    expect(load().target).toEqual(BASE);
    expect(getOrders()).toHaveLength(1);
    at(2026, 10, 2, 19, 10);
    load().placeOrder("pickup", salad());
    expect(load().ledger!.consumed.calories).toBe(520);
  });

  it("pure: idempotent by order number even if a record were stored twice", () => {
    load().placeOrder("pickup", bowl());
    const [o] = getOrders();
    expect(consumedToday([o, o], readLedger()).calories).toBe(682);
  });
});

describe("C: what the user sees, and what recommendations / the agent use", () => {
  const home = () => {
    writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true });
    return renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(Home))));
  };

  it("Home: ring, bars and numbers come from the same ledger (before → after an order → after reload)", () => {
    expect(home()).toMatch(/data-ledger-consumed="0" data-ledger-remaining="700"/);
    load().placeOrder("pickup", bowl());
    const html = home();
    expect(html).toMatch(/data-ledger-consumed="682" data-ledger-remaining="18"/);
    expect(html).toMatch(/>18<\/span><span[^>]*>kcal left</);
    expect(html).toMatch(/meals you confirmed in MacroTable today/);
  });

  it("over target: 'kcal over' with a full ring; no ring arc at all with nothing consumed", () => {
    const over = renderToString(h(MacroSummary, { ledger: dailyLedger(BASE, { calories: 890, protein: 39, carbs: 105, fat: 31 }) }));
    expect(over).toMatch(/>190<\/span><span[^>]*>kcal over</);
    expect(over).toMatch(/30(<!-- -->)? g <span[^>]*>over</);
    const empty = renderToString(h(MacroSummary, { ledger: dailyLedger(BASE, { calories: 0, protein: 0, carbs: 0, fat: 0 }) }));
    expect(empty.match(/<circle/g)).toHaveLength(1); // the track only
    expect(empty).toMatch(/>700<\/span><span[^>]*>kcal left</);
  });

  it("recommendations and the agent receive the remaining target (agent context = app.target)", () => {
    load().placeOrder("pickup", bowl());
    const a = load();
    expect(a.baseTarget).toEqual(BASE); // what Preferences edits
    const ctx: ToolContext = { target: a.target, prefs: a.prefs, state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] } };
    expect((executeTool("getUserContext", {}, ctx).result as { remaining: unknown }).remaining).toEqual({ calories: 18, protein_min_g: 0, carbs_g: 3, fat_g: 2 });
    expect(readFileSync("src/agent/agentState.tsx", "utf8")).toMatch(/target: appRef\.current\.target/);
    expect(readFileSync("src/screens/Preferences.tsx", "utf8")).toMatch(/baseTarget: target/);
  });
});

describe("C: research isolation", () => {
  const assignment = { participantId: "P001", condition: "macrotable" as const, scenarioId: "B" as const, agentMode: "offline" as const };

  it("during a trial: the assigned target exactly, no ledger — even after normal orders today", () => {
    load().placeOrder("pickup", bowl()); // a normal order earlier today
    const a = load();
    const lock = a.beginExperiment(assignment);
    writeJSON(STORAGE_KEYS.state, { scenarioId: "B", target: SCENARIOS.B.target, prefs: SCENARIOS.B.preferences, selection: null, lock });
    const t = load();
    expect(t.lock?.sessionId).toBe(lock.sessionId);
    expect(t.ledger).toBeNull();
    expect(t.target).toEqual(SCENARIOS.B.target);
    t.recordCounterHandoff({ id: "draft-trial", at: Date.now(), nutrition: { calories: 500, protein: 30, carbs: 40, fat: 10 } });
    expect(readLedger().handoffs).toHaveLength(0); // ignored in a trial
  });

  it("a research order never enters the normal ledger, during or after the trial", () => {
    const a = load();
    a.beginExperiment({ ...assignment, scenarioId: "A" });
    const r = a.placeOrder("pickup", bowl()); // completes the trial
    expect(r?.research).toBe(true);
    expect(r?.order.sessionId).toBeTruthy();
    const after = load(); // normal mode again
    expect(after.lock).toBeNull();
    expect(after.ledger!.consumed.calories).toBe(0);
    expect(after.target).toEqual(BASE);
  });
});

describe("C: locked research trials keep the frozen pre-repair Home presentation", () => {
  /** sha256 of the pre-repair MacroSummary render (b91e895) for each scenario's assigned target. */
  const PRE_REPAIR = {
    A: "1cd7ba692daa0c320ea8bd0214c49af6a4fa9ad79c721eea794f3d375a2222be",
    B: "831d26bf081a1e20845ec6f1027320ea152a6a21ff51760c1e888da228676033",
    C: "b1cbf168f2d2ad4b43580d940c67808c380752f8a33b54258144f1b91888da6c",
    D: "73ca41a7b057f667046a9b7f3de503e6da4ffa614fa9d9ec80713df43ebe51b7",
  } as const;
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const trialHome = (id: keyof typeof PRE_REPAIR) => {
    writeJSON(STORAGE_KEYS.state, { scenarioId: id, target: SCENARIOS[id].target, prefs: SCENARIOS[id].preferences, selection: null, lock: { participantId: "P001", condition: "macrotable", scenarioId: id, agentMode: "offline", sessionId: "s-fixed", startedAt: 1 } });
    return renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(Home))));
  };

  it.each(["A", "B", "C", "D"] as const)("scenario %s: the trial summary is byte-identical to the pre-repair render", (id) => {
    expect(sha(renderToString(h(TrialMacroSummary, { target: SCENARIOS[id].target })))).toBe(PRE_REPAIR[id]);
  });

  it("the locked trial Home shows it — unchanged by normal orders today — and never the ledger", () => {
    load().placeOrder("pickup", bowl()); // a normal order earlier today
    const html = trialHome("A");
    expect(html).toContain(renderToString(h(TrialMacroSummary, { target: SCENARIOS.A.target })));
    expect(html).toContain("Sample day — food logging is simulated in this prototype.");
    expect(html).not.toContain("data-ledger-consumed");
  });

  it("normal mode uses the real ledger, not the trial fixture", () => {
    writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true });
    const html = renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(Home))));
    expect(html).toContain('data-ledger-consumed="0"');
    expect(html).not.toContain(renderToString(h(TrialMacroSummary, { target: BASE })));
  });

  it("the display fixture lives only in the trial component, which only Home renders", () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
    const src = files("src").filter((f) => /\.tsx?$/.test(f));
    expect(src.filter((f) => /TRIAL_DISPLAY_LOGGED|LOGGED_TODAY|\b1400\b/.test(readFileSync(f, "utf8"))).sort()).toEqual([join("src", "components", "TrialMacroSummary.tsx")]);
    expect(src.filter((f) => readFileSync(f, "utf8").includes("components/TrialMacroSummary"))).toEqual([join("src", "screens", "Home.tsx")]);
  });
});

describe("C: protein is a minimum — reaching it reads as a goal met, not 'over'", () => {
  const summary = (protein: number) => renderToString(h(MacroSummary, { ledger: dailyLedger(BASE, { calories: 682, protein, carbs: 72, fat: 20 }) }));

  it("above the minimum: 'Goal met · +4 g' (state still records 4 g past the base)", () => {
    expect(dailyLedger(BASE, { calories: 682, protein: 49, carbs: 72, fat: 20 }).over.protein).toBe(4);
    const html = summary(49);
    expect(html).toMatch(/data-protein-goal="met"><span[^>]*>Goal met<\/span>(<!-- -->)? · \+4 g</);
    expect(html).not.toMatch(/4(<!-- -->)? g <span[^>]*>over</);
  });

  it("exactly at the minimum: 'Goal met' with no surplus; below it: 'N g left'", () => {
    expect(summary(45)).toMatch(/>Goal met<\/span>(<!-- -->)?<\/span>/);
    expect(summary(40)).toMatch(/5(<!-- -->)? g <span[^>]*>left</);
    expect(summary(40)).not.toContain("Goal met");
  });

  it("calories, carbs and fat keep the over-target wording", () => {
    const html = renderToString(h(MacroSummary, { ledger: dailyLedger(BASE, { calories: 1202, protein: 93, carbs: 94, fat: 48 }) }));
    expect(html).toMatch(/>502<\/span><span[^>]*>kcal over</);
    expect(html).toMatch(/19(<!-- -->)? g <span[^>]*>over</);
    expect(html).toMatch(/26(<!-- -->)? g <span[^>]*>over</);
    expect(html).toMatch(/Goal met<\/span>(<!-- -->)? · \+48 g/);
  });

  it("Home after the configured bowl: protein reads 'Goal met · +4 g'", () => {
    load().placeOrder("pickup", bowl());
    writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true });
    expect(renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(Home))))).toMatch(/Goal met<\/span>(<!-- -->)? · \+4 g/);
  });
});
