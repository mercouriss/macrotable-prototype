import { Link, useNavigate } from "react-router-dom";
import { useAgent } from "../../agent/agentState";
import type { AgentCard, RecommendationCardData, StoreSummary } from "../../agent/types";
import { formatDistance } from "../../data/geo";
import { euro } from "../../lib/format";
import { Icon } from "../Icon";
import { approx, ProvenanceBadge } from "../ProvenanceBadge";
import { useAppState } from "../../state/AppState";

/** Cards render ONLY deterministic tool results — the model's text never feeds them. */
export function AgentCardView({ card }: { card: AgentCard }) {
  switch (card.kind) {
    case "stores":
      return <StoresCard stores={card.stores} />;
    case "recommendation":
      return <RecommendationCard rec={card.rec} />;
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

function StoresCard({ stores }: { stores: StoreSummary[] }) {
  const { send, setCurrentRestaurant, busy } = useAgent();
  return (
    <div className="overflow-hidden rounded-2xl border border-line-2 bg-surface">
      <p className="border-b border-line-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Nearby · fictional demo stores</p>
      <ul className="divide-y divide-line-2">
        {stores.map((s) => (
          <li key={s.restaurantId} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[14.5px] font-semibold">{s.name}</p>
              <span className="tnum shrink-0 text-[12px] text-ink-3">
                {formatDistance(s.distanceKm)} · {s.priceRange}
              </span>
            </div>
            <p className="text-[12px] text-ink-3">
              {s.levelLabel} · {s.serviceModes.map((m) => (m === "pickup" ? `pickup ~${s.pickupMinutes} min` : "in-store")).join(" · ")}
            </p>
            {s.best ? (
              <p className="tnum mt-1 text-[12.5px] text-ink-2">
                <span className={s.best.meetsTarget ? "text-brand" : "text-warn"}>{s.best.meetsTarget ? "✓ Fits" : "Closest"}</span> · {s.best.mealName} ·{" "}
                {approx(s.best.provenance)}
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
              className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-full text-[12.5px] font-semibold text-brand disabled:opacity-50"
            >
              Ask about {s.name} <Icon name="arrowRight" size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: RecommendationCardData }) {
  const ap = approx(rec.provenance);
  const n = rec.nutrition;
  const configurable = rec.integrationLevel >= 2 && !rec.mealId.startsWith("scan:");
  return (
    <div className="rounded-2xl border border-brand/25 bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] text-ink-3">{rec.restaurantName}</p>
          <p className="text-[16px] leading-tight font-semibold">{rec.mealName}</p>
        </div>
        <ProvenanceBadge provenance={rec.provenance} restaurantName={rec.restaurantName} size="sm" />
      </div>
      {rec.changes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {rec.changes.map((c) => (
            <span key={c} className="rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand">
              {c}
            </span>
          ))}
        </div>
      )}
      <dl className="tnum mt-3 grid grid-cols-5 gap-1 text-center">
        {(
          [
            ["kcal", `${ap}${n.calories}`],
            ["protein", `${ap}${n.protein} g`],
            ["carbs", `${ap}${n.carbs} g`],
            ["fat", `${ap}${n.fat} g`],
            ["price", euro(rec.price)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-sunken/70 px-1 py-1.5">
            <dd className="text-[13px] font-semibold">{v}</dd>
            <dt className="text-[10.5px] text-ink-3">{k}</dt>
          </div>
        ))}
      </dl>
      <p className={`mt-2 flex items-center gap-1.5 text-[12.5px] font-medium ${rec.meetsTarget ? "text-brand" : "text-warn"}`}>
        <Icon name={rec.meetsTarget ? "check" : "alert"} size={14} stroke={2.4} />
        {rec.meetsTarget ? "In your target range · all changes supported by the restaurant" : rec.gaps.join(" · ")}
      </p>
      {configurable && (
        <Link to={`/macrotable/meal/${rec.mealId}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-[12.5px] font-semibold text-ink-2 hover:text-ink">
          Details & customise <Icon name="chevronRight" size={13} />
        </Link>
      )}
    </div>
  );
}

function OrderCard({ draftId }: { draftId: string }) {
  const { state, approveDraft, cancelDraft } = useAgent();
  const navigate = useNavigate();
  const { lock } = useAppState();
  const d = state.orderDrafts.find((x) => x.id === draftId);
  if (!d) return null;
  const handoff = d.mode === "handoff";
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
      {d.status === "awaiting-approval" ? (
        <>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => {
                const r = approveDraft(d.id);
                if (r?.research) navigate("/experiment/done", { replace: true, state: { completed: true } });
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
