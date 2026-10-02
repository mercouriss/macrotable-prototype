import { describe, expect, it } from "vitest";
import { isExpired, newScanRecord, SCAN_TTL_MS } from "../src/scan/imageStore";
import { buildExtractionRequest, parseExtraction, simulatedExtraction } from "../src/scan/menuExtraction";
import { executeTool, type ToolContext } from "../src/agent/tools";
import { SCENARIOS } from "../src/data/scenarios";
import { agentProvider, createResearchStore, CSV_COLUMNS, sessionsToCSV } from "../src/lib/research";

describe("temporary scan storage", () => {
  it("expires after the TTL", () => {
    const r = newScanRecord(new Blob(["x"]), undefined, 1000);
    expect(r.expiresAt - r.createdAt).toBe(SCAN_TTL_MS);
    expect(isExpired(r, 1000 + SCAN_TTL_MS - 1)).toBe(false);
    expect(isExpired(r, 1000 + SCAN_TTL_MS)).toBe(true);
  });
});

describe("menu extraction validation", () => {
  it("keeps printed nutrition separate from estimates and classifies provenance", () => {
    const m = parseExtraction(
      JSON.stringify({
        restaurantName: "Deli",
        items: [
          { name: "Wrap", price: 9.5, explicitNutrition: { calories: 610, protein: 42, carbs: 55, fat: 22 } },
          { name: "Plate", price: 11, explicitNutrition: { calories: 720 }, estimatedNutrition: { calories: 650, protein: 24, carbs: 80, fat: 32 } },
          { name: "Soup", price: 6 },
          { name: "", price: 3 },
          { name: "Junk", price: -4, explicitNutrition: { calories: 99999, protein: "lots" }, markedDietary: ["vegan", "keto"] },
        ],
        uncertainties: ["blurry bottom"],
      }),
      "scan-1",
      "gemini",
    );
    expect(m.items.map((i) => [i.name, i.provenance])).toEqual([
      ["Wrap", "menu-read"],
      ["Plate", "estimated"],
      ["Soup", "insufficient"],
      ["Junk", "insufficient"],
    ]);
    const plate = m.items[1];
    expect(plate.nutrition?.calories).toBe(720); // printed value wins over the estimate
    expect(plate.printedFields).toEqual(["calories"]);
    expect(m.items[3].price).toBeNull();
    expect(m.items[3].markedDietary).toEqual(["vegan", "vegetarian"]);
  });

  it("rejects unusable output", () => {
    expect(() => parseExtraction("{}", "s", "gemini")).toThrow();
    expect(() => parseExtraction({ items: [{ name: "" }] }, "s", "gemini")).toThrow();
  });

  it("requests structured JSON with the image inline", () => {
    const req = buildExtractionRequest("QUJD") as any;
    expect(req.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "QUJD" } });
    expect(req.generationConfig.responseMimeType).toBe("application/json");
  });

  it("scanned dishes flow through the same optimizer, never INSUFFICIENT or unknown-price items", () => {
    const ctx: ToolContext = { target: { ...SCENARIOS.A.target }, prefs: { ...SCENARIOS.A.preferences }, state: { messages: [], currentRestaurantId: null, scannedMenu: simulatedExtraction("s1"), currentRecommendation: null, orderDrafts: [], providerHistory: [] } };
    const r = executeTool("optimizeMeal", { restaurantId: "scan" }, ctx);
    expect(r.ok).toBe(true);
    expect(ctx.state.currentRecommendation).toMatchObject({ mealName: "Grilled Chicken Wrap", provenance: "menu-read", integrationLevel: 1 });
    executeTool("prepareOrder", { mode: "pickup" }, ctx);
    expect(ctx.state.orderDrafts[0].mode).toBe("handoff");
    expect(simulatedExtraction("s2").source).toBe("simulated");
  });
});

describe("agent-aware research export", () => {
  it("records agent usage per session without any message text", () => {
    const store = createResearchStore(null);
    const s = store.start({ participantId: "VT001", condition: "macrotable", scenarioId: "A", agentMode: "auto" }, 0);
    store.log(s.sessionId, "agent_message_sent", { detail: { chars: 42, source: "typed" } }, 1);
    store.log(s.sessionId, "agent_tool_called", { detail: { name: "optimizeMeal", ok: true } }, 2);
    store.log(s.sessionId, "agent_reply", { detail: { provider: "gemini" } }, 3);
    store.log(s.sessionId, "agent_fallback", { detail: { reason: "HTTP 503" } }, 4);
    store.log(s.sessionId, "agent_reply", { detail: { provider: "mock" } }, 5);
    expect(agentProvider(store.get(s.sessionId)!)).toBe("mixed");
    const [header, row] = sessionsToCSV(store.list()).trim().split("\r\n").map((l) => l.split(","));
    const col = (k: (typeof CSV_COLUMNS)[number]) => row[header.indexOf(k)];
    expect([col("agent_messages"), col("agent_tool_calls"), col("agent_provider"), col("agent_fallbacks")]).toEqual(["1", "1", "mixed", "1"]);
  });
});
