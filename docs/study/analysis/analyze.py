#!/usr/bin/env python3
"""
MacroTable study analysis — descriptive, per protocol §19–21.

Usage:
    python3 analyze.py EXPORT.json [EXPORT2.json ...] [--survey survey.csv] [--out OUTDIR] [--treatment V3.5]

Inputs
  EXPORT.json   JSON exports from /research ("Export JSON"), one or more devices.
                Raw exports are never modified; sessions are de-duplicated by session_id.
  survey.csv    Optional questionnaire responses (template: ../questionnaire-responses-template.csv),
                one row per participant x condition.

Outputs (in OUTDIR, default ./analysis-output)
  observations.csv   one row per completed participant-condition observation (derived data)
  within.csv         one row per participant with both conditions: delta = dev_baseline - dev_macrotable
  report.md          descriptive summary, within-participant table, failure cases, excluded sessions

Treatment versions are never pooled: only sessions stamped with --treatment (default V3.5) are
analysed; older/unstamped sessions are listed as excluded. Use --treatment any to inspect everything.

Deliberately NOT included: significance tests, a weighted "macro score". Positive delta = MacroTable closer.
Python 3.8+, standard library only.
"""
import argparse
import csv
import json
import os
import statistics
import sys
from datetime import datetime, timezone
from collections import defaultdict

CONDITIONS = ("baseline", "macrotable")
LIKERT_COMMON = ("effort", "confidence", "satisfaction")
LIKERT_MT = ("usefulness", "trust", "delegation_comfort", "likelihood_use")


def load_sessions(paths):
    sessions, seen = [], set()
    for p in paths:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("schema") != "macrotable.research.v2":
            sys.exit(f"{p}: unexpected schema {data.get('schema')!r} (expected macrotable.research.v2)")
        for s in data["sessions"]:
            if s["sessionId"] in seen:
                continue
            seen.add(s["sessionId"])
            s["_source"] = os.path.basename(p)
            sessions.append(s)
    return sessions


def load_survey(path):
    if not path:
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f), start=2):
            pid = (row.get("participant") or "").strip().upper()
            cond = (row.get("condition") or "").strip().lower()
            if not pid:
                continue
            if cond not in CONDITIONS:
                sys.exit(f"{path}:{i}: condition must be baseline or macrotable, got {cond!r}")
            rec = {}
            for k in LIKERT_COMMON + LIKERT_MT:
                v = (row.get(k) or "").strip()
                if v == "":
                    continue
                if not v.isdigit() or not 1 <= int(v) <= 7:
                    sys.exit(f"{path}:{i}: {k} must be an integer 1-7, got {v!r}")
                rec[k] = int(v)
            rec["survey_notes"] = (row.get("notes") or "").strip()
            out[(pid, cond)] = rec
    return out


def agent_provider(s):
    p = {(e.get("detail") or {}).get("provider") for e in s["events"] if e["event"] == "agent_reply"} & {"gemini", "mock"}
    return "mixed" if len(p) == 2 else (p.pop() if p else "")


def agent_engine(s):
    """primary / secondary (proxy fallback model) / offline, joined by '+'; '' if the agent never replied."""
    used = set()
    for e in s["events"]:
        if e["event"] != "agent_reply":
            continue
        d = e.get("detail") or {}
        if d.get("provider") == "gemini":
            used.add("secondary" if d.get("modelFallback") else "primary")
        elif d.get("provider") == "mock":
            used.add("offline")
    return "+".join(x for x in ("primary", "secondary", "offline") if x in used)


def num(x):
    return "" if x is None else x


def describe(values):
    if not values:
        return {"n": 0}
    return {
        "n": len(values),
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "sd": statistics.stdev(values) if len(values) > 1 else 0.0,
        "min": min(values),
        "max": max(values),
    }


def fmt(d, key, digits=1):
    v = d.get(key)
    return "—" if v is None else (f"{v:.{digits}f}" if isinstance(v, float) else str(v))


def treatment_of(s):
    """V3.5+ sessions carry build.treatmentVersion; older sessions have none."""
    return (s.get("build") or {}).get("treatmentVersion") or "unrecorded (pre-V3.5)"


