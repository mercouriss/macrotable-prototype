import { describe, expect, it } from "vitest";
import { resolveShowcase } from "../src/components/showcaseSource";

describe("showcase video source", () => {
  it("is a placeholder when not configured or unsafe", () => {
    expect(resolveShowcase("")).toEqual({ kind: "none" });
    expect(resolveShowcase("http://example.com/video")).toEqual({ kind: "none" });
    expect(resolveShowcase("javascript:alert(1)")).toEqual({ kind: "none" });
    expect(resolveShowcase("not a url")).toEqual({ kind: "none" });
  });
  it("turns YouTube and Vimeo links into privacy-friendly embeds", () => {
    const yt = { kind: "iframe", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0" };
    expect(resolveShowcase("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(yt);
    expect(resolveShowcase("https://youtu.be/dQw4w9WgXcQ")).toEqual(yt);
    expect(resolveShowcase("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual(yt);
    expect(resolveShowcase("https://vimeo.com/123456789")).toEqual({ kind: "iframe", src: "https://player.vimeo.com/video/123456789?dnt=1" });
  });
  it("plays direct files with HTML5 video, including files in public/", () => {
    expect(resolveShowcase("https://cdn.example.com/demo.mp4")).toEqual({ kind: "video", src: "https://cdn.example.com/demo.mp4" });
    expect(resolveShowcase("showcase/demo.webm", "/macrotable-prototype/")).toEqual({ kind: "video", src: "/macrotable-prototype/showcase/demo.webm" });
  });
  it("passes other https embeds through as iframes", () => {
    expect(resolveShowcase("https://www.loom.com/embed/abc123")).toEqual({ kind: "iframe", src: "https://www.loom.com/embed/abc123" });
  });
});

describe("freeze fingerprint", () => {
  it("covers prompt, tools, settings and fallback policy, and is stable", async () => {
    const { agentConfigDocument, sha256Hex } = await import("../src/lib/freeze");
    const doc = JSON.parse(agentConfigDocument());
    expect(Object.keys(doc)).toEqual(["systemPromptScenarioA", "tools", "generationConfig", "maxToolRounds", "fallbackPolicy"]);
    expect(doc.tools.map((t: { name: string }) => t.name)).toContain("optimizeMeal");
    expect(doc.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 1024 });
    const a = await sha256Hex(agentConfigDocument());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(agentConfigDocument())).toBe(a);
  });
});
