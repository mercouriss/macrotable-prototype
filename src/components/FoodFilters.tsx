import { catalog, menuRestaurants } from "../data/restaurants";
import { activeCount, CUISINES, DISH_TYPES, matchRestaurant, NO_FOOD_FILTER, type Discovery, type ExploreShow, type FoodFilter } from "../lib/discovery";
import { useAppState } from "../state/AppState";
import { FoodIcon } from "./FoodIcon";
import { Icon } from "./Icon";
import { Button, Eyebrow } from "./ui";

/** Explore's views (single choice) — the same options the old chip row offered. */
export const SHOW_LABELS: Record<ExploreShow, string> = {
  all: "All",
  fit: "Best macro fit",
  protein: "High protein",
  budget: "Within budget",
  veg: "Vegetarian",
  demo: "MacroTable Demo",
  real: "Real restaurants",
};

/** Restaurants each chip would match on its own (chips with none are hidden: only what the data supports). */
function chipCounts(mode: "explore" | "meal") {
  const pool = mode === "explore" ? catalog() : menuRestaurants();
  // Find My Next Meal counts only restaurants with an actual matching dish (it optimises dishes, not labels).
  const count = (f: FoodFilter) =>
    pool.filter((r) => {
      const m = matchRestaurant(r, "", f);
      return m.match && (mode === "explore" || !f.dishes.length || m.dishes.length > 0);
    }).length;
  return {
    cuisines: CUISINES.map((c) => ({ ...c, n: count({ cuisines: [c.id], dishes: [] }) })).filter((c) => c.n > 0),
    dishes: DISH_TYPES.map((t) => ({ ...t, n: count({ cuisines: [], dishes: [t.id] }) })).filter((t) => t.n > 0),
  };
}

function Chip({ on, label, n, onClick, role, icon }: { on: boolean; label: string; n?: number; onClick: () => void; role: "radio" | "checkbox"; icon?: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border ${icon ? "pl-1.5" : "pl-4"} pr-4 text-[14px] font-medium transition-colors ${
        on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:bg-sunken"
      }`}
    >
      {icon && <FoodIcon id={icon} size={32} />}
      {on && <Icon name="check" size={14} stroke={2.6} />}
      {label}
      {n !== undefined && <span className={`tnum text-[12px] ${on ? "text-white/70" : "text-ink-3"}`}>{n}</span>}
    </button>
  );
}

/**
 * The Filters bottom sheet (rendered inside the app's Sheet). Food intent first: Explore = Dish type + Cuisine +
 * Show, ending in "Show N restaurants"; Find My Next Meal = Dish type + Cuisine ("What do you feel like?"), "Done".
 * Choices apply immediately to the shared discovery state; the footer stays in view while the chips scroll.
 */
export function FoodFiltersPanel({ mode, count, onDone, hideReal }: { mode: "explore" | "meal"; count?: (d: Discovery) => number; onDone: () => void; hideReal?: boolean }) {
  const { discovery, setDiscovery } = useAppState();
  const { food, show } = discovery;
  const chips = chipCounts(mode);
  const toggle = (key: keyof FoodFilter, id: string) =>
    setDiscovery({ food: { ...food, [key]: food[key].includes(id) ? food[key].filter((x) => x !== id) : [...food[key], id] } });
  const total = activeCount(food) + (mode === "explore" && show !== "all" ? 1 : 0);
  const n = count?.(discovery);

  return (
    <div data-food-filters={mode}>
      {mode === "meal" && <p className="-mt-1 mb-1 text-[14px] text-ink-3">Only matching dishes are considered. Your targets, budget and diet still apply.</p>}
      <section className={mode === "meal" ? "mt-4" : "mt-1"} aria-labelledby="ff-dish">
        <Eyebrow>
          <span id="ff-dish">Dish type</span>
        </Eyebrow>
        <div role="group" aria-labelledby="ff-dish" className="mt-2 flex flex-wrap gap-2">
          {chips.dishes.map((t) => (
            <Chip key={t.id} role="checkbox" on={food.dishes.includes(t.id)} label={t.label} n={t.n} icon={t.id} onClick={() => toggle("dishes", t.id)} />
          ))}
        </div>
      </section>
      <section className="mt-5" aria-labelledby="ff-cuisine">
        <Eyebrow>
          <span id="ff-cuisine">Cuisine</span>
        </Eyebrow>
        <div role="group" aria-labelledby="ff-cuisine" className="mt-2 flex flex-wrap gap-2">
          {chips.cuisines.map((c) => (
            <Chip key={c.id} role="checkbox" on={food.cuisines.includes(c.id)} label={c.label} n={c.n} onClick={() => toggle("cuisines", c.id)} />
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">Numbers are restaurants. Dish types come from each menu's own dish names.</p>
      </section>
      {mode === "explore" && (
        <section className="mt-5" aria-labelledby="ff-show">
          <Eyebrow>
            <span id="ff-show">Show</span>
          </Eyebrow>
          <div role="radiogroup" aria-labelledby="ff-show" className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(SHOW_LABELS) as ExploreShow[])
              .filter((s) => !(hideReal && s === "real"))
              .map((s) => (
                <Chip key={s} role="radio" on={show === s} label={SHOW_LABELS[s]} onClick={() => setDiscovery({ show: s })} />
              ))}
          </div>
        </section>
      )}
      <div className="sticky -bottom-8 -mx-6 mt-5 -mb-8 grid grid-cols-[auto_1fr] items-center gap-3 border-t border-line-2 bg-surface px-6 pt-3 pb-8">
        <button
          type="button"
          onClick={() => setDiscovery(mode === "explore" ? { food: NO_FOOD_FILTER, show: "all" } : { food: NO_FOOD_FILTER })}
          disabled={total === 0}
          className="min-h-11 rounded-full px-3 text-[14px] font-semibold text-ink-2 hover:bg-sunken disabled:text-ink-3/60 disabled:hover:bg-transparent"
        >
          Clear all
        </button>
        <Button onClick={onDone} className="min-h-12">
          {mode === "explore" ? `Show ${n ?? 0} ${n === 1 ? "restaurant" : "restaurants"}` : "Done"}
        </Button>
      </div>
    </div>
  );
}
