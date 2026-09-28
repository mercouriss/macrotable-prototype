# Scenario difficulty and a primary-outcome issue to decide before freeze

These numbers were computed from the prototype's own mock data and deterministic engine on 2026-09-28, at the commit that added this file. They are objective properties of the task, not pilot results.

| | A | B | C |
|---|---|---|---|
| Target | 700 kcal · ≥45 g P · ≤ €18 | 800 kcal · ≥55 g P · ≤ €20 · lower fat | 650 kcal · ≥40 g P · ≤ €17 · vegetarian |
| Eligible dishes (available, diet-matching) | 9 | 9 | 3 |
| Supported configurations | 134 | 134 | 29 |
| …within budget | 113 | 134 | 29 |
| …in target range (kcal ±10 %, protein ≥ target) | **13** (in 2 dishes) | **11** (in 2 dishes) | **2** (in 1 dish) |
| Dishes in target range *as listed* (no changes) | 0 | 0 | 0 |
| MacroTable's pick | Chicken Power Bowl · 682 kcal / 49 g / €16.50 | Chicken Power Bowl · 774 kcal / 63 g / €18.00 | Crispy Tofu Tahini Bowl · 690 kcal / 40 g / €15.50 |
| MacroTable's calorie deviation | 18 kcal | 26 kcal | 40 kcal |
| Smallest calorie deviation of any within-budget dish **as listed** | **10 kcal** (Halloumi Veggie Wrap, 28 g protein) | **20 kcal** (Teriyaki Salmon Bowl 34 g, or Falafel & Halloumi Bowl 26 g) | **10 kcal** (Crispy Tofu Tahini Bowl as listed, 30 g protein) |

**Difficulty:** in every scenario, reaching the target range requires modifying a dish. Scenario C is much tighter (2 of 29 configurations in range), so Scenarios A and B are the sensible pair for the within-participant design.

## Issue: calories-only deviation can reward ignoring protein

The primary outcome (protocol §2) is |kcal − target| among **feasible** orders. Feasibility (§3) covers supported modifiers, availability, budget and diet, **but not protein**.

In every scenario, a baseline participant can order a dish *as listed* whose calories are closer than MacroTable's recommendation, while missing the protein minimum by 10–29 g. On the primary outcome as written, that order counts as the better one. MacroTable optimises calories together with the protein minimum, carbs and fat, so it can "lose" on a calories-only measure while producing the order that better fits the stated goal.

This is a measurement-validity question, not a software bug. The team should settle it **before freeze** and record the decision in [freeze-record.md](freeze-record.md). The analysis script already outputs everything needed for any of these options:

1. **Keep calories-only as primary** and report protein success next to it. Interpret calorie wins that miss protein as a known limitation. This is the simplest option, but the headline number may understate or misstate MacroTable's value.
2. **Primary = calorie deviation among feasible orders that also meet the protein minimum.** Add "protein ≥ target" to the analysis-level feasibility rule, since the scenarios state it as a hard "≥". Orders that miss protein count as a failed task, and the failure rate is reported.
3. **Two co-primary dimensions:** report E_K and E_P (see §2) side by side, without combining them into a score (§2 forbids an invented weighted score).

Whichever option you choose, write it down before seeing main-study data (§2: *do not promote a secondary outcome to primary after seeing results*).
