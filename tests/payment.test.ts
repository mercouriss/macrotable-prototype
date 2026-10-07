import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStateProvider } from "../src/agent/agentState";
import type { OrderDraft } from "../src/agent/types";
import { AgentCardView } from "../src/components/agent/AgentCards";
import { PaymentSheet, paymentLabel, readPaymentMethod, type PaymentMethod } from "../src/components/PaymentSheet";
import { Button } from "../src/components/ui";
import { getRestaurant } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { clearOrders, getOrders, STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { clearLedger } from "../src/lib/ledger";
import { Review } from "../src/screens/Review";
import { Success } from "../src/screens/Success";
import { AppStateProvider, useAppState, type MealSelection } from "../src/state/AppState";
import type { Selections } from "../src/types";

/*
 * Simulated payment step (normal mode only): Review's "Approve order" and MacroAgent's "Approve & send order"
 * open the same Payment sheet; only "Place simulated order" runs the existing completion, once. Hand-offs and
 * research trials approve directly, exactly as before. The choice lives only in navigation state.
 *
 * No DOM here: a wrapper component calls the screen during a server render and the test then calls the
 * captured handlers (clicks inside the Payment sheet are applied as render-phase updates of that wrapper).
 */

const { sheet, opened, nav, agentCalls } = vi.hoisted(() => {
  type SheetBody = { type: unknown; props: { mode: "pickup" | "in-store"; total: number; onBack: () => void; onConfirm: (m: PaymentMethod) => void } };
  const opened: { title: string; body: SheetBody; opts: unknown }[] = [];
  const sheet = {
    openCustom: vi.fn((title: string, body: SheetBody, opts: unknown) => void opened.push({ title, body, opts })),
    close: vi.fn(),
    openProvenance: vi.fn(),
    openLevel: vi.fn(),
  };
  return { sheet, opened, nav: vi.fn(), agentCalls: [] as [string, unknown[]][] };
});
vi.mock("../src/components/Sheet", async (orig) => ({ ...(await orig<typeof import("../src/components/Sheet")>()), useSheet: () => sheet }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => nav }));
// Record every agent action the card triggers (the real implementations still run).
vi.mock("../src/agent/agentState", async (orig) => {
  const m = await orig<typeof import("../src/agent/agentState")>();
  return {
    ...m,
    useAgent: () => {
      const a = m.useAgent();
      const wrapped: Record<string, unknown> = { ...a };
      for (const [k, v] of Object.entries(a)) if (typeof v === "function") wrapped[k] = (...args: unknown[]) => (agentCalls.push([k, args]), (v as (...x: unknown[]) => unknown)(...args));
      return wrapped;
    },
  };
});

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
let local: ReturnType<typeof memoryStorage>;
let session: ReturnType<typeof memoryStorage>;
const fetchSpy = vi.fn(() => Promise.reject(new Error("no network in the payment step")));
beforeEach(() => {
  vi.stubGlobal("localStorage", (local = memoryStorage()));
  vi.stubGlobal("sessionStorage", (session = memoryStorage()));
  vi.stubGlobal("fetch", fetchSpy);
  clearOrders();
  clearLedger();
  opened.length = 0;
  agentCalls.length = 0;
  sheet.openCustom.mockClear();
  sheet.close.mockClear();
  nav.mockClear();
  fetchSpy.mockClear();
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled(); // no payment provider, Worker, Gemini or restaurant call in any flow
  vi.unstubAllGlobals();
});

const A = SCENARIOS.A;
const BOWL: Selections = { chicken: "chicken-50", rice: "rice-half", sauce: "sauce-light", veg: "veg-double" }; // 682 kcal, €16.50
const bowl = (): MealSelection => ({ mealId: "fk-chicken-power-bowl", selections: BOWL });
const lockOf = { participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "offline", sessionId: "s-fixed", startedAt: 1 };
const persist = (extra: Record<string, unknown>) => {
  writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true, agentMode: "offline" });
  writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: A.target, prefs: A.preferences, selection: null, lock: null, ...extra });
};
let app: ReturnType<typeof useAppState>;
const Probe = () => ((app = useAppState()), null);
const load = () => (renderToString(h(AppStateProvider, null, h(Probe))), app);

