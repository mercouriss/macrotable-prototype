import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool, type ToolContext } from "../src/agent/tools";
import { TodayLogPanel } from "../src/components/FoodLog";
import { MacroSummary } from "../src/components/MacroSummary";
import { SheetProvider } from "../src/components/Sheet";
import { DEMO_DAYS, demoDayFor } from "../src/data/demoDays";
import { RESTAURANTS } from "../src/data/restaurants";
import { SCENARIO_IDS, SCENARIOS } from "../src/data/scenarios";
import { clearOrders, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { clearLedger, dailyLedger } from "../src/lib/ledger";
import { runSearch } from "../src/lib/optimizer";
import { Home } from "../src/screens/Home";
import { Preferences } from "../src/screens/Preferences";
import { AppStateProvider, useAppState } from "../src/state/AppState";

/*
 * Demo days (normal mode only): each scenario's earlier meals explain its starting "remaining today":
 *   full-day target − earlier today = scenario target.
 * Display only — the ledger, targets, optimizer, MacroAgent and research are exactly as before.
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

let app: ReturnType<typeof useAppState>;
const Probe = () => ((app = useAppState()), null);
const load = () => (renderToString(h(AppStateProvider, null, h(Probe))), app);
const persist = (id: "A" | "B" | "C" | "D", extra: Record<string, unknown> = {}) =>
  writeJSON(STORAGE_KEYS.state, { scenarioId: id, target: SCENARIOS[id].target, prefs: SCENARIOS[id].preferences, selection: null, lock: null, ...extra });
const page = (el: ReturnType<typeof h>) => {
  writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true });
  return renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, el))));
};
const M = ["calories", "protein", "carbs", "fat"] as const;
const lockOf = { participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "offline", sessionId: "s-fixed", startedAt: 1 };

describe("Arithmetic: full day − earlier today = the scenario's starting remaining state, exactly", () => {
  const approved = {
    A: { day: [2200, 150, 240, 70], earlier: [1500, 105, 165, 48] },
    B: { day: [2300, 160, 260, 60], earlier: [1500, 105, 170, 40] },
    C: { day: [2000, 110, 245, 65], earlier: [1350, 70, 170, 45] },
    D: { day: [1800, 140, 190, 60], earlier: [1350, 75, 150, 48] },
  } as const;

  it.each(SCENARIO_IDS)("Scenario %s reconciles for kcal, protein, carbs and fat", (id) => {
    const d = demoDayFor(id, SCENARIOS[id].target)!;
    expect(M.map((k) => d.day[k])).toEqual(approved[id].day);
    expect(M.map((k) => d.earlier[k])).toEqual(approved[id].earlier);
    for (const k of M) {
      expect(d.day[k] - d.earlier[k]).toBe(SCENARIOS[id].target[k]);
      expect(d.earlier[k]).toBe(DEMO_DAYS[id].reduce((s, m) => s + m.nutrition[k], 0));
    }
  });

  it("2–4 ordinary earlier meals per scenario; whole, non-negative values; plausible energy; no restaurant names", () => {
    const restaurantNames = RESTAURANTS.map((r) => r.name.toLowerCase());
    for (const id of SCENARIO_IDS) {
      expect(DEMO_DAYS[id].length).toBeGreaterThanOrEqual(2);
      expect(DEMO_DAYS[id].length).toBeLessThanOrEqual(4);
      for (const m of DEMO_DAYS[id]) {
        for (const k of M) expect(Number.isInteger(m.nutrition[k]) && m.nutrition[k] >= 0).toBe(true);
        const fromMacros = 4 * m.nutrition.protein + 4 * m.nutrition.carbs + 9 * m.nutrition.fat;
        expect(Math.abs(fromMacros - m.nutrition.calories) / m.nutrition.calories).toBeLessThan(0.06); // no impossible foods
        expect(restaurantNames.some((n) => m.name.toLowerCase().includes(n))).toBe(false);
        expect(m.time).toMatch(/^\d{2}:\d{2}$/);
      }
      const times = DEMO_DAYS[id].map((m) => m.time);
      expect([...times].sort()).toEqual(times);
    }
  });

  it("only the four scenarios have a demo day; an unknown or inherited id gets none", () => {
    for (const bad of ["toString", "constructor", "__proto__", "E"]) expect(demoDayFor(bad as never, SCENARIOS.A.target)).toBeNull();
  });

  it("Scenario C's demo day is vegetarian; Scenario D stays infeasible", () => {
    expect(DEMO_DAYS.C.map((m) => m.name).join(" ")).not.toMatch(/chicken|tuna|beef|turkey|ham|fish|salmon|pork/i);
    expect(runSearch(SCENARIOS.D.target, SCENARIOS.D.preferences).anyMeetsTarget).toBe(false);
  });
});

describe("Display only: the decision inputs are exactly the scenario's, as before", () => {
  it.each(SCENARIO_IDS)("Scenario %s: same target, same live ledger, same MacroAgent context; the demo day is extra", (id) => {
    persist(id);
    const a = load();
    expect(a.target).toEqual(SCENARIOS[id].target); // what Find My Next Meal and MacroAgent receive
    expect(a.ledger!.base).toEqual(SCENARIOS[id].target);
    expect(a.ledger!.consumed).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 }); // earlier meals are not ledger consumption
    expect(a.todayLog).toEqual([]);
    expect(a.demoDay!.meals).toBe(DEMO_DAYS[id]);
    const ctx: ToolContext = { target: a.target, prefs: a.prefs, state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] } };
    const r = executeTool("getUserContext", {}, ctx).result as { remaining: { calories: number; protein_min_g: number } };
    expect(r.remaining).toMatchObject({ calories: SCENARIOS[id].target.calories, protein_min_g: SCENARIOS[id].target.protein });
    expect(JSON.stringify(r)).not.toMatch(/earlier|demo day|Granola|Croissant|Porridge|omelette/i);
  });

  it("never stored: no earlier meal reaches storage, even after logging food", () => {
    persist("A");
    load().addFood({ name: "Banana", nutrition: { calories: 105, protein: 1, carbs: 27, fat: 0 }, source: "manual-food" });
    const stored = JSON.stringify(Object.fromEntries([...Array(localStorage.length)].map((_, i) => [localStorage.key(i), localStorage.getItem(localStorage.key(i)!)])));
    for (const m of DEMO_DAYS.A) expect(stored).not.toContain(m.name);
    expect(load().ledger!.consumed.calories).toBe(105); // counted once, live only
    expect(load().target.calories).toBe(595);
  });

  it("Home's ring and bars show the whole day; the numbers are unchanged; without earlier meals the markup is unchanged", () => {
    const l = dailyLedger(SCENARIOS.A.target, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(renderToString(h(MacroSummary, { ledger: l, earlier: { calories: 0, protein: 0, carbs: 0, fat: 0 } }))).toBe(renderToString(h(MacroSummary, { ledger: l })));
    const withDay = renderToString(h(MacroSummary, { ledger: l, earlier: demoDayFor("A", SCENARIOS.A.target)!.earlier }));
    expect(withDay).toMatch(/>700<\/span><span[^>]*>kcal left</);
    expect(withDay).toMatch(/stroke-dasharray/); // 1,500 of 2,200 eaten
    const over = dailyLedger(SCENARIOS.A.target, { calories: 800, protein: 50, carbs: 80, fat: 30 });
    const overHtml = renderToString(h(MacroSummary, { ledger: over, earlier: demoDayFor("A", SCENARIOS.A.target)!.earlier }));
    expect(overHtml).toMatch(/>100<\/span><span[^>]*>kcal over</);
    expect(overHtml).toMatch(/Goal met<\/span>(<!-- -->)? · \+5 g/);
  });
});

describe("Today's log, Home and Preferences", () => {
  it("'Earlier today · Demo day': time, name, macros; no Remove, no source or provenance labels", () => {
    persist("C");
    load().addFood({ name: "Banana", nutrition: { calories: 105, protein: 1, carbs: 27, fat: 0 }, source: "manual-food" });
    const html = page(h(TodayLogPanel));
    expect(html).toContain("Earlier today · Demo day");
    const section = html.slice(html.indexOf("data-demo-day"));
    for (const m of DEMO_DAYS.C) expect(section).toContain(m.name);
    expect(section).toContain("16:00");
    expect(section.match(/data-entry-source="demo-day"/g)).toHaveLength(4);
    expect(section).not.toMatch(/Remove|Added by you|Ordered in MacroTable|MENU-READ|ESTIMATED|VERIFIED|scanned/);
    expect(html.match(/aria-label="Remove /g)).toHaveLength(1); // only the user's banana
  });

  it("Home footer and Preferences explain the full day; the editable fields keep meaning the scenario target", () => {
    persist("B");
    expect(page(h(Home))).toMatch(/Your 2,300 kcal day minus what you&#x27;ve eaten: earlier meals \(demo day\)/);
    const prefs = page(h(Preferences));
    expect(prefs).toContain(">For the rest of today<");
    expect(prefs).toMatch(/Your full day: <span[^>]*>2,300<!-- --> kcal<\/span> · ≥<!-- -->160<!-- --> g protein/);
    expect(prefs).toMatch(/value="800"/); // the calories field still holds the scenario target
  });
});

describe("Existing state contracts are unchanged", () => {
  it("switching scenario: the demo day follows the scenario; live entries behave exactly as before (they persist)", () => {
    persist("A");
    load().addFood({ name: "Banana", nutrition: { calories: 105, protein: 1, carbs: 27, fat: 0 }, source: "manual-food" });
    persist("B"); // what setScenario commits (initialFor) — the ledger is not touched, as in 20454f7
    const b = load();
    expect(b.demoDay!.meals).toBe(DEMO_DAYS.B);
    expect(b.todayLog.map((e) => e.name)).toEqual(["Banana"]);
    expect(b.target.calories).toBe(800 - 105);
    expect(readFileSync("src/state/AppState.tsx", "utf8")).toMatch(/setScenario: \(id\) => \{\s*if \(stateRef\.current\.lock\) return;\s*commit\(initialFor\(id\)\);\s*\}/);
  });

  it("Reset demo: unchanged contract (Scenario A, fresh live day) — A's demo day shows, no duplicates", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0));
    persist("C");
    load().addFood({ name: "Banana", nutrition: { calories: 105, protein: 1, carbs: 27, fat: 0 }, source: "manual-food" });
    vi.setSystemTime(new Date(2026, 9, 6, 12, 5));
    for (let i = 0; i < 3; i++) expect(load().resetDemo()).toBe(true);
    persist("A"); // what Reset demo commits (initialFor("A")), persisted by an effect in the browser
    const a = load();
    expect(a.todayLog).toEqual([]);
    expect(a.demoDay!.meals).toHaveLength(4);
    expect(a.target).toEqual(SCENARIOS.A.target);
    expect(readFileSync("src/state/AppState.tsx", "utf8")).toMatch(/resetDemo: \(\) => \{[\s\S]*?commit\(\{ \.\.\.initialFor\("A"\), demoEpoch/);
  });
});

describe("Research isolation", () => {
  it("a trial has no demo day anywhere; scenarios and the fingerprint inputs are untouched", () => {
    persist("A", { lock: lockOf });
    expect(load().demoDay).toBeNull();
    const html = page(h(Home)) + page(h(Preferences));
    expect(html).not.toMatch(/Earlier today|demo day|data-full-day|data-demo-day|For the rest of today|Granola/);
    expect(html).toContain("Remaining today");
    expect(readFileSync("src/data/scenarios.ts", "utf8")).not.toMatch(/demoDay|DEMO_DAYS|earlier/i);
    expect(readFileSync("src/lib/research.ts", "utf8")).not.toMatch(/demoDays|DEMO_DAYS/);
    expect(readFileSync("src/lib/freeze.ts", "utf8")).not.toMatch(/demoDays|DEMO_DAYS/);
  });
});
