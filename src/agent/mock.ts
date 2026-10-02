import { catalog } from "../data/restaurants";
import { euro } from "../lib/format";
import type { Adjustment } from "../lib/optimizer";
import { executeTool, referencedRestaurantId, SCAN_RESTAURANT_ID, type ToolContext } from "./tools";
import type { RecommendationCardData, StoreSummary, ToolRun } from "./types";
import { provenanceLabel } from "../lib/provenance";
import type { Provenance } from "../types";
import { getRestaurant } from "../data/restaurants";

/*
 * Offline MockAgent: a deterministic intent parser that calls the SAME tools
 * as the live model. It never claims to be live inference. It understands the
 * canonical demo intents and the quick-reply buttons; anything else gets help.
 */

export interface ParsedIntent {
  calories?: number;
  protein?: number;
  maxBudget?: number;
  vegetarian?: boolean;
  lowerFat?: boolean;
  noSpicy?: boolean;
  adjustments: Adjustment[];
  restaurantId?: string;
  compare: boolean;
  why: boolean;
  order?: "pickup" | "in-store";
  menu: boolean;
  scan: boolean;
  recommend: boolean;
}

const PARTS = ["rice", "sauce", "chicken", "salmon", "tofu", "halloumi", "veg", "vegetables", "veggies", "greens", "quinoa", "freekeh", "dressing", "tahini", "hummus", "cheese", "sour cream", "edamame", "avocado", "protein", "carbs", "meat", "pasta", "naan", "pesto", "parmesan", "feta", "raita"];
/** "no rice", "without rice", "I don't want rice", "avoid rice", "leave out the rice", "rice-free", … */
const REMOVE = "(?:no|without|skip|hold|leave out|drop|remove|cut out|avoid|minus|(?:i\\s+)?(?:don'?t|do not|dont)\\s+(?:want|like|need|eat))";

