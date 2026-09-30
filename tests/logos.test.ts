import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { systemPrompt } from "../src/agent/systemPrompt";
import { executeTool, TOOL_DECLARATIONS } from "../src/agent/tools";
import type { AgentSessionState } from "../src/agent/types";
import { BrandMark, markLogoFailed, MAX_ASPECT } from "../src/components/BrandMark";
import { SheetProvider } from "../src/components/Sheet";
import { REAL_LOGOS, USAGE_BASIS } from "../src/data/realLogos";
import { catalog, getRestaurant, RESTAURANTS, setStudyScope, STUDY_RESTAURANT_IDS } from "../src/data/restaurants";
import { SCENARIOS } from "../src/data/scenarios";
import { Explore } from "../src/screens/Explore";
import { AppStateProvider } from "../src/state/AppState";

afterEach(() => setStudyScope(false));
const mark = (r: Parameters<typeof BrandMark>[0]["restaurant"], extra: Record<string, unknown> = {}) => renderToString(h(BrandMark, { restaurant: r, size: 40, ...extra }));
const fk = getRestaurant("fitkitchen")!;
const noLogoReal = getRestaurant("macho-mama")!; // a real venue without an authentic first-party logo
const REAL = RESTAURANTS.filter((r) => r.identity === "real");
const BANNED_HOSTS = /thuisbezorgd|ubereats|deliveroo|doordash|takeaway|tripadvisor|yelp|google|gstatic|facebook|fbcdn|instagram|cdninstagram|seeklogo|brandsoftheworld|logo(wik|s-world|pedia)|wikimedia/i;

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
  });

  it("real restaurant without an authentic logo → neutral dashed placeholder, no image", () => {
    const html = mark(noLogoReal);
    expect(html).toContain('data-logo="placeholder"');
    expect(html).toContain("border-dashed");
    expect(html).not.toContain("<img");
  });

  it("broken logo → graceful fallback: demo brand → its monogram; real venue → the placeholder", () => {
    const brokenDemo = { ...fk, logo: { ...fk.logo!, src: "logos/demo/does-not-exist.svg" } };
    markLogoFailed(brokenDemo.logo.src); // what the <img onError> handler records
    const d = mark(brokenDemo);
    expect(d).toContain('data-logo="monogram"');
    expect(d).toContain(">FK<");
    expect(d).not.toContain("<img");
    const mozza = getRestaurant("mozza-eur")!;
    const brokenReal = { ...mozza, logo: { ...mozza.logo!, src: "logos/real/broken.webp" } };
    markLogoFailed(brokenReal.logo.src);
    expect(mark(brokenReal)).toContain('data-logo="placeholder"');
  });

  it("square marks, horizontal wordmarks and dark-tile logos render without cropping", () => {
    const square = mark(getRestaurant("de-boshut")!);
    expect(square).toContain('data-logo-shape="square"');
    expect(square).toMatch(/width:40px/);
    const wide = mark(getRestaurant("toko-smoor")!); // 3.54:1 → capped box, artwork scaled (object-contain), not cropped
    expect(wide).toContain('data-logo-shape="wide"');
    expect(wide).toMatch(new RegExp(`width:${Math.round(40 * MAX_ASPECT)}px`));
    expect(wide).toContain("object-contain");
    const midWide = mark(getRestaurant("mozza-eur")!); // 2:1 → exactly 2:1 box
    expect(midWide).toMatch(/width:80px/);
    const dark = mark(getRestaurant("cafe-stobbe")!); // white official SVG → dark tile, not recoloured
    expect(dark).toContain("bg-ink");
    for (const html of [square, wide, dark]) {
      expect(html).toContain('data-logo="real-official-site"');
      expect(html).toContain("border-dashed"); // the neutral "real venue" frame stays
    }
  });
});

