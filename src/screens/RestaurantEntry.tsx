import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { LEVEL_META } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { Button, Card } from "../components/ui";
import { getScopedRestaurant } from "../data/restaurants";
import { fulfilmentLabel, normalizeTable, offersDineIn, TABLES } from "../lib/fulfillment";
import { markQrEntry } from "../lib/qrEntry";
import type { IntegrationLevel, ServiceMode } from "../types";
import { useAppState } from "../state/AppState";
import { NotFound } from "./NotFound";

const CHECKS: Record<IntegrationLevel, { ok: boolean; text: string }[]> = {
  3: [
    { ok: true, text: "Menu loaded" },
    { ok: true, text: "Nutrition available · verified recipes" },
    { ok: true, text: "MacroTable partner" },
  ],
  2: [
    { ok: true, text: "Menu loaded" },
    { ok: true, text: "Nutrition available · official values" },
    { ok: true, text: "Supported modifications available" },
  ],
  1: [
    { ok: true, text: "Public menu found" },
    { ok: false, text: "Nutrition estimated from menu text" },
    { ok: false, text: "Not integrated — hand-off only" },
  ],
};

/**
 * Landing for a restaurant's QR code: /r/<restaurantId> (the Demo Day presentation QR opens /r/fitkitchen).
 * Reached from the in-app scanner or by scanning a demo QR with the phone's own camera. The QR names the
 * restaurant only; outside research trials a table-service restaurant lets the user pick Dine in (+ table)
 * or Pickup here, which Review and the agent's order card then use (and the user can still change).
 */
export function RestaurantEntry() {
  const { restaurantId } = useParams();
  const r = getScopedRestaurant(restaurantId);
  const navigate = useNavigate();
  const { log, lock, dining, setDining } = useAppState();

  useEffect(() => {
    if (r) log("restaurant_detected", { detail: { restaurantId: r.id } });
  }, [r, log]);
  // Outside trials: this tab came in through a restaurant QR, so Home won't detour into onboarding (lib/qrEntry).
  useEffect(() => {
    if (r && !lock) markQrEntry(r.id);
  }, [r, lock]);

  if (!r) return <NotFound />;
  const real = r.identity === "real";
  const dineInFlow = !lock && !real && offersDineIn(r);
  const choice = dineInFlow && dining?.restaurantId === r.id ? dining : null;
  const choose = (mode: ServiceMode, table?: string) => setDining({ restaurantId: r.id, mode, table });
  return (
    <Screen
      title="Restaurant QR"
      back="/macrotable"
      footer={
        <div className="space-y-2">
          {real ? (
            <Button icon="camera" onClick={() => navigate(`/macrotable/scan?type=menu&restaurant=${r.id}`, { state: { userTap: true } })}>
              Scan the menu here
            </Button>
          ) : (
            <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "qr" }} variant="primary" label="Open MacroAgent here" />
          )}
          <Button variant="ghost" onClick={() => navigate(`/macrotable/explore/${r.id}`)}>
            View full menu
          </Button>
        </div>
      }
    >
      <div className="animate-rise pt-6">
        <p className="text-[13px] font-medium text-ink-3">Restaurant detected</p>
        {lock ? (
          <h2 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.02em]">{r.name}</h2>
        ) : (
          <h2 className="mt-1 flex items-center gap-3 font-display text-[30px] font-semibold tracking-[-0.02em]">
            <BrandMark restaurant={r} size={40} />
            <span className="min-w-0">{r.name}</span>
          </h2>
        )}
        <p className="mt-1 text-[14px] text-ink-2">
          {r.cuisine} · {real ? "Real restaurant · not affiliated" : `${LEVEL_META[r.integrationLevel].short} (demo)`}
        </p>
        <Card className="mt-6 divide-y divide-line-2 px-5">
          {(real
            ? [
                { ok: true, text: "Real restaurant found" },
                { ok: false, text: "Not affiliated with MacroTable — no menu data" },
                { ok: false, text: "Scan the menu to continue" },
              ]
            : CHECKS[r.integrationLevel]
          ).map((c) => (
            <div key={c.text} className="flex min-h-14 items-center gap-3 py-3">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${c.ok ? "bg-brand-soft text-brand" : "bg-estimated-soft text-estimated"}`}
                aria-hidden="true"
              >
                <Icon name={c.ok ? "check" : "alert"} size={15} stroke={2.6} />
              </span>
              <span className="text-[15px] font-medium">{c.text}</span>
              <span className="sr-only">{c.ok ? "(yes)" : "(limited)"}</span>
            </div>
          ))}
        </Card>
        {dineInFlow && (
          <fieldset className="mt-6">
            <legend className="mb-2 text-[13px] font-medium text-ink-2">How are you eating here?</legend>
            <div role="radiogroup" aria-label="Dining option" className="grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1">
              {(
                [
                  ["in-store", "Dine in"],
                  ["pickup", "Pickup"],
                ] as [ServiceMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={choice?.mode === m}
                  onClick={() => choose(m, choice?.table)}
                  className={`min-h-11 rounded-xl text-[13.5px] font-semibold ${choice?.mode === m ? "bg-surface text-ink shadow-card" : "text-ink-3"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {choice?.mode === "in-store" && (
              <label className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
                <span className="text-[14.5px] font-semibold">Your table</span>
                <select
                  aria-label="Your table"
                  value={normalizeTable(choice.table) ?? ""}
                  onChange={(e) => choose("in-store", e.target.value || undefined)}
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
            {choice && (
              <p data-fulfilment className="mt-3 text-center text-[12.5px] font-semibold tracking-[0.08em] text-ink-2">
                {choice.mode === "in-store" && !normalizeTable(choice.table) ? "DINE IN · CHOOSE YOUR TABLE" : fulfilmentLabel({ serviceMode: choice.mode, table: normalizeTable(choice.table) ?? undefined })}
              </p>
            )}
            <p className="mt-2 text-[12.5px] text-ink-3">You can change this before you approve an order.</p>
          </fieldset>
        )}
        <p className="mt-4 text-[12.5px] leading-snug text-ink-3">
          {real ? "Only this restaurant's name and location are real. MacroTable has no relationship with it." : "Demo restaurant — its integration, menu, nutrition and ordering are simulated."}
        </p>
      </div>
    </Screen>
  );
}
