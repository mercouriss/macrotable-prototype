import { readFileSync } from "node:fs";
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
  it("listNearbyStores ranks by fit and separates demo brands from real, unaffiliated restaurants", () => {
    const r = executeTool("listNearbyStores", {}, ctxA());
    const res = r.result as { note: string; stores: { restaurantId: string; distanceKm: number; identity: string; best?: unknown; note?: string; levelLabel: string }[] };
    expect(res.note).toMatch(/fictional brands/);
    expect(res.note).toMatch(/NOT affiliated/);
    expect(res.stores[0].restaurantId).toBe("fitkitchen");
    const real = res.stores.filter((s) => s.identity === "real");
    expect(real.length).toBe(3);
    for (const s of real) {
      expect(s.best).toBeUndefined();
      expect(s.levelLabel).toBe("Real restaurant · not affiliated");
      expect(s.note).toMatch(/no menu, nutrition, prices or ordering/);
    }
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
    expect(t.text).toMatch(/FitKitchen has the strongest DEMO VERIFIED match/);
    expect(t.text).toMatch(/real restaurants nearby aren't affiliated/);
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
    expect(JSON.stringify(bodies)).not.toMatch(/api[_-]?key|x-goog-api-key|[?&]key=/i);
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

describe("real restaurants: identity only, never invented data", () => {
  it("carry verified identity/location sources and no menu, prices, hours or pickup claims", async () => {
    const { RESTAURANTS, MENU_RESTAURANTS } = await import("../src/data/restaurants");
    const real = RESTAURANTS.filter((r) => r.identity === "real");
    expect(real.length).toBeGreaterThanOrEqual(15);
    expect(real.map((r) => r.name)).toEqual(expect.arrayContaining(["Sally's Salads", "Mozza", "Erasmus Paviljoen"]));
    expect(new Set(real.map((r) => r.id)).size).toBe(real.length);
    for (const r of real) {
      expect(r.meals).toEqual([]);
      expect(r.priceRange).toBeUndefined();
      expect(r.pickupMinutes).toBeUndefined();
      expect(r.serviceModes).toEqual([]);
      expect(r.real?.website).toMatch(/^https:\/\//);
      expect(r.real?.osm).toMatch(/^node\/\d+$/);
      expect(r.real?.verifiedOn).toBe("2026-09-29");
      expect(r.real?.sources.length).toBeGreaterThanOrEqual(2);
      expect(r.brand).toBeUndefined();
    }
    expect(MENU_RESTAURANTS.every((r) => r.identity === "demo")).toBe(true);
  });

  it("getMenu refuses to produce a menu for a real restaurant", () => {
    const r = executeTool("getMenu", { restaurantId: "mozza-eur" }, ctxA());
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.result)).toMatch(/not affiliated/);
  });

  it("agent opened at a real restaurant offers the scan path instead of a recommendation", () => {
    const ctx = ctxA();
    const o = runContextTurn("restaurant", ctx, "sallys-salads-eur");
    expect(o.message.text).toMatch(/real restaurant that isn't affiliated with MacroTable/);
    expect(o.message.text).not.toMatch(/kcal ·/);
    expect(o.message.actions?.[0]).toMatchObject({ kind: "navigate", label: "Scan the menu here", to: "/macrotable/scan?type=menu&restaurant=sallys-salads-eur" });
    expect(ctx.state.currentRecommendation).toBeNull();
  });

  it("the offline agent never invents a real restaurant's menu", () => {
    const t = runMockTurn("What should I get at Mozza?", ctxA());
    expect(t.text).toMatch(/isn't affiliated with MacroTable, so I have no menu/);
  });

  it("simulated data is labelled DEMO, scanned data is not", async () => {
    const { provenanceLabel } = await import("../src/lib/provenance");
    expect([provenanceLabel("verified"), provenanceLabel("official"), provenanceLabel("menu-read"), provenanceLabel("estimated")]).toEqual(["DEMO VERIFIED", "DEMO OFFICIAL", "MENU-READ", "ESTIMATED"]);
    const r = executeTool("optimizeMeal", {}, ctxA());
    expect(JSON.stringify(r.result)).toMatch(/"provenance":"DEMO VERIFIED"/);
  });
});

describe("visible agent steps map 1:1 to real activity", () => {
  it("context turn lists only the steps that ran", () => {
    const o = runContextTurn("restaurant", ctxA(), "fitkitchen");
    expect(o.message.steps).toEqual(["Optimized supported configuration", "Checked constraints"]);
    const p = runContextTurn("prepare", (() => { const c = ctxA(); executeTool("optimizeMeal", {}, c); return c; })(), "pickup");
    expect(p.message.steps).toEqual(["Checked constraints", "Ready for approval"]);
  });

  it("live progress reports model calls and tool executions in order", async () => {
    const responses = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "a", name: "listNearbyStores", args: {} } }, { functionCall: { id: "b", name: "optimizeMeal", args: {} } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "FitKitchen, 682 kcal." }] } }] },
    ];
    let i = 0;
    const fetchImpl = (async () => new Response(JSON.stringify(responses[i++]), { status: 200 })) as unknown as typeof fetch;
    const seen: string[] = [];
    const out = await runAgentTurn("near me?", ctxA(), [], "auto", {
      gemini: (t, c, h, o) => runGeminiTurn(t, c, h, { ...o, proxyUrl: "https://proxy.test", fetchImpl }),
      onProgress: (l) => seen.push(l),
    });
    expect(seen).toEqual(["Understanding request", "Checking restaurants", "Optimizing supported configuration", "Writing reply", "Checking constraints"]);
    expect(out.message.steps).toEqual(["Checked restaurants", "Optimized supported configuration", "Checked constraints"]);
  });
});

