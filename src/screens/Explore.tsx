import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AskAgentButton } from "../components/AskAgentButton";
import { FoodFiltersPanel, SHOW_LABELS } from "../components/FoodFilters";
import { BrandMark } from "../components/BrandMark";
import { FoodIcons } from "../components/FoodIcon";
import { Icon } from "../components/Icon";
import { approx } from "../components/ProvenanceBadge";
import { RestaurantBadge } from "../components/RestaurantBadge";
import { Screen } from "../components/Screen";
import { useSheet } from "../components/Sheet";
import { Card } from "../components/ui";
import { DEMO_AREA, distanceFromUser, formatDistance } from "../data/geo";
import { catalog, isStudyScope } from "../data/restaurants";
import { activeCount, foodLabel, foodPredicate, matchReason, matchRestaurant, type Discovery, type ExploreShow, type FoodFilter, type RestaurantMatch } from "../lib/discovery";
import { euro } from "../lib/format";
import { compareConfigs, runSearch, type ScoredConfiguration } from "../lib/optimizer";
import { REALISM_DISCLOSURE } from "../lib/provenance";
import { useAppState } from "../state/AppState";
import type { Preferences, Restaurant, UserTarget } from "../types";

const LeafletMap = lazy(() => import("../explore/LeafletMap"));

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type FilterId = ExploreShow;
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
  /** Normal mode: why it matched the search / food filter. */
  match?: RestaurantMatch;
}

/** Every place with its best configuration (among the dishes the food filter allows, if any). */
function buildPlaces(target: UserTarget, prefs: Preferences, food?: FoodFilter): Place[] {
  const only = food && foodPredicate(food);
  return catalog().map((r) => ({
    r,
    km: distanceFromUser(r.location),
    best: r.meals.length ? runSearch(target, prefs, r.id, only).ranked[0] : undefined,
    veg: r.meals.some((m) => m.available && (m.dietaryTags.includes("vegetarian") || m.dietaryTags.includes("vegan"))),
  }));
}

/** The "Show" view: unchanged semantics and ordering from the original chip row. */
function applyShow(list: Place[], filter: FilterId, target: UserTarget): Place[] {
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
}

/** Normal mode: search text + food filter + Show view, one deterministic result set for the map AND the list. */
export function discover(target: UserTarget, prefs: Preferences, query: string, d: Discovery): Place[] {
  const matched = buildPlaces(target, prefs, d.food)
    .map((p) => ({ ...p, match: matchRestaurant(p.r, query, d.food) }))
    .filter((p) => p.match.match);
  const shown = applyShow(matched, d.show, target);
  // With search words, name matches come first, then cuisine/dish-type matches, then description-only ones
  // (a stable sort: the Show view's order is kept within each group). The set itself is unchanged.
  return query.trim() ? shown.sort((a, b) => a.match!.tier - b.match!.tier) : shown;
}

