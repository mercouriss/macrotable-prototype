import type { Provenance } from "../types";
import { Icon, type IconName } from "./Icon";
import { useSheet } from "./Sheet";

export const PROVENANCE_META: Record<
  Provenance,
  {
    label: string;
    sub: string;
    icon: IconName;
    chip: string;
    sheetTitle: string;
    sheetBody: (restaurant?: string) => string[];
  }
> = {
  verified: {
    label: "VERIFIED",
    sub: "Recipe-level data",
    icon: "check",
    chip: "bg-verified-soft text-verified",
    sheetTitle: "Verified recipe",
    sheetBody: (r) => [
      `${r ?? "This restaurant"} provides MacroTable with recipe and supported modification information.`,
      "MacroTable calculates nutrition from the configured ingredients.",
      "Actual preparation may vary. Verified describes where the data comes from — it is not a guarantee of exact real-world values.",
    ],
  },
  official: {
    label: "OFFICIAL",
    sub: "Restaurant nutrition",
    icon: "building",
    chip: "bg-official-soft text-official",
    sheetTitle: "Official restaurant nutrition",
    sheetBody: (r) => [
      `Nutrition values are based on information published by ${r ?? "the restaurant"}, including the published values of each supported modification.`,
      "MacroTable has no recipe-level detail for this restaurant, so it can only combine the published values.",
      "Actual preparation may vary.",
    ],
  },
  estimated: {
    label: "ESTIMATED",
    sub: "Menu-based estimate",
    icon: "alert",
    chip: "bg-estimated-soft text-estimated",
    sheetTitle: "Estimated nutrition",
    sheetBody: (r) => [
      "Nutrition was estimated from available menu information.",
      `It is not verified by ${r ?? "the restaurant"} and may differ from the actual meal.`,
      "Because the restaurant isn't integrated, MacroTable can't request modifications here — only recommend and hand off.",
    ],
  },
};

/** Provenance is always shown as icon + text (never colour alone) and opens its explanation. */
export function ProvenanceBadge({
  provenance,
  restaurantName,
  showSub = false,
  size = "md",
}: {
  provenance: Provenance;
  restaurantName?: string;
  showSub?: boolean;
  size?: "sm" | "md";
}) {
  const { openProvenance } = useSheet();
  const m = PROVENANCE_META[provenance];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openProvenance(provenance, restaurantName);
      }}
      aria-label={`${m.label} nutrition: ${m.sub}. Show how this was calculated`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full text-left transition-opacity hover:opacity-85 ${m.chip} ${
        size === "sm" ? "min-h-7 px-2.5 py-1" : "min-h-8 px-3 py-1.5"
      }`}
    >
      <Icon name={m.icon} size={size === "sm" ? 12 : 13} stroke={2.6} />
      <span className={`font-bold tracking-[0.06em] ${size === "sm" ? "text-[10.5px]" : "text-[11px]"}`}>{m.label}</span>
      {showSub && <span className="text-[12px] font-medium opacity-80">· {m.sub}</span>}
      <Icon name="info" size={size === "sm" ? 12 : 13} className="opacity-60" />
    </button>
  );
}

/** "≈" prefix for estimated numbers so estimates never read as measured values. */
export const approx = (p: Provenance) => (p === "estimated" ? "≈ " : "");
