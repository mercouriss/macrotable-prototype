# MacroTable — prototype

> **This application is a university proof-of-concept. Restaurant integrations, nutrition data, orders, health synchronization, and checkout are simulated unless explicitly stated otherwise.**

Team 44 · Information Strategy

## 1. What MacroTable is

MacroTable is a nutrition-aware food-commerce agent. You give it your remaining nutritional targets, budget and preferences. It considers restaurant meals, **uses only the modifications each restaurant supports**, picks the best feasible configuration, explains the choice and where the nutrition data comes from, asks for your approval, and turns the decision into a restaurant-readable kitchen order.

> Existing nutrition tools can recommend what to eat. MacroTable turns a nutritional objective into an executable restaurant order.
>
> **AI interprets. Optimization calculates. Restaurant constraints determine what can actually be made.**

## 2. Purpose of this prototype

This is a clickable, mobile-first prototype that makes the core workflow believable and testable:

```
nutrition goal → preferences → meal discovery → feasibility filter → recommendations
→ supported modification → nutrition comparison → user approval → kitchen ticket
```

It also includes a deliberately **impossible** case, where MacroTable says so instead of inventing a modification. It also has a **conventional ordering baseline** for a controlled comparison. It is not production software.

## 3. Install and run

Requires Node 18+ (tested on Node 24).

```bash
npm install
npm run dev
```

Open http://localhost:5173. On a desktop browser the app is shown in a 390×844 phone frame. At ≥1280 px width a presenter panel for switching scenarios appears beside it. On a phone the app fills the screen.

Other commands:

```bash
npm test           # optimiser + arithmetic tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

No network access is needed once dependencies are installed: there are no external APIs, fonts, images or analytics.

## 4. Demo flow (Demo Day path)

Scenario A is the default. Append `?scenario=A` to any URL to reset to it.

1. **Home** (`/macrotable`): Alex has 700 kcal · 45 g protein · 75 g carbs · 22 g fat left and a €18 dinner budget. Tap **Find me a meal**.
2. **Preferences**: budget, diet, priority (macros / price / closest) and taste preferences. Tap **Find meals**.
3. **Searching**: a short progress screen. Every line shows a real count from the search: 134 supported configurations, 4 unsupported options never used, 113 within €18. **Skip** jumps ahead.
4. **Results**: three options, one per restaurant, ranked by fit. They are VERIFIED (FitKitchen), OFFICIAL (Urban Bowl) and ESTIMATED (Local Grill).
5. **Chicken Power Bowl** → **Why this meal**: your target next to this order (682 kcal, 49 g protein, 72 g carbs, 20 g fat, €16.50), plus the reasons.
6. **Use MacroTable's version** → **Configuration**: original dish → MacroTable version (+50 g chicken, half rice, light sauce, double vegetables). Tap any row to change it; totals and price recalculate. Unsupported options are shown locked.
7. **How was this calculated?** opens the provenance sheet.
8. **Review order** → **Approval**: nothing is ordered until **Confirm configuration** is tapped.
9. **Order sent** → **View kitchen ticket** (`MACROTABLE ORDER #MT1042`).

**Failure case** (either route):

- *Restaurant-level:* Discover → **Urban Bowl** → *Find what fits my macros here*. Urban Bowl can't add salmon or halve the rice, so the best it can do is **760 kcal / 40 g protein / €17.20**. The app shows *No exact configuration available*, the closest supported option, and why.
- *Global:* switch to **Scenario D** (`/macrotable?scenario=D`, 450 kcal with ≥65 g protein). Even the maximum supported chicken portion leaves the best bowl 8 g short.

**Other entry points:** *Scan QR* simulates a table QR at FitKitchen (a partner). *Scan menu* simulates photographing Local Grill's paper menu (unaffiliated; estimates and hand-off only). Neither uses a camera, a QR library or image recognition.

## 5. Baseline experiment route

| Route | Condition |
|---|---|
| `/macrotable` | Treatment: MacroTable-assisted ordering |
| `/baseline` | Control: conventional ordering |
| `/research` | Researcher screen (hidden; also via Profile → Research & scenarios) |

The baseline uses **the same restaurants, meals and supported modifiers** (`src/data/restaurants.ts`). It removes recommendations, optimised configurations, target comparison, explanations and nutrition-fit ranking. Restaurants and meals appear in fixed menu order. The participant sees the task, browses, configures manually and places a simulated order. A research toggle controls whether menu nutrition is shown in the baseline, as some conventional apps do.

For each trial the app records the selected meal and configuration, final nutrition, final price, whether the order reached the target range, meals viewed, modifier changes and **completion time** (from *Start* / *Find me a meal* to order confirmation). Results appear on `/research` and can be exported as JSON.

Events (`localStorage` only, no external service): `experiment_started`, `preferences_set`, `search_run`, `recommendation_selected`, `meal_viewed`, `modifier_changed`, `provenance_viewed`, `order_confirmed`, `experiment_completed`, among others.

## 6. Preset scenarios

Switch scenarios with `?scenario=A|B|C|D` on any URL, the Research screen, or the desktop presenter panel. Switching resets targets and preferences.

| | Target | Budget | Preferences | Expected outcome |
|---|---|---|---|---|
| **A** | 700 kcal, ≥45 g protein (75 g C, 22 g F) | €18 | none (high protein on) | Chicken Power Bowl, MacroTable version, 682 kcal / 49 g |
| **B** | 800 kcal, ≥55 g protein (90 g C, 20 g F) | €20 | lower fat | Chicken Power Bowl, +100 g chicken, no sauce, double veg |
| **C** | 650 kcal, ≥40 g protein (75 g C, 20 g F) | €17 | vegetarian | Crispy Tofu Tahini Bowl, +75 g tofu, light tahini |
| **D** | 450 kcal, ≥65 g protein | €18 | — | Deliberately impossible → closest option |