// ── Element-tree helpers ───────────────────────────────────────────────────────────────────────────────
type El = { type: unknown; props: Record<string, unknown> };
const isEl = (x: unknown): x is El => !!x && typeof x === "object" && "$$typeof" in x && "props" in x;
function* walk(x: unknown): Generator<El> {
  if (Array.isArray(x)) for (const y of x) yield* walk(y);
  else if (isEl(x)) {
    yield x;
    for (const v of Object.values(x.props)) yield* walk(v);
  }
}
const text = (x: unknown): string => (typeof x === "string" || typeof x === "number" ? String(x) : Array.isArray(x) ? x.map(text).join("") : isEl(x) ? text(x.props.children) : "");
const buttonIn = (tree: unknown, label: string) => {
  const b = [...walk(tree)].find((e) => (e.type === "button" || e.type === Button) && text(e.props.children).includes(label));
  if (!b) throw new Error(`no "${label}" button`);
  return b;
};
const click = (b: El) => (b.props.onClick as () => void)();

/** Render a screen inside the providers via a wrapper; returns the screen's element tree. */
function capture(make: () => unknown, path = "/") {
  let tree: unknown;
  const W = () => ((tree = make()), null);
  renderToString(h(MemoryRouter, { initialEntries: [path] }, h(AppStateProvider, null, h(AgentStateProvider, null, h(W)))));
  return tree;
}
const reviewTree = () => capture(() => Review());
/** MacroAgent's order card for a draft (the card component is expanded inside the wrapper). */
const orderCardTree = () =>
  capture(() => {
    const el = AgentCardView({ card: { kind: "order", draftId: "d1" } }) as unknown as El;
    return (el.type as (p: unknown) => unknown)(el.props);
  });

/** The Payment sheet, with radio taps applied as render-phase updates; returns the final tree. */
function paymentTree(props: { mode: "pickup" | "in-store"; total: number; onBack?: () => void; onConfirm?: (m: PaymentMethod) => void }, taps: PaymentMethod[] = []) {
  let tree: unknown;
  let i = 0;
  const full = { onBack: () => {}, onConfirm: () => {}, ...props };
  const W = () => {
    tree = PaymentSheet(full);
    if (i < taps.length) {
      const id = taps[i++];
      (([...walk(tree)].find((e) => e.props["data-payment-option"] === id)!.props.onClick) as () => void)();
    }
    return tree as never;
  };
  const html = renderToString(h(W));
  return { tree, html };
}
const checked = (html: string, id: PaymentMethod) => new RegExp(`aria-checked="true"[^>]*data-payment-option="${id}"`).test(html);
const visibleText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");

const draft = (extra: Partial<OrderDraft> = {}): OrderDraft => ({
  id: "d1",
  restaurantId: "fitkitchen",
  restaurantName: "FitKitchen",
  mealId: "fk-chicken-power-bowl",
  mealName: "Chicken Power Bowl",
  selections: BOWL,
  changes: [],
  nutrition: { calories: 682, protein: 49, carbs: 72, fat: 20 },
  price: 16.5,
  provenance: "verified",
  mode: "pickup",
  readyInMinutes: 15,
  status: "awaiting-approval",
  createdAt: Date.now() - 1_000,
  ...extra,
});
const seedAgent = (d: OrderDraft) =>
  sessionStorage.setItem(
    "macrotable.agent.v1",
    JSON.stringify({ messages: [], currentRestaurantId: "fitkitchen", scannedMenu: null, currentRecommendation: null, orderDrafts: [d], providerHistory: [] }),
  );
const ordersInLedger = () => load().todayLog.filter((e) => e.source === "order").length;

