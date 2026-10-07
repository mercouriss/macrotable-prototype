import { DEMO_AREA, distanceFromUser } from "../data/geo";
import { catalog, getMeal, getRestaurant } from "../data/restaurants";
import { mealExclusion } from "../lib/feasibility";
import { changesFromDefault, describeChange, supportedOptions } from "../lib/nutrition";
import {
  compareConfigs,
  explainConfiguration,
  infeasibilityReasons,
  optimizeMealConstrained,
  runSearch,
  type Adjustment,
  type ScoredConfiguration,
} from "../lib/optimizer";
import { provenanceLabel, relationshipLabel } from "../lib/provenance";
import type { Meal, Preferences, Restaurant, UserTarget } from "../types";
import type { AgentSessionState, OrderDraft, RecommendationCardData, ScannedMenu, StoreSummary, ToolRun } from "./types";

/*
 * MacroAgent tools. The model (or the offline agent) decides WHICH tool to call;
 * these functions do all nutrition/price arithmetic deterministically, using only
 * restaurant-supported data. No tool can place an order — prepareOrder only drafts
 * one, and the user approves it in the UI.
 */

export interface ToolContext {
  target: UserTarget;
  prefs: Preferences;
  /** Working copy for this turn; tools may mutate it (committed by the orchestrator). */
  state: AgentSessionState;
  /** Research trial: the agent's replies keep their frozen trial wording. Tools ignore it. */
  inTrial?: boolean;
}

type JsonSchema = Record<string, unknown>;
interface ToolDef {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Omit<ToolRun, "name" | "args">;
}

const REAL_NOTE = "Real restaurant, not affiliated with MacroTable: no menu, nutrition, prices or ordering here. MacroTable can only help if the user scans the menu.";
export const SCAN_RESTAURANT_ID = "scan";

// ─── Scanned menus as pseudo-restaurant data ──────────────────────────────

export function scannedRestaurant(menu: ScannedMenu): Restaurant {
  return {
    id: SCAN_RESTAURANT_ID,
    identity: "demo",
    name: menu.restaurantName ?? "Scanned menu",
    integrationLevel: 1,
    cuisine: "Scanned menu",
    tagline: "Photographed menu · not integrated",
    location: DEMO_AREA.user,
    address: "Where you are",
    priceRange: "€€",
    serviceModes: ["in-store"],
    pickupMinutes: 0,
    meals: scannedMeals(menu),
  };
}

export function scannedMeals(menu: ScannedMenu): Meal[] {
  return menu.items.map((it) => ({
    id: `scan:${it.id}`,
    restaurantId: SCAN_RESTAURANT_ID,
    name: it.name,
    description: it.description ?? "",
    price: it.price ?? Number.POSITIVE_INFINITY, // unknown price can never pass the hard budget
    nutrition: it.provenance === "insufficient" ? null : it.nutrition,
    provenance: it.provenance,
    modifierGroups: [], // printed "extras" have no nutrition deltas → never optimised
    available: true,
    dietaryTags: it.markedDietary,
    palette: ["#E7E1D4", "#CFC4AE", "#B9AB90", "#EFEBE3"],
  }));
}

function resolveMeal(mealId: string, state: AgentSessionState): { meal: Meal; restaurant: Restaurant } | undefined {
  if (mealId.startsWith("scan:") && state.scannedMenu) {
    const r = scannedRestaurant(state.scannedMenu);
    const meal = r.meals.find((m) => m.id === mealId);
    return meal ? { meal, restaurant: r } : undefined;
  }
  const f = getMeal(mealId);
  // During a research trial only the frozen study restaurants exist for the agent.
  return f && catalog().includes(f.restaurant) ? f : undefined;
}

function restaurantsInScope(restaurantId: string | undefined, state: AgentSessionState): Restaurant[] {
  if (restaurantId === SCAN_RESTAURANT_ID) return state.scannedMenu ? [scannedRestaurant(state.scannedMenu)] : [];
  if (restaurantId) {
    const r = catalog().find((x) => x.id === restaurantId);
    return r ? [r] : [];
  }
  return catalog();
}