def build_observations(sessions, survey, treatment="V3.5"):
    by_pid = defaultdict(list)
    for s in sessions:
        by_pid[s["participantId"]].append(s)
    obs, excluded = [], []
    for pid, ss in by_pid.items():
        ss.sort(key=lambda s: s["startedAt"])
        completed = [s for s in ss if s.get("completedAt")]
        first = completed[0]["condition"] if completed else None
        sequence = {"baseline": "AB", "macrotable": "BA"}.get(first, "")
        for s in ss:
            if treatment != "any" and treatment_of(s) != treatment:
                excluded.append((pid, s["condition"], s["scenarioId"], f"treatment {treatment_of(s)} (analysing {treatment} only)", s["_source"]))
                continue
            if not s.get("completedAt"):
                excluded.append((pid, s["condition"], s["scenarioId"], "aborted" if s.get("abortedAt") else "not completed", s["_source"]))
                continue
            t, n, o = s["target"], s["finalNutrition"], s["outcome"]
            ev = [e["event"] for e in s["events"]]
            row = {
                "participant": pid,
                "sequence": sequence,
                "order": completed.index(s) + 1,
                "condition": s["condition"],
                "scenario": s["scenarioId"],
                "meal_id": s["selectedMealId"],
                "restaurant_id": s["selectedRestaurantId"],
                "provenance": s.get("provenance"),
                "integration_level": s.get("integrationLevel"),
                "modifiers": "; ".join(s.get("modifierLabels") or []),
                "calories": n["calories"],
                "target_kcal": t["calories"],
                "kcal_deviation": abs(n["calories"] - t["calories"]),
                "kcal_deviation_signed": n["calories"] - t["calories"],
                "protein_g": n["protein"],
                "target_protein_g": t["protein"],
                "protein_error": abs(n["protein"] - t["protein"]),
                "protein_success": int(o["proteinMet"]),
                "carbs_g": n["carbs"],
                "carbs_error": abs(n["carbs"] - t["carbs"]),
                "fat_g": n["fat"],
                "fat_error": abs(n["fat"] - t["fat"]),
                "price_eur": s["finalPrice"],
                "budget_eur": t["maxBudget"],
                "budget_success": int(o["withinBudget"]),
                "diet_ok": int(o["dietOk"]),
                "feasible": int(o["feasibleOrder"]),
                "target_range": int(o["targetRange"]),
                "time_sec": round(s["completionTimeMs"] / 1000, 1),
                "meals_viewed": ev.count("meal_viewed"),
                "modifier_changes": ev.count("modifier_changed"),
                "provenance_views": ev.count("provenance_viewed"),
                "used_macrotable_version": int("macrotable_version_used" in ev),
                # V3 agent usage (never message text)
                "agent_messages": ev.count("agent_message_sent"),
                "agent_tool_calls": ev.count("agent_tool_called"),
                "agent_provider": agent_provider(s),
                "agent_engine": agent_engine(s),
                "agent_fallbacks": ev.count("agent_fallback"),
                "agent_order_approved": int("order_approved_in_agent" in ev),
                "treatment_version": treatment_of(s),
                "app_commit": (s.get("build") or {}).get("appCommit", ""),
                "baseline_nutrition_visible": (s.get("build") or {}).get("baselineNutritionVisible", ""),
                "agent_mode": (s.get("build") or {}).get("agentMode", ""),
                "started_at_utc": datetime.fromtimestamp(s["startedAt"] / 1000, tz=timezone.utc).isoformat(timespec="seconds"),
                "source_export": s["_source"],
            }
            rec = survey.get((pid, s["condition"]), {})
            for k in LIKERT_COMMON + LIKERT_MT:
                row[k] = rec.get(k, "")
            row["survey_notes"] = rec.get("survey_notes", "")
            obs.append(row)
    obs.sort(key=lambda r: (r["participant"], r["order"]))
    return obs, excluded


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("exports", nargs="+")
    ap.add_argument("--survey")
    ap.add_argument("--out", default="analysis-output")
    ap.add_argument("--treatment", default="V3.5", help='treatment version to analyse (default V3.5; "any" = no filter)')
    a = ap.parse_args()

    sessions = load_sessions(a.exports)
    survey = load_survey(a.survey)
    obs, excluded = build_observations(sessions, survey, a.treatment)
    commits = sorted({r["app_commit"] for r in obs})
    if len(commits) > 1:
        print(f"WARNING: observations come from {len(commits)} app commits {commits}; check the freeze record before pooling.", file=sys.stderr)
    os.makedirs(a.out, exist_ok=True)

    if obs:
        with open(os.path.join(a.out, "observations.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(obs[0].keys()))
            w.writeheader()
            w.writerows(obs)

    # Within-participant pairs: both conditions completed AND both feasible (primary analysis set).
    by_pid = defaultdict(dict)
    for r in obs:
        by_pid[r["participant"]][r["condition"]] = r
    within, not_paired = [], []
    for pid, conds in sorted(by_pid.items()):
        if len(conds) < 2:
            not_paired.append((pid, "only one condition completed"))
            continue
        b, m = conds["baseline"], conds["macrotable"]
        both_feasible = b["feasible"] and m["feasible"]
        within.append({
            "participant": pid,
            "sequence": b["sequence"],
            "scenario_baseline": b["scenario"],
            "scenario_macrotable": m["scenario"],
            "dev_baseline": b["kcal_deviation"],
            "dev_macrotable": m["kcal_deviation"],
            "delta": b["kcal_deviation"] - m["kcal_deviation"],
            "both_feasible": int(both_feasible),
            "protein_baseline": b["protein_success"],
            "protein_macrotable": m["protein_success"],
            "time_baseline": b["time_sec"],
            "time_macrotable": m["time_sec"],
            "time_diff": round(b["time_sec"] - m["time_sec"], 1),
        })
    if within:
        with open(os.path.join(a.out, "within.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(within[0].keys()))
            w.writeheader()
            w.writerows(within)

    # ─── Report ───
    L = []
    L.append("# MacroTable study — descriptive analysis\n")
    L.append(f"Exports: {', '.join(os.path.basename(p) for p in a.exports)} · sessions: {len(sessions)} · completed observations: {len(obs)}\n")
    L.append("> Descriptive only. No significance testing. Positive Δ = MacroTable closer to the calorie target.\n")

    L.append("## Primary outcome — |kcal − target| among feasible orders\n")
    L.append("| Condition | Observations | Feasible | Feasible rate | Mean | Median | SD | Min | Max |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for c in CONDITIONS:
        rows = [r for r in obs if r["condition"] == c]
        feas = [r for r in rows if r["feasible"]]
        d = describe([r["kcal_deviation"] for r in feas])
        rate = f"{len(feas) / len(rows):.0%}" if rows else "—"
        L.append(f"| {c} | {len(rows)} | {len(feas)} | {rate} | {fmt(d,'mean')} | {fmt(d,'median')} | {fmt(d,'sd')} | {fmt(d,'min')} | {fmt(d,'max')} |")
    L.append("")

    L.append("## Within-participant comparison (Δ = dev_baseline − dev_macrotable)\n")
    paired = [w for w in within if w["both_feasible"]]
    if within:
        L.append("| Participant | Seq | Scen (B/MT) | Dev baseline | Dev MacroTable | Δ | Both feasible | Protein B/MT | Time B/MT (s) |")
        L.append("|---|---|---|---|---|---|---|---|---|")
        for w in within:
            L.append(
                f"| {w['participant']} | {w['sequence']} | {w['scenario_baseline']}/{w['scenario_macrotable']} | {w['dev_baseline']} | {w['dev_macrotable']} | "
                f"{w['delta']:+d} | {'yes' if w['both_feasible'] else '**no**'} | {w['protein_baseline']}/{w['protein_macrotable']} | {w['time_baseline']}/{w['time_macrotable']} |"
            )
        deltas = [w["delta"] for w in paired]
        d = describe(deltas)
        L.append("")
        L.append(
            f"Primary set (both feasible): n = {len(paired)} · MacroTable closer: {sum(x > 0 for x in deltas)} · "
            f"baseline closer: {sum(x < 0 for x in deltas)} · tie: {sum(x == 0 for x in deltas)} · "
            f"mean Δ {fmt(d,'mean')} · median Δ {fmt(d,'median')} kcal"
        )
    else:
        L.append("_No participant completed both conditions yet._")
    L.append("")

    L.append("## Secondary outcomes (completed observations)\n")
    L.append("| Condition | Protein success | Target range | Median time (s) | Mean price (€) | Median modifier changes | Median meals viewed | Mean effort | Mean confidence | Mean satisfaction |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for c in CONDITIONS:
        rows = [r for r in obs if r["condition"] == c]
        if not rows:
            L.append(f"| {c} | — | — | — | — | — | — | — | — | — |")
            continue
        def mean_of(k):
            v = [r[k] for r in rows if r[k] != ""]
            return f"{statistics.mean(v):.1f} (n={len(v)})" if v else "—"
        L.append(
            f"| {c} | {sum(r['protein_success'] for r in rows)/len(rows):.0%} | {sum(r['target_range'] for r in rows)/len(rows):.0%} | "
            f"{statistics.median(r['time_sec'] for r in rows):.1f} | {statistics.mean(r['price_eur'] for r in rows):.2f} | "
            f"{statistics.median(r['modifier_changes'] for r in rows):g} | {statistics.median(r['meals_viewed'] for r in rows):g} | "
            f"{mean_of('effort')} | {mean_of('confidence')} | {mean_of('satisfaction')} |"
        )
    mt = [r for r in obs if r["condition"] == "macrotable"]
    if any(r[k] != "" for r in mt for k in LIKERT_MT):
        L.append("")
        L.append("MacroTable-only ratings (1–7): " + " · ".join(
            f"{k.replace('_', ' ')} {statistics.mean([r[k] for r in mt if r[k] != '']):.1f}"
            for k in LIKERT_MT if any(r[k] != "" for r in mt)))
    if mt:
        L.append("")
        used = [r for r in mt if r["agent_messages"] or r["agent_tool_calls"]]
        prov, eng = defaultdict(int), defaultdict(int)
        for r in mt:
            prov[r["agent_provider"] or "not used"] += 1
            eng[r["agent_engine"] or "not used"] += 1
        L.append(
            f"MacroAgent use (MacroTable observations): {len(used)}/{len(mt)} used the agent · "
            f"median messages {statistics.median(r['agent_messages'] for r in mt):g} · "
            f"engine: " + ", ".join(f"{k} {v}" for k, v in sorted(prov.items())) +
            f" · sessions with a live→offline fallback: {sum(1 for r in mt if r['agent_fallbacks'])}"
            f" · engine mix (primary / secondary / offline; decide pooling per the freeze record): "
            + ", ".join(f"{k} {v}" for k, v in sorted(eng.items()))
        )
    L.append("")
    L.append("Dimension errors (mean |error|, all completed): " + " · ".join(
        f"{c}: kcal {statistics.mean(r['kcal_deviation'] for r in rows):.0f}, P {statistics.mean(r['protein_error'] for r in rows):.0f} g, "
        f"C {statistics.mean(r['carbs_error'] for r in rows):.0f} g, F {statistics.mean(r['fat_error'] for r in rows):.0f} g"
        for c in CONDITIONS if (rows := [r for r in obs if r['condition'] == c])))
    L.append("")

    L.append("## Failure cases to inspect (§21)\n")
    cases = []
    for w in within:
        if w["both_feasible"] and w["delta"] <= 0:
            cases.append(f"- **{w['participant']}**: MacroTable not closer on calories (Δ {w['delta']:+d} kcal).")
        if not w["both_feasible"]:
            cases.append(f"- **{w['participant']}**: at least one order infeasible — excluded from the primary set.")
        if w["time_diff"] < 0:
            cases.append(f"- **{w['participant']}**: MacroTable took longer ({w['time_macrotable']} s vs {w['time_baseline']} s).")
    for r in mt:
        if r["agent_provider"] == "mixed" or r["agent_fallbacks"]:
            cases.append(f"- **{r['participant']}**: live model failed at least once — offline agent answered (check before pooling with live sessions).")
        if not r["protein_success"]:
            cases.append(f"- **{r['participant']}**: MacroTable order missed the protein target ({r['protein_g']} g vs ≥{r['target_protein_g']} g).")
        if not r["used_macrotable_version"] and r["condition"] == "macrotable":
            cases.append(f"- **{r['participant']}**: did not use \"MacroTable's version\" (customised or chose another route).")
        if r["trust"] != "" and r["trust"] <= 3:
            cases.append(f"- **{r['participant']}**: low trust rating ({r['trust']}/7).")
    b_good = [r for r in obs if r["condition"] == "baseline" and r["target_range"]]
    for r in b_good:
        cases.append(f"- **{r['participant']}**: baseline order already in target range — MacroTable had little room to help.")
    L.extend(cases or ["_None flagged._"])
    L.append("")
    L.append("For each case ask: *What assumption failed, and what product or strategic decision follows?*\n")

    L.append("## Excluded / incomplete sessions\n")
    if excluded or not_paired:
        for pid, cond, sc, why, src in excluded:
            L.append(f"- {pid} · {cond} · {sc}: {why} ({src})")
        for pid, why in not_paired:
            L.append(f"- {pid}: {why}")
    else:
        L.append("_None._")
    L.append("")

    with open(os.path.join(a.out, "report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print("\n".join(L))
    print(f"\nWrote {a.out}/observations.csv, within.csv, report.md")


if __name__ == "__main__":
    main()
