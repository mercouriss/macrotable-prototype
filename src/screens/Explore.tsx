import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { approx } from "../components/ProvenanceBadge";
import { RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Card } from "../components/ui";
import { DEMO_AREA, distanceFromUser, formatDistance } from "../data/geo";
import { catalog, isStudyScope } from "../data/restaurants";
import { euro } from "../lib/format";
import { compareConfigs, runSearch, type ScoredConfiguration } from "../lib/optimizer";
import { REALISM_DISCLOSURE } from "../lib/provenance";
import { useAppState } from "../state/AppState";
import type { Restaurant } from "../types";

const LeafletMap = lazy(() => import("../explore/LeafletMap"));

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type FilterId = "all" | "fit" | "protein" | "budget" | "veg" | "demo" | "real";
const FILTERS: { id: FilterId; label: string; needsMenu?: boolean }[] = [
  { id: "all", label: "All" },
  { id: "fit", label: "Best macro fit", needsMenu: true },
  { id: "protein", label: "High protein", needsMenu: true },
  { id: "budget", label: "Within budget", needsMenu: true },
  { id: "veg", label: "Vegetarian", needsMenu: true },
  { id: "demo", label: "MacroTable Demo" },
  { id: "real", label: "Real restaurants" },
];

interface Place {
  r: Restaurant;
  km: number;
  best?: ScoredConfiguration;
  veg: boolean;
}

