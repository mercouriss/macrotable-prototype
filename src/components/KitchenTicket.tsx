import { getMeal } from "../data/restaurants";
import { euro } from "../lib/format";
import { fulfilmentLabel } from "../lib/fulfillment";
import { changesFromDefault, ticketLine } from "../lib/nutrition";
import type { PlacedOrder } from "../types";

/** Restaurant-readable output: the decision becomes an operational kitchen order. */
export function KitchenTicket({ order }: { order: PlacedOrder }) {
  const found = getMeal(order.mealId);
  if (!found) return null;
  const { meal, restaurant } = found;
  const lines = changesFromDefault(meal, order.selections).map(ticketLine);
  const placed = new Date(order.placedAt);
  const edge = "radial-gradient(circle at 8px 0, transparent 7px, #FFFDF7 7.5px) 0 0 / 16px 100% repeat-x";
  return (
    <figure aria-label={`Kitchen ticket ${order.orderNumber}`} className="mx-auto w-full max-w-[320px] drop-shadow-[0_14px_22px_rgb(22_24_28/0.16)]">
      <div className="h-2" style={{ background: edge }} />
      <div className="bg-[#FFFDF7] px-6 py-6 font-mono text-[13px] leading-[1.55] text-[#1d1d1b]">
        <p className="text-center text-[11px] tracking-[0.18em] text-[#6b6a64]">{restaurant.name.toUpperCase()} · KITCHEN</p>
        <p className="mt-3 text-center text-[15px] font-bold tracking-[0.04em]">MACROTABLE ORDER #{order.orderNumber}</p>
        <p className="text-center text-[11px] text-[#6b6a64]">
          {placed.toLocaleDateString([], { day: "2-digit", month: "short" })} ·{" "}
          {placed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {order.table ? "DINE IN" : order.serviceMode === "in-store" ? "IN-STORE" : "PICKUP"}{" "}
          {order.pickupCode ?? ""}
        </p>
        {/* How the kitchen hands it over: DINE IN · TABLE 12, PICKUP or IN-STORE. */}
        <p data-fulfilment className="mt-3 text-center text-[16px] font-bold tracking-[0.08em]">
          {fulfilmentLabel(order)}
        </p>
        <div className="my-4 border-t border-dashed border-[#bdbab0]" />
        <p className="text-[15px] font-bold">1× {meal.name.toUpperCase()}</p>
        {lines.length ? (
          <ul className="mt-1.5">
            {lines.map((l) => (
              <li key={l} className="font-semibold">
                + {l}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5">AS LISTED, NO MODIFICATIONS</p>
        )}
        <div className="my-4 border-t border-dashed border-[#bdbab0]" />
        <p className="text-[11.5px] text-[#4a4943]">
          {meal.provenance === "verified" ? "RECIPE-CALCULATED" : "PUBLISHED VALUES"}: {order.nutrition.calories} KCAL · P{order.nutrition.protein} C
          {order.nutrition.carbs} F{order.nutrition.fat}
        </p>
        <p className="text-[11.5px] text-[#4a4943]">ALL MODIFIERS ON RESTAURANT'S SUPPORTED LIST</p>
        <div className="my-4 border-t border-dashed border-[#bdbab0]" />
        <div className="flex justify-between text-[12px]">
          <span>TOTAL (SIMULATED)</span>
          <span>{euro(order.price)}</span>
        </div>
        <p className="mt-4 rounded border border-[#1d1d1b] py-1.5 text-center text-[11.5px] font-bold tracking-[0.1em]">
          CUSTOMER-APPROVED CONFIGURATION
        </p>
      </div>
      <div className="h-2" style={{ background: edge, transform: "rotate(180deg)" }} />
    </figure>
  );
}
