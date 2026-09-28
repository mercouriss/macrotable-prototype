import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { Icon } from "../components/Icon";
import { LEVEL_META } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { Button, Card } from "../components/ui";
import { getRestaurant } from "../data/restaurants";
import type { IntegrationLevel } from "../types";
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
 * Landing for a restaurant's table QR code: /r/<restaurantId>.
 * Reached from the in-app scanner or by scanning a demo QR with the phone's own camera.
 */
export function RestaurantEntry() {
  const { restaurantId } = useParams();
  const r = getRestaurant(restaurantId);
  const navigate = useNavigate();
  const { log } = useAppState();

  useEffect(() => {
    if (r) log("restaurant_detected", { detail: { restaurantId: r.id } });
  }, [r, log]);

  if (!r) return <NotFound />;
  return (
    <Screen
      title="Restaurant QR"
      back="/macrotable"
      footer={
        <div className="space-y-2">
          <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "qr" }} variant="primary" label="Open MacroAgent here" />
          <Button variant="ghost" onClick={() => navigate(`/macrotable/explore/${r.id}`)}>
            View full menu
          </Button>
        </div>
      }
    >
      <div className="animate-rise pt-6">
        <p className="text-[13px] font-medium text-ink-3">Restaurant detected</p>
        <h2 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.02em]">{r.name}</h2>
        <p className="mt-1 text-[14px] text-ink-2">
          {r.cuisine} · {LEVEL_META[r.integrationLevel].short}
        </p>
        <Card className="mt-6 divide-y divide-line-2 px-5">
          {CHECKS[r.integrationLevel].map((c) => (
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
        <p className="mt-4 text-[12.5px] leading-snug text-ink-3">Demo restaurant — menu and nutrition data are simulated.</p>
      </div>
    </Screen>
  );
}