/** Explore: search + filters → map (real + demo pins) ↔ synced cards → restaurant / Ask MacroAgent. One dataset drives everything. */
export function Explore() {
  const { target, prefs } = useAppState();
  const { openCustom } = useSheet();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const study = isStudyScope();

  const places = useMemo<Place[]>(
    () =>
      catalog().map((r) => ({
        r,
        km: distanceFromUser(r.location),
        best: r.meals.length ? runSearch(target, prefs, r.id).ranked[0] : undefined,
        veg: r.meals.some((m) => m.available && (m.dietaryTags.includes("vegetarian") || m.dietaryTags.includes("vegan"))),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, prefs, study],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = places.filter(({ r }) => !q || r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q));
    const byDistance = (a: Place, b: Place) => a.km - b.km;
    switch (filter) {
      case "fit":
        return list.filter((p) => p.best?.meets).sort((a, b) => compareConfigs(a.best!, b.best!, target.priority));
      case "protein":
        return list.filter((p) => p.best && p.best.nutrition.protein >= target.protein).sort((a, b) => b.best!.nutrition.protein - a.best!.nutrition.protein);
      case "budget":
        return list.filter((p) => p.best).sort((a, b) => a.best!.price - b.best!.price);
      case "veg":
        return list.filter((p) => p.veg).sort(byDistance);
      case "demo":
        list = list.filter((p) => p.r.identity === "demo");
        break;
      case "real":
        list = list.filter((p) => p.r.identity === "real");
        break;
    }
    return list.sort(byDistance);
  }, [places, filter, query, target.priority, target.protein]);

  const needsMenu = FILTERS.find((f) => f.id === filter)?.needsMenu;
  const realCount = places.filter((p) => p.r.identity === "real").length;

  // Map pin → selected card comes into view.
  useEffect(() => {
    if (selected) cardRefs.current[selected]?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [selected]);

  return (
    <Screen nav bleed>
      <div className="px-5 pt-6">
        <h1 className="font-display text-[27px] font-semibold tracking-[-0.02em]">Explore</h1>
        <p className="mt-0.5 text-[13.5px] text-ink-3">
          {places.length} places near {DEMO_AREA.label} <span className="text-ink-3/80">(demo location)</span>
        </p>
        <label className="relative mt-4 block">
          <span className="sr-only">Search restaurants</span>
          <Icon name="search" size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search restaurants or cuisines"
            className="min-h-11 w-full rounded-2xl border border-line bg-surface pr-4 pl-10 text-[16px] outline-none placeholder:text-ink-3 focus:border-ink"
          />
        </label>
      </div>

      <div className="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto px-5" role="group" aria-label="Filter restaurants">
        {FILTERS.filter((f) => !(study && f.id === "real")).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${filter === f.id ? "bg-ink text-white" : "border border-line bg-surface text-ink-2 hover:bg-sunken"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mx-5 mt-3 h-[232px] overflow-hidden rounded-[22px] border border-line-2 shadow-card">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-sunken" />}>
          <LeafletMap restaurants={visible.map((p) => p.r)} selected={selected} onSelect={setSelected} />
        </Suspense>
      </div>
      <button onClick={() => openCustom("About these restaurants", <p className="text-[14px] leading-relaxed">{REALISM_DISCLOSURE}</p>)} className="mx-5 mt-2 flex min-h-8 items-center gap-1.5 text-left text-[12px] text-ink-3 hover:text-ink-2">
        <Icon name="info" size={13} className="shrink-0" />
        DEMO brands are fictional · real places aren't affiliated
      </button>

      {needsMenu && realCount > 0 && !study && (
        <p className="mx-5 mt-2 rounded-2xl bg-sunken px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-2">
          Filtering by nutrition uses menu data, so the {realCount} real restaurants aren't included. Scan a menu there to check your fit.
        </p>
      )}

      {visible.length === 0 ? (
        <div className="mx-5 mt-8 mb-10 text-center">
          <p className="text-[15px] font-semibold">No places match</p>
          <p className="mt-1 text-[13.5px] text-ink-3">Try another search or filter.</p>
          <button
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            className="mt-3 min-h-10 rounded-full border border-line bg-surface px-4 text-[13.5px] font-semibold"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="mt-3 mb-6 space-y-3 px-5" aria-label={`${visible.length} restaurants`}>
          {visible.map((p) => (
            <li key={p.r.id} ref={(el) => void (cardRefs.current[p.r.id] = el)} className="scroll-mt-4">
              <PlaceCard place={p} selected={selected === p.r.id} onSelect={() => setSelected(p.r.id)} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

function PlaceCard({ place, selected, onSelect }: { place: Place; selected: boolean; onSelect: () => void }) {
  const { r, km, best } = place;
  return (
    <Card className={`p-4 transition-shadow ${selected ? "ring-2 ring-ink/70" : ""}`}>
      <button className="flex w-full items-center gap-3 text-left" onClick={onSelect} aria-pressed={selected}>
        <BrandMark restaurant={r} size={42} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold tracking-tight">{r.name}</span>
          <span className="tnum block truncate text-[12.5px] text-ink-3">
            {r.cuisine} · {formatDistance(km)}
            {r.priceRange ? ` · ${r.priceRange}` : ""}
          </span>
        </span>
      </button>
      {r.identity === "real" ? (
        <RealBody r={r} />
      ) : (
        <>
          <div className="mt-2.5">
            <RestaurantBadge restaurant={r} size="sm" />
          </div>
          <DemoBody r={r} best={best} />
        </>
      )}
    </Card>
  );
}

function DemoBody({ r, best }: { r: Restaurant; best?: ScoredConfiguration }) {
  const { target } = useAppState();
  return (
    <>
      {best ? (
        <p className="tnum mt-2.5 text-[13px] leading-snug text-ink-2">
          <span className={`inline-flex items-center gap-1 font-semibold ${best.meets ? "text-brand" : "text-ink-2"}`}>
            <Icon name={best.meets ? "check" : "minus"} size={13} stroke={2.6} />
            {best.meets ? "Fits your target" : "Closest option"}
          </span>
          <span className="text-ink-3"> · </span>
          {best.meal.name}
          <span className="block text-ink-3">
            {approx(best.meal.provenance)}
            {best.nutrition.calories} kcal · {approx(best.meal.provenance)}
            {best.nutrition.protein} g protein · {euro(best.price)}
          </span>
        </p>
      ) : (
        <p className="mt-2.5 text-[13px] text-ink-3">Nothing here within €{target.maxBudget} for your preferences</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to={`/macrotable/explore/${r.id}`}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface text-[14px] font-semibold text-ink-2 hover:bg-sunken"
        >
          <Icon name="receipt" size={16} /> View menu
        </Link>
        <AskAgentButton context={{ kind: "restaurant", id: r.id, entry: "explore" }} label="Ask Agent" />
      </div>
    </>
  );
}

function RealBody({ r }: { r: Restaurant }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <RestaurantBadge restaurant={r} size="sm" />
        <button
          onClick={() => navigate(`/macrotable/scan?type=menu&restaurant=${r.id}`, { state: { userTap: true } })}
          aria-label={`Scan the menu at ${r.name}`}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft/60 px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft"
        >
          <Icon name="camera" size={15} /> Scan menu
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-3">No menu data yet · scan the menu to check your fit.</p>
    </>
  );
}
