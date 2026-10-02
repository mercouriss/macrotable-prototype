import { afterEach, describe, expect, it } from "vitest";
import { GENERATION_CONFIG, MAX_TOOL_ROUNDS, runGeminiTurn } from "../src/agent/gemini";
import { runMockTurn } from "../src/agent/mock";
import { sanitizeRequest } from "../proxy/src/index";
import { overstatedConfidence, runAgentTurn, runContextTurn } from "../src/agent/orchestrator";
import { executeTool, type ToolContext } from "../src/agent/tools";
import type { AgentSessionState, ToolRun } from "../src/agent/types";
import { getMeal, setStudyScope } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { dailyLedger } from "../src/lib/ledger";
import { simulatedExtraction } from "../src/scan/menuExtraction";

/*
 * Final pre-demo blocker repairs found by the live soak / usability audit (2026-10-02):
 *   M1 offline follow-ups honour changed constraints;  M2 offline agent uses what's left after an order;
 *   M3 output ceiling 1024 → 2048 (thinking had used 981 of 1024 tokens);  M4 two negation patterns.
 */

const state = (): AgentSessionState => ({ messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] });
const ctxA = (): ToolContext => ({ target: { ...SCENARIOS.A.target }, prefs: { ...SCENARIOS.A.preferences }, state: state() });
const optCalls = (runs: ToolRun[]) => runs.filter((r) => r.name === "optimizeMeal").map((r) => r.args);
const T1 = "Find me a meal around 700 calories with at least 45g protein under €18.";
const T2 = "Actually my budget is €14 and I don't want rice.";
/** True if the configured dish contains no rice (no rice group, or rice set to a "none" option). */
const riceFree = (ctx: ToolContext) => {
  const rec = ctx.state.currentRecommendation!;
  const meal = getMeal(rec.mealId)?.meal;
  const rice = meal?.modifierGroups.filter((g) => /rice/i.test(g.name)) ?? [];
  return rice.every((g) => /none/i.test(rec.selections[g.id] ?? ""));
};
afterEach(() => setStudyScope(false));

