import { Link, Navigate, useNavigate } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { MacroSummary } from "../components/MacroSummary";
import { Plate } from "../components/Plate";
import { approx } from "../components/ProvenanceBadge";
import { Screen } from "../components/Screen";
import { Button, Card, Eyebrow } from "../components/ui";
import { distanceFromUser, formatDistance } from "../data/geo";
import { getMeal } from "../data/restaurants";
import { PERSONA } from "../data/scenarios";
import { euro, euroShort, greeting } from "../lib/format";
import type { ScoredConfiguration } from "../lib/optimizer";
import { useSavedMeals } from "../lib/saved";
import { useAppState } from "../state/AppState";
import { useSearch } from "../state/useMealSelection";

/** Product home: what can MacroTable do for me right now? */
export function Home() {
  const { target, settings, lock, log, selectMeal } = useAppState();
  const navigate = useNavigate();
  const search = useSearch();
  const saved = useSavedMeals();
  /** `userTap` lets the scan screen open the camera straight away — permission is only ever requested after a tap. */
  const scan = (type: "menu" | "qr") => {
    log(type === "menu" ? "scan_menu_opened" : "scan_qr_opened");
    navigate(`/macrotable/scan?type=${type}`, { state: { userTap: true } });
  };
  const open = (c: ScoredConfiguration, rank: number) => {
    selectMeal({ mealId: c.meal.id, selections: c.selections, recommended: c.selections });
    log("recommendation_selected", { mealId: c.meal.id, detail: { rank, entry: "home" } });
    navigate(`/macrotable/meal/${c.meal.id}`);
  };

  // First run: short onboarding (skipped during research trials to keep timing comparable).
  if (!settings.onboardingDone && !lock) return <Navigate to="/welcome" replace />;

  const nearby = search.recommendations;
  const lastSaved = !lock ? saved.map((s) => ({ s, f: getMeal(s.mealId) })).find((x) => x.f) : undefined;

  return (
    <Screen nav>
      <div className="flex items-center justify-between pt-6">
        <div>
          <p className="text-[13px] font-medium text-ink-3">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-0.5 font-display text-[27px] leading-tight font-semibold tracking-[-0.02em]">
            {greeting()}, {PERSONA.name}
          </h1>
        </div>
        <Link to="/macrotable/profile" aria-label="Profile" className="grid h-11 w-11 place-items-center rounded-full bg-ink text-[15px] font-semibold text-white">
          {PERSONA.name[0]}
        </Link>
      </div>

      <Card as="section" className="mt-5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <Eyebrow>Remaining today</Eyebrow>
          <button onClick={() => navigate("/macrotable/preferences")} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[12.5px] font-medium text-ink-2 hover:bg-sunken">
            Budget <span className="tnum font-semibold text-ink">{euroShort(target.maxBudget)}</span>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <MacroSummary target={target} />
        <p className="mt-3 text-[11.5px] text-ink-3">Sample day — food logging is simulated in this prototype.</p>
      </Card>

      <div className="mt-4 space-y-2.5">
        <Button className="min-h-14 text-[16px]" onClick={() => navigate("/macrotable/preferences")}>
          <Icon name="search" size={19} /> Find my next meal
        </Button>
        <AskAgentButton label="Ask MacroAgent" className="min-h-12" />
      </div>

      {nearby.length > 0 && (
        <section className="mt-7" aria-labelledby="nearby-h">
          <div className="flex items-baseline justify-between">
            <h2 id="nearby-h" className="text-[16px] font-semibold tracking-tight">
              Good options nearby
            </h2>
            <Link to="/macrotable/explore" className="inline-flex min-h-9 items-center text-[13px] font-semibold text-brand">
              Explore
            </Link>
          </div>
          <ul className="scrollbar-none -mx-5 mt-2 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-1">
            {nearby.map((c, i) => (
              <li key={c.meal.id} className="w-[228px] shrink-0 snap-start">
                <button onClick={() => open(c, i + 1)} className="block h-full w-full rounded-[20px] border border-line-2 bg-surface p-3.5 text-left shadow-card hover:bg-sunken/40">
                  <span className="flex items-center gap-2">
                    <BrandMark restaurant={c.restaurant} size={24} />
                    <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-2">{c.restaurant.name}</span>
                    <span className="tnum ml-auto shrink-0 text-[11.5px] text-ink-3">{formatDistance(distanceFromUser(c.restaurant.location))}</span>
                  </span>
                  <span className="mt-3 flex items-center gap-3">
                    <Plate palette={c.meal.palette} size={44} />
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-[14.5px] leading-snug font-semibold">{c.meal.name}</span>
                    </span>
                  </span>
                  <span className="tnum mt-3 block text-[12.5px] text-ink-2">
                    {approx(c.meal.provenance)}
                    {c.nutrition.calories} kcal · {approx(c.meal.provenance)}
                    {c.nutrition.protein} g · {euro(c.price)}
                  </span>
                  <span className={`mt-1 inline-flex items-center gap-1 text-[12px] font-semibold ${c.meets ? "text-brand" : "text-ink-3"}`}>
                    <Icon name={c.meets ? "check" : "minus"} size={12} stroke={2.6} />
                    {c.meets ? "Fits your target" : "Closest option"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lastSaved?.f && (
        <section className="mt-6" aria-labelledby="saved-h">
          <div className="flex items-baseline justify-between">
            <h2 id="saved-h" className="text-[16px] font-semibold tracking-tight">
              Saved
            </h2>
            <Link to="/macrotable/saved" className="inline-flex min-h-9 items-center text-[13px] font-semibold text-brand">
              All saved
            </Link>
          </div>
          <Link to="/macrotable/saved" className="mt-2 flex items-center gap-3 rounded-[20px] border border-line-2 bg-surface p-3.5 shadow-card hover:bg-sunken/40">
            <Plate palette={lastSaved.f.meal.palette} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold">{lastSaved.f.meal.name}</span>
              <span className="block truncate text-[12.5px] text-ink-3">{lastSaved.f.restaurant.name}</span>
            </span>
            <Icon name="chevronRight" size={17} className="text-ink-3" />
          </Link>
        </section>
      )}

      <section className="mt-6 mb-6" aria-label="Scan">
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => scan("menu")} className="flex min-h-[68px] flex-col items-start justify-center rounded-[20px] border border-line-2 bg-surface px-4 py-3 text-left shadow-card hover:bg-sunken/40">
            <Icon name="camera" size={19} className="text-ink-2" />
            <span className="mt-1.5 text-[14px] font-semibold">Scan a menu</span>
            <span className="text-[12px] text-ink-3">Any restaurant</span>
          </button>
          <button onClick={() => scan("qr")} className="flex min-h-[68px] flex-col items-start justify-center rounded-[20px] border border-line-2 bg-surface px-4 py-3 text-left shadow-card hover:bg-sunken/40">
            <Icon name="qr" size={19} className="text-ink-2" />
            <span className="mt-1.5 text-[14px] font-semibold">Scan table QR</span>
            <span className="text-[12px] text-ink-3">At a MacroTable place</span>
          </button>
        </div>
      </section>
    </Screen>
  );
}
