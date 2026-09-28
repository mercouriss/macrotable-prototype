import { useEffect } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ModifierSelector } from "../components/ModifierSelector";
import { Plate } from "../components/Plate";
import { Screen } from "../components/Screen";
import { Button, ButtonLink, Card, Eyebrow } from "../components/ui";
import { getMeal, getRestaurant, RESTAURANTS } from "../data/restaurants";
import { SCENARIOS } from "../data/scenarios";
import { getOrders } from "../lib/experiment";
import { withinBudget } from "../lib/feasibility";
import { euro, euroShort } from "../lib/format";
import { changesFromDefault, computeConfiguration, defaultSelections, describeChange } from "../lib/nutrition";
import { useAppState } from "../state/AppState";
import type { Meal } from "../types";
import { NotFound } from "../screens/NotFound";

/*
 * CONVENTIONAL ORDERING BASELINE (/baseline)
 * Same restaurants, meals and supported modifiers as MacroTable, but with no
 * recommendation, no optimised configuration, no target comparison, no
 * explanation and no ranking by nutrition fit. Restaurants and meals appear
 * in fixed menu order. The participant browses and configures manually.
 */

const orderable = (m: Meal) => m.available && !!m.nutrition;

function TaskBanner() {
  const { target, prefs } = useAppState();
  return (
    <div className="mx-5 mb-3 rounded-2xl bg-ink px-4 py-3 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-white/60">Your task</p>
      <p className="tnum mt-0.5 text-[13.5px] leading-snug">
        Order a dinner of about {target.calories} kcal with at least {target.protein} g protein, max {euroShort(target.maxBudget)}
        {prefs.diet !== "none" ? ` · ${prefs.diet}` : ""}.
      </p>
    </div>
  );
}

function BaselineScreen(props: Parameters<typeof Screen>[0] & { task?: boolean }) {
  const { task = true, children, ...rest } = props;
  return (
    <Screen {...rest}>
      {task && (
        <div className="-mx-5 pt-1">
          <TaskBanner />
        </div>
      )}
      {children}
    </Screen>
  );
}

export function BaselineStart() {
  const { scenarioId, session, startSession } = useAppState();
  const navigate = useNavigate();
  const active = session?.mode === "baseline";
  return (
    <Screen
      footer={
        <Button
          onClick={() => {
            startSession("baseline");
            navigate("/baseline/browse");
          }}
        >
          {active ? "Continue task" : "Start task"}
        </Button>
      }
    >
      <div className="pt-16">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-ink-2">
          <Icon name="receipt" size={24} />
        </span>
        <h1 className="mt-5 font-display text-[28px] font-semibold tracking-[-0.02em]">Order dinner</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Browse the restaurants and choose a meal the way you normally would. You can change options on each dish.
        </p>
      </div>
      <Card className="mt-6 p-5">
        <Eyebrow>Your task</Eyebrow>
        <TaskText />
        <p className="mt-3 text-[12.5px] text-ink-3">
          {SCENARIOS[scenarioId].label} · timing starts when you press Start.
        </p>
      </Card>
      <p className="mt-6 text-[12.5px] text-ink-3">Study prototype — restaurants and orders are simulated.</p>
    </Screen>
  );
}

function TaskText() {
  const { target, prefs } = useAppState();
  return (
    <p className="tnum mt-1.5 text-[16px] leading-snug font-medium">
      A dinner of about {target.calories} kcal, at least {target.protein} g protein, costing no more than{" "}
      {euroShort(target.maxBudget)}
      {prefs.diet !== "none" ? `, ${prefs.diet}` : ""}.
    </p>
  );
}

function useRequireSession() {
  const { session } = useAppState();
  return session?.mode === "baseline";
}