function toCard(c: ScoredConfiguration, target: UserTarget, rejected: string[] = []): RecommendationCardData {
  const e = explainConfiguration(c, target);
  return {
    restaurantId: c.restaurant.id,
    restaurantName: c.restaurant.name,
    mealId: c.meal.id,
    mealName: c.meal.name,
    selections: c.selections,
    changes: changesFromDefault(c.meal, c.selections).map(describeChange),
    nutrition: c.nutrition,
    price: c.price,
    provenance: c.meal.provenance,
    integrationLevel: c.restaurant.integrationLevel,
    meetsTarget: c.meets,
    gaps: e.misses,
    rejectedRequests: rejected,
    targetUsed: { calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat, maxBudget: target.maxBudget },
    reasons: e.meets.slice(0, 2),
  };
}

const summary = (c: ScoredConfiguration) => ({
  restaurant: c.restaurant.name,
  restaurantId: c.restaurant.id,
  meal: c.meal.name,
  mealId: c.meal.id,
  changes: changesFromDefault(c.meal, c.selections).map(describeChange),
  calories: c.nutrition.calories,
  protein_g: c.nutrition.protein,
  carbs_g: c.nutrition.carbs,
  fat_g: c.nutrition.fat,
  price_eur: c.price,
  provenance: provenanceLabel(c.meal.provenance),
  reachesTarget: c.meets,
});

/** The restaurant a follow-up without a restaurant refers to (see AgentSessionState.referenceRestaurantId). */
export function referencedRestaurantId(state: AgentSessionState): string | null {
  return state.referenceRestaurantId ?? state.currentRestaurantId ?? state.currentRecommendation?.restaurantId ?? null;
}

/** Explicit context: the user is at this restaurant (also what follow-ups now refer to). */
export function setPresence(state: AgentSessionState, restaurantId: string | null) {
  state.currentRestaurantId = restaurantId;
  state.referenceRestaurantId = restaurantId;
}

// ─── Tools ────────────────────────────────────────────────────────────────

const getUserContext: ToolDef = {
  name: "getUserContext",
  description:
    "Get the user's remaining nutrition targets for today, budget, preferences, where they are (fictional demo location), the restaurant they are currently at (if any), whether they scanned a menu, and any pending order draft. Call this first when you need the user's goals.",
  parameters: { type: "object", properties: {} },
  run: (_a, { target, prefs, state }) => {
    const r = state.currentRestaurantId === SCAN_RESTAURANT_ID ? null : getRestaurant(state.currentRestaurantId ?? undefined);
    return {
      ok: true,
      result: {
        remaining: { calories: target.calories, protein_min_g: target.protein, carbs_g: target.carbs, fat_g: target.fat },
        budget_max_eur: target.maxBudget,
        preferences: prefs,
        priority: target.priority,
        location: `Demo location near ${DEMO_AREA.label} (demo brands are fictional; real restaurants are unaffiliated and have no menu data)`,
        currentRestaurant: r ? { id: r.id, name: r.name } : state.currentRestaurantId === SCAN_RESTAURANT_ID ? { id: SCAN_RESTAURANT_ID, name: state.scannedMenu?.restaurantName ?? "Scanned menu" } : null,
        hasScannedMenu: !!state.scannedMenu,
        pendingOrderDraft: state.orderDrafts.some((d) => d.status === "awaiting-approval"),
        orderingScope: "pickup or in-store only (no delivery)",
      },
    };
  },
};

