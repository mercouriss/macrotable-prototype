import { afterEach, describe, expect, it } from "vitest";
import { runGeminiTurn } from "../src/agent/gemini";
import { runMockTurn } from "../src/agent/mock";
import { actionsFor, runContextTurn } from "../src/agent/orchestrator";
import { systemPrompt } from "../src/agent/systemPrompt";
import { executeTool, type ToolContext } from "../src/agent/tools";
import type { AgentSessionState } from "../src/agent/types";
import { setStudyScope } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { simulatedExtraction } from "../src/scan/menuExtraction";

/*
 * Presence vs reference. "Currently at" (currentRestaurantId) is where the user explicitly IS:
 * restaurant/QR/meal page, "Ask about X", a scanned menu. A recommendation is only something the
 * conversation refers back to (referenceRestaurantId) — it must never become presence, or the live
 * model narrows later cross-restaurant searches to it (Phase 2 A2/A3).
 */

const state = (): AgentSessionState => ({ messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] });
const ctxA = (): ToolContext => ({ target: { ...SCENARIOS.A.target }, prefs: { ...SCENARIOS.A.preferences }, state: state() });
afterEach(() => setStudyScope(false));

type Call = { name: string; args: Record<string, unknown> };
/** A scripted live model: per round either a tool call or the final text. Records each request. */
function scriptedProxy(rounds: (Call | string)[]) {
  const requests: { system: string; contents: unknown[] }[] = [];
  let i = 0;
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    requests.push({ system: body.systemInstruction.parts[0].text, contents: body.contents });
    const step = rounds[i++];
    const parts = typeof step === "string" ? [{ text: step }] : [{ functionCall: { id: `c${i}`, name: step.name, args: step.args } }];
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }], modelVersion: "scripted" }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}
const live = (text: string, ctx: ToolContext, history: unknown[][], rounds: (Call | string)[]) => {
  const p = scriptedProxy(rounds);
  return runGeminiTurn(text, ctx, history, { proxyUrl: "https://proxy.test", fetchImpl: p.fetchImpl }).then((t) => ({ ...t, requests: p.requests }));
};

describe("A: a recommendation is not presence", () => {
  it("A1 → A2: after a FitKitchen recommendation, A2 is NOT told it is 'Currently at' FitKitchen and searches every study restaurant", async () => {
    setStudyScope(true);
    const ctx = ctxA();
    const a1 = await live("Find me a meal around 700 calories with at least 45g protein under €18.", ctx, [], [
      { name: "optimizeMeal", args: { calories: 700, protein: 45, maxBudget: 18 } },
      "Chicken Power Bowl at FitKitchen: 682 kcal, 49 g protein, €16.50.",
    ]);
    expect(ctx.state.currentRecommendation?.restaurantId).toBe("fitkitchen");
    expect(ctx.state.currentRestaurantId).toBeNull(); // the defect: this used to become "fitkitchen"
    expect(ctx.state.referenceRestaurantId).toBe("fitkitchen");

    const a2 = await live("Actually my budget is €14 and I don't want rice.", ctx, [a1.contents], [
      { name: "getUserContext", args: {} },
      { name: "optimizeMeal", args: { calories: 700, protein: 45, maxBudget: 14, adjustments: [{ group: "rice", request: "none" }] } },
      "Grilled Chicken Salad at Local Grill.",
    ]);
    // Every request of turn 2 carried the neutral context, never the recommended restaurant.
    for (const r of a2.requests) {
      expect(r.system).toContain("- Currently at: no restaurant selected.");
      expect(r.system).not.toMatch(/Currently at: FitKitchen/);
    }
    expect((a2.toolRuns[0].result as { currentRestaurant: unknown }).currentRestaurant).toBeNull();
    // optimizeMeal without a restaurant covers all study restaurants → the Local Grill salad.
    const rec = (a2.toolRuns[1].result as { recommendation: { restaurant: string; meal: string; calories: number; protein_g: number; price_eur: number } }).recommendation;
    expect(rec).toMatchObject({ restaurant: "Local Grill", meal: "Grilled Chicken Salad", calories: 520, protein_g: 44, price_eur: 12.5 });
    expect(ctx.state.currentRestaurantId).toBeNull();
  });

  it("the prompt template and empty-state rendering are unchanged (no prompt edit)", () => {
    expect(systemPrompt(ctxA())).toContain("- Currently at: no restaurant selected.");
  });
});

