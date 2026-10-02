import { catalog, getRestaurant } from "../data/restaurants";
import { provenanceLabel } from "../lib/provenance";
import { stepsFor, VERIFYING } from "./steps";
import { runGeminiTurn, PROXY_URL } from "./gemini";
import { runMockTurn } from "./mock";
import { executeTool, referencedRestaurantId, SCAN_RESTAURANT_ID, setPresence, type ToolContext } from "./tools";
import type { AgentCard, AgentMessage, AgentProviderId, QuickAction, ToolRun } from "./types";

/*
 * TRIGGER → GATHER CONTEXT → REASON/PLAN → ACT (tools) → VERIFY → HANDOFF (approval).
 * The orchestrator picks the provider, falls back to the offline agent on any
 * live failure (and says so), turns tool results into cards/actions, and
 * verifies that numbers in the model's text were produced by tools.
 */

export type AgentMode = "auto" | "offline";

let seq = 0;
export const msgId = () => `m-${Date.now().toString(36)}-${++seq}`;

/** Live Gemini is used only in "auto" mode with a configured proxy. "offline" never reaches the proxy. */
export function liveAvailable(mode: AgentMode): boolean {
  return mode === "auto" && !!PROXY_URL;
}

/** Cards shown under a message — derived from tool results, never from model text. */
export function cardsFrom(runs: ToolRun[]): AgentCard[] {
  const cards: AgentCard[] = [];
  const last = <K extends AgentCard["kind"]>(kind: K) => [...runs].reverse().find((r) => r.card?.kind === kind)?.card;
  for (const kind of ["scan", "stores", "recommendation", "notice", "order"] as const) {
    const c = last(kind);
    if (c && !(kind === "notice" && last("recommendation"))) cards.push(c);
  }
  return cards;
}

export const scanAction = (restaurantId?: string): QuickAction => ({
  kind: "navigate",
  label: "Scan the menu here",
  to: `/macrotable/scan?type=menu${restaurantId ? `&restaurant=${restaurantId}` : ""}`,
  state: { userTap: true },
});

/** Quick replies derived from state after the turn (identical for live and offline agents). */
export function actionsFor(ctx: ToolContext, runs: ToolRun[]): QuickAction[] {
  const rec = ctx.state.currentRecommendation;
  const here = getRestaurant(referencedRestaurantId(ctx.state) ?? undefined);
  if (here?.identity === "real" && (!rec || rec.restaurantId !== here.id)) return [scanAction(here.id)];
  const hasOrderCard = runs.some((r) => r.card?.kind === "order");
  if (hasOrderCard || !rec) return rec ? [] : [{ kind: "send", label: "What should I eat near me?", text: "What should I eat near me?" }];
  const integrated = rec.integrationLevel >= 2 && rec.restaurantId !== SCAN_RESTAURANT_ID;
  const r = getRestaurant(rec.restaurantId);
  const out: QuickAction[] = [{ kind: "send", label: "Why this?", text: "Why this?" }, { kind: "send", label: "Compare stores", text: "Compare stores" }];
  // Never offer to order something over the budget that applies now: this turn's search, else the budget
  // the user stated earlier (offline agent), else the app's. A failed search leaves the old pick in place.
  const lastSearch = [...runs].reverse().find((x) => x.name === "optimizeMeal");
  const budget = [lastSearch?.args?.maxBudget, ctx.state.stated?.maxBudget, ctx.target.maxBudget].find((b): b is number => typeof b === "number");
  if (budget !== undefined && rec.price > budget) return out;
  if (integrated) {
    if (r?.serviceModes.includes("pickup")) out.push({ kind: "prepare", label: "Prepare pickup", mode: "pickup" });
    if (r?.serviceModes.includes("in-store")) out.push({ kind: "prepare", label: "Order in-store", mode: "in-store" });
  } else {
    out.push({ kind: "prepare", label: "Order at counter", mode: "handoff" });
  }
  return out;
}

/** Earlier turns, as Gemini contents: tool outputs (functionResponse) and the user's own words. */
function fromHistory(history: unknown[][]) {
  const toolResults: unknown[] = [];
  const userTexts: string[] = [];
  for (const c of history.flat() as { role?: string; parts?: { text?: unknown; functionResponse?: { response?: unknown } }[] }[]) {
    for (const p of c?.parts ?? []) {
      if (p.functionResponse) toolResults.push(p.functionResponse.response);
      // Only the USER's text — never the model's own earlier wording, which could repeat a made-up number.
      else if (c.role === "user" && typeof p.text === "string") userTexts.push(p.text);
    }
  }
  return { toolResults, userTexts };
}