const listNearbyStores: ToolDef = {
  name: "listNearbyStores",
  description:
    "List nearby restaurants: every MacroTable demo restaurant (with distance, data confidence, pickup/in-store options, price range and its best-fitting meal for the user's targets, computed by the deterministic optimizer) plus the nearest real, unaffiliated restaurants (no menu data).",
  parameters: {
    type: "object",
    properties: {
      sortBy: { type: "string", enum: ["fit", "distance", "price"], description: "Default: fit to the user's targets." },
      maxBudget: { type: "number", description: "Override the budget in euros if the user just stated one." },
    },
  },
  run: (a, { target, prefs }) => {
    const t = typeof a.maxBudget === "number" ? { ...target, maxBudget: a.maxBudget } : target;
    const all = catalog();
    const real = all.filter((r) => r.identity === "real").sort((x, y) => distanceFromUser(x.location) - distanceFromUser(y.location));
    const shown = [...all.filter((r) => r.identity === "demo"), ...real.slice(0, 3)];
    const stores: (StoreSummary & { _best?: ScoredConfiguration })[] = shown.map((r) => {
      const s = runSearch(t, prefs, r.id);
      const b = s.ranked[0];
      return {
        restaurantId: r.id,
        name: r.name,
        distanceKm: Math.round(distanceFromUser(r.location) * 100) / 100,
        integrationLevel: r.integrationLevel,
        identity: r.identity,
        levelLabel: relationshipLabel(r),
        note: r.identity === "real" ? REAL_NOTE : undefined,
        serviceModes: r.serviceModes,
        pickupMinutes: r.pickupMinutes,
        priceRange: r.priceRange,
        _best: b,
        best: b && {
          mealId: b.meal.id,
          mealName: b.meal.name,
          calories: b.nutrition.calories,
          protein: b.nutrition.protein,
          price: b.price,
          provenance: b.meal.provenance,
          meetsTarget: b.meets,
          gaps: explainConfiguration(b, t).misses,
        },
      };
    });
    const sortBy = a.sortBy === "distance" || a.sortBy === "price" ? a.sortBy : "fit";
    stores.sort((x, y) => {
      if (sortBy === "distance") return x.distanceKm - y.distanceKm;
      if (!x._best || !y._best) return x._best ? -1 : y._best ? 1 : 0;
      if (sortBy === "price") return x._best.price - y._best.price;
      return compareConfigs(x._best, y._best, t.priority);
    });
    const clean = stores.map(({ _best, ...s }) => s);
    return {
      ok: true,
      result: {
        note: "Demo restaurants (identity 'demo') are fictional brands with simulated menus and integrations. Real restaurants (identity 'real') are real places near the user that are NOT affiliated with MacroTable and have no menu data. Ranking follows fit to the user's targets, not integration level.",
        sortBy,
        stores: clean,
        otherRealRestaurantsNearby: Math.max(real.length - 3, 0),
      },
      card: { kind: "stores", stores: clean, otherReal: Math.max(real.length - 3, 0) },
    };
  },
};

const getMenu: ToolDef = {
  name: "getMenu",
  description:
    'Get a restaurant\'s menu: dishes, prices, nutrition, provenance, availability, dietary labels and the modifications it SUPPORTS (plus ones it explicitly does not). Use restaurantId "scan" for the user\'s scanned menu.',
  parameters: {
    type: "object",
    properties: { restaurantId: { type: "string", description: 'A restaurantId from listNearbyStores (e.g. "fitkitchen") or "scan"' } },
    required: ["restaurantId"],
  },
  run: (a, { state }) => {
    const [r] = restaurantsInScope(String(a.restaurantId ?? ""), state);
    if (!r) return { ok: false, result: { error: `Unknown restaurant "${a.restaurantId}". Known: ${catalog().filter((x) => x.meals.length).map((x) => x.id).join(", ")}${state.scannedMenu ? ", scan" : ""}.` } };
    if (r.identity === "real") return { ok: false, result: { restaurant: r.name, error: REAL_NOTE, website: r.real?.website } };
    return {
      ok: true,
      result: {
        restaurant: r.name,
        integration: relationshipLabel(r),
        serviceModes: r.serviceModes,
        dishes: r.meals.map((m) => ({
          mealId: m.id,
          name: m.name,
          description: m.description,
          price_eur: Number.isFinite(m.price) ? m.price : null,
          available: m.available,
          nutrition: m.nutrition,
          provenance: provenanceLabel(m.provenance),
          dietaryLabels: m.dietaryTags,
          modifications: m.modifierGroups.map((g) => ({
            group: g.name,
            supportedOptions: supportedOptions(g).map((o) => ({ label: o.label, price_delta_eur: o.priceDelta, kcal_delta: o.nutritionDelta.calories, protein_delta_g: o.nutritionDelta.protein })),
            notOffered: g.options.filter((o) => !o.supported).map((o) => o.label),
          })),
        })),
      },
    };
  },
};

