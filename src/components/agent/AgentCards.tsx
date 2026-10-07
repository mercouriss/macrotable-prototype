import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAgent } from "../../agent/agentState";
import type { AgentCard, RecommendationCardData, ScannedItem, ScannedMenu, StoreSummary } from "../../agent/types";
import { formatDistance } from "../../data/geo";
import { getRestaurant } from "../../data/restaurants";
import { getOrders } from "../../lib/experiment";
import { needsTable, normalizeTable, TABLES } from "../../lib/fulfillment";
import { menuState, restaurantMenuPath } from "../../lib/menuNav";
import { isLogged, scanMealEntry } from "../../lib/ledger";
import { completedOrderFor } from "../../lib/orderState";
import { AcceptanceSequence } from "../AcceptanceSequence";
import { BrandMark } from "../BrandMark";
import { MacroFit } from "../MacroFit";
import { euro } from "../../lib/format";
import { Icon } from "../Icon";
import { PaymentSheet, paymentLabel, type PaymentMethod } from "../PaymentSheet";
import { approx, ProvenanceBadge } from "../ProvenanceBadge";
import { useSheet } from "../Sheet";
import { useAppState } from "../../state/AppState";

/**
 * Display order of a message's cards. Normal mode: after a menu scan the best match comes first and
 * the full scanned menu below it. Research trials keep the frozen order. Each card keeps its ORIGINAL
 * index, which the order-tracking origin id is built from.
 */
