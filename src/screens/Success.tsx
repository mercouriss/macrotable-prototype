import { useLocation, useParams } from "react-router-dom";
import { AcceptanceSequence } from "../components/AcceptanceSequence";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { KitchenTicket } from "../components/KitchenTicket";
import { SaveMealButton } from "../components/SaveMealButton";
import { Screen } from "../components/Screen";
import { ButtonLink, Card } from "../components/ui";
import { getMeal } from "../data/restaurants";
import { getOrders } from "../lib/experiment";
import { euro } from "../lib/format";
import { changesFromDefault, describeChange } from "../lib/nutrition";
import { useAppState } from "../state/AppState";
import { NotFound } from "./NotFound";

function useOrder() {
  const { orderNumber } = useParams();
  const { lock } = useAppState();
  // Trial orders end on the neutral /experiment/done screen; demo orders are not shown mid-trial.
  if (lock) return undefined;
  return getOrders().find((o) => o.orderNumber === orderNumber);
}

/** Screen 9 — order sent (or hand-off prepared for a non-integrated restaurant). */
export function Success() {
  const order = useOrder();
  const location = useLocation();
  const found = order && getMeal(order.mealId);
  if (!order || !found) return <NotFound />;
  const { meal, restaurant } = found;

  if (order.handoff) {
    const changes = changesFromDefault(meal, order.selections);
    return (
      <Screen footer={<ButtonLink to="/macrotable" variant="secondary">Back to home</ButtonLink>}>
        <div className="flex flex-col items-center pt-16 text-center">
          <span className="grid h-16 w-16 animate-rise place-items-center rounded-full bg-estimated-soft text-estimated">
            <Icon name="handoff" size={30} stroke={2.2} />
          </span>
          <h1 className="mt-5 font-display text-[26px] font-semibold tracking-[-0.02em]">Hand-off ready</h1>
          <p className="mt-2 max-w-[290px] text-[14.5px] leading-relaxed text-ink-2">
            {restaurant.name} isn't integrated, so nothing was sent to the kitchen. Order this dish as listed at the counter.
          </p>
        </div>
        <Card className="mt-8 p-5">
          <p className="text-[13px] text-ink-3">{restaurant.name} · reference {order.orderNumber}</p>
          <p className="mt-1 text-[17px] font-semibold">{meal.name}</p>
          <p className="tnum mt-1 text-[14px] text-ink-2">
            ≈ {order.nutrition.calories} kcal · ≈ {order.nutrition.protein} g protein · {euro(order.price)}
          </p>
          {changes.length > 0 && <p className="mt-1 text-[13px] text-ink-3">{changes.map(describeChange).join(", ")}</p>}
          <p className="mt-3 text-[12.5px] text-ink-3">Estimate based on available menu information.</p>
        </Card>
        <div className="mt-4 flex justify-center">
          <SaveMealButton mealId={meal.id} selections={order.selections} />
        </div>
      </Screen>
    );
  }

  const fresh = !!(location.state as { fresh?: boolean } | null)?.fresh;
  return (
    <Screen
      footer={
        <div className="space-y-2">
          <ButtonLink to="/macrotable" variant="secondary">
            Back to home
          </ButtonLink>
        </div>
      }
    >
      <div className="pt-10">
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Order approved</h1>
        <p className="mt-1 flex items-center gap-2 text-[14px] text-ink-2">
          <BrandMark restaurant={restaurant} size={22} />
          <span className="min-w-0">
            {meal.name} · {restaurant.name}
          </span>
        </p>
        <div className="mt-6">
          <AcceptanceSequence order={order} restaurant={restaurant} animate={fresh}>
            <div className="text-center">
              <p className="tnum inline-block rounded-full bg-brand-soft px-4 py-2 text-[13.5px] font-medium text-brand">
                {order.table ? `Dine in · Table ${order.table} · ` : order.serviceMode === "in-store" ? "In-store " : "Pickup "}code <span className="font-bold">{order.pickupCode}</span>
                {order.serviceMode === "pickup" ? ` · ready in ~${restaurant.pickupMinutes} min` : ""}
              </p>
              <div className="mt-6">
                <KitchenTicket order={order} />
              </div>
              <div className="mt-6">
                <SaveMealButton mealId={meal.id} selections={order.selections} />
              </div>
            </div>
          </AcceptanceSequence>
        </div>
        <p className="mt-8 mb-6 text-center text-[12.5px] text-ink-3">Simulated order — no real kitchen received it and nothing was charged.</p>
      </div>
    </Screen>
  );
}

export function Ticket() {
  const order = useOrder();
  if (!order) return <NotFound />;
  return (
    <Screen title="Kitchen ticket" back="/macrotable/orders" footer={<ButtonLink to="/macrotable" variant="secondary">Back to home</ButtonLink>}>
      <p className="mx-auto mt-1 max-w-[300px] text-center text-[13.5px] leading-snug text-ink-3">
        What the kitchen sees: the approved configuration, in restaurant language.
      </p>
      <div className="mt-6 mb-8">
        <KitchenTicket order={order} />
      </div>
    </Screen>
  );
}