// ── The sheet itself ───────────────────────────────────────────────────────────────────────────────────
describe("PaymentSheet", () => {
  it("pickup: iDEAL (default) or Pay at pickup, the total, the demo note, Place simulated order / Back", () => {
    const { html } = paymentTree({ mode: "pickup", total: 16.5 });
    const t = visibleText(html);
    expect(checked(html, "ideal")).toBe(true);
    expect(checked(html, "pay-in-store")).toBe(false);
    for (const s of ["iDEAL", "Pay at pickup", "Pay when you collect", "Total", "€16.50", "Demo only. No payment will be charged.", "Place simulated order", "Back"]) expect(t).toContain(s);
    expect(t).not.toContain("Pay at restaurant");
    expect(html.match(/role="radio"/g)).toHaveLength(2); // no other methods
  });

  it("dine-in / in-store: Pay at restaurant · Pay at the restaurant", () => {
    const t = visibleText(paymentTree({ mode: "in-store", total: 16.5 }).html);
    expect(t).toContain("Pay at restaurant");
    expect(t).toContain("Pay at the restaurant");
    expect(t).not.toContain("Pay at pickup");
  });

  it("switching methods works and the confirmed method is the selected one", () => {
    const got: PaymentMethod[] = [];
    const s = paymentTree({ mode: "pickup", total: 16.5, onConfirm: (m) => got.push(m) }, ["pay-in-store"]);
    expect(checked(s.html, "pay-in-store")).toBe(true);
    expect(checked(s.html, "ideal")).toBe(false);
    click(buttonIn(s.tree, "Place simulated order"));
    const back = paymentTree({ mode: "pickup", total: 16.5, onConfirm: (m) => got.push(m) }, ["pay-in-store", "ideal"]);
    expect(checked(back.html, "ideal")).toBe(true);
    click(buttonIn(back.tree, "Place simulated order"));
    expect(got).toEqual(["pay-in-store", "ideal"]);
  });

  it("rapid taps on Place simulated order confirm once; Back never confirms", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    const { tree } = paymentTree({ mode: "pickup", total: 16.5, onConfirm, onBack });
    click(buttonIn(tree, "Back"));
    expect(onConfirm).not.toHaveBeenCalled();
    const place = buttonIn(tree, "Place simulated order");
    click(place);
    click(place);
    click(place);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("ideal");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("no card fields, no payment API, no forbidden wording", () => {
    const html = paymentTree({ mode: "pickup", total: 16.5 }).html + paymentTree({ mode: "in-store", total: 9 }).html;
    expect(html).not.toMatch(/<(input|select|textarea|form)\b/);
    expect(visibleText(html)).not.toMatch(/Pay now|\bBuy\b|Place order|Confirm payment|card number|CVV|expir|billing|\btip|promo|\btax/i);
    const src = readFileSync("src/components/PaymentSheet.tsx", "utf8");
    expect(src).not.toMatch(/PaymentRequest|ApplePaySession|stripe|adyen|mollie|fetch\(|XMLHttpRequest|setTimeout|localStorage|sessionStorage|useAppState|useAgent/i);
    expect(src).not.toMatch(/from "(?!react"|\.\.\/lib\/format"|\.\.\/types"|\.\/Icon"|\.\/ui")/); // no SDK or app-state imports
  });
});

// ── Review path ────────────────────────────────────────────────────────────────────────────────────────
describe("Review → Payment → Place simulated order", () => {
  it("Approve order opens Payment (iDEAL default, €16.50) and places nothing", () => {
    persist({ selection: bowl() });
    click(buttonIn(reviewTree(), "Approve order"));
    expect(opened).toHaveLength(1);
    expect(opened[0].title).toBe("Payment");
    expect(opened[0].opts).toEqual({ stickyHeader: true });
    expect(opened[0].body.type).toBe(PaymentSheet);
    expect(opened[0].body.props).toMatchObject({ mode: "pickup", total: 16.5 });
    expect(getOrders()).toHaveLength(0);
    expect(ordersInLedger()).toBe(0);
    expect(nav).not.toHaveBeenCalled();
  });

  it("Back places no order; reopening and Place simulated order completes exactly once", () => {
    persist({ selection: bowl() });
    click(buttonIn(reviewTree(), "Approve order"));
    opened[0].body.props.onBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(getOrders()).toHaveLength(0);
    expect(nav).not.toHaveBeenCalled();

    click(buttonIn(reviewTree(), "Approve order")); // reopen
    const { onConfirm } = opened[1].body.props;
    onConfirm("ideal");
    onConfirm("ideal"); // even a second completion call can't duplicate (existing idempotency)
    expect(getOrders()).toHaveLength(1);
    expect(ordersInLedger()).toBe(1);
    const n = getOrders()[0].orderNumber;
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith(`/macrotable/success/${n}`, { replace: true, state: { fresh: true, payment: "ideal" } });
    // Never stored: not on the order, the ledger, the selection or anywhere else in storage.
    expect(Object.keys(getOrders()[0])).not.toContain("payment");
    expect(JSON.stringify([...Array(local.length)].map((_, i) => local.getItem(local.key(i)!)))).not.toMatch(/ideal|pay-in-store|payment/i);
    expect(JSON.stringify([...Array(session.length)].map((_, i) => session.getItem(session.key(i)!)))).not.toMatch(/ideal|pay-in-store|payment/i);
  });

  it("dine-in: the table survives the payment step; Pay at restaurant", () => {
    persist({ selection: bowl(), dining: { restaurantId: "fitkitchen", mode: "in-store", table: "12" } });
    click(buttonIn(reviewTree(), "Approve order"));
    expect(opened[0].body.props).toMatchObject({ mode: "in-store", total: 16.5 });
    expect(visibleText(paymentTree(opened[0].body.props).html)).toContain("Pay at restaurant");
    opened[0].body.props.onConfirm("pay-in-store");
    const [o] = getOrders();
    expect(o).toMatchObject({ serviceMode: "in-store", table: "12" });
    expect(nav).toHaveBeenCalledWith(`/macrotable/success/${o.orderNumber}`, { replace: true, state: { fresh: true, payment: "pay-in-store" } });
  });

  it("dine-in without a table: approval stays blocked, no sheet can open", () => {
    persist({ selection: bowl(), dining: { restaurantId: "fitkitchen", mode: "in-store" } });
    const b = buttonIn(reviewTree(), "Choose your table to approve");
    expect(b.props.disabled).toBe(true);
  });

  it("hand-off: approves directly — no Payment sheet", () => {
    const grill = getRestaurant("localgrill")!;
    expect(grill.integrationLevel).toBe(1);
    persist({ selection: { mealId: grill.meals[0].id, selections: {} } });
    click(buttonIn(reviewTree(), "Approve hand-off summary"));
    expect(opened).toHaveLength(0);
    expect(getOrders()).toHaveLength(1);
    expect(getOrders()[0].handoff).toBe(true);
    expect(nav).toHaveBeenCalledWith(`/macrotable/success/${getOrders()[0].orderNumber}`, { replace: true, state: { fresh: true } });
  });

  it("research trial: Approve order completes the trial directly — no sheet, no payment anywhere", () => {
    persist({ selection: bowl(), lock: lockOf });
    const html = renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(Review))));
    expect(html).toContain(">Approve order<");
    expect(html).not.toMatch(/Payment|iDEAL|Apple Pay|Place simulated order/);
    click(buttonIn(reviewTree(), "Approve order"));
    expect(opened).toHaveLength(0);
    expect(getOrders()).toHaveLength(1);
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith("/experiment/done", { replace: true, state: { completed: true } });
    expect(JSON.stringify([...Array(local.length)].map((_, i) => local.getItem(local.key(i)!)))).not.toMatch(/ideal|pay-in-store|payment/i);
  });
});

