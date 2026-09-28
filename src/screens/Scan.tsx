import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LEVEL_META } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { Button, Card } from "../components/ui";
import { getRestaurant } from "../data/restaurants";
import { useAppState } from "../state/AppState";

/**
 * Simulated entry points (no camera, no QR library, no image recognition):
 *  - type=qr   → table QR at a MacroTable partner (FitKitchen, level 3)
 *  - type=menu → photo of a paper menu at an unaffiliated restaurant (Local Grill, level 1)
 */
export function Scan() {
  const [params] = useSearchParams();
  const isMenu = params.get("type") === "menu";
  const restaurant = getRestaurant(isMenu ? "localgrill" : "fitkitchen")!;
  const [detected, setDetected] = useState(false);
  const navigate = useNavigate();
  const { log } = useAppState();

  useEffect(() => {
    if (detected) return;
    const t = setTimeout(() => setDetected(true), 1700);
    return () => clearTimeout(t);
  }, [detected]);

  useEffect(() => {
    if (detected) log(isMenu ? "menu_scanned" : "qr_scanned", { detail: { restaurantId: restaurant.id } });
  }, [detected, isMenu, restaurant.id, log]);

  const checks = isMenu
    ? [
        { ok: true, text: `Menu read · ${restaurant.meals.length} items` },
        { ok: false, text: "Nutrition estimated from menu text" },
        { ok: false, text: "Not a MacroTable partner — hand-off only" },
      ]
    : [
        { ok: true, text: "Menu loaded" },
        { ok: true, text: "Nutrition available · verified recipes" },
        { ok: true, text: "MacroTable partner" },
      ];

  return (
    <Screen
      title={isMenu ? "Scan menu" : "Scan restaurant QR"}
      back="/macrotable"
      footer={
        detected ? (
          <Button onClick={() => navigate(`/macrotable/preferences?scope=${restaurant.id}`)}>Find what fits my macros</Button>
        ) : (
          <Button variant="ghost" onClick={() => setDetected(true)}>
            Simulate scan
          </Button>
        )
      }
    >
      {!detected ? (
        <div className="flex h-full flex-col items-center justify-center pb-10">
          <div className="relative h-[240px] w-[240px] overflow-hidden rounded-[32px] bg-ink" aria-hidden="true">
            <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 50% 40%, #5b6b62, #16181c 70%)" }} />
            {isMenu ? (
              <div className="absolute inset-10 rotate-[-4deg] rounded-md bg-[#f4efe4] p-4 opacity-90">
                {[70, 50, 80, 45, 65, 55].map((w, i) => (
                  <div key={i} className="mb-2.5 h-1.5 rounded-full bg-[#b8ad98]" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <div className="absolute inset-[62px] grid grid-cols-5 gap-1 opacity-90">
                {Array.from({ length: 25 }, (_, i) => (
                  <div key={i} className={`rounded-[2px] ${[0, 1, 5, 6, 3, 4, 8, 9, 15, 16, 20, 21, 12, 18, 24, 22].includes(i) ? "bg-white" : ""}`} />
                ))}
              </div>
            )}
            {[
              "top-4 left-4 border-t-[3px] border-l-[3px] rounded-tl-xl",
              "top-4 right-4 border-t-[3px] border-r-[3px] rounded-tr-xl",
              "bottom-4 left-4 border-b-[3px] border-l-[3px] rounded-bl-xl",
              "bottom-4 right-4 border-b-[3px] border-r-[3px] rounded-br-xl",
            ].map((c) => (
              <span key={c} className={`absolute h-8 w-8 border-white ${c}`} />
            ))}
            <div className="absolute inset-x-6 top-5 h-0.5 animate-scan rounded-full bg-[#7fd1ae] shadow-[0_0_12px_2px_rgb(127_209_174/0.7)]" />
          </div>
          <p className="mt-6 text-[15px] font-medium">{isMenu ? "Reading the menu…" : "Looking for a MacroTable code…"}</p>
          <p className="mt-1 text-[13px] text-ink-3">Simulated scan — no camera is used.</p>
        </div>
      ) : (
        <div className="animate-rise pt-6">
          <p className="text-[13px] font-medium text-ink-3">{isMenu ? "Menu recognised" : "Restaurant detected"}</p>
          <h2 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.02em]">{restaurant.name}</h2>
          <p className="mt-1 text-[14px] text-ink-2">
            {restaurant.cuisine} · {LEVEL_META[restaurant.integrationLevel].short}
          </p>
          <Card className="mt-6 divide-y divide-line-2 px-5">
            {checks.map((c) => (
              <div key={c.text} className="flex min-h-14 items-center gap-3 py-3">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${c.ok ? "bg-brand-soft text-brand" : "bg-estimated-soft text-estimated"}`}
                >
                  <Icon name={c.ok ? "check" : "alert"} size={15} stroke={2.6} />
                </span>
                <span className="text-[15px] font-medium">{c.text}</span>
                <span className="sr-only">{c.ok ? "(yes)" : "(limited)"}</span>
              </div>
            ))}
          </Card>
          {isMenu && (
            <p className="mt-4 text-[13px] leading-snug text-ink-3">
              MacroTable can recommend and estimate here, but it can't change dishes or send orders to this kitchen.
            </p>
          )}
        </div>
      )}
    </Screen>
  );
}
