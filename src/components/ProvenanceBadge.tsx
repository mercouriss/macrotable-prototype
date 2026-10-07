import { PROVENANCE_LABEL } from "../lib/provenance";
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
    /** `trial`: research trials keep their frozen wording. */
    sheetBody: (restaurant?: string, trial?: boolean) => string[];
  }
> = {
  verified: {
    label: PROVENANCE_LABEL.verified,
    sub: "Simulated partner data",
    icon: "check",
    chip: "bg-verified-soft text-verified",
    sheetTitle: "Demo verified data (simulated)",
    sheetBody: (r, trial) => [
      `${r ?? "This restaurant"} is a fictional demo partner. Its recipes, modifications and nutrition are simulated to show what recipe-level data from a verified MacroTable partner would look like.`,
      trial
        ? "MacroTable calculates nutrition from the configured ingredients — no restaurant has verified these numbers."
        : "MacroTable calculates nutrition from the configured ingredients. No restaurant has verified these numbers.",
      "In a real product, verified data would still vary with actual preparation.",
    ],
  },
  official: {
    label: PROVENANCE_LABEL.official,
    sub: "Simulated published data",
    icon: "building",
    chip: "bg-official-soft text-official",
    sheetTitle: "Demo official data (simulated)",
    sheetBody: (r) => [
      `${r ?? "This restaurant"} is a fictional demo brand. Its "published" nutrition and modifier values are simulated to show a structured-menu integration.`,
      "At this level MacroTable has no recipe detail, so it can only combine the published values.",
      "A plain OFFICIAL label would be used only for data genuinely published by a real restaurant (none in this prototype).",
    ],
  },
  "menu-read": {
    label: "MENU-READ",
    sub: "Printed on the menu",
    icon: "camera",
    chip: "bg-menuread-soft text-menuread",
    sheetTitle: "Read from the menu",
    sheetBody: (_r, trial) => [
      "These values were printed on the menu you photographed and read by the MacroAgent's vision model.",
      trial
        ? "They are what the menu states — not verified by the restaurant or MacroTable. Reading errors are possible, so check the menu itself."
        : "They are what the menu states, not verified by the restaurant or MacroTable. Reading errors are possible, so check the menu itself.",
      trial ? "MacroTable can't request modifications here; order at the counter." : "MacroTable can't request modifications here, so order at the counter.",
    ],
  },
  estimated: {
    label: "ESTIMATED",
    sub: "Menu-based estimate",
    icon: "alert",
    chip: "bg-estimated-soft text-estimated",
    sheetTitle: "Estimated nutrition",
    sheetBody: (r, trial) => [
      trial
        ? "Nutrition was estimated — from a public menu, or inferred by the vision model from a scanned dish description. It was not printed on the menu or verified."
        : "Nutrition was estimated from a public menu, or inferred by the vision model from a scanned dish description. It was not printed on the menu or verified.",
      `It is not verified by ${r ?? "the restaurant"} and may differ from the actual meal.`,
      trial
        ? "Because the restaurant isn't integrated, MacroTable can't request modifications here — only recommend and hand off."
        : "Because the restaurant isn't integrated, MacroTable can't request modifications here. It can only recommend and hand off.",
    ],
  },
  insufficient: {
    label: "INSUFFICIENT",
    sub: "Not enough information",
    icon: "ban",
    chip: "bg-insufficient-soft text-insufficient",
    sheetTitle: "Not enough information",
    sheetBody: (r) => [
      `There isn't enough reliable information about this dish${r ? ` at ${r}` : ""} to estimate its nutrition.`,
      "MacroTable never recommends a dish it can't assess. Ask the restaurant, or choose another dish.",
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
