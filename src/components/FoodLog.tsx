import { useId, useState } from "react";
import { getMeal } from "../data/restaurants";
import { FOOD_FIELD_KEYS, FOOD_FIELDS, validateFoodValue, type FoodField } from "../lib/foodLog";
import type { Macros, TodayEntry } from "../lib/ledger";
import { useAppState } from "../state/AppState";
import { Icon } from "./Icon";
import { useSheet } from "./Sheet";
import { Button } from "./ui";

/*
 * Today's food log (normal mode only): "Add food" for food eaten elsewhere and "Adjust totals" to add or
 * subtract values, so MacroTable works without a separate calorie-tracking app.
 */

const fmt = (n: Macros, approx = false) => {
  const a = approx ? "≈ " : "";
  return `${a}${n.calories} kcal · ${a}${n.protein} g protein · ${a}${n.carbs} g carbs · ${a}${n.fat} g fat`;
};
/** An adjustment shows only what it changed: "−100 kcal", "+20 g protein · +5 g fat". */
const signed = (n: Macros) => {
  const s = (x: number) => (x < 0 ? `−${-x}` : `+${x}`);
  const parts = (
    [
      [n.calories, "kcal"],
      [n.protein, "g protein"],
      [n.carbs, "g carbs"],
      [n.fat, "g fat"],
    ] as const
  )
    .filter(([v]) => v !== 0)
    .map(([v, unit]) => `${s(v)} ${unit}`);
  return parts.join(" · ") || "No change";
};
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The "Add food" sheet: food eaten elsewhere, or "Adjust totals" (add or subtract). */
export function AddFoodPanel({ onDone }: { onDone: () => void }) {
  const { addFood } = useAppState();
  const nameId = useId();
  const [mode, setMode] = useState<"food" | "adjust">("food");
  const [sign, setSign] = useState<1 | -1>(1);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<FoodField, string>>({ calories: "", protein: "", carbs: "", fat: "" });
  const [errors, setErrors] = useState<Partial<Record<FoodField | "name" | "form", string>>>({});

  const save = () => {
    const next: typeof errors = {};
    const n = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const k of FOOD_FIELD_KEYS) {
      const r = validateFoodValue(k, values[k], mode === "food" && k === "calories");
      if ("error" in r) next[k] = r.error;
      else n[k] = r.value;
    }
    if (mode === "food" && !name.trim()) next.name = "Say what you ate";
    if (mode === "adjust" && !next.calories && FOOD_FIELD_KEYS.every((k) => n[k] === 0)) next.form = "Enter at least one amount to add or subtract";
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok =
      mode === "food"
        ? addFood({ name: name.trim().slice(0, 60), nutrition: n, source: "manual-food" })
        : addFood({
            name: sign > 0 ? "Added to today's totals" : "Subtracted from today's totals",
            nutrition: { calories: sign * n.calories, protein: sign * n.protein, carbs: sign * n.carbs, fat: sign * n.fat },
            source: "adjustment",
          });
    if (ok) onDone();
  };

  return (
    <div data-add-food={mode}>
      <div role="radiogroup" aria-label="What to do" className="grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1">
        {(
          [
            ["food", "Add food"],
            ["adjust", "Adjust totals"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            onClick={() => (setMode(id), setErrors({}))}
            className={`min-h-11 rounded-xl text-[14px] font-semibold ${mode === id ? "bg-surface text-ink shadow-card" : "text-ink-2"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "food" ? (
        <>
          <p className="mt-3 text-[13.5px] text-ink-3">Food you ate somewhere else. Use the values on the package or from your tracking app.</p>
          <label htmlFor={nameId} className="mt-3 block text-[12.5px] font-medium text-ink-3">
            What did you eat?
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={60}
            onChange={(e) => (setName(e.target.value), setErrors((p) => ({ ...p, name: undefined })))}
            placeholder="e.g. Chicken burrito"
            autoComplete="off"
            aria-invalid={!!errors.name}
            className={`mt-1 h-11 w-full rounded-xl border bg-surface px-3 text-[16px] outline-none focus:border-ink ${errors.name ? "border-warn" : "border-line"}`}
          />
          {errors.name && <p className="mt-1 text-[12px] font-medium text-warn">{errors.name}</p>}
        </>
      ) : (
        <>
          <p className="mt-3 text-[13.5px] text-ink-3">Correct today's totals, e.g. if you ate more or less than you logged.</p>
          <div role="radiogroup" aria-label="Add or subtract" className="mt-3 flex gap-2">
            {(
              [
                [1, "Add", "plus"],
                [-1, "Subtract", "minus"],
              ] as const
            ).map(([v, label, icon]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={sign === v}
                onClick={() => setSign(v)}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border text-[14px] font-semibold ${sign === v ? "border-ink bg-ink text-white" : "border-line text-ink-2"}`}
              >
                <Icon name={icon} size={15} /> {label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
        {FOOD_FIELD_KEYS.map((k) => (
          <FoodValue
            key={k}
            k={k}
            value={values[k]}
            error={errors[k]}
            onChange={(v) => (setValues((p) => ({ ...p, [k]: v })), setErrors((p) => ({ ...p, [k]: undefined, form: undefined })))}
          />
        ))}
      </div>
      {errors.form && <p className="mt-2 text-[12.5px] font-medium text-warn">{errors.form}</p>}
      <p className="mt-3 text-[12px] text-ink-3">{mode === "food" ? "Blank macros count as 0." : "Blank amounts count as 0."} You can remove it later from Today's log.</p>
      {/* Pinned to the bottom of the sheet (like the Filters footer), so it stays reachable on small phones. */}
      <div className="sticky -bottom-8 -mx-6 mt-4 -mb-8 border-t border-line-2 bg-surface px-6 pt-3 pb-8">
        <Button onClick={save} className="min-h-12">
          {mode === "food" ? "Add to today" : sign > 0 ? "Add to today's totals" : "Subtract from today's totals"}
        </Button>
      </div>
    </div>
  );
}

function FoodValue({ k, value, error, onChange }: { k: FoodField; value: string; error?: string; onChange: (v: string) => void }) {
  const id = useId();
  const f = FOOD_FIELDS[k];
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[12.5px] font-medium text-ink-3">
        {f.label}
      </label>
      <div className={`mt-1 flex h-11 items-center rounded-xl border bg-surface px-3 focus-within:border-ink ${error ? "border-warn" : "border-line"}`}>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="0"
          aria-invalid={!!error}
          className="tnum w-full min-w-0 bg-transparent text-[16px] font-semibold outline-none"
        />
        <span className="ml-1 text-[13px] text-ink-3">{f.unit}</span>
      </div>
      {error && <p className="mt-1 text-[12px] font-medium text-warn">{error}</p>}
    </div>
  );
}

const SOURCE_LABEL: Record<TodayEntry["source"], string> = {
  order: "Ordered in MacroTable",
  "counter-handoff": "Ordered at the counter",
  "manual-scan": "From a scanned menu",
  "manual-food": "Added by you",
  adjustment: "Adjustment",
};

/** Today's log: everything counted today, with Add food. The user's own entries can be removed. */
export function TodayLogPanel() {
  const { todayLog, removeFood } = useAppState();
  const { openCustom, close } = useSheet();
  const addFood = () => openCustom("Add food", <AddFoodPanel onDone={close} />, { stickyHeader: true });

  return (
    <div data-today-log>
      <p className="text-[13.5px] text-ink-3">Meals ordered in MacroTable, scanned-menu dishes you added, and food you added yourself.</p>
      <Button onClick={addFood} className="mt-3 min-h-12">
        <Icon name="plus" size={17} /> Add food
      </Button>
      <ul className="mt-4 divide-y divide-line-2" aria-label="Logged today">
        {todayLog.map((e) => (
          <EntryRow key={e.id} e={e} onRemove={e.removable ? () => removeFood(e.id) : undefined} />
        ))}
        {!todayLog.length && <li className="py-6 text-center text-[13.5px] text-ink-3">Nothing logged today yet.</li>}
      </ul>
    </div>
  );
}

function EntryRow({ e, onRemove }: { e: TodayEntry; onRemove?: () => void }) {
  const name = e.source === "order" ? (getMeal(e.mealId)?.meal.name ?? "Order") : (e.name ?? "Meal");
  return (
    <li className="flex items-start gap-3 py-3" data-entry-source={e.source}>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-[14px] font-semibold">{name}</span>
          <span className="tnum shrink-0 text-[12px] text-ink-3">{time(e.at)}</span>
        </p>
        {/* A scanned dish keeps its own provenance: estimated values stay marked ≈. */}
        <p className="tnum mt-0.5 text-[12.5px] text-ink-2">{e.source === "adjustment" ? signed(e.nutrition) : fmt(e.nutrition, e.provenance === "estimated")}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-3">{SOURCE_LABEL[e.source]}</p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </li>
  );
}
