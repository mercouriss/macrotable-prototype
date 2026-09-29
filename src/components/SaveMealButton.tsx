import { isSaved, toggleSaved, useSavedMeals } from "../lib/saved";
import { useAppState } from "../state/AppState";
import type { Selections } from "../types";
import { Icon } from "./Icon";

/** Save / unsave this exact configuration. Not shown during research trials. */
export function SaveMealButton({ mealId, selections, className = "" }: { mealId: string; selections: Selections; className?: string }) {
  const { lock } = useAppState();
  useSavedMeals(); // re-render on change
  if (lock) return null;
  const saved = isSaved(mealId, selections);
  return (
    <button
      type="button"
      onClick={() => toggleSaved(mealId, selections)}
      aria-pressed={saved}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${saved ? "bg-brand-soft text-brand" : "border border-line bg-surface text-ink-2 hover:bg-sunken"} ${className}`}
    >
      <Icon name="heart" size={15} stroke={2.2} className={saved ? "fill-current" : ""} />
      {saved ? "Saved" : "Save meal"}
    </button>
  );
}
