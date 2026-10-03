import { existsSync, readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runContextTurn } from "../src/agent/orchestrator";
import { executeTool, type ToolContext } from "../src/agent/tools";
import { BrandMark } from "../src/components/BrandMark";
import { KitchenTicket } from "../src/components/KitchenTicket";
import { SheetProvider } from "../src/components/Sheet";
import { getRestaurant, RESTAURANTS } from "../src/data/restaurants";
import { REAL_LOGOS } from "../src/data/realLogos";
import { SCENARIOS } from "../src/data/scenarios";
import { clearOrders, getOrders, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { fulfilmentLabel, needsTable, normalizeTable, offersDineIn } from "../src/lib/fulfillment";
import { clearLedger } from "../src/lib/ledger";
import { cameFromQr, markQrEntry } from "../src/lib/qrEntry";
import { Home } from "../src/screens/Home";
import { RestaurantEntry } from "../src/screens/RestaurantEntry";
import { Review } from "../src/screens/Review";
import { Success } from "../src/screens/Success";
import { AppStateProvider, ledgerFor, useAppState, type MealSelection } from "../src/state/AppState";
import type { PlacedOrder, Selections } from "../src/types";

/*
 * Demo Day additions (normal mode only): the presentation QR → FitKitchen, Dine in (with a table) or
 * Pickup at table-service demo restaurants, and the remaining logo gaps. Research trials are untouched.
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
afterEach(() => vi.unstubAllGlobals());

const BASE = SCENARIOS.A.target;
const BOWL: Selections = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" }; // 682 kcal, €16.50
const bowl = (): MealSelection => ({ mealId: "fk-chicken-power-bowl", selections: BOWL });
let app: ReturnType<typeof useAppState>;
const Probe = () => ((app = useAppState()), null);
const load = () => (renderToString(h(AppStateProvider, null, h(Probe))), app);
const lockOf = (scenarioId: "A" = "A") => ({ participantId: "P001", condition: "macrotable" as const, scenarioId, agentMode: "offline" as const, sessionId: "s-fixed", startedAt: 1 });
const persist = (extra: Record<string, unknown>) => writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: BASE, prefs: SCENARIOS.A.preferences, selection: null, lock: null, ...extra });
const render = (el: ReturnType<typeof h>, path = "/") => renderToString(h(MemoryRouter, { initialEntries: [path] }, h(AppStateProvider, null, h(SheetProvider, null, el))));
const entry = (id = "fitkitchen") => render(h(Routes, null, h(Route, { path: "/r/:restaurantId", element: h(RestaurantEntry) })), `/r/${id}`);

describe("Presentation QR → FitKitchen", () => {
  const meta = JSON.parse(readFileSync("docs/demo-day/fitkitchen-qr.json", "utf8")) as { url: string; errorCorrection: string };

  it("encodes the production FitKitchen landing; the SVG is exactly what the generator makes for that URL", async () => {
    expect(meta.url).toBe("https://mercouriss.github.io/macrotable-prototype/r/fitkitchen");
    const gen = (await import(/* @vite-ignore */ "../scripts/demo-qr.mjs" as string)) as { DEMO_QR_URL: string; demoQrMatrix: (u: string) => boolean[][]; demoQrSvg: (m: boolean[][]) => string };
    expect(gen.DEMO_QR_URL).toBe(meta.url);
    expect(readFileSync("docs/demo-day/fitkitchen-qr.svg", "utf8")).toBe(gen.demoQrSvg(gen.demoQrMatrix(meta.url)));
    expect(existsSync("docs/demo-day/fitkitchen-qr.png")).toBe(true);
    expect(meta.errorCorrection).toBe("Q");
  });

  it("the URL path is the app's QR route under the Pages base, and the build gives it a real page (HTTP 200)", () => {
    const path = new URL(meta.url).pathname;
    expect(path).toBe("/macrotable-prototype/r/fitkitchen");
    expect(readFileSync(".github/workflows/ci.yml", "utf8")).toMatch(/VITE_BASE: \/\$\{\{ github\.event\.repository\.name \}\}\//);
    expect(readFileSync("vite.config.ts", "utf8")).toMatch(/ENTRY_ROUTES = \[[^\]]*"r\/fitkitchen"/);
    expect(readFileSync("src/App.tsx", "utf8")).toMatch(/path="r\/:restaurantId" element=\{<RestaurantEntry \/>\}/);
  });

  it("opens FitKitchen straight away (no search, no onboarding detour), with its logo and both next steps", () => {
    const html = entry();
    expect(html).toContain("Restaurant detected");
    expect(html).toContain("FitKitchen");
    expect(html).toContain('data-logo="demo-original"');
    expect(html).toContain("Open MacroAgent here");
    expect(html).toContain("View full menu");
    expect(html).not.toContain("Restaurant food that fits"); // not the onboarding screen
  });

  it("the QR context is explicit presence (restaurant context, entry 'qr'); a recommendation alone still isn't", () => {
    expect(readFileSync("src/screens/RestaurantEntry.tsx", "utf8")).toMatch(/context=\{\{ kind: "restaurant", id: r\.id, entry: "qr" \}\}/);
    const fresh = (): ToolContext => ({ target: { ...BASE }, prefs: { ...SCENARIOS.A.preferences }, state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] } });
    const viaQr = fresh();
    runContextTurn("restaurant", viaQr, "fitkitchen");
    expect(viaQr.state.currentRestaurantId).toBe("fitkitchen");
    const viaRec = fresh();
    executeTool("optimizeMeal", {}, viaRec);
    expect(viaRec.state.currentRecommendation?.restaurantId).toBe("fitkitchen");
    expect(viaRec.state.currentRestaurantId).toBeNull();
  });
});