const optimizeMeal: ToolDef = {
  name: "optimizeMeal",
  description:
    "Find the best feasible meal configuration for the user's targets with the deterministic optimizer. Only restaurant-supported modifications are used; all nutrition and prices come from this tool. Pass the user's requests (e.g. 'less rice' → {group:'rice', request:'less'}; 'no rice' / 'I don't want rice' → {group:'rice', request:'none'}) as adjustments; unsupported requests are reported back, never invented. For 'none', dishes that don't list that ingredient already comply, and dishes that list it without a supported way to remove it are excluded. Omit restaurantId to search all nearby stores.",
  parameters: {
    type: "object",
    properties: {
      restaurantId: { type: "string", description: 'Restrict to one restaurant ("scan" = scanned menu).' },
      mealId: { type: "string", description: "Restrict to one dish." },
      adjustments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            group: { type: "string", description: "Part of the dish the user referred to, e.g. rice, sauce, chicken, vegetables." },
            request: { type: "string", enum: ["less", "more", "none", "exact"] },
            option: { type: "string", description: 'Only for "exact": the option label, e.g. "Half".' },
          },
          required: ["group", "request"],
        },
      },
      calories: { type: "number", description: "Override remaining calories if the user just stated them." },
      protein: { type: "number", description: "Override the protein minimum (g)." },
      maxBudget: { type: "number", description: "Override the budget (€)." },
      vegetarian: { type: "boolean" },
      lowerFat: { type: "boolean", description: "User wants something lighter / lower in fat." },
      noSpicy: { type: "boolean" },
    },
  },
  run: (a, ctx) => {
    const target: UserTarget = {
      ...ctx.target,
      ...(typeof a.calories === "number" ? { calories: a.calories } : {}),
      ...(typeof a.protein === "number" ? { protein: a.protein } : {}),
      ...(typeof a.maxBudget === "number" ? { maxBudget: a.maxBudget } : {}),
    };
    const prefs: Preferences = {
      ...ctx.prefs,
      ...(a.vegetarian === true ? { diet: ctx.prefs.diet === "vegan" ? "vegan" : "vegetarian" } : {}),
      ...(typeof a.lowerFat === "boolean" ? { lowerFat: a.lowerFat } : {}),
      ...(typeof a.noSpicy === "boolean" ? { noSpicy: a.noSpicy } : {}),
    };
    const adjustments = (Array.isArray(a.adjustments) ? a.adjustments : [])
      .filter((x): x is Adjustment => !!x && typeof (x as Adjustment).group === "string")
      .map((x) => ({ group: x.group, request: (["less", "more", "none", "exact"].includes(x.request) ? x.request : "less") as Adjustment["request"], option: x.option }));

    const restaurantId = typeof a.restaurantId === "string" && a.restaurantId ? a.restaurantId : undefined;
    let candidates: { meal: Meal; restaurant: Restaurant }[];
    if (typeof a.mealId === "string" && a.mealId) {
      const f = resolveMeal(a.mealId, ctx.state);
      if (!f) return { ok: false, result: { error: `Unknown dish "${a.mealId}". Call getMenu to see dish ids.` } };
      candidates = [f];
    } else {
      const scope = restaurantsInScope(restaurantId, ctx.state);
      if (!scope.length) return { ok: false, result: { error: restaurantId === SCAN_RESTAURANT_ID ? "No scanned menu yet — ask the user to scan a menu." : `Unknown restaurant "${restaurantId}".` } };
      candidates = scope.flatMap((r) => r.meals.map((meal) => ({ meal, restaurant: r })));
    }

    const excluded: string[] = [];
    const rejected = new Set<string>();
    const bests: ScoredConfiguration[] = [];
    for (const { meal, restaurant } of candidates) {
      const why = mealExclusion(meal, prefs);
      if (why) {
        excluded.push(`${meal.name}: ${why === "no-nutrition" ? "not enough nutrition information" : why}`);
        continue;
      }
      const res = optimizeMealConstrained(meal, restaurant, target, prefs, adjustments);
      if (res.rejected.length) {
        res.rejected.forEach((r) => rejected.add(r));
        if (candidates.length > 1) continue; // prefer dishes that can honour the request
      }
      if (res.best) bests.push(res.best);
    }
    bests.sort((x, y) => compareConfigs(x, y, target.priority));
    const best = bests[0];
    if (!best) {
      return {
        ok: false,
        result: {
          error: "No feasible configuration.",
          notPossible: [...rejected],
          excluded,
          advice: "Explain why using these reasons. Do not suggest modifications that are not listed as supported.",
        },
        card: { kind: "notice", tone: "warn", text: [...rejected][0] ?? "No dish fits the budget and preferences." },
      };
    }
    const card = toCard(best, target, [...rejected]);
    ctx.state.currentRecommendation = card;
    // A recommendation is something to refer back to, not where the user is: presence
    // (currentRestaurantId → "Currently at") is only set by explicit context.
    ctx.state.referenceRestaurantId = best.restaurant.id;
    const e = explainConfiguration(best, target);
    return {
      ok: true,
      result: {
        recommendation: summary(best),
        explanation: { meets: e.meets, misses: e.misses, tradeoffs: e.tradeoffs, confidence: e.confidence.text },
        infeasibility: best.meets ? undefined : infeasibilityReasons(best, target),
        notPossible: [...rejected],
        alternatives: bests.slice(1, 3).map(summary),
        targetUsed: { calories: target.calories, protein_min_g: target.protein, budget_max_eur: target.maxBudget },
      },
      card: { kind: "recommendation", rec: card },
    };
  },
};

