import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FoodFiltersPanel } from "../src/components/FoodFilters";
import { hasFoodIcon } from "../src/components/FoodIcon";
import { SheetProvider } from "../src/components/Sheet";
import { catalog } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { STORAGE_KEYS, writeJSON } from "../src/lib/experiment";
import { cleanDiscovery, CUISINES, cuisinesOf, DISH_TYPES, dishTypesOf, foodPredicate, matchReason, matchRestaurant, NO_DISCOVERY, type Discovery, type FoodFilter } from "../src/lib/discovery";
import { runSearch } from "../src/lib/optimizer";
import { discover, Explore } from "../src/screens/Explore";
import { Failure } from "../src/screens/Failure";
import { Preferences } from "../src/screens/Preferences";
import { Results } from "../src/screens/Results";
import { AppStateProvider, useAppState } from "../src/state/AppState";
import type { Meal, Restaurant } from "../src/types";

/*
 * Food discovery (normal mode): deterministic search over restaurant + menu data, a Filters sheet
 * (Dish type · Cuisine · Show) shared with Find My Next Meal, which only narrows the optimizer's candidates.
 * Research trials keep the original Explore / Preferences / search exactly.
 */

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const A = SCENARIOS.A;
const F = (cuisines: string[] = [], dishes: string[] = []): FoodFilter => ({ cuisines, dishes });
const ids = (q: string, f: FoodFilter = F()) => catalog().filter((r) => matchRestaurant(r, q, f).match).map((r) => r.id);
const lockOf = { participantId: "P001", condition: "macrotable", scenarioId: "A", agentMode: "offline", sessionId: "s-fixed", startedAt: 1 };
const persist = (extra: Record<string, unknown>) => writeJSON(STORAGE_KEYS.state, { scenarioId: "A", target: A.target, prefs: A.preferences, selection: null, lock: null, ...extra });
const withSettings = () => writeJSON(STORAGE_KEYS.settings, { v: 2, onboardingDone: true });
const render = (el: ReturnType<typeof h>) => renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, el))));
let app: ReturnType<typeof useAppState>;
const Probe = () => ((app = useAppState()), null);
const load = () => (renderToString(h(AppStateProvider, null, h(Probe))), app);

