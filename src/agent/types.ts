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
  distanceKm: number;
  integrationLevel: IntegrationLevel;
  levelLabel: string;
  serviceModes: ServiceMode[];
  pickupMinutes: number;
  priceRange: string;
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
  | { kind: "stores"; stores: StoreSummary[] }
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
  provider?: AgentProviderId;
  model?: string;
  /** Set when the live model failed and the offline agent answered instead. */
  fallbackReason?: string;
}

export interface AgentSessionState {
  messages: AgentMessage[];
  currentRestaurantId: string | null;
  scannedMenu: ScannedMenu | null;
  currentRecommendation: RecommendationCardData | null;
  orderDrafts: OrderDraft[];
  /** Raw Gemini `contents` for multi-turn context (text + function parts only; never images). */
  providerHistory: unknown[][];
}