const explainProvenance: ToolDef = {
  name: "explainProvenance",
  description: "Explain how reliable a dish's or restaurant's nutrition data is (VERIFIED, OFFICIAL, MENU-READ, ESTIMATED, INSUFFICIENT) and what MacroTable can do there.",
  parameters: { type: "object", properties: { mealId: { type: "string" }, restaurantId: { type: "string" } } },
  run: (a, { state }) => {
    const f = typeof a.mealId === "string" ? resolveMeal(a.mealId, state) : undefined;
    const r = f?.restaurant ?? restaurantsInScope(typeof a.restaurantId === "string" ? a.restaurantId : (referencedRestaurantId(state) ?? undefined), state)[0];
    if (!r) return { ok: false, result: { error: "Specify mealId or restaurantId." } };
    const prov = f?.meal.provenance ?? (r.integrationLevel === 3 ? "verified" : r.integrationLevel === 2 ? "official" : "estimated");
    const meaning: Record<string, string> = {
      verified: "SIMULATED partner-level data for a fictional demo brand: shows what recipe-level data from a verified partner would look like. Nutrition is calculated from the configured ingredients.",
      official: "SIMULATED published-nutrition data for a fictional demo brand.",
      "menu-read": "Printed on the menu the user photographed and read by the vision model; not verified. Reading errors are possible.",
      estimated: "An estimate (public menu or inferred from a dish description); not verified and may differ from the real meal.",
      insufficient: "Not enough information to assess — MacroTable will not recommend it.",
    };
    return {
      ok: true,
      result: {
        restaurant: r.name,
        dish: f?.meal.name,
        provenance: provenanceLabel(prov),
        meaning: meaning[prov],
        integration: relationshipLabel(r),
        canOrderThroughMacroTable: r.integrationLevel >= 2,
      },
    };
  },
};