describe("Dine in or Pickup (normal mode)", () => {
  it("full-service demo restaurants offer Dine in; quick-service and real ones don't; data never reaches agent tools", () => {
    expect(RESTAURANTS.filter((r) => offersDineIn(r)).map((r) => r.id).sort()).toEqual(["citrinemezze", "fitkitchen", "kombutide", "pastametrica", "saffronsteam"]);
    expect(offersDineIn(getRestaurant("urbanbowl")!)).toBe(false);
    expect(RESTAURANTS.filter((r) => r.identity === "real").some((r) => r.tableService)).toBe(false);
    const ctx: ToolContext = { target: { ...BASE }, prefs: { ...SCENARIOS.A.preferences }, state: { messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] } };
    expect(JSON.stringify(executeTool("listNearbyStores", {}, ctx).result)).not.toMatch(/tableService|"table"|Dine in/);
    expect(JSON.stringify(executeTool("getMenu", { restaurantId: "fitkitchen" }, ctx).result)).not.toMatch(/tableService/);
  });

  it("table numbers: 1–30 accepted ('Table 12' → '12'); anything else rejected", () => {
    expect(normalizeTable("12")).toBe("12");
    expect(normalizeTable("Table 7")).toBe("7");
    for (const bad of ["", "0", "31", "abc", "12a", undefined]) expect(normalizeTable(bad)).toBeNull();
  });

  it("dine in requires a table: none or an invalid one → nothing is placed; Table 12 → recorded on the order", () => {
    expect(load().placeOrder("in-store", bowl())).toBeNull();
    expect(load().placeOrder("in-store", bowl(), { table: "99" })).toBeNull();
    expect(getOrders()).toHaveLength(0);
    const r = load().placeOrder("in-store", bowl(), { table: "12" });
    expect(r?.order).toMatchObject({ serviceMode: "in-store", table: "12", nutrition: { calories: 682, protein: 49, carbs: 72, fat: 20 }, price: 16.5 });
  });

  it("pickup needs no table and records none; a quick-service in-store order needs none either", () => {
    const p = load().placeOrder("pickup", bowl());
    expect(p?.order.serviceMode).toBe("pickup");
    expect(p?.order.table).toBeUndefined();
    expect(needsTable(getRestaurant("urbanbowl")!, "in-store", false)).toBe(false);
  });

  it("Review: Dine in + Table 12 shows 'DINE IN · TABLE 12' and the table stays changeable before approval", () => {
    persist({ selection: bowl(), dining: { restaurantId: "fitkitchen", mode: "in-store", table: "12" } });
    const html = render(h(Review));
    expect(html).toContain("How will you eat?");
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>Dine in</);
    expect(html).toMatch(/<select aria-label="Your table"/);
    expect(html).toMatch(/<option value="12" selected="">Table (<!-- -->)?12<\/option>/);
    expect(html).toContain("DINE IN · TABLE 12");
    expect(html).toContain(">Approve order<");
    // Change the table before approving: the choice is the user's until they approve.
    persist({ selection: bowl(), dining: { restaurantId: "fitkitchen", mode: "in-store", table: "7" } });
    expect(render(h(Review))).toContain("DINE IN · TABLE 7");
    expect(load().placeOrder("in-store", bowl(), { table: "7" })?.order.table).toBe("7");
  });

  it("Review: Dine in without a table → approval is blocked and asks for the table", () => {
    persist({ selection: bowl(), dining: { restaurantId: "fitkitchen", mode: "in-store" } });
    const html = render(h(Review));
    expect(html).toContain("DINE IN · CHOOSE YOUR TABLE");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Choose your table to approve/s);
  });

  it("Review: Pickup shows 'PICKUP' and no table field; a quick-service restaurant keeps Pickup / Eat in-store", () => {
    persist({ selection: bowl(), dining: { restaurantId: "fitkitchen", mode: "pickup" } });
    const pickup = render(h(Review));
    expect(pickup).toContain(">PICKUP<");
    expect(pickup).not.toContain('aria-label="Your table"');
    persist({ selection: { mealId: "ub-teriyaki-salmon", selections: {} } });
    const quick = render(h(Review));
    expect(quick).toContain("Eat in-store");
    expect(quick).not.toContain("Dine in");
    expect(quick).not.toContain("Your table");
  });

  it("the ticket and success screen show 'DINE IN · TABLE 12' (or 'PICKUP') with the configured nutrition and price", () => {
    const order = load().placeOrder("in-store", bowl(), { table: "12" })!.order;
    const ticket = renderToString(h(KitchenTicket, { order }));
    expect(ticket).toContain("DINE IN · TABLE 12");
    expect(ticket).toMatch(/682(<!-- -->)? KCAL/);
    expect(ticket).toContain("€16.50");
    const success = render(h(Routes, null, h(Route, { path: "/macrotable/success/:orderNumber", element: h(Success) })), `/macrotable/success/${order.orderNumber}`);
    expect(success).toContain("Dine in · Table 12 · ");
    expect(success).toContain("Simulated order — no real kitchen received it and nothing was charged.");
    const pickup = load().placeOrder("pickup", { mealId: "fk-chicken-power-bowl", selections: { ...BOWL, veg: "veg-std" } })!.order;
    expect(renderToString(h(KitchenTicket, { order: pickup }))).toMatch(/data-fulfilment[^>]*>PICKUP</);
    expect(fulfilmentLabel(pickup)).toBe("PICKUP");
  });

  it("a dine-in order counts toward today's nutrition exactly once (reload, reopen, repeat approval)", () => {
    const a = load();
    const r = a.placeOrder("in-store", bowl(), { table: "12" })!;
    expect(a.placeOrder("in-store", bowl(), { table: "12" })).toBeNull(); // same attempt approved twice
    for (let i = 0; i < 2; i++) render(h(Routes, null, h(Route, { path: "/macrotable/success/:orderNumber", element: h(Success) })), `/macrotable/success/${r.order.orderNumber}`);
    expect(getOrders()).toHaveLength(1);
    expect(ledgerFor(BASE).consumed.calories).toBe(682);
    expect(load().target.calories).toBe(18);
  });

  it("the QR landing lets the user pick Dine in + table (or Pickup), which Review then uses", () => {
    persist({ dining: { restaurantId: "fitkitchen", mode: "in-store", table: "12" } });
    const html = entry();
    expect(html).toContain("How are you eating here?");
    expect(html).toContain("DINE IN · TABLE 12");
    expect(html).toContain("You can change this before you approve an order.");
  });
});

