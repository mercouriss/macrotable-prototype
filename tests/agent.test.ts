import { describe, expect, it } from "vitest";
import { getMeal } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { runMockTurn, parseIntent } from "../src/agent/mock";
import { runGeminiTurn } from "../src/agent/gemini";
import { runAgentTurn, runContextTurn, unverifiedNumbers } from "../src/agent/orchestrator";
import { executeTool, type ToolContext } from "../src/agent/tools";
import type { AgentSessionState } from "../src/agent/types";
import { resolveAdjustment } from "../src/lib/optimizer";

const emptyState = (): AgentSessionState => ({ messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] });
const ctxA = (): ToolContext => ({ target: { ...SCENARIOS.A.target }, prefs: { ...SCENARIOS.A.preferences }, state: emptyState() });
const DEMO = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" };

describe("adjustments resolve only to supported options", () => {
  const bowl = getMeal("fk-chicken-power-bowl")!;
  const teriyaki = getMeal("ub-teriyaki-salmon")!;
  it("'less rice' at FitKitchen allows half or none", () => {
    expect(resolveAdjustment(bowl.meal, bowl.restaurant, { group: "rice", request: "less" })).toEqual({ ok: true, groupId: "rice", groupName: "Rice", allowed: ["rice-none", "rice-half"] });
  });
  it("refuses 'less rice' at Urban Bowl and names what is supported", () => {
    const r = resolveAdjustment(teriyaki.meal, teriyaki.restaurant, { group: "rice", request: "less" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/doesn't offer a smaller rice option/);
      expect(r.reason).toMatch(/Supported rice options: Standard/);
      expect(r.reason).toMatch(/Not offered: half rice/);
    }
  });
  it("refuses 'extra salmon' and unknown parts", () => {
    expect(resolveAdjustment(teriyaki.meal, teriyaki.restaurant, { group: "salmon", request: "more" }).ok).toBe(false);
    expect(resolveAdjustment(bowl.meal, bowl.restaurant, { group: "fries", request: "less" }).ok).toBe(false);
  });
});

describe("tools", () => {
  it("optimizeMeal returns the canonical Scenario A configuration with a recommendation card", () => {
    const ctx = ctxA();
    const r = executeTool("optimizeMeal", {}, ctx);
    expect(r.ok).toBe(true);
    expect(ctx.state.currentRecommendation).toMatchObject({ mealId: "fk-chicken-power-bowl", selections: DEMO, nutrition: { calories: 682, protein: 49, carbs: 72, fat: 20 }, price: 16.5, provenance: "verified" });
    expect(r.card?.kind).toBe("recommendation");
  });
  it("listNearbyStores ranks by fit and marks stores as fictional", () => {
    const r = executeTool("listNearbyStores", {}, ctxA());
    const res = r.result as { note: string; stores: { restaurantId: string; distanceKm: number }[] };
    expect(res.note).toMatch(/Fictional/);
    expect(res.stores[0].restaurantId).toBe("fitkitchen");
    expect(res.stores.every((s) => s.distanceKm > 0 && s.distanceKm < 2)).toBe(true);
  });
  it("prepareOrder only drafts, and hands off for non-integrated restaurants", () => {
    const ctx = ctxA();
    executeTool("optimizeMeal", {}, ctx);
    const p = executeTool("prepareOrder", { mode: "pickup" }, ctx);
    expect(p.result).toMatchObject({ draftCreated: true, requiresUserApproval: true, mode: "pickup" });
    expect(ctx.state.orderDrafts[0].status).toBe("awaiting-approval");
    const ctx2 = ctxA();
    executeTool("optimizeMeal", { restaurantId: "localgrill" }, ctx2);
    executeTool("prepareOrder", { mode: "pickup" }, ctx2);
    expect(ctx2.state.orderDrafts[0].mode).toBe("handoff");
  });
  it("unknown tools, dishes and restaurants are errors, never invented", () => {
    const ctx = ctxA();
    expect(executeTool("placeOrder", {}, ctx).ok).toBe(false);
    expect(executeTool("optimizeMeal", { mealId: "fk-lobster" }, ctx).ok).toBe(false);
    expect(executeTool("getMenu", { restaurantId: "burgerbar" }, ctx).ok).toBe(false);
  });
});

describe("offline MockAgent (same tools)", () => {
  it("handles the canonical demo request", () => {
    const ctx = ctxA();
    const t = runMockTurn("I have about 700 calories left and need at least 45g protein. I want something nearby.", ctx);
    expect(t.toolRuns.map((r) => r.name)).toEqual(["listNearbyStores", "optimizeMeal"]);
    expect(t.text).toMatch(/FitKitchen has the strongest VERIFIED match/);
    expect(t.text).toMatch(/682 kcal · 49 g protein · €16\.50/);
    expect(ctx.state.currentRecommendation?.selections).toEqual(DEMO);
  });
  it("'less rice' follow-up keeps a supported rice option", () => {
    const ctx = ctxA();
    runMockTurn("What should I eat near me?", ctx);
    const t = runMockTurn("Yes, but less rice", ctx);
    expect(["rice-half", "rice-none"]).toContain(ctx.state.currentRecommendation?.selections.rice);
    expect(t.text).toMatch(/re-optimised/);
  });
  it("explains unsupported requests instead of inventing them", () => {
    const ctx = ctxA();
    runMockTurn("What's good at Urban Bowl?", ctx);
    const t = runMockTurn("less rice please", ctx);
    expect(t.text).toMatch(/Urban Bowl doesn't offer a smaller rice option/);
  });
  it("prepares but never places an order", () => {
    const ctx = ctxA();
    runMockTurn("what should I eat", ctx);
    const t = runMockTurn("Prepare pickup", ctx);
    expect(t.text).toMatch(/Nothing is sent until you tap Approve/);
    expect(ctx.state.orderDrafts.at(-1)?.status).toBe("awaiting-approval");
  });
  it("parses numbers, preferences and adjustments", () => {
    expect(parseIntent("800 kcal, 55g protein, under €20, vegetarian, no sauce, extra chicken")).toMatchObject({
      calories: 800,
      protein: 55,
      maxBudget: 20,
      vegetarian: true,
      adjustments: [
        { group: "sauce", request: "none" },
        { group: "chicken", request: "more" },
      ],
    });
  });
});

describe("context turn (QR / restaurant entry)", () => {
  it("greets with the restaurant's best verified fit, no model needed", () => {
    const ctx = ctxA();
    const o = runContextTurn("restaurant", ctx, "fitkitchen");
    expect(o.message.provider).toBe("tools");
    expect(o.message.text).toMatch(/You're at FitKitchen\. You have 700 kcal and need ≥45 g protein\./);
    expect(o.message.text).toMatch(/682 kcal · 49 g protein · €16\.50/);
    expect(o.message.actions?.map((a) => a.label)).toContain("Prepare pickup");
  });
});

describe("Gemini provider loop (mocked proxy)", () => {
  it("executes tool calls locally and echoes model content + call ids back", async () => {
    const bodies: any[] = [];
    const responses = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "call-1", name: "optimizeMeal", args: {} }, thoughtSignature: "SIG123" }] } }], modelVersion: "gemini-3.8-flash" },
      { candidates: [{ content: { role: "model", parts: [{ text: "Chicken Power Bowl, 682 kcal and 49 g protein (VERIFIED)." }] }, finishReason: "STOP" }] },
    ];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(responses[bodies.length - 1]), { status: 200 });
    }) as unknown as typeof fetch;
    const ctx = ctxA();
    const g = await runGeminiTurn("What should I eat?", ctx, [], { proxyUrl: "https://proxy.test", fetchImpl });
    expect(g.text).toMatch(/682 kcal/);
    expect(g.toolRuns.map((r) => r.name)).toEqual(["optimizeMeal"]);
    const second = bodies[1];
    expect(second.contents[1]).toEqual({ role: "model", parts: [{ functionCall: { id: "call-1", name: "optimizeMeal", args: {} }, thoughtSignature: "SIG123" }] });
    expect(second.contents[2].parts[0].functionResponse.id).toBe("call-1");
    expect(JSON.stringify(second.contents[2].parts[0].functionResponse.response)).toMatch(/"calories":682/);
    expect(second.tools[0].functionDeclarations.map((d: any) => d.name)).toContain("prepareOrder");
    expect(JSON.stringify(bodies)).not.toMatch(/key/i);
  });

  it("falls back to the offline agent on failure, labels it, and rolls back partial tool effects", async () => {
    const ctx = ctxA();
    const out = await runAgentTurn("What should I eat near me?", ctx, [], "auto", {
      gemini: async (_t, c) => {
        executeTool("optimizeMeal", { restaurantId: "localgrill" }, c); // partial effect before failing
        throw new Error("Proxy HTTP 503");
      },
    });
    expect(out.message.provider).toBe("mock");
    expect(out.message.fallbackReason).toBe("Proxy HTTP 503");
    expect(ctx.state.currentRecommendation?.restaurantId).toBe("fitkitchen");
  });

  it("VERIFY flags numbers the tools never produced", () => {
    const ctx = ctxA();
    const run = executeTool("optimizeMeal", {}, ctx);
    expect(unverifiedNumbers("It has 682 kcal and 49 g protein for €16.50.", [run], ctx)).toEqual([]);
    expect(unverifiedNumbers("It has 613 kcal and €9.99.", [run], ctx)).toEqual(["613 kcal", "€9.99"]);
  });
});