type Quantity = "calories" | "protein" | "carbs" | "fat" | "price";
const VALUE_KEYS: Record<string, Quantity> = { calories: "calories", protein: "protein", protein_g: "protein", carbs: "carbs", carbs_g: "carbs", fat: "fat", fat_g: "fat", price: "price", price_eur: "price" };
const TARGET_KEYS: Record<string, Quantity> = { protein_min_g: "protein", maxBudget: "price", budget_max_eur: "price" };

/** Targets and values per quantity in tool data (targets: `targetUsed`, `remaining`, budget/minimum keys). */
function quantities(data: unknown[], target: ToolContext["target"]) {
  const targets = new Map<Quantity, Set<number>>();
  const values = new Map<Quantity, Set<number>>();
  const add = (m: typeof targets, q: Quantity, n: number) => (m.get(q) ?? m.set(q, new Set()).get(q)!).add(n);
  const walk = (x: unknown, isTarget: boolean) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, isTarget));
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === "number") {
        if (TARGET_KEYS[k]) add(targets, TARGET_KEYS[k], v);
        else if (VALUE_KEYS[k]) add(isTarget ? targets : values, VALUE_KEYS[k], v);
      } else walk(v, isTarget || k === "targetUsed" || k === "remaining");
    }
  };
  walk(data, false);
  walk({ remaining: { calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat, price: target.maxBudget } }, false);
  return { targets, values };
}

/**
 * The narrow derived-number rule: N is grounded if it is exactly |target − value| for the SAME
 * quantity, both from tool data (e.g. "1 g short" of a 45 g minimum with 44 g). No other arithmetic.
 */
function isTargetGap(n: number, qs: Quantity[], q: ReturnType<typeof quantities>) {
  const r = (x: number) => Math.round(x * 100) / 100;
  return qs.some((k) => [...(q.targets.get(k) ?? [])].some((t) => [...(q.values.get(k) ?? [])].some((v) => r(Math.abs(t - v)) === r(n))));
}

/**
 * VERIFY: every "<number> kcal", "<number> g" and "€<number>" in the model's text must come from
 * MacroTable's tools (this turn or earlier turns), the current recommendation, the target, or the
 * user's own messages — or be the exact gap between a target and a value for the same quantity.
 */
