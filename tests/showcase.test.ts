import { afterEach, describe, expect, it, vi } from "vitest";

describe("freeze fingerprint", () => {
  it("covers prompt, tools, settings and fallback policy, and is stable", async () => {
    const { agentConfigDocument, sha256Hex } = await import("../src/lib/freeze");
    const doc = JSON.parse(agentConfigDocument());
    expect(Object.keys(doc)).toEqual(["systemPromptScenarioA", "tools", "generationConfig", "maxToolRounds", "fallbackPolicy"]);
    expect(doc.tools.map((t: { name: string }) => t.name)).toContain("optimizeMeal");
    expect(doc.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 2048 });
    const a = await sha256Hex(agentConfigDocument());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(agentConfigDocument())).toBe(a);
  });
});

describe("desktop showcase: QR code + presenter Live AI switch", () => {
  afterEach(() => vi.unstubAllGlobals());
  const visible = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

  it("shows only the QR code to open the app on a phone (no video or steps on desktop)", async () => {
    vi.stubGlobal("window", { location: { origin: "https://mercouriss.github.io" }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
    const { createElement: h } = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { ShowcaseQuickStart } = await import("../src/components/ShowcaseQuickStart");
    const html = renderToString(h(ShowcaseQuickStart)).replace(/<!-- -->/g, "");
    expect(html).toContain('aria-label="QR code that opens MacroTable on your phone"');
    expect(html).toContain("Scan to open MacroTable on your phone");
    expect(html).toContain("mercouriss.github.io"); // the link the QR code encodes, printed under it
    expect(html).not.toMatch(/<video|Turn on Live AI/);
    expect(visible(html)).not.toMatch(/—|;/); // normal-mode copy rule
  });

  it("the presenter Live AI switch is large and labelled; off by default; unavailable without the agent proxy", async () => {
    const { createElement: h } = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { PresenterLiveAiToggle } = await import("../src/components/ShowcaseQuickStart");
    const { AppStateProvider } = await import("../src/state/AppState");
    const html = renderToString(h(AppStateProvider, null, h(PresenterLiveAiToggle)));
    expect(html).toMatch(/<button[^>]*role="switch"[^>]*aria-checked="false"[^>]*aria-label="Use Gemini API \(Live AI\)"/);
    expect(html).toMatch(/class="relative h-9 w-16/); // 64×36 px, not a small checkbox
    expect(html).toContain('data-presenter-live-ai="off"');
    expect(visible(html)).toContain("Live AI OFF");
    expect(visible(html)).toContain("Not available in this build"); // tests run without VITE_AGENT_PROXY_URL
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});