describe("real-logo registry: authentic first-party assets with provenance", () => {
  it("every entry: real venue, LOCAL file, complete provenance, no licence claimed", () => {
    for (const [id, l] of Object.entries(REAL_LOGOS)) {
      const r = getRestaurant(id)!;
      expect(r.identity, id).toBe("real");
      expect(l.file, id).toMatch(new RegExp(`^logos/real/${id}\\.(svg|webp|png)$`));
      expect(existsSync(`public/${l.file}`), id).toBe(true);
      expect(l.pageUrl, id).toMatch(/^https:\/\//);
      expect(l.assetUrl, id).toMatch(/^https:\/\//);
      expect(new URL(l.pageUrl).hostname, id).toBe(l.sourceDomain);
      // The page is the restaurant's own site (the same domain its identity was verified on).
      expect(l.sourceDomain.replace(/^www\./, ""), id).toBe(new URL(r.real!.website).hostname.replace(/^www\./, ""));
      expect(l.pageUrl + " " + l.assetUrl, id).not.toMatch(BANNED_HOSTS); // no platforms, directories, social, logo sites
      expect(["official-site-logo", "official-site-icon", "parent-brand-site-logo"]).toContain(l.sourceType);
      expect(l.retrievedOn, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(l.processing.length, id).toBeGreaterThan(10);
      expect(l.usageBasis).toBe(USAGE_BASIS);
      expect(USAGE_BASIS).toMatch(/No trademark licence, permission or partnership/);
      expect(l.aspect, id).toBeGreaterThan(0);
      expect(r.logo, id).toEqual({ src: l.file, alt: `${r.name} logo`, source: "real-official-site", aspect: l.aspect, background: l.background });
    }
  });

  it("local assets are small, and SVGs carry no scripts, handlers or external references", () => {
    for (const l of Object.values(REAL_LOGOS)) {
      const buf = readFileSync(`public/${l.file}`);
      expect(buf.byteLength, l.file).toBeLessThan(64 * 1024);
      if (l.file.endsWith(".svg")) {
        const svg = buf.toString("utf8");
        expect(svg, l.file).toMatch(/<svg/);
        expect(svg, l.file).not.toMatch(/<script|\son[a-z]+=|href="(https?:)?\/\/|<image/i);
      }
    }
  });

  it("mostly-white official SVGs sit on a dark tile (never invisible on white, never recoloured)", () => {
    for (const l of Object.values(REAL_LOGOS).filter((x) => x.file.endsWith(".svg"))) {
      const fills = [...readFileSync(`public/${l.file}`, "utf8").matchAll(/fill[:=]"?\s*(#[0-9a-f]{3,6}|white)/gi)].map((m) => m[1].toLowerCase());
      const white = fills.filter((f) => ["#fff", "#ffffff", "white"].includes(f)).length;
      if (fills.length && white / fills.length > 0.5) expect(l.background, l.file).toBe("dark");
    }
  });

  it("real venues without an entry keep the placeholder (no logo field at all)", () => {
    const without = REAL.filter((r) => !REAL_LOGOS[r.id]).map((r) => r.id).sort();
    expect(without).toEqual(["lokanta-proeflokaal", "macho-mama", "the-commons"]);
    for (const id of without) expect(getRestaurant(id)!.logo).toBeUndefined();
    expect(Object.keys(REAL_LOGOS)).toHaveLength(16);
  });
});

describe("demo logos stay fictional", () => {
  it("every demo brand has an original local SVG marked demo-original", () => {
    for (const r of RESTAURANTS.filter((x) => x.identity === "demo")) {
      expect(r.logo, r.id).toMatchObject({ src: `logos/demo/${r.id}.svg`, source: "demo-original", alt: expect.stringMatching(/fictional demo brand/) });
      const svg = readFileSync(`public/${r.logo!.src}`, "utf8");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
      expect(svg).not.toMatch(/<text|<image|href=/);
      expect(REAL_LOGOS[r.id]).toBeUndefined();
    }
  });
});

describe("restaurant data unchanged apart from presentation-only logos", () => {
  it("menus, prices, nutrition, modifiers, identities, locations and integration levels are byte-identical to d6bccdc", () => {
    const withoutLogos = JSON.stringify(RESTAURANTS, (k, v) => (k === "logo" ? undefined : v));
    expect(createHash("sha256").update(withoutLogos).digest("hex")).toBe("c78de4260d401c7ae810afd0bea2bf11481325108fca58d89bd7af5b9f67da4c");
  });
});

describe("honest labels stay next to every logo (Explore)", () => {
  const html = renderToString(h(MemoryRouter, null, h(AppStateProvider, null, h(SheetProvider, null, h(Explore)))));
  const cards = html.split("<li").slice(1).filter((c) => c.includes("data-card-link"));

  it("every real restaurant card: 'Real · not affiliated' — with its authentic logo or the placeholder", () => {
    const real = cards.filter((c) => c.includes("not affiliated"));
    expect(real).toHaveLength(REAL.length);
    expect(real.filter((c) => c.includes('data-logo="real-official-site"'))).toHaveLength(16);
    expect(real.filter((c) => c.includes('data-logo="placeholder"'))).toHaveLength(3);
    for (const c of real) {
      expect(c).not.toContain(">DEMO<");
      expect(c).not.toMatch(/Full integration|Menu data/);
    }
  });

  it("every demo restaurant card: its demo logo + the DEMO tag and integration label, never 'not affiliated'", () => {
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
    expect(seen).not.toMatch(/logo|\.svg|\.webp/i);
  });

  it("study scope and baseline are unchanged; the baseline shows no brand marks (as before)", () => {
    expect([...STUDY_RESTAURANT_IDS]).toEqual(["fitkitchen", "urbanbowl", "localgrill"]);
    setStudyScope(true);
    expect(catalog().map((r) => r.id)).toEqual(["fitkitchen", "urbanbowl", "localgrill"]);
    expect(catalog().some((r) => r.identity === "real")).toBe(false); // no real logos can appear in trials
    expect(readFileSync("src/baseline/Baseline.tsx", "utf8")).not.toMatch(/BrandMark|logo/);
  });
});
