import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAgent } from "../../agent/agentState";
import type { AgentCard, RecommendationCardData, StoreSummary } from "../../agent/types";
import { formatDistance } from "../../data/geo";
import { getRestaurant } from "../../data/restaurants";
import { getOrders } from "../../lib/experiment";
import { completedOrderFor } from "../../lib/orderState";
import { AcceptanceSequence } from "../AcceptanceSequence";
import { BrandMark } from "../BrandMark";
import { MacroFit } from "../MacroFit";
import { euro } from "../../lib/format";
import { Icon } from "../Icon";
import { approx, ProvenanceBadge } from "../ProvenanceBadge";
import { useAppState } from "../../state/AppState";

/** Cards render ONLY deterministic tool results — the model's text never feeds them. */
export function AgentCardView({ card, since = 0, originId }: { card: AgentCard; since?: number; originId?: string }) {
  switch (card.kind) {
    case "stores":
      return <StoresCard stores={card.stores} otherReal={card.otherReal} />;
    case "recommendation":
      return <RecommendationCard rec={card.rec} since={since} originId={originId} />;
    case "order":
      return <OrderCard draftId={card.draftId} />;
    case "scan":
      return <ScanCard />;
    case "notice":
      return (
        <p role={card.tone === "warn" ? "alert" : undefined} className={`flex gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${card.tone === "warn" ? "bg-warn-soft text-warn" : "bg-sunken text-ink-2"}`}>
          <Icon name={card.tone === "warn" ? "alert" : "info"} size={15} className="mt-px shrink-0" />
          {card.text}
        </p>
      );
  }
}

