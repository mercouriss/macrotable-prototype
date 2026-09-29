import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Icon, type IconName } from "../components/Icon";
import { Plate } from "../components/Plate";
import { approx } from "../components/ProvenanceBadge";
import { SaveMealButton } from "../components/SaveMealButton";
import { Screen } from "../components/Screen";
import { Button, ButtonLink, Card, Eyebrow } from "../components/ui";
import { getMeal } from "../data/restaurants";
import { PERSONA, SCENARIOS } from "../data/scenarios";
import { getOrders } from "../lib/experiment";
import { clock, euro } from "../lib/format";
import { changesFromDefault, computeConfiguration, describeChange, isSelectionSupported } from "../lib/nutrition";
import { clearSaved, useSavedMeals } from "../lib/saved";
import { appUrl, shareLink } from "../lib/share";
import type { Selections } from "../types";
import { useAppState } from "../state/AppState";

export function Orders() {
  const { selectMeal } = useAppState();
  const navigate = useNavigate();
  // Demo orders only — participant orders belong to the research dashboard.
  const orders = [...getOrders()].filter((o) => o.mode === "macrotable" && !o.sessionId).reverse();
  return (
    <Screen nav title="Your orders" back="/macrotable/profile">
      {orders.length === 0 ? (
        <EmptyState icon="receipt" title="No orders yet" text="Approved orders and their kitchen tickets appear here." cta="Find my next meal" to="/macrotable/preferences" />
      ) : (
        <ul className="mt-5 mb-6 space-y-3">
          {orders.map((o) => {
            const f = getMeal(o.mealId);
            return (
              <li key={o.orderNumber}>
                <Card className="p-4">
                  <Link to={o.handoff ? `/macrotable/success/${o.orderNumber}` : `/macrotable/ticket/${o.orderNumber}`} className="flex items-center gap-3">
                    {f && <BrandMark restaurant={f.restaurant} size={36} />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-ink-3">
                        #{o.orderNumber} · {clock(o.placedAt)} · {o.handoff ? "Order at counter" : o.serviceMode === "in-store" ? `In-store · ${o.pickupCode}` : `Pickup · ${o.pickupCode}`}
                      </p>
                      <p className="truncate text-[15.5px] font-semibold">{f?.meal.name}</p>
                      <p className="tnum text-[13px] text-ink-2">
                        {f?.restaurant.name} · {o.handoff ? "≈ " : ""}
                        {o.nutrition.calories} kcal · {euro(o.price)}
                      </p>
                    </div>
                    <Icon name="chevronRight" size={18} className="text-ink-3" />
                  </Link>
                  {f && <OrderAgain mealId={o.mealId} selections={o.selections} onGo={() => { selectMeal({ mealId: o.mealId, selections: o.selections, recommended: o.selections }); navigate("/macrotable/review"); }} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}

function OrderAgain({ mealId, selections, onGo }: { mealId: string; selections: Selections; onGo: () => void }) {
  const f = getMeal(mealId);
  const ok = !!f && f.meal.available && isSelectionSupported(f.meal, selections);
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-line-2 pt-3">
      <button
        onClick={onGo}
        disabled={!ok}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-white hover:bg-ink/90 disabled:opacity-40"
      >
        <Icon name="repeat" size={15} /> Order again
      </button>
      <SaveMealButton mealId={mealId} selections={selections} />
      {!ok && <span className="text-[12px] text-ink-3">Not available right now</span>}
    </div>
  );
}

/** Saved configurations (this browser only). */
export function Saved() {
  const { selectMeal, lock } = useAppState();
  const navigate = useNavigate();
  const saved = useSavedMeals();
  if (lock) return <Navigate to="/macrotable" replace />;
  const items = saved.map((s) => ({ s, f: getMeal(s.mealId) })).filter((x) => x.f);
  return (
    <Screen nav title="Saved meals" back="/macrotable/profile">
      {items.length === 0 ? (
        <EmptyState icon="heart" title="Nothing saved yet" text="Tap “Save meal” on a recommendation to keep that exact configuration here." cta="Find my next meal" to="/macrotable/preferences" />
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {items.map(({ s, f }) => {
              const { nutrition, price } = f!.meal.nutrition ? computeConfiguration(f!.meal, s.selections) : { nutrition: null, price: f!.meal.price };
              const changes = changesFromDefault(f!.meal, s.selections).map(describeChange);
              return (
                <li key={`${s.mealId}-${s.savedAt}`}>
                  <Card className="p-4">
                    <div className="flex items-center gap-3">
                      <Plate palette={f!.meal.palette} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15.5px] font-semibold">{f!.meal.name}</p>
                        <p className="truncate text-[12.5px] text-ink-3">{f!.restaurant.name}</p>
                      </div>
                    </div>
                    {nutrition && (
                      <p className="tnum mt-2 text-[13px] text-ink-2">
                        {approx(f!.meal.provenance)}
                        {nutrition.calories} kcal · {approx(f!.meal.provenance)}
                        {nutrition.protein} g protein · {euro(price)}
                      </p>
                    )}
                    {changes.length > 0 && <p className="mt-0.5 text-[12.5px] text-ink-3">{changes.join(" · ")}</p>}
                    <OrderAgain
                      mealId={s.mealId}
                      selections={s.selections}
                      onGo={() => {
                        selectMeal({ mealId: s.mealId, selections: s.selections, recommended: s.selections });
                        navigate(`/macrotable/meal/${s.mealId}`);
                      }}
                    />
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 mb-6 px-1 text-[12px] leading-snug text-ink-3">Saved only in this browser — never sent anywhere or included in research exports.</p>
        </>
      )}
    </Screen>
  );
}

function EmptyState({ icon, title, text, cta, to }: { icon: IconName; title: string; text: string; cta: string; to: string }) {
  return (
    <div className="flex flex-col items-center pt-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sunken text-ink-3">
        <Icon name={icon} size={26} />
      </span>
      <p className="mt-4 text-[16px] font-semibold">{title}</p>
      <p className="mt-1 max-w-[260px] text-[14px] text-ink-3">{text}</p>
      <div className="mt-6 w-full max-w-[240px]">
        <ButtonLink to={to}>{cta}</ButtonLink>
      </div>
    </div>
  );
}

export function Profile() {
  const { scenarioId, target, lock, resetDemo } = useAppState();
  const navigate = useNavigate();
  const saved = useSavedMeals();
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

      {!lock && (
        <Link to="/macrotable/premium" className="mt-6 block overflow-hidden rounded-[22px] bg-ink p-5 text-white shadow-lift hover:bg-ink/95">
          <span className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.08em] text-white/70 uppercase">
              <Icon name="sparkle" size={14} /> MacroTable Premium
            </span>
            <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10.5px] font-bold tracking-[0.06em] text-white/80">CONCEPT</span>
          </span>
          <span className="mt-2 block text-[17px] leading-snug font-semibold">Your nutrition goals, turned into restaurant orders.</span>
          <span className="mt-1 block text-[13px] text-white/70">€7.99/month · included free in this beta</span>
        </Link>
      )}

      <Card className="mt-3 p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Tonight</Eyebrow>
          <Link to="/macrotable/preferences" className="inline-flex min-h-8 items-center text-[13px] font-semibold text-brand">
            Edit
          </Link>
        </div>
        <p className="tnum mt-1.5 text-[14.5px] text-ink-2">
          {target.calories} kcal · ≥{target.protein} g protein · {target.carbs} g carbs · {target.fat} g fat · €{target.maxBudget} max
        </p>
      </Card>
      <Card className="mt-3 divide-y divide-line-2 overflow-hidden">
        {row("/macrotable/preferences", "sliders", "Preferences & targets")}
        {!lock && row("/macrotable/saved", "heart", "Saved meals", saved.length ? `${saved.length} saved` : undefined)}
        {row("/macrotable/orders", "receipt", "Your orders")}
        {row("/privacy", "lock", "Privacy & prototype notice")}
      </Card>

      {!lock && (
        <details className="group mt-3 rounded-[22px] border border-line-2 bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
            <Icon name="flask" size={19} className="text-ink-2" />
            <span className="flex-1">
              Prototype & research
              <span className="block text-[12.5px] font-normal text-ink-3">For the study team and demos</span>
            </span>
            <Icon name="chevronDown" size={17} className="text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-line-2 px-3 pb-3">
            <div className="divide-y divide-line-2">
              {row("/research", "flask", "Research dashboard", `Demo scenario: ${SCENARIOS[scenarioId].label}`)}
              {row("/baseline", "compass", "Conventional ordering (baseline)")}
            </div>
            <AgentModeToggle />
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
            {saved.length > 0 && (
              <Button
                variant="ghost"
                icon="trash"
                className="mt-2"
                onClick={() => {
                  clearSaved();
                  setNote("Saved meals cleared");
                }}
              >
                Clear saved meals
              </Button>
            )}
          </div>
        </details>
      )}
      <p className="mt-2 min-h-5 text-center text-[12.5px] text-ink-3" aria-live="polite">
        {note}
      </p>
      <p className="mt-2 mb-8 px-1 text-[12.5px] leading-relaxed text-ink-3">
        MacroTable is a research prototype, not a medical tool: no medical advice, no allergen guarantees. Integrations, nutrition data, orders and
        checkout are simulated, and real preparation varies.
      </p>
    </Screen>
  );
}

/** Live model (when a proxy is configured, with offline fallback) or the deterministic offline agent only. */
export function AgentModeToggle() {
  const { settings, setSettings } = useAppState();
  return (
    <Card className="mt-3 p-4">
      <label className="flex items-center justify-between gap-3 text-[14px]">
        <span>
          <span className="block font-medium">Offline demo agent only</span>
          <span className="block text-[12px] text-ink-3">For demos without Wi-Fi. Off = live Gemini when available, offline fallback otherwise.</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--color-brand)]"
          checked={settings.agentMode === "offline"}
          onChange={(e) => setSettings({ agentMode: e.target.checked ? "offline" : "auto" })}
        />
      </label>
    </Card>
  );
}