/** Explore: search + filters → map (real + demo pins) ↔ synced cards → restaurant / Ask MacroAgent. One dataset drives everything. */
export function Explore() {
  const { target, prefs, lock, discovery, setDiscovery } = useAppState();
  const { openCustom, close } = useSheet();
  const [selected, setSelected] = useState<string | null>(null);
  const [legacyFilter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const study = isStudyScope();
  // Research trials keep the original Explore exactly (name/cuisine search + chip row); normal mode gets
  // dish-aware search and the Filters sheet, sharing its food filter with Find My Next Meal.
  const legacy = !!lock;
  const filter = legacy ? legacyFilter : discovery.show;

  const places = useMemo<Place[]>(
    () => buildPlaces(target, prefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, prefs, study],
  );

  const visible = useMemo(() => {
    if (!legacy) return discover(target, prefs, query, discovery);
    const q = query.trim().toLowerCase();
    return applyShow(
      places.filter(({ r }) => !q || r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q)),
      legacyFilter,
      target,
    );
  }, [legacy, places, legacyFilter, query, target, prefs, discovery]);

  const needsMenu = FILTERS.find((f) => f.id === filter)?.needsMenu;
  const realCount = places.filter((p) => p.r.identity === "real").length;
  const activeFilters = legacy ? 0 : activeCount(discovery.food) + (discovery.show !== "all" ? 1 : 0);
  const activeSummary = legacy ? "" : [foodLabel(discovery.food), discovery.show !== "all" ? SHOW_LABELS[discovery.show] : ""].filter(Boolean).join(" · ");
  const clearAll = () => {
    setQuery("");
    setDiscovery({ food: { cuisines: [], dishes: [] }, show: "all" });
  };
  const openFilters = () =>
    openCustom("Filters", <FoodFiltersPanel mode="explore" hideReal={study} count={(d) => discover(target, prefs, query, d).length} onDone={close} />, { stickyHeader: true });

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
        {legacy ? (
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
        ) : (
          <div className="mt-4 flex gap-2">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search dishes, cuisines or restaurants</span>
              <Icon name="search" size={17} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search dishes, cuisines, restaurants"
                className="min-h-11 w-full rounded-2xl border border-line bg-surface pr-3 pl-10 text-[16px] outline-none placeholder:text-ink-3 focus:border-ink"
              />
            </label>
            <button
              type="button"
              onClick={openFilters}
              aria-haspopup="dialog"
              aria-label={activeFilters ? `Filters, ${activeFilters} active` : "Filters"}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 text-[14px] font-semibold transition-colors ${
                activeFilters ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:bg-sunken"
              }`}
            >
              <Icon name="sliders" size={16} />
              {activeFilters ? `Filters (${activeFilters})` : "Filters"}
            </button>
          </div>
        )}
        {!legacy && (activeSummary || query.trim()) && (
          <p className="mt-2 flex min-h-8 items-center gap-x-2 text-[13px] text-ink-2" data-discovery-summary>
            <span className="tnum shrink-0 font-semibold text-ink">
              {visible.length} {visible.length === 1 ? "place" : "places"}
            </span>
            {activeSummary && (
              // One row: a long choice wraps to two lines at most (the Filters sheet lists it in full).
              <span className="flex min-w-0 items-center gap-1.5 text-ink-3">
                <span className="shrink-0">·</span>
                <FoodIcons ids={discovery.food.dishes} size={22} />
                <span className="line-clamp-2 min-w-0 leading-snug">{activeSummary}</span>
              </span>
            )}
            <button type="button" onClick={clearAll} className="ml-auto min-h-8 shrink-0 rounded-full px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft">
              Clear
            </button>
          </p>
        )}
      </div>

      {legacy && (
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
      )}

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

      {visible.length === 0 && legacy ? (
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
      ) : visible.length === 0 ? (
        <div className="mx-5 mt-8 mb-10 text-center" data-discovery-empty>
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-sunken text-ink-3" aria-hidden="true">
            <Icon name="search" size={20} />
          </span>
          <p className="mt-3 text-[16px] font-semibold">No matching restaurants</p>
          <p className="mt-1 text-[13.5px] text-ink-3">Try clearing a filter or searching for something else.</p>
          <button onClick={clearAll} className="mt-4 min-h-11 rounded-full border border-line bg-surface px-5 text-[14px] font-semibold text-ink hover:bg-sunken">
            Clear search and filters
          </button>
        </div>
      ) : (
        <ul className="mt-3 mb-6 space-y-3 px-5" aria-label={`${visible.length} restaurants`}>
          {visible.map((p) => (
            <li key={p.r.id} ref={(el) => void (cardRefs.current[p.r.id] = el)} className="scroll-mt-4">
              <PlaceCard place={p} selected={selected === p.r.id} reason={p.match ? matchReason(p.match, p.r, discovery.food) : null} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

/**
 * The whole card opens the restaurant (single tap/click): the name link's ::after covers the card.
 * Inner actions (badge, View menu, Ask Agent, Scan menu) sit above that overlay (relative z-10), so
 * they do only their own thing and no interactive element is nested inside another.
 */
function PlaceCard({ place, selected, reason }: { place: Place; selected: boolean; reason?: string | null }) {
  const { r, km, best } = place;
  return (
    <Card
      className={`relative p-4 transition-[box-shadow,transform,background-color] duration-150 hover:bg-surface hover:shadow-lift active:scale-[0.99] has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-brand ${selected ? "ring-2 ring-ink/70" : ""}`}
    >
      <div className="flex w-full items-center gap-3">
        <BrandMark restaurant={r} size={42} />
        <span className="min-w-0 flex-1">
          <Link
            to={`/macrotable/explore/${r.id}`}
            data-card-link
            aria-label={`${r.name}: open ${r.identity === "real" ? "details (real restaurant, not affiliated)" : "menu (demo restaurant)"}`}
            className="block truncate text-[16px] font-semibold tracking-tight outline-none after:absolute after:inset-0 after:rounded-[22px] after:content-['']"
          >
            {r.name}
          </Link>
          <span className="tnum block truncate text-[12.5px] text-ink-3">
            {r.cuisine} · {formatDistance(km)}
            {r.priceRange ? ` · ${r.priceRange}` : ""}
          </span>
        </span>
        <Icon name="chevronRight" size={18} className="shrink-0 text-ink-3" />
      </div>
      {reason && (
        <p data-match-reason className="mt-2 flex items-start gap-1.5 rounded-xl bg-sunken/70 px-2.5 py-1.5 text-[12.5px] leading-snug text-ink-2">
          <Icon name="search" size={13} className="mt-[2px] shrink-0 text-ink-3" />
          <span className="min-w-0">{reason}</span>
        </p>
      )}
      {r.identity === "real" ? (
        <RealBody r={r} />
      ) : (
        <>
          <div className="relative z-10 mt-2.5 w-fit">
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
      <div className="relative z-10 mt-3 grid grid-cols-2 gap-2">
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
        <span className="relative z-10">
          <RestaurantBadge restaurant={r} size="sm" />
        </span>
        <button
          onClick={() => navigate(`/macrotable/scan?type=menu&restaurant=${r.id}`, { state: { userTap: true } })}
          aria-label={`Scan the menu at ${r.name}`}
          className="relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft/60 px-3 text-[13px] font-semibold text-brand hover:bg-brand-soft"
        >
          <Icon name="camera" size={15} /> Scan menu
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-3">No menu data yet · scan the menu to check your fit.</p>
    </>
  );
}