function StoresCard({ stores, otherReal = 0 }: { stores: StoreSummary[]; otherReal?: number }) {
  const { send, setCurrentRestaurant, busy } = useAgent();
  const navigate = useNavigate();
  return (
    <div className="overflow-hidden rounded-2xl border border-line-2 bg-surface">
      <p className="border-b border-line-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Nearby</p>
      <ul className="divide-y divide-line-2">
        {stores.map((s) => {
          const r = getRestaurant(s.restaurantId);
          return (
            <li key={s.restaurantId} className="px-4 py-3">
              <div className="flex items-center gap-2.5">
                {r && <BrandMark restaurant={r} size={28} />}
                <p className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{s.name}</p>
                <span className="tnum shrink-0 text-[12px] text-ink-3">
                  {formatDistance(s.distanceKm)}
                  {s.priceRange ? ` · ${s.priceRange}` : ""}
                </span>
              </div>
              {s.identity === "real" ? (
                <>
                  <p className="mt-1 text-[12.5px] text-ink-3">Real · not affiliated · no menu data. Scan the menu to check your fit.</p>
                  <button
                    onClick={() => navigate(`/macrotable/scan?type=menu&restaurant=${s.restaurantId}`, { state: { userTap: true } })}
                    className="mt-1 inline-flex min-h-9 items-center gap-1 text-[12.5px] font-semibold text-brand"
                  >
                    <Icon name="camera" size={13} /> Scan menu
                  </button>
                </>
              ) : (
                <>
                  {s.best ? (
                    <p className="tnum mt-1 text-[12.5px] text-ink-2">
                      <span className={`font-semibold ${s.best.meetsTarget ? "text-brand" : "text-ink-2"}`}>{s.best.meetsTarget ? "✓ Fits" : "Closest"}</span> · {s.best.mealName} · {approx(s.best.provenance)}
                      {s.best.calories} kcal · {approx(s.best.provenance)}
                      {s.best.protein} g · {euro(s.best.price)}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-ink-3">Nothing within budget</p>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => {
                      setCurrentRestaurant(s.restaurantId);
                      void send(`What should I get at ${s.name}?`, "chip");
                    }}
                    className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-full text-[12.5px] font-semibold text-brand disabled:opacity-50"
                  >
                    Ask about {s.name} <Icon name="arrowRight" size={13} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {otherReal > 0 && (
        <Link to="/macrotable/explore" className="flex min-h-11 items-center justify-between border-t border-line-2 px-4 text-[12.5px] font-medium text-ink-2 hover:bg-sunken/50">
          +{otherReal} more real restaurants in Explore <Icon name="chevronRight" size={14} />
        </Link>
      )}
    </div>
  );
}

function RecommendationCard({ rec, since, originId }: { rec: RecommendationCardData; since: number; originId?: string }) {
  const { target: appTarget, prefs, selectMeal, lock } = useAppState();
  // Derived from the stored orders, so the state survives scrolling, remounts and reloads.
  const completed = completedOrderFor(rec, { origin: originId, since }, getOrders());
  const navigate = useNavigate();
  const ap = approx(rec.provenance);
  const n = rec.nutrition;
  const scanned = rec.mealId.startsWith("scan:");
  const r = scanned ? undefined : getRestaurant(rec.restaurantId);
  const configurable = !!r && rec.integrationLevel >= 2;
  const target = rec.targetUsed ? { ...appTarget, ...rec.targetUsed } : appTarget;
  return (
    <div className="rounded-2xl border border-brand/25 bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        {r && <BrandMark restaurant={r} size={36} />}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-3">{rec.restaurantName}</p>
          <p className="text-[16px] leading-tight font-semibold">{rec.mealName}</p>
        </div>
        <ProvenanceBadge provenance={rec.provenance} restaurantName={rec.restaurantName} size="sm" />
      </div>
      <p className={`mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold ${rec.meetsTarget ? "text-brand" : "text-warn"}`}>
        <Icon name={rec.meetsTarget ? "check" : "alert"} size={14} stroke={2.4} />
        {rec.meetsTarget ? "Best feasible match" : `Closest feasible option · ${rec.gaps.join(" · ")}`}
      </p>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <p className="tnum text-[15px] font-semibold">
          {ap}
          {n.calories} kcal · {ap}
          {n.protein} g protein
        </p>
        <p className="tnum text-[17px] font-semibold">{euro(rec.price)}</p>
      </div>
      <div className="mt-2.5">
        <MacroFit nutrition={n} target={target} prefs={prefs} provenance={rec.provenance} compact />
      </div>
      {rec.changes.length > 0 && (
        <div className="mt-3">
          <p className="text-[11.5px] font-semibold text-ink-3">MacroTable changed</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {rec.changes.map((c) => (
              <span key={c} className="rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      {!!rec.reasons?.length && rec.meetsTarget && (
        <ul className="mt-2.5 space-y-0.5 text-[12.5px] text-ink-2">
          {rec.reasons.map((t) => (
            <li key={t} className="flex gap-1.5">
              <Icon name="check" size={13} stroke={2.4} className="mt-0.5 shrink-0 text-brand" />
              {t}
            </li>
          ))}
        </ul>
      )}
      {r && completed ? (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-sunken px-4 text-[14px] font-semibold text-ink-3"
          >
            <Icon name="check" size={15} stroke={2.6} /> Order completed
          </button>
          {!lock && (
            <Link
              to={completed.handoff ? `/macrotable/success/${completed.orderNumber}` : `/macrotable/ticket/${completed.orderNumber}`}
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-3.5 text-[13.5px] font-medium text-ink-2 hover:bg-sunken"
            >
              View order
            </Link>
          )}
        </div>
      ) : r ? (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button
            onClick={() => {
              selectMeal({ mealId: rec.mealId, selections: rec.selections, recommended: rec.selections, origin: originId });
              navigate(configurable ? `/macrotable/configure/${rec.mealId}` : `/macrotable/meal/${rec.mealId}`);
            }}
            className="min-h-11 rounded-xl bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-hover"
          >
            {configurable ? "Configure order" : "View details"}
          </button>
          {configurable && (
            <Link
              to={`/macrotable/meal/${rec.mealId}`}
              onClick={() => selectMeal({ mealId: rec.mealId, selections: rec.selections, recommended: rec.selections, origin: originId })}
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-3.5 text-[13.5px] font-medium text-ink-2 hover:bg-sunken"
            >
              Why?
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

function OrderCard({ draftId }: { draftId: string }) {
  const { state, approveDraft, cancelDraft } = useAgent();
  const navigate = useNavigate();
  const { lock } = useAppState();
  const [justApproved, setJustApproved] = useState(false);
  const d = state.orderDrafts.find((x) => x.id === draftId);
  if (!d) return null;
  const handoff = d.mode === "handoff";
  // Ordered through another path (e.g. Configure → Review) after this draft was prepared?
  const elsewhere = d.status === "awaiting-approval" ? completedOrderFor(d, { since: d.createdAt ?? Number.MAX_SAFE_INTEGER }, getOrders()) : undefined;
  const placed = d.orderNumber ? getOrders().find((o) => o.orderNumber === d.orderNumber) : undefined;
  const restaurant = getRestaurant(d.restaurantId);
  return (
    <div className="rounded-2xl border border-ink/15 bg-surface p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {handoff ? "Show at the counter" : d.mode === "pickup" ? `Pickup order · ready ~${d.readyInMinutes ?? 15} min` : "In-store order"}
      </p>
      <p className="mt-1 text-[15px] font-semibold">
        {d.mealName} <span className="font-normal text-ink-3">· {d.restaurantName}</span>
      </p>
      {d.changes.length > 0 && <p className="mt-0.5 text-[13px] text-ink-2">{d.changes.join(" · ")}</p>}
      <p className="tnum mt-1 text-[13px] text-ink-2">
        {approx(d.provenance)}
        {d.nutrition.calories} kcal · {approx(d.provenance)}
        {d.nutrition.protein} g protein · <span className="font-semibold text-ink">{euro(d.price)}</span>
      </p>
      {elsewhere ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-sunken px-3 py-2 text-[13px] font-semibold text-ink-3">
          <Icon name="check" size={14} stroke={2.6} /> Order completed ({elsewhere.orderNumber})
        </p>
      ) : d.status === "awaiting-approval" ? (
        <>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => {
                const r = approveDraft(d.id);
                if (r?.research) navigate("/experiment/done", { replace: true, state: { completed: true } });
                else if (r) setJustApproved(true);
              }}
              className="min-h-11 rounded-xl bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-hover"
            >
              {handoff ? "Done — I'll order at the counter" : "Approve & send order"}
            </button>
            <button onClick={() => cancelDraft(d.id)} className="min-h-11 rounded-xl border border-line px-4 text-[14px] font-medium text-ink-2">
              Cancel
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            {handoff ? "This restaurant isn't connected — nothing is sent." : "Nothing is ordered until you approve. Simulated — no payment."}
          </p>
        </>
      ) : d.status === "approved" && placed && restaurant && !handoff && !lock ? (
        <div className="mt-3 rounded-xl bg-sunken/70 px-3 py-2.5">
          <AcceptanceSequence order={placed} restaurant={restaurant} animate={justApproved} compact>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-brand">
                {d.mode === "in-store" ? "Counter" : "Pickup"} code {placed.pickupCode}
              </p>
              <Link to={`/macrotable/ticket/${placed.orderNumber}`} className="text-[12.5px] font-semibold text-brand underline underline-offset-2">
                Kitchen ticket
              </Link>
            </div>
          </AcceptanceSequence>
        </div>
      ) : d.status === "approved" ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-brand-soft px-3 py-2">
          <p className="text-[13px] font-semibold text-brand">
            <Icon name="check" size={14} stroke={2.6} className="mr-1 inline" />
            {d.pickupCode ? `Sent · ${d.mode === "in-store" ? "counter" : "pickup"} code ${d.pickupCode}` : "Done"}
          </p>
          {d.orderNumber && !lock && (
            <Link to={`/macrotable/ticket/${d.orderNumber}`} className="text-[12.5px] font-semibold text-brand underline underline-offset-2">
              Kitchen ticket
            </Link>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] text-ink-3">Cancelled.</p>
      )}
    </div>
  );
}

function ScanCard() {
  const { state } = useAgent();
  const m = state.scannedMenu;
  if (!m) return <p className="text-[12.5px] text-ink-3">Scan deleted.</p>;
  return (
    <div className="rounded-2xl border border-line-2 bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Scanned menu {m.source === "simulated" ? "· offline sample (not read from your photo)" : "· read by Gemini"}
      </p>
      <ul className="mt-2 space-y-1.5">
        {m.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate">
              {i.name}
              {i.price !== null && <span className="text-ink-3"> · {euro(i.price)}</span>}
            </span>
            <ProvenanceBadge provenance={i.provenance} size="sm" />
          </li>
        ))}
      </ul>
      {m.uncertainties.length > 0 && <p className="mt-2 text-[12px] text-ink-3">Uncertain: {m.uncertainties.join("; ")}</p>}
    </div>
  );
}
