import { existsSync, readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { executeTool, type ToolContext } from "../src/agent/tools";
import { BaselineBrowse } from "../src/baseline/Baseline";
import { SheetProvider } from "../src/components/Sheet";
import { DEMO_AREA, distanceKm, SHOWCASE_STORE_LOCATIONS } from "../src/data/geo";
import { catalog, getRestaurant, MENU_RESTAURANTS, menuRestaurants, RESTAURANTS, setStudyScope, STUDY_RESTAURANT_IDS } from "../src/data/restaurants";
import { SCENARIOS, SCENARIO_IDS } from "../src/data/scenarios";
import { Explore } from "../src/screens/Explore";
import { AppStateProvider } from "../src/state/AppState";

/* Farther-out showcase demo brands (2026-10-02): fictional, normal/showcase mode only. */

const IDS = Object.keys(SHOWCASE_STORE_LOCATIONS);
const SHOWCASE = IDS.map((id) => getRestaurant(id)!);
const ctx = (id: (typeof SCENARIO_IDS)[number] = "A"): ToolContext => ({
  target: { ...SCENARIOS[id].target },
  prefs: { ...SCENARIOS[id].preferences },
  state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] },
});
afterEach(() => setStudyScope(false));

describe("showcase demo brands: fictional and clearly labelled", () => {
  it("3–5 new brands, all identity 'demo' with an original local mark, a fictional address and invented menus", () => {
    expect(SHOWCASE.length).toBeGreaterThanOrEqual(3);
    expect(SHOWCASE.length).toBeLessThanOrEqual(5);
    for (const r of SHOWCASE) {
      expect(r.identity).toBe("demo");
      expect(r.address).toMatch(/^Fictional demo store/);
      expect(r.logo).toMatchObject({ source: "demo-original", src: `logos/demo/${r.id}.svg` });
      expect(r.logo!.alt).toMatch(/fictional demo brand/);
      const svg = readFileSync(`public/${r.logo!.src}`, "utf8");
      expect(existsSync(`public/${r.logo!.src}`)).toBe(true);
      expect(svg).not.toMatch(/<script|\son\w+=|href=|<image|<text/i); // glyph only: no text, no external refs
      expect(r.meals.length).toBeGreaterThan(0);
      for (const m of r.meals) expect(m.provenance).toBe(r.integrationLevel === 3 ? "verified" : r.integrationLevel === 2 ? "official" : "estimated");
    }
    expect(new Set(SHOWCASE.map((r) => r.integrationLevel))).toEqual(new Set([1, 2, 3]));
  });

  it("sit 1–2.5 km out in different directions (not beside campus)", () => {
    const bearings = new Set<string>();
    for (const r of SHOWCASE) {
      const d = distanceKm(DEMO_AREA.user, r.location);
      expect(d).toBeGreaterThan(1);
      expect(d).toBeLessThan(2.5);
      bearings.add(`${r.location.lat > DEMO_AREA.user.lat ? "N" : "S"}${r.location.lng > DEMO_AREA.user.lng ? "E" : "W"}`);
    }
    expect(bearings.size).toBe(SHOWCASE.length);
  });
});

describe("research isolation: never in a trial, the baseline or the study optimizer", () => {
  it("not in the frozen study set", () => {
    for (const id of IDS) expect(STUDY_RESTAURANT_IDS as readonly string[]).not.toContain(id);
  });

  it("visible in normal mode, absent in study scope (catalog, optimizer inputs, agent tools)", () => {
    for (const r of SHOWCASE) {
      expect(catalog()).toContain(r);
      expect(MENU_RESTAURANTS).toContain(r);
    }
    setStudyScope(true);
    const ids = (rs: { id: string }[]) => rs.map((r) => r.id);
    expect(ids(catalog()).sort()).toEqual([...STUDY_RESTAURANT_IDS].sort());
    expect(ids(menuRestaurants()).sort()).toEqual([...STUDY_RESTAURANT_IDS].sort());
    for (const s of SCENARIO_IDS) {
      const stores = (executeTool("listNearbyStores", {}, ctx(s)).result as { stores: { restaurantId: string }[] }).stores.map((x) => x.restaurantId);
      const rec = (executeTool("optimizeMeal", {}, ctx(s)).result as { recommendation?: { restaurantId: string } }).recommendation;
      for (const id of IDS) expect(stores).not.toContain(id);
      if (rec) expect(STUDY_RESTAURANT_IDS as readonly string[]).toContain(rec.restaurantId);
    }
  });

  it("the baseline task never lists them", () => {
    const html = renderToString(h(MemoryRouter, { initialEntries: ["/baseline/browse"] }, h(AppStateProvider, null, h(BaselineBrowse))));
    for (const id of STUDY_RESTAURANT_IDS) expect(html).toContain(getRestaurant(id)!.name); // it did render the study set
    for (const r of SHOWCASE) expect(html).not.toContain(r.name);
  });

  it("the normal-mode demo recommendation stays FitKitchen's Chicken Power Bowl for Scenario A", () => {
    const rec = (executeTool("optimizeMeal", {}, ctx("A")).result as { recommendation: { restaurantId: string; mealId: string } }).recommendation;
    expect(rec).toMatchObject({ restaurantId: "fitkitchen", mealId: "fk-chicken-power-bowl" });
  });
});

describe("Explore (normal mode) shows them as DEMO, real places stay 'Real · not affiliated'", () => {
  it("each showcase card is tagged DEMO with its fictional mark", () => {
    const html = renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(Explore)))));
    const cards = html.split("<li").slice(1);
    for (const r of SHOWCASE) {
      const card = cards.find((c) => c.includes(`>${r.name}<`));
      expect(card, r.name).toBeDefined();
      expect(card).toContain("DEMO");
      expect(card).toContain('data-logo="demo-original"');
      expect(card).not.toContain("not affiliated");
    }
    expect(cards.filter((c) => c.includes("not affiliated")).length).toBe(RESTAURANTS.filter((r) => r.identity === "real").length);
  });
});
