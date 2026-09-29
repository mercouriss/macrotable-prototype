# Data model

All types live in `src/types/index.ts` and `src/lib/research.ts`. All restaurant data is **fictional**.

## Restaurants and integration levels

```ts
interface Restaurant {
  id: string; name: string; cuisine: string; tagline: string;
  integrationLevel: 1 | 2 | 3;
  estimatedDeliveryMinutes?: number;   // stands in for "closest"; no geolocation
  meals: Meal[];
}
```

| Level | Restaurant | Data | MacroTable can |
|---|---|---|---|
| 3 · Verified partner | FitKitchen | verified recipes, ingredient quantities, chef-approved modifiers | optimise, configure, kitchen ticket |
| 2 · Structured integration | Urban Bowl | structured menu, official nutrition, supported modifiers | filter, optimise, configure, create order |
| 1 · Unaffiliated | Local Grill | public menu only | recommend, estimate, hand off (no modifications, no order) |

Integration level affects confidence and executability. **It never affects ranking** (tested).

## Meals, nutrition, modifiers

```ts
interface Nutrition { calories: number; protein: number; carbs: number; fat: number }

interface Meal {
  id: string; restaurantId: string; name: string; description: string;
  price: number;                       // euros; summed in integer cents
  nutrition: Nutrition | null;         // null = no usable data → excluded
  provenance: "verified" | "official" | "estimated";
  modifierGroups: ModifierGroup[];
  available: boolean; unavailableReason?: string;
  dietaryTags: string[];               // "vegetarian", "vegan", "spicy", …
  palette: string[];                   // illustrated plate colours (no photos)
}

interface ModifierGroup { id: string; name: string; defaultOptionId: string; options: ModifierOption[] }

interface ModifierOption {
  id: string; label: string; ticketLabel?: string;
  priceDelta: number; nutritionDelta: Nutrition;   // relative to the dish as listed
  supported: boolean;                              // false = restaurant explicitly disallows it
}
```

- The default option of every group has zero deltas and is supported (tested).
- Configuration nutrition = base + Σ deltas, and price = base + Σ price deltas, in cents (tested for every configuration).
- `supported: false` options are shown locked in the UI and never enumerated. Examples: *half rice* and *extra salmon* at Urban Bowl, *sauce on the side* at FitKitchen.

11 meals: 4 at FitKitchen (one sold out), 3 at Urban Bowl (one spicy), 4 at Local Grill (one with no nutrition data).

**Canonical arithmetic (Scenario A):**

```
Chicken Power Bowl   890 kcal  39 P  105 C  31 F   €14.50
+50 g chicken        +70       +12     0    +2     +€1.50
Half rice           −160        −3   −35     0
Light sauce         −148        −1    −3   −13
Double vegetables    +30        +2    +5     0     +€0.50
= MacroTable version 682 kcal  49 P   72 C  20 F   €16.50
```

## Provenance (V3: five levels)

| Label | Meaning |
|---|---|
| VERIFIED | MacroTable partner recipe and modifier data |
| OFFICIAL | Restaurant-published structured nutrition |
| MENU-READ | All four values printed on a scanned menu (read by the vision model; not verified) |
| ESTIMATED | Public-menu estimate, or AI-inferred from a scanned description (≈ shown on numbers) |
| INSUFFICIENT | Not enough information; never recommended |

## Provenance (V2 detail)

| Label | Meaning | UI |
|---|---|---|
| VERIFIED | Recipe-level data provided by the restaurant; nutrition calculated from configured ingredients | ✓ icon + "VERIFIED · Recipe-level data" |
| OFFICIAL | Values published by the merchant | building icon + "OFFICIAL · Restaurant nutrition" |
| ESTIMATED | Inferred from a public menu; not verified | ⚠ icon + "ESTIMATED · Menu-based estimate"; numbers prefixed "≈" |

Provenance is always shown as icon and text, never colour alone. Each badge opens an explanation sheet. VERIFIED describes the data source, not guaranteed real-world accuracy.

## Scenarios