// ── MacroAgent path ────────────────────────────────────────────────────────────────────────────────────
describe("MacroAgent: Approve & send order → Payment → Place simulated order", () => {
  it("opens the same sheet without calling approveDraft; Back calls nothing", () => {
    persist({});
    seedAgent(draft());
    click(buttonIn(orderCardTree(), "Approve & send order"));
    expect(opened).toHaveLength(1);
    expect(opened[0].title).toBe("Payment");
    expect(opened[0].body.type).toBe(PaymentSheet);
    expect(opened[0].body.props).toMatchObject({ mode: "pickup", total: 16.5 });
    expect(agentCalls).toEqual([]); // no approval, no agent turn, no context change
    opened[0].body.props.onBack();
    expect(agentCalls).toEqual([]);
    expect(getOrders()).toHaveLength(0);
    expect(ordersInLedger()).toBe(0);
  });

  it("confirming calls the existing approveDraft exactly once with the unchanged draft; rapid repeats can't duplicate", () => {
    persist({});
    seedAgent(draft());
    click(buttonIn(orderCardTree(), "Approve & send order"));
    const { onConfirm } = opened[0].body.props;
    onConfirm("ideal");
    expect(agentCalls).toEqual([["approveDraft", ["d1", undefined]]]);
    onConfirm("ideal"); // a direct second call: the existing approveDraft refuses it
    expect(agentCalls.map(([k]) => k)).toEqual(["approveDraft", "approveDraft"]);
    expect(getOrders()).toHaveLength(1);
    expect(ordersInLedger()).toBe(1);
    expect(getOrders()[0]).toMatchObject({ mealId: "fk-chicken-power-bowl", selections: BOWL, price: 16.5, serviceMode: "pickup" });
    expect(Object.keys(getOrders()[0])).not.toContain("payment");
    expect(nav).not.toHaveBeenCalled(); // normal mode stays in the chat (the card shows the acceptance)
    expect(JSON.stringify([...Array(session.length)].map((_, i) => session.getItem(session.key(i)!)))).not.toMatch(/ideal|pay-in-store|payment/i);
  });

  it("through the sheet's own button, rapid taps approve once", () => {
    persist({});
    seedAgent(draft());
    click(buttonIn(orderCardTree(), "Approve & send order"));
    const { tree } = paymentTree(opened[0].body.props);
    const place = buttonIn(tree, "Place simulated order");
    click(place);
    click(place);
    expect(agentCalls).toEqual([["approveDraft", ["d1", undefined]]]);
    expect(getOrders()).toHaveLength(1);
  });

  it("dine-in draft: the chosen table reaches approveDraft; Pay at restaurant", () => {
    persist({ dining: { restaurantId: "fitkitchen", mode: "in-store", table: "12" } });
    seedAgent(draft({ mode: "in-store" }));
    click(buttonIn(orderCardTree(), "Approve & send order"));
    expect(opened[0].body.props).toMatchObject({ mode: "in-store" });
    opened[0].body.props.onConfirm("pay-in-store");
    expect(agentCalls).toEqual([["approveDraft", ["d1", "12"]]]);
    expect(getOrders()[0]).toMatchObject({ serviceMode: "in-store", table: "12" });
  });

  it("hand-off draft: Done, I'll order at the counter goes straight through, no sheet", () => {
    persist({});
    const grill = getRestaurant("localgrill")!;
    seedAgent(draft({ restaurantId: grill.id, restaurantName: grill.name, mealId: grill.meals[0].id, mealName: grill.meals[0].name, selections: {}, mode: "handoff" }));
    click(buttonIn(orderCardTree(), "Done, I'll order at the counter"));
    expect(opened).toHaveLength(0);
    expect(agentCalls.map(([k]) => k)).toEqual(["approveDraft"]);
  });

  it("research trial: approval completes the trial directly — no sheet", () => {
    persist({ lock: lockOf });
    seedAgent(draft());
    click(buttonIn(orderCardTree(), "Approve & send order"));
    expect(opened).toHaveLength(0);
    expect(agentCalls).toEqual([["approveDraft", ["d1", undefined]]]);
    expect(nav).toHaveBeenCalledWith("/experiment/done", { replace: true, state: { completed: true } });
  });
});