export function unverifiedNumbers(text: string, runs: ToolRun[], ctx: ToolContext, extra: { userTexts?: string[]; history?: unknown[][] } = {}): string[] {
  const past = fromHistory(extra.history ?? []);
  const tools = [...runs.map((r) => r.result), ...past.toolResults, ctx.state.currentRecommendation ?? {}];
  const haystack = JSON.stringify(tools) + JSON.stringify({ t: ctx.target });
  const said = [...(extra.userTexts ?? []), ...past.userTexts].join(" ");
  const found = new Set<string>();
  const nums = new Set([...(haystack.match(/-?\d+(\.\d+)?/g) ?? []), ...(said.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."))].map((n) => String(Number(n))));
  let q: ReturnType<typeof quantities> | undefined;
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(kcal|calories|g\b|grams)|€\s?(\d+(?:[.,]\d+)?)/gi)) {
    const raw = (m[1] ?? m[3]).replace(",", ".");
    if (nums.has(String(Number(raw)))) continue;
    // Which quantity the number is: kcal → calories, € → price, g → the nutrient named next (else any).
    const named = /^\s*(?:of\s+)?(protein|carb|fat)/i.exec(text.slice((m.index ?? 0) + m[0].length))?.[1].toLowerCase();
    const qs: Quantity[] = m[3] ? ["price"] : /kcal|calories/i.test(m[2]) ? ["calories"] : named ? [named === "carb" ? "carbs" : (named as Quantity)] : ["protein", "carbs", "fat"];
    if (isTargetGap(Number(raw), qs, (q ??= quantities(tools, ctx.target)))) continue;
    found.add(m[0].trim());
  }
  return [...found];
}

// ─── VERIFY: provenance language ──────────────────────────────────────────

const LEVEL: Record<string, number> = { insufficient: 0, estimated: 1, "menu-read": 2, official: 3, verified: 4 };
const LABEL_TO_KEY: Record<string, string> = { "DEMO VERIFIED": "verified", VERIFIED: "verified", "DEMO OFFICIAL": "official", OFFICIAL: "official", "MENU-READ": "menu-read", ESTIMATED: "estimated", INSUFFICIENT: "insufficient" };
const toKey = (p: unknown) => (typeof p === "string" ? (LABEL_TO_KEY[p.toUpperCase()] ?? (p in LEVEL ? p : undefined)) : undefined);
const CLAIMS: { level: number; re: RegExp }[] = [
  { level: 4, re: /\b(verified|chef-approved|recipe-level)\b/gi },
  { level: 3, re: /\b(official(?:ly)?|published)\b/gi },
  { level: 2, re: /\b(menu-read|printed on the menu)\b/gi },
];
const ABSOLUTE = /\b(exact(?:ly)?|guaranteed?|precise(?:ly)?)\b/gi;
/**
 * A negator up to three words before the claim: "not", "never", "no", "cannot", "without", any "…n't"
 * (haven't, isn’t), or a contrast that sets the claim aside ("rather than verified", "instead of exact").
 */
const NEGATED = /(?:\b(?:not|never|no|cannot|without|rather\s+than|instead\s+of)|n['’]t)\s+(?:[\w'’-]+\s+){0,3}$|\bun-$/i;
/**
 * A negation that carries over a coordination to the claim in the same clause: "cannot verify their data
 * or guarantee exact values", "isn't measured nor verified". A contrast word ends the negation's scope
 * ("not cheap, but verified" is still a claim).
 */
const NEGATED_COORD = /(?:\b(?:not|never|no|cannot|without)|n['’]t)\s(?:(?!\b(?:but|however|although|though|yet|while|whereas)\b)[^.;!?\n])*?\b(?:or|nor)\s+(?:[\w'’-]+\s+){0,2}$/i;
/** A clause that refers back to something named earlier ("It's verified", "These values are official"). */
const REFERS_BACK = /\b(?:it|its|it['’]s|this|these|those|they|they['’]re|their|that['’]s|that is|the (?:dish|meal|data|nutrition|values|numbers|figures|label))\b/i;
const NUTRITION_QTY = String.raw`\d+(?:[.,]\d+)?\s*(?:kcal|calories|g|grams)\b`;
const NUTRIENT_NOUN = String.raw`(?:calories|calorie|kcal|nutrition|nutritional|macros?|protein|carbs?|fat|values|numbers|counts?|figures)`;
/** "exact(ly)/precise(ly)" asserting an exact nutrition QUANTITY — not "hits your minimum exactly". */
function assertsExactNutrition(text: string, at: number, word: string) {
  const before = text.slice(Math.max(0, at - 40), at);
  const after = text.slice(at + word.length, at + word.length + 40);
  if (new RegExp(String.raw`^\s+(?:about\s+)?${NUTRITION_QTY}`, "i").test(after)) return true; // exactly 640 kcal
  if (new RegExp(String.raw`${NUTRITION_QTY}(?:\s+(?:of\s+)?(?:protein|carbs?|fat))?\s*,?\s*$`, "i").test(before)) return true; // 640 kcal exactly
  if (/^(exact|precise)$/i.test(word) && new RegExp(String.raw`^\s+(?:[\w-]+\s+)?${NUTRIENT_NOUN}\b`, "i").test(after)) return true; // exact calories
  return new RegExp(String.raw`\b${NUTRIENT_NOUN}\s+(?:is|are|will be)\s+$`, "i").test(before); // the calories are exact
}

/** Dish / restaurant names → the data provenance the TOOLS reported for them this turn. */
function provenanceIndex(runs: ToolRun[], ctx: ToolContext): Map<string, string> {
  const idx = new Map<string, string>();
  const put = (name: unknown, prov: unknown) => {
    const k = toKey(prov);
    if (typeof name !== "string" || !name || !k) return;
    const key = name.toLowerCase();
    const prev = idx.get(key);
    if (!prev || LEVEL[k] > LEVEL[prev]) idx.set(key, k); // a restaurant takes its best-labelled dish
  };
  const addRec = (r: { restaurant?: unknown; meal?: unknown; provenance?: unknown } | undefined) => {
    if (!r) return;
    put(r.meal, r.provenance);
    put(r.restaurant, r.provenance);
  };
  for (const run of runs) {
    const res = run.result as Record<string, any> | undefined;
    if (!res) continue;
    addRec(res.recommendation);
    for (const a of res.alternatives ?? []) addRec(a);
    for (const d of res.dishes ?? []) (put(d.name, d.provenance), put(res.restaurant, d.provenance));
    for (const st of res.stores ?? []) if (st.best) (put(st.best.mealName, st.best.provenance), put(st.name, st.best.provenance));
    for (const it of res.items ?? []) put(it.name, it.provenance);
    if (res.dish) put(res.dish, res.provenance);
  }
  const cur = ctx.state.currentRecommendation;
  if (cur) (put(cur.mealName, cur.provenance), put(cur.restaurantName, cur.provenance));
  return idx;
}

/**
 * VERIFY (language): a confidence word in the model's text ("verified", "official", "printed on
 * the menu") must not exceed the provenance the tools reported for the nearest dish/restaurant it
 * refers to, and nutrition is never "exact"/"guaranteed". Returns human-readable problems.
 */
export function overstatedConfidence(text: string, runs: ToolRun[], ctx: ToolContext): string[] {
  const idx = provenanceIndex(runs, ctx);
  const names = [...idx.keys()].sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const mentions: { at: number; name: string }[] = [];
  for (const n of names) for (let i = lower.indexOf(n); i >= 0; i = lower.indexOf(n, i + 1)) if (!mentions.some((m) => i >= m.at && i < m.at + m.name.length)) mentions.push({ at: i, name: n });
  const problems: string[] = [];
  /**
   * What a claim word refers to: the nearest dish/restaurant mentioned BEFORE it in the same clause
   * ("X is verified"), else the nearest after it in that clause ("verified data for X"), else — only
   * if the clause refers back ("It's verified") — the nearest earlier mention in the text. A clause
   * that names nothing and refers to nothing ("verified options from partner restaurants") isn't
   * about an earlier dish. Clauses end at . ; ! ? or a line break.
   */
  const nearest = (pos: number) => {
    const start = Math.max(...[".", ";", "!", "?", "\n"].map((d) => text.lastIndexOf(d, pos - 1))) + 1;
    const ends = [".", ";", "!", "?", "\n"].map((d) => text.indexOf(d, pos)).filter((i) => i >= 0);
    const end = ends.length ? Math.min(...ends) : text.length;
    const before = mentions.filter((m) => m.at >= start && m.at < pos).sort((x, y) => y.at - x.at)[0];
    const after = mentions.filter((m) => m.at > pos && m.at < end).sort((x, y) => x.at - y.at)[0];
    const earlier = REFERS_BACK.test(text.slice(start, end)) ? mentions.filter((m) => m.at < pos).sort((x, y) => y.at - x.at)[0] : undefined;
    return before ?? after ?? earlier;
  };
  const negated = (at: number) => {
    if (NEGATED.test(text.slice(Math.max(0, at - 40), at))) return true;
    const before = text.slice(Math.max(0, at - 120), at);
    return NEGATED_COORD.test(before.slice(Math.max(...[".", ";", "!", "?", "\n"].map((d) => before.lastIndexOf(d))) + 1));
  };
  for (const { level, re } of CLAIMS) {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      if (negated(at)) continue;
      const ref = nearest(at);
      if (!ref) continue;
      const actual = idx.get(ref.name)!;
      if (level > LEVEL[actual]) problems.push(`"${m[0]}" overstates the data for ${ref.name.replace(/\b\w/g, (c) => c.toUpperCase())}: its label is ${provenanceLabel(actual as never)}`);
    }
  }
  for (const m of text.matchAll(ABSOLUTE)) {
    const at = m.index ?? 0;
    if (negated(at)) continue;
    const sentence = text.slice(Math.max(0, text.lastIndexOf(".", at) + 1), text.indexOf(".", at) < 0 ? text.length : text.indexOf(".", at));
    const flagged = /^guarantee/i.test(m[0]) ? /kcal|calorie|protein|carb|fat|macro|nutrition/i.test(sentence) : assertsExactNutrition(text, at, m[0]);
    if (flagged) problems.push(`"${m[0]}": nutrition is calculated or estimated, never exact`);
  }
  return [...new Set(problems)];
}

export interface TurnOutcome {
  message: AgentMessage;
  historyAppend?: unknown[];
  toolRuns: ToolRun[];
  latencyMs: number;
}

export async function runAgentTurn(
  userText: string,
  ctx: ToolContext,
  history: unknown[][],
  mode: AgentMode,
  deps: { gemini?: typeof runGeminiTurn; onProgress?: (label: string) => void } = {},
): Promise<TurnOutcome> {
  const t0 = Date.now();
  let provider: AgentProviderId = "mock";
  let fallbackReason: string | undefined;
  let text: string;
  let runs: ToolRun[];
  let model: string | undefined;
  let modelFallback = false;
  let historyAppend: unknown[] | undefined;
  const snapshot = structuredClone(ctx.state);

  // Cost control: "offline" (Live AI OFF, or an offline trial) never calls a live provider, even an
  // injected one. Only "auto" may, and then only with a proxy (or a provider injected by tests).
  if (mode === "auto" && (!!PROXY_URL || !!deps.gemini)) {
    try {
      const g = await (deps.gemini ?? runGeminiTurn)(userText, ctx, history, { onProgress: deps.onProgress });
      provider = "gemini";
      text = g.text;
      runs = g.toolRuns;
      model = g.model;
      modelFallback = !!g.modelFallback;
      historyAppend = g.contents;
    } catch (e) {
      fallbackReason = (e as Error).message || "Live model unavailable";
      // Undo partial tool effects, including optional keys the snapshot didn't have.
      for (const k of Object.keys(ctx.state)) if (!(k in snapshot)) delete (ctx.state as unknown as Record<string, unknown>)[k];
      Object.assign(ctx.state, structuredClone(snapshot));
      const m = runMockTurn(userText, ctx);
      text = m.text;
      runs = m.toolRuns;
    }
  } else {
    const m = runMockTurn(userText, ctx);
    text = m.text;
    runs = m.toolRuns;
  }

  const cards = cardsFrom(runs);
  deps.onProgress?.(VERIFYING);
  if (provider === "gemini") {
    const bad = unverifiedNumbers(text, runs, ctx, { userTexts: [userText], history });
    if (bad.length)
      cards.unshift({ kind: "notice", tone: "warn", text: `Check: ${bad.join(", ")} in this reply wasn't produced by MacroTable's tools. The card values are authoritative.` });
    const over = overstatedConfidence(text, runs, ctx);
    if (over.length) cards.unshift({ kind: "notice", tone: "warn", text: `Check: ${over.join("; ")}. The labels on the cards are authoritative.` });
  }
  return {
    message: {
      id: msgId(),
      role: "agent",
      text,
      createdAt: Date.now(),
      cards,
      actions: actionsFor(ctx, runs),
      toolRuns: runs.map((r) => ({ name: r.name, ok: r.ok })),
      steps: stepsFor(runs.map((r) => r.name), cards.some((c) => c.kind === "recommendation" || c.kind === "order")),
      provider,
      model,
      ...(modelFallback ? { modelFallback } : {}),
      fallbackReason,
    },
    historyAppend,
    toolRuns: runs,
    latencyMs: Date.now() - t0,
  };
}

/** Deterministic context turn when the agent opens with restaurant / meal / scan context (no model call). */
export function runContextTurn(kind: "restaurant" | "meal" | "scan" | "prepare", ctx: ToolContext, arg?: string): TurnOutcome {
  const t0 = Date.now();
  const runs: ToolRun[] = [];
  const call = (name: string, args: Record<string, unknown> = {}) => {
    const r = executeTool(name, args, ctx);
    runs.push(r);
    return r;
  };
  let text = "";
  const t = ctx.target;
  if (kind === "prepare") {
    call("prepareOrder", { mode: arg === "in-store" ? "in-store" : "pickup" });
    const d = ctx.state.orderDrafts.at(-1);
    text = d?.mode === "handoff" ? `Here's a summary to show at the counter — ${d.restaurantName} isn't connected, so nothing is sent.` : d ? `Order prepared for ${d.mode}. Review it and tap Approve to send it — nothing is ordered until you do.` : "There's no recommendation to order yet.";
  } else if (kind === "scan") {
    setPresence(ctx.state, SCAN_RESTAURANT_ID);
    call("analyzeMenuImage");
    const r = call("optimizeMeal", { restaurantId: SCAN_RESTAURANT_ID });
    const rec = ctx.state.currentRecommendation;
    const src = ctx.state.scannedMenu?.source === "simulated" ? " (offline demo: a sample extraction, not read from your photo)" : "";
    text = r.ok && rec
      ? `I read ${ctx.state.scannedMenu?.items.length ?? 0} dishes from the menu${src}. Best fit for ${t.calories} kcal / ≥${t.protein} g protein: ${rec.mealName} — ${rec.nutrition.calories} kcal · ${rec.nutrition.protein} g protein (${provenanceLabel(rec.provenance)}). This isn't verified by the restaurant, so treat it as lower confidence.`
      : `I read the menu${src}, but no dish has enough information and a known price to recommend. You could ask staff for nutrition details.`;
  } else if (kind === "restaurant" && getRestaurant(arg)?.identity === "real") {
    const r = getRestaurant(arg)!;
    setPresence(ctx.state, r.id);
    ctx.state.anchorRestaurantId = r.id;
    call("getMenu", { restaurantId: r.id });
    text = `You're at ${r.name}, a real restaurant that isn't affiliated with MacroTable. I have no menu, prices or nutrition for it, and I won't guess. Scan the menu and I'll read it and find what fits your ${t.calories} kcal / ≥${t.protein} g protein, with lower confidence.`;
    return {
      message: {
        id: msgId(),
        role: "agent",
        text,
        createdAt: Date.now(),
        cards: [],
        actions: [scanAction(r.id), { kind: "navigate", label: "Nearby demo restaurants", to: "/macrotable/explore" }],
        toolRuns: runs.map((x) => ({ name: x.name, ok: x.ok })),
        provider: "tools",
      },
      toolRuns: runs,
      latencyMs: Date.now() - t0,
    };
  } else {
    const args = kind === "meal" ? { mealId: arg } : { restaurantId: arg };
    const r = call("optimizeMeal", args);
    const rec = ctx.state.currentRecommendation;
    // The user opened the agent FROM this restaurant (QR, restaurant or meal page): they are there,
    // and follow-ups stay there. (The recommendation itself never sets presence.)
    const opened = kind === "restaurant" ? (arg ?? null) : (rec?.restaurantId ?? null);
    ctx.state.anchorRestaurantId = opened;
    if (opened && catalog().some((x) => x.id === opened)) setPresence(ctx.state, opened);
    const name = kind === "restaurant" ? getRestaurant(arg)?.name : rec?.restaurantName;
    if (!r.ok || !rec) {
      text = `You're at ${name ?? "this restaurant"}. Nothing here fits ${t.calories} kcal / ≥${t.protein} g protein within €${t.maxBudget} using supported options. Want me to compare other stores?`;
    } else {
      const n = rec.nutrition;
      text = [
        kind === "restaurant" ? `You're at ${rec.restaurantName}. You have ${t.calories} kcal and need ≥${t.protein} g protein.` : `Looking at ${rec.mealName} for your ${t.calories} kcal / ≥${t.protein} g protein.`,
        `Best ${provenanceLabel(rec.provenance)} fit: ${rec.mealName}${rec.changes.length ? ` with ${rec.changes.join(", ").toLowerCase()}` : ""} — ${n.calories} kcal · ${n.protein} g protein · €${rec.price.toFixed(2)}.`,
        rec.gaps.length ? `Heads-up: ${rec.gaps.join("; ").toLowerCase()}.` : "It fits your calorie range and protein minimum.",
      ].join("\n");
    }
  }
  return {
    message: {
      id: msgId(),
      role: "agent",
      text,
      createdAt: Date.now(),
      cards: cardsFrom(runs),
      actions: actionsFor(ctx, runs),
      toolRuns: runs.map((r) => ({ name: r.name, ok: r.ok })),
      steps: stepsFor(runs.map((r) => r.name), cardsFrom(runs).some((c) => c.kind === "recommendation" || c.kind === "order")),
      provider: "tools",
    },
    toolRuns: runs,
    latencyMs: Date.now() - t0,
  };
}