Scenarios A–C each contain meals that reach the target and meals that do not. `src/lib/__tests__/optimizer.test.ts` asserts this.

## 7. Mock data

`src/data/restaurants.ts` holds 3 fictional restaurants and 11 meals:

| Restaurant | Integration level | Provenance | What MacroTable can do |
|---|---|---|---|
| **FitKitchen** | 3 · Verified partner | VERIFIED (recipe-level) | Optimise at recipe level, configure, send kitchen ticket |
| **Urban Bowl** | 2 · Structured integration | OFFICIAL (published by the merchant) | Filter, optimise within supported modifiers, create order |
| **Local Grill** | 1 · Unaffiliated | ESTIMATED (from the public menu) | Recommend, estimate, hand off. No modifications, no direct order |

Each meal has base nutrition and price, and modifier groups whose options carry a **nutrition delta and a price delta**. The default option always has a zero delta. Options marked `supported: false` are ones the restaurant explicitly does not allow (e.g. Urban Bowl's *half rice*, *extra salmon*). They never enter the search space and are shown locked in the UI. The data also covers the error states: one sold-out item (Steak & Sweet Potato), one item with no nutrition data (Chef's Daily Special) and one spicy item (filtered by *No spicy food*).

The Chicken Power Bowl arithmetic, checked by tests:

```
Base         890 kcal  39 P  105 C  31 F   €14.50
+50 g chicken +70      +12     0    +2     +€1.50
Half rice    −160       −3   −35     0
Light sauce  −148       −1    −3   −13
Double veg    +30       +2    +5     0     +€0.50
= MacroTable 682 kcal  49 P   72 C  20 F   €16.50
```

## 8. Architecture

Vite + React 19 + TypeScript + Tailwind CSS v4 + React Router. There is no backend, no state library and no UI kit.

```
src/
├── data/          restaurants.ts (menus, modifiers, deltas) · scenarios.ts (A–D, persona)
├── lib/
│   ├── nutrition.ts    deterministic base + deltas (integer cents); refuses unsupported options
│   ├── feasibility.ts  hard filters (available, nutrition present, diet, spicy), enumeration of
│   │                   supported configurations, budget, "reaches target" definition
│   ├── optimizer.ts    distance D, ranking, per-restaurant recommendations, explanations
│   ├── experiment.ts   localStorage event log, orders, trial summaries, JSON export
│   └── __tests__/      16 tests: arithmetic, supported-only, scenarios, failure case
├── state/         AppState (React context) · useMealSelection
├── components/    ProvenanceBadge, RestaurantBadge, MealCard, NutritionComparison,
│                  ModifierSelector, KitchenTicket, MacroSummary, Sheet, Screen/BottomNavigation, …
├── screens/       Home, Preferences, Search, Results, MealDetail, Configure, Review,
│                  Success/Ticket, Failure, Scan, Discover, Orders/Profile, Research
└── baseline/      conventional-ordering control condition
```

**Recommendation logic** (`x* = argmin_{x∈F} D(N(x), T)`):

1. Generate every configuration from the **supported** options of each modifier group.
2. Remove infeasible ones: unavailable, no nutrition data, diet or spicy mismatch, over the hard budget.
3. Compute nutrition and price deterministically: base plus deltas.
4. Compare with the target using a transparent distance: `D = 1·|kcal err| + 1.5·protein shortfall + 0.5·|carb err| + 0.5·|fat err|`, each relative to the target. *High protein* raises the shortfall weight to 2. *Lower fat* penalises only fat above target, at weight 1.
5. Rank. Configurations that **reach the target range** (kcal within ±10 %, protein ≥ target) come first, then the user's priority: fit (D), price, or delivery time.

D is a **prototype ranking heuristic, not a validated nutrition model**. Its number is never shown to users; the UI explains the underlying dimensions instead. Results show the best configuration from each restaurant, ranked by fit. Integration level affects data confidence and what can be ordered, **never the ranking**.

No LLM is called anywhere. Nutrition is never calculated by AI.

## 9. What is simulated

Everything external:

- restaurants, menus, recipes, prices, nutrition values and provenance
- restaurant integrations (levels 1–3)
- QR scanning and menu photo recognition
- delivery times and "closest"
- order sending, kitchen tickets and hand-off
- checkout (no payment is ever taken)
- the "logged today" macros on Home

Not integrated: Uber Eats, DoorDash, Toast, Square, Apple Health, Google Health Connect, maps, geolocation, authentication, payments, LLM APIs, analytics.

## 10. Known limitations

- Nutrition values are invented for the demo. They are internally consistent but not real-world measurements. VERIFIED describes the data source, not guaranteed accuracy.
- Modifier deltas are additive and independent. Real kitchens have interactions (e.g. sauce absorbed by rice) and portion variance.
- The ±10 % calorie tolerance, the protein-as-minimum rule and the D weights are design choices for the prototype, not validated thresholds.
- One meal per order. No sides, drinks, multi-item baskets, tips or delivery fees.
- "Closest" uses a fixed delivery-time field, not location.
- Research data lives in the browser's `localStorage` on one device. Export JSON after each session. Clearing site data deletes it.
- The persona, targets and "logged today" data are fixed per scenario. There is no real food log.
- The UI is English only, light theme only, and tested at 390×844 and desktop widths.
- MacroTable is not a medical tool. It makes no diagnostic, medication, diabetes or allergen claims, and it never orders without explicit confirmation.
