import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { systemPrompt } from "../src/agent/systemPrompt";
import { executeTool, TOOL_DECLARATIONS } from "../src/agent/tools";
import type { AgentSessionState } from "../src/agent/types";
import { BrandMark, markLogoFailed } from "../src/components/BrandMark";
import { SheetProvider } from "../src/components/Sheet";
import { REAL_LOGOS } from "../src/data/realLogos";
import { catalog, getRestaurant, RESTAURANTS, setStudyScope, STUDY_RESTAURANT_IDS } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { Explore } from "../src/screens/Explore";
import { AppStateProvider } from "../src/state/AppState";

afterEach(() => setStudyScope(false));
const mark = (r: Parameters<typeof BrandMark>[0]["restaurant"], extra: Record<string, unknown> = {}) => renderToString(h(BrandMark, { restaurant: r, size: 40, ...extra }));
const fk = getRestaurant("fitkitchen")!;
const mozza = getRestaurant("mozza-eur")!;

describe("BrandMark: the single restaurant-logo component", () => {
  it("renders a demo brand's local logo in a fixed, non-stretching box (decorative next to the name)", () => {
    const html = mark(fk);
    expect(html).toContain('data-logo="demo-original"');
    expect(html).toMatch(/<img[^>]*src="\/logos\/demo\/fitkitchen\.svg"/);
    expect(html).toMatch(/<img[^>]*width="40"[^>]*height="40"/); // reserved size: no layout shift
    expect(html).toContain("object-contain"); // aspect ratio preserved, never stretched
    expect(html).toMatch(/<img[^>]*alt=""/);
    expect(html).toContain('aria-hidden="true"');
  });

  it("exposes the logo's alt text when the mark stands alone", () => {
    const html = mark(fk, { decorative: false });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="FitKitchen logo (fictional demo brand)"');
    expect(html).toMatch(/<img[^>]*alt="FitKitchen logo \(fictional demo brand\)"/);
  });

  it("real restaurant without a logo → neutral dashed placeholder, no image", () => {
    const html = mark(mozza);
    expect(html).toContain('data-logo="placeholder"');
    expect(html).toContain("border-dashed");
    expect(html).not.toContain("<img");
    expect(html).toMatch(/>M<\/span>$/);
  });

  it("broken logo → graceful fallback: demo brand → its monogram; real venue → the placeholder", () => {
    const brokenDemo = { ...fk, logo: { ...fk.logo!, src: "logos/demo/does-not-exist.svg" } };
    markLogoFailed(brokenDemo.logo.src); // what the <img onError> handler records
    const d = mark(brokenDemo);
    expect(d).toContain('data-logo="monogram"');
    expect(d).toContain(">FK<");
    expect(d).not.toContain("<img");
    const brokenReal = { ...mozza, logo: { src: "logos/real/broken.webp", alt: "Mozza logo", source: "real-permitted" as const } };
    markLogoFailed(brokenReal.logo.src);
    expect(mark(brokenReal)).toContain('data-logo="placeholder"');
  });

  it("a (future, permitted) real logo keeps the neutral dashed treatment, never the demo-brand look", () => {
    const html = mark({ ...mozza, logo: { src: "logos/real/mozza-eur.webp", alt: "Mozza logo", source: "real-permitted" } });
    expect(html).toContain('data-logo="real-permitted"');
    expect(html).toContain("border-dashed");
    expect(html).toContain("bg-white");
  });
});

describe("logo data: demo brands only, local assets, restaurant data otherwise unchanged", () => {
  it("every demo brand has an original local SVG; no real venue has a logo (none has a usage basis)", () => {
    for (const r of RESTAURANTS) {
      if (r.identity === "demo") {
        expect(r.logo, r.id).toMatchObject({ src: `logos/demo/${r.id}.svg`, source: "demo-original" });
        const svg = readFileSync(`public/${r.logo!.src}`, "utf8");
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/); // valid XML (an unescaped & breaks <img>)
        expect(svg).not.toMatch(/<text|<image|href=/); // original glyph only: no text, embedded or linked images
        expect(Buffer.byteLength(svg)).toBeLessThan(2048);
      } else {
        expect(r.logo, r.id).toBeUndefined();
        expect(REAL_LOGOS[r.id]).toBeUndefined();
      }
    }
    for (const f of Object.values(REAL_LOGOS)) expect(existsSync(`public/${f.file}`)).toBe(true);
  });

  it("menus, prices, nutrition, modifiers, identities and integration levels are byte-identical to d6bccdc", () => {
    const withoutLogos = JSON.stringify(RESTAURANTS, (k, v) => (k === "logo" ? undefined : v));
    expect(createHash("sha256").update(withoutLogos).digest("hex")).toBe("c78de4260d401c7ae810afd0bea2bf11481325108fca58d89bd7af5b9f67da4c");
  });
});

describe("honest labels stay next to every logo (Explore)", () => {
  const html = renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(Explore)))));
  const cards = html.split("<li").slice(1).filter((c) => c.includes("data-card-link"));

  it("each real restaurant: placeholder mark + 'Real · not affiliated'", () => {
    const real = cards.filter((c) => c.includes("not affiliated"));
    expect(real).toHaveLength(RESTAURANTS.filter((r) => r.identity === "real").length);
    for (const c of real) {
      expect(c).toContain('data-logo="placeholder"');
      expect(c).not.toContain("<img");
    }
  });

  it("each demo restaurant: its demo logo + the DEMO tag and integration label", () => {
    const demo = cards.filter((c) => c.includes('data-logo="demo-original"'));
    expect(demo).toHaveLength(RESTAURANTS.filter((r) => r.identity === "demo").length);
    for (const c of demo) {
      expect(c).toContain(">DEMO<");
      expect(c).toMatch(/Full integration|Menu data|Menu only/);
      expect(c).not.toContain("not affiliated");
    }
  });
});

describe("experiment protection", () => {
  const st = (): AgentSessionState => ({ messages: [], currentRestaurantId: null, scannedMenu: null, currentRecommendation: null, orderDrafts: [], providerHistory: [] });
  const ctx = () => ({ target: { ...SCENARIOS.A.target }, prefs: { ...SCENARIOS.A.preferences }, state: st() });

  it("nothing logo-related reaches the model: prompt, tool schemas and tool results are logo-free", () => {
    const c = ctx();
    const seen = [
      systemPrompt(c),
      JSON.stringify(TOOL_DECLARATIONS),
      ...["listNearbyStores", "getUserContext"].map((t) => JSON.stringify(executeTool(t, {}, c).result)),
      JSON.stringify(executeTool("getMenu", { restaurantId: "fitkitchen" }, c).result),
      JSON.stringify(executeTool("getMenu", { restaurantId: "mozza-eur" }, c).result),
      JSON.stringify(executeTool("optimizeMeal", {}, c).result),
      JSON.stringify(executeTool("explainProvenance", { restaurantId: "fitkitchen" }, c).result),
    ].join("\n");
    expect(seen).not.toMatch(/logo|\.svg/i);
  });

  it("study scope and baseline are unchanged; the baseline shows no brand marks (as before)", () => {
    expect([...STUDY_RESTAURANT_IDS]).toEqual(["fitkitchen", "urbanbowl", "localgrill"]);
    setStudyScope(true);
    expect(catalog().map((r) => r.id)).toEqual(["fitkitchen", "urbanbowl", "localgrill"]);
    expect(readFileSync("src/baseline/Baseline.tsx", "utf8")).not.toMatch(/BrandMark|logo/);
  });
});
