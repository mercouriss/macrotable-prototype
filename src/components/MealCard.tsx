import { euro } from "../lib/format";
import { changesFromDefault } from "../lib/nutrition";
import { customizationStatus, fitReasons } from "../lib/optimizer";
import type { Configuration, UserTarget } from "../types";
import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";
import { MacroFit } from "./MacroFit";
import { Plate } from "./Plate";
import { approx, ProvenanceBadge } from "./ProvenanceBadge";
import { RestaurantBadge } from "./RestaurantBadge";
import { ReasonLine } from "./ui";

export function CustomizationLine({ config }: { config: Configuration }) {
  const status = customizationStatus(config);
  const n = changesFromDefault(config.meal, config.selections).length;
  if (status === "handoff")
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
        <Icon name="handoff" size={15} /> Hand-off only · no modifications possible
      </span>
    );
  if (status === "customized")
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
        <Icon name="sliders" size={15} /> Customizable · {n} supported {n === 1 ? "change" : "changes"} applied
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <Icon name="sliders" size={15} /> Customizable · works as listed
    </span>
  );
}

export function MealCard({
  config,
  target,
  label,
  highlight = false,
  onSelect,
  meets,
}: {
  config: Configuration;
  target: UserTarget;
  label?: string;
  highlight?: boolean;
  onSelect: () => void;
  meets: boolean;
}) {
  const { meal, restaurant, nutrition, price } = config;
  const ap = approx(meal.provenance);
  const reasons = fitReasons(config, target).slice(0, 3);
  return (
    <article
      className={`animate-rise rounded-[24px] border bg-surface p-5 shadow-card ${highlight ? "border-brand/35 ring-1 ring-brand/15" : "border-line-2"}`}
    >
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] ${
              highlight ? "bg-brand text-white" : "bg-sunken text-ink-2"
            }`}
          >
            {label}
          </span>
        ) : (
          <span />
        )}
        <ProvenanceBadge provenance={meal.provenance} restaurantName={restaurant.name} size="sm" />
      </div>

      <div className="mt-4 flex items-start gap-3.5">
        <Plate palette={meal.palette} size={60} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] leading-tight font-semibold tracking-tight">{meal.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2">
              <BrandMark restaurant={restaurant} size={18} />
              {restaurant.name}
            </span>
            <RestaurantBadge restaurant={restaurant} size="sm" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p className="tnum text-[16px] font-semibold">
          {ap}
          {nutrition.calories} kcal <span className="text-ink-3">·</span> {ap}
          {nutrition.protein} g protein
        </p>
        <p className="tnum text-[18px] font-semibold tracking-tight">{euro(price)}</p>
      </div>
      <div className="mt-2.5">
        <MacroFit nutrition={nutrition} target={target} provenance={meal.provenance} compact />
      </div>

      <div className="mt-3">
        <CustomizationLine config={config} />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[12px] font-semibold text-ink">{meets ? "Why it fits" : "How close it gets"}</p>
        <ul className="space-y-1.5">
          {reasons.map((r) => (
            <ReasonLine key={r.text} tone={r.tone}>
              {r.text}
            </ReasonLine>
          ))}
        </ul>
      </div>

      <button
        onClick={onSelect}
        className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold transition-colors ${
          highlight ? "bg-brand text-white hover:bg-brand-hover" : "border border-line bg-surface text-ink hover:bg-sunken"
        }`}
        aria-label={`View order: ${meal.name} from ${restaurant.name}`}
      >
        {highlight ? "See recommendation" : "View"} <Icon name="arrowRight" size={17} />
      </button>
    </article>
  );
}
