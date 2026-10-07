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

describe("desktop showcase: QR + live agent guide", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows a QR code to open the app, and the silent, looping 'For live agent use' screen recording", async () => {
    const { existsSync } = await import("node:fs");
    const { createElement: h } = await import("react");
    const { renderToString } = await import("react-dom/server");
    vi.stubGlobal("window", { location: { origin: "https://mercouriss.github.io" }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
    const { LIVE_AI_GUIDE, ShowcaseQuickStart } = await import("../src/components/ShowcaseQuickStart");
    const html = renderToString(h(ShowcaseQuickStart)).replace(/<!-- -->/g, "");
    expect(html).toContain('aria-label="QR code that opens MacroTable on your phone"');
    expect(html).toContain("Scan to open MacroTable on your phone");
    expect(html).toContain("mercouriss.github.io"); // the link the QR code encodes, printed under it
    expect(html).toContain(">For live agent use<");
    expect(html).toContain("Turn on Live AI in 3 taps");
    expect(html).toMatch(/<video[^>]*src="\/guide\/live-ai-guide\.mp4"[^>]*>/);
    expect(html).toMatch(/<video[^>]*muted=""/);
    expect(html).not.toMatch(/<video[^>]*loop/); // plays once, then stops: not a distracting loop
    expect(html).toContain('data-guide-video="playing"'); // starts on its own (no play button yet)
    expect(html).not.toContain("Play the Live AI guide");
    for (const step of ["Home.", "Profile.", "Use Gemini API."]) expect(html).toContain(step);
    const visible = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
    expect(visible).not.toMatch(/—|;/); // normal-mode copy rule
    for (const f of [LIVE_AI_GUIDE.video, LIVE_AI_GUIDE.poster]) expect(existsSync(`public/${f}`)).toBe(true);
  });

  it("with reduced motion it doesn't start by itself: it waits behind a play button", async () => {
    vi.stubGlobal("window", { location: { origin: "https://mercouriss.github.io" }, matchMedia: (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }) });
    const { createElement: h } = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { ShowcaseQuickStart } = await import("../src/components/ShowcaseQuickStart");
    const html = renderToString(h(ShowcaseQuickStart));
    expect(html).toContain('data-guide-video="paused"');
    expect(html).toContain('aria-label="Play the Live AI guide"');
  });
});
