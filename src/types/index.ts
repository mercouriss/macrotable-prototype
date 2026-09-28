export type Provenance = "verified" | "official" | "estimated";

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ModifierOption {
  id: string;
  label: string;
  /** Short wording printed on the kitchen ticket, e.g. "EXTRA CHICKEN (+50g)". */
  ticketLabel?: string;
  priceDelta: number;
  nutritionDelta: Nutrition;
  /** false = the restaurant lists this option but does NOT allow it. MacroTable may never select it. */
  supported: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** The option the dish comes with as listed on the menu. */
  defaultOptionId: string;
  options: ModifierOption[];
}

export interface Meal {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  /** null = the restaurant publishes no usable nutrition for this item. */
  nutrition: Nutrition | null;
  provenance: Provenance;
  modifierGroups: ModifierGroup[];
  available: boolean;
  unavailableReason?: string;
  dietaryTags: string[];
  /** Colours for the illustrated plate (no photos needed offline). */
  palette: string[];
}

export type IntegrationLevel = 1 | 2 | 3;

export interface Restaurant {
  id: string;
  name: string;
  integrationLevel: IntegrationLevel;
  cuisine: string;
  tagline: string;
  estimatedDeliveryMinutes?: number;
  meals: Meal[];
}

export type Priority = "macros" | "price" | "distance";
export type Diet = "none" | "vegetarian" | "vegan";

export interface UserTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  maxBudget: number;
  dietaryRestrictions: string[];
  priority: Priority;
}

export interface Preferences {
  diet: Diet;
  highProtein: boolean;
  lowerFat: boolean;
  noSpicy: boolean;
}

export type ScenarioId = "A" | "B" | "C" | "D";

export interface Scenario {
  id: ScenarioId;
  label: string;
  summary: string;
  target: UserTarget;
  preferences: Preferences;
  /** Scenario D is a deliberately impossible target used to demo the failure case. */
  demoOnly?: boolean;
}

/** Selected option id per modifier group id. */
export type Selections = Record<string, string>;

export interface Configuration {
  meal: Meal;
  restaurant: Restaurant;
  selections: Selections;
  nutrition: Nutrition;
  price: number;
}

export type Mode = "baseline" | "macrotable";

export interface ExperimentEvent {
  timestamp: number;
  mode: Mode;
  scenario: string;
  event: string;
  sessionId: string;
  mealId?: string;
  configurationId?: string;
  detail?: Record<string, unknown>;
}

export interface PlacedOrder {
  orderNumber: string;
  placedAt: number;
  mode: Mode;
  scenario: ScenarioId;
  restaurantId: string;
  mealId: string;
  selections: Selections;
  configurationId: string;
  nutrition: Nutrition;
  price: number;
  /** Level-1 restaurants can't receive orders; MacroTable only prepares a handoff. */
  handoff: boolean;
  sessionId?: string;
  meetsTarget: boolean;
}
