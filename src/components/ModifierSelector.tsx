import { useState } from "react";
import { signed, signedEuro } from "../lib/format";
import { getOption, supportedOptions } from "../lib/nutrition";
import type { Meal, ModifierGroup, Selections } from "../types";
import { useInTrial } from "../state/AppState";
import { Icon } from "./Icon";

/**
 * One row per modifier group. Only restaurant-supported options can be selected;
 * options the restaurant explicitly does not allow are listed (locked) so it's
 * clear why MacroTable didn't use them.
 */
export function ModifierSelector({
  meal,
  selections,
  onChange,
  showNutrition = true,
  defaultOpen,
  compareTo = "default",
}: {
  meal: Meal;
  selections: Selections;
  onChange: (groupId: string, optionId: string) => void;
  showNutrition?: boolean;
  defaultOpen?: string;
  /** Show the "from → to" change relative to the dish as listed. */
  compareTo?: "default" | "none";
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? null);
  return (
    <ul className="divide-y divide-line-2">
      {meal.modifierGroups.map((g) => (
        <GroupRow
          key={g.id}
          group={g}
          selectedId={selections[g.id] ?? g.defaultOptionId}
          open={open === g.id}
          onToggle={() => setOpen((o) => (o === g.id ? null : g.id))}
          onChange={(id) => onChange(g.id, id)}
          showNutrition={showNutrition}
          compareTo={compareTo}
        />
      ))}
    </ul>
  );
}

function GroupRow({
  group,
  selectedId,
  open,
  onToggle,
  onChange,
  showNutrition,
  compareTo,
}: {
  group: ModifierGroup;
  selectedId: string;
  open: boolean;
  onToggle: () => void;
  onChange: (optionId: string) => void;
  showNutrition: boolean;
  compareTo: "default" | "none";
}) {
  const trial = useInTrial();
  const supported = supportedOptions(group);
  const locked = group.options.filter((o) => !o.supported);
  const selected = getOption(group, selectedId)!;
  const original = getOption(group, group.defaultOptionId)!;
  const changed = selected.id !== original.id;
  const onlyOne = supported.length < 2;
  const panelId = `mod-${group.id}`;

  return (
    <li className="py-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${group.name}: ${selected.label}${changed && compareTo === "default" ? ` (changed from ${original.label})` : ""}`}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink-3">{group.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[15.5px] font-semibold">
            {compareTo === "default" && changed ? (
              <>
                <span className="font-normal text-ink-3 line-through decoration-ink-3/40">{original.label}</span>
                <Icon name="arrowRight" size={14} className="text-ink-3" />
                <span className="text-brand">{selected.label}</span>
              </>
            ) : (
              <span>{selected.label}</span>
            )}
          </p>
        </div>
        {changed && compareTo === "default" && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">Changed</span>
        )}
        <Icon name="chevronDown" size={18} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={panelId} className="animate-fade-in pb-3">
          <div role="radiogroup" aria-label={`${group.name} options`} className="grid gap-2">
            {supported.map((o) => {
              const active = o.id === selectedId;
              const d = o.nutritionDelta;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={[
                    o.label,
                    o.priceDelta ? signedEuro(o.priceDelta) : "",
                    showNutrition && d.calories ? `${signed(d.calories, " kcal")}, protein ${signed(d.protein, " g")}` : "",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  onClick={() => onChange(o.id)}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                    active ? "border-brand bg-brand-soft/60" : "border-line bg-surface hover:bg-sunken"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${active ? "border-brand bg-brand text-white" : "border-line"}`}
                    aria-hidden="true"
                  >
                    {active && <Icon name="check" size={12} stroke={3} />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold">{o.label}</span>
                    {showNutrition && (
                      <span className="tnum block text-[12px] text-ink-3">
                        {d.calories === 0 && d.protein === 0 && d.carbs === 0 && d.fat === 0
                          ? "As listed"
                          : `${signed(d.calories, " kcal")} · P ${signed(d.protein, "g")} · C ${signed(d.carbs, "g")} · F ${signed(d.fat, "g")}`}
                      </span>
                    )}
                  </span>
                  <span className="tnum text-[13px] font-medium text-ink-2">{o.priceDelta ? signedEuro(o.priceDelta) : ""}</span>
                </button>
              );
            })}
          </div>
          {onlyOne && <p className="mt-2 text-[12.5px] text-ink-3">The restaurant offers no other option for this.</p>}
          {locked.length > 0 && (
            <ul className="mt-2 space-y-1" aria-label="Not offered by the restaurant">
              {locked.map((o) => (
                <li key={o.id} className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-[12.5px] text-ink-3">
                  <Icon name="lock" size={14} />
                  <span>
                    <span className="font-medium text-ink-2">{o.label}</span>
                    {trial ? " — not offered by the restaurant" : ", not offered by the restaurant"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
