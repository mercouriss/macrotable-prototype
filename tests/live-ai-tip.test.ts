import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LIVE_AI_TIP_TITLE, LiveAiTipBody, liveAiTipDue } from "../src/components/LiveAiTip";
import { loadSettings, serializeSettings, type Settings } from "../src/state/AppState";

/*
 * Phones only: right after the intro, Home offers a skippable "Turn on Live AI in 3 steps" tip, once.
 * Never in a research trial, never on desktop (the showcase has the guide), not when Live AI is already on.
 */

const base: Settings = { baselineShowNutrition: true, onboardingDone: true, agentMode: "offline", agentDisclosureSeen: false };

describe("when the tip shows", () => {
  it("only on a phone, outside a trial, right after the intro, with Live AI off", () => {
    const pending = { ...base, liveAiTipPending: true };
    expect(liveAiTipDue({ lock: false, phone: true, settings: pending })).toBe(true);
    expect(liveAiTipDue({ lock: true, phone: true, settings: pending })).toBe(false); // research trial
    expect(liveAiTipDue({ lock: false, phone: false, settings: pending })).toBe(false); // desktop: the showcase has it
    expect(liveAiTipDue({ lock: false, phone: true, settings: { ...pending, agentMode: "auto" } })).toBe(false); // already on
    expect(liveAiTipDue({ lock: false, phone: true, settings: base })).toBe(false); // no intro just now (e.g. a demo reset), or already shown
  });

  it("the intro sets it on finishing or skipping; Home mounts it last and only outside a trial", () => {
    expect(readFileSync("src/screens/Onboarding.tsx", "utf8")).toMatch(/setSettings\(\{ onboardingDone: true, liveAiTipPending: true \}\)/);
    const home = readFileSync("src/screens/Home.tsx", "utf8");
    expect(home).toMatch(/\{!lock && <LiveAiTip \/>\}\s*<\/Screen>/);
  });

  it("the flag survives a reload only while pending; older saved settings load exactly as before", () => {
    expect(loadSettings(serializeSettings({ ...base, liveAiTipPending: true })).liveAiTipPending).toBe(true);
    expect(loadSettings(serializeSettings({ ...base, liveAiTipPending: false }))).toEqual(base);
    expect(loadSettings({ v: 2, onboardingDone: true, agentMode: "offline" })).toEqual(base);
    expect(loadSettings({ v: 2, liveAiTipPending: "yes" }).liveAiTipPending).toBeUndefined();
  });
});

describe("the popup", () => {
  const visible = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

  it("shows the screen recording, the 3 steps, Skip and Open Profile", () => {
    const html = renderToString(h(LiveAiTipBody, { autoPlay: true, onOpenProfile: () => {}, onSkip: () => {} }));
    const t = visible(html);
    expect(LIVE_AI_TIP_TITLE).toBe("Turn on Live AI in 3 steps");
    expect(html).toMatch(/<video[^>]*src="\/guide\/live-ai-guide\.mp4"/);
    expect(html).not.toMatch(/<video[^>]*loop/);
    for (const s of ["Home.", "Profile.", "Use Gemini API.", "Skip", "Open Profile", "API usage may incur costs."]) expect(t).toContain(s);
    expect(t).not.toMatch(/—|;/);
  });

  it("with reduced motion the recording waits behind a play button", () => {
    const html = renderToString(h(LiveAiTipBody, { autoPlay: false, onOpenProfile: () => {}, onSkip: () => {} }));
    expect(html).toContain('aria-label="Play the Live AI guide"');
  });

  it("the recording and its poster ship with the app", async () => {
    const { existsSync } = await import("node:fs");
    const { LIVE_AI_GUIDE } = await import("../src/components/LiveAiTip");
    for (const f of [LIVE_AI_GUIDE.video, LIVE_AI_GUIDE.poster]) expect(existsSync(`public/${f}`)).toBe(true);
  });
});