export function parseIntent(raw: string): ParsedIntent {
  const t = raw.toLowerCase().replace(/[’']/g, "'");
  const num = (re: RegExp) => {
    const m = re.exec(t);
    return m ? Number(m[1].replace(",", ".")) : undefined;
  };
  const adjustments: Adjustment[] = [];
  for (const part of PARTS) {
    const p = part.replace(" ", "\\s?");
    if (new RegExp(`\\b(less|fewer|smaller|half|light|lighter|reduce[d]?)\\s+(the\\s+)?${p}\\b`).test(t) || new RegExp(`\\b${p}\\s+(light|lighter|reduced|halved)\\b`).test(t))
      adjustments.push({ group: part, request: "less" });
    else if (new RegExp(`\\b${REMOVE}\\s+(?:the\\s+|any\\s+|my\\s+)?${p}\\b`).test(t) || new RegExp(`\\b${p}-free\\b`).test(t)) adjustments.push({ group: part, request: "none" });
    else if (new RegExp(`\\b(more|extra|double|add|additional)\\s+(the\\s+)?${p}\\b`).test(t)) adjustments.push({ group: part, request: "more" });
  }
  const restaurantId = catalog().find((r) => t.includes(r.name.toLowerCase()) || t.includes(r.id))?.id ?? (/\b(scanned|scan)\s+menu\b|\bthis menu\b/.test(t) ? SCAN_RESTAURANT_ID : undefined);
  return {
    calories: num(/(\d{3,4})\s*(k?cal|calories|kcals?)\b/),
    protein: num(/(\d{1,3})\s*(g|grams?)?\s*(of\s+)?protein\b/) ?? num(/protein\s*(?:of|:|≥|>=|at least)?\s*(\d{1,3})\s*g\b/),
    maxBudget: num(/(?:€|eur(?:o|os)?\s*)(\d{1,3}(?:[.,]\d{1,2})?)/) ?? num(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o|os)?)\b/),
    vegetarian: /\b(vegetarian|veggie|no meat)\b/.test(t) || undefined,
    lowerFat: /\b(not (too )?heavy|light(er)? meal|something light|lower fat|low fat|less fat|lean)\b/.test(t) || undefined,
    noSpicy: /\b(not spicy|no spic|mild)\b/.test(t) || undefined,
    adjustments,
    restaurantId,
    compare: /\b(compare|other stores|alternatives|options|which (store|restaurant)s?)\b/.test(t),
    why: /\bwhy\b|\bexplain\b|how (was|is) (this|it) calculated|confiden|trust|reliable|provenance/.test(t),
    order: /\b(pick ?up|take ?away|to go|collect)\b/.test(t) ? "pickup" : /\b(in-?store|eat (it )?(here|in)|dine in|at the counter|order it|order this)\b/.test(t) ? "in-store" : undefined,
    menu: /\b(show|see|what'?s on|view)\b.*\bmenu\b|\bmenu\b\??$/.test(t) && !/\bscan/.test(t),
    scan: /\bscan|photo|picture|camera\b/.test(t),
    recommend: /\b(eat|meal|food|dinner|lunch|hungry|recommend|suggest|find|what should|near|nearby|close|fit|high protein|protein|calories|kcal|budget|€|something)\b/.test(t),
  };
}

const provWord = (p: string) => provenanceLabel(p as Provenance);

function recText(rec: RecommendationCardData, lead: string): string {
  const n = rec.nutrition;
  const lines = [
    lead,
    `${rec.mealName} at ${rec.restaurantName}: ${n.calories} kcal · ${n.protein} g protein · ${euro(rec.price)} (${provWord(rec.provenance)} data).`,
  ];
  if (rec.changes.length) lines.push(`I'd configure it with: ${rec.changes.join(", ").toLowerCase()} — all supported by ${rec.restaurantName}.`);
  if (rec.gaps.length) lines.push(`Heads-up: ${rec.gaps.join("; ").toLowerCase()}.`);
  else lines.push("It reaches your calorie range and protein minimum within budget.");
  if (rec.rejectedRequests.length) lines.push(rec.rejectedRequests[0]);
  return lines.join("\n");
}

export interface MockTurn {
  text: string;
  toolRuns: ToolRun[];
}

export function runMockTurn(userText: string, ctx: ToolContext): MockTurn {
  const runs: ToolRun[] = [];
  const call = (name: string, args: Record<string, unknown> = {}) => {
    const r = executeTool(name, args, ctx);
    runs.push(r);
    return r;
  };
  const i = parseIntent(userText);
  // Session memory: constraints stated earlier still apply; anything stated now wins.
  const said = {
    ...(i.calories ? { calories: i.calories } : {}),
    ...(i.protein ? { protein: i.protein } : {}),
    ...(i.maxBudget ? { maxBudget: i.maxBudget } : {}),
    ...(i.vegetarian ? { vegetarian: true } : {}),
    ...(i.lowerFat ? { lowerFat: true } : {}),
    ...(i.noSpicy ? { noSpicy: true } : {}),
  };
  const removals = i.adjustments.filter((a) => a.request === "none").map((a) => a.group);
  // Precedence: the app's current target (remaining today, from confirmed meals) outranks calories/protein
  // stated for an earlier meal. Once it has changed, those stated macros are dropped; budget, diet flags
  // and avoided ingredients are preferences, so they persist.
  const basis = { calories: ctx.target.calories, protein: ctx.target.protein };
  const stored = ctx.state.stated ?? {};
  const targetMoved = !!stored.basis && (stored.basis.calories !== basis.calories || stored.basis.protein !== basis.protein);
  const { calories: _c, protein: _p, ...preferences } = stored;
  const prev = targetMoved ? preferences : stored;
  const avoid = [...new Set([...(prev.avoid ?? []), ...removals])];
  ctx.state.stated = { ...prev, ...said, ...(avoid.length ? { avoid } : {}), basis };
  const { avoid: _avoid, basis: _basis, ...remembered } = ctx.state.stated;
  const overrides = { ...remembered, ...said };
  /** Remembered "no X" requests plus this turn's adjustments (deduplicated by part). */
  const withAvoid = (adj: Adjustment[]) => [...adj, ...avoid.filter((g) => !adj.some((a) => a.group === g)).map((g) => ({ group: g, request: "none" as const }))];
  // Anchor: naming a (non-scan) restaurant anchors follow-ups there; asking to compare releases it.
  if (i.restaurantId && i.restaurantId !== SCAN_RESTAURANT_ID) ctx.state.anchorRestaurantId = i.restaurantId;
  if (i.compare) ctx.state.anchorRestaurantId = null;
  const cur = ctx.state.currentRecommendation;

  // 1. Prepare an order for the current (or a fresh) recommendation.
  if (i.order) {
    if (!cur || i.restaurantId) call("optimizeMeal", { restaurantId: i.restaurantId, ...overrides });
    const rec = ctx.state.currentRecommendation;
    if (!rec) return { text: "I couldn't find a feasible meal to order yet. Tell me what you'd like, or ask me to compare stores.", toolRuns: runs };
    const r = call("prepareOrder", { mode: i.order });
    const mode = (r.result as { mode?: string }).mode;
    return {
      text:
        mode === "handoff"
          ? `${rec.restaurantName} isn't connected to MacroTable, so I can't send an order. I've prepared a summary of ${rec.mealName} (${euro(rec.price)}) to show at the counter.`
          : `I've prepared ${mode === "in-store" ? "an in-store" : "a pickup"} order: ${rec.mealName} at ${rec.restaurantName}, ${euro(rec.price)}. Nothing is sent until you tap Approve.`,
      toolRuns: runs,
    };
  }

  // 2. Adjust the current dish ("less rice", "no sauce", "more chicken"). A follow-up that also changes a
  // hard constraint ("budget €14 and no rice") is a new search instead (step 6), and so is a change the
  // current dish can't meet only because of the constraints: that dish failing doesn't mean nothing fits.
  let searchInstead = false;
  if (i.adjustments.length && cur && !i.restaurantId && !i.compare && !Object.keys(said).length) {
    const r = call("optimizeMeal", { mealId: cur.mealId, adjustments: withAvoid(i.adjustments), ...overrides });
    const rec = ctx.state.currentRecommendation;
    if (!r.ok || !rec || rec === cur) {
      const why = ((r.result as { notPossible?: string[] }).notPossible ?? [])[0];
      if (why) return { text: why, toolRuns: runs }; // the restaurant doesn't support it: say so
      searchInstead = true;
    } else return { text: recText(rec, "Done — re-optimised with your change using only supported options:"), toolRuns: runs };
  }

  // 3. Why / confidence.
  if (i.why && cur && !i.compare && !searchInstead) {
    call("explainProvenance", { mealId: cur.mealId });
    const r = call("optimizeMeal", { mealId: cur.mealId });
    const e = (r.result as { explanation?: { meets: string[]; tradeoffs: string[]; confidence: string } }).explanation;
    return {
      text: e
        ? [`Why ${cur.mealName}:`, `• Meets: ${e.meets.join("; ").toLowerCase()}.`, e.tradeoffs.length ? `• Trade-offs: ${e.tradeoffs.join("; ").toLowerCase()}.` : "", `• Confidence: ${e.confidence}`].filter(Boolean).join("\n")
        : "I couldn't recompute the explanation for that dish.",
      toolRuns: runs,
    };
  }

  // 4. Menu of a restaurant.
  if (i.menu && !searchInstead) {
    const rid = i.restaurantId ?? referencedRestaurantId(ctx.state) ?? undefined;
    if (!rid) return { text: "Which restaurant? Try: FitKitchen, Urban Bowl or Local Grill.", toolRuns: runs };
    const r = call("getMenu", { restaurantId: rid });
    const dishes = ((r.result as { dishes?: { name: string; price_eur: number | null; available: boolean }[] }).dishes ?? []).filter((d) => d.available);
    return { text: `${dishes.length} dishes available: ${dishes.map((d) => `${d.name}${d.price_eur ? ` (${euro(d.price_eur)})` : ""}`).join(", ")}. Want me to pick the best fit?`, toolRuns: runs };
  }

  // 5. Scanned menu.
  if (!searchInstead && (i.scan || i.restaurantId === SCAN_RESTAURANT_ID)) {
    if (!ctx.state.scannedMenu) return { text: "Scan the menu first (Scan → Scan menu). I'll read it and find what fits.", toolRuns: runs };
    call("analyzeMenuImage");
    const r = call("optimizeMeal", { restaurantId: SCAN_RESTAURANT_ID, ...overrides });
    const rec = ctx.state.currentRecommendation;
    if (!r.ok || !rec) return { text: "None of the scanned dishes has enough information and a known price to recommend. You could ask the staff for nutrition details.", toolRuns: runs };
    return { text: recText(rec, "From the scanned menu, lower confidence — nothing here is verified:"), toolRuns: runs };
  }

  // 5b. A real (unaffiliated) restaurant: no menu data — offer the scan path, never invent a menu.
  const realR = i.restaurantId ? getRestaurant(i.restaurantId) : undefined;
  if (realR?.identity === "real") {
    call("getMenu", { restaurantId: realR.id });
    return { text: `${realR.name} is a real restaurant that isn't affiliated with MacroTable, so I have no menu, prices or nutrition for it. Scan its menu and I'll read it and find what fits — with lower confidence.`, toolRuns: runs };
  }

  // 6. Compare stores / find something nearby / specific restaurant.
  if (i.compare || i.recommend || i.restaurantId || i.adjustments.length || Object.keys(said).length) {
    let stores: StoreSummary[] = [];
    let moreReal = 0;
    if (!i.restaurantId) {
      const s = call("listNearbyStores", overrides.maxBudget ? { maxBudget: overrides.maxBudget } : {});
      const res = s.result as { stores: StoreSummary[]; otherRealRestaurantsNearby?: number };
      stores = res.stores;
      moreReal = res.otherRealRestaurantsNearby ?? 0;
    }
    // Stay at a restaurant only if the user named it now or deliberately anchored to it earlier —
    // never merely because the previous cross-store recommendation happened to come from there.
    const scope = i.restaurantId ?? (i.compare ? undefined : (ctx.state.anchorRestaurantId ?? undefined));
    const r = call("optimizeMeal", { restaurantId: scope, adjustments: withAvoid(i.adjustments), ...overrides });
    const rec = ctx.state.currentRecommendation;
    if (!r.ok || !rec) {
      const why = ((r.result as { notPossible?: string[] }).notPossible ?? [])[0];
      return { text: why ?? "Nothing nearby fits those constraints. Try a higher budget or fewer restrictions.", toolRuns: runs };
    }
    const demo = stores.filter((s) => s.identity === "demo").length;
    const real = stores.length - demo + moreReal;
    const lead = stores.length
      ? `I compared ${demo} nearby restaurants with MacroTable demo menus${real ? ` (${real} real restaurants nearby aren't affiliated, so I'd need a menu scan there)` : ""}. ${rec.restaurantName} has the strongest ${provWord(rec.provenance)} match:`
      : `At ${rec.restaurantName}, the best fit is:`;
    return { text: recText(rec, lead), toolRuns: runs };
  }

  call("getUserContext");
  return {
    text: `I can find a meal that fits your remaining ${ctx.target.calories} kcal and ≥${ctx.target.protein} g protein, compare nearby stores, adjust a dish (e.g. "less rice"), explain how reliable the nutrition data is, or prepare a pickup or in-store order. What would you like?`,
    toolRuns: runs,
  };
}
