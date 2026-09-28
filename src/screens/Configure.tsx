import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ModifierSelector } from "../components/ModifierSelector";
import { approx, ProvenanceBadge } from "../components/ProvenanceBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Button, Callout, Card, Eyebrow } from "../components/ui";
import { euro, euroShort, signed, signedEuro } from "../lib/format";
import { changesFromDefault } from "../lib/nutrition";
import { useAppState } from "../state/AppState";
import { useMealSelection } from "../state/useMealSelection";
import { NotFound } from "./NotFound";

/** Screen 6 — the core product screen: original dish → MacroTable version, live and deterministic. */
export function Configure() {
  const { mealId } = useParams();
  const [params] = useSearchParams();
  const editing = params.get("edit") === "1";
  const navigate = useNavigate();
  const { target, setOption, resetSelection, log } = useAppState();
  const { openProvenance } = useSheet();
  const { found, config, selections, isRecommended, meets, inBudget } = useMealSelection(mealId);

  if (!found) return <NotFound />;
  const { meal, restaurant } = found;
  if (!config || restaurant.integrationLevel === 1) return <Navigate to={`/macrotable/meal/${meal.id}`} replace />;

  const base = meal.nutrition!;
  const n = config.nutrition;
  const changes = changesFromDefault(meal, selections);
  const ap = approx(meal.provenance);

  const onChange = (groupId: string, optionId: string) => {
    setOption(groupId, optionId);
    log("modifier_changed", { mealId: meal.id, detail: { groupId, optionId } });
  };

  const stat = (label: string, value: number, baseValue: number, unit: string) => (
    <div>
      <dt className="text-[11.5px] font-medium text-ink-3">{label}</dt>
      <dd className="tnum text-[20px] leading-tight font-semibold tracking-tight">
        {ap}
        {value}
        <span className="ml-0.5 text-[12px] font-medium text-ink-3">{unit}</span>
      </dd>
      <dd className="tnum text-[11.5px] text-ink-3">{value === baseValue ? "unchanged" : signed(value - baseValue, unit === "kcal" ? "" : " g")}</dd>
    </div>
  );

  return (
    <Screen
      title="Configuration"
      back={`/macrotable/meal/${meal.id}`}
      footer={
        <div className="space-y-2">
          {!inBudget && (
            <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-warn">
              <Icon name="alert" size={15} /> {euro(config.price)} is over your {euroShort(target.maxBudget)} budget — adjust a modifier.
            </p>
          )}
          <Button disabled={!inBudget} onClick={() => navigate("/macrotable/review")}>
            Review order
          </Button>
        </div>
      }
    >
      <Card className="mt-1 p-4">
        <Eyebrow>Original</Eyebrow>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <p className="text-[16px] font-semibold">{meal.name}</p>
          <p className="tnum text-[14px] font-medium text-ink-2">{euro(meal.price)}</p>
        </div>
        <p className="tnum mt-0.5 text-[13.5px] text-ink-3">
          {ap}
          {base.calories} kcal · {base.protein} g protein · {base.carbs} g carbs · {base.fat} g fat
        </p>
      </Card>

      <div className="my-2 flex justify-center text-ink-3" aria-hidden="true">
        <Icon name="chevronDown" size={20} />
      </div>

      <Card as="section" className="p-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow tone={isRecommended ? "brand" : "muted"}>{isRecommended ? "MacroTable version" : "Your version"}</Eyebrow>
          {!isRecommended && (
            <button onClick={resetSelection} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold text-brand hover:bg-brand-soft">
              <Icon name="refresh" size={14} /> Reset to MacroTable's
            </button>
          )}
        </div>
        <p className="mt-1 text-[13px] text-ink-3">Tap a row to change it. Only options {restaurant.name} supports are shown.</p>
        <div className="mt-2">
          <ModifierSelector
            key={meal.id}
            meal={meal}
            selections={selections}
            onChange={onChange}
            defaultOpen={editing ? meal.modifierGroups[0]?.id : undefined}
          />
        </div>
      </Card>

      <Card as="section" className="mt-3 p-5" >
        <div className="flex items-center justify-between">
          <Eyebrow>New total</Eyebrow>
          <ProvenanceBadge provenance={meal.provenance} restaurantName={restaurant.name} size="sm" />
        </div>
        <dl className="mt-3 grid grid-cols-4 gap-2" aria-live="polite">
          {stat("Calories", n.calories, base.calories, "kcal")}
          {stat("Protein", n.protein, base.protein, "g")}
          {stat("Carbs", n.carbs, base.carbs, "g")}
          {stat("Fat", n.fat, base.fat, "g")}
        </dl>
        <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-3">
          <span className="text-[13.5px] text-ink-2">Price</span>
          <span className="tnum text-[20px] font-semibold tracking-tight">
            {euro(config.price)}
            {config.price !== meal.price && <span className="ml-1.5 text-[12px] font-medium text-ink-3">{signedEuro(config.price - meal.price)}</span>}
          </span>
        </div>
        <ul className="mt-3 space-y-1.5 text-[13.5px]">
          <li className="flex items-center gap-2 text-ink-2">
            <Icon name="check" size={15} stroke={2.4} className="text-brand" />
            {changes.length ? `All ${changes.length} modifications supported by ${restaurant.name}` : "No modifications — dish as listed"}
          </li>
          <li className={`flex items-center gap-2 ${meets ? "text-ink-2" : "text-warn"}`}>
            <Icon name={meets ? "check" : "alert"} size={15} stroke={2.4} className={meets ? "text-brand" : ""} />
            {meets
              ? `Within your target: ${target.calories} kcal ±10%, ≥${target.protein} g protein`
              : n.protein < target.protein
                ? `${target.protein - n.protein} g short of your protein target`
                : `Outside your ${target.calories} kcal ±10% range`}
          </li>
        </ul>
      </Card>

      {!inBudget && (
        <div className="mt-3">
          <Callout tone="warn" title="Over budget">
            This configuration costs {euro(config.price)}, above your {euroShort(target.maxBudget)} limit. MacroTable won't send it.
          </Callout>
        </div>
      )}

      <button
        onClick={() => openProvenance(meal.provenance, restaurant.name)}
        className="mt-4 mb-6 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline"
      >
        <Icon name="info" size={16} />
        How was this calculated?
      </button>
    </Screen>
  );
}