describe("Research isolation: locked trials keep the original flow", () => {
  it("in a trial, FitKitchen in-store needs no table and records none; the dining choice can't be set", () => {
    const a = load();
    a.beginExperiment({ participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "offline" });
    a.setDining({ restaurantId: "fitkitchen", mode: "in-store", table: "12" }); // ignored during a trial
    const r = a.placeOrder("in-store", bowl());
    expect(r?.research).toBe(true);
    expect(r?.order.table).toBeUndefined();
    expect(r?.order.sessionId).toBeTruthy();
  });

  it("trial Review: the original 'Pickup / Eat in-store' choice, no Dine in, no table — even with a stored dining choice", () => {
    persist({ selection: bowl(), lock: lockOf(), dining: { restaurantId: "fitkitchen", mode: "in-store", table: "12" } });
    const html = render(h(Review));
    expect(html).toContain("How will you get it?");
    expect(html).toContain("Eat in-store");
    expect(html).not.toMatch(/Dine in|Your table|DINE IN/);
  });

  it("trial QR landing: no dining picker and no logo (pre-change presentation)", () => {
    persist({ lock: lockOf(), dining: { restaurantId: "fitkitchen", mode: "in-store", table: "12" } });
    const html = entry();
    expect(html).toContain("Restaurant detected");
    expect(html).not.toMatch(/How are you eating here|data-logo=/);
  });
});