// ── Confirmation ───────────────────────────────────────────────────────────────────────────────────────
describe("Success: the payment line comes only from navigation state", () => {
  const success = (n: string, state?: unknown) =>
    renderToString(
      h(MemoryRouter, { initialEntries: [{ pathname: `/macrotable/success/${n}`, state }] }, h(AppStateProvider, null, h(Routes, null, h(Route, { path: "/macrotable/success/:orderNumber", element: h(Success) })))),
    );
  const place = (mode: "pickup" | "in-store", table?: string) => {
    persist({ selection: bowl(), ...(table ? { dining: { restaurantId: "fitkitchen", mode, table } } : {}) });
    return load().placeOrder(mode, bowl(), table ? { table } : undefined)!.order.orderNumber;
  };

  it("iDEAL · Pay at pickup · Pay at restaurant", () => {
    const p = place("pickup");
    expect(success(p, { fresh: true, payment: "ideal" })).toMatch(/data-payment-line[^>]*>Payment · <!-- -->iDEAL \(simulated\)</);
    expect(success(p, { fresh: true, payment: "pay-in-store" })).toMatch(/>Payment · <!-- -->Pay at pickup</);
    clearOrders();
    const d = place("in-store", "12");
    expect(success(d, { fresh: true, payment: "pay-in-store" })).toMatch(/>Payment · <!-- -->Pay at restaurant</);
  });

  it("no state (refresh / direct link) or an unknown value: renders normally, no line", () => {
    const p = place("pickup");
    for (const state of [undefined, null, { fresh: true }, { payment: "visa" }, { payment: { method: "ideal" } }]) {
      const html = success(p, state);
      expect(html).toContain("Order approved");
      expect(html).not.toContain("data-payment-line");
      expect(html).not.toContain("Payment ·");
    }
    expect(success(p)).toBe(success(p, { fresh: false })); // identical with or without other state
  });

  it("labels and state parsing", () => {
    expect(paymentLabel("ideal", "pickup")).toBe("iDEAL (simulated)");
    expect(paymentLabel("ideal", "in-store")).toBe("iDEAL (simulated)");
    expect(paymentLabel("pay-in-store", "pickup")).toBe("Pay at pickup");
    expect(paymentLabel("pay-in-store", "in-store")).toBe("Pay at restaurant");
    expect(readPaymentMethod({ payment: "ideal" })).toBe("ideal");
    expect(readPaymentMethod({ payment: "card" })).toBeUndefined();
    expect(readPaymentMethod(null)).toBeUndefined();
    expect(readPaymentMethod("ideal")).toBeUndefined();
  });
});
