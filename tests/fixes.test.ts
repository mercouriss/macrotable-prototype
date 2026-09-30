import { readFileSync, existsSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AgentStateProvider } from "../src/agent/agentState";
import type { RecommendationCardData } from "../src/agent/types";
import { AgentCardView } from "../src/components/agent/AgentCards";
import { SheetProvider } from "../src/components/Sheet";
import { REAL_LOGOS } from "../src/data/realLogos";
import { getRestaurant, RESTAURANTS } from "../src/data/restaurants";
import { saveOrder } from "../src/lib/experiment";
import { acceptanceTimeline, ACCEPTANCE_STAGES, canPlaceSelection, canSimulateAcceptance, completedOrderFor, selectionKey } from "../src/lib/orderState";
import { agentEngine, agentModels, type ParticipantSession } from "../src/lib/research";
import { Explore } from "../src/screens/Explore";
import { AppStateProvider } from "../src/state/AppState";
import type { PlacedOrder } from "../src/types";

const SEL = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" };
const order = (over: Partial<PlacedOrder> = {}): PlacedOrder => ({
  orderNumber: "MT1042",
  placedAt: 1_000,
  mode: "macrotable",
  scenario: "A",
  restaurantId: "fitkitchen",
  mealId: "fk-chicken-power-bowl",
  selections: SEL,
  configurationId: "x",
  nutrition: { calories: 682, protein: 49, carbs: 72, fat: 20 },
  price: 16.5,
  handoff: false,
  serviceMode: "pickup",
  pickupCode: "K42",
  meetsTarget: true,
  ...over,
});

describe("duplicate submission is impossible (state, not CSS)", () => {
  it("an attempt that was placed can't be placed again; a changed configuration is a new attempt", () => {
    const fresh = { mealId: "fk-chicken-power-bowl", selections: SEL };
    expect(canPlaceSelection(fresh)).toBe(true);
    const placed = { ...fresh, placedOrderNumber: "MT1042" };
    expect(canPlaceSelection(placed)).toBe(false); // double tap / back button / programmatic call
    // Agent draft for the identical configuration while the current attempt is already placed:
    expect(canPlaceSelection(placed, { ...fresh })).toBe(false);
    // A different configuration is a new attempt:
    expect(canPlaceSelection(placed, { mealId: fresh.mealId, selections: { ...SEL, rice: "rice-std" } })).toBe(true);
    expect(selectionKey({ b: "1", a: "2" })).toBe(selectionKey({ a: "2", b: "1" }));
  });

  it("AppState enforces it: placeOrder checks the guard, marks the attempt placed; editing starts a new attempt", () => {
    const src = readFileSync("src/state/AppState.tsx", "utf8");
    expect(src).toMatch(/if \(!canPlaceSelection\(s\.selection\)/);
    expect(src).toMatch(/placedOrderNumber: order\.orderNumber/);
    expect(src.match(/placedOrderNumber: undefined/g)?.length).toBeGreaterThanOrEqual(2); // setOption + resetSelection
    expect(readFileSync("src/screens/Review.tsx", "utf8")).toMatch(/Order completed/);
  });
});

describe("completed recommendation cards", () => {
  it("are completed by an order from the card (origin) or for exactly this configuration after the card appeared", () => {
    const rec = { mealId: "fk-chicken-power-bowl", selections: SEL };
    expect(completedOrderFor(rec, { since: 500 }, [order()])).toBeDefined();
    expect(completedOrderFor(rec, { since: 2_000 }, [order()])).toBeUndefined(); // older order ≠ this card
    expect(completedOrderFor(rec, { since: 500 }, [order({ selections: { ...SEL, veg: "veg-std" } })])).toBeUndefined();
    // Customised on the Configure screen but started from this card → still this card's order:
    expect(completedOrderFor(rec, { since: 2_000, origin: "m1:0" }, [order({ selections: { ...SEL, veg: "veg-std" }, origin: "m1:0" })])).toBeDefined();
  });

  it("render as a disabled 'Order completed' — no active Configure order — after the order exists", () => {
    saveOrder(order({ placedAt: Date.now(), origin: "m9:0" }));
    const rec: RecommendationCardData = {
      restaurantId: "fitkitchen", restaurantName: "FitKitchen", mealId: "fk-chicken-power-bowl", mealName: "Chicken Power Bowl",
      selections: SEL, changes: [], nutrition: { calories: 682, protein: 49, carbs: 72, fat: 20 }, price: 16.5, provenance: "verified",
      integrationLevel: 3, meetsTarget: true, gaps: [], rejectedRequests: [],
    };
    const render = (originId: string, since: number) =>
      renderToString(
        h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(AgentStateProvider, null, h(AgentCardView, { card: { kind: "recommendation", rec }, since, originId }))))),
      );
    const done = render("m9:0", Date.now() + 60_000);
    expect(done).toContain("Order completed");
    expect(done).toMatch(/<button[^>]*disabled=""[^>]*>.*Order completed/);
    expect(done).not.toContain("Configure order");
    const other = render("m10:0", Date.now() + 60_000); // a later card, nothing ordered from it yet
    expect(other).toContain("Configure order");
  });
});

