import type { IntegrationLevel, Restaurant } from "../types";
import { distanceFromUser, formatDistance } from "../data/geo";
import { Icon } from "./Icon";
import { useSheet } from "./Sheet";

export const LEVEL_META: Record<
  IntegrationLevel,
  { short: string; title: string; detail: (r?: string) => string; data: string[]; can: string[] }
> = {
  3: {
    short: "Demo partner",
    title: "Demo partner (simulated integration)",
    detail: (r) =>
      `${r ?? "This restaurant"} is a fictional demo brand showing the deepest integration level: shared recipes, ingredient quantities and chef-approved modification rules, so MacroTable can configure dishes at recipe level and send a kitchen ticket. All of it is simulated.`,
    data: ["Verified recipes", "Ingredient quantities", "Chef-approved modifiers"],
    can: ["Optimise at recipe level", "Configure", "Send kitchen ticket"],
  },
  2: {
    short: "Demo integration",
    title: "Structured integration (simulated)",
    detail: (r) =>
      `${r ?? "This restaurant"} is a fictional demo brand showing a structured-menu integration: published nutrition and supported modifiers, so MacroTable can filter, optimise within those modifiers and create an order. All of it is simulated.`,
    data: ["Structured menu", "Official nutrition", "Supported modifiers"],
    can: ["Filter", "Optimise", "Configure", "Create order"],
  },
  1: {
    short: "Not integrated",
    title: "Not integrated (demo)",
    detail: (r) =>
      `${r ?? "This restaurant"} is a fictional demo brand showing an unaffiliated restaurant: nutrition is estimated from its menu and no modifications can be sent. MacroTable can recommend a dish and hand you off to order it at the counter.`,
    data: ["Public, unstructured menu", "No modifier data"],
    can: ["Recommend", "Estimate", "Hand off"],
  },
};

export function RestaurantBadge({ restaurant, size = "md" }: { restaurant: Restaurant; size?: "sm" | "md" }) {
  const { openLevel, openCustom } = useSheet();
  const lvl = restaurant.integrationLevel;
  if (restaurant.identity === "real") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openCustom(`${restaurant.name} is a real restaurant`, <RealRestaurantInfo restaurant={restaurant} />);
        }}
        aria-label={`${restaurant.name}: real restaurant, not affiliated with MacroTable. Learn more`}
        className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-3/50 bg-surface font-medium text-ink-2 hover:bg-sunken ${size === "sm" ? "min-h-6 px-2 text-[11px]" : "min-h-7 px-2.5 text-[12px]"}`}
      >
        <Icon name="pin" size={12} /> Real · not affiliated
      </button>
    );
  }
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
      <span className="rounded bg-sunken px-1 text-[9.5px] font-bold tracking-[0.06em] text-ink-3">DEMO</span>
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

/** Distance from the demo location; (simulated) pickup time only for demo brands. */
export function DeliveryTime({ restaurant }: { restaurant: Restaurant }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-3">
      <Icon name="compass" size={13} />
      {formatDistance(distanceFromUser(restaurant.location))}
      {restaurant.pickupMinutes ? ` · pickup ~${restaurant.pickupMinutes} min (simulated)` : ""}
    </span>
  );
}

/** What is (and is not) real about a real restaurant shown in the prototype. */
export function RealRestaurantInfo({ restaurant }: { restaurant: Restaurant }) {
  const r = restaurant.real!;
  return (
    <div className="space-y-3 text-[14px] leading-relaxed">
      <p>
        <strong>Real:</strong> the name and location ({r.addressLine}), verified on {r.verifiedOn} ({r.sources.join("; ")}).
      </p>
      <p>
        <strong>Not claimed:</strong> {restaurant.name} is <strong>not affiliated with MacroTable</strong>. This prototype has no menu, prices,
        nutrition, opening hours or ordering for it.
      </p>
      <p>MacroTable can only help here if you photograph the menu. The result is then labelled MENU-READ or ESTIMATED.</p>
      <p>
        <a href={r.website} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">
          Visit {restaurant.name}'s own website ↗
        </a>
      </p>
    </div>
  );
}