const analyzeMenuImage: ToolDef = {
  name: "analyzeMenuImage",
  description:
    "Return the structured menu extracted from the user's most recent menu photo (items, prices, printed nutrition, estimates, uncertainties). The photo itself is analysed on the Scan screen only after the user consents. If there is no scan, ask the user to scan a menu.",
  parameters: { type: "object", properties: {} },
  run: (_a, { state }) => {
    const m = state.scannedMenu;
    if (!m) return { ok: false, result: { error: "No scanned menu. Suggest the user taps Scan → Scan menu." } };
    return {
      ok: true,
      result: {
        source: m.source === "gemini" ? "read by the vision model from the user's photo" : "SIMULATED sample extraction (offline demo) — not read from the photo",
        restaurantName: m.restaurantName,
        items: m.items.map((i) => ({ mealId: `scan:${i.id}`, name: i.name, price_eur: i.price, nutrition: i.nutrition, provenance: provenanceLabel(i.provenance), printedFields: i.printedFields, markedDietary: i.markedDietary, visibleExtras: i.visibleModifiers })),
        uncertainties: m.uncertainties,
      },
      card: { kind: "scan", scanId: m.scanId },
    };
  },
};

let draftCounter = 0;
const prepareOrder: ToolDef = {
  name: "prepareOrder",
  description:
    "Prepare (draft) an order for the CURRENT recommendation as pickup or in-store. This does NOT place the order: the user must approve it in the app. Non-integrated restaurants and scanned menus get a counter hand-off summary instead. Delivery is not available.",
  parameters: {
    type: "object",
    properties: { mode: { type: "string", enum: ["pickup", "in-store"], description: "Default pickup." } },
  },
  run: (a, { state }) => {
    const rec = state.currentRecommendation;
    if (!rec) return { ok: false, result: { error: "No current recommendation. Call optimizeMeal first." } };
    const r = rec.restaurantId === SCAN_RESTAURANT_ID ? null : getRestaurant(rec.restaurantId);
    const integrated = !!r && r.integrationLevel >= 2;
    const wanted = a.mode === "in-store" ? "in-store" : "pickup";
    const mode: OrderDraft["mode"] = integrated ? (r!.serviceModes.includes(wanted) ? wanted : r!.serviceModes[0]) : "handoff";
    const draft: OrderDraft = {
      id: `draft-${Date.now().toString(36)}-${++draftCounter}`,
      restaurantId: rec.restaurantId,
      restaurantName: rec.restaurantName,
      mealId: rec.mealId,
      mealName: rec.mealName,
      selections: rec.selections,
      changes: rec.changes,
      nutrition: rec.nutrition,
      price: rec.price,
      provenance: rec.provenance,
      mode,
      readyInMinutes: mode === "pickup" ? r?.pickupMinutes : undefined,
      status: "awaiting-approval",
      createdAt: Date.now(),
    };
    state.orderDrafts = [...state.orderDrafts.filter((d) => d.status !== "awaiting-approval"), draft];
    return {
      ok: true,
      result: {
        draftCreated: true,
        mode,
        requiresUserApproval: true,
        note:
          mode === "handoff"
            ? "Restaurant not integrated: the app shows a summary for the user to order at the counter. Nothing is sent."
            : "The user must tap Approve in the app to send it. You cannot place orders.",
        summary: { restaurant: rec.restaurantName, meal: rec.mealName, changes: rec.changes, price_eur: rec.price },
      },
      card: { kind: "order", draftId: draft.id },
    };
  },
};

export const TOOLS: ToolDef[] = [getUserContext, listNearbyStores, getMenu, optimizeMeal, explainProvenance, analyzeMenuImage, prepareOrder];

/** Gemini function declarations (JSON-schema subset). */
export const TOOL_DECLARATIONS = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

export function executeTool(name: string, args: unknown, ctx: ToolContext): ToolRun {
  const def = TOOLS.find((t) => t.name === name);
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  if (!def) return { name, args: a, ok: false, result: { error: `Unknown tool ${name}. Available: ${TOOLS.map((t) => t.name).join(", ")}` } };
  try {
    return { name, args: a, ...def.run(a, ctx) };
  } catch (e) {
    return { name, args: a, ok: false, result: { error: `Tool failed: ${(e as Error).message}` } };
  }
}