describe("Logos", () => {
  it("Lokanta now has its authentic first-party logo; Macho Mama and The Commons keep the deliberate neutral placeholder", () => {
    expect(REAL_LOGOS["lokanta-proeflokaal"]).toMatchObject({ file: "logos/real/lokanta-proeflokaal.webp", sourceDomain: "lokanta-proeflokaal.nl", sourceType: "official-site-logo" });
    expect(existsSync("public/logos/real/lokanta-proeflokaal.webp")).toBe(true);
    expect(renderToString(h(BrandMark, { restaurant: getRestaurant("lokanta-proeflokaal")! }))).toContain('data-logo="real-official-site"');
    for (const id of ["macho-mama", "the-commons"]) {
      const r = getRestaurant(id)!;
      expect(r.logo).toBeUndefined();
      expect(renderToString(h(BrandMark, { restaurant: r }))).toContain('data-logo="placeholder"');
    }
  });

  it("every demo brand has its original mark on disk", () => {
    for (const r of RESTAURANTS.filter((x) => x.identity === "demo")) {
      expect(r.logo?.source, r.id).toBe("demo-original");
      expect(existsSync(`public/${r.logo!.src}`), r.id).toBe(true);
    }
  });
});

describe("Placed orders keep their shape", () => {
  it("the table is the only new field; research orders never carry it", () => {
    const keys: (keyof PlacedOrder)[] = ["orderNumber", "placedAt", "mode", "scenario", "restaurantId", "mealId", "selections", "configurationId", "nutrition", "price", "handoff", "serviceMode", "pickupCode", "sessionId", "meetsTarget"];
    const o = load().placeOrder("in-store", bowl(), { table: "3" })!.order;
    expect(Object.keys(o).sort()).toEqual([...keys, "table"].sort());
  });
});

describe("QR visitor: after ordering, 'Back to home' shows Remaining today (no onboarding detour)", () => {
  const home = () => render(h(Home), "/macrotable");
  const settingsOf = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? "{}") as { onboardingDone?: boolean };

  it("1. an ordinary fresh visitor still gets onboarding (Home renders nothing but the redirect)", () => {
    expect(cameFromQr()).toBe(false);
    const html = home();
    expect(html).not.toMatch(/REMAINING TODAY|Remaining today|data-ledger-consumed/);
    expect(readFileSync("src/screens/Home.tsx", "utf8")).toMatch(/if \(!settings\.onboardingDone && !lock && !cameFromQr\(\)\) return <Navigate to="\/welcome" replace \/>/);
  });

  it("2–3. a fresh /r/fitkitchen visitor orders (Dine in · Table 12) and reaches Home with the right remaining amount", () => {
    // What the QR landing does on load, outside a trial:
    expect(readFileSync("src/screens/RestaurantEntry.tsx", "utf8")).toMatch(/if \(r && !lock\) markQrEntry\(r\.id\)/);
    markQrEntry("fitkitchen");
    const order = load().placeOrder("in-store", { mealId: "fk-chicken-power-bowl", selections: { ...BOWL, rice: "rice-none" } }, { table: "12" })!.order;
    expect(order).toMatchObject({ table: "12", nutrition: { calories: 522, protein: 46, carbs: 37, fat: 19 } });
    const html = home();
    expect(html).toContain("Remaining today");
    expect(html).toMatch(/data-ledger-consumed="522" data-ledger-remaining="178"/);
    expect(html).toMatch(/Goal met<\/span>(<!-- -->)? · \+1 g/);
    expect(settingsOf().onboardingDone).not.toBe(true); // onboarding itself isn't marked done
  });

  it("4. refresh / reopen: the order still counts once", () => {
    markQrEntry("fitkitchen");
    const r = load().placeOrder("in-store", bowl(), { table: "12" })!;
    for (let i = 0; i < 3; i++) {
      render(h(Routes, null, h(Route, { path: "/macrotable/success/:orderNumber", element: h(Success) })), `/macrotable/success/${r.order.orderNumber}`);
      expect(home()).toMatch(/data-ledger-consumed="682" data-ledger-remaining="18"/);
    }
    expect(getOrders()).toHaveLength(1);
  });

  it("the marker is per tab: a new tab (fresh session) on the same device gets onboarding again", () => {
    markQrEntry("fitkitchen");
    expect(home()).toContain("Remaining today");
    vi.stubGlobal("sessionStorage", memoryStorage()); // a new tab
    expect(home()).not.toContain("Remaining today");
  });

  it("5. research isolation: a trial's Home is unaffected, and the landing never marks a trial tab", () => {
    persist({ lock: lockOf() });
    expect(home()).toContain("Remaining today"); // trials already skip onboarding
    expect(cameFromQr()).toBe(false); // the QR mark is only set outside trials (see the source check above)
  });
});