describe("A: explicit restaurant / QR / meal / scan context is preserved", () => {
  it("restaurant page or table QR (demo restaurant): 'Currently at: FitKitchen', anchored, and it stays after a cross-store pick", () => {
    const ctx = ctxA();
    runContextTurn("restaurant", ctx, "fitkitchen");
    expect(ctx.state.currentRestaurantId).toBe("fitkitchen");
    expect(ctx.state.anchorRestaurantId).toBe("fitkitchen");
    expect(systemPrompt(ctx)).toContain("- Currently at: FitKitchen.");
    executeTool("optimizeMeal", { restaurantId: "localgrill" }, ctx); // a recommendation elsewhere
    expect(ctx.state.currentRecommendation?.restaurantId).toBe("localgrill");
    expect(systemPrompt(ctx)).toContain("- Currently at: FitKitchen."); // still physically at FitKitchen
  });

  it("meal page: presence is the meal's restaurant", () => {
    const ctx = ctxA();
    runContextTurn("meal", ctx, "lg-chicken-salad");
    expect(ctx.state.currentRestaurantId).toBe("localgrill");
    expect(ctx.state.anchorRestaurantId).toBe("localgrill");
    expect(systemPrompt(ctx)).toContain("- Currently at: Local Grill.");
  });

  it("real (unaffiliated) restaurant: presence, anchor and the scan quick reply, as before", () => {
    const ctx = ctxA();
    const o = runContextTurn("restaurant", ctx, "sallys-salads-eur");
    expect(ctx.state.currentRestaurantId).toBe("sallys-salads-eur");
    expect(systemPrompt(ctx)).toMatch(/- Currently at: Sally's Salads/);
    expect(o.message.actions?.[0]).toMatchObject({ label: "Scan the menu here" });
  });

  it("scanned menu: presence is the scan", () => {
    const ctx = ctxA();
    ctx.state.scannedMenu = simulatedExtraction("s1", 0);
    runContextTurn("scan", ctx);
    expect(ctx.state.currentRestaurantId).toBe("scan");
    expect(systemPrompt(ctx)).toContain("- Currently at: Corner Café (sample menu)");
  });

  it("study scope: an out-of-scope restaurant context never becomes presence during a trial", () => {
    setStudyScope(true);
    const ctx = ctxA();
    runContextTurn("restaurant", ctx, "pastametrica");
    expect(ctx.state.currentRestaurantId).toBeNull();
  });
});

describe("A: follow-ups still resolve the recommended restaurant (reference, not presence)", () => {
  const afterCrossStorePick = () => {
    const ctx = ctxA();
    const r = executeTool("optimizeMeal", {}, ctx);
    expect(r.ok).toBe(true);
    expect(ctx.state.currentRestaurantId).toBeNull();
    return ctx;
  };

  it("explainProvenance with no arguments explains the recommended restaurant", () => {
    const ctx = afterCrossStorePick();
    const r = executeTool("explainProvenance", {}, ctx);
    expect(r.ok).toBe(true);
    expect((r.result as { restaurant: string }).restaurant).toBe(ctx.state.currentRecommendation!.restaurantName);
  });

  it("offline 'show the menu' shows the recommended restaurant's menu (unchanged behaviour)", () => {
    const ctx = afterCrossStorePick();
    const t = runMockTurn("Show me the menu", ctx);
    const menu = t.toolRuns.find((r) => r.name === "getMenu");
    expect(menu?.args).toEqual({ restaurantId: ctx.state.currentRecommendation!.restaurantId });
  });

  it("sessions saved before this change (no referenceRestaurantId) fall back to the recommendation", () => {
    const ctx = afterCrossStorePick();
    delete ctx.state.referenceRestaurantId;
    const r = executeTool("explainProvenance", {}, ctx);
    expect((r.result as { restaurant: string }).restaurant).toBe(ctx.state.currentRecommendation!.restaurantName);
  });

  it("at a real restaurant, a fresh cross-store pick gets the recommendation's quick replies (as before), not only 'Scan'", () => {
    const ctx = ctxA();
    runContextTurn("restaurant", ctx, "sallys-salads-eur");
    const runs = [executeTool("optimizeMeal", {}, ctx)];
    expect(ctx.state.currentRestaurantId).toBe("sallys-salads-eur"); // still there…
    expect(actionsFor(ctx, runs).map((a) => a.label)).toContain("Why this?"); // …but the pick is actionable
  });

  it("explicitly opening a restaurant after a pick makes follow-ups refer to the opened one", () => {
    const ctx = afterCrossStorePick();
    runContextTurn("restaurant", ctx, "sallys-salads-eur");
    expect(actionsFor(ctx, []).map((a) => a.label)).toEqual(["Scan the menu here"]);
  });
});
