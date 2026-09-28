import type { IntegrationLevel, Restaurant } from "../types";
import { Icon } from "./Icon";
import { useSheet } from "./Sheet";

export const LEVEL_META: Record<
  IntegrationLevel,
  { short: string; title: string; detail: (r?: string) => string; data: string[]; can: string[] }
> = {
  3: {
    short: "MacroTable partner",
    title: "Verified MacroTable partner",
    detail: (r) =>
      `${r ?? "This restaurant"} shares verified recipes, ingredient quantities and chef-approved modification rules. MacroTable can configure the dish at recipe level and send a kitchen ticket.`,
    data: ["Verified recipes", "Ingredient quantities", "Chef-approved modifiers"],
    can: ["Optimise at recipe level", "Configure", "Send kitchen ticket"],
  },
  2: {
    short: "Integrated menu",
    title: "Structured integration",
    detail: (r) =>
      `${r ?? "This restaurant"} provides a structured menu, official nutrition and the modifiers it supports. MacroTable can filter, optimise within those modifiers and create an order.`,
    data: ["Structured menu", "Official nutrition", "Supported modifiers"],
    can: ["Filter", "Optimise", "Configure", "Create order"],
  },
  1: {
    short: "Not integrated",
    title: "Estimated · unaffiliated",
    detail: (r) =>
      `${r ?? "This restaurant"} isn't connected to MacroTable. Nutrition is estimated from its public menu and no modifications can be sent. MacroTable can recommend a dish and hand you off to order it as listed.`,
    data: ["Public, unstructured menu", "No modifier data"],
    can: ["Recommend", "Estimate", "Hand off"],
  },
};

export function RestaurantBadge({ restaurant, size = "md" }: { restaurant: Restaurant; size?: "sm" | "md" }) {
  const { openLevel } = useSheet();
  const lvl = restaurant.integrationLevel;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openLevel(lvl, restaurant.name);
      }}
      aria-label={`Integration level ${lvl}: ${LEVEL_META[lvl].short}. Learn more`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface text-ink-2 hover:bg-sunken ${
        size === "sm" ? "min-h-6 px-2 text-[11px]" : "min-h-7 px-2.5 text-[12px]"
      } font-medium`}
    >
      <LevelDots level={lvl} />
      {LEVEL_META[lvl].short}
    </button>
  );
}

export function LevelDots({ level }: { level: IntegrationLevel }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-[3px] rounded-full ${i <= level ? "bg-ink-2" : "bg-line"}`} style={{ height: 4 + i * 2.5 }} />
      ))}
    </span>
  );
}

export function DeliveryTime({ restaurant }: { restaurant: Restaurant }) {
  if (!restaurant.estimatedDeliveryMinutes) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3">
      <Icon name="clock" size={13} />
      {restaurant.estimatedDeliveryMinutes} min
    </span>
  );
}
