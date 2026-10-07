import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import type { ServiceMode } from "../types";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { MacroFit } from "../components/MacroFit";
import { PaymentSheet, type PaymentMethod } from "../components/PaymentSheet";
import { Plate } from "../components/Plate";
import { approx, ProvenanceBadge } from "../components/ProvenanceBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Button, Callout, Card } from "../components/ui";
import { euro } from "../lib/format";
import { fulfilmentLabel, needsTable, normalizeTable, offersDineIn, TABLES } from "../lib/fulfillment";
import { changesFromDefault, describeChange } from "../lib/nutrition";
import { useAppState } from "../state/AppState";
import { useMealSelection } from "../state/useMealSelection";

/** Screen 8 — explicit approval. Nothing is ordered automatically. */
export function Review() {
  const { selection, placeOrder, target, prefs, lock, dining, setDining } = useAppState();
  const navigate = useNavigate();
  const { openCustom, close } = useSheet();
  const { found, config, inBudget } = useMealSelection(selection?.mealId);
  const [mode, setMode] = useState<ServiceMode>("pickup");

  if (!found || !config) return <Navigate to="/macrotable" replace />;
  const { meal, restaurant } = found;
  const handoff = restaurant.integrationLevel === 1;
  const changes = changesFromDefault(meal, config.selections);
  const ap = approx(meal.provenance);

  // Normal mode at a table-service restaurant: "Dine in" (with a table) or "Pickup", remembered per restaurant.
  // Trials and quick-service restaurants keep the original Pickup / Eat in-store choice below.
  const dineInFlow = !lock && !handoff && offersDineIn(restaurant);
  const choice = dineInFlow && dining?.restaurantId === restaurant.id ? dining : null;
  const orderMode: ServiceMode = dineInFlow ? (choice?.mode ?? "pickup") : mode;
  const table = orderMode === "in-store" ? (normalizeTable(choice?.table) ?? undefined) : undefined;
  const tableMissing = needsTable(restaurant, orderMode, !!lock) && !table;

  const placed = selection?.placedOrderNumber;
  const confirm = (payment?: PaymentMethod) => {
    const result = placeOrder(orderMode, undefined, { table });
    if (!result) return;
    if (result.research) navigate("/experiment/done", { replace: true, state: { completed: true } });
    else navigate(`/macrotable/success/${result.order.orderNumber}`, { replace: true, state: payment ? { fresh: true, payment } : { fresh: true } });
  };
  // Normal mode: choose a (simulated) payment method first; nothing is ordered until "Place simulated order".
  // Research trials and hand-offs approve directly, exactly as before.
  const approve =
    lock || handoff
      ? () => confirm()
      : () =>
          openCustom(
            "Payment",
            <PaymentSheet
              mode={orderMode}
              total={config.price}
              onBack={close}
              onConfirm={(m) => {
                close();
                confirm(m);
              }}
            />,
            { stickyHeader: true },
          );

  return (
    <Screen
      title="Review order"
      back={handoff ? `/macrotable/meal/${meal.id}` : `/macrotable/configure/${meal.id}`}
      footer={
        <div className="space-y-2">
          {placed ? (
            <>
              <Button disabled aria-disabled="true" icon="check" variant="secondary">
                Order completed
              </Button>
              <Link to={handoff ? `/macrotable/success/${placed}` : `/macrotable/ticket/${placed}`} className="flex min-h-10 items-center justify-center text-[13.5px] font-semibold text-brand">
                View order {placed}
              </Link>
            </>
          ) : (
            <Button disabled={!inBudget || tableMissing} onClick={approve} icon={handoff ? "handoff" : "check"}>
              {handoff ? "Approve hand-off summary" : tableMissing ? "Choose your table to approve" : "Approve order"}
            </Button>
          )}
          <p className="text-center text-[12.5px] text-ink-3">Nothing is ordered until you approve · simulated, no payment</p>
        </div>
      }
    >
      <h2 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em]">{handoff ? "Ready to hand off" : "Ready to order"}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-2">
        <BrandMark restaurant={restaurant} size={20} /> {restaurant.name} · {handoff ? "order at the counter" : dineInFlow ? "dine in or pickup" : "pickup or in-store"}
      </p>

      <Card className="mt-5 p-5">
        <div className="flex items-center gap-3.5">
          <Plate palette={meal.palette} size={52} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-3">{restaurant.name}</p>
            <p className="text-[18px] leading-tight font-semibold tracking-tight">{meal.name}</p>
          </div>
        </div>

        {changes.length > 0 ? (
          <ul className="mt-4 space-y-1.5 border-t border-line-2 pt-4">
            {changes.map((c) => (
              <li key={c.group.id} className="flex items-center gap-2 text-[15px]">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                {describeChange(c)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-line-2 pt-4 text-[14px] text-ink-2">{lock ? "As listed — no modifications." : "As listed, no modifications."}</p>
        )}

        <div className="mt-4 flex items-end justify-between border-t border-line-2 pt-4">
          <p className="tnum text-[15px] font-semibold">
            {ap}
            {config.nutrition.calories} kcal <span className="text-ink-3">|</span> {ap}
            {config.nutrition.protein} g protein
          </p>
          <p className="tnum text-[22px] font-semibold tracking-tight">{euro(config.price)}</p>
        </div>
        <p className="tnum mt-0.5 text-[12.5px] text-ink-3">
          {ap}
          {config.nutrition.carbs} g carbs · {ap}
          {config.nutrition.fat} g fat
        </p>
        <div className="mt-4 border-t border-line-2 pt-4">
          <MacroFit nutrition={config.nutrition} target={target} prefs={prefs} provenance={meal.provenance} compact />
        </div>
        <div className="mt-4">
          <ProvenanceBadge provenance={meal.provenance} restaurantName={restaurant.name} showSub size="sm" />
        </div>
      </Card>

      {dineInFlow && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">How will you eat?</legend>
          <div role="radiogroup" aria-label="Dining option" className="grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1">
            {(
              [
                ["in-store", "Dine in"],
                ["pickup", `Pickup · ~${restaurant.pickupMinutes} min`],
              ] as [ServiceMode, string][]
            )
              .filter(([m]) => restaurant.serviceModes.includes(m))
              .map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={orderMode === m}
                  onClick={() => setDining({ restaurantId: restaurant.id, mode: m, table: choice?.table })}
                  className={`min-h-11 rounded-xl text-[13.5px] font-semibold ${orderMode === m ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
                >
                  {label}
                </button>
              ))}
          </div>
          {orderMode === "in-store" && (
            <label className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
              <span className="text-[14.5px] font-semibold">Your table</span>
              <select
                aria-label="Your table"
                value={table ?? ""}
                onChange={(e) => setDining({ restaurantId: restaurant.id, mode: "in-store", table: e.target.value || undefined })}
                className="min-h-11 rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold text-ink"
              >
                <option value="">Choose…</option>
                {TABLES.map((t) => (
                  <option key={t} value={t}>
                    Table {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p data-fulfilment className="mt-3 text-center text-[12.5px] font-semibold tracking-[0.08em] text-ink-2">
            {tableMissing ? "DINE IN · CHOOSE YOUR TABLE" : fulfilmentLabel({ serviceMode: orderMode, table })}
          </p>
        </fieldset>
      )}

      {!handoff && !dineInFlow && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">How will you get it?</legend>
          <div role="radiogroup" aria-label="Order type" className="grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1">
            {(
              [
                ["pickup", `Pickup · ~${restaurant.pickupMinutes} min`],
                ["in-store", "Eat in-store"],
              ] as [ServiceMode, string][]
            )
              .filter(([m]) => restaurant.serviceModes.includes(m))
              .map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`min-h-11 rounded-xl text-[13.5px] font-semibold ${mode === m ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
                >
                  {label}
                </button>
              ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 mb-6 space-y-3">
        {handoff ? (
          <Callout tone="estimated" title="Hand-off, not a direct order" icon="handoff">
            {restaurant.name} isn't integrated. MacroTable prepares a summary you can show at the counter to order it as listed.
            No modifications are requested.
          </Callout>
        ) : (
          <p className="flex gap-2 px-1 text-[13px] leading-snug text-ink-3">
            <Icon name="info" size={16} className="mt-px shrink-0" />
            Nutrition information may vary with actual preparation. Every modification is on {restaurant.name}'s supported list.
          </p>
        )}
      </div>
    </Screen>
  );
}