```ts
interface Scenario { id: "A"|"B"|"C"|"D"; label; summary; target: UserTarget; preferences: Preferences; demoOnly? }
interface UserTarget { calories; protein; carbs; fat; maxBudget; dietaryRestrictions: string[]; priority: "macros"|"price"|"distance" }
interface Preferences { diet: "none"|"vegetarian"|"vegan"; highProtein; lowerFat; noSpicy }
```

See [EXPERIMENT.md](EXPERIMENT.md#scenarios) for the values.

## Participant sessions and events

```ts
interface ParticipantSession {
  participantId: string;            // anonymous, e.g. "P001"
  sessionId: string;
  condition: "baseline" | "macrotable";
  scenarioId: "A" | "B" | "C" | "D";
  target: UserTarget;               // snapshot of the assigned scenario
  startedAt: number; completedAt?: number; abortedAt?: number;
  selectedMealId?; selectedRestaurantId?; selectedModifiers?: Record<string,string>; modifierLabels?: string[];
  finalNutrition?: Nutrition; finalPrice?: number;
  provenance?; integrationLevel?; handoff?; orderNumber?;
  completionTimeMs?: number;
  outcome?: { calorieDeviation; caloriesWithinRange; proteinMet; withinBudget; dietOk; feasibleOrder; targetRange };
  events: ExperimentEvent[];
}

interface ExperimentEvent {
  timestamp: number; mode: "baseline" | "macrotable"; scenario: string; sessionId: string;
  event: string; mealId?: string; configurationId?: string; detail?: Record<string, unknown>;
}
```

Storage: localStorage key `macrotable.sessions.v2`, with an in-memory fallback. Other keys: `macrotable.state.v2` (UI state and lock), `macrotable.settings.v1` (onboarding, baseline-nutrition toggle), `macrotable.orders.v1` (simulated orders for tickets).

### CSV columns

`participant_id, session_id, condition, scenario, status, started_at, completed_at, completion_time_s, meal_id, meal_name, restaurant, integration_level, provenance, handoff, modifiers, kcal, protein_g, carbs_g, fat_g, price_eur, target_kcal, target_protein_g, target_budget_eur, calorie_deviation_kcal, calories_within_10pct, protein_met, within_budget, diet_ok, feasible_order, target_range, meals_viewed, modifier_changes, provenance_views, event_count`

Booleans are exported as `1`/`0`, timestamps as ISO 8601 UTC. No images, names or device identifiers are exported.

## V3 additions

```ts
interface Restaurant { …; location: {lat,lng}; address: string; priceRange: "€"|"€€"|"€€€";
                       serviceModes: ("pickup"|"in-store")[]; pickupMinutes: number }   // fictional locations: src/data/geo.ts
interface PlacedOrder { …; serviceMode: "pickup"|"in-store"|"handoff"; pickupCode: string }  // e.g. MT1042 → K42

interface ScannedMenu { scanId; restaurantName: string|null; source: "gemini"|"simulated"; createdAt;
                        items: ScannedItem[]; uncertainties: string[] }
interface ScannedItem { id; name; description?; price: number|null; nutrition: Nutrition|null;
                        provenance: "menu-read"|"estimated"|"insufficient"; printedFields: (keyof Nutrition)[];
                        markedDietary: string[]; visibleModifiers: string[] }       // unknown price never passes the budget

interface ScanRecord { scanSessionId; restaurantId?; imageBlob: Blob; createdAt; expiresAt /* +30 min */;
                       status: "captured"|"analyzing"|"extracted"|"failed" }       // IndexedDB "macrotable-scans"

interface AgentSessionState { messages; currentRestaurantId; scannedMenu; currentRecommendation;
                              orderDrafts: OrderDraft[]; providerHistory }          // sessionStorage "macrotable.agent.v1"
interface OrderDraft { …; mode: "pickup"|"in-store"|"handoff"; status: "awaiting-approval"|"approved"|"cancelled" }
```

New research events: `agent_opened`, `agent_message_sent` (`chars` and `source` only, **never text**), `agent_tool_called`, `agent_reply` (provider, model, `modelFallback` = answered by the proxy's secondary model, fallback = live attempt failed → offline, latency, tool names), `agent_fallback`, `order_prepared`, `order_approved_in_agent`, `scan_menu_opened`, `scan_qr_opened`, `menu_photo_taken`, `scan_image_sent_to_model`, `scan_extraction_failed`, `scan_deleted`.

New CSV columns: `agent_messages`, `agent_tool_calls`, `agent_provider` (gemini / mock / mixed / blank), `agent_fallbacks`. Added in `fdd863f`, at the end: `agent_engine` (`primary` / `secondary` / `offline`, joined with `+` when a session mixes them; blank if the agent never replied) and `agent_models` (model ids that answered, `;`-separated).

## V3.1: real vs demo restaurants

```ts
interface Restaurant { …; identity: "demo" | "real"; real?: RealIdentity; priceRange?; pickupMinutes? }
interface RealIdentity { website; addressLine; osm /* e.g. node/4140102516 */; verifiedOn: "2026-09-29"; sources: string[] }
```

| Restaurant | Identity | What is real | What is simulated |
|---|---|---|---|
| FitKitchen, Urban Bowl, Local Grill | demo | nothing (fictional brands and locations) | integration level, menu, nutrition (DEMO VERIFIED / DEMO OFFICIAL / ESTIMATED), modifiers, prices, pickup times, orders, tickets |
| Sally's Salads, Mozza, Erasmus Paviljoen | real | name + location (website + OSM, verified 2026-09-29) | nothing is claimed: `meals: []`, no price range, pickup or service modes; MacroTable is not affiliated |

`MENU_RESTAURANTS` (demo brands with menus) feeds the optimizer, the baseline and the experiment. `RESTAURANTS` (all six) feeds the map, Explore, the agent's `listNearbyStores` and QR lookup.

## V3.5: expanded dataset, frozen study scope, saved meals

**Dataset.** 6 fictional demo brands and 19 real, unaffiliated restaurants (identity + location only, each verified 2026-09-29 against the restaurant's own website and its OpenStreetMap object).

| Brand | Level | Cuisine | In study dataset |
|---|---|---|---|
| FitKitchen | 3 | Protein bowls | **yes** |
| Urban Bowl | 2 | Build-your-own bowls | **yes** |
| Local Grill | 1 | Grill & wraps | **yes** |
| Pasta Metrica | 3 | Fresh pasta | no (public only) |
| Saffron & Steam | 2 | Indian rice bowls | no (public only) |
| Tinplate Deli | 1 | Sandwiches & soup | no (public only) |

Demo brands carry `brand: { color, mark }`, an original monogram (no photos, no logos). Real restaurants never carry one.

**Scope.** `STUDY_RESTAURANTS` (FitKitchen, Urban Bowl, Local Grill) is the **frozen study dataset** the scenarios were calibrated on.
- `/baseline` imports it directly.
- The treatment reads `catalog()` / `menuRestaurants()`. These return the study set while a trial is locked (`setStudyScope(!!lock)` in `AppState`), and everything otherwise.
- The optimizer, Explore, the map, the agent tools, QR lookup and Home all go through them. The agent cannot reach a public-only dish during a trial; this is tested.

**Saved meals.**
- One localStorage key, `macrotable.saved.v1`: `{ mealId, selections, savedAt }[]` (max 30).
- Local only, never exported or sent.
- Cleared by Profile → Prototype & research, or by Reset demo.
- Hidden during trials.

**Session build stamp (pre-pilot audit).**

```ts
interface SessionBuild {
  treatmentVersion: "V3.5";
  appCommit: string;
  baselineNutritionVisible: boolean;
  agentMode: "auto" | "offline";
  agentProxyConfigured: boolean;
  studyRestaurants: string[];
}
```

- `ParticipantSession.build` is set once, at *Begin*, and is absent on sessions recorded before V3.5.
- New CSV columns, appended at the end: `treatment_version`, `app_commit`, `baseline_nutrition_visible`, `agent_mode`, `agent_proxy_configured`.
- The JSON export adds `exportedBy`. The schema string is unchanged (`macrotable.research.v2`).

**New event detail.** `recommendation_selected` may carry `detail.entry` (`"home"` or `"restaurant"`), recording where the recommendation was opened. No new event names.