describe("proxy engine metadata (X-MacroTable-Model / X-MacroTable-Model-Fallback)", () => {
  const answer = { candidates: [{ content: { role: "model", parts: [{ text: "FitKitchen, 682 kcal." }] } }] };
  const call = { candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "c1", name: "optimizeMeal", args: {} } }] } }] };
  /** One scripted proxy response per model round, each with its own headers. */
  const proxy = (...rounds: { body: unknown; headers?: Record<string, string> }[]) => {
    let i = 0;
    return (async () => {
      const r = rounds[i++];
      return new Response(JSON.stringify(r.body), { status: 200, headers: r.headers });
    }) as unknown as typeof fetch;
  };
  const turn = (fetchImpl: typeof fetch) => runGeminiTurn("near me?", ctxA(), [], { proxyUrl: "https://proxy.test", fetchImpl });

  it("primary model: reads the model id from the header and records no fallback", async () => {
    const g = await turn(proxy({ body: answer, headers: { "X-MacroTable-Model": "gemini-3.8-flash", "X-MacroTable-Model-Fallback": "0" } }));
    expect(g.model).toBe("gemini-3.8-flash");
    expect(g.modelFallback).toBe(false);
  });

  it("secondary model: header fallback=1 marks the turn as answered by the fallback model", async () => {
    const g = await turn(proxy({ body: answer, headers: { "X-MacroTable-Model": "gemini-2.5-flash", "X-MacroTable-Model-Fallback": "1" } }));
    expect(g.model).toBe("gemini-2.5-flash");
    expect(g.modelFallback).toBe(true);
  });

  it("a fallback in any round of a multi-round turn marks the whole turn", async () => {
    const g = await turn(
      proxy(
        { body: call, headers: { "X-MacroTable-Model": "gemini-2.5-flash", "X-MacroTable-Model-Fallback": "1" } },
        { body: answer, headers: { "X-MacroTable-Model": "gemini-3.8-flash", "X-MacroTable-Model-Fallback": "0" } },
      ),
    );
    expect(g.toolRuns.map((r) => r.name)).toEqual(["optimizeMeal"]);
    expect(g.modelFallback).toBe(true);
  });

  it("Gemini's own modelVersion wins over the header; no headers (older Worker) → primary, no fallback", async () => {
    const withVersion = await turn(proxy({ body: { ...answer, modelVersion: "gemini-3.8-flash-001" }, headers: { "X-MacroTable-Model": "gemini-3.8-flash", "X-MacroTable-Model-Fallback": "0" } }));
    expect(withVersion.model).toBe("gemini-3.8-flash-001");
    const bare = await turn(proxy({ body: answer }));
    expect(bare.model).toBeUndefined();
    expect(bare.modelFallback).toBe(false);
  });

  it("reaches the agent message: provider gemini + modelFallback (what agent_reply logs); offline stays distinct", async () => {
    const f = proxy({ body: answer, headers: { "X-MacroTable-Model": "gemini-2.5-flash", "X-MacroTable-Model-Fallback": "1" } });
    const live = await runAgentTurn("near me?", ctxA(), [], "auto", { gemini: (t, c, h, o) => runGeminiTurn(t, c, h, { ...o, proxyUrl: "https://proxy.test", fetchImpl: f }) });
    expect(live.message.provider).toBe("gemini");
    expect(live.message.model).toBe("gemini-2.5-flash");
    expect(live.message.modelFallback).toBe(true);
    const primary = await runAgentTurn("near me?", ctxA(), [], "auto", {
      gemini: (t, c, h, o) => runGeminiTurn(t, c, h, { ...o, proxyUrl: "https://proxy.test", fetchImpl: proxy({ body: answer, headers: { "X-MacroTable-Model-Fallback": "0" } }) }),
    });
    expect(primary.message.modelFallback).toBeUndefined();
    const offline = await runAgentTurn("near me?", ctxA(), [], "offline");
    expect(offline.message.provider).toBe("mock");
    expect(offline.message.modelFallback).toBeUndefined();
  });

  it("agent_reply logs the flag, so research data can separate primary / secondary / offline", () => {
    const src = readFileSync("src/agent/agentState.tsx", "utf8");
    expect(src).toMatch(/modelFallback: !!o\.message\.modelFallback/);
  });
});
