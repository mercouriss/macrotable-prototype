import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Screen } from "../components/Screen";
import { Button, ButtonLink, Card, Eyebrow } from "../components/ui";
import { getMeal } from "../data/restaurants";
import { PERSONA, SCENARIOS } from "../data/scenarios";
import { getOrders } from "../lib/experiment";
import { clock, euro } from "../lib/format";
import { appUrl, shareLink } from "../lib/share";
import { useAppState } from "../state/AppState";

export function Orders() {
  // Demo orders only — participant orders belong to the research dashboard.
  const orders = [...getOrders()].filter((o) => o.mode === "macrotable" && !o.sessionId).reverse();
  return (
    <Screen nav>
      <h1 className="pt-6 font-display text-[27px] font-semibold tracking-[-0.02em]">Orders</h1>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center pt-20 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sunken text-ink-3">
            <Icon name="receipt" size={26} />
          </span>
          <p className="mt-4 text-[16px] font-semibold">No orders yet</p>
          <p className="mt-1 max-w-[260px] text-[14px] text-ink-3">Approved configurations and their kitchen tickets appear here.</p>
          <div className="mt-6 w-full max-w-[240px]">
            <ButtonLink to="/macrotable/preferences">Find me a meal</ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="mt-5 mb-6 space-y-3">
          {orders.map((o) => {
            const f = getMeal(o.mealId);
            return (
              <li key={o.orderNumber}>
                <Link to={o.handoff ? `/macrotable/success/${o.orderNumber}` : `/macrotable/ticket/${o.orderNumber}`}>
                  <Card className="flex items-center gap-3 p-4 hover:bg-sunken/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-ink-3">
                        #{o.orderNumber} · {clock(o.placedAt)} · {o.handoff ? "Order at counter" : o.serviceMode === "in-store" ? `In-store · ${o.pickupCode}` : `Pickup · ${o.pickupCode}`}
                      </p>
                      <p className="text-[15.5px] font-semibold">{f?.meal.name}</p>
                      <p className="tnum text-[13px] text-ink-2">
                        {f?.restaurant.name} · {o.handoff ? "≈ " : ""}
                        {o.nutrition.calories} kcal · {euro(o.price)}
                      </p>
                    </div>
                    <Icon name="chevronRight" size={18} className="text-ink-3" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}

export function Profile() {
  const { scenarioId, target, lock, resetDemo } = useAppState();
  const navigate = useNavigate();
  const [note, setNote] = useState<string | null>(null);
  const row = (to: string, icon: IconName, label: string, sub?: string) => (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-sunken/50">
      <Icon name={icon} size={19} className="text-ink-2" />
      <span className="flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {sub && <span className="block text-[12.5px] text-ink-3">{sub}</span>}
      </span>
      <Icon name="chevronRight" size={17} className="text-ink-3" />
    </Link>
  );
  return (
    <Screen nav>
      <div className="flex items-center gap-4 pt-8">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-ink text-[24px] font-semibold text-white">{PERSONA.name[0]}</div>
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight">{PERSONA.name}</h1>
          <p className="text-[14px] text-ink-3">{PERSONA.goal}</p>
        </div>
      </div>
      <Card className="mt-6 p-5">
        <Eyebrow>Tonight</Eyebrow>
        <p className="tnum mt-1.5 text-[14.5px] text-ink-2">
          {target.calories} kcal · ≥{target.protein} g protein · {target.carbs} g carbs · {target.fat} g fat · €{target.maxBudget} max
        </p>
      </Card>
      <Card className="mt-3 divide-y divide-line-2 overflow-hidden">
        {row("/macrotable/preferences", "sliders", "Preferences")}
        {row("/privacy", "lock", "Privacy & prototype notice")}
        {!lock && row("/research", "flask", "Research dashboard", `Demo scenario: ${SCENARIOS[scenarioId].label}`)}
        {!lock && row("/baseline", "compass", "Conventional ordering (baseline)")}
      </Card>
      {!lock && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            icon="handoff"
            onClick={async () => {
              const r = await shareLink(appUrl("macrotable"), "MacroTable prototype", "Try the MacroTable research prototype");
              if (r === "copied") setNote("Link copied");
              if (r === "failed") setNote("Couldn't share the link");
            }}
          >
            Share app
          </Button>
          <Button
            variant="secondary"
            icon="refresh"
            onClick={() => {
              resetDemo();
              navigate("/macrotable");
            }}
          >
            Reset demo
          </Button>
        </div>
      )}
      <p className="mt-2 min-h-5 text-center text-[12.5px] text-ink-3" aria-live="polite">
        {note}
      </p>
      <p className="mt-4 mb-8 px-1 text-[12.5px] leading-relaxed text-ink-3">
        MacroTable is a university research prototype and not a medical tool. It doesn't diagnose, give medical advice or infer
        allergens. Restaurant integrations, nutrition data, orders, health sync and checkout are simulated. Nutrition information may
        vary with actual preparation.
      </p>
    </Screen>
  );
}
