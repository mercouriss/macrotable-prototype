import { afterEach, describe, expect, it } from "vitest";
import { runGeminiTurn, type GeminiTurn } from "../src/agent/gemini";
import { overstatedConfidence, runAgentTurn, unverifiedNumbers } from "../src/agent/orchestrator";
import { executeTool, type ToolContext } from "../src/agent/tools";
import type { ToolRun } from "../src/agent/types";
import { setStudyScope } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { simulatedExtraction } from "../src/scan/menuExtraction";

/*
 * The live-reply checks ("Check: …" notices). The four Phase 2 false positives must disappear while
 * real problems — invented numbers, overstated provenance, exact-nutrition claims — are still caught.
 * Texts marked "Phase 2" are the models' actual replies.
 */

const ctxA = (): ToolContext => ({
  target: { ...SCENARIOS.A.target },
  prefs: { ...SCENARIOS.A.preferences },
  state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] },
});
afterEach(() => setStudyScope(false));

/** A finished live turn (B1) as Gemini history: user text, tool call, tool response, model text. */
async function liveTurn(ctx: ToolContext, userText: string, call: { name: string; args: Record<string, unknown> }, finalText: string) {
  let i = 0;
  const fetchImpl = (async () => {
    const parts = i++ === 0 ? [{ functionCall: { id: "c1", name: call.name, args: call.args } }] : [{ text: finalText }];
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return runGeminiTurn(userText, ctx, [], { proxyUrl: "https://proxy.test", fetchImpl });
}

// Phase 2 B2 (gemini-3.8-flash), answered from B1's comparison without calling a tool this turn.
const B2 =
  "The cheapest option is Local Grill's Grilled Chicken Salad at €12.50. It does not quite meet your target: with 44 g protein, it falls about 1 g short of your 45 g minimum (and provides 520 kcal). If you want a meal that fully meets your protein target, FitKitchen's Chicken Power Bowl (€16.50, 49 g protein) is your best choice.";

describe("B1: numbers from EARLIER turns' tool results are grounded", () => {
  const setup = async () => {
    setStudyScope(true);
    const ctx = ctxA();
    const b1 = await liveTurn(ctx, "Compare the best option at each of the nearby restaurants for my targets.", { name: "listNearbyStores", args: {} }, "Made-up aside: about 999 kcal somewhere.");
    return { ctx, history: [b1.contents] };
  };

  it("Phase 2 B2 is clean when B1's tool results are in the history", async () => {
    const { ctx, history } = await setup();
    expect(unverifiedNumbers(B2, [], ctx, { userTexts: ["Which of those is the cheapest, and does it meet my protein target?"], history })).toEqual([]);
  });

  it("(the false positive, reproduced) without the history the same text was flagged", async () => {
    const { ctx } = await setup();
    expect(unverifiedNumbers(B2, [], ctx)).toEqual(expect.arrayContaining(["€12.50", "44 g", "520 kcal", "€16.50", "49 g"]));
  });

  it("a fabricated number is still flagged even with the history", async () => {
    const { ctx, history } = await setup();
    expect(unverifiedNumbers("Local Grill's salad has 57 g protein and costs €11.20.", [], ctx, { history })).toEqual(["57 g", "€11.20"]);
  });

  it("a number that only the MODEL said earlier is not grounded by being repeated", async () => {
    const { ctx, history } = await setup();
    expect(JSON.stringify(history)).toContain("999 kcal"); // it is in the history — as model text
    expect(unverifiedNumbers("That one was 999 kcal.", [], ctx, { history })).toEqual(["999 kcal"]);
  });
});

describe("B1 (gap): a target − value difference for the SAME quantity is grounded; nothing else is", () => {
  const ctxWithRec = () => {
    setStudyScope(true);
    const ctx = ctxA();
    const runs = [executeTool("listNearbyStores", {}, ctx)]; // FitKitchen 682 kcal / 49 g, Urban Bowl 760 kcal, Local Grill 520 / 44
    return { ctx, runs };
  };
  /** Only structured data: the gap "1" appears nowhere literally, so only the gap rule can ground it. */
  const structured = (protein: number): { ctx: ToolContext; runs: ToolRun[] } => ({
    ctx: ctxA(),
    runs: [{ name: "optimizeMeal", args: {}, ok: true, result: { recommendation: { meal: "Grilled Chicken Salad", protein_g: protein, calories: 520 }, targetUsed: { calories: 700, protein_min_g: 45 } } }],
  });

  it("'about 1 g short' of the 45 g minimum with 44 g is accepted …", () => {
    const { ctx, runs } = structured(44);
    expect(unverifiedNumbers("It falls about 1 g short of your 45 g minimum.", runs, ctx)).toEqual([]);
    expect(unverifiedNumbers("That's 1 g of protein below your minimum.", runs, ctx)).toEqual([]);
  });

  it("… and is flagged when the value doesn't give that gap (control: 45 − 40 = 5, not 1)", () => {
    const { ctx, runs } = structured(40);
    expect(unverifiedNumbers("It falls about 1 g short of your 45 g minimum.", runs, ctx)).toEqual(["1 g"]);
  });

  it("gaps that appear in no tool text: 49 − 45 = 4 g above, 760 − 700 = 60 kcal over", () => {
    const { ctx, runs } = ctxWithRec();
    expect(unverifiedNumbers("The bowl gives you 4 g more protein than your 45 g minimum.", runs, ctx)).toEqual([]);
    expect(unverifiedNumbers("Urban Bowl is 60 kcal over your 700 kcal target.", runs, ctx)).toEqual([]);
  });

  it("the same number as a different quantity is not grounded (60 kcal gap ≠ 60 g protein)", () => {
    const { ctx, runs } = ctxWithRec();
    expect(unverifiedNumbers("It has 60 g of protein.", runs, ctx)).toEqual(["60 g"]);
  });

  it("value − value arithmetic is NOT accepted (no free-form arithmetic): €16.50 − €12.50", () => {
    const { ctx, runs } = ctxWithRec();
    expect(unverifiedNumbers("The bowl costs €4 more than the salad.", runs, ctx)).toEqual(["€4"]);
  });

  it("a wrong gap is flagged", () => {
    const { ctx, runs } = ctxWithRec();
    expect(unverifiedNumbers("It falls about 7 g short of your 45 g minimum.", runs, ctx)).toEqual(["7 g"]);
  });
});

describe("B2: numbers the USER stated are grounded", () => {
  const C2_USER = "Find me something with at least 90 g protein for under €10, around 600 calories.";
  const C2_TEXT = "No meals meet 90 g protein under €10 or around 600 calories."; // Phase 2 C2 shape
  const setup = () => {
    setStudyScope(true);
    const ctx = ctxA();
    const runs = [executeTool("optimizeMeal", { protein: 90, calories: 600, maxBudget: 10 }, ctx)];
    expect(runs[0].ok).toBe(false); // nothing feasible → the user's numbers are in no tool result
    return { ctx, runs };
  };

  it("repeating the user's own request is not flagged", () => {
    const { ctx, runs } = setup();
    expect(unverifiedNumbers(C2_TEXT, runs, ctx, { userTexts: [C2_USER] })).toEqual([]);
  });

  it("(the false positive, reproduced) without the user text it was flagged", () => {
    const { ctx, runs } = setup();
    expect(unverifiedNumbers(C2_TEXT, runs, ctx)).toEqual(["90 g", "€10", "600 calories"]);
  });

  it("numbers from EARLIER user messages count too (via history), comma decimals included", () => {
    const { ctx, runs } = setup();
    const history = [[{ role: "user", parts: [{ text: "My budget is €12,50." }] }, { role: "model", parts: [{ text: "OK" }] }]];
    expect(unverifiedNumbers("Under €12.50 nothing reaches 90 g.", runs, ctx, { userTexts: [C2_USER], history })).toEqual([]);
  });

  it("an invented number next to the user's numbers is still flagged", () => {
    const { ctx, runs } = setup();
    expect(unverifiedNumbers("The closest has 62 g protein for €9.40.", runs, ctx, { userTexts: [C2_USER] })).toEqual(["62 g", "€9.40"]);
  });
});

describe("B3: provenance language — negation and cross-sentence reference", () => {
  const scanCtx = () => {
    const ctx = ctxA();
    ctx.state.scannedMenu = simulatedExtraction("s", 0);
    ctx.state.currentRestaurantId = "scan";
    const runs: ToolRun[] = [executeTool("optimizeMeal", { restaurantId: "scan" }, ctx), executeTool("explainProvenance", { restaurantId: "scan", mealId: "scan:i0" }, ctx)];
    expect(ctx.state.currentRecommendation?.mealName).toBe("Grilled Chicken Wrap");
    expect(ctx.state.currentRecommendation?.provenance).toBe("menu-read");
    return { ctx, runs };
  };
  const check = (t: string) => {
    const { ctx, runs } = scanCtx();
    return overstatedConfidence(t, runs, ctx);
  };

  it.each([
    "The data confidence is MENU-READ, meaning these values were printed on the menu but haven't been verified.", // Phase 2 E1
    "No, the nutrition for the Grilled Chicken Wrap is MENU-READ. This means the values were printed on the menu you scanned, but they haven't been verified by the restaurant or MacroTable.", // Phase 2 E2
    "The Grilled Chicken Wrap hasn't been verified.",
    "The Grilled Chicken Wrap isn’t verified (curly apostrophe).",
    "The Grilled Chicken Wrap's values have not yet been independently verified.",
    "The Grilled Chicken Wrap is not officially published nutrition.",
    "The Grilled Chicken Wrap cannot be verified by MacroTable.",
  ])("negated: %s → no problem", (t) => expect(check(t)).toEqual([]));

  it.each([
    "The Grilled Chicken Wrap is verified.",
    "The Grilled Chicken Wrap has official nutrition.",
    "The Grilled Chicken Wrap is MENU-READ. It's verified by the chef.",
    "The Grilled Chicken Wrap is MENU-READ. These values are verified.",
    "The Grilled Chicken Wrap is MENU-READ, but the data is verified.",
  ])("overclaim: %s → flagged", (t) => expect(check(t).join(" ")).toMatch(/overstates the data for Grilled Chicken Wrap: its label is MENU-READ/));

  it("a sentence about something else is not pinned on an earlier dish (Phase 2 E2, 3-flash-preview)", () => {
    expect(check("The Grilled Chicken Wrap is MENU-READ. Would you like to see verified options from nearby partner restaurants instead?")).toEqual([]);
    expect(check("Would you like to see verified options from nearby partner restaurants instead?")).toEqual([]);
  });

  it("an ESTIMATED study dish described as official / verified is flagged", () => {
    setStudyScope(true);
    const ctx = ctxA();
    const runs = [executeTool("optimizeMeal", { restaurantId: "localgrill" }, ctx)];
    expect(ctx.state.currentRecommendation?.provenance).toBe("estimated");
    const name = ctx.state.currentRecommendation!.mealName;
    expect(overstatedConfidence(`The ${name} is officially confirmed.`, runs, ctx).join(" ")).toMatch(/its label is ESTIMATED/);
    expect(overstatedConfidence(`The ${name} is estimated. It is verified though.`, runs, ctx).join(" ")).toMatch(/its label is ESTIMATED/);
    expect(overstatedConfidence(`The ${name} is estimated; it isn't verified.`, runs, ctx)).toEqual([]);
  });
});

describe("B4: 'exact' only when it asserts an exact nutrition quantity", () => {
  const setup = () => {
    setStudyScope(true);
    const ctx = ctxA();
    const runs = [executeTool("optimizeMeal", { maxBudget: 16, adjustments: [{ group: "rice", request: "none" }] }, ctx)];
    return (t: string) => overstatedConfidence(t, runs, ctx);
  };
  const EXACT = /nutrition is calculated or estimated, never exact/;

  it.each([
    "It hits your 45 g protein minimum exactly and delivers 640 kcal, fitting your 700 kcal goal well without any rice.", // Phase 2 A3 (3.7)
    "This matches your protein target exactly.",
    "It costs exactly €16 and has 640 kcal.",
    "The calories aren't exact, they're calculated from the recipe.",
    "Exactly what you asked for: no rice, 640 kcal.",
  ])("not flagged: %s", (t) => expect(setup()(t).join(" ")).not.toMatch(EXACT));

  it.each([
    "It has exactly 640 kcal.",
    "It has 640 kcal exactly.",
    "You get 45 g of protein exactly.",
    "It's precisely 45 g protein.",
    "These are the exact calories for your order.",
    "MacroTable shows precise nutrition for this bowl.",
    "The calories are exact.",
    "It's guaranteed to have 45 g protein.",
  ])("flagged: %s", (t) => expect(setup()(t).join(" ")).toMatch(EXACT));
});

describe("B: the live turn passes the user's text and the history to the check", () => {
  it("Phase 2 B2 through runAgentTurn → no 'Check:' notice; an invented number → notice", async () => {
    setStudyScope(true);
    const ctx = ctxA();
    const b1 = await liveTurn(ctx, "Compare the best option at each of the nearby restaurants for my targets.", { name: "listNearbyStores", args: {} }, "Here's the comparison.");
    const reply = (text: string): typeof runGeminiTurn => async () => ({ text, toolRuns: [], model: "scripted", modelFallback: false, contents: [] }) as GeminiTurn;
    const ok = await runAgentTurn("Which of those is the cheapest, and does it meet my protein target?", ctx, [b1.contents], "auto", { gemini: reply(B2) });
    expect(ok.message.cards?.filter((c) => c.kind === "notice")).toEqual([]);
    const bad = await runAgentTurn("Which is cheapest?", ctx, [b1.contents], "auto", { gemini: reply("The salad is €9.99 with 61 g protein.") });
    expect(bad.message.cards?.find((c) => c.kind === "notice")).toMatchObject({ text: expect.stringContaining("Check: €9.99, 61 g") });
  });
});