describe("M1: an offline follow-up that changes constraints searches again (no false 'nothing fits')", () => {
  it.each([
    ["study", "localgrill", "Grilled Chicken Salad"],
    ["normal", "pastametrica", "Turkey Bolognese Rigatoni"],
  ] as const)("%s scope: T1 → 'budget €14 and no rice' keeps 700/45, sets €14, keeps no-rice, searches all stores", (scope, restaurantId, meal) => {
    setStudyScope(scope === "study");
    const ctx = ctxA();
    runMockTurn(T1, ctx);
    expect(ctx.state.currentRecommendation?.restaurantId).toBe("fitkitchen");
    const t = runMockTurn(T2, ctx);
    const call = optCalls(t.toolRuns).at(-1)!;
    expect(call).toMatchObject({ calories: 700, protein: 45, maxBudget: 14 });
    expect(call.restaurantId).toBeUndefined(); // not narrowed to the previous pick
    expect(call.adjustments).toContainEqual({ group: "rice", request: "none" });
    const rec = ctx.state.currentRecommendation!;
    expect(rec).toMatchObject({ restaurantId, mealName: meal });
    expect(rec.price).toBeLessThanOrEqual(14);
    expect(riceFree(ctx)).toBe(true);
    expect(t.text).not.toMatch(/isn't possible|No dish fits/);
  });

  it("(the defect, as observed in production) the reply no longer reports 'No dish fits' for the €14 / no-rice follow-up", async () => {
    setStudyScope(false);
    const ctx = ctxA();
    await runAgentTurn(T1, ctx, [], "offline");
    const o = await runAgentTurn(T2, ctx, [], "offline");
    expect(o.message.cards?.some((c) => c.kind === "notice")).toBe(false);
    expect(o.message.cards?.find((c) => c.kind === "recommendation")).toMatchObject({ rec: { mealName: "Turkey Bolognese Rigatoni", price: 13.5 } });
  });

  it("explicitly anchored (table QR / restaurant page): the new search stays at that restaurant", () => {
    const ctx = ctxA();
    runContextTurn("restaurant", ctx, "urbanbowl");
    const t = runMockTurn(T2, ctx);
    expect(optCalls(t.toolRuns).at(-1)).toMatchObject({ restaurantId: "urbanbowl", maxBudget: 14 });
  });

  it("a dish-only change the current dish can't meet only because of the budget falls through to a search", () => {
    const ctx = ctxA();
    executeTool("optimizeMeal", { restaurantId: "fitkitchen" }, ctx); // the FitKitchen bowl, €16.50
    ctx.target = { ...ctx.target, maxBudget: 14 }; // budget lowered in Preferences since
    const t = runMockTurn("no rice please", ctx);
    expect(optCalls(t.toolRuns)[0]).toMatchObject({ mealId: "fk-chicken-power-bowl" }); // tried the current dish first
    expect(optCalls(t.toolRuns).at(-1)!.restaurantId).toBeUndefined(); // then searched everywhere
    expect(ctx.state.currentRecommendation!.price).toBeLessThanOrEqual(14);
    expect(riceFree(ctx)).toBe(true);
    expect(t.text).not.toMatch(/isn't possible|No dish fits/);
  });

  it("kept: a plain dish tweak still re-optimises the current dish; an unsupported change is still explained", () => {
    const a = ctxA();
    runMockTurn(T1, a);
    const t = runMockTurn("I don't want rice. What can you do?", a);
    expect(optCalls(t.toolRuns)).toEqual([expect.objectContaining({ mealId: "fk-chicken-power-bowl" })]);
    const b = ctxA();
    runMockTurn("What's good at Urban Bowl?", b);
    expect(runMockTurn("less rice please", b).text).toMatch(/Urban Bowl doesn't offer a smaller rice option/);
  });

  it("never offers Prepare/Order for a pick over the budget that applies now (failed search keeps the old card)", async () => {
    setStudyScope(true);
    const ctx = ctxA();
    const first = await runAgentTurn(T1, ctx, [], "offline");
    expect(first.message.actions?.map((a) => a.kind)).toContain("prepare"); // control: €16.50 within €18
    const o = await runAgentTurn("Actually my budget is €9.", ctx, [], "offline"); // nothing in the study set is ≤ €9
    expect(ctx.state.currentRecommendation?.price).toBe(16.5); // the old pick is still the current card…
    expect(o.message.actions?.some((a) => a.kind === "prepare")).toBe(false); // …but can't be ordered from here
  });
});

describe("M2: after a confirmed meal the offline agent uses what's LEFT, not macros stated for the earlier meal", () => {
  const BASE = SCENARIOS.A.target;
  const ORDERED = { calories: 522, protein: 46, carbs: 37, fat: 19 }; // the bowl, no rice (+50 g chicken, light sauce, double veg)

  it("before an order: stated follow-up constraints are retained across turns", () => {
    const ctx = ctxA();
    runMockTurn("I want around 700 calories with at least 45 g protein, max €18", ctx);
    runMockTurn(T2, ctx);
    const t = runMockTurn("Something not too heavy", ctx);
    expect(optCalls(t.toolRuns).at(-1)).toMatchObject({ calories: 700, protein: 45, maxBudget: 14 });
    expect(ctx.state.stated).toMatchObject({ calories: 700, protein: 45, maxBudget: 14, avoid: ["rice"] });
  });

  it("after the order (700 → 178 kcal left): calories/protein come from the remaining target; budget and no-rice persist", () => {
    const ctx = ctxA();
    runMockTurn("I want around 700 calories with at least 45 g protein, max €18", ctx);
    runMockTurn(T2, ctx);
    ctx.target = dailyLedger(BASE, ORDERED).remaining; // what the app passes after the confirmed order
    expect(ctx.target).toMatchObject({ calories: 178, protein: 0 });
    const t = runMockTurn("What should I eat for my next meal?", ctx);
    const call = optCalls(t.toolRuns).at(-1)!;
    expect(call.calories).toBeUndefined(); // no stale 700 override…
    expect(call.protein).toBeUndefined(); // …or 45
    expect(call).toMatchObject({ maxBudget: 14 }); // a preference: persists
    expect(call.adjustments).toContainEqual({ group: "rice", request: "none" }); // a preference: persists
    const used = (t.toolRuns.filter((r) => r.name === "optimizeMeal").at(-1)!.result as { targetUsed: { calories: number; protein_min_g: number } }).targetUsed;
    expect(used).toMatchObject({ calories: 178, protein_min_g: 0 });
    expect(t.text).not.toMatch(/700/);
    expect(ctx.state.stated).toEqual({ maxBudget: 14, avoid: ["rice"], basis: { calories: 178, protein: 0 } });
  });

  it("diet flags persist through an order too; a calorie target stated AFTER the order applies", () => {
    const ctx = ctxA();
    runMockTurn("700 calories, 45 g protein, vegetarian please", ctx);
    ctx.target = dailyLedger(BASE, ORDERED).remaining;
    runMockTurn("What's next?", ctx);
    expect(ctx.state.stated).toMatchObject({ vegetarian: true });
    expect(ctx.state.stated?.calories).toBeUndefined();
    const t = runMockTurn("Make it around 400 calories", ctx);
    expect(optCalls(t.toolRuns).at(-1)).toMatchObject({ calories: 400, vegetarian: true });
  });

  it("an unchanged app target never drops anything (no order, no reset)", () => {
    const ctx = ctxA();
    runMockTurn("600 calories with at least 40g protein", ctx);
    runMockTurn("thanks!", ctx);
    expect(ctx.state.stated).toMatchObject({ calories: 600, protein: 40 });
  });
});

describe("M4: two more negation patterns; genuine claims are still flagged", () => {
  const studySalad = () => {
    setStudyScope(true);
    const ctx = ctxA();
    const runs = [executeTool("explainProvenance", { restaurantId: "localgrill", mealId: "lg-chicken-salad" }, ctx)];
    return (t: string) => overstatedConfidence(t, runs, ctx);
  };
  const scannedWrap = () => {
    const ctx = ctxA();
    ctx.state.scannedMenu = simulatedExtraction("s", 0);
    ctx.state.currentRestaurantId = "scan";
    const runs = [executeTool("optimizeMeal", { restaurantId: "scan" }, ctx), executeTool("explainProvenance", { restaurantId: "scan", mealId: "scan:i0" }, ctx)];
    return (t: string) => overstatedConfidence(t, runs, ctx);
  };

  it("soak S5 T1 (contrast): 'inferred … rather than verified kitchen recipes' is not a claim", () => {
    const check = studySalad();
    expect(check("The nutrition data for Local Grill's Grilled Chicken Salad is ESTIMATED. This means values are inferred from dish descriptions rather than verified kitchen recipes, so actual numbers may differ.")).toEqual([]);
    expect(check("The Grilled Chicken Salad uses estimates instead of verified data.")).toEqual([]);
  });

  it("soak N5 T2 (coordinated negation): 'cannot verify … or guarantee exact values' is not a claim", () => {
    const check = scannedWrap();
    expect(check("Additionally, Corner Café is not integrated with MacroTable, so we cannot verify their data directly or guarantee exact values.")).toEqual([]);
    expect(check("The Grilled Chicken Wrap's values can't be checked or guaranteed by MacroTable.")).toEqual([]);
    expect(check("The Grilled Chicken Wrap isn't measured nor verified by the restaurant.")).toEqual([]);
  });

  it.each([
    ["The Grilled Chicken Salad is ESTIMATED. This is verified.", /overstates the data for Grilled Chicken Salad/],
    ["The Grilled Chicken Salad is verified rather than estimated.", /overstates the data for Grilled Chicken Salad/],
    ["The Grilled Chicken Salad isn't cheap, but it's verified.", /overstates the data for Grilled Chicken Salad/],
    ["The Grilled Chicken Salad has no rice or sauce, and its data is verified.", /overstates the data for Grilled Chicken Salad/],
    ["The Grilled Chicken Salad is guaranteed 45 g protein.", /"guaranteed": nutrition is calculated or estimated, never exact/],
    ["The Grilled Chicken Salad has exactly 640 kcal.", /"exactly": nutrition is calculated or estimated, never exact/],
    ["We can't change the dressing, but the calories are exact.", /"exact": nutrition is calculated or estimated, never exact/],
  ])("still flagged: %s", (t, re) => expect(studySalad()(t).join(" ")).toMatch(re));
});

describe("M3: output-token ceiling leaves room for the visible answer after thinking", () => {
  it("the generation config is exactly { temperature: 0.2, maxOutputTokens: 2048 }; the round cap is still 6", () => {
    expect(GENERATION_CONFIG).toEqual({ temperature: 0.2, maxOutputTokens: 2048 });
    expect(MAX_TOOL_ROUNDS).toBe(6);
  });

  it("every live request carries 2048, and the deployed Worker's sanitizer passes it through unchanged", async () => {
    const sent: Record<string, unknown>[] = [];
    const fetchImpl = (async (_u: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Hello." }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await runGeminiTurn("hi", ctxA(), [], { proxyUrl: "https://proxy.test", fetchImpl });
    expect(sent[0].generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 2048 });
    expect(sanitizeRequest(sent[0]).generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 2048 });
  });

  it("the soak's cut-off request (981 thinking + 39 visible = 1020 of 1024) now has ~1000 tokens of headroom", () => {
    const soak = { thinking: 981, visible: 39, ceilingThen: 1024 };
    expect(soak.thinking + soak.visible).toBeGreaterThan(soak.ceilingThen - 8); // it hit the old ceiling
    expect(GENERATION_CONFIG.maxOutputTokens - (soak.thinking + soak.visible)).toBeGreaterThanOrEqual(1000);
  });
});