export function displayOrder(cards: AgentCard[], inTrial: boolean): { c: AgentCard; i: number }[] {
  const out = cards.map((c, i) => ({ c, i }));
  if (!inTrial && cards.some((c) => c.kind === "scan")) out.sort((a, b) => Number(b.c.kind === "recommendation") - Number(a.c.kind === "recommendation"));
  return out;
}

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
          {r && !lock ? (
            <Link
              to={restaurantMenuPath(r.id)}
              state={menuState("agent", rec.mealId, rec.selections)}
              aria-label={`${rec.restaurantName}: view full menu`}
              className="-my-1.5 inline-flex min-h-8 items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
            >
              <span className="underline decoration-line underline-offset-2">{rec.restaurantName}</span>
              <span className="inline-flex items-center font-semibold text-brand">
                Menu <Icon name="chevronRight" size={11} />
              </span>
            </Link>
          ) : (
            <p className="text-[12px] text-ink-3">{rec.restaurantName}</p>
          )}
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
  const { lock, dining, setDining } = useAppState();
  const [justApproved, setJustApproved] = useState(false);
  const [paidWith, setPaidWith] = useState<PaymentMethod | null>(null); // display only; never stored
  const sheet = useSheet();
  const d = state.orderDrafts.find((x) => x.id === draftId);
  if (!d) return null;
  const handoff = d.mode === "handoff";
  // Ordered through another path (e.g. Configure → Review) after this draft was prepared?
  const elsewhere = d.status === "awaiting-approval" ? completedOrderFor(d, { since: d.createdAt ?? Number.MAX_SAFE_INTEGER }, getOrders()) : undefined;
  const placed = d.orderNumber ? getOrders().find((o) => o.orderNumber === d.orderNumber) : undefined;
  const restaurant = getRestaurant(d.restaurantId);
  // Normal mode, table-service restaurant: an in-store draft is dine-in and needs the user's table (trials unchanged).
  const dineIn = !!restaurant && needsTable(restaurant, d.mode === "in-store" ? "in-store" : "pickup", !!lock);
  const table = dineIn && dining?.restaurantId === d.restaurantId ? (normalizeTable(dining.table) ?? undefined) : undefined;
  return (
    <div className="rounded-2xl border border-ink/15 bg-surface p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {handoff ? "Show at the counter" : d.mode === "pickup" ? `Pickup order · ready ~${d.readyInMinutes ?? 15} min` : dineIn ? (table ? `Dine in · Table ${table}` : "Dine-in order") : "In-store order"}
      </p>
      <p className="mt-1 flex items-center gap-2 text-[15px] font-semibold">
        {restaurant && <BrandMark restaurant={restaurant} size={22} />}
        <span className="min-w-0">
          {d.mealName} <span className="font-normal text-ink-3">· {d.restaurantName}</span>
        </span>
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
          {dineIn && (
            <label className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-3 py-1.5">
              <span className="text-[13.5px] font-semibold">Your table</span>
              <select
                aria-label="Your table"
                value={table ?? ""}
                onChange={(e) => setDining({ restaurantId: d.restaurantId, mode: "in-store", table: e.target.value || undefined })}
                className="min-h-10 rounded-lg border border-line bg-surface px-2.5 text-[14px] font-semibold text-ink"
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
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              {...(dineIn ? { disabled: !table } : {})}
              onClick={() => {
                const approve = (payment?: PaymentMethod) => {
                  const r = approveDraft(d.id, table);
                  if (r?.research) navigate("/experiment/done", { replace: true, state: { completed: true } });
                  else if (r) (setJustApproved(true), payment && setPaidWith(payment));
                };
                // Normal mode: the same simulated payment step as Review before the existing approval; trials and hand-offs unchanged.
                if (lock || handoff) return approve();
                sheet.openCustom(
                  "Payment",
                  <PaymentSheet
                    mode={d.mode === "in-store" ? "in-store" : "pickup"}
                    total={d.price}
                    onBack={sheet.close}
                    onConfirm={(m) => (sheet.close(), approve(m))}
                  />,
                  { stickyHeader: true },
                );
              }}
              className={`min-h-11 rounded-xl bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-hover${dineIn ? " disabled:opacity-50" : ""}`}
            >
              {handoff ? (lock ? "Done — I'll order at the counter" : "Done, I'll order at the counter") : dineIn && !table ? "Choose your table" : "Approve & send order"}
            </button>
            <button onClick={() => cancelDraft(d.id)} className="min-h-11 rounded-xl border border-line px-4 text-[14px] font-medium text-ink-2">
              Cancel
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            {handoff
              ? lock
                ? "This restaurant isn't connected — nothing is sent."
                : "This restaurant isn't connected, so nothing is sent."
              : lock
                ? "Nothing is ordered until you approve. Simulated — no payment."
                : "Nothing is ordered until you approve. Simulated, no payment."}
          </p>
        </>
      ) : d.status === "approved" && placed && restaurant && !handoff && !lock ? (
        <div className="mt-3 rounded-xl bg-sunken/70 px-3 py-2.5">
          <AcceptanceSequence order={placed} restaurant={restaurant} animate={justApproved} compact>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-brand">
                {placed.table ? `Table ${placed.table} · code` : d.mode === "in-store" ? "Counter code" : "Pickup code"} {placed.pickupCode}
              </p>
              <Link to={`/macrotable/ticket/${placed.orderNumber}`} className="text-[12.5px] font-semibold text-brand underline underline-offset-2">
                Kitchen ticket
              </Link>
            </div>
          </AcceptanceSequence>
          {paidWith && (
            <p data-payment-line className="mt-1.5 text-[12px] text-ink-3">
              Payment · {paymentLabel(paidWith, d.mode === "in-store" ? "in-store" : "pickup")}
            </p>
          )}
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
  const { lock } = useAppState();
  const m = state.scannedMenu;
  if (!m) return <p className="text-[12.5px] text-ink-3">Scan deleted.</p>;
  const rec = state.currentRecommendation;
  if (!lock) return <FullScannedMenu menu={m} best={rec?.mealId.startsWith("scan:") ? { id: rec.mealId, meets: rec.meetsTarget } : undefined} />;
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

const NUTRIENTS = [
  ["calories", "kcal", "Calories"],
  ["protein", "g protein", "Protein"],
  ["carbs", "g carbs", "Carbs"],
  ["fat", "g fat", "Fat"],
] as const;

/** Value for one nutrient of a scanned dish: "≈" unless that number was printed on the menu. */
const scannedValue = (i: ScannedItem, k: (typeof NUTRIENTS)[number][0]) => `${i.printedFields.includes(k) ? "" : "≈ "}${i.nutrition![k]}`;

/** How a scanned dish's nutrition was obtained, in the Add-to-today confirmation (the label itself is unchanged). */
const SCAN_CONFIDENCE: Record<Exclude<ScannedItem["provenance"], "insufficient">, string> = {
  "menu-read": "Printed on the menu you scanned. Not verified by the restaurant.",
  estimated: "Estimated from the scanned menu. Actual nutrition may differ.",
};

/**
 * "Add to today" for one dish on a scanned (external) menu: the user records the meal they actually chose.
 * Nothing happens until they confirm. It reuses the daily ledger's non-order entry (no order, ticket or
 * payment, nothing sent), keeps the dish's ORIGINAL provenance, and is idempotent per dish and scan, so a
 * repeated tap, a refresh or the agent's counter hand-off for the same dish never counts it twice.
 */
function AddToToday({ item, scanId }: { item: ScannedItem; scanId: string }) {
  const { recordCounterHandoff } = useAppState(); // re-renders when the ledger changes
  const sheet = useSheet();
  const entry = scanMealEntry(item, scanId);
  if (!entry)
    return (
      <p data-add-today="unavailable" className="mt-1 text-[12px] text-ink-3">
        Not enough nutrition information to add this to today reliably.
      </p>
    );
  if (isLogged(entry.id))
    return (
      <p data-add-today="added" className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand">
        <Icon name="check" size={13} stroke={2.6} /> Added to today
      </p>
    );
  const add = () => {
    recordCounterHandoff({ ...entry, at: Date.now() }); // deterministic ledger update; idempotent per dish
    sheet.close();
  };
  return (
    <button
      type="button"
      data-add-today="offer"
      onClick={() => sheet.openCustom("Add this meal to today?", <AddToTodayConfirm item={item} onCancel={sheet.close} onAdd={add} />)}
      className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-[12.5px] font-semibold text-brand"
    >
      + Add to today
    </button>
  );
}

/** The confirmation shown before a scanned dish is added to today: name, macros (≈ = estimated), its own label. */
export function AddToTodayConfirm({ item, onCancel, onAdd }: { item: ScannedItem; onCancel: () => void; onAdd: () => void }) {
  if (item.provenance === "insufficient" || !item.nutrition) return null;
  return (
    <div data-add-today="confirm">
      <p className="text-[17px] font-semibold">{item.name}</p>
      <p className="tnum mt-1 text-[15px] text-ink">{NUTRIENTS.map(([k, unit]) => `${scannedValue(item, k)} ${unit}`).join(" · ")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProvenanceBadge provenance={item.provenance} size="sm" />
        <span className="text-[13px] text-ink-2">{SCAN_CONFIDENCE[item.provenance]}</span>
      </div>
      {item.printedFields.length < 4 && <p className="mt-1.5 text-[12.5px] text-ink-3">Values marked ≈ are estimates.</p>}
      <p className="mt-3 text-[12.5px] text-ink-3">You're logging this yourself: it isn't an order, and nothing is sent to the restaurant.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 text-[14px] font-medium text-ink-2">
          Cancel
        </button>
        <button type="button" onClick={onAdd} className="min-h-11 rounded-xl bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-hover">
          Add to today
        </button>
      </div>
    </div>
  );
}

const SCAN_NOTE: Record<ScannedItem["provenance"], string> = {
  "menu-read": "All four values are printed on the menu. Not verified by the restaurant.",
  estimated: "Values marked ≈ are estimated from the menu text and may differ. Unmarked values are printed on the menu.",
  insufficient: "Not enough information to estimate nutrition, so MacroTable won't recommend this dish.",
};

/**
 * Normal mode, after a menu scan: every dish read from the menu, under the best match. Only data
 * that was extracted is shown: no price → "Price not read", no defensible nutrition → "Nutrition
 * unavailable". Provenance per dish stays MENU-READ / ESTIMATED / INSUFFICIENT (never verified).
 */
export function FullScannedMenu({ menu, best }: { menu: ScannedMenu; best?: { id: string; meets: boolean } }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-2xl border border-line-2 bg-surface" aria-label="Full scanned menu" data-section="full-scanned-menu">
      <div className="border-b border-line-2 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Full scanned menu · {menu.items.length} {menu.items.length === 1 ? "dish" : "dishes"}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3">
          {menu.restaurantName ? `${menu.restaurantName} · ` : ""}
          {menu.source === "simulated" ? "offline sample, not read from your photo" : "read by Gemini from your photo"}
        </p>
      </div>
      <ul className="divide-y divide-line-2">
        {menu.items.map((i) => {
          const expanded = open === i.id;
          const isBest = best?.id === `scan:${i.id}`;
          return (
            <li key={i.id} className="px-4 py-2.5" data-scan-item={i.id}>
              <div className="flex items-start gap-2">
                <button
                  onClick={() => setOpen(expanded ? null : i.id)}
                  aria-expanded={expanded}
                  className="min-h-11 min-w-0 flex-1 text-left"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] leading-snug font-semibold">
                      {i.name}
                      {isBest && (
                        // Same wording as the recommendation card above: a dish that misses the target is the closest option, not a match.
                        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 align-middle text-[10.5px] font-bold ${best!.meets ? "bg-brand-soft text-brand" : "bg-sunken text-ink-2"}`}>
                          {best!.meets ? "BEST MATCH" : "CLOSEST OPTION"}
                        </span>
                      )}
                    </span>
                    <span className="tnum shrink-0 text-[13.5px] font-semibold">{i.price !== null ? euro(i.price) : <span className="font-normal text-ink-3">Price not read</span>}</span>
                  </span>
                  <span className="tnum mt-0.5 block text-[12.5px] text-ink-2">
                    {i.nutrition ? NUTRIENTS.map(([k, unit]) => `${scannedValue(i, k)} ${unit}`).join(" · ") : "Nutrition unavailable"}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-ink-3">
                    {expanded ? "Hide details" : "Details"}
                    <Icon name="chevronDown" size={12} className={expanded ? "rotate-180" : ""} />
                  </span>
                </button>
                <ProvenanceBadge provenance={i.provenance} size="sm" />
              </div>
              <AddToToday item={i} scanId={menu.scanId} />
              {expanded && (
                <div className="mt-1 mb-1 rounded-xl bg-sunken/70 px-3 py-2.5 text-[12.5px] text-ink-2">
                  {i.description && <p className="mb-1.5 text-ink">{i.description}</p>}
                  {i.nutrition && (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {NUTRIENTS.map(([k, unit, label]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <dt className="text-ink-3">{label}</dt>
                          <dd className="tnum">
                            {scannedValue(i, k)} {unit.split(" ")[0]} <span className="text-[11px] text-ink-3">{i.printedFields.includes(k) ? "printed" : "estimated"}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {i.markedDietary.length > 0 && <p className="mt-1.5">Marked on the menu: {i.markedDietary.join(", ")}</p>}
                  {i.visibleModifiers.length > 0 && <p className="mt-1.5">Options listed on the menu: {i.visibleModifiers.join(" · ")}</p>}
                  <p className="mt-1.5 text-[12px] text-ink-3">{SCAN_NOTE[i.provenance]}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {menu.uncertainties.length > 0 && <p className="border-t border-line-2 px-4 py-2 text-[12px] text-ink-3">Uncertain: {menu.uncertainties.join(" · ")}</p>}
    </section>
  );
}
