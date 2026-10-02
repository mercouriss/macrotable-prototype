# Experiment protocol

> Operational materials for running the pilot and main study (schedule, questionnaire, analysis script, freeze record) are in [docs/study/](study/README.md). The team protocol document is the authority. This page describes how the app implements it.

## V3.5 note (supersedes V3.1 for the final evaluation)

V3.5 is a productization pass that **changes the treatment UI**:
- Home now has one primary action and "Good options nearby" (the optimizer's top pick per restaurant).
- The recommendation screen shows target-vs-meal bars, "MacroTable changed", and "How reliable is this?".
- *Configure order* → *Review order* → *Approve order*.
- Agent recommendation cards carry fit bars and a *Configure order* button.

**Treat V3.5 as its own version: run a V3.5 pilot and don't pool it with V3/V3.1 observations.**

What did not change:
- **Frozen study dataset.** Trials, in both arms, still show exactly FitKitchen, Urban Bowl and Local Grill. The public demo brands (including the 4 farther-out showcase brands) and the 19 real restaurants are never visible during a trial. Normal-mode menu UX added 2026-10-02 (restaurant → full-menu links on recommendation cards, *View full menu*, the full-menu row layout, and best-match-first scanned menus) is hidden during a trial, so the treatment screens are unchanged.
- **The rest of the study.** The baseline UI, scenarios, optimizer, feasibility rules, outcome definitions and logging events are all unchanged. The only addition is an optional `detail.entry` on `recommendation_selected`.
- **Premium concept and saved meals** are hidden during trials.
- **Freeze fingerprint.** It changes (tool descriptions changed), so re-copy it at freeze.
- **Agent engine states.** From `fdd863f` the proxy can answer with a secondary model, so the treatment has three engine states that must never be pooled silently.

**Three distinct engine states** (never pooled silently):

| State | What answers | How it's recorded |
|---|---|---|
| **Primary** | Gemini `gemini-3.8-flash` (`GEMINI_MODEL`) through the proxy | `agent_reply.detail`: `provider: "gemini"`, `modelFallback: false`, `model` → CSV `agent_engine` = `primary` |
| **Secondary** | Gemini `gemini-3.7-flash` (`GEMINI_FALLBACK_MODEL`), called by the proxy **once**, only after a retryable primary failure (429; 500/502/503/504; `RESOURCE_EXHAUSTED` / `UNAVAILABLE` / `DEADLINE_EXCEEDED`; network error or timeout). Never after 400/401/403/404 or a safety-blocked answer | `provider: "gemini"`, `modelFallback: true`, `model` → `agent_engine` = `secondary` |
| **Offline** | the deterministic offline demo agent (same tools), when both live models fail, the proxy is unreachable, or the device is set to offline | `provider: "mock"` (plus an `agent_fallback` event when a live attempt failed) → `agent_engine` = `offline` |

A session that mixes states exports e.g. `primary+secondary` or `primary+offline`. `agent_models` lists the model ids that answered. Context turns built directly from tool results (`provider: "tools"`) are deterministic and aren't an engine.

`analyze.py` writes `agent_engine` per observation and reports the engine mix. Record in [study/freeze-record.md](study/freeze-record.md) how secondary and offline sessions are treated.

- **MacroAgent audit fixes (before the pilot).** These change the treatment's agent behaviour, not the outcomes:
  - Live replies now also get a warning card when their wording overstates data confidence (e.g. calling an ESTIMATED dish "verified").
  - "No X" requests keep dishes that don't contain X.
  - The offline agent understands "I don't want X", remembers constraints stated earlier in the session, and no longer narrows a new search to the previously recommended restaurant.

  Scenario targets, canonical answers, scoring and logging are unchanged. Details: [study/prepilot-audit-v3.5.md](study/prepilot-audit-v3.5.md).
- **Treatment identity (pre-pilot audit).** Every session is stamped at *Begin* with `build`: treatment version, commit, baseline nutrition setting, the agent engine from the participant link (`engine=live|offline`, never the device's Live AI setting), whether a proxy is configured, and the study restaurant ids. `analyze.py` analyses only V3.5 sessions by default. Deep links can't leave the study set during a trial. See [study/prepilot-audit-v3.5.md](study/prepilot-audit-v3.5.md) for the freeze inputs and the three decisions still open.

## V3.1 note

V3.1 changes the treatment UI:
- agent step states;
- DEMO labels;
- real restaurants on the Explore map;
- Scan-the-menu-here action.

**Treat V3.1 as its own pilot version** and don't pool it with V3.0 pilot data. The baseline content is unchanged; it still lists only the three demo menus. The desktop showcase video is never shown during trials or on `/experiment` or `/baseline`. At freeze, copy **/research → Freeze record values** (commit, model ID, prompt/tools/settings hash, fallback policy) into `study/freeze-record.md`.

## V3 study (supersedes the V2 design for the final evaluation)

V3 materially changes the treatment, so **don't combine V2 pilot observations with V3 data**. Run a new pilot (codes `VT001–VT006`) and a new main study (`VP001–VP040`); see [study/assignment-schedule.md](study/assignment-schedule.md).

- **Baseline:** unchanged. Normal restaurant browsing and configuration with the same menus, prices and supported modifiers.
- **MacroTable (treatment):** agent-guided restaurant, meal and configuration decisions. Participants may use the Agent tab, Explore, the guided flow or the menus. The final order is placed from an agent order card or the approval screen. Either way it completes the trial.
- **Revised hypothesis:** *Does an agent that gathers context, invokes deterministic optimization tools, explains trade-offs and guides execution improve the user's food-ordering decision?*
- **Engine:** live Gemini with the offline agent as fallback. Every session records which engine answered (`agent_provider`: gemini / mock / mixed; since V3.5 `agent_engine`: primary / secondary / offline, see the V3.5 note) and its `agent_fallbacks`. Decide at freeze whether sessions with fallbacks are analysed separately. The analysis script lists them as failure cases.
- **Privacy:** research logs never store message text. Live messages go to Gemini (Google may use free-tier content), and the Agent tab tells participants not to share personal information.
- **Camera:** not part of the task. Leave menu scanning out of trials unless the protocol adds it.

## Research question (V2)

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

1. The link opens the protocol §9 instruction, verbatim and identical in both conditions, plus the scenario's targets and constraints (budget, and where relevant *Vegetarian* / *Preference: lower fat*). **Timing starts only on Begin**, and no session exists before it.
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