describe("restaurant acceptance → ticket (simulated)", () => {
  it("only fictional demo brands with a (simulated) kitchen integration can 'accept'", () => {
    expect(canSimulateAcceptance(getRestaurant("fitkitchen")!, { handoff: false })).toBe(true);
    expect(canSimulateAcceptance(getRestaurant("urbanbowl")!, { handoff: false })).toBe(true);
    expect(canSimulateAcceptance(getRestaurant("localgrill")!, { handoff: true })).toBe(false); // hand-off: nothing sent
    for (const r of RESTAURANTS.filter((x) => x.identity === "real")) expect(canSimulateAcceptance(r, { handoff: false })).toBe(false);
    expect(canSimulateAcceptance({ identity: "demo", integrationLevel: 1 }, { handoff: false })).toBe(false); // scanned menus
  });

  it("acceptance comes before the ticket; reduced motion shows the final state at once", () => {
    const t = acceptanceTimeline(false);
    const times = ACCEPTANCE_STAGES.map((s) => t[s]);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(t.accepted).toBeLessThan(t.ticket);
    expect(Object.values(acceptanceTimeline(true))).toEqual([0, 0, 0, 0]);
  });

  it("research trials never show it (they end on the neutral completion screen)", () => {
    const cards = readFileSync("src/components/agent/AgentCards.tsx", "utf8");
    expect(cards).toMatch(/d\.status === "approved" && placed && restaurant && !handoff && !lock/);
    expect(readFileSync("src/screens/Review.tsx", "utf8")).toMatch(/if \(result\.research\) navigate\("\/experiment\/done"/);
  });
});

describe("Explore restaurant cards open on a single tap", () => {
  const html = renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(Explore)))));
  const links = [...html.matchAll(/<a[^>]*data-card-link[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)];

  it("every card has one stretched link to its detail page (real venues → honest detail/scan page)", () => {
    expect(links.length).toBe(RESTAURANTS.length);
    const hrefs = links.map((m) => m[1]);
    expect(hrefs).toContain("/macrotable/explore/fitkitchen");
    expect(hrefs).toContain("/macrotable/explore/toko-smoor");
  });

  it("no interactive element is nested inside the card link (inner actions stay separate targets)", () => {
    for (const [, , inner] of links) expect(inner).not.toMatch(/<(a|button)\b/);
    expect(html).toMatch(/relative z-10[^"]*"[^>]*>.*?View menu/s);
  });
});

describe("real-restaurant logos", () => {
  it("every registry entry is an authentic, local, provenance-documented asset for a REAL venue", () => {
    for (const [id, logo] of Object.entries(REAL_LOGOS)) {
      expect(getRestaurant(id)?.identity).toBe("real");
      expect(logo.pageUrl).toMatch(/^https:\/\//);
      expect(logo.assetUrl).toMatch(/^https:\/\//);
      expect(logo.usageBasis).toMatch(/No trademark licence, permission or partnership/);
      expect(existsSync(`public/${logo.file}`)).toBe(true);
    }
    for (const r of RESTAURANTS) if (r.identity === "real") expect(r.brand).toBeUndefined(); // no invented branding
  });
});

describe("engine identity in research data (never pooled silently)", () => {
  const s = (details: Record<string, unknown>[]) =>
    ({ events: details.map((d) => ({ event: "agent_reply", timestamp: 0, mode: "macrotable", scenario: "A", sessionId: "x", detail: d })) }) as unknown as ParticipantSession;
  it("distinguishes primary, secondary (proxy fallback) and offline replies", () => {
    expect(agentEngine(s([{ provider: "gemini", modelFallback: false, model: "gemini-3.8-flash" }]))).toBe("primary");
    expect(agentEngine(s([{ provider: "gemini", modelFallback: true, model: "gemini-3.7-flash" }]))).toBe("secondary");
    expect(agentEngine(s([{ provider: "mock" }]))).toBe("offline");
    expect(agentEngine(s([{ provider: "gemini" }, { provider: "gemini", modelFallback: true }, { provider: "mock" }, { provider: "tools" }]))).toBe("primary+secondary+offline");
    expect(agentEngine(s([{ provider: "tools" }]))).toBe("");
    expect(agentModels(s([{ provider: "gemini", model: "gemini-3.8-flash" }, { provider: "gemini", modelFallback: true, model: "gemini-3.7-flash" }]))).toBe("gemini-3.7-flash;gemini-3.8-flash");
  });
});
