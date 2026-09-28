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

## Provenance

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
