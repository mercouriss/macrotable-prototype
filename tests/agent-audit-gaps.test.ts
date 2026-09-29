import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MODEL } from "../proxy/src/index";
import { runGeminiTurn } from "../src/agent/gemini";
import { parseIntent, runMockTurn } from "../src/agent/mock";
import { overstatedConfidence, runAgentTurn, runContextTurn } from "../src/agent/orchestrator";
import { executeTool, type ToolContext } from "../src/agent/tools";
import type { AgentSessionState, ToolRun } from "../src/agent/types";
import { getMeal, setStudyScope, STUDY_RESTAURANT_IDS } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { ENGINE_MODELS, FALLBACK_POLICY } from "../src/lib/freeze";
import { resolveRemoval, runSearch } from "../src/lib/optimizer";

const st = (): AgentSessionState => ({ messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] });
const ctxA = (): ToolContext => ({ target: { ...SCENARIOS.A.target }, prefs: { ...SCENARIOS.A.preferences }, state: st() });
const optCalls = (runs: ToolRun[]) => runs.filter((r) => r.name === "optimizeMeal").map((r) => r.args);
afterEach(() => setStudyScope(false));

// ─── Gap 1: one engine configuration everywhere ──────────────────────────
describe("gap 1 · engine configuration: gemini-3.8-flash → gemini-3.7-flash → offline", () => {
  const toml = readFileSync("proxy/wrangler.toml", "utf8");
  const tomlVar = (k: string) => new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, "m").exec(toml)?.[1];

  it("wrangler.toml (deployed config), the Worker default and ENGINE_MODELS agree", () => {
    expect(ENGINE_MODELS).toEqual({ primary: "gemini-3.8-flash", secondary: "gemini-3.7-flash" });
    expect(tomlVar("GEMINI_MODEL")).toBe(ENGINE_MODELS.primary);
    expect(tomlVar("GEMINI_FALLBACK_MODEL")).toBe(ENGINE_MODELS.secondary);
    expect(DEFAULT_MODEL).toBe(ENGINE_MODELS.primary);
  });

  it("the fallback policy (part of the freeze fingerprint) names both models and the offline last resort", () => {
    expect(FALLBACK_POLICY).toContain("gemini-3.8-flash");
    expect(FALLBACK_POLICY).toContain("gemini-3.7-flash");
    expect(FALLBACK_POLICY).toMatch(/offline MockAgent/);
  });

  it("study documentation names the same models and no stale secondary", () => {
    for (const f of ["docs/EXPERIMENT.md", "docs/study/freeze-record.md", "docs/study/prepilot-audit-v3.5.md", "proxy/README.md"]) {
      const doc = readFileSync(f, "utf8");
      expect(doc, f).toContain("gemini-3.7-flash");
      expect(doc, f).not.toMatch(/gemini-2\.5|Gemini 2\.5/);
    }
  });
});

// ─── Gap 3: provenance language ──────────────────────────────────────────
describe("gap 3 · VERIFY flags confidence language that exceeds the tool's label", () => {
  const withLocalGrill = () => {
    const c = ctxA();
    const runs = [executeTool("listNearbyStores", {}, c), executeTool("optimizeMeal", { restaurantId: "localgrill" }, c)];
    return { c, runs };
  };

  it("flags ESTIMATED data described as verified / official, and 'exact' nutrition", () => {
    const { c, runs } = withLocalGrill();
    expect(overstatedConfidence("Grilled Chicken Salad at Local Grill: 520 kcal, 44 g protein, verified data.", runs, c)[0]).toMatch(/"verified" overstates the data for (Grilled Chicken Salad|Local Grill): its label is ESTIMATED/);
    expect(overstatedConfidence("Local Grill has official nutrition for this salad.", runs, c).join()).toMatch(/"official" overstates the data for Local Grill/);
    expect(overstatedConfidence("It is exactly 520 kcal.", runs, c).join()).toMatch(/"exactly": nutrition is calculated or estimated, never exact/);
  });

  it("accepts correct labels, negations, and statements about better-labelled dishes nearby", () => {
    const { c, runs } = withLocalGrill();
    expect(overstatedConfidence("Grilled Chicken Salad at Local Grill is ESTIMATED, not verified — it may differ.", runs, c)).toEqual([]);
    expect(overstatedConfidence("FitKitchen's Chicken Power Bowl is DEMO VERIFIED; Local Grill's salad is only estimated.", runs, c)).toEqual([]);
    expect(overstatedConfidence("Chicken Power Bowl at FitKitchen (DEMO VERIFIED data), 682 kcal.", runs, c)).toEqual([]);
    expect(overstatedConfidence("Verified nutrition from Local Grill: 520 kcal.", runs, c).join()).toMatch(/overstates the data for Local Grill/); // claim before its subject
    expect(overstatedConfidence("Mozza is a real restaurant with a verified address.", runs, c)).toEqual([]); // real venues carry no nutrition label
  });

  it("shows a warning card on live replies (the card labels stay authoritative)", async () => {
    const responses = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "1", name: "optimizeMeal", args: { restaurantId: "localgrill" } } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "Grilled Chicken Salad at Local Grill: 520 kcal, verified." }] } }] },
    ];
    let i = 0;
    const fetchImpl = (async () => new Response(JSON.stringify(responses[i++]), { status: 200 })) as unknown as typeof fetch;
    const o = await runAgentTurn("near me?", ctxA(), [], "auto", { gemini: (t, c, h, op) => runGeminiTurn(t, c, h, { ...op, proxyUrl: "https://p", fetchImpl }) });
    const notice = o.message.cards?.find((c) => c.kind === "notice");
    expect(notice && notice.kind === "notice" && notice.text).toMatch(/"verified" overstates the data .*ESTIMATED.*labels on the cards are authoritative/);
    expect(o.message.cards?.find((c) => c.kind === "recommendation")).toMatchObject({ rec: { provenance: "estimated" } });
  });
});

