import type { IntegrationLevel, Nutrition, Provenance, Selections, ServiceMode } from "../types";

/** Which engine produced an agent message. "tools" = composed directly from tool results, no model. */
export type AgentProviderId = "gemini" | "mock" | "tools";

export interface ToolRun {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** JSON returned to the model. */
  result: unknown;
  /** Optional UI card derived from the same deterministic result. */
  card?: AgentCard;
}

export interface StoreSummary {
  restaurantId: string;
  name: string;
  identity: "demo" | "real";
  distanceKm: number;
  integrationLevel: IntegrationLevel;
  levelLabel: string;
  serviceModes: ServiceMode[];
  pickupMinutes?: number;
  priceRange?: string;
  /** For real restaurants: what MacroTable can (not) do there. */
  note?: string;
  best?: {
    mealId: string;
    mealName: string;
    calories: number;
    protein: number;
    price: number;
    provenance: Provenance;
    meetsTarget: boolean;
    gaps: string[];
  };
}

export interface RecommendationCardData {
  restaurantId: string;
  restaurantName: string;
  mealId: string;
  mealName: string;
  selections: Selections;
  changes: string[];
  nutrition: Nutrition;
  price: number;
  provenance: Provenance;
  integrationLevel: IntegrationLevel;
  meetsTarget: boolean;
  gaps: string[];
  rejectedRequests: string[];
  /** The target the optimizer used for this card (may include overrides the user just stated). */
  targetUsed?: { calories: number; protein: number; carbs: number; fat: number; maxBudget: number };
  /** Up to two "why it fits" lines from the deterministic explanation. */
  reasons?: string[];
}

export interface OrderDraft {
  id: string;
  restaurantId: string;
  restaurantName: string;
  mealId: string;
  mealName: string;
  selections: Selections;
  changes: string[];
  nutrition: Nutrition;
  price: number;
  provenance: Provenance;
  /** "handoff" = restaurant not integrated / scanned menu: the user orders at the counter. */
  mode: ServiceMode | "handoff";
  readyInMinutes?: number;
  status: "awaiting-approval" | "approved" | "cancelled";
  /** When the draft was prepared (an identical order placed after this makes it "completed"). */
  createdAt?: number;
  orderNumber?: string;
  pickupCode?: string;
}

export interface ScannedItem {
  id: string;
  name: string;
  description?: string;
  price: number | null;
  nutrition: Nutrition | null;
  provenance: Extract<Provenance, "menu-read" | "estimated" | "insufficient">;
  /** Which nutrition fields were printed on the menu (the rest, if any, are estimates). */
  printedFields: (keyof Nutrition)[];
  markedDietary: string[];
  visibleModifiers: string[];
}

export interface ScannedMenu {
  scanId: string;
  restaurantName: string | null;
  items: ScannedItem[];
  uncertainties: string[];
  /** "gemini" = read by the live vision model; "simulated" = offline sample, NOT read from the photo. */
  source: "gemini" | "simulated";
  createdAt: number;
}

export type AgentCard =
  | { kind: "stores"; stores: StoreSummary[]; otherReal?: number }
  | { kind: "recommendation"; rec: RecommendationCardData }
  | { kind: "order"; draftId: string }
  | { kind: "scan"; scanId: string }
  | { kind: "notice"; tone: "info" | "warn"; text: string };

export type QuickAction =
  | { kind: "send"; label: string; text: string }
  | { kind: "navigate"; label: string; to: string; state?: unknown }
  | { kind: "prepare"; label: string; mode: ServiceMode | "handoff" };

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  createdAt: number;
  cards?: AgentCard[];
  actions?: QuickAction[];
  toolRuns?: { name: string; ok: boolean }[];
  /** Completed product steps (1:1 with tool calls / VERIFY), shown as a checklist. */
  steps?: string[];
  provider?: AgentProviderId;
  model?: string;
  /** Live reply produced by the proxy's secondary (fallback) Gemini model, not the primary. */
  modelFallback?: boolean;
  /** Set when the live model failed and the offline agent answered instead. */
  fallbackReason?: string;
}

export interface AgentSessionState {
  messages: AgentMessage[];
  /**
   * Where the user explicitly IS (restaurant/QR/meal page, "Ask about X", a scanned menu). Shown to the
   * live model as "Currently at". Never set by a recommendation: a cross-store pick is not presence.
   */
  currentRestaurantId: string | null;
  scannedMenu: ScannedMenu | null;
  currentRecommendation: RecommendationCardData | null;
  orderDrafts: OrderDraft[];
  /** Raw Gemini `contents` for multi-turn context (text + function parts only; never images). */
  providerHistory: unknown[][];
  /**
   * Offline agent: the restaurant the user deliberately anchored to (named it, table QR, restaurant or
   * meal page). Follow-ups stay there; otherwise searches cover all nearby stores. Not set by a
   * cross-store recommendation.
   */
  anchorRestaurantId?: string | null;
  /**
   * The restaurant the conversation last referred to: the latest recommendation's, or an explicitly
   * opened one, whichever came last. Only resolves follow-ups that name no restaurant ("show the
   * menu", provenance, quick replies) — never presented as the user's location.
   */
  referenceRestaurantId?: string | null;
  /** Offline agent: constraints the user stated earlier in this session (later statements win). */
  stated?: StatedConstraints;
}

export interface StatedConstraints {
  calories?: number;
  protein?: number;
  maxBudget?: number;
  vegetarian?: boolean;
  lowerFat?: boolean;
  noSpicy?: boolean;
  /** Ingredients the user said they don't want ("no rice", "I don't want rice"). */
  avoid?: string[];
  /**
   * The app's remaining calories/protein when these were stated. If the app's target has changed since
   * (a confirmed meal, a reset or a Preferences edit), the stated calories/protein were for a meal that
   * no longer applies and are dropped; budget, diet flags and avoided ingredients persist.
   */
  basis?: { calories: number; protein: number };
}
