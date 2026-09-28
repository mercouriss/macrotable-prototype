# Experiment protocol

## Research question

> Does MacroTable help users select a feasible restaurant order that better fits their nutritional objective than conventional ordering?

**Primary outcome:** nutritional-target deviation among feasible orders. That is |order kcal − target kcal| for orders that satisfy the hard constraints (within budget, matching the assigned diet). Protein attainment is reported alongside it.

**Secondary measures:** completion time, effort (meals viewed, modifier changes), price, protein-target success, calorie-range success, target-range success, and feasible-order rate. Confidence and acceptance need a post-task questionnaire, which the app does not collect.

## Conditions

| | Baseline (control) | MacroTable (treatment) |
|---|---|---|
| Route after Begin | `/baseline/browse` | `/macrotable` |
| Menu, prices, nutrition, availability, supported modifiers | **identical** (same `src/data/restaurants.ts`, same `computeConfiguration`) | identical |
| Recommendations / ranking by fit | none (fixed menu order) | yes |
| Optimizer-selected configuration | none (dishes start as listed) | yes |
| Target-vs-order comparison, explanations | none | yes |
| Menu nutrition shown | optional (research toggle, default on) | yes |
| Kitchen ticket / success screen | no, neutral completion | no, neutral completion |

Onboarding is skipped in both conditions during trials, so timing covers the task only.

## Scenarios

| | Target | Budget | Diet / preference | Notes |
|---|---|---|---|---|
| A | 700 kcal, ≥45 g protein (75 g C, 22 g F) | €18 | none | canonical demo answer: Chicken Power Bowl, 682 kcal / 49 g / €16.50 |
| B | 800 kcal, ≥55 g protein (90 g C, 20 g F) | €20 | lower fat | |
| C | 650 kcal, ≥40 g protein (75 g C, 20 g F) | €17 | vegetarian | few feasible options |
| D | 450 kcal, ≥65 g protein | €18 | none | **deliberately infeasible**, for demos, not for the main study |

A–C each contain both configurations that reach the target and ones that don't (tested).

## Participant IDs and assignment links

- Use anonymous codes only: 1–4 letters followed by 1–5 digits, e.g. `P001`. The link validator rejects anything else, including names, emails and phone numbers.
- Link format: `https://mercouriss.github.io/macrotable-prototype/experiment?participant=P001&condition=baseline&scenario=A`
- Build links on `/research` → *New participant link*. The dashboard suggests the next code and alternates the condition. Use **Copy**, **Share** (Web Share, falling back to clipboard), **QR** (the participant scans it with their phone) or **Start on this device**.
- **Counterbalance** conditions across participants (and scenarios if within-subjects). The dashboard doesn't enforce a design, so plan the allocation in a sheet first.

## Participant flow

1. The link opens neutral instructions with the same wording in both conditions. **Timing starts only on Begin**, and no session exists before it.
2. During the trial:
   - condition and scenario are locked;
   - `?scenario=` is ignored;
   - `/macrotable` ↔ `/baseline`, `/demo` and `/r/...` redirect to the assigned condition;
   - the presenter panel, *Reset demo* and research links are hidden;
   - `/research` shows only a lock screen with a confirm-protected *Researcher: abort trial*.
3. The trial ends when the participant confirms an order. The session is completed once, the lock is released, and the participant sees "Task complete — please return the device to the researcher". The best answer is never revealed.
4. If a trial must stop, use *Researcher: abort trial*. The session is kept with status `aborted`.

## What is logged

Each session stores the participant code, condition, scenario, assigned target, start/end timestamps, completion time, selected meal, restaurant, modifiers, final nutrition and price, provenance, integration level, hand-off flag and outcome flags, plus an event list:

`experiment_started`, `preferences_set`, `search_run`, `recommendation_selected`, `meal_viewed`, `macrotable_version_used`, `modifier_changed`, `provenance_viewed`, `closest_option_viewed`, `scan_menu_opened`, `scan_qr_opened`, `menu_photo_taken`, `menu_matched`, `qr_scanned`, `restaurant_detected`, `order_confirmed`, `experiment_completed`, `experiment_aborted`.

**Outcomes are always scored against the assigned scenario**, even if a treatment participant edits their targets in Preferences.

- `withinBudget`: price ≤ scenario budget
- `dietOk`: meal carries the scenario's diet label
- `feasibleOrder`: withinBudget ∧ dietOk
- `caloriesWithinRange`: |deviation| ≤ 10 %
- `proteinMet`: protein ≥ target
- `targetRange`: feasibleOrder ∧ caloriesWithinRange ∧ proteinMet
- `calorieDeviation`: signed kcal difference

Nothing is logged in demo mode, and camera images are never stored or exported.

## Dashboard summaries

Per condition, over completed trials: completed/started, median time, mean and median |kcal deviation|, protein success, feasible-order rate and in-target-range rate. These are **descriptive only**. The app runs no significance tests. Do the analysis on the exported data (e.g. Mann–Whitney U on |kcal deviation| for feasible orders, with effect sizes).

## Export and reset

- **Export CSV**: one row per session (columns listed in [DATA_MODEL.md](DATA_MODEL.md)).
- **Export JSON**: schema `macrotable.research.v2`, with a summary and full sessions including events.
- **Export after every session.** Data is per-browser, per-device localStorage.
- **Clear local research data** deletes sessions and simulated orders after a confirmation, and is disabled during a trial. It doesn't touch code or mock data. **Reset demo** is different: it resets UI state only and never deletes research data.

## Limitations

- Local storage only, with no central collection. Running participants on their own phones means collecting each device's export.
- Mock restaurant data is fictional, and target deviation uses modelled nutrition, not measured food.
- The baseline shows menu nutrition by default. Decide and freeze this toggle before the main study.
- Onboarding is skipped for trials. Treatment participants see the product without an explanation, which is deliberate for comparability.
- Assignment links return HTTP 200 (a real `/experiment/index.html` exists). Pages adds a trailing slash via a 301 redirect that keeps the query string, and the app strips the slash before reading the parameters.
- Real-device behaviour must be piloted (see DEMO.md → real-device checklist).