export function BaselineBrowse() {
  if (!useRequireSession()) return <Navigate to="/baseline" replace />;
  return (
    <BaselineScreen title="Restaurants" back="/baseline">
      <ul className="mb-6 space-y-3">
        {RESTAURANTS.map((r) => (
          <li key={r.id}>
            <Link to={`/baseline/restaurant/${r.id}`}>
              <Card className="flex items-center gap-4 p-4 hover:bg-sunken/40">
                <Plate palette={r.meals[0].palette} size={48} />
                <div className="flex-1">
                  <p className="text-[16px] font-semibold">{r.name}</p>
                  <p className="text-[13px] text-ink-3">
                    {r.cuisine} · {r.estimatedDeliveryMinutes} min
                  </p>
                </div>
                <Icon name="chevronRight" size={18} className="text-ink-3" />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </BaselineScreen>
  );
}

export function BaselineRestaurant() {
  const { restaurantId } = useParams();
  const r = getRestaurant(restaurantId);
  const { settings } = useAppState();
  const ok = useRequireSession();
  if (!ok) return <Navigate to="/baseline" replace />;
  if (!r) return <NotFound />;
  return (
    <BaselineScreen title={r.name} back="/baseline/browse">
      <ul className="mb-6 divide-y divide-line-2 overflow-hidden rounded-[22px] border border-line-2 bg-surface shadow-card">
        {r.meals.map((m) => (
          <li key={m.id}>
            <Link
              to={orderable(m) ? `/baseline/meal/${m.id}` : "#"}
              aria-disabled={!orderable(m)}
              onClick={(e) => !orderable(m) && e.preventDefault()}
              className={`flex items-center gap-3.5 px-4 py-3.5 ${orderable(m) ? "hover:bg-sunken/50" : "cursor-not-allowed opacity-55"}`}
            >
              <Plate palette={m.palette} size={46} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{m.name}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-3">{m.description}</span>
                <span className="tnum mt-1 block text-[12px] text-ink-2">
                  {!m.available
                    ? (m.unavailableReason ?? "Unavailable")
                    : !m.nutrition
                      ? "Order by phone only"
                      : settings.baselineShowNutrition
                        ? `${m.provenance === "estimated" ? "~" : ""}${m.nutrition.calories} kcal · P ${m.nutrition.protein} g · C ${m.nutrition.carbs} g · F ${m.nutrition.fat} g`
                        : ""}
                </span>
              </span>
              <span className="tnum text-[14px] font-semibold">{euro(m.price)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </BaselineScreen>
  );
}

export function BaselineMeal() {
  const { mealId } = useParams();
  const found = getMeal(mealId);
  const { selection, selectMeal, setOption, log, settings } = useAppState();
  const navigate = useNavigate();
  const ok = useRequireSession();
  const synced = selection?.mealId === mealId;

  useEffect(() => {
    if (!found || !ok) return;
    log("meal_viewed", { mealId: found.meal.id });
    if (!synced) selectMeal({ mealId: found.meal.id, selections: defaultSelections(found.meal) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealId, ok]);

  if (!ok) return <Navigate to="/baseline" replace />;
  if (!found || !orderable(found.meal)) return <NotFound />;
  const { meal, restaurant } = found;
  const selections = synced ? selection!.selections : defaultSelections(meal);
  const { nutrition, price } = computeConfiguration(meal, selections);
  const show = settings.baselineShowNutrition;

  return (
    <BaselineScreen
      title={meal.name}
      back={`/baseline/restaurant/${restaurant.id}`}
      footer={
        <Button onClick={() => navigate("/baseline/review")}>
          Add to order · {euro(price)}
        </Button>
      }
    >
      <div className="flex items-center gap-4">
        <Plate palette={meal.palette} size={64} />
        <div>
          <p className="text-[13px] text-ink-3">{restaurant.name}</p>
          <p className="text-[19px] leading-tight font-semibold">{meal.name}</p>
          <p className="tnum text-[14px] text-ink-2">{euro(meal.price)}</p>
        </div>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{meal.description}</p>

      {meal.modifierGroups.length > 0 ? (
        <Card className="mt-5 px-5 py-2">
          <ModifierSelector
            meal={meal}
            selections={selections}
            showNutrition={show}
            compareTo="none"
            onChange={(g, o) => {
              setOption(g, o);
              log("modifier_changed", { mealId: meal.id, detail: { groupId: g, optionId: o } });
            }}
          />
        </Card>
      ) : (
        <p className="mt-5 rounded-2xl bg-sunken px-4 py-3 text-[13.5px] text-ink-2">No options for this dish.</p>
      )}

      {show && (
        <p className="tnum mt-4 mb-6 px-1 text-[13px] text-ink-3">
          {meal.provenance === "estimated" ? "Approx. " : ""}
          {nutrition.calories} kcal · P {nutrition.protein} g · C {nutrition.carbs} g · F {nutrition.fat} g
        </p>
      )}
    </BaselineScreen>
  );
}

export function BaselineReview() {
  const { selection, placeOrder, settings, target } = useAppState();
  const navigate = useNavigate();
  const ok = useRequireSession();
  const found = getMeal(selection?.mealId);
  if (!ok) return <Navigate to="/baseline" replace />;
  if (!found || !selection) return <Navigate to="/baseline/browse" replace />;
  const { meal, restaurant } = found;
  const { nutrition, price } = computeConfiguration(meal, selection.selections);
  const changes = changesFromDefault(meal, selection.selections);
  return (
    <BaselineScreen
      title="Your order"
      back={`/baseline/meal/${meal.id}`}
      footer={
        <Button
          onClick={() => {
            const o = placeOrder();
            if (o) navigate(`/baseline/done/${o.orderNumber}`, { replace: true });
          }}
        >
          Place order · {euro(price)}
        </Button>
      }
    >
      <Card className="p-5">
        <p className="text-[13px] text-ink-3">{restaurant.name}</p>
        <p className="text-[18px] font-semibold">{meal.name}</p>
        {changes.length > 0 && <p className="mt-1 text-[14px] text-ink-2">{changes.map(describeChange).join(" · ")}</p>}
        {settings.baselineShowNutrition && (
          <p className="tnum mt-3 text-[13px] text-ink-3">
            {meal.provenance === "estimated" ? "Approx. " : ""}
            {nutrition.calories} kcal · P {nutrition.protein} g · C {nutrition.carbs} g · F {nutrition.fat} g
          </p>
        )}
        <div className="mt-4 flex justify-between border-t border-line-2 pt-3">
          <span className="text-[14px] text-ink-2">Total</span>
          <span className="tnum text-[18px] font-semibold">{euro(price)}</span>
        </div>
      </Card>
      {!withinBudget(price, target) && (
        <p className="mt-3 px-1 text-[13px] text-ink-3">Note: this is above {euroShort(target.maxBudget)}.</p>
      )}
      <p className="mt-4 px-1 text-[12.5px] text-ink-3">Simulated — no payment is taken.</p>
    </BaselineScreen>
  );
}

export function BaselineDone() {
  const { orderNumber } = useParams();
  const order = getOrders().find((o) => o.orderNumber === orderNumber);
  const found = order && getMeal(order.mealId);
  return (
    <Screen footer={<ButtonLink to="/research" variant="ghost">Researcher: view results</ButtonLink>}>
      <div className="flex flex-col items-center pt-24 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink text-white">
          <Icon name="check" size={32} stroke={2.6} />
        </span>
        <h1 className="mt-5 font-display text-[26px] font-semibold tracking-[-0.02em]">Order placed</h1>
        {found && (
          <p className="mt-2 text-[15px] text-ink-2">
            {found.meal.name} · {found.restaurant.name}
          </p>
        )}
        <p className="mt-8 max-w-[270px] text-[14px] leading-relaxed text-ink-3">
          Thank you — the task is complete. Please hand the device back to the researcher.
        </p>
      </div>
    </Screen>
  );
}
