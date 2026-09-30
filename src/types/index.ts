/**
 * VERIFIED     MacroTable partner recipe/modifier data
 * OFFICIAL     restaurant-published structured nutrition
 * MENU-READ    nutrition explicitly printed on a scanned menu
 * ESTIMATED    inferred / incomplete (public-menu estimate or AI-inferred from a scan)
 * INSUFFICIENT not enough information — never recommended
 */
export type Provenance = "verified" | "official" | "menu-read" | "estimated" | "insufficient";

export type ServiceMode = "pickup" | "in-store";

export interface GeoPoint {
  lat: number;
  lng: number;
}

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

/** Where a real restaurant's identity/location was verified. Nothing else about it is claimed. */
export interface RealIdentity {
  website: string;
  addressLine: string;
  osm: string;
  verifiedOn: string;
  sources: string[];
}

export interface RestaurantLogo {
  /** Path under public/, e.g. "logos/demo/fitkitchen.svg" (always a local, bundled file). */
  src: string;
  alt: string;
  /**
   * "demo-original": FICTIONAL DEMO BRAND — ORIGINAL PROTOTYPE ASSET.
   * "real-official-site": the real venue's own logo from its official website (src/data/realLogos.ts);
   *  no licence, permission or partnership implied.
   */
  source: "demo-original" | "real-official-site";
  /** Width / height of the artwork (default 1). Wide wordmarks get a wider box instead of being cropped. */
  aspect?: number;
  /** Tile the artwork was designed for (default light). */
  background?: "light" | "dark";
}

export interface Restaurant {
  id: string;
  name: string;
  /**
   * "demo": fictional demo brand whose integration, menu, nutrition, prices and ordering are simulated.
   * "real": a real restaurant — ONLY its name and location are real (see `real`); it is NOT affiliated with
   * MacroTable, has no menu data here (meals: []), and MacroTable can only help via a menu scan.
   */
  identity: "demo" | "real";
  real?: RealIdentity;
  integrationLevel: IntegrationLevel;
  cuisine: string;
  tagline: string;
  /** Fictional demo location (see src/data/geo.ts). */
  location: GeoPoint;
  address: string;
  /** Demo brands only — never claimed for real restaurants. */
  priceRange?: "€" | "€€" | "€€€";
  /** Simulated service modes (demo brands). Empty for real restaurants: MacroTable makes no claim about them. */
  serviceModes: ServiceMode[];
  pickupMinutes?: number;
  /** Original monogram identity for fictional demo brands (never used for real restaurants). Also the logo fallback. */
  brand?: { color: string; mark: string };
  /**
   * PRESENTATION ONLY: never read by menus, optimisation, the agent tools or research logging.
   * Demo brands: an original fictional asset. Real venues: only via src/data/realLogos.ts
   * (official source + recorded permission); otherwise absent and a neutral placeholder is shown.
   */
  logo?: RestaurantLogo;
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
  /** V3: in-store or pickup only (no delivery). "handoff" = user orders at the counter themselves. */
  serviceMode: ServiceMode | "handoff";
  /** Simulated pickup / counter code shown to the user and printed on the ticket. */
  pickupCode: string;
  sessionId?: string;
  meetsTarget: boolean;
  /** Agent recommendation card the order came from, if any (drives that card's "Order completed" state). */
  origin?: string;
}