// ─── Gap 4: "no X" semantics ─────────────────────────────────────────────
describe("gap 4 · 'no X' = dishes without X comply; X that can't be removed is refused", () => {
  const rem = (mealId: string, word: string) => {
    const f = getMeal(mealId)!;
    return resolveRemoval(f.meal, f.restaurant, word);
  };

  it("resolves removals per dish without inventing options", () => {
    expect(rem("lg-chicken-salad", "rice")).toEqual({ ok: true, allowedByGroup: {}, notListed: true }); // no rice listed → complies
    expect(rem("fk-salmon-quinoa", "rice")).toMatchObject({ ok: true, notListed: true }); // quinoa is not rice
    expect(rem("fk-chicken-power-bowl", "rice")).toEqual({ ok: true, allowedByGroup: { rice: ["rice-none"] }, notListed: false });
    expect(rem("ub-teriyaki-salmon", "rice")).toMatchObject({ ok: false, reason: expect.stringMatching(/can't leave out the rice.*Supported rice options: Standard/) });
    expect(rem("ss-lamb-rogan-josh", "rice")).toMatchObject({ ok: false, reason: expect.stringMatching(/comes with rice, and the restaurant offers no way to leave it out/) });
    expect(rem("pm-chicken-pesto-penne", "cheese")).toMatchObject({ ok: true, allowedByGroup: { parmesan: ["parmesan-none"] } });
    expect(rem("td-tuna-melt", "cheese")).toMatchObject({ ok: false, reason: expect.stringMatching(/comes with cheddar/) });
    expect(rem("pm-chicken-pesto-penne", "carbs")).toMatchObject({ ok: false }); // pasta can only be halved
  });

  it("'no rice' across stores keeps rice-free dishes in play (public scope)", () => {
    const c = ctxA();
    const r = executeTool("optimizeMeal", { adjustments: [{ group: "rice", request: "none" }] }, c);
    const res = r.result as { recommendation: { meal: string; changes: string[] }; alternatives: { meal: string }[]; notPossible: string[] };
    expect(r.ok).toBe(true);
    expect(res.notPossible.join(" ")).not.toMatch(/has no "rice" option/); // the old, wrong exclusion
    expect(res.notPossible.join(" ")).toMatch(/Lamb Rogan Josh at Saffron & Steam comes with rice/);
    const considered = [res.recommendation.meal, ...res.alternatives.map((a) => a.meal)];
    expect(considered.some((m) => !/Power Bowl/.test(m))).toBe(true); // not only the one bowl with a no-rice option
    expect(res.recommendation.changes).not.toContain("Half rice");
  });

  it("study scope: only the three study restaurants, and every result is rice-free or rice removed", () => {
    setStudyScope(true);
    const c = ctxA();
    const r = executeTool("optimizeMeal", { adjustments: [{ group: "rice", request: "none" }] }, c);
    const res = r.result as { recommendation: { restaurantId: string; changes: string[]; meal: string }; alternatives: { restaurantId: string }[] };
    for (const x of [res.recommendation, ...res.alternatives]) expect(STUDY_RESTAURANT_IDS as readonly string[]).toContain(x.restaurantId);
    expect(res.recommendation.meal === "Chicken Power Bowl" ? res.recommendation.changes : ["No rice"]).toContain("No rice");
  });

  it("scenario outcomes are unchanged (no adjustments): canonical A–D picks", () => {
    setStudyScope(true);
    const pick = (id: "A" | "B" | "C" | "D") => {
      const b = runSearch(SCENARIOS[id].target, SCENARIOS[id].preferences).ranked[0];
      return `${b.meal.id} ${b.nutrition.calories}/${b.nutrition.protein} €${b.price.toFixed(2)}`;
    };
    expect(pick("A")).toBe("fk-chicken-power-bowl 682/49 €16.50");
    expect(pick("B")).toBe("fk-chicken-power-bowl 774/63 €18.00");
    expect(pick("C")).toBe("fk-tofu-tahini 690/40 €15.50");
    expect(pick("D")).toBe("fk-chicken-power-bowl 454/57 €18.00");
  });
});

// ─── Gap 2: offline follow-up parsing and context ────────────────────────
describe("gap 2 · offline agent: common phrasings, session constraints, anchoring", () => {
  it("parses removal phrasings as 'none'", () => {
    for (const t of ["I don't want rice. What can you do?", "please avoid rice", "leave out the rice", "rice-free please", "I do not want any rice", "no rice"])
      expect(parseIntent(t).adjustments, t).toContainEqual({ group: "rice", request: "none" });
    expect(parseIntent("I don't like cheese").adjustments).toContainEqual({ group: "cheese", request: "none" });
    expect(parseIntent("less rice").adjustments).toEqual([{ group: "rice", request: "less" }]);
  });

  it("'I don't want rice. What can you do?' re-optimises the current dish instead of replying with help", () => {
    const c = ctxA();
    runMockTurn("Find me a meal around 700 calories, at least 45g protein, under €18.", c);
    const t = runMockTurn("I don't want rice. What can you do?", c);
    expect(optCalls(t.toolRuns)).toContainEqual(expect.objectContaining({ mealId: "fk-chicken-power-bowl", adjustments: [{ group: "rice", request: "none" }] }));
    expect(c.state.currentRecommendation?.changes).toContain("No rice");
    expect(t.text).toMatch(/re-optimised/);
  });

  it("a constraint change after a cross-store answer searches all stores (no silent narrowing)", () => {
    const c = ctxA();
    runMockTurn("Find me a meal around 700 calories, at least 45g protein, under €18.", c);
    expect(c.state.currentRecommendation?.restaurantId).toBe("fitkitchen");
    const t = runMockTurn("Actually lower my budget to €14 and prioritize protein.", c);
    const call = optCalls(t.toolRuns).at(-1)!;
    expect(call.restaurantId).toBeUndefined();
    expect(call.maxBudget).toBe(14);
    expect(c.state.currentRecommendation?.price).toBeLessThanOrEqual(14);
    expect(c.state.currentRecommendation?.nutrition.protein).toBeGreaterThan(30); // the old FitKitchen-only answer was 30 g
  });

  it("remembers constraints and removals stated earlier in the session; later statements win", () => {
    const c = ctxA();
    runMockTurn("Something around 600 calories with at least 40g protein under €18", c);
    runMockTurn("no rice", c);
    const t = runMockTurn("Make it under €15", c);
    const call = optCalls(t.toolRuns).at(-1)!;
    expect(call).toMatchObject({ calories: 600, protein: 40, maxBudget: 15 });
    expect(call.adjustments).toContainEqual({ group: "rice", request: "none" });
    expect(c.state.stated).toMatchObject({ calories: 600, protein: 40, maxBudget: 15, avoid: ["rice"] });
  });

  it("stays at a restaurant only when the user anchored there (QR / restaurant page / named it); 'compare' releases it", () => {
    const c = ctxA();
    runContextTurn("restaurant", c, "urbanbowl"); // e.g. table QR at Urban Bowl
    const t = runMockTurn("something under €17", c);
    expect(optCalls(t.toolRuns).at(-1)!.restaurantId).toBe("urbanbowl");
    const t2 = runMockTurn("compare stores", c);
    expect(optCalls(t2.toolRuns).at(-1)!.restaurantId).toBeUndefined();
    expect(c.state.anchorRestaurantId).toBeNull();
    const t3 = runMockTurn("What should I get at Pasta Metrica?", c);
    expect(optCalls(t3.toolRuns).at(-1)!.restaurantId).toBe("pastametrica");
    const t4 = runMockTurn("under €15 please", c);
    expect(optCalls(t4.toolRuns).at(-1)!.restaurantId).toBe("pastametrica");
  });

  it("small talk doesn't trigger a new search just because constraints were remembered", () => {
    const c = ctxA();
    runMockTurn("under €14", c);
    const t = runMockTurn("thanks!", c);
    expect(optCalls(t.toolRuns)).toEqual([]);
  });

  it("trial isolation holds for follow-ups: study scope never reaches public brands", () => {
    setStudyScope(true);
    const c = ctxA();
    runMockTurn("Find me a meal around 700 calories, at least 45g protein, under €18.", c);
    runMockTurn("Actually lower my budget to €14", c);
    runMockTurn("I don't want rice", c);
    expect(STUDY_RESTAURANT_IDS as readonly string[]).toContain(c.state.currentRecommendation?.restaurantId);
    expect(runMockTurn("What should I get at Pasta Metrica?", c).toolRuns.every((r) => !String(JSON.stringify(r.result)).includes("Chicken Pesto Penne"))).toBe(true);
  });
});