describe("Search semantics: restaurant, cuisine and the actual dishes", () => {
  it("'pasta' matches by dishes, not by name: a restaurant whose name lacks 'pasta' is found through its penne", () => {
    const trattoria: Restaurant = {
      ...catalog().find((r) => r.id === "fitkitchen")!,
      id: "trattoria-test",
      name: "Trattoria Rosa",
      cuisine: "Neighbourhood kitchen",
      meals: [{ ...catalog().find((r) => r.id === "pastametrica")!.meals[0], id: "tr-penne", name: "Penne Arrabbiata", description: "Penne, tomato and chilli." } as Meal],
    };
    const m = matchRestaurant(trattoria, "pasta", F());
    expect(m.match).toBe(true);
    expect(m.dishes.map((d) => d.name)).toEqual(["Penne Arrabbiata"]);
    expect(matchReason(m, trattoria, F())).toBe("1 matching dish: Penne Arrabbiata");
  });

  it("in the real dataset, pasta words find Pasta Metrica through its dishes (penne / orzo), with the dishes shown", () => {
    expect(ids("pasta")).toEqual(["pastametrica"]);
    expect(ids("penne")).toEqual(["pastametrica"]);
    expect(ids("orzo")).toEqual(["pastametrica"]);
    const r = catalog().find((x) => x.id === "pastametrica")!;
    expect(matchReason(matchRestaurant(r, "pasta", F()), r, F())).toBe("3 matching dishes: Chicken Pesto Penne, Turkey Bolognese Rigatoni +1 more");
  });

  it("'chicken' surfaces every restaurant whose menu has a chicken dish, though no name contains 'chicken'", () => {
    const found = ids("chicken");
    expect(found).toEqual(["fitkitchen", "urbanbowl", "localgrill", "pastametrica", "saffronsteam", "citrinemezze", "kombutide", "ironleafgrill"]);
    expect(found.every((id) => !catalog().find((r) => r.id === id)!.name.toLowerCase().includes("chicken"))).toBe(true);
  });

  it("'salad' finds salad dishes and the real Sally's Salads (by its own label); 'burger' only the real burger place", () => {
    expect(ids("salad")).toEqual(expect.arrayContaining(["localgrill", "citrinemezze", "greeneryatlas", "sallys-salads-eur"]));
    expect(ids("burger")).toEqual(["macho-mama"]);
  });

  it("ordering: name matches first, then cuisine/dish type, then description-only; the set itself is unchanged", () => {
    const rice = discover(A.target, A.preferences, "rice", NO_DISCOVERY);
    expect(rice.map((p) => p.r.id)).toEqual(["saffronsteam", "kombutide", "fitkitchen", "urbanbowl"]);
    expect(rice.map((p) => p.match!.tier)).toEqual([0, 0, 2, 2]);
    expect(new Set(rice.map((p) => p.r.id))).toEqual(new Set(ids("rice")));
    // A restaurant's own name doesn't promote a dish that only mentions the word ("Local Grill" + a wrap).
    const grill = discover(A.target, A.preferences, "grill", NO_DISCOVERY);
    expect(grill.slice(0, 2).map((p) => p.r.id)).toEqual(["localgrill", "ironleafgrill"]);
    expect(matchReason(grill[0].match!, grill[0].r, F())).toBe("1 matching dish: Grilled Chicken Salad");
  });

  it("'salad' explains with actual salad dishes; description-only matches say so", () => {
    const cm = catalog().find((r) => r.id === "citrinemezze")!;
    expect(matchReason(matchRestaurant(cm, "salad", F()), cm, F())).toBe("1 matching dish: Halloumi & Lentil Salad"); // not the shawarma plate
    expect(discover(A.target, A.preferences, "salad", NO_DISCOVERY).every((p) => p.match!.tier === 0)).toBe(true);
    const hummus = discover(A.target, A.preferences, "hummus", NO_DISCOVERY);
    expect(hummus.map((p) => matchReason(p.match!, p.r, F()))).toEqual([
      "Mentioned in the description of: Falafel & Halloumi Bowl",
      "Mentioned in the description of: Chicken Shawarma Plate",
    ]);
  });

  it("restaurant-name search still works; multi-word queries need every word in one place", () => {
    expect(ids("fitkitchen")).toEqual(["fitkitchen"]);
    expect(ids("Mozza")).toEqual(["mozza-eur"]);
    expect(ids("chicken pasta")).toEqual(["pastametrica"]);
    expect(ids("sushi pasta")).toEqual([]);
  });

  it("uses only the dataset: no attribute is invented (cuisines from labels, dish types from dish names)", () => {
    const pm = catalog().find((r) => r.id === "pastametrica")!;
    expect(cuisinesOf(pm).map((c) => c.id)).toEqual(["italian"]); // its label is "Fresh pasta"
    expect(cuisinesOf(catalog().find((r) => r.id === "fitkitchen")!)).toEqual([]); // "Protein bowls": no cuisine claimed
    expect(dishTypesOf(pm.meals[1]).map((t) => t.id)).toEqual(["pasta"]); // Turkey Bolognese Rigatoni
    expect(readFileSync("src/lib/discovery.ts", "utf8")).not.toMatch(/gemini|fetch\(|runAgentTurn/i);
  });
});

describe("Cuisine and dish-type filters (and how they combine)", () => {
  it("cuisine filter: Italian → Pasta Metrica + the real Italian restaurants; never a bowl place", () => {
    const it = ids("", F(["italian"]));
    expect(it).toEqual(expect.arrayContaining(["pastametrica"]));
    expect(it).not.toContain("fitkitchen");
    for (const id of it) expect(cuisinesOf(catalog().find((r) => r.id === id)!).map((c) => c.id)).toContain("italian");
  });

  it("dish filter: Pasta → only restaurants with pasta dishes; a dish type is not a cuisine", () => {
    expect(ids("", F([], ["pasta"]))).toEqual(["pastametrica"]);
    expect(CUISINES.map((c) => c.id)).not.toContain("pasta");
    const salads = ids("", F([], ["salads"]));
    expect(salads).toEqual(expect.arrayContaining(["localgrill", "citrinemezze", "greeneryatlas", "sallys-salads-eur"]));
    const sally = catalog().find((r) => r.id === "sallys-salads-eur")!;
    expect(matchReason(matchRestaurant(sally, "", F([], ["salads"])), sally, F([], ["salads"]))).toBe("Salads restaurant · no menu data");
  });

  it("search + filters intersect: 'chicken' + Mediterranean → Citrine Mezze only; 'pasta' + Japanese → nothing", () => {
    expect(ids("chicken", F(["mediterranean"]))).toEqual(["citrinemezze"]);
    expect(ids("pasta", F(["japanese"]))).toEqual([]);
    expect(ids("", F(["italian"], ["pasta"]))).toEqual(["pastametrica"]);
  });

  it("Clear all restores every place; map and list come from one result set", () => {
    const all = discover(A.target, A.preferences, "", NO_DISCOVERY);
    expect(all).toHaveLength(catalog().length);
    expect(discover(A.target, A.preferences, "", { food: F([], ["pasta"]), show: "all" }).map((p) => p.r.id)).toEqual(["pastametrica"]);
    const src = readFileSync("src/screens/Explore.tsx", "utf8");
    expect(src).toMatch(/<LeafletMap restaurants=\{visible\.map\(\(p\) => p\.r\)\}/); // the map gets exactly the list's set
    expect(src).toMatch(/\{visible\.map\(\(p\) => \(\s*<li key=\{p\.r\.id\}/);
  });

  it("with a dish filter, each card's best option is a matching dish (Pasta → a pasta dish)", () => {
    const [pm] = discover(A.target, A.preferences, "", { food: F([], ["pasta"]), show: "all" });
    expect(dishTypesOf(pm.best!.meal).map((t) => t.id)).toContain("pasta");
  });
});

describe("Explore (normal mode)", () => {
  it("one Filters button (with the active count) instead of the permanent chip row; summary + Clear", () => {
    withSettings();
    persist({ discovery: { food: F(["italian"], ["pasta"]), show: "all" } });
    const html = render(h(Explore));
    expect(html).toMatch(/aria-label="Filters, 2 active"[^>]*>.*Filters \(2\)/s);
    expect(html).toContain('placeholder="Search dishes, cuisines, restaurants"');
    expect(html).not.toContain('aria-label="Filter restaurants"'); // the old chip row
    expect(html).toMatch(/data-discovery-summary[^>]*>.*1(<!-- -->)? (<!-- -->)?place.*Pasta · Italian.*Clear/s);
    expect(html).toMatch(/data-match-reason[^>]*>.*Pasta: Chicken Pesto Penne, Turkey Bolognese Rigatoni \+1 more/s);
  });

  it("nothing matches → 'No matching restaurants' with a way out (never a silent fallback)", () => {
    withSettings();
    persist({ discovery: { food: F(["japanese"], ["pasta"]), show: "all" } });
    const html = render(h(Explore));
    expect(html).toContain("No matching restaurants");
    expect(html).toContain("Try clearing a filter or searching for something else.");
    expect(html).toContain("Clear search and filters");
    expect(html).not.toContain("data-card-link");
  });

  it("the Filters sheet: labelled groups, radio/checkbox roles with state, 44 px chips, Clear all, Show N restaurants", () => {
    persist({ discovery: { food: F(["italian"], ["pasta"]), show: "fit" } });
    const html = render(h(FoodFiltersPanel, { mode: "explore", count: (d: Discovery) => discover(A.target, A.preferences, "", d).length, onDone: () => {} }));
    expect(html).toMatch(/role="radiogroup" aria-labelledby="ff-show"/);
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>.*Best macro fit/s);
    expect(html).toMatch(/role="group" aria-labelledby="ff-cuisine"/);
    expect(html).toMatch(/role="checkbox" aria-checked="true"[^>]*>.*Italian/s);
    expect(html).toMatch(/role="checkbox" aria-checked="true"[^>]*>.*Pasta/s);
    expect(html).not.toMatch(/>Mexican<|>American</); // not in the data
    expect(html.match(/role="(radio|checkbox)"[^>]*class="[^"]*min-h-11/g)!.length).toBeGreaterThan(10);
    expect(html).toMatch(/>Clear all</);
    expect(html).toMatch(/Show (<!-- -->)?1(<!-- -->)? (<!-- -->)?restaurant/);
    // Food intent first: Dish type, then Cuisine, then the Show views.
    expect(html.indexOf('id="ff-dish"')).toBeLessThan(html.indexOf('id="ff-cuisine"'));
    expect(html.indexOf('id="ff-cuisine"')).toBeLessThan(html.indexOf('id="ff-show"'));
    const meal = render(h(FoodFiltersPanel, { mode: "meal", onDone: () => {} }));
    expect(meal).not.toContain("ff-show");
    expect(meal.indexOf('id="ff-dish"')).toBeLessThan(meal.indexOf('id="ff-cuisine"'));
    // Title + Close stay in view (sticky header, 44 px Close) on both filter sheets; footer stays sticky too.
    expect(readFileSync("src/components/Sheet.tsx", "utf8")).toMatch(/content\.stickyHeader[\s\S]*?className="sticky -top-3[\s\S]*?aria-label="Close" className="grid h-11 w-11/);
    expect(readFileSync("src/screens/Explore.tsx", "utf8")).toMatch(/openCustom\("Filters", <FoodFiltersPanel[^\n]*\{ stickyHeader: true \}\)/);
    expect(readFileSync("src/screens/Preferences.tsx", "utf8")).toMatch(/<FoodFiltersPanel mode="meal"[^\n]*\{ stickyHeader: true \}\)/);
    expect(html).toMatch(/class="sticky -bottom-8/);
    // The sheet itself (shared): Escape and a labelled Close button close it.
    const sheet = readFileSync("src/components/Sheet.tsx", "utf8");
    expect(sheet).toMatch(/e\.key === "Escape" && close\(\)/);
    expect(sheet).toMatch(/aria-label="Close"/);
    expect(readFileSync("src/screens/Explore.tsx", "utf8")).toMatch(/aria-haspopup="dialog"/);
  });

  it("filter state persists across navigation/reload, Reset demo clears it, and stored junk is ignored", () => {
    persist({ discovery: { food: F([], ["pasta"]), show: "fit" } }); // what the app stores after a choice
    expect(load().discovery).toEqual({ food: F([], ["pasta"]), show: "fit" }); // a fresh load = after navigation/refresh
    // Reset demo commits the canonical state, which has no discovery (also checked in the browser smoke).
    expect(readFileSync("src/state/AppState.tsx", "utf8")).toMatch(/resetDemo: \(\) => \{[\s\S]*?commit\(\{ \.\.\.initialFor\("A"\), demoEpoch/);
    expect(readFileSync("src/state/AppState.tsx", "utf8")).toMatch(/function initialFor\(id: ScenarioId\): PersistedState \{[\s\S]*?return \{ scenarioId: id, target: \{ \.\.\.s\.target \}, prefs: \{ \.\.\.s\.preferences \}, selection: null, lock: null \};/);
    expect(cleanDiscovery({ food: { cuisines: ["klingon"], dishes: ["pasta", 3] }, show: "nope" })).toEqual({ food: F([], ["pasta"]), show: "all" });
  });

  it("corrupt stored ids that are inherited object properties ('constructor', 'toString') are discarded; Explore still renders", () => {
    const corrupt = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];
    const stored = { food: { cuisines: [...corrupt, "italian"], dishes: [...corrupt, "pasta"] }, show: "constructor" };
    expect(cleanDiscovery(stored)).toEqual({ food: F(["italian"], ["pasta"]), show: "all" }); // valid ids survive
    expect(cleanDiscovery({ food: { cuisines: corrupt, dishes: corrupt } })).toEqual(NO_DISCOVERY);
    withSettings();
    persist({ discovery: stored });
    expect(load().discovery).toEqual({ food: F(["italian"], ["pasta"]), show: "all" });
    const html = render(h(Explore)); // used to throw in matchRestaurant
    expect(html).toContain("Filters (2)");
    expect(html).toMatch(/data-card-link[^>]*>Pasta Metrica</);
    expect(html).not.toMatch(/data-card-link[^>]*>(FitKitchen|Urban Bowl)</);
  });
});

describe("Find My Next Meal: the food choice narrows candidates; the optimizer still decides", () => {
  it("runSearch with Pasta ranks only pasta dishes; without it, the search is exactly as before", () => {
    const pasta = runSearch(A.target, A.preferences, undefined, foodPredicate(F([], ["pasta"])));
    expect(pasta.ranked.length).toBeGreaterThan(0);
    expect(pasta.ranked.every((c) => dishTypesOf(c.meal).some((t) => t.id === "pasta"))).toBe(true);
    expect(pasta.stats).toMatchObject({ restaurants: 1, meals: 3 });
    expect(JSON.stringify(runSearch(A.target, A.preferences))).toBe(JSON.stringify(runSearch(A.target, A.preferences, undefined, foodPredicate(F()))));
  });

  it("hard constraints still apply: vegetarian + Pasta → only the veg orzo; a €12 budget → nothing over €12", () => {
    const veg = runSearch(A.target, { ...A.preferences, diet: "vegetarian" }, undefined, foodPredicate(F([], ["pasta"])));
    expect(veg.ranked.map((c) => c.meal.name)).toEqual(["Roasted Veg Orzo"]);
    const cheap = runSearch({ ...A.target, maxBudget: 12 }, A.preferences, undefined, foodPredicate(F([], ["pasta"])));
    expect(cheap.ranked.every((c) => c.price <= 12)).toBe(true);
  });

  it("Preferences shows 'What do you feel like?'; Results says what it's limited to", () => {
    withSettings();
    persist({ discovery: { food: F([], ["pasta"]), show: "all" } });
    const prefs = render(h(Preferences));
    expect(prefs).toContain("What do you feel like?");
    expect(prefs).toMatch(/data-food-choice="set".*>Pasta<.*Only matching dishes are considered.*Change/s);
    const results = render(h(Results));
    expect(results).toMatch(/data-food-results[^>]*>.*Only: .*Pasta.*Change/s);
    expect(results).not.toMatch(/Chicken Power Bowl|Teriyaki Salmon Bowl/); // no non-pasta recommendation
  });

  it("no dish matches at all → honest 'Nothing on the menus matches …', not a different kind of food", () => {
    withSettings();
    persist({ discovery: { food: F([], ["burgers"]), show: "all" } }); // only a real (no-menu) burger place exists
    const html = render(h(Failure));
    expect(html).toContain("Nothing on the menus matches burgers");
    expect(html).toContain("won&#x27;t suggest a different kind of food instead");
    expect(html).toContain("Show all kinds of food instead");
    expect(html).not.toContain("Closest supported option");
  });

  it("matching dishes exist but none is feasible → the closest MATCHING option, with the reason stated", () => {
    withSettings();
    persist({ scenarioId: "D", target: SCENARIOS.D.target, prefs: SCENARIOS.D.preferences, discovery: { food: F([], ["pasta"]), show: "all" } });
    const html = render(h(Failure));
    expect(html).toMatch(/data-food-failure[^>]*>You asked for <span[^>]*>pasta<\/span>, so only those dishes were considered/);
    expect(html).toContain("Show closest pasta option");
    expect(html).toMatch(/Pasta Metrica/);
  });
});

describe("Food icons (dish types only, normal mode only)", () => {
  const icons = (html: string) => [...html.matchAll(/data-food-icon="([a-z]+)"/g)].map((m) => m[1]);

  it("every dish type has an offline illustration; nothing is fetched", () => {
    expect(DISH_TYPES.every((t) => hasFoodIcon(t.id))).toBe(true);
    expect(hasFoodIcon("italian")).toBe(false); // cuisines are restaurant labels, not foods
    expect(hasFoodIcon("toString")).toBe(false);
    expect(readFileSync("src/components/FoodIcon.tsx", "utf8")).not.toMatch(/https?:|<image|href=|url\(/);
  });

  it("the Filters sheets show a picture on each dish-type chip, never on cuisine or Show chips", () => {
    for (const mode of ["explore", "meal"] as const) {
      const html = render(h(FoodFiltersPanel, { mode, count: () => 0, onDone: () => {} }));
      const dish = html.slice(html.indexOf('id="ff-dish"'), html.indexOf('id="ff-cuisine"'));
      expect(icons(dish)).toEqual(mode === "explore" ? DISH_TYPES.map((t) => t.id) : DISH_TYPES.filter((t) => t.id !== "burgers").map((t) => t.id));
      expect(icons(html.slice(html.indexOf('id="ff-cuisine"')))).toEqual([]);
      expect(html).toMatch(/aria-hidden="true" data-food-icon="pasta"/); // decorative: the label is the name
    }
  });

  it("the chosen dish types are pictured in Preferences, Results and the Explore summary — not on restaurant cards", () => {
    withSettings();
    expect(icons(render(h(Preferences)))).toEqual(["pasta", "bowls", "salads"]); // "Anything": a hint of the choices
    persist({ discovery: { food: F(["italian"], ["pasta", "bowls"]), show: "all" } });
    expect(icons(render(h(Preferences)))).toEqual(["pasta", "bowls"]);
    expect(icons(render(h(Results)))).toEqual(["pasta", "bowls"]);
    const explore = render(h(Explore));
    expect(icons(explore)).toEqual(["pasta", "bowls"]);
    expect(explore.slice(explore.indexOf("data-discovery-summary"), explore.indexOf("Clear</button>"))).toContain('data-food-icon="pasta"');
    persist({ discovery: { food: F(["italian"]), show: "all" } }); // cuisine only: no food picture
    expect(icons(render(h(Preferences)))).toEqual([]);
  });
});

describe("Research isolation", () => {
  it("a locked trial ignores a stored food filter and keeps the original Explore, Preferences and search", () => {
    withSettings();
    persist({ lock: lockOf, discovery: { food: F(["italian"], ["pasta"]), show: "fit" } });
    expect(load().discovery).toEqual(NO_DISCOVERY);
    load().setDiscovery({ food: F([], ["salads"]) });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.state)!).discovery.food.dishes).toEqual(["pasta"]); // unchanged by the trial
    const explore = render(h(Explore));
    expect(explore).toContain('placeholder="Search restaurants or cuisines"');
    expect(explore).toContain('aria-label="Filter restaurants"');
    expect(explore).not.toMatch(/Filters \(|data-match-reason|data-discovery-summary/);
    expect(render(h(Preferences))).not.toContain("What do you feel like?");
    expect(render(h(Results))).not.toContain("data-food-results");
    expect([explore, render(h(Preferences)), render(h(Results))].join("")).not.toContain("data-food-icon");
  });
});
